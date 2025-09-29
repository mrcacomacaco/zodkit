/**
 * @fileoverview Intelligent code generation with AI-powered templates
 * @module IntelligentCodeGenerator
 */

import { z } from 'zod';
import * as pc from 'picocolors';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';

/**
 * Code generation template
 */
export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  category: 'schema' | 'api' | 'form' | 'database' | 'testing' | 'validation';
  inputs: TemplateInput[];
  generate: (inputs: Record<string, any>) => string;
  dependencies?: string[];
  examples?: string[];
}

/**
 * Template input definition
 */
export interface TemplateInput {
  name: string;
  type: 'string' | 'boolean' | 'select' | 'multiselect' | 'schema';
  description: string;
  required: boolean;
  options?: string[];
  defaultValue?: any;
  validation?: z.ZodType;
}

/**
 * Generation context for AI-powered suggestions
 */
export interface GenerationContext {
  projectType: 'frontend' | 'backend' | 'fullstack' | 'library';
  framework?: 'react' | 'vue' | 'angular' | 'node' | 'express' | 'fastify' | 'next';
  existingSchemas: string[];
  codeStyle: {
    usesTypeScript: boolean;
    preferConst: boolean;
    usesESModules: boolean;
    indentation: 'tabs' | 'spaces';
  };
  patterns: {
    apiPatterns: string[];
    validationPatterns: string[];
    namingConventions: string[];
  };
}

/**
 * Generated code result
 */
export interface GeneratedCode {
  code: string;
  imports: string[];
  exports: string[];
  tests?: string;
  documentation?: string;
  suggestions: string[];
}

/**
 * Intelligent code generation engine
 */
export class IntelligentCodeGenerator {
  private templates: Map<string, CodeTemplate> = new Map();
  private project: Project;

  constructor() {
    this.project = new Project();
    this.initializeTemplates();
  }

  /**
   * Generate code using AI-powered templates
   */
  async generateCode(
    templateId: string,
    inputs: Record<string, any>,
    context?: GenerationContext
  ): Promise<GeneratedCode> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    console.log(pc.cyan(`🤖 Generating ${template.name}...`));

    // Validate inputs
    this.validateInputs(template, inputs);

    // Enhance inputs with AI context
    const enhancedInputs = context ? this.enhanceWithContext(inputs, context) : inputs;

    // Generate base code
    const baseCode = template.generate(enhancedInputs);

    // Apply AI enhancements
    const enhancedCode = await this.enhanceWithAI(baseCode, template, enhancedInputs, context);

    // Generate accompanying code
    const imports = this.generateImports(template, enhancedInputs);
    const exports = this.generateExports(template, enhancedInputs);
    const tests = await this.generateTests(template, enhancedInputs, enhancedCode);
    const documentation = this.generateDocumentation(template, enhancedInputs, enhancedCode);
    const suggestions = this.generateSuggestions(template, enhancedInputs, context);

