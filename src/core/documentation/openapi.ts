/**
 * @fileoverview OpenAPI 3.1 Generator
 * @module OpenAPIGenerator
 *
 * Generates OpenAPI 3.1 specification from Zod schemas.
 */

import type { DocNode, DocumentationTree } from './tree';
import { JSONSchemaGenerator } from './json-schema';

export interface OpenAPIOptions {
	/** API title */
	title?: string;
	/** API description */
	description?: string;
	/** API version */
	version?: string;
	/** Server URLs */
	servers?: Array<{ url: string; description?: string }>;
	/** Contact information */
	contact?: {
		name?: string;
		url?: string;
		email?: string;
	};
	/** License information */
	license?: {
		name: string;
		url?: string;
	};
	/** Include examples */
	includeExamples?: boolean;
	/** Generate paths from schemas */
	generatePaths?: boolean;
	/** Base path for generated endpoints */
	basePath?: string;
}

export class OpenAPIGenerator {
	private options: Required<OpenAPIOptions>;
	private jsonSchemaGenerator: JSONSchemaGenerator;

	constructor(options: OpenAPIOptions = {}) {
		this.options = {
			title: 'API Documentation',
			description: 'API documentation generated from Zod schemas',
			version: '1.0.0',
			servers: [{ url: 'http://localhost:3000', description: 'Development server' }],
			contact: {},
			license: { name: 'MIT' },
			includeExamples: true,
			generatePaths: true,
			basePath: '/api',
			...options,
		};

		this.jsonSchemaGenerator = new JSONSchemaGenerator({
			version: '2020-12',
			includeIds: false,
			includeExamples: this.options.includeExamples,
			includeDescriptions: true,
		});
	}

	/**
	 * Generate OpenAPI 3.1 specification
	 */
	generate(tree: DocumentationTree): any {
		const spec: any = {
			openapi: '3.1.0',
			info: this.generateInfo(),
			servers: this.options.servers,
			paths: {},
			components: {
				schemas: {},
			},
		};

		// Add schemas to components
		const schemas = tree.getSchemas();
		for (const node of schemas) {
			const schema = this.jsonSchemaGenerator['generateNodeSchema'](node);
			if (schema) {
				spec.components.schemas[node.name] = schema;
			}
		}

		// Generate paths if enabled
		if (this.options.generatePaths) {
			spec.paths = this.generatePaths(schemas);
		}

		// Add security schemes if needed
		if (this.shouldIncludeAuth(schemas)) {
			spec.components.securitySchemes = this.generateSecuritySchemes();
		}

		return spec;
	}

	/**
	 * Generate API info section
	 */
	private generateInfo(): any {
		const info: any = {
			title: this.options.title,
			description: this.options.description,
			version: this.options.version,
		};

		if (Object.keys(this.options.contact).length > 0) {
			info.contact = this.options.contact;
		}

		if (this.options.license.name) {
			info.license = this.options.license;
		}

		return info;
	}

	/**
	 * Generate API paths from schemas
	 */
	private generatePaths(schemas: DocNode[]): any {
		const paths: any = {};

		for (const schema of schemas) {
			const resourceName = this.toResourceName(schema.name);

			// Determine if this is a request/response schema
			const isRequest = schema.name.toLowerCase().includes('request');
			const isResponse = schema.name.toLowerCase().includes('response');
			const isInput = schema.name.toLowerCase().includes('input');
			const isOutput = schema.name.toLowerCase().includes('output');

			// Generate CRUD endpoints for entity schemas
			if (!isRequest && !isResponse && !isInput && !isOutput) {
				// List endpoint: GET /resource
				paths[`${this.options.basePath}/${resourceName}`] = {
					get: this.generateGetListOperation(schema),
					post: this.generatePostOperation(schema),
				};

				// Single resource endpoints: GET/PUT/DELETE /resource/{id}
				paths[`${this.options.basePath}/${resourceName}/{id}`] = {
					get: this.generateGetOperation(schema),
					put: this.generatePutOperation(schema),
					delete: this.generateDeleteOperation(schema),
				};
			}

			// Generate endpoint from request/response pairs
			if (isRequest || isInput) {
				const endpoint = this.inferEndpoint(schema);
				if (endpoint) {
					paths[endpoint.path] = {
						[endpoint.method]: this.generateOperation(schema, endpoint),
					};
				}
			}
		}

		return paths;
	}

