/**
 * @fileoverview Beautiful TUI dashboard for runtime profiling
 * @module ProfileDashboard
 */

import React, { useState, useEffect } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput } = require('ink');
import Spinner from 'ink-spinner';
import Table from 'ink-table';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { PerformanceProfilerEngine, PerformanceProfile } from '../../core/performance-profiler';

interface DashboardProps {
  profiler: PerformanceProfilerEngine;
}

const Dashboard: React.FC<DashboardProps> = ({ profiler }) => {
  const [metrics, setMetrics] = useState<PerformanceProfile | null>(null);
  const [selectedSchema, _setSelectedSchema] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'schemas' | 'timeline' | 'memory'>('overview');
  const [refreshCount, setRefreshCount] = useState(0);
  const { exit } = useApp();

  useInput((input: string, key: any) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    // Switch views
    if (input === '1') setView('overview');
    if (input === '2') setView('schemas');
    if (input === '3') setView('timeline');
    if (input === '4') setView('memory');

    // Navigation
    if (key.upArrow || input === 'k') {
      // Move selection up
    }
    if (key.downArrow || input === 'j') {
      // Move selection down
    }
  });

  useEffect(() => {
    const interval = setInterval(async () => {
      const newMetrics = await profiler.getMetrics();
      setMetrics(newMetrics);
      setRefreshCount(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [profiler]);

  if (!metrics) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" /> Loading profiler...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Gradient name="cristal">
          <BigText text="ZODKIT" font="simple" />
        </Gradient>
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginBottom={1}>
        <Text color="green">● PROFILING</Text>
        <Text color="gray">
          {metrics.totalCalls} calls | {metrics.activeSchemas} schemas |
          {' '}{(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
        </Text>
        <Text color="gray">↻ {refreshCount}</Text>
      </Box>

      {/* Navigation Tabs */}
      <Box marginBottom={1} paddingX={2}>
        <Text color={view === 'overview' ? 'cyan' : 'gray'}>[1] Overview  </Text>
        <Text color={view === 'schemas' ? 'cyan' : 'gray'}>[2] Schemas  </Text>
        <Text color={view === 'timeline' ? 'cyan' : 'gray'}>[3] Timeline  </Text>
        <Text color={view === 'memory' ? 'cyan' : 'gray'}>[4] Memory  </Text>
      </Box>

      {/* Main Content Area */}
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {view === 'overview' && <OverviewView metrics={metrics} />}
        {view === 'schemas' && <SchemasView metrics={metrics} selected={selectedSchema} />}
        {view === 'timeline' && <TimelineView metrics={metrics} />}
        {view === 'memory' && <MemoryView metrics={metrics} />}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="gray">
          [q] Quit | [1-4] Switch View | [↑↓] Navigate | [Enter] Details
        </Text>
      </Box>
    </Box>
  );
};

const OverviewView: React.FC<{ metrics: ProfileMetrics }> = ({ metrics }) => {
  const avgTime = metrics.totalCalls > 0
    ? (metrics.totalTime / metrics.totalCalls).toFixed(2)
    : '0.00';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Performance Overview</Text>
      </Box>

      {/* Key Metrics Cards */}
      <Box marginBottom={2}>
        <MetricCard
          label="Total Calls"
          value={metrics.totalCalls.toLocaleString()}
          color="green"
        />
        <MetricCard
          label="Avg Time"
          value={`${avgTime}ms`}
          color="yellow"
        />
        <MetricCard
          label="Failures"
          value={metrics.totalFailures.toLocaleString()}
          color="red"
        />
        <MetricCard
          label="Cache Hits"
          value={`${metrics.cacheHitRate.toFixed(1)}%`}
          color="blue"
        />
      </Box>

      {/* Performance Graph (ASCII) */}
      <Box flexDirection="column" borderStyle="single" padding={1} marginBottom={2}>
        <Text bold>Performance Timeline (last 60s)</Text>
        <PerformanceGraph data={metrics.timeline} />
      </Box>

      {/* Top Issues */}
      <Box flexDirection="column">
        <Text bold color="yellow">⚠ Top Issues</Text>
        {metrics.issues.slice(0, 5).map((issue, i) => (
          <Text key={i} color="yellow">
            • {issue.schema}: {issue.message}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

const SchemasView: React.FC<{ metrics: ProfileMetrics; selected: string | null }> = ({ metrics }) => {
  const schemaData = Array.from(metrics.schemas.entries())
    .map(([name, data]) => ({
      name: name.substring(0, 20),
      calls: data.calls,
      avgTime: (data.totalTime / data.calls).toFixed(2),
      p99: data.p99Time.toFixed(2),
      failures: data.failures,
      status: data.failures > 10 ? '❌' : data.p99Time > 100 ? '⚠️' : '✅'
    }))
    .sort((a, b) => b.calls - a.calls);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Schema Performance</Text>
      {/* @ts-ignore */}
      <Table data={schemaData} />
    </Box>
  );
};

const TimelineView: React.FC<{ metrics: ProfileMetrics }> = ({ metrics }) => {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Validation Timeline</Text>
      <Box flexDirection="column" marginTop={1}>
        {metrics.recentValidations.slice(0, 20).map((v, i) => (
          <Box key={i}>
            <Text color="gray">{v.timestamp}</Text>
            <Text> </Text>
            <Text color={v.success ? 'green' : 'red'}>
              {v.success ? '✓' : '✗'}
            </Text>
            <Text> </Text>
            <Text color="cyan">{v.schema}</Text>
            <Text> </Text>
            <Text color="gray">({v.duration.toFixed(2)}ms)</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const MemoryView: React.FC<{ metrics: ProfileMetrics }> = ({ metrics }) => {
  const memoryMB = (metrics.memoryUsage / 1024 / 1024).toFixed(2);
  const heapUsed = (metrics.heapUsage.used / metrics.heapUsage.total * 100).toFixed(1);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Memory Analysis</Text>

      <Box marginTop={1} marginBottom={1}>
        <Text>Heap Usage: </Text>
        <ProgressBar value={parseFloat(heapUsed)} max={100} width={30} />
        <Text> {heapUsed}%</Text>
      </Box>

      <Text>Total Memory: {memoryMB}MB</Text>
      <Text>Schema Cache: {metrics.cacheSize} entries</Text>
      <Text>Active Profilers: {metrics.activeSchemas}</Text>

      <Box marginTop={2} flexDirection="column">
        <Text bold>Memory by Schema:</Text>
        {Array.from(metrics.schemas.entries())
          .sort((a, b) => b[1].memoryUsage - a[1].memoryUsage)
          .slice(0, 10)
          .map(([name, data]) => (
            <Text key={name} color="gray">
              {name}: {(data.memoryUsage / 1024).toFixed(1)}KB
            </Text>
          ))}
      </Box>
    </Box>
  );
};

const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({
  label,
  value,
  color
}) => (
  <Box
    borderStyle="round"
    borderColor={color as any}
    padding={1}
    marginRight={2}
    minWidth={15}
  >
    <Box flexDirection="column">
      <Text color="gray" fontSize={10}>{label}</Text>
      <Text color={color as any} bold>{value}</Text>
    </Box>
  </Box>
);

const PerformanceGraph: React.FC<{ data: number[] }> = ({ data }) => {
  const maxValue = Math.max(...data, 1);
  const height = 6;

  const graph = Array(height).fill(null).map((_, row) => {
    const threshold = maxValue * ((height - row) / height);
    return data.map(value => value >= threshold ? '█' : ' ').join('');
  });

  return (
    <Box flexDirection="column">
      {graph.map((line, i) => (
        <Text key={i} color="cyan">{line}</Text>
      ))}
      <Text color="gray">{'─'.repeat(data.length)}</Text>
    </Box>
  );
};

const ProgressBar: React.FC<{ value: number; max: number; width: number }> = ({
  value,
  max,
  width
}) => {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
    </Text>
  );
};

export class ProfileDashboard {
  private profiler: SchemaProfiler;

  constructor(profiler: SchemaProfiler) {
    this.profiler = profiler;
  }

  async start(): Promise<void> {
    // @ts-ignore - Ink type compatibility
    const app = render(<Dashboard profiler={this.profiler} />);
    // @ts-ignore - waitUntilExit method availability
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore - waitUntilExit method call
      await app.waitUntilExit();
    }
  }
}