/**
 * @fileoverview Realistic mock data generator with AI-powered patterns
 * @module MockCommand
 */

import * as pc from 'picocolors';
import { ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/infrastructure/schema-discovery';
import { MockDataGenerator } from '../../core/mock-generator';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

interface MockOptions {
  count?: string;
  realistic?: boolean;
  locale?: string;
  seed?: string;
  relationships?: boolean;
  output?: string;
  format?: 'json' | 'typescript' | 'sql' | 'csv';
  template?: string;
  streaming?: boolean;
  batch?: string;
}

export async function mockCommand(
  schemaName: string | undefined,
  options: MockOptions,
  command: any
): Promise<void> {
  const globalOpts = command.parent.opts();
  const isJsonMode = globalOpts.json;

  try {
    if (!isJsonMode) {
      console.log(pc.blue('🎭 zodkit mock') + pc.gray(' - Generating realistic mock data...'));
    }

    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const discovery = new SchemaDiscovery(config);
    const generator = new MockDataGenerator();

    // Discover schemas
    const schemas = await discovery.findSchemas();
    if (schemas.length === 0) {
      throw new Error('No schemas found in project');
    }

    // Find target schema
    let targetSchemas = schemas;
    if (schemaName) {
      const targetSchema = schemas.find(s => s.name === schemaName);
      if (!targetSchema) {
        throw new Error(`Schema '${schemaName}' not found`);
      }
      targetSchemas = [targetSchema];
    }

    // Parse options
    const count = parseInt(options.count || '1', 10);
    const seed = options.seed ? parseInt(options.seed, 10) : undefined;
    const locale = options.locale || 'en-US';
    const format = options.format || 'json';

    // Configure generator
    const generatorConfig: any = {
      realistic: options.realistic ?? false,
      locale,
      relationships: options.relationships ?? false,
      streaming: options.streaming ?? false
    };

    if (seed !== undefined) {
      generatorConfig.seed = seed;
    }
    if (options.batch) {
      generatorConfig.batchSize = parseInt(options.batch, 10);
    }

    await generator.configure(generatorConfig);

    // Load custom template if provided
    if (options.template) {
      await generator.loadTemplate(options.template);
    }

    // Generate mock data
    const results = await generator.generateBatch(targetSchemas, count, {
      format,
      preserveRelationships: options.relationships ?? false
    });

    // Output results
    if (options.output) {
      await outputToFile(results, options.output, format);

      if (!isJsonMode) {
        console.log(pc.green(`✓ Mock data written to ${options.output}`));
      }
    }

    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        generated: {
          schemas: targetSchemas.map(s => s.name),
          count: results.totalCount,
          format,
          locale,
          realistic: options.realistic,
          relationships: options.relationships
        },
        data: format === 'json' ? results.data : undefined,
        stats: results.stats
      }, null, 2));
    } else {
      displayMockResults(results, targetSchemas, options);
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'MOCK_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Mock generation failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function outputToFile(results: any, outputPath: string, format: string): Promise<void> {
  // Ensure directory exists
  const dir = outputPath.includes('/') ? outputPath.substring(0, outputPath.lastIndexOf('/')) : '.';
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let content: string;
  let extension: string;

  switch (format) {
    case 'json':
      content = JSON.stringify(results.data, null, 2);
      extension = '.json';
      break;
    case 'typescript':
      content = generateTypeScriptFile(results);
      extension = '.ts';
      break;
    case 'sql':
      content = generateSQLFile(results);
      extension = '.sql';
      break;
    case 'csv':
      content = generateCSVFile(results);
      extension = '.csv';
      break;
    default:
      content = JSON.stringify(results.data, null, 2);
      extension = '.json';
  }

  const finalPath = outputPath.endsWith(extension) ? outputPath : outputPath + extension;
  writeFileSync(finalPath, content);
}

function generateTypeScriptFile(results: any): string {
  return `// Generated mock data by zodkit
// Generated at: ${new Date().toISOString()}

export const mockData = ${JSON.stringify(results.data, null, 2)} as const;

export type MockDataType = typeof mockData;

// Usage example:
// import { mockData } from './mock-data';
// const firstItem = mockData[0];
`;
}

function generateSQLFile(results: any): string {
  if (!Array.isArray(results.data) || results.data.length === 0) {
    return '-- No data to generate SQL';
  }

  const firstItem = results.data[0];
  const tableName = results.schemaName || 'mock_data';
  const columns = Object.keys(firstItem);

  let sql = `-- Generated SQL insert statements by zodkit
-- Generated at: ${new Date().toISOString()}

-- Create table (adjust types as needed)
CREATE TABLE IF NOT EXISTS ${tableName} (
${columns.map(col => `  ${col} TEXT`).join(',\n')}
);

-- Insert data
`;

  results.data.forEach((item: any) => {
    const values = columns.map(col => {
      const value = item[col];
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
      return String(value);
    });

    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  });

  return sql;
}

