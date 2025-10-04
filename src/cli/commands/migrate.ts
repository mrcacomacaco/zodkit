import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import * as pc from 'picocolors';
import { Project } from 'ts-morph';
import type { z } from 'zod';
import {
	DescribeToMetaMigrator,
	type MigrationOptions as DescribeToMetaOptions,
} from '../../core/migration/describe-to-meta';
import { SchemaTransformer } from '../../core/schema-transformation';

// Type definitions for migration
type MigrationType = 'breaking' | 'non-breaking' | 'additive';
type MigrationStrategy = 'versioned' | 'gradual' | 'immediate';
type RiskLevel = 'low' | 'medium' | 'high';
type MigrationStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

// Use SchemaTransformer for migration functionality
const SchemaMigrationAssistant = SchemaTransformer;
const _SchemaMigration = SchemaTransformer;

interface GlobalOptions {
	json?: boolean;
	quiet?: boolean;
}

interface MigrateOptions {
	from?: string;
	to?: string;
	schemaName?: string;
	name?: string;
	description?: string;
	version?: string;
	fromVersion?: string;
	strategy?: string;
	dryRun?: boolean;
	force?: boolean;
	autoRollback?: boolean;
	skipValidation?: boolean;
	interactive?: boolean;
	output?: string;
	format?: 'json' | 'console' | 'table' | 'detailed' | 'report';
	plan?: boolean;
	analyze?: boolean;
	validate?: boolean;
	execute?: boolean;
	rollback?: boolean;
	status?: string;
	riskLevel?: string;
	limit?: number;
	offset?: number;
	environment?: string;
	executedBy?: string;
	reason?: string;
	watch?: boolean;
	report?: boolean;
	export?: string;
	import?: string;
	include?: string[];
	exclude?: string[];
}

export async function migrateCommand(
	action: string | undefined,
	options: MigrateOptions,
	command: Command,
): Promise<void> {
	const globalOpts = command.parent?.opts() ?? {};
	const _isJsonMode = (globalOpts as GlobalOptions)?.json ?? false;
	const assistant = new SchemaMigrationAssistant() as any; // SchemaTransformer doesn't take constructor args
	// No initialize method needed

	const isJsonMode = options.format === 'json';

	try {
		switch (action) {
			case 'describe-to-meta':
				await handleDescribeToMeta(options, isJsonMode);
				break;
			case 'create':
				await handleCreate(assistant, options, isJsonMode);
				break;
			case 'analyze':
				await handleAnalyze(assistant, options, isJsonMode);
				break;
			case 'validate':
				await handleValidate(assistant, options, isJsonMode);
				break;
			case 'execute':
				await handleExecute(assistant, options, isJsonMode);
				break;
			case 'rollback':
				await handleRollback(assistant, options, isJsonMode);
				break;
			case 'list':
				await handleList(assistant, options, isJsonMode);
				break;
			case 'show':
				await handleShow(assistant, options, isJsonMode);
				break;
			case 'status':
				await handleStatus(assistant, options, isJsonMode);
				break;
			case 'plan':
				await handlePlan(assistant, options, isJsonMode);
				break;
			case 'report':
				await handleReport(assistant, options, isJsonMode);
				break;
			case 'interactive':
				await handleInteractive(assistant, options);
				break;
			case 'watch':
				await handleWatch(assistant, options, isJsonMode);
				break;
			case 'export':
				await handleExport(assistant, options, isJsonMode);
				break;
			case 'import':
				await handleImport(assistant, options, isJsonMode);
				break;
			default:
				if (options.interactive) {
					await handleInteractive(assistant, options);
				} else {
					await showHelp();
				}
		}
	} catch (error) {
		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{ error: error instanceof Error ? error.message : 'Unknown error' },
					null,
					2,
				),
			);
		} else {
			console.error(pc.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
		}
		process.exit(1);
	}
}

/**
 * Handle describe-to-meta migration
 */
async function handleDescribeToMeta(options: MigrateOptions, isJsonMode: boolean): Promise<void> {
	const patterns = options.include || ['**/*.schema.ts', '**/schemas/**/*.ts', '**/types/**/*.ts'];
	const basePath = process.cwd();

	if (!isJsonMode) {
		console.log(pc.blue('\n🔄 Describe-to-Meta Migration\n'));
		console.log(`${pc.gray('Scanning patterns:')} ${patterns.join(', ')}`);
	}

	// Initialize ts-morph project
	const project = new Project({
		tsConfigFilePath: path.join(basePath, 'tsconfig.json'),
		skipAddingFilesFromTsConfig: true,
	});

	// Add source files based on patterns
	const sourceFiles = project.addSourceFilesAtPaths(patterns);

	if (sourceFiles.length === 0) {
		if (!isJsonMode) {
			console.log(pc.yellow('No TypeScript files found matching patterns.'));
		}
		return;
	}

	if (!isJsonMode) {
		console.log(
			`${pc.gray('Found')} ${pc.cyan(sourceFiles.length)} ${pc.gray('file(s) to analyze\n')}`,
		);
	}

	// Create migrator
	const migratorOptions: DescribeToMetaOptions = {
		inferMetadata: options.interactive ? undefined : true,
		generateExamples: false,
		addVersion: true,
		defaultVersion: options.version || '1.0.0',
		preserveOriginal: false,
	};

	const migrator = new DescribeToMetaMigrator(migratorOptions);

	// Migrate each file
	const allMigrations: any[] = [];
	const filesWithChanges: string[] = [];

	for (const sourceFile of sourceFiles) {
		const result = migrator.migrateFile(sourceFile);

		if (result.hasChanges) {
			allMigrations.push(result);
			filesWithChanges.push(result.filePath);

			if (!isJsonMode && !options.interactive) {
				console.log(pc.green(`✓ ${path.relative(basePath, result.filePath)}`));
				for (const migration of result.migrations) {
					console.log(
						`  ${pc.gray('→')} ${migration.schemaName}: ${migration.originalDescribe} → ${migration.newMeta.split('\n')[0]}...`,
					);
				}
			}
		}
	}

	if (allMigrations.length === 0) {
		if (!isJsonMode) {
			console.log(pc.yellow('\nNo .describe() calls found to migrate.'));
			console.log(pc.gray('All schemas are already using .meta() or have no descriptions.'));
		}
		return;
	}

	// Interactive mode - show preview and ask for confirmation
	if (options.interactive && !isJsonMode) {
		console.log(pc.blue(`\n📊 Migration Summary\n`));
		console.log(`${pc.gray('Files to update:')} ${pc.cyan(allMigrations.length)}`);
		console.log(
			`${pc.gray('Total migrations:')} ${pc.cyan(allMigrations.reduce((sum, r) => sum + r.migrationsCount, 0))}\n`,
		);

		// Show detailed preview
		for (const result of allMigrations) {
			console.log(pc.blue(`\n📄 ${path.relative(basePath, result.filePath)}`));

			for (const migration of result.migrations) {
				console.log(`\n  ${pc.cyan(migration.schemaName)} (line ${migration.line})`);
				console.log(`  ${pc.red(`- ${migration.originalDescribe}`)}`);
				console.log(`  ${pc.green(`+ ${migration.newMeta}`)}`);

				if (migration.suggestions && migration.suggestions.length > 0) {
					console.log(`  ${pc.gray('Suggestions:')}`);
					for (const suggestion of migration.suggestions) {
						console.log(
							`    ${pc.gray('•')} ${suggestion.type}: ${JSON.stringify(suggestion.value)} (${Math.round(suggestion.confidence * 100)}% confidence)`,
						);
					}
				}
			}
		}

		// Ask for confirmation
		const { proceed } = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'proceed',
				message: 'Apply these migrations?',
				default: true,
			},
		]);

		if (!proceed) {
			console.log(pc.yellow('\nMigration cancelled.'));
			return;
		}

		// Ask about enhancement options
		const { enhance } = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'enhance',
				message: 'Would you like to add enhanced metadata (examples, custom properties)?',
				default: false,
			},
		]);

		if (enhance) {
			await handleEnhancementPrompts(allMigrations, project);
		}
	}

	// Apply migrations if not dry-run
	if (!options.dryRun) {
		for (const result of allMigrations) {
			const sourceFile = project.getSourceFile(result.filePath);
			if (sourceFile) {
				migrator.applyMigrations(sourceFile, result.migrations);
			}
		}

		// Save all changes
		await project.save();

		if (!isJsonMode) {
			console.log(pc.green(`\n✅ Successfully migrated ${allMigrations.length} file(s)!`));
			console.log(
				`${pc.gray('Total schemas updated:')} ${pc.cyan(allMigrations.reduce((sum, r) => sum + r.migrationsCount, 0))}`,
			);
		}
	} else {
		if (!isJsonMode) {
			console.log(pc.yellow('\n🧪 Dry run complete - no files were modified.'));
		}
	}

	// JSON output
	if (isJsonMode) {
		console.log(
			JSON.stringify(
				{
					action: 'describe-to-meta',
					success: true,
					filesScanned: sourceFiles.length,
					filesWithChanges: allMigrations.length,
					totalMigrations: allMigrations.reduce((sum, r) => sum + r.migrationsCount, 0),
					dryRun: options.dryRun === true,
					migrations: allMigrations,
				},
				null,
				2,
			),
		);
	}
}

