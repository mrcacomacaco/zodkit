/**
 * @fileoverview Check command - Analyze schemas for issues (Biome/Ultracite pattern)
 * @module CheckCommand
 */

import * as pc from 'picocolors';
import { Config, ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/infrastructure/schema-discovery';
import { Validator } from '../../core/infrastructure/validator';
import { ErrorReporter } from '../../core/infrastructure/error-reporter';
import { FileWatcher } from '../../utils/file-watcher';
import { PerformanceMonitor } from '../../utils/performance-monitor';
import { CoverageReporter } from '../../core/testing/coverage-reporter';
// Complex analysis imports (used conditionally)
// import { ComplexityAnalyzer } from '../../core/complexity-analyzer';
// import { SchemaCache } from '../../core/schema-cache';
// import { ErrorFormatter } from '../../utils/error-formatter';

interface CheckOptions {
  watch?: boolean;
  coverage?: boolean;
  unused?: boolean;
  duplicates?: boolean;
  complexity?: boolean;
  performance?: boolean;
  strict?: boolean;
  silent?: boolean;
  config?: string;
  include?: string[];
  exclude?: string[];
  verbose?: boolean;
  ci?: boolean;
  format?: 'pretty' | 'json' | 'junit' | 'sarif';
  output?: string;
  fast?: boolean;
  quick?: boolean;
  fixable?: boolean;
  analyze?: boolean; // Comprehensive analysis mode (from analyze.ts)
}

export async function checkCommand(
  _schemaName: string | undefined,
  options: CheckOptions
): Promise<void> {
  const performanceMonitor = new PerformanceMonitor();
  performanceMonitor.start('total');

  try {
    if (!options.silent) {
      const mode = options.fast || options.quick ? ' (fast mode)' : '';
      console.log(pc.blue(`🔍 Zodded - Validating Zod schemas${mode}...`));
    }

    // Load configuration
    performanceMonitor.start('config-loading');
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig(options.config);
    performanceMonitor.end('config-loading');

    // Merge CLI options with config
    const finalConfig = {
      ...config,
      include: options.include ?? config.include,
      exclude: options.exclude ?? config.exclude,
      verbose: options.verbose ?? config.output?.verbose ?? false,
      ci: options.ci ?? false,
      fast: options.fast ?? options.quick ?? false,
      fixable: options.fixable ?? false,
      output: {
        ...config.output,
        format: options.format ?? config.output?.format ?? 'pretty'
      }
    };

    // Initialize core components
    const schemaDiscovery = new SchemaDiscovery(finalConfig);
    const validator = new Validator(finalConfig);
    const errorReporter = new ErrorReporter(finalConfig);
    const coverageReporter = options.coverage ? new CoverageReporter(finalConfig) : undefined;

    if (options.watch) {
      if (!options.silent) {
        console.log(pc.yellow('👀 Watching for file changes...'));
      }
      const watcher = new FileWatcher(finalConfig);
      await watcher.start(async () => {
        await runValidation(
          schemaDiscovery,
          validator,
          errorReporter,
          finalConfig,
          performanceMonitor,
          coverageReporter,
          options
        );
      });
    } else {
      const success = await runValidation(
        schemaDiscovery,
        validator,
        errorReporter,
        finalConfig,
        performanceMonitor,
        coverageReporter,
        options
      );

      if (options.ci && !success) {
        console.error(pc.red('❌ CI mode: Validation failed'));
        process.exit(1);
      }

      process.exit(success ? 0 : 1);
    }
  } catch (error) {
    console.error(pc.red('Fatal error:'), error instanceof Error ? error.message : String(error));
    if (options.ci) {
      process.exit(2); // Different exit code for setup/config errors in CI
    }
    process.exit(1);
  }
}

async function runValidation(
  schemaDiscovery: SchemaDiscovery,
  validator: Validator,
  errorReporter: ErrorReporter,
  config: Config,
  performanceMonitor: PerformanceMonitor,
  coverageReporter?: CoverageReporter,
  options?: CheckOptions
): Promise<boolean> {
  try {
    // Discover schemas
    performanceMonitor.start('schema-discovery');
    const schemas = await schemaDiscovery.findSchemas();
    performanceMonitor.end('schema-discovery');

    if (config.output?.verbose && !options?.silent) {
      console.log(pc.gray(`Found ${schemas.length} schemas`));
    }

    // Run validation with comprehensive rule engine
    performanceMonitor.start('validation');
    const results = await validator.validateWithRules(schemas);
    performanceMonitor.end('validation');

    // Generate coverage report if requested
    if (coverageReporter) {
      performanceMonitor.start('coverage-analysis');
      const coverage = await coverageReporter.generateReport(schemas, results);
      performanceMonitor.end('coverage-analysis');

      if (!options?.silent) {
        coverageReporter.displayReport(coverage);
      }
    }

    // Report results
    performanceMonitor.start('reporting');
    const success = await errorReporter.report(results, options?.output);
    performanceMonitor.end('reporting');

    // Show performance metrics if requested
    if (options?.performance && !options?.silent) {
      performanceMonitor.end('total');
      console.log('\n' + pc.blue('📊 Performance Metrics:'));
      console.log(performanceMonitor.getReport());
    }

    return success;
  } catch (error) {
    console.error(pc.red('Validation error:'), error instanceof Error ? error.message : String(error));
    return false;
  }
}