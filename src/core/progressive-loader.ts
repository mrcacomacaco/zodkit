/**
 * @fileoverview Progressive Schema Loading System
 * @module ProgressiveLoader
 *
 * Implements progressive loading for large codebases with smart memory management,
 * lazy loading, and dependency-aware loading strategies.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { SchemaInfo } from './infrastructure';
import type { PerformanceMonitor } from '../utils/performance-monitor';
import type { Logger } from '../utils/logger';

// === PROGRESSIVE LOADING INTERFACES ===

export interface LoadingStrategy {
  name: string;
  description: string;
  execute(context: LoadingContext): Promise<SchemaInfo[]>;
}

export interface LoadingContext {
  schemas: Map<string, SchemaInfo>;
  dependencies: Map<string, string[]>;
  loadedPaths: Set<string>;
  options: ProgressiveLoadingOptions;
  monitor: PerformanceMonitor;
  logger: Logger;
}

export interface ProgressiveLoadingOptions {
  /** Maximum schemas to load simultaneously */
  maxConcurrency?: number;
  /** Memory threshold before triggering cleanup (MB) */
  memoryThreshold?: number;
  /** Chunk size for batch loading */
  chunkSize?: number;
  /** Enable lazy loading */
  enableLazyLoading?: boolean;
  /** Priority loading patterns */
  priorityPatterns?: string[];
  /** Exclude patterns */
  excludePatterns?: string[];
  /** Loading strategy */
  strategy?: 'eager' | 'lazy' | 'hybrid' | 'dependency-aware';
  /** Cache warm-up on startup */
  warmupCache?: boolean;
  /** Enable streaming for large files */
  enableStreaming?: boolean;
}

export interface LoadingMetrics {
  totalSchemas: number;
  loadedSchemas: number;
  loadingTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  chunksProcessed: number;
  dependencyDepth: number;
}

export interface SchemaChunk {
  id: string;
  paths: string[];
  priority: number;
  estimatedSize: number;
  dependencies: string[];
}

// === PROGRESSIVE LOADER ===

export class ProgressiveLoader extends EventEmitter {
  private readonly loadingStrategies: Map<string, LoadingStrategy> = new Map();
  private readonly activeLoading: Map<string, Promise<SchemaInfo[]>> = new Map();
  private loadingQueue: SchemaChunk[] = [];
  private readonly loadedChunks: Set<string> = new Set();
  private readonly memoryManager: MemoryManager;
  private readonly dependencyGraph: DependencyGraph;
  private readonly lazyCache: Map<string, () => Promise<SchemaInfo>> = new Map();

  constructor(
    private readonly options: ProgressiveLoadingOptions = {},
    private readonly monitor: PerformanceMonitor,
    private readonly logger: Logger
  ) {
    super();

    this.options = {
      maxConcurrency: 4,
      memoryThreshold: 512, // MB
      chunkSize: 50,
      enableLazyLoading: true,
      strategy: 'hybrid',
      warmupCache: true,
      enableStreaming: true,
      ...options
    };

    this.memoryManager = new MemoryManager(this.options.memoryThreshold!);
    this.dependencyGraph = new DependencyGraph();

    this.registerDefaultStrategies();
    this.setupMemoryMonitoring();
  }

