/**
 * @fileoverview Stats command - Schema statistics and analysis
 * @module Commands/Stats
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import * as pc from 'picocolors';
import {
	PatternsArgSchema,
	StatsOptionsSchema,
	validateCommandOptions,
} from '../../core/command-validation';
import { createErrorHandler } from '../../core/error-handler';
import { createStatsAggregator, type SchemaStats } from '../../core/schema-stats';

export interface StatsCommandOptions {
	patterns?: string[];
	output?: string;
	format?: 'text' | 'json';
	verbose?: boolean;
	includeComplexity?: boolean;
	includePatterns?: boolean;
	includeHotspots?: boolean;
	includeBundleImpact?: boolean;
}

/**
 * Stats command - generate schema statistics and analysis
 */
export async function statsCommand(
	patternsArg?: string | string[],
	options: StatsCommandOptions = {},
): Promise<void> {
	// Validate inputs with Zod (outside try block for error handler)
	const validatedPatterns = PatternsArgSchema.parse(patternsArg);
	const validatedOptions = validateCommandOptions(StatsOptionsSchema, options, 'stats');

	try {
		console.log(pc.blue('📊 zodkit stats - Analyzing schema statistics...'));

		// Handle patterns from either argument or options
		let patterns: string[];
		if (validatedPatterns) {
			patterns = Array.isArray(validatedPatterns) ? validatedPatterns : [validatedPatterns];
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

		console.log(pc.gray(`Analyzing ${files.length} schema file(s)...\n`));

		// Create stats aggregator
		const aggregator = createStatsAggregator();

		// Add all files
		for (const file of files) {
			try {
				await aggregator.addFile(file);
			} catch (error) {
				console.warn(pc.yellow(`⚠️  Failed to analyze ${file}: ${error}`));
			}
		}

		// Generate statistics
		const stats = aggregator.generateStats({
			includeComplexity: validatedOptions.complexity !== false,
			includeUsagePatterns: validatedOptions.patterns !== false,
			includeHotspots: validatedOptions.hotspots !== false,
			includeBundleImpact: validatedOptions.bundleImpact !== false,
		});

		// Output results
		if (validatedOptions.format === 'json') {
			const jsonOutput = JSON.stringify(stats, null, 2);
			if (validatedOptions.output) {
				writeFileSync(resolve(validatedOptions.output), jsonOutput);
				console.log(pc.green(`✅ Stats saved to: ${validatedOptions.output}`));
			} else {
				console.log(jsonOutput);
			}
		} else {
			printTextReport(stats, validatedOptions.verbose ?? false);

			if (validatedOptions.output) {
				const textReport = generateTextReport(stats);
				writeFileSync(resolve(validatedOptions.output), textReport);
				console.log(pc.green(`\n✅ Stats saved to: ${validatedOptions.output}`));
			}
		}
	} catch (error) {
		if (process.env.NODE_ENV === 'test') {
			throw error;
		}
		const errorHandler = createErrorHandler({ verbose: validatedOptions.verbose ?? false });
		errorHandler.handle(error, { command: 'stats', timestamp: new Date() });
	}
}

/**
 * Print text report to console
 */
function printTextReport(stats: SchemaStats, verbose: boolean): void {
	console.log(pc.bold('📈 SCHEMA STATISTICS\n'));

	// Overview
	console.log(pc.cyan('Overview:'));
	console.log(`  Total schemas: ${pc.bold(String(stats.totalSchemas))}`);
	console.log();

	// Type distribution
	console.log(pc.cyan('Type Distribution:'));
	const sortedTypes = Object.entries(stats.schemasByType).sort((a, b) => b[1] - a[1]);
	for (const [type, count] of sortedTypes) {
		const percentage = ((count / stats.totalSchemas) * 100).toFixed(1);
		console.log(`  ${type.padEnd(15)} ${String(count).padStart(3)} (${percentage}%)`);
	}
	console.log();

	// Complexity metrics
	console.log(pc.cyan('Complexity Metrics:'));
	console.log(`  Average depth:       ${stats.complexityMetrics.averageDepth.toFixed(1)} levels`);
	console.log(`  Max depth:           ${stats.complexityMetrics.maxDepth} levels`);
	console.log(
		`  Average field count: ${stats.complexityMetrics.averageFieldCount.toFixed(1)} fields`,
	);
	console.log(`  Max field count:     ${stats.complexityMetrics.maxFieldCount} fields`);
	console.log(`  Total refinements:   ${stats.complexityMetrics.totalRefinements}`);
	console.log(`  Total transforms:    ${stats.complexityMetrics.totalTransforms}`);
	console.log();

	// Complex schemas
	if (stats.complexityMetrics.complexSchemas.length > 0) {
		console.log(
			pc.yellow(`⚠️  Complex Schemas (${stats.complexityMetrics.complexSchemas.length}):`),
		);
		const displayCount = verbose
			? stats.complexityMetrics.complexSchemas.length
			: Math.min(5, stats.complexityMetrics.complexSchemas.length);
		for (let i = 0; i < displayCount; i++) {
			const schema = stats.complexityMetrics.complexSchemas[i];
			console.log(`  ${pc.bold(schema.name)} (complexity: ${schema.complexity})`);
			schema.reasons.forEach((reason) => {
				console.log(pc.gray(`    - ${reason}`));
			});
		}
		if (!verbose && stats.complexityMetrics.complexSchemas.length > 5) {
			console.log(
				pc.gray(
					`  ... and ${stats.complexityMetrics.complexSchemas.length - 5} more (use --verbose to see all)`,
				),
			);
		}
		console.log();
	}

	// Usage patterns
	if (stats.usagePatterns.length > 0) {
		console.log(pc.cyan('Usage Patterns:'));
		for (const pattern of stats.usagePatterns) {
			console.log(`  ${pattern.pattern.padEnd(25)} ${String(pattern.count).padStart(3)} usage(s)`);
			if (verbose && pattern.examples.length > 0) {
				console.log(pc.gray(`    Examples: ${pattern.examples.join(', ')}`));
			}
		}
		console.log();
	}

	// Hotspots
	if (stats.hotspots.length > 0) {
		console.log(pc.yellow(`🔥 Schema Hotspots (${stats.hotspots.length}):`));
		const displayCount = verbose ? stats.hotspots.length : Math.min(5, stats.hotspots.length);
		for (let i = 0; i < displayCount; i++) {
			const hotspot = stats.hotspots[i];
			const severityColor =
				hotspot.severity === 'high' ? pc.red : hotspot.severity === 'medium' ? pc.yellow : pc.blue;
			console.log(
				`  ${severityColor(hotspot.severity.toUpperCase())} - ${pc.bold(hotspot.name)} (${hotspot.file})`,
			);
			hotspot.issues.forEach((issue) => {
				console.log(pc.gray(`    ✖ ${issue}`));
			});
			if (verbose) {
				hotspot.suggestions.forEach((suggestion) => {
					console.log(pc.gray(`    💡 ${suggestion}`));
				});
			}
		}
		if (!verbose && stats.hotspots.length > 5) {
			console.log(
				pc.gray(`  ... and ${stats.hotspots.length - 5} more (use --verbose to see all)`),
			);
		}
		console.log();
	}

	// Bundle impact
	if (stats.bundleImpact) {
		const impact = stats.bundleImpact;
		console.log(pc.cyan('📦 Bundle Impact (Estimated):'));
		const sizeKB = (impact.estimatedSize / 1024).toFixed(1);
		console.log(`  Total size:          ${pc.bold(sizeKB)} KB`);
		console.log();

		if (impact.largestSchemas.length > 0) {
			console.log(
				pc.yellow(`  Largest schemas (top ${Math.min(5, impact.largestSchemas.length)}):`),
			);
			const displayCount = verbose
				? impact.largestSchemas.length
				: Math.min(5, impact.largestSchemas.length);
			for (let i = 0; i < displayCount; i++) {
				const schema = impact.largestSchemas[i];
				const schemaKB = (schema.estimatedSize / 1024).toFixed(2);
				console.log(`    ${pc.bold(schema.name)}: ${schemaKB} KB`);
				console.log(pc.gray(`      ${schema.reason}`));
			}
			console.log();
		}

		if (impact.optimizationTips.length > 0) {
			console.log(pc.cyan('  Optimization tips:'));
			impact.optimizationTips.forEach((tip) => {
				console.log(`    • ${tip}`);
			});
			console.log();
		}
	}

	// Recommendations
	if (stats.recommendations.length > 0) {
		console.log(pc.cyan('💡 Recommendations:'));
		stats.recommendations.forEach((rec) => {
			console.log(`  • ${rec}`);
		});
		console.log();
	}
}

/**
 * Generate text report
 */
function generateTextReport(stats: SchemaStats): string {
	let report = 'ZODKIT SCHEMA STATISTICS\n';
	report += `${'='.repeat(50)}\n\n`;

	report += `Total schemas: ${stats.totalSchemas}\n\n`;

	report += 'TYPE DISTRIBUTION\n';
	report += `${'-'.repeat(50)}\n`;
	for (const [type, count] of Object.entries(stats.schemasByType)) {
		const percentage = ((count / stats.totalSchemas) * 100).toFixed(1);
		report += `${type}: ${count} (${percentage}%)\n`;
	}
	report += '\n';

	report += 'COMPLEXITY METRICS\n';
	report += `${'-'.repeat(50)}\n`;
	report += `Average depth: ${stats.complexityMetrics.averageDepth.toFixed(1)}\n`;
	report += `Max depth: ${stats.complexityMetrics.maxDepth}\n`;
	report += `Average field count: ${stats.complexityMetrics.averageFieldCount.toFixed(1)}\n`;
	report += `Max field count: ${stats.complexityMetrics.maxFieldCount}\n`;
	report += `Total refinements: ${stats.complexityMetrics.totalRefinements}\n`;
	report += `Total transforms: ${stats.complexityMetrics.totalTransforms}\n`;
	report += '\n';

	if (stats.complexityMetrics.complexSchemas.length > 0) {
		report += 'COMPLEX SCHEMAS\n';
		report += `${'-'.repeat(50)}\n`;
		for (const schema of stats.complexityMetrics.complexSchemas) {
			report += `${schema.name} (complexity: ${schema.complexity})\n`;
			schema.reasons.forEach((reason) => {
				report += `  - ${reason}\n`;
			});
		}
		report += '\n';
	}

	if (stats.usagePatterns.length > 0) {
		report += 'USAGE PATTERNS\n';
		report += `${'-'.repeat(50)}\n`;
		for (const pattern of stats.usagePatterns) {
			report += `${pattern.pattern}: ${pattern.count}\n`;
		}
		report += '\n';
	}

	if (stats.hotspots.length > 0) {
		report += 'SCHEMA HOTSPOTS\n';
		report += `${'-'.repeat(50)}\n`;
		for (const hotspot of stats.hotspots) {
			report += `${hotspot.severity.toUpperCase()} - ${hotspot.name} (${hotspot.file})\n`;
			hotspot.issues.forEach((issue) => {
				report += `  ✖ ${issue}\n`;
			});
			hotspot.suggestions.forEach((suggestion) => {
				report += `  💡 ${suggestion}\n`;
			});
			report += '\n';
		}
	}

	if (stats.recommendations.length > 0) {
		report += 'RECOMMENDATIONS\n';
		report += `${'-'.repeat(50)}\n`;
		stats.recommendations.forEach((rec) => {
			report += `• ${rec}\n`;
		});
	}

	return report;
}

// Export as default for lazy loading
export default statsCommand;
