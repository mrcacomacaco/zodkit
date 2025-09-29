/**
 * @fileoverview Inline performance & best practice suggestions for Zod schemas
 * @module HintCommand
 */

import * as pc from 'picocolors';
import { watch } from 'chokidar';
import { HintEngine, Hint } from '../../core/analysis/hint-engine';
import { ConfigManager } from '../../core/config';
import { HintDashboardUI } from '../ui/hint-dashboard';
import * as path from 'path';

interface HintOptions {
  watch?: boolean;
  fix?: boolean;
  severity?: string;
  rules?: string;
  json?: boolean;
  quiet?: boolean;
  config?: string;
  output?: string;
  interactive?: boolean;
  // Performance optimization options (from optimize.ts)
  optimize?: boolean;
  aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  autoApply?: boolean;
  dryRun?: boolean;
  benchmark?: boolean;
}

export async function hintCommand(
  patterns: string[] | undefined,
  options: HintOptions
): Promise<void> {
  try {
    // Default pattern if none provided
    const searchPatterns = patterns && patterns.length > 0
      ? patterns
      : ['src/**/*.ts', 'src/**/*.tsx'];

    if (!options.quiet && !options.json) {
      console.log(pc.blue('💡 zodkit hint') + pc.gray(' - Analyzing schemas for improvements...'));
    }

    // Load configuration
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig(options.config);

    // Parse severity levels
    const severityFilter = options.severity
      ? options.severity.split(',') as Hint['severity'][]
      : undefined;

    // Parse specific rules
    const ruleFilter = options.rules
      ? options.rules.split(',')
      : undefined;

    // Initialize hint engine
    const engine = new HintEngine({
      severity: severityFilter,
      rules: ruleFilter,
      autoFix: options.fix,
      cache: true,
      configPath: options.config
    });

    // Launch interactive TUI if requested
    if (options.interactive) {
      const dashboard = new HintDashboardUI(engine, searchPatterns, options.fix);
      await dashboard.start();
    } else if (options.watch) {
      await runWatchMode(engine, searchPatterns, options);
    } else {
      await runSingleAnalysis(engine, searchPatterns, options);
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, null, 2));
    } else {
      console.error(pc.red('❌ Error:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function runSingleAnalysis(
  engine: HintEngine,
  patterns: string[],
  options: HintOptions
): Promise<void> {
  const startTime = Date.now();
  const results = await engine.analyzeProject(patterns);

  let totalHints = 0;
  let hintsBySeverity = {
    error: 0,
    warning: 0,
    info: 0,
    performance: 0
  };

  const allHints: Hint[] = [];

  for (const [, hints] of results) {
    totalHints += hints.length;
    allHints.push(...hints);

    for (const hint of hints) {
      hintsBySeverity[hint.severity]++;
    }
  }

  // Apply fixes if requested
  if (options.fix && !options.json && !options.quiet) {
    const fixableHints = allHints.filter(h => h.fix);
    if (fixableHints.length > 0) {
      console.log(pc.yellow(`\n🔧 Applying ${fixableHints.length} auto-fixes...`));
      const fixed = await engine.applyFixes(fixableHints);
      console.log(pc.green(`✓ Applied ${fixed} fixes`));
    }
  }

  // Output results
  if (options.json) {
    const output = {
      success: true,
      files: results.size,
      totalHints,
      hintsBySeverity,
      hints: Array.from(results.entries()).map(([file, hints]) => ({
        file,
        hints
      })),
      duration: Date.now() - startTime
    };
    console.log(JSON.stringify(output, null, 2));
  } else if (!options.quiet) {
    displayResults(results, hintsBySeverity, totalHints, Date.now() - startTime);
  }

  // Exit with error code if there are errors
  if (hintsBySeverity.error > 0) {
    process.exit(1);
  }
}

async function runWatchMode(
  engine: HintEngine,
  patterns: string[],
  options: HintOptions
): Promise<void> {
  if (!options.quiet && !options.json) {
    console.log(pc.yellow('👀 Watch mode enabled - monitoring for changes...'));
    console.log(pc.gray('Press Ctrl+C to exit\n'));
  }

  const watcher = watch(patterns, {
    persistent: true,
    ignoreInitial: false,
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**']
  });

  const fileHints = new Map<string, Hint[]>();
  let isProcessing = false;

  const processFile = async (filePath: string) => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const hints = await engine.analyzeFile(filePath);

      if (hints.length > 0) {
        fileHints.set(filePath, hints);
      } else {
        fileHints.delete(filePath);
      }

      // Clear console and redraw
      if (!options.json && !options.quiet) {
        console.clear();
        console.log(pc.blue('💡 zodkit hint') + pc.gray(' - Watch mode\n'));

        if (fileHints.size === 0) {
          console.log(pc.green('✨ All clear! No hints found.'));
        } else {
          let totalHints = 0;
          const hintsBySeverity = {
            error: 0,
            warning: 0,
            info: 0,
            performance: 0
          };

          for (const hints of fileHints.values()) {
            totalHints += hints.length;
            for (const hint of hints) {
              hintsBySeverity[hint.severity]++;
            }
          }

          displayResults(fileHints, hintsBySeverity, totalHints, 0);
        }

        console.log(pc.gray('\nWatching for changes... (Ctrl+C to exit)'));
      } else if (options.json) {
        const allHints = Array.from(fileHints.values()).flat();
        console.log(JSON.stringify({
          event: 'update',
          file: filePath,
          hints: hints,
          totalHints: allHints.length
        }));
      }

      // Auto-fix if enabled
      if (options.fix && hints.length > 0) {
        const fixableHints = hints.filter(h => h.fix);
        if (fixableHints.length > 0) {
          await engine.applyFixes(fixableHints);
          if (!options.quiet && !options.json) {
            console.log(pc.green(`\n✓ Auto-fixed ${fixableHints.length} issues in ${path.basename(filePath)}`));
          }
        }
      }
    } finally {
      isProcessing = false;
    }
  };

  watcher
    .on('add', processFile)
    .on('change', async (filePath) => {
      engine.clearCache();
      await processFile(filePath);
    })
    .on('unlink', (filePath) => {
      fileHints.delete(filePath);
    });

  // Keep process alive
  process.stdin.resume();
}

