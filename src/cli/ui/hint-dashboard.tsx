/**
 * @fileoverview Interactive TUI dashboard for hint analysis
 * @module HintDashboard
 */

import React, { useState, useEffect } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput } = require('ink');
import Spinner from 'ink-spinner';
import Table from 'ink-table';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { HintEngine, Hint, HintRule } from '../../core/hint-engine';
import * as path from 'path';

interface HintDashboardProps {
  engine: HintEngine;
  patterns: string[];
  autoFix?: boolean;
}

interface HintState {
  hints: Map<string, Hint[]>;
  selectedFile: string | null;
  selectedHint: number;
  view: 'overview' | 'by-file' | 'by-rule' | 'fixable';
  filter: 'all' | 'error' | 'warning' | 'info' | 'performance';
  isScanning: boolean;
  lastScan: Date | null;
  fixedCount: number;
  showHelp: boolean;
}

const HintDashboard: React.FC<HintDashboardProps> = ({ engine, patterns, autoFix }) => {
  const [state, setState] = useState<HintState>({
    hints: new Map(),
    selectedFile: null,
    selectedHint: 0,
    view: 'overview',
    filter: 'all',
    isScanning: false,
    lastScan: null,
    fixedCount: 0,
    showHelp: false
  });

  const { exit } = useApp();

  useInput((input: string, key: any) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    // View switching
    if (input === '1') setState(s => ({ ...s, view: 'overview' }));
    if (input === '2') setState(s => ({ ...s, view: 'by-file' }));
    if (input === '3') setState(s => ({ ...s, view: 'by-rule' }));
    if (input === '4') setState(s => ({ ...s, view: 'fixable' }));

    // Filter switching
    if (input === 'a') setState(s => ({ ...s, filter: 'all' }));
    if (input === 'e') setState(s => ({ ...s, filter: 'error' }));
    if (input === 'w') setState(s => ({ ...s, filter: 'warning' }));
    if (input === 'i') setState(s => ({ ...s, filter: 'info' }));
    if (input === 'p') setState(s => ({ ...s, filter: 'performance' }));

    // Navigation
    if (key.upArrow || input === 'k') {
      setState(s => ({
        ...s,
        selectedHint: Math.max(0, s.selectedHint - 1)
      }));
    }
    if (key.downArrow || input === 'j') {
      setState(s => ({
        ...s,
        selectedHint: Math.min(getTotalHints(s.hints) - 1, s.selectedHint + 1)
      }));
    }

    // Actions
    if (input === 'f') {
      applySelectedFix();
    }
    if (input === 'F') {
      applyAllFixes();
    }
    if (input === 'r' || input === 's') {
      scanFiles();
    }
    if (input === '?') {
      setState(s => ({ ...s, showHelp: !s.showHelp }));
    }
  });

  const scanFiles = async () => {
    setState(s => ({ ...s, isScanning: true }));
    const results = await engine.analyzeProject(patterns);
    setState(s => ({
      ...s,
      hints: results,
      isScanning: false,
      lastScan: new Date()
    }));
  };

  const applySelectedFix = async () => {
    const allHints = Array.from(state.hints.values()).flat();
    const hint = allHints[state.selectedHint];

    if (hint?.fix) {
      await engine.applyFixes([hint]);
      setState(s => ({ ...s, fixedCount: s.fixedCount + 1 }));
      scanFiles(); // Rescan after fix
    }
  };

  const applyAllFixes = async () => {
    const fixableHints = Array.from(state.hints.values())
      .flat()
      .filter(h => h.fix);

    if (fixableHints.length > 0) {
      const fixed = await engine.applyFixes(fixableHints);
      setState(s => ({ ...s, fixedCount: s.fixedCount + fixed }));
      scanFiles(); // Rescan after fixes
    }
  };

  // Initial scan
  useEffect(() => {
    scanFiles();
  }, []);

  // Auto-fix if enabled
  useEffect(() => {
    if (autoFix && state.hints.size > 0) {
      const fixableHints = Array.from(state.hints.values())
        .flat()
        .filter(h => h.fix);
      if (fixableHints.length > 0) {
        applyAllFixes();
      }
    }
  }, [state.hints]);

  if (state.showHelp) {
    return <HelpView onClose={() => setState(s => ({ ...s, showHelp: false }))} />;
  }

  const stats = getHintStats(state.hints, state.filter);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Gradient name="pastel">
          <BigText text="HINT" font="simple" />
        </Gradient>
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginBottom={1}>
        <Text color={state.isScanning ? 'yellow' : 'green'}>
          {state.isScanning ? <Spinner type="dots" /> : '●'} {state.isScanning ? 'Scanning...' : 'Ready'}
        </Text>
        <Text color="gray">
          {stats.total} hints | {stats.files} files | Fixed: {state.fixedCount}
        </Text>
        <Text color="gray">
          {state.lastScan ? `Last scan: ${state.lastScan.toLocaleTimeString()}` : 'Not scanned'}
        </Text>
      </Box>

      {/* View Tabs */}
      <Box marginBottom={1} paddingX={2}>
        <Text color={state.view === 'overview' ? 'cyan' : 'gray'}>[1] Overview  </Text>
        <Text color={state.view === 'by-file' ? 'cyan' : 'gray'}>[2] By File  </Text>
        <Text color={state.view === 'by-rule' ? 'cyan' : 'gray'}>[3] By Rule  </Text>
        <Text color={state.view === 'fixable' ? 'cyan' : 'gray'}>[4] Fixable  </Text>
      </Box>

      {/* Filter Bar */}
      <Box marginBottom={1} paddingX={2}>
        <Text color="gray">Filter: </Text>
        <Text color={state.filter === 'all' ? 'white' : 'gray'}>[a]ll  </Text>
        <Text color={state.filter === 'error' ? 'red' : 'gray'}>[e]rrors  </Text>
        <Text color={state.filter === 'warning' ? 'yellow' : 'gray'}>[w]arnings  </Text>
        <Text color={state.filter === 'info' ? 'blue' : 'gray'}>[i]nfo  </Text>
        <Text color={state.filter === 'performance' ? 'magenta' : 'gray'}>[p]erformance  </Text>
      </Box>

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {state.view === 'overview' && <OverviewView hints={state.hints} filter={state.filter} />}
        {state.view === 'by-file' && <FileView hints={state.hints} filter={state.filter} selectedHint={state.selectedHint} />}
        {state.view === 'by-rule' && <RuleView hints={state.hints} filter={state.filter} engine={engine} />}
        {state.view === 'fixable' && <FixableView hints={state.hints} selectedHint={state.selectedHint} />}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="gray">
          [q] Quit | [1-4] Views | [↑↓] Navigate | [f] Fix Selected | [F] Fix All | [r] Rescan | [?] Help
        </Text>
      </Box>
    </Box>
  );
};