  /**
   * Load schemas progressively based on strategy
   */
  async loadSchemas(schemaPaths: string[]): Promise<Map<string, SchemaInfo>> {
    const startTime = Date.now();
    this.logger.info(`Starting progressive loading of ${schemaPaths.length} schema paths`);

    const context: LoadingContext = {
      schemas: new Map(),
      dependencies: new Map(),
      loadedPaths: new Set(),
      options: this.options,
      monitor: this.monitor,
      logger: this.logger
    };

    try {
      // 1. Analyze and chunk schemas
      const chunks = await this.createSchemaChunks(schemaPaths);
      this.logger.debug(`Created ${chunks.length} schema chunks`);

      // 2. Build dependency graph
      await this.buildDependencyGraph(chunks, context);

      // 3. Execute loading strategy
      const strategy = this.loadingStrategies.get(this.options.strategy!);
      if (!strategy) {
        throw new Error(`Unknown loading strategy: ${this.options.strategy}`);
      }

      await strategy.execute(context);

      // 4. Warm up cache if enabled
      if (this.options.warmupCache) {
        await this.warmupCache(context);
      }

      const loadingTime = Date.now() - startTime;
      this.logger.info(`Progressive loading completed in ${loadingTime}ms`);

      this.emit('loadingCompleted', {
        totalSchemas: context.schemas.size,
        loadingTime,
        memoryUsage: this.memoryManager.getCurrentUsage(),
        strategy: this.options.strategy
      });

      return context.schemas;

    } catch (error) {
      this.logger.error('Progressive loading failed:', error);
      this.emit('loadingFailed', error);
      throw error;
    }
  }

  /**
   * Load a specific schema lazily
   */
  async loadSchemaLazy(schemaPath: string): Promise<SchemaInfo | null> {
    if (this.lazyCache.has(schemaPath)) {
      const loader = this.lazyCache.get(schemaPath)!;
      return await loader();
    }

    // Create lazy loader
    const lazyLoader = async (): Promise<SchemaInfo> => {
      const chunk = await this.createSingleSchemaChunk(schemaPath);
      const schemas = await this.loadSchemaChunk(chunk);
      return schemas[0] || null;
    };

    this.lazyCache.set(schemaPath, lazyLoader);
    return await lazyLoader();
  }

  /**
   * Get loading metrics
   */
  getMetrics(): LoadingMetrics {
    return {
      totalSchemas: this.dependencyGraph.getNodeCount(),
      loadedSchemas: this.loadedChunks.size,
      loadingTime: this.monitor.getMetric('loadingTime') || 0,
      memoryUsage: this.memoryManager.getCurrentUsage(),
      cacheHitRate: this.lazyCache.size > 0 ? (this.loadedChunks.size / this.lazyCache.size) : 1,
      chunksProcessed: this.loadedChunks.size,
      dependencyDepth: this.dependencyGraph.getMaxDepth()
    };
  }

  /**
   * Clear loaded schemas and free memory
   */
  async clearCache(): Promise<void> {
    this.loadedChunks.clear();
    this.lazyCache.clear();
    this.activeLoading.clear();
    this.loadingQueue = [];
    await this.memoryManager.forceGarbageCollection();
    this.emit('cacheCleared');
  }

  // === PRIVATE METHODS ===

  private registerDefaultStrategies(): void {
    // Eager loading strategy
    this.loadingStrategies.set('eager', {
      name: 'eager',
      description: 'Load all schemas upfront',
      execute: async (context) => {
        const chunks = await this.createSchemaChunks(Array.from(context.loadedPaths));
        await this.loadChunksInParallel(chunks, context);
      }
    });

    // Lazy loading strategy
    this.loadingStrategies.set('lazy', {
      name: 'lazy',
      description: 'Load schemas on demand',
      execute: async (context) => {
        // Only load priority patterns initially
        const priorityChunks = this.loadingQueue.filter(chunk =>
          this.options.priorityPatterns?.some(pattern =>
            chunk.paths.some(path => path.includes(pattern))
          )
        );
        await this.loadChunksInParallel(priorityChunks, context);
      }
    });

    // Hybrid loading strategy
    this.loadingStrategies.set('hybrid', {
      name: 'hybrid',
      description: 'Load critical schemas eagerly, others lazily',
      execute: async (context) => {
        // Load high-priority chunks first
        const sortedChunks = this.loadingQueue.sort((a, b) => b.priority - a.priority);
        const criticalChunks = sortedChunks.slice(0, Math.ceil(sortedChunks.length * 0.3));

        await this.loadChunksInParallel(criticalChunks, context);

        // Queue remaining chunks for lazy loading
        const remainingChunks = sortedChunks.slice(criticalChunks.length);
        for (const chunk of remainingChunks) {
          this.setupLazyLoader(chunk, context);
        }
      }
    });

    // Dependency-aware loading strategy
    this.loadingStrategies.set('dependency-aware', {
      name: 'dependency-aware',
      description: 'Load schemas in dependency order',
      execute: async (context) => {
        const dependencyOrder = this.dependencyGraph.topologicalSort();
        const orderedChunks = this.organizeChunksByDependencies(dependencyOrder);

        for (const chunk of orderedChunks) {
          await this.loadChunksInParallel([chunk], context);
        }
      }
    });
  }

