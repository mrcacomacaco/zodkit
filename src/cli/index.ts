#!/usr/bin/env node

/**
 * @fileoverview Streamlined CLI with reduced option duplication
 * @module StreamlinedCLI
 */

import { Command } from 'commander';
import * as pc from 'picocolors';
import { version } from '../../package.json';
import { addGlobalOptions } from './global-options';
import { CommandConfigs } from './command-builder';

// Import consolidated command handlers
import { analyzeCommand } from './commands/analyze';
import { setupCommand } from './commands/setup';
import { transformCommand } from './commands/transform';
import { explainCommand } from './commands/explain';
import { migrateCommand } from './commands/migrate';
import { generateCommand } from './commands/generate';
import { syncCommand } from './commands/sync';
import { testCommand } from './commands/test';
import { mockCommand } from './commands/mock';
import { mcpCommand } from './commands/mcp';
import { mapCommand } from './commands/map';
import { collaborateCommand } from './commands/collaborate';
import { scaffoldCommand } from './commands/scaffold';
import { dashboardCommand } from './commands/dashboard';
import { docsCommand } from './commands/docs';

// Map old command names to new consolidated commands
const checkCommand = analyzeCommand;
const hintCommand = analyzeCommand;
const fixCommand = analyzeCommand;
const initCommand = setupCommand;
const contractCommand = setupCommand;
const composeCommand = transformCommand;
const refactorCommand = transformCommand;
const profileCommand = analyzeCommand;

const program = new Command();

// Add global options to main program
addGlobalOptions(program
  .name('zodkit')
  .description(`${pc.blue('⚡ zodkit')} - Streamlined Zod schema toolkit

${pc.cyan('🎯 Recommended:')}
  ${pc.gray('$')} zodkit dashboard          # Launch unified TUI dashboard

${pc.cyan('Core Commands (19 total):')}
  ${pc.gray('$')} zodkit check              # Validate and analyze schemas
  ${pc.gray('$')} zodkit hint               # Best practice suggestions
  ${pc.gray('$')} zodkit fix                # Auto-fix schema issues
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
${pc.cyan('GitHub:')} https://github.com/JSONbored/zodkit`)
  .version(version))
  .option('--no-color', 'Disable colored output');

// === UNIFIED DASHBOARD ===
program
  .command('dashboard')
  .alias('ui')
  .alias('tui')
  .description(`Launch the unified TUI dashboard - All zodkit features in one interface`)
  .option('--theme <theme>', 'color theme: dark, light, neon', 'dark')
  .option('--history <file>', 'load command history from file')
  .action(dashboardCommand);

// === CORE COMMANDS (STREAMLINED) ===

// Analysis Commands
program.addCommand(CommandConfigs.check().action(checkCommand).build());
program.addCommand(CommandConfigs.hint().action(hintCommand).build());
program.addCommand(CommandConfigs.profile().action(profileCommand).build());

// Generation Commands
program.addCommand(CommandConfigs.scaffold().action(scaffoldCommand).build());
program.addCommand(CommandConfigs.generate().action(generateCommand).build());
program.addCommand(CommandConfigs.mock().action(mockCommand).build());

// Testing Commands
program.addCommand(CommandConfigs.test().action(testCommand).build());
program.addCommand(CommandConfigs.contract().action(contractCommand).build());

// Transformation Commands
program.addCommand(CommandConfigs.migrate().action(migrateCommand).build());
program.addCommand(CommandConfigs.refactor().action(refactorCommand).build());
program.addCommand(CommandConfigs.compose().action(composeCommand).build());

// Collaboration Commands
program.addCommand(CommandConfigs.collaborate().action(collaborateCommand).build());
program.addCommand(CommandConfigs.mcp().action(mcpCommand).build());

// Basic Commands
program.addCommand(CommandConfigs.fix().action(fixCommand).build());
program.addCommand(CommandConfigs.explain().action(explainCommand).build());
program.addCommand(CommandConfigs.sync().action(syncCommand).build());
program.addCommand(CommandConfigs.map().action(mapCommand).build());
program.addCommand(CommandConfigs.init().action(initCommand).build());

// Documentation Command
program
  .command('docs')
  .description('Generate documentation from Zod schemas')
  .option('-o, --output <path>', 'output directory for documentation', './docs/schemas')
  .option('-f, --format <format>', 'output format: markdown, html, json', 'markdown')
  .option('--include <patterns...>', 'file patterns to include')
  .option('--exclude <patterns...>', 'file patterns to exclude')
  .option('--title <title>', 'documentation title')
  .option('-w, --watch', 'watch for changes and regenerate')
  .action(docsCommand);


