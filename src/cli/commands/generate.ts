import * as pc from 'picocolors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import fg from 'fast-glob';
import { ConfigManager } from '../../core/config';
import { SchemaGenerator } from '../../core/schema-generator';
import { DataAnalyzer } from '../../core/data-analyzer';
import { APIInspector } from '../../core/api-inspector';
import { DatabaseConnector } from '../../core/database-connector';

export interface GenerateOptions {
  config?: string;
  from?: 'json' | 'typescript' | 'openapi';
  fromJson?: string;
  fromUrl?: string;
  fromDatabase?: string;
  connection?: string;
  learn?: boolean;
  watch?: string;
  input?: string;
  output?: string;
  name?: string;
  format?: 'typescript' | 'javascript' | 'zod-only';
  strict?: boolean;
  optional?: boolean;
  merge?: boolean;
  samples?: string;
  overwrite?: boolean;
}

interface LegacySchemaGenerator {
  generateFromJson(data: unknown, options: GenerateOptions): string;
  generateFromTypeScript(filePath: string, options: GenerateOptions): string;
  generateFromOpenAPI(spec: Record<string, unknown>, options: GenerateOptions): string;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  try {
    console.log(pc.blue('🎯 zodkit generate - Creating Zod schemas...'));

    if (!options.input) {
      throw new Error('Input path is required. Use --input to specify source file or directory.');
    }

    if (!options.output) {
      throw new Error('Output path is required. Use --output to specify destination directory.');
    }

    // Security: Validate paths to prevent directory traversal attacks
    const validatePath = (path: string, name: string): void => {
      const normalizedPath = path.replace(/\\/g, '/');
      if (normalizedPath.includes('/../') || normalizedPath.includes('/..') || normalizedPath.startsWith('../')) {
        throw new Error(`Invalid ${name} path: ${path}. Path traversal not allowed.`);
      }
    };

    validatePath(options.input, 'input');
    validatePath(options.output, 'output');

    // Load configuration
    const configManager = new ConfigManager();
    await configManager.loadConfig(options.config);

    const legacyGenerator = new ZodSchemaGenerator();
    const coreGenerator = new SchemaGenerator();
    const dataAnalyzer = new DataAnalyzer();
    const apiInspector = new APIInspector();
    const dbConnector = new DatabaseConnector();
    const sourceType = options.from ?? 'json';

    console.log(pc.gray(`Source type: ${sourceType}`));
    console.log(pc.gray(`Input: ${options.input}`));
    console.log(pc.gray(`Output: ${options.output}`));

    // Ensure output directory exists
    const outputDir = resolve(options.output);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    let generatedFiles: string[] = [];

    // Handle new advanced generation modes
    if (options.fromJson || options.fromUrl || options.fromDatabase || options.learn) {
      generatedFiles = await generateFromAdvancedSources({
        coreGenerator,
        dataAnalyzer,
        apiInspector,
        dbConnector
      }, options);
    } else {
      // Fallback to legacy generation
      switch (sourceType) {
        case 'json':
          generatedFiles = await generateFromJsonFiles(legacyGenerator, options);
          break;
        case 'typescript':
          generatedFiles = await generateFromTypeScriptFiles(legacyGenerator, options);
          break;
        case 'openapi':
          generatedFiles = generateFromOpenAPISpec(legacyGenerator, options);
          break;
        default:
          throw new Error(`Unsupported source type: ${String(sourceType)}`);
      }
    }

    console.log(pc.green(`\n✅ Generated ${generatedFiles.length} schema file(s):`));
    generatedFiles.forEach(file => {
      console.log(`  ${pc.cyan(file)}`);
    });

    console.log(pc.blue('\nNext steps:'));
    console.log('  1. Review the generated schemas');
    console.log('  2. Import and use them in your application');
    console.log('  3. Run `npx zodkit check` to validate your usage');

  } catch (error) {
    console.error(pc.red('❌ Generate command failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

class ZodSchemaGenerator implements LegacySchemaGenerator {
  generateFromJson(data: unknown, options: GenerateOptions): string {
    const schemaName = 'GeneratedSchema';
    const schema = this.inferZodSchemaFromValue(data, options.strict ?? false);

    return this.formatSchemaFile(schemaName, schema);
  }

  generateFromTypeScript(filePath: string): string {
    // This would require TypeScript compiler API to extract type information
    // For now, providing a basic implementation
    const fileName = filePath.split('/').pop()?.replace(/\.(ts|tsx)$/, '') ?? 'Generated';
    const schemaName = this.pascalCase(fileName) + 'Schema';

    return this.formatSchemaFile(schemaName, 'z.unknown() // TODO: Extract from TypeScript types');
  }

  generateFromOpenAPI(spec: Record<string, unknown>, options: GenerateOptions): string {
    const schemas: string[] = [];

    const components = spec.components as Record<string, unknown> | undefined;
    if (components && typeof components === 'object') {
      const schemasObj = components.schemas as Record<string, unknown> | undefined;
      if (schemasObj && typeof schemasObj === 'object') {
        for (const [name, schema] of Object.entries(schemasObj)) {
          const zodSchema = this.convertOpenAPISchemaToZod(schema as Record<string, unknown>, options.strict ?? false);
          schemas.push(`export const ${this.pascalCase(name)}Schema = ${zodSchema};`);
        }
      }
    }

    return `import { z } from 'zod';

${schemas.join('\n\n')}
`;
  }

  private inferZodSchemaFromValue(value: unknown, strict: boolean): string {
    if (value === null) {
      return 'z.null()';
    }

    if (value === undefined) {
      return 'z.undefined()';
    }

    switch (typeof value) {
      case 'string':
        return this.inferStringSchema(value, strict);
      case 'number':
        return this.inferNumberSchema(value, strict);
      case 'boolean':
        return 'z.boolean()';
      case 'object':
        if (Array.isArray(value)) {
          return this.inferArraySchema(value, strict);
        }
        return this.inferObjectSchema(value as Record<string, unknown>, strict);
      default:
        return 'z.unknown()';
    }
  }


  private inferStringSchema(value: string, strict: boolean): string {
    if (!strict) {
      return 'z.string()';
    }

    // Email pattern
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'z.string().email()';
    }

    // URL pattern
    if (/^https?:\/\//.test(value)) {
      return 'z.string().url()';
    }

    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return 'z.string().uuid()';
    }

    // ISO date pattern
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return 'z.string().datetime()';
    }

    // Date pattern YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return 'z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)';
    }

    // Minimum length
    if (value.length > 0) {
      return `z.string().min(1)`;
    }

    return 'z.string()';
  }

