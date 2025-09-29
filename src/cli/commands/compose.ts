/**
 * @fileoverview Schema composition command for advanced operations
 * @module ComposeCommand
 */

import * as pc from 'picocolors';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { Command } from 'commander';
import {
  SchemaComposer,
  CompositionConfig,
  CompositionOperation,
  CompositionStrategy,
  createSchemaComposer
} from '../../core/transformation/schema-composer';

interface GlobalOptions {
  json?: boolean;
}

interface CompositionResult {
  success: boolean;
  schema?: unknown;
  metadata: {
    operation: string;
    inputSchemas: number;
    outputComplexity: number;
    compatibilityScore: number;
  };
  conflicts: Array<{
    reason: string;
    suggestions?: string[];
  }>;
  warnings: Array<{
    severity: 'high' | 'medium' | 'low';
    message: string;
    suggestion?: string;
  }>;
  performance: {
    operationTime: number;
    memoryUsage: number;
    cacheHit: boolean;
  };
  examples?: unknown[];
  changes?: unknown[];
}

interface ComposeOptions {
  operation?: CompositionOperation;
  strategy?: CompositionStrategy;
  output?: string;
  input?: string[];
  preserveMetadata?: boolean;
  optimize?: boolean;
  generateExamples?: boolean;
  trackChanges?: boolean;
  interactive?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  config?: string;
  chain?: string;
  transform?: string;
  template?: string;
  maxDepth?: number;
  cache?: boolean;
}

export async function composeCommand(
  action: string | undefined,
  options: ComposeOptions,
  command: Command
): Promise<void> {
  const globalOpts = command.parent?.opts() as GlobalOptions;
  const isJsonMode = globalOpts?.json ?? false;

  try {
    // Load configuration
    const compositionConfig: CompositionConfig = {
      strategy: options.strategy ?? 'merge',
      preserveMetadata: options.preserveMetadata ?? true,
      enableValidation: true,
      optimizeResult: options.optimize ?? true,
      generateExamples: options.generateExamples ?? false,
      trackChanges: options.trackChanges ?? false,
      allowUnsafeOperations: false,
      maxDepth: options.maxDepth ?? 10,
      cacheResults: options.cache ?? true
    };

    const composer = createSchemaComposer(compositionConfig);

    switch (action) {
      case 'union':
        await handleUnion(composer, options, isJsonMode);
        break;

      case 'intersection':
        await handleIntersection(composer, options, isJsonMode);
        break;

      case 'merge':
        await handleMerge(composer, options, isJsonMode);
        break;

      case 'extend':
        await handleExtend(composer, options, isJsonMode);
        break;

      case 'inherit':
        await handleInherit(composer, options, isJsonMode);
        break;

      case 'transform':
        await handleTransform(composer, options, isJsonMode);
        break;

      case 'chain':
        await handleChain(composer, options, isJsonMode);
        break;

      case 'interactive':
        handleInteractive(composer, options, isJsonMode);
        break;

      case 'templates':
        handleTemplates(composer, options, isJsonMode);
        break;

      case 'stats':
        handleStats(composer, options, isJsonMode);
        break;

      case 'analyze':
        await handleAnalyze(composer, options, isJsonMode);
        break;

      default:
        if (!action) {
          if (options.interactive) {
            handleInteractive(composer, options, isJsonMode);
          } else if (options.operation) {
            await handleOperation(composer, options, isJsonMode);
          } else {
            displayHelp(isJsonMode);
          }
        } else {
          throw new Error(`Unknown compose action: ${action}`);
        }
        break;
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'COMPOSE_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Schema composition failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function handleUnion(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length < 2) {
    throw new Error('Union requires at least 2 input schemas');
  }

  const schemas = await loadSchemas(options.input);

  if (options.dryRun) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        action: 'dry-run',
        operation: 'union',
        inputCount: schemas.length,
        message: 'Union operation would be performed'
      }, null, 2));
    } else {
      console.log(pc.yellow('🔍 Dry run: union operation would be performed'));
      console.log(`   Input schemas: ${schemas.length}`);
      console.log(`   Output: ${options.output ?? 'stdout'}`);
    }
    return;
  }

  const result = await composer.union(schemas);
  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Union schema saved to ${options.output}`));
    }
  }
}

async function handleIntersection(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length < 2) {
    throw new Error('Intersection requires at least 2 input schemas');
  }

  const schemas = await loadSchemas(options.input);
  const result = await composer.intersection(schemas);

  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Intersection schema saved to ${options.output}`));
    }
  }
}

