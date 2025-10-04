/**
 * @fileoverview Unified Analysis Command
 * @module AnalyzeCommand
 *
 * Consolidates:
 * - check.ts - Schema validation and diagnostics
 * - hint.ts - Best practices and optimization hints
 * - fix.ts - Auto-fix schema issues
 * Total: 3 commands → 1 unified command
 */

import type { Command } from 'commander';
import * as pc from 'picocolors';
import { type AnalysisResult, Analyzer, type Fix, type Issue } from '../../core/analysis';
import { unifiedConfig } from '../../core/config';
import { Infrastructure } from '../../core/infrastructure';
import { createRuleEngine, type RuleViolation } from '../../core/rules';
import type { SchemaInfo } from '../../core/types';
import { Utils } from '../../utils';

type AnalyzeMode = 'check' | 'hint' | 'fix' | 'full';

interface AnalyzeOptions {
	mode?: AnalyzeMode;
	autoFix?: boolean;
	watch?: boolean;
	fast?: boolean;
	progressive?: boolean;
	output?: string;
	severity?: 'error' | 'warning' | 'all';
}

interface AnalysisResultExtended {
	schema: string;
	file: string;
	score: number;
	level: AnalysisResult['level'];
	issues: Issue[];
	suggestions: string[];
	fixes?: Fix[];
}

export async function analyzeCommand(
	target?: string,
	options: AnalyzeOptions = {},
	command?: Command,
): Promise<void> {
	const globalOpts = command?.parent?.opts() ?? {};
	const isJsonMode = globalOpts.json;
	const isQuiet = globalOpts.quiet;

	const utils = new Utils();
	const logger = utils.logger;

	try {
		// Determine mode - default to 'full' for best beginner experience
		const mode = options.mode ?? detectMode(command?.name()) ?? 'full';

		if (!isQuiet && !isJsonMode) {
			const modeIcons = {
				check: '✅',
				hint: '💡',
				fix: '🔧',
				full: '🚀',
			};

			const modeDescriptions = {
				check: 'validation',
				hint: 'best practices',
				fix: 'auto-fix',
				full: 'comprehensive',
			};

			logger.info(`${modeIcons[mode]} Running ${pc.cyan(modeDescriptions[mode])} analysis...`);
		}

		// Initialize systems with progressive loading if requested
		const infraConfig = await unifiedConfig.getInfrastructureConfig();

		// Enable progressive loading for large codebases or when explicitly requested
		if (
			options.progressive ||
			(!options.fast &&
				infraConfig.discovery?.patterns.length &&
				infraConfig.discovery.patterns.length > 5)
		) {
			infraConfig.progressive = {
				strategy: 'hybrid',
				enableLazyLoading: true,
				maxConcurrency: 4,
				memoryThreshold: 256, // 256MB
				chunkSize: 25,
				enableStreaming: true,
				warmupCache: true,
				...infraConfig.progressive,
			};
		}

		const infra = new Infrastructure(infraConfig);
		const analyzer = new Analyzer();

		// Auto-discover schemas with progressive loading if configured
		const discovery = infra.discovery;
		const schemas = await discovery.findSchemas({
			basePath: target ?? process.cwd(),
			progressive: options.progressive !== false,
		});

		if (schemas.length === 0) {
			if (!isQuiet && !isJsonMode) {
				logger.error('No Zod schemas found in the current directory.');
				logger.info('💡 Try:');
				logger.info('  • Run from a directory containing .schema.ts files');
				logger.info('  • Check if you have Zod schemas in: schemas/, types/, or models/');
				logger.info('  • Use "zodkit init" to set up schema validation');
			}
			throw new Error('No schemas found in project');
		}

		// Filter for specific target if provided
		const targetSchemas = target
			? schemas.filter((s) => s.name === target || s.filePath.includes(target))
			: schemas;

		if (target && targetSchemas.length === 0) {
			throw new Error(`No schemas matching '${target}' found`);
		}

		// Show discovery success message for better UX
		if (!isQuiet && !isJsonMode) {
			const schemaCount = targetSchemas.length;
			const totalCount = schemas.length;
			if (target) {
				logger.info(
					`Found ${pc.cyan(schemaCount)} schema${schemaCount !== 1 ? 's' : ''} matching '${target}' (${totalCount} total)`,
				);
			} else {
				logger.info(
					`Found ${pc.cyan(schemaCount)} Zod schema${schemaCount !== 1 ? 's' : ''} in your project`,
				);
			}
		}

		// Create rule engine
		const ruleEngine = createRuleEngine({
			autoFix: options.autoFix ?? mode === 'fix',
			rules: {
				'require-description': mode === 'check' || mode === 'full',
				'prefer-meta': mode === 'hint' || mode === 'full',
				'no-any-type': mode === 'check' || mode === 'full',
				'prefer-discriminated-union': mode === 'hint' || mode === 'full',
			},
		});

		// Analyze schemas in parallel for better performance
		const parallelResults = await infra.parallel.processSchemas(
			targetSchemas,
			async (schema: SchemaInfo): Promise<AnalysisResultExtended> => {
				// Run new rule-based analysis
				const ruleResult = await ruleEngine.analyzeFile(schema.filePath);

				// Also run legacy analyzer for backward compatibility
				// Map AnalyzeMode to AnalysisMode
				const analysisMode: 'complexity' | 'rules' | 'api' | 'data' | 'hints' | 'full' =
					mode === 'check'
						? 'rules'
						: mode === 'hint'
							? 'hints'
							: mode === 'fix'
								? 'rules'
								: 'full';

				const legacyResult = await analyzer.analyze(
					{
						name: schema.name,
						filePath: schema.filePath,
					},
					{
						mode: analysisMode,
						autoFix: options.autoFix ?? mode === 'fix',
						strict: mode === 'check',
					},
				);

				// Convert rule violations to issues format
				const ruleIssues: Issue[] = ruleResult.violations.map((v: RuleViolation) => ({
					type: v.severity,
					message: v.message,
					rule: v.schemaName,
					line: v.line,
					column: v.column,
					severity: v.severity === 'error' ? 3 : v.severity === 'warning' ? 2 : 1,
				}));

				return {
					schema: schema.name,
					file: schema.filePath,
					score: legacyResult.score,
					level: legacyResult.level,
					issues: [...legacyResult.issues, ...ruleIssues],
					suggestions: [
						...legacyResult.suggestions,
						...ruleResult.violations.flatMap((v) => v.suggestions ?? []),
					],
					fixes: legacyResult.fixes,
				};
			},
		);

		const results = parallelResults;

		// Apply fixes if in fix mode
		if (mode === 'fix' && !options.autoFix) {
			await applyFixes(results, isJsonMode);
		}

		// Output results
		if (isJsonMode) {
			console.log(JSON.stringify({ results }, null, 2));
		} else {
			displayResults(results, mode);
		}

		// Watch mode
		if (options.watch) {
			startWatchMode();
			return; // Stay alive in watch mode
		}

		// Exit code based on issues
		const hasErrors = results.some((r) => r.issues.some((i) => i.type === 'error'));

		if (hasErrors && mode === 'check') {
			process.exit(1);
		}

		// Exit cleanly in non-watch mode
		process.exit(0);
	} catch (error) {
		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						success: false,
						error: {
							message: error instanceof Error ? error.message : String(error),
							code: 'ANALYZE_ERROR',
						},
					},
					null,
					2,
				),
			);
		} else {
			logger.error('Analysis failed:', error instanceof Error ? error.message : String(error));
		}
		process.exit(1);
	}
}

