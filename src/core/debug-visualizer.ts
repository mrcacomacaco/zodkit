/**
 * @fileoverview Debug Visualization Utilities
 * @module DebugVisualizer
 *
 * Provides visual debugging utilities including:
 * - ASCII charts and graphs for performance data
 * - Call stack visualization
 * - Memory usage timeline
 * - Execution flow diagrams
 * - Interactive console displays
 */

import * as pc from 'picocolors';
import type { TraceEntry, PerformanceProfile, DebugSession } from './debug-tracer';

// === VISUALIZATION INTERFACES ===

export interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
  showLegend?: boolean;
  colorize?: boolean;
  showValues?: boolean;
}

export interface TimelineOptions extends ChartOptions {
  timeFormat?: 'relative' | 'absolute' | 'duration';
  granularity?: 'ms' | 's' | 'm';
}

export interface FlowDiagramOptions {
  maxDepth?: number;
  showTiming?: boolean;
  showMemory?: boolean;
  compactMode?: boolean;
}

// === DEBUG VISUALIZER ===

export class DebugVisualizer {
  private readonly colorize: boolean;

  constructor(colorize: boolean = true) {
    this.colorize = colorize;
  }

  /**
   * Generate ASCII bar chart for performance profiles
   */
  generatePerformanceChart(profiles: PerformanceProfile[], options: ChartOptions = {}): string {
    const {
      width = 60,
      height = 20,
      title = 'Performance Profile',
      showLegend = true,
      showValues = true
    } = options;

    if (profiles.length === 0) {
      return this.colorText('No performance data available', 'gray');
    }

    let output = '';

    // Title
    if (title) {
      output += this.colorText(`\n${title}\n`, 'cyan');
      output += this.colorText('─'.repeat(Math.min(title.length, width)), 'gray') + '\n';
    }

    // Sort by total time and take top entries
    const sortedProfiles = profiles
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, height);

    if (sortedProfiles.length === 0) {
      return output + this.colorText('No data to display\n', 'gray');
    }

    const maxTime = Math.max(...sortedProfiles.map(p => p.totalTime));
    const maxNameLength = Math.max(...sortedProfiles.map(p => p.function.length));
    const nameWidth = Math.min(maxNameLength, 25);
    const barWidth = width - nameWidth - 15; // Space for name and value

    sortedProfiles.forEach(profile => {
      const normalizedTime = profile.totalTime / maxTime;
      const barLength = Math.round(normalizedTime * barWidth);
      const truncatedName = profile.function.length > nameWidth
        ? profile.function.substring(0, nameWidth - 3) + '...'
        : profile.function.padEnd(nameWidth);

      // Color based on performance
      const barColor = profile.hotPath ? 'red' :
                      profile.avgTime > 50 ? 'yellow' : 'green';

      const bar = '█'.repeat(barLength);
      const value = showValues ? ` ${profile.totalTime.toFixed(1)}ms` : '';

      output += `${truncatedName} ${this.colorText(bar, barColor)}${value}\n`;
    });

    // Legend
    if (showLegend) {
      output += '\n';
      output += this.colorText('Legend: ', 'gray');
      output += this.colorText('█', 'green') + ' Normal ';
      output += this.colorText('█', 'yellow') + ' Slow ';
      output += this.colorText('█', 'red') + ' Hot Path\n';
    }

