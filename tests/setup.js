"use strict";
/**
 * @fileoverview Test Setup and Configuration
 * @module TestSetup
 *
 * Global test setup, utilities, and configuration for ZodKit testing infrastructure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestSchema = createTestSchema;
exports.generateValidTestData = generateValidTestData;
exports.generateInvalidTestData = generateInvalidTestData;
exports.measurePerformance = measurePerformance;
exports.expectSchemaValidation = expectSchemaValidation;
exports.createBenchmarkSuite = createBenchmarkSuite;
exports.mockSchemaDiscovery = mockSchemaDiscovery;
exports.createPropertyTestGenerator = createPropertyTestGenerator;
const testing_infrastructure_1 = require("../src/core/testing-infrastructure");
const infrastructure_1 = require("../src/core/infrastructure");
const zod_1 = require("zod");
// === GLOBAL TEST SETUP ===
beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.ZODKIT_TEST_MODE = 'true';
    // Initialize testing infrastructure
    global.testInfra = new testing_infrastructure_1.TestingInfrastructure({
        timeout: 10000,
        parallel: false,
        coverage: true,
        verbose: false
    }, {});
    // Initialize core infrastructure
    global.infra = new infrastructure_1.Infrastructure({
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
function createTestSchema(name, definition = {}) {
    const defaultDefinition = {
        id: zod_1.z.string().uuid(),
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email().optional(),
        age: zod_1.z.number().int().min(0).max(120).optional(),
        createdAt: zod_1.z.string().datetime()
    };
    const schema = zod_1.z.object({ ...defaultDefinition, ...definition });
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
function generateValidTestData(schema, count = 1) {
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
function generateInvalidTestData(schema, count = 1) {
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
async function measurePerformance(schema, data, iterations = 1000) {
    const times = [];
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
function expectSchemaValidation(schema, validData, invalidData) {
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
function createBenchmarkSuite(name, schemas) {
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
function mockSchemaDiscovery(schemas) {
    return {
        findSchemas: jest.fn().mockResolvedValue(schemas),
        autoDiscover: jest.fn().mockResolvedValue(schemas)
    };
}
/**
 * Create a test case generator for property-based testing
 */
function createPropertyTestGenerator(schema) {
    return {
        generate: (count) => {
            const validCases = generateValidTestData(schema, Math.floor(count * 0.7));
            const invalidCases = generateInvalidTestData(schema, Math.floor(count * 0.3));
            return [...validCases, ...invalidCases];
        },
        generateValid: (count) => generateValidTestData(schema, count),
        generateInvalid: (count) => generateInvalidTestData(schema, count)
    };
}
// === JEST MATCHERS ===
expect.extend({
    toValidateSuccessfully(schema, data) {
        const result = schema.safeParse(data);
        const pass = result.success;
        if (pass) {
            return {
                message: () => `Expected schema to reject data: ${JSON.stringify(data)}`,
                pass: true
            };
        }
        else {
            return {
                message: () => `Expected schema to accept data: ${JSON.stringify(data)}\nErrors: ${JSON.stringify(result.error?.errors)}`,
                pass: false
            };
        }
    },
    toRejectWithError(schema, data, expectedError) {
        const result = schema.safeParse(data);
        const pass = !result.success;
        if (pass && expectedError) {
            const hasExpectedError = result.error?.errors.some(err => err.message.includes(expectedError) || err.code === expectedError);
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
        }
        else {
            return {
                message: () => `Expected schema to reject data: ${JSON.stringify(data)}`,
                pass: false
            };
        }
    }
});
exports.default = {
    createTestSchema,
    generateValidTestData,
    generateInvalidTestData,
    measurePerformance,
    expectSchemaValidation,
    createBenchmarkSuite,
    mockSchemaDiscovery,
    createPropertyTestGenerator
};
//# sourceMappingURL=setup.js.map