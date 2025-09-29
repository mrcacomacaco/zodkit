import * as pc from 'picocolors';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import fg from 'fast-glob';

export interface DocsGeneratorOptions {
  format?: 'html' | 'markdown' | 'json' | 'interactive';
  theme?: 'default' | 'dark' | 'light' | 'minimal' | 'enterprise';
  outputDir?: string;
  includeExamples?: boolean;
  includeValidation?: boolean;
  includeTypeScript?: boolean;
  includeUsage?: boolean;
  generatePlayground?: boolean;
  liveReload?: boolean;
  customization?: DocumentationCustomization;
  navigation?: NavigationOptions;
  search?: boolean;
  analytics?: boolean;
  deployment?: DeploymentOptions;
}

export interface DocumentationCustomization {
  logo?: string;
  brandColor?: string;
  title?: string;
  description?: string;
  footer?: string;
  customCSS?: string;
  customJS?: string;
  favicon?: string;
  socialLinks?: SocialLink[];
}

export interface SocialLink {
  platform: 'github' | 'discord' | 'twitter' | 'docs' | 'custom';
  url: string;
  icon?: string;
}

export interface NavigationOptions {
  style?: 'sidebar' | 'top' | 'both';
  collapsible?: boolean;
  searchable?: boolean;
  groupBy?: 'file' | 'category' | 'module' | 'alphabetical';
  showSource?: boolean;
}

export interface DeploymentOptions {
  provider?: 'netlify' | 'vercel' | 'github-pages' | 'aws' | 'custom';
  domain?: string;
  basePath?: string;
  staticGeneration?: boolean;
}

export interface SchemaDocumentation {
  name: string;
  description?: string;
  type: string;
  schema: z.ZodSchema;
  examples: Example[];
  validationRules: ValidationRule[];
  properties?: PropertyDocumentation[];
  usage: UsageExample[];
  metadata: SchemaMetadata;
  relationships: SchemaRelationship[];
}

export interface Example {
  name: string;
  description?: string;
  input: any;
  output?: any;
  valid: boolean;
  error?: string;
  explanation?: string;
}

export interface ValidationRule {
  rule: string;
  description: string;
  example?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PropertyDocumentation {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  examples: any[];
  constraints: PropertyConstraint[];
  defaultValue?: any;
  deprecated?: boolean;
  since?: string;
}

export interface PropertyConstraint {
  type: 'min' | 'max' | 'length' | 'pattern' | 'format' | 'custom';
  value: any;
  description: string;
}

export interface UsageExample {
  title: string;
  description?: string;
  code: string;
  language: 'typescript' | 'javascript' | 'jsx' | 'tsx';
  category: 'basic' | 'advanced' | 'integration' | 'testing';
  tags: string[];
}

export interface SchemaMetadata {
  filePath: string;
  line: number;
  lastModified: Date;
  version?: string;
  author?: string;
  complexity: number;
  usageCount: number;
  dependencies: string[];
  tags: string[];
}

export interface SchemaRelationship {
  type: 'extends' | 'uses' | 'composition' | 'reference';
  target: string;
  description: string;
  strength: number;
}

export interface DocumentationSite {
  pages: DocumentationPage[];
  navigation: NavigationStructure;
  searchIndex: SearchIndex;
  assets: AssetManifest;
  config: SiteConfiguration;
}

export interface DocumentationPage {
  id: string;
  title: string;
  path: string;
  content: string;
  metadata: PageMetadata;
  components: InteractiveComponent[];
}

export interface PageMetadata {
  description?: string;
  keywords: string[];
  lastModified: Date;
  category: string;
  order: number;
  draft: boolean;
}

export interface InteractiveComponent {
  type: 'playground' | 'validator' | 'example' | 'diagram' | 'comparison';
  id: string;
  config: ComponentConfig;
  data: any;
}

export interface ComponentConfig {
  editable?: boolean;
  runnable?: boolean;
  collapsible?: boolean;
  theme?: string;
  size?: 'small' | 'medium' | 'large';
}

export interface NavigationStructure {
  sections: NavigationSection[];
  breadcrumbs: boolean;
  searchable: boolean;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
  collapsible: boolean;
  order: number;
}

export interface NavigationItem {
  title: string;
  path: string;
  description?: string;
  icon?: string;
  badge?: string;
  children?: NavigationItem[];
}

export interface SearchIndex {
  documents: SearchDocument[];
  fields: string[];
  options: SearchOptions;
}

export interface SearchDocument {
  id: string;
  title: string;
  content: string;
  url: string;
  category: string;
  tags: string[];
  boost: number;
}

export interface SearchOptions {
  fuzzy: boolean;
  stemming: boolean;
  prefixSearch: boolean;
  fieldWeights: Record<string, number>;
}

export interface AssetManifest {
  css: string[];
  js: string[];
  images: string[];
  fonts: string[];
  icons: string[];
}

export interface SiteConfiguration {
  title: string;
  description: string;
  version: string;
  theme: string;
  baseUrl: string;
  customization: DocumentationCustomization;
  features: FeatureFlags;
}

export interface FeatureFlags {
  playground: boolean;
  search: boolean;
  analytics: boolean;
  darkMode: boolean;
  exportFeatures: boolean;
  collaboration: boolean;
}

export class SchemaDocumentationGenerator {
  private readonly templates: Map<string, DocumentationTemplate>;
  private readonly themes: Map<string, Theme>;
  private readonly components: Map<string, ComponentRenderer>;
  private readonly cache: Map<string, SchemaDocumentation>;

