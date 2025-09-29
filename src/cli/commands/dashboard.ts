/**
 * @fileoverview Main Dashboard Command (zodkit without arguments)
 * @module DashboardCommand
 *
 * Launches the interactive TUI dashboard for ZodKit
 * Focus: Beginner-friendly main entry point
 */

import React from 'react';
import { render } from 'ink';
import * as pc from 'picocolors';
import { Command } from 'commander';
import { Dashboard } from '../ui/dashboard';
import { unifiedConfig } from '../../core/unified-config';
import { Infrastructure } from '../../core/infrastructure';
import { Utils } from '../../utils';

interface DashboardOptions {
  view?: 'main' | 'hint' | 'profile' | 'scaffold' | 'map' | 'check';
  theme?: 'dark' | 'light';
  compact?: boolean;
  json?: boolean;
}

export async function dashboardCommand(
  options: DashboardOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const isJsonMode = options.json || globalOpts.json;

  // JSON mode doesn't make sense for interactive TUI
  if (isJsonMode) {
    console.log(JSON.stringify({
      error: 'Dashboard command does not support JSON mode',
      suggestion: 'Use specific commands like "zodkit analyze --json" instead'
    }));
    process.exit(1);
  }

  const utils = new Utils();
  const logger = utils.logger;

  try {
    // Welcome message
    console.clear();
    console.log(pc.bold(pc.blue('🚀 ZodKit Interactive Dashboard')));
    console.log(pc.gray('Press Ctrl+C to exit at any time'));
    console.log();

    // Initialize systems in background
    const infraConfig = await unifiedConfig.getInfrastructureConfig();
    const infra = new Infrastructure(infraConfig);

    // Auto-discover schemas for dashboard context
    const schemas = await infra.discovery.autoDiscover();

    if (schemas.length === 0) {
      console.log(pc.yellow('⚠️  No Zod schemas found in current directory'));
      console.log();
      console.log('💡 To get started:');
      console.log('  • Create some .schema.ts files with Zod schemas');
      console.log('  • Place schemas in schemas/, types/, or models/ directories');
      console.log('  • Use "zodkit init" for guided setup');
      console.log();
      console.log('Press any key to continue to dashboard anyway...');

      // Wait for keypress
      await new Promise<void>((resolve) => {
        process.stdin.setRawMode(true);
        process.stdin.once('data', () => {
          process.stdin.setRawMode(false);
          resolve();
        });
      });
    } else {
      console.log(pc.green(`✅ Found ${schemas.length} Zod schema${schemas.length !== 1 ? 's' : ''}`));
      console.log();
    }

    // Launch TUI dashboard
    const dashboardConfig = {
      view: options.view || 'main',
      theme: options.theme || 'dark',
      compact: options.compact || false,
      interactive: true
    };

    const app = render(
      React.createElement(Dashboard, {
        initialView: dashboardConfig.view,
        config: dashboardConfig
      })
    );

    // Handle graceful shutdown
    const cleanup = () => {
      app.clear();
      app.unmount();
      console.log('\n👋 Thanks for using ZodKit!');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Wait for app to exit
    await app.waitUntilExit();

  } catch (error) {
    logger.error('Dashboard failed to start:', error instanceof Error ? error.message : String(error));

    // Fallback: show helpful CLI commands instead
    console.log('\n💡 Dashboard unavailable. Try these commands instead:');
    console.log(`  ${pc.cyan('zodkit analyze')}  - Analyze your schemas`);
    console.log(`  ${pc.cyan('zodkit check')}    - Quick validation`);
    console.log(`  ${pc.cyan('zodkit generate')} - Generate schemas or mocks`);
    console.log(`  ${pc.cyan('zodkit init')}     - Setup wizard`);

    process.exit(1);
  }
}

/**
 * Alternative simple dashboard launcher for when TUI isn't available
 */
export async function simpleDashboardCommand(
  options: DashboardOptions = {}
): Promise<void> {
  console.clear();
  console.log(pc.bold(pc.blue('🚀 ZodKit CLI')));
  console.log(pc.gray('Schema validation and analysis toolkit'));
  console.log();

  // Quick project analysis
  try {
    const infraConfig = await unifiedConfig.getInfrastructureConfig();
    const infra = new Infrastructure(infraConfig);
    const schemas = await infra.discovery.autoDiscover();

    console.log(`📊 Project Status:`);
    console.log(`  • Schemas found: ${pc.cyan(schemas.length)}`);

    if (schemas.length > 0) {
      const fileCount = new Set(schemas.map(s => s.filePath)).size;
      console.log(`  • Schema files: ${pc.cyan(fileCount)}`);

      // Show most common schema locations
      const dirs = schemas.map(s => s.filePath.split('/').slice(0, -1).join('/'));
      const dirCounts = dirs.reduce((acc, dir) => {
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topDir = Object.entries(dirCounts).sort((a, b) => b[1] - a[1])[0];
      if (topDir) {
        console.log(`  • Primary location: ${pc.gray(topDir[0])}`);
      }
    }

  } catch (error) {
    console.log(`  • ${pc.red('Error reading project')}: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log();
  console.log(`🛠️  Available Commands:`);
  console.log(`  ${pc.cyan('zodkit analyze')}   - Comprehensive schema analysis`);
  console.log(`  ${pc.cyan('zodkit check')}     - Quick validation check`);
  console.log(`  ${pc.cyan('zodkit fix')}       - Auto-fix schema issues`);
  console.log(`  ${pc.cyan('zodkit generate')}  - Generate schemas and mocks`);
  console.log(`  ${pc.cyan('zodkit init')}      - Project setup wizard`);
  console.log();
  console.log(`💡 Run any command with ${pc.cyan('--help')} for details`);
}