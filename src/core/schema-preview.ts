/**
 * @fileoverview Real-time schema validation and preview system
 * @module Core/SchemaPreview
 */

import * as pc from 'picocolors';

interface SchemaField {
	name: string;
	type: string;
	optional: boolean;
	nullable: boolean;
	validations: string[];
	description?: string;
}

interface SchemaDefinition {
	name: string;
	description?: string;
	fields: SchemaField[];
}

interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

interface ValidationError {
	field?: string;
	message: string;
	code: string;
}

interface ValidationWarning {
	field?: string;
	message: string;
	code: string;
}

/**
 * Real-time schema validator with security and performance optimizations
 */
export class SchemaPreviewValidator {
	private readonly validationCache: Map<string, ValidationResult> = new Map();
	private readonly MAX_CACHE_SIZE = 100;
	private readonly FIELD_NAME_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
	private readonly SCHEMA_NAME_REGEX = /^[A-Z][a-zA-Z0-9]*$/;
	private readonly MAX_FIELDS = 1000;
	private readonly MAX_FIELD_NAME_LENGTH = 100;
	private readonly RESERVED_WORDS = new Set([
		'break',
		'case',
		'catch',
		'class',
		'const',
		'continue',
		'debugger',
		'default',
		'delete',
		'do',
		'else',
		'export',
		'extends',
		'finally',
		'for',
		'function',
		'if',
		'import',
		'in',
		'instanceof',
		'new',
		'return',
		'super',
		'switch',
		'this',
		'throw',
		'try',
		'typeof',
		'var',
		'void',
		'while',
		'with',
		'yield',
	]);

	/**
	 * Validate schema definition with comprehensive checks
	 */
	validateSchema(schema: SchemaDefinition): ValidationResult {
		const cacheKey = this.getCacheKey(schema);
		const cached = this.validationCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		// Schema name validation
		if (!schema.name || schema.name.trim().length === 0) {
			errors.push({
				message: 'Schema name is required',
				code: 'SCHEMA_NAME_REQUIRED',
			});
		} else if (!this.SCHEMA_NAME_REGEX.test(schema.name)) {
			errors.push({
				message: 'Schema name must be PascalCase (e.g., UserSchema, ProductSchema)',
				code: 'SCHEMA_NAME_INVALID',
			});
		} else if (schema.name.length > this.MAX_FIELD_NAME_LENGTH) {
			errors.push({
				message: `Schema name too long (max ${this.MAX_FIELD_NAME_LENGTH} characters)`,
				code: 'SCHEMA_NAME_TOO_LONG',
			});
		}

		// Field count validation
		if (schema.fields.length > this.MAX_FIELDS) {
			errors.push({
				message: `Too many fields (max ${this.MAX_FIELDS})`,
				code: 'TOO_MANY_FIELDS',
			});
		}

		// Field-level validation
		const fieldNames = new Set<string>();
		for (const field of schema.fields) {
			this.validateField(field, fieldNames, errors, warnings);
		}

		// Warnings for best practices
		if (schema.fields.length === 0) {
			warnings.push({
				message: 'Schema has no fields - consider adding at least one field',
				code: 'EMPTY_SCHEMA',
			});
		}

		if (!schema.description) {
			warnings.push({
				message: 'Schema description missing - consider adding documentation',
				code: 'NO_DESCRIPTION',
			});
		}

		const result: ValidationResult = {
			valid: errors.length === 0,
			errors,
			warnings,
		};

		this.addToCache(cacheKey, result);
		return result;
	}

	/**
	 * Validate individual field with security checks
	 */
	private validateField(
		field: SchemaField,
		fieldNames: Set<string>,
		errors: ValidationError[],
		warnings: ValidationWarning[],
	): void {
		// Field name validation
		if (!field.name || field.name.trim().length === 0) {
			errors.push({
				field: field.name,
				message: 'Field name is required',
				code: 'FIELD_NAME_REQUIRED',
			});
			return;
		}

		if (!this.FIELD_NAME_REGEX.test(field.name)) {
			errors.push({
				field: field.name,
				message: 'Field name must be valid JavaScript identifier (alphanumeric, _, $)',
				code: 'FIELD_NAME_INVALID',
			});
		}

		if (field.name.length > this.MAX_FIELD_NAME_LENGTH) {
			errors.push({
				field: field.name,
				message: `Field name too long (max ${this.MAX_FIELD_NAME_LENGTH} characters)`,
				code: 'FIELD_NAME_TOO_LONG',
			});
		}

		// Check for reserved words
		if (this.RESERVED_WORDS.has(field.name)) {
			errors.push({
				field: field.name,
				message: `'${field.name}' is a reserved JavaScript keyword`,
				code: 'RESERVED_KEYWORD',
			});
		}

		// Duplicate field name check
		if (fieldNames.has(field.name)) {
			errors.push({
				field: field.name,
				message: `Duplicate field name: ${field.name}`,
				code: 'DUPLICATE_FIELD',
			});
		} else {
			fieldNames.add(field.name);
		}

		// Type validation
		if (!field.type || field.type.trim().length === 0) {
			errors.push({
				field: field.name,
				message: 'Field type is required',
				code: 'FIELD_TYPE_REQUIRED',
			});
		}

		// Best practice warnings
		if (!field.description) {
			warnings.push({
				field: field.name,
				message: `Field '${field.name}' missing description`,
				code: 'NO_FIELD_DESCRIPTION',
			});
		}

		if (field.type === 'any') {
			warnings.push({
				field: field.name,
				message: `Field '${field.name}' uses 'any' type - consider using specific type`,
				code: 'ANY_TYPE_USED',
			});
		}
	}