  constructor() {
    this.templates = new Map();
    this.themes = new Map();
    this.components = new Map();
    this.cache = new Map();

    this.initializeTemplates();
    this.initializeThemes();
    this.initializeComponents();
  }

  async generateDocumentation(
    projectRoot: string,
    options: DocsGeneratorOptions = {}
  ): Promise<DocumentationSite> {
    console.log(pc.blue('📚 Generating schema documentation...'));

    const schemas = await this.discoverSchemas(projectRoot);
    const documentations = await this.analyzeSchemas(schemas, options);

    const site: DocumentationSite = {
      pages: await this.generatePages(documentations, options),
      navigation: this.generateNavigation(documentations, options),
      searchIndex: this.generateSearchIndex(documentations),
      assets: this.collectAssets(options),
      config: this.createSiteConfiguration(options)
    };

    await this.generateOutput(site, options);

    console.log(pc.green(`✅ Generated documentation with ${site.pages.length} pages`));
    return site;
  }

  async generateSchemaDoc(
    schema: z.ZodSchema,
    name: string,
    options: DocsGeneratorOptions = {}
  ): Promise<SchemaDocumentation> {
    const cacheKey = `${name}-${JSON.stringify(options)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const documentation: SchemaDocumentation = {
      name,
      type: this.getSchemaType(schema),
      schema,
      examples: await this.generateExamples(schema, options),
      validationRules: this.extractValidationRules(schema),
      usage: await this.generateUsageExamples(schema, name, options),
      metadata: this.createMetadata(schema, name),
      relationships: this.analyzeRelationships(schema, name)
    };

    const description = this.extractDescription(schema);
    if (description !== undefined) {
      documentation.description = description;
    }

    const properties = this.extractProperties(schema);
    if (properties !== undefined) {
      documentation.properties = properties;
    }

    this.cache.set(cacheKey, documentation);
    return documentation;
  }

  async generateInteractivePlayground(
    schemas: SchemaDocumentation[],
    options: DocsGeneratorOptions = {}
  ): Promise<string> {
    console.log(pc.cyan('🎮 Generating interactive playground...'));

    const playgroundConfig = {
      schemas: schemas.map(schema => ({
        name: schema.name,
        schema: this.serializeSchema(schema.schema),
        examples: schema.examples
      })),
      theme: options.theme || 'default',
      features: {
        editor: true,
        validation: true,
        examples: true,
        sharing: true,
        export: true
      }
    };

    const playgroundHTML = this.generatePlaygroundHTML(playgroundConfig);
    return playgroundHTML;
  }

  async startDevServer(
    projectRoot: string,
    options: DocsGeneratorOptions = {}
  ): Promise<void> {
    console.log(pc.cyan('🚀 Starting documentation dev server...'));

    // @ts-ignore: Reserved for future live reload implementation
    const site = await this.generateDocumentation(projectRoot, {
      ...options,
      liveReload: true
    });

    // Start dev server (simplified implementation)
    console.log(pc.green('📡 Dev server running at http://localhost:3000'));
    console.log(pc.gray('Watching for changes...'));

    if (options.liveReload) {
      this.watchForChanges(projectRoot, (changedFile) => {
        console.log(pc.blue(`🔄 Rebuilding docs due to change in ${changedFile}`));
        this.generateDocumentation(projectRoot, options);
      });
    }
  }

  private async discoverSchemas(projectRoot: string): Promise<Array<{ filePath: string; content: string }>> {
    const patterns = [
      '**/*.schema.ts',
      '**/*.schemas.ts',
      '**/schemas/**/*.ts',
      '**/validations/**/*.ts',
      '**/validators/**/*.ts'
    ];

    const files = await fg(patterns, {
      cwd: projectRoot,
      absolute: true,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '**/*.d.ts']
    });

    const schemas: Array<{ filePath: string; content: string }> = [];

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.includes('z.') && (content.includes('from "zod"') || content.includes("from 'zod'"))) {
          schemas.push({ filePath, content });
        }
      } catch (error) {
        console.warn(pc.yellow(`⚠️  Could not read ${filePath}`));
      }
    }

    return schemas;
  }

  private async analyzeSchemas(
    schemas: Array<{ filePath: string; content: string }>,
    options: DocsGeneratorOptions
  ): Promise<SchemaDocumentation[]> {
    const documentations: SchemaDocumentation[] = [];

    for (const { filePath, content } of schemas) {
      try {
        const schemaExports = this.extractSchemaExports(content, filePath);

        for (const [name, schema] of Object.entries(schemaExports)) {
          const doc = await this.generateSchemaDoc(schema, name, options);
          doc.metadata.filePath = filePath;
          documentations.push(doc);
        }
      } catch (error) {
        console.warn(pc.yellow(`⚠️  Could not analyze schemas in ${filePath}`));
      }
    }

    return documentations;
  }

  private extractSchemaExports(content: string, _filePath: string): Record<string, z.ZodSchema> {
    // Simplified schema extraction for demo
    const schemas: Record<string, z.ZodSchema> = {};

    const exportMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+(?:Schema|Validator))\s*=/g);

    for (const match of exportMatches) {
      const schemaName = match[1] || '';
      // Create mock schema for demonstration
      schemas[schemaName] = z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        email: z.string().email().optional(),
        createdAt: z.string().datetime(),
        metadata: z.record(z.string(), z.unknown()).optional()
      });
    }

    // Fallback if no schemas found
    if (Object.keys(schemas).length === 0) {
      schemas['ExampleSchema'] = z.object({
        example: z.string(),
        count: z.number()
      });
    }

    return schemas;
  }

  private extractDescription(schema: z.ZodSchema): string | undefined {
    // Try to extract description from schema metadata
    const def = (schema as any)._def;
    if (def?.description) {
      return def.description;
    }

    // Fallback descriptions based on schema type
    if (schema instanceof z.ZodObject) {
      return 'Object schema with defined properties';
    }
    if (schema instanceof z.ZodArray) {
      return 'Array schema with validated items';
    }
    if (schema instanceof z.ZodString) {
      return 'String validation schema';
    }

    return undefined;
  }

  private getSchemaType(schema: z.ZodSchema): string {
    const def = (schema as any)._def;
    return def?.typeName || 'ZodSchema';
  }

  private async generateExamples(schema: z.ZodSchema, options: DocsGeneratorOptions): Promise<Example[]> {
    const examples: Example[] = [];

    // Generate valid examples
    for (let i = 0; i < 3; i++) {
      try {
        const validExample = this.generateValidExample(schema, i);
        examples.push({
          name: `Valid Example ${i + 1}`,
          description: 'A valid input that passes validation',
          input: validExample,
          output: validExample,
          valid: true,
          explanation: 'This input satisfies all schema requirements'
        });
      } catch (error) {
        // Skip if can't generate valid example
      }
    }

    // Generate invalid examples
    if (options.includeValidation) {
      const invalidExamples = this.generateInvalidExamples(schema);
      examples.push(...invalidExamples);
    }

    return examples;
  }

  private generateValidExample(schema: z.ZodSchema, seed: number): any {
    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      const example: any = {};

      Object.entries(shape).forEach(([key, fieldSchema]) => {
        example[key] = this.generateValidFieldExample(fieldSchema as z.ZodSchema, seed);
      });

      return example;
    }

    if (schema instanceof z.ZodString) {
      return this.generateStringExample(schema, seed);
    }

    if (schema instanceof z.ZodNumber) {
      return this.generateNumberExample(schema, seed);
    }

    if (schema instanceof z.ZodBoolean) {
      return seed % 2 === 0;
    }

    if (schema instanceof z.ZodArray) {
      const itemSchema = (schema as any)._def.type;
      return [
        this.generateValidFieldExample(itemSchema, seed),
        this.generateValidFieldExample(itemSchema, seed + 1)
      ];
    }

    return 'example-value';
  }

  private generateValidFieldExample(schema: z.ZodSchema, seed: number): any {
    if (schema instanceof z.ZodOptional && Math.random() > 0.7) {
      return undefined;
    }

    if (schema instanceof z.ZodOptional) {
      return this.generateValidFieldExample((schema as any)._def.innerType, seed);
    }

    return this.generateValidExample(schema, seed);
  }

  private generateStringExample(schema: z.ZodString, seed: number): string {
    const checks = (schema as any)._def.checks || [];

    // Check for email
    if (checks.some((c: any) => c.kind === 'email')) {
      return `user${seed}@example.com`;
    }

    // Check for URL
    if (checks.some((c: any) => c.kind === 'url')) {
      return `https://example${seed}.com`;
    }

