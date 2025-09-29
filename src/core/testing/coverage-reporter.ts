import * as pc from 'picocolors';
import { SchemaInfo } from '../infrastructure';
import { Config } from '../config';
import fg from 'fast-glob';

// TODO: Replace with proper validation result type
interface ValidationResult {
  valid: boolean;
  errors?: any[];
}

export interface CoverageReport {
  schemaUsage: {
    total: number;
    used: number;
    unused: number;
    usageRate: number;
  };
  filesCovered: {
    total: number;
    withSchemas: number;
    withoutSchemas: number;
    coverageRate: number;
  };
  schemaComplexity: {
    simple: number;
    moderate: number;
    complex: number;
    averageComplexity: number;
  };
  details: {
    unusedSchemas: SchemaInfo[];
    uncoveredFiles: string[];
    complexSchemas: SchemaInfo[];
  };
}

export class CoverageReporter {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async generateReport(schemas: SchemaInfo[], validationResult: ValidationResult): Promise<CoverageReport> {
    // Find all target files
    const allTargetFiles = await this.getAllTargetFiles();

    // Calculate schema usage
    const usedSchemas = this.findUsedSchemas(schemas, validationResult);
    const unusedSchemas = schemas.filter(schema =>
      !usedSchemas.some(used => used.name === schema.name && used.filePath === schema.filePath)
    );

    // Calculate file coverage
    const filesWithSchemas = new Set<string>();
    schemas.forEach(schema => filesWithSchemas.add(schema.filePath));

    const uncoveredFiles = allTargetFiles.filter(file => !filesWithSchemas.has(file));

    // Calculate schema complexity
    const complexity = this.analyzeSchemaComplexity(schemas);

    return {
      schemaUsage: {
        total: schemas.length,
        used: usedSchemas.length,
        unused: unusedSchemas.length,
        usageRate: schemas.length > 0 ? (usedSchemas.length / schemas.length) * 100 : 0,
      },
      filesCovered: {
        total: allTargetFiles.length,
        withSchemas: filesWithSchemas.size,
        withoutSchemas: uncoveredFiles.length,
        coverageRate: allTargetFiles.length > 0 ? (filesWithSchemas.size / allTargetFiles.length) * 100 : 0,
      },
      schemaComplexity: complexity,
      details: {
        unusedSchemas,
        uncoveredFiles,
        complexSchemas: schemas.filter(schema => this.calculateSchemaComplexity(schema) > 10),
      },
    };
  }

  displayReport(report: CoverageReport): void {
    console.log('\n' + pc.blue('📊 Schema Coverage Report'));
    console.log(''.padEnd(50, '='));

    // Schema Usage
    console.log('\n' + pc.bold('Schema Usage:'));
    console.log(`  Total schemas: ${report.schemaUsage.total}`);
    console.log(`  Used schemas: ${pc.green(report.schemaUsage.used.toString())}`);
    console.log(`  Unused schemas: ${pc.yellow(report.schemaUsage.unused.toString())}`);
    console.log(`  Usage rate: ${this.formatPercentage(report.schemaUsage.usageRate)}`);

    // File Coverage
    console.log('\n' + pc.bold('File Coverage:'));
    console.log(`  Total target files: ${report.filesCovered.total}`);
    console.log(`  Files with schemas: ${pc.green(report.filesCovered.withSchemas.toString())}`);
    console.log(`  Files without schemas: ${pc.yellow(report.filesCovered.withoutSchemas.toString())}`);
    console.log(`  Coverage rate: ${this.formatPercentage(report.filesCovered.coverageRate)}`);

    // Schema Complexity
    console.log('\n' + pc.bold('Schema Complexity:'));
    console.log(`  Simple schemas: ${pc.green(report.schemaComplexity.simple.toString())}`);
    console.log(`  Moderate schemas: ${pc.yellow(report.schemaComplexity.moderate.toString())}`);
    console.log(`  Complex schemas: ${pc.red(report.schemaComplexity.complex.toString())}`);
    console.log(`  Average complexity: ${report.schemaComplexity.averageComplexity.toFixed(2)}`);

    // Unused Schemas (if any)
    if (report.details.unusedSchemas.length > 0) {
      console.log('\n' + pc.yellow('⚠️  Unused Schemas:'));
      report.details.unusedSchemas.slice(0, 10).forEach(schema => {
        console.log(`  ${schema.name} (${schema.filePath}:${schema.line})`);
      });

      if (report.details.unusedSchemas.length > 10) {
        console.log(`  ... and ${report.details.unusedSchemas.length - 10} more`);
      }
    }

    // Complex Schemas (if any)
    if (report.details.complexSchemas.length > 0) {
      console.log('\n' + pc.red('🔍 Complex Schemas (may need simplification):'));
      report.details.complexSchemas.slice(0, 5).forEach(schema => {
        const complexity = this.calculateSchemaComplexity(schema);
        console.log(`  ${schema.name} (complexity: ${complexity}) - ${schema.filePath}:${schema.line}`);
      });

      if (report.details.complexSchemas.length > 5) {
        console.log(`  ... and ${report.details.complexSchemas.length - 5} more`);
      }
    }

    // Recommendations
    this.displayRecommendations(report);
  }