/**
 * Handle enhancement prompts for metadata
 */
async function handleEnhancementPrompts(migrations: any[], project: any): Promise<void> {
	console.log(pc.blue('\n✨ Enhanced Metadata Configuration\n'));

	for (const result of migrations) {
		for (const migration of result.migrations) {
			console.log(pc.cyan(`\n📝 ${migration.schemaName}`));
			console.log(
				pc.gray(
					`Current metadata: ${Object.keys(migration.newMeta.match(/\{([^}]+)\}/)?.[1] || '').length} fields`,
				),
			);

			const enhancements = await inquirer.prompt([
				{
					type: 'input',
					name: 'id',
					message: '  Unique ID (optional, e.g., user-profile-v1):',
					default: '',
				},
				{
					type: 'input',
					name: 'customTitle',
					message: '  Custom title (leave blank to keep inferred):',
					default: '',
				},
				{
					type: 'input',
					name: 'customCategory',
					message: '  Custom category (leave blank to keep inferred):',
					default: '',
				},
				{
					type: 'input',
					name: 'tags',
					message: '  Additional tags (comma-separated):',
					default: '',
				},
				{
					type: 'confirm',
					name: 'addExamples',
					message: '  Add example values?',
					default: false,
				},
			]);

			if (enhancements.addExamples) {
				const { exampleJson } = await inquirer.prompt([
					{
						type: 'editor',
						name: 'exampleJson',
						message: 'Enter example JSON (will open in editor):',
						default: '{\n  \n}',
					},
				]);

				try {
					const example = JSON.parse(exampleJson);
					migration.enhancedMetadata = {
						...migration.enhancedMetadata,
						examples: [example],
					};
				} catch (_error) {
					console.log(pc.yellow('  ⚠️  Invalid JSON, skipping example'));
				}
			}

			// Apply enhancements
			if (
				enhancements.id ||
				enhancements.customTitle ||
				enhancements.customCategory ||
				enhancements.tags
			) {
				const sourceFile = project.getSourceFile(result.filePath);
				if (sourceFile) {
					const varDecl = sourceFile.getVariableDeclaration(migration.schemaName);
					if (varDecl) {
						const initializer = varDecl.getInitializer();
						if (initializer) {
							// Parse existing .meta() call
							const metaMatch = initializer.getText().match(/\.meta\(\{([^}]+)\}\)/);
							if (metaMatch) {
								const metaContent = metaMatch[1];
								const metaLines = metaContent.split(',').map((line) => line.trim());

								// Build enhanced metadata
								const enhancedMeta: any = {};
								for (const line of metaLines) {
									const [key, value] = line.split(':').map((s) => s.trim());
									if (key && value) {
										enhancedMeta[key] = value.replace(/['"]/g, '');
									}
								}

								// Apply enhancements
								if (enhancements.id) enhancedMeta.id = `"${enhancements.id}"`;
								if (enhancements.customTitle) enhancedMeta.title = `"${enhancements.customTitle}"`;
								if (enhancements.customCategory)
									enhancedMeta.category = `"${enhancements.customCategory}"`;
								if (enhancements.tags) {
									const tags = enhancements.tags.split(',').map((t: string) => t.trim());
									enhancedMeta.tags = `[${tags.map((t) => `"${t}"`).join(', ')}]`;
								}
								if (migration.enhancedMetadata?.examples) {
									enhancedMeta.examples = JSON.stringify(migration.enhancedMetadata.examples);
								}

								// Format new .meta() call
								const metaEntries = Object.entries(enhancedMeta).map(
									([key, value]) => `  ${key}: ${value}`,
								);
								const newMetaCall = `.meta({\n${metaEntries.join(',\n')},\n})`;

								// Update migration
								migration.newMeta = newMetaCall;

								console.log(pc.green('  ✓ Enhanced metadata applied'));
							}
						}
					}
				}
			}
		}
	}

	console.log(pc.green('\n✅ All enhancements configured!'));
}

async function handleCreate(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (options.interactive) {
		await handleInteractiveCreate(assistant, options, isJsonMode);
		return;
	}

	if (!options.from || !options.to) {
		throw new Error('Both --from and --to schema files are required for migration creation');
	}

	const fromSchema = await loadSchemaFromFile(options.from);
	const toSchema = await loadSchemaFromFile(options.to);

	const createOptions: any = {
		schemaName: options.schemaName || path.basename(options.from, path.extname(options.from)),
		strategy: options.strategy as MigrationStrategy,
	};

	if (options.name !== undefined) {
		createOptions.name = options.name;
	}
	if (options.description !== undefined) {
		createOptions.description = options.description;
	}
	if (options.version !== undefined) {
		createOptions.version = options.version;
	}
	if (options.fromVersion !== undefined) {
		createOptions.fromVersion = options.fromVersion;
	}
	if (options.environment) {
		createOptions.environments = [options.environment];
	}

	if (options.analyze) {
		const analysis = await assistant.analyzeMigration(fromSchema, toSchema, {});

		if (isJsonMode) {
			console.log(JSON.stringify({ action: 'analyze', analysis }, null, 2));
		} else {
			displayAnalysisResult(analysis);

			const shouldContinue = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'continue',
					message: 'Continue with migration creation?',
					default: true,
				},
			]);

			if (!shouldContinue.continue) {
				console.log(pc.yellow('Migration creation cancelled.'));
				return;
			}
		}
	}

	const migration = await assistant.createMigration(fromSchema, toSchema, createOptions);

	if (isJsonMode) {
		console.log(
			JSON.stringify(
				{
					action: 'create',
					migration: {
						id: migration.id,
						name: migration.name,
						version: migration.version,
						type: migration.type,
						strategy: migration.strategy,
						riskLevel: migration.riskLevel,
						compatibility: migration.compatibility,
						operationsCount: migration.operations.length,
						created: migration.created,
					},
				},
				null,
				2,
			),
		);
	} else {
		console.log(pc.green('✓ Migration created successfully!'));
		displayMigrationSummary(migration);

		if (options.validate !== false) {
			console.log(pc.blue('\n🔍 Validating migration...'));
			await handleValidate(assistant, { ...options, name: migration.id }, false);
		}
	}
}