  private inferNumberSchema(value: number, strict: boolean): string {
    if (Number.isInteger(value)) {
      if (strict) {
        if (value >= 0) {
          return 'z.number().int().min(0)';
        }
        return 'z.number().int()';
      }
      return 'z.number().int()';
    }

    if (strict && value >= 0) {
      return 'z.number().min(0)';
    }

    return 'z.number()';
  }

  private inferArraySchema(value: unknown[], strict: boolean): string {
    if (value.length === 0) {
      return 'z.array(z.unknown())';
    }

    // Infer schema from first element (could be improved to analyze all elements)
    const elementSchema = this.inferZodSchemaFromValue(value[0], strict);

    if (strict && value.length > 0) {
      return `z.array(${elementSchema}).min(1)`;
    }

    return `z.array(${elementSchema})`;
  }

  private inferObjectSchema(value: Record<string, unknown>, strict: boolean): string {
    const properties: string[] = [];

    for (const [key, val] of Object.entries(value)) {
      const valueSchema = this.inferZodSchemaFromValue(val, strict);
      properties.push(`  ${key}: ${valueSchema}`);
    }

    if (properties.length === 0) {
      return 'z.object({})';
    }

    return `z.object({\n${properties.join(',\n')}\n})`;
  }

  private convertOpenAPISchemaToZod(schema: Record<string, unknown>, strict: boolean): string {
    if (schema.$ref && typeof schema.$ref === 'string') {
      const refName = schema.$ref.split('/').pop();
      return `${this.pascalCase(String(refName))}Schema`;
    }

    switch (schema.type) {
      case 'string':
        return this.convertOpenAPIStringToZod(schema);
      case 'number':
      case 'integer':
        return this.convertOpenAPINumberToZod(schema);
      case 'boolean':
        return 'z.boolean()';
      case 'array':
        const itemSchema = this.convertOpenAPISchemaToZod(schema.items as Record<string, unknown>, strict);
        return `z.array(${itemSchema})`;
      case 'object':
        return this.convertOpenAPIObjectToZod(schema, strict);
      default:
        return 'z.unknown()';
    }
  }

