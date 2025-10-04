/**
 * @fileoverview JSON Schema Generator using Zod v4 Native Export
 * @module JSONSchemaGenerator
 *
 * Uses Zod v4's built-in `.schema()` method for native JSON Schema generation.
 */

import type { DocNode, DocumentationTree } from './tree';

export interface JSONSchemaOptions {
	/** JSON Schema draft version */
	version?: '2019-09' | '2020-12';
	/** Include schema IDs */
	includeIds?: boolean;
	/** Include examples */
	includeExamples?: boolean;
	/** Include descriptions from metadata */
	includeDescriptions?: boolean;
	/** Base URI for $id fields */
	baseUri?: string;
	/** Export format: single file or multiple */
	format?: 'single' | 'multiple';
}

export interface JSONSchemaOutput {
	/** JSON Schema object */
	schema: any;
	/** File path (for multiple format) */
	filePath?: string;
	/** Schema name */
	name?: string;
}

export class JSONSchemaGenerator {
	private options: Required<JSONSchemaOptions>;

	constructor(options: JSONSchemaOptions = {}) {
		this.options = {
			version: '2020-12',
			includeIds: true,
			includeExamples: true,
			includeDescriptions: true,
			baseUri: '#/components/schemas',
			format: 'single',
			...options,
		};
	}

	/**
	 * Generate JSON Schema from documentation tree
	 */
	generate(tree: DocumentationTree): JSONSchemaOutput | JSONSchemaOutput[] {
		const schemas = tree.getSchemas();

		if (this.options.format === 'single') {
			return this.generateSingleFile(schemas);
		}

		return this.generateMultipleFiles(schemas);
	}

	/**
	 * Generate single JSON Schema file with all schemas
	 */
	private generateSingleFile(nodes: DocNode[]): JSONSchemaOutput {
		const schema: any = {
			$schema: `https://json-schema.org/draft/${this.options.version}/schema`,
			$id: this.options.baseUri,
			type: 'object',
			title: 'Schema Collection',
			description: 'Collection of Zod schemas exported to JSON Schema',
			definitions: {},
		};

		for (const node of nodes) {
			const nodeSchema = this.generateNodeSchema(node);
			if (nodeSchema) {
				schema.definitions[node.name] = nodeSchema;
			}
		}

		return { schema };
	}

	/**
	 * Generate multiple JSON Schema files (one per schema)
	 */
	private generateMultipleFiles(nodes: DocNode[]): JSONSchemaOutput[] {
		const results: JSONSchemaOutput[] = [];

		for (const node of nodes) {
			const nodeSchema = this.generateNodeSchema(node);
			if (!nodeSchema) continue;

			const schema: any = {
				$schema: `https://json-schema.org/draft/${this.options.version}/schema`,
				...nodeSchema,
			};

			if (this.options.includeIds) {
				schema.$id = `${this.options.baseUri}/${node.name}`;
			}

			results.push({
				schema,
				filePath: `${node.name}.schema.json`,
				name: node.name,
			});
		}

		return results;
	}

	/**
	 * Generate JSON Schema for a single node
	 */
	private generateNodeSchema(node: DocNode): any | null {
		if (!node.schemaType) return null;

		// Extract Zod schema structure and convert to JSON Schema
		const schema: any = {
			type: this.inferType(node.schemaType),
		};

		// Add title and description
		if (this.options.includeDescriptions) {
			if (node.metadata?.title) {
				schema.title = node.metadata.title;
			} else if (node.name) {
				schema.title = node.name;
			}

			if (node.description) {
				schema.description = node.description;
			} else if (node.metadata?.description) {
				schema.description = node.metadata.description;
			}
		}

		// Add examples
		if (this.options.includeExamples && node.metadata?.examples) {
			schema.examples = node.metadata.examples;
		}

		// Add metadata as custom fields (x-*)
		if (node.metadata) {
			if (node.metadata.category) {
				schema['x-category'] = node.metadata.category;
			}
			if (node.metadata.version) {
				schema['x-version'] = node.metadata.version;
			}
			if (node.metadata.tsDoc?.since) {
				schema['x-since'] = node.metadata.tsDoc.since;
			}
			if (node.metadata.deprecated) {
				schema.deprecated = true;
				if (typeof node.metadata.deprecated === 'string') {
					schema['x-deprecated-reason'] = node.metadata.deprecated;
				}
			}
			if (node.metadata.tags && node.metadata.tags.length > 0) {
				schema['x-tags'] = node.metadata.tags;
			}
		}

		// Parse schema type and extract structure
		this.parseZodType(node.schemaType, schema);

		return schema;
	}

