/**
 * @fileoverview Smart TypeScript to Zod schema generator with pattern detection
 * @module ScaffoldCommand
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { watch } from 'chokidar';
import * as pc from 'picocolors';
import { ConfigManager } from '../../core/config';
import {
	type GeneratedSchema,
	type PatternDetector,
	ScaffoldEngine,
} from '../../core/schema-generation';

interface ScaffoldOptions {
	output?: string;
	watch?: boolean;
	interactive?: boolean;
	patterns?: boolean;
	preserveJsDoc?: boolean;
	refinements?: boolean;
	generics?: boolean;
	twoWay?: boolean;
	incremental?: boolean;
	importStyle?: 'named' | 'namespace' | 'auto';
	json?: boolean;
	quiet?: boolean;
	config?: string;
	dryRun?: boolean;
	customPatterns?: string;
}

export async function scaffoldCommand(
	inputFile: string | undefined,
	options: ScaffoldOptions,
): Promise<void> {
	try {
		// Validate input
		if (!inputFile) {
			if (!options.quiet && !options.json) {
				console.error(pc.red('❌ Error: Input file is required'));
				console.log(pc.gray('\nUsage: zodkit scaffold <input.ts> [options]'));
				console.log(pc.gray('       zodkit scaffold types.ts --output schemas.ts'));
				console.log(pc.gray('       zodkit scaffold types.ts --interactive'));
				console.log(pc.gray('       zodkit scaffold types.ts --watch'));
			}
			process.exit(1);
		}

		// Check if file exists
		if (!existsSync(inputFile)) {
			if (!options.quiet && !options.json) {
				console.error(pc.red(`❌ Error: File not found: ${inputFile}`));
			}
			process.exit(1);
		}

		if (!options.quiet && !options.json && !options.interactive) {
			console.log(
				pc.magenta('🏗️  zodkit scaffold') + pc.gray(' - Generating Zod schemas from TypeScript...'),
			);
		}

		// Load configuration
		const configManager = ConfigManager.getInstance();
		const _config = await configManager.loadConfig(options.config);

		// Load custom patterns if provided
		let _customPatterns: PatternDetector[] = [];
		if (options.customPatterns) {
			try {
				_customPatterns = JSON.parse(readFileSync(options.customPatterns, 'utf-8'));
			} catch (_error) {
				if (!options.quiet && !options.json) {
					console.warn(
						pc.yellow(`⚠ Warning: Could not load custom patterns from ${options.customPatterns}`),
					);
				}
			}
		}

		// Initialize scaffold engine (ScaffoldEngine doesn't take constructor args)
		const engine = new ScaffoldEngine() as any;

		// Launch interactive TUI if requested
		if (options.interactive) {
			const { ScaffoldDashboardUI } = await import('../ui/dashboard');
			const dashboard = new ScaffoldDashboardUI(engine) as any;
			await dashboard.start();
		} else if (options.watch) {
			await runWatchMode(engine, inputFile, options);
		} else {
			await runSingleGeneration(engine, inputFile, options);
		}

		// Exit successfully
		process.exit(0);
	} catch (error) {
		if (options.json) {
			console.log(
				JSON.stringify(
					{
						success: false,
						error: error instanceof Error ? error.message : String(error),
					},
					null,
					2,
				),
			);
		} else if (!options.quiet) {
			console.error(pc.red('❌ Error:'), error instanceof Error ? error.message : String(error));
		}
		process.exit(1);
	}
}

async function runSingleGeneration(
	engine: ScaffoldEngine,
	inputFile: string,
	options: ScaffoldOptions,
): Promise<void> {
	const startTime = Date.now();

	// Use the actual SchemaGenerator API
	const result = await engine.generate(inputFile, {
		type: 'scaffold',
		format: 'typescript',
		patterns: options.patterns !== false,
		strict: false,
		verbose: !options.quiet,
	});

	if (!result.success || !result.output) {
		if (!options.quiet && !options.json) {
			console.log(pc.yellow('⚠ No schemas found in the input file'));
			if (result.warnings.length > 0) {
				result.warnings.forEach(w => console.log(pc.gray(`  ${w}`)));
			}
		}
		return;
	}

	// Generate output
	const outputFile = options.output || inputFile.replace(/\.ts$/, '.schema.ts');
	const fullContent = result.output as string;

	// Output results
	if (options.json) {
		const output = {
			success: true,
			inputFile,
			outputFile: options.dryRun ? null : outputFile,
			metadata: result.metadata,
			warnings: result.warnings,
			duration: Date.now() - startTime,
		};
		console.log(JSON.stringify(output, null, 2));
	} else {
		// Display results
		if (!options.quiet) {
			console.log(pc.green(`\n✓ Generated schemas from ${inputFile}`));
			console.log(pc.gray(`  Output: ${outputFile}`));
			console.log(pc.gray(`  Lines: ${result.metadata.linesGenerated}`));
			console.log(pc.gray(`  Time: ${result.metadata.timeElapsed}ms`));
			if (result.warnings.length > 0) {
				console.log(pc.yellow(`\n⚠ Warnings:`));
				result.warnings.forEach(w => console.log(pc.gray(`  ${w}`)));
			}
		}

		// Write to file if not dry run
		if (!options.dryRun) {
			writeFileSync(outputFile, fullContent, 'utf-8');
			if (!options.quiet) {
				console.log(pc.green(`\n✨ Schemas generated successfully!`));
				console.log(pc.gray(`   Output: ${outputFile}`));
			}
		} else if (!options.quiet) {
			console.log(pc.yellow('\n📝 Dry run - no files were written'));
			console.log(pc.gray('\nGenerated content:'));
			console.log(pc.gray('─'.repeat(60)));
			console.log(fullContent);
			console.log(pc.gray('─'.repeat(60)));
		}
	}
}

async function runWatchMode(
	engine: ScaffoldEngine,
	inputFile: string,
	options: ScaffoldOptions,
): Promise<void> {
	if (!options.quiet && !options.json) {
		console.log(pc.yellow('👀 Watch mode enabled - monitoring for changes...'));
		console.log(pc.gray('Press Ctrl+C to exit\n'));
	}

	const outputFile = options.output || inputFile.replace(/\.ts$/, '.schema.ts');
	let isProcessing = false;

	const processFile = async () => {
		if (isProcessing) return;
		isProcessing = true;

		try {
			const schemas = (await (engine as any).scaffoldFile(inputFile)) as Map<
				string,
				GeneratedSchema
			>;

			if (schemas.size > 0) {
				const imports = (await (engine as any).generateImports(schemas)) as string;
				const schemaCode = generateSchemaCode(schemas);
				const fullContent = imports + schemaCode;

				if (!options.dryRun) {
					writeFileSync(outputFile, fullContent, 'utf-8');
				}

				if (options.json) {
					console.log(
						JSON.stringify({
							event: 'update',
							inputFile,
							outputFile,
							schemasCount: schemas.size,
							timestamp: new Date().toISOString(),
						}),
					);
				} else if (!options.quiet) {
					console.clear();
					console.log(pc.magenta('🏗️  zodkit scaffold') + pc.gray(' - Watch mode\n'));
					displayResults(schemas, inputFile, outputFile);
					console.log(pc.green(`\n✓ Updated ${outputFile}`));
					console.log(pc.gray('\nWatching for changes... (Ctrl+C to exit)'));
				}
			}
		} catch (error) {
			if (!options.quiet && !options.json) {
				console.error(
					pc.red('Error processing file:'),
					error instanceof Error ? error.message : String(error),
				);
			}
		} finally {
			isProcessing = false;
		}
	};

	// Initial processing
	await processFile();

	// Watch for changes
	const watcher = watch(inputFile, {
		persistent: true,
		ignoreInitial: true,
	});

	watcher.on('change', processFile);

	// Keep process alive
	process.stdin.resume();
}

function generateSchemaCode(schemas: Map<string, GeneratedSchema>): string {
	const sortedSchemas = Array.from(schemas.entries()).sort((a, b) => {
		// Sort by dependency order when possible
		if ((a[1] as any).dependencies?.has(b[0])) return 1;
		if ((b[1] as any).dependencies?.has(a[0])) return -1;
		return a[0].localeCompare(b[0]);
	});

	return sortedSchemas
		.map(([_, schema]) => {
			let code = '';

			// Add JSDoc if available
			if ((schema as any).jsDoc) {
				code += `/**\n * ${(schema as any).jsDoc}\n */\n`;
			}

			// Add the schema code
			code += (schema as any).schema;

			return code;
		})
		.join('\n\n');
}

function displayResults(
	schemas: Map<string, GeneratedSchema>,
	inputFile: string,
	outputFile: string,
): void {
	console.log(pc.blue('\n📊 Generation Summary:'));
	console.log(pc.gray('─'.repeat(60)));

	// Stats
	const stats = {
		total: schemas.size,
		interfaces: Array.from(schemas.values()).filter((s: any) => s.sourceType === 'interface')
			.length,
		types: Array.from(schemas.values()).filter((s: any) => s.sourceType === 'type').length,
		enums: Array.from(schemas.values()).filter((s: any) => s.sourceType === 'enum').length,
		classes: Array.from(schemas.values()).filter((s: any) => s.sourceType === 'class').length,
		withGenerics: Array.from(schemas.values()).filter((s: any) => (s as any).hasGenerics).length,
		withPatterns: Array.from(schemas.values()).filter(
			(s: any) => (s as any).refinements?.length > 0,
		).length,
		withJsDoc: Array.from(schemas.values()).filter((s: any) => (s as any).jsDoc).length,
	};

	console.log(`  Input:  ${pc.cyan(path.basename(inputFile))}`);
	console.log(`  Output: ${pc.magenta(path.basename(outputFile))}`);
	console.log();
	console.log(`  Total Schemas: ${pc.bold(String(stats.total))}`);

	if (stats.interfaces > 0) {
		console.log(`    ${pc.cyan('◆')} Interfaces: ${stats.interfaces}`);
	}
	if (stats.types > 0) {
		console.log(`    ${pc.yellow('●')} Types: ${stats.types}`);
	}
	if (stats.enums > 0) {
		console.log(`    ${pc.green('▲')} Enums: ${stats.enums}`);
	}
	if (stats.classes > 0) {
		console.log(`    ${pc.blue('■')} Classes: ${stats.classes}`);
	}

	console.log();
	console.log(`  Features:`);
	if (stats.withGenerics > 0) {
		console.log(`    🧬 Generics: ${stats.withGenerics} schemas`);
	}
	if (stats.withPatterns > 0) {
		console.log(`    🎯 Pattern Detection: ${stats.withPatterns} schemas`);
	}
	if (stats.withJsDoc > 0) {
		console.log(`    📝 JSDoc Preserved: ${stats.withJsDoc} schemas`);
	}

	// List schemas
	console.log(pc.gray('\n─'.repeat(60)));
	console.log(pc.blue('Generated Schemas:'));

	for (const [name, schema] of schemas) {
		const s = schema as any;
		const typeIcon = getTypeIcon(s.sourceType);
		const typeColor = getTypeColor(s.sourceType);
		const colorFn = pc[typeColor as keyof typeof pc] as any;

		let line = `  ${typeIcon} ${colorFn(name)}`;

		if (s.hasGenerics) {
			line += pc.magenta(' <T>');
		}

		if (s.refinements && s.refinements.length > 0) {
			line += pc.green(` ✓ ${s.refinements.length} patterns`);
		}

		if (s.dependencies && s.dependencies.size > 0) {
			line += pc.gray(` → ${Array.from(s.dependencies).join(', ')}`);
		}

		console.log(line);
	}

	console.log(pc.gray('─'.repeat(60)));
}

function getTypeIcon(type: string): string {
	switch (type) {
		case 'interface':
			return pc.cyan('◆');
		case 'type':
			return pc.yellow('●');
		case 'enum':
			return pc.green('▲');
		case 'class':
			return pc.blue('■');
		default:
			return pc.white('○');
	}
}

function getTypeColor(type: string): keyof typeof pc {
	switch (type) {
		case 'interface':
			return 'cyan';
		case 'type':
			return 'yellow';
		case 'enum':
			return 'green';
		case 'class':
			return 'blue';
		default:
			return 'white';
	}
}