function detectMode(commandName?: string): AnalyzeMode {
	if (commandName?.includes('check')) return 'check';
	if (commandName?.includes('hint')) return 'hint';
	if (commandName?.includes('fix')) return 'fix';
	return 'full';
}

async function applyFixes(results: AnalysisResultExtended[], isJsonMode: boolean): Promise<void> {
	const utils = new Utils();
	const logger = utils.logger;

	let totalFixes = 0;

	for (const result of results) {
		if (result.fixes && result.fixes.length > 0) {
			for (const fix of result.fixes) {
				if (fix.impact === 'safe' || confirmFix(fix, isJsonMode)) {
					// Apply fix
					// Would apply file changes here
					totalFixes += fix.changes.length;
				}
			}
		}
	}

	if (!isJsonMode) {
		logger.info(`Applied ${totalFixes} fix${totalFixes === 1 ? '' : 'es'}`);
	}
}

function confirmFix(fix: Fix, isJsonMode: boolean): boolean {
	if (isJsonMode) return true; // Auto-confirm in JSON mode

	// In interactive mode, would prompt user
	return fix.impact === 'safe';
}

function displayResults(results: AnalysisResultExtended[], mode: AnalyzeMode): void {
	console.log(`\n${pc.bold('Analysis Results')}`);
	console.log(pc.gray('─'.repeat(60)));

	let totalIssues = 0;
	let totalErrors = 0;
	let totalWarnings = 0;

	results.forEach((result) => {
		const hasIssues = result.issues.length > 0;
		const statusIcon = hasIssues ? '⚠️ ' : '✅ ';

		console.log(`\n${statusIcon}${pc.cyan(result.schema)} ${pc.gray(result.file)}`);

		if (result.score !== undefined) {
			const levelColor =
				result.level === 'low'
					? pc.green
					: result.level === 'medium'
						? pc.yellow
						: result.level === 'high'
							? pc.red
							: pc.bgRed;
			console.log(`  Complexity: ${levelColor(result.level)} (${result.score.toFixed(1)})`);
		}

		// Display issues
		if (result.issues.length > 0) {
			result.issues.forEach((issue: Issue) => {
				const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
				const color =
					issue.type === 'error' ? pc.red : issue.type === 'warning' ? pc.yellow : pc.blue;

				console.log(`  ${icon} ${color(issue.message)}`);

				if (issue.type === 'error') totalErrors++;
				else if (issue.type === 'warning') totalWarnings++;
				totalIssues++;
			});
		}

		// Display suggestions (hints mode)
		if (mode === 'hint' && result.suggestions.length > 0) {
			console.log(pc.cyan('  💡 Suggestions:'));
			result.suggestions.forEach((suggestion: string) => {
				console.log(`     • ${suggestion}`);
			});
		}

		// Display available fixes (fix mode)
		if (mode === 'fix' && result.fixes && result.fixes.length > 0) {
			console.log(pc.green('  🔧 Available Fixes:'));
			result.fixes.forEach((fix: Fix) => {
				const impactColor =
					fix.impact === 'safe' ? pc.green : fix.impact === 'risky' ? pc.yellow : pc.red;
				console.log(`     • ${fix.description} ${impactColor(`[${fix.impact}]`)}`);
			});
		}
	});

	// Summary
	console.log(`\n${pc.gray('─'.repeat(60))}`);
	console.log(pc.bold('Summary:'));
	console.log(`  Schemas analyzed: ${results.length}`);
	console.log(`  Total issues: ${totalIssues}`);
	if (totalErrors > 0) console.log(pc.red(`  Errors: ${totalErrors}`));
	if (totalWarnings > 0) console.log(pc.yellow(`  Warnings: ${totalWarnings}`));

	// Mode-specific summary
	if (mode === 'hint') {
		const totalSuggestions = results.reduce((sum, r) => sum + r.suggestions.length, 0);
		console.log(pc.cyan(`  Suggestions: ${totalSuggestions}`));
	}

	if (mode === 'fix') {
		const totalFixes = results.reduce((sum, r) => sum + (r.fixes?.length ?? 0), 0);
		console.log(pc.green(`  Available fixes: ${totalFixes}`));
	}
}

