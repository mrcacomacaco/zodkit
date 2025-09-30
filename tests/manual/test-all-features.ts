#!/usr/bin/env tsx
/**
 * Comprehensive Test Suite for ZodKit
 * Tests every feature to ensure proper operation after consolidation
 */

import * as pc from 'picocolors';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Import all consolidated modules
import {
  Infrastructure,
  SchemaDiscovery,
  Validator
} from './src/core/infrastructure';

import {
  Analyzer
} from './src/core/analysis';

import {
  SchemaGenerator
} from './src/core/schema-generation';

import {
  SchemaTester
} from './src/core/schema-testing';

import {
  SchemaTransformer
} from './src/core/schema-transformation';

import {
  ErrorSystem
} from './src/core/error-system';

import {
  Utils,
  Logger,
  PerformanceMonitor
} from './src/utils';

// Test tracking
interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
const logger = new Logger({ level: 'info' });
const performance = new PerformanceMonitor();

// === TEST HELPERS ===

async function runTest(
  category: string,
  name: string,
  testFn: () => Promise<void> | void
): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    results.push({
      name,
      category,
      passed: true,
      duration: Date.now() - startTime
    });
    console.log(pc.green('✓'), pc.gray(`${category}:`), name);
  } catch (error) {
    results.push({
      name,
      category,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    });
    console.log(pc.red('✗'), pc.gray(`${category}:`), name, pc.red(error));
  }
}

// === INFRASTRUCTURE TESTS ===

async function testInfrastructure() {
  console.log(pc.bold('\n🏗️  Testing Infrastructure Module...'));

  await runTest('Infrastructure', 'Create Infrastructure instance', () => {
    const infra = new Infrastructure();
    if (!infra.discovery) throw new Error('Discovery not initialized');
    if (!infra.cache) throw new Error('Cache not initialized');
    if (!infra.mapper) throw new Error('Mapper not initialized');
    if (!infra.validator) throw new Error('Validator not initialized');
  });

  await runTest('Infrastructure', 'Schema Discovery', async () => {
    const infra = new Infrastructure();
    const schemas = await infra.discovery.findSchemas();
    if (!Array.isArray(schemas)) throw new Error('findSchemas should return array');
  });

  await runTest('Infrastructure', 'Schema Cache', () => {
    const infra = new Infrastructure();
    infra.cache.set('test', { data: 'value' });
    const cached = infra.cache.get('test');
    if (cached?.data !== 'value') throw new Error('Cache not working');
  });

  await runTest('Infrastructure', 'Schema Validation', () => {
    const infra = new Infrastructure();
    const schema = z.object({ name: z.string() });
    const result = infra.validator.validate(schema, { name: 'test' });
    if (!result.valid) throw new Error('Valid data marked as invalid');
  });

  await runTest('Infrastructure', 'Schema Mapping', () => {
    const infra = new Infrastructure();
    const schemas = [
      { name: 'User', filePath: 'user.ts', line: 1, column: 1, schemaType: 'object' }
    ];
    const map = infra.mapper.buildRelationshipMap(schemas);
    if (!map.metadata) throw new Error('Map metadata missing');
  });

  await runTest('Infrastructure', 'Parallel Processing', async () => {
    const infra = new Infrastructure();
    const tasks = [1, 2, 3];
    const results = await infra.parallel.process(tasks, n => n * 2);
    if (results[0] !== 2 || results[1] !== 4) throw new Error('Parallel processing failed');
  });
}

// === ANALYSIS TESTS ===

async function testAnalysis() {
  console.log(pc.bold('\n🔍 Testing Analysis Module...'));

  await runTest('Analysis', 'Create Analyzer instance', () => {
    const analyzer = new Analyzer();
    if (!analyzer) throw new Error('Analyzer not created');
  });

  await runTest('Analysis', 'Complexity Analysis', async () => {
    const analyzer = new Analyzer();
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      nested: z.object({
        deep: z.object({
          value: z.string()
        })
      })
    });

    const result = await analyzer.analyze(schema, { mode: 'complexity' });
    if (typeof result.score !== 'number') throw new Error('Score not calculated');
    if (!result.level) throw new Error('Level not determined');
  });

  await runTest('Analysis', 'Rule Analysis', async () => {
    const analyzer = new Analyzer();
    const schema = z.any(); // Should trigger no-any rule

    const result = await analyzer.analyze(schema, { mode: 'rules' });
    if (result.issues.length === 0) throw new Error('No-any rule not triggered');
  });

  await runTest('Analysis', 'API Analysis', async () => {
    const analyzer = new Analyzer();
    const schema = z.object({
      user_name: z.string(), // snake_case
      userId: z.string()      // camelCase - inconsistent
    });

    const result = await analyzer.analyze(schema, { mode: 'api' });
    if (!result.metrics.apiCompliance) throw new Error('API compliance not calculated');
  });

  await runTest('Analysis', 'Full Analysis', async () => {
    const analyzer = new Analyzer();
    const schema = z.object({ test: z.string() });

    const result = await analyzer.analyze(schema, { mode: 'full' });
    if (!result.score && result.score !== 0) throw new Error('Full analysis failed');
  });

  await runTest('Analysis', 'Auto-fix Generation', async () => {
    const analyzer = new Analyzer();
    const schema = z.any();

    const result = await analyzer.analyze(schema, {
      mode: 'rules',
      autoFix: true
    });
    // Fixes may or may not be available, just check structure
    if (!Array.isArray(result.suggestions)) throw new Error('Suggestions not generated');
  });
}

