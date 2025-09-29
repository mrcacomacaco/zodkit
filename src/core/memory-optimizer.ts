/**
 * @fileoverview Memory Optimization System
 * @module MemoryOptimizer
 *
 * Handles memory optimization for large codebases including:
 * - Streaming file processing
 * - Memory pressure detection
 * - Resource cleanup
 * - Garbage collection optimization
 */

import { EventEmitter } from 'events';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import * as pc from 'picocolors';

const pipelineAsync = promisify(pipeline);

// === MEMORY MONITORING ===

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapUtilization: number;
  pressureLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface MemoryThresholds {
  warningMB: number;
  criticalMB: number;
  maxHeapUtilization: number;
}

export class MemoryMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private readonly thresholds: MemoryThresholds;
  private readonly stats: MemoryStats[] = [];
  private readonly maxStatsHistory = 100;

  constructor(thresholds: MemoryThresholds = {
    warningMB: 256,
    criticalMB: 512,
    maxHeapUtilization: 0.85
  }) {
    super();
    this.thresholds = thresholds;
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.interval = setInterval(() => {
      const stats = this.collectStats();
      this.stats.push(stats);

      // Keep only recent stats
      if (this.stats.length > this.maxStatsHistory) {
        this.stats.splice(0, this.stats.length - this.maxStatsHistory);
      }

      this.checkThresholds(stats);
    }, 1000); // Check every second
  }

  private collectStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUtilization = memUsage.heapUsed / memUsage.heapTotal;

    let pressureLevel: MemoryStats['pressureLevel'] = 'low';
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB > this.thresholds.criticalMB || heapUtilization > 0.95) {
      pressureLevel = 'critical';
    } else if (heapUsedMB > this.thresholds.warningMB || heapUtilization > this.thresholds.maxHeapUtilization) {
      pressureLevel = 'high';
    } else if (heapUtilization > 0.7) {
      pressureLevel = 'medium';
    }

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapUtilization,
      pressureLevel
    };
  }

  private checkThresholds(stats: MemoryStats): void {
    switch (stats.pressureLevel) {
      case 'critical':
        this.emit('criticalPressure', stats);
        break;
      case 'high':
        this.emit('highPressure', stats);
        break;
      case 'medium':
        this.emit('mediumPressure', stats);
        break;
    }
  }

  getCurrentStats(): MemoryStats {
    return this.collectStats();
  }

  getStatsHistory(): MemoryStats[] {
    return [...this.stats];
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// === STREAMING FILE PROCESSOR ===

export interface StreamingOptions {
  chunkSize?: number;
  maxConcurrentStreams?: number;
  memoryLimit?: number;
  enableGC?: boolean;
}

export class StreamingProcessor extends EventEmitter {
  private readonly options: Required<StreamingOptions>;
  private readonly activeStreams = new Set<NodeJS.ReadableStream>();
  private readonly processedBytes = 0;
  private readonly monitor: MemoryMonitor;

  constructor(options: StreamingOptions = {}) {
    super();
    this.options = {
      chunkSize: options.chunkSize || 64 * 1024, // 64KB chunks
      maxConcurrentStreams: options.maxConcurrentStreams || 5,
      memoryLimit: options.memoryLimit || 256 * 1024 * 1024, // 256MB
      enableGC: options.enableGC ?? true
    };

    this.monitor = new MemoryMonitor();
    this.setupMemoryHandling();
  }

  private setupMemoryHandling(): void {
    this.monitor.on('highPressure', (stats) => {
      this.handleMemoryPressure(stats);
    });

    this.monitor.on('criticalPressure', (stats) => {
      this.handleCriticalMemoryPressure(stats);
    });
  }

  private handleMemoryPressure(stats: MemoryStats): void {
    console.warn(`${pc.yellow('⚠️  Memory pressure detected')}: ${Math.round(stats.heapUsed / 1024 / 1024)}MB used`);

    // Reduce concurrent streams
    this.options.maxConcurrentStreams = Math.max(1, this.options.maxConcurrentStreams - 1);

    // Trigger garbage collection if enabled
    if (this.options.enableGC && global.gc) {
      global.gc();
    }

    this.emit('memoryPressure', stats);
  }

  private handleCriticalMemoryPressure(stats: MemoryStats): void {
    console.error(`${pc.red('🚨 Critical memory pressure')}: ${Math.round(stats.heapUsed / 1024 / 1024)}MB used`);

    // Pause all active streams temporarily
    this.activeStreams.forEach(stream => {
      if ('pause' in stream && typeof stream.pause === 'function') {
        stream.pause();
      }
    });

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    // Resume streams after brief delay
    setTimeout(() => {
      this.activeStreams.forEach(stream => {
        if ('resume' in stream && typeof stream.resume === 'function') {
          stream.resume();
        }
      });
    }, 100);

    this.emit('criticalPressure', stats);
  }

  /**
   * Process large files using streams to minimize memory usage
   */
  async processLargeFiles(
    filePaths: string[],
    processor: (chunk: string, metadata: { filePath: string; chunkIndex: number }) => Promise<any>
  ): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();

    // Process files in batches to control memory usage
    const batchSize = Math.min(this.options.maxConcurrentStreams, filePaths.length);

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);

      const batchPromises = batch.map(async (filePath) => {
        const fileResults: any[] = [];

        try {
          const stream = createReadStream(filePath, {
            encoding: 'utf8',
            highWaterMark: this.options.chunkSize
          });

          this.activeStreams.add(stream);

          let chunkIndex = 0;
          let buffer = '';

          const chunkProcessor = new Transform({
            transform: async (chunk: Buffer, encoding, callback) => {
              try {
                buffer += chunk.toString();

                // Process complete lines to avoid cutting schemas in half
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                if (lines.length > 0) {
                  const chunkContent = lines.join('\n') + '\n';
                  const result = await processor(chunkContent, { filePath, chunkIndex });

                  if (result) {
                    fileResults.push(result);
                  }

                  chunkIndex++;
                }

                callback();
              } catch (error) {
                callback(error);
              }
            },
            flush: async (callback) => {
              // Process remaining buffer
              if (buffer.trim()) {
                try {
                  const result = await processor(buffer, { filePath, chunkIndex });
                  if (result) {
                    fileResults.push(result);
                  }
                } catch (error) {
                  // Log error but don't fail the entire stream
                  console.warn(`Error processing final chunk of ${filePath}:`, error);
                }
              }
              callback();
            }
          });

          await pipelineAsync(stream, chunkProcessor);

          this.activeStreams.delete(stream);
          results.set(filePath, fileResults);

        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
          results.set(filePath, []);
        }
      });

      await Promise.all(batchPromises);

      // Brief pause between batches to allow GC
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  /**
   * Process schemas from large files with memory optimization
   */
  async processLargeSchemaFiles(filePaths: string[]): Promise<any[]> {
    const allSchemas: any[] = [];

    const results = await this.processLargeFiles(filePaths, async (chunk, metadata) => {
      // Simple schema detection in chunks
      const schemaMatches = chunk.match(/(?:export\s+)?const\s+(\w+)(?:Schema)?\s*=\s*z\./g);

      if (schemaMatches) {
        return schemaMatches.map(match => ({
          file: metadata.filePath,
          chunk: metadata.chunkIndex,
          match: match.trim(),
          content: chunk.substring(0, 200) // Keep small excerpt
        }));
      }

      return null;
    });

    results.forEach((fileResults) => {
      fileResults.flat().forEach(result => {
        if (result) allSchemas.push(result);
      });
    });

    return allSchemas;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      processedBytes: this.processedBytes,
      activeStreams: this.activeStreams.size,
      maxConcurrentStreams: this.options.maxConcurrentStreams,
      memoryStats: this.monitor.getCurrentStats()
    };
  }

  async shutdown(): Promise<void> {
    // Close all active streams
    this.activeStreams.forEach(stream => {
      if ('destroy' in stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
    });

    this.activeStreams.clear();
    this.monitor.stop();
    this.removeAllListeners();
  }
}

