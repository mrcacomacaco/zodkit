/**
 * @fileoverview Example Validation
 * @module ExampleValidator
 *
 * Validates examples from metadata against their schemas to ensure correctness.
 */

import type { DocNode } from './tree';

export interface ValidationResult {
	/** Whether the example is valid */
	valid: boolean;
	/** Validation errors */
	errors: ValidationError[];
	/** Schema name */
	schemaName: string;
	/** Example index (if multiple) */
	exampleIndex?: number;
}

export interface ValidationError {
	/** Error message */
	message: string;
	/** Path to the invalid field */
	path?: string[];
	/** Expected type/value */
	expected?: string;
	/** Actual value */
	actual?: any;
}

export class ExampleValidator {
	/**
	 * Validate all examples in a node
	 */
	validateNode(node: DocNode): ValidationResult[] {
		const results: ValidationResult[] = [];

		if (!node.metadata) return results;

		// Validate examples from .meta()
		if (node.metadata.examples) {
			node.metadata.examples.forEach((example, index) => {
				const result = this.validateExample(node, example, index);
				results.push(result);
			});
		}

		// Validate examples from TSDoc
		if (node.metadata.tsDoc?.examples) {
			node.metadata.tsDoc.examples.forEach((example, index) => {
				const result = this.validateExample(node, example, index);
				results.push(result);
			});
		}

		return results;
	}

	/**
	 * Validate a single example against schema
	 */
	private validateExample(node: DocNode, example: any, exampleIndex?: number): ValidationResult {
		const result: ValidationResult = {
			valid: true,
			errors: [],
			schemaName: node.name,
			exampleIndex,
		};

		if (!node.schemaType) {
			result.valid = false;
			result.errors.push({
				message: 'No schema type available for validation',
			});
			return result;
		}

		// Validate based on inferred type
		const schemaType = this.inferSchemaType(node.schemaType);

		try {
			this.validateValue(example, schemaType, [], result);
		} catch (error) {
			result.valid = false;
			result.errors.push({
				message: error instanceof Error ? error.message : String(error),
			});
		}

		return result;
	}

