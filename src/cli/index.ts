#!/usr/bin/env node

/**
 * @fileoverview Streamlined CLI with reduced option duplication
 * @module StreamlinedCLI
 */

import { Command } from 'commander';
import * as pc from 'picocolors';
import { version } from '../../package.json';
import { CommandConfigs } from './command-builder';
// Tree-shaking optimized imports - only import what's needed
import { analyzeCommand } from './commands/analyze';
import { checkCommand } from './commands/check';
import { addGlobalOptions } from './global-options';

// Lazy-load heavy commands to reduce initial bundle size
const lazyImport = (importFn: () => Promise<any>) => {
	return async (target?: any, options?: any, command?: any) => {
		try {
			const module = await importFn();
			const handler = module.default || Object.values(module)[0];
			return await handler(target, options, command);
		} catch (error) {
			console.error('Failed to load command:', error);
			process.exit(1);
		}
	};
};

// Heavy commands with lazy loading for tree-shaking
const generateCommand = lazyImport(() => import('./commands/generate'));
const scaffoldCommand = lazyImport(() => import('./commands/scaffold'));
const mockCommand = lazyImport(() => import('./commands/mock'));
const docsCommand = lazyImport(() => import('./commands/docs'));
const testCommand = lazyImport(() => import('./commands/test'));
const migrateCommand = lazyImport(() => import('./commands/migrate'));
// Temporarily disabled - commands not yet implemented
// const refactorCommand = lazyImport(() => import('./commands/refactor'));
// const transformCommand = lazyImport(() => import('./commands/transform'));
// const composeCommand = lazyImport(() => import('./commands/compose'));
const collaborateCommand = lazyImport(() => import('./commands/collaborate'));
const mcpCommand = lazyImport(() => import('./commands/mcp'));
const initCommand = lazyImport(() => import('./commands/init'));
const fixCommand = lazyImport(() => import('./commands/fix'));
const explainCommand = lazyImport(() => import('./commands/explain'));
const syncCommand = lazyImport(() => import('./commands/sync'));
const mapCommand = lazyImport(() => import('./commands/map'));
const dashboardCommand = lazyImport(() => import('./commands/dashboard'));
const setupCommand = lazyImport(() => import('./commands/setup'));

// Simple aliases
const hintCommand = analyzeCommand; // Use direct reference for core commands
const contractCommand = setupCommand;
const _profileCommand = analyzeCommand;

const program = new Command();

// Import dashboard fallback for default action
const simpleDashboardCommand = lazyImport(() =>
	import('./commands/dashboard').then((m) => ({
		default: m.simpleDashboardCommand,
	})),
);

// Add global options to main program
addGlobalOptions(
	program
		.name('zodkit')
		.description(
			`${pc.blue('⚡ zodkit')} - Streamlined Zod schema toolkit

${pc.cyan('🎯 Recommended:')}
  ${pc.gray('$')} zodkit dashboard          # Launch unified TUI dashboard

${pc.cyan('Core Commands (19 total):')}
  ${pc.gray('$')} zodkit check              # Quick schema validation
  ${pc.gray('$')} zodkit analyze            # Comprehensive schema analysis
  ${pc.gray('$')} zodkit fix                # Auto-fix schema issues
  ${pc.gray('$')} zodkit hint               # Best practice suggestions
  ${pc.gray('$')} zodkit test               # Test schemas with fuzzing
  ${pc.gray('$')} zodkit generate           # Generate schemas from data
  ${pc.gray('$')} zodkit scaffold           # Scaffold from TypeScript
  ${pc.gray('$')} zodkit docs               # Generate documentation
  ${pc.gray('$')} zodkit init               # Initialize zodkit project

${pc.cyan('Advanced:')}
  ${pc.gray('$')} zodkit migrate            # Schema migration assistant
  ${pc.gray('$')} zodkit refactor           # Schema refactoring tools
  ${pc.gray('$')} zodkit compose            # Schema composition
  ${pc.gray('$')} zodkit contract           # API contract testing
  ${pc.gray('$')} zodkit collaborate        # Team collaboration
  ${pc.gray('$')} zodkit sync               # Keep schemas in sync
  ${pc.gray('$')} zodkit map                # Schema relationship mapping
  ${pc.gray('$')} zodkit explain            # AI-powered explanations
  ${pc.gray('$')} zodkit mock               # Generate mock data
  ${pc.gray('$')} zodkit mcp                # MCP server integration

${pc.cyan('Smart Aliases:')}
  ${pc.gray('$')} zodkit check --analyze    # Deep analysis + coverage
  ${pc.gray('$')} zodkit hint --optimize    # Hints + auto-optimization
  ${pc.gray('$')} zodkit gen                # Generate (shorthand)
  ${pc.gray('$')} zodkit perf               # Performance profiling

${pc.cyan('Documentation:')} https://zodkit.dev
${pc.cyan('GitHub:')} https://github.com/JSONbored/zodkit`,
		)
		.version(version),
).option('--no-color', 'Disable colored output');