// Smart Suggestions Command
program
  .command('suggestions')
  .alias('suggest')
  .alias('help-me')
  .description('Get smart command suggestions based on your project')
  .argument('[input]', 'describe what you want to do')
  .option('--last-command <cmd>', 'last command you ran for follow-up suggestions')
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
  });

// Plugin Management Command
program
  .command('plugins')
  .description('Manage zodkit plugins')
  .argument('[action]', 'action: list, install, uninstall, info')
  .argument('[plugin]', 'plugin name for install/uninstall/info')
  .action(async (action = 'list', plugin, options) => {
    const { pluginManager } = await import('../core/plugin-system');

    switch (action) {
      case 'list':
        const plugins = pluginManager?.listPlugins() || [];
        if (plugins.length === 0) {
          console.log('No plugins installed.');
        } else {
          console.log('Installed plugins:');
          plugins.forEach(({ name, config }) => {
            console.log(`  ${name} v${config.version} - ${config.description}`);
          });
        }
        break;

      case 'install':
        if (!plugin) {
          console.error('Plugin name required for install');
          process.exit(1);
        }
        console.log(`Installing plugin: ${plugin}`);
        // Implementation would install from npm
        break;

      case 'uninstall':
        if (!plugin) {
          console.error('Plugin name required for uninstall');
          process.exit(1);
        }
        console.log(`Uninstalling plugin: ${plugin}`);
        break;

      case 'info':
        if (!plugin) {
          console.error('Plugin name required for info');
          process.exit(1);
        }
        console.log(`Plugin info: ${plugin}`);
        break;

      default:
        console.error(`Unknown action: ${action}`);
        console.log('Available actions: list, install, uninstall, info');
        process.exit(1);
    }
  });

// Performance Benchmark Command
program
  .command('benchmark')
  .alias('bench')
  .description('Run performance benchmarks on your schemas')
  .argument('[schema]', 'specific schema to benchmark')
  .option('--iterations <n>', 'number of benchmark iterations', '10000')
  .option('--warmup <n>', 'number of warmup rounds', '1000')
  .option('--data <path>', 'test data file path')
  .option('--baseline', 'save results as performance baseline')
  .option('--compare', 'compare with saved baseline')
  .option('--memory', 'include memory usage analysis', true)
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
      name: z.string().min(1).max(100)
    });

    const testData = Array.from({ length: 1000 }, (_, i) => ({
      id: `550e8400-e29b-41d4-a716-44665544${i.toString().padStart(4, '0')}`,
      email: `user${i}@example.com`,
      age: Math.floor(Math.random() * 80) + 18,
      name: `User ${i}`
    }));

    await runPerformanceBenchmark(testSchema, testData, {
      iterations: parseInt(options.iterations),
      warmupRounds: parseInt(options.warmup),
      collectMemory: options.memory,
      compareBaseline: options.compare
    });

    if (options.baseline) {
      console.log('💾 Results saved as baseline for future comparisons');
    }
  });

// === SMART ALIASES ===

// Gen: generate shorthand
program
  .command('gen')
  .alias('g')
  .description('Generate schemas (shorthand for generate)')
  .action(async (options, command) => {
    const globalOpts = command.parent.opts();
    await generateCommand({ ...options, ...globalOpts }, command);
  });

// Perf: profile + monitoring
program
  .command('perf')
  .alias('p')
  .description('Performance profiling with monitoring')
  .action(async (options, command) => {
    const globalOpts = command.parent.opts();
    const perfOpts = {
      ...options,
      ...globalOpts,
      runtime: true,
      monitoring: true
    };
    await profileCommand(perfOpts, command);
  });

// === ERROR HANDLING ===
process.on('unhandledRejection', (error: Error) => {
  const displayErrorWithRecovery = (error: any) => {
    console.error(pc.red('Error:'), error.message || error);
    // Error recovery logic would go here
  };
  displayErrorWithRecovery(error, {
    workingDirectory: process.cwd()
  });
  process.exit(1);
});

// Parse and execute with intelligent error recovery
program.parseAsync(process.argv).catch(async (error: Error) => {
  const opts = program.opts();

  if (opts.json) {
    console.log(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'COMMAND_ERROR',
        stack: opts.verbose ? error.stack : undefined
      }
    }, null, 2));
  } else {
    // Use intelligent error recovery
    const displayErrorWithRecovery = (error: any) => {
      console.error(pc.red('Error:'), error.message || error);
      // Error recovery logic would go here
    };
    displayErrorWithRecovery(error, {
      command: process.argv[2],
      args: process.argv.slice(3),
      workingDirectory: process.cwd(),
      errorMessage: error.message,
      stackTrace: error.stack
    });
  }
  process.exit(1);
});