async function handleInteractiveCreate(
	assistant: any,
	_options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (isJsonMode) {
		throw new Error('Interactive mode is not available in JSON output mode');
	}

	console.log(pc.blue('\n🔄 Create Schema Migration\n'));

	const questions = [
		{
			type: 'input',
			name: 'fromSchema',
			message: 'Path to source schema file:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Source schema file not found';
				}
			},
		},
		{
			type: 'input',
			name: 'toSchema',
			message: 'Path to target schema file:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Target schema file not found';
				}
			},
		},
		{
			type: 'input',
			name: 'schemaName',
			message: 'Schema name:',
			validate: (input: string) => input.trim().length > 0 || 'Schema name is required',
		},
		{
			type: 'input',
			name: 'name',
			message: 'Migration name (optional):',
		},
		{
			type: 'input',
			name: 'description',
			message: 'Migration description:',
			validate: (input: string) =>
				input.trim().length >= 10 || 'Description must be at least 10 characters',
		},
		{
			type: 'input',
			name: 'version',
			message: 'Target version:',
			default: '1.1.0',
			validate: (input: string) =>
				/^\d+\.\d+\.\d+/.test(input) || 'Version must be in semver format',
		},
		{
			type: 'input',
			name: 'fromVersion',
			message: 'Source version:',
			default: '1.0.0',
			validate: (input: string) =>
				/^\d+\.\d+\.\d+/.test(input) || 'Version must be in semver format',
		},
		{
			type: 'list',
			name: 'strategy',
			message: 'Migration strategy:',
			choices: [
				{ name: 'Gradual - Rollout changes gradually', value: 'gradual' },
				{ name: 'Immediate - Apply changes immediately', value: 'immediate' },
				{
					name: 'Blue-Green - Deploy to parallel environment',
					value: 'blue-green',
				},
				{ name: 'Feature Flag - Behind feature flags', value: 'feature-flag' },
				{ name: 'Versioned - Multiple schema versions', value: 'versioned' },
			],
			default: 'gradual',
		},
		{
			type: 'confirm',
			name: 'analyze',
			message: 'Perform analysis before creation?',
			default: true,
		},
	];

	const answers = await inquirer.prompt(questions as any);

	console.log(pc.yellow('\n⏳ Loading schemas...\n'));

	const fromSchema = await loadSchemaFromFile(answers.fromSchema);
	const toSchema = await loadSchemaFromFile(answers.toSchema);

	if (answers.analyze) {
		console.log(pc.blue('🔍 Analyzing migration compatibility and impact...\n'));

		const analysis = await assistant.analyzeMigration(fromSchema, toSchema, {});
		displayAnalysisResult(analysis);

		const continueQuestion = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'continue',
				message: 'Continue with migration creation?',
				default: analysis.risk.overall !== 'extreme',
			},
		]);

		if (!continueQuestion.continue) {
			console.log(pc.yellow('Migration creation cancelled.'));
			return;
		}
	}

	console.log(pc.yellow('\n⏳ Creating migration...\n'));

	const migration = await assistant.createMigration(fromSchema, toSchema, {
		schemaName: answers.schemaName,
		name: answers.name,
		description: answers.description,
		version: answers.version,
		fromVersion: answers.fromVersion,
		strategy: answers.strategy,
	});

	console.log(pc.green('✨ Migration created successfully!\n'));
	displayMigrationSummary(migration);

	const nextActions = await inquirer.prompt([
		{
			type: 'checkbox',
			name: 'actions',
			message: 'What would you like to do next?',
			choices: [
				{ name: '🔍 Validate migration', value: 'validate' },
				{ name: '📊 Generate report', value: 'report' },
				{ name: '▶️  Execute migration (dry run)', value: 'dry-run' },
				{ name: '📋 View detailed operations', value: 'operations' },
			],
		},
	]);

	for (const action of nextActions.actions) {
		switch (action) {
			case 'validate':
				await handleValidate(assistant, { name: migration.id }, false);
				break;
			case 'report':
				await handleReport(assistant, { name: migration.id }, false);
				break;
			case 'dry-run':
				await handleExecute(assistant, { name: migration.id, dryRun: true }, false);
				break;
			case 'operations':
				displayMigrationOperations(migration);
				break;
		}
		console.log(); // Add spacing
	}
}

async function handleAnalyze(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.from || !options.to) {
		throw new Error('Both --from and --to schema files are required for analysis');
	}

	const fromSchema = await loadSchemaFromFile(options.from);
	const toSchema = await loadSchemaFromFile(options.to);

	const analysis = await assistant.analyzeMigration(fromSchema, toSchema, {
		includeDataAnalysis: true,
		performanceAnalysis: true,
		securityAnalysis: true,
		complianceCheck: true,
	});

	if (isJsonMode) {
		console.log(JSON.stringify({ action: 'analyze', analysis }, null, 2));
	} else {
		displayAnalysisResult(analysis);
	}
}