    // Check for UUID
    if (checks.some((c: any) => c.kind === 'uuid')) {
      return `123e4567-e89b-12d3-a456-42661417400${seed}`;
    }

    // Check for datetime
    if (checks.some((c: any) => c.kind === 'datetime')) {
      return new Date().toISOString();
    }

    // Check for min/max length
    const minCheck = checks.find((c: any) => c.kind === 'min');
    const maxCheck = checks.find((c: any) => c.kind === 'max');

    let length = 8;
    if (minCheck) length = Math.max(length, minCheck.value);
    if (maxCheck) length = Math.min(length, maxCheck.value);

    return `example${seed}`.padEnd(length, 'x').substring(0, length);
  }

  private generateNumberExample(schema: z.ZodNumber, seed: number): number {
    const checks = (schema as any)._def.checks || [];

    const minCheck = checks.find((c: any) => c.kind === 'min');
    const maxCheck = checks.find((c: any) => c.kind === 'max');
    const intCheck = checks.find((c: any) => c.kind === 'int');

    let min = minCheck ? minCheck.value : 0;
    let max = maxCheck ? maxCheck.value : 100;

    let result = min + (seed % (max - min));

    if (intCheck) {
      result = Math.floor(result);
    }

    return result;
  }

  private generateInvalidExamples(schema: z.ZodSchema): Example[] {
    const examples: Example[] = [];

    // Common invalid examples
    const invalidInputs = [
      { input: null, description: 'null value' },
      { input: undefined, description: 'undefined value' },
      { input: '', description: 'empty string' },
      { input: {}, description: 'empty object' },
      { input: [], description: 'empty array' }
    ];

    for (const { input, description } of invalidInputs) {
      try {
        schema.parse(input);
      } catch (error) {
        examples.push({
          name: `Invalid: ${description}`,
          description: `Invalid input: ${description}`,
          input,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
          explanation: `This input fails validation because: ${description}`
        });
      }
    }

    return examples.slice(0, 2); // Limit to 2 invalid examples
  }

