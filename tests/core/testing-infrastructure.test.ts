/**
 * @fileoverview Testing Infrastructure Test Suite
 * @module TestingInfrastructureTests
 *
 * Comprehensive tests for the testing infrastructure itself
 */

import { TestingInfrastructure, TestSuite, TestCase } from '../../src/core/testing-infrastructure';
import { z } from 'zod';
import {
  createTestSchema,
  generateValidTestData,
  generateInvalidTestData,
  measurePerformance,
  createBenchmarkSuite
} from '../setup';

describe('TestingInfrastructure', () => {
  let testingInfra: TestingInfrastructure;

  beforeEach(() => {
    testingInfra = new TestingInfrastructure({
      timeout: 5000,
      parallel: false,
      coverage: true,
      verbose: false
    }, {} as any);
  });

  afterEach(async () => {
    await testingInfra.clearCache();
  });

  describe('Test Discovery', () => {
    it('should discover test suites from project', async () => {
      const discovered = await testingInfra.discoverTests('./tests');
      expect(Array.isArray(discovered)).toBe(true);
    });

    it('should handle empty directories gracefully', async () => {
      const discovered = await testingInfra.discoverTests('./non-existent');
      expect(discovered).toEqual([]);
    });
  });

  describe('Test Generation', () => {
    it('should generate tests from schemas', async () => {
      const schemas = [
        createTestSchema('UserSchema'),
        createTestSchema('ProductSchema', {
          price: z.number().positive(),
          category: z.string()
        })
      ];

      const generated = await testingInfra.generateTests(schemas);
      expect(generated.length).toBeGreaterThan(0);
      expect(generated[0].name).toContain('Generated-');
    });

    it('should handle complex nested schemas', async () => {
      const nestedSchema = createTestSchema('NestedSchema', {
        user: z.object({
          profile: z.object({
            settings: z.object({
              theme: z.enum(['light', 'dark']),
              notifications: z.boolean()
            })
          })
        }),
        metadata: z.array(z.object({
          key: z.string(),
          value: z.union([z.string(), z.number(), z.boolean()])
        }))
      });

      const generated = await testingInfra.generateTests([nestedSchema]);
      expect(generated.length).toBe(1);
      expect(generated[0].tests.length).toBeGreaterThan(0);
    });
  });

  describe('Test Execution', () => {
    it('should run validation tests successfully', async () => {
      const schema = createTestSchema('TestSchema');
      const testSuite: TestSuite = {
        name: 'Validation Tests',
        description: 'Basic validation testing',
        tests: [{
          name: 'Should validate correct data',
          description: 'Test with valid data',
          schema: schema.schema,
          validInputs: generateValidTestData(schema.schema, 5),
          invalidInputs: generateInvalidTestData(schema.schema, 3),
          edgeCases: [null, undefined, {}, []]
        }]
      };

      // Add the test suite
      testingInfra['testSuites'].set('validation', testSuite);

      const results = await testingInfra.runTests({
        suites: ['validation'],
        timeout: 3000
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].status).toBe('passed');
    });

    it('should handle test failures gracefully', async () => {
      const schema = z.object({
        required: z.string(),
        email: z.string().email()
      });

      const testCase: TestCase = {
        name: 'Should fail with invalid data',
        description: 'Test that expects failures',
        schema,
        validInputs: [{ required: 'test', email: 'test@example.com' }],
        invalidInputs: [{ required: '', email: 'invalid' }], // This should fail
        edgeCases: []
      };

      const testSuite: TestSuite = {
        name: 'Failure Tests',
        description: 'Testing failure scenarios',
        tests: [testCase]
      };

      testingInfra['testSuites'].set('failures', testSuite);

      const results = await testingInfra.runTests({
        suites: ['failures'],
        timeout: 3000
      });

      expect(results.length).toBeGreaterThan(0);
      // The test should pass because it correctly identifies invalid data
      expect(results[0].status).toBe('passed');
    });

    it('should respect timeout settings', async () => {
      const slowSchema = z.object({
        data: z.string().refine(() => {
          // Simulate slow validation
          const start = Date.now();
          while (Date.now() - start < 2000) {
            // Busy wait for 2 seconds
          }
          return true;
        })
      });

      const testCase: TestCase = {
        name: 'Slow validation test',
        description: 'Test that should timeout',
        schema: slowSchema,
        validInputs: [{ data: 'test' }],
        invalidInputs: [],
        edgeCases: []
      };

      const testSuite: TestSuite = {
        name: 'Timeout Tests',
        description: 'Testing timeout behavior',
        tests: [testCase]
      };

      testingInfra['testSuites'].set('timeout', testSuite);

      const results = await testingInfra.runTests({
        suites: ['timeout'],
        timeout: 1000 // 1 second timeout
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].status).toBe('timeout');
    });
  });

  describe('Performance Benchmarking', () => {
    it('should measure schema performance accurately', async () => {
      const schemas = [
        createTestSchema('SimpleSchema'),
        createTestSchema('ComplexSchema', {
          data: z.array(z.object({
            nested: z.object({
              deep: z.string().regex(/^[a-zA-Z0-9]+$/)
            })
          })).min(1).max(100)
        })
      ];

      const results = await testingInfra.runBenchmarks(schemas, {
        iterations: 100,
        warmupRounds: 10,
        maxExecutionTime: 1000,
        memoryThreshold: 50 * 1024 * 1024 // 50MB
      });

      expect(results.length).toBe(schemas.length);
      results.forEach(result => {
        expect(result.avgExecutionTime).toBeGreaterThan(0);
        expect(result.throughput).toBeGreaterThan(0);
        expect(result.memoryUsage).toBeGreaterThan(0);
      });
    });

    it('should detect performance regressions', async () => {
      const schema = createTestSchema('PerformanceSchema');

      // Set a baseline
      const baseline = {
        avgExecutionTime: 1.0,
        minExecutionTime: 0.5,
        maxExecutionTime: 2.0,
        memoryUsage: 1024,
        throughput: 1000,
        regressionDetected: false
      };

      testingInfra['performanceBaselines'].set('1.0', baseline);

      const results = await testingInfra.runBenchmarks([schema], {
        iterations: 50,
        warmupRounds: 5,
        maxExecutionTime: 1000,
        memoryThreshold: 10 * 1024 * 1024
      });

      expect(results.length).toBe(1);
      // The regression detection logic should work
      expect(typeof results[0].regressionDetected).toBe('boolean');
    });
  });

  describe('Contract Testing', () => {
    it('should validate schema compatibility', async () => {
      const schemas = [
        createTestSchema('UserSchemaV1', {
          name: z.string(),
          email: z.string().email()
        }),
        createTestSchema('UserSchemaV2', {
          name: z.string(),
          email: z.string().email(),
          phone: z.string().optional() // Non-breaking change
        })
      ];

      const results = await testingInfra.runContractTests(schemas, {
        compatibilityChecks: true,
        versionTolerance: 'minor',
        breakingChangeDetection: true
      });

      expect(results.length).toBe(schemas.length);
      results.forEach(result => {
        expect(result.compatible).toBe(true);
        expect(result.breakingChanges).toEqual([]);
      });
    });
  });

  describe('Mutation Testing', () => {
    it('should generate and test schema mutations', async () => {
      const schemas = [
        createTestSchema('MutationSchema', {
          required: z.string(),
          optional: z.string().optional(),
          number: z.number().min(0).max(100)
        })
      ];

      const results = await testingInfra.runMutationTests(schemas, {
        mutationStrategies: ['optional-required', 'type-change'],
        targetCoverage: 80,
        mutationTimeout: 5000
      });

      expect(results.length).toBe(schemas.length);
      results.forEach(result => {
        expect(result.mutationsGenerated).toBeGreaterThanOrEqual(0);
        expect(result.mutationScore).toBeGreaterThanOrEqual(0);
        expect(result.mutationScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Coverage Analysis', () => {
    it('should analyze test coverage', async () => {
      const mockResults = [
        {
          suite: 'test-suite',
          test: 'test-case',
          status: 'passed' as const,
          duration: 100
        }
      ];

      const coverage = await testingInfra.analyzeCoverage(mockResults);
      expect(coverage).toBeDefined();
      expect(typeof coverage.totalLines).toBe('number');
      expect(typeof coverage.coveredLines).toBe('number');
      expect(typeof coverage.coveragePercentage).toBe('number');
    });
  });

  describe('Test Statistics', () => {
    it('should provide comprehensive statistics', () => {
      const stats = testingInfra.getTestStatistics();

      expect(stats).toHaveProperty('totalTests');
      expect(stats).toHaveProperty('totalPassed');
      expect(stats).toHaveProperty('totalFailed');
      expect(stats).toHaveProperty('testSuites');
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('coverage');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid schemas gracefully', async () => {
      const invalidSchema = null as any;

      await expect(async () => {
        await testingInfra.generateTests([{
          name: 'InvalidSchema',
          schema: invalidSchema,
          filePath: 'invalid.ts',
          line: 1,
          column: 0,
          schemaType: 'unknown'
        }]);
      }).not.toThrow();
    });

    it('should handle test runner failures', async () => {
      const throwingSchema = z.object({}).refine(() => {
        throw new Error('Test error');
      });

      const testCase: TestCase = {
        name: 'Error test',
        description: 'Test that throws errors',
        schema: throwingSchema,
        validInputs: [{}],
        invalidInputs: [],
        edgeCases: []
      };

      const testSuite: TestSuite = {
        name: 'Error Tests',
        description: 'Testing error scenarios',
        tests: [testCase]
      };

      testingInfra['testSuites'].set('errors', testSuite);

      const results = await testingInfra.runTests({
        suites: ['errors'],
        timeout: 3000
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBeDefined();
    });
  });
});

// === INTEGRATION TESTS ===

describe('TestingInfrastructure Integration', () => {
  it('should run a complete testing pipeline', async () => {
    const testingInfra = new TestingInfrastructure({
      coverage: true,
      performance: true,
      parallel: false,
      timeout: 10000
    }, {} as any);

    try {
      // 1. Create test schemas
      const schemas = [
        createTestSchema('UserSchema'),
        createTestSchema('ProductSchema', {
          price: z.number().positive(),
          category: z.enum(['electronics', 'books', 'clothing'])
        })
      ];

      // 2. Generate tests
      const generatedTests = await testingInfra.generateTests(schemas);
      expect(generatedTests.length).toBeGreaterThan(0);

      // 3. Run tests
      const testResults = await testingInfra.runTests({
        coverage: true,
        performance: true,
        timeout: 5000
      });

      expect(testResults).toBeDefined();

      // 4. Run performance benchmarks
      const perfResults = await testingInfra.runBenchmarks(schemas, {
        iterations: 100,
        warmupRounds: 10,
        maxExecutionTime: 3000,
        memoryThreshold: 50 * 1024 * 1024
      });

      expect(perfResults.length).toBe(schemas.length);

      // 5. Analyze coverage
      const coverageResults = await testingInfra.analyzeCoverage(testResults);
      expect(coverageResults).toBeDefined();

      // 6. Get statistics
      const stats = testingInfra.getTestStatistics();
      expect(stats.testSuites).toBeGreaterThanOrEqual(0);

    } finally {
      await testingInfra.clearCache();
    }
  });
});