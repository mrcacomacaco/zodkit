/**
 * @fileoverview Auto-Fix Schema Issues Command
 * @module FixCommand
 *
 * Automatically fixes schema issues where safe to do so
 * Focus: Safe auto-fixes with user confirmation for risky changes
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import * as pc from 'picocolors';
import { Analyzer } from '../../core/analysis';
import { unifiedConfig } from '../../core/config';
import { Infrastructure } from '../../core/infrastructure';
import { Utils } from '../../utils';
import { Logger } from '../../utils/logger';

const logger = new Logger();

interface FixOptions {
	dryRun?: boolean;
	interactive?: boolean;
	safeOnly?: boolean;
	force?: boolean;
	quiet?: boolean;
	json?: boolean;
}

export async function fixCommand(
	target?: string,
	options: FixOptions = {},
	command?: Command,
): Promise<void> {
	const globalOpts = command?.parent?.opts() || {};
	const isJsonMode = options.json || globalOpts.json;
	const isQuiet = options.quiet || globalOpts.quiet;

	const utils = new Utils({
		verbose: globalOpts.verbose,
		quiet: isQuiet,
		json: isJsonMode,
	});

	try {
		const mode = options.dryRun ? 'dry-run' : 'fix';
		utils.output.output({
			simple: `🔧 ${mode === 'dry-run' ? 'Preview' : 'Fixing'} schemas...`,
			detailed: `🔧 ${pc.cyan(`Auto-${mode} mode...`)}`,
			verbose: `🔧 ${mode === 'dry-run' ? 'Previewing Changes' : 'Auto-Fixing Schemas'}

Mode: ${mode}
Safe only: ${options.safeOnly ? 'enabled' : 'disabled'}
Interactive: ${options.interactive ? 'enabled' : 'disabled'}
Force: ${options.force ? 'enabled' : 'disabled'}`,
			data: {
				operation: 'fix',
				mode,
				options: { dryRun: options.dryRun, safeOnly: options.safeOnly },
			},
		});

		// Initialize systems
		const infraConfig = await unifiedConfig.getInfrastructureConfig();
		const infra = new Infrastructure(infraConfig);
		const analyzer = new Analyzer();

		// Auto-discover schemas
		const discovery = infra.discovery;
		const schemas = await discovery.findSchemas({ useCache: true });

		if (schemas.length === 0) {
			if (!isQuiet && !isJsonMode) {
				logger.error('No Zod schemas found.');
				logger.info('💡 Run "zodkit init" to set up schema validation');
			}
			if (isJsonMode) {
				console.log(JSON.stringify({ success: false, error: 'No schemas found' }));
			}
			process.exit(1);
		}

		// Filter for specific target if provided
		const targetSchemas = target
			? schemas.filter((s) => s.name === target || s.filePath.includes(target))
			: schemas;

		if (target && targetSchemas.length === 0) {
			const errorMsg = `No schemas matching '${target}' found`;
			if (isJsonMode) {
				console.log(JSON.stringify({ success: false, error: errorMsg }));
			} else {
				logger.error(errorMsg);
			}
			process.exit(1);
		}

		if (!isQuiet && !isJsonMode) {
			logger.info(
				`Found ${pc.cyan(targetSchemas.length)} schema${targetSchemas.length !== 1 ? 's' : ''} to analyze`,
			);
		}

		// Analyze schemas and collect fixes
		const allFixes: any[] = [];
		let totalIssues = 0;

		for (const schema of targetSchemas) {
			const result = await analyzer.analyze(schema as any, {
				mode: 'full',
				autoFix: true,
				strict: false,
			});

			totalIssues += result.issues.length;

			if (result.fixes && result.fixes.length > 0) {
				result.fixes.forEach((fix: any) => {
					allFixes.push({
						...fix,
						schemaName: schema.name,
						schemaFile: schema.filePath,
					});
				});
			}
		}

		if (allFixes.length === 0) {
			if (isJsonMode) {
				console.log(
					JSON.stringify({
						success: true,
						message: 'No fixable issues found',
						totalIssues,
						fixesApplied: 0,
					}),
				);
			} else if (!isQuiet) {
				console.log(`✅ No fixable issues found`);
				if (totalIssues > 0) {
					console.log(
						`   ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} require manual attention`,
					);
					console.log(`💡 Run ${pc.cyan('zodkit analyze')} for details`);
				}
			}
			// Cleanup with timeout and exit
			await Promise.race([
				infra.shutdown(),
				new Promise((resolve) => setTimeout(resolve, 2000)), // 2s timeout
			]);
			process.exit(0);
		}

		// Filter fixes based on options
		let fixesToApply = allFixes;

		if (options.safeOnly) {
			fixesToApply = allFixes.filter((fix) => fix.impact === 'safe');
		}

		if (!isQuiet && !isJsonMode && !options.dryRun) {
			console.log(
				`\nFound ${pc.cyan(fixesToApply.length)} fixable issue${fixesToApply.length !== 1 ? 's' : ''}:`,
			);

			// Show fixes that will be applied
			fixesToApply.forEach((fix, index) => {
				const impactColor =
					fix.impact === 'safe' ? pc.green : fix.impact === 'risky' ? pc.yellow : pc.red;
				console.log(`  ${index + 1}. ${fix.description} ${impactColor(`[${fix.impact}]`)}`);
				console.log(`     ${pc.gray(fix.schemaFile)}`);
			});

			// Prompt for confirmation unless forced
			if (!options.force && !options.interactive) {
				console.log(`\n💡 Add ${pc.cyan('--force')} to apply all fixes automatically`);
				console.log(`💡 Add ${pc.cyan('--dry-run')} to preview changes without applying`);
				if (fixesToApply.some((f) => f.impact !== 'safe')) {
					console.log(`⚠️  Some fixes are marked as risky - review carefully`);
				}

				// For now, require explicit --force for auto-fixes
				logger.info('Use --force to apply fixes automatically');
				return;
			}
		}

		// Apply fixes (or show dry-run)
		let appliedCount = 0;
		const appliedFixes: any[] = [];

		for (const fix of fixesToApply) {
			try {
				if (options.dryRun) {
					// Just show what would be changed
					appliedFixes.push({
						file: fix.schemaFile,
						description: fix.description,
						impact: fix.impact,
						applied: false,
						reason: 'dry-run',
					});
				} else {
					// Apply the fix
					const applied = await applyFix(fix);
					if (applied) {
						appliedCount++;
						appliedFixes.push({
							file: fix.schemaFile,
							description: fix.description,
							impact: fix.impact,
							applied: true,
						});
					}
				}
			} catch (error) {
				appliedFixes.push({
					file: fix.schemaFile,
					description: fix.description,
					impact: fix.impact,
					applied: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Output results
		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						success: true,
						dryRun: options.dryRun,
						totalFixes: fixesToApply.length,
						appliedFixes: appliedCount,
						fixes: appliedFixes,
					},
					null,
					2,
				),
			);
		} else if (!isQuiet) {
			const actionWord = options.dryRun ? 'Would apply' : 'Applied';
			const statusIcon = options.dryRun ? '👀' : '✅';

			console.log(
				`\n${statusIcon} ${actionWord} ${pc.cyan(appliedCount)} fix${appliedCount !== 1 ? 'es' : ''}`,
			);

			if (!options.dryRun && appliedCount > 0) {
				console.log(`💡 Run ${pc.cyan('zodkit check')} to verify the fixes`);
			}
		}

		// Cleanup with timeout and exit successfully
		await Promise.race([
			infra.shutdown(),
			new Promise((resolve) => setTimeout(resolve, 2000)), // 2s timeout
		]);
		process.exit(0);
	} catch (error) {
		if (isJsonMode) {
			console.log(
				JSON.stringify({
					success: false,
					error: {
						message: error instanceof Error ? error.message : String(error),
						code: 'FIX_ERROR',
					},
				}),
			);
		} else if (!isQuiet) {
			logger.error('Fix failed:', error instanceof Error ? error.message : String(error));
		}
		process.exit(1);
	}
}

async function applyFix(fix: any): Promise<boolean> {
	// Simple fix application - in a real implementation, this would be more sophisticated
	if (!fix.changes || fix.changes.length === 0) {
		return false;
	}

	for (const change of fix.changes) {
		try {
			const content = readFileSync(change.file, 'utf8');
			const lines = content.split('\n');

			if (change.line > 0 && change.line <= lines.length) {
				lines[change.line - 1] = lines[change.line - 1].replace(change.before, change.after);
				writeFileSync(change.file, lines.join('\n'));
			}
		} catch (error) {
			console.warn(`Warning: Could not apply fix to ${change.file}: ${error}`);
			return false;
		}
	}

	return true;
}
