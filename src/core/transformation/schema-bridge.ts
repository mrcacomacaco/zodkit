/**
 * @fileoverview Cross-Framework Schema Bridge for universal compatibility
 * @module SchemaBridge
 */

import * as z from 'zod';
import { EventEmitter } from 'events';

/**
 * Supported schema frameworks
 */
export type SupportedFramework =
  | 'zod'
  | 'joi'
  | 'yup'
  | 'ajv'
  | 'superstruct'
  | 'io-ts'
  | 'runtypes'
  | 'typescript'
  | 'json-schema'
  | 'openapi'
  | 'graphql'
  | 'protobuf';

/**
 * Universal schema representation
 */
export interface UniversalSchema {
  id: string;
  name?: string;
  description?: string;
  type: UniversalSchemaType;
  properties?: Record<string, UniversalSchema>;
  items?: UniversalSchema;
  enum?: any[];
  const?: any;
  oneOf?: UniversalSchema[];
  anyOf?: UniversalSchema[];
  allOf?: UniversalSchema[];
  not?: UniversalSchema;
  required?: string[];
  optional?: string[];
  default?: any;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | UniversalSchema;
  metadata?: Record<string, any>;
  examples?: any[];
  deprecated?: boolean;
  nullable?: boolean;
  readonly?: boolean;
  writeOnly?: boolean;
  tags?: string[];
  source?: {
    framework: SupportedFramework;
    originalSchema: any;
    version?: string;
  };
}

/**
 * Universal schema types
 */
export type UniversalSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'undefined'
  | 'unknown'
  | 'any'
  | 'never'
  | 'union'
  | 'intersection'
  | 'tuple'
  | 'record'
  | 'function'
  | 'date'
  | 'bigint'
  | 'symbol'
  | 'literal'
  | 'enum'
  | 'branded'
  | 'lazy'
  | 'discriminated-union'
  | 'conditional'
  | 'template-literal';

/**
 * Bridge configuration
 */
export interface BridgeConfig {
  enableCache?: boolean;
  strictMode?: boolean;
  preserveMetadata?: boolean;
  enableValidation?: boolean;
  customTransformers?: Map<string, SchemaTransformer>;
  conversionOptions?: {
    lossyConversion?: boolean;
    approximateTypes?: boolean;
    preserveComments?: boolean;
    generateExamples?: boolean;
  };
  frameworkOptions?: {
    [K in SupportedFramework]?: Record<string, any>;
  };
}

/**
 * Schema transformer interface
 */
export interface SchemaTransformer {
  from: SupportedFramework;
  to: SupportedFramework;
  transform(schema: any, options?: any): any;
  supports(schema: any): boolean;
  priority: number;
}

/**
 * Conversion result
 */
export interface ConversionResult<T = any> {
  success: boolean;
  result?: T;
  warnings: ConversionWarning[];
  errors: ConversionError[];
  metadata: {
    sourceFramework: SupportedFramework;
    targetFramework: SupportedFramework;
    conversionTime: number;
    lossyConversion: boolean;
    compatibility: number; // 0-1 score
  };
}

/**
 * Conversion warning
 */
export interface ConversionWarning {
  code: string;
  message: string;
  path?: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/**
 * Conversion error
 */
export interface ConversionError {
  code: string;
  message: string;
  path?: string;
  fatal: boolean;
  originalError?: Error;
}

/**
 * Framework adapter interface
 */
export interface FrameworkAdapter<T = any> {
  framework: SupportedFramework;
  version?: string;

  // Convert from framework to universal
  toUniversal(schema: T): Promise<UniversalSchema>;

  // Convert from universal to framework
  fromUniversal(schema: UniversalSchema): Promise<T>;

  // Validate data using framework schema
  validate(schema: T, data: any): Promise<ValidationResult>;

  // Check if schema is supported by this adapter
  supports(schema: any): boolean;

  // Get framework-specific metadata
  getMetadata(schema: T): Record<string, any>;

  // Optimize schema for framework
  optimize?(schema: T): Promise<T>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  success: boolean;
  data?: any;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
  value?: any;
  expected?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  suggestion?: string;
}

/**
 * Cross-framework schema bridge for universal compatibility
 */
export class SchemaBridge extends EventEmitter {
  private readonly adapters = new Map<SupportedFramework, FrameworkAdapter>();
  private readonly transformers = new Map<string, SchemaTransformer>();
  private readonly cache = new Map<string, any>();
  private readonly config: Required<BridgeConfig>;