function generateCSVFile(results: any): string {
  if (!Array.isArray(results.data) || results.data.length === 0) {
    return 'No data to generate CSV';
  }

  const columns = Object.keys(results.data[0]);
  let csv = columns.join(',') + '\n';

  results.data.forEach((item: any) => {
    const values = columns.map(col => {
      const value = item[col];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    csv += values.join(',') + '\n';
  });

  return csv;
}

function displayMockResults(results: any, schemas: any[], options: MockOptions): void {
  console.log('\n' + pc.bold('🎭 Mock Data Generation Complete'));
  console.log(pc.gray('─'.repeat(60)));

  console.log(pc.cyan('Schema:'), schemas.map(s => s.name).join(', '));
  console.log(pc.cyan('Count:'), results.totalCount);
  console.log(pc.cyan('Format:'), options.format || 'json');
  console.log(pc.cyan('Locale:'), options.locale || 'en-US');
  console.log(pc.cyan('Realistic:'), options.realistic ? '✓' : '✗');
  console.log(pc.cyan('Relationships:'), options.relationships ? '✓' : '✗');

  // Show statistics
  if (results.stats) {
    console.log('\n' + pc.bold('Generation Statistics:'));
    console.log(`  Properties: ${results.stats.totalProperties}`);
    console.log(`  Unique Values: ${results.stats.uniqueValues}`);
    console.log(`  Generation Time: ${results.stats.generationTime}ms`);
    console.log(`  Memory Usage: ${results.stats.memoryUsage}MB`);

    if (results.stats.patterns) {
      console.log(`  AI Patterns Applied: ${results.stats.patterns.length}`);
    }
  }

  // Show sample data (first few items)
  if (!options.output && results.data) {
    console.log('\n' + pc.bold('Sample Data:'));
    const sampleSize = Math.min(3, Array.isArray(results.data) ? results.data.length : 1);

    if (Array.isArray(results.data)) {
      results.data.slice(0, sampleSize).forEach((item: any, index: number) => {
        console.log(`\n  ${pc.cyan(`Item ${index + 1}:`)} ${JSON.stringify(item, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')}`);
      });

      if (results.data.length > sampleSize) {
        console.log(`\n  ${pc.gray(`... and ${results.data.length - sampleSize} more items`)}`);
      }
    } else {
      console.log(`\n  ${JSON.stringify(results.data, null, 2)}`);
    }
  }

  // Show AI patterns used
  if (options.realistic && results.stats?.patterns) {
    console.log('\n' + pc.bold('🤖 AI Patterns Applied:'));
    results.stats.patterns.forEach((pattern: any, i: number) => {
      console.log(`  ${i + 1}. ${pc.cyan(pattern.type)}: ${pattern.description}`);
      if (pattern.examples) {
        console.log(`     Examples: ${pc.gray(pattern.examples.join(', '))}`);
      }
    });
  }

  // Show relationship insights
  if (options.relationships && results.relationships) {
    console.log('\n' + pc.bold('🔗 Relationship Insights:'));
    results.relationships.forEach((rel: any) => {
      console.log(`  ${rel.from} → ${rel.to}: ${rel.type} (${rel.count} references)`);
    });
  }

  // Show suggestions
  if (results.suggestions?.length > 0) {
    console.log('\n' + pc.bold('💡 Suggestions:'));
    results.suggestions.forEach((suggestion: any, i: number) => {
      console.log(`  ${i + 1}. ${suggestion.type}: ${suggestion.description}`);
      if (suggestion.command) {
        console.log(`     Command: ${pc.cyan(suggestion.command)}`);
      }
    });
  }

  console.log('\n' + pc.bold('Usage Examples:'));
  console.log(`  Generate more: ${pc.cyan(`zodkit mock ${schemas[0]?.name} --count 100`)}`);
  console.log(`  Realistic mode: ${pc.cyan(`zodkit mock ${schemas[0]?.name} --realistic`)}`);
  console.log(`  Export to file: ${pc.cyan(`zodkit mock ${schemas[0]?.name} --output data.json`)}`);
  console.log(`  With relationships: ${pc.cyan(`zodkit mock ${schemas[0]?.name} --relationships`)}`);
}