async function handleValidate(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.name) {
		throw new Error('Migration ID is required. Use --name option.');
	}

	const result = await assistant.validateMigration(options.name);

	if (isJsonMode) {
		console.log(JSON.stringify({ action: 'validate', result }, null, 2));
	} else {
		console.log(pc.blue(`\n🔍 Validation Results for ${result.migration.name}\n`));

		if (result.valid) {
			console.log(pc.green('✓ Migration is valid and ready for execution!'));
		} else {
			console.log(pc.red('✗ Migration has validation issues'));
		}

		if (result.issues.length > 0) {
			console.log(pc.red('\n❌ Issues:'));
			for (const issue of result.issues) {
				console.log(`  ${pc.red('•')} ${issue.message} (${issue.path})`);
				console.log(
					`    ${pc.gray('Type:')} ${issue.type}, ${pc.gray('Severity:')} ${issue.severity}`,
				);
			}
		}

		if (result.warnings.length > 0) {
			console.log(pc.yellow('\n⚠️  Warnings:'));
			for (const warning of result.warnings) {
				console.log(`  ${pc.yellow('•')} ${warning.message} (${warning.path})`);
				console.log(`    ${pc.gray('Suggestion:')} ${warning.suggestion}`);
			}
		}

		if (result.valid) {
			console.log(pc.green('\n✅ Migration validated successfully!'));
			console.log(`${pc.blue('Status:')} ${result.migration.status}`);
			console.log(`${pc.blue('Operations:')} ${result.migration.operations.length}`);
			console.log(`${pc.blue('Risk Level:')} ${getRiskLevelDisplay(result.migration.riskLevel)}`);
		}
	}
}

async function handleExecute(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.name) {
		throw new Error('Migration ID is required. Use --name option.');
	}

	const migration = await assistant.getMigration(options.name);
	if (!migration) {
		throw new Error(`Migration not found: ${options.name}`);
	}

	if (options.dryRun && !isJsonMode) {
		console.log(pc.blue(`\n🧪 Dry Run: ${migration.name}\n`));
		console.log(pc.yellow('This is a simulation - no changes will be applied.'));
	}

	if (!options.force && !options.dryRun && !isJsonMode) {
		console.log(pc.yellow('\n⚠️  Migration Execution Warning\n'));
		displayMigrationSummary(migration);

		const confirmation = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'proceed',
				message: `Execute migration "${migration.name}"?`,
				default: false,
			},
		]);

		if (!confirmation.proceed) {
			console.log(pc.yellow('Migration execution cancelled.'));
			return;
		}
	}

	const executeOptions: any = {
		dryRun: options.dryRun === true,
		force: options.force === true,
		autoRollback: options.autoRollback !== false,
		skipValidation: options.skipValidation === true,
	};

	if (options.executedBy !== undefined) {
		executeOptions.executedBy = options.executedBy;
	}
	if (options.environment !== undefined) {
		executeOptions.environment = options.environment;
	}

	try {
		if (!isJsonMode && !options.dryRun) {
			console.log(pc.blue('\n⏳ Executing migration...'));
		}

		const result = await assistant.executeMigration(options.name, executeOptions);

		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						action: 'execute',
						result: {
							success: result.success,
							migrationId: result.migration.id,
							executionTime: result.executionTime,
							operationsExecuted: result.operationsExecuted,
							dryRun: options.dryRun,
						},
					},
					null,
					2,
				),
			);
		} else {
			if (options.dryRun) {
				console.log(pc.green('✓ Dry run completed successfully!'));
				console.log(`${pc.blue('Operations simulated:')} ${result.operationsExecuted}`);
				console.log(`${pc.blue('Estimated time:')} ${formatDuration(result.executionTime)}`);
			} else {
				console.log(pc.green('✅ Migration executed successfully!'));
				console.log(`${pc.blue('Execution time:')} ${formatDuration(result.executionTime)}`);
				console.log(`${pc.blue('Operations completed:')} ${result.operationsExecuted}`);
				console.log(`${pc.blue('Status:')} ${result.migration.status}`);
			}
		}
	} catch (error) {
		if (!isJsonMode) {
			console.error(pc.red('\n❌ Migration execution failed!'));
			console.error(pc.red(error instanceof Error ? error.message : 'Unknown error'));

			if (options.autoRollback !== false) {
				console.log(pc.yellow('\n🔄 Attempting automatic rollback...'));
			}
		}
		throw error;
	}
}

async function handleRollback(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.name) {
		throw new Error('Migration ID is required. Use --name option.');
	}

	const migration = await assistant.getMigration(options.name);
	if (!migration) {
		throw new Error(`Migration not found: ${options.name}`);
	}

	if (!options.force && !isJsonMode) {
		console.log(pc.yellow('\n⚠️  Migration Rollback Warning\n'));
		console.log(`${pc.blue('Migration:')} ${migration.name}`);
		console.log(`${pc.blue('Current Status:')} ${migration.status}`);
		console.log(`${pc.blue('Risk Level:')} ${getRiskLevelDisplay(migration.riskLevel)}`);

		const confirmation = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'proceed',
				message: `Rollback migration "${migration.name}"?`,
				default: false,
			},
		]);

		if (!confirmation.proceed) {
			console.log(pc.yellow('Migration rollback cancelled.'));
			return;
		}

		if (options.reason) {
			const reasonInput = await inquirer.prompt([
				{
					type: 'input',
					name: 'reason',
					message: 'Reason for rollback:',
					validate: (input: string) => input.trim().length > 0 || 'Reason is required',
				},
			]);
			options.reason = reasonInput.reason;
		}
	}

	const rollbackOptions: any = {
		skipValidation: options.skipValidation === true,
		force: options.force === true,
	};

	if (options.reason !== undefined) {
		rollbackOptions.reason = options.reason;
	}
	if (options.executedBy !== undefined) {
		rollbackOptions.executedBy = options.executedBy;
	}

	try {
		if (!isJsonMode) {
			console.log(pc.blue('\n⏳ Rolling back migration...'));
		}

		const result = await assistant.rollbackMigration(options.name, rollbackOptions);

		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						action: 'rollback',
						result: {
							success: result.success,
							migrationId: result.migration.id,
							executionTime: result.executionTime,
							operationsExecuted: result.operationsExecuted,
						},
					},
					null,
					2,
				),
			);
		} else {
			console.log(pc.green('✅ Migration rolled back successfully!'));
			console.log(`${pc.blue('Rollback time:')} ${formatDuration(result.executionTime)}`);
			console.log(`${pc.blue('Operations executed:')} ${result.operationsExecuted}`);
			console.log(`${pc.blue('Status:')} ${result.migration.status}`);
		}
	} catch (error) {
		if (!isJsonMode) {
			console.error(pc.red('\n❌ Migration rollback failed!'));
			console.error(pc.red(error instanceof Error ? error.message : 'Unknown error'));
		}
		throw error;
	}
}