	/**
	 * Generate GET list operation
	 */
	private generateGetListOperation(schema: DocNode): any {
		return {
			summary: `List all ${this.pluralize(schema.name)}`,
			description: schema.description || `Retrieve a list of ${this.pluralize(schema.name)}`,
			tags: [this.getTag(schema)],
			parameters: [
				{
					name: 'limit',
					in: 'query',
					schema: { type: 'integer', default: 10 },
					description: 'Maximum number of items to return',
				},
				{
					name: 'offset',
					in: 'query',
					schema: { type: 'integer', default: 0 },
					description: 'Number of items to skip',
				},
			],
			responses: {
				'200': {
					description: 'Successful response',
					content: {
						'application/json': {
							schema: {
								type: 'array',
								items: { $ref: `#/components/schemas/${schema.name}` },
							},
						},
					},
				},
			},
		};
	}

	/**
	 * Generate POST operation
	 */
	private generatePostOperation(schema: DocNode): any {
		return {
			summary: `Create a new ${schema.name}`,
			description: schema.description || `Create a new ${schema.name} resource`,
			tags: [this.getTag(schema)],
			requestBody: {
				required: true,
				content: {
					'application/json': {
						schema: { $ref: `#/components/schemas/${schema.name}` },
					},
				},
			},
			responses: {
				'201': {
					description: 'Created successfully',
					content: {
						'application/json': {
							schema: { $ref: `#/components/schemas/${schema.name}` },
						},
					},
				},
				'400': {
					description: 'Invalid request',
				},
			},
		};
	}

	/**
	 * Generate GET single operation
	 */
	private generateGetOperation(schema: DocNode): any {
		return {
			summary: `Get a ${schema.name} by ID`,
			description: schema.description || `Retrieve a single ${schema.name} by its ID`,
			tags: [this.getTag(schema)],
			parameters: [
				{
					name: 'id',
					in: 'path',
					required: true,
					schema: { type: 'string' },
					description: `ID of the ${schema.name}`,
				},
			],
			responses: {
				'200': {
					description: 'Successful response',
					content: {
						'application/json': {
							schema: { $ref: `#/components/schemas/${schema.name}` },
						},
					},
				},
				'404': {
					description: 'Not found',
				},
			},
		};
	}

	/**
	 * Generate PUT operation
	 */
	private generatePutOperation(schema: DocNode): any {
		return {
			summary: `Update a ${schema.name}`,
			description: schema.description || `Update an existing ${schema.name}`,
			tags: [this.getTag(schema)],
			parameters: [
				{
					name: 'id',
					in: 'path',
					required: true,
					schema: { type: 'string' },
					description: `ID of the ${schema.name} to update`,
				},
			],
			requestBody: {
				required: true,
				content: {
					'application/json': {
						schema: { $ref: `#/components/schemas/${schema.name}` },
					},
				},
			},
			responses: {
				'200': {
					description: 'Updated successfully',
					content: {
						'application/json': {
							schema: { $ref: `#/components/schemas/${schema.name}` },
						},
					},
				},
				'404': {
					description: 'Not found',
				},
			},
		};
	}

