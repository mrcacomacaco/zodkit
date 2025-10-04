/**
 * @fileoverview Lint command - Schema linting with auto-fix capability
 * @module Commands/Lint
 */

import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import * as pc from 'picocolors';
import { RuleEngine, type RuleEngineOptions } from '../../core/rules/engine';
import { applyFixes } from '../../core/rules/fixer';
import type { RuleViolation } from '../../core/rules/types';

export interface LintCommandOptions {
	patterns?: string[];
	fix?: boolean;
	rules?: Record<string, boolean | Record<string, any>>;
	severity?: 'error' | 'warning' | 'info';
	output?: string;
	format?: 'text' | 'json';
	config?: string;
}

/**
 * Lint command - check schemas for best practices and anti-patterns
 */
export async function lintCommand(
	patternsArg?: string | string[],
	options: LintCommandOptions = {},
): Promise<void> {
	try {
		console.log(pc.blue('🔍 zodkit lint - Linting Zod schemas...'));

		// Handle patterns from either argument or options
		let patterns: string[];
		if (patternsArg) {
			patterns = Array.isArray(patternsArg) ? patternsArg : [patternsArg];
		} else if (options.patterns) {
			patterns = options.patterns;
		} else {
			patterns = ['**/*.schema.ts', '**/schemas/**/*.ts', 'src/**/*.zod.ts'];
		}

		// Find schema files
		const files = await fg(patterns, {
			ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
			absolute: true,
		});

		if (files.length === 0) {
			console.log(pc.yellow('⚠️  No schema files found'));
			console.log(pc.gray(`Searched patterns: ${patterns.join(', ')}`));
			return;
		}

		console.log(pc.gray(`Found ${files.length} schema file(s) to lint`));

		// Configure rule engine
		const ruleEngineOptions: RuleEngineOptions = {
			rules: options.rules || {
				'require-description': true,
				'prefer-meta': true,
				'no-any-type': true,
				'prefer-discriminated-union': true,
				'no-loose-objects': true,
				'require-refinements': true,
			},
			autoFix: options.fix || false,
		};

		const ruleEngine = new RuleEngine(ruleEngineOptions);

		// Collect all violations
		const allViolations: RuleViolation[] = [];
		const fileViolations: Map<string, RuleViolation[]> = new Map();

		// Lint each file
		for (const file of files) {
			try {
				const result = await ruleEngine.analyzeFile(file);

				if (result.violations.length > 0) {
					allViolations.push(...result.violations);
					fileViolations.set(file, result.violations);
				}
			} catch (error) {
				console.warn(pc.yellow(`⚠️  Failed to lint ${file}: ${error}`));
			}
		}

		// Filter by severity if specified
		let filteredViolations = allViolations;
		if (options.severity) {
			filteredViolations = allViolations.filter((v) => v.severity === options.severity);
		}

		// Apply fixes if requested
		if (options.fix && filteredViolations.some((v) => v.fix)) {
			console.log(pc.blue('\n🔧 Applying fixes...'));

			const fixableViolations = filteredViolations.filter((v) => v.fix);
			const fixResults = applyFixes(fixableViolations);

			console.log(
				pc.green(`✅ Applied ${fixResults.applied} fix(es), ${fixResults.failed} failed`),
			);

			// Update violations to remove fixed ones
			filteredViolations = filteredViolations.filter((v) => !v.fix);
		}

		// Output results
		if (options.format === 'json') {
			const jsonOutput = {
				summary: {
					totalFiles: files.length,
					totalViolations: filteredViolations.length,
					errors: filteredViolations.filter((v) => v.severity === 'error').length,
					warnings: filteredViolations.filter((v) => v.severity === 'warning').length,
					info: filteredViolations.filter((v) => v.severity === 'info').length,
				},
				violations: filteredViolations,
			};

			if (options.output) {
				writeFileSync(resolve(options.output), JSON.stringify(jsonOutput, null, 2));
				console.log(pc.green(`\n✅ Report saved to: ${options.output}`));
			} else {
				console.log(JSON.stringify(jsonOutput, null, 2));
			}
		} else {
			// Text format
			printTextReport(fileViolations, filteredViolations);

			if (options.output) {
				const textReport = generateTextReport(fileViolations, filteredViolations);
				writeFileSync(resolve(options.output), textReport);
				console.log(pc.green(`\n✅ Report saved to: ${options.output}`));
			}
		}

		// Print summary
		printSummary(files.length, filteredViolations);

		// Exit with error code if there are errors (skip in test environment)
		const errorCount = filteredViolations.filter((v) => v.severity === 'error').length;
		if (errorCount > 0 && process.env.NODE_ENV !== 'test') {
			process.exit(1);
		}
	} catch (error) {
		console.error(
			pc.red('❌ Lint command failed:'),
			error instanceof Error ? error.message : String(error),
		);
		if (process.env.NODE_ENV !== 'test') {
			process.exit(1);
		}
		throw error;
	}
}

