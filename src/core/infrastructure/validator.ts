/**
 * @fileoverview Core validation engine for zodkit
 * @module Validator
 */

import { readFileSync } from 'fs';
import matter from 'gray-matter';
import fg from 'fast-glob';
import { Config } from './config';
import { SchemaInfo } from './schema-discovery';
import { RuleEngine, RuleContext } from './rule-engine';
import { IgnoreParser } from '../utils/ignore-parser';

/**
 * Represents a validation error or warning found during schema validation
 * @category Validation
 * @interface
 */
export interface ValidationError {
  /** Unique error code (e.g., 'ZV1001') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** File path where the error was found */
  file: string;
  /** Line number in the file */
  line: number;
  /** Column number in the file */
  column: number;
  /** Severity level of the issue */
  severity: 'error' | 'warning';
  /** Rule that triggered this error */
  rule: string;
  /** Expected value or format (optional) */
  expected?: string;
  /** Actual value found (optional) */
  received?: string;
  /** Suggested fix for the issue (optional) */
  suggestion?: string;
}

/**
 * Result of a validation operation
 * @category Validation
 * @interface
 */
export interface ValidationResult {
  /** Whether validation passed without errors */
  success: boolean;
  /** Array of validation errors found */
  errors: ValidationError[];
  /** Array of validation warnings found */
  warnings: ValidationError[];
  /** Number of files checked during validation */
  filesChecked: number;
  /** Number of schemas used in validation */
  schemasValidated: number;
}

