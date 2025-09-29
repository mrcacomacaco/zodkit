/**
 * @fileoverview Advanced caching system for schema operations with streaming support
 * @module SchemaCache
 */

import * as z from 'zod';
import { createHash } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFile as readFileAsync, writeFile as writeFileAsync, unlink as unlinkAsync, mkdir as mkdirAsync, readdir as readdirAsync } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SchemaInfo } from './schema-discovery';
import { ValidationError } from './validator';

/**
 * Legacy cached schema entry with metadata (for backward compatibility)
 */
interface LegacyCacheEntry {
  schema: SchemaInfo;
  hash: string;
  timestamp: number;
  parseTime: number;
}

/**
 * Enhanced cache entry with comprehensive metadata
 */
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  size: number;
  hits: number;
  lastAccess: number;
  compressed?: boolean;
  checksum?: string;
  tags?: string[];
  priority?: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  enabled?: boolean;
  directory?: string;
  maxSize?: number; // in MB
  ttl?: number; // Time to live in seconds
  compression?: boolean;
  streaming?: boolean;
  evictionPolicy?: 'lru' | 'lfu' | 'ttl' | 'priority';
  warmupOnStart?: boolean;
  persistToDisk?: boolean;
  memoryLimit?: number; // in MB
  batchSize?: number;
  compressionThreshold?: number; // bytes
}

/**
 * Enhanced schema cache statistics for performance monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalParseTime: number;
  averageParseTime: number;
  cacheSize: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
  errors: number;
  oldestEntry?: number;
  newestEntry?: number;
  compressionRatio?: number;
  streamingOperations?: number;
}

/**
 * Streaming cache result
 */
export interface StreamingResult<T> {
  data: T;
  fromCache: boolean;
  cacheKey: string;
  timestamp: number;
  size: number;
  compressed?: boolean;
}

/**
 * Schema operation context for advanced caching
 */
export interface SchemaOperationContext {
  operation: string;
  schemaHash: string;
  parameters?: Record<string, any>;
  version?: string;
  dependencies?: string[];
  priority?: number;
  tags?: string[];
}

/**
 * Advanced schema caching layer with streaming, compression, and multiple eviction strategies
 * Reduces parsing overhead for frequently accessed schemas and provides real-time streaming capabilities
 */
