/**
 * @fileoverview Interactive schema builder command
 * @module CreateCommand
 *
 * Provides step-by-step interactive schema construction with:
 * - Field type selection
 * - Validation rules
 * - Live preview
 * - Code generation
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { confirm, input, Separator, select } from '@inquirer/prompts';
import * as pc from 'picocolors';
import { CreateOptionsSchema, validateCommandOptions } from '../../core/command-validation';
import { createErrorHandler } from '../../core/error-handler';
import { printSchemaPreview, SchemaPreviewValidator } from '../../core/schema-preview';

export interface CreateOptions {
	output?: string;
	name?: string;
	interactive?: boolean;
	template?: string;
	format?: 'text' | 'json';
}

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

/**
 * Available Zod field types
 */
const ZOD_TYPES = [
	{ name: 'String', value: 'string', description: 'Text value' },
	{ name: 'Number', value: 'number', description: 'Numeric value' },
	{ name: 'Boolean', value: 'boolean', description: 'True/false value' },
	{ name: 'Date', value: 'date', description: 'Date object' },
	{ name: 'Array', value: 'array', description: 'List of items' },
	{ name: 'Object', value: 'object', description: 'Nested object' },
	new Separator(),
	{ name: 'Email', value: 'email', description: 'Email address (validated)' },
	{ name: 'URL', value: 'url', description: 'URL (validated)' },
	{ name: 'UUID', value: 'uuid', description: 'UUID string' },
	new Separator(),
	{ name: 'Enum', value: 'enum', description: 'One of specific values' },
	{ name: 'Union', value: 'union', description: 'Multiple possible types' },
	{ name: 'Record', value: 'record', description: 'Key-value map' },
	{ name: 'Any', value: 'any', description: 'Any value (not recommended)' },
	{ name: 'Unknown', value: 'unknown', description: 'Unknown type (safer than any)' },
];

/**
 * Predefined schema templates
 */
const SCHEMA_TEMPLATES: Record<
	string,
	{ description: string; schema: Omit<SchemaDefinition, 'name'> }