/**
 * Core validation engine that validates files against Zod schemas
 *
 * @category Core
 * @example
 * ```typescript
 * const config = await configManager.loadConfig();
 * const validator = new Validator(config);
 *
 * const schemas = await schemaDiscovery.findSchemas();
 * const result = await validator.validate(schemas);
 *
 * if (!result.success) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export class Validator {
  private readonly config: Config;
  private readonly schemaRegistry: Map<string, SchemaInfo> = new Map();
  private readonly ruleEngine: RuleEngine;

  /**
   * Creates a new Validator instance
   * @param config - Configuration object containing validation rules and targets
   */
  constructor(config: Config) {
    this.config = config;
    this.ruleEngine = new RuleEngine();
  }

  /**
   * Validates files against discovered Zod schemas
   *
   * @param schemas - Array of schema information discovered by SchemaDiscovery
   * @returns Promise resolving to validation results
   *
   * @example
   * ```typescript
   * const schemas = await schemaDiscovery.findSchemas();
   * const result = await validator.validate(schemas);
   *
   * console.log(`Checked ${result.filesChecked} files`);
   * console.log(`Found ${result.errors.length} errors`);
   * ```
   */
  async validate(schemas: SchemaInfo[]): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      filesChecked: 0,
      schemasValidated: schemas.length,
    };

    // Build schema registry for quick lookups
    this.buildSchemaRegistry(schemas);

    // Validate MDX frontmatter
    if (this.config.targets.mdx) {
      const mdxResult = await this.validateMDXFrontmatter();
      this.mergeResults(result, mdxResult);
    }

    // Validate React components (basic implementation)
    if (this.config.targets.components) {
      const componentResult = this.validateComponents();
      this.mergeResults(result, componentResult);
    }

    // Validate API routes
    if (this.config.targets.api) {
      const apiResult = this.validateAPIRoutes();
      this.mergeResults(result, apiResult);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Validate schemas using the comprehensive rule engine
   */
  async validateWithRules(schemas: SchemaInfo[]): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      filesChecked: 0,
      schemasValidated: schemas.length,
    };

    // Build schema registry
    this.buildSchemaRegistry(schemas);

    for (const schema of schemas) {
      try {
        // Read source file for ignore directive parsing
        const sourceCode = readFileSync(schema.filePath, 'utf-8');
        const ignoreContext = IgnoreParser.parseIgnoreDirectives(sourceCode);

        // Skip if entire file is ignored
        if (ignoreContext.fileIgnored) {
          continue;
        }

        // Create rule context
        const ruleContext: RuleContext = {
          config: this.config,
          schemaInfo: schema,
          sourceCode,
          ignoreContext,
          filePath: schema.filePath
        };

        // Mock AST node for now - in real implementation would use ts-morph
        const mockNode = {
          getText: () => schema.zodChain,
          getStartLineNumber: () => schema.line,
          getStart: () => schema.column,
          getStartLinePos: () => 0
        } as any;

        // Run all rules
        const ruleErrors = this.ruleEngine.runRules(ruleContext, mockNode);

        // Separate errors and warnings, excluding ignored ones
        for (const error of ruleErrors) {
          if (!error.ignored) {
            if (error.severity === 'error') {
              result.errors.push(error);
            } else {
              result.warnings.push(error);
            }
          }
        }

        result.filesChecked++;
      } catch (error) {
        // Log error but continue processing other schemas
        console.warn(`Error validating schema ${schema.name}:`, error);
      }
    }

    // Run legacy validation as well
    const legacyResult = await this.validate(schemas);
    result.errors.push(...legacyResult.errors);
    result.warnings.push(...legacyResult.warnings);

    result.success = result.errors.length === 0;
    return result;
  }

  private buildSchemaRegistry(schemas: SchemaInfo[]): void {
    for (const schema of schemas) {
      if (schema.isExported && schema.exportName) {
        try {
          // For now, store the schema info - actual Zod schema loading would require runtime evaluation
          this.schemaRegistry.set(schema.exportName, schema);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Could not load schema ${schema.name}: ${errorMessage}`);
        }
      }
    }
  }

  private async validateMDXFrontmatter(): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      filesChecked: 0,
      schemasValidated: 0,
    };

    if (!this.config.targets.mdx) return result;

    const files = await fg(this.config.targets.mdx.patterns, {
      absolute: true,
    });

    for (const filePath of files) {
      result.filesChecked++;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = matter(content);
        const frontmatter = parsed.data;
        const isEmpty = Object.keys(frontmatter).length === 0;

        if (isEmpty) {
          // No frontmatter found
          if (this.config.rules['require-validation'] === 'error') {
            result.errors.push({
              code: 'ZV1001',
              message: 'Missing frontmatter',
              file: filePath,
              line: 1,
              column: 1,
              severity: 'error',
              rule: 'require-validation',
              suggestion: 'Add frontmatter to the top of your MDX file',
            });
          }
          continue;
        }

        // Auto-detect schema or use configured mapping
        const schemaName = this.detectMDXSchema(frontmatter);
        if (!schemaName) {
          if (this.config.rules['require-validation'] === 'error') {
            result.errors.push({
              code: 'ZV1002',
              message: 'No schema found for frontmatter validation',
              file: filePath,
              line: 1,
              column: 1,
              severity: 'error',
              rule: 'require-validation',
              suggestion: 'Define a schema for this MDX file type',
            });
          }
          continue;
        }

        // Validate frontmatter against schema
        const validationErrors = this.validateFrontmatterData(
          frontmatter,
          schemaName,
          filePath
        );
        result.errors.push(...validationErrors);

      } catch (error) {
        result.errors.push({
          code: 'ZV1003',
          message: `Failed to parse MDX file: ${error instanceof Error ? error.message : String(error)}`,
          file: filePath,
          line: 1,
          column: 1,
          severity: 'error',
          rule: 'parse-error',
        });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  private detectMDXSchema(frontmatter: Record<string, unknown>): string | null {
    // Auto-detection logic based on frontmatter properties
    if (frontmatter.title && frontmatter.date) {
      return 'BlogPostSchema';
    }
    if (frontmatter.name && frontmatter.description) {
      return 'PageSchema';
    }
    if (frontmatter.type === 'component') {
      return 'ComponentSchema';
    }

    // Fallback to generic schema
    return 'GenericFrontmatterSchema';
  }

  private validateFrontmatterData(
    data: Record<string, unknown>,
    schemaName: string,
    filePath: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // For MVP, implement basic validation rules
    // In a full implementation, this would use the actual Zod schemas

    // Required fields validation
    if (!data.title && schemaName === 'BlogPostSchema') {
      errors.push({
        code: 'ZV2001',
        message: 'Property "title" is required',
        file: filePath,
        line: this.findPropertyLine(),
        column: 1,
        severity: 'error',
        rule: 'require-validation',
        expected: 'string',
        received: 'undefined',
      });
    }

    // Date validation
    if (data.date && schemaName === 'BlogPostSchema') {
      const dateValue = new Date(data.date as string | number | Date);
      if (isNaN(dateValue.getTime())) {
        errors.push({
          code: 'ZV2002',
          message: 'Invalid date format',
          file: filePath,
          line: this.findPropertyLine(),
          column: 1,
          severity: 'error',
          rule: 'date-validation',
          expected: 'Valid ISO date string',
          received: ((): string => {
            const dateValue = data.date;
            if (typeof dateValue === 'object' && dateValue !== null) {
              return JSON.stringify(dateValue);
            }
            if (dateValue !== null && dateValue !== undefined && (typeof dateValue === 'string' || typeof dateValue === 'number')) {
              return String(dateValue);
            }
            return 'undefined';
          })(),
        });
      }
    }

    // Type validation
    if (data.published !== undefined && typeof data.published !== 'boolean') {
      errors.push({
        code: 'ZV2003',
        message: 'Property "published" must be a boolean',
        file: filePath,
        line: this.findPropertyLine(),
        column: 1,
        severity: 'error',
        rule: 'type-validation',
        expected: 'boolean',
        received: typeof data.published,
      });
    }

    return errors;
  }

  private findPropertyLine(): number {
    // In a real implementation, this would track line numbers from the gray-matter parsing
    // For now, return a default line number
    return 2; // Assuming frontmatter starts at line 2
  }

  private validateComponents(): ValidationResult {
    // Basic component validation - would be expanded in full implementation
    return {
      success: true,
      errors: [],
      warnings: [],
      filesChecked: 0,
      schemasValidated: 0,
    };
  }

  private validateAPIRoutes(): ValidationResult {
    // Basic API validation - would be expanded in full implementation
    return {
      success: true,
      errors: [],
      warnings: [],
      filesChecked: 0,
      schemasValidated: 0,
    };
  }

  private mergeResults(target: ValidationResult, source: ValidationResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.filesChecked += source.filesChecked;
    target.schemasValidated += source.schemasValidated;
    target.success = target.success && source.success;
  }
}