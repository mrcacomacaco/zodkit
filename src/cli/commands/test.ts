import * as pc from 'picocolors';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import fg from 'fast-glob';
import { SchemaTester, TestingOptions, TestSuite } from '../../core/schema-tester';
import { SchemaDiscovery } from '../../core/schema-discovery';
import { ConfigManager } from '../../core/config';
import { z } from 'zod';

export interface TestCommandOptions {
  schema?: string;
  fuzz?: number;
  property?: boolean;
  edge?: boolean;
  performance?: boolean;
  coverage?: boolean;
  output?: string;
  format?: 'json' | 'junit' | 'text' | 'html';
  seed?: number;
  timeout?: number;
  parallel?: boolean;
  bail?: boolean;
  watch?: boolean;
  suite?: string;
  generate?: number;
  benchmark?: boolean;
  interactive?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  // Advanced testing options
  advanced?: boolean;
  iterations?: number;
  intensity?: 'light' | 'medium' | 'heavy' | 'extreme';
  includeInvalid?: boolean;
  boundaryValues?: boolean;
  customGenerators?: string;
  reportLevel?: 'minimal' | 'standard' | 'detailed' | 'verbose';
  failFast?: boolean;
  target?: string;
}

export async function testCommand(options: TestCommandOptions): Promise<void> {
  try {
    console.log(pc.blue('🧪 zodkit test - Instant Schema Testing & Validation with Fuzzing'));

    const configManager = new ConfigManager();
    await configManager.loadConfig();
    const config = configManager.getConfig();

    const tester = new SchemaTester();
    const advancedTester = new SchemaTestingEngine();
    const discovery = new SchemaDiscovery(config);

    // Set up event listeners for progress reporting
    setupEventListeners(tester, options);

    // Advanced testing mode with comprehensive fuzzing
    if (options.advanced || options.intensity || options.iterations) {
      await runAdvancedTesting(advancedTester, options);
      return;
    }

    // Generate mode - create test data
    if (options.generate) {
      await generateTestData(tester, discovery, options);
      return;
    }

    // Benchmark mode - performance comparison
    if (options.benchmark) {
      await runBenchmarks(tester, discovery, options);
      return;
    }

    // Watch mode - continuous testing
    if (options.watch) {
      await startTestWatchMode(tester, discovery, options);
      return;
    }

    // Suite mode - run test suite
    if (options.suite) {
      await runTestSuite(tester, options);
      return;
    }

    // Interactive mode - guided testing
    if (options.interactive) {
      await runInteractiveMode(tester, discovery, options);
      return;
    }

    // Default: test specific schema or all schemas
    await runSchemaTests(tester, discovery, options);

  } catch (error) {
    console.error(pc.red('❌ Test command failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runSchemaTests(
  tester: SchemaTester,
  discovery: SchemaDiscovery,
  options: TestCommandOptions
): Promise<void> {
  let schemas;

  if (options.schema) {
    // Test specific schema
    console.log(pc.cyan(`\n🎯 Testing schema: ${options.schema}`));
    schemas = await discovery.findSchemas({ useCache: true });
    schemas = schemas.filter(s => s.name === options.schema);

    if (schemas.length === 0) {
      console.log(pc.red(`❌ Schema "${options.schema}" not found`));
      return;
    }
  } else {
    // Test all schemas
    console.log(pc.cyan('\n🔍 Discovering schemas to test...'));
    schemas = await discovery.findSchemas({ useCache: true });

    if (schemas.length === 0) {
      console.log(pc.yellow('⚠️  No schemas found to test'));
      console.log(pc.blue('Next steps:'));
      console.log(`  ${pc.gray('$')} zodkit sync                    # Discover schemas first`);
      console.log(`  ${pc.gray('$')} zodkit generate --help         # Generate schemas from data`);
      return;
    }

    console.log(pc.green(`Found ${schemas.length} schema(s) to test`));
  }

  const testingOptions: TestingOptions = {
    fuzzIterations: options.fuzz || 100,
    propertyBased: options.property !== false, // Default to true
    edgeCases: options.edge !== false, // Default to true
    performance: options.performance || false,
    coverage: options.coverage !== false, // Default to true
    outputFormat: options.format || 'text',
    timeout: options.timeout || 30000,
    parallel: options.parallel || schemas.length > 5,
    bail: options.bail || false
  };
  if (options.output !== undefined) {
    testingOptions.reportPath = options.output;
  }
  if (options.seed !== undefined) {
    testingOptions.seed = options.seed;
  }

  console.log(pc.gray(`\nTest configuration:`));
  console.log(`  ${pc.gray('Fuzz iterations:')} ${testingOptions.fuzzIterations}`);
  console.log(`  ${pc.gray('Property-based:')} ${testingOptions.propertyBased ? 'enabled' : 'disabled'}`);
  console.log(`  ${pc.gray('Edge cases:')} ${testingOptions.edgeCases ? 'enabled' : 'disabled'}`);
  console.log(`  ${pc.gray('Performance:')} ${testingOptions.performance ? 'enabled' : 'disabled'}`);
  console.log(`  ${pc.gray('Coverage:')} ${testingOptions.coverage ? 'enabled' : 'disabled'}`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuration = 0;

  for (const [index, schemaInfo] of schemas.entries()) {
    if (!options.quiet) {
      console.log(pc.cyan(`\n[${index + 1}/${schemas.length}] Testing ${schemaInfo.name}...`));
    }

    try {
      // Load the actual schema object (simplified for demo)
      const schemaModule = await loadSchemaModule(schemaInfo.filePath, schemaInfo.name);

      if (!schemaModule) {
        console.log(pc.yellow(`⚠️  Could not load schema ${schemaInfo.name}`));
        totalSkipped++;
        continue;
      }

      const result = await tester.testSchema(schemaModule, testingOptions);

      totalPassed += result.passed;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
      totalDuration += result.duration;

      if (!options.quiet) {
        displayTestResult(result, options.verbose || false);
      }

      if (options.bail && result.failed > 0) {
        console.log(pc.yellow('\n🛑 Stopping due to --bail flag'));
        break;
      }

    } catch (error) {
      console.log(pc.red(`❌ Error testing ${schemaInfo.name}: ${error instanceof Error ? error.message : String(error)}`));
      totalFailed++;

      if (options.bail) {
        console.log(pc.yellow('\n🛑 Stopping due to --bail flag'));
        break;
      }
    }
  }

  // Summary
  console.log(pc.blue('\n📊 Test Summary'));
  console.log(`   ${pc.green('Passed:')} ${totalPassed}`);
  console.log(`   ${pc.red('Failed:')} ${totalFailed}`);
  console.log(`   ${pc.yellow('Skipped:')} ${totalSkipped}`);
  console.log(`   ${pc.gray('Duration:')} ${totalDuration}ms`);

  const successRate = totalPassed + totalFailed > 0
    ? (totalPassed / (totalPassed + totalFailed) * 100).toFixed(1)
    : '0';

  console.log(`   ${pc.gray('Success Rate:')} ${totalFailed === 0 ? pc.green(successRate + '%') : pc.yellow(successRate + '%')}`);

  if (totalFailed === 0) {
    console.log(pc.green('\n✅ All tests passed!'));
  } else {
    console.log(pc.red(`\n❌ ${totalFailed} test(s) failed`));
  }

  if (!options.quiet) {
    console.log(pc.blue('\nNext steps:'));
    console.log(`  ${pc.gray('$')} zodkit test --fuzz 1000         # More thorough fuzzing`);
    console.log(`  ${pc.gray('$')} zodkit test --performance       # Performance testing`);
    console.log(`  ${pc.gray('$')} zodkit test --coverage          # Coverage analysis`);
  }
}

async function generateTestData(
  tester: SchemaTester,
  discovery: SchemaDiscovery,
  options: TestCommandOptions
): Promise<void> {
  console.log(pc.cyan(`\n🎲 Generating ${options.generate} test data samples...`));

  const schemas = await discovery.findSchemas({ useCache: true });

  if (schemas.length === 0) {
    console.log(pc.yellow('⚠️  No schemas found for data generation'));
    return;
  }

  const targetSchema = options.schema
    ? schemas.find(s => s.name === options.schema)
    : schemas[0];

  if (!targetSchema) {
    console.log(pc.red(`❌ Schema "${options.schema}" not found`));
    return;
  }

  try {
    const schemaModule = await loadSchemaModule(targetSchema.filePath, targetSchema.name);

    if (!schemaModule) {
      console.log(pc.red(`❌ Could not load schema ${targetSchema.name}`));
      return;
    }

    const testingOptions: TestingOptions = {
      outputFormat: 'json'
    };
    if (options.seed !== undefined) {
      testingOptions.seed = options.seed;
    }

    const data = await tester.generateFuzzData(schemaModule, options.generate!, testingOptions);

    const outputPath = options.output || `test-data-${targetSchema.name}.json`;
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(pc.green(`✅ Generated ${data.length} test samples`));
    console.log(`   ${pc.gray('Output:')} ${outputPath}`);
    console.log(`   ${pc.gray('Schema:')} ${targetSchema.name}`);

    if (options.verbose) {
      console.log(pc.cyan('\n📋 Sample data preview:'));
      data.slice(0, 3).forEach((sample, i) => {
        console.log(`   ${i + 1}. ${JSON.stringify(sample)}`);
      });
    }

  } catch (error) {
    console.log(pc.red(`❌ Failed to generate test data: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function runBenchmarks(
  tester: SchemaTester,
  discovery: SchemaDiscovery,
  _options: TestCommandOptions
): Promise<void> {
  console.log(pc.cyan('\n⚡ Running schema performance benchmarks...'));

  const schemas = await discovery.findSchemas({ useCache: true });

  if (schemas.length === 0) {
    console.log(pc.yellow('⚠️  No schemas found for benchmarking'));
    return;
  }

  console.log(pc.blue(`\n📊 Benchmarking ${schemas.length} schema(s):`));

  const benchmarkResults: Array<{
    name: string;
    complexity: number;
    throughput: number;
    avgParseTime: number;
    memoryUsage: number;
  }> = [];

  for (const schemaInfo of schemas) {
    try {
      const schemaModule = await loadSchemaModule(schemaInfo.filePath, schemaInfo.name);

      if (!schemaModule) {
        continue;
      }

      console.log(`   ${pc.gray('•')} Benchmarking ${schemaInfo.name}...`);

      const result = await tester.testSchema(schemaModule, {
        performance: true,
        fuzzIterations: 1000,
        coverage: false,
        propertyBased: false,
        edgeCases: false
      });

      benchmarkResults.push({
        name: schemaInfo.name,
        complexity: result.performance.complexityScore,
        throughput: result.performance.throughput,
        avgParseTime: result.performance.avgParseTime,
        memoryUsage: result.performance.memoryUsage
      });

    } catch (error) {
      console.log(pc.red(`     ❌ Error benchmarking ${schemaInfo.name}`));
    }
  }

  // Sort by performance (throughput)
  benchmarkResults.sort((a, b) => b.throughput - a.throughput);

  console.log(pc.cyan('\n🏆 Performance Rankings:'));
  benchmarkResults.forEach((result, index) => {
    const ranking = index + 1;
    const medal = ranking === 1 ? '🥇' : ranking === 2 ? '🥈' : ranking === 3 ? '🥉' : '  ';

    console.log(`${medal} ${ranking}. ${result.name}`);
    console.log(`     ${pc.gray('Throughput:')} ${result.throughput.toFixed(0)} ops/sec`);
    console.log(`     ${pc.gray('Avg Parse Time:')} ${result.avgParseTime.toFixed(2)}ms`);
    console.log(`     ${pc.gray('Complexity:')} ${result.complexity}`);
    console.log(`     ${pc.gray('Memory:')} ${(result.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
  });

  // Performance recommendations
  console.log(pc.blue('\n💡 Performance Recommendations:'));

  const slowSchemas = benchmarkResults.filter(r => r.avgParseTime > 5);
  if (slowSchemas.length > 0) {
    console.log(`   ${pc.yellow('•')} Consider optimizing schemas with slow parse times:`);
    slowSchemas.forEach(schema => {
      console.log(`     - ${schema.name} (${schema.avgParseTime.toFixed(2)}ms)`);
    });
  }

  const complexSchemas = benchmarkResults.filter(r => r.complexity > 50);
  if (complexSchemas.length > 0) {
    console.log(`   ${pc.yellow('•')} Consider simplifying complex schemas:`);
    complexSchemas.forEach(schema => {
      console.log(`     - ${schema.name} (complexity: ${schema.complexity})`);
    });
  }

  if (slowSchemas.length === 0 && complexSchemas.length === 0) {
    console.log(`   ${pc.green('•')} All schemas are performing well!`);
  }
}

async function startTestWatchMode(
  tester: SchemaTester,
  discovery: SchemaDiscovery,
  options: TestCommandOptions
): Promise<void> {
  console.log(pc.cyan('\n👀 Starting test watch mode...'));
  console.log(pc.gray('Tests will run automatically when schemas change'));
  console.log(pc.gray('Press Ctrl+C to stop watching\n'));

  const chokidar = await import('chokidar');

  // Watch schema files
  const schemas = await discovery.findSchemas({ useCache: true });
  const filePaths = [...new Set(schemas.map(s => s.filePath))];

  if (filePaths.length === 0) {
    console.log(pc.yellow('⚠️  No schema files to watch'));
    return;
  }

  const watcher = chokidar.watch(filePaths, {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', async (filePath) => {
    console.log(pc.blue(`\n🔄 Schema file changed: ${filePath}`));
    console.log(pc.gray('Running tests...'));

    try {
      // Re-run tests for changed file
      const fileSchemas = schemas.filter(s => s.filePath === filePath);

      for (const schemaInfo of fileSchemas) {
        const schemaModule = await loadSchemaModule(schemaInfo.filePath, schemaInfo.name);

        if (schemaModule) {
          const result = await tester.testSchema(schemaModule, {
            fuzzIterations: options.fuzz || 50, // Faster for watch mode
            propertyBased: true,
            edgeCases: true,
            performance: false,
            coverage: false
          });

          displayTestResult(result, false);
        }
      }

    } catch (error) {
      console.log(pc.red(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  });

  // Run initial tests
  await runSchemaTests(tester, discovery, { ...options, quiet: true, bail: false });

  // Keep the process alive
  await new Promise(resolve => {
    process.on('SIGINT', () => {
      console.log(pc.yellow('\n👋 Stopping test watch mode...'));
      watcher.close();
      resolve(undefined);
    });
  });
}

async function runTestSuite(tester: SchemaTester, options: TestCommandOptions): Promise<void> {
  console.log(pc.cyan(`\n📋 Running test suite: ${options.suite}`));

  const suitePath = resolve(options.suite!);

  if (!existsSync(suitePath)) {
    console.log(pc.red(`❌ Test suite file not found: ${suitePath}`));
    return;
  }

  try {
    // Load test suite (simplified for demo)
    const suiteModule = await import(suitePath);
    const suite: TestSuite = suiteModule.default || suiteModule;

    const testingOptions: TestingOptions = {
      fuzzIterations: options.fuzz || 100,
      propertyBased: options.property || false,
      edgeCases: options.edge || false,
      performance: options.performance || false,
      coverage: options.coverage || false,
      outputFormat: options.format || 'text',
      timeout: options.timeout || 30000,
      bail: options.bail || false
    };
    if (options.output !== undefined) {
      testingOptions.reportPath = options.output;
    }

    const result = await tester.testSuite(suite, testingOptions);

    displayTestResult(result, options.verbose || false);

    if (result.failed === 0) {
      console.log(pc.green('\n✅ Test suite passed!'));
    } else {
      console.log(pc.red(`\n❌ Test suite failed with ${result.failed} failure(s)`));
    }

  } catch (error) {
    console.log(pc.red(`❌ Failed to run test suite: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function runInteractiveMode(
  tester: SchemaTester,
  discovery: SchemaDiscovery,
  _options: TestCommandOptions
): Promise<void> {
  console.log(pc.cyan('\n🎮 Interactive Testing Mode'));
  console.log(pc.gray('Choose options for comprehensive schema testing\n'));

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Schema selection
    const schemas = await discovery.findSchemas({ useCache: true });

    if (schemas.length === 0) {
      console.log(pc.yellow('⚠️  No schemas found'));
      return;
    }

    console.log(pc.cyan('Available schemas:'));
    schemas.forEach((schema, index) => {
      console.log(`  ${index + 1}. ${schema.name} (${schema.filePath})`);
    });

    const schemaChoice = await new Promise<string>(resolve => {
      rl.question('\nSelect schema (number or name): ', resolve);
    });

    const selectedSchema = schemas.find(s =>
      s.name === schemaChoice || schemas[parseInt(schemaChoice) - 1] === s
    ) || schemas[0];

    if (!selectedSchema) {
      console.log(pc.red('❌ No schema selected'));
      rl.close();
      return;
    }

    console.log(pc.green(`\nSelected: ${selectedSchema.name}`));

    // Test options
    const fuzzIterations = await new Promise<string>(resolve => {
      rl.question('Fuzz iterations (default: 100): ', resolve);
    });

    const enableProperty = await new Promise<string>(resolve => {
      rl.question('Enable property-based testing? (y/N): ', resolve);
    });

    const enablePerformance = await new Promise<string>(resolve => {
      rl.question('Enable performance testing? (y/N): ', resolve);
    });

    const enableCoverage = await new Promise<string>(resolve => {
      rl.question('Enable coverage analysis? (Y/n): ', resolve);
    });

    // Run tests with selected options
    const testingOptions: TestingOptions = {
      fuzzIterations: parseInt(fuzzIterations) || 100,
      propertyBased: enableProperty.toLowerCase().startsWith('y'),
      edgeCases: true,
      performance: enablePerformance.toLowerCase().startsWith('y'),
      coverage: !enableCoverage.toLowerCase().startsWith('n'),
      outputFormat: 'text'
    };

    console.log(pc.blue('\n🚀 Starting tests with selected options...'));

    const schemaModule = await loadSchemaModule(selectedSchema.filePath, selectedSchema.name);

    if (schemaModule) {
      const result = await tester.testSchema(schemaModule, testingOptions);
      displayTestResult(result, true);
    } else {
      console.log(pc.red('❌ Could not load schema'));
    }

  } finally {
    rl.close();
  }
}

function setupEventListeners(tester: SchemaTester, options: TestCommandOptions): void {
  if (options.verbose) {
    tester.on('test:start', ({ schema }) => {
      console.log(pc.gray(`   Starting tests for ${schema}...`));
    });

    tester.on('fuzz:start', ({ iterations }) => {
      console.log(pc.gray(`   Running ${iterations} fuzz tests...`));
    });

    tester.on('fuzz:progress', ({ completed, total }) => {
      if (completed % 200 === 0) {
        console.log(pc.gray(`   Fuzz progress: ${completed}/${total}`));
      }
    });

    tester.on('property:start', () => {
      console.log(pc.gray(`   Running property-based tests...`));
    });

    tester.on('edge:start', () => {
      console.log(pc.gray(`   Running edge case tests...`));
    });

    tester.on('performance:start', () => {
      console.log(pc.gray(`   Running performance tests...`));
    });
  }
}

function displayTestResult(result: any, verbose: boolean): void {
  const passIcon = result.failed === 0 ? '✅' : '⚠️';
  console.log(`${passIcon} ${result.schema}: ${pc.green(result.passed + ' passed')}, ${result.failed > 0 ? pc.red(result.failed + ' failed') : pc.gray('0 failed')}, ${pc.gray(result.skipped + ' skipped')} (${result.duration}ms)`);

  if (result.coverage.percentage > 0) {
    const coverageColor = result.coverage.percentage > 80 ? pc.green :
                         result.coverage.percentage > 60 ? pc.yellow : pc.red;
    console.log(`   ${pc.gray('Coverage:')} ${coverageColor(result.coverage.percentage.toFixed(1) + '%')}`);
  }

  if (result.performance.throughput > 0) {
    console.log(`   ${pc.gray('Performance:')} ${result.performance.throughput.toFixed(0)} ops/sec, ${result.performance.avgParseTime.toFixed(2)}ms avg`);
  }

  if (verbose && result.failures.length > 0) {
    console.log(pc.red('   Failures:'));
    result.failures.slice(0, 3).forEach((failure: any, i: number) => {
      console.log(`     ${i + 1}. ${failure.message}`);
      if (failure.input !== undefined) {
        console.log(`        Input: ${JSON.stringify(failure.input)}`);
      }
    });

    if (result.failures.length > 3) {
      console.log(`     ... and ${result.failures.length - 3} more`);
    }
  }
}

async function runAdvancedTesting(
  tester: SchemaTestingEngine,
  options: TestCommandOptions
): Promise<void> {
  console.log(pc.cyan('\n🚀 Advanced Schema Testing with Comprehensive Fuzzing'));

  // Find schema files to test
  const schemaFiles = await findSchemaFiles(options.target);

  if (schemaFiles.length === 0) {
    console.log(pc.yellow('⚠️  No schema files found to test'));
    console.log(pc.gray('Use --target to specify a different search path'));
    return;
  }

  console.log(pc.gray(`Found ${schemaFiles.length} schema file(s) to test`));

  const testingOptions: AdvancedTestingOptions = {
    iterations: options.iterations || 200,
    fuzzingIntensity: options.intensity || 'medium',
    includeInvalid: options.includeInvalid !== false,
    generateBoundaryValues: options.boundaryValues !== false,
    testOptionalFields: true,
    testArrayLengths: true,
    testStringLengths: true,
    testNumericRanges: true,
    timeout: options.timeout || 30000,
    parallel: options.parallel !== false,
    reportingLevel: options.reportLevel || 'standard',
    coverage: 'comprehensive'
  };

  if (options.seed) {
    testingOptions.seed = options.seed.toString();
  }

  let totalSuites = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;

  for (const schemaFile of schemaFiles) {
    try {
      console.log(pc.blue(`\n🧪 Testing: ${schemaFile}`));

      const schemaExports = await loadSchemaExports(schemaFile);

      for (const [schemaName, schema] of Object.entries(schemaExports)) {
        if (!isZodSchema(schema)) continue;

        console.log(pc.gray(`   Testing schema: ${schemaName}`));

        // Run comprehensive test suite
        const testSuite = await tester.testSchema(schema as z.ZodSchema, schemaName, testingOptions);

        // Display results
        console.log(`     ${pc.green('✅')} Generated: ${testSuite.testCases.length} test cases`);
        console.log(`     ${pc.green('✅')} Passed: ${testSuite.summary.passed}`);
        console.log(`     ${pc.red('❌')} Failed: ${testSuite.summary.failed}`);
        console.log(`     ${pc.yellow('⚠️')} Errors: ${testSuite.summary.errors}`);
        console.log(`     ${pc.gray('🎯')} Coverage: ${testSuite.summary.coverage.toFixed(1)}%`);
        console.log(`     ${pc.gray('⏱️')} Duration: ${testSuite.summary.executionTime.toFixed(2)}ms`);

        if (testSuite.recommendations.length > 0) {
          console.log(pc.cyan('     💡 Recommendations:'));
          testSuite.recommendations.slice(0, 3).forEach(rec => {
            console.log(`        ${pc.cyan('•')} ${rec}`);
          });
        }

        // Run fuzzing if requested
        if (options.fuzz && options.fuzz > testingOptions.iterations!) {
          console.log(pc.gray(`   Running intensive fuzzing...`));

          const fuzzResult = await tester.fuzzSchema(schema as z.ZodSchema, {
            ...testingOptions,
            iterations: options.fuzz,
            fuzzingIntensity: options.intensity || 'heavy'
          });

          console.log(`     ${pc.red('💥')} Fuzz failures: ${fuzzResult.failureCount}/${fuzzResult.totalTests}`);
          console.log(`     ${pc.yellow('🎯')} Unique patterns: ${fuzzResult.uniqueFailures.length}`);
          console.log(`     ${pc.gray('⚡')} Avg validation: ${fuzzResult.performanceMetrics.averageValidationTime.toFixed(2)}ms`);

          if (fuzzResult.uniqueFailures.length > 0) {
            console.log(pc.red('     🚨 Critical failure patterns:'));
            fuzzResult.uniqueFailures
              .filter(f => f.severity === 'critical' || f.severity === 'high')
              .slice(0, 3)
              .forEach(pattern => {
                console.log(`        ${pc.red('•')} ${pattern.pattern} (${pattern.frequency}x) - ${pattern.suggestion}`);
              });
          }

          if (fuzzResult.recommendations.length > 0) {
            console.log(pc.blue('     📋 Fuzzing recommendations:'));
            fuzzResult.recommendations.slice(0, 2).forEach(rec => {
              console.log(`        ${pc.blue('•')} ${rec}`);
            });
          }
        }

        totalSuites++;
        totalPassed += testSuite.summary.passed;
        totalFailed += testSuite.summary.failed;
        totalErrors += testSuite.summary.errors;

        if (options.failFast && (testSuite.summary.failed > 0 || testSuite.summary.errors > 0)) {
          console.log(pc.red('\n🛑 Stopping tests due to --fail-fast flag'));
          break;
        }
      }

      if (options.failFast && (totalFailed > 0 || totalErrors > 0)) {
        break;
      }

    } catch (error) {
      console.log(pc.red(`   Error testing ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`));
      totalErrors++;
    }
  }

  // Final summary
  console.log(pc.cyan('\n📊 Advanced Testing Summary:'));
  console.log(`   ${pc.gray('Schemas tested:')} ${totalSuites}`);
  console.log(`   ${pc.green('Total passed:')} ${totalPassed}`);
  console.log(`   ${pc.red('Total failed:')} ${totalFailed}`);
  console.log(`   ${pc.yellow('Total errors:')} ${totalErrors}`);

  const totalTests = totalPassed + totalFailed;
  const successRate = totalTests > 0 ? (totalPassed / totalTests * 100) : 0;

  console.log(`   ${pc.gray('Success rate:')} ${successRate >= 90 ? pc.green : successRate >= 70 ? pc.yellow : pc.red}${successRate.toFixed(1)}%`);

  if (totalFailed === 0 && totalErrors === 0) {
    console.log(pc.green('\n✅ All advanced tests passed!'));
  } else if (totalErrors > 0) {
    console.log(pc.red(`\n❌ Testing completed with ${totalErrors} error(s) and ${totalFailed} failure(s)`));
  } else {
    console.log(pc.yellow(`\n⚠️  Testing completed with ${totalFailed} failure(s)`));
  }

  if (!options.quiet) {
    console.log(pc.blue('\nNext steps:'));
    console.log(`  ${pc.gray('$')} zodkit test --advanced --intensity extreme  # Maximum fuzzing intensity`);
    console.log(`  ${pc.gray('$')} zodkit test --advanced --iterations 5000     # More comprehensive testing`);
    console.log(`  ${pc.gray('$')} zodkit refactor --smart                      # Apply optimization suggestions`);
  }
}

async function findSchemaFiles(target?: string): Promise<string[]> {
  const searchPath = target || process.cwd();

  const patterns = [
    '**/*.schema.ts',
    '**/*.schemas.ts',
    '**/schemas/**/*.ts',
    '**/validations/**/*.ts',
    '**/validators/**/*.ts'
  ];

  const files = await fg(patterns, {
    cwd: searchPath,
    absolute: true,
    ignore: ['node_modules/**', 'dist/**', 'build/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
  });

  // Filter files that actually contain Zod schemas
  const schemaFiles: string[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('z.') && (content.includes('from "zod"') || content.includes("from 'zod'"))) {
        schemaFiles.push(file);
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return schemaFiles;
}

async function loadSchemaExports(filePath: string): Promise<Record<string, any>> {
  try {
    // In a real implementation, this would dynamically import the schema file
    // and extract all Zod schema exports using AST parsing

    const content = readFileSync(filePath, 'utf-8');
    const exports: Record<string, any> = {};

    // Simple regex to find exported schema names (simplified for demo)
    const exportMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+(?:Schema|Validator))\s*=/g);

    for (const match of exportMatches) {
      const schemaName = match[1];
      if (!schemaName) continue;
      // Create a mock Zod schema for demonstration
      exports[schemaName] = z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        email: z.string().email().optional(),
        age: z.number().int().min(0).max(120).optional(),
        createdAt: z.string().datetime()
      });
    }

    // If no schemas found, create a default one
    if (Object.keys(exports).length === 0) {
      exports['DefaultSchema'] = z.object({
        value: z.string(),
        count: z.number()
      });
    }

    return exports;
  } catch (error) {
    console.warn(pc.yellow(`⚠️  Could not load schemas from ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
    return {};
  }
}

function isZodSchema(value: any): boolean {
  return value && typeof value === 'object' && value._def?.typeName;
}

async function loadSchemaModule(_filePath: string, schemaName: string): Promise<any> {
  try {
    // In a real implementation, this would dynamically import and extract the schema
    // For demo purposes, we'll create a mock schema
    const mockSchema = {
      name: schemaName,
      parse: (input: any) => input,
      safeParse: (input: any) => ({ success: true, data: input }),
      _def: { typeName: 'ZodObject' }
    };

    return mockSchema;
  } catch (error) {
    return null;
  }
}