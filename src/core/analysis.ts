/**
 * @fileoverview Unified Analysis System
 * @module Analysis
 *
 * Consolidates all analysis components:
 * - Complexity analyzer (512 lines)
 * - Rule engine (549 lines)
 * - API inspector (302 lines)
 * - Data analyzer (545 lines)
 * - Hint engine (414 lines)
 * Total: 6 files → 1 unified system (~2,330 lines → ~500 lines)
 */

import { z } from 'zod';
import * as ts from 'typescript';
import * as pc from 'picocolors';

// === UNIFIED TYPES ===

export type AnalysisMode = 'complexity' | 'rules' | 'api' | 'data' | 'hints' | 'full';

export interface AnalysisOptions {
  mode?: AnalysisMode;
  depth?: number;
  strict?: boolean;
  autoFix?: boolean;
  patterns?: string[];
}

export interface AnalysisResult {
  score: number;
  level: 'low' | 'medium' | 'high' | 'extreme';
  issues: Issue[];
  suggestions: string[];
  metrics: Record<string, number>;
  fixes?: Fix[];
}

export interface Issue {
  type: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  severity: number;
}

export interface Fix {
  description: string;
  changes: Array<{
    file: string;
    line: number;
    before: string;
    after: string;
  }>;
  impact: 'safe' | 'risky' | 'breaking';
}

export interface Rule {
  name: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  check: (schema: any) => Issue[];
  fix?: (schema: any) => Fix;
}

// === UNIFIED ANALYZER ===

export class Analyzer {
  private readonly rules: Map<string, Rule> = new Map();
  private readonly metrics: Map<string, number> = new Map();

  constructor() {
    this.initializeRules();
  }

  /**
   * Perform comprehensive analysis
   */
  async analyze(
    input: any,
    options: AnalysisOptions = {}
  ): Promise<AnalysisResult> {
    const mode = options.mode || 'full';
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Route to appropriate analyzer
    switch (mode) {
      case 'complexity':
        return this.analyzeComplexity(input, options);
      case 'rules':
        return this.analyzeRules(input, options);
      case 'api':
        return this.analyzeAPI(input, options);
      case 'data':
        return this.analyzeData(input, options);
      case 'hints':
        return this.analyzeHints(input, options);
      case 'full':
        // Combine all analyses
        const complexity = await this.analyzeComplexity(input, options);
        const rules = await this.analyzeRules(input, options);
        const api = await this.analyzeAPI(input, options);

        result.score = (complexity.score + rules.score + api.score) / 3;
        result.issues = [...complexity.issues, ...rules.issues, ...api.issues];
        result.suggestions = [...new Set([
          ...complexity.suggestions,
          ...rules.suggestions,
          ...api.suggestions
        ])];
        result.metrics = {
          ...complexity.metrics,
          ...rules.metrics,
          ...api.metrics
        };
        break;
    }

    // Calculate level based on score
    result.level = this.calculateLevel(result.score);

    // Generate fixes if requested
    if (options.autoFix) {
      result.fixes = this.generateFixes(result.issues, input);
    }

    return result;
  }

  /**
   * Analyze schema complexity
   */
  private async analyzeComplexity(schema: any, options: AnalysisOptions): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Calculate complexity metrics
    let complexity = 0;

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      complexity += Object.keys(shape).length * 0.5; // Fields add complexity

      // Check nesting depth
      let maxDepth = this.calculateDepth(schema);
      complexity += maxDepth * 2;