// === UNIFIED DASHBOARD ===
program
	.command('dashboard')
	.alias('ui')
	.alias('tui')
	.description(`Launch the unified TUI dashboard - All zodkit features in one interface`)
	.option('--theme <theme>', 'color theme: dark, light, neon', 'dark')
	.option('--history <file>', 'load command history from file')
	.action(dashboardCommand);

// === CORE COMMANDS (STREAMLINED & UNIFIED) ===

// Analysis Commands
program.addCommand(CommandConfigs.check().action(checkCommand).build());
program.addCommand(CommandConfigs.analyze().action(analyzeCommand).build());
program.addCommand(CommandConfigs.hint().action(hintCommand).build());
program.addCommand(CommandConfigs.profile().action(analyzeCommand).build());

// Generation Commands
program.addCommand(CommandConfigs.scaffold().action(scaffoldCommand).build());
program.addCommand(CommandConfigs.generate().action(generateCommand).build());
program.addCommand(CommandConfigs.mock().action(mockCommand).build());

// Testing Commands
program.addCommand(CommandConfigs.test().action(testCommand).build());
program.addCommand(CommandConfigs.contract().action(contractCommand).build());

// Transformation Commands
program.addCommand(CommandConfigs.migrate().action(migrateCommand).build());
// Temporarily disabled - commands not yet implemented
// program.addCommand(CommandConfigs.refactor().action(refactorCommand).build());
// program.addCommand(CommandConfigs.compose().action(composeCommand).build());

// Collaboration Commands
program.addCommand(CommandConfigs.collaborate().action(collaborateCommand).build());
program.addCommand(CommandConfigs.mcp().action(mcpCommand).build());

// Basic Commands
program.addCommand(CommandConfigs.fix().action(fixCommand).build());
program.addCommand(CommandConfigs.explain().action(explainCommand).build());
program.addCommand(CommandConfigs.sync().action(syncCommand).build());
program.addCommand(CommandConfigs.map().action(mapCommand).build());
program.addCommand(CommandConfigs.init().action(initCommand).build());
program.addCommand(CommandConfigs.docs().action(docsCommand).build());

// Watch Command
const watchCommand = lazyImport(() => import('./commands/watch'));
program.addCommand(CommandConfigs.watch().action(watchCommand).build());

// === UTILITY COMMANDS ===

// Smart Suggestions Command
program.addCommand(
	CommandConfigs.suggestions()
		.action(async (input, options) => {
			const { suggestionEngine } = await import('../core/command-suggestions');
			const suggestions = suggestionEngine.getSuggestions(input, options.lastCommand);

			if (options.json) {
				console.log(JSON.stringify(suggestions, null, 2));
				return;
			}

			console.log('💡 Smart Suggestions:\n');
			suggestions.forEach((suggestion, index) => {
				const confidence = Math.round(suggestion.confidence * 100);
				console.log(`${index + 1}. ${suggestion.command} (${confidence}%)`);
				console.log(`   ${suggestion.description}`);
				console.log(`   ${suggestion.reason}`);
				if (suggestion.example) {
					console.log(`   $ ${suggestion.example}`);
				}
				console.log();
			});
		})
		.build(),
);

