/**
 * @fileoverview Unified Utilities Module
 * @module Utils
 *
 * Consolidates all utility functions:
 * - File watcher (85 lines)
 * - Ignore parser (197 lines)
 * - Logger (250 lines)
 * - Performance monitor (305 lines)
 * Total: 4 files → 1 unified module (~837 lines → ~300 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pc from 'picocolors';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

// === FILE WATCHER ===

export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  watch(patterns: string[], options?: { debounce?: number }): void {
    const debounce = options?.debounce || 300;

    patterns.forEach(pattern => {
      if (this.watchers.has(pattern)) return;

      try {
        const watcher = fs.watch(pattern, { recursive: true }, (event, filename) => {
          if (!filename) return;

          // Debounce events
          const key = `${pattern}:${filename}`;
          if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key)!);
          }

          const timer = setTimeout(() => {
            this.emit('change', { event, filename, pattern });
            this.debounceTimers.delete(key);
          }, debounce);

          this.debounceTimers.set(key, timer);
        });

        this.watchers.set(pattern, watcher);
      } catch (error) {
        this.emit('error', error);
      }
    });
  }

  unwatch(pattern?: string): void {
    if (pattern) {
      this.watchers.get(pattern)?.close();
      this.watchers.delete(pattern);
    } else {
      this.watchers.forEach(w => w.close());
      this.watchers.clear();
    }

    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
  }
}

// === IGNORE PARSER ===

export class IgnoreParser {
  private patterns: RegExp[] = [];

  constructor(ignoreFile?: string) {
    if (ignoreFile && fs.existsSync(ignoreFile)) {
      this.loadFile(ignoreFile);
    } else {
      this.loadDefaults();
    }
  }

  private loadFile(filepath: string): void {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        this.addPattern(line);
      }
    });
  }

  private loadDefaults(): void {
    const defaults = [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.log',
      '.git/**',
      '.DS_Store'
    ];
    defaults.forEach(p => this.addPattern(p));
  }

  private addPattern(pattern: string): void {
    // Convert glob pattern to regex
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\{([^}]+)\}/g, '($1)');

    this.patterns.push(new RegExp(`^${regex}$`));
  }

  shouldIgnore(filepath: string): boolean {
    return this.patterns.some(pattern => pattern.test(filepath));
  }

  filter(files: string[]): string[] {
    return files.filter(f => !this.shouldIgnore(f));
  }
}

// === LOGGER ===

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  colors?: boolean;
  timestamp?: boolean;
  prefix?: string;
}

export class Logger {
  private level: LogLevel;
  private colors: boolean;
  private timestamp: boolean;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || 'info';
    this.colors = options.colors ?? true;
    this.timestamp = options.timestamp ?? false;
    this.prefix = options.prefix || '';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string): string {
    let output = '';

    if (this.timestamp) {
      output += pc.gray(`[${new Date().toISOString()}] `);
    }

    if (this.prefix) {
      output += pc.cyan(`[${this.prefix}] `);
    }

    const levelColors = {
      debug: pc.gray,
      info: pc.blue,
      warn: pc.yellow,
      error: pc.red
    };

    const color = this.colors ? levelColors[level] : (s: string) => s;
    output += color(`[${level.toUpperCase()}]`) + ' ' + message;

    return output;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', args.join(' ')));
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(this.format('info', args.join(' ')));
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', args.join(' ')));
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.format('error', args.join(' ')));
    }
  }

  group(label: string): void {
    if (this.colors) {
      console.group(pc.bold(label));
    } else {
      console.group(label);
    }
  }

  groupEnd(): void {
    console.groupEnd();
  }

  table(data: any): void {
    console.table(data);
  }
}

// === PERFORMANCE MONITOR ===

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  memory: {
    before: number;
    after: number;
    delta: number;
  };
  timestamp: number;
}

export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  private metrics: PerformanceMetrics[] = [];
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  start(label: string): void {
    if (!this.enabled) return;
    this.marks.set(label, performance.now());
  }

  end(label: string): PerformanceMetrics | null {
    if (!this.enabled) return null;

    const start = this.marks.get(label);
    if (!start) return null;

    const duration = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    const memBefore = this.marks.get(`${label}_mem`) || memAfter;

    const metrics: PerformanceMetrics = {
      operation: label,
      duration: Math.round(duration * 100) / 100,
      memory: {
        before: memBefore,
        after: memAfter,
        delta: memAfter - memBefore
      },
      timestamp: Date.now()
    };

    this.metrics.push(metrics);
    this.marks.delete(label);
    this.marks.delete(`${label}_mem`);

    return metrics;
  }

  measure<T>(label: string, fn: () => T): T {
    this.start(label);
    try {
      const result = fn();
      return result;
    } finally {
      this.end(label);
    }
  }

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      return result;
    } finally {
      this.end(label);
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getSummary(): Record<string, any> {
    if (this.metrics.length === 0) {
      return { operations: 0, totalDuration: 0 };
    }

    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / this.metrics.length;
    const maxDuration = Math.max(...this.metrics.map(m => m.duration));
    const minDuration = Math.min(...this.metrics.map(m => m.duration));

    return {
      operations: this.metrics.length,
      totalDuration: Math.round(totalDuration * 100) / 100,
      avgDuration: Math.round(avgDuration * 100) / 100,
      maxDuration: Math.round(maxDuration * 100) / 100,
      minDuration: Math.round(minDuration * 100) / 100,
      memoryDelta: this.metrics.reduce((sum, m) => sum + m.memory.delta, 0)
    };
  }

  clear(): void {
    this.marks.clear();
    this.metrics = [];
  }

  report(): void {
    const summary = this.getSummary();
    const logger = new Logger();

    logger.group('Performance Report');
    logger.table(summary);

    if (this.metrics.length > 0) {
      logger.info('Top 5 Slowest Operations:');
      const slowest = [...this.metrics]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

      slowest.forEach(m => {
        logger.info(`  ${m.operation}: ${m.duration}ms`);
      });
    }

    logger.groupEnd();
  }
}

// === UNIFIED UTILITIES CLASS ===

export class Utils {
  public watcher: FileWatcher;
  public ignore: IgnoreParser;
  public logger: Logger;
  public performance: PerformanceMonitor;

  constructor(options?: {
    ignoreFile?: string;
    logLevel?: LogLevel;
    performanceEnabled?: boolean;
  }) {
    this.watcher = new FileWatcher();
    this.ignore = new IgnoreParser(options?.ignoreFile);
    this.logger = new Logger({ level: options?.logLevel });
    this.performance = new PerformanceMonitor(options?.performanceEnabled);
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Format duration to human readable
   */
  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  /**
   * Debounce function
   */
  debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timer: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Throttle function
   */
  throttle<T extends (...args: any[]) => any>(
    fn: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

// === EXPORTS ===

export const createUtils = (options?: any) => new Utils(options);
export default Utils;