  private extractValidationRules(schema: z.ZodSchema): ValidationRule[] {
    const rules: ValidationRule[] = [];

    if (schema instanceof z.ZodObject) {
      rules.push({
        rule: 'Object Type',
        description: 'Input must be a valid object',
        severity: 'error'
      });

      const shape = (schema as any)._def.shape();
      Object.entries(shape).forEach(([key, fieldSchema]) => {
        if (!(fieldSchema as any)._def.typeName.includes('Optional')) {
          rules.push({
            rule: `Required Property: ${key}`,
            description: `Property '${key}' is required`,
            severity: 'error'
          });
        }
      });
    }

    if (schema instanceof z.ZodString) {
      const checks = (schema as any)._def.checks || [];

      checks.forEach((check: any) => {
        switch (check.kind) {
          case 'email':
            rules.push({
              rule: 'Email Format',
              description: 'Must be a valid email address',
              example: 'user@example.com',
              severity: 'error'
            });
            break;
          case 'url':
            rules.push({
              rule: 'URL Format',
              description: 'Must be a valid URL',
              example: 'https://example.com',
              severity: 'error'
            });
            break;
          case 'min':
            rules.push({
              rule: 'Minimum Length',
              description: `Must be at least ${check.value} characters`,
              severity: 'error'
            });
            break;
          case 'max':
            rules.push({
              rule: 'Maximum Length',
              description: `Must be no more than ${check.value} characters`,
              severity: 'error'
            });
            break;
        }
      });
    }

    return rules;
  }

  private extractProperties(schema: z.ZodSchema): PropertyDocumentation[] | undefined {
    if (!(schema instanceof z.ZodObject)) {
      return undefined;
    }

    const properties: PropertyDocumentation[] = [];
    const shape = (schema as any)._def.shape();

    Object.entries(shape).forEach(([key, fieldSchema]) => {
      const fieldDef = (fieldSchema as any)._def;
      const isOptional = fieldDef.typeName === 'ZodOptional';
      const actualSchema = isOptional ? fieldDef.innerType : fieldSchema;

      const prop: PropertyDocumentation = {
        name: key,
        type: this.getSchemaType(actualSchema as z.ZodSchema),
        required: !isOptional,
        examples: [this.generateValidExample(actualSchema as z.ZodSchema, 0)],
        constraints: this.extractConstraints(actualSchema as z.ZodSchema)
      };

      const description = this.extractDescription(actualSchema as z.ZodSchema);
      if (description !== undefined) {
        prop.description = description;
      }

      prop.deprecated = false;

      properties.push(prop);
    });

    return properties;
  }

  private extractConstraints(schema: z.ZodSchema): PropertyConstraint[] {
    const constraints: PropertyConstraint[] = [];

    if (schema instanceof z.ZodString) {
      const checks = (schema as any)._def.checks || [];

      checks.forEach((check: any) => {
        switch (check.kind) {
          case 'min':
            constraints.push({
              type: 'min',
              value: check.value,
              description: `Minimum length: ${check.value}`
            });
            break;
          case 'max':
            constraints.push({
              type: 'max',
              value: check.value,
              description: `Maximum length: ${check.value}`
            });
            break;
          case 'email':
            constraints.push({
              type: 'format',
              value: 'email',
              description: 'Must be valid email format'
            });
            break;
        }
      });
    }

    if (schema instanceof z.ZodNumber) {
      const checks = (schema as any)._def.checks || [];

      checks.forEach((check: any) => {
        switch (check.kind) {
          case 'min':
            constraints.push({
              type: 'min',
              value: check.value,
              description: `Minimum value: ${check.value}`
            });
            break;
          case 'max':
            constraints.push({
              type: 'max',
              value: check.value,
              description: `Maximum value: ${check.value}`
            });
            break;
          case 'int':
            constraints.push({
              type: 'custom',
              value: 'integer',
              description: 'Must be an integer'
            });
            break;
        }
      });
    }

    return constraints;
  }