async function handleList(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	const listOptions: any = {
		status: options.status as MigrationStatus,
		riskLevel: options.riskLevel as RiskLevel,
		limit: options.limit || 20,
		offset: options.offset || 0,
	};

	if (options.schemaName !== undefined) {
		listOptions.schemaName = options.schemaName;
	}

	const migrations = await assistant.listMigrations(listOptions);

	if (isJsonMode) {
		console.log(
			JSON.stringify(
				{
					action: 'list',
					migrations: migrations.map((m) => ({
						id: m.id,
						name: m.name,
						schemaName: m.schemaName,
						version: m.version,
						type: m.type,
						strategy: m.strategy,
						status: m.status,
						riskLevel: m.riskLevel,
						compatibility: m.compatibility,
						created: m.created,
						executed: m.executed,
					})),
					total: migrations.length,
				},
				null,
				2,
			),
		);
	} else {
		if (migrations.length === 0) {
			console.log(pc.yellow('No migrations found.'));
			return;
		}

		console.log(pc.blue(`\n🔄 Migrations (${migrations.length})\n`));

		if (options.format === 'table') {
			console.table(
				migrations.map((m) => ({
					ID: `${m.id.substring(0, 12)}...`,
					Name: m.name,
					Schema: m.schemaName,
					Version: m.version,
					Type: m.type,
					Status: m.status,
					Risk: m.riskLevel,
					Created: m.created.toLocaleDateString(),
				})),
			);
		} else {
			for (const migration of migrations) {
				displayMigrationListItem(migration, options.format === 'detailed');
			}
		}
	}
}

async function handleShow(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.name) {
		throw new Error('Migration ID is required. Use --name option.');
	}

	const migration = await assistant.getMigration(options.name);
	if (!migration) {
		throw new Error(`Migration not found: ${options.name}`);
	}

	if (isJsonMode) {
		console.log(JSON.stringify({ action: 'show', migration }, null, 2));
	} else {
		displayMigrationDetails(migration);
	}
}

async function handleStatus(
	assistant: any,
	_options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	const migrations = await assistant.listMigrations({});

	const statusCounts = migrations.reduce(
		(counts, migration) => {
			counts[migration.status] = (counts[migration.status] || 0) + 1;
			return counts;
		},
		{} as Record<string, number>,
	);

	const riskCounts = migrations.reduce(
		(counts, migration) => {
			counts[migration.riskLevel] = (counts[migration.riskLevel] || 0) + 1;
			return counts;
		},
		{} as Record<string, number>,
	);

	if (isJsonMode) {
		console.log(
			JSON.stringify(
				{
					action: 'status',
					summary: {
						total: migrations.length,
						statusCounts,
						riskCounts,
					},
					migrations: migrations.map((m) => ({
						id: m.id,
						name: m.name,
						status: m.status,
						riskLevel: m.riskLevel,
					})),
				},
				null,
				2,
			),
		);
	} else {
		console.log(pc.blue('\n📊 Migration Status Overview\n'));

		console.log(`${pc.blue('Total Migrations:')} ${migrations.length}`);

		if (Object.keys(statusCounts).length > 0) {
			console.log(pc.blue('\n📈 By Status:'));
			for (const [status, count] of Object.entries(statusCounts)) {
				console.log(`  ${getStatusDisplay(status as MigrationStatus)} ${count}`);
			}
		}

		if (Object.keys(riskCounts).length > 0) {
			console.log(pc.blue('\n⚠️  By Risk Level:'));
			for (const [risk, count] of Object.entries(riskCounts)) {
				console.log(`  ${getRiskLevelDisplay(risk as RiskLevel)} ${count}`);
			}
		}

		const recentMigrations = migrations.slice(0, 5);
		if (recentMigrations.length > 0) {
			console.log(pc.blue('\n🕒 Recent Migrations:'));
			for (const migration of recentMigrations) {
				console.log(`  ${pc.gray('•')} ${migration.name} (${getStatusDisplay(migration.status)})`);
			}
		}
	}
}

async function handlePlan(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.from || !options.to) {
		throw new Error('Both --from and --to schema files are required for evolution planning');
	}

	const fromSchema = await loadSchemaFromFile(options.from);
	const toSchema = await loadSchemaFromFile(options.to);

	const planOptions: any = {
		name: options.name || 'Schema Evolution Plan',
		currentVersion: options.fromVersion || '1.0.0',
		targetVersion: options.version || '2.0.0',
	};

	if (options.description !== undefined) {
		planOptions.description = options.description;
	}

	const plan = await assistant.createEvolutionPlan(fromSchema, toSchema, planOptions);

	if (isJsonMode) {
		console.log(JSON.stringify({ action: 'plan', plan }, null, 2));
	} else {
		console.log(pc.blue(`\n📋 Evolution Plan: ${plan.name}\n`));
		console.log(`${pc.blue('Description:')} ${plan.description}`);
		console.log(`${pc.blue('Version:')} ${plan.currentVersion} → ${plan.targetVersion}`);
		console.log(`${pc.blue('Migrations:')} ${plan.migrations.length}`);
		console.log(`${pc.blue('Strategy:')} ${plan.strategy.approach}`);
		console.log(`${pc.blue('Rollout:')} ${plan.rolloutPlan.strategy}`);
		console.log(`${pc.blue('Total Duration:')} ${formatDuration(plan.timeline.totalDuration)}`);

		if (plan.timeline.phases.length > 0) {
			console.log(pc.blue('\n📅 Phases:'));
			for (const phase of plan.timeline.phases) {
				console.log(`  ${pc.gray('•')} ${phase.name}: ${phase.migrations.length} migrations`);
				console.log(
					`    ${pc.gray('Duration:')} ${phase.startDate.toLocaleDateString()} - ${phase.endDate.toLocaleDateString()}`,
				);
			}
		}
	}
}

async function handleReport(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.name) {
		throw new Error('Migration ID is required. Use --name option.');
	}

	const report = await assistant.generateMigrationReport(options.name);

	if (options.export) {
		const exportPath = options.export.endsWith('.json') ? options.export : `${options.export}.json`;
		await fs.writeFile(exportPath, JSON.stringify(report, null, 2));

		if (!isJsonMode) {
			console.log(pc.green(`✓ Report exported to ${exportPath}`));
		}
	}

	if (isJsonMode) {
		console.log(JSON.stringify({ action: 'report', report }, null, 2));
	} else {
		displayMigrationReport(report);
	}
}

