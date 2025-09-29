/**
 * @fileoverview Streaming service for real-time schema operations
 * @module StreamingService
 */

import * as z from 'zod';
import { EventEmitter } from 'events';
import { SchemaCache, CacheConfig, StreamingResult } from './schema-cache';
import { ValidationError } from './validator';

/**
 * Streaming operation configuration
 */
export interface StreamingConfig {
  batchSize?: number;
  maxConcurrent?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableCache?: boolean;
  cacheConfig?: CacheConfig;
  enableMetrics?: boolean;
  enableRealTime?: boolean;
  bufferSize?: number;
  flushInterval?: number;
}

/**
 * Streaming operation context
 */
export interface StreamingContext {
  operationId: string;
  batchId: string;
  itemIndex: number;
  totalItems: number;
  startTime: number;
  metadata?: Record<string, any>;
}

/**
 * Streaming operation result
 */
export interface StreamingOperationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  context: StreamingContext;
  processingTime: number;
  fromCache?: boolean;
  retryCount?: number;
}

/**
 * Streaming metrics
 */
export interface StreamingMetrics {
  operationsTotal: number;
  operationsSuccess: number;
  operationsError: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  throughputPerSecond: number;
  currentConcurrency: number;
  totalRetries: number;
  bufferUsage: number;
}

/**
 * Stream processor function type
 */
export type StreamProcessor<TInput, TOutput> = (
  input: TInput,
  context: StreamingContext
) => Promise<TOutput>;

/**
 * Real-time streaming service for schema operations
 */
export class StreamingService extends EventEmitter {
  private readonly config: Required<StreamingConfig>;
  private readonly cache?: SchemaCache;
  private readonly activeOperations = new Map<string, Promise<any>>();
  private readonly metrics: StreamingMetrics;
  private readonly buffer: Array<{ data: any; resolve: Function; reject: Function }> = [];
  private flushTimer?: NodeJS.Timeout;
  private operationCounter = 0;

  constructor(config: StreamingConfig = {}) {
    super();

    this.config = {
      batchSize: config.batchSize ?? 50,
      maxConcurrent: config.maxConcurrent ?? 10,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      enableCache: config.enableCache ?? true,
      cacheConfig: config.cacheConfig ?? {},
      enableMetrics: config.enableMetrics ?? true,
      enableRealTime: config.enableRealTime ?? true,
      bufferSize: config.bufferSize ?? 1000,
      flushInterval: config.flushInterval ?? 100
    };

    if (this.config.enableCache) {
      this.cache = new SchemaCache({}, this.config.cacheConfig);
    }

    this.metrics = {
      operationsTotal: 0,
      operationsSuccess: 0,
      operationsError: 0,
      averageProcessingTime: 0,
      cacheHitRate: 0,
      throughputPerSecond: 0,
      currentConcurrency: 0,
      totalRetries: 0,
      bufferUsage: 0
    };

    if (this.config.enableRealTime) {
      this.startFlushTimer();
    }
  }

