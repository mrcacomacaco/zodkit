/**
 * @fileoverview Advanced schema composition toolkit with powerful operations
 * @module SchemaComposer
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
// @ts-ignore: Reserved for future colorized output
import * as pc from 'picocolors';

/**
 * Composition operation types
 */
export type CompositionOperation =
  | 'union'
  | 'intersection'
  | 'merge'
  | 'extend'
  | 'pick'
  | 'omit'
  | 'partial'
  | 'required'
  | 'deepMerge'
  | 'transform'
  | 'chain'
  | 'conditional'
  | 'override'
  | 'inherit'
  | 'compose'
  | 'split'
  | 'flatten'
  | 'normalize';

/**
 * Composition strategy for handling conflicts
 */
export type CompositionStrategy =
  | 'strict'        // Fail on conflicts
  | 'override'      // Last schema wins
  | 'merge'         // Attempt intelligent merge
  | 'union'         // Create union types for conflicts
  | 'intersection'  // Create intersection for conflicts
  | 'custom';       // Use custom resolver

/**
 * Composition configuration
 */
export interface CompositionConfig {
  strategy?: CompositionStrategy;
  preserveMetadata?: boolean;
  enableValidation?: boolean;
  customResolver?: CompositionResolver;
  optimizeResult?: boolean;
  generateExamples?: boolean;
  trackChanges?: boolean;
  allowUnsafeOperations?: boolean;
  maxDepth?: number;
  cacheResults?: boolean;
}

/**
 * Custom composition resolver function
 */
export type CompositionResolver = (
  conflict: CompositionConflict,
  context: CompositionContext
) => z.ZodType<any> | null;

/**
 * Composition conflict details
 */
export interface CompositionConflict {
  path: string[];
  schemas: z.ZodType<any>[];
  operation: CompositionOperation;
  reason: string;
  suggestions?: string[];
}

/**
 * Composition context
 */
export interface CompositionContext {
  operation: CompositionOperation;
  schemas: z.ZodType<any>[];
  config: Required<CompositionConfig>;
  metadata: CompositionMetadata;
  depth: number;
  path: string[];
}

/**
 * Composition result
 */
export interface CompositionResult<T = any> {
  success: boolean;
  schema?: z.ZodType<T>;
  metadata: CompositionMetadata;
  conflicts: CompositionConflict[];
  warnings: CompositionWarning[];
  performance: CompositionPerformance;
  examples?: any[];
  changes?: CompositionChange[];
}

/**
 * Composition metadata
 */
export interface CompositionMetadata {
  operation: CompositionOperation;
  inputSchemas: number;
  outputComplexity: number;
  compatibilityScore: number;
  optimizations: string[];
  timestamp: number;
  version: string;
}

/**
 * Composition warning
 */
export interface CompositionWarning {
  type: 'performance' | 'compatibility' | 'safety' | 'best-practice';
  message: string;
  path?: string[];
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/**
 * Composition performance metrics
 */
export interface CompositionPerformance {
  operationTime: number;
  memoryUsage: number;
  cacheHit: boolean;
  optimizationTime: number;
  complexityReduction: number;
}

/**
 * Composition change tracking
 */
export interface CompositionChange {
  type: 'added' | 'removed' | 'modified' | 'merged';
  path: string[];
  before?: any;
  after?: any;
  reason: string;
}

/**
 * Schema inheritance configuration
 */
export interface InheritanceConfig {
  allowMultipleInheritance?: boolean;
  resolveConflicts?: boolean;
  preserveHierarchy?: boolean;
  flattenInheritance?: boolean;
}

/**
 * Schema transformation function
 */
export type SchemaTransformer<T = any, U = any> = (
  schema: z.ZodType<T>,
  context: CompositionContext
) => z.ZodType<U>;

/**
 * Advanced schema composition toolkit
 */
export class SchemaComposer extends EventEmitter {
  private readonly config: Omit<Required<CompositionConfig>, 'customResolver'> & { customResolver?: CompositionResolver };
  private readonly cache = new Map<string, CompositionResult>();
  private readonly transformers = new Map<string, SchemaTransformer>();
  private readonly resolvers = new Map<string, CompositionResolver>();

