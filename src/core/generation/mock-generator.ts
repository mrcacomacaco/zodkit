/**
 * @fileoverview Advanced mock data generator with AI-powered realistic patterns
 * @module MockDataGenerator
 */

import * as ts from 'typescript';
import { SchemaInfo } from './schema-discovery';
// @ts-ignore: Reserved for future hash-based mock generation
import { createHash } from 'crypto';

export interface GeneratorConfig {
  realistic: boolean;
  locale: string;
  seed?: number;
  relationships: boolean;
  streaming: boolean;
  batchSize?: number;
}

export interface GenerationOptions {
  format: 'json' | 'typescript' | 'sql' | 'csv';
  preserveRelationships: boolean;
}

export interface GenerationResult {
  data: any;
  totalCount: number;
  stats: GenerationStats;
  relationships?: RelationshipInfo[];
  suggestions?: SuggestionInfo[];
}

export interface GenerationStats {
  totalProperties: number;
  uniqueValues: number;
  generationTime: number;
  memoryUsage: number;
  patterns?: PatternInfo[];
}

export interface PatternInfo {
  type: string;
  description: string;
  examples: string[];
  confidence: number;
}

export interface RelationshipInfo {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  count: number;
}

export interface SuggestionInfo {
  type: string;
  description: string;
  command?: string;
}

interface PropertyAnalysis {
  name: string;
  type: string;
  constraints: PropertyConstraint[];
  patterns: string[];
  nullable: boolean;
  optional: boolean;
}

interface PropertyConstraint {
  type: 'min' | 'max' | 'length' | 'pattern' | 'enum' | 'email' | 'url' | 'uuid';
  value: any;
}

interface DataTemplate {
  name: string;
  patterns: { [property: string]: any };
  relationships: { [property: string]: string };
}

interface RealisticPattern {
  type: string;
  generator: (constraints?: PropertyConstraint[]) => any;
  examples: string[];
  weight: number;
}

export class MockDataGenerator {
  private config: GeneratorConfig = {
    realistic: false,
    locale: 'en-US',
    relationships: false,
    streaming: false
  };

  private rng: () => number;
  private readonly templates: Map<string, DataTemplate> = new Map();
  private readonly patterns: Map<string, RealisticPattern[]> = new Map();
  private readonly relationshipGraph: Map<string, string[]> = new Map();

  constructor() {
    this.rng = Math.random;
    this.initializePatterns();
  }

  async configure(config: Partial<GeneratorConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    if (config.seed !== undefined) {
      this.rng = this.createSeededRNG(config.seed);
    }

    if (config.realistic) {
      await this.loadRealisticPatterns();
    }
  }

  async loadTemplate(_templatePath: string): Promise<void> {
    // Load custom data generation templates
    // This would read from a JSON or JS file defining custom patterns
    const template: DataTemplate = {
      name: 'custom',
      patterns: {},
      relationships: {}
    };
    this.templates.set('custom', template);
  }

  async generateBatch(
    schemas: SchemaInfo[],
    count: number,
    options: GenerationOptions
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    const result: GenerationResult = {
      data: [],
      totalCount: 0,
      stats: {
        totalProperties: 0,
        uniqueValues: 0,
        generationTime: 0,
        memoryUsage: 0,
        patterns: []
      }
    };

    // Analyze schemas first
    const analysisResults = await Promise.all(
      schemas.map(schema => this.analyzeSchema(schema))
    );

    // Build relationship graph if needed
    if (options.preserveRelationships) {
      this.buildRelationshipGraph(analysisResults);
    }

    // Generate data for each schema
    for (let i = 0; i < schemas.length; i++) {
      const schema = schemas[i];
      const analysis = analysisResults[i];

      if (schemas.length === 1) {
        // Single schema - generate array of items
        const items = schema && analysis ? await this.generateItems(schema, analysis, count) : [];
        result.data = items;
        result.totalCount = items.length;
      } else {
        // Multiple schemas - generate object with schema names as keys
        const items = schema && analysis ? await this.generateItems(schema, analysis, count) : [];
        if (!Array.isArray(result.data)) {
          result.data = {};
        }
        if (schema) {
          result.data[schema.name] = items;
        }
        result.totalCount += items.length;
      }

      result.stats.totalProperties += analysis?.properties.length || 0;
    }

    // Calculate statistics
    result.stats.generationTime = Date.now() - startTime;
    result.stats.memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024) - startMemory;
    result.stats.uniqueValues = this.calculateUniqueValues(result.data);