const OverviewView: React.FC<{ hints: Map<string, Hint[]>; filter: string }> = ({ hints, filter }) => {
  const stats = getHintStats(hints, filter);
  const topIssues = getTopIssues(hints, filter, 10);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Hint Overview</Text>

      {/* Stats Cards */}
      <Box marginBottom={2}>
        <MetricCard label="Errors" value={stats.errors} color="red" />
        <MetricCard label="Warnings" value={stats.warnings} color="yellow" />
        <MetricCard label="Info" value={stats.info} color="blue" />
        <MetricCard label="Performance" value={stats.performance} color="magenta" />
      </Box>

      {/* Issue Distribution */}
      <Box flexDirection="column" borderStyle="single" padding={1} marginBottom={2}>
        <Text bold>Issue Distribution</Text>
        <IssueBar errors={stats.errors} warnings={stats.warnings} info={stats.info} performance={stats.performance} />
      </Box>

      {/* Top Issues */}
      <Box flexDirection="column">
        <Text bold color="yellow" marginBottom={1}>Top Issues</Text>
        {topIssues.length === 0 ? (
          <Text color="green">✨ No issues found!</Text>
        ) : (
          topIssues.map((issue, i) => (
            <Box key={i}>
              <Text color={getSeverityColor(issue.severity)}>
                {getSeverityIcon(issue.severity)} {issue.message}
              </Text>
              <Text color="gray"> ({issue.count}x)</Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

const FileView: React.FC<{ hints: Map<string, Hint[]>; filter: string; selectedHint: number }> = ({ hints, filter, selectedHint }) => {
  const filteredHints = filterHints(hints, filter);
  const allHints = Array.from(filteredHints.values()).flat();
  const selectedHintData = allHints[selectedHint];

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Hints by File</Text>

      {filteredHints.size === 0 ? (
        <Text color="green">✨ No hints found with current filter!</Text>
      ) : (
        <Box flexDirection="column">
          {Array.from(filteredHints.entries()).map(([file, fileHints]) => (
            <Box key={file} flexDirection="column" marginBottom={1}>
              <Text color="cyan">{path.relative(process.cwd(), file)}</Text>
              {fileHints.map((hint, i) => {
                const globalIndex = allHints.indexOf(hint);
                const isSelected = globalIndex === selectedHint;

                return (
                  <Box key={i} paddingLeft={2}>
                    <Text color={isSelected ? 'white' : 'gray'}>
                      {isSelected ? '▶' : ' '} {getSeverityIcon(hint.severity)}
                    </Text>
                    <Text color={getSeverityColor(hint.severity)}>
                      [{hint.line}:{hint.column}] {hint.message}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {/* Selected hint details */}
      {selectedHintData && (
        <Box borderStyle="single" borderColor="cyan" padding={1} marginTop={2}>
          <Box flexDirection="column">
            <Text bold>Selected Hint Details</Text>
            <Text>Rule: {selectedHintData.rule}</Text>
            <Text>Severity: {selectedHintData.severity}</Text>
            {selectedHintData.fix && (
              <>
                <Text color="green">✓ Auto-fixable</Text>
                <Text>Fix: {selectedHintData.fix.description}</Text>
              </>
            )}
            {selectedHintData.documentation && (
              <Text color="blue">📚 {selectedHintData.documentation}</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

const RuleView: React.FC<{ hints: Map<string, Hint[]>; filter: string; engine: HintEngine }> = ({ hints, filter, engine }) => {
  const ruleStats = getRuleStats(hints, filter);
  const rules = engine.getRules();

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Hints by Rule</Text>

      <Table
        data={rules.map(rule => {
          const count = ruleStats.get(rule.id) || 0;
          return {
            rule: rule.name.substring(0, 30),
            category: rule.category,
            severity: rule.severity,
            count,
            fixable: rule.autoFixable ? '✓' : '✗'
          };
        }).filter(r => r.count > 0 || filter === 'all')}
      />
    </Box>
  );
};

const FixableView: React.FC<{ hints: Map<string, Hint[]>; selectedHint: number }> = ({ hints, selectedHint }) => {
  const fixableHints = Array.from(hints.values())
    .flat()
    .filter(h => h.fix);

  const selectedFixable = fixableHints[Math.min(selectedHint, fixableHints.length - 1)];

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Auto-Fixable Issues ({fixableHints.length})</Text>

      {fixableHints.length === 0 ? (
        <Text color="gray">No auto-fixable issues found.</Text>
      ) : (
        <>
          <Box flexDirection="column">
            {fixableHints.map((hint, i) => {
              const isSelected = i === selectedHint;
              return (
                <Box key={i}>
                  <Text color={isSelected ? 'white' : 'gray'}>
                    {isSelected ? '▶' : ' '}
                  </Text>
                  <Text color="green">🔧</Text>
                  <Text> {path.basename(hint.file)}:{hint.line} - {hint.message}</Text>
                </Box>
              );
            })}
          </Box>

          {selectedFixable && (
            <Box borderStyle="single" borderColor="green" padding={1} marginTop={2}>
              <Box flexDirection="column">
                <Text bold>Fix Preview</Text>
                <Text>Issue: {selectedFixable.message}</Text>
                <Text color="green">→ {selectedFixable.fix!.description}</Text>
                <Text color="gray">Press [f] to apply this fix</Text>
              </Box>
            </Box>
          )}
        </>
      )}

      <Box marginTop={2}>
        <Text color="gray">Press [F] to apply all {fixableHints.length} fixes at once</Text>
      </Box>
    </Box>
  );
};

const HelpView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useInput((input: string) => {
    if (input === '?' || input === 'q') {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan" marginBottom={1}>Hint Dashboard Help</Text>

      <Text bold marginBottom={1}>Views:</Text>
      <Text>[1] Overview - Summary and statistics</Text>
      <Text>[2] By File  - Hints organized by file</Text>
      <Text>[3] By Rule  - Hints grouped by rule type</Text>
      <Text>[4] Fixable  - Only show auto-fixable issues</Text>

      <Text bold marginTop={1} marginBottom={1}>Filters:</Text>
      <Text>[a] All        - Show all hints</Text>
      <Text>[e] Errors     - Only errors</Text>
      <Text>[w] Warnings   - Only warnings</Text>
      <Text>[i] Info       - Only informational hints</Text>
      <Text>[p] Performance - Only performance hints</Text>

      <Text bold marginTop={1} marginBottom={1}>Actions:</Text>
      <Text>[f] Fix Selected - Apply fix for selected hint</Text>
      <Text>[F] Fix All      - Apply all available fixes</Text>
      <Text>[r] Rescan       - Rescan all files</Text>
      <Text>[↑↓/jk] Navigate - Move selection</Text>

      <Text bold marginTop={1} marginBottom={1}>Severity Icons:</Text>
      <Text color="red">✖ Error     - Must fix</Text>
      <Text color="yellow">⚠ Warning   - Should fix</Text>
      <Text color="blue">ℹ Info      - Consider fixing</Text>
      <Text color="magenta">⚡ Performance - Optimization opportunity</Text>

      <Text marginTop={2} color="gray">Press [?] or [q] to close help</Text>
    </Box>
  );
};

// Helper Components
const MetricCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <Box
    borderStyle="round"
    borderColor={color as any}
    padding={1}
    marginRight={2}
    minWidth={12}
  >
    <Box flexDirection="column">
      <Text color="gray">{label}</Text>
      <Text color={color as any} bold>{value}</Text>
    </Box>
  </Box>
);

const IssueBar: React.FC<{ errors: number; warnings: number; info: number; performance: number }> = ({
  errors,
  warnings,
  info,
  performance
}) => {
  const total = errors + warnings + info + performance;
  if (total === 0) return <Text color="green">No issues</Text>;

  const width = 40;
  const errorWidth = Math.round((errors / total) * width);
  const warningWidth = Math.round((warnings / total) * width);
  const infoWidth = Math.round((info / total) * width);
  const perfWidth = width - errorWidth - warningWidth - infoWidth;

  return (
    <Text>
      <Text color="red">{'█'.repeat(errorWidth)}</Text>
      <Text color="yellow">{'█'.repeat(warningWidth)}</Text>
      <Text color="blue">{'█'.repeat(infoWidth)}</Text>
      <Text color="magenta">{'█'.repeat(perfWidth)}</Text>
    </Text>
  );
};

// Helper functions
function getTotalHints(hints: Map<string, Hint[]>): number {
  return Array.from(hints.values()).reduce((sum, h) => sum + h.length, 0);
}

function getHintStats(hints: Map<string, Hint[]>, filter: string) {
  const filtered = filterHints(hints, filter);
  let errors = 0, warnings = 0, info = 0, performance = 0;

  for (const fileHints of filtered.values()) {
    for (const hint of fileHints) {
      switch (hint.severity) {
        case 'error': errors++; break;
        case 'warning': warnings++; break;
        case 'info': info++; break;
        case 'performance': performance++; break;
      }
    }
  }

  return {
    total: errors + warnings + info + performance,
    files: filtered.size,
    errors,
    warnings,
    info,
    performance
  };
}

function filterHints(hints: Map<string, Hint[]>, filter: string): Map<string, Hint[]> {
  if (filter === 'all') return hints;

  const filtered = new Map<string, Hint[]>();
  for (const [file, fileHints] of hints) {
    const filteredHints = fileHints.filter(h => h.severity === filter);
    if (filteredHints.length > 0) {
      filtered.set(file, filteredHints);
    }
  }
  return filtered;
}

function getTopIssues(hints: Map<string, Hint[]>, filter: string, limit: number) {
  const issueCount = new Map<string, { hint: Hint; count: number }>();

  const filtered = filterHints(hints, filter);
  for (const fileHints of filtered.values()) {
    for (const hint of fileHints) {
      const key = `${hint.severity}:${hint.message}`;
      const existing = issueCount.get(key);
      if (existing) {
        existing.count++;
      } else {
        issueCount.set(key, { hint, count: 1 });
      }
    }
  }

  return Array.from(issueCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ hint, count }) => ({
      severity: hint.severity,
      message: hint.message.length > 50 ? hint.message.substring(0, 47) + '...' : hint.message,
      count
    }));
}

function getRuleStats(hints: Map<string, Hint[]>, filter: string): Map<string, number> {
  const stats = new Map<string, number>();
  const filtered = filterHints(hints, filter);

  for (const fileHints of filtered.values()) {
    for (const hint of fileHints) {
      stats.set(hint.rule, (stats.get(hint.rule) || 0) + 1);
    }
  }

  return stats;
}

function getSeverityIcon(severity: Hint['severity']): string {
  switch (severity) {
    case 'error': return '✖';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    case 'performance': return '⚡';
  }
}

function getSeverityColor(severity: Hint['severity']): string {
  switch (severity) {
    case 'error': return 'red';
    case 'warning': return 'yellow';
    case 'info': return 'blue';
    case 'performance': return 'magenta';
  }
}

// Export the dashboard class
export class HintDashboardUI {
  private engine: HintEngine;
  private patterns: string[];
  private autoFix: boolean;

  constructor(engine: HintEngine, patterns: string[], autoFix = false) {
    this.engine = engine;
    this.patterns = patterns;
    this.autoFix = autoFix;
  }

  async start(): Promise<void> {
    // @ts-ignore - Ink type compatibility
    const app = render(
      <HintDashboard
        engine={this.engine}
        patterns={this.patterns}
        autoFix={this.autoFix}
      />
    );
    // @ts-ignore - waitUntilExit method availability
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore - waitUntilExit method call
      await app.waitUntilExit();
    }
  }
}