/**
 * Print text report to console
 */
function printTextReport(
	fileViolations: Map<string, RuleViolation[]>,
	allViolations: RuleViolation[],
): void {
	if (allViolations.length === 0) {
		console.log(pc.green('\n✅ No linting issues found!'));
		return;
	}

	console.log(pc.bold('\n📋 LINTING ISSUES\n'));

	for (const [file, violations] of fileViolations) {
		console.log(pc.cyan(`\n${file}`));

		for (const violation of violations) {
			const icon = getSeverityIcon(violation.severity);
			const color = getSeverityColor(violation.severity);

			console.log(
				color(
					`  ${icon} ${violation.line}:${violation.column} - ${violation.message} [${violation.schemaName}]`,
				),
			);

			if (violation.suggestions && violation.suggestions.length > 0) {
				violation.suggestions.forEach((suggestion) => {
					console.log(pc.gray(`     💡 ${suggestion}`));
				});
			}

			if (violation.fix) {
				console.log(pc.blue(`     🔧 Auto-fix available (run with --fix)`));
			}
		}
	}
}

/**
 * Generate text report
 */
function generateTextReport(
	fileViolations: Map<string, RuleViolation[]>,
	allViolations: RuleViolation[],
): string {
	let report = 'ZODKIT LINT REPORT\n';
	report += '='.repeat(50) + '\n\n';

	if (allViolations.length === 0) {
		report += '✅ No linting issues found!\n';
		return report;
	}

	for (const [file, violations] of fileViolations) {
		report += `\n${file}\n`;
		report += '-'.repeat(50) + '\n';

		for (const violation of violations) {
			report += `  ${violation.severity.toUpperCase()} ${violation.line}:${violation.column} - ${violation.message} [${violation.schemaName}]\n`;

			if (violation.suggestions && violation.suggestions.length > 0) {
				violation.suggestions.forEach((suggestion) => {
					report += `    💡 ${suggestion}\n`;
				});
			}
		}
	}

	return report;
}

/**
 * Print summary statistics
 */
function printSummary(fileCount: number, violations: RuleViolation[]): void {
	const errors = violations.filter((v) => v.severity === 'error').length;
	const warnings = violations.filter((v) => v.severity === 'warning').length;
	const infos = violations.filter((v) => v.severity === 'info').length;

	console.log('\n' + pc.bold('📊 SUMMARY'));
	console.log('─'.repeat(40));
	console.log(`Files scanned:       ${pc.cyan(String(fileCount))}`);
	console.log(`Total issues:        ${pc.cyan(String(violations.length))}`);
	console.log(`Errors:              ${errors > 0 ? pc.red(String(errors)) : pc.green('0')}`);
	console.log(`Warnings:            ${warnings > 0 ? pc.yellow(String(warnings)) : pc.green('0')}`);
	console.log(`Info:                ${pc.blue(String(infos))}`);
	console.log('─'.repeat(40));
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity: string): string {
	switch (severity) {
		case 'error':
			return '✖';
		case 'warning':
			return '⚠';
		case 'info':
			return 'ℹ';
		default:
			return '•';
	}
}

/**
 * Get severity color function
 */
function getSeverityColor(severity: string): (str: string) => string {
	switch (severity) {
		case 'error':
			return pc.red;
		case 'warning':
			return pc.yellow;
		case 'info':
			return pc.blue;
		default:
			return pc.gray;
	}
}

// Export as default for lazy loading
export default lintCommand;