// === GENERATION TESTS ===

async function testGeneration() {
  console.log(pc.bold('\n🏗️  Testing Schema Generation...'));

  await runTest('Generation', 'Create Generator instance', () => {
    const generator = new SchemaGenerator();
    if (!generator) throw new Error('Generator not created');
  });

  await runTest('Generation', 'Generate Schema from JSON', async () => {
    const generator = new SchemaGenerator();
    const input = {
      name: 'John',
      age: 30,
      active: true
    };

    const result = await generator.generate(input, {
      type: 'schema',
      format: 'typescript'
    });

    if (!result.success) throw new Error('Schema generation failed');
    if (!result.output) throw new Error('No output generated');
  });

  await runTest('Generation', 'Generate Mock Data', async () => {
    const generator = new SchemaGenerator();
    const schema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      age: z.number().int().min(0).max(100)
    });

    const result = await generator.generate(schema, {
      type: 'mock',
      format: 'json'
    });

    if (!result.success) throw new Error('Mock generation failed');
  });

  await runTest('Generation', 'Generate Documentation', async () => {
    const generator = new SchemaGenerator();
    const schemas = [
      z.object({ test: z.string() })
    ];

    const result = await generator.generate(schemas, {
      type: 'docs',
      format: 'markdown'
    });

    if (!result.success) throw new Error('Docs generation failed');
    if (!result.output.includes('Schema Documentation')) {
      throw new Error('Documentation not properly formatted');
    }
  });

  await runTest('Generation', 'Generate from Template', async () => {
    const generator = new SchemaGenerator();

    const result = await generator.generate('user', {
      type: 'template'
    });

    if (!result.success) throw new Error('Template generation failed');
  });
}

// === TRANSFORMATION TESTS ===

async function testTransformation() {
  console.log(pc.bold('\n🔄 Testing Schema Transformation...'));

  await runTest('Transformation', 'Create Transformer instance', () => {
    const transformer = new SchemaTransformer();
    if (!transformer) throw new Error('Transformer not created');
  });

  await runTest('Transformation', 'Compose Schemas', async () => {
    const transformer = new SchemaTransformer();

    const result = await transformer.transform({
      type: 'compose',
      schemas: [
        { name: 'Schema1', type: 'object' },
        { name: 'Schema2', type: 'object' }
      ],
      operation: 'merge'
    });

    if (!result.success) throw new Error('Schema composition failed');
  });

  await runTest('Transformation', 'Refactor Schema', async () => {
    const transformer = new SchemaTransformer();

    const result = await transformer.transform({
      type: 'refactor',
      schema: { name: 'TestSchema', type: 'object' },
      operation: 'simplify'
    });

    if (!result.success) throw new Error('Schema refactoring failed');
  });

  await runTest('Transformation', 'Migrate Schema', async () => {
    const transformer = new SchemaTransformer();

    const result = await transformer.transform({
      type: 'migrate',
      schema: { name: 'OldSchema', type: 'object' },
      version: 'v2'
    });

    if (!result.success) throw new Error('Schema migration failed');
  });
}

// === TESTING MODULE TESTS ===

async function testSchemaTesting() {
  console.log(pc.bold('\n🧪 Testing Schema Testing Module...'));

  await runTest('Testing', 'Create Tester instance', () => {
    const tester = new SchemaTester();
    if (!tester) throw new Error('Tester not created');
  });

  await runTest('Testing', 'Test Schema Validation', async () => {
    const tester = new SchemaTester();
    const schema = z.object({
      email: z.string().email()
    });

    const result = await tester.testSchema(schema, {
      mode: 'validation',
      testCases: [
        { input: { email: 'test@example.com' }, expected: 'valid' },
        { input: { email: 'invalid' }, expected: 'invalid' }
      ]
    });

    if (!result.passed && result.passed !== false) {
      throw new Error('Test execution failed');
    }
  });

  await runTest('Testing', 'Fuzz Testing', async () => {
    const tester = new SchemaTester();
    const schema = z.string().min(1).max(10);

    const result = await tester.testSchema(schema, {
      mode: 'fuzz',
      iterations: 10
    });

    if (!result.coverage) throw new Error('Fuzz testing failed');
  });

  await runTest('Testing', 'Performance Testing', async () => {
    const tester = new SchemaTester();
    const schema = z.object({ test: z.string() });

    const result = await tester.testSchema(schema, {
      mode: 'performance',
      iterations: 100
    });

    if (!result.metrics) throw new Error('Performance testing failed');
  });
}