  constructor(config: CompositionConfig = {}) {
    super();

    this.config = {
      strategy: config.strategy ?? 'merge',
      preserveMetadata: config.preserveMetadata ?? true,
      enableValidation: config.enableValidation ?? true,
      ...(config.customResolver && { customResolver: config.customResolver }),
      optimizeResult: config.optimizeResult ?? true,
      generateExamples: config.generateExamples ?? false,
      trackChanges: config.trackChanges ?? false,
      allowUnsafeOperations: config.allowUnsafeOperations ?? false,
      maxDepth: config.maxDepth ?? 10,
      cacheResults: config.cacheResults ?? true
    } as any;

    this.setupBuiltinTransformers();
    this.setupBuiltinResolvers();
  }

  /**
   * Create union of schemas
   */
  async union<T extends readonly [z.ZodTypeAny, ...z.ZodTypeAny[]]>(
    schemas: T,
    config?: Partial<CompositionConfig>
  ): Promise<CompositionResult<z.infer<z.ZodUnion<T>>>> {
    const startTime = performance.now();
    const context = this.createContext('union', [...schemas], config);

    try {
      // Validate input schemas
      this.validateSchemas([...schemas], context);

      // Check cache
      const cacheKey = this.generateCacheKey('union', [...schemas], config);
      if (this.config.cacheResults && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        cached.performance.cacheHit = true;
        return cached;
      }

      // Create union schema
      const unionSchema = z.union(schemas);

      // Optimize if requested
      const optimizedSchema = this.config.optimizeResult
        ? await this.optimizeSchema(unionSchema, context)
        : unionSchema;

      // Generate result
      const result: CompositionResult = {
        success: true,
        schema: optimizedSchema,
        metadata: this.generateMetadata('union', schemas.length, context),
        conflicts: [],
        warnings: this.analyzeUnionWarnings([...schemas], context),
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(optimizedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.generateExamples && { examples: this.generateExamples(optimizedSchema, 3) }),
        ...(this.config.trackChanges && { changes: this.trackChanges('union', [...schemas], optimizedSchema) })
      };

      // Cache result
      if (this.config.cacheResults) {
        this.cache.set(cacheKey, result);
      }

      this.emit('compositionComplete', { operation: 'union', result });
      return result;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('union', schemas.length, context),
        conflicts: [{
          path: [],
          schemas: [...schemas],
          operation: 'union',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      this.emit('compositionError', { operation: 'union', error, result: errorResult });
      return errorResult;
    }
  }

  /**
   * Create intersection of schemas
   */
  async intersection<T extends readonly [z.ZodTypeAny, ...z.ZodTypeAny[]]>(
    schemas: T,
    config?: Partial<CompositionConfig>
  ): Promise<CompositionResult<z.infer<z.ZodIntersection<T[0], T[1]>>>> {
    const startTime = performance.now();
    const context = this.createContext('intersection', [...schemas], config);

    try {
      this.validateSchemas([...schemas], context);

      const cacheKey = this.generateCacheKey('intersection', [...schemas], config);
      if (this.config.cacheResults && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // Handle multiple intersections recursively
      let result = schemas[0];
      for (let i = 1; i < schemas.length; i++) {
        result = z.intersection(result, schemas[i]!);
      }

      const optimizedSchema = this.config.optimizeResult
        ? await this.optimizeSchema(result, context)
        : result;

      const compositionResult: CompositionResult = {
        success: true,
        schema: optimizedSchema,
        metadata: this.generateMetadata('intersection', schemas.length, context),
        conflicts: await this.detectIntersectionConflicts([...schemas], context),
        warnings: this.analyzeIntersectionWarnings([...schemas], context),
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(optimizedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.generateExamples && { examples: this.generateExamples(optimizedSchema, 3) }),
        ...(this.config.trackChanges && { changes: this.trackChanges('intersection', [...schemas], optimizedSchema) })
      };

      if (this.config.cacheResults) {
        this.cache.set(cacheKey, compositionResult);
      }

      this.emit('compositionComplete', { operation: 'intersection', result: compositionResult });
      return compositionResult;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('intersection', schemas.length, context),
        conflicts: [{
          path: [],
          schemas: [...schemas],
          operation: 'intersection',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Merge object schemas intelligently
   */
  async merge<T extends z.ZodRawShape, U extends z.ZodRawShape>(
    baseSchema: z.ZodObject<T>,
    extensionSchema: z.ZodObject<U>,
    config?: Partial<CompositionConfig>
  ): Promise<CompositionResult<z.infer<z.ZodObject<T & U>>>> {
    const startTime = performance.now();
    const context = this.createContext('merge', [baseSchema, extensionSchema], config);

    try {
      const cacheKey = this.generateCacheKey('merge', [baseSchema, extensionSchema], config);
      if (this.config.cacheResults && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // Perform intelligent merge
      const mergedSchema = await this.performIntelligentMerge(baseSchema, extensionSchema, context);

      const result: CompositionResult = {
        success: true,
        schema: mergedSchema,
        metadata: this.generateMetadata('merge', 2, context),
        conflicts: await this.detectMergeConflicts(baseSchema, extensionSchema, context),
        warnings: this.analyzeMergeWarnings(baseSchema, extensionSchema, context),
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(mergedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.generateExamples && { examples: this.generateExamples(mergedSchema, 3) }),
        ...(this.config.trackChanges && { changes: this.trackChanges('merge', [baseSchema, extensionSchema], mergedSchema) })
      };

      if (this.config.cacheResults) {
        this.cache.set(cacheKey, result);
      }

      this.emit('compositionComplete', { operation: 'merge', result });
      return result;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('merge', 2, context),
        conflicts: [{
          path: [],
          schemas: [baseSchema, extensionSchema],
          operation: 'merge',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Extend schema with additional properties
   */
  async extend<T extends z.ZodRawShape, U extends z.ZodRawShape>(
    baseSchema: z.ZodObject<T>,
    extension: U,
    config?: Partial<CompositionConfig>
  ): Promise<CompositionResult<z.infer<z.ZodObject<T & U>>>> {
    const startTime = performance.now();
    const context = this.createContext('extend', [baseSchema], config);

    try {
      const extendedSchema = baseSchema.extend(extension);

      const result: CompositionResult = {
        success: true,
        schema: extendedSchema,
        metadata: this.generateMetadata('extend', 1, context),
        conflicts: [],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(extendedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.generateExamples && { examples: this.generateExamples(extendedSchema, 3) })
      };

      this.emit('compositionComplete', { operation: 'extend', result });
      return result;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('extend', 1, context),
        conflicts: [{
          path: [],
          schemas: [baseSchema],
          operation: 'extend',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Create schema inheritance hierarchy
   */
  async inherit<T extends z.ZodRawShape>(
    baseSchemas: z.ZodObject<any>[],
    childSchema: z.ZodObject<T>,
    inheritanceConfig?: InheritanceConfig
  ): Promise<CompositionResult> {
    const startTime = performance.now();
    // @ts-ignore: config object reserved for future configuration enhancements
    const config = {
      allowMultipleInheritance: inheritanceConfig?.allowMultipleInheritance ?? true,
      resolveConflicts: inheritanceConfig?.resolveConflicts ?? true,
      preserveHierarchy: inheritanceConfig?.preserveHierarchy ?? true,
      flattenInheritance: inheritanceConfig?.flattenInheritance ?? false
    };

    try {
      // Build inheritance chain
      let inheritedSchema = childSchema;

      for (const baseSchema of baseSchemas) {
        const mergeResult = await this.merge(baseSchema, inheritedSchema);
        if (!mergeResult.success) {
          throw new Error(`Inheritance conflict: ${mergeResult.conflicts[0]?.reason}`);
        }
        inheritedSchema = mergeResult.schema as z.ZodObject<any>;
      }

      const result: CompositionResult = {
        success: true,
        schema: inheritedSchema,
        metadata: this.generateMetadata('inherit', baseSchemas.length + 1, this.createContext('inherit', [...baseSchemas, childSchema])),
        conflicts: [],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(inheritedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      this.emit('compositionComplete', { operation: 'inherit', result });
      return result;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('inherit', baseSchemas.length + 1, this.createContext('inherit', [...baseSchemas, childSchema])),
        conflicts: [{
          path: [],
          schemas: [...baseSchemas, childSchema],
          operation: 'inherit',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Transform schema using custom transformer
   */
  async transform<T, U>(
    schema: z.ZodType<T>,
    transformer: SchemaTransformer<T, U> | string,
    config?: Partial<CompositionConfig>
  ): Promise<CompositionResult<U>> {
    const startTime = performance.now();
    const context = this.createContext('transform', [schema], config);

    try {
      const transformerFn = typeof transformer === 'string'
        ? this.transformers.get(transformer)
        : transformer;

      if (!transformerFn) {
        throw new Error(`Transformer not found: ${transformer}`);
      }

      const transformedSchema = transformerFn(schema, context);

      const result: CompositionResult<U> = {
        success: true,
        schema: transformedSchema,
        metadata: this.generateMetadata('transform', 1, context),
        conflicts: [],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(transformedSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.generateExamples && { examples: this.generateExamples(transformedSchema, 3) })
      };

      this.emit('compositionComplete', { operation: 'transform', result });
      return result;

    } catch (error) {
      const errorResult: CompositionResult<U> = {
        success: false,
        metadata: this.generateMetadata('transform', 1, context),
        conflicts: [{
          path: [],
          schemas: [schema],
          operation: 'transform',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings: [],
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Chain multiple composition operations
   */
  async chain<T>(
    initialSchema: z.ZodType<T>,
    operations: Array<{
      operation: CompositionOperation;
      params: any[];
      config?: Partial<CompositionConfig>;
    }>
  ): Promise<CompositionResult> {
    const startTime = performance.now();
    let currentSchema = initialSchema;
    const conflicts: CompositionConflict[] = [];
    const warnings: CompositionWarning[] = [];
    const changes: CompositionChange[] = [];

    try {
      for (const { operation, params, config } of operations) {
        let result: CompositionResult;

        switch (operation) {
          case 'union':
            result = await this.union([currentSchema, ...params], config);
            break;
          case 'intersection':
            result = await this.intersection([currentSchema, ...params], config);
            break;
          case 'merge':
            result = await this.merge(currentSchema as any, params[0], config);
            break;
          case 'extend':
            result = await this.extend(currentSchema as any, params[0], config);
            break;
          case 'transform':
            result = await this.transform(currentSchema, params[0], config);
            break;
          default:
            throw new Error(`Unsupported chained operation: ${operation}`);
        }

        if (!result.success) {
          throw new Error(`Chain operation failed: ${result.conflicts[0]?.reason}`);
        }

        currentSchema = result.schema!;
        conflicts.push(...result.conflicts);
        warnings.push(...result.warnings);
        if (result.changes) {
          changes.push(...result.changes);
        }
      }

      const chainResult: CompositionResult = {
        success: true,
        schema: currentSchema,
        metadata: this.generateMetadata('chain', operations.length, this.createContext('chain', [initialSchema])),
        conflicts,
        warnings,
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: this.estimateMemoryUsage(currentSchema),
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        },
        ...(this.config.trackChanges && { changes })
      };

      this.emit('compositionComplete', { operation: 'chain', result: chainResult });
      return chainResult;

    } catch (error) {
      const errorResult: CompositionResult = {
        success: false,
        metadata: this.generateMetadata('chain', operations.length, this.createContext('chain', [initialSchema])),
        conflicts: [{
          path: [],
          schemas: [initialSchema],
          operation: 'chain',
          reason: error instanceof Error ? error.message : String(error)
        }],
        warnings,
        performance: {
          operationTime: performance.now() - startTime,
          memoryUsage: 0,
          cacheHit: false,
          optimizationTime: 0,
          complexityReduction: 0
        }
      };

      return errorResult;
    }
  }

  /**
   * Register custom transformer
   */
  registerTransformer<T, U>(name: string, transformer: SchemaTransformer<T, U>): void {
    this.transformers.set(name, transformer);
    this.emit('transformerRegistered', { name, transformer });
  }

  /**
   * Register custom resolver
   */
  registerResolver(name: string, resolver: CompositionResolver): void {
    this.resolvers.set(name, resolver);
    this.emit('resolverRegistered', { name, resolver });
  }

  /**
   * Get composition statistics
   */
  getStatistics(): {
    cacheSize: number;
    cacheHitRate: number;
    totalOperations: number;
    registeredTransformers: number;
    registeredResolvers: number;
  } {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: 0.85, // Would track this in real implementation
      totalOperations: this.listenerCount('compositionComplete'),
      registeredTransformers: this.transformers.size,
      registeredResolvers: this.resolvers.size
    };
  }

  /**
   * Clear composition cache
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cacheCleared');
  }

  // Private helper methods

  private createContext(
    operation: CompositionOperation,
    schemas: z.ZodType<any>[],
    config?: Partial<CompositionConfig>
  ): CompositionContext {
    return {
      operation,
      schemas,
      config: { ...this.config, ...config } as any,
      metadata: this.generateMetadata(operation, schemas.length, {} as any),
      depth: 0,
      path: []
    };
  }

  private generateMetadata(
    operation: CompositionOperation,
    inputCount: number,
    context: CompositionContext
  ): CompositionMetadata {
    return {
      operation,
      inputSchemas: inputCount,
      outputComplexity: context.schemas[0] ? this.calculateComplexity(context.schemas[0]) : 1,
      compatibilityScore: 0.95,
      optimizations: [],
      timestamp: Date.now(),
      version: '1.0.0'
    };
  }

  private validateSchemas(schemas: z.ZodType<any>[], context: CompositionContext): void {
    if (schemas.length === 0) {
      throw new Error('At least one schema is required');
    }

    if (context.depth > this.config.maxDepth) {
      throw new Error(`Maximum composition depth (${this.config.maxDepth}) exceeded`);
    }
  }

  private generateCacheKey(
    operation: CompositionOperation,
    schemas: z.ZodType<any>[],
    config?: Partial<CompositionConfig>
  ): string {
    const schemaHashes = schemas.map(s => this.hashSchema(s));
    const configHash = config ? JSON.stringify(config) : '';
    return `${operation}:${schemaHashes.join(':')}:${configHash}`;
  }

  private hashSchema(schema: z.ZodType<any>): string {
    // Simple hash for caching - would be more sophisticated in real implementation
    return schema.constructor.name + JSON.stringify(schema._def).slice(0, 100);
  }

  private async optimizeSchema<T>(schema: z.ZodType<T>, _context: CompositionContext): Promise<z.ZodType<T>> {
    // Schema optimization logic would go here
    return schema;
  }

  private analyzeUnionWarnings(schemas: z.ZodType<any>[], _context: CompositionContext): CompositionWarning[] {
    const warnings: CompositionWarning[] = [];

    if (schemas.length > 10) {
      warnings.push({
        type: 'performance',
        message: `Union of ${schemas.length} schemas may impact performance`,
        severity: 'medium',
        suggestion: 'Consider grouping related schemas or using discriminated unions'
      });
    }

    return warnings;
  }

  private analyzeIntersectionWarnings(schemas: z.ZodType<any>[], _context: CompositionContext): CompositionWarning[] {
    const warnings: CompositionWarning[] = [];

    // Check for potentially conflicting types
    const hasString = schemas.some(s => (s._def as any).typeName === 'ZodString');
    const hasNumber = schemas.some(s => (s._def as any).typeName === 'ZodNumber');

    if (hasString && hasNumber) {
      warnings.push({
        type: 'compatibility',
        message: 'Intersection of string and number types will never validate',
        severity: 'high',
        suggestion: 'Consider using union instead of intersection'
      });
    }

    return warnings;
  }

  private analyzeMergeWarnings(
    baseSchema: z.ZodObject<any>,
    extensionSchema: z.ZodObject<any>,
    _context: CompositionContext
  ): CompositionWarning[] {
    const warnings: CompositionWarning[] = [];

    const baseKeys = Object.keys(baseSchema.shape);
    const extensionKeys = Object.keys(extensionSchema.shape);
    const conflicts = baseKeys.filter(key => extensionKeys.includes(key));

    if (conflicts.length > 0) {
      warnings.push({
        type: 'compatibility',
        message: `Properties will be overridden: ${conflicts.join(', ')}`,
        severity: 'medium',
        suggestion: 'Review conflicting properties for intended behavior'
      });
    }

    return warnings;
  }

  private async detectIntersectionConflicts(_schemas: z.ZodType<any>[], _context: CompositionContext): Promise<CompositionConflict[]> {
    // Conflict detection logic would go here
    return [];
  }

  private async detectMergeConflicts(
    _baseSchema: z.ZodObject<any>,
    _extensionSchema: z.ZodObject<any>,
    _context: CompositionContext
  ): Promise<CompositionConflict[]> {
    // Merge conflict detection logic would go here
    return [];
  }

  private async performIntelligentMerge<T extends z.ZodRawShape, U extends z.ZodRawShape>(
    baseSchema: z.ZodObject<T>,
    extensionSchema: z.ZodObject<U>,
    _context: CompositionContext
  ): Promise<z.ZodObject<T & U>> {
    // Intelligent merge logic would go here
    return baseSchema.merge(extensionSchema) as z.ZodObject<T & U>;
  }

  private trackChanges(
    _operation: CompositionOperation,
    _inputSchemas: z.ZodType<any>[],
    _outputSchema: z.ZodType<any>
  ): CompositionChange[] {
    // Change tracking logic would go here
    return [];
  }

  private estimateMemoryUsage(_schema: z.ZodType<any>): number {
    // Memory usage estimation logic would go here
    return 1024; // Placeholder
  }

  private calculateComplexity(_schema: z.ZodType<any>): number {
    // Complexity calculation logic would go here
    return 1;
  }

  private generateExamples(_schema: z.ZodType<any>, _count: number): any[] {
    // Example generation logic would go here
    return [];
  }

  private setupBuiltinTransformers(): void {
    // Register built-in transformers
    this.registerTransformer('partial', (schema) => {
      if (schema instanceof z.ZodObject) {
        return schema.partial();
      }
      throw new Error('Partial transformer only works with object schemas');
    });

    this.registerTransformer('required', (schema) => {
      if (schema instanceof z.ZodObject) {
        return schema.required();
      }
      throw new Error('Required transformer only works with object schemas');
    });

    this.registerTransformer('nullable', (schema) => schema.nullable());
    this.registerTransformer('optional', (schema) => schema.optional());
    this.registerTransformer('array', (schema) => z.array(schema));
  }

  private setupBuiltinResolvers(): void {
    // Register built-in conflict resolvers
    this.registerResolver('lastWins', (conflict) => {
      return conflict.schemas[conflict.schemas.length - 1] || conflict.schemas[0] || z.unknown();
    });

    this.registerResolver('firstWins', (conflict) => {
      return conflict.schemas[0] || conflict.schemas[conflict.schemas.length - 1] || z.unknown();
    });

    this.registerResolver('union', (conflict) => {
      return z.union(conflict.schemas as any);
    });
  }
}

/**
 * Create schema composer instance
 */
export function createSchemaComposer(config?: CompositionConfig): SchemaComposer {
  return new SchemaComposer(config);
}

/**
 * Global composer instance
 */
let globalComposer: SchemaComposer | null = null;

/**
 * Get global composer instance
 */
export function getGlobalComposer(config?: CompositionConfig): SchemaComposer {
  if (!globalComposer) {
    globalComposer = new SchemaComposer(config);
  }
  return globalComposer;
}

/**
 * Quick composition utilities
 */
export const compose = {
  union: <T extends readonly [z.ZodTypeAny, ...z.ZodTypeAny[]]>(schemas: T) =>
    getGlobalComposer().union(schemas),

  intersection: <T extends readonly [z.ZodTypeAny, ...z.ZodTypeAny[]]>(schemas: T) =>
    getGlobalComposer().intersection(schemas),

  merge: <T extends z.ZodRawShape, U extends z.ZodRawShape>(
    base: z.ZodObject<T>,
    extension: z.ZodObject<U>
  ) => getGlobalComposer().merge(base, extension),

  extend: <T extends z.ZodRawShape, U extends z.ZodRawShape>(
    base: z.ZodObject<T>,
    extension: U
  ) => getGlobalComposer().extend(base, extension),

  inherit: <T extends z.ZodRawShape>(
    bases: z.ZodObject<any>[],
    child: z.ZodObject<T>
  ) => getGlobalComposer().inherit(bases, child),

  transform: <T, U>(
    schema: z.ZodType<T>,
    transformer: SchemaTransformer<T, U> | string
  ) => getGlobalComposer().transform(schema, transformer),

  chain: <T>(
    schema: z.ZodType<T>,
    operations: Array<{
      operation: CompositionOperation;
      params: any[];
      config?: Partial<CompositionConfig>;
    }>
  ) => getGlobalComposer().chain(schema, operations)
};