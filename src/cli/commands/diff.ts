/**
 * @fileoverview Diff command - Compare Zod schemas and detect breaking changes
 * @module Commands/Diff
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as pc from 'picocolors';
import { SchemaDiff, type DiffOptions, type SchemaDiffResult } from '../../core/schema-diff';
import { z } from 'zod';

export interface DiffCommandOptions {
	old: string;
	new: string;
	output?: string;
	format?: 'text' | 'json' | 'markdown' | 'html';
	migration?: boolean;
	strict?: boolean;
	ignoreMetadata?: boolean;
}

/**
 * Compare two schema versions and detect changes
 */
export async function diffCommand(options: DiffCommandOptions): Promise<void> {
	try {
		console.log(pc.blue('🔍 zodkit diff - Comparing schemas...'));

		// Validate inputs
		if (!options.old || !options.new) {
			throw new Error('Both --old and --new schema paths are required');
		}

		const oldPath = resolve(options.old);
		const newPath = resolve(options.new);

		if (!existsSync(oldPath)) {
			throw new Error(`Old schema file not found: ${oldPath}`);
		}

		if (!existsSync(newPath)) {
			throw new Error(`New schema file not found: ${newPath}`);
		}

		console.log(pc.gray(`Old schema: ${oldPath}`));
		console.log(pc.gray(`New schema: ${newPath}`));

		// Load schemas
		const oldSchema = await loadSchema(oldPath);
		const newSchema = await loadSchema(newPath);

		// Create diff engine
		const diffOptions: DiffOptions = {
			detectBreaking: true,
			generateMigration: options.migration ?? true,
			ignoreMetadata: options.ignoreMetadata ?? false,
			strictMode: options.strict ?? false,
			compareDescriptions: false,
		};

		const diffEngine = new SchemaDiff(diffOptions);

		// Perform diff
		const result = diffEngine.diff(oldSchema, newSchema);

		// Format and output results
		const format = options.format || 'text';
		const output = formatDiffResult(result, format);

		if (options.output) {
			const outputPath = resolve(options.output);
			writeFileSync(outputPath, output);
			console.log(pc.green(`\n✅ Diff report saved to: ${pc.cyan(outputPath)}`));
		} else {
			console.log('\n' + output);
		}

		// Print summary
		printSummary(result);

		// Exit with appropriate code
		if (result.breakingChanges.length > 0) {
			console.log(
				pc.yellow(
					`\n⚠️  ${result.breakingChanges.length} breaking change(s) detected. Please review carefully!`,
				),
			);
			process.exit(1);
		} else {
			console.log(pc.green('\n✅ No breaking changes detected. Schema is backward compatible.'));
		}
	} catch (error) {
		console.error(
			pc.red('❌ Diff command failed:'),
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

/**
 * Load a Zod schema from a file
 */
async function loadSchema(filePath: string): Promise<z.ZodTypeAny> {
	try {
		// Dynamic import of the schema file
		const module = await import(filePath);

		// Try to find a Zod schema export
		const schema =
			module.default ||
			module.schema ||
			module.Schema ||
			Object.values(module).find((exp: any) => exp?._def?.typeName?.startsWith('Zod'));

		if (!schema || !schema._def) {
			throw new Error(`No Zod schema found in ${filePath}`);
		}

		return schema as z.ZodTypeAny;
	} catch (error) {
		throw new Error(`Failed to load schema from ${filePath}: ${error}`);
	}
}

/**
 * Format diff result based on output format
 */
function formatDiffResult(result: SchemaDiffResult, format: string): string {
	switch (format) {
		case 'json':
			return formatAsJSON(result);
		case 'markdown':
			return formatAsMarkdown(result);
		case 'html':
			return formatAsHTML(result);
		case 'text':
		default:
			return formatAsText(result);
	}
}

/**
 * Format as plain text
 */
function formatAsText(result: SchemaDiffResult): string {
	let output = '';

	output += pc.bold('\n📊 SCHEMA DIFF REPORT\n');
	output += '═'.repeat(50) + '\n\n';

	// Breaking changes
	if (result.breakingChanges.length > 0) {
		output += pc.red(pc.bold(`⚠️  BREAKING CHANGES (${result.breakingChanges.length})\n\n`));

		for (const bc of result.breakingChanges) {
			output += pc.red(`  • ${bc.type} at ${pc.cyan(bc.path)}\n`);
			output += pc.gray(`    Impact: ${bc.impact}\n`);
			output += pc.gray(`    ${bc.description}\n`);

			if (bc.mitigation) {
				output += pc.yellow(`    💡 ${bc.mitigation}\n`);
			}

			output += '\n';
		}
	}

	// All changes
	if (result.changes.length > 0) {
		output += pc.bold(`📝 ALL CHANGES (${result.changes.length})\n\n`);

		for (const change of result.changes) {
			const icon = change.breaking ? '⚠️' : '✓';
			const color = change.severity === 'error' ? pc.red : change.severity === 'warning' ? pc.yellow : pc.green;

			output += color(`  ${icon} ${change.type} at ${pc.cyan(change.path)}\n`);
			output += pc.gray(`     ${change.message}\n\n`);
		}
	}

	// Migration guide
	if (result.migrationGuide) {
		output += '\n' + '═'.repeat(50) + '\n';
		output += result.migrationGuide;
	}

	return output;
}

/**
 * Format as JSON
 */
function formatAsJSON(result: SchemaDiffResult): string {
	return JSON.stringify(result, null, 2);
}

/**
 * Format as Markdown
 */
function formatAsMarkdown(result: SchemaDiffResult): string {
	let md = '# Schema Diff Report\n\n';

	// Summary
	md += '## Summary\n\n';
	md += `- **Total Changes:** ${result.summary.totalChanges}\n`;
	md += `- **Breaking Changes:** ${result.summary.breaking}\n`;
	md += `- **Non-Breaking Changes:** ${result.summary.nonBreaking}\n`;
	md += `- **Compatible:** ${result.summary.compatible ? '✅ Yes' : '⚠️  No'}\n\n`;

	// Breaking changes
	if (result.breakingChanges.length > 0) {
		md += '## ⚠️  Breaking Changes\n\n';

		for (const bc of result.breakingChanges) {
			md += `### ${bc.type} at \`${bc.path}\`\n\n`;
			md += `**Impact:** ${bc.impact}\n\n`;
			md += `**Description:** ${bc.description}\n\n`;

			if (bc.mitigation) {
				md += `**Mitigation:** ${bc.mitigation}\n\n`;
			}
		}
	}

	// All changes
	md += '## All Changes\n\n';

	for (const change of result.changes) {
		const icon = change.breaking ? '⚠️' : '✓';
		md += `- ${icon} **${change.type}** at \`${change.path}\`: ${change.message}\n`;
	}

	md += '\n';

	// Migration guide
	if (result.migrationGuide) {
		md += '---\n\n';
		md += result.migrationGuide;
	}

	return md;
}

/**
 * Format as HTML
 */
function formatAsHTML(result: SchemaDiffResult): string {
	let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schema Diff Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat {
      padding: 15px;
      border-radius: 6px;
      background: #f8f9fa;
      border-left: 4px solid #007bff;
    }
    .stat.error { border-left-color: #dc3545; }
    .stat.success { border-left-color: #28a745; }
    .change {
      padding: 15px;
      margin: 10px 0;
      border-radius: 6px;
      border-left: 4px solid #ffc107;
    }
    .change.breaking { border-left-color: #dc3545; background: #fff5f5; }
    .change.non-breaking { border-left-color: #28a745; background: #f5fff5; }
    code {
      background: #f1f3f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
    }
    .migration {
      background: #fff9db;
      padding: 20px;
      border-radius: 6px;
      border: 1px solid #ffc107;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Schema Diff Report</h1>

    <h2>Summary</h2>
    <div class="summary">
      <div class="stat">
        <div style="font-size: 24px; font-weight: bold;">${result.summary.totalChanges}</div>
        <div style="color: #666;">Total Changes</div>
      </div>
      <div class="stat error">
        <div style="font-size: 24px; font-weight: bold;">${result.summary.breaking}</div>
        <div style="color: #666;">Breaking Changes</div>
      </div>
      <div class="stat success">
        <div style="font-size: 24px; font-weight: bold;">${result.summary.nonBreaking}</div>
        <div style="color: #666;">Non-Breaking</div>
      </div>
      <div class="stat ${result.summary.compatible ? 'success' : 'error'}">
        <div style="font-size: 24px; font-weight: bold;">${result.summary.compatible ? '✅' : '⚠️'}</div>
        <div style="color: #666;">Compatible</div>
      </div>
    </div>
`;

	// Breaking changes
	if (result.breakingChanges.length > 0) {
		html += `
    <h2>⚠️  Breaking Changes</h2>
`;

		for (const bc of result.breakingChanges) {
			html += `
    <div class="change breaking">
      <h3>${bc.type} at <code>${bc.path}</code></h3>
      <p><strong>Impact:</strong> ${bc.impact}</p>
      <p>${bc.description}</p>
      ${bc.mitigation ? `<p><strong>💡 Mitigation:</strong> ${bc.mitigation}</p>` : ''}
    </div>
`;
		}
	}

	// All changes
	html += `
    <h2>All Changes</h2>
`;

	for (const change of result.changes) {
		const className = change.breaking ? 'breaking' : 'non-breaking';
		const icon = change.breaking ? '⚠️' : '✓';

		html += `
    <div class="change ${className}">
      <strong>${icon} ${change.type}</strong> at <code>${change.path}</code>
      <p>${change.message}</p>
    </div>
`;
	}

	html += `
  </div>
</body>
</html>`;

	return html;
}

/**
 * Print summary to console
 */
function printSummary(result: SchemaDiffResult): void {
	console.log('\n' + pc.bold('📊 SUMMARY'));
	console.log('─'.repeat(40));
	console.log(`Total Changes:       ${pc.cyan(String(result.summary.totalChanges))}`);
	console.log(
		`Breaking Changes:    ${result.summary.breaking > 0 ? pc.red(String(result.summary.breaking)) : pc.green('0')}`,
	);
	console.log(`Non-Breaking:        ${pc.green(String(result.summary.nonBreaking))}`);
	console.log(`Compatible:          ${result.summary.compatible ? pc.green('✅ Yes') : pc.red('⚠️  No')}`);
	console.log('─'.repeat(40));
}

// Export as default for lazy loading
export default diffCommand;