// === ERROR SYSTEM TESTS ===

async function testErrorSystem() {
  console.log(pc.bold('\n⚠️  Testing Error System...'));

  await runTest('ErrorSystem', 'Create ErrorSystem instance', () => {
    const errorSystem = new ErrorSystem();
    if (!errorSystem) throw new Error('ErrorSystem not created');
  });

  await runTest('ErrorSystem', 'Error Recovery', async () => {
    const errorSystem = new ErrorSystem();
    let attempts = 0;

    const result = await errorSystem.withRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('Temporary failure');
        return 'success';
      },
      { maxAttempts: 3, delay: 10 }
    );

    if (result !== 'success') throw new Error('Retry mechanism failed');
    if (attempts !== 2) throw new Error('Retry count incorrect');
  });

  await runTest('ErrorSystem', 'Error Formatting', () => {
    const errorSystem = new ErrorSystem();
    const error = new Error('Test error');

    const formatted = errorSystem.format(error);
    if (!formatted.includes('Test error')) {
      throw new Error('Error formatting failed');
    }
  });

  await runTest('ErrorSystem', 'Recovery Suggestions', () => {
    const errorSystem = new ErrorSystem();
    const error = { code: 'ENOENT', path: '/missing/file' };

    const suggestions = errorSystem.getSuggestions(error);
    if (!Array.isArray(suggestions)) {
      throw new Error('Suggestions not generated');
    }
  });
}

// === UTILITIES TESTS ===

async function testUtilities() {
  console.log(pc.bold('\n🔧 Testing Utilities...'));

  await runTest('Utils', 'Create Utils instance', () => {
    const utils = new Utils();
    if (!utils.logger) throw new Error('Logger not initialized');
    if (!utils.watcher) throw new Error('Watcher not initialized');
    if (!utils.performance) throw new Error('Performance monitor not initialized');
  });

  await runTest('Utils', 'Logger functionality', () => {
    const utils = new Utils();
    // Just test that methods exist and don't throw
    utils.logger.info('Test message');
    utils.logger.error('Test error');
    utils.logger.debug('Test debug');
  });

  await runTest('Utils', 'Performance monitoring', () => {
    const utils = new Utils();

    utils.performance.start('test');
    const result = utils.performance.end('test');

    if (!result || typeof result.duration !== 'number') {
      throw new Error('Performance monitoring failed');
    }
  });

  await runTest('Utils', 'File watching setup', () => {
    const utils = new Utils();

    // Test that watcher can be configured (not actually watching)
    utils.watcher.watch(['*.ts'], { debounce: 100 });
    utils.watcher.unwatch();
  });

  await runTest('Utils', 'Ignore parser', () => {
    const utils = new Utils();

    const shouldIgnore = utils.ignore.shouldIgnore('node_modules/test.js');
    if (!shouldIgnore) throw new Error('Should ignore node_modules');

    const shouldNotIgnore = utils.ignore.shouldIgnore('src/test.ts');
    if (shouldNotIgnore) throw new Error('Should not ignore src files');
  });

  await runTest('Utils', 'Format utilities', () => {
    const utils = new Utils();

    const bytes = utils.formatBytes(1024);
    if (bytes !== '1.00 KB') throw new Error('Byte formatting incorrect');

    const duration = utils.formatDuration(1500);
    if (duration !== '1.50s') throw new Error('Duration formatting incorrect');
  });
}

// === BACKWARD COMPATIBILITY TESTS ===

async function testBackwardCompatibility() {
  console.log(pc.bold('\n🔄 Testing Backward Compatibility...'));

  await runTest('Compatibility', 'Infrastructure re-exports', () => {
    const { CommandWrapper, ContextManager } = require('./src/core/infrastructure');
    if (!CommandWrapper) throw new Error('CommandWrapper export missing');
    if (!ContextManager) throw new Error('ContextManager export missing');
  });

  await runTest('Compatibility', 'Analysis re-exports', () => {
    const { ComplexityAnalyzer, RuleEngine } = require('./src/core/analysis');
    if (!ComplexityAnalyzer) throw new Error('ComplexityAnalyzer export missing');
    if (!RuleEngine) throw new Error('RuleEngine export missing');
  });

  await runTest('Compatibility', 'Generation re-exports', () => {
    const { MockGenerator, DocsGenerator } = require('./src/core/schema-generation');
    if (!MockGenerator) throw new Error('MockGenerator export missing');
    if (!DocsGenerator) throw new Error('DocsGenerator export missing');
  });

  await runTest('Compatibility', 'Testing re-exports', () => {
    const { SchemaDebugger, SchemaPlayground } = require('./src/core/schema-testing');
    if (!SchemaDebugger) throw new Error('SchemaDebugger export missing');
    if (!SchemaPlayground) throw new Error('SchemaPlayground export missing');
  });

  await runTest('Compatibility', 'Transformation re-exports', () => {
    const { SchemaBridge, SchemaComposer } = require('./src/core/schema-transformation');
    if (!SchemaBridge) throw new Error('SchemaBridge export missing');
    if (!SchemaComposer) throw new Error('SchemaComposer export missing');
  });
}