  private async createSchemaChunks(schemaPaths: string[]): Promise<SchemaChunk[]> {
    const chunks: SchemaChunk[] = [];
    const filteredPaths = this.filterPaths(schemaPaths);

    for (let i = 0; i < filteredPaths.length; i += this.options.chunkSize!) {
      const chunkPaths = filteredPaths.slice(i, i + this.options.chunkSize!);
      const chunk: SchemaChunk = {
        id: `chunk-${chunks.length}`,
        paths: chunkPaths,
        priority: this.calculateChunkPriority(chunkPaths),
        estimatedSize: await this.estimateChunkSize(chunkPaths),
        dependencies: await this.analyzeDependencies(chunkPaths)
      };
      chunks.push(chunk);
    }

    this.loadingQueue = chunks;
    return chunks;
  }

  private async createSingleSchemaChunk(schemaPath: string): Promise<SchemaChunk> {
    return {
      id: `single-${Date.now()}`,
      paths: [schemaPath],
      priority: this.calculateChunkPriority([schemaPath]),
      estimatedSize: await this.estimateChunkSize([schemaPath]),
      dependencies: await this.analyzeDependencies([schemaPath])
    };
  }

  private async buildDependencyGraph(chunks: SchemaChunk[], context: LoadingContext): Promise<void> {
    for (const chunk of chunks) {
      this.dependencyGraph.addNode(chunk.id);

      for (const dep of chunk.dependencies) {
        const depChunk = chunks.find(c => c.paths.some(p => p.includes(dep)));
        if (depChunk && depChunk.id !== chunk.id) {
          this.dependencyGraph.addEdge(depChunk.id, chunk.id);
        }
      }
    }
  }