// === MEMORY OPTIMIZER ===

export interface OptimizationOptions {
  autoGC?: boolean;
  gcThreshold?: number;
  maxHeapSize?: number;
  enableProfiling?: boolean;
}

export class MemoryOptimizer extends EventEmitter {
  private readonly monitor: MemoryMonitor;
  private readonly options: Required<OptimizationOptions>;
  private gcCount = 0;
  private lastGC = 0;

  constructor(options: OptimizationOptions = {}) {
    super();
    this.options = {
      autoGC: options.autoGC ?? true,
      gcThreshold: options.gcThreshold || 100 * 1024 * 1024, // 100MB
      maxHeapSize: options.maxHeapSize || 512 * 1024 * 1024, // 512MB
      enableProfiling: options.enableProfiling ?? false
    };

    this.monitor = new MemoryMonitor();
    this.setupOptimizations();
  }

  private setupOptimizations(): void {
    this.monitor.on('highPressure', (stats) => {
      this.optimizeMemory(stats);
    });

    this.monitor.on('criticalPressure', (stats) => {
      this.forceOptimization(stats);
    });

    // Set up periodic cleanup
    setInterval(() => {
      this.periodicCleanup();
    }, 30000); // Every 30 seconds
  }

  private optimizeMemory(stats: MemoryStats): void {
    console.log(`${pc.cyan('🔧 Optimizing memory')}: ${Math.round(stats.heapUsed / 1024 / 1024)}MB used`);

    // Trigger GC if available and threshold exceeded
    if (this.options.autoGC && global.gc && stats.heapUsed > this.options.gcThreshold) {
      const timeSinceLastGC = Date.now() - this.lastGC;

      if (timeSinceLastGC > 5000) { // Don't GC too frequently
        global.gc();
        this.gcCount++;
        this.lastGC = Date.now();

        console.log(`${pc.green('🗑️  Garbage collection triggered')} (${this.gcCount} total)`);
      }
    }

    this.emit('optimized', stats);
  }