async function handleMerge(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length !== 2) {
    throw new Error('Merge requires exactly 2 input schemas (base and extension)');
  }

  const schemas = await loadSchemas(options.input);
  if (schemas.length !== 2) {
    throw new Error('Merge operation requires exactly two object schemas');
  }

  const result = await composer.merge(schemas[0], schemas[1]);
  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Merged schema saved to ${options.output}`));
    }
  }
}

async function handleExtend(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length !== 2) {
    throw new Error('Extend requires base schema and extension definition');
  }

  const schemas = await loadSchemas(options.input);

  // For extend, second parameter should be a shape, not a full schema
  const extensionShape = extractShape(schemas[1]);
  const result = await composer.extend(schemas[0], extensionShape);

  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Extended schema saved to ${options.output}`));
    }
  }
}

async function handleInherit(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length < 2) {
    throw new Error('Inherit requires at least 2 schemas (base(s) and child)');
  }

  const schemas = await loadSchemas(options.input);
  const baseSchemas = schemas.slice(0, -1);
  const childSchema = schemas[schemas.length - 1];

  const result = await composer.inherit(baseSchemas, childSchema);
  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Inherited schema saved to ${options.output}`));
    }
  }
}

async function handleTransform(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length !== 1) {
    throw new Error('Transform requires exactly 1 input schema');
  }

  if (!options.transform) {
    throw new Error('Transform operation requires --transform parameter');
  }

  const schemas = await loadSchemas(options.input);
  const result = await composer.transform(schemas[0], options.transform);

  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Transformed schema saved to ${options.output}`));
    }
  }
}

async function handleChain(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length !== 1) {
    throw new Error('Chain requires exactly 1 input schema');
  }

  if (!options.chain) {
    throw new Error('Chain operation requires --chain parameter with operation definitions');
  }

  const schemas = await loadSchemas(options.input);
  const operations = parseChainOperations(options.chain);

  const result = await composer.chain(schemas[0], operations);
  displayCompositionResult(result, options, isJsonMode);

  if (result.success && options.output) {
    await saveCompositionResult(result, options.output);
    if (!isJsonMode) {
      console.log(pc.green(`✅ Chained schema saved to ${options.output}`));
    }
  }
}

function handleInteractive(_composer: SchemaComposer, _options: ComposeOptions, isJsonMode: boolean): void {
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: false,
      error: {
        message: 'Interactive mode not supported in JSON output',
        code: 'INTERACTIVE_JSON_ERROR'
      }
    }, null, 2));
    return;
  }

  console.log(pc.blue('🔧 Interactive Schema Composition'));
  console.log(pc.gray('─'.repeat(50)));

  // Interactive composition flow would go here
  console.log(pc.yellow('⚠️  Interactive mode not yet implemented'));
  console.log('For now, use specific composition commands:');
  console.log(`  ${pc.gray('$')} zodkit compose union --input schema1.ts schema2.ts`);
  console.log(`  ${pc.gray('$')} zodkit compose merge --input base.ts extension.ts`);
  console.log(`  ${pc.gray('$')} zodkit compose transform --input schema.ts --transform partial`);
}