    return output;
  }

  /**
   * Generate memory usage timeline
   */
  generateMemoryTimeline(traces: TraceEntry[], options: TimelineOptions = {}): string {
    const {
      width = 80,
      height = 15,
      title = 'Memory Usage Timeline',
      timeFormat = 'relative'
    } = options;

    const memoryTraces = traces.filter(t => t.memoryUsage);
    if (memoryTraces.length === 0) {
      return this.colorText('\nNo memory usage data available\n', 'gray');
    }

    let output = '';

    if (title) {
      output += this.colorText(`\n${title}\n`, 'cyan');
      output += this.colorText('─'.repeat(Math.min(title.length, width)), 'gray') + '\n';
    }

    const memoryValues = memoryTraces.map(t => t.memoryUsage!.heapUsed / 1024 / 1024); // MB
    const maxMemory = Math.max(...memoryValues);
    const minMemory = Math.min(...memoryValues);
    const memoryRange = maxMemory - minMemory;

    // Generate timeline
    const timelinePoints = this.sampleData(memoryValues, width);

    for (let row = height - 1; row >= 0; row--) {
      const threshold = minMemory + (memoryRange * row / (height - 1));
      let line = '';

      for (let col = 0; col < timelinePoints.length; col++) {
        const value = timelinePoints[col];
        if (Math.abs(value - threshold) < memoryRange / height / 2) {
          // Color based on memory level
          const memoryPercentage = (value - minMemory) / memoryRange;
          const color = memoryPercentage > 0.8 ? 'red' :
                       memoryPercentage > 0.6 ? 'yellow' : 'green';
          line += this.colorText('█', color);
        } else if (value > threshold) {
          line += this.colorText('│', 'gray');
        } else {
          line += ' ';
        }
      }

      const label = `${threshold.toFixed(0)}MB`.padStart(6);
      output += `${this.colorText(label, 'gray')} │${line}\n`;
    }

    // X-axis
    output += '      └' + '─'.repeat(width) + '\n';
    output += '        ' + this.formatTimeLabels(memoryTraces, width, timeFormat) + '\n';

    return output;
  }

  /**
   * Generate execution flow diagram
   */
  generateExecutionFlow(traces: TraceEntry[], options: FlowDiagramOptions = {}): string {
    const {
      maxDepth = 10,
      showTiming = true,
      showMemory = false,
      compactMode = false
    } = options;

    if (traces.length === 0) {
      return this.colorText('\nNo execution traces available\n', 'gray');
    }

    let output = '';
    output += this.colorText('\n🔍 Execution Flow Diagram\n', 'cyan');
    output += this.colorText('─'.repeat(50), 'gray') + '\n';

    const callStack: string[] = [];
    const processedTraces = traces.slice(0, 50); // Limit for readability

    processedTraces.forEach((trace, index) => {
      const isLastTrace = index === processedTraces.length - 1;

      // Determine call depth (simplified)
      const currentFunction = `${trace.module}.${trace.function}`;
      let depth = 0;

      // Simple depth calculation based on function name patterns
      if (trace.level === 'debug' && trace.message.includes('Entering')) {
        callStack.push(currentFunction);
        depth = callStack.length - 1;
      } else if (trace.level === 'debug' && trace.message.includes('Exiting')) {
        const stackIndex = callStack.lastIndexOf(currentFunction);
        if (stackIndex >= 0) {
          callStack.splice(stackIndex);
          depth = stackIndex;
        }
      } else {
        depth = callStack.length;
      }

      if (depth > maxDepth) return;

      // Generate indentation
      const indent = '  '.repeat(depth);
      const connector = depth > 0 ? (isLastTrace ? '└─' : '├─') : '';

      // Level indicator
      const levelColors = {
        error: 'red',
        warn: 'yellow',
        info: 'blue',
        debug: 'cyan',
        trace: 'gray'
      };
      const levelIcon = this.getLevelIcon(trace.level);
      const levelColor = levelColors[trace.level as keyof typeof levelColors] || 'white';

      // Format function name
      const functionName = compactMode
        ? trace.function
        : `${trace.module}.${trace.function}`;

      // Timing information
      const timing = showTiming && trace.duration !== undefined
        ? ` ${this.colorText(`(${trace.duration.toFixed(2)}ms)`, 'gray')}`
        : '';

      // Memory information
      const memory = showMemory && trace.memoryUsage
        ? ` ${this.colorText(`[${Math.round(trace.memoryUsage.heapUsed / 1024 / 1024)}MB]`, 'magenta')}`
        : '';

      // Build line
      let line = indent + connector;
      line += this.colorText(levelIcon, levelColor) + ' ';
      line += this.colorText(functionName, levelColor);
      line += timing + memory;

      if (!compactMode && trace.message) {
        line += ` - ${trace.message}`;
      }

      output += line + '\n';
    });

    return output;
  }

  /**
   * Generate error distribution chart
   */
  generateErrorDistribution(traces: TraceEntry[], options: ChartOptions = {}): string {
    const {
      width = 50,
      title = 'Error Distribution by Module'
    } = options;

    const errorTraces = traces.filter(t => t.level === 'error');
    if (errorTraces.length === 0) {
      return this.colorText('\nNo errors to display\n', 'green');
    }

    let output = '';

    if (title) {
      output += this.colorText(`\n${title}\n`, 'cyan');
      output += this.colorText('─'.repeat(Math.min(title.length, width)), 'gray') + '\n';
    }

    // Group errors by module
    const errorsByModule = errorTraces.reduce((acc, trace) => {
      acc[trace.module] = (acc[trace.module] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedModules = Object.entries(errorsByModule)
      .sort(([, a], [, b]) => b - a);

    const maxErrors = Math.max(...Object.values(errorsByModule));
    const barWidth = width - 20; // Space for module name and count

    sortedModules.forEach(([module, count]) => {
      const normalizedCount = count / maxErrors;
      const barLength = Math.round(normalizedCount * barWidth);
      const bar = '█'.repeat(barLength);

      const moduleName = module.length > 15
        ? module.substring(0, 12) + '...'
        : module.padEnd(15);

      output += `${moduleName} ${this.colorText(bar, 'red')} ${count}\n`;
    });

    output += `\nTotal errors: ${this.colorText(errorTraces.length.toString(), 'red')}\n`;

    return output;
  }

  /**
   * Generate session summary dashboard
   */
  generateSessionDashboard(session: DebugSession): string {
    const duration = (session.endTime || Date.now()) - session.startTime;
    const profiles = Array.from(session.profiles.values());

    let output = '';

    // Header
    output += this.colorText('\n📊 Debug Session Dashboard\n', 'cyan');
    output += this.colorText('═'.repeat(60), 'gray') + '\n';

    // Session info
    output += this.colorText('Session Info:\n', 'yellow');
    output += `  ID: ${session.id}\n`;
    output += `  Duration: ${this.formatDuration(duration)}\n`;
    output += `  Status: ${session.endTime ? this.colorText('Completed', 'green') : this.colorText('Active', 'yellow')}\n\n`;

    // Metrics overview
    const metrics = session.metrics;
    output += this.colorText('Metrics Overview:\n', 'yellow');
    output += `  Total Traces: ${metrics.totalTraces}\n`;
    output += `  Errors: ${this.colorText(metrics.errorCount.toString(), 'red')}\n`;
    output += `  Warnings: ${this.colorText(metrics.warningCount.toString(), 'yellow')}\n`;
    output += `  Avg Exec Time: ${metrics.avgExecutionTime.toFixed(2)}ms\n`;
    output += `  Schema Validation Errors: ${metrics.schemaValidationErrors}\n\n`;

    // Performance summary
    if (profiles.length > 0) {
      const bottlenecks = profiles.filter(p => p.hotPath);
      output += this.colorText('Performance Summary:\n', 'yellow');
      output += `  Functions Profiled: ${profiles.length}\n`;
      output += `  Hot Paths: ${this.colorText(bottlenecks.length.toString(), bottlenecks.length > 0 ? 'red' : 'green')}\n`;
      output += `  Total Execution Time: ${profiles.reduce((sum, p) => sum + p.totalTime, 0).toFixed(2)}ms\n\n`;
    }

    // Active breakpoints
    if (session.breakpoints.size > 0) {
      output += this.colorText('Active Breakpoints:\n', 'yellow');
      Array.from(session.breakpoints.values()).forEach(bp => {
        output += `  • ${bp.file}:${bp.line} (hits: ${bp.hitCount})\n`;
      });
      output += '\n';
    }

    // Watched variables
    if (session.watchedVariables.size > 0) {
      output += this.colorText('Watched Variables:\n', 'yellow');
      Array.from(session.watchedVariables.entries()).forEach(([name, value]) => {
        output += `  • ${name}: ${JSON.stringify(value)}\n`;
      });
      output += '\n';
    }

    return output;
  }

  /**
   * Generate live monitoring display
   */
  generateLiveMonitor(traces: TraceEntry[], profiles: PerformanceProfile[]): string {
    const recentTraces = traces.slice(-20);
    const recentErrors = recentTraces.filter(t => t.level === 'error');
    const activeBottlenecks = profiles.filter(p => p.hotPath);

    let output = '';

    // Header with timestamp
    output += this.colorText(`🔴 LIVE MONITOR - ${new Date().toLocaleTimeString()}\n`, 'red');
    output += this.colorText('═'.repeat(60), 'gray') + '\n';

    // Status indicators
    const errorStatus = recentErrors.length === 0 ?
      this.colorText('✓ OK', 'green') :
      this.colorText(`✗ ${recentErrors.length} ERRORS`, 'red');

    const performanceStatus = activeBottlenecks.length === 0 ?
      this.colorText('✓ OK', 'green') :
      this.colorText(`⚠ ${activeBottlenecks.length} BOTTLENECKS`, 'yellow');

    output += `Status: ${errorStatus} | Performance: ${performanceStatus}\n\n`;

    // Recent activity
    output += this.colorText('Recent Activity:\n', 'cyan');
    recentTraces.slice(-5).forEach(trace => {
      const time = new Date(trace.timestamp).toLocaleTimeString();
      const levelIcon = this.getLevelIcon(trace.level);
      const levelColor = trace.level === 'error' ? 'red' :
                        trace.level === 'warn' ? 'yellow' : 'gray';

      output += `  ${time} ${this.colorText(levelIcon, levelColor)} ${trace.module}.${trace.function}\n`;
    });

    // Active issues
    if (recentErrors.length > 0 || activeBottlenecks.length > 0) {
      output += '\n' + this.colorText('⚠️  Active Issues:\n', 'red');

      recentErrors.slice(-3).forEach(error => {
        output += `  🚨 Error in ${error.module}.${error.function}: ${error.message}\n`;
      });

      activeBottlenecks.slice(0, 3).forEach(bottleneck => {
        output += `  🔥 Bottleneck: ${bottleneck.function} (${bottleneck.avgTime.toFixed(2)}ms avg)\n`;
      });
    }

    return output;
  }

  // === HELPER METHODS ===

  private colorText(text: string, color: string): string {
    if (!this.colorize) return text;

    const colors: Record<string, (text: string) => string> = {
      red: pc.red,
      green: pc.green,
      yellow: pc.yellow,
      blue: pc.blue,
      cyan: pc.cyan,
      magenta: pc.magenta,
      gray: pc.gray,
      white: pc.white
    };

    return colors[color] ? colors[color](text) : text;
  }

  private getLevelIcon(level: string): string {
    const icons = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
      trace: '📝'
    };
    return icons[level as keyof typeof icons] || '•';
  }

  private sampleData(data: number[], targetLength: number): number[] {
    if (data.length <= targetLength) {
      return data;
    }

    const step = data.length / targetLength;
    const sampled: number[] = [];

    for (let i = 0; i < targetLength; i++) {
      const index = Math.floor(i * step);
      sampled.push(data[index]);
    }

    return sampled;
  }

  private formatTimeLabels(traces: TraceEntry[], width: number, format: string): string {
    if (traces.length === 0) return '';

    const first = traces[0];
    const last = traces[traces.length - 1];

    switch (format) {
      case 'absolute':
        return `${new Date(first.timestamp).toLocaleTimeString()}${' '.repeat(width - 20)}${new Date(last.timestamp).toLocaleTimeString()}`;

      case 'duration':
        const duration = last.timestamp - first.timestamp;
        return `0ms${' '.repeat(width - 10)}${duration}ms`;

      default: // relative
        return `Start${' '.repeat(width - 10)}End`;
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}

export default DebugVisualizer;