  private forceOptimization(stats: MemoryStats): void {
    console.warn(`${pc.red('🚨 Force optimizing memory')}: ${Math.round(stats.heapUsed / 1024 / 1024)}MB used`);

    // Force GC regardless of timing
    if (global.gc) {
      global.gc();
      this.gcCount++;
      this.lastGC = Date.now();
    }

    // Clear any global caches or temporary data
    this.clearGlobalCaches();

    this.emit('forceOptimized', stats);
  }

  private periodicCleanup(): void {
    const stats = this.monitor.getCurrentStats();

    // Only cleanup if memory usage is reasonable
    if (stats.pressureLevel === 'low' || stats.pressureLevel === 'medium') {
      this.clearTemporaryData();
    }
  }

  private clearGlobalCaches(): void {
    // Clear Node.js module cache for non-essential modules
    const moduleCache = require.cache;
    const essentialModules = new Set([
      'fs', 'path', 'util', 'events', 'stream',
      'zod', 'commander', 'picocolors'
    ]);

    Object.keys(moduleCache).forEach(modulePath => {
      const moduleName = modulePath.split('/').pop()?.replace('.js', '');
      if (moduleName && !essentialModules.has(moduleName) && modulePath.includes('node_modules')) {
        delete moduleCache[modulePath];
      }
    });
  }

  private clearTemporaryData(): void {
    // Implementation would clear any temporary data structures
    // For now, just emit an event
    this.emit('temporaryDataCleared');
  }

  /**
   * Create memory-optimized processing function
   */
  createOptimizedProcessor<T, R>(
    processor: (item: T) => Promise<R> | R,
    options: { batchSize?: number } = {}
  ): (items: T[]) => Promise<R[]> {
    const batchSize = options.batchSize || 50;

    return async (items: T[]): Promise<R[]> => {
      const results: R[] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);

        // Check memory pressure and pause if needed
        const stats = this.monitor.getCurrentStats();
        if (stats.pressureLevel === 'high' || stats.pressureLevel === 'critical') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Trigger GC periodically for large datasets
        if (i > 0 && i % (batchSize * 10) === 0 && global.gc) {
          global.gc();
        }
      }

      return results;
    };
  }

  getMemoryReport(): {
    current: MemoryStats;
    history: MemoryStats[];
    gcCount: number;
    recommendations: string[];
  } {
    const current = this.monitor.getCurrentStats();
    const history = this.monitor.getStatsHistory();
    const recommendations: string[] = [];

    // Generate recommendations based on memory usage patterns
    const avgHeapUsed = history.reduce((sum, stat) => sum + stat.heapUsed, 0) / history.length;
    const heapUsedMB = avgHeapUsed / 1024 / 1024;

    if (heapUsedMB > 200) {
      recommendations.push('Consider processing files in smaller batches');
    }

    if (current.heapUtilization > 0.8) {
      recommendations.push('Enable garbage collection optimization');
    }

    if (this.gcCount > 20) {
      recommendations.push('Memory pressure is high, consider increasing available memory');
    }

    return {
      current,
      history,
      gcCount: this.gcCount,
      recommendations
    };
  }

  shutdown(): void {
    this.monitor.stop();
    this.removeAllListeners();
  }
}

// === EXPORTS ===

export { MemoryMonitor, StreamingProcessor, MemoryOptimizer };

export function createMemoryOptimizer(options?: OptimizationOptions): MemoryOptimizer {
  return new MemoryOptimizer(options);
}

export default MemoryOptimizer;