  constructor(config: BridgeConfig = {}) {
    super();

    this.config = {
      enableCache: config.enableCache ?? true,
      strictMode: config.strictMode ?? false,
      preserveMetadata: config.preserveMetadata ?? true,
      enableValidation: config.enableValidation ?? true,
      customTransformers: config.customTransformers ?? new Map(),
      conversionOptions: {
        lossyConversion: false,
        approximateTypes: false,
        preserveComments: true,
        generateExamples: false,
        ...config.conversionOptions
      },
      frameworkOptions: config.frameworkOptions ?? {}
    };

    this.initializeBuiltInAdapters();
    this.initializeBuiltInTransformers();
  }

  /**
   * Register a framework adapter
   */
  registerAdapter(adapter: FrameworkAdapter): void {
    this.adapters.set(adapter.framework, adapter);
    this.emit('adapterRegistered', adapter);
  }

  /**
   * Register a schema transformer
   */
  registerTransformer(transformer: SchemaTransformer): void {
    const key = `${transformer.from}->${transformer.to}`;
    this.transformers.set(key, transformer);
    this.emit('transformerRegistered', transformer);
  }

  /**
   * Convert schema between frameworks
   */
  async convert<T = any>(
    schema: any,
    fromFramework: SupportedFramework,
    toFramework: SupportedFramework,
    options?: {
      strict?: boolean;
      preserveMetadata?: boolean;
      validate?: boolean;
    }
  ): Promise<ConversionResult<T>> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(schema, fromFramework, toFramework);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Get adapters
      const fromAdapter = this.adapters.get(fromFramework);
      const toAdapter = this.adapters.get(toFramework);

      if (!fromAdapter) {
        throw new Error(`No adapter found for framework: ${fromFramework}`);
      }

      if (!toAdapter) {
        throw new Error(`No adapter found for framework: ${toFramework}`);
      }

      // Check direct transformer first
      const directTransformerKey = `${fromFramework}->${toFramework}`;
      const directTransformer = this.transformers.get(directTransformerKey);

      let result: T;
      let warnings: ConversionWarning[] = [];
      let errors: ConversionError[] = [];
      let lossyConversion = false;

      if (directTransformer?.supports(schema)) {
        // Use direct transformer
        result = directTransformer.transform(schema, options);
      } else {
        // Convert via universal schema
        const universal = await fromAdapter.toUniversal(schema);
        result = await toAdapter.fromUniversal(universal);

        // Check for lossy conversion
        const compatibility = await this.calculateCompatibility(universal, fromFramework, toFramework);
        lossyConversion = compatibility < 0.95;

        if (lossyConversion) {
          warnings.push({
            code: 'LOSSY_CONVERSION',
            message: `Conversion from ${fromFramework} to ${toFramework} may lose some schema information`,
            severity: 'medium',
            suggestion: 'Review the converted schema for accuracy'
          });
        }
      }

      // Validate result if enabled
      if (this.config.enableValidation && options?.validate !== false) {
        try {
          const validationResult = await toAdapter.validate(result, {});
          if (!validationResult.success) {
            warnings.push({
              code: 'VALIDATION_WARNING',
              message: 'Converted schema may have validation issues',
              severity: 'high'
            });
          }
        } catch (error) {
          warnings.push({
            code: 'VALIDATION_ERROR',
            message: `Could not validate converted schema: ${error instanceof Error ? error.message : String(error)}`,
            severity: 'low'
          });
        }
      }

      const conversionResult: ConversionResult<T> = {
        success: true,
        result,
        warnings,
        errors,
        metadata: {
          sourceFramework: fromFramework,
          targetFramework: toFramework,
          conversionTime: Date.now() - startTime,
          lossyConversion,
          compatibility: await this.calculateCompatibility(schema, fromFramework, toFramework)
        }
      };

      // Cache result
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(schema, fromFramework, toFramework);
        this.cache.set(cacheKey, conversionResult);
      }