> = {
	user: {
		description: 'User profile with authentication fields',
		schema: {
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
					description: 'Email address',
				},
				{
					name: 'username',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(3)', 'max(20)'],
					description: 'Username',
				},
				{
					name: 'password',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(8)', 'max(100)'],
					description: 'Password hash',
				},
				{
					name: 'firstName',
					type: 'string',
					optional: true,
					nullable: false,
					validations: [],
					description: 'First name',
				},
				{
					name: 'lastName',
					type: 'string',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Last name',
				},
				{
					name: 'avatar',
					type: 'url',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Avatar URL',
				},
				{
					name: 'createdAt',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Account creation date',
				},
				{
					name: 'updatedAt',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Last update date',
				},
			],
		},
	},
	product: {
		description: 'E-commerce product schema',
		schema: {
			description: 'Product schema for e-commerce',
			fields: [
				{
					name: 'id',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Product ID',
				},
				{
					name: 'name',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(200)'],
					description: 'Product name',
				},
				{
					name: 'description',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['max(2000)'],
					description: 'Product description',
				},
				{
					name: 'price',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['positive()', 'multipleOf(0.01)'],
					description: 'Price in dollars',
				},
				{
					name: 'category',
					type: 'string',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Product category',
				},
				{
					name: 'tags',
					type: 'array',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Product tags',
				},
				{
					name: 'inStock',
					type: 'boolean',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Stock availability',
				},
				{
					name: 'stockCount',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'nonnegative()'],
					description: 'Stock quantity',
				},
				{
					name: 'imageUrl',
					type: 'url',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Product image',
				},
			],
		},
	},
	post: {
		description: 'Blog post schema',
		schema: {
			description: 'Blog post schema',
			fields: [
				{
					name: 'id',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Post ID',
				},
				{
					name: 'title',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(200)'],
					description: 'Post title',
				},
				{
					name: 'slug',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(200)'],
					description: 'URL slug',
				},
				{
					name: 'content',
					type: 'string',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Post content',
				},
				{
					name: 'excerpt',
					type: 'string',
					optional: true,
					nullable: false,
					validations: ['max(500)'],
					description: 'Post excerpt',
				},
				{
					name: 'authorId',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Author ID',
				},
				{
					name: 'published',
					type: 'boolean',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Published status',
				},
				{
					name: 'publishedAt',
					type: 'date',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Publication date',
				},
				{
					name: 'tags',
					type: 'array',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Post tags',
				},
				{
					name: 'createdAt',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Creation date',
				},
				{
					name: 'updatedAt',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Update date',
				},
			],
		},
	},
	comment: {
		description: 'Comment schema',
		schema: {
			description: 'Comment schema',
			fields: [
				{
					name: 'id',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Comment ID',
				},
				{
					name: 'postId',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Post ID',
				},
				{
					name: 'authorId',
					type: 'uuid',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Author ID',
				},
				{
					name: 'content',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(2000)'],
					description: 'Comment text',
				},
				{
					name: 'parentId',
					type: 'uuid',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Parent comment ID',
				},
				{
					name: 'createdAt',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Creation date',
				},
			],
		},
	},
	address: {
		description: 'Physical address schema',
		schema: {
			description: 'Physical address schema',
			fields: [
				{
					name: 'street',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(200)'],
					description: 'Street address',
				},
				{
					name: 'city',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['min(1)', 'max(100)'],
					description: 'City',
				},
				{
					name: 'state',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['length(2)'],
					description: 'State code',
				},
				{
					name: 'zipCode',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['regex(^\\d{5}(-\\d{4})?$)'],
					description: 'ZIP code',
				},
				{
					name: 'country',
					type: 'string',
					optional: false,
					nullable: false,
					validations: ['length(2)'],
					description: 'Country code',
				},
			],
		},
	},
	apiResponse: {
		description: 'API response wrapper',
		schema: {
			description: 'Standard API response wrapper',
			fields: [
				{
					name: 'success',
					type: 'boolean',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Request success status',
				},
				{
					name: 'data',
					type: 'unknown',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Response data',
				},
				{
					name: 'error',
					type: 'string',
					optional: true,
					nullable: false,
					validations: [],
					description: 'Error message',
				},
				{
					name: 'code',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'min(100)', 'max(599)'],
					description: 'HTTP status code',
				},
				{
					name: 'timestamp',
					type: 'date',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Response timestamp',
				},
			],
		},
	},
	pagination: {
		description: 'Pagination metadata',
		schema: {
			description: 'Pagination metadata schema',
			fields: [
				{
					name: 'page',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'positive()'],
					description: 'Current page',
				},
				{
					name: 'pageSize',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'positive()'],
					description: 'Items per page',
				},
				{
					name: 'totalPages',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'nonnegative()'],
					description: 'Total pages',
				},
				{
					name: 'totalItems',
					type: 'number',
					optional: false,
					nullable: false,
					validations: ['int()', 'nonnegative()'],
					description: 'Total items',
				},
				{
					name: 'hasNext',
					type: 'boolean',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Has next page',
				},
				{
					name: 'hasPrevious',
					type: 'boolean',
					optional: false,
					nullable: false,
					validations: [],
					description: 'Has previous page',
				},
			],
		},
	},
};

/**
 * Validation options by type
 */
const VALIDATIONS_BY_TYPE: Record<string, Array<{ name: string; value: string }>> = {
	string: [
		{ name: 'Minimum length', value: 'min' },
		{ name: 'Maximum length', value: 'max' },
		{ name: 'Exact length', value: 'length' },
		{ name: 'Regex pattern', value: 'regex' },
		{ name: 'Starts with', value: 'startsWith' },
		{ name: 'Ends with', value: 'endsWith' },
		{ name: 'Contains', value: 'includes' },
		{ name: 'Trim whitespace', value: 'trim' },
		{ name: 'Lowercase', value: 'toLowerCase' },
		{ name: 'Uppercase', value: 'toUpperCase' },
	],
	number: [
		{ name: 'Minimum value', value: 'min' },
		{ name: 'Maximum value', value: 'max' },
		{ name: 'Greater than', value: 'gt' },
		{ name: 'Less than', value: 'lt' },
		{ name: 'Integer only', value: 'int' },
		{ name: 'Positive', value: 'positive' },
		{ name: 'Negative', value: 'negative' },
		{ name: 'Non-negative', value: 'nonnegative' },
		{ name: 'Non-positive', value: 'nonpositive' },
		{ name: 'Multiple of', value: 'multipleOf' },
	],
	array: [
		{ name: 'Minimum items', value: 'min' },
		{ name: 'Maximum items', value: 'max' },
		{ name: 'Exact length', value: 'length' },
		{ name: 'Non-empty', value: 'nonempty' },
	],
};

/**
 * Interactive schema creation command
 */
