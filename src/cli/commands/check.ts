/**
 * @fileoverview Quick Schema Validation Command
 * @module CheckCommand
 *
 * Simple, fast validation command similar to ultracite check
 * Focus: Quick health check with minimal output
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { unifiedConfig } from '../../core/unified-config';
import { Analyzer } from '../../core/analysis';
import { Infrastructure } from '../../core/infrastructure';
import { Utils } from '../../utils';

interface CheckOptions {
  fast?: boolean;
  failOn?: 'error' | 'warning' | 'all';
  quiet?: boolean;
  json?: boolean;
}

export async function checkCommand(
  target?: string,
  options: CheckOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const isJsonMode = options.json || globalOpts.json;
  const isQuiet = options.quiet || globalOpts.quiet;

  const utils = new Utils({
    verbose: globalOpts.verbose,
    quiet: isQuiet,
    json: isJsonMode
  });

  try {
    utils.output.output({
      simple: '🔍 Checking schemas...',
      detailed: `🔍 ${pc.cyan('Quick validation check...')}`,
      verbose: `🔍 Running comprehensive validation check with strict mode enabled...`,
      data: { operation: 'check', mode: 'validation' }
    });

    // Initialize systems
    const infraConfig = await unifiedConfig.getInfrastructureConfig();
    const infra = new Infrastructure(infraConfig);
    const analyzer = new Analyzer();

    // Auto-discover schemas
    const discovery = infra.discovery;
    const schemas = await discovery.autoDiscover(target ? undefined : process.cwd());

    if (schemas.length === 0) {
      utils.output.output({
        simple: '❌ No schemas found',
        detailed: `❌ No Zod schemas found.
💡 Run "zodkit init" to set up schema validation`,
        verbose: `❌ No Zod schemas found in the current directory.

Searched for:
  • *.schema.ts files
  • schemas/ directories
  • types/ directories
  • models/ directories

💡 Next steps:
  • Run "zodkit init" to set up schema validation
  • Create .schema.ts files with your Zod schemas
  • Place schemas in schemas/, types/, or models/ directories`,
        data: { success: false, error: 'No schemas found' }
      });
      process.exit(1);
    }

    // Filter for specific target if provided
    const targetSchemas = target
      ? schemas.filter(s => s.name === target || s.filePath.includes(target))
      : schemas;

    if (target && targetSchemas.length === 0) {
      utils.output.output({
        simple: `❌ No schemas matching '${target}' found`,
        detailed: `❌ No schemas matching '${target}' found
Found ${schemas.length} total schemas, but none matched your target`,
        verbose: `❌ Target Schema Not Found

Searched for: '${target}'
Total schemas found: ${schemas.length}

Available schemas:
${schemas.map(s => `  • ${s.name} (${s.filePath})`).join('\n')}`,
        data: { success: false, error: `No schemas matching '${target}' found`, available: schemas.length }
      });
      process.exit(1);
    }

    // Quick analysis focused on errors and critical issues - parallel processing
    const parallelResults = await infra.parallel.processSchemas(
      targetSchemas,
      async (schema) => {
        const result = await analyzer.analyze(schema as any, {
          mode: 'rules', // Focus on rule validation for speed
          strict: true
        });

        return {
          schema: schema.name,
          file: schema.filePath,
          ...result
        };
      }
    );

    const results = parallelResults;

    // Count issues by type
    let totalErrors = 0;
    let totalWarnings = 0;
    let hasFailures = false;

    results.forEach(result => {
      result.issues.forEach((issue: any) => {
        if (issue.type === 'error') {
          totalErrors++;
          hasFailures = true;
        } else if (issue.type === 'warning') {
          totalWarnings++;
          if (options.failOn === 'warning' || options.failOn === 'all') {
            hasFailures = true;
          }
        }
      });
    });

    // Output results using progressive output system
    utils.output.summary({
      success: !hasFailures,
      errors: totalErrors,
      warnings: totalWarnings,
      processed: targetSchemas.length,
      details: results.map(r => ({
        schema: r.schema,
        file: r.file,
        issues: r.issues
      }))
    });

    if (hasFailures && !isJsonMode && !isQuiet) {
      utils.output.output({
        simple: '💡 Run "zodkit analyze" for details',
        detailed: `💡 Run ${pc.cyan('zodkit analyze')} for detailed analysis
💡 Run ${pc.cyan('zodkit fix')} to auto-resolve issues`,
        verbose: `💡 Next Steps:
  • Run ${pc.cyan('zodkit analyze')} for comprehensive analysis with suggestions
  • Run ${pc.cyan('zodkit fix --safe-only')} to auto-fix safe issues
  • Run ${pc.cyan('zodkit fix --dry-run')} to preview all available fixes
  • Use ${pc.cyan('--verbose')} flag for more detailed error information`,
        data: { suggestions: ['analyze', 'fix'] }
      });
    }

    // Exit with appropriate code
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    utils.output.output({
      simple: `❌ Check failed: ${errorMessage}`,
      detailed: `❌ Schema check failed
Error: ${errorMessage}

This might be due to:
• Missing or invalid schema files
• Configuration issues
• File system permissions`,
      verbose: `❌ Schema Check Failed

Error Details: ${errorMessage}
Stack Trace: ${error instanceof Error ? error.stack : 'N/A'}

Troubleshooting:
• Verify schema files exist and are valid TypeScript
• Check file permissions in current directory
• Run with --verbose for more debugging information
• Try running "zodkit init" to reset configuration`,
      data: {
        success: false,
        error: {
          message: errorMessage,
          code: 'CHECK_ERROR',
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    });
    process.exit(1);
  }
}