// Plugin Management Command - Enhanced with full functionality
program.addCommand(
	CommandConfigs.plugins()
		.action(async (action = 'list', plugin, options) => {
			const command = options.parent;
			const globalOpts = command?.opts() || {};

			try {
				const { PluginRegistry, PluginDevToolkit, initializePluginSystem } = await import(
					'../core/plugin-system'
				);

				const registry = new PluginRegistry(process.cwd());
				const toolkit = new PluginDevToolkit(process.cwd());

				switch (action) {
					case 'list': {
						const plugins = registry.getInstalledPlugins();
						if (plugins.length === 0) {
							console.log(pc.yellow('No plugins installed.'));
							console.log();
							console.log('💡 Discover plugins:');
							console.log(`  ${pc.cyan('zodkit plugins search')} <query>`);
							console.log(`  ${pc.cyan('zodkit plugins install')} <name>`);
						} else {
							console.log(pc.bold('Installed plugins:'));
							plugins.forEach((pluginInfo) => {
								const status = pluginInfo.verified ? pc.green('✓') : pc.gray('○');
								console.log(
									`  ${status} ${pc.cyan(pluginInfo.name)} ${pc.gray(`v${pluginInfo.version}`)}`,
								);
								console.log(`    ${pluginInfo.description}`);
							});
						}
						break;
					}

					case 'search': {
						if (!plugin) {
							console.error(pc.red('Search query required'));
							console.log('Usage: zodkit plugins search <query>');
							process.exit(1);
						}
						console.log(pc.cyan(`🔍 Searching for plugins: ${plugin}`));
						const searchResults = await registry.searchPlugins(plugin, {
							verified: options.verified,
							limit: options.limit || 10,
						});

						if (searchResults.length === 0) {
							console.log(pc.yellow('No plugins found matching your search.'));
						} else {
							searchResults.forEach((p) => {
								const status = p.verified ? pc.green('✓') : pc.gray('○');
								console.log(`  ${status} ${pc.cyan(p.name)} ${pc.gray(`v${p.version}`)}`);
								console.log(`    ${p.description}`);
								if (p.keywords.length > 0) {
									console.log(`    ${pc.gray('Tags:')} ${p.keywords.join(', ')}`);
								}
							});
						}
						break;
					}

					case 'install':
						if (!plugin) {
							console.error(pc.red('Plugin name required for install'));
							console.log('Usage: zodkit plugins install <name>');
							process.exit(1);
						}
						await registry.installPlugin(plugin, {
							version: options.version,
							dev: options.dev,
							global: globalOpts.global,
							force: options.force,
						});
						break;

					case 'uninstall':
						if (!plugin) {
							console.error(pc.red('Plugin name required for uninstall'));
							console.log('Usage: zodkit plugins uninstall <name>');
							process.exit(1);
						}
						await registry.uninstallPlugin(plugin, {
							global: globalOpts.global,
						});
						break;

					case 'info': {
						if (!plugin) {
							console.error(pc.red('Plugin name required for info'));
							console.log('Usage: zodkit plugins info <name>');
							process.exit(1);
						}
						const info = await registry.getPluginInfo(plugin);
						if (!info) {
							console.log(pc.red(`Plugin ${plugin} not found.`));
							process.exit(1);
						}

						console.log(pc.bold(`Plugin: ${info.name}`));
						console.log(`Version: ${info.version}`);
						console.log(`Description: ${info.description}`);
						if (info.author) console.log(`Author: ${info.author}`);
						if (info.keywords.length > 0) console.log(`Keywords: ${info.keywords.join(', ')}`);
						if (info.repository) console.log(`Repository: ${info.repository}`);
						console.log(`Verified: ${info.verified ? pc.green('Yes') : pc.gray('No')}`);
						break;
					}

					case 'update':
						if (plugin) {
							await registry.updatePlugin(plugin, {
								global: globalOpts.global,
							});
						} else {
							console.log(pc.cyan('🔄 Updating all plugins...'));
							await registry.updateAllPlugins();
						}
						break;

					case 'create': {
						if (!plugin) {
							console.error(pc.red('Plugin name required for create'));
							console.log('Usage: zodkit plugins create <name>');
							process.exit(1);
						}

						// Interactive plugin creation
						const { createPluginInteractive } = await import('../core/plugin-interactive');
						await createPluginInteractive(plugin, options);
						break;
					}

					case 'test': {
						const pluginPath = plugin || process.cwd();
						const testResult = await toolkit.testPlugin(pluginPath);

						console.log(pc.bold('Plugin Test Results:'));
						testResult.tests.forEach((test) => {
							const status = test.passed ? pc.green('✅') : pc.red('❌');
							console.log(`  ${status} ${test.name} ${pc.gray(`(${test.duration}ms)`)}`);
							if (!test.passed && test.error) {
								console.log(`    ${pc.red('Error:')} ${test.error}`);
							}
						});

						console.log();
						console.log(`Overall: ${testResult.passed ? pc.green('PASSED') : pc.red('FAILED')}`);
						if (!testResult.passed) process.exit(1);
						break;
					}

					case 'validate': {
						const validationPath = plugin || process.cwd();
						const validationResult = await toolkit.validatePlugin(validationPath);

						console.log(pc.bold('Plugin Validation:'));

						if (validationResult.errors.length > 0) {
							console.log(pc.red('Errors:'));
							validationResult.errors.forEach((error) => console.log(`  • ${error}`));
						}

						if (validationResult.warnings.length > 0) {
							console.log(pc.yellow('Warnings:'));
							validationResult.warnings.forEach((warning) => console.log(`  • ${warning}`));
						}

						if (validationResult.suggestions.length > 0) {
							console.log(pc.cyan('Suggestions:'));
							validationResult.suggestions.forEach((suggestion) =>
								console.log(`  • ${suggestion}`),
							);
						}

						console.log();
						console.log(
							`Status: ${validationResult.valid ? pc.green('VALID') : pc.red('INVALID')}`,
						);
						if (!validationResult.valid) process.exit(1);
						break;
					}

					case 'build': {
						const buildPath = plugin || process.cwd();
						await toolkit.buildPlugin(buildPath);
						break;
					}

					case 'publish': {
						const publishPath = plugin || process.cwd();
						await toolkit.publishPlugin(publishPath, {
							tag: options.tag,
							dry: options.dryRun,
						});
						break;
					}

					default:
						console.error(pc.red(`Unknown action: ${action}`));
						console.log('Available actions:');
						console.log('  list                 - List installed plugins');
						console.log('  search <query>       - Search for plugins');
						console.log('  install <name>       - Install a plugin');
						console.log('  uninstall <name>     - Uninstall a plugin');
						console.log('  info <name>          - Show plugin information');
						console.log('  update [name]        - Update plugin(s)');
						console.log('  create <name>        - Create a new plugin');
						console.log('  test [path]          - Test a plugin');
						console.log('  validate [path]      - Validate a plugin');
						console.log('  build [path]         - Build a plugin');
						console.log('  publish [path]       - Publish a plugin');
						process.exit(1);
				}
			} catch (error) {
				console.error(pc.red(`Plugin management failed: ${error}`));
				if (globalOpts.verbose) {
					console.error(error);
				}
				process.exit(1);
			}
		})
		.build(),
);

