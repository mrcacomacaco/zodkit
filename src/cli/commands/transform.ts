/**
 * @fileoverview Unified Transform Command
 * @module TransformCommand
 *
 * Consolidates:
 * - compose.ts - Schema composition (union, intersect, merge)
 * - refactor.ts - Schema refactoring (rename, extract, inline)
 * Total: 2 commands → 1 unified command
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { ConfigManager } from '../../core/config';
import { SchemaTransformer } from '../../core/schema-transformation';
import { Infrastructure } from '../../core/infrastructure';

type TransformMode = 'compose' | 'refactor' | 'migrate' | 'optimize';
type ComposeOperation = 'union' | 'intersect' | 'merge' | 'extend';
type RefactorOperation = 'rename' | 'extract' | 'inline' | 'simplify';

interface TransformOptions {
  mode?: TransformMode;
  operation?: string;
  target?: string;
  output?: string;
  dry?: boolean;
  interactive?: boolean;
}

export async function transformCommand(
  source?: string,
  options: TransformOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const isJsonMode = globalOpts.json;

  try {
    // Determine mode from command name or options
    const mode = options.mode || detectMode(command?.name());

    if (!isJsonMode) {
      console.log(pc.blue(`🔄 Transform mode: ${mode}`));
    }

    // Initialize systems
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const infra = new Infrastructure(config as any);
    const transformer = new SchemaTransformer();

    // Discover schemas
    const schemas = await infra.discovery.findSchemas();

    if (!source) {
      throw new Error('Source schema name required');
    }

    const sourceSchema = schemas.find(s => s.name === source);
    if (!sourceSchema) {
      throw new Error(`Schema '${source}' not found`);
    }

    let result: any;

    switch (mode) {
      case 'compose':
        result = await handleCompose(
          sourceSchema,
          options,
          schemas,
          transformer
        );
        break;

      case 'refactor':
        result = await handleRefactor(
          sourceSchema,
          options,
          transformer
        );
        break;

      case 'migrate':
        result = await handleMigrate(
          sourceSchema,
          options,
          transformer
        );
        break;

      case 'optimize':
        result = await handleOptimize(
          sourceSchema,
          transformer
        );
        break;

      default:
        throw new Error(`Unknown transform mode: ${mode}`);
    }

    // Output results
    if (isJsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayResult(result, mode, options);
    }

    // Write output if specified
    if (options.output && !options.dry) {
      await writeOutput(result, options.output);
      if (!isJsonMode) {
        console.log(pc.green(`✅ Written to ${options.output}`));
      }
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'TRANSFORM_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Transform failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function detectMode(commandName?: string): TransformMode {
  if (commandName?.includes('compose')) return 'compose';
  if (commandName?.includes('refactor')) return 'refactor';
  if (commandName?.includes('migrate')) return 'migrate';
  return 'optimize';
}

async function handleCompose(
  source: any,
  options: TransformOptions,
  schemas: any[],
  transformer: SchemaTransformer
): Promise<any> {
  const operation = options.operation as ComposeOperation;

  if (!operation) {
    throw new Error('Compose operation required (union|intersect|merge|extend)');
  }

  if (!options.target) {
    throw new Error('Target schema required for composition');
  }

  const targetSchema = schemas.find(s => s.name === options.target);
  if (!targetSchema) {
    throw new Error(`Target schema '${options.target}' not found`);
  }

  return await transformer.transform([source, targetSchema] as any, {
    type: 'compose',
    operation,
    preserveDescriptions: true,
    resolveConflicts: 'merge'
  } as any);
}

async function handleRefactor(
  source: any,
  options: TransformOptions,
  transformer: SchemaTransformer
): Promise<any> {
  const operation = options.operation as RefactorOperation;

  if (!operation) {
    throw new Error('Refactor operation required (rename|extract|inline|simplify)');
  }

  return await transformer.transform(source, {
    type: 'refactor',
    operation,
    target: options.target,
    preserveValidations: true
  } as any);
}

async function handleMigrate(
  source: any,
  options: TransformOptions,
  transformer: SchemaTransformer
): Promise<any> {
  return await transformer.transform(source, {
    type: 'migrate',
    version: options.target || 'latest',
    preserveBackwardCompatibility: true,
    generateMigrationScript: true
  } as any);
}

async function handleOptimize(
  source: any,
  transformer: SchemaTransformer
): Promise<any> {
  return await transformer.transform(source, {
    type: 'refactor',
    removeRedundant: true,
    simplifyUnions: true,
    flattenNested: true
  } as any);
}

function displayResult(result: any, mode: TransformMode, options: TransformOptions): void {
  console.log('\n' + pc.bold('Transform Result'));
  console.log(pc.gray('─'.repeat(60)));

  if (mode === 'compose') {
    console.log(pc.cyan('Operation:'), options.operation);
    console.log(pc.cyan('Result Type:'), result.type);
  }

  if (mode === 'refactor') {
    console.log(pc.cyan('Refactoring:'), options.operation);
    if (result.changes) {
      console.log(pc.cyan('Changes:'));
      result.changes.forEach((change: any) => {
        console.log(`  • ${change.description}`);
      });
    }
  }

  if (mode === 'migrate') {
    console.log(pc.cyan('Migration:'));
    console.log(`  From: ${result.fromVersion}`);
    console.log(`  To: ${result.toVersion}`);
    if (result.breakingChanges?.length > 0) {
      console.log(pc.red('Breaking Changes:'));
      result.breakingChanges.forEach((change: string) => {
        console.log(`  ⚠️  ${change}`);
      });
    }
  }

  if (mode === 'optimize') {
    console.log(pc.cyan('Optimizations Applied:'));
    if (result.optimizations) {
      result.optimizations.forEach((opt: string) => {
        console.log(`  ✨ ${opt}`);
      });
    }
    if (result.reduction) {
      console.log(pc.green(`  Size reduced by ${result.reduction}%`));
    }
  }

  if (options.dry) {
    console.log('\n' + pc.yellow('🔍 Dry run - no files modified'));
  }

  // Show generated code preview
  if (result.code) {
    console.log('\n' + pc.bold('Generated Code:'));
    console.log(pc.gray('─'.repeat(60)));
    const preview = result.code.split('\n').slice(0, 20);
    console.log(preview.join('\n'));
    if (result.code.split('\n').length > 20) {
      console.log(pc.gray('... (truncated)'));
    }
  }
}

async function writeOutput(result: any, outputPath: string): Promise<void> {
  const fs = (await import('fs')).default;
  const content = result.code || JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, content, 'utf8');
}

// === COMMAND REGISTRATION ===

export function registerTransformCommand(program: Command): void {
  // Main transform command
  program
    .command('transform <source>')
    .description('Transform schemas: compose, refactor, migrate, optimize')
    .option('-m, --mode <mode>', 'transform mode', 'optimize')
    .option('-o, --operation <op>', 'specific operation')
    .option('-t, --target <schema>', 'target schema or version')
    .option('--output <file>', 'output file path')
    .option('--dry', 'dry run without modifications')
    .option('-i, --interactive', 'interactive mode')
    .action(transformCommand);

  // Backward compatibility aliases
  program
    .command('compose <source>')
    .description('Compose schemas (union, intersect, merge, extend)')
    .option('-o, --operation <op>', 'composition operation', 'merge')
    .option('-t, --target <schema>', 'target schema')
    .option('--output <file>', 'output file')
    .action((source, options, cmd) =>
      transformCommand(source, { ...options, mode: 'compose' }, cmd)
    );

  program
    .command('refactor <source>')
    .description('Refactor schemas (rename, extract, inline, simplify)')
    .option('-o, --operation <op>', 'refactor operation', 'simplify')
    .option('-t, --target <name>', 'new name or target')
    .option('--output <file>', 'output file')
    .action((source, options, cmd) =>
      transformCommand(source, { ...options, mode: 'refactor' }, cmd)
    );
}

export default transformCommand;