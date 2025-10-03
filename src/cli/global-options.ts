/**
 * @fileoverview Global CLI options that can be inherited by all commands
 * @module GlobalOptions
 */

import type { Command } from 'commander';

/**
 * Common options that appear across multiple commands
 */
export interface GlobalOptions {
	// Output & Format Options
	json?: boolean;
	format?: 'json' | 'console' | 'table' | 'html' | 'csv' | 'markdown';
	output?: string;
	export?: string;

	// Behavior Options
	watch?: boolean;
	interactive?: boolean;
	dryRun?: boolean;
	verbose?: boolean;
	quiet?: boolean;

	// Safety Options
	backup?: boolean;
	strict?: boolean;
	force?: boolean;

	// Performance Options
	parallel?: boolean;
	timeout?: number;

	// Configuration
	config?: string;
	preset?: string;
	cwd?: string;
}

/**
 * Add global options to a command
 */
export function addGlobalOptions(command: Command): Command {
	return (
		command
			// Output & Format Options
			.option('--json', 'Output results as JSON for AI/automation')
			.option(
				'--format <type>',
				'Output format: json, console, table, html, csv, markdown',
				'console',
			)
			.option('-o, --output <path>', 'Output file path')
			.option('--export <path>', 'Export results to file')

			// Behavior Options
			.option('-w, --watch', 'Watch for file changes and auto-run')
			.option('-i, --interactive', 'Interactive mode with prompts')
			.option('--dry-run', 'Preview changes without executing')
			.option('--verbose', 'Show detailed debug information')
			.option('--quiet', 'Suppress non-error output')

			// Safety Options
			.option('--backup', 'Create backup before making changes', true)
			.option('--strict', 'Use strict validation/checking')
			.option('--force', 'Force execution (bypass safety checks)')

			// Performance Options
			.option('--parallel', 'Enable parallel processing')
			.option('--timeout <ms>', 'Operation timeout in milliseconds', parseInt)

			// Configuration
			.option('-c, --config <path>', 'Path to configuration file')
			.option(
				'--preset <name>',
				'Use configuration preset: dev, prod, ci, fast, safe, learning, performance, enterprise',
			)
			.option('--cwd <path>', 'Change working directory')
	);
}

/**
 * Workflow-specific option groups
 */
export const OptionGroups = {
	/**
	 * Analysis workflow options (check, hint, profile, debug)
	 */
	analysis: (command: Command) =>
		command
			.option('--severity <levels>', 'Filter by severity: error, warning, info')
			.option('--rules <rules>', 'Specific rules to run (comma-separated)')
			.option('--coverage', 'Include coverage analysis')
			.option('--performance', 'Include performance metrics'),

	/**
	 * Generation workflow options (scaffold, generate, mock)
	 */
	generation: (command: Command) =>
		command
			.option('--patterns', 'Enable smart pattern detection', true)
			.option('--preserve-jsdoc', 'Preserve JSDoc comments', true)
			.option('--overwrite', 'Overwrite existing files')
			.option('--incremental', 'Incremental updates only'),

	/**
	 * Testing workflow options (test, contract, forensics)
	 */
	testing: (command: Command) =>
		command
			.option('--iterations <n>', 'Number of test iterations', parseInt)
			.option('--seed <n>', 'Random seed for reproducible tests', parseInt)
			.option('--bail', 'Stop on first failure')
			.option('--suite <path>', 'Run specific test suite'),

	/**
	 * Transformation workflow options (migrate, refactor, compose)
	 */
	transformation: (command: Command) =>
		command
			.option('--strategy <type>', 'Transformation strategy')
			.option('--validate', 'Validate before applying changes', true)
			.option('--rollback', 'Enable rollback capability')
			.option('--phases <n>', 'Number of phases for complex operations', parseInt),

	/**
	 * Collaboration workflow options (collaborate, mcp, sync)
	 */
	collaboration: (command: Command) =>
		command
			.option('--auto-save', 'Enable automatic saving', true)
			.option('--notifications', 'Enable notifications')
			.option('--monitoring', 'Enable monitoring')
			.option('--conflicts <mode>', 'Conflict resolution: auto, interactive, manual', 'auto'),
};

/**
 * Smart aliases for common option combinations
 */
export const OptionAliases = {
	// Development mode: verbose, watch, backup
	dev: ['--verbose', '--watch', '--backup'],

	// Production mode: quiet, strict, no-backup
	prod: ['--quiet', '--strict', '--no-backup'],

	// Fast mode: parallel, no-backup, force
	fast: ['--parallel', '--no-backup', '--force'],

	// Safe mode: backup, strict, dry-run, interactive
	safe: ['--backup', '--strict', '--dry-run', '--interactive'],

	// CI mode: json, quiet, strict, no-interactive
	ci: ['--json', '--quiet', '--strict', '--no-interactive'],
};

/**
 * Parse global options from command arguments
 */
export function parseGlobalOptions(options: any): GlobalOptions {
	return {
		json: options.json,
		format: options.format,
		output: options.output,
		export: options.export,
		watch: options.watch,
		interactive: options.interactive,
		dryRun: options.dryRun,
		verbose: options.verbose,
		quiet: options.quiet,
		backup: options.backup,
		strict: options.strict,
		force: options.force,
		parallel: options.parallel,
		timeout: options.timeout,
		config: options.config,
		preset: options.preset,
		cwd: options.cwd,
	};
}