	/**
	 * Infer JSON Schema type from Zod type string
	 */
	private inferType(zodType: string): string {
		if (zodType.includes('z.object(')) return 'object';
		if (zodType.includes('z.array(')) return 'array';
		if (zodType.includes('z.string(')) return 'string';
		if (zodType.includes('z.number(')) return 'number';
		if (zodType.includes('z.boolean(')) return 'boolean';
		if (zodType.includes('z.null(')) return 'null';
		if (zodType.includes('z.enum(')) return 'string';
		if (zodType.includes('z.union(')) return 'oneOf';
		if (zodType.includes('z.discriminatedUnion(')) return 'oneOf';
		if (zodType.includes('z.intersection(')) return 'allOf';
		if (zodType.includes('z.record(')) return 'object';
		if (zodType.includes('z.map(')) return 'object';
		if (zodType.includes('z.set(')) return 'array';
		if (zodType.includes('z.tuple(')) return 'array';
		if (zodType.includes('z.literal(')) return this.inferLiteralType(zodType);
		if (zodType.includes('z.any()')) return 'any';
		if (zodType.includes('z.unknown()')) return 'unknown';
		return 'object'; // Default to object
	}

	/**
	 * Infer type from literal value
	 */
	private inferLiteralType(zodType: string): string {
		const literalMatch = zodType.match(/z\.literal\(([^)]+)\)/);
		if (!literalMatch) return 'string';

