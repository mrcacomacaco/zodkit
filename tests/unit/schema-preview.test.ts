/**
 * @fileoverview Unit tests for schema preview and validation system
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { SchemaPreviewValidator } from '../../src/core/schema-preview';

describe('SchemaPreviewValidator', () => {
	let validator: SchemaPreviewValidator;

	beforeEach(() => {
		validator = new SchemaPreviewValidator();
	});

	describe('Schema Name Validation', () => {
		it('should validate correct PascalCase schema name', () => {
			const result = validator.validateSchema({
				name: 'UserSchema',
				fields: [],
			});

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		it('should reject empty schema name', () => {
			const result = validator.validateSchema({
				name: '',
				fields: [],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'SCHEMA_NAME_REQUIRED',
				}),
			);
		});

		it('should reject non-PascalCase schema name', () => {
			const result = validator.validateSchema({
				name: 'userSchema',
				fields: [],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'SCHEMA_NAME_INVALID',
				}),
			);
		});

		it('should reject schema name that is too long', () => {
			const result = validator.validateSchema({
				name: 'A'.repeat(101),
				fields: [],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'SCHEMA_NAME_TOO_LONG',
				}),
			);
		});
	});

	describe('Field Validation', () => {
		it('should validate correct field', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'email',
						type: 'email',
						optional: false,
						nullable: false,
						validations: [],
						description: 'User email address',
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		it('should reject field with empty name', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: '',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'FIELD_NAME_REQUIRED',
				}),
			);
		});

		it('should reject field with invalid name', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: '123invalid',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'FIELD_NAME_INVALID',
				}),
			);
		});

		it('should reject reserved JavaScript keyword as field name', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'class',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'RESERVED_KEYWORD',
					field: 'class',
				}),
			);
		});

		it('should detect duplicate field names', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'email',
						type: 'email',
						optional: false,
						nullable: false,
						validations: [],
					},
					{
						name: 'email',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'DUPLICATE_FIELD',
					field: 'email',
				}),
			);
		});

		it('should reject field with missing type', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'data',
						type: '',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'FIELD_TYPE_REQUIRED',
				}),
			);
		});
	});

	describe('Warnings', () => {
		it('should warn about empty schema', () => {
			const result = validator.validateSchema({
				name: 'EmptySchema',
				fields: [],
			});

			expect(result.valid).toBe(true);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					code: 'EMPTY_SCHEMA',
				}),
			);
		});

		it('should warn about missing schema description', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'id',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					code: 'NO_DESCRIPTION',
				}),
			);
		});

		it('should warn about missing field description', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				description: 'Test schema',
				fields: [
					{
						name: 'id',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					code: 'NO_FIELD_DESCRIPTION',
					field: 'id',
				}),
			);
		});

		it('should warn about using any type', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'data',
						type: 'any',
						optional: false,
						nullable: false,
						validations: [],
						description: 'Any data',
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					code: 'ANY_TYPE_USED',
					field: 'data',
				}),
			);
		});
	});

	describe('Performance and Security', () => {
		it('should cache validation results', () => {
			const schema = {
				name: 'CachedSchema',
				fields: [
					{
						name: 'id',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			};

			const result1 = validator.validateSchema(schema);
			const result2 = validator.validateSchema(schema);

			// Both should return same result (from cache)
			expect(result1).toEqual(result2);
		});

		it('should reject excessive fields', () => {
			const fields = Array.from({ length: 1001 }, (_, i) => ({
				name: `field${i}`,
				type: 'string',
				optional: false,
				nullable: false,
				validations: [],
			}));

			const result = validator.validateSchema({
				name: 'LargeSchema',
				fields,
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'TOO_MANY_FIELDS',
				}),
			);
		});

		it('should clear cache', () => {
			const schema = {
				name: 'TestSchema',
				fields: [],
			};

			validator.validateSchema(schema);
			validator.clearCache();

			// After clearing cache, should still work
			const result = validator.validateSchema(schema);
			expect(result.valid).toBe(true);
		});

		it('should handle field name with special characters correctly', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: 'valid_name$123',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		it('should reject field name starting with number', () => {
			const result = validator.validateSchema({
				name: 'TestSchema',
				fields: [
					{
						name: '1invalidName',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: 'FIELD_NAME_INVALID',
				}),
			);
		});
	});

	describe('Complex Scenarios', () => {
		it('should validate complex schema with multiple fields', () => {
			const result = validator.validateSchema({
				name: 'UserSchema',
				description: 'User profile schema',
				fields: [
					{
						name: 'id',
						type: 'uuid',
						optional: false,
						nullable: false,
						validations: [],
						description: 'Unique user ID',
					},
					{
						name: 'email',
						type: 'email',
						optional: false,
						nullable: false,
						validations: [],
						description: 'User email',
					},
					{
						name: 'age',
						type: 'number',
						optional: true,
						nullable: false,
						validations: [],
						description: 'User age',
					},
				],
			});

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
			expect(result.warnings.length).toBe(0);
		});

		it('should accumulate multiple errors', () => {
			const result = validator.validateSchema({
				name: 'invalidSchema',
				fields: [
					{
						name: '',
						type: '',
						optional: false,
						nullable: false,
						validations: [],
					},
					{
						name: 'class',
						type: 'string',
						optional: false,
						nullable: false,
						validations: [],
					},
				],
			});

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(2);
		});
	});
});