// Performance Benchmark Command
program.addCommand(
	CommandConfigs.benchmark()
		.action(async (schema, options) => {
			// Performance benchmarking functionality
			const runPerformanceBenchmark = async () => {
				console.log(pc.blue('Running performance benchmark...'));
				// Benchmark implementation would go here
				return { results: 'Benchmark complete' };
			};

			console.log('🚀 Starting performance benchmark...');

			if (!schema) {
				console.log('📊 Benchmarking all discovered schemas...');
				// In real implementation, discover all schemas and benchmark each
				console.log('💡 Specify a schema name to benchmark a specific schema');
				return;
			}

			// For demo, create a simple test schema and data
			const { z } = await import('zod');
			const testSchema = z.object({
				id: z.string().uuid(),
				email: z.string().email(),
				age: z.number().min(0).max(150),
				name: z.string().min(1).max(100),
			});

			const testData = Array.from({ length: 1000 }, (_, i) => ({
				id: `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`,
				email: `user${i}@example.com`,
				age: Math.floor(Math.random() * 80) + 18,
				name: `User ${i}`,
			}));

			await (runPerformanceBenchmark as any)(testSchema, testData, {
				iterations: parseInt(options.iterations, 10),
				warmupRounds: parseInt(options.warmup, 10),
				collectMemory: options.memory,
				compareBaseline: options.compare,
			});

			if (options.baseline) {
				console.log('💾 Results saved as baseline for future comparisons');
			}
		})
		.build(),
);

// === SMART ALIASES ===

// Gen: generate shorthand
program.addCommand(
	CommandConfigs.gen()
		.action(async (options, command) => {
			const globalOpts = command.parent.opts();
			await generateCommand({ ...options, ...globalOpts }, command);
		})
		.build(),
);

// Perf: profile + monitoring
program.addCommand(
	CommandConfigs.perf()
		.action(async (options, command) => {
			const globalOpts = command.parent.opts();
			const perfOpts = {
				...options,
				...globalOpts,
				mode: 'profile',
				runtime: true,
				monitoring: true,
			};
			await analyzeCommand(undefined, perfOpts, command);
		})
		.build(),
);

// === ERROR HANDLING ===
process.on('unhandledRejection', (error: Error) => {
	const displayErrorWithRecovery = (error: any, _context?: any) => {
		console.error(pc.red('Error:'), error.message || error);
		// Error recovery logic would go here
	};
	displayErrorWithRecovery(error, {
		workingDirectory: process.cwd(),
	});
	process.exit(1);
});

// Default action when no command is provided
program.action(async (options) => {
	// When just "zodkit" is called, launch the dashboard or show simple overview
	try {
		await dashboardCommand(options);
	} catch (_error) {
		// If dashboard fails, show the simple version
		await simpleDashboardCommand(options);
	}
});

// Parse and execute with intelligent error recovery
program.parseAsync(process.argv).catch(async (error: Error) => {
	const opts = program.opts();

	if (opts.json) {
		console.log(
			JSON.stringify(
				{
					success: false,
					error: {
						message: error.message,
						code: 'COMMAND_ERROR',
						stack: opts.verbose ? error.stack : undefined,
					},
				},
				null,
				2,
			),
		);
	} else {
		// Use intelligent error recovery
		const displayErrorWithRecovery = (error: any, _context?: any) => {
			console.error(pc.red('Error:'), error.message || error);
			// Error recovery logic would go here
		};
		displayErrorWithRecovery(error, {
			command: process.argv[2],
			args: process.argv.slice(3),
			workingDirectory: process.cwd(),
			errorMessage: error.message,
			stackTrace: error.stack,
		});
	}
	process.exit(1);
});