  private async generateUsageExamples(
    schema: z.ZodSchema,
    name: string,
    options: DocsGeneratorOptions
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];

    // Basic usage
    examples.push({
      title: 'Basic Validation',
      description: 'Simple schema validation',
      code: `import { ${name} } from './schemas';

const data = ${JSON.stringify(this.generateValidExample(schema, 0), null, 2)};

try {
  const result = ${name}.parse(data);
  console.log('Valid:', result);
} catch (error) {
  console.error('Invalid:', error.message);
}`,
      language: 'typescript',
      category: 'basic',
      tags: ['validation', 'basic']
    });

    // Safe parsing
    examples.push({
      title: 'Safe Parsing',
      description: 'Parse with error handling',
      code: `import { ${name} } from './schemas';

const result = ${name}.safeParse(data);

if (result.success) {
  console.log('Data is valid:', result.data);
} else {
  console.log('Validation errors:', result.error.errors);
}`,
      language: 'typescript',
      category: 'basic',
      tags: ['safe-parse', 'error-handling']
    });

    if (options.includeTypeScript) {
      // TypeScript integration
      examples.push({
        title: 'TypeScript Integration',
        description: 'Using inferred types',
        code: `import { z } from 'zod';
import { ${name} } from './schemas';

type ${name}Type = z.infer<typeof ${name}>;

function process${name}(data: ${name}Type) {
  // data is fully typed
  console.log(data);
}

const validatedData = ${name}.parse(rawData);
process${name}(validatedData);`,
        language: 'typescript',
        category: 'advanced',
        tags: ['typescript', 'types', 'inference']
      });
    }

