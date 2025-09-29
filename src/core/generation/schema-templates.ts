import { z } from 'zod';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  tags: string[];
  category: TemplateCategory;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  rating?: number;
  downloads?: number;
  schema: z.ZodTypeAny;
  metadata: TemplateMetadata;
  examples: TemplateExample[];
  documentation: TemplateDocumentation;
  dependencies: TemplateDependency[];
  customizations: TemplateCustomization[];
  created: Date;
  updated: Date;
  license: string;
  repository?: string;
  changelog?: TemplateChangelog[];
}

export interface TemplateMetadata {
  framework: 'zod' | 'joi' | 'yup' | 'ajv' | 'superstruct';
  compatibility: string[];
  language: 'typescript' | 'javascript';
  nodeVersion?: string;
  size: 'small' | 'medium' | 'large' | 'xlarge';
  complexity: number;
  performance: {
    validationSpeed: 'fast' | 'medium' | 'slow';
    memoryUsage: 'low' | 'medium' | 'high';
    bundleSize: number;
  };
  features: string[];
  useCases: string[];
  industries: string[];
}

export interface TemplateExample {
  id: string;
  title: string;
  description: string;
  code: string;
  input: any;
  output: any;
  explanation: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface TemplateDocumentation {
  overview: string;
  installation: string;
  usage: string;
  api: TemplateApiDoc[];
  faq: TemplateFaq[];
  troubleshooting: TemplateTroubleshooting[];
  migrations: TemplateMigration[];
}

export interface TemplateApiDoc {
  method: string;
  description: string;
  parameters: TemplateParameter[];
  returns: string;
  examples: string[];
  notes?: string[];
}

export interface TemplateParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}

export interface TemplateFaq {
  question: string;
  answer: string;
  tags: string[];
}

export interface TemplateTroubleshooting {
  issue: string;
  solution: string;
  cause: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TemplateMigration {
  fromVersion: string;
  toVersion: string;
  changes: string[];
  steps: string[];
  breaking: boolean;
}

export interface TemplateDependency {
  name: string;
  version: string;
  type: 'peer' | 'dev' | 'optional' | 'required';
  description: string;
}

export interface TemplateCustomization {
  id: string;
  name: string;
  description: string;
  type: 'parameter' | 'option' | 'variant' | 'extension';
  dataType: string;
  default: any;
  validation?: z.ZodTypeAny;
  examples: any[];
}

export interface TemplateChangelog {
  version: string;
  date: Date;
  changes: TemplateChange[];
  breaking: boolean;
}

export interface TemplateChange {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
  description: string;
  impact: 'low' | 'medium' | 'high';
}

export type TemplateCategory =
  | 'api'
  | 'database'
  | 'forms'
  | 'authentication'
  | 'validation'
  | 'utilities'
  | 'e-commerce'
  | 'finance'
  | 'healthcare'
  | 'education'
  | 'gaming'
  | 'iot'
  | 'social'
  | 'productivity'
  | 'analytics'
  | 'security'
  | 'testing'
  | 'configuration'
  | 'content'
  | 'messaging'
  | 'media'
  | 'geography'
  | 'datetime'
  | 'networking'
  | 'devtools'
  | 'other';

export interface TemplateSearchOptions {
  query?: string;
  category?: TemplateCategory;
  tags?: string[];
  author?: string;
  difficulty?: string[];
  rating?: number;
  featured?: boolean;
  trending?: boolean;
  recent?: boolean;
  framework?: string;
  language?: string;
  sortBy?: 'name' | 'rating' | 'downloads' | 'updated' | 'created' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TemplateGenerationConfig {
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  customizations: TemplateCustomization[];
  includeExamples: boolean;
  includeDocumentation: boolean;
  includeTests: boolean;
  framework: 'zod' | 'joi' | 'yup' | 'ajv' | 'superstruct';
  language: 'typescript' | 'javascript';
  outputFormat: 'file' | 'string' | 'object';
}

export interface TemplateInstallOptions {
  targetPath?: string;
  customizations?: Record<string, any>;
  generateExamples?: boolean;
  generateDocs?: boolean;
  generateTests?: boolean;
  overwrite?: boolean;
  backup?: boolean;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
  suggestions: TemplateValidationSuggestion[];
  metadata: {
    complexity: number;
    size: number;
    dependencies: number;
    examples: number;
  };
}

export interface TemplateValidationError {
  code: string;
  message: string;
  path: string;
  severity: 'error' | 'warning' | 'info';
  fix?: string;
}

export interface TemplateValidationWarning {
  code: string;
  message: string;
  path: string;
  suggestion: string;
}

export interface TemplateValidationSuggestion {
  type: 'improvement' | 'optimization' | 'best-practice';
  message: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

export interface MarketplaceStats {
  totalTemplates: number;
  totalDownloads: number;
  averageRating: number;
  categoryCounts: Record<TemplateCategory, number>;
  topTemplates: SchemaTemplate[];
  recentTemplates: SchemaTemplate[];
  trendingTemplates: SchemaTemplate[];
  featuredTemplates: SchemaTemplate[];
}

export interface TemplateBundle {
  id: string;
  name: string;
  description: string;
  templates: string[];
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  version: string;
  created: Date;
  updated: Date;
  tags: string[];
  category: TemplateCategory;
  price?: number;
  license: string;
}

export class SchemaTemplateManager extends EventEmitter {
  private readonly templates: Map<string, SchemaTemplate> = new Map();
  // @ts-ignore: _bundles reserved for future template bundle management
  private readonly _bundles: Map<string, TemplateBundle> = new Map();
  private readonly templatePath: string;
  private readonly cachePath: string;
  private readonly configPath: string;
  private config: TemplateManagerConfig;

