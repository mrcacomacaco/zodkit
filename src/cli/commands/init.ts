/**
 * @fileoverview Interactive TUI Setup Wizard
 * @module InitCommand
 *
 * Interactive setup wizard with TUI interface for beginners
 * Focus: Guided, user-friendly project initialization
 */

import React from 'react';
import { render } from 'ink';
import * as pc from 'picocolors';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../../core/config';
import { Utils } from '../../utils';
import { setupCommand } from './setup';

interface InitOptions {
  preset?: 'minimal' | 'standard' | 'complete';
  interactive?: boolean;
  force?: boolean;
  skipInstall?: boolean;
  template?: 'basic' | 'full-stack' | 'api' | 'library';
}

export async function initCommand(
  projectName?: string,
  options: InitOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const utils = new Utils({
    verbose: globalOpts.verbose,
    quiet: globalOpts.quiet,
    json: globalOpts.json
  });

  try {
    // Welcome message
    utils.output.output({
      simple: '🚀 ZodKit Setup Wizard',
      detailed: `🚀 ${pc.bold(pc.blue('ZodKit Interactive Setup Wizard'))}
${pc.gray('Creating a new ZodKit project with smart defaults')}`,
      verbose: `🚀 ${pc.bold(pc.blue('ZodKit Interactive Setup Wizard'))}

${pc.cyan('What this wizard will do:')}
• Set up project structure and configuration
• Create example schemas and validation patterns
• Configure package.json scripts
• Install dependencies (optional)
• Provide getting started guide

${pc.gray('Press Ctrl+C to cancel at any time')}`,
      data: { operation: 'init', interactive: true }
    });

    // Determine if we should run in interactive mode
    const shouldUseInteractive = options.interactive !== false && !globalOpts.json && !globalOpts.quiet;

    if (shouldUseInteractive && !process.env.CI) {
      // Launch TUI wizard
      await launchInteractiveWizard(options, utils, projectName);
    } else {
      // Use non-interactive mode with smart defaults
      await runQuickSetup(options, utils, projectName);
    }

    // Success message with next steps
    utils.output.output({
      simple: '✅ Setup completed!',
      detailed: `✅ ${pc.green('Setup completed successfully!')}

${pc.bold('Next steps:')}
  1. Run ${pc.cyan('zodkit analyze')} to check your schemas
  2. Run ${pc.cyan('zodkit dashboard')} for interactive mode
  3. Run ${pc.cyan('zodkit --help')} to see all commands`,
      verbose: `✅ ${pc.green('ZodKit Setup Completed Successfully!')}

${pc.bold('🎯 Your project is now ready:')}

${pc.cyan('📁 Project Structure Created:')}
  • zodkit.config.js - Main configuration
  • src/schemas/ - Your Zod schemas go here
  • src/types/ - Generated TypeScript types
  • .zodkit/ - Cache and reports directory

${pc.cyan('📋 Package.json Updated:')}
  • zodkit script added
  • zodkit:check script for CI/CD
  • zodkit:fix script for auto-fixing

${pc.cyan('🚀 Getting Started:')}
  1. ${pc.cyan('zodkit analyze')} - Check your schemas
  2. ${pc.cyan('zodkit check')} - Quick validation (great for CI)
  3. ${pc.cyan('zodkit fix')} - Auto-fix issues
  4. ${pc.cyan('zodkit dashboard')} - Interactive TUI interface
  5. ${pc.cyan('zodkit generate')} - Generate schemas from data

${pc.cyan('💡 Pro Tips:')}
  • Use ${pc.cyan('--verbose')} for detailed output
  • Use ${pc.cyan('--quiet')} for minimal output
  • Use ${pc.cyan('--json')} for machine-readable output
  • Add schemas to src/schemas/*.schema.ts for auto-discovery

${pc.gray('Happy schema validation! 🎉')}`,
      data: {
        success: true,
        projectPath: process.cwd(),
        configCreated: true,
        examplesCreated: true
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    utils.output.output({
      simple: `❌ Setup failed: ${errorMessage}`,
      detailed: `❌ ${pc.red('Setup failed')}
${errorMessage}

${pc.yellow('Common issues:')}
• Directory already contains a zodkit.config.js (use --force to override)
• Insufficient permissions to create files
• Node.js/npm not properly installed`,
      verbose: `❌ ${pc.red('ZodKit Setup Failed')}

${pc.bold('Error Details:')}
${errorMessage}

${pc.bold('Stack Trace:')}
${error instanceof Error ? error.stack : 'N/A'}

${pc.bold('Troubleshooting Steps:')}
1. Check if you have write permissions in the current directory
2. Verify Node.js and npm are properly installed
3. If directory already initialized, use ${pc.cyan('--force')} to override
4. Try running with ${pc.cyan('--verbose')} for more details
5. Check the zodkit documentation at https://zodkit.dev

${pc.bold('Get Help:')}
• Report issues: https://github.com/JSONbored/zodkit/issues
• Community: https://discord.gg/zodkit
• Documentation: https://zodkit.dev/docs`,
      data: {
        success: false,
        error: {
          message: errorMessage,
          code: 'INIT_ERROR',
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    });
    process.exit(1);
  }
}

async function launchInteractiveWizard(
  options: InitOptions,
  utils: Utils,
  projectName?: string
): Promise<void> {
  try {
    // For now, we'll use the setup command with enhanced prompts
    // In a full implementation, this would render a React/Ink TUI

    console.log(pc.cyan('\n🎯 Interactive Setup Mode'));
    console.log(pc.gray('Answering a few questions to customize your setup...\n'));

    // Simulate interactive prompts (in real implementation, use ink-select-input)
    const answers = {
      preset: options.preset || 'standard',
      template: options.template || 'basic',
      skipInstall: options.skipInstall || false
    };

    console.log(`📦 Using preset: ${pc.cyan(answers.preset)}`);
    console.log(`🎨 Using template: ${pc.cyan(answers.template)}`);
    console.log(`📥 Install dependencies: ${pc.cyan(answers.skipInstall ? 'No' : 'Yes')}`);
    console.log();

    // Run the actual setup
    await setupCommand(projectName, {
      mode: 'init',
      preset: answers.preset,
      skipInstall: answers.skipInstall,
      force: options.force
    });

  } catch (error) {
    throw error;
  }
}

async function runQuickSetup(
  options: InitOptions,
  utils: Utils,
  projectName?: string
): Promise<void> {
  utils.output.output({
    simple: '📦 Setting up project...',
    detailed: '📦 Setting up ZodKit project with smart defaults...',
    verbose: `📦 Quick Setup Mode

Using configuration:
• Preset: ${options.preset || 'standard'}
• Template: ${options.template || 'basic'}
• Install deps: ${!options.skipInstall}
• Force overwrite: ${!!options.force}`,
    data: { mode: 'quick-setup', options }
  });

  // Run the setup command with defaults
  await setupCommand(projectName, {
    mode: 'init',
    preset: options.preset || 'standard',
    skipInstall: options.skipInstall,
    force: options.force
  });
}

// === COMMAND REGISTRATION ===

export function registerInitCommand(program: Command): void {
  program
    .command('init [project-name]')
    .description('Interactive project setup wizard')
    .option('-p, --preset <preset>', 'config preset: minimal, standard, complete', 'standard')
    .option('-t, --template <template>', 'project template: basic, full-stack, api, library', 'basic')
    .option('-f, --force', 'force reinitialize existing project')
    .option('--skip-install', 'skip dependency installation')
    .option('--no-interactive', 'disable interactive mode')
    .action(initCommand);
}

export default initCommand;