	/**
	 * Test schema with sample data to validate it's parseable
	 */
	async testSchemaValidation(
		schema: SchemaDefinition,
		generateCode: (schema: SchemaDefinition) => string,
	): Promise<{ valid: boolean; error?: string }> {
		try {
			// Generate the schema code
			const code = generateCode(schema);

			// Basic syntax check - ensure it doesn't contain dangerous patterns
			if (code.includes('eval(') || code.includes('Function(')) {
				return {
					valid: false,
					error: 'Generated code contains potentially unsafe patterns',
				};
			}

			// Create a mock test object based on schema
			const _testData = this.generateMockData(schema);

			// In a production environment, you would:
			// 1. Actually execute the schema in a sandboxed environment
			// 2. Test it against the mock data
			// For now, we validate structure only
			return { valid: true };
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Unknown validation error',
			};
		}
	}

	/**
	 * Generate mock data for testing schema
	 */
	private generateMockData(schema: SchemaDefinition): Record<string, unknown> {
		const mockData: Record<string, unknown> = {};

		for (const field of schema.fields) {
			if (field.optional) continue;

			switch (field.type) {
				case 'string':
				case 'email':
				case 'url':
				case 'uuid':
					mockData[field.name] = 'test-value';
					break;
				case 'number':
					mockData[field.name] = 42;
					break;
				case 'boolean':
					mockData[field.name] = true;
					break;
				case 'date':
					mockData[field.name] = new Date();
					break;
				case 'array':
					mockData[field.name] = [];
					break;
				case 'object':
					mockData[field.name] = {};
					break;
				default:
					mockData[field.name] = null;
			}
		}

		return mockData;
	}

	/**
	 * Generate cache key for validation results
	 */
	private getCacheKey(schema: SchemaDefinition): string {
		return JSON.stringify({
			name: schema.name,
			fields: schema.fields.map((f) => ({
				name: f.name,
				type: f.type,
				optional: f.optional,
				nullable: f.nullable,
			})),
		});
	}

	/**
	 * Add validation result to cache with LRU eviction
	 */
	private addToCache(key: string, result: ValidationResult): void {
		if (this.validationCache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entry (first key)
			const firstKey = this.validationCache.keys().next().value;
			if (firstKey) {
				this.validationCache.delete(firstKey);
			}
		}
		this.validationCache.set(key, result);
	}

	/**
	 * Clear validation cache
	 */
	clearCache(): void {
		this.validationCache.clear();
	}
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
	const lines: string[] = [];

	if (result.errors.length > 0) {
		lines.push(pc.red('❌ Validation Errors:'));
		for (const error of result.errors) {
			const fieldPrefix = error.field ? `${error.field}: ` : '';
			lines.push(pc.red(`  • ${fieldPrefix}${error.message}`));
		}
	}

	if (result.warnings.length > 0) {
		if (lines.length > 0) lines.push('');
		lines.push(pc.yellow('⚠️  Warnings:'));
		for (const warning of result.warnings) {
			const fieldPrefix = warning.field ? `${warning.field}: ` : '';
			lines.push(pc.yellow(`  • ${fieldPrefix}${warning.message}`));
		}
	}

	return lines.join('\n');
}

/**
 * Print live schema preview with validation
 */
export function printSchemaPreview(
	schema: SchemaDefinition,
	validation: ValidationResult,
	code: string,
): void {
	console.log(pc.cyan('\n📋 Live Schema Preview:\n'));
	console.log(pc.gray('─'.repeat(60)));

	// Show schema info
	console.log(pc.bold(`Schema: ${schema.name}`));
	if (schema.description) {
		console.log(pc.gray(`Description: ${schema.description}`));
	}
	console.log(pc.gray(`Fields: ${schema.fields.length}`));

	// Show validation status
	if (validation.valid) {
		console.log(pc.green('\n✓ Valid schema'));
	} else {
		console.log(pc.red('\n✗ Invalid schema'));
	}

	// Show errors/warnings
	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		console.log(`\n${formatValidationErrors(validation)}`);
	}

	// Show code preview
	console.log(pc.cyan('\n📝 Generated Code:\n'));
	console.log(pc.gray('─'.repeat(60)));
	console.log(code);
	console.log(pc.gray('─'.repeat(60)));
}