function displayResults(
  results: Map<string, Hint[]>,
  hintsBySeverity: Record<Hint['severity'], number>,
  totalHints: number,
  duration: number
): void {
  if (totalHints === 0) {
    console.log(pc.green('✨ Excellent! No improvements needed.'));
    return;
  }

  // Display hints by file
  for (const [file, hints] of results) {
    console.log(`\n${pc.cyan(path.relative(process.cwd(), file))}`);

    for (const hint of hints) {
      const icon = getSeverityIcon(hint.severity);
      const color = getSeverityColor(hint.severity);

      console.log(
        `  ${icon} ${pc.gray(`[${hint.line}:${hint.column}]`)} ${color(hint.message)}`
      );

      if (hint.fix) {
        console.log(
          `    ${pc.gray('→')} ${pc.green('Fix available:')} ${hint.fix.description}`
        );
      }

      if (hint.documentation) {
        console.log(
          `    ${pc.gray('→')} ${pc.blue('Learn more:')} ${hint.documentation}`
        );
      }
    }
  }

  // Summary
  console.log('\n' + pc.gray('─'.repeat(60)));
  console.log(pc.bold('Summary:'));

  const parts: string[] = [];
  if (hintsBySeverity.error > 0) {
    parts.push(pc.red(`${hintsBySeverity.error} errors`));
  }
  if (hintsBySeverity.warning > 0) {
    parts.push(pc.yellow(`${hintsBySeverity.warning} warnings`));
  }
  if (hintsBySeverity.info > 0) {
    parts.push(pc.blue(`${hintsBySeverity.info} suggestions`));
  }
  if (hintsBySeverity.performance > 0) {
    parts.push(pc.magenta(`${hintsBySeverity.performance} performance tips`));
  }

  console.log(`Found ${parts.join(', ')} in ${results.size} file${results.size === 1 ? '' : 's'}`);

  if (duration > 0) {
    console.log(pc.gray(`Completed in ${duration}ms`));
  }

  // Tip for auto-fix
  const fixableCount = Array.from(results.values())
    .flat()
    .filter(h => h.fix)
    .length;

  if (fixableCount > 0) {
    console.log(
      pc.gray(`\n💡 Tip: Run with ${pc.bold('--fix')} to automatically fix ${fixableCount} issue${fixableCount === 1 ? '' : 's'}`)
    );
  }
}

function getSeverityIcon(severity: Hint['severity']): string {
  switch (severity) {
    case 'error': return pc.red('✖');
    case 'warning': return pc.yellow('⚠');
    case 'info': return pc.blue('ℹ');
    case 'performance': return pc.magenta('⚡');
  }
}

function getSeverityColor(severity: Hint['severity']): (str: string) => string {
  switch (severity) {
    case 'error': return pc.red;
    case 'warning': return pc.yellow;
    case 'info': return pc.blue;
    case 'performance': return pc.magenta;
  }
}