export class SchemaCache {
  private readonly legacyCache: Map<string, LegacyCacheEntry> = new Map();
  private readonly advancedCache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;
  private stats: CacheStats;
  private readonly persistentCacheDir: string;
  private readonly enablePersistence: boolean;
  private readonly config: Required<CacheConfig>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: {
    maxSize?: number;
    ttl?: number;
    enablePersistence?: boolean;
    cacheDir?: string;
  } = {}, advancedConfig?: CacheConfig) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttl = options.ttl ?? 3600000; // 1 hour default
    this.enablePersistence = options.enablePersistence ?? true;
    this.persistentCacheDir = options.cacheDir ?? join(tmpdir(), 'zodkit-cache');

    // Enhanced configuration with defaults
    this.config = {
      enabled: advancedConfig?.enabled ?? true,
      directory: advancedConfig?.directory ?? this.persistentCacheDir,
      maxSize: advancedConfig?.maxSize ?? 100, // 100MB default
      ttl: advancedConfig?.ttl ?? 3600, // 1 hour default in seconds
      compression: advancedConfig?.compression ?? true,
      streaming: advancedConfig?.streaming ?? true,
      evictionPolicy: advancedConfig?.evictionPolicy ?? 'lru',
      warmupOnStart: advancedConfig?.warmupOnStart ?? false,
      persistToDisk: advancedConfig?.persistToDisk ?? true,
      memoryLimit: advancedConfig?.memoryLimit ?? 50, // 50MB default
      batchSize: advancedConfig?.batchSize ?? 10,
      compressionThreshold: advancedConfig?.compressionThreshold ?? 1024 // 1KB
    };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalParseTime: 0,
      averageParseTime: 0,
      cacheSize: 0,
      hitRate: 0,
      totalSize: 0,
      entryCount: 0,
      errors: 0,
      compressionRatio: 1,
      streamingOperations: 0
    };

    if (this.enablePersistence || this.config.persistToDisk) {
      this.initPersistentCache();
    }

    if (this.config.enabled) {
      this.initializeAdvancedFeatures();
    }
  }

  /**
   * Initialize advanced caching features
   */
  private async initializeAdvancedFeatures(): Promise<void> {
    try {
      if (this.config.persistToDisk) {
        await this.ensureAdvancedCacheDirectory();
      }

      if (this.config.warmupOnStart) {
        await this.warmupAdvancedCache();
      }

      // Start cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.performAdvancedMaintenance();
      }, 300000); // 5 minutes

    } catch (error) {
      console.warn('Failed to initialize advanced cache features:', error);
      this.stats.errors++;
    }
  }

  /**
   * Get a schema from cache or return null if not found (legacy method)
   */
  get(filePath: string, fileContent?: string): SchemaInfo | null {
    const entry = this.legacyCache.get(filePath);

    if (!entry) {
      // Try persistent cache
      if (this.enablePersistence) {
        const persistentEntry = this.loadFromPersistentCache(filePath);
        if (persistentEntry && this.isValidLegacyEntry(persistentEntry, fileContent)) {
          this.legacyCache.set(filePath, persistentEntry);
          this.stats.hits++;
          return persistentEntry.schema;
        }
      }

      this.stats.misses++;
      return null;
    }

    // Check if cache entry is still valid
    if (!this.isValidLegacyEntry(entry, fileContent)) {
      this.legacyCache.delete(filePath);
      this.stats.misses++;
      return null;
    }

    // Move to end (LRU)
    this.legacyCache.delete(filePath);
    this.legacyCache.set(filePath, entry);

    this.stats.hits++;
    return entry.schema;
  }

  // === ADVANCED CACHING METHODS ===

  /**
   * Cache schema validation results with advanced features
   */
  async cacheValidationResult(
    schema: z.ZodSchema,
    data: any,
    result: { success: boolean; errors?: ValidationError[] },
    context?: SchemaOperationContext
  ): Promise<void> {
    if (!this.config.enabled) return;

    const key = this.generateValidationKey(schema, data, context);
    const entry: CacheEntry = {
      key,
      value: result,
      timestamp: Date.now(),
      size: this.calculateSize(result),
      hits: 0,
      lastAccess: Date.now(),
      checksum: this.generateChecksum(result),
      ...(context?.tags && { tags: context.tags }),
      priority: context?.priority ?? 1
    };

    await this.setAdvancedEntry(key, entry);
  }

  /**
   * Retrieve cached validation result
   */
  async getCachedValidationResult(
    schema: z.ZodSchema,
    data: any,
    context?: SchemaOperationContext
  ): Promise<{ success: boolean; errors?: ValidationError[] } | null> {
    if (!this.config.enabled) return null;

    const key = this.generateValidationKey(schema, data, context);
    const entry = await this.getAdvancedEntry(key);

    if (entry) {
      this.stats.hits++;
      return entry.value;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Cache schema compilation results
   */
  async cacheSchemaCompilation(
    schemaSource: string,
    compiled: any,
    context?: SchemaOperationContext
  ): Promise<void> {
    if (!this.config.enabled) return;

    const key = this.generateCompilationKey(schemaSource, context);
    let value = compiled;
    let compressed = false;

    if (this.config.compression && this.calculateSize(compiled) > this.config.compressionThreshold) {
      value = await this.compress(JSON.stringify(compiled));
      compressed = true;
    }

    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      size: this.calculateSize(value),
      hits: 0,
      lastAccess: Date.now(),
      compressed,
      checksum: this.generateChecksum(compiled),
      ...(context?.tags && { tags: context.tags }),
      priority: context?.priority ?? 1
    };

    await this.setAdvancedEntry(key, entry);
  }

  /**
   * Retrieve cached schema compilation
   */
  async getCachedSchemaCompilation(
    schemaSource: string,
    context?: SchemaOperationContext
  ): Promise<any | null> {
    if (!this.config.enabled) return null;

    const key = this.generateCompilationKey(schemaSource, context);
    const entry = await this.getAdvancedEntry(key);

    if (entry) {
      this.stats.hits++;
      let value = entry.value;

      if (entry.compressed) {
        const decompressed = await this.decompress(value);
        value = JSON.parse(decompressed);
      }

      return value;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Stream cached data with progressive loading
   */
  async *streamCachedData<T>(
    keys: string[],
    batchSize: number = this.config.batchSize
  ): AsyncGenerator<StreamingResult<T>, void, unknown> {
    if (this.config.enabled && this.config.streaming && this.stats) {
      const stats = this.stats;
      stats.streamingOperations = (stats.streamingOperations || 0) + 1;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (key) => {
          const entry = await this.getAdvancedEntry(key);
          if (entry) {
            let value = entry.value;

            if (entry.compressed) {
              const decompressed = await this.decompress(value);
              value = JSON.parse(decompressed);
            }

            return {
              data: value,
              fromCache: true,
              cacheKey: key,
              timestamp: entry.timestamp,
              size: entry.size,
              compressed: entry.compressed
            } as StreamingResult<T>;
          }
          return null;
        })
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            yield result.value;
          }
        }
      }
    }
  }

  /**
   * Batch cache operations for better performance
   */
  async batchSet(entries: Array<{ key: string; value: any; context?: SchemaOperationContext }>): Promise<void> {
    if (!this.config.enabled) return;

    const promises = entries.map(async ({ key, value, context }) => {
      let processedValue = value;
      let compressed = false;

      if (this.config.compression && this.calculateSize(value) > this.config.compressionThreshold) {
        processedValue = await this.compress(JSON.stringify(value));
        compressed = true;
      }

      const entry: CacheEntry = {
        key,
        value: processedValue,
        timestamp: Date.now(),
        size: this.calculateSize(processedValue),
        hits: 0,
        lastAccess: Date.now(),
        compressed,
        checksum: this.generateChecksum(value),
        ...(context?.tags && { tags: context.tags }),
        priority: context?.priority ?? 1
      };

      return this.setAdvancedEntry(key, entry);
    });

    await Promise.allSettled(promises);
  }

  /**
   * Batch cache retrieval
   */
  async batchGet(keys: string[]): Promise<Map<string, any>> {
    if (!this.config.enabled) return new Map();

    const results = new Map<string, any>();
    const promises = keys.map(async (key) => {
      const entry = await this.getAdvancedEntry(key);
      if (entry) {
        let value = entry.value;

        if (entry.compressed) {
          const decompressed = await this.decompress(value);
          value = JSON.parse(decompressed);
        }

        results.set(key, value);
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(pattern: string | RegExp): Promise<number> {
    if (!this.config.enabled) return 0;

    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    // Check advanced cache
    for (const key of this.advancedCache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    // Check legacy cache
    for (const key of this.legacyCache.keys()) {
      if (regex.test(key)) {
        this.legacyCache.delete(key);
      }
    }

    // Delete advanced entries
    const deletions = keysToDelete.map(key => this.deleteAdvancedEntry(key));
    await Promise.allSettled(deletions);

    return keysToDelete.length;
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    if (!this.config.enabled) return 0;

    const keysToDelete: string[] = [];

    for (const [key, entry] of this.advancedCache.entries()) {
      if (entry.tags && tags.some(tag => entry.tags!.includes(tag))) {
        keysToDelete.push(key);
      }
    }

    const deletions = keysToDelete.map(key => this.deleteAdvancedEntry(key));
    await Promise.allSettled(deletions);

    return keysToDelete.length;
  }

  /**
   * Store a schema in cache (legacy method)
   */
  set(filePath: string, schema: SchemaInfo, fileContent: string, parseTime: number): void {
    const hash = this.computeHash(fileContent);

    // Evict oldest entry if cache is full
    if (this.legacyCache.size >= this.maxSize) {
      const firstKey = this.legacyCache.keys().next().value;
      if (firstKey) {
        this.legacyCache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    const entry: LegacyCacheEntry = {
      schema,
      hash,
      timestamp: Date.now(),
      parseTime
    };

    this.legacyCache.set(filePath, entry);
    this.stats.totalParseTime += parseTime;
    this.stats.cacheSize = this.legacyCache.size;
    this.updateAverageParseTime();

    // Persist to disk
    if (this.enablePersistence) {
      this.saveToPersistentCache(filePath, entry);
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.legacyCache.clear();
    this.advancedCache.clear();
    this.resetStats();

    if (this.enablePersistence || this.config.persistToDisk) {
      this.clearPersistentCache();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit ratio
   */
  getHitRatio(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Prewarm cache with common schemas
   */
  async prewarm(schemaPaths: string[]): Promise<void> {
    for (const path of schemaPaths) {
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        // Check if already in cache
        if (!this.get(path, content)) {
          // Schema will be added by the discovery process
          continue;
        }
      }
    }
  }

  private isValidLegacyEntry(entry: LegacyCacheEntry, fileContent?: string): boolean {
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      return false;
    }

    // Check file hash if content provided
    if (fileContent) {
      const currentHash = this.computeHash(fileContent);
      return currentHash === entry.hash;
    }

    return true;
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private updateAverageParseTime(): void {
    const totalEntries = this.stats.hits + this.stats.misses;
    this.stats.averageParseTime = totalEntries === 0
      ? 0
      : this.stats.totalParseTime / totalEntries;
  }

  private initPersistentCache(): void {
    if (!existsSync(this.persistentCacheDir)) {
      mkdirSync(this.persistentCacheDir, { recursive: true });
    }
  }

  private getPersistentCachePath(filePath: string): string {
    const hash = createHash('md5').update(filePath).digest('hex');
    return join(this.persistentCacheDir, `${hash}.json`);
  }

  private loadFromPersistentCache(filePath: string): LegacyCacheEntry | null {
    try {
      const cachePath = this.getPersistentCachePath(filePath);
      if (existsSync(cachePath)) {
        const data = readFileSync(cachePath, 'utf-8');
        return JSON.parse(data) as LegacyCacheEntry;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  private saveToPersistentCache(filePath: string, entry: LegacyCacheEntry): void {
    try {
      const cachePath = this.getPersistentCachePath(filePath);
      writeFileSync(cachePath, JSON.stringify(entry, null, 2));
    } catch {
      // Ignore errors
    }
  }

  private clearPersistentCache(): void {
    try {
      if (existsSync(this.persistentCacheDir)) {
        const fs = require('fs');
        fs.rmSync(this.persistentCacheDir, { recursive: true, force: true });
        mkdirSync(this.persistentCacheDir, { recursive: true });
      }
    } catch {
      // Ignore errors
    }
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalParseTime: 0,
      averageParseTime: 0,
      cacheSize: 0,
      hitRate: 0,
      totalSize: 0,
      entryCount: 0,
      errors: 0,
      compressionRatio: 1,
      streamingOperations: 0
    };
  }

  // === ADVANCED CACHE PRIVATE METHODS ===

  private async setAdvancedEntry(key: string, entry: CacheEntry): Promise<void> {
    // Check memory limit
    if (this.calculateTotalMemorySize() + entry.size > this.config.memoryLimit * 1024 * 1024) {
      await this.evictAdvancedEntries();
    }

    this.advancedCache.set(key, entry);
    this.stats.entryCount = this.advancedCache.size;
    this.stats.totalSize += entry.size;

    if (this.config.persistToDisk) {
      await this.persistAdvancedEntry(entry);
    }
  }

  private async getAdvancedEntry(key: string): Promise<CacheEntry | null> {
    // Check memory cache first
    let entry = this.advancedCache.get(key);

    if (entry) {
      if (this.isAdvancedEntryExpired(entry)) {
        await this.deleteAdvancedEntry(key);
        return null;
      }

      entry.hits++;
      entry.lastAccess = Date.now();
      return entry;
    }

    // Check disk cache
    if (this.config.persistToDisk) {
      entry = await this.loadAdvancedEntry(key) || undefined;
      if (entry && !this.isAdvancedEntryExpired(entry)) {
        this.advancedCache.set(key, entry);
        entry.hits++;
        entry.lastAccess = Date.now();
        return entry;
      }
    }

    return null;
  }

  private async deleteAdvancedEntry(key: string): Promise<void> {
    const entry = this.advancedCache.get(key);
    if (entry) {
      this.stats.totalSize -= entry.size;
      this.advancedCache.delete(key);
      this.stats.entryCount = this.advancedCache.size;
    }

    if (this.config.persistToDisk) {
      try {
        await unlinkAsync(join(this.config.directory, `${key}.cache`));
      } catch {
        // Entry might not exist on disk
      }
    }
  }

  private async evictAdvancedEntries(): Promise<void> {
    const entries = Array.from(this.advancedCache.entries());
    let toEvict: string[] = [];

    switch (this.config.evictionPolicy) {
      case 'lru':
        entries.sort(([, a], [, b]) => a.lastAccess - b.lastAccess);
        toEvict = entries.slice(0, Math.ceil(entries.length * 0.25)).map(([key]) => key);
        break;

      case 'lfu':
        entries.sort(([, a], [, b]) => a.hits - b.hits);
        toEvict = entries.slice(0, Math.ceil(entries.length * 0.25)).map(([key]) => key);
        break;

      case 'ttl':
        const now = Date.now();
        toEvict = entries
          .filter(([, entry]) => now - entry.timestamp > this.config.ttl * 1000)
          .map(([key]) => key);
        break;

      case 'priority':
        entries.sort(([, a], [, b]) => (a.priority ?? 1) - (b.priority ?? 1));
        toEvict = entries.slice(0, Math.ceil(entries.length * 0.25)).map(([key]) => key);
        break;
    }

    const evictions = toEvict.map(key => this.deleteAdvancedEntry(key));
    await Promise.allSettled(evictions);
    this.stats.evictions += toEvict.length;
  }

  private generateValidationKey(schema: z.ZodSchema, data: any, context?: SchemaOperationContext): string {
    const schemaHash = this.hashSchema(schema);
    const dataHash = this.generateChecksum(data);
    const contextHash = context ? this.generateChecksum(context) : '';
    return `validation:${schemaHash}:${dataHash}:${contextHash}`;
  }

  private generateCompilationKey(schemaSource: string, context?: SchemaOperationContext): string {
    const sourceHash = this.generateChecksum(schemaSource);
    const contextHash = context ? this.generateChecksum(context) : '';
    return `compilation:${sourceHash}:${contextHash}`;
  }

  private hashSchema(schema: z.ZodSchema): string {
    // Create a deterministic hash of the schema structure
    const schemaString = JSON.stringify(schema._def);
    return createHash('sha256').update(schemaString).digest('hex').substring(0, 16);
  }

  private generateChecksum(data: any): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('md5').update(dataString).digest('hex').substring(0, 8);
  }

  private calculateSize(data: any): number {
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  private calculateTotalMemorySize(): number {
    return Array.from(this.advancedCache.values()).reduce((total, entry) => total + entry.size, 0);
  }

  private isAdvancedEntryExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttl * 1000;
  }

  private isAdvancedEntryValid(entry: CacheEntry): boolean {
    return !this.isAdvancedEntryExpired(entry) && !!entry.key && entry.value !== undefined;
  }

  private async ensureAdvancedCacheDirectory(): Promise<void> {
    if (!existsSync(this.config.directory)) {
      await mkdirAsync(this.config.directory, { recursive: true });
    }
  }

  private async persistAdvancedEntry(entry: CacheEntry): Promise<void> {
    try {
      const filePath = join(this.config.directory, `${entry.key}.cache`);
      await writeFileAsync(filePath, JSON.stringify(entry), 'utf8');
    } catch (error) {
      this.stats.errors++;
    }
  }

  private async loadAdvancedEntry(key: string): Promise<CacheEntry | null> {
    try {
      const filePath = join(this.config.directory, `${key}.cache`);
      const data = await readFileAsync(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async warmupAdvancedCache(): Promise<void> {
    if (!this.config.persistToDisk) return;

    try {
      const files = await readdirAsync(this.config.directory);
      const cacheFiles = files.filter((file) => file.endsWith('.cache'));

      const loadPromises = cacheFiles.map(async (file: string) => {
        const key = file.replace('.cache', '');
        const entry = await this.loadAdvancedEntry(key);
        if (entry && this.isAdvancedEntryValid(entry)) {
          this.advancedCache.set(key, entry);
        }
      });

      await Promise.allSettled(loadPromises);
      this.stats.entryCount = this.advancedCache.size;
    } catch (error) {
      this.stats.errors++;
    }
  }

  private async performAdvancedMaintenance(): Promise<void> {
    // Remove expired entries
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.advancedCache.entries()) {
      if (now - entry.timestamp > this.config.ttl * 1000) {
        expiredKeys.push(key);
      }
    }

    const deletions = expiredKeys.map(key => this.deleteAdvancedEntry(key));
    await Promise.allSettled(deletions);

    // Update statistics
    this.updateAdvancedStats();
  }

  private updateAdvancedStats(): void {
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    this.stats.entryCount = this.advancedCache.size;
    this.stats.totalSize = this.calculateTotalMemorySize();

    const entries = Array.from(this.advancedCache.values());
    if (entries.length > 0) {
      this.stats.oldestEntry = Math.min(...entries.map(e => e.timestamp));
      this.stats.newestEntry = Math.max(...entries.map(e => e.timestamp));

      // Calculate compression ratio
      const compressedEntries = entries.filter(e => e.compressed);
      this.stats.compressionRatio = compressedEntries.length / entries.length || 1;
    }
  }

  private async compress(data: string): Promise<Buffer> {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(Buffer.from(data), (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private async decompress(data: Buffer): Promise<string> {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result.toString());
      });
    });
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.config.persistToDisk) {
      // Persist pending entries
      const promises: Promise<void>[] = [];
      for (const entry of this.advancedCache.values()) {
        promises.push(this.persistAdvancedEntry(entry));
      }
      await Promise.allSettled(promises);
    }
  }
}

/**
 * Global cache instance
 */
let globalCache: SchemaCache | null = null;

/**
 * Get or create global cache instance
 */
export function getGlobalCache(config?: CacheConfig): SchemaCache {
  if (!globalCache) {
    globalCache = new SchemaCache({}, config);
  }
  return globalCache;
}

/**
 * Cache decorator for methods
 */
// @ts-ignore: ttl parameter reserved for future TTL implementation
export function cached(ttl?: number, keyGenerator?: (...args: any[]) => string) {
  return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cache = getGlobalCache();

    descriptor.value = async function (...args: any[]) {
      const key = keyGenerator ? keyGenerator(...args) : `${propertyKey}:${JSON.stringify(args)}`;

      // Try to get from cache
      const cached = await cache.getCachedValidationResult(args[0], key);
      if (cached) {
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache the result
      await cache.cacheValidationResult(args[0], key, result, {
        operation: propertyKey,
        schemaHash: 'method-cache',
        parameters: { args }
      });

      return result;
    };

    return descriptor;
  };
}