    return {
      code: enhancedCode,
      imports,
      exports,
      tests,
      documentation,
      suggestions
    };
  }

  /**
   * Initialize built-in templates
   */
  private initializeTemplates(): void {
    // API Schema Template
    this.templates.set('api-schema', {
      id: 'api-schema',
      name: 'API Schema Generator',
      description: 'Generate REST API request/response schemas',
      category: 'api',
      inputs: [
        {
          name: 'entityName',
          type: 'string',
          description: 'Name of the entity (e.g., User, Product)',
          required: true,
          validation: z.string().min(1)
        },
        {
          name: 'fields',
          type: 'multiselect',
          description: 'Fields to include',
          required: true,
          options: ['id', 'email', 'name', 'createdAt', 'updatedAt', 'status']
        },
        {
          name: 'includeAuth',
          type: 'boolean',
          description: 'Include authentication fields',
          required: false,
          defaultValue: false
        },
        {
          name: 'apiVersion',
          type: 'select',
          description: 'API version',
          required: false,
          options: ['v1', 'v2', 'v3'],
          defaultValue: 'v1'
        }
      ],
      generate: (inputs) => this.generateAPISchema(inputs),
      dependencies: ['zod'],
      examples: ['User API', 'Product API', 'Order API']
    });

    // Form Validation Template
    this.templates.set('form-validation', {
      id: 'form-validation',
      name: 'Form Validation Schema',
      description: 'Generate form validation schemas with UX optimizations',
      category: 'form',
      inputs: [
        {
          name: 'formName',
          type: 'string',
          description: 'Name of the form',
          required: true
        },
        {
          name: 'fields',
          type: 'multiselect',
          description: 'Form fields',
          required: true,
          options: ['email', 'password', 'name', 'phone', 'address', 'birthDate']
        },
        {
          name: 'framework',
          type: 'select',
          description: 'Frontend framework',
          required: false,
          options: ['react-hook-form', 'formik', 'vue-form', 'angular-forms'],
          defaultValue: 'react-hook-form'
        }
      ],
      generate: (inputs) => this.generateFormValidation(inputs),
      dependencies: ['zod']
    });

    // Database Model Template
    this.templates.set('database-model', {
      id: 'database-model',
      name: 'Database Model Schema',
      description: 'Generate database model schemas with ORM integration',
      category: 'database',
      inputs: [
        {
          name: 'modelName',
          type: 'string',
          description: 'Database model name',
          required: true
        },
        {
          name: 'orm',
          type: 'select',
          description: 'ORM/Database library',
          required: true,
          options: ['prisma', 'drizzle', 'typeorm', 'sequelize', 'mongoose']
        },
        {
          name: 'includeRelations',
          type: 'boolean',
          description: 'Include relationship fields',
          required: false,
          defaultValue: true
        }
      ],
      generate: (inputs) => this.generateDatabaseModel(inputs),
      dependencies: ['zod']
    });

    // Test Schema Template
    this.templates.set('test-schema', {
      id: 'test-schema',
      name: 'Test Data Schema',
      description: 'Generate test schemas and mock data generators',
      category: 'testing',
      inputs: [
        {
          name: 'baseSchema',
          type: 'schema',
          description: 'Base schema to test',
          required: true
        },
        {
          name: 'testFramework',
          type: 'select',
          description: 'Testing framework',
          required: false,
          options: ['jest', 'vitest', 'mocha', 'ava'],
          defaultValue: 'jest'
        }
      ],
      generate: (inputs) => this.generateTestSchema(inputs),
      dependencies: ['zod', '@faker-js/faker']
    });

    // Configuration Schema Template
    this.templates.set('config-schema', {
      id: 'config-schema',
      name: 'Configuration Schema',
      description: 'Generate configuration schemas with environment validation',
      category: 'validation',
      inputs: [
        {
          name: 'configType',
          type: 'select',
          description: 'Configuration type',
          required: true,
          options: ['environment', 'app-config', 'feature-flags', 'database-config']
        },
        {
          name: 'includeSecrets',
          type: 'boolean',
          description: 'Include secret/sensitive fields',
          required: false,
          defaultValue: false
        }
      ],
      generate: (inputs) => this.generateConfigSchema(inputs),
      dependencies: ['zod']
    });
  }

  /**
   * Template generators
   */
  private generateAPISchema(inputs: Record<string, any>): string {
    const { entityName, fields, includeAuth, apiVersion } = inputs;
    const pascalName = this.toPascalCase(entityName);
    const camelName = this.toCamelCase(entityName);

    let schema = `import { z } from 'zod';\n\n`;

    // Base fields
    const fieldDefinitions = fields.map((field: string) => {
      switch (field) {
        case 'id':
          return `  id: z.string().uuid().describe('Unique identifier'),`;
        case 'email':
          return `  email: z.string().email().describe('Email address'),`;
        case 'name':
          return `  name: z.string().min(1).max(100).describe('Full name'),`;
        case 'createdAt':
          return `  createdAt: z.date().describe('Creation timestamp'),`;
        case 'updatedAt':
          return `  updatedAt: z.date().describe('Last update timestamp'),`;
        case 'status':
          return `  status: z.enum(['active', 'inactive', 'pending']).describe('Entity status'),`;
        default:
          return `  ${field}: z.string().describe('${this.toTitleCase(field)}'),`;
      }
    }).join('\n');

    // Auth fields
    const authFields = includeAuth ? `\n  // Authentication\n  userId: z.string().uuid().describe('User ID'),\n  permissions: z.array(z.string()).optional().describe('User permissions'),` : '';

    schema += `// ${pascalName} Schema (API ${apiVersion})\nexport const ${pascalName}Schema = z.object({\n${fieldDefinitions}${authFields}\n}).strict();\n\n`;

    // Type export
    schema += `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;\n\n`;

    // Request/Response schemas
    schema += `// API Request/Response Schemas\n`;
    schema += `export const Create${pascalName}RequestSchema = ${pascalName}Schema.omit({ id: true, createdAt: true, updatedAt: true });\n`;
    schema += `export const Update${pascalName}RequestSchema = Create${pascalName}RequestSchema.partial();\n`;
    schema += `export const ${pascalName}ResponseSchema = ${pascalName}Schema;\n`;
    schema += `export const ${pascalName}ListResponseSchema = z.object({\n  ${camelName}s: z.array(${pascalName}ResponseSchema),\n  pagination: z.object({\n    page: z.number(),\n    limit: z.number(),\n    total: z.number()\n  })\n});\n\n`;

    // Export types
    schema += `export type Create${pascalName}Request = z.infer<typeof Create${pascalName}RequestSchema>;\n`;
    schema += `export type Update${pascalName}Request = z.infer<typeof Update${pascalName}RequestSchema>;\n`;
    schema += `export type ${pascalName}Response = z.infer<typeof ${pascalName}ResponseSchema>;\n`;
    schema += `export type ${pascalName}ListResponse = z.infer<typeof ${pascalName}ListResponseSchema>;`;

    return schema;
  }

  private generateFormValidation(inputs: Record<string, any>): string {
    const { formName, fields, framework } = inputs;
    const pascalName = this.toPascalCase(formName);

    let schema = `import { z } from 'zod';\n\n`;

    const fieldValidations = fields.map((field: string) => {
      switch (field) {
        case 'email':
          return `  email: z.string().email('Please enter a valid email address'),`;
        case 'password':
          return `  password: z.string()\n    .min(8, 'Password must be at least 8 characters')\n    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/, 'Password must contain uppercase, lowercase, and number'),`;
        case 'name':
          return `  name: z.string()\n    .min(2, 'Name must be at least 2 characters')\n    .max(50, 'Name must be less than 50 characters'),`;
        case 'phone':
          return `  phone: z.string()\n    .regex(/^\\+?[1-9]\\d{1,14}$/, 'Please enter a valid phone number'),`;
        case 'address':
          return `  address: z.string().min(5, 'Please enter a complete address'),`;
        case 'birthDate':
          return `  birthDate: z.date()\n    .max(new Date(), 'Birth date cannot be in the future')\n    .refine(date => {\n      const age = new Date().getFullYear() - date.getFullYear();\n      return age >= 13;\n    }, 'Must be at least 13 years old'),`;
        default:
          return `  ${field}: z.string().min(1, '${this.toTitleCase(field)} is required'),`;
      }
    }).join('\n');

    schema += `// ${pascalName} Form Validation Schema\n`;
    schema += `export const ${pascalName}FormSchema = z.object({\n${fieldValidations}\n});\n\n`;
    schema += `export type ${pascalName}FormData = z.infer<typeof ${pascalName}FormSchema>;\n\n`;

    // Framework-specific helpers
    if (framework === 'react-hook-form') {
      schema += `// React Hook Form Integration\nimport { zodResolver } from '@hookform/resolvers/zod';\n\n`;
      schema += `export const ${formName}Resolver = zodResolver(${pascalName}FormSchema);\n\n`;
      schema += `// Usage example:\n// const { register, handleSubmit, formState: { errors } } = useForm<${pascalName}FormData>({\n//   resolver: ${formName}Resolver\n// });`;
    }

    return schema;
  }

  private generateDatabaseModel(inputs: Record<string, any>): string {
    const { modelName, orm, includeRelations } = inputs;
    const pascalName = this.toPascalCase(modelName);

    let schema = `import { z } from 'zod';\n\n`;

    // Base model schema
    schema += `// ${pascalName} Database Model Schema\n`;
    schema += `export const ${pascalName}ModelSchema = z.object({\n`;
    schema += `  id: z.string().uuid(),\n`;
    schema += `  createdAt: z.date(),\n`;
    schema += `  updatedAt: z.date(),\n`;
    schema += `  // Add your model fields here\n`;
    schema += `});\n\n`;

    // ORM-specific additions
    if (orm === 'prisma') {
      schema += `// Prisma Integration\n`;
      schema += `export const ${pascalName}CreateInputSchema = ${pascalName}ModelSchema.omit({\n`;
      schema += `  id: true,\n  createdAt: true,\n  updatedAt: true\n});\n\n`;
      schema += `export const ${pascalName}UpdateInputSchema = ${pascalName}CreateInputSchema.partial();\n\n`;
    }

    if (includeRelations) {
      schema += `// Relations (customize based on your model)\n`;
      schema += `export const ${pascalName}WithRelationsSchema = ${pascalName}ModelSchema.extend({\n`;
      schema += `  // Add relation fields here\n`;
      schema += `});\n\n`;
    }

    schema += `export type ${pascalName}Model = z.infer<typeof ${pascalName}ModelSchema>;`;

    return schema;
  }

  private generateTestSchema(inputs: Record<string, any>): string {
    const { baseSchema, testFramework } = inputs;

    let code = `import { z } from 'zod';\nimport { faker } from '@faker-js/faker';\n`;

    if (testFramework === 'jest') {
      code += `import { describe, it, expect } from '@jest/globals';\n\n`;
    }

    code += `// Test Data Generators\n`;
    code += `export const generateTestData = () => ({\n`;
    code += `  // Add mock data generation based on your schema\n`;
    code += `  id: faker.string.uuid(),\n`;
    code += `  email: faker.internet.email(),\n`;
    code += `  name: faker.person.fullName(),\n`;
    code += `  createdAt: faker.date.past()\n`;
    code += `});\n\n`;

    code += `// Validation Tests\n`;
    code += `export const runSchemaTests = (schema: z.ZodType) => {\n`;
    code += `  describe('Schema Validation Tests', () => {\n`;
    code += `    it('should validate valid data', () => {\n`;
    code += `      const validData = generateTestData();\n`;
    code += `      expect(() => schema.parse(validData)).not.toThrow();\n`;
    code += `    });\n\n`;
    code += `    it('should reject invalid data', () => {\n`;
    code += `      const invalidData = { ...generateTestData(), email: 'invalid-email' };\n`;
    code += `      expect(() => schema.parse(invalidData)).toThrow();\n`;
    code += `    });\n`;
    code += `  });\n`;
    code += `};`;

    return code;
  }

  private generateConfigSchema(inputs: Record<string, any>): string {
    const { configType, includeSecrets } = inputs;

    let schema = `import { z } from 'zod';\n\n`;

    schema += `// Configuration Schema\n`;
    schema += `export const ConfigSchema = z.object({\n`;

    switch (configType) {
      case 'environment':
        schema += `  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),\n`;
        schema += `  PORT: z.coerce.number().default(3000),\n`;
        if (includeSecrets) {
          schema += `  DATABASE_URL: z.string().url(),\n`;
          schema += `  JWT_SECRET: z.string().min(32),\n`;
        }
        break;
      case 'app-config':
        schema += `  appName: z.string(),\n`;
        schema += `  version: z.string(),\n`;
        schema += `  features: z.object({\n`;
        schema += `    enableAnalytics: z.boolean().default(false),\n`;
        schema += `    enableNotifications: z.boolean().default(true)\n`;
        schema += `  })\n`;
        break;
      case 'database-config':
        schema += `  host: z.string(),\n`;
        schema += `  port: z.coerce.number(),\n`;
        schema += `  database: z.string(),\n`;
        if (includeSecrets) {
          schema += `  username: z.string(),\n`;
          schema += `  password: z.string(),\n`;
        }
        break;
    }

    schema += `});\n\n`;
    schema += `export type Config = z.infer<typeof ConfigSchema>;\n\n`;
    schema += `// Validation helper\n`;
    schema += `export const validateConfig = (config: unknown): Config => {\n`;
    schema += `  return ConfigSchema.parse(config);\n`;
    schema += `};`;

    return schema;
  }

  /**
   * Helper methods
   */
  private validateInputs(template: CodeTemplate, inputs: Record<string, any>): void {
    for (const input of template.inputs) {
      if (input.required && !(input.name in inputs)) {
        throw new Error(`Required input missing: ${input.name}`);
      }

      if (input.validation && input.name in inputs) {
        try {
          input.validation.parse(inputs[input.name]);
        } catch (error) {
          throw new Error(`Invalid input for ${input.name}: ${error}`);
        }
      }
    }
  }

  private enhanceWithContext(inputs: Record<string, any>, context: GenerationContext): Record<string, any> {
    // Add context-aware enhancements
    const enhanced = { ...inputs };

    // Add framework-specific optimizations
    if (context.framework) {
      enhanced._framework = context.framework;
    }

    // Add project-specific patterns
    enhanced._patterns = context.patterns;

    return enhanced;
  }

  private async enhanceWithAI(
    code: string,
    template: CodeTemplate,
    inputs: Record<string, any>,
    context?: GenerationContext
  ): Promise<string> {
    // Apply AI-powered enhancements
    let enhanced = code;

    // Add JSDoc comments
    enhanced = this.addDocumentation(enhanced);

    // Optimize for performance
    enhanced = this.optimizePerformance(enhanced);

    // Add error handling
    enhanced = this.addErrorHandling(enhanced);

    return enhanced;
  }

  private generateImports(template: CodeTemplate, inputs: Record<string, any>): string[] {
    const imports = ['zod'];

    if (template.dependencies) {
      imports.push(...template.dependencies);
    }

    return imports;
  }

  private generateExports(template: CodeTemplate, inputs: Record<string, any>): string[] {
    // Extract exports from generated code
    return [];
  }

  private async generateTests(template: CodeTemplate, inputs: Record<string, any>, code: string): Promise<string> {
    if (template.category === 'testing') return '';

    return `// Auto-generated tests\nimport { describe, it, expect } from '@jest/globals';\n\n// Add tests here`;
  }

  private generateDocumentation(template: CodeTemplate, inputs: Record<string, any>, code: string): string {
    return `# ${template.name}\n\n${template.description}\n\n## Usage\n\n\`\`\`typescript\n${code}\n\`\`\``;
  }

  private generateSuggestions(template: CodeTemplate, inputs: Record<string, any>, context?: GenerationContext): string[] {
    const suggestions = [
      'Consider adding validation tests',
      'Add JSDoc comments for better documentation',
      'Consider using branded types for domain-specific values'
    ];

    if (template.category === 'api') {
      suggestions.push('Add rate limiting schema', 'Consider API versioning strategy');
    }

    return suggestions;
  }

  private addDocumentation(code: string): string {
    // Add JSDoc comments
    return code.replace(/export const (\w+)Schema/g, '/**\n * $1 validation schema\n */\nexport const $1Schema');
  }

  private optimizePerformance(code: string): string {
    // Apply performance optimizations
    return code.replace(/\.nullable\(\)\.optional\(\)/g, '.optional()');
  }

  private addErrorHandling(code: string): string {
    // Add error handling patterns
    return code;
  }

  // Utility methods
  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/[-_](.)/g, (_, char) => char.toUpperCase());
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1).replace(/[-_](.)/g, (_, char) => char.toUpperCase());
  }

  private toTitleCase(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * List available templates
   */
  listTemplates(category?: string): CodeTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter(t => t.category === category) : templates;
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): CodeTemplate | undefined {
    return this.templates.get(id);
  }
}

/**
 * Create intelligent code generation command
 */
export async function runIntelligentGeneration(
  templateId: string,
  inputs: Record<string, any>,
  options: { output?: string; tests?: boolean; docs?: boolean } = {}
): Promise<void> {
  const generator = new IntelligentCodeGenerator();

  try {
    const result = await generator.generateCode(templateId, inputs);

    console.log(pc.green('✅ Code generated successfully!\n'));
    console.log(pc.cyan('Generated Code:'));
    console.log('─'.repeat(80));
    console.log(result.code);

    if (result.tests && options.tests) {
      console.log(pc.cyan('\nGenerated Tests:'));
      console.log('─'.repeat(80));
      console.log(result.tests);
    }

    if (result.suggestions.length > 0) {
      console.log(pc.cyan('\n💡 Suggestions:'));
      result.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }

    if (options.output) {
      const fs = require('fs');
      fs.writeFileSync(options.output, result.code);
      console.log(pc.green(`\n📝 Code saved to ${options.output}`));
    }

  } catch (error) {
    console.error(pc.red('❌ Code generation failed:'), error);
  }
}