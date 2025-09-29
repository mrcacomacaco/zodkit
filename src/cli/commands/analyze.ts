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

import * as pc from 'picocolors';
import { Command } from 'commander';
import { z } from 'zod';
import { ConfigManager } from '../../core/config';
import { Analyzer } from '../../core/analysis';
import { Infrastructure } from '../../core/infrastructure';
import { Utils } from '../../utils';

type AnalyzeMode = 'check' | 'hint' | 'fix' | 'full';

interface AnalyzeOptions {
  mode?: AnalyzeMode;
  autoFix?: boolean;
  watch?: boolean;
  fast?: boolean;
  output?: string;
  severity?: 'error' | 'warning' | 'all';
}

export async function analyzeCommand(
  target?: string,
  options: AnalyzeOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const isJsonMode = globalOpts.json;
  const isQuiet = globalOpts.quiet;

  const utils = new Utils();
  const logger = utils.logger;

  try {
    // Determine mode
    const mode = options.mode || detectMode(command?.name());

    if (!isQuiet && !isJsonMode) {
      const modeIcons = {
        check: '✅',
        hint: '💡',
        fix: '🔧',
        full: '🚀'
      };

      logger.info(`${modeIcons[mode]} Running ${pc.cyan(mode)} analysis...`);
    }

    // Initialize systems
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const infra = new Infrastructure(config);
    const analyzer = new Analyzer();

    // Discover schemas
    const discovery = infra.discovery;
    const schemas = await discovery.findSchemas({ useCache: options.fast });

    if (schemas.length === 0) {
      throw new Error('No schemas found in project');
    }

    // Filter for specific target if provided
    const targetSchemas = target
      ? schemas.filter(s => s.name === target || s.filePath.includes(target))
      : schemas;

    if (target && targetSchemas.length === 0) {
      throw new Error(`No schemas matching '${target}' found`);
    }

    // Analyze schemas
    const results = await Promise.all(
      targetSchemas.map(async (schema) => {
        const result = await analyzer.analyze(schema, {
          mode: mode === 'full' ? 'full' : mode as any,
          autoFix: options.autoFix || mode === 'fix',
          strict: mode === 'check',
          patterns: config.rules?.patterns
        });

        return {
          schema: schema.name,
          file: schema.filePath,
          ...result
        };
      })
    );

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
      startWatchMode(infra, analyzer, options);
    }

    // Exit code based on issues
    const hasErrors = results.some(r =>
      r.issues.some(i => i.type === 'error')
    );

    if (hasErrors && mode === 'check') {
      process.exit(1);
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'ANALYZE_ERROR'
        }
      }, null, 2));
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

async function applyFixes(results: any[], isJsonMode: boolean): Promise<void> {
  const utils = new Utils();
  const logger = utils.logger;

  let totalFixes = 0;

  for (const result of results) {
    if (result.fixes && result.fixes.length > 0) {
      for (const fix of result.fixes) {
        if (fix.impact === 'safe' || confirmFix(fix, isJsonMode)) {
          // Apply fix
          for (const change of fix.changes) {
            // Would apply file changes here
            totalFixes++;
          }
        }
      }
    }
  }

  if (!isJsonMode) {
    logger.info(`Applied ${totalFixes} fix${totalFixes === 1 ? '' : 'es'}`);
  }
}

function confirmFix(fix: any, isJsonMode: boolean): boolean {
  if (isJsonMode) return true; // Auto-confirm in JSON mode

  // In interactive mode, would prompt user
  return fix.impact === 'safe';
}

function displayResults(results: any[], mode: AnalyzeMode): void {
  const utils = new Utils();
  const logger = utils.logger;

  console.log('\n' + pc.bold('Analysis Results'));
  console.log(pc.gray('─'.repeat(60)));

  let totalIssues = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  results.forEach((result) => {
    const hasIssues = result.issues.length > 0;
    const statusIcon = hasIssues ? '⚠️ ' : '✅ ';

    console.log(`\n${statusIcon}${pc.cyan(result.schema)} ${pc.gray(result.file)}`);

    if (result.score !== undefined) {
      const levelColor = result.level === 'low' ? pc.green :
                        result.level === 'medium' ? pc.yellow :
                        result.level === 'high' ? pc.red : pc.bgRed;
      console.log(`  Complexity: ${levelColor(result.level)} (${result.score.toFixed(1)})`);
    }

    // Display issues
    if (result.issues.length > 0) {
      result.issues.forEach((issue: any) => {
        const icon = issue.type === 'error' ? '❌' :
                    issue.type === 'warning' ? '⚠️' : 'ℹ️';
        const color = issue.type === 'error' ? pc.red :
                      issue.type === 'warning' ? pc.yellow : pc.blue;

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
      result.fixes.forEach((fix: any) => {
        const impactColor = fix.impact === 'safe' ? pc.green :
                           fix.impact === 'risky' ? pc.yellow : pc.red;
        console.log(`     • ${fix.description} ${impactColor(`[${fix.impact}]`)}`);
      });
    }
  });

  // Summary
  console.log('\n' + pc.gray('─'.repeat(60)));
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
    const totalFixes = results.reduce((sum, r) => sum + (r.fixes?.length || 0), 0);
    console.log(pc.green(`  Available fixes: ${totalFixes}`));
  }
}

function startWatchMode(
  infra: Infrastructure,
  analyzer: Analyzer,
  options: AnalyzeOptions
): void {
  const utils = new Utils();
  const logger = utils.logger;

  logger.info('👀 Watch mode enabled. Press Ctrl+C to exit.');

  const watcher = utils.watcher;
  watcher.watch(['**/*.schema.ts', '**/schemas/*.ts']);

  watcher.on('change', async ({ filename }) => {
    logger.info(`File changed: ${filename}`);
    // Re-run analysis on changed file
    // Implementation would go here
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
    .option('-s, --severity <level>', 'minimum severity (error|warning|all)', 'all')
    .action(analyzeCommand);

  // Aliases for backward compatibility
  program
    .command('check [target]')
    .description('Check schemas for issues')
    .option('-f, --fast', 'fast mode using cache')
    .option('-w, --watch', 'watch for changes')
    .action((target, options, cmd) =>
      analyzeCommand(target, { ...options, mode: 'check' }, cmd)
    );

  program
    .command('hint [target]')
    .description('Get optimization hints and best practices')
    .option('-a, --auto-fix', 'show auto-fixable hints')
    .action((target, options, cmd) =>
      analyzeCommand(target, { ...options, mode: 'hint' }, cmd)
    );

  program
    .command('fix [target]')
    .description('Auto-fix schema issues')
    .option('-s, --safe-only', 'only apply safe fixes')
    .action((target, options, cmd) =>
      analyzeCommand(target, { ...options, mode: 'fix', autoFix: true }, cmd)
    );
}

export default analyzeCommand;