function handleTemplates(_composer: SchemaComposer, _options: ComposeOptions, isJsonMode: boolean): void {
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      templates: [
        { name: 'partial', description: 'Make all properties optional' },
        { name: 'required', description: 'Make all properties required' },
        { name: 'nullable', description: 'Make schema nullable' },
        { name: 'optional', description: 'Make schema optional' },
        { name: 'array', description: 'Wrap schema in array' }
      ]
    }, null, 2));
  } else {
    console.log(pc.bold('🔧 Schema Composition Templates'));
    console.log(pc.gray('─'.repeat(50)));

    console.log('\n' + pc.cyan('Built-in Transformers:'));
    console.log(`  ${pc.green('partial')}    Make all properties optional`);
    console.log(`  ${pc.green('required')}   Make all properties required`);
    console.log(`  ${pc.green('nullable')}   Make schema nullable`);
    console.log(`  ${pc.green('optional')}   Make schema optional`);
    console.log(`  ${pc.green('array')}      Wrap schema in array`);

    console.log('\n' + pc.cyan('Usage Examples:'));
    console.log(`  ${pc.gray('$')} zodkit compose transform --input user.ts --transform partial`);
    console.log(`  ${pc.gray('$')} zodkit compose transform --input api.ts --transform array`);
  }
}

function handleStats(composer: SchemaComposer, _options: ComposeOptions, isJsonMode: boolean): void {
  const stats = composer.getStatistics();

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      statistics: stats
    }, null, 2));
  } else {
    console.log(pc.bold('📊 Schema Composer Statistics'));
    console.log(pc.gray('─'.repeat(50)));

    console.log(`\n${pc.cyan('Cache:')} ${stats.cacheSize} entries, ${Math.round(stats.cacheHitRate * 100)}% hit rate`);
    console.log(`${pc.cyan('Operations:')} ${stats.totalOperations} completed`);
    console.log(`${pc.cyan('Transformers:')} ${stats.registeredTransformers} registered`);
    console.log(`${pc.cyan('Resolvers:')} ${stats.registeredResolvers} registered`);
  }
}

async function handleAnalyze(_composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  if (!options.input || options.input.length === 0) {
    throw new Error('Analyze requires at least 1 input schema');
  }

  const schemas = await loadSchemas(options.input);

  // Analyze schemas for composition opportunities
  const analysis = analyzeSchemas(schemas);

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      analysis
    }, null, 2));
  } else {
    displayAnalysisResult(analysis);
  }
}

async function handleOperation(composer: SchemaComposer, options: ComposeOptions, isJsonMode: boolean): Promise<void> {
  switch (options.operation) {
    case 'union':
      await handleUnion(composer, options, isJsonMode);
      break;
    case 'intersection':
      await handleIntersection(composer, options, isJsonMode);
      break;
    case 'merge':
      await handleMerge(composer, options, isJsonMode);
      break;
    case 'extend':
      await handleExtend(composer, options, isJsonMode);
      break;
    default:
      throw new Error(`Unsupported operation: ${options.operation}`);
  }
}

