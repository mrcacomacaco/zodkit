import * as pc from 'picocolors';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from './logger';

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memory?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  context?: Record<string, unknown> | undefined;
}

export interface BenchmarkConfig {
  name: string;
  iterations: number;
  warmupIterations: number;
  timeout: number;
  collectGC: boolean;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  standardDeviation: number;
  averageMemoryUsage: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private readonly metrics: Map<string, PerformanceMetric> = new Map();
  private readonly globalStartTime: number = Date.now();
  private readonly metricsDir: string;

  constructor(metricsDir: string = '.zodkit/metrics') {
    this.metricsDir = metricsDir;
    this.ensureMetricsDir();
  }

  start(name: string, context?: Record<string, unknown>): void {
    const startMemory = process.memoryUsage();
    this.metrics.set(name, {
      name,
      startTime: performance.now(),
      memory: {
        heapUsed: startMemory.heapUsed,
        heapTotal: startMemory.heapTotal,
        external: startMemory.external,
      },
      context,
    });
  }

  end(name: string): number {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Performance metric "${name}" was not started`);
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    const endMemory = process.memoryUsage();

    this.metrics.set(name, {
      ...metric,
      endTime,
      duration,
      memory: {
        heapUsed: endMemory.heapUsed - (metric.memory?.heapUsed ?? 0),
        heapTotal: endMemory.heapTotal,
        external: endMemory.external - (metric.memory?.external ?? 0),
      },
    });

    return duration;
  }

  async benchmark(
    operation: () => Promise<void>,
    config: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    logger.info(`Starting benchmark: ${config.name}`);

    const results: number[] = [];
    const memoryResults: number[] = [];

    // Warmup iterations
    for (let i = 0; i < config.warmupIterations; i++) {
      await operation();
    }

    // Force garbage collection if requested
    if (config.collectGC && global.gc) {
      global.gc();
    }

    // Actual benchmark iterations
    for (let i = 0; i < config.iterations; i++) {
      const startTime = performance.now();
      const startMemory = process.memoryUsage();

      await operation();

      const endTime = performance.now();
      const endMemory = process.memoryUsage();

      results.push(endTime - startTime);
      memoryResults.push(endMemory.heapUsed - startMemory.heapUsed);
    }

    const result = this.calculateBenchmarkResult(config.name, results, memoryResults);
    this.saveBenchmarkResult(result);

    logger.info(`Benchmark completed: ${config.name}`, {
      metadata: {
        iterations: config.iterations,
        avgDuration: result.averageDuration.toFixed(2) + 'ms',
      },
    });

    return result;
  }

  saveMetrics(filename?: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = filename ?? `metrics-${timestamp}.json`;
    const filepath = join(this.metricsDir, file);

    const metricsArray = Array.from(this.metrics.values()).filter(m => m.duration !== undefined);
    writeFileSync(filepath, JSON.stringify(metricsArray, null, 2));

    logger.info(`Performance metrics saved to ${filepath}`, {
      metadata: { metricsCount: metricsArray.length },
    });
  }

  private calculateBenchmarkResult(name: string, durations: number[], memoryUsages: number[]): BenchmarkResult {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;

    return {
      name,
      iterations: durations.length,
      averageDuration: avg,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      standardDeviation: this.calculateStandardDeviation(durations, avg),
      averageMemoryUsage: avgMemory,
      timestamp: Date.now(),
    };
  }

  private calculateStandardDeviation(values: number[], mean: number): number {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    return Math.sqrt(avgSquaredDiff);
  }

  private saveBenchmarkResult(result: BenchmarkResult): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-${result.name}-${timestamp}.json`;
    const filepath = join(this.metricsDir, filename);

    writeFileSync(filepath, JSON.stringify(result, null, 2));
  }

  private ensureMetricsDir(): void {
    if (!existsSync(this.metricsDir)) {
      mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  clearMetrics(): void {
    this.metrics.clear();
  }

  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values()).filter(m => m.duration !== undefined);
  }

  getTotalTime(): number {
    return Date.now() - this.globalStartTime;
  }

  getReport(): string {
    const metrics = this.getAllMetrics();
    const totalTime = this.getTotalTime();

    if (metrics.length === 0) {
      return pc.gray('No performance metrics available');
    }

    const lines: string[] = [];

    // Sort by duration (longest first)
    metrics.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));

    lines.push(pc.bold('Performance Breakdown:'));

    for (const metric of metrics) {
      const duration = metric.duration ?? 0;
      const percentage = ((duration / totalTime) * 100).toFixed(1);
      const formattedDuration = this.formatDuration(duration);

      let color = pc.green;
      if (duration > 1000) color = pc.yellow;
      if (duration > 5000) color = pc.red;

      lines.push(`  ${color(metric.name.padEnd(20))} ${formattedDuration.padStart(8)} (${percentage}%)`);
    }

    lines.push('');
    lines.push(`${pc.bold('Total Time:')} ${this.formatDuration(totalTime)}`);

    // Add performance recommendations
    const slowestMetric = metrics[0];
    if (slowestMetric && slowestMetric.duration! > 2000) {
      lines.push('');
      lines.push(pc.yellow('💡 Performance Tips:'));

      if (slowestMetric.name === 'schema-discovery') {
        lines.push('  • Consider reducing schema file patterns or excluding test files');
      } else if (slowestMetric.name === 'validation') {
        lines.push('  • Large codebases may benefit from targeted validation');
      } else if (slowestMetric.name === 'reporting') {
        lines.push('  • Try using --format json for faster output');
      }
    }

    return lines.join('\n');
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }

  // Memory usage monitoring
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  getMemoryReport(): string {
    const usage = this.getMemoryUsage();
    const formatBytes = (bytes: number): string => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(2)} MB`;
    };

    return [
      pc.bold('Memory Usage:'),
      `  RSS (Resident Set Size): ${formatBytes(usage.rss)}`,
      `  Heap Used: ${formatBytes(usage.heapUsed)}`,
      `  Heap Total: ${formatBytes(usage.heapTotal)}`,
      `  External: ${formatBytes(usage.external)}`,
    ].join('\n');
  }

  // Resource monitoring for large codebases
  static async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const monitor = new PerformanceMonitor();
    monitor.start(name);

    try {
      const result = await fn();
      monitor.end(name);
      return result;
    } catch (error) {
      monitor.end(name);
      throw error;
    }
  }

  static measure<T>(name: string, fn: () => T): T {
    const monitor = new PerformanceMonitor();
    monitor.start(name);

    try {
      const result = fn();
      monitor.end(name);
      return result;
    } catch (error) {
      monitor.end(name);
      throw error;
    }
  }
}