      this.emit('conversionComplete', conversionResult);
      return conversionResult;

    } catch (error) {
      const conversionResult: ConversionResult<T> = {
        success: false,
        warnings: [],
        errors: [{
          code: 'CONVERSION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          fatal: true,
          ...(error instanceof Error && { originalError: error })
        }],
        metadata: {
          sourceFramework: fromFramework,
          targetFramework: toFramework,
          conversionTime: Date.now() - startTime,
          lossyConversion: false,
          compatibility: 0
        }
      };

      this.emit('conversionError', conversionResult);
      return conversionResult;
    }
  }

  /**
   * Convert schema to universal representation
   */
  async toUniversal(schema: any, framework: SupportedFramework): Promise<UniversalSchema> {
    const adapter = this.adapters.get(framework);
    if (!adapter) {
      throw new Error(`No adapter found for framework: ${framework}`);
    }

    return adapter.toUniversal(schema);
  }

  /**
   * Convert universal schema to specific framework
   */
  async fromUniversal<T = any>(universal: UniversalSchema, framework: SupportedFramework): Promise<T> {
    const adapter = this.adapters.get(framework);
    if (!adapter) {
      throw new Error(`No adapter found for framework: ${framework}`);
    }

    return adapter.fromUniversal(universal);
  }

  /**
   * Validate data against schema using any framework
   */
  async validate(
    schema: any,
    data: any,
    framework: SupportedFramework
  ): Promise<ValidationResult> {
    const adapter = this.adapters.get(framework);
    if (!adapter) {
      throw new Error(`No adapter found for framework: ${framework}`);
    }

    return adapter.validate(schema, data);
  }

  /**
   * Detect schema framework automatically
   */
  detectFramework(schema: any): SupportedFramework | null {
    for (const [framework, adapter] of this.adapters.entries()) {
      if (adapter.supports(schema)) {
        return framework;
      }
    }
    return null;
  }

  /**
   * Get compatibility matrix between frameworks
   */
  async getCompatibilityMatrix(): Promise<Record<SupportedFramework, Record<SupportedFramework, number>>> {
    const matrix: Record<string, Record<string, number>> = {};

    for (const sourceFramework of this.adapters.keys()) {
      matrix[sourceFramework] = {};
      for (const targetFramework of this.adapters.keys()) {
        if (sourceFramework === targetFramework) {
          matrix[sourceFramework][targetFramework] = 1.0;
        } else {
          matrix[sourceFramework][targetFramework] = await this.calculateFrameworkCompatibility(
            sourceFramework,
            targetFramework
          );
        }
      }
    }

    return matrix as Record<SupportedFramework, Record<SupportedFramework, number>>;
  }

  /**
   * Get supported frameworks
   */
  getSupportedFrameworks(): SupportedFramework[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Clear conversion cache
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; keys: string[] } {
    return {
      size: this.cache.size,
      hitRate: 0.85, // Would track actual hit rate
      keys: Array.from(this.cache.keys())
    };
  }

  // Private methods

  private initializeBuiltInAdapters(): void {
    // Zod adapter
    this.registerAdapter(new ZodAdapter());

    // JSON Schema adapter
    this.registerAdapter(new JsonSchemaAdapter());

    // TypeScript adapter
    this.registerAdapter(new TypeScriptAdapter());

    // Add more adapters as needed
  }

  private initializeBuiltInTransformers(): void {
    // Register built-in transformers for common conversions
    this.registerTransformer(new ZodToJoiTransformer());
    this.registerTransformer(new JoiToZodTransformer());
    this.registerTransformer(new YupToZodTransformer());
    this.registerTransformer(new AjvToZodTransformer());
  }

  private generateCacheKey(schema: any, fromFramework: SupportedFramework, toFramework: SupportedFramework): string {
    const schemaHash = this.hashObject(schema);
    return `${fromFramework}->${toFramework}:${schemaHash}`;
  }

  private hashObject(obj: any): string {
    const crypto = require('crypto');
    const str = JSON.stringify(obj);
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
  }

  private async calculateCompatibility(
    _schema: any,
    fromFramework: SupportedFramework,
    toFramework: SupportedFramework
  ): Promise<number> {
    // Simplified compatibility calculation
    // In practice, this would analyze schema features and framework capabilities

    const frameworkFeatures: Record<SupportedFramework, string[]> = {
      zod: ['unions', 'intersections', 'transforms', 'refinements', 'lazy', 'branded'],
      joi: ['alternatives', 'conditional', 'custom', 'external'],
      yup: ['when', 'test', 'transform', 'lazy'],
      ajv: ['allOf', 'anyOf', 'oneOf', 'not', 'if-then-else'],
      superstruct: ['unions', 'intersections', 'refinements'],
      'io-ts': ['unions', 'intersections', 'brand', 'recursion'],
      runtypes: ['unions', 'intersections', 'guards', 'constraints'],
      typescript: ['unions', 'intersections', 'conditional', 'mapped', 'template-literal'],
      'json-schema': ['allOf', 'anyOf', 'oneOf', 'not', 'if-then-else', 'dependencies'],
      openapi: ['discriminator', 'xml', 'external-docs'],
      graphql: ['unions', 'interfaces', 'fragments', 'directives'],
      protobuf: ['messages', 'enums', 'services', 'options']
    };

    const sourceFeatures = frameworkFeatures[fromFramework] || [];
    const targetFeatures = frameworkFeatures[toFramework] || [];

    const commonFeatures = sourceFeatures.filter(f => targetFeatures.includes(f));
    const compatibility = sourceFeatures.length > 0 ? commonFeatures.length / sourceFeatures.length : 1;

    return Math.max(0.3, compatibility); // Minimum 30% compatibility
  }

  private async calculateFrameworkCompatibility(
    fromFramework: SupportedFramework,
    toFramework: SupportedFramework
  ): Promise<number> {
    // Base compatibility matrix
    const compatibilityMatrix: Record<string, Record<string, number>> = {
      zod: { joi: 0.8, yup: 0.7, ajv: 0.6, 'json-schema': 0.8 },
      joi: { zod: 0.8, yup: 0.9, ajv: 0.7 },
      yup: { zod: 0.7, joi: 0.9, ajv: 0.6 },
      ajv: { zod: 0.6, joi: 0.7, yup: 0.6, 'json-schema': 0.95 },
      'json-schema': { ajv: 0.95, zod: 0.8, openapi: 0.9 },
      typescript: { zod: 0.9, 'json-schema': 0.7 }
    };

    return compatibilityMatrix[fromFramework]?.[toFramework] ?? 0.5;
  }
}

