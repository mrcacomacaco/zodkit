/**
 * @fileoverview Advanced Schema Generator with intelligent pattern recognition
 * @module SchemaGenerator
 */

// @ts-ignore: Reserved for future hash-based schema generation
import { createHash } from 'crypto';

export interface GenerationOptions {
  name: string;
  strict?: boolean;
  makeOptional?: boolean;
  mergeSimilarObjects?: boolean;
  confidence?: number;
  occurrences?: number;
  includeConstraints?: boolean;
  includeRelationships?: boolean;
  nullableByDefault?: boolean;
  metadata?: Record<string, any>;
}

export interface GeneratedSchema {
  name: string;
  zodCode: string;
  typeCode: string;
  confidence: number;
  complexity: string;
  properties: PropertyInfo[];
  patterns: string[];
  suggestions: string[];
  examples: any[];
  metadata?: Record<string, any>;
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional: boolean;
  constraints: string[];
  description?: string;
}

export interface DataAnalysis {
  type: string;
  structure: Record<string, any>;
  patterns: PatternInfo[];
  statistics: AnalysisStats;
  samples: any[];
}

export interface PatternInfo {
  type: string;
  confidence: number;
  examples: string[];
  constraints: string[];
}

export interface AnalysisStats {
  sampleCount: number;
  uniqueKeys: number;
  avgDepth: number;
  complexity: number;
  nullabilityRatio: number;
}

export class SchemaGenerator {
  // @ts-ignore: patternCache reserved for future pattern optimization
  private readonly patternCache = new Map<string, PatternInfo>();

  async generateFromAnalysis(analysis: DataAnalysis, options: GenerationOptions): Promise<GeneratedSchema> {
    const properties = this.extractProperties(analysis, options);
    const zodCode = this.generateZodSchema(options.name, properties, options);
    const typeCode = this.generateTypeDefinition(options.name);

    const schema: GeneratedSchema = {
      name: options.name,
      zodCode,
      typeCode,
      confidence: this.calculateConfidence(analysis, options),
      complexity: this.calculateComplexity(properties),
      properties,
      patterns: analysis.patterns.map(p => p.type),
      suggestions: this.generateSuggestions(analysis, properties),
      examples: analysis.samples.slice(0, 3),
      ...(options.metadata !== undefined && { metadata: options.metadata })
    };

    return schema;
  }

  async generateFromPattern(pattern: any, options: GenerationOptions): Promise<GeneratedSchema> {
    // Generate schema from learned patterns
    const mockAnalysis: DataAnalysis = {
      type: 'pattern',
      structure: pattern.structure || {},
      patterns: [pattern],
      statistics: {
        sampleCount: pattern.occurrences || 1,
        uniqueKeys: Object.keys(pattern.structure || {}).length,
        avgDepth: 1,
        complexity: pattern.confidence * 10,
        nullabilityRatio: 0.1
      },
      samples: pattern.examples || []
    };

    return this.generateFromAnalysis(mockAnalysis, options);
  }

  async generateFromDatabaseSchema(tableSchema: any, options: GenerationOptions): Promise<GeneratedSchema> {
    const properties: PropertyInfo[] = [];

    for (const column of tableSchema.columns || []) {
      const property: PropertyInfo = {
        name: column.name,
        type: this.mapDatabaseTypeToZod(column.type, column.constraints),
        optional: column.nullable && !options.nullableByDefault,
        constraints: this.extractColumnConstraints(column),
        description: column.comment
      };

      properties.push(property);
    }

    const zodCode = this.generateZodSchema(options.name, properties, options);
    const typeCode = this.generateTypeDefinition(options.name);

    return {
      name: options.name,
      zodCode,
      typeCode,
      confidence: 0.95, // High confidence for database schemas
      complexity: properties.length > 10 ? 'high' : properties.length > 5 ? 'medium' : 'low',
      properties,
      patterns: ['database-schema'],
      suggestions: this.generateDatabaseSuggestions(tableSchema),
      examples: [],
      metadata: {
        source: 'database',
        table: tableSchema.tableName,
        constraints: tableSchema.constraints
      }
    };
  }

  private extractProperties(analysis: DataAnalysis, options: GenerationOptions): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const structure = analysis.structure;

    if (typeof structure !== 'object' || structure === null) {
      return properties;
    }