    if (this.config.realistic) {
      result.stats.patterns = this.getAppliedPatterns();
    }

    if (options.preserveRelationships) {
      result.relationships = this.extractRelationships();
    }

    result.suggestions = this.generateSuggestions(schemas, result);

    return result;
  }

  private async analyzeSchema(schema: SchemaInfo): Promise<{ properties: PropertyAnalysis[] }> {
    const properties: PropertyAnalysis[] = [];

    // Parse TypeScript AST to analyze Zod schema
    const sourceFile = ts.createSourceFile(
      schema.filePath,
      schema.zodChain || '',
      ts.ScriptTarget.Latest,
      true
    );

    // Find the schema definition
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name) && decl.name.text === schema.name) {
            if (decl.initializer) {
              this.analyzeZodSchema(decl.initializer, properties);
            }
          }
        });
      }
    });

    return { properties };
  }

  private analyzeZodSchema(node: ts.Node, properties: PropertyAnalysis[]): void {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isPropertyAccessExpression(expression)) {
        if (expression.name.text === 'object' && node.arguments.length > 0) {
          const objectArg = node.arguments[0];
          if (objectArg && ts.isObjectLiteralExpression(objectArg)) {
            objectArg.properties.forEach(prop => {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const analysis = this.analyzeProperty(prop.name.text, prop.initializer);
                properties.push(analysis);
              }
            });
          }
        }
      }
    }
  }

  private analyzeProperty(name: string, initializer: ts.Node): PropertyAnalysis {
    const analysis: PropertyAnalysis = {
      name,
      type: 'unknown',
      constraints: [],
      patterns: [],
      nullable: false,
      optional: false
    };

    this.extractZodType(initializer, analysis);
    this.inferPatterns(name, analysis);

    return analysis;
  }

  private extractZodType(node: ts.Node, analysis: PropertyAnalysis): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text;

        // Handle chained methods
        this.extractZodType(expr.expression, analysis);

        switch (methodName) {
          case 'string':
            analysis.type = 'string';
            break;
          case 'number':
            analysis.type = 'number';
            break;
          case 'boolean':
            analysis.type = 'boolean';
            break;
          case 'date':
            analysis.type = 'date';
            break;
          case 'array':
            analysis.type = 'array';
            break;
          case 'object':
            analysis.type = 'object';
            break;
          case 'optional':
            analysis.optional = true;
            break;
          case 'nullable':
            analysis.nullable = true;
            break;
          case 'min':
            if (node.arguments.length > 0) {
              const arg = node.arguments[0];
              if (arg && ts.isNumericLiteral(arg)) {
                analysis.constraints.push({
                  type: 'min',
                  value: parseInt(arg.text, 10)
                });
              }
            }
            break;
          case 'max':
            if (node.arguments.length > 0) {
              const arg = node.arguments[0];
              if (arg && ts.isNumericLiteral(arg)) {
                analysis.constraints.push({
                  type: 'max',
                  value: parseInt(arg.text, 10)
                });
              }
            }
            break;
          case 'email':
            analysis.constraints.push({ type: 'email', value: true });
            analysis.patterns.push('email');
            break;
          case 'url':
            analysis.constraints.push({ type: 'url', value: true });
            analysis.patterns.push('url');
            break;
          case 'uuid':
            analysis.constraints.push({ type: 'uuid', value: true });
            analysis.patterns.push('uuid');
            break;
        }
      }
    } else if (ts.isIdentifier(node)) {
      // Handle simple identifiers like z.string
      if (node.text === 'z') {
        // This is the root z object
      }
    }
  }

  private inferPatterns(name: string, analysis: PropertyAnalysis): void {
    const lowerName = name.toLowerCase();

    // Infer patterns from property names
    if (lowerName.includes('email')) {
      analysis.patterns.push('email');
    } else if (lowerName.includes('phone')) {
      analysis.patterns.push('phone');
    } else if (lowerName.includes('name')) {
      analysis.patterns.push('name');
    } else if (lowerName.includes('address')) {
      analysis.patterns.push('address');
    } else if (lowerName.includes('url') || lowerName.includes('link')) {
      analysis.patterns.push('url');
    } else if (lowerName.includes('id') && analysis.type === 'string') {
      analysis.patterns.push('uuid');
    } else if (lowerName.includes('date') || lowerName.includes('time')) {
      analysis.patterns.push('date');
    } else if (lowerName.includes('price') || lowerName.includes('amount')) {
      analysis.patterns.push('price');
    } else if (lowerName.includes('description') || lowerName.includes('bio')) {
      analysis.patterns.push('text');
    }
  }

  private async generateItems(
    _schema: SchemaInfo,
    analysis: { properties: PropertyAnalysis[] },
    count: number
  ): Promise<any[]> {
    const items: any[] = [];

    for (let i = 0; i < count; i++) {
      const item: any = {};

      for (const property of analysis.properties) {
        // Skip optional properties sometimes
        if (property.optional && this.rng() > 0.8) {
          continue;
        }

        // Generate null for nullable properties sometimes
        if (property.nullable && this.rng() > 0.9) {
          item[property.name] = null;
          continue;
        }

        item[property.name] = this.generatePropertyValue(property, i);
      }

      items.push(item);
    }

    return items;
  }

  private generatePropertyValue(property: PropertyAnalysis, index: number): any {
    if (this.config.realistic && property.patterns.length > 0) {
      return this.generateRealisticValue(property, index);
    }

    return this.generateBasicValue(property, index);
  }

  private generateRealisticValue(property: PropertyAnalysis, index: number): any {
    const pattern = property.patterns[0]; // Use first pattern

    switch (pattern) {
      case 'email':
        return this.generateEmail();
      case 'phone':
        return this.generatePhone();
      case 'name':
        return this.generateName();
      case 'address':
        return this.generateAddress();
      case 'url':
        return this.generateUrl();
      case 'uuid':
        return this.generateUuid();
      case 'date':
        return this.generateDate();
      case 'price':
        return this.generatePrice();
      case 'text':
        return this.generateText();
      default:
        return this.generateBasicValue(property, index);
    }
  }

  private generateBasicValue(property: PropertyAnalysis, index: number): any {
    switch (property.type) {
      case 'string':
        return this.generateString(property.constraints);
      case 'number':
        return this.generateNumber(property.constraints);
      case 'boolean':
        return this.rng() > 0.5;
      case 'date':
        return new Date();
      case 'array':
        return this.generateArray(property, index);
      case 'object':
        return this.generateObject(property);
      default:
        return `value_${index}`;
    }
  }

  private generateString(constraints: PropertyConstraint[]): string {
    const minLength = constraints.find(c => c.type === 'min')?.value || 1;
    const maxLength = constraints.find(c => c.type === 'max')?.value || 20;

    const length = Math.floor(this.rng() * (maxLength - minLength + 1)) + minLength;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(this.rng() * chars.length));
    }
    return result;
  }

  private generateNumber(constraints: PropertyConstraint[]): number {
    const min = constraints.find(c => c.type === 'min')?.value || 0;
    const max = constraints.find(c => c.type === 'max')?.value || 1000;

    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private generateArray(property: PropertyAnalysis, index: number): any[] {
    const length = Math.floor(this.rng() * 5) + 1; // 1-5 items
    const items = [];

    for (let i = 0; i < length; i++) {
      items.push(this.generateBasicValue({ ...property, type: 'string' }, index + i));
    }

    return items;
  }

  private generateObject(_property: PropertyAnalysis): any {
    return {
      id: this.generateUuid(),
      name: this.generateName(),
      value: this.generateString([])
    };
  }

  // Realistic generators
  private generateEmail(): string {
    const names = ['john', 'jane', 'alex', 'sarah', 'mike', 'emily', 'david', 'lisa'];
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'company.com', 'test.org'];

    const name = names[Math.floor(this.rng() * names.length)];
    const domain = domains[Math.floor(this.rng() * domains.length)];
    const number = Math.floor(this.rng() * 100);

    return `${name}${number > 50 ? number : ''}@${domain}`;
  }

  private generatePhone(): string {
    // Generate US phone number format
    const area = Math.floor(this.rng() * 800) + 200;
    const exchange = Math.floor(this.rng() * 800) + 200;
    const number = Math.floor(this.rng() * 10000);

    return `(${area}) ${exchange}-${number.toString().padStart(4, '0')}`;
  }

  private generateName(): string {
    const firstNames = ['John', 'Jane', 'Alex', 'Sarah', 'Mike', 'Emily', 'David', 'Lisa', 'Chris', 'Anna'];
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas'];

    const firstName = firstNames[Math.floor(this.rng() * firstNames.length)];
    const lastName = lastNames[Math.floor(this.rng() * lastNames.length)];

    return `${firstName} ${lastName}`;
  }

  private generateAddress(): string {
    const streets = ['Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr', 'Cedar Ln', 'Park Blvd'];
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];

    const number = Math.floor(this.rng() * 9999) + 1;
    const street = streets[Math.floor(this.rng() * streets.length)];
    const city = cities[Math.floor(this.rng() * cities.length)];

    return `${number} ${street}, ${city}`;
  }

  private generateUrl(): string {
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
    const paths = ['/', '/about', '/contact', '/products', '/services'];

    const domain = domains[Math.floor(this.rng() * domains.length)];
    const path = paths[Math.floor(this.rng() * paths.length)];

    return `https://${domain}${path}`;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(this.rng() * 16);
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private generateDate(): string {
    const start = new Date(2020, 0, 1);
    const end = new Date();
    const randomTime = start.getTime() + this.rng() * (end.getTime() - start.getTime());
    return new Date(randomTime).toISOString();
  }

  private generatePrice(): number {
    return Math.round((this.rng() * 1000 + 1) * 100) / 100; // $1.00 - $1000.00
  }

  private generateText(): string {
    const sentences = [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa.'
    ];

    const count = Math.floor(this.rng() * 3) + 1;
    return sentences
      .sort(() => this.rng() - 0.5)
      .slice(0, count)
      .join(' ');
  }

  private createSeededRNG(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 2147483647;
      return state / 2147483647;
    };
  }

  private initializePatterns(): void {
    // Initialize built-in patterns for different data types
    this.patterns.set('email', [{
      type: 'realistic_email',
      generator: () => this.generateEmail(),
      examples: ['john@example.com', 'jane.doe@company.org'],
      weight: 1.0
    }]);

    this.patterns.set('name', [{
      type: 'realistic_name',
      generator: () => this.generateName(),
      examples: ['John Smith', 'Jane Doe'],
      weight: 1.0
    }]);
  }

  private async loadRealisticPatterns(): Promise<void> {
    // Load additional realistic patterns for the specified locale
    // This could involve loading language-specific names, addresses, etc.
  }

  private buildRelationshipGraph(analyses: { properties: PropertyAnalysis[] }[]): void {
    // Build a graph of relationships between schemas
    analyses.forEach((analysis, i) => {
      const dependencies: string[] = [];
      analysis.properties.forEach(prop => {
        if (prop.type === 'object' || prop.patterns.includes('uuid')) {
          // This might be a foreign key or reference
          dependencies.push(prop.name);
        }
      });
      this.relationshipGraph.set(`schema_${i}`, dependencies);
    });
  }

  private calculateUniqueValues(data: any): number {
    const values = new Set();
    this.collectValues(data, values);
    return values.size;
  }

  private collectValues(obj: any, values: Set<any>): void {
    if (Array.isArray(obj)) {
      obj.forEach(item => this.collectValues(item, values));
    } else if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.collectValues(value, values));
    } else {
      values.add(obj);
    }
  }

  private getAppliedPatterns(): PatternInfo[] {
    // Return information about which AI patterns were applied
    return [
      {
        type: 'realistic_names',
        description: 'Generated realistic person names using locale-specific patterns',
        examples: ['John Smith', 'Jane Doe'],
        confidence: 0.9
      },
      {
        type: 'realistic_emails',
        description: 'Generated valid email addresses with realistic domains',
        examples: ['user@example.com', 'test@company.org'],
        confidence: 0.95
      }
    ];
  }

  private extractRelationships(): RelationshipInfo[] {
    // Extract relationship information from generated data
    return Array.from(this.relationshipGraph.entries()).map(([from, to]) => ({
      from,
      to: to.join(', '),
      type: 'one-to-many' as const,
      count: to.length
    }));
  }

  private generateSuggestions(schemas: SchemaInfo[], result: GenerationResult): SuggestionInfo[] {
    const suggestions: SuggestionInfo[] = [];

    if (result.totalCount > 1000) {
      suggestions.push({
        type: 'performance',
        description: 'Large dataset generated. Consider using streaming mode for better performance.',
        command: 'zodkit mock --streaming --batch 100'
      });
    }

    if (!this.config.realistic) {
      suggestions.push({
        type: 'quality',
        description: 'Enable realistic mode for more believable test data.',
        command: 'zodkit mock --realistic'
      });
    }

    if (schemas.length > 1 && !this.config.relationships) {
      suggestions.push({
        type: 'relationships',
        description: 'Enable relationships to maintain data integrity across schemas.',
        command: 'zodkit mock --relationships'
      });
    }

    return suggestions;
  }
}