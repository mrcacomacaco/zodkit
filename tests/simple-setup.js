"use strict";
/**
 * @fileoverview Simple Test Setup
 * @module SimpleTestSetup
 *
 * Minimal test setup without complex dependencies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestSchema = createTestSchema;
exports.generateValidTestData = generateValidTestData;
exports.generateInvalidTestData = generateInvalidTestData;
exports.expectSchemaValidation = expectSchemaValidation;
const zod_1 = require("zod");
// === TEST ENVIRONMENT SETUP ===
beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.ZODKIT_TEST_MODE = 'true';
});
// === SIMPLE TEST UTILITIES ===
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
        schemaType: 'object',
        complexity: Object.keys({ ...defaultDefinition, ...definition }).length
    };
}
/**
 * Generate valid test data
 */
function generateValidTestData(count = 1) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const data = {
            id: `550e8400-e29b-41d4-a716-44665544000${i}`,
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
 * Generate invalid test data
 */
function generateInvalidTestData(count = 1) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const data = {
            id: i, // Invalid - should be UUID string
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
 * Simple schema validation test helper
 */
function expectSchemaValidation(schema, validData, invalidData) {
    // Test valid data
    validData.forEach((data, index) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(true);
        if (!result.success) {
            console.error(`Valid data ${index} failed validation:`, result.error.issues);
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
exports.default = {
    createTestSchema,
    generateValidTestData,
    generateInvalidTestData,
    expectSchemaValidation
};
//# sourceMappingURL=simple-setup.js.map