async function handleInteractive(assistant: any, options: MigrateOptions): Promise<void> {
	console.log(pc.blue('\n🔄 Schema Migration Assistant\n'));

	while (true) {
		const action = await inquirer.prompt([
			{
				type: 'list',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ name: '🎨 Create New Migration', value: 'create' },
					{ name: '📋 List Migrations', value: 'list' },
					{ name: '🔍 Analyze Schema Changes', value: 'analyze' },
					{ name: '✅ Validate Migration', value: 'validate' },
					{ name: '▶️  Execute Migration', value: 'execute' },
					{ name: '🔄 Rollback Migration', value: 'rollback' },
					{ name: '📊 Migration Status', value: 'status' },
					{ name: '📋 Evolution Planning', value: 'plan' },
					{ name: '❌ Exit', value: 'exit' },
				],
			},
		]);

		switch (action.action) {
			case 'create':
				await handleInteractiveCreate(assistant, options, false);
				break;
			case 'list':
				await handleList(assistant, { format: 'detailed' }, false);
				break;
			case 'analyze':
				await handleInteractiveAnalyze(assistant);
				break;
			case 'validate':
				await handleInteractiveValidate(assistant);
				break;
			case 'execute':
				await handleInteractiveExecute(assistant);
				break;
			case 'rollback':
				await handleInteractiveRollback(assistant);
				break;
			case 'status':
				await handleStatus(assistant, {}, false);
				break;
			case 'plan':
				await handleInteractivePlan(assistant);
				break;
			case 'exit':
				return;
		}

		console.log(); // Add spacing between operations
	}
}

async function handleInteractiveAnalyze(assistant: any): Promise<void> {
	const schemas = await inquirer.prompt([
		{
			type: 'input',
			name: 'from',
			message: 'Path to source schema:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Schema file not found';
				}
			},
		},
		{
			type: 'input',
			name: 'to',
			message: 'Path to target schema:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Schema file not found';
				}
			},
		},
	]);

	await handleAnalyze(assistant, schemas, false);
}

async function handleInteractiveValidate(assistant: any): Promise<void> {
	const migrations = await assistant.listMigrations({});

	if (migrations.length === 0) {
		console.log(pc.yellow('No migrations available for validation.'));
		return;
	}

	const selection = await inquirer.prompt([
		{
			type: 'list',
			name: 'migrationId',
			message: 'Select migration to validate:',
			choices: migrations.map((m) => ({
				name: `${m.name} (${m.status})`,
				value: m.id,
			})),
		},
	]);

	await handleValidate(assistant, { name: selection.migrationId }, false);
}

async function handleInteractiveExecute(assistant: any): Promise<void> {
	const migrations = await assistant.listMigrations({ status: 'validated' });

	if (migrations.length === 0) {
		console.log(pc.yellow('No validated migrations available for execution.'));
		return;
	}

	const selection = await inquirer.prompt([
		{
			type: 'list',
			name: 'migrationId',
			message: 'Select migration to execute:',
			choices: migrations.map((m) => ({
				name: `${m.name} (${getRiskLevelDisplay(m.riskLevel)})`,
				value: m.id,
			})),
		},
		{
			type: 'confirm',
			name: 'dryRun',
			message: 'Perform dry run first?',
			default: true,
		},
	]);

	await handleExecute(
		assistant,
		{
			name: selection.migrationId,
			dryRun: selection.dryRun,
		},
		false,
	);
}

async function handleInteractiveRollback(assistant: any): Promise<void> {
	const migrations = await assistant.listMigrations({ status: 'completed' });

	if (migrations.length === 0) {
		console.log(pc.yellow('No completed migrations available for rollback.'));
		return;
	}

	const selection = await inquirer.prompt([
		{
			type: 'list',
			name: 'migrationId',
			message: 'Select migration to rollback:',
			choices: migrations.map((m) => ({
				name: `${m.name} (executed: ${m.executed?.toLocaleDateString()})`,
				value: m.id,
			})),
		},
		{
			type: 'input',
			name: 'reason',
			message: 'Reason for rollback:',
			validate: (input: string) => input.trim().length > 0 || 'Reason is required',
		},
	]);

	await handleRollback(
		assistant,
		{
			name: selection.migrationId,
			reason: selection.reason,
		},
		false,
	);
}

async function handleInteractivePlan(assistant: any): Promise<void> {
	const schemas = await inquirer.prompt([
		{
			type: 'input',
			name: 'from',
			message: 'Path to current schema:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Schema file not found';
				}
			},
		},
		{
			type: 'input',
			name: 'to',
			message: 'Path to target schema:',
			validate: async (input: string) => {
				try {
					await fs.access(input);
					return true;
				} catch {
					return 'Schema file not found';
				}
			},
		},
		{
			type: 'input',
			name: 'name',
			message: 'Evolution plan name:',
			default: 'Schema Evolution Plan',
		},
		{
			type: 'input',
			name: 'description',
			message: 'Plan description:',
			default: 'Automated schema evolution planning',
		},
	]);

	await handlePlan(assistant, schemas, false);
}

async function handleWatch(
	_assistant: any,
	_options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!isJsonMode) {
		console.log(pc.blue('👀 Watching for migration changes... (Press Ctrl+C to stop)'));
	}

	// Implementation would watch for migration files and status changes
	// This is a placeholder for the watch functionality
	setInterval(async () => {
		// Check for migration status changes
	}, 5000);
}

async function handleExport(
	assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	const migrations = await assistant.listMigrations({});
	const exportData = {
		migrations,
		exportedAt: new Date(),
		version: '1.0.0',
	};

	const exportPath = options.export || 'migrations-export.json';
	await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));

	if (isJsonMode) {
		console.log(
			JSON.stringify({ action: 'export', path: exportPath, count: migrations.length }, null, 2),
		);
	} else {
		console.log(pc.green(`✓ Exported ${migrations.length} migrations to ${exportPath}`));
	}
}

async function handleImport(
	_assistant: any,
	options: MigrateOptions,
	isJsonMode: boolean,
): Promise<void> {
	if (!options.import) {
		throw new Error('Import file path is required. Use --import option.');
	}

	const importData = JSON.parse(await fs.readFile(options.import, 'utf-8'));

	// Implementation would import migrations
	// This is a placeholder for the import functionality

	if (isJsonMode) {
		console.log(
			JSON.stringify(
				{
					action: 'import',
					path: options.import,
					count: importData.migrations?.length || 0,
				},
				null,
				2,
			),
		);
	} else {
		console.log(
			pc.green(
				`✓ Imported ${importData.migrations?.length || 0} migrations from ${options.import}`,
			),
		);
	}
}