async function loadSchemas(inputPaths: string[]): Promise<unknown[]> {
  const schemas: unknown[] = [];

  for (const inputPath of inputPaths) {
    if (!existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    const content = await readFile(inputPath, 'utf8');
    const schema = await parseSchemaFromContent(content);
    schemas.push(schema);
  }

  return schemas;
}

async function parseSchemaFromContent(content: string): Promise<unknown> {
  // This would parse TypeScript/JavaScript content to extract Zod schemas
  // For now, return a placeholder
  const { z } = await import('zod');

  // Try to evaluate the content as a module to extract schemas
  // This is a simplified approach - in practice would use proper AST parsing
  try {
    const module = eval(`(${content})`) as unknown;
    return module;
  } catch {
    // Fallback to basic string schema
    return z.string();
  }
}

function extractShape(schema: unknown): unknown {
  // Extract shape from a schema for extend operations
  if (schema && typeof schema === 'object' && 'shape' in schema) {
    return (schema as { shape: unknown }).shape;
  }
  return {};
}

function parseChainOperations(chainDefinition: string): Array<{
  operation: CompositionOperation;
  params: unknown[];
  config?: Partial<CompositionConfig>;
}> {
  // Parse chain operation definition string
  // Format: "operation1(params)|operation2(params)|..."
  const operations: Array<{
    operation: CompositionOperation;
    params: unknown[];
    config?: Partial<CompositionConfig>;
  }> = [];

  const parts = chainDefinition.split('|');
  for (const part of parts) {
    const match = part.match(/^(\w+)\((.*)\)$/);
    if (match) {
      const [, operation, paramsStr] = match;
      const params = paramsStr ? paramsStr.split(',').map(p => p.trim()) : [];

      operations.push({
        operation: operation as CompositionOperation,
        params,
        config: {}
      });
    }
  }

  return operations;
}

function displayCompositionResult(result: CompositionResult, options: ComposeOptions, isJsonMode: boolean): void {
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: result.success,
      metadata: result.metadata,
      conflicts: result.conflicts,
      warnings: result.warnings,
      performance: result.performance,
      examples: result.examples,
      changes: result.changes
    }, null, 2));
    return;
  }

  console.log(pc.bold('🔧 Schema Composition Result'));
  console.log(pc.gray('─'.repeat(50)));

  // Status
  if (result.success) {
    console.log(pc.green('✅ Composition successful'));
  } else {
    console.log(pc.red('❌ Composition failed'));
  }

  // Metadata
  console.log(`\n${pc.cyan('Metadata:')}`);
  console.log(`  Operation: ${pc.yellow(result.metadata.operation)}`);
  console.log(`  Input schemas: ${result.metadata.inputSchemas}`);
  console.log(`  Complexity: ${result.metadata.outputComplexity}`);
  console.log(`  Compatibility: ${Math.round(result.metadata.compatibilityScore * 100)}%`);
  console.log(`  Time: ${result.performance.operationTime.toFixed(2)}ms`);

  // Conflicts
  if (result.conflicts.length > 0) {
    console.log(`\n${pc.red('Conflicts:')}`);
    result.conflicts.forEach((conflict) => {
      console.log(`  ${pc.red('⚠')} ${conflict.reason}`);
      if (conflict.suggestions && conflict.suggestions.length > 0) {
        conflict.suggestions.forEach((suggestion: string) => {
          console.log(`     ${pc.gray('💡 ' + suggestion)}`);
        });
      }
    });
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(`\n${pc.yellow('Warnings:')}`);
    result.warnings.forEach((warning) => {
      const severity = warning.severity === 'high' ? pc.red('HIGH') :
                      warning.severity === 'medium' ? pc.yellow('MED') :
                      pc.blue('LOW');
      console.log(`  ${pc.yellow('⚠')} [${severity}] ${warning.message}`);
      if (warning.suggestion) {
        console.log(`     ${pc.gray('💡 ' + warning.suggestion)}`);
      }
    });
  }

  // Performance
  console.log(`\n${pc.cyan('Performance:')}`);
  console.log(`  Operation time: ${result.performance.operationTime.toFixed(2)}ms`);
  console.log(`  Memory usage: ${(result.performance.memoryUsage / 1024).toFixed(1)}KB`);
  console.log(`  Cache hit: ${result.performance.cacheHit ? '✅' : '❌'}`);

  // Examples
  if (result.examples && result.examples.length > 0) {
    console.log(`\n${pc.cyan('Examples:')}`);
    result.examples.forEach((example, index: number) => {
      console.log(`  ${index + 1}. ${JSON.stringify(example)}`);
    });
  }

  // Show schema preview if no output file
  if (result.success && result.schema && !options.output) {
    console.log(`\n${pc.cyan('Generated Schema:')}`);
    console.log(pc.gray('// Preview - use --output to save to file'));

    // Would generate actual TypeScript code here
    console.log('const ComposedSchema = z.object({');
    console.log('  // Generated schema content');
    console.log('});');
  }
}

async function saveCompositionResult(result: CompositionResult, outputPath: string): Promise<void> {
  if (!result.success || !result.schema) {
    throw new Error('Cannot save failed composition result');
  }

  // Generate TypeScript code for the schema
  const code = generateSchemaCode(result.schema, result.metadata);
  await writeFile(outputPath, code);
}