	/**
	 * Infer schema type structure from Zod schema string
	 */
	private inferSchemaType(zodType: string): SchemaType {
		// Parse z.object()
		if (zodType.includes('z.object({')) {
			return this.parseObjectType(zodType);
		}

		// Parse z.array()
		if (zodType.includes('z.array(')) {
			return this.parseArrayType(zodType);
		}

		// Parse primitive types
		if (zodType.includes('z.string()')) return { type: 'string' };
		if (zodType.includes('z.number()')) return { type: 'number' };
		if (zodType.includes('z.boolean()')) return { type: 'boolean' };
		if (zodType.includes('z.null()')) return { type: 'null' };
		if (zodType.includes('z.undefined()')) return { type: 'undefined' };

		// Parse z.enum()
		if (zodType.includes('z.enum([')) {
			const enumMatch = zodType.match(/z\.enum\(\[([^\]]+)\]/);
			if (enumMatch) {
				const values = enumMatch[1].split(',').map((v) => v.trim().replace(/['"]/g, ''));
				return { type: 'enum', values };
			}
		}

		// Parse z.literal()
		if (zodType.includes('z.literal(')) {
			const literalMatch = zodType.match(/z\.literal\(([^)]+)\)/);
			if (literalMatch) {
				const value = literalMatch[1].trim().replace(/['"]/g, '');
				return { type: 'literal', value };
			}
		}

		// Default to any
		return { type: 'any' };
	}

	/**
	 * Parse object type
	 */
	private parseObjectType(zodType: string): SchemaType {
		const properties: Record<string, SchemaType> = {};
		const required: string[] = [];

		const objectMatch = zodType.match(/z\.object\(\{([^}]+)\}\)/);
		if (!objectMatch) return { type: 'object', properties, required };

		const propsStr = objectMatch[1];
		const propMatches = propsStr.matchAll(/(\w+):\s*z\.(\w+)\([^)]*\)/g);

		for (const match of propMatches) {
			const [fullMatch, propName, propType] = match;
			const isOptional = fullMatch.includes('.optional()');

			properties[propName] = this.mapZodType(propType);

			if (!isOptional) {
				required.push(propName);
			}
		}

		return { type: 'object', properties, required };
	}

	/**
	 * Parse array type
	 */
	private parseArrayType(zodType: string): SchemaType {
		const arrayMatch = zodType.match(/z\.array\(z\.(\w+)\(/);
		if (arrayMatch) {
			return {
				type: 'array',
				items: this.mapZodType(arrayMatch[1]),
			};
		}
		return { type: 'array', items: { type: 'any' } };
	}

	/**
	 * Map Zod type to schema type
	 */
	private mapZodType(zodType: string): SchemaType {
		const typeMap: Record<string, SchemaType['type']> = {
			string: 'string',
			number: 'number',
			boolean: 'boolean',
			date: 'date',
			bigint: 'bigint',
			null: 'null',
			undefined: 'undefined',
			any: 'any',
			unknown: 'unknown',
		};

		const type = typeMap[zodType] || 'any';
		return { type };
	}

	/**
	 * Validate value against schema type
	 */
	private validateValue(
		value: any,
		schemaType: SchemaType,
		path: string[],
		result: ValidationResult,
	): void {
		// Handle null/undefined
		if (value === null) {
			if (schemaType.type !== 'null' && schemaType.type !== 'any') {
				result.valid = false;
				result.errors.push({
					message: 'Value is null',
					path,
					expected: schemaType.type,
					actual: null,
				});
			}
			return;
		}

		if (value === undefined) {
			if (schemaType.type !== 'undefined' && schemaType.type !== 'any') {
				result.valid = false;
				result.errors.push({
					message: 'Value is undefined',
					path,
					expected: schemaType.type,
					actual: undefined,
				});
			}
			return;
		}

		// Validate by type
		switch (schemaType.type) {
			case 'string':
				if (typeof value !== 'string') {
					result.valid = false;
					result.errors.push({
						message: 'Expected string',
						path,
						expected: 'string',
						actual: typeof value,
					});
				}
				break;

			case 'number':
				if (typeof value !== 'number') {
					result.valid = false;
					result.errors.push({
						message: 'Expected number',
						path,
						expected: 'number',
						actual: typeof value,
					});
				}
				break;

			case 'boolean':
				if (typeof value !== 'boolean') {
					result.valid = false;
					result.errors.push({
						message: 'Expected boolean',
						path,
						expected: 'boolean',
						actual: typeof value,
					});
				}
				break;

			case 'object':
				if (typeof value !== 'object' || Array.isArray(value)) {
					result.valid = false;
					result.errors.push({
						message: 'Expected object',
						path,
						expected: 'object',
						actual: Array.isArray(value) ? 'array' : typeof value,
					});
					return;
				}

				// Validate object properties
				if (schemaType.properties) {
					// Check required properties
					if (schemaType.required) {
						for (const requiredProp of schemaType.required) {
							if (!(requiredProp in value)) {
								result.valid = false;
								result.errors.push({
									message: `Missing required property: ${requiredProp}`,
									path: [...path, requiredProp],
									expected: 'present',
									actual: 'missing',
								});
							}
						}
					}

					// Validate each property
					for (const [propName, propType] of Object.entries(schemaType.properties)) {
						if (propName in value) {
							this.validateValue(value[propName], propType, [...path, propName], result);
						}
					}
				}
				break;

			case 'array':
				if (!Array.isArray(value)) {
					result.valid = false;
					result.errors.push({
						message: 'Expected array',
						path,
						expected: 'array',
						actual: typeof value,
					});
					return;
				}

				// Validate array items
				if (schemaType.items) {
					value.forEach((item, index) => {
						this.validateValue(item, schemaType.items!, [...path, String(index)], result);
					});
				}
				break;

			case 'enum':
				if (schemaType.values && !schemaType.values.includes(String(value))) {
					result.valid = false;
					result.errors.push({
						message: `Value not in enum`,
						path,
						expected: schemaType.values.join(' | '),
						actual: value,
					});
				}
				break;

			case 'literal':
				if (value !== schemaType.value) {
					result.valid = false;
					result.errors.push({
						message: 'Value does not match literal',
						path,
						expected: schemaType.value,
						actual: value,
					});
				}
				break;

			case 'date':
				if (!(value instanceof Date) && typeof value !== 'string') {
					result.valid = false;
					result.errors.push({
						message: 'Expected date',
						path,
						expected: 'Date or string',
						actual: typeof value,
					});
				}
				break;

			case 'any':
			case 'unknown':
				// Always valid
				break;
		}
	}

	/**
	 * Format validation results for display
	 */
	formatResults(results: ValidationResult[]): string {
		const lines: string[] = [];

		results.forEach((result) => {
			const exampleLabel =
				result.exampleIndex !== undefined ? ` (example ${result.exampleIndex + 1})` : '';

			if (result.valid) {
				lines.push(`✅ ${result.schemaName}${exampleLabel}: Valid`);
			} else {
				lines.push(`❌ ${result.schemaName}${exampleLabel}: Invalid`);
				result.errors.forEach((error) => {
					const pathStr = error.path ? error.path.join('.') : 'root';
					lines.push(`   • ${pathStr}: ${error.message}`);
					if (error.expected && error.actual !== undefined) {
						lines.push(`     Expected: ${error.expected}, Actual: ${error.actual}`);
					}
				});
			}
		});

		return lines.join('\n');
	}
}

/**
 * Schema type structure
 */
interface SchemaType {
	type:
		| 'string'
		| 'number'
		| 'boolean'
		| 'object'
		| 'array'
		| 'null'
		| 'undefined'
		| 'date'
		| 'bigint'
		| 'enum'
		| 'literal'
		| 'any'
		| 'unknown';
	properties?: Record<string, SchemaType>;
	required?: string[];
	items?: SchemaType;
	values?: string[];
	value?: any;
}

/**
 * Validate examples in a documentation node
 */
export function validateExamples(node: DocNode): ValidationResult[] {
	const validator = new ExampleValidator();
	return validator.validateNode(node);
}
