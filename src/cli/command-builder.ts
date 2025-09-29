/**
 * @fileoverview Command builder utility to streamline CLI commands
 * @module CommandBuilder
 */

import { Command } from 'commander';
import { addGlobalOptions, OptionGroups } from './global-options';

/**
 * Command categories for automatic option groups
 */
export type CommandCategory = 'analysis' | 'generation' | 'testing' | 'transformation' | 'collaboration' | 'basic';

/**
 * Streamlined command builder that automatically applies appropriate option groups
 */
export class CommandBuilder {
  private command: Command;
  private category: CommandCategory;

  constructor(name: string, description: string, category: CommandCategory = 'basic') {
    this.command = new Command(name);
    this.command.description(description);
    this.category = category;

    // Automatically apply appropriate option groups
    this.applyOptionGroups();
  }

  private applyOptionGroups(): void {
    switch (this.category) {
      case 'analysis':
        OptionGroups.analysis(this.command);
        break;
      case 'generation':
        OptionGroups.generation(this.command);
        break;
      case 'testing':
        OptionGroups.testing(this.command);
        break;
      case 'transformation':
        OptionGroups.transformation(this.command);
        break;
      case 'collaboration':
        OptionGroups.collaboration(this.command);
        break;
      default:
        // Basic commands get no extra option groups
        break;
    }
  }

  /**
   * Add an argument to the command
   */
  argument(flags: string, description?: string): CommandBuilder {
    this.command.argument(flags, description);
    return this;
  }

  /**
   * Add a specific option (only when truly unique to this command)
   */
  option(flags: string, description?: string, defaultValue?: any): CommandBuilder {
    this.command.option(flags, description, defaultValue);
    return this;
  }

  /**
   * Add an alias
   */
  alias(alias: string): CommandBuilder {
    this.command.alias(alias);
    return this;
  }

  /**
   * Set the action handler
   */
  action(handler: (...args: any[]) => void | Promise<void>): CommandBuilder {
    this.command.action(handler);
    return this;
  }

  /**
   * Get the built command
   */
  build(): Command {
    return this.command;
  }
}

/**
 * Create a streamlined command with automatic option groups
 */
export function createCommand(
  name: string,
  description: string,
  category: CommandCategory = 'basic'
): CommandBuilder {
  return new CommandBuilder(name, description, category);
}

/**
 * Common command examples for documentation
 */
export const CommandExamples = {
  analysis: (name: string) => `
${name}                     # Analyze all schemas
${name} UserSchema          # Analyze specific schema
${name} --coverage          # Include coverage analysis`,

  generation: (name: string) => `
${name} types.ts            # Generate from TypeScript
${name} --patterns          # Enable pattern detection
${name} --watch             # Auto-regenerate on changes`,

  testing: (name: string) => `
${name}                     # Run all tests
${name} UserSchema          # Test specific schema
${name} --iterations 1000   # Intensive testing`,

  transformation: (name: string) => `
${name} --dry-run           # Preview changes
${name} --strategy gradual  # Use gradual transformation
${name} --backup            # Create backup first`,

  collaboration: (name: string) => `
${name} start               # Start collaboration
${name} join abc123         # Join session
${name} --auto-save         # Enable auto-save`
};

/**
 * Predefined command configurations
 */
export const CommandConfigs = {
  // Analysis commands
  check: () => createCommand('check', 'Analyze schemas for issues and validation problems', 'analysis')
    .argument('[schema]', 'specific schema to check')
    .option('--unused', 'find unused schemas')
    .option('--duplicates', 'find duplicate schemas')
    .option('--complexity', 'analyze complexity'),

  hint: () => createCommand('hint', 'Performance & best practice suggestions', 'analysis')
    .argument('[patterns...]', 'file patterns to analyze')
    .option('--fix', 'automatically fix issues'),

  profile: () => createCommand('profile', 'Profile schema performance', 'analysis')
    .option('--runtime', 'enable runtime profiling')
    .option('--report', 'generate performance report'),

  // Generation commands
  scaffold: () => createCommand('scaffold', 'Generate Zod schemas from TypeScript', 'generation')
    .argument('<input>', 'TypeScript file with types/interfaces')
    .option('--two-way', 'enable two-way sync'),

  generate: () => createCommand('generate', 'Generate schemas from data sources', 'generation')
    .option('--from <source>', 'source type: json, typescript, openapi', 'json')
    .option('--name <name>', 'schema name prefix'),

  mock: () => createCommand('mock', 'Generate realistic mock data', 'generation')
    .argument('[schema]', 'schema to generate mocks from')
    .option('--count <n>', 'number of mocks to generate', '1')
    .option('--realistic', 'use realistic AI-powered patterns'),

  // Testing commands
  test: () => createCommand('test', 'Instant schema testing and validation', 'testing')
    .option('--schema <name>', 'test specific schema')
    .option('--fuzz <n>', 'number of fuzz test iterations', parseInt),

  contract: () => createCommand('contract', 'Contract testing between services', 'testing')
    .option('--between <services...>', 'services to test')
    .option('--validate', 'validate existing contracts'),

  // Transformation commands
  migrate: () => createCommand('migrate', 'Schema migration and evolution', 'transformation')
    .argument('[action]', 'migration action')
    .option('--from <path>', 'source schema file path')
    .option('--to <path>', 'target schema file path'),

  refactor: () => createCommand('refactor', 'Smart schema refactoring', 'transformation')
    .option('--schema <name>', 'schema to refactor')
    .option('--operation <type>', 'refactor operation'),

  compose: () => createCommand('compose', 'Advanced schema composition', 'transformation')
    .argument('[action]', 'composition action')
    .option('--input <files...>', 'input schema files'),

  // Collaboration commands
  collaborate: () => createCommand('collaborate', 'Real-time schema collaboration', 'collaboration')
    .argument('[action]', 'collaboration action')
    .option('--name <name>', 'user or session name'),

  mcp: () => createCommand('mcp', 'Model Context Protocol server', 'collaboration')
    .argument('[action]', 'serve, status, or stop', 'serve')
    .option('--port <n>', 'server port', '3456'),

  // Basic commands
  fix: () => createCommand('fix', 'Automatically fix schema issues', 'basic')
    .argument('[schema]', 'specific schema to fix')
    .option('--unsafe', 'apply potentially unsafe fixes'),

  explain: () => createCommand('explain', 'Explain a schema in detail', 'basic')
    .argument('[schema]', 'schema to explain')
    .option('--relationships', 'include relationship info'),

  sync: () => createCommand('sync', 'Zero-config schema synchronization', 'basic')
    .option('--status', 'show current sync status')
    .option('--reset', 'reset sync cache and re-sync'),

  map: () => createCommand('map', 'Map schema relationships and dependencies', 'basic')
    .argument('[schema]', 'specific schema to map')
    .option('--visualize', 'show ASCII visualization'),

  init: () => createCommand('init', 'Initialize zodkit in your project', 'basic')
    .option('--pm <manager>', 'package manager: pnpm, bun, yarn, npm')
    .option('--ai <tools...>', 'AI tools: cursor, claude, copilot, windsurf')
    .option('--mcp', 'enable MCP server integration')
};