  private convertOpenAPIStringToZod(schema: Record<string, unknown>): string {
    let zodSchema = 'z.string()';

    if (schema.format) {
      switch (schema.format) {
        case 'email':
          zodSchema += '.email()';
          break;
        case 'uri':
        case 'url':
          zodSchema += '.url()';
          break;
        case 'uuid':
          zodSchema += '.uuid()';
          break;
        case 'date-time':
          zodSchema += '.datetime()';
          break;
        case 'date':
          zodSchema += '.regex(/^\\d{4}-\\d{2}-\\d{2}$/)';
          break;
      }
    }

    if (schema.pattern && typeof schema.pattern === 'string') {
      zodSchema += `.regex(/${schema.pattern}/)`;
    }

    if (typeof schema.minLength === 'number') {
      zodSchema += `.min(${schema.minLength})`;
    }

    if (typeof schema.maxLength === 'number') {
      zodSchema += `.max(${schema.maxLength})`;
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      const enumValues = schema.enum.map((v: unknown) => `'${String(v)}'`).join(', ');
      return `z.enum([${enumValues}])`;
    }

    return zodSchema;
  }

  private convertOpenAPINumberToZod(schema: Record<string, unknown>): string {
    let zodSchema = 'z.number()';

    if (schema.type === 'integer') {
      zodSchema += '.int()';
    }

    if (typeof schema.minimum === 'number') {
      zodSchema += `.min(${schema.minimum})`;
    }

    if (typeof schema.maximum === 'number') {
      zodSchema += `.max(${schema.maximum})`;
    }

    return zodSchema;
  }

  private convertOpenAPIObjectToZod(schema: Record<string, unknown>, strict: boolean): string {
    if (!schema.properties) {
      return 'z.object({})';
    }

    const properties: string[] = [];
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propZodSchema = this.convertOpenAPISchemaToZod(propSchema as Record<string, unknown>, strict);
      const isRequired = required.has(key);

      if (isRequired) {
        properties.push(`  ${key}: ${propZodSchema}`);
      } else {
        properties.push(`  ${key}: ${propZodSchema}.optional()`);
      }
    }

    return `z.object({\n${properties.join(',\n')}\n})`;
  }

  private formatSchemaFile(schemaName: string, schema: string): string {
    return `import { z } from 'zod';

export const ${schemaName} = ${schema};

export type ${schemaName.replace('Schema', '')} = z.infer<typeof ${schemaName}>;
`;
  }

  private pascalCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char: string | undefined) => char ? char.toUpperCase() : '')
      .replace(/^(.)/, (char: string) => char.toUpperCase());
  }
}

interface GeneratorServices {
  coreGenerator: SchemaGenerator;
  dataAnalyzer: DataAnalyzer;
  apiInspector: APIInspector;
  dbConnector: DatabaseConnector;
}