export async function createCommand(options: CreateOptions = {}): Promise<void> {
	try {
		// Validate inputs with Zod
		const validatedOptions = validateCommandOptions(CreateOptionsSchema, options, 'create');

		// Initialize real-time validator
		const validator = new SchemaPreviewValidator();

		console.log(pc.blue('✨ zodkit create - Interactive Schema Builder\n'));

		// Check if template is provided via CLI option
		let useTemplateValue: 'template' | 'scratch';
		if (validatedOptions.template) {
			useTemplateValue = 'template';
		} else {
			// Ask if user wants to use a template
			useTemplateValue = await select({
				message: 'How would you like to create your schema?',
				choices: [
					{ name: 'Start from a template', value: 'template' },
					{ name: 'Start from scratch', value: 'scratch' },
				],
			});
		}

		let schema: SchemaDefinition;

		if (useTemplateValue === 'template') {
			// Get template key (from option or interactive selection)
			let templateKey: string;
			if (validatedOptions.template) {
				templateKey = validatedOptions.template;
				if (!SCHEMA_TEMPLATES[templateKey]) {
					console.error(pc.red(`\n❌ Unknown template: ${templateKey}`));
					console.log(pc.gray(`Available templates: ${Object.keys(SCHEMA_TEMPLATES).join(', ')}`));
					process.exit(1);
				}
			} else {
				templateKey = await select({
					message: 'Choose a template:',
					choices: Object.entries(SCHEMA_TEMPLATES).map(([key, { description }]) => ({
						name: `${key.charAt(0).toUpperCase() + key.slice(1)} - ${description}`,
						value: key,
					})),
				});
			}

			const template = SCHEMA_TEMPLATES[templateKey];

			// Get schema name
			const schemaName =
				validatedOptions.name ??
				(await input({
					message: 'Schema name (PascalCase):',
					default: `${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)}Schema`,
					validate: (value) => {
						if (!value.trim()) return 'Schema name is required';
						if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
							return 'Schema name must be PascalCase (e.g., UserSchema, ApiResponse)';
						}
						return true;
					},
				}));

			schema = {
				name: schemaName,
				description: template.schema.description,
				fields: [...template.schema.fields],
			};

			console.log(pc.green(`\n✓ Template loaded with ${schema.fields.length} fields`));
			console.log(pc.gray('You can customize or add more fields next.\n'));

			// Show initial template preview
			const templateValidation = validator.validateSchema(schema);
			const templateCode = generateSchemaCode(schema);
			printSchemaPreview(schema, templateValidation, templateCode);

			// Ask if user wants to customize
			const customize = await confirm({
				message: 'Customize template fields?',
				default: false,
			});

			if (customize) {
				// Allow user to add more fields
				while (true) {
					const shouldAddField = await confirm({
						message: 'Add another field?',
						default: false,
					});

					if (!shouldAddField) {
						break;
					}

					const field = await buildField();
					schema.fields.push(field);
				}
			}
		} else {
			// Start from scratch
			// Get schema name
			const schemaName =
				validatedOptions.name ??
				(await input({
					message: 'Schema name (PascalCase):',
					default: 'MySchema',
					validate: (value) => {
						if (!value.trim()) return 'Schema name is required';
						if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
							return 'Schema name must be PascalCase (e.g., UserSchema, ApiResponse)';
						}
						return true;
					},
				}));

			// Get schema description
			const schemaDescription = await input({
				message: 'Schema description (optional):',
			});

			schema = {
				name: schemaName,
				description: schemaDescription ?? undefined,
				fields: [],
			};

			// Add fields interactively
			while (true) {
				console.log(
					pc.cyan(`\n${schema.fields.length > 0 ? 'Add another field?' : 'Add first field'}`),
				);

				const shouldAddField =
					schema.fields.length === 0 ||
					(await confirm({
						message: 'Add field?',
						default: true,
					}));

				if (!shouldAddField) {
					break;
				}

				const field = await buildField();
				schema.fields.push(field);

				// Real-time validation and preview
				const validation = validator.validateSchema(schema);
				const currentCode = generateSchemaCode(schema);

				// Show live preview after each field
				console.log('\n');
				printSchemaPreview(schema, validation, currentCode);

				// If there are errors, ask if user wants to fix
				if (!validation.valid) {
					const shouldContinue = await confirm({
						message: 'Schema has errors. Continue anyway?',
						default: false,
					});

					if (!shouldContinue) {
						// Remove the last field
						schema.fields.pop();
						console.log(pc.yellow('\n⚠️  Last field removed.'));
					}
				}
			}
		}

		if (schema.fields.length === 0) {
			console.log(pc.yellow('\n⚠️  No fields added. Creating empty object schema.'));
		}

		// Final validation and preview
		const finalValidation = validator.validateSchema(schema);
		const code = generateSchemaCode(schema);

		// JSON output mode
		if (validatedOptions.format === 'json') {
			const jsonOutput = {
				schema: {
					name: schema.name,
					description: schema.description,
					fields: schema.fields,
				},
				validation: finalValidation,
				code,
			};

			if (validatedOptions.output) {
				writeFileSync(resolve(validatedOptions.output), JSON.stringify(jsonOutput, null, 2));
				console.log(pc.green(`✅ Schema saved to ${validatedOptions.output}`));
			} else {
				console.log(JSON.stringify(jsonOutput, null, 2));
			}
			return;
		}

		// Show final preview
		console.log('\n');
		printSchemaPreview(schema, finalValidation, code);

		// If final schema is invalid, confirm before saving
		if (!finalValidation.valid) {
			const shouldProceed = await confirm({
				message: 'Schema has validation errors. Proceed with saving?',
				default: false,
			});

			if (!shouldProceed) {
				console.log(pc.yellow('\n⚠️  Schema creation cancelled.'));
				return;
			}
		}

		// Save to file
		const shouldSave = await confirm({
			message: 'Save to file?',
			default: true,
		});

		if (shouldSave) {
			const outputPath =
				validatedOptions.output ??
				(await input({
					message: 'Output file path:',
					default: `./schemas/${schema.name.toLowerCase()}.schema.ts`,
				}));

			const resolvedPath = resolve(outputPath);

			// Check if file exists
			if (existsSync(resolvedPath)) {
				const overwrite = await confirm({
					message: `File ${resolvedPath} exists. Overwrite?`,
					default: false,
				});

				if (!overwrite) {
					console.log(pc.yellow('\n⚠️  Cancelled. Schema not saved.'));
					return;
				}
			}

			// Ensure directory exists
			const dir = join(resolvedPath, '..');
			if (!existsSync(dir)) {
				const { mkdirSync } = await import('node:fs');
				mkdirSync(dir, { recursive: true });
			}

			writeFileSync(resolvedPath, code);
			console.log(pc.green(`\n✅ Schema saved to ${resolvedPath}`));

			// Next steps
			console.log(pc.blue('\n📌 Next steps:'));
			console.log(`  1. Import: ${pc.cyan(`import { ${schema.name} } from '${outputPath}'`)}`);
			console.log(`  2. Use: ${pc.cyan(`${schema.name}.parse(data)`)}`);
			console.log(`  3. Validate: ${pc.cyan('zodkit check')}`);
		} else {
			console.log(pc.yellow('\n⚠️  Schema not saved. Copy the code above if needed.'));
		}
	} catch (error) {
		// Handle user cancellation gracefully
		if (error instanceof Error && error.message.includes('User force closed')) {
			console.log(pc.yellow('\n\n⚠️  Cancelled by user.'));
			process.exit(0);
		}

		// Use standardized error handler for all other errors
		if (process.env.NODE_ENV === 'test') {
			throw error;
		}
		const errorHandler = createErrorHandler();
		errorHandler.handle(error, { command: 'create', timestamp: new Date() });
	}
}

