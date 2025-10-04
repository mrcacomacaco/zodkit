/**
 * @fileoverview Command builder utility to streamline CLI commands
 * @module CommandBuilder
 */

import { Command } from 'commander';
import { OptionGroups } from './global-options';

/**
 * Command categories for automatic option groups
 */
export type CommandCategory =
	| 'analysis'
	| 'generation'
	| 'testing'
	| 'transformation'
	| 'collaboration'
	| 'basic';

/**
 * Streamlined command builder that automatically applies appropriate option groups
 */
export class CommandBuilder {
	private readonly command: Command;
	private readonly category: CommandCategory;

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
	category: CommandCategory = 'basic',
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
${name} --auto-save         # Enable auto-save`,
};

/**
 * Predefined command configurations
 */
export const CommandConfigs = {
	// Analysis commands
	check: () =>
		createCommand('check', 'Analyze schemas for issues and validation problems', 'analysis')
			.argument('[schema]', 'specific schema to check')
			.option('--unused', 'find unused schemas')
			.option('--duplicates', 'find duplicate schemas')
			.option('--complexity', 'analyze complexity'),

	analyze: () =>
		createCommand('analyze', 'Comprehensive schema analysis (default mode)', 'analysis')
			.argument('[target]', 'specific schema or pattern to analyze')
			.option('-m, --mode <mode>', 'analysis mode: check, hint, fix, full', 'full')
			.option('--auto-fix', 'automatically apply safe fixes')
			.option('--fast', 'use cached results when available'),

	hint: () =>
		createCommand('hint', 'Performance & best practice suggestions', 'analysis')
			.argument('[patterns...]', 'file patterns to analyze')
			.option('--fix', 'automatically fix issues'),

	profile: () =>
		createCommand('profile', 'Profile schema performance', 'analysis')
			.option('--runtime', 'enable runtime profiling')
			.option('--report', 'generate performance report'),

	// Generation commands
	scaffold: () =>
		createCommand('scaffold', 'Generate Zod schemas from TypeScript', 'generation')
			.argument('<input>', 'TypeScript file with types/interfaces')
			.option('--two-way', 'enable two-way sync'),

	generate: () =>
		createCommand('generate', 'Generate schemas from data sources', 'generation')
			.option('--from <source>', 'source type: json, typescript, openapi', 'json')
			.option('--name <name>', 'schema name prefix'),

	mock: () =>
		createCommand('mock', 'Generate realistic mock data', 'generation')
			.argument('[schema]', 'schema to generate mocks from')
			.option('--count <n>', 'number of mocks to generate', '1')
			.option('--realistic', 'use realistic AI-powered patterns'),

	// Testing commands
	test: () =>
		createCommand('test', 'Instant schema testing and validation', 'testing')
			.option('--schema <name>', 'test specific schema')
			.option('--fuzz <n>', 'number of fuzz test iterations', parseInt),

	contract: () =>
		createCommand('contract', 'Contract testing between services', 'testing')
			.option('--between <services...>', 'services to test')
			.option('--validate', 'validate existing contracts'),

	// Transformation commands
	migrate: () =>
		createCommand('migrate', 'Schema migration and evolution', 'transformation')
			.argument('[action]', 'migration action')
			.option('--from <path>', 'source schema file path')
			.option('--to <path>', 'target schema file path')
			.option('--include <patterns...>', 'file patterns to include')
			.option('--exclude <patterns...>', 'file patterns to exclude')
			.option('--version <version>', 'default version for metadata', '1.0.0')
			.option('--interactive', 'enable interactive mode with prompts'),

	diff: () =>
		createCommand('diff', 'Compare schemas and detect breaking changes', 'transformation')
			.option('--old <path>', 'old schema version file path (required)')
			.option('--new <path>', 'new schema version file path (required)')
			.option('--output <path>', 'output file for diff report')
			.option('--format <format>', 'output format: text, json, markdown, html', 'text')
			.option('--migration', 'generate migration guide', true)
			.option('--strict', 'enable strict comparison mode')
			.option('--ignore-metadata', 'ignore metadata changes'),

	refactor: () =>
		createCommand('refactor', 'Smart schema refactoring', 'transformation')
			.option('--schema <name>', 'schema to refactor')
			.option('--operation <type>', 'refactor operation'),

	compose: () =>
		createCommand('compose', 'Advanced schema composition', 'transformation')
			.argument('[action]', 'composition action')
			.option('--input <files...>', 'input schema files'),

	// Collaboration commands
	collaborate: () =>
		createCommand('collaborate', 'Real-time schema collaboration', 'collaboration')
			.argument('[action]', 'collaboration action')
			.option('--name <name>', 'user or session name'),

	mcp: () =>
		createCommand('mcp', 'Model Context Protocol server', 'collaboration')
			.argument('[action]', 'serve, status, or stop')
			.option('--port <n>', 'server port', '3456'),

	// Basic commands
	fix: () =>
		createCommand('fix', 'Automatically fix schema issues')
			.argument('[schema]', 'specific schema to fix')
			.option('--unsafe', 'apply potentially unsafe fixes'),

	explain: () =>
		createCommand('explain', 'Explain a schema in detail', 'basic')
			.argument('[schema]', 'schema to explain')
			.option('--relationships', 'include relationship info'),

	sync: () =>
		createCommand('sync', 'Zero-config schema synchronization', 'basic')
			.option('--status', 'show current sync status')
			.option('--reset', 'reset sync cache and re-sync'),

	map: () =>
		createCommand('map', 'Map schema relationships and dependencies', 'basic')
			.argument('[schema]', 'specific schema to map')
			.option('--visualize', 'show ASCII visualization'),

	init: () =>
		createCommand('init', 'Initialize zodkit in your project', 'basic')
			.argument('[project-name]', 'project name for initialization')
			.option('-p, --preset <preset>', 'config preset: minimal, standard, complete', 'standard')
			.option(
				'-t, --template <template>',
				'project template: basic, full-stack, api, library',
				'basic',
			)
			.option('-f, --force', 'force reinitialize existing project')
			.option('--skip-install', 'skip dependency installation')
			.option('--no-interactive', 'disable interactive mode'),

	docs: () =>
		createCommand('docs', 'Generate comprehensive documentation from Zod schemas', 'generation')
			.option('-o, --output <path>', 'output directory for documentation', './docs/schemas')
			.option(
				'-f, --format <format>',
				'output format: markdown, html, json-schema, openapi, all',
				'markdown',
			)
			.option('--include <patterns...>', 'file patterns to include')
			.option('--exclude <patterns...>', 'file patterns to exclude')
			.option('--title <title>', 'documentation title')
			.option('--group-by-category', 'group schemas by category', true)
			.option('--validate-examples', 'validate examples in metadata')
			.option('--generate-paths', 'generate API paths for OpenAPI', true)
			.option('--servers <urls...>', 'server URLs for OpenAPI'),

	watch: () =>
		createCommand('watch', 'Watch for schema changes and hot reload automatically', 'basic')
			.option('--patterns <patterns...>', 'file patterns to watch')
			.option('--ignore <patterns...>', 'file patterns to ignore')
			.option('--debounce <ms>', 'debounce time in milliseconds', '300')
			.option(
				'--strategy <strategy>',
				'invalidation strategy: conservative, aggressive, smart',
				'smart',
			)
			.option('--no-dependency', 'disable dependency tracking')
			.option('--no-performance', 'disable performance monitoring'),

	// Utility commands
	suggestions: () =>
		createCommand('suggestions', 'Get smart command suggestions based on your project', 'basic')
			.alias('suggest')
			.alias('help-me')
			.argument('[input]', 'describe what you want to do')
			.option('--last-command <cmd>', 'last command you ran for follow-up suggestions'),

	plugins: () =>
		createCommand('plugins', 'Manage zodkit plugins', 'basic')
			.argument(
				'[action]',
				'action: list, search, install, uninstall, info, update, create, test, validate, build, publish',
			)
			.argument('[plugin]', 'plugin name or path')
			.option('--version <version>', 'specific version to install')
			.option('--dev', 'install as dev dependency')
			.option('--force', 'force installation/operation')
			.option('--verified', 'only show verified plugins in search')
			.option('--limit <n>', 'limit search results', '10')
			.option(
				'--template <type>',
				'plugin template: basic, command, rule, middleware, full',
				'basic',
			)
			.option('--description <desc>', 'plugin description')
			.option('--author <name>', 'plugin author')
			.option('--javascript', 'use JavaScript instead of TypeScript')
			.option('--minify', 'minify built plugin')
			.option('--tag <tag>', 'npm publish tag')
			.option('--dry-run', 'dry run for publish'),

	benchmark: () =>
		createCommand('benchmark', 'Run performance benchmarks on your schemas', 'testing')
			.alias('bench')
			.argument('[schema]', 'specific schema to benchmark')
			.option('--warmup <n>', 'number of warmup rounds', '1000')
			.option('--data <path>', 'test data file path')
			.option('--baseline', 'save results as performance baseline')
			.option('--compare', 'compare with saved baseline')
			.option('--memory', 'include memory usage analysis', true),

	// Smart aliases
	gen: () =>
		createCommand('gen', 'Generate schemas (shorthand for generate)', 'generation').alias('g'),

	perf: () => createCommand('perf', 'Performance profiling with monitoring', 'analysis').alias('p'),
};