async function generateFromAdvancedSources(
  services: GeneratorServices,
  options: GenerateOptions
): Promise<string[]> {
  const outputDir = resolve(options.output!);
  const generatedFiles: string[] = [];

  // Generate from JSON with advanced analysis
  if (options.fromJson) {
    console.log(pc.blue('📊 Analyzing JSON data with pattern recognition...'));

    const jsonData = JSON.parse(readFileSync(resolve(options.fromJson), 'utf-8'));
    const analysis = await services.dataAnalyzer.analyzeData(jsonData, {
      detectPatterns: true,
      inferTypes: true,
      findOptionalFields: true,
      detectArrayPatterns: true,
      analyzeComplexity: true,
      context: options.name || 'JsonData'
    });

    const genOptions: any = {
      name: options.name || 'JsonDataSchema',
      includeConstraints: true,
      includeRelationships: false,
      nullableByDefault: false,
      metadata: { source: 'json', file: options.fromJson }
    };
    if (options.strict !== undefined) genOptions.strict = options.strict;
    if (options.optional !== undefined) genOptions.makeOptional = options.optional;
    if (options.merge !== undefined) genOptions.mergeSimilarObjects = options.merge;

    const schema = await services.coreGenerator.generateFromAnalysis(analysis, genOptions);

    const outputFile = join(outputDir, `${options.name || 'json-data'}.schema.ts`);
    const finalCode = `${schema.zodCode}\n\n${schema.typeCode}`;

    if (!options.overwrite && existsSync(outputFile)) {
      console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
    } else {
      writeFileSync(outputFile, finalCode);
      generatedFiles.push(outputFile);

      console.log(pc.green(`✨ Generated schema with ${schema.confidence * 100}% confidence`));
      console.log(pc.gray(`   Complexity: ${schema.complexity}, Patterns: ${schema.patterns.join(', ')}`));

      if (schema.suggestions.length > 0) {
        console.log(pc.cyan('💡 Suggestions:'));
        schema.suggestions.forEach(suggestion => {
          console.log(`   ${pc.cyan('•')} ${suggestion}`);
        });
      }
    }
  }

  // Generate from API endpoints
  if (options.fromUrl) {
    console.log(pc.blue('🌐 Inspecting API endpoints...'));

    const responses = await services.apiInspector.inspectAPI(options.fromUrl, {
      methods: ['GET', 'POST'],
      sampleCount: parseInt(options.samples || '3'),
      timeout: 10000,
      followRedirects: true
    });

    for (const [index, response] of responses.entries()) {
      const analysis = await services.dataAnalyzer.analyzeData(response.data, {
        detectPatterns: true,
        inferTypes: true,
        context: `API_${response.method}_${response.endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`
      });

      const apiGenOptions: any = {
        name: `${options.name || 'ApiResponse'}${index > 0 ? index + 1 : ''}Schema`,
        includeConstraints: true,
        metadata: {
          source: 'api',
          endpoint: response.endpoint,
          method: response.method,
          statusCode: response.statusCode
        }
      };
      if (options.strict !== undefined) apiGenOptions.strict = options.strict;

      const schema = await services.coreGenerator.generateFromAnalysis(analysis, apiGenOptions);

      const outputFile = join(outputDir, `${options.name || 'api'}-${response.method.toLowerCase()}-${index}.schema.ts`);
      const finalCode = `${schema.zodCode}\n\n${schema.typeCode}`;

      if (!options.overwrite && existsSync(outputFile)) {
        console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
      } else {
        writeFileSync(outputFile, finalCode);
        generatedFiles.push(outputFile);
      }
    }
  }

  // Generate from database
  if (options.fromDatabase && options.connection) {
    console.log(pc.blue('🗄️ Analyzing database schema...'));

    if (options.fromDatabase === 'all') {
      const tableSchemas = await services.dbConnector.analyzeDatabase(options.connection, {
        sampleData: true,
        constraints: true,
        relationships: true,
        indexes: true
      });

      for (const tableSchema of tableSchemas) {
        const dbGenOptions: any = {
          name: `${tableSchema.tableName.charAt(0).toUpperCase() + tableSchema.tableName.slice(1)}Schema`,
          includeConstraints: true,
          includeRelationships: true,
          nullableByDefault: false,
          metadata: { source: 'database', table: tableSchema.tableName }
        };
        if (options.strict !== undefined) dbGenOptions.strict = options.strict;
        const schema = await services.coreGenerator.generateFromDatabaseSchema(tableSchema, dbGenOptions);

        const outputFile = join(outputDir, `${tableSchema.tableName}.schema.ts`);
        const finalCode = `${schema.zodCode}\n\n${schema.typeCode}`;

        if (!options.overwrite && existsSync(outputFile)) {
          console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
        } else {
          writeFileSync(outputFile, finalCode);
          generatedFiles.push(outputFile);
        }
      }
    } else {
      const tableSchema = await services.dbConnector.analyzeTable(options.connection, options.fromDatabase, {
        sampleData: true,
        constraints: true,
        relationships: true
      });

      const dbGenOptions2: any = {
        name: `${tableSchema.tableName.charAt(0).toUpperCase() + tableSchema.tableName.slice(1)}Schema`,
        includeConstraints: true,
        includeRelationships: true,
        metadata: { source: 'database', table: tableSchema.tableName }
      };
      if (options.strict !== undefined) dbGenOptions2.strict = options.strict;
      const schema = await services.coreGenerator.generateFromDatabaseSchema(tableSchema, dbGenOptions2);

      const outputFile = join(outputDir, `${tableSchema.tableName}.schema.ts`);
      const finalCode = `${schema.zodCode}\n\n${schema.typeCode}`;

      if (!options.overwrite && existsSync(outputFile)) {
        console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
      } else {
        writeFileSync(outputFile, finalCode);
        generatedFiles.push(outputFile);
      }
    }
  }

  // Learn from existing data patterns
  if (options.learn) {
    console.log(pc.blue('🧠 Learning patterns from existing data...'));

    const learningPath = options.input!;
    const extractedPatterns = await services.dataAnalyzer.learnFromPath(learningPath, {
      recursive: true,
      fileTypes: ['.json', '.log', '.txt'],
      extractJSON: true,
      patternRecognition: true,
      temporalAnalysis: false
    });

    for (const [_index, pattern] of extractedPatterns.entries()) {
      const generationOptions: any = {
        name: `${pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1)}Schema`,
        confidence: pattern.confidence,
        occurrences: pattern.occurrences,
        metadata: {
          source: 'pattern-extraction',
          pattern: pattern.name
        }
      };
      if (options.strict !== undefined) {
        generationOptions.strict = options.strict;
      }

      const schema = await services.coreGenerator.generateFromPattern(pattern, generationOptions);

      const outputFile = join(outputDir, `${pattern.name}.schema.ts`);
      const finalCode = `${schema.zodCode}\n\n${schema.typeCode}`;

      if (!options.overwrite && existsSync(outputFile)) {
        console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
      } else {
        writeFileSync(outputFile, finalCode);
        generatedFiles.push(outputFile);

        console.log(pc.green(`🎯 Learned pattern "${pattern.name}" (${pattern.occurrences} occurrences, ${Math.round(pattern.confidence * 100)}% confidence)`));
      }
    }
  }

  return generatedFiles;
}

