/**
 * @fileoverview Explain command - AI-optimized schema explanations
 * @module ExplainCommand
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/schema-discovery';
import { SchemaCache } from '../../core/schema-cache';
import { ComplexityAnalyzer } from '../../core/complexity-analyzer';

interface ExplainOptions {
  all?: boolean;
  relationships?: boolean;
  usage?: boolean;
  examples?: boolean;
}

interface SchemaExplanation {
  name: string;
  description: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  type: string;
  fields?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
    validations: string[];
    example?: unknown;
    default?: unknown;
  }>;
  validations: string[];
  complexity: {
    score: number;
    level: 'low' | 'medium' | 'high' | 'extreme';
    issues: string[];
  };
  relationships?: {
    extends?: string[];
    referencedBy?: Array<{ schema: string; field: string }>;
    references?: Array<{ schema: string; field: string }>;
  };
  usage?: Array<{
    file: string;
    line: number;
    type: 'import' | 'parse' | 'validate' | 'transform';
  }>;
  examples?: {
    valid: unknown[];
    invalid: Array<{ data: unknown; errors: string[] }>;
  };
  operations: {
    parse: string;
    safeParse: string;
    parseAsync: string;
    refine: string;
    transform: string;
  };
  suggestions: string[];
}

export async function explainCommand(
  schemaName: string | undefined,
  options: ExplainOptions,
  command: Command
): Promise<void> {
  const globalOpts = command.parent?.opts() ?? {};
  const isJsonMode = (globalOpts as { json?: boolean })?.json ?? false;
  const isQuiet = (globalOpts as { quiet?: boolean })?.quiet ?? false;

  try {
    // Initialize components
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const cache = new SchemaCache();
    const discovery = new SchemaDiscovery(config, cache);
    const analyzer = new ComplexityAnalyzer();

    if (!isQuiet && !isJsonMode) {
      console.log(pc.blue('📖 zodkit explain') + pc.gray(' - Analyzing schemas...'));
    }

    // Discover schemas
    const schemas = await discovery.findSchemas({ useCache: true });

    if (schemas.length === 0) {
      throw new Error('No schemas found in project');
    }

    // Determine which schemas to explain
    let targetSchemas = schemas;
    if (schemaName) {
      targetSchemas = schemas.filter(s =>
        s.name === schemaName ||
        s.exportName === schemaName
      );

      if (targetSchemas.length === 0) {
        // Suggest similar schemas
        const suggestions = findSimilarSchemas(schemaName, schemas);
        throw new Error(
          `Schema '${schemaName}' not found.` +
          (suggestions.length > 0
            ? ` Did you mean: ${suggestions.join(', ')}?`
            : '')
        );
      }
    } else if (!options.all) {
      // If no schema specified and not --all, show available schemas
      if (isJsonMode) {
        console.log(JSON.stringify({
          available: schemas.map(s => ({
            name: s.exportName ?? s.name,
            file: s.filePath,
            type: s.schemaType
          }))
        }, null, 2));
      } else {
        console.log('\n' + pc.bold('Available Schemas:'));
        schemas.forEach(s => {
          console.log(`  ${pc.cyan(s.exportName ?? s.name)} ${pc.gray(`(${s.schemaType})`)} - ${s.filePath}`);
        });
        console.log('\n' + pc.gray('Use \'zodkit explain <schema>\' to see details'));
      }
      return;
    }

    // Generate explanations
    const explanations: SchemaExplanation[] = [];

    for (const schema of targetSchemas) {
      const explanation = generateExplanation(
        schema,
        options,
        schemas,
        analyzer
      );
      explanations.push(explanation);
    }

    // Output results
    if (isJsonMode) {
      console.log(JSON.stringify(
        explanations.length === 1 ? explanations[0] : { schemas: explanations },
        null,
        2
      ));
    } else {
      displayExplanations(explanations);
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'EXPLAIN_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Explain failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function generateExplanation(
  schema: unknown,
  options: ExplainOptions,
  allSchemas: unknown[],
  analyzer: ComplexityAnalyzer
): SchemaExplanation {
  const schemaInfo = schema as {
    exportName?: string;
    name: string;
    filePath: string;
    line: number;
    column: number;
    schemaType: string;
    zodChain: string;
    fields?: unknown[];
  };

  // Analyze complexity
  const complexityMetrics = analyzer.analyzeSchema(schema);

  // Build explanation
  const explanation: SchemaExplanation = {
    name: schemaInfo.exportName ?? schemaInfo.name,
    description: generateSchemaDescription(schema),
    location: {
      file: schemaInfo.filePath,
      line: schemaInfo.line,
      column: schemaInfo.column
    },
    type: schemaInfo.schemaType,
    validations: extractValidations(schemaInfo.zodChain),
    complexity: {
      score: complexityMetrics.score,
      level: getComplexityLevel(complexityMetrics.score),
      issues: complexityMetrics.issues.map(i => i.message)
    },
    operations: {
      parse: `${schemaInfo.exportName ?? schemaInfo.name}.parse(data)`,
      safeParse: `${schemaInfo.exportName ?? schemaInfo.name}.safeParse(data)`,
      parseAsync: `${schemaInfo.exportName ?? schemaInfo.name}.parseAsync(data)`,
      refine: `${schemaInfo.exportName ?? schemaInfo.name}.refine(validator, message)`,
      transform: `${schemaInfo.exportName ?? schemaInfo.name}.transform(transformer)`
    },
    suggestions: complexityMetrics.suggestions
  };

  // Add fields for object schemas
  const properties = (schemaInfo as { properties?: unknown[] }).properties;
  if (properties && properties.length > 0) {
    explanation.fields = properties.map((prop) => {
      const propInfo = prop as {
        name: string;
        type: string;
        optional?: boolean;
        zodValidator?: string;
      };
      return {
        name: propInfo.name,
        type: propInfo.type,
        required: !propInfo.optional,
        validations: extractValidations(propInfo.zodValidator ?? ''),
        example: generateExample(propInfo.type)
      };
    });
  }

  // Add relationships if requested
  if (options.relationships) {
    explanation.relationships = findRelationships();
  }

  // Add usage information if requested
  if (options.usage) {
    explanation.usage = findUsage();
  }

  // Add examples if requested
  if (options.examples) {
    explanation.examples = generateExamples(schema);
  }

  return explanation;
}

function displayExplanations(explanations: SchemaExplanation[]): void {
  explanations.forEach((exp, index) => {
    if (index > 0) console.log('\n' + pc.gray('─'.repeat(60)) + '\n');

    // Header
    console.log(pc.bold(pc.cyan(`📘 ${exp.name}`)));
    console.log(pc.gray(exp.description));
    console.log(pc.gray(`📍 ${exp.location.file}:${exp.location.line}:${exp.location.column}`));

    // Type and complexity
    console.log(`\n${pc.bold('Type:')} ${exp.type}`);
    const complexityColor = exp.complexity.level === 'low' ? pc.green :
                           exp.complexity.level === 'medium' ? pc.yellow :
                           exp.complexity.level === 'high' ? pc.red : pc.bgRed;
    console.log(`${pc.bold('Complexity:')} ${complexityColor(`${exp.complexity.level} (${exp.complexity.score.toFixed(1)})`)}`);

    // Fields
    if (exp.fields && exp.fields.length > 0) {
      console.log('\n' + pc.bold('Fields:'));
      exp.fields.forEach(field => {
        const required = field.required ? pc.red('*') : pc.gray('?');
        console.log(`  ${pc.cyan(field.name)}${required} ${pc.gray(`(${field.type})`)} ${field.validations.join(', ')}`);
        if (field.example !== undefined) {
          console.log(`    ${pc.gray('Example:')} ${JSON.stringify(field.example)}`);
        }
      });
    }

    // Validations
    if (exp.validations.length > 0) {
      console.log('\n' + pc.bold('Validations:'));
      exp.validations.forEach(v => {
        console.log(`  • ${v}`);
      });
    }

    // Relationships
    if (exp.relationships) {
      if (exp.relationships.extends && exp.relationships.extends.length > 0) {
        console.log('\n' + pc.bold('Extends:'));
        exp.relationships.extends.forEach(s => {
          console.log(`  ← ${pc.cyan(s)}`);
        });
      }

      if (exp.relationships.referencedBy && exp.relationships.referencedBy.length > 0) {
        console.log('\n' + pc.bold('Referenced by:'));
        exp.relationships.referencedBy.forEach(ref => {
          console.log(`  → ${pc.cyan(ref.schema)}.${ref.field}`);
        });
      }

      if (exp.relationships.references && exp.relationships.references.length > 0) {
        console.log('\n' + pc.bold('References:'));
        exp.relationships.references.forEach(ref => {
          console.log(`  ← ${pc.cyan(ref.schema)}.${ref.field}`);
        });
      }
    }

    // Usage
    if (exp.usage && exp.usage.length > 0) {
      console.log('\n' + pc.bold('Usage:'));
      const usageByType = exp.usage?.reduce((acc, u) => {
        acc[u.type] ??= [];
        acc[u.type]?.push(u);
        return acc;
      }, {} as Record<string, typeof exp.usage>);

      Object.entries(usageByType).forEach(([type, uses]) => {
        console.log(`  ${pc.cyan(type)}: ${uses.length} location${uses.length === 1 ? '' : 's'}`);
        uses.slice(0, 3).forEach(u => {
          console.log(`    ${pc.gray(u.file + ':' + u.line)}`);
        });
        if (uses.length > 3) {
          console.log(`    ${pc.gray(`... and ${uses.length - 3} more`)}`);
        }
      });
    }

    // Examples
    if (exp.examples) {
      console.log('\n' + pc.bold('Examples:'));

      if (exp.examples.valid.length > 0) {
        console.log(pc.green('  Valid:'));
        exp.examples.valid.slice(0, 2).forEach(ex => {
          console.log(`    ${JSON.stringify(ex, null, 2).split('\n').join('\n    ')}`);
        });
      }

      if (exp.examples.invalid.length > 0) {
        console.log(pc.red('  Invalid:'));
        exp.examples.invalid.slice(0, 1).forEach(ex => {
          console.log(`    Data: ${JSON.stringify(ex.data)}`);
          console.log(`    Errors: ${ex.errors.join(', ')}`);
        });
      }
    }

    // Operations
    console.log('\n' + pc.bold('Operations:'));
    console.log(pc.gray('  // Parse and throw on error'));
    console.log(`  ${pc.cyan(exp.operations.parse)}`);
    console.log(pc.gray('  // Parse and return result object'));
    console.log(`  ${pc.cyan(exp.operations.safeParse)}`);
    console.log(pc.gray('  // Async parse for async refinements'));
    console.log(`  ${pc.cyan(exp.operations.parseAsync)}`);

    // Suggestions
    if (exp.suggestions.length > 0) {
      console.log('\n' + pc.bold('💡 Suggestions:'));
      exp.suggestions.forEach(s => {
        console.log(`  • ${s}`);
      });
    }

    // Complexity issues
    if (exp.complexity.issues.length > 0) {
      console.log('\n' + pc.bold('⚠️  Complexity Issues:'));
      exp.complexity.issues.forEach(issue => {
        console.log(`  • ${pc.yellow(issue)}`);
      });
    }
  });
}

function generateSchemaDescription(schema: unknown): string {
  const descriptions: Record<string, string> = {
    object: 'Object schema with structured fields',
    string: 'String validation schema',
    number: 'Numeric validation schema',
    boolean: 'Boolean validation schema',
    array: 'Array validation schema',
    union: 'Union type allowing multiple schema types',
    intersection: 'Intersection combining multiple schemas',
    unknown: 'Unknown or dynamic schema type'
  };

  const schemaInfo = schema as { schemaType?: string };
  return descriptions[schemaInfo.schemaType ?? 'unknown'] ?? 'Custom schema definition';
}

function extractValidations(zodChain: string): string[] {
  const validations: string[] = [];

  const patterns: Record<string, string> = {
    '\\.min\\(': 'minimum value/length',
    '\\.max\\(': 'maximum value/length',
    '\\.length\\(': 'exact length',
    '\\.email\\(': 'email format',
    '\\.url\\(': 'URL format',
    '\\.uuid\\(': 'UUID format',
    '\\.regex\\(': 'regex pattern',
    '\\.refine\\(': 'custom refinement',
    '\\.transform\\(': 'data transformation',
    '\\.optional\\(': 'optional field',
    '\\.nullable\\(': 'nullable field',
    '\\.default\\(': 'default value',
    '\\.int\\(': 'integer only',
    '\\.positive\\(': 'positive number',
    '\\.negative\\(': 'negative number'
  };

  Object.entries(patterns).forEach(([pattern, description]) => {
    if (new RegExp(pattern).test(zodChain)) {
      validations.push(description);
    }
  });

  return validations;
}

function getComplexityLevel(score: number): 'low' | 'medium' | 'high' | 'extreme' {
  if (score < 5) return 'low';
  if (score < 10) return 'medium';
  if (score < 20) return 'high';
  return 'extreme';
}

function findRelationships(): {
  extends: unknown[];
  referencedBy: unknown[];
  references: unknown[];
} {
  const relationships = {
    extends: [] as unknown[],
    referencedBy: [] as unknown[],
    references: [] as unknown[]
  };

  // Simple relationship detection based on naming and imports
  // In production, would use AST analysis

  return relationships;
}

function findUsage(): unknown[] {
  // Simplified usage detection
  // In production, would scan codebase for actual usage
  return [];
}

function generateExamples(schema: unknown): { valid: unknown[]; invalid: unknown[] } {
  // Generate valid examples based on schema type
  const valid: unknown[] = [];
  const invalid: unknown[] = [];

  if (schema.schemaType === 'object') {
    valid.push({
      id: 'user-123',
      email: 'user@example.com',
      name: 'John Doe'
    });

    invalid.push({
      data: { email: 'invalid-email' },
      errors: ['Invalid email format']
    });
  } else if (schema.schemaType === 'string') {
    valid.push('example@email.com');
    invalid.push({
      data: 123,
      errors: ['Expected string, received number']
    });
  }

  return { valid, invalid };
}

function generateExample(type: string): unknown {
  const examples: Record<string, unknown> = {
    string: 'example',
    number: 42,
    boolean: true,
    array: ['item1', 'item2'],
    object: { key: 'value' },
    date: new Date().toISOString()
  };

  return examples[type.toLowerCase()] ?? null;
}

function findSimilarSchemas(target: string, schemas: unknown[]): string[] {
  // Simple similarity check
  const targetLower = target.toLowerCase();
  return schemas
    .map(s => {
      const schema = s as { exportName?: string; name: string };
      return schema.exportName ?? schema.name;
    })
    .filter(name => name.toLowerCase().includes(targetLower) ||
                    targetLower.includes(name.toLowerCase()))
    .slice(0, 3);
}