  /**
   * Stream schema validation operations
   */
  async *streamValidation<T>(
    schema: z.ZodSchema<T>,
    dataStream: AsyncIterable<any>,
    options: {
      enableCache?: boolean;
      tags?: string[];
      priority?: number;
    } = {}
  ): AsyncGenerator<StreamingOperationResult<T>, void, unknown> {
    const operationId = this.generateOperationId();
    let itemIndex = 0;
    let batchId = 0;

    try {
      for await (const batch of this.batchIterator(dataStream, this.config.batchSize)) {
        const batchResults = await this.processBatch(
          batch,
          async (data, context) => {
            const startTime = Date.now();

            // Try cache first
            if (this.config.enableCache && options.enableCache !== false && this.cache) {
              const cached = await this.cache.getCachedValidationResult(schema, data, {
                operation: 'stream-validation',
                schemaHash: this.hashObject(schema),
                ...(options.tags !== undefined && { tags: options.tags }),
                ...(options.priority !== undefined && { priority: options.priority })
              });

              if (cached) {
                this.updateMetrics(true, Date.now() - startTime, true);
                return {
                  success: cached.success,
                  data: cached.success ? data as T : undefined,
                  errors: cached.errors,
                  context,
                  processingTime: Date.now() - startTime,
                  fromCache: true
                } as StreamingOperationResult<T>;
              }
            }

            // Validate data
            try {
              const result = schema.safeParse(data);
              const processingTime = Date.now() - startTime;

              const operationResult: StreamingOperationResult<T> = {
                success: result.success,
                context,
                processingTime,
                fromCache: false,
                ...(result.success ? { data: result.data } : {}),
                ...(!result.success ? { errors: this.zodErrorsToValidationErrors(result.error) } : {})
              };

              // Cache the result
              if (this.config.enableCache && this.cache) {
                await this.cache.cacheValidationResult(schema, data, {
                  success: result.success,
                  ...(operationResult.errors !== undefined && { errors: operationResult.errors })
                }, {
                  operation: 'stream-validation',
                  schemaHash: this.hashObject(schema),
                  ...(options.tags !== undefined && { tags: options.tags }),
                  ...(options.priority !== undefined && { priority: options.priority })
                });
              }

              this.updateMetrics(result.success, processingTime, false);
              return operationResult;

            } catch (error) {
              const processingTime = Date.now() - startTime;
              const operationResult: StreamingOperationResult<T> = {
                success: false,
                errors: [{
                  file: 'streaming',
                  line: 0,
                  column: 0,
                  message: error instanceof Error ? error.message : String(error),
                  severity: 'error' as const,
                  rule: 'stream-validation-error',
                  code: 'STREAM_ERROR'
                }],
                context,
                processingTime,
                fromCache: false
              };

              this.updateMetrics(false, processingTime, false);
              return operationResult;
            }
          },
          operationId,
          batchId++,
          itemIndex
        );

        for (const result of batchResults) {
          yield result;
          itemIndex++;
        }
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Stream schema compilation operations
   */
  async *streamCompilation(
    schemaSources: AsyncIterable<string>,
    options: {
      enableCache?: boolean;
      tags?: string[];
      priority?: number;
    } = {}
  ): AsyncGenerator<StreamingOperationResult<any>, void, unknown> {
    const operationId = this.generateOperationId();
    let itemIndex = 0;
    let batchId = 0;

    try {
      for await (const batch of this.batchIterator(schemaSources, this.config.batchSize)) {
        const batchResults = await this.processBatch(
          batch,
          async (schemaSource, context) => {
            const startTime = Date.now();

            // Try cache first
            if (this.config.enableCache && options.enableCache !== false && this.cache) {
              const cached = await this.cache.getCachedSchemaCompilation(schemaSource, {
                operation: 'stream-compilation',
                schemaHash: this.hashObject(schemaSource),
                ...(options.tags !== undefined && { tags: options.tags }),
                ...(options.priority !== undefined && { priority: options.priority })
              });

              if (cached) {
                this.updateMetrics(true, Date.now() - startTime, true);
                return {
                  success: true,
                  data: cached,
                  context,
                  processingTime: Date.now() - startTime,
                  fromCache: true
                };
              }
            }

            // Compile schema
            try {
              // This would integrate with actual schema compilation logic
              const compiled = await this.compileSchema(schemaSource);
              const processingTime = Date.now() - startTime;

              // Cache the result
              if (this.config.enableCache && this.cache) {
                await this.cache.cacheSchemaCompilation(schemaSource, compiled, {
                  operation: 'stream-compilation',
                  schemaHash: this.hashObject(schemaSource),
                  ...(options.tags !== undefined && { tags: options.tags }),
                  ...(options.priority !== undefined && { priority: options.priority })
                });
              }

              this.updateMetrics(true, processingTime, false);
              return {
                success: true,
                data: compiled,
                context,
                processingTime,
                fromCache: false
              };

            } catch (error) {
              const processingTime = Date.now() - startTime;
              this.updateMetrics(false, processingTime, false);
              return {
                success: false,
                errors: [{
                  file: 'streaming',
                  line: 0,
                  column: 0,
                  message: error instanceof Error ? error.message : String(error),
                  severity: 'error' as const,
                  rule: 'stream-compilation-error',
                  code: 'COMPILE_ERROR'
                }],
                context,
                processingTime,
                fromCache: false
              };
            }
          },
          operationId,
          batchId++,
          itemIndex
        );

        for (const result of batchResults) {
          yield result;
          itemIndex++;
        }
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Stream cached data with real-time updates
   */
  async *streamCachedData<T>(
    keys: string[],
    options: {
      watchForUpdates?: boolean;
      updateInterval?: number;
    } = {}
  ): AsyncGenerator<StreamingResult<T>, void, unknown> {
    if (!this.cache) {
      throw new Error('Cache is not enabled');
    }

    const operationId = this.generateOperationId();

    try {
      // Initial data fetch
      for await (const result of this.cache.streamCachedData<T>(keys, this.config.batchSize)) {
        yield result;
      }

      // Watch for updates if requested
      if (options.watchForUpdates) {
        const updateInterval = options.updateInterval ?? 5000;
        const intervalId = setInterval(async () => {
          try {
            for await (const result of this.cache!.streamCachedData<T>(keys, this.config.batchSize)) {
              this.emit('update', result);
              // Note: Cannot yield from inside callback
            }
          } catch (error) {
            this.emit('error', error);
          }
        }, updateInterval);

        // Cleanup interval when done
        process.once('exit', () => clearInterval(intervalId));
      }

    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Process operation with buffering
   */
  async processWithBuffer<T>(
    data: any,
    _processor: StreamProcessor<any, T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.buffer.length >= this.config.bufferSize) {
        reject(new Error('Buffer overflow'));
        return;
      }

      this.buffer.push({ data, resolve, reject });
      this.metrics.bufferUsage = this.buffer.length;

      if (this.buffer.length >= this.config.batchSize) {
        this.flushBuffer();
      }
    });
  }

  /**
   * Get current streaming metrics
   */
  getMetrics(): StreamingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active operations count
   */
  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Cancel all active operations
   */
  async cancelAllOperations(): Promise<void> {
    const operations = Array.from(this.activeOperations.values());
    this.activeOperations.clear();

    // Wait for operations to complete or timeout
    await Promise.allSettled(operations);
  }

  /**
   * Shutdown the streaming service
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flushBuffer();
    await this.cancelAllOperations();

    if (this.cache) {
      await this.cache.shutdown();
    }

    this.removeAllListeners();
  }

  // Private methods

  private async *batchIterator<T>(
    iterable: AsyncIterable<T>,
    batchSize: number
  ): AsyncGenerator<T[], void, unknown> {
    let batch: T[] = [];

    for await (const item of iterable) {
      batch.push(item);

      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield batch;
    }
  }

  private async processBatch<TInput, TOutput>(
    batch: TInput[],
    processor: StreamProcessor<TInput, TOutput>,
    operationId: string,
    batchId: number,
    startIndex: number
  ): Promise<TOutput[]> {
    const batchPromise = this.processBatchWithConcurrency(
      batch,
      processor,
      operationId,
      batchId,
      startIndex
    );

    this.activeOperations.set(`${operationId}-${batchId}`, batchPromise);

    try {
      const results = await batchPromise;
      this.activeOperations.delete(`${operationId}-${batchId}`);
      return results;
    } catch (error) {
      this.activeOperations.delete(`${operationId}-${batchId}`);
      throw error;
    }
  }

  private async processBatchWithConcurrency<TInput, TOutput>(
    batch: TInput[],
    processor: StreamProcessor<TInput, TOutput>,
    operationId: string,
    batchId: number,
    startIndex: number
  ): Promise<TOutput[]> {
    const results: TOutput[] = [];
    // @ts-ignore: Reserved for semaphore-based concurrency control
    const semaphore = new Array(this.config.maxConcurrent).fill(null);

    const processItem = async (item: TInput, index: number): Promise<void> => {
      const context: StreamingContext = {
        operationId,
        batchId: `${operationId}-${batchId}`,
        itemIndex: startIndex + index,
        totalItems: batch.length,
        startTime: Date.now()
      };

      let retryCount = 0;
      while (retryCount <= this.config.retryAttempts) {
        try {
          this.metrics.currentConcurrency++;
          const result = await processor(item, context);
          this.metrics.currentConcurrency--;
          results[index] = result;
          return;
        } catch (error) {
          this.metrics.currentConcurrency--;
          retryCount++;
          this.metrics.totalRetries++;

          if (retryCount > this.config.retryAttempts) {
            throw error;
          }

          await this.delay(this.config.retryDelay * retryCount);
        }
      }
    };

    // Process items with concurrency control
    const chunks = this.chunkArray(batch, this.config.maxConcurrent);
    for (const chunk of chunks) {
      const promises = chunk.map((item, index) =>
        processItem(item, chunks.indexOf(chunk) * this.config.maxConcurrent + index)
      );
      await Promise.allSettled(promises);
    }

    return results;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const items = this.buffer.splice(0, this.config.batchSize);
    this.metrics.bufferUsage = this.buffer.length;

    // Process buffer items
    for (const item of items) {
      try {
        // This would be implemented based on the specific use case
        item.resolve(item.data);
      } catch (error) {
        item.reject(error);
      }
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch(error => {
        this.emit('error', error);
      });
    }, this.config.flushInterval);
  }

  private generateOperationId(): string {
    return `op-${Date.now()}-${++this.operationCounter}`;
  }

  private hashObject(obj: any): string {
    const crypto = require('crypto');
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  private zodErrorsToValidationErrors(zodError: z.ZodError): ValidationError[] {
    return zodError.issues.map((error: any) => ({
      file: 'streaming',
      line: 0,
      column: 0,
      message: error.message,
      severity: 'error' as const,
      rule: error.code,
      code: error.code.toUpperCase(),
      path: error.path.join('.')
    }));
  }

  private async compileSchema(schemaSource: string): Promise<any> {
    // This would be implemented to integrate with actual schema compilation
    // For now, return a mock compiled schema
    return {
      source: schemaSource,
      compiled: true,
      timestamp: Date.now()
    };
  }

  private updateMetrics(success: boolean, processingTime: number, fromCache: boolean): void {
    this.metrics.operationsTotal++;

    if (success) {
      this.metrics.operationsSuccess++;
    } else {
      this.metrics.operationsError++;
    }

    // Update average processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.operationsTotal - 1) + processingTime;
    this.metrics.averageProcessingTime = totalTime / this.metrics.operationsTotal;

    // Update cache hit rate
    if (fromCache) {
      const cacheHits = this.metrics.cacheHitRate * this.metrics.operationsTotal + 1;
      this.metrics.cacheHitRate = cacheHits / this.metrics.operationsTotal;
    } else {
      const cacheHits = this.metrics.cacheHitRate * this.metrics.operationsTotal;
      this.metrics.cacheHitRate = cacheHits / this.metrics.operationsTotal;
    }

    // Update throughput (simplified calculation)
    this.metrics.throughputPerSecond = this.metrics.operationsTotal /
      ((Date.now() - this.metrics.operationsTotal * this.metrics.averageProcessingTime) / 1000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global streaming service instance
 */
let globalStreamingService: StreamingService | null = null;

/**
 * Get or create global streaming service instance
 */
export function getGlobalStreamingService(config?: StreamingConfig): StreamingService {
  if (!globalStreamingService) {
    globalStreamingService = new StreamingService(config);
  }
  return globalStreamingService;
}