async function generateFromJsonFiles(generator: ZodSchemaGenerator, options: GenerateOptions): Promise<string[]> {
  const inputPath = resolve(options.input!);
  const outputDir = resolve(options.output!);
  const generatedFiles: string[] = [];

  if (inputPath.endsWith('.json')) {
    // Single JSON file
    const data = JSON.parse(readFileSync(inputPath, 'utf-8')) as unknown;
    const fileName = inputPath.split('/').pop()?.replace('.json', '') ?? 'generated';

    const schema = generator.generateFromJson(data, options);
    const outputFile = join(outputDir, `${fileName}.schema.ts`);

    if (!options.overwrite && existsSync(outputFile)) {
      console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
    } else {
      writeFileSync(outputFile, schema);
      generatedFiles.push(outputFile);
    }
  } else {
    // Directory of JSON files
    const jsonFiles = await fg('**/*.json', {
      cwd: inputPath,
      absolute: true,
    });

    for (const jsonFile of jsonFiles) {
      const data = JSON.parse(readFileSync(jsonFile, 'utf-8')) as unknown;
      const fileName = jsonFile.split('/').pop()?.replace('.json', '') ?? 'generated';

      const schema = generator.generateFromJson(data, options);
      const outputFile = join(outputDir, `${fileName}.schema.ts`);

      if (!options.overwrite && existsSync(outputFile)) {
        console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
      } else {
        writeFileSync(outputFile, schema);
        generatedFiles.push(outputFile);
      }
    }
  }

  return generatedFiles;
}

async function generateFromTypeScriptFiles(generator: ZodSchemaGenerator, options: GenerateOptions): Promise<string[]> {
  const inputPath = resolve(options.input!);
  const outputDir = resolve(options.output!);
  const generatedFiles: string[] = [];

  // This is a simplified implementation
  // A full implementation would use TypeScript compiler API
  const tsFiles = await fg('**/*.{ts,tsx}', {
    cwd: inputPath,
    absolute: true,
    ignore: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
  });

  for (const tsFile of tsFiles) {
    const fileName = tsFile.split('/').pop()?.replace(/\.(ts|tsx)$/, '') ?? 'generated';
    const schema = generator.generateFromTypeScript(tsFile);
    const outputFile = join(outputDir, `${fileName}.schema.ts`);

    if (!options.overwrite && existsSync(outputFile)) {
      console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
    } else {
      writeFileSync(outputFile, schema);
      generatedFiles.push(outputFile);
    }
  }

  return generatedFiles;
}

function generateFromOpenAPISpec(generator: ZodSchemaGenerator, options: GenerateOptions): string[] {
  const inputPath = resolve(options.input!);
  const outputDir = resolve(options.output!);

  const spec = JSON.parse(readFileSync(inputPath, 'utf-8')) as Record<string, unknown>;
  const schema = generator.generateFromOpenAPI(spec, options);
  const outputFile = join(outputDir, 'openapi.schema.ts');

  if (!options.overwrite && existsSync(outputFile)) {
    console.log(pc.yellow(`⚠️  Skipping ${outputFile} (already exists)`));
    return [];
  }

  writeFileSync(outputFile, schema);
  return [outputFile];
}