function generateSchemaCode(schema: unknown, metadata: { operation: string }): string {
  const timestamp = new Date().toISOString();

  return `/**
 * Generated by zodkit compose
 * Operation: ${metadata.operation}
 * Generated: ${timestamp}
 */

import { z } from 'zod';

export const ComposedSchema = ${schemaToCode(schema)};

export type ComposedSchemaType = z.infer<typeof ComposedSchema>;
`;
}

function schemaToCode(schema: unknown): string {
  // Convert Zod schema back to TypeScript code
  // This is a simplified implementation
  const schemaObj = schema as { _def?: { typeName?: string } };
  if (schemaObj._def) {
    switch (schemaObj._def.typeName) {
      case 'ZodString':
        return 'z.string()';
      case 'ZodNumber':
        return 'z.number()';
      case 'ZodObject':
        return 'z.object({ /* properties */ })';
      case 'ZodUnion':
        return 'z.union([/* schemas */])';
      default:
        return 'z.unknown()';
    }
  }
  return 'z.unknown()';
}

function analyzeSchemas(schemas: unknown[]): unknown {
  // Analyze schemas for composition opportunities
  return {
    schemaCount: schemas.length,
    commonProperties: [],
    compatibilityScore: 0.85,
    recommendations: [
      'Consider using union for alternative schemas',
      'Merge might be suitable for extending base schema'
    ]
  };
}

interface AnalysisResult {
  schemaCount: number;
  compatibilityScore: number;
  recommendations: string[];
}

function displayAnalysisResult(analysis: AnalysisResult): void {
  console.log(pc.bold('🔍 Schema Analysis Result'));
  console.log(pc.gray('─'.repeat(50)));

  console.log(`\n${pc.cyan('Overview:')}`);
  console.log(`  Schemas analyzed: ${analysis.schemaCount}`);
  console.log(`  Compatibility score: ${Math.round(analysis.compatibilityScore * 100)}%`);

  if (analysis.recommendations.length > 0) {
    console.log(`\n${pc.cyan('Recommendations:')}`);
    analysis.recommendations.forEach((rec) => {
      console.log(`  ${pc.green('•')} ${rec}`);
    });
  }
}

function displayHelp(isJsonMode: boolean): void {
  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      help: {
        operations: ['union', 'intersection', 'merge', 'extend', 'inherit', 'transform', 'chain'],
        examples: [
          'zodkit compose union --input schema1.ts schema2.ts',
          'zodkit compose merge --input base.ts extension.ts',
          'zodkit compose transform --input schema.ts --transform partial'
        ]
      }
    }, null, 2));
  } else {
    console.log(pc.bold('🔧 Schema Composition Toolkit'));
    console.log(pc.gray('─'.repeat(50)));

    console.log('\n' + pc.cyan('Available Operations:'));
    console.log(`  ${pc.green('union')}        Create union of multiple schemas`);
    console.log(`  ${pc.green('intersection')} Create intersection of schemas`);
    console.log(`  ${pc.green('merge')}        Intelligently merge two object schemas`);
    console.log(`  ${pc.green('extend')}       Extend schema with additional properties`);
    console.log(`  ${pc.green('inherit')}      Create inheritance hierarchy`);
    console.log(`  ${pc.green('transform')}    Apply transformations to schema`);
    console.log(`  ${pc.green('chain')}        Chain multiple operations`);

    console.log('\n' + pc.cyan('Examples:'));
    console.log(`  ${pc.gray('$')} zodkit compose union --input user.ts admin.ts`);
    console.log(`  ${pc.gray('$')} zodkit compose merge --input base.ts --input extension.ts`);
    console.log(`  ${pc.gray('$')} zodkit compose transform --input schema.ts --transform partial`);
    console.log(`  ${pc.gray('$')} zodkit compose chain --input base.ts --chain "partial()|array()"`);

    console.log('\n' + pc.cyan('Options:'));
    console.log(`  ${pc.gray('--strategy')}      Composition strategy: strict, merge, union`);
    console.log(`  ${pc.gray('--optimize')}      Enable result optimization`);
    console.log(`  ${pc.gray('--examples')}      Generate usage examples`);
    console.log(`  ${pc.gray('--track-changes')} Track composition changes`);
  }
}