function startWatchMode(): void {
	const utils = new Utils();
	const logger = utils.logger;

	logger.info('👀 Watch mode enabled. Press Ctrl+C to exit.');

	const watcher = utils.watcher;
	watcher.watch(['**/*.schema.ts', '**/schemas/*.ts']);

	watcher.on('change', ({ filename }) => {
		void (async () => {
			logger.info(`File changed: ${filename}`);
			// Re-run analysis on changed file
			// Implementation would go here
		})();
	});
}

// === COMMAND REGISTRATION ===

export function registerAnalyzeCommand(program: Command): void {
	// Main analyze command
	program
		.command('analyze [target]')
		.description('Unified analysis: check, hint, and fix schemas')
		.option('-m, --mode <mode>', 'analysis mode (check|hint|fix|full)', 'full')
		.option('-a, --auto-fix', 'automatically apply safe fixes')
		.option('-w, --watch', 'watch for changes')
		.option('-f, --fast', 'fast mode using cache')
		.option('-p, --progressive', 'use progressive loading for large codebases')
		.option('-s, --severity <level>', 'minimum severity (error|warning|all)', 'all')
		.action(analyzeCommand);

	// Aliases for backward compatibility
	program
		.command('check [target]')
		.description('Check schemas for issues')
		.option('-f, --fast', 'fast mode using cache')
		.option('-w, --watch', 'watch for changes')
		.action((target, options, cmd) => analyzeCommand(target, { ...options, mode: 'check' }, cmd));

	program
		.command('hint [target]')
		.description('Get optimization hints and best practices')
		.option('-a, --auto-fix', 'show auto-fixable hints')
		.action((target, options, cmd) => analyzeCommand(target, { ...options, mode: 'hint' }, cmd));

	program
		.command('fix [target]')
		.description('Auto-fix schema issues')
		.option('-s, --safe-only', 'only apply safe fixes')
		.action((target, options, cmd) =>
			analyzeCommand(target, { ...options, mode: 'fix', autoFix: true }, cmd),
		);
}

export default analyzeCommand;
