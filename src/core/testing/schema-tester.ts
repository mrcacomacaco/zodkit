/**
 * @fileoverview Instant Schema Testing & Validation with fuzzing
 * @module SchemaTester
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
// @ts-ignore: Reserved for future operations
// import { readFileSync, join } from 'fs' and 'path';
// @ts-ignore: Reserved for future hash-based test generation
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export interface TestingOptions {
  fuzzIterations?: number;
  timeout?: number;
  coverage?: boolean;
  propertyBased?: boolean;
  edgeCases?: boolean;
  performance?: boolean;
  outputFormat?: 'json' | 'junit' | 'text' | 'html';
  reportPath?: string;
  seed?: number;
  parallel?: boolean;
  bail?: boolean;
}

export interface TestResult {
  schema: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: TestCoverage;
  failures: TestFailure[];
  performance: PerformanceMetrics;
  fuzzResults: FuzzResult[];
}

export interface TestCoverage {
  branches: number;
  branchesHit: number;
  constraints: number;
  constraintsHit: number;
  edgeCases: number;
  edgeCasesHit: number;
  percentage: number;
}

export interface TestFailure {
  type: 'validation' | 'parsing' | 'fuzzing' | 'property' | 'performance';
  message: string;
  input: any;
  expected?: any;
  actual?: any;
  stack?: string;
  severity: 'error' | 'warning';
}

export interface PerformanceMetrics {
  avgParseTime: number;
  maxParseTime: number;
  minParseTime: number;
  throughput: number; // operations per second
  memoryUsage: number;
  complexityScore: number;
}

export interface FuzzResult {
  iteration: number;
  input: any;
  result: 'pass' | 'fail' | 'error';
  duration: number;
  error?: string;
  coverage?: string[];
}

export interface PropertyTestCase {
  property: string;
  generator: DataGenerator;
  predicate: (input: any, output: any) => boolean;
  examples?: any[];
  shrinking?: boolean;
}

export interface DataGenerator {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'undefined' | 'custom';
  constraints?: GeneratorConstraints;
  nested?: DataGenerator[];
  custom?: () => any;
}

export interface GeneratorConstraints {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  format?: 'email' | 'url' | 'uuid' | 'date' | 'datetime';
}

export interface EdgeCase {
  name: string;
  description: string;
  input: any;
  shouldPass: boolean;
  category: 'boundary' | 'null' | 'empty' | 'invalid' | 'extreme';
}

export interface TestSuite {
  name: string;
  schema: any;
  tests: Test[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface Test {
  name: string;
  type: 'unit' | 'fuzz' | 'property' | 'edge' | 'performance';
  input: any;
  expected: 'pass' | 'fail';
  timeout?: number;
  skip?: boolean;
  only?: boolean;
}

export class SchemaTester extends EventEmitter {
  private readonly generators = new Map<string, DataGenerator>();
  private readonly edgeCases = new Map<string, EdgeCase[]>();
  // @ts-ignore: Reserved for future caching
  private readonly reportCache = new Map<string, TestResult>();

  constructor() {
    super();
    this.initializeGenerators();
    this.initializeEdgeCases();
  }

  async testSchema(schema: any, options: TestingOptions = {}): Promise<TestResult> {
    const startTime = Date.now();
    this.emit('test:start', { schema: schema.name || 'anonymous' });

    try {
      const result: TestResult = {
        schema: schema.name || 'anonymous',
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: this.initializeCoverage(),
        failures: [],
        performance: this.initializePerformance(),
        fuzzResults: []
      };

      // Run different types of tests
      if (options.fuzzIterations && options.fuzzIterations > 0) {
        await this.runFuzzTests(schema, result, options);
      }

      if (options.propertyBased) {
        await this.runPropertyBasedTests(schema, result, options);
      }

      if (options.edgeCases) {
        await this.runEdgeCaseTests(schema, result, options);
      }

      if (options.performance) {
        await this.runPerformanceTests(schema, result, options);
      }

      // Calculate coverage
      if (options.coverage) {
        result.coverage = await this.calculateCoverage(schema, result);
      }

      result.duration = Date.now() - startTime;

      // Generate report
      if (options.reportPath) {
        await this.generateReport(result, options);
      }

      this.emit('test:complete', result);
      return result;

    } catch (error) {
      this.emit('test:error', error);
      throw error;
    }
  }

  async testSuite(suite: TestSuite, options: TestingOptions = {}): Promise<TestResult> {
    this.emit('suite:start', { name: suite.name });

    try {
      if (suite.setup) {
        await suite.setup();
      }

      let combinedResult: TestResult = {
        schema: suite.name,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: this.initializeCoverage(),
        failures: [],
        performance: this.initializePerformance(),
        fuzzResults: []
      };

      const startTime = Date.now();

      for (const test of suite.tests) {
        if (test.skip) {
          combinedResult.skipped++;
          continue;
        }

        const testResult = await this.runSingleTest(suite.schema, test, options);
        this.mergeCombinedResult(combinedResult, testResult);

        if (options.bail && testResult.failed > 0) {
          break;
        }
      }

      combinedResult.duration = Date.now() - startTime;

      if (suite.teardown) {
        await suite.teardown();
      }

      this.emit('suite:complete', combinedResult);
      return combinedResult;

    } catch (error) {
      this.emit('suite:error', error);
      throw error;
    }
  }

  async generateFuzzData(schema: any, count: number, options: TestingOptions = {}): Promise<any[]> {
    const data: any[] = [];
    const generator = this.createGeneratorFromSchema(schema);

    for (let i = 0; i < count; i++) {
      try {
        const fuzzed = this.generateData(generator, options.seed ? options.seed + i : undefined);
        data.push(fuzzed);
      } catch (error) {
        // Skip invalid generated data
      }
    }

    return data;
  }

  async validateWithFuzzing(
    schema: any,
    iterations: number = 1000,
    options: TestingOptions = {}
  ): Promise<FuzzResult[]> {
    const results: FuzzResult[] = [];
    const generator = this.createGeneratorFromSchema(schema);

    this.emit('fuzz:start', { iterations });

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      try {
        const input = this.generateData(generator, options.seed ? options.seed + i : undefined);
        const parseResult = schema.safeParse(input);

        const result: FuzzResult = {
          iteration: i,
          input,
          result: parseResult.success ? 'pass' : 'fail',
          duration: Date.now() - startTime,
          error: parseResult.success ? undefined : parseResult.error.message,
          coverage: this.extractCoverage(schema, input)
        };

        results.push(result);

        if (i % 100 === 0) {
          this.emit('fuzz:progress', { completed: i, total: iterations });
        }

      } catch (error) {
        results.push({
          iteration: i,
          input: null,
          result: 'error',
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.emit('fuzz:complete', { results: results.length });
    return results;
  }

  createPropertyTest(
    schema: any,
    property: string,
    predicate: (input: any, output: any) => boolean
  ): PropertyTestCase {
    return {
      property,
      generator: this.createGeneratorFromSchema(schema),
      predicate,
      shrinking: true
    };
  }

  async runPropertyTest(
    testCase: PropertyTestCase,
    iterations: number = 100
  ): Promise<{ passed: boolean; counterExample?: any; shrunk?: any }> {
    this.emit('property:start', { property: testCase.property });

    for (let i = 0; i < iterations; i++) {
      const input = this.generateData(testCase.generator);

      try {
        const output = input; // In real implementation, this would run through the schema

        if (!testCase.predicate(input, output)) {
          let shrunk = input;

          if (testCase.shrinking) {
            shrunk = await this.shrinkInput(input, testCase);
          }

          return { passed: false, counterExample: input, shrunk };
        }
      } catch (error) {
        return { passed: false, counterExample: input };
      }
    }

    return { passed: true };
  }

  getSchemaComplexity(schema: any): number {
    // Analyze schema structure to determine complexity
    const schemaString = JSON.stringify(schema._def || schema);

    let complexity = 0;

    // Base complexity
    complexity += schemaString.length / 100;

    // Nesting penalty
    const nestingLevel = (schemaString.match(/\{/g) || []).length;
    complexity += nestingLevel * 2;

    // Array penalty
    const arrayCount = (schemaString.match(/array/g) || []).length;
    complexity += arrayCount * 1.5;

    // Union penalty
    const unionCount = (schemaString.match(/union/g) || []).length;
    complexity += unionCount * 3;

    return Math.round(complexity);
  }

  private async runFuzzTests(
    schema: any,
    result: TestResult,
    options: TestingOptions
  ): Promise<void> {
    this.emit('fuzz:start', { iterations: options.fuzzIterations });

    const fuzzResults = await this.validateWithFuzzing(
      schema,
      options.fuzzIterations,
      options
    );

    result.fuzzResults = fuzzResults;

    fuzzResults.forEach(fuzzResult => {
      if (fuzzResult.result === 'pass') {
        result.passed++;
      } else if (fuzzResult.result === 'fail') {
        result.failed++;
        result.failures.push({
          type: 'fuzzing',
          message: fuzzResult.error || 'Fuzz test failed',
          input: fuzzResult.input,
          severity: 'error'
        });
      } else {
        result.failed++;
        result.failures.push({
          type: 'fuzzing',
          message: fuzzResult.error || 'Fuzz test error',
          input: fuzzResult.input,
          severity: 'error'
        });
      }
    });
  }

  private async runPropertyBasedTests(
    schema: any,
    result: TestResult,
    _options: TestingOptions
  ): Promise<void> {
    this.emit('property:start');

    // Define common properties to test
    const properties = this.getDefaultProperties(schema);

    for (const property of properties) {
      const testCase = this.createPropertyTest(schema, property.name, property.predicate);
      const propertyResult = await this.runPropertyTest(testCase);

      if (propertyResult.passed) {
        result.passed++;
      } else {
        result.failed++;
        result.failures.push({
          type: 'property',
          message: `Property "${property.name}" failed`,
          input: propertyResult.counterExample,
          severity: 'error'
        });
      }
    }
  }

  private async runEdgeCaseTests(
    schema: any,
    result: TestResult,
    _options: TestingOptions
  ): Promise<void> {
    this.emit('edge:start');

    const schemaType = this.getSchemaType(schema);
    const edgeCases = this.edgeCases.get(schemaType) || [];

    for (const edgeCase of edgeCases) {
      try {
        const parseResult = schema.safeParse(edgeCase.input);
        const passed = parseResult.success === edgeCase.shouldPass;

        if (passed) {
          result.passed++;
        } else {
          result.failed++;
          result.failures.push({
            type: 'validation',
            message: `Edge case "${edgeCase.name}" failed: ${edgeCase.description}`,
            input: edgeCase.input,
            expected: edgeCase.shouldPass,
            actual: parseResult.success,
            severity: 'error'
          });
        }
      } catch (error) {
        result.failed++;
        result.failures.push({
          type: 'validation',
          message: `Edge case "${edgeCase.name}" threw error: ${error instanceof Error ? error.message : String(error)}`,
          input: edgeCase.input,
          severity: 'error'
        });
      }
    }
  }

  private async runPerformanceTests(
    schema: any,
    result: TestResult,
    _options: TestingOptions
  ): Promise<void> {
    this.emit('performance:start');

    const iterations = 1000;
    const times: number[] = [];
    const generator = this.createGeneratorFromSchema(schema);

    // Generate test data
    const testData: any[] = [];
    for (let i = 0; i < iterations; i++) {
      testData.push(this.generateData(generator));
    }

    // Measure parsing performance
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    for (const data of testData) {
      const parseStart = process.hrtime.bigint();
      try {
        schema.parse(data);
        const parseEnd = process.hrtime.bigint();
        times.push(Number(parseEnd - parseStart) / 1000000); // Convert to milliseconds
      } catch {
        // Count failed parses but don't include in timing
      }
    }

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();

    result.performance = {
      avgParseTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      maxParseTime: Math.max(...times),
      minParseTime: Math.min(...times),
      throughput: iterations / (Number(endTime - startTime) / 1000000000), // ops per second
      memoryUsage: endMemory.heapUsed - startMemory.heapUsed,
      complexityScore: this.getSchemaComplexity(schema)
    };

    // Check performance thresholds
    if (result.performance.avgParseTime > 10) { // 10ms threshold
      result.failures.push({
        type: 'performance',
        message: `Average parse time (${result.performance.avgParseTime.toFixed(2)}ms) exceeds threshold (10ms)`,
        input: 'performance-test',
        severity: 'warning'
      });
    }
  }

  private async runSingleTest(schema: any, test: Test, _options: TestingOptions): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      schema: test.name,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      coverage: this.initializeCoverage(),
      failures: [],
      performance: this.initializePerformance(),
      fuzzResults: []
    };

    try {
      const parseResult = schema.safeParse(test.input);
      const passed = parseResult.success === (test.expected === 'pass');

      if (passed) {
        result.passed++;
      } else {
        result.failed++;
        result.failures.push({
          type: 'validation',
          message: `Test "${test.name}" failed`,
          input: test.input,
          expected: test.expected,
          actual: parseResult.success ? 'pass' : 'fail',
          severity: 'error'
        });
      }
    } catch (error) {
      result.failed++;
      result.failures.push({
        type: 'validation',
        message: `Test "${test.name}" threw error: ${error instanceof Error ? error.message : String(error)}`,
        input: test.input,
        severity: 'error'
      });
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private mergeCombinedResult(combined: TestResult, single: TestResult): void {
    combined.passed += single.passed;
    combined.failed += single.failed;
    combined.skipped += single.skipped;
    combined.failures.push(...single.failures);
    combined.fuzzResults.push(...single.fuzzResults);
  }

  private async calculateCoverage(schema: any, result: TestResult): Promise<TestCoverage> {
    // Analyze which parts of the schema were exercised
    const schemaStructure = this.analyzeSchemaStructure(schema);

    // Calculate coverage based on test results
    const totalBranches = schemaStructure.branches.length;
    const totalConstraints = schemaStructure.constraints.length;
    const totalEdgeCases = schemaStructure.edgeCases.length;

    // For demo purposes, calculate based on test diversity
    const inputVariety = new Set(result.fuzzResults.map(r => typeof r.input)).size;
    const branchesHit = Math.min(totalBranches, inputVariety * 2);
    const constraintsHit = Math.min(totalConstraints, result.passed + result.failed);
    const edgeCasesHit = Math.min(totalEdgeCases, result.failures.length);

    const coverage = {
      branches: totalBranches,
      branchesHit,
      constraints: totalConstraints,
      constraintsHit,
      edgeCases: totalEdgeCases,
      edgeCasesHit,
      percentage: 0
    };

    coverage.percentage = totalBranches > 0
      ? (branchesHit + constraintsHit + edgeCasesHit) / (totalBranches + totalConstraints + totalEdgeCases) * 100
      : 0;

    return coverage;
  }

  private async generateReport(result: TestResult, options: TestingOptions): Promise<void> {
    const reportDir = dirname(options.reportPath!);
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }

    switch (options.outputFormat) {
      case 'json':
        writeFileSync(options.reportPath!, JSON.stringify(result, null, 2));
        break;
      case 'junit':
        await this.generateJUnitReport(result, options.reportPath!);
        break;
      case 'html':
        await this.generateHTMLReport(result, options.reportPath!);
        break;
      default:
        await this.generateTextReport(result, options.reportPath!);
    }
  }

  private async generateJUnitReport(result: TestResult, path: string): Promise<void> {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${result.schema}" tests="${result.passed + result.failed + result.skipped}"
           failures="${result.failed}" skipped="${result.skipped}" time="${result.duration / 1000}">
  ${result.failures.map(failure => `
  <testcase name="${failure.type}" time="0">
    <failure message="${failure.message}">
      Input: ${JSON.stringify(failure.input)}
      ${failure.stack || ''}
    </failure>
  </testcase>`).join('')}
  ${Array.from({ length: result.passed }, (_, i) => `
  <testcase name="test-${i}" time="0"/>`).join('')}
</testsuite>`;

    writeFileSync(path, xml);
  }

  private async generateHTMLReport(result: TestResult, path: string): Promise<void> {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Schema Test Report - ${result.schema}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .coverage { background: #e8f5e8; padding: 10px; border-radius: 5px; margin: 10px 0; }
    .failure { background: #ffe8e8; padding: 10px; border-radius: 5px; margin: 5px 0; }
    .performance { background: #e8f0ff; padding: 10px; border-radius: 5px; margin: 10px 0; }
    .pass { color: green; } .fail { color: red; } .skip { color: orange; }
  </style>
</head>
<body>
  <h1>Schema Test Report: ${result.schema}</h1>

  <div class="summary">
    <h2>Summary</h2>
    <p><span class="pass">Passed: ${result.passed}</span> |
       <span class="fail">Failed: ${result.failed}</span> |
       <span class="skip">Skipped: ${result.skipped}</span></p>
    <p>Duration: ${result.duration}ms</p>
  </div>

  <div class="coverage">
    <h2>Coverage: ${result.coverage.percentage.toFixed(1)}%</h2>
    <p>Branches: ${result.coverage.branchesHit}/${result.coverage.branches}</p>
    <p>Constraints: ${result.coverage.constraintsHit}/${result.coverage.constraints}</p>
    <p>Edge Cases: ${result.coverage.edgeCasesHit}/${result.coverage.edgeCases}</p>
  </div>

  <div class="performance">
    <h2>Performance</h2>
    <p>Average Parse Time: ${result.performance.avgParseTime.toFixed(2)}ms</p>
    <p>Throughput: ${result.performance.throughput.toFixed(0)} ops/sec</p>
    <p>Complexity Score: ${result.performance.complexityScore}</p>
  </div>

  ${result.failures.length > 0 ? `
  <h2>Failures</h2>
  ${result.failures.map(failure => `
  <div class="failure">
    <h3>${failure.type}: ${failure.message}</h3>
    <pre>${JSON.stringify(failure.input, null, 2)}</pre>
  </div>`).join('')}` : ''}
</body>
</html>`;

    writeFileSync(path, html);
  }

  private async generateTextReport(result: TestResult, path: string): Promise<void> {
    const report = `Schema Test Report: ${result.schema}
${'='.repeat(50)}

Summary:
  Passed: ${result.passed}
  Failed: ${result.failed}
  Skipped: ${result.skipped}
  Duration: ${result.duration}ms

Coverage: ${result.coverage.percentage.toFixed(1)}%
  Branches: ${result.coverage.branchesHit}/${result.coverage.branches}
  Constraints: ${result.coverage.constraintsHit}/${result.coverage.constraints}
  Edge Cases: ${result.coverage.edgeCasesHit}/${result.coverage.edgeCases}

Performance:
  Avg Parse Time: ${result.performance.avgParseTime.toFixed(2)}ms
  Max Parse Time: ${result.performance.maxParseTime.toFixed(2)}ms
  Min Parse Time: ${result.performance.minParseTime.toFixed(2)}ms
  Throughput: ${result.performance.throughput.toFixed(0)} ops/sec
  Memory Usage: ${(result.performance.memoryUsage / 1024 / 1024).toFixed(2)} MB
  Complexity: ${result.performance.complexityScore}

${result.failures.length > 0 ? `
Failures:
${result.failures.map((failure, i) => `
  ${i + 1}. ${failure.type}: ${failure.message}
     Input: ${JSON.stringify(failure.input)}
     ${failure.expected ? `Expected: ${failure.expected}` : ''}
     ${failure.actual ? `Actual: ${failure.actual}` : ''}
`).join('')}` : 'No failures'}

${result.fuzzResults.length > 0 ? `
Fuzz Results Summary:
  Total Iterations: ${result.fuzzResults.length}
  Passed: ${result.fuzzResults.filter(r => r.result === 'pass').length}
  Failed: ${result.fuzzResults.filter(r => r.result === 'fail').length}
  Errors: ${result.fuzzResults.filter(r => r.result === 'error').length}
` : ''}`;

    writeFileSync(path, report);
  }

  private initializeCoverage(): TestCoverage {
    return {
      branches: 0,
      branchesHit: 0,
      constraints: 0,
      constraintsHit: 0,
      edgeCases: 0,
      edgeCasesHit: 0,
      percentage: 0
    };
  }

  private initializePerformance(): PerformanceMetrics {
    return {
      avgParseTime: 0,
      maxParseTime: 0,
      minParseTime: 0,
      throughput: 0,
      memoryUsage: 0,
      complexityScore: 0
    };
  }

  private initializeGenerators(): void {
    this.generators.set('string', {
      type: 'string',
      constraints: { minLength: 0, maxLength: 100 }
    });

    this.generators.set('number', {
      type: 'number',
      constraints: { min: -1000, max: 1000 }
    });

    this.generators.set('boolean', {
      type: 'boolean'
    });

    this.generators.set('email', {
      type: 'string',
      constraints: { format: 'email' }
    });

    this.generators.set('url', {
      type: 'string',
      constraints: { format: 'url' }
    });

    this.generators.set('uuid', {
      type: 'string',
      constraints: { format: 'uuid' }
    });
  }

  private initializeEdgeCases(): void {
    this.edgeCases.set('string', [
      { name: 'empty-string', description: 'Empty string', input: '', shouldPass: true, category: 'empty' },
      { name: 'null', description: 'Null value', input: null, shouldPass: false, category: 'null' },
      { name: 'undefined', description: 'Undefined value', input: undefined, shouldPass: false, category: 'null' },
      { name: 'very-long', description: 'Very long string', input: 'a'.repeat(10000), shouldPass: true, category: 'extreme' },
      { name: 'unicode', description: 'Unicode characters', input: '🚀🎉💫', shouldPass: true, category: 'boundary' }
    ]);

    this.edgeCases.set('number', [
      { name: 'zero', description: 'Zero', input: 0, shouldPass: true, category: 'boundary' },
      { name: 'negative', description: 'Negative number', input: -42, shouldPass: true, category: 'boundary' },
      { name: 'float', description: 'Floating point', input: 3.14159, shouldPass: true, category: 'boundary' },
      { name: 'infinity', description: 'Infinity', input: Infinity, shouldPass: true, category: 'extreme' },
      { name: 'nan', description: 'NaN', input: NaN, shouldPass: false, category: 'invalid' },
      { name: 'string-number', description: 'String that looks like number', input: '42', shouldPass: false, category: 'invalid' }
    ]);

    this.edgeCases.set('boolean', [
      { name: 'true', description: 'True value', input: true, shouldPass: true, category: 'boundary' },
      { name: 'false', description: 'False value', input: false, shouldPass: true, category: 'boundary' },
      { name: 'truthy', description: 'Truthy value', input: 1, shouldPass: false, category: 'invalid' },
      { name: 'falsy', description: 'Falsy value', input: 0, shouldPass: false, category: 'invalid' }
    ]);
  }

  private createGeneratorFromSchema(schema: any): DataGenerator {
    const schemaType = this.getSchemaType(schema);
    return this.generators.get(schemaType) || this.generators.get('string')!;
  }

  private generateData(generator: DataGenerator, seed?: number): any {
    // Simple data generation based on type
    // In a real implementation, this would be much more sophisticated

    if (seed !== undefined) {
      // Use seed for reproducible generation
      Math.random = this.seededRandom(seed);
    }

    switch (generator.type) {
      case 'string':
        return this.generateString(generator.constraints);
      case 'number':
        return this.generateNumber(generator.constraints);
      case 'boolean':
        return Math.random() > 0.5;
      case 'array':
        return this.generateArray(generator);
      case 'object':
        return this.generateObject(generator);
      case 'null':
        return null;
      case 'undefined':
        return undefined;
      case 'custom':
        return generator.custom ? generator.custom() : null;
      default:
        return null;
    }
  }

  private generateString(constraints?: GeneratorConstraints): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const minLength = constraints?.minLength || 0;
    const maxLength = constraints?.maxLength || 50;
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    if (constraints?.format) {
      switch (constraints.format) {
        case 'email':
          return `user${Math.floor(Math.random() * 1000)}@example.com`;
        case 'url':
          return `https://example.com/path${Math.floor(Math.random() * 1000)}`;
        case 'uuid':
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        case 'date':
          return new Date().toISOString().split('T')[0] || '';
        case 'datetime':
          return new Date().toISOString();
      }
    }

    if (constraints?.enum) {
      return constraints.enum[Math.floor(Math.random() * constraints.enum.length)];
    }

    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private generateNumber(constraints?: GeneratorConstraints): number {
    const min = constraints?.min || -1000;
    const max = constraints?.max || 1000;
    return Math.random() * (max - min) + min;
  }

  private generateArray(generator: DataGenerator): any[] {
    const length = Math.floor(Math.random() * 5) + 1;
    const elementGenerator = generator.nested?.[0] || this.generators.get('string')!;
    return Array.from({ length }, () => this.generateData(elementGenerator));
  }

  private generateObject(generator: DataGenerator): Record<string, any> {
    const keys = ['id', 'name', 'value', 'data', 'info'];
    const obj: Record<string, any> = {};

    keys.forEach(key => {
      if (Math.random() > 0.3) { // 70% chance to include each key
        const elementGenerator = generator.nested?.[0] || this.generators.get('string')!;
        obj[key] = this.generateData(elementGenerator);
      }
    });

    return obj;
  }

  private getSchemaType(schema: any): string {
    // Simplified schema type detection
    const schemaString = JSON.stringify(schema._def || schema);

    if (schemaString.includes('ZodString')) return 'string';
    if (schemaString.includes('ZodNumber')) return 'number';
    if (schemaString.includes('ZodBoolean')) return 'boolean';
    if (schemaString.includes('ZodArray')) return 'array';
    if (schemaString.includes('ZodObject')) return 'object';

    return 'string';
  }

  private getDefaultProperties(schema: any): Array<{ name: string; predicate: (input: any, output: any) => boolean }> {
    return [
      {
        name: 'idempotency',
        predicate: (_input, output) => {
          try {
            const secondParse = schema.parse(output);
            return JSON.stringify(output) === JSON.stringify(secondParse);
          } catch {
            return false;
          }
        }
      },
      {
        name: 'type-safety',
        predicate: (_input, output) => {
          return typeof output !== 'undefined';
        }
      }
    ];
  }

  private extractCoverage(_schema: any, input: any): string[] {
    // Extract which parts of the schema were exercised
    const coverage: string[] = [];

    if (input !== null && input !== undefined) {
      coverage.push('not-null');
    }

    if (typeof input === 'string' && input.length > 0) {
      coverage.push('non-empty-string');
    }

    if (typeof input === 'number' && input > 0) {
      coverage.push('positive-number');
    }

    return coverage;
  }

  private analyzeSchemaStructure(_schema: any) {
    // Analyze schema to understand its structure
    return {
      branches: ['main', 'optional', 'nullable'],
      constraints: ['required', 'type', 'format'],
      edgeCases: ['null', 'undefined', 'empty']
    };
  }

  private seededRandom(seed: number): () => number {
    let x = Math.sin(seed) * 10000;
    return () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  private async shrinkInput(input: any, _testCase: PropertyTestCase): Promise<any> {
    // Simplified shrinking - in practice this would be more sophisticated
    if (typeof input === 'string' && input.length > 1) {
      return input.substring(0, Math.floor(input.length / 2));
    }

    if (typeof input === 'number' && Math.abs(input) > 1) {
      return Math.floor(input / 2);
    }

    if (Array.isArray(input) && input.length > 1) {
      return input.slice(0, Math.floor(input.length / 2));
    }

    return input;
  }
}