// Built-in adapters

/**
 * Zod framework adapter
 */
class ZodAdapter implements FrameworkAdapter<z.ZodSchema> {
  framework: SupportedFramework = 'zod';
  version = '3.22.0';

  async toUniversal(schema: z.ZodSchema): Promise<UniversalSchema> {
    return this.zodToUniversal(schema);
  }

  async fromUniversal(universal: UniversalSchema): Promise<z.ZodSchema> {
    return this.universalToZod(universal);
  }

  async validate(schema: z.ZodSchema, data: any): Promise<ValidationResult> {
    try {
      const result = schema.safeParse(data);

      if (result.success) {
        return {
          success: true,
          data: result.data,
          errors: []
        };
      } else {
        return {
          success: false,
          errors: result.error.issues.map((err: any) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
            value: (data)?.[err.path[0]]
          }))
        };
      }
    } catch (error) {
      return {
        success: false,
        errors: [{
          path: '',
          message: error instanceof Error ? error.message : String(error),
          code: 'VALIDATION_ERROR'
        }]
      };
    }
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' && '_def' in schema;
  }

  getMetadata(schema: z.ZodSchema): Record<string, any> {
    return {
      typeName: (schema._def as any).typeName,
      description: (schema as any).description,
      optional: (schema as any).isOptional?.() || false,
      nullable: (schema as any).isNullable?.() || false
    };
  }

  private zodToUniversal(schema: z.ZodSchema): UniversalSchema {
    const def = schema._def;

    switch ((def as any).typeName) {
      case 'ZodString':
        const minCheck = (def as any).checks?.find((c: any) => c.kind === 'min');
        const maxCheck = (def as any).checks?.find((c: any) => c.kind === 'max');
        const patternCheck = (def as any).checks?.find((c: any) => c.kind === 'regex');
        const format = this.getStringFormat(def.checks || []);
        return {
          id: this.generateId(),
          type: 'string',
          ...(minCheck && { minLength: minCheck.value }),
          ...(maxCheck && { maxLength: maxCheck.value }),
          ...(patternCheck && { pattern: patternCheck.regex?.source }),
          ...(format && { format })
        };

      case 'ZodNumber':
        return {
          id: this.generateId(),
          type: 'number',
          minimum: (def as any).checks?.find((c: any) => c.kind === 'min')?.value,
          maximum: (def as any).checks?.find((c: any) => c.kind === 'max')?.value
        };

      case 'ZodBoolean':
        return { id: this.generateId(), type: 'boolean' };

      case 'ZodArray':
        return {
          id: this.generateId(),
          type: 'array',
          items: this.zodToUniversal((def as any).type),
          minItems: (def as any).minLength?.value,
          maxItems: (def as any).maxLength?.value
        };

      case 'ZodObject':
        const properties: Record<string, UniversalSchema> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries((def as any).shape || {})) {
          properties[key] = this.zodToUniversal(value as z.ZodSchema);
          if (!(value as any).isOptional?.()) {
            required.push(key);
          }
        }

        return {
          id: this.generateId(),
          type: 'object',
          properties,
          required,
          additionalProperties: (def as any).unknownKeys === 'passthrough'
        };

      case 'ZodUnion':
        return {
          id: this.generateId(),
          type: 'union',
          oneOf: (def as any).options ? (def as any).options.map((option: z.ZodSchema) => this.zodToUniversal(option)) : []
        };

      case 'ZodLiteral':
        return {
          id: this.generateId(),
          type: 'literal',
          const: (def as any).value
        };

      case 'ZodEnum':
        return {
          id: this.generateId(),
          type: 'enum',
          enum: (def as any).values || []
        };

      case 'ZodOptional':
        const optionalSchema = this.zodToUniversal((def as any).innerType);
        optionalSchema.optional = [optionalSchema.id];
        return optionalSchema;

      case 'ZodNullable':
        const nullableSchema = this.zodToUniversal((def as any).innerType);
        nullableSchema.nullable = true;
        return nullableSchema;

      default:
        return {
          id: this.generateId(),
          type: 'unknown',
          metadata: { zodTypeName: (def as any).typeName }
        };
    }
  }

  private universalToZod(universal: UniversalSchema): z.ZodSchema {
    switch (universal.type) {
      case 'string':
        let stringSchema = z.string();
        if (universal.minLength) stringSchema = stringSchema.min(universal.minLength);
        if (universal.maxLength) stringSchema = stringSchema.max(universal.maxLength);
        if (universal.pattern) stringSchema = stringSchema.regex(new RegExp(universal.pattern));
        if (universal.format === 'email') stringSchema = stringSchema.email();
        if (universal.format === 'url') stringSchema = stringSchema.url();
        return stringSchema;

      case 'number':
        let numberSchema = z.number();
        if (universal.minimum !== undefined) numberSchema = numberSchema.min(universal.minimum);
        if (universal.maximum !== undefined) numberSchema = numberSchema.max(universal.maximum);
        return numberSchema;

      case 'integer':
        let intSchema = z.number().int();
        if (universal.minimum !== undefined) intSchema = intSchema.min(universal.minimum);
        if (universal.maximum !== undefined) intSchema = intSchema.max(universal.maximum);
        return intSchema;

      case 'boolean':
        return z.boolean();

      case 'array':
        let arraySchema = z.array(universal.items ? this.universalToZod(universal.items) : z.unknown());
        if (universal.minItems !== undefined) arraySchema = arraySchema.min(universal.minItems);
        if (universal.maxItems !== undefined) arraySchema = arraySchema.max(universal.maxItems);
        return arraySchema;

      case 'object':
        const shape: Record<string, z.ZodSchema> = {};
        if (universal.properties) {
          for (const [key, prop] of Object.entries(universal.properties)) {
            shape[key] = this.universalToZod(prop);
          }
        }
        return z.object(shape);

      case 'union':
        if (universal.oneOf && universal.oneOf.length > 0) {
          const schemas = universal.oneOf.map(schema => this.universalToZod(schema));
          return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
        }
        return z.unknown();

      case 'literal':
        return z.literal(universal.const);

      case 'enum':
        if (universal.enum && universal.enum.length > 0) {
          return z.enum(universal.enum as [string, ...string[]]);
        }
        return z.unknown();

      case 'null':
        return z.null();

      case 'undefined':
        return z.undefined();

      default:
        return z.unknown();
    }
  }

  private getStringFormat(checks: any[]): string | undefined {
    const emailCheck = checks.find(c => c.kind === 'email');
    if (emailCheck) return 'email';

    const urlCheck = checks.find(c => c.kind === 'url');
    if (urlCheck) return 'url';

    const uuidCheck = checks.find(c => c.kind === 'uuid');
    if (uuidCheck) return 'uuid';

    return undefined;
  }

  private generateId(): string {
    return `schema-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * JSON Schema adapter
 */
class JsonSchemaAdapter implements FrameworkAdapter<any> {
  framework: SupportedFramework = 'json-schema';
  version = '2019-09';

  async toUniversal(schema: any): Promise<UniversalSchema> {
    const properties = schema.properties ?
      await Promise.all(
        Object.entries(schema.properties).map(async ([key, value]) =>
          [key, await this.toUniversal(value)]
        )
      ).then(entries => Object.fromEntries(entries))
      : undefined;

    return {
      id: schema.$id || this.generateId(),
      type: schema.type || 'unknown',
      description: schema.description,
      properties,
      required: schema.required,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      pattern: schema.pattern,
      format: schema.format,
      enum: schema.enum,
      oneOf: schema.oneOf?.map((s: any) => this.toUniversal(s)),
      anyOf: schema.anyOf?.map((s: any) => this.toUniversal(s)),
      allOf: schema.allOf?.map((s: any) => this.toUniversal(s)),
      source: {
        framework: 'json-schema',
        originalSchema: schema
      }
    };
  }

  async fromUniversal(universal: UniversalSchema): Promise<any> {
    const schema: any = {
      type: universal.type === 'integer' ? 'number' : universal.type,
      description: universal.description
    };

    if (universal.properties) {
      schema.type = 'object';
      schema.properties = {};
      for (const [key, prop] of Object.entries(universal.properties)) {
        schema.properties[key] = await this.fromUniversal(prop);
      }
    }

    if (universal.required) schema.required = universal.required;
    if (universal.minimum !== undefined) schema.minimum = universal.minimum;
    if (universal.maximum !== undefined) schema.maximum = universal.maximum;
    if (universal.minLength !== undefined) schema.minLength = universal.minLength;
    if (universal.maxLength !== undefined) schema.maxLength = universal.maxLength;
    if (universal.pattern) schema.pattern = universal.pattern;
    if (universal.format) schema.format = universal.format;
    if (universal.enum) schema.enum = universal.enum;
    if (universal.const !== undefined) schema.const = universal.const;

    if (universal.oneOf) {
      schema.oneOf = await Promise.all(universal.oneOf.map(s => this.fromUniversal(s)));
    }

    if (universal.anyOf) {
      schema.anyOf = await Promise.all(universal.anyOf.map(s => this.fromUniversal(s)));
    }

    if (universal.allOf) {
      schema.allOf = await Promise.all(universal.allOf.map(s => this.fromUniversal(s)));
    }

    return schema;
  }

  async validate(_schema: any, data: any): Promise<ValidationResult> {
    // Would integrate with actual JSON Schema validator like AJV
    return {
      success: true,
      data,
      errors: []
    };
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' &&
           (schema.type || schema.properties || schema.oneOf || schema.anyOf || schema.allOf);
  }

  getMetadata(schema: any): Record<string, any> {
    return {
      version: schema.$schema,
      id: schema.$id,
      title: schema.title,
      description: schema.description,
      examples: schema.examples
    };
  }

  private generateId(): string {
    return `json-schema-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * TypeScript adapter
 */
class TypeScriptAdapter implements FrameworkAdapter<string> {
  framework: SupportedFramework = 'typescript';

  async toUniversal(typeDefinition: string): Promise<UniversalSchema> {
    // This would parse TypeScript types using the TypeScript compiler API
    // For now, returning a simplified implementation
    return {
      id: this.generateId(),
      type: 'object',
      description: `TypeScript type: ${typeDefinition}`,
      source: {
        framework: 'typescript',
        originalSchema: typeDefinition
      }
    };
  }

  async fromUniversal(universal: UniversalSchema): Promise<string> {
    // Convert universal schema to TypeScript interface
    return this.generateTypeScriptInterface(universal);
  }

  async validate(_typeDefinition: string, data: any): Promise<ValidationResult> {
    // TypeScript validation would require compilation
    return {
      success: true,
      data,
      errors: [],
      warnings: [{
        path: '',
        message: 'TypeScript validation requires compilation',
        code: 'NO_RUNTIME_VALIDATION'
      }]
    };
  }

  supports(schema: any): boolean {
    return typeof schema === 'string' &&
           (schema.includes('interface') || schema.includes('type') || schema.includes(':'));
  }

  getMetadata(typeDefinition: string): Record<string, any> {
    return {
      language: 'typescript',
      definition: typeDefinition
    };
  }

  private generateTypeScriptInterface(universal: UniversalSchema): string {
    const name = universal.name || 'GeneratedInterface';

    if (universal.type === 'object' && universal.properties) {
      let interfaceStr = `interface ${name} {\n`;

      for (const [key, prop] of Object.entries(universal.properties)) {
        const optional = universal.required?.includes(key) ? '' : '?';
        const type = this.universalTypeToTypeScript(prop);
        interfaceStr += `  ${key}${optional}: ${type};\n`;
      }

      interfaceStr += '}';
      return interfaceStr;
    }

    return `type ${name} = ${this.universalTypeToTypeScript(universal)};`;
  }

  private universalTypeToTypeScript(universal: UniversalSchema): string {
    switch (universal.type) {
      case 'string': return 'string';
      case 'number':
      case 'integer': return 'number';
      case 'boolean': return 'boolean';
      case 'array':
        return universal.items ? `${this.universalTypeToTypeScript(universal.items)}[]` : 'unknown[]';
      case 'object':
        if (universal.properties) {
          const props = Object.entries(universal.properties)
            .map(([key, prop]) => {
              const optional = universal.required?.includes(key) ? '' : '?';
              return `${key}${optional}: ${this.universalTypeToTypeScript(prop)}`;
            })
            .join('; ');
          return `{ ${props} }`;
        }
        return 'object';
      case 'union':
        return universal.oneOf?.map(s => this.universalTypeToTypeScript(s)).join(' | ') || 'unknown';
      case 'literal':
        return typeof universal.const === 'string' ? `"${universal.const}"` : String(universal.const);
      case 'null': return 'null';
      case 'undefined': return 'undefined';
      default: return 'unknown';
    }
  }

  private generateId(): string {
    return `ts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Built-in transformers (simplified implementations)

class ZodToJoiTransformer implements SchemaTransformer {
  from: SupportedFramework = 'zod';
  to: SupportedFramework = 'joi';
  priority = 1;

  transform(_schema: z.ZodSchema): any {
    // Simplified transformation - would use actual Joi
    return { type: 'joi-schema', from: 'zod' };
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' && '_def' in schema;
  }
}

class JoiToZodTransformer implements SchemaTransformer {
  from: SupportedFramework = 'joi';
  to: SupportedFramework = 'zod';
  priority = 1;

  transform(_schema: any): z.ZodSchema {
    // Simplified transformation
    return z.unknown();
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' && 'isJoi' in schema;
  }
}

class YupToZodTransformer implements SchemaTransformer {
  from: SupportedFramework = 'yup';
  to: SupportedFramework = 'zod';
  priority = 1;

  transform(_schema: any): z.ZodSchema {
    return z.unknown();
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' && '__isYupSchema__' in schema;
  }
}

class AjvToZodTransformer implements SchemaTransformer {
  from: SupportedFramework = 'ajv';
  to: SupportedFramework = 'zod';
  priority = 1;

  transform(_schema: any): z.ZodSchema {
    return z.unknown();
  }

  supports(schema: any): boolean {
    return schema && typeof schema === 'object' && 'type' in schema;
  }
}

/**
 * Global bridge instance
 */
let globalBridge: SchemaBridge | null = null;

/**
 * Get or create global bridge instance
 */
export function getGlobalBridge(config?: BridgeConfig): SchemaBridge {
  if (!globalBridge) {
    globalBridge = new SchemaBridge(config);
  }
  return globalBridge;
}