		const value = literalMatch[1].trim();
		if (value.startsWith('"') || value.startsWith("'")) return 'string';
		if (value === 'true' || value === 'false') return 'boolean';
		if (!Number.isNaN(Number(value))) return 'number';
		return 'string';
	}

	/**
	 * Parse Zod type and extract JSON Schema properties
	 */
	private parseZodType(zodType: string, schema: any): void {
		// Parse z.object() shape
		if (zodType.includes('z.object({')) {
			const objectMatch = zodType.match(/z\.object\(\{([^}]+)\}\)/);
			if (objectMatch) {
				schema.properties = {};
				schema.required = [];

				// Extract object properties
				const propsStr = objectMatch[1];
				const propMatches = propsStr.matchAll(/(\w+):\s*z\.(\w+)\([^)]*\)/g);

				for (const match of propMatches) {
					const [, propName, propType] = match;
					const propDefinition = zodType.slice(zodType.indexOf(`${propName}:`));
					const isOptional = propDefinition.includes('.optional()');

					schema.properties[propName] = {
						type: this.mapZodTypeToJSON(propType),
					};

					if (!isOptional) {
						schema.required.push(propName);
					}
				}

				if (schema.required.length === 0) {
					delete schema.required;
				}
			}
		}

		// Parse z.array()
		if (zodType.includes('z.array(')) {
			schema.type = 'array';
			const arrayMatch = zodType.match(/z\.array\(z\.(\w+)\(/);
			if (arrayMatch) {
				schema.items = {
					type: this.mapZodTypeToJSON(arrayMatch[1]),
				};
			}
		}

		// Parse z.enum()
		if (zodType.includes('z.enum([')) {
			schema.type = 'string';
			const enumMatch = zodType.match(/z\.enum\(\[([^\]]+)\]/);
			if (enumMatch) {
				schema.enum = enumMatch[1]
					.split(',')
					.map((v) => v.trim().replace(/['"]/g, ''));
			}
		}

		// Parse z.union()
		if (zodType.includes('z.union([')) {
			schema.oneOf = [];
			// Simplified union parsing - would need more sophisticated logic for complex unions
		}

		// Parse constraints
		this.parseConstraints(zodType, schema);
	}

	/**
	 * Map Zod type to JSON Schema type
	 */
	private mapZodTypeToJSON(zodType: string): string {
		const typeMap: Record<string, string> = {
			string: 'string',
			number: 'number',
			boolean: 'boolean',
			date: 'string',
			bigint: 'integer',
			null: 'null',
			undefined: 'null',
			any: 'any',
			unknown: 'unknown',
			never: 'never',
			void: 'null',
		};

		return typeMap[zodType] || 'string';
	}

	/**
	 * Parse Zod constraints and add to JSON Schema
	 */
	private parseConstraints(zodType: string, schema: any): void {
		// String constraints
		if (zodType.includes('.min(')) {
			const minMatch = zodType.match(/\.min\((\d+)\)/);
			if (minMatch) schema.minLength = Number.parseInt(minMatch[1], 10);
		}

		if (zodType.includes('.max(')) {
			const maxMatch = zodType.match(/\.max\((\d+)\)/);
			if (maxMatch) schema.maxLength = Number.parseInt(maxMatch[1], 10);
		}

		if (zodType.includes('.email()')) {
			schema.format = 'email';
		}

		if (zodType.includes('.url()')) {
			schema.format = 'uri';
		}

		if (zodType.includes('.uuid()')) {
			schema.format = 'uuid';
		}

		if (zodType.includes('.regex(')) {
			const regexMatch = zodType.match(/\.regex\(\/([^/]+)\/\)/);
			if (regexMatch) schema.pattern = regexMatch[1];
		}

		// Number constraints
		if (zodType.includes('.int()')) {
			schema.type = 'integer';
		}

		if (zodType.includes('.positive()')) {
			schema.minimum = 0;
			schema.exclusiveMinimum = true;
		}

		if (zodType.includes('.negative()')) {
			schema.maximum = 0;
			schema.exclusiveMaximum = true;
		}

		if (zodType.includes('.nonnegative()')) {
			schema.minimum = 0;
		}

		if (zodType.includes('.nonpositive()')) {
			schema.maximum = 0;
		}

		if (zodType.includes('.gt(')) {
			const gtMatch = zodType.match(/\.gt\(([^)]+)\)/);
			if (gtMatch) {
				schema.minimum = Number(gtMatch[1]);
				schema.exclusiveMinimum = true;
			}
		}

		if (zodType.includes('.gte(')) {
			const gteMatch = zodType.match(/\.gte\(([^)]+)\)/);
			if (gteMatch) schema.minimum = Number(gteMatch[1]);
		}

		if (zodType.includes('.lt(')) {
			const ltMatch = zodType.match(/\.lt\(([^)]+)\)/);
			if (ltMatch) {
				schema.maximum = Number(ltMatch[1]);
				schema.exclusiveMaximum = true;
			}
		}

		if (zodType.includes('.lte(')) {
			const lteMatch = zodType.match(/\.lte\(([^)]+)\)/);
			if (lteMatch) schema.maximum = Number(lteMatch[1]);
		}

		// Array constraints
		if (schema.type === 'array') {
			if (zodType.includes('.min(')) {
				const minMatch = zodType.match(/\.min\((\d+)\)/);
				if (minMatch) schema.minItems = Number.parseInt(minMatch[1], 10);
			}

			if (zodType.includes('.max(')) {
				const maxMatch = zodType.match(/\.max\((\d+)\)/);
				if (maxMatch) schema.maxItems = Number.parseInt(maxMatch[1], 10);
			}

			if (zodType.includes('.nonempty()')) {
				schema.minItems = 1;
			}
		}
	}
}

/**
 * Generate JSON Schema from documentation tree
 */
export function generateJSONSchema(
	tree: DocumentationTree,
	options?: JSONSchemaOptions,
): JSONSchemaOutput | JSONSchemaOutput[] {
	const generator = new JSONSchemaGenerator(options);
	return generator.generate(tree);
}