      if (maxDepth > 3) {
        result.issues.push({
          type: 'warning',
          rule: 'deep-nesting',
          message: `Schema has ${maxDepth} levels of nesting (recommended: ≤3)`,
          severity: 2
        });
        result.suggestions.push('Consider flattening nested schemas');
      }
    }

    // Check for circular references
    if (this.hasCircularReference(schema)) {
      complexity += 10;
      result.issues.push({
        type: 'error',
        rule: 'circular-reference',
        message: 'Schema contains circular references',
        severity: 3
      });
    }

    // Check union complexity
    if (schema instanceof z.ZodUnion) {
      const optionCount = schema._def.options.length;
      complexity += optionCount * 1.5;

      if (optionCount > 5) {
        result.issues.push({
          type: 'warning',
          rule: 'complex-union',
          message: `Union has ${optionCount} options (recommended: ≤5)`,
          severity: 2
        });
        result.suggestions.push('Consider using discriminated unions');
      }
    }

    result.score = complexity;
    result.metrics = {
      complexity,
      depth: this.calculateDepth(schema),
      fields: schema instanceof z.ZodObject ? Object.keys(schema.shape).length : 0
    };

    return result;
  }

  /**
   * Analyze with rules
   */
  private async analyzeRules(schema: any, options: AnalysisOptions): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Apply each rule
    for (const [name, rule] of this.rules) {
      if (options.patterns && !this.matchesPattern(name, options.patterns)) {
        continue;
      }

      const issues = rule.check(schema);
      result.issues.push(...issues);

      // Add severity to score
      issues.forEach(issue => {
        result.score += issue.severity;
      });
    }

    // Generate suggestions based on issues
    result.suggestions = this.generateSuggestions(result.issues);

    result.metrics = {
      rulesChecked: this.rules.size,
      violations: result.issues.length
    };

    return result;
  }

  /**
   * Analyze API compatibility
   */
  private async analyzeAPI(schema: any, options: AnalysisOptions): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Check for API-friendly patterns
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;

      // Check for consistent naming
      const fields = Object.keys(shape);
      const inconsistent = fields.filter(f => !this.isApiNaming(f));

      if (inconsistent.length > 0) {
        result.issues.push({
          type: 'warning',
          rule: 'api-naming',
          message: `Non-API naming: ${inconsistent.join(', ')}`,
          severity: 1
        });
        result.suggestions.push('Use camelCase or snake_case consistently');
      }

      // Check for required fields
      const requiredCount = fields.filter(f => !shape[f].isOptional()).length;
      if (requiredCount > 10) {
        result.issues.push({
          type: 'warning',
          rule: 'too-many-required',
          message: `${requiredCount} required fields (consider making some optional)`,
          severity: 2
        });
      }
    }

    result.metrics = {
      apiCompliance: 100 - (result.issues.length * 10)
    };

    return result;
  }

  /**
   * Analyze data patterns
   */
  private async analyzeData(data: any, options: AnalysisOptions): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Analyze data structure
    const stats = this.collectDataStats(data);

    // Check for anomalies
    if (stats.nullCount > stats.totalFields * 0.5) {
      result.issues.push({
        type: 'warning',
        rule: 'high-null-ratio',
        message: 'More than 50% of fields are null',
        severity: 2
      });
      result.suggestions.push('Consider using optional fields instead of nulls');
    }

    result.metrics = stats;
    return result;
  }

  /**
   * Generate hints and best practices
   */
  private async analyzeHints(schema: any, options: AnalysisOptions): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      score: 0,
      level: 'low',
      issues: [],
      suggestions: [],
      metrics: {}
    };

    // Performance hints
    if (schema instanceof z.ZodObject && Object.keys(schema.shape).length > 50) {
      result.suggestions.push('Consider splitting large schemas into smaller modules');
    }

    // Security hints
    if (this.hasUnsafePatterns(schema)) {
      result.suggestions.push('Review schema for potential security vulnerabilities');
    }

    // Best practices
    result.suggestions.push(...this.getBestPractices(schema));

    return result;
  }

  // === HELPER METHODS ===

  private initializeRules(): void {
    // Core rules
    this.rules.set('no-any', {
      name: 'no-any',
      severity: 'error',
      description: 'Avoid using z.any()',
      check: (schema) => {
        const issues: Issue[] = [];
        if (schema instanceof z.ZodAny) {
          issues.push({
            type: 'error',
            rule: 'no-any',
            message: 'Avoid using z.any() - use specific types',
            severity: 3
          });
        }
        return issues;
      }
    });

    // Alternative name for backward compatibility with tests
    this.rules.set('any-type', {
      name: 'any-type',
      severity: 'error',
      description: 'Detect z.any() usage',
      check: (schema) => {
        const issues: Issue[] = [];
        if (schema instanceof z.ZodAny) {
          issues.push({
            type: 'error',
            rule: 'any-type',
            message: 'Avoid using z.any() - use specific types',
            severity: 3
          });
        }
        return issues;
      }
    });

    this.rules.set('require-description', {
      name: 'require-description',
      severity: 'warning',
      description: 'Schemas should have descriptions',
      check: (schema) => {
        const issues: Issue[] = [];
        if (!schema.description) {
          issues.push({
            type: 'warning',
            rule: 'require-description',
            message: 'Schema lacks description',
            severity: 1
          });
        }
        return issues;
      }
    });

    // Add min/max validation rules
    this.rules.set('min-value', {
      name: 'min-value',
      severity: 'error',
      description: 'Check minimum value constraints',
      check: (schema) => {
        const issues: Issue[] = [];
        if (schema instanceof z.ZodNumber) {
          const checks = (schema as any)._def.checks || [];
          const hasMin = checks.some((c: any) => c.kind === 'min');
          if (!hasMin) {
            issues.push({
              type: 'warning',
              rule: 'min-value',
              message: 'Number should have minimum constraint for safety',
              severity: 1
            });
          }
        }
        return issues;
      }
    });
  }

  private calculateDepth(schema: any, current = 0): number {
    if (current > 10) return current; // Prevent infinite recursion

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      let maxDepth = current;
      for (const field of Object.values(shape)) {
        maxDepth = Math.max(maxDepth, this.calculateDepth(field, current + 1));
      }
      return maxDepth;
    }

    if (schema instanceof z.ZodArray) {
      return this.calculateDepth(schema.element, current + 1);
    }

    return current;
  }

  private hasCircularReference(schema: any, visited = new Set()): boolean {
    const id = schema._def?.typeName;
    if (visited.has(id)) return true;
    visited.add(id);

    if (schema instanceof z.ZodObject) {
      for (const field of Object.values(schema.shape)) {
        if (this.hasCircularReference(field, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  }

  private calculateLevel(score: number): AnalysisResult['level'] {
    if (score < 10) return 'low';
    if (score < 25) return 'medium';
    if (score < 50) return 'high';
    return 'extreme';
  }

  private generateFixes(issues: Issue[], schema: any): Fix[] {
    const fixes: Fix[] = [];

    for (const issue of issues) {
      const rule = this.rules.get(issue.rule);
      if (rule?.fix) {
        const fix = rule.fix(schema);
        if (fix) fixes.push(fix);
      }
    }

    return fixes;
  }

  private matchesPattern(name: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(name);
    });
  }

  private isApiNaming(field: string): boolean {
    // Check for camelCase or snake_case
    return /^[a-z][a-zA-Z0-9]*$/.test(field) || /^[a-z]+(_[a-z]+)*$/.test(field);
  }

  private collectDataStats(data: any): Record<string, number> {
    const stats = {
      totalFields: 0,
      nullCount: 0,
      undefinedCount: 0,
      arrayCount: 0,
      objectCount: 0
    };

    const analyze = (obj: any) => {
      if (obj === null) stats.nullCount++;
      else if (obj === undefined) stats.undefinedCount++;
      else if (Array.isArray(obj)) {
        stats.arrayCount++;
        obj.forEach(analyze);
      } else if (typeof obj === 'object') {
        stats.objectCount++;
        Object.values(obj).forEach(analyze);
      }
      stats.totalFields++;
    };

    analyze(data);
    return stats;
  }

  private hasUnsafePatterns(schema: any): boolean {
    // Check for patterns that might indicate security issues
    if (schema instanceof z.ZodString) {
      const checks = (schema as any)._def.checks || [];
      return !checks.some((c: any) => c.kind === 'regex' || c.kind === 'email');
    }
    return false;
  }

  private generateSuggestions(issues: Issue[]): string[] {
    const suggestions: string[] = [];
    const issueCounts = new Map<string, number>();

    issues.forEach(issue => {
      issueCounts.set(issue.rule, (issueCounts.get(issue.rule) || 0) + 1);
    });

    if ((issueCounts.get('no-any') ?? 0) > 0 || (issueCounts.get('any-type') ?? 0) > 0) {
      suggestions.push('Replace z.any() with specific types like z.string(), z.number(), etc.');
    }

    if ((issueCounts.get('min-value') ?? 0) > 0) {
      suggestions.push('Add minimum constraints: z.number().min(0)');
    }

    if ((issueCounts.get('deep-nesting') ?? 0) > 0) {
      suggestions.push('Refactor deeply nested schemas into separate definitions');
    }

    if ((issueCounts.get('require-description') ?? 0) > 0) {
      suggestions.push('Add descriptions to schemas using .describe()');
    }

    // Add general validation error suggestions
    suggestions.push('Validate input data format matches schema requirements');
    suggestions.push('Use .safeParse() to handle validation errors gracefully');

    return suggestions;
  }

  private getBestPractices(schema: any): string[] {
    const practices: string[] = [];

    if (schema instanceof z.ZodObject) {
      practices.push('Consider using .strict() for object schemas');
      practices.push('Add .describe() to document schema purpose');
    }

    if (schema instanceof z.ZodString) {
      practices.push('Add validation like .email(), .url(), or .regex()');
    }

    return practices;
  }
}

// === EXPORTS FOR BACKWARD COMPATIBILITY ===

export { Analyzer as ComplexityAnalyzer };
export { Analyzer as RuleEngine };
export { Analyzer as APIInspector };
export { Analyzer as DataAnalyzer };
export { Analyzer as HintEngine };

export const createAnalyzer = () => new Analyzer();

export default Analyzer;