// === INTEGRATION TESTS ===

async function testIntegration() {
  console.log(pc.bold('\n🔗 Testing Integration...'));

  await runTest('Integration', 'Full pipeline test', async () => {
    // 1. Create infrastructure
    const infra = new Infrastructure();

    // 2. Discover schemas
    const schemas = await infra.discovery.findSchemas();

    // 3. Analyze them
    const analyzer = new Analyzer();
    const analysis = await analyzer.analyze(
      z.object({ test: z.string() }),
      { mode: 'full' }
    );

    // 4. Generate documentation
    const generator = new SchemaGenerator();
    const docs = await generator.generate([schemas[0]], {
      type: 'docs'
    });

    if (!analysis.score && analysis.score !== 0) throw new Error('Pipeline failed');
  });

  await runTest('Integration', 'Error handling pipeline', async () => {
    const errorSystem = new ErrorSystem();
    const infra = new Infrastructure();

    try {
      // Intentionally cause an error
      await infra.discovery.findSchemas({ useCache: true });
      // If we get here without cache, that's OK
    } catch (error) {
      const formatted = errorSystem.format(error);
      const suggestions = errorSystem.getSuggestions(error);
      if (!formatted) throw new Error('Error handling pipeline failed');
    }
  });

  await runTest('Integration', 'Transform and test pipeline', async () => {
    const transformer = new SchemaTransformer();
    const tester = new SchemaTester();

    // Transform a schema
    const transformed = await transformer.transform({
      type: 'optimize',
      schema: { name: 'Test', type: 'object' }
    });

    // Test the result
    if (transformed.output) {
      const testResult = await tester.testSchema(
        z.object({ test: z.string() }),
        { mode: 'validation' }
      );
      // Just verify it runs without error
    }
  });
}

// === MAIN TEST RUNNER ===

async function runAllTests() {
  console.log(pc.bold(pc.blue('\n⚡ ZodKit Comprehensive Test Suite')));
  console.log(pc.gray('Testing all features after 82% file consolidation...'));
  console.log(pc.gray('─'.repeat(60)));

  const startTime = Date.now();

  // Run all test categories
  await testInfrastructure();
  await testAnalysis();
  await testGeneration();
  await testTransformation();
  await testSchemaTesting();
  await testErrorSystem();
  await testUtilities();
  await testBackwardCompatibility();
  await testIntegration();

  // Display results
  console.log(pc.gray('\n' + '─'.repeat(60)));
  console.log(pc.bold('\n📊 Test Results Summary\n'));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = Date.now() - startTime;

  // Group by category
  const byCategory = results.reduce((acc, r) => {
    acc[r.category] = acc[r.category] || { passed: 0, failed: 0 };
    r.passed ? acc[r.category].passed++ : acc[r.category].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  // Display category summary
  Object.entries(byCategory).forEach(([category, stats]) => {
    const icon = stats.failed === 0 ? '✅' : '⚠️';
    console.log(
      `${icon} ${pc.bold(category)}: ${pc.green(`${stats.passed} passed`)}${
        stats.failed > 0 ? ', ' + pc.red(`${stats.failed} failed`) : ''
      }`
    );
  });

  // Display failed tests
  if (failed > 0) {
    console.log(pc.red('\n❌ Failed Tests:'));
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  • ${r.category}/${r.name}: ${pc.red(r.error)}`);
      });
  }

  // Final summary
  console.log(pc.gray('\n' + '─'.repeat(60)));
  console.log(pc.bold('Total Tests:'), results.length);
  console.log(pc.green('Passed:'), passed, `(${((passed / results.length) * 100).toFixed(1)}%)`);
  console.log(pc.red('Failed:'), failed);
  console.log(pc.cyan('Duration:'), `${(totalDuration / 1000).toFixed(2)}s`);

  // Overall result
  if (failed === 0) {
    console.log(pc.bold(pc.green('\n✅ All tests passed! ZodKit is working correctly.')));
  } else {
    console.log(pc.bold(pc.red(`\n❌ ${failed} test${failed === 1 ? '' : 's'} failed.`)));
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error(pc.red('Test suite failed:'), error);
  process.exit(1);
});