    for (const [key, value] of Object.entries(structure)) {
      const property: PropertyInfo = {
        name: key,
        type: this.inferZodType(value, analysis.patterns),
        optional: this.shouldBeOptional(key, analysis, options),
        constraints: this.inferConstraints(key, value, analysis.patterns)
      };

      properties.push(property);
    }

    return properties;
  }

  private inferZodType(value: any, patterns: PatternInfo[]): string {
    if (value === null || value === undefined) {
      return 'z.string().nullable()';
    }

    const type = typeof value;

    switch (type) {
      case 'string':
        return this.inferStringType(value, patterns);
      case 'number':
        return this.inferNumberType(value);
      case 'boolean':
        return 'z.boolean()';
      case 'object':
        if (Array.isArray(value)) {
          return this.inferArrayType(value, patterns);
        }
        return this.inferObjectType(value, patterns);
      default:
        return 'z.unknown()';
    }
  }

  private inferStringType(value: string, patterns: PatternInfo[]): string {
    // Email pattern
    if (this.isEmail(value)) {
      return 'z.string().email()';
    }

    // URL pattern
    if (this.isURL(value)) {
      return 'z.string().url()';
    }

    // UUID pattern
    if (this.isUUID(value)) {
      return 'z.string().uuid()';
    }

    // DateTime pattern
    if (this.isDateTime(value)) {
      return 'z.string().datetime()';
    }

    // Date pattern
    if (this.isDate(value)) {
      return 'z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)';
    }

    // Phone number pattern
    if (this.isPhoneNumber(value)) {
      return 'z.string().regex(/^[+]?[1-9]?[0-9]{7,15}$/)';
    }

    // Check for specific patterns from analysis
    for (const pattern of patterns) {
      if (pattern.type === 'string-enum' && pattern.examples.includes(value)) {
        const enumValues = pattern.examples.map(v => `'${v}'`).join(', ');
        return `z.enum([${enumValues}])`;
      }
    }

    // Length-based constraints
    if (value.length > 0) {
      if (value.length > 255) {
        return 'z.string().min(1)';
      }
      return 'z.string().min(1).max(255)';
    }

    return 'z.string()';
  }

  private inferNumberType(value: number): string {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        return 'z.number().int().min(0)';
      }
      return 'z.number().int()';
    }

    if (value >= 0) {
      return 'z.number().min(0)';
    }

    return 'z.number()';
  }

  private inferArrayType(value: any[], patterns: PatternInfo[]): string {
    if (value.length === 0) {
      return 'z.array(z.unknown())';
    }

    // Infer type from first element (could analyze all for better accuracy)
    const elementType = this.inferZodType(value[0], patterns);
    return `z.array(${elementType})`;
  }

  private inferObjectType(value: Record<string, any>, patterns: PatternInfo[]): string {
    const properties: string[] = [];

    for (const [key, val] of Object.entries(value)) {
      const propType = this.inferZodType(val, patterns);
      properties.push(`    ${key}: ${propType}`);
    }

    if (properties.length === 0) {
      return 'z.object({})';
    }

    return `z.object({\n${properties.join(',\n')}\n  })`;
  }

  private shouldBeOptional(_key: string, analysis: DataAnalysis, options: GenerationOptions): boolean {
    if (options.makeOptional) {
      return true;
    }

    // Check nullability ratio from analysis
    const nullabilityThreshold = 0.2; // If 20% of samples have null/undefined for this key
    return analysis.statistics.nullabilityRatio > nullabilityThreshold;
  }

  private inferConstraints(_key: string, value: any, _patterns: PatternInfo[]): string[] {
    const constraints: string[] = [];

    if (typeof value === 'string') {
      if (value.length > 0) {
        constraints.push('min(1)');
      }
      if (value.length > 1000) {
        constraints.push('max(5000)');
      }
    }

    if (typeof value === 'number') {
      if (value >= 0) {
        constraints.push('min(0)');
      }
    }

    return constraints;
  }

  private generateZodSchema(name: string, properties: PropertyInfo[], _options: GenerationOptions): string {
    const imports = "import { z } from 'zod';\n\n";

    const propertyLines = properties.map(prop => {
      let line = `  ${prop.name}: ${prop.type}`;
      if (prop.optional) {
        line += '.optional()';
      }
      return line;
    });

    const schemaBody = propertyLines.join(',\n');

    const schema = `export const ${name} = z.object({\n${schemaBody}\n});`;

    return `${imports}${schema}`;
  }

  private generateTypeDefinition(name: string): string {
    return `export type ${name}Type = z.infer<typeof ${name}>;`;
  }

  private calculateConfidence(analysis: DataAnalysis, _options: GenerationOptions): number {
    let confidence = 0.8; // Base confidence

    // Increase confidence based on sample size
    if (analysis.statistics.sampleCount > 10) {
      confidence += 0.1;
    }
    if (analysis.statistics.sampleCount > 100) {
      confidence += 0.05;
    }

    // Increase confidence for consistent patterns
    const patternConfidence = analysis.patterns.reduce((sum, p) => sum + p.confidence, 0) / analysis.patterns.length;
    confidence = (confidence + patternConfidence) / 2;

    // Decrease confidence for high complexity
    if (analysis.statistics.complexity > 20) {
      confidence -= 0.1;
    }

    return Math.min(0.99, Math.max(0.1, confidence));
  }

  private calculateComplexity(properties: PropertyInfo[]): string {
    const count = properties.length;
    const nestedObjects = properties.filter(p => p.type.includes('z.object')).length;
    const arrays = properties.filter(p => p.type.includes('z.array')).length;

    const complexityScore = count + (nestedObjects * 2) + arrays;

    if (complexityScore > 20) return 'high';
    if (complexityScore > 10) return 'medium';
    return 'low';
  }

  private generateSuggestions(_analysis: DataAnalysis, properties: PropertyInfo[]): string[] {
    const suggestions: string[] = [];

    // Complex schema suggestions
    if (properties.length > 15) {
      suggestions.push('Consider splitting this complex schema into smaller parts');
    }

    // Optional field suggestions
    const optionalCount = properties.filter(p => p.optional).length;
    if (optionalCount > properties.length * 0.7) {
      suggestions.push('Many fields are optional - consider using discriminated unions');
    }

    // Pattern-based suggestions
    const hasEmail = properties.some(p => p.type.includes('email'));
    const hasId = properties.some(p => p.name.toLowerCase().includes('id'));
    if (hasEmail && hasId) {
      suggestions.push('This looks like a user schema - consider adding validation rules');
    }

    return suggestions;
  }

  private generateDatabaseSuggestions(tableSchema: any): string[] {
    const suggestions: string[] = [];

    if (tableSchema.hasIndexes) {
      suggestions.push('Consider adding unique constraints to indexed fields');
    }

    if (tableSchema.hasForeignKeys) {
      suggestions.push('Add relationship validation for foreign keys');
    }

    return suggestions;
  }

  private mapDatabaseTypeToZod(dbType: string, _constraints: any[]): string {
    const type = dbType.toLowerCase();

    if (type.includes('varchar') || type.includes('text') || type.includes('char')) {
      const maxLength = this.extractMaxLength(dbType);
      return maxLength ? `z.string().max(${maxLength})` : 'z.string()';
    }

    if (type.includes('int') || type.includes('serial')) {
      return 'z.number().int()';
    }

    if (type.includes('decimal') || type.includes('numeric') || type.includes('float')) {
      return 'z.number()';
    }

    if (type.includes('bool')) {
      return 'z.boolean()';
    }

    if (type.includes('date') || type.includes('timestamp')) {
      return 'z.string().datetime()';
    }

    if (type.includes('json') || type.includes('jsonb')) {
      return 'z.record(z.unknown())';
    }

    if (type.includes('uuid')) {
      return 'z.string().uuid()';
    }

    return 'z.unknown()';
  }

  private extractColumnConstraints(column: any): string[] {
    const constraints: string[] = [];

    if (column.maxLength) {
      constraints.push(`max(${column.maxLength})`);
    }

    if (column.minLength) {
      constraints.push(`min(${column.minLength})`);
    }

    if (column.unique) {
      constraints.push('unique');
    }

    if (column.primaryKey) {
      constraints.push('primary-key');
    }

    return constraints;
  }

  private extractMaxLength(dbType: string): number | null {
    const match = dbType.match(/\((\d+)\)/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  }

  // Pattern recognition helpers
  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isURL(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  private isUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isDateTime(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !isNaN(Date.parse(value));
  }

  private isDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
  }

  private isPhoneNumber(value: string): boolean {
    return /^[+]?[1-9]?[0-9]{7,15}$/.test(value.replace(/[\s\-\(\)]/g, ''));
  }
}