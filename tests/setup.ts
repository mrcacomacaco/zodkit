/**
 * @fileoverview Test Setup and Configuration
 * @module TestSetup
 *
 * Global test setup, utilities, and configuration for ZodKit testing infrastructure
 */

import { TestingInfrastructure } from '../src/core/testing-infrastructure';
import { Infrastructure } from '../src/core/infrastructure';
import { z } from 'zod';

// === GLOBAL TEST SETUP ===

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.ZODKIT_TEST_MODE = 'true';

  // Initialize testing infrastructure
  global.testInfra = new TestingInfrastructure({
    timeout: 10000,
    parallel: false,
    coverage: true,
    verbose: false
  }, {} as any);

  // Initialize core infrastructure
  global.infra = new Infrastructure({
    cache: { enabled: false, ttl: 0, directory: '.test-cache' },
    monitoring: { enabled: false, interval: 60000, metrics: [] }
  });
});

afterAll(async () => {
  // Cleanup
  if (global.testInfra) {
    await global.testInfra.clearCache();
  }

  if (global.infra) {
    await global.infra.shutdown();
  }
});

// === TEST UTILITIES ===

/**
 * Create a test schema for testing purposes
 */
export function createTestSchema(name: string, definition: any = {}) {
  const defaultDefinition = {
    id: z.string().uuid(),
    name: z.string().min(1),
    email: z.string().email().optional(),
    age: z.number().int().min(0).max(120).optional(),
    createdAt: z.string().datetime()
  };

  const schema = z.object({ ...defaultDefinition, ...definition });

  return {
    name,
    schema,
    filePath: `test-schemas/${name}.ts`,
    line: 1,
    column: 0,
    schemaType: 'object',
    zodChain: 'z.object(...)',
    complexity: Object.keys({ ...defaultDefinition, ...definition }).length
  };
}

/**
 * Generate test data that conforms to a schema
 */
export function generateValidTestData(schema: z.ZodTypeAny, count: number = 1): any[] {
  const results = [];

  for (let i = 0; i < count; i++) {
    // Simple test data generation - would be enhanced with proper generators
    const data = {
      id: `test-id-${i}`,
      name: `Test Name ${i}`,
      email: `test${i}@example.com`,
      age: 25 + i,
      createdAt: new Date().toISOString()
    };

    results.push(data);
  }

  return results;
}

/**
 * Generate test data that violates a schema
 */
export function generateInvalidTestData(schema: z.ZodTypeAny, count: number = 1): any[] {
  const results = [];

  for (let i = 0; i < count; i++) {
    const data = {
      id: i, // Invalid - should be string
      name: '', // Invalid - too short
      email: 'invalid-email', // Invalid format
      age: -1, // Invalid - negative
      createdAt: 'not-a-date' // Invalid format
    };

    results.push(data);
  }

  return results;
}

/**
 * Measure performance of schema validation
 */
export async function measurePerformance(
  schema: z.ZodTypeAny,
  data: any[],
  iterations: number = 1000
): Promise<{
  avgTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
}> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 100; i++) {
    schema.safeParse(data[i % data.length]);
  }

  // Actual measurements
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    schema.safeParse(data[i % data.length]);
    const end = process.hrtime.bigint();

    times.push(Number(end - start) / 1000000); // Convert to milliseconds
  }

  const avgTime = times.reduce((a, b) => a + b) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const throughput = 1000 / avgTime; // ops per second

  return { avgTime, minTime, maxTime, throughput };
}

/**
 * Assert that a schema validates correctly
 */
export function expectSchemaValidation(
  schema: z.ZodTypeAny,
  validData: any[],
  invalidData: any[]
): void {
  // Test valid data
  validData.forEach((data, index) => {
    const result = schema.safeParse(data);
    expect(result.success).toBe(true);
    if (!result.success) {
      console.error(`Valid data ${index} failed validation:`, result.error.errors);
    }
  });

  // Test invalid data
  invalidData.forEach((data, index) => {
    const result = schema.safeParse(data);
    expect(result.success).toBe(false);
    if (result.success) {
      console.error(`Invalid data ${index} passed validation when it shouldn't have:`, data);
    }
  });
}

/**
 * Create a performance benchmark suite
 */
export function createBenchmarkSuite(name: string, schemas: any[]) {
  return {
    name,
    schemas,
    run: async () => {
      const results = [];

      for (const schemaInfo of schemas) {
        const validData = generateValidTestData(schemaInfo.schema, 10);
        const performance = await measurePerformance(schemaInfo.schema, validData);

        results.push({
          schema: schemaInfo.name,
          performance,
          complexity: schemaInfo.complexity
        });
      }

      return results;
    }
  };
}

/**
 * Mock schema discovery for testing
 */
export function mockSchemaDiscovery(schemas: any[]) {
  return {
    findSchemas: jest.fn().mockResolvedValue(schemas),
    autoDiscover: jest.fn().mockResolvedValue(schemas)
  };
}

/**
 * Create a test case generator for property-based testing
 */
export function createPropertyTestGenerator(schema: z.ZodTypeAny) {
  return {
    generate: (count: number) => {
      const validCases = generateValidTestData(schema, Math.floor(count * 0.7));
      const invalidCases = generateInvalidTestData(schema, Math.floor(count * 0.3));

      return [...validCases, ...invalidCases];
    },

    generateValid: (count: number) => generateValidTestData(schema, count),
    generateInvalid: (count: number) => generateInvalidTestData(schema, count)
  };
}

// === TYPE DECLARATIONS ===

declare global {
  var testInfra: TestingInfrastructure;
  var infra: Infrastructure;
}

// === JEST MATCHERS ===

expect.extend({
  toValidateSuccessfully(schema: z.ZodTypeAny, data: any) {
    const result = schema.safeParse(data);
    const pass = result.success;

    if (pass) {
      return {
        message: () => `Expected schema to reject data: ${JSON.stringify(data)}`,
        pass: true
      };
    } else {
      return {
        message: () => `Expected schema to accept data: ${JSON.stringify(data)}\nErrors: ${JSON.stringify(result.error?.errors)}`,
        pass: false
      };
    }
  },

  toRejectWithError(schema: z.ZodTypeAny, data: any, expectedError?: string) {
    const result = schema.safeParse(data);
    const pass = !result.success;

    if (pass && expectedError) {
      const hasExpectedError = result.error?.errors.some(err =>
        err.message.includes(expectedError) || err.code === expectedError
      );

      if (!hasExpectedError) {
        return {
          message: () => `Expected schema to reject with error "${expectedError}", but got: ${JSON.stringify(result.error?.errors)}`,
          pass: false
        };
      }
    }

    if (pass) {
      return {
        message: () => `Expected schema to accept data: ${JSON.stringify(data)}`,
        pass: true
      };
    } else {
      return {
        message: () => `Expected schema to reject data: ${JSON.stringify(data)}`,
        pass: false
      };
    }
  }
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toValidateSuccessfully(data: any): R;
      toRejectWithError(data: any, expectedError?: string): R;
    }
  }
}

export default {
  createTestSchema,
  generateValidTestData,
  generateInvalidTestData,
  measurePerformance,
  expectSchemaValidation,
  createBenchmarkSuite,
  mockSchemaDiscovery,
  createPropertyTestGenerator
};