/**
 * Build a single field interactively
 */
async function buildField(): Promise<SchemaField> {
	// Field name
	const fieldName = await input({
		message: 'Field name (camelCase):',
		validate: (value) => {
			if (!value.trim()) return 'Field name is required';
			if (!/^[a-z][a-zA-Z0-9]*$/.test(value)) {
				return 'Field name must be camelCase (e.g., userId, createdAt)';
			}
			return true;
		},
	});

	// Field type
	const fieldType = await select({
		message: 'Field type:',
		choices: ZOD_TYPES,
		pageSize: 15,
	});

	// Optional/nullable
	const optional = await confirm({
		message: 'Optional field?',
		default: false,
	});

	const nullable = await confirm({
		message: 'Nullable field?',
		default: false,
	});

	// Validations
	const validations: string[] = [];
	const availableValidations = VALIDATIONS_BY_TYPE[fieldType] || [];

	if (availableValidations.length > 0) {
		const addValidations = await confirm({
			message: 'Add validations?',
			default: false,
		});

		if (addValidations) {
			let addingValidations = true;
			while (addingValidations) {
				const validation = await select({
					message: 'Select validation:',
					choices: [...availableValidations, new Separator(), { name: 'Done', value: 'DONE' }],
				});

				if (validation === 'DONE') {
					addingValidations = false;
				} else {
					const validationValue = await getValidationValue(validation, fieldType);
					if (validationValue) {
						validations.push(validationValue);
						console.log(pc.green(`  ✓ Added: ${validationValue}`));
					}
				}
			}
		}
	}

	// Description
	const description = await input({
		message: 'Field description (optional):',
	});

	return {
		name: fieldName,
		type: fieldType,
		optional,
		nullable,
		validations,
		description: description ?? undefined,
	};
}

/**
 * Get validation value from user
 */
async function getValidationValue(validation: string, fieldType: string): Promise<string | null> {
	switch (validation) {
		case 'min': {
			const value = await input({
				message: fieldType === 'string' ? 'Minimum length:' : 'Minimum value:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `min(${value})`;
		}
		case 'max': {
			const value = await input({
				message: fieldType === 'string' ? 'Maximum length:' : 'Maximum value:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `max(${value})`;
		}
		case 'length': {
			const value = await input({
				message: 'Exact length:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `length(${value})`;
		}
		case 'gt': {
			const value = await input({
				message: 'Greater than:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `gt(${value})`;
		}
		case 'lt': {
			const value = await input({
				message: 'Less than:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `lt(${value})`;
		}
		case 'multipleOf': {
			const value = await input({
				message: 'Multiple of:',
				validate: (v) => (!Number.isNaN(Number(v)) ? true : 'Must be a number'),
			});
			return `multipleOf(${value})`;
		}
		case 'regex': {
			const pattern = await input({
				message: 'Regex pattern:',
				validate: (v) => {
					if (!v.trim()) return 'Pattern is required';
					try {
						new RegExp(v);
						return true;
					} catch {
						return 'Invalid regex pattern';
					}
				},
			});
			return `regex(/${pattern}/)`;
		}
		case 'startsWith': {
			const value = await input({ message: 'Starts with:' });
			return `startsWith('${value}')`;
		}
		case 'endsWith': {
			const value = await input({ message: 'Ends with:' });
			return `endsWith('${value}')`;
		}
		case 'includes': {
			const value = await input({ message: 'Includes:' });
			return `includes('${value}')`;
		}
		case 'int':
		case 'trim':
		case 'toLowerCase':
		case 'toUpperCase':
		case 'positive':
		case 'negative':
		case 'nonnegative':
		case 'nonpositive':
		case 'nonempty':
			return `${validation}()`;
		default:
			return null;
	}
}

/**
 * Generate Zod schema code
 */
function generateSchemaCode(schema: SchemaDefinition): string {
	const lines: string[] = [];

	lines.push("import { z } from 'zod';");
	lines.push('');

	if (schema.description) {
		lines.push(`/**`);
		lines.push(` * ${schema.description}`);
		lines.push(` */`);
	}

	lines.push(`export const ${schema.name} = z.object({`);

	if (schema.fields.length === 0) {
		lines.push('  // No fields defined');
	} else {
		schema.fields.forEach((field, index) => {
			const fieldCode = generateFieldCode(field);
			const comma = index < schema.fields.length - 1 ? ',' : '';

			if (field.description) {
				lines.push(`  /** ${field.description} */`);
			}

			lines.push(`  ${field.name}: ${fieldCode}${comma}`);
		});
	}

	lines.push('});');
	lines.push('');

	// Add type inference
	const typeName = schema.name.replace(/Schema$/, '');
	lines.push(`export type ${typeName} = z.infer<typeof ${schema.name}>;`);
	lines.push('');

	return lines.join('\n');
}

/**
 * Generate code for a single field
 */
function generateFieldCode(field: SchemaField): string {
	let code = '';

	// Base type
	switch (field.type) {
		case 'string':
			code = 'z.string()';
			break;
		case 'number':
			code = 'z.number()';
			break;
		case 'boolean':
			code = 'z.boolean()';
			break;
		case 'date':
			code = 'z.date()';
			break;
		case 'array':
			code = 'z.array(z.unknown())'; // TODO: Could ask for element type
			break;
		case 'object':
			code = 'z.object({})'; // TODO: Could ask for nested fields
			break;
		case 'email':
			code = 'z.string().email()';
			break;
		case 'url':
			code = 'z.string().url()';
			break;
		case 'uuid':
			code = 'z.string().uuid()';
			break;
		case 'enum':
			code = "z.enum(['value1', 'value2'])"; // TODO: Could ask for values
			break;
		case 'union':
			code = 'z.union([z.string(), z.number()])'; // TODO: Could ask for types
			break;
		case 'record':
			code = 'z.record(z.string(), z.unknown())'; // TODO: Could ask for key/value types
			break;
		case 'any':
			code = 'z.any()';
			break;
		case 'unknown':
			code = 'z.unknown()';
			break;
		default:
			code = 'z.unknown()';
	}

	// Add validations
	for (const validation of field.validations) {
		code += `.${validation}`;
	}

	// Add optional/nullable
	if (field.nullable) {
		code += '.nullable()';
	}
	if (field.optional) {
		code += '.optional()';
	}

	return code;
}