	/**
	 * Generate DELETE operation
	 */
	private generateDeleteOperation(schema: DocNode): any {
		return {
			summary: `Delete a ${schema.name}`,
			description: `Delete an existing ${schema.name}`,
			tags: [this.getTag(schema)],
			parameters: [
				{
					name: 'id',
					in: 'path',
					required: true,
					schema: { type: 'string' },
					description: `ID of the ${schema.name} to delete`,
				},
			],
			responses: {
				'204': {
					description: 'Deleted successfully',
				},
				'404': {
					description: 'Not found',
				},
			},
		};
	}

	/**
	 * Generate operation from schema
	 */
	private generateOperation(schema: DocNode, endpoint: { path: string; method: string }): any {
		const operation: any = {
			summary: schema.metadata?.title || schema.name,
			description: schema.description || schema.metadata?.description,
			tags: [this.getTag(schema)],
		};

		// Add request body for POST/PUT/PATCH
		if (['post', 'put', 'patch'].includes(endpoint.method.toLowerCase())) {
			operation.requestBody = {
				required: true,
				content: {
					'application/json': {
						schema: { $ref: `#/components/schemas/${schema.name}` },
					},
				},
			};
		}

		// Add responses
		operation.responses = {
			'200': {
				description: 'Successful response',
			},
		};

		return operation;
	}

	/**
	 * Infer endpoint from schema name
	 */
	private inferEndpoint(schema: DocNode): { path: string; method: string } | null {
		const name = schema.name.toLowerCase();

		// Try to infer method from schema name
		if (name.includes('create') || name.includes('post')) {
			return {
				path: this.inferPath(schema),
				method: 'post',
			};
		}

		if (name.includes('update') || name.includes('put') || name.includes('patch')) {
			return {
				path: this.inferPath(schema),
				method: 'put',
			};
		}

		if (name.includes('delete')) {
			return {
				path: this.inferPath(schema),
				method: 'delete',
			};
		}

		if (name.includes('get') || name.includes('fetch') || name.includes('list')) {
			return {
				path: this.inferPath(schema),
				method: 'get',
			};
		}

		return null;
	}

	/**
	 * Infer path from schema name
	 */
	private inferPath(schema: DocNode): string {
		const resourceName = this.toResourceName(schema.name);
		return `${this.options.basePath}/${resourceName}`;
	}

	/**
	 * Convert schema name to resource name
	 */
	private toResourceName(name: string): string {
		return name
			.replace(/Schema$/, '')
			.replace(/Request$/, '')
			.replace(/Response$/, '')
			.replace(/Input$/, '')
			.replace(/Output$/, '')
			.replace(/([A-Z])/g, '-$1')
			.toLowerCase()
			.replace(/^-/, '')
			.replace(/--+/g, '-');
	}

	/**
	 * Pluralize resource name
	 */
	private pluralize(name: string): string {
		if (name.endsWith('s')) return name;
		if (name.endsWith('y')) return name.slice(0, -1) + 'ies';
		return name + 's';
	}

	/**
	 * Get tag from schema
	 */
	private getTag(schema: DocNode): string {
		return schema.metadata?.category || this.toResourceName(schema.name).replace(/-/g, ' ');
	}

	/**
	 * Check if auth should be included
	 */
	private shouldIncludeAuth(schemas: DocNode[]): boolean {
		return schemas.some(
			(s) =>
				s.name.toLowerCase().includes('auth') ||
				s.name.toLowerCase().includes('token') ||
				s.name.toLowerCase().includes('login'),
		);
	}

	/**
	 * Generate security schemes
	 */
	private generateSecuritySchemes(): any {
		return {
			bearerAuth: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				description: 'JWT Bearer token authentication',
			},
			apiKey: {
				type: 'apiKey',
				in: 'header',
				name: 'X-API-Key',
				description: 'API key authentication',
			},
		};
	}
}

/**
 * Generate OpenAPI 3.1 specification from documentation tree
 */
export function generateOpenAPI(tree: DocumentationTree, options?: OpenAPIOptions): any {
	const generator = new OpenAPIGenerator(options);
	return generator.generate(tree);
}