// Helper functions
async function loadSchemaFromFile(filePath: string): Promise<z.ZodTypeAny> {
	try {
		const absolutePath = path.resolve(filePath);
		delete require.cache[absolutePath];
		const module = require(absolutePath);

		const schema =
			module.default ||
			module.schema ||
			Object.values(module).find((value: any) => value && typeof value.parse === 'function');

		if (!schema) {
			throw new Error(
				'No Zod schema found in the file. Export as default, named "schema", or ensure it has a parse method.',
			);
		}

		return schema as z.ZodTypeAny;
	} catch (error) {
		throw new Error(
			`Failed to load schema from ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

function displayAnalysisResult(analysis: any): void {
	console.log(pc.blue('🔍 Migration Analysis Results\n'));

	// Compatibility Analysis
	console.log(pc.blue('🔄 Compatibility:'));
	console.log(`  Level: ${getCompatibilityDisplay(analysis.compatibility.level)}`);
	console.log(`  Score: ${analysis.compatibility.score}/100`);

	if (analysis.compatibility.breakingChanges.length > 0) {
		console.log(`  Breaking Changes: ${pc.red(analysis.compatibility.breakingChanges.length)}`);
	}

	// Risk Analysis
	console.log(pc.blue('\n⚠️  Risk Assessment:'));
	console.log(`  Overall: ${getRiskLevelDisplay(analysis.risk.overall)}`);
	console.log(`  Probability: ${analysis.risk.probabilityScore}%`);
	console.log(`  Impact: ${analysis.risk.impactScore}%`);

	// Impact Analysis
	console.log(pc.blue('\n📊 Impact Analysis:'));
	console.log(`  Scope: ${analysis.impact.scope}`);
	console.log(`  Data Loss: ${analysis.impact.dataLoss}`);
	console.log(`  Performance Impact: ${analysis.impact.performanceImpact}`);
	console.log(`  Downtime: ${analysis.impact.downtime}`);

	// Recommendations
	if (analysis.recommendations.length > 0) {
		console.log(pc.blue('\n💡 Recommendations:'));
		for (const rec of analysis.recommendations.slice(0, 3)) {
			console.log(`  ${pc.gray('•')} ${rec.title} (${rec.priority} priority)`);
			console.log(`    ${pc.gray(rec.description)}`);
		}
	}

	// Estimations
	console.log(pc.blue('\n⏱️  Time Estimations:'));
	console.log(`  Development: ${formatDuration(analysis.estimations.development.likely)}`);
	console.log(`  Testing: ${formatDuration(analysis.estimations.testing.likely)}`);
	console.log(`  Deployment: ${formatDuration(analysis.estimations.deployment.likely)}`);
	console.log(
		`  Total: ${formatDuration(analysis.estimations.total.likely)} (${analysis.estimations.confidence}% confidence)`,
	);
}

function displayMigrationSummary(migration: any): void {
	console.log(`${pc.blue('ID:')} ${migration.id}`);
	console.log(`${pc.blue('Name:')} ${migration.name}`);
	console.log(`${pc.blue('Schema:')} ${migration.schemaName}`);
	console.log(`${pc.blue('Version:')} ${migration.fromVersion} → ${migration.version}`);
	console.log(`${pc.blue('Type:')} ${getMigrationTypeDisplay(migration.type)}`);
	console.log(`${pc.blue('Strategy:')} ${migration.strategy}`);
	console.log(`${pc.blue('Risk Level:')} ${getRiskLevelDisplay(migration.riskLevel)}`);
	console.log(`${pc.blue('Compatibility:')} ${getCompatibilityDisplay(migration.compatibility)}`);
	console.log(`${pc.blue('Operations:')} ${migration.operations.length}`);
	console.log(`${pc.blue('Status:')} ${getStatusDisplay(migration.status)}`);
	console.log(`${pc.blue('Created:')} ${migration.created.toLocaleDateString()}`);
}

function displayMigrationListItem(migration: any, detailed: boolean = false): void {
	console.log(`${pc.blue(migration.name)} ${pc.gray(`(${migration.id.substring(0, 8)}...)`)}`);
	console.log(`  ${pc.gray(migration.description || 'No description')}`);
	console.log(
		`  ${getStatusDisplay(migration.status)} • ${getRiskLevelDisplay(migration.riskLevel)} • ${migration.operations.length} operations`,
	);

	if (detailed) {
		console.log(`  ${pc.gray('Schema:')} ${migration.schemaName}`);
		console.log(`  ${pc.gray('Version:')} ${migration.fromVersion} → ${migration.version}`);
		console.log(`  ${pc.gray('Strategy:')} ${migration.strategy}`);
		console.log(`  ${pc.gray('Created:')} ${migration.created.toLocaleDateString()}`);
		if (migration.executed) {
			console.log(`  ${pc.gray('Executed:')} ${migration.executed.toLocaleDateString()}`);
		}
	}

	console.log();
}

function displayMigrationDetails(migration: any): void {
	console.log(pc.blue(`\n🔄 ${migration.name}\n`));

	console.log(`${pc.blue('ID:')} ${migration.id}`);
	console.log(`${pc.blue('Description:')} ${migration.description}`);
	console.log(`${pc.blue('Schema:')} ${migration.schemaName}`);
	console.log(`${pc.blue('Version:')} ${migration.fromVersion} → ${migration.version}`);
	console.log(`${pc.blue('Type:')} ${getMigrationTypeDisplay(migration.type)}`);
	console.log(`${pc.blue('Strategy:')} ${migration.strategy}`);
	console.log(`${pc.blue('Status:')} ${getStatusDisplay(migration.status)}`);
	console.log(`${pc.blue('Risk Level:')} ${getRiskLevelDisplay(migration.riskLevel)}`);
	console.log(`${pc.blue('Compatibility:')} ${getCompatibilityDisplay(migration.compatibility)}`);

	console.log(pc.blue('\n📋 Operations:'));
	if (migration.operations.length === 0) {
		console.log('  No operations defined');
	} else {
		for (const [index, op] of migration.operations.entries()) {
			console.log(`  ${index + 1}. ${op.type}: ${op.target}`);
			console.log(`     ${pc.gray(op.description)}`);
			console.log(
				`     Risk: ${getRiskLevelDisplay(op.risk)}, Compatibility: ${getCompatibilityDisplay(op.compatibility)}`,
			);
		}
	}

	if (migration.breakingChanges.length > 0) {
		console.log(pc.red('\n⚠️  Breaking Changes:'));
		for (const change of migration.breakingChanges) {
			console.log(`  ${pc.red('•')} ${change.field}: ${change.description}`);
			console.log(`    ${pc.gray('Impact:')} ${change.impact}`);
			console.log(`    ${pc.gray('Mitigation:')} ${change.mitigation}`);
		}
	}

	console.log(pc.blue('\n🔄 Rollback Plan:'));
	console.log(`  Strategy: ${migration.rollbackPlan.strategy}`);
	console.log(`  Operations: ${migration.rollbackPlan.operations.length}`);
	console.log(`  Estimated Time: ${formatDuration(migration.rollbackPlan.estimatedTime)}`);

	console.log(pc.blue('\n📊 Metadata:'));
	console.log(`  Estimated Duration: ${formatDuration(migration.metadata.estimatedDuration)}`);
	console.log(`  Complexity: ${migration.metadata.complexity}`);
	console.log(`  Confidence: ${migration.metadata.confidence}%`);
	console.log(`  Automation Level: ${migration.metadata.automationLevel}`);

	if (migration.executed) {
		console.log(pc.blue('\n⏱️  Execution Details:'));
		console.log(`  Executed: ${migration.executed.toLocaleDateString()}`);
		console.log(`  Executed By: ${migration.executedBy || 'Unknown'}`);
		if (migration.executionTime) {
			console.log(`  Execution Time: ${formatDuration(migration.executionTime)}`);
		}
	}
}

function displayMigrationOperations(migration: any): void {
	console.log(pc.blue(`\n📋 Operations for ${migration.name}\n`));

	if (migration.operations.length === 0) {
		console.log(pc.gray('No operations defined for this migration.'));
		return;
	}

	for (const [index, operation] of migration.operations.entries()) {
		console.log(`${pc.blue(`${index + 1}. ${operation.type}`)}`);
		console.log(`   ${pc.blue('Target:')} ${operation.target}`);
		console.log(`   ${pc.blue('Description:')} ${operation.description}`);
		console.log(`   ${pc.blue('Risk:')} ${getRiskLevelDisplay(operation.risk)}`);
		console.log(
			`   ${pc.blue('Compatibility:')} ${getCompatibilityDisplay(operation.compatibility)}`,
		);

		if (operation.before && operation.after) {
			console.log(`   ${pc.blue('Before:')} ${JSON.stringify(operation.before)}`);
			console.log(`   ${pc.blue('After:')} ${JSON.stringify(operation.after)}`);
		}

		if (operation.dependencies.length > 0) {
			console.log(`   ${pc.blue('Dependencies:')} ${operation.dependencies.join(', ')}`);
		}

		console.log();
	}
}

function displayMigrationReport(report: any): void {
	console.log(pc.blue(`\n📊 Migration Report: ${report.migration.name}\n`));

	console.log(`${pc.blue('Generated:')} ${report.generatedAt.toLocaleString()}`);
	console.log(`${pc.blue('Summary:')} ${report.summary}`);

	console.log(pc.blue('\n⚠️  Risk Assessment:'));
	console.log(report.riskAssessment);

	console.log(pc.blue('\n📊 Impact Analysis:'));
	console.log(report.impactAnalysis);

	console.log(pc.blue('\n⏱️  Timeline:'));
	console.log(report.timeline);

	if (report.recommendations.length > 0) {
		console.log(pc.blue('\n💡 Recommendations:'));
		for (const rec of report.recommendations) {
			console.log(`  ${pc.gray('•')} ${rec}`);
		}
	}

	if (report.approvals.length > 0) {
		console.log(pc.blue('\n✅ Approvals:'));
		for (const approval of report.approvals) {
			const status = approval.approved ? pc.green('✓') : pc.red('✗');
			console.log(`  ${status} ${approval.role}: ${approval.approver}`);
			if (approval.comments) {
				console.log(`    ${pc.gray(approval.comments)}`);
			}
		}
	}
}

// Display helper functions
function getMigrationTypeDisplay(type: MigrationType): string {
	const typeColors: Record<string, string> = {
		additive: pc.green(type),
		modification: pc.yellow(type),
		removal: pc.red(type),
		restructure: pc.magenta(type),
		breaking: pc.red(type),
		'non-breaking': pc.yellow(type),
		split: pc.cyan(type),
		merge: pc.blue(type),
		rename: pc.yellow(type),
		constraint: pc.yellow(type),
		'type-change': pc.red(type),
		mixed: pc.gray(type),
	};
	return typeColors[type] || type;
}

function getStatusDisplay(status: MigrationStatus): string {
	const statusColors: Record<string, string> = {
		planned: pc.blue('📋 planned'),
		validated: pc.green('✅ validated'),
		executing: pc.yellow('⏳ executing'),
		pending: pc.gray('⏸️  pending'),
		'in-progress': pc.yellow('⏳ in-progress'),
		completed: pc.green('✅ completed'),
		failed: pc.red('❌ failed'),
		'rolled-back': pc.yellow('🔄 rolled-back'),
		cancelled: pc.gray('❌ cancelled'),
		paused: pc.yellow('⏸️  paused'),
	};
	return statusColors[status] || status;
}

function getRiskLevelDisplay(risk: RiskLevel): string {
	const riskColors: Record<string, string> = {
		low: pc.green('🟢 low'),
		medium: pc.yellow('🟡 medium'),
		high: pc.yellow('🟠 high'),
		extreme: pc.red('🚨 extreme'),
	};
	return riskColors[risk] || risk;
}

function getCompatibilityDisplay(compatibility: string): string {
	const compatColors: Record<string, string> = {
		'fully-compatible': pc.green('✅ fully compatible'),
		'mostly-compatible': pc.yellow('⚠️  mostly compatible'),
		'partially-compatible': pc.yellow('🟠 partially compatible'),
		incompatible: pc.red('❌ incompatible'),
		unknown: pc.gray('❓ unknown'),
	};
	return compatColors[compatibility] || compatibility;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${Math.round(ms / 1000)}s`;
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
	return `${Math.round(ms / 3600000)}h`;
}

async function showHelp(): Promise<void> {
	console.log(pc.blue('\n🔄 Schema Migration Assistant\n'));

	console.log(pc.blue('Available Commands:'));
	console.log('  describe-to-meta  Migrate .describe() calls to .meta() with enhanced metadata');
	console.log('  create            Create new migration from schema changes');
	console.log('  analyze           Analyze compatibility and impact');
	console.log('  validate          Validate migration before execution');
	console.log('  execute           Execute migration (with optional dry-run)');
	console.log('  rollback          Rollback completed migration');
	console.log('  list              List all migrations');
	console.log('  show              Show detailed migration information');
	console.log('  status            Show migration status overview');
	console.log('  plan              Create evolution plan for complex changes');
	console.log('  report            Generate detailed migration report');
	console.log('  interactive       Interactive migration management');

	console.log(pc.blue('\nCommon Options:'));
	console.log('  --from         Source schema file path');
	console.log('  --to           Target schema file path');
	console.log('  --name         Migration ID or name');
	console.log('  --strategy     Migration strategy (gradual, immediate, etc.)');
	console.log('  --dry-run      Simulate execution without applying changes');
	console.log('  --force        Force execution without confirmations');
	console.log('  --format       Output format (json, console, table, detailed)');
	console.log('  --interactive  Enable interactive mode with prompts');
	console.log('  --include      File patterns to include (for describe-to-meta)');
	console.log('  --version      Default version for metadata (default: 1.0.0)');

	console.log(pc.blue('\nExamples:'));
	console.log('  zodkit migrate describe-to-meta --interactive');
	console.log('  zodkit migrate describe-to-meta --dry-run');
	console.log('  zodkit migrate describe-to-meta --include "src/**/*.ts"');
	console.log('  zodkit migrate create --from ./old-schema.ts --to ./new-schema.ts');
	console.log('  zodkit migrate analyze --from ./v1.ts --to ./v2.ts');
	console.log('  zodkit migrate execute --name mig_abc123 --dry-run');
	console.log('  zodkit migrate rollback --name mig_abc123 --reason "Critical bug"');
	console.log('  zodkit migrate interactive');

	console.log();
}