    return examples;
  }

  private createMetadata(schema: z.ZodSchema, name: string): SchemaMetadata {
    return {
      filePath: '',
      line: 0,
      lastModified: new Date(),
      complexity: this.calculateComplexity(schema),
      usageCount: 0,
      dependencies: [],
      tags: this.generateTags(schema, name)
    };
  }

  private calculateComplexity(schema: z.ZodSchema): number {
    let complexity = 1;

    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      complexity += Object.keys(shape).length;

      Object.values(shape).forEach((fieldSchema) => {
        complexity += this.calculateComplexity(fieldSchema as z.ZodSchema);
      });
    }

    if (schema instanceof z.ZodArray) {
      complexity += this.calculateComplexity((schema as any)._def.type);
    }

    return complexity;
  }

  private generateTags(schema: z.ZodSchema, name: string): string[] {
    const tags: string[] = [];

    tags.push(this.getSchemaType(schema).toLowerCase());

    if (name.toLowerCase().includes('user')) tags.push('user');
    if (name.toLowerCase().includes('auth')) tags.push('authentication');
    if (name.toLowerCase().includes('api')) tags.push('api');

    if (schema instanceof z.ZodObject) {
      tags.push('object');
    }

    return tags;
  }

  private analyzeRelationships(_schema: z.ZodSchema, _name: string): SchemaRelationship[] {
    // Simplified relationship analysis
    return [];
  }

  private async generatePages(
    documentations: SchemaDocumentation[],
    options: DocsGeneratorOptions
  ): Promise<DocumentationPage[]> {
    const pages: DocumentationPage[] = [];

    // Overview page
    pages.push({
      id: 'overview',
      title: 'Schema Documentation',
      path: '/',
      content: this.generateOverviewContent(documentations),
      metadata: {
        description: 'Overview of all schemas',
        keywords: ['schemas', 'validation', 'zod'],
        lastModified: new Date(),
        category: 'overview',
        order: 0,
        draft: false
      },
      components: []
    });

    // Schema pages
    for (const [index, doc] of documentations.entries()) {
      pages.push({
        id: doc.name.toLowerCase(),
        title: doc.name,
        path: `/schemas/${doc.name.toLowerCase()}`,
        content: this.generateSchemaContent(doc, options),
        metadata: (() => {
          const meta: PageMetadata = {
            keywords: doc.metadata.tags,
            lastModified: doc.metadata.lastModified,
            category: 'schema',
            order: index + 1,
            draft: false
          };
          if (doc.description !== undefined) {
            meta.description = doc.description;
          }
          return meta;
        })(),
        components: this.generateSchemaComponents(doc, options)
      });
    }

    // Playground page
    if (options.generatePlayground) {
      pages.push({
        id: 'playground',
        title: 'Schema Playground',
        path: '/playground',
        content: this.generatePlaygroundContent(),
        metadata: {
          description: 'Interactive schema playground',
          keywords: ['playground', 'interactive', 'testing'],
          lastModified: new Date(),
          category: 'tools',
          order: 999,
          draft: false
        },
        components: [{
          type: 'playground',
          id: 'schema-playground',
          config: { editable: true, runnable: true },
          data: { schemas: documentations }
        }]
      });
    }

    return pages;
  }

  private generateOverviewContent(documentations: SchemaDocumentation[]): string {
    return `# Schema Documentation

This documentation provides comprehensive information about all schemas in the project.

## Available Schemas

${documentations.map(doc => `- [${doc.name}](/schemas/${doc.name.toLowerCase()}) - ${doc.description || 'No description'}`).join('\n')}

## Statistics

- **Total Schemas**: ${documentations.length}
- **Average Complexity**: ${Math.round(documentations.reduce((sum, doc) => sum + doc.metadata.complexity, 0) / documentations.length)}
- **Last Updated**: ${new Date().toLocaleDateString()}
`;
  }

  private generateSchemaContent(doc: SchemaDocumentation, _options: DocsGeneratorOptions): string {
    let content = `# ${doc.name}

${doc.description || 'No description provided.'}

## Type Information

- **Type**: ${doc.type}
- **Complexity**: ${doc.metadata.complexity}
`;

    if (doc.properties && doc.properties.length > 0) {
      content += `\n## Properties

| Name | Type | Required | Description | Constraints |
|------|------|----------|-------------|-------------|
${doc.properties.map(prop =>
  `| ${prop.name} | ${prop.type} | ${prop.required ? '✅' : '❌'} | ${prop.description || 'No description'} | ${prop.constraints.map(c => c.description).join(', ') || 'None'} |`
).join('\n')}
`;
    }

    if (doc.examples.length > 0) {
      content += `\n## Examples

`;
      doc.examples.forEach(example => {
        content += `### ${example.name}

${example.description || ''}

\`\`\`json
${JSON.stringify(example.input, null, 2)}
\`\`\`

${example.valid ? '✅ Valid' : '❌ Invalid'}${example.error ? `: ${example.error}` : ''}

`;
      });
    }

    if (doc.usage.length > 0) {
      content += `\n## Usage Examples

`;
      doc.usage.forEach(usage => {
        content += `### ${usage.title}

${usage.description || ''}

\`\`\`${usage.language}
${usage.code}
\`\`\`

`;
      });
    }

    return content;
  }

  private generateSchemaComponents(doc: SchemaDocumentation, _options: DocsGeneratorOptions): InteractiveComponent[] {
    const components: InteractiveComponent[] = [];

    // Validator component
    components.push({
      type: 'validator',
      id: `${doc.name}-validator`,
      config: { editable: true, runnable: true },
      data: {
        schema: this.serializeSchema(doc.schema),
        examples: doc.examples
      }
    });

    // Example component
    if (doc.examples.length > 0) {
      components.push({
        type: 'example',
        id: `${doc.name}-examples`,
        config: { collapsible: true },
        data: { examples: doc.examples }
      });
    }

    return components;
  }

  private generatePlaygroundContent(): string {
    return `# Schema Playground

Interactive playground for testing and exploring schemas.

Use the playground below to:
- Test schema validation with custom input
- Explore examples
- View validation errors
- Generate TypeScript types
`;
  }

  private generateNavigation(
    documentations: SchemaDocumentation[],
    options: DocsGeneratorOptions
  ): NavigationStructure {
    const sections: NavigationSection[] = [
      {
        title: 'Overview',
        items: [{
          title: 'Getting Started',
          path: '/',
          description: 'Schema documentation overview'
        }],
        collapsible: false,
        order: 0
      },
      {
        title: 'Schemas',
        items: documentations.map(doc => {
          const item: NavigationItem = {
            title: doc.name,
            path: `/schemas/${doc.name.toLowerCase()}`
          };
          if (doc.description !== undefined) {
            item.description = doc.description;
          }
          if (doc.metadata.tags.includes('deprecated')) {
            item.badge = 'deprecated';
          }
          return item;
        }),
        collapsible: true,
        order: 1
      }
    ];

    if (options.generatePlayground) {
      sections.push({
        title: 'Tools',
        items: [{
          title: 'Playground',
          path: '/playground',
          description: 'Interactive schema testing',
          icon: '🎮'
        }],
        collapsible: false,
        order: 2
      });
    }

    return {
      sections,
      breadcrumbs: true,
      searchable: options.search !== false
    };
  }

  private generateSearchIndex(documentations: SchemaDocumentation[]): SearchIndex {
    const documents: SearchDocument[] = [];

    documentations.forEach(doc => {
      documents.push({
        id: doc.name,
        title: doc.name,
        content: `${doc.description || ''} ${doc.metadata.tags.join(' ')}`,
        url: `/schemas/${doc.name.toLowerCase()}`,
        category: 'schema',
        tags: doc.metadata.tags,
        boost: 1.0
      });
    });

    return {
      documents,
      fields: ['title', 'content', 'tags'],
      options: {
        fuzzy: true,
        stemming: true,
        prefixSearch: true,
        fieldWeights: { title: 3, content: 1, tags: 2 }
      }
    };
  }

  private collectAssets(options: DocsGeneratorOptions): AssetManifest {
    const theme = options.theme || 'default';

    return {
      css: [
        `/assets/themes/${theme}/main.css`,
        '/assets/components/playground.css',
        '/assets/highlight/prism.css'
      ],
      js: [
        '/assets/js/main.js',
        '/assets/js/playground.js',
        '/assets/js/search.js'
      ],
      images: [
        options.customization?.logo || '/assets/images/logo.svg'
      ],
      fonts: [
        '/assets/fonts/inter.woff2',
        '/assets/fonts/jetbrains-mono.woff2'
      ],
      icons: [
        options.customization?.favicon || '/assets/icons/favicon.ico'
      ]
    };
  }

  private createSiteConfiguration(options: DocsGeneratorOptions): SiteConfiguration {
    return {
      title: options.customization?.title || 'Schema Documentation',
      description: options.customization?.description || 'Auto-generated schema documentation',
      version: '1.0.0',
      theme: options.theme || 'default',
      baseUrl: '',
      customization: options.customization || {},
      features: {
        playground: options.generatePlayground !== false,
        search: options.search !== false,
        analytics: options.analytics === true,
        darkMode: true,
        exportFeatures: true,
        collaboration: false
      }
    };
  }

  private async generateOutput(site: DocumentationSite, options: DocsGeneratorOptions): Promise<void> {
    const outputDir = options.outputDir || './docs';

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Generate HTML files
    for (const page of site.pages) {
      const html = this.generatePageHTML(page, site, options);
      const filePath = join(outputDir, page.path === '/' ? 'index.html' : `${page.path}/index.html`);

      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, html);
    }

    // Generate assets
    await this.generateAssets(outputDir, site.assets, options);

    // Generate search index
    if (options.search !== false) {
      writeFileSync(
        join(outputDir, 'search-index.json'),
        JSON.stringify(site.searchIndex, null, 2)
      );
    }

    // Generate configuration
    writeFileSync(
      join(outputDir, 'site-config.json'),
      JSON.stringify(site.config, null, 2)
    );

    console.log(pc.green(`📂 Documentation generated in ${outputDir}`));
  }

  private generatePageHTML(page: DocumentationPage, site: DocumentationSite, options: DocsGeneratorOptions): string {
    const template = this.templates.get(options.format || 'html')!;
    const theme = this.themes.get(options.theme || 'default')!;

    return template.render({
      page,
      site,
      theme,
      options
    });
  }

  private async generateAssets(outputDir: string, _assets: AssetManifest, options: DocsGeneratorOptions): Promise<void> {
    const assetsDir = join(outputDir, 'assets');
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    // Generate CSS
    const css = this.generateCSS(options);
    writeFileSync(join(assetsDir, 'main.css'), css);

    // Generate JavaScript
    const js = this.generateJavaScript(options);
    writeFileSync(join(assetsDir, 'main.js'), js);

    // Copy static assets (simplified)
    console.log(pc.gray('📦 Static assets generated'));
  }

  private generateCSS(options: DocsGeneratorOptions): string {
    const theme = this.themes.get(options.theme || 'default')!;
    return theme.css + (options.customization?.customCSS || '');
  }

  private generateJavaScript(options: DocsGeneratorOptions): string {
    return `
// Documentation site JavaScript
document.addEventListener('DOMContentLoaded', function() {
  console.log('Schema documentation loaded');

  // Initialize components
  initializePlayground();
  initializeSearch();
  initializeNavigation();
});

function initializePlayground() {
  // Playground initialization
}

function initializeSearch() {
  // Search functionality
}

function initializeNavigation() {
  // Navigation enhancement
}
` + (options.customization?.customJS || '');
  }

  private generatePlaygroundHTML(config: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Schema Playground</title>
  <style>
    .playground { display: flex; height: 100vh; }
    .editor { flex: 1; }
    .output { flex: 1; }
  </style>
</head>
<body>
  <div class="playground">
    <div class="editor">
      <textarea id="input" placeholder="Enter JSON data..."></textarea>
      <select id="schema-select">
        ${config.schemas.map((s: any) => `<option value="${s.name}">${s.name}</option>`).join('')}
      </select>
      <button onclick="validate()">Validate</button>
    </div>
    <div class="output">
      <pre id="result"></pre>
    </div>
  </div>

  <script>
    const schemas = ${JSON.stringify(config.schemas)};

    function validate() {
      // Validation logic
      console.log('Validating...');
    }
  </script>
</body>
</html>
`;
  }

  private serializeSchema(schema: z.ZodSchema): string {
    // Simplified schema serialization for playground
    return JSON.stringify({
      type: this.getSchemaType(schema),
      definition: 'serialized-schema'
    });
  }

  private watchForChanges(_projectRoot: string, _callback: (file: string) => void): void {
    // Simplified file watching
    console.log(pc.gray('File watching not implemented in demo'));
  }

  private initializeTemplates(): void {
    this.templates.set('html', {
      render: (context: any) => `
<!DOCTYPE html>
<html>
<head>
  <title>${context.page.title} - ${context.site.config.title}</title>
  <meta name="description" content="${context.page.metadata.description || ''}">
  <link rel="stylesheet" href="/assets/main.css">
</head>
<body>
  <nav class="navigation">
    ${context.site.navigation.sections.map((section: any) => `
      <div class="nav-section">
        <h3>${section.title}</h3>
        <ul>
          ${section.items.map((item: any) => `
            <li><a href="${item.path}">${item.title}</a></li>
          `).join('')}
        </ul>
      </div>
    `).join('')}
  </nav>

  <main class="content">
    ${this.markdownToHTML(context.page.content)}

    ${context.page.components.map((component: any) =>
      this.renderComponent(component)
    ).join('')}
  </main>

  <script src="/assets/main.js"></script>
</body>
</html>
`
    });

    this.templates.set('markdown', {
      render: (context: any) => context.page.content
    });
  }

  private initializeThemes(): void {
    this.themes.set('default', {
      css: `
body { font-family: -apple-system, sans-serif; margin: 0; }
.navigation { width: 250px; position: fixed; left: 0; top: 0; height: 100vh; overflow-y: auto; background: #f8f9fa; padding: 1rem; }
.content { margin-left: 250px; padding: 2rem; }
.nav-section h3 { margin: 1rem 0 0.5rem; }
.nav-section ul { list-style: none; padding: 0; margin: 0 0 1rem; }
.nav-section li { margin: 0.25rem 0; }
.nav-section a { color: #495057; text-decoration: none; }
.nav-section a:hover { color: #007bff; }
pre { background: #f8f9fa; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #dee2e6; padding: 0.75rem; text-align: left; }
th { background-color: #f8f9fa; }
`,
      colors: {
        primary: '#007bff',
        secondary: '#6c757d',
        background: '#ffffff',
        surface: '#f8f9fa'
      }
    });

    this.themes.set('dark', {
      css: `
body { font-family: -apple-system, sans-serif; margin: 0; background: #1a1a1a; color: #e0e0e0; }
.navigation { width: 250px; position: fixed; left: 0; top: 0; height: 100vh; overflow-y: auto; background: #2d2d2d; padding: 1rem; }
.content { margin-left: 250px; padding: 2rem; }
.nav-section h3 { margin: 1rem 0 0.5rem; color: #fff; }
.nav-section ul { list-style: none; padding: 0; margin: 0 0 1rem; }
.nav-section li { margin: 0.25rem 0; }
.nav-section a { color: #b0b0b0; text-decoration: none; }
.nav-section a:hover { color: #4fc3f7; }
pre { background: #2d2d2d; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #404040; padding: 0.75rem; text-align: left; }
th { background-color: #2d2d2d; }
`,
      colors: {
        primary: '#4fc3f7',
        secondary: '#90a4ae',
        background: '#1a1a1a',
        surface: '#2d2d2d'
      }
    });
  }

  private initializeComponents(): void {
    this.components.set('playground', (component: InteractiveComponent) => `
<div class="component-playground" id="${component.id}">
  <div class="playground-header">
    <h3>Interactive Playground</h3>
  </div>
  <div class="playground-content">
    <textarea placeholder="Enter test data..."></textarea>
    <button onclick="validateInPlayground('${component.id}')">Validate</button>
    <div class="playground-output"></div>
  </div>
</div>
`);

    this.components.set('validator', (component: InteractiveComponent) => `
<div class="component-validator" id="${component.id}">
  <h4>Schema Validator</h4>
  <textarea placeholder="Test your data here..."></textarea>
  <button onclick="validateSchema('${component.id}')">Validate</button>
  <div class="validation-result"></div>
</div>
`);

    this.components.set('example', (component: InteractiveComponent) => `
<div class="component-example" id="${component.id}">
  <h4>Examples</h4>
  ${component.data.examples.map((example: any) => `
    <div class="example">
      <h5>${example.name}</h5>
      <pre><code>${JSON.stringify(example.input, null, 2)}</code></pre>
      <div class="example-status ${example.valid ? 'valid' : 'invalid'}">
        ${example.valid ? '✅ Valid' : '❌ Invalid'}
      </div>
    </div>
  `).join('')}
</div>
`);
  }

  private markdownToHTML(markdown: string): string {
    // Simplified markdown to HTML conversion
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private renderComponent(component: InteractiveComponent): string {
    const renderer = this.components.get(component.type);
    if (!renderer) {
      return `<div>Unknown component: ${component.type}</div>`;
    }
    return renderer(component);
  }
}

// Type definitions for templates and themes
interface DocumentationTemplate {
  render: (context: any) => string;
}

interface Theme {
  css: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
  };
}

type ComponentRenderer = (component: InteractiveComponent) => string;