  constructor(basePath?: string) {
    super();
    this.templatePath = path.join(basePath || process.cwd(), '.zodded', 'templates');
    this.cachePath = path.join(basePath || process.cwd(), '.zodded', 'cache');
    this.configPath = path.join(basePath || process.cwd(), '.zodded', 'templates.config.json');
    this.config = {
      registries: ['https://templates.zodded.dev/api'],
      cache: true,
      cacheExpiry: 3600000,
      autoUpdate: false,
      features: {
        validation: true,
        suggestions: true,
        analytics: true,
        collaboration: false
      }
    };
    this.loadConfig();
  }

  async initialize(): Promise<void> {
    await this.ensureDirectories();
    await this.loadLocalTemplates();
    this.emit('initialized');
  }

  async createTemplate(
    schema: z.ZodTypeAny,
    metadata: Partial<SchemaTemplate>,
    config: Partial<TemplateGenerationConfig> = {}
  ): Promise<SchemaTemplate> {
    const template: SchemaTemplate = {
      id: this.generateTemplateId(metadata.name || 'untitled'),
      name: metadata.name || 'Untitled Template',
      description: metadata.description || 'A custom schema template',
      version: metadata.version || '1.0.0',
      author: metadata.author || { name: 'Anonymous' },
      tags: metadata.tags || [],
      category: metadata.category || 'other',
      difficulty: metadata.difficulty || 'intermediate',
      schema,
      metadata: {
        framework: config.framework || 'zod',
        compatibility: ['zod@^3.0.0'],
        language: config.language || 'typescript',
        size: this.calculateTemplateSize(schema),
        complexity: this.calculateComplexity(schema),
        performance: {
          validationSpeed: this.estimateValidationSpeed(schema),
          memoryUsage: this.estimateMemoryUsage(schema),
          bundleSize: this.estimateBundleSize(schema)
        },
        features: this.extractFeatures(schema),
        useCases: metadata.metadata?.useCases || [],
        industries: metadata.metadata?.industries || []
      },
      examples: config.includeExamples ? this.generateExamples(schema) : [],
      documentation: config.includeDocumentation ? this.generateDocumentation(schema, metadata) : {
        overview: '',
        installation: '',
        usage: '',
        api: [],
        faq: [],
        troubleshooting: [],
        migrations: []
      },
      dependencies: this.extractDependencies(schema),
      customizations: config.customizations || [],
      created: new Date(),
      updated: new Date(),
      license: metadata.license || 'MIT',
      changelog: [],
      ...(metadata.repository !== undefined && { repository: metadata.repository })
    };

    this.templates.set(template.id, template);

    if (config.outputFormat !== 'object') {
      await this.saveTemplate(template);
    }

    this.emit('templateCreated', template);
    return template;
  }

  async installTemplate(
    templateId: string,
    options: TemplateInstallOptions = {}
  ): Promise<{ template: SchemaTemplate; path: string }> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const targetPath = options.targetPath || path.join(this.templatePath, 'installed', template.id);