  private async loadChunksInParallel(chunks: SchemaChunk[], context: LoadingContext): Promise<void> {
    const semaphore = new Semaphore(this.options.maxConcurrency!);

    const loadPromises = chunks.map(async (chunk) => {
      await semaphore.acquire();
      try {
        if (!this.loadedChunks.has(chunk.id)) {
          const schemas = await this.loadSchemaChunk(chunk);
          for (const schema of schemas) {
            context.schemas.set(schema.filePath, schema);
          }
          this.loadedChunks.add(chunk.id);
          this.emit('chunkLoaded', { chunk, schemas });
        }
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(loadPromises);
  }

  private async loadSchemaChunk(chunk: SchemaChunk): Promise<SchemaInfo[]> {
    const startTime = Date.now();

    try {
      // Check memory before loading
      if (this.memoryManager.isThresholdExceeded()) {
        await this.memoryManager.cleanup();
      }

      const schemas: SchemaInfo[] = [];

      for (const filePath of chunk.paths) {
        if (this.options.enableStreaming && await this.isLargeFile(filePath)) {
          const schema = await this.loadSchemaWithStreaming(filePath);
          if (schema) schemas.push(schema);
        } else {
          const schema = await this.loadSchemaTraditional(filePath);
          if (schema) schemas.push(schema);
        }
      }

      const loadTime = Date.now() - startTime;
      this.logger.debug(`Loaded chunk ${chunk.id} with ${schemas.length} schemas in ${loadTime}ms`);

      return schemas;

    } catch (error) {
      this.logger.error(`Failed to load chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  private async loadSchemaWithStreaming(filePath: string): Promise<SchemaInfo | null> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let content = '';

      stream.on('data', (chunk) => {
        content += chunk;
        // Progressive parsing for very large files
        if (content.length > 1024 * 1024) { // 1MB chunks
          // Parse incrementally if possible
        }
      });

      stream.on('end', () => {
        try {
          const schema = this.parseSchemaContent(filePath, content);
          resolve(schema);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', reject);
    });
  }

  private async loadSchemaTraditional(filePath: string): Promise<SchemaInfo | null> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return this.parseSchemaContent(filePath, content);
    } catch (error) {
      this.logger.warn(`Failed to load schema ${filePath}:`, error);
      return null;
    }
  }

  private parseSchemaContent(filePath: string, content: string): SchemaInfo {
    // Basic schema parsing - would be enhanced with actual Zod schema detection
    const schemaPattern = /(?:export\s+)?const\s+(\w+)(?:Schema)?\s*=\s*z\./g;
    const match = schemaPattern.exec(content);
    const line = match ? content.substring(0, match.index).split('\n').length : 1;

    return {
      name: match?.[1] || path.basename(filePath, path.extname(filePath)),
      exportName: match?.[1],
      filePath,
      line,
      column: 0,
      schemaType: this.detectSchemaType(content, match?.index || 0),
      zodChain: this.extractZodChain(content, match?.index || 0),
      complexity: content.length / 1000 // Simple complexity metric
    };
  }

  private detectSchemaType(content: string, offset: number): string {
    const snippet = content.substring(offset, offset + 100);
    if (snippet.includes('z.object')) return 'object';
    if (snippet.includes('z.array')) return 'array';
    if (snippet.includes('z.string')) return 'string';
    if (snippet.includes('z.number')) return 'number';
    if (snippet.includes('z.union')) return 'union';
    return 'unknown';
  }

  private extractZodChain(content: string, offset: number): string {
    // Extract the Zod chain for analysis
    const start = offset;
    let depth = 0;
    let end = start;

    for (let i = start; i < content.length && i < start + 500; i++) {
      if (content[i] === '(') depth++;
      if (content[i] === ')') depth--;
      if (depth === 0 && (content[i] === ';' || content[i] === '\n')) {
        end = i;
        break;
      }
    }

    return content.substring(start, end);
  }

  private filterPaths(schemaPaths: string[]): string[] {
    let filtered = schemaPaths;

    // Apply exclude patterns
    if (this.options.excludePatterns?.length) {
      filtered = filtered.filter(path =>
        !this.options.excludePatterns!.some(pattern => path.includes(pattern))
      );
    }

    return filtered;
  }

  private calculateChunkPriority(paths: string[]): number {
    let priority = 0;

    // Higher priority for patterns in priorityPatterns
    if (this.options.priorityPatterns?.length) {
      for (const path of paths) {
        for (const pattern of this.options.priorityPatterns) {
          if (path.includes(pattern)) {
            priority += 10;
          }
        }
      }
    }

    // Higher priority for smaller files (load faster)
    priority += Math.max(0, 10 - paths.length);

    return priority;
  }

  private async estimateChunkSize(paths: string[]): Promise<number> {
    let totalSize = 0;

    for (const path of paths) {
      try {
        const stats = await fs.promises.stat(path);
        totalSize += stats.size;
      } catch {
        // Estimate if file doesn't exist
        totalSize += 1024; // 1KB estimate
      }
    }

    return totalSize;
  }

  private async analyzeDependencies(paths: string[]): Promise<string[]> {
    const dependencies: Set<string> = new Set();

    for (const path of paths) {
      try {
        const content = await fs.promises.readFile(path, 'utf8');
        // Simple import detection - would be enhanced with AST parsing
        const importMatches = content.match(/import.*from\s+['"]([^'"]+)['"]/g) || [];

        for (const match of importMatches) {
          const importPath = match.match(/['"]([^'"]+)['"]/)?.[1];
          if (importPath && !importPath.startsWith('.')) {
            dependencies.add(importPath);
          }
        }
      } catch {
        // Skip if can't read file
      }
    }

    return Array.from(dependencies);
  }

  private setupLazyLoader(chunk: SchemaChunk, context: LoadingContext): void {
    for (const path of chunk.paths) {
      if (!this.lazyCache.has(path)) {
        const lazyLoader = async (): Promise<SchemaInfo> => {
          const schemas = await this.loadSchemaChunk({ ...chunk, paths: [path] });
          const schema = schemas[0];
          if (schema) {
            context.schemas.set(path, schema);
          }
          return schema;
        };

        this.lazyCache.set(path, lazyLoader);
      }
    }
  }

  private organizeChunksByDependencies(dependencyOrder: string[]): SchemaChunk[] {
    return this.loadingQueue.sort((a, b) => {
      const aIndex = dependencyOrder.indexOf(a.id);
      const bIndex = dependencyOrder.indexOf(b.id);
      return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
    });
  }

  private async warmupCache(context: LoadingContext): Promise<void> {
    this.logger.debug('Warming up cache with frequently accessed schemas');

    // Identify frequently accessed schemas and preload them
    const frequentSchemas = Array.from(context.schemas.values())
      .filter(schema => schema.complexity > 5) // Arbitrary threshold
      .slice(0, 10); // Limit warm-up

    for (const schema of frequentSchemas) {
      this.lazyCache.set(schema.filePath, async () => schema);
    }
  }

  private async isLargeFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size > 100 * 1024; // 100KB threshold
    } catch {
      return false;
    }
  }

  private setupMemoryMonitoring(): void {
    setInterval(() => {
      if (this.memoryManager.isThresholdExceeded()) {
        this.emit('memoryThresholdExceeded', {
          current: this.memoryManager.getCurrentUsage(),
          threshold: this.options.memoryThreshold
        });
      }
    }, 30000); // Check every 30 seconds
  }
}

// === SUPPORTING CLASSES ===

class MemoryManager {
  constructor(private readonly thresholdMB: number) {}

  getCurrentUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024); // MB
  }

  isThresholdExceeded(): boolean {
    return this.getCurrentUsage() > this.thresholdMB;
  }

  async cleanup(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
  }

  async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
    await new Promise(resolve => setImmediate(resolve));
  }
}

class DependencyGraph {
  private readonly nodes: Set<string> = new Set();
  private readonly edges: Map<string, Set<string>> = new Map();

  addNode(id: string): void {
    this.nodes.add(id);
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.edges.get(from)!.add(to);
  }

  topologicalSort(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (node: string): void => {
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected: ${node}`);
      }
      if (visited.has(node)) return;

      visiting.add(node);
      const neighbors = this.edges.get(node) || new Set();

      for (const neighbor of neighbors) {
        visit(neighbor);
      }

      visiting.delete(node);
      visited.add(node);
      result.unshift(node);
    };

    for (const node of this.nodes) {
      if (!visited.has(node)) {
        visit(node);
      }
    }

    return result;
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getMaxDepth(): number {
    let maxDepth = 0;

    const calculateDepth = (node: string, depth: number, visited: Set<string>): number => {
      if (visited.has(node)) return depth;
      visited.add(node);

      const neighbors = this.edges.get(node) || new Set();
      let currentMaxDepth = depth;

      for (const neighbor of neighbors) {
        const neighborDepth = calculateDepth(neighbor, depth + 1, new Set(visited));
        currentMaxDepth = Math.max(currentMaxDepth, neighborDepth);
      }

      return currentMaxDepth;
    };

    for (const node of this.nodes) {
      const depth = calculateDepth(node, 0, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }
}

class Semaphore {
  private permits: number;
  private readonly waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

export default ProgressiveLoader;