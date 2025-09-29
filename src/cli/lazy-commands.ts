/**
 * @fileoverview Lazy-loading command system for tree-shaking optimization
 * @module LazyCommands
 *
 * This module provides lazy-loaded command handlers that are only imported
 * when the specific command is invoked, significantly reducing initial bundle size.
 */

import type { Command } from 'commander';

// === COMMAND TYPE DEFINITIONS ===

export type CommandHandler = (target?: any, options?: any, command?: Command) => Promise<any> | any;

export interface LazyCommandModule {
  default: CommandHandler;
  [key: string]: any;
}

// === LAZY COMMAND REGISTRY ===

export const LazyCommands = {
  // Analysis Commands
  analyze: () => import('./commands/analyze').then((m: any) => m.analyzeCommand),
  check: () => import('./commands/check').then((m: any) => m.checkCommand),

  // Generation Commands
  generate: () => import('./commands/generate').then((m: any) => m.generateCommand),
  scaffold: () => import('./commands/scaffold').then((m: any) => m.scaffoldCommand),
  mock: () => import('./commands/mock').then((m: any) => m.mockCommand),
  docs: () => import('./commands/docs').then((m: any) => m.docsCommand),

  // Testing Commands
  test: () => import('./commands/test').then((m: any) => m.testCommand),

  // Transformation Commands
  migrate: () => import('./commands/migrate').then((m: any) => m.migrateCommand),
  refactor: () => import('./commands/transform').then((m: any) => m.transformCommand), // consolidated into transform
  transform: () => import('./commands/transform').then((m: any) => m.transformCommand),
  compose: () => import('./commands/transform').then((m: any) => m.transformCommand), // consolidated into transform

  // Collaboration Commands
  collaborate: () => import('./commands/collaborate').then((m: any) => m.collaborateCommand),
  mcp: () => import('./commands/mcp').then((m: any) => m.mcpCommand),

  // Basic Commands
  init: () => import('./commands/init').then((m: any) => m.initCommand),
  fix: () => import('./commands/fix').then((m: any) => m.fixCommand),
  explain: () => import('./commands/explain').then((m: any) => m.explainCommand),
  sync: () => import('./commands/sync').then((m: any) => m.syncCommand),
  map: () => import('./commands/map').then((m: any) => m.mapCommand),

  // Dashboard (heavy component - definitely lazy load)
  dashboard: () => import('./commands/dashboard').then((m: any) => m.dashboardCommand),

  // Profile command (analysis alias)
  profile: () => import('./commands/analyze').then((m: any) => m.analyzeCommand), // use analyze instead

  // Setup command
  setup: () => import('./commands/setup').then((m: any) => m.setupCommand)
} as const;

// === LAZY COMMAND WRAPPER ===

/**
 * Creates a lazy-loading wrapper for command handlers
 */
export function createLazyCommand(
  commandName: keyof typeof LazyCommands,
  fallbackHandler?: CommandHandler
): CommandHandler {
  return async (target?: any, options?: any, command?: Command) => {
    try {
      const handler = await LazyCommands[commandName]();
      return await handler(target, options, command);
    } catch (error) {
      // Fallback to simple handler or show error
      if (fallbackHandler) {
        return await fallbackHandler(target, options, command);
      }

      console.error(`Failed to load command '${commandName}':`, error);
      console.log(`💡 Try running 'zodkit --help' to see available commands`);
      process.exit(1);
    }
  };
}

// === PERFORMANCE METRICS ===

let commandLoadTimes: Record<string, number> = {};

/**
 * Wrapper that tracks command load performance
 */
export function createPerformantLazyCommand(
  commandName: keyof typeof LazyCommands
): CommandHandler {
  return async (target?: any, options?: any, command?: Command) => {
    const startTime = Date.now();

    try {
      const handler = await LazyCommands[commandName]();
      const loadTime = Date.now() - startTime;
      commandLoadTimes[commandName] = loadTime;

      // Log slow loads in verbose mode
      const globalOpts = command?.parent?.opts() || {};
      if (globalOpts.verbose && loadTime > 100) {
        console.log(`⏱️  Command '${commandName}' loaded in ${loadTime}ms`);
      }

      return await handler(target, options, command);
    } catch (error) {
      console.error(`Failed to load command '${commandName}':`, error);
      process.exit(1);
    }
  };
}

/**
 * Get performance metrics for loaded commands
 */
export function getCommandLoadMetrics(): Record<string, number> {
  return { ...commandLoadTimes };
}

// === COMMAND PRELOADING ===

/**
 * Preload commonly used commands for better UX
 */
export async function preloadCoreCommands(): Promise<void> {
  const coreCommands: (keyof typeof LazyCommands)[] = ['check', 'analyze', 'init'];

  try {
    await Promise.all(
      coreCommands.map(async (cmd) => {
        await LazyCommands[cmd]();
      })
    );
  } catch {
    // Silent fail for preloading - commands will still work lazily
  }
}

export default LazyCommands;