    if (options.backup && await this.fileExists(targetPath)) {
      await this.createBackup(targetPath);
    }

    const customizedTemplate = options.customizations
      ? await this.customizeTemplate(template, options.customizations)
      : template;

    await this.ensureDirectory(targetPath);
    await this.writeTemplateFiles(customizedTemplate, targetPath, options);

    if (options.generateExamples) {
      await this.generateTemplateExamples(customizedTemplate, targetPath);
    }

    if (options.generateDocs) {
      await this.generateTemplateDocumentation(customizedTemplate, targetPath);
    }

    if (options.generateTests) {
      await this.generateTemplateTests(customizedTemplate, targetPath);
    }

    this.emit('templateInstalled', { template: customizedTemplate, path: targetPath });
    return { template: customizedTemplate, path: targetPath };
  }

  async searchTemplates(options: TemplateSearchOptions = {}): Promise<SchemaTemplate[]> {
    let results = Array.from(this.templates.values());

    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (options.category) {
      results = results.filter(t => t.category === options.category);
    }

    if (options.tags?.length) {
      results = results.filter(t =>
        options.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (options.author) {
      results = results.filter(t => t.author.name === options.author);
    }

    if (options.difficulty?.length) {
      results = results.filter(t => options.difficulty!.includes(t.difficulty));
    }

    if (options.rating) {
      results = results.filter(t => (t.rating || 0) >= options.rating!);
    }

    if (options.framework) {
      results = results.filter(t => t.metadata.framework === options.framework);
    }

    if (options.language) {
      results = results.filter(t => t.metadata.language === options.language);
    }

    const sortBy = options.sortBy || 'name';
    const sortOrder = options.sortOrder || 'asc';

    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rating':
          comparison = (a.rating || 0) - (b.rating || 0);
          break;
        case 'downloads':
          comparison = (a.downloads || 0) - (b.downloads || 0);
          break;
        case 'updated':
          comparison = a.updated.getTime() - b.updated.getTime();
          break;
        case 'created':
          comparison = a.created.getTime() - b.created.getTime();
          break;
        case 'relevance':
          comparison = this.calculateRelevance(a, options) - this.calculateRelevance(b, options);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const offset = options.offset || 0;
    const limit = options.limit || results.length;

    return results.slice(offset, offset + limit);
  }

  async validateTemplate(template: SchemaTemplate): Promise<TemplateValidationResult> {
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];
    const suggestions: TemplateValidationSuggestion[] = [];

    if (!template.name || template.name.trim().length === 0) {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Template name is required',
        path: 'name',
        severity: 'error',
        fix: 'Provide a descriptive name for the template'
      });
    }

    if (!template.description || template.description.trim().length < 10) {
      warnings.push({
        code: 'SHORT_DESCRIPTION',
        message: 'Template description is too short',
        path: 'description',
        suggestion: 'Provide a detailed description (at least 10 characters)'
      });
    }

    if (template.tags.length === 0) {
      warnings.push({
        code: 'NO_TAGS',
        message: 'Template has no tags',
        path: 'tags',
        suggestion: 'Add relevant tags to improve discoverability'
      });
    }

    if (template.examples.length === 0) {
      suggestions.push({
        type: 'improvement',
        message: 'Consider adding usage examples',
        impact: 'medium',
        effort: 'low'
      });
    }

    if (!template.documentation.overview) {
      suggestions.push({
        type: 'improvement',
        message: 'Add comprehensive documentation',
        impact: 'high',
        effort: 'medium'
      });
    }

    try {
      template.schema.parse({});
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        errors.push({
          code: 'INVALID_SCHEMA',
          message: 'Schema validation failed',
          path: 'schema',
          severity: 'error',
          fix: 'Ensure the schema is valid Zod schema'
        });
      }
    }

    const complexity = this.calculateComplexity(template.schema);
    if (complexity > 50) {
      suggestions.push({
        type: 'optimization',
        message: 'Consider simplifying the schema for better performance',
        impact: 'medium',
        effort: 'high'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      metadata: {
        complexity,
        size: JSON.stringify(template).length,
        dependencies: template.dependencies.length,
        examples: template.examples.length
      }
    };
  }

  async getTemplate(id: string): Promise<SchemaTemplate | null> {
    return this.templates.get(id) || null;
  }

  async getMarketplaceStats(): Promise<MarketplaceStats> {
    const templates = Array.from(this.templates.values());

    const categoryCounts = {} as Record<TemplateCategory, number>;
    for (const template of templates) {
      categoryCounts[template.category] = (categoryCounts[template.category] || 0) + 1;
    }

    const topTemplates = templates
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 10);

    const recentTemplates = templates
      .sort((a, b) => b.updated.getTime() - a.updated.getTime())
      .slice(0, 10);

    const trendingTemplates = templates
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, 10);

    return {
      totalTemplates: templates.length,
      totalDownloads: templates.reduce((sum, t) => sum + (t.downloads || 0), 0),
      averageRating: templates.reduce((sum, t) => sum + (t.rating || 0), 0) / templates.length,
      categoryCounts,
      topTemplates,
      recentTemplates,
      trendingTemplates,
      featuredTemplates: templates.filter(t => t.tags.includes('featured'))
    };
  }

  async publishTemplate(template: SchemaTemplate, registry?: string): Promise<void> {
    const targetRegistry = registry || this.config.registries[0] || 'default';

    const validation = await this.validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    this.emit('templatePublishing', { template, registry: targetRegistry });

    try {
      await this.uploadToRegistry(template, targetRegistry);
      this.emit('templatePublished', { template, registry: targetRegistry });
    } catch (error) {
      this.emit('templatePublishError', { template, registry: targetRegistry, error });
      throw error;
    }
  }

  async unpublishTemplate(templateId: string, registry?: string): Promise<void> {
    const targetRegistry = registry || this.config.registries[0] || 'default';

    this.emit('templateUnpublishing', { templateId, registry: targetRegistry });

    try {
      await this.removeFromRegistry(templateId, targetRegistry);
      this.emit('templateUnpublished', { templateId, registry: targetRegistry });
    } catch (error) {
      this.emit('templateUnpublishError', { templateId, registry: targetRegistry, error });
      throw error;
    }
  }

  private generateTemplateId(name: string): string {
    const hash = createHash('sha256').update(name + Date.now()).digest('hex');
    return `tpl_${hash.substring(0, 16)}`;
  }

  private calculateTemplateSize(schema: z.ZodTypeAny): 'small' | 'medium' | 'large' | 'xlarge' {
    const schemaString = JSON.stringify(schema);
    const size = schemaString.length;

    if (size < 1000) return 'small';
    if (size < 5000) return 'medium';
    if (size < 20000) return 'large';
    return 'xlarge';
  }

  private calculateComplexity(schema: z.ZodTypeAny): number {
    let complexity = 1;

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      complexity += Object.keys(shape).length;
      for (const key in shape) {
        complexity += this.calculateComplexity(shape[key]);
      }
    } else if (schema instanceof z.ZodArray) {
      complexity += this.calculateComplexity(schema.element as any) + 2;
    } else if (schema instanceof z.ZodUnion) {
      complexity += schema.options.reduce((sum: any, option: any) => sum + this.calculateComplexity(option), 0) + 3;
    } else if (schema instanceof z.ZodIntersection) {
      complexity += this.calculateComplexity(schema._def.left as any) + this.calculateComplexity(schema._def.right as any) + 2;
    } else if (schema instanceof z.ZodRecord) {
      complexity += this.calculateComplexity(schema.valueType as any) + 2;
    } else if (schema instanceof z.ZodTuple) {
      complexity += (schema as any).items.reduce((sum: any, item: any) => sum + this.calculateComplexity(item), 0) + 1;
    }

    return complexity;
  }

  private estimateValidationSpeed(schema: z.ZodTypeAny): 'fast' | 'medium' | 'slow' {
    const complexity = this.calculateComplexity(schema);
    if (complexity < 10) return 'fast';
    if (complexity < 30) return 'medium';
    return 'slow';
  }

  private estimateMemoryUsage(schema: z.ZodTypeAny): 'low' | 'medium' | 'high' {
    const complexity = this.calculateComplexity(schema);
    if (complexity < 15) return 'low';
    if (complexity < 40) return 'medium';
    return 'high';
  }

  private estimateBundleSize(schema: z.ZodTypeAny): number {
    return JSON.stringify(schema).length * 2;
  }

  private extractFeatures(schema: z.ZodTypeAny): string[] {
    const features: string[] = [];

    if (schema instanceof z.ZodObject) features.push('object-validation');
    if (schema instanceof z.ZodArray) features.push('array-validation');
    if (schema instanceof z.ZodString) features.push('string-validation');
    if (schema instanceof z.ZodNumber) features.push('number-validation');
    if (schema instanceof z.ZodUnion) features.push('union-types');
    if (schema instanceof z.ZodIntersection) features.push('intersection-types');
    if (schema instanceof z.ZodOptional) features.push('optional-fields');
    if (schema instanceof z.ZodNullable) features.push('nullable-fields');
    if (schema instanceof z.ZodDefault) features.push('default-values');
    if (schema instanceof z.ZodEnum) features.push('enum-validation');

    return features;
  }

  private generateExamples(_schema: z.ZodTypeAny): TemplateExample[] {
    return [
      {
        id: 'basic-usage',
        title: 'Basic Usage',
        description: 'Basic example of using this schema',
        code: `const result = schema.parse(data);`,
        input: {},
        output: {},
        explanation: 'This example shows the basic usage of the schema',
        difficulty: 'beginner'
      }
    ];
  }

  private generateDocumentation(_schema: z.ZodTypeAny, metadata: Partial<SchemaTemplate>): TemplateDocumentation {
    return {
      overview: `This template provides ${metadata.description || 'schema validation functionality'}.`,
      installation: 'npm install zod',
      usage: 'Import and use the schema with your data validation needs.',
      api: [],
      faq: [],
      troubleshooting: [],
      migrations: []
    };
  }

  private extractDependencies(_schema: z.ZodTypeAny): TemplateDependency[] {
    return [
      {
        name: 'zod',
        version: '^3.0.0',
        type: 'required',
        description: 'TypeScript-first schema validation library'
      }
    ];
  }

  private calculateRelevance(template: SchemaTemplate, options: TemplateSearchOptions): number {
    let score = 0;

    if (options.query) {
      const query = options.query.toLowerCase();
      if (template.name.toLowerCase().includes(query)) score += 10;
      if (template.description.toLowerCase().includes(query)) score += 5;
      if (template.tags.some(tag => tag.toLowerCase().includes(query))) score += 3;
    }

    score += (template.rating || 0) * 2;
    score += Math.log(template.downloads || 1);

    const daysSinceUpdate = (Date.now() - template.updated.getTime()) / (1000 * 60 * 60 * 24);
    score -= daysSinceUpdate * 0.1;

    return score;
  }

  private async customizeTemplate(
    template: SchemaTemplate,
    customizations: Record<string, any>
  ): Promise<SchemaTemplate> {
    const customized = JSON.parse(JSON.stringify(template));

    for (const customization of template.customizations) {
      if (customizations[customization.id] !== undefined) {
        const value = customizations[customization.id];

        if (customization.validation) {
          try {
            customization.validation.parse(value);
          } catch (error) {
            throw new Error(`Invalid customization value for ${customization.name}: ${error}`);
          }
        }

        customized.metadata[customization.id] = value;
      }
    }

    return customized;
  }

  private async ensureDirectories(): Promise<void> {
    await this.ensureDirectory(this.templatePath);
    await this.ensureDirectory(this.cachePath);
    await this.ensureDirectory(path.dirname(this.configPath));
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      if (await this.fileExists(this.configPath)) {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(configData) };
      }
    } catch (error) {
      this.emit('configError', error);
    }
  }

  // @ts-ignore: Reserved for configuration management
  private async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      this.emit('configError', error);
    }
  }

  private async loadLocalTemplates(): Promise<void> {
    try {
      if (!await this.fileExists(this.templatePath)) return;

      const files = await fs.readdir(this.templatePath);
      const templateFiles = files.filter(file => file.endsWith('.template.json'));

      for (const file of templateFiles) {
        try {
          const filePath = path.join(this.templatePath, file);
          const templateData = await fs.readFile(filePath, 'utf-8');
          const template: SchemaTemplate = JSON.parse(templateData);
          this.templates.set(template.id, template);
        } catch (error) {
          this.emit('templateLoadError', { file, error });
        }
      }
    } catch (error) {
      this.emit('templatesLoadError', error);
    }
  }

  private async saveTemplate(template: SchemaTemplate): Promise<void> {
    const filePath = path.join(this.templatePath, `${template.id}.template.json`);
    await fs.writeFile(filePath, JSON.stringify(template, null, 2));
  }

  private async createBackup(targetPath: string): Promise<void> {
    const backupPath = `${targetPath}.backup.${Date.now()}`;
    await fs.cp(targetPath, backupPath, { recursive: true });
  }

  private async writeTemplateFiles(
    template: SchemaTemplate,
    targetPath: string,
    _options: TemplateInstallOptions
  ): Promise<void> {
    const templateFile = path.join(targetPath, 'template.json');
    await fs.writeFile(templateFile, JSON.stringify(template, null, 2));

    const schemaFile = path.join(targetPath, 'schema.ts');
    const schemaCode = this.generateSchemaCode(template);
    await fs.writeFile(schemaFile, schemaCode);
  }

  private generateSchemaCode(template: SchemaTemplate): string {
    return `import { z } from 'zod';

/**
 * ${template.name}
 * ${template.description}
 *
 * @author ${template.author.name}
 * @version ${template.version}
 * @category ${template.category}
 */
export const ${this.toCamelCase(template.name)}Schema = ${this.schemaToString(template.schema)};

export type ${this.toPascalCase(template.name)} = z.infer<typeof ${this.toCamelCase(template.name)}Schema>;
`;
  }

  private schemaToString(schema: z.ZodTypeAny): string {
    return JSON.stringify(schema, null, 2);
  }

  private toCamelCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  private toPascalCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
      return word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  private async generateTemplateExamples(template: SchemaTemplate, targetPath: string): Promise<void> {
    const examplesPath = path.join(targetPath, 'examples');
    await this.ensureDirectory(examplesPath);

    for (const example of template.examples) {
      const exampleFile = path.join(examplesPath, `${example.id}.ts`);
      const exampleCode = `// ${example.title}
// ${example.description}

import { ${this.toCamelCase(template.name)}Schema } from '../schema';

${example.code}

// Example input:
const exampleInput = ${JSON.stringify(example.input, null, 2)};

// Example output:
const exampleOutput = ${JSON.stringify(example.output, null, 2)};

// Explanation:
// ${example.explanation}
`;
      await fs.writeFile(exampleFile, exampleCode);
    }
  }

  private async generateTemplateDocumentation(template: SchemaTemplate, targetPath: string): Promise<void> {
    const docPath = path.join(targetPath, 'README.md');
    const docContent = `# ${template.name}

${template.description}

## Installation

\`\`\`bash
${template.documentation.installation}
\`\`\`

## Usage

${template.documentation.usage}

## Overview

${template.documentation.overview}

## Examples

${template.examples.map(example => `
### ${example.title}

${example.description}

\`\`\`typescript
${example.code}
\`\`\`
`).join('\n')}

## Metadata

- **Framework**: ${template.metadata.framework}
- **Language**: ${template.metadata.language}
- **Complexity**: ${template.metadata.complexity}
- **Performance**: ${template.metadata.performance.validationSpeed}

## License

${template.license}
`;
    await fs.writeFile(docPath, docContent);
  }

  private async generateTemplateTests(template: SchemaTemplate, targetPath: string): Promise<void> {
    const testsPath = path.join(targetPath, 'tests');
    await this.ensureDirectory(testsPath);

    const testFile = path.join(testsPath, 'schema.test.ts');
    const testCode = `import { ${this.toCamelCase(template.name)}Schema } from '../schema';

describe('${template.name}', () => {
  it('should validate correct data', () => {
    const validData = {}; // Add valid test data
    const result = ${this.toCamelCase(template.name)}Schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid data', () => {
    const invalidData = {}; // Add invalid test data
    const result = ${this.toCamelCase(template.name)}Schema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
`;
    await fs.writeFile(testFile, testCode);
  }

  private async uploadToRegistry(template: SchemaTemplate, registry: string): Promise<void> {
    // Implementation would depend on the registry API
    console.log(`Uploading template ${template.id} to ${registry}`);
  }

  private async removeFromRegistry(templateId: string, registry: string): Promise<void> {
    // Implementation would depend on the registry API
    console.log(`Removing template ${templateId} from ${registry}`);
  }
}

interface TemplateManagerConfig {
  registries: string[];
  cache: boolean;
  cacheExpiry: number;
  autoUpdate: boolean;
  features: {
    validation: boolean;
    suggestions: boolean;
    analytics: boolean;
    collaboration: boolean;
  };
}

export { SchemaTemplateManager as default };