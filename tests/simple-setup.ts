/**
 * @fileoverview Simple Test Setup
 * @module SimpleTestSetup
 *
 * Minimal test setup without complex dependencies
 */

import { z } from 'zod';

// === TEST ENVIRONMENT SETUP ===

beforeAll(() => {
	process.env.NODE_ENV = 'test';
	process.env.ZODKIT_TEST_MODE = 'true';
});

// === SIMPLE TEST UTILITIES ===

/**
 * Create a test schema for testing purposes
 */
export function createTestSchema(name: string, definition: any = {}) {
	const defaultDefinition = {
		id: z.string().uuid(),
		name: z.string().min(1),
		email: z.string().email().optional(),
		age: z.number().int().min(0).max(120).optional(),
		createdAt: z.string().datetime(),
	};

	const schema = z.object({ ...defaultDefinition, ...definition });

	return {
		name,
		schema,
		filePath: `test-schemas/${name}.ts`,
		schemaType: 'object',
		complexity: Object.keys({ ...defaultDefinition, ...definition }).length,
		line: 1,
		column: 0,
	};
}

/**
 * Generate valid test data
 */
export function generateValidTestData(count: number = 1): any[] {
	const results: any[] = [];

	for (let i = 0; i < count; i++) {
		const data = {
			id: `550e8400-e29b-41d4-a716-44665544000${i}`,
			name: `Test Name ${i}`,
			email: `test${i}@example.com`,
			age: 25 + i,
			createdAt: new Date().toISOString(),
		};

		results.push(data);
	}

	return results;
}

/**
 * Generate invalid test data
 */
export function generateInvalidTestData(count: number = 1): any[] {
	const results: any[] = [];

	for (let i = 0; i < count; i++) {
		const data = {
			id: i, // Invalid - should be UUID string
			name: '', // Invalid - too short
			email: 'invalid-email', // Invalid format
			age: -1, // Invalid - negative
			createdAt: 'not-a-date', // Invalid format
		};

		results.push(data);
	}

	return results;
}

/**
 * Simple schema validation test helper
 */
export function expectSchemaValidation(
	schema: z.ZodTypeAny,
	validData: any[],
	invalidData: any[],
): void {
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

export default {
	createTestSchema,
	generateValidTestData,
	generateInvalidTestData,
	expectSchemaValidation,
};