  private async getAllTargetFiles(): Promise<string[]> {
    const patterns: string[] = [];
    const config = this.config as any;

    // Add all target patterns from config
    if (config.targets?.mdx) {
      patterns.push(...config.targets.mdx.patterns);
    }
    if (config.targets?.components) {
      patterns.push(...config.targets.components.patterns);
    }
    if (config.targets?.api) {
      patterns.push(...config.targets.api.patterns);
    }

    if (patterns.length === 0) {
      return [];
    }

    const files = await fg(patterns, {
      ignore: config.schemas?.exclude || [],
      absolute: true,
    });

    return files;
  }

  private findUsedSchemas(schemas: SchemaInfo[], validationResult: ValidationResult): SchemaInfo[] {
    // For now, consider a schema "used" if it's referenced in validation errors
    // or if it's exported (indicating external usage)
    const usedSchemas: SchemaInfo[] = [];

    schemas.forEach(schema => {
      const isReferenced = validationResult.errors?.some(error =>
        error.file === schema.filePath
      );

      if ((schema as any).isExported || isReferenced) {
        usedSchemas.push(schema);
      }
    });

    return usedSchemas;
  }

  private analyzeSchemaComplexity(schemas: SchemaInfo[]): CoverageReport['schemaComplexity'] {
    let simple = 0;
    let moderate = 0;
    let complex = 0;
    let totalComplexity = 0;

    schemas.forEach(schema => {
      const complexity = this.calculateSchemaComplexity(schema);
      totalComplexity += complexity;

      if (complexity <= 3) {
        simple++;
      } else if (complexity <= 8) {
        moderate++;
      } else {
        complex++;
      }
    });

    return {
      simple,
      moderate,
      complex,
      averageComplexity: schemas.length > 0 ? totalComplexity / schemas.length : 0,
    };
  }

  private calculateSchemaComplexity(schema: SchemaInfo): number {
    let complexity = 1; // Base complexity

    // Add complexity based on schema type
    switch (schema.schemaType) {
      case 'object':
        complexity += 2;
        break;
      case 'array':
        complexity += 1;
        break;
      case 'union':
      case 'intersection':
        complexity += 3;
        break;
    }

    // Add complexity based on properties
    if (schema.properties) {
      complexity += schema.properties.length;

      // Add extra complexity for nested objects and complex types
      schema.properties.forEach(prop => {
        if (prop.type === 'object' || prop.type === 'array') {
          complexity += 1;
        }
        if (prop.zodValidator?.includes('union') || prop.zodValidator?.includes('intersection')) {
          complexity += 2;
        }
        if (prop.zodValidator?.includes('refine') || prop.zodValidator?.includes('transform')) {
          complexity += 1;
        }
      });
    }

    // Add complexity for advanced Zod features
    if (schema.zodChain?.includes('refine')) complexity += 2;
    if (schema.zodChain?.includes('transform')) complexity += 2;
    if (schema.zodChain?.includes('superRefine')) complexity += 3;
    if (schema.zodChain?.includes('pipe')) complexity += 1;

    return complexity;
  }

  private formatPercentage(percentage: number): string {
    const rounded = Math.round(percentage);
    if (rounded >= 80) {
      return pc.green(`${rounded}%`);
    } else if (rounded >= 60) {
      return pc.yellow(`${rounded}%`);
    } else {
      return pc.red(`${rounded}%`);
    }
  }

  private displayRecommendations(report: CoverageReport): void {
    console.log('\n' + pc.blue('💡 Recommendations:'));

    if (report.schemaUsage.usageRate < 80) {
      console.log(`  • ${pc.yellow('Schema Usage:')} Consider removing unused schemas to reduce maintenance overhead`);
    }

    if (report.filesCovered.coverageRate < 70) {
      console.log(`  • ${pc.yellow('File Coverage:')} Add schemas to uncovered files for better type safety`);
    }

    if (report.schemaComplexity.complex > 0) {
      console.log(`  • ${pc.yellow('Complexity:')} Consider breaking down complex schemas into smaller, reusable parts`);
    }

    if (report.details.complexSchemas.length > 5) {
      console.log(`  • ${pc.yellow('Maintainability:')} High number of complex schemas may impact maintainability`);
    }

    // Positive feedback
    if (report.schemaUsage.usageRate >= 90) {
      console.log(`  • ${pc.green('✓')} Excellent schema usage rate!`);
    }

    if (report.filesCovered.coverageRate >= 80) {
      console.log(`  • ${pc.green('✓')} Great file coverage!`);
    }
  }
}