/**
 * @fileoverview Enhanced Documentation Generation Command
 * @module DocsCommand
 *
 * Generates comprehensive documentation using the new documentation system:
 * - Markdown with TSDoc + .meta() support
 * - HTML with interactive search
 * - JSON Schema export
 * - OpenAPI 3.1 specification
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import * as pc from 'picocolors';
import { unifiedConfig } from '../../core/config';
import {
	createDocumentationTree,
	generateHTML,
	generateJSONSchema,
	generateMarkdown,
	generateOpenAPI,
} from '../../core/documentation';
import { Infrastructure } from '../../core/infrastructure';
import { Utils } from '../../utils';

export interface DocsOptions {
	/** Output directory */
	output?: string;
	/** Documentation format */
	format?: 'markdown' | 'html' | 'json-schema' | 'openapi' | 'all';
	/** Include patterns */
	include?: string[];
	/** Exclude patterns */
	exclude?: string[];
	/** Documentation title */
	title?: string;
	/** Group schemas by category */
	groupByCategory?: boolean;
	/** Include examples */
	includeExamples?: boolean;
	/** Validate examples */
	validateExamples?: boolean;
	/** Watch mode */
	watch?: boolean;
	/** Generate paths for OpenAPI */
	generatePaths?: boolean;
	/** OpenAPI servers */
	servers?: string[];
}

export async function docsCommand(options: DocsOptions = {}, command?: Command): Promise<void> {
	const globalOpts = command?.parent?.opts() || {};
	const isJsonMode = globalOpts.json;
	const isQuiet = globalOpts.quiet;

	const utils = new Utils();
	const logger = utils.logger;

	try {
		if (!isQuiet && !isJsonMode) {
			logger.info('📚 Generating schema documentation...');
		}

		const outputPath = options.output || './docs/schemas';
		const format = options.format || 'markdown';

		// Ensure output directory exists
		if (!existsSync(outputPath)) {
			mkdirSync(outputPath, { recursive: true });
		}

		// Initialize infrastructure
		const infraConfig = await unifiedConfig.getInfrastructureConfig();
		const infra = new Infrastructure(infraConfig);

		// Discover schemas
		const discovery = infra.discovery;
		const schemas = await discovery.findSchemas({
			basePath: process.cwd(),
			progressive: false,
		});

		if (schemas.length === 0) {
			if (!isQuiet && !isJsonMode) {
				logger.error('No Zod schemas found in the current directory.');
				logger.info('💡 Try:');
				logger.info('  • Run from a directory containing .schema.ts files');
				logger.info('  • Check if you have Zod schemas in: schemas/, types/, or models/');
			}
			throw new Error('No schemas found in project');
		}

		if (!isQuiet && !isJsonMode) {
			logger.info(`Found ${pc.cyan(schemas.length)} Zod schema${schemas.length !== 1 ? 's' : ''}`);
		}

		// Create documentation tree (cast schemas to ZodSchemaInfo for compatibility)
		const tree = createDocumentationTree(schemas as any, {
			groupByCategory: options.groupByCategory !== false,
			groupByPath: false,
			includeRelationships: true,
		});

		// Validate examples if requested
		if (options.validateExamples && !isJsonMode) {
			logger.info('🔍 Validating examples...');
			const validator = new (
				await import('../../core/documentation/example-validator')
			).ExampleValidator();

			let validExamples = 0;
			let invalidExamples = 0;

			tree.getSchemas().forEach((node) => {
				const results = validator.validateNode(node);
				results.forEach((result) => {
					if (result.valid) {
						validExamples++;
					} else {
						invalidExamples++;
						logger.error(`❌ ${result.schemaName}: Invalid example`);
						result.errors.forEach((error) => {
							logger.error(`   ${error.message}`);
						});
					}
				});
			});

			if (validExamples > 0 || invalidExamples > 0) {
				logger.info(
					`Examples: ${pc.green(`${validExamples} valid`)}, ${invalidExamples > 0 ? pc.red(`${invalidExamples} invalid`) : pc.gray('0 invalid')}`,
				);
			}
		}

		// Generate documentation based on format
		const stats = tree.getStats();
		if (!isQuiet && !isJsonMode) {
			logger.info(`Generating ${pc.cyan(format)} documentation...`);
		}

		switch (format) {
			case 'markdown':
				await generateMarkdownDocs(tree, outputPath, options, logger, isQuiet);
				break;

			case 'html':
				await generateHtmlDocs(tree, outputPath, options, logger, isQuiet);
				break;

			case 'json-schema':
				await generateJsonSchemaDocs(tree, outputPath, options, logger, isQuiet);
				break;

			case 'openapi':
				await generateOpenAPIDocs(tree, outputPath, options, logger, isQuiet);
				break;

			case 'all':
				await generateMarkdownDocs(tree, outputPath, options, logger, true);
				await generateHtmlDocs(tree, outputPath, options, logger, true);
				await generateJsonSchemaDocs(tree, outputPath, options, logger, true);
				await generateOpenAPIDocs(tree, outputPath, options, logger, true);
				if (!isQuiet) {
					logger.info('Generated all documentation formats');
				}
				break;

			default:
				throw new Error(`Unknown format: ${format}`);
		}

		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						success: true,
						outputPath,
						format,
						stats,
					},
					null,
					2,
				),
			);
		} else if (!isQuiet) {
			logger.info(`${pc.green('✅ Documentation generated in')} ${pc.cyan(outputPath)}`);
			logger.info(`📊 Stats: ${stats.schemaNodes} schemas, ${stats.categoryNodes} categories`);
		}

		process.exit(0);
	} catch (error) {
		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						success: false,
						error: {
							message: error instanceof Error ? error.message : String(error),
							code: 'DOCS_ERROR',
						},
					},
					null,
					2,
				),
			);
		} else {
			logger.error(
				'Documentation generation failed:',
				error instanceof Error ? error.message : String(error),
			);
		}
		process.exit(1);
	}
}

/**
 * Generate Markdown documentation
 */
async function generateMarkdownDocs(
	tree: any,
	outputPath: string,
	options: DocsOptions,
	logger: any,
	quiet: boolean,
): Promise<void> {
	const markdown = generateMarkdown(tree, {
		title: options.title || 'Schema Documentation',
		toc: true,
		includeExamples: options.includeExamples !== false,
		includeRelationships: true,
		includeMetadata: true,
	});

	const filePath = resolve(outputPath, 'README.md');
	writeFileSync(filePath, markdown, 'utf8');

	if (!quiet) {
		logger.info(`${pc.gray('→')} Markdown: ${pc.cyan('README.md')}`);
	}
}

/**
 * Generate HTML documentation
 */
async function generateHtmlDocs(
	tree: any,
	outputPath: string,
	options: DocsOptions,
	logger: any,
	quiet: boolean,
): Promise<void> {
	const html = generateHTML(tree, {
		title: options.title || 'Schema Documentation',
		theme: 'auto',
		includeSearch: true,
		includeSidebar: true,
	});

	const filePath = resolve(outputPath, 'index.html');
	writeFileSync(filePath, html, 'utf8');

	if (!quiet) {
		logger.info(`${pc.gray('→')} HTML: ${pc.cyan('index.html')}`);
	}
}

/**
 * Generate JSON Schema documentation
 */
async function generateJsonSchemaDocs(
	tree: any,
	outputPath: string,
	options: DocsOptions,
	logger: any,
	quiet: boolean,
): Promise<void> {
	const jsonSchemas = generateJSONSchema(tree, {
		version: '2020-12',
		includeIds: true,
		includeExamples: options.includeExamples !== false,
		includeDescriptions: true,
		format: 'multiple',
	});

	// Handle both single and multiple file outputs
	if (Array.isArray(jsonSchemas)) {
		for (const { schema, filePath, name } of jsonSchemas) {
			const outputFile = resolve(outputPath, filePath || `${name}.schema.json`);
			writeFileSync(outputFile, JSON.stringify(schema, null, 2), 'utf8');
		}
		if (!quiet) {
			logger.info(`${pc.gray('→')} JSON Schema: ${pc.cyan(`${jsonSchemas.length} files`)}`);
		}
	} else {
		const filePath = resolve(outputPath, 'schemas.json');
		writeFileSync(filePath, JSON.stringify(jsonSchemas.schema, null, 2), 'utf8');
		if (!quiet) {
			logger.info(`${pc.gray('→')} JSON Schema: ${pc.cyan('schemas.json')}`);
		}
	}
}

/**
 * Generate OpenAPI documentation
 */
async function generateOpenAPIDocs(
	tree: any,
	outputPath: string,
	options: DocsOptions,
	logger: any,
	quiet: boolean,
): Promise<void> {
	const servers = options.servers
		? options.servers.map((url) => ({ url, description: `Server: ${url}` }))
		: undefined;

	const openapi = generateOpenAPI(tree, {
		title: options.title || 'API Documentation',
		description: 'API documentation generated from Zod schemas',
		version: '1.0.0',
		servers,
		includeExamples: options.includeExamples !== false,
		generatePaths: options.generatePaths !== false,
	});

	const filePath = resolve(outputPath, 'openapi.json');
	writeFileSync(filePath, JSON.stringify(openapi, null, 2), 'utf8');

	if (!quiet) {
		logger.info(`${pc.gray('→')} OpenAPI: ${pc.cyan('openapi.json')}`);
	}
}

export default docsCommand;
