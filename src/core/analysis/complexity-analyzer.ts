/**
 * @fileoverview Schema complexity analyzer for optimization suggestions
 * @module ComplexityAnalyzer
 */

import { SchemaInfo } from './schema-discovery';
import * as pc from 'picocolors';

/**
 * Complexity metrics for a schema
 */
export interface ComplexityMetrics {
  score: number;
  depth: number;
  validationCount: number;
  fieldCount: number;
  unionBranches: number;
  transformCount: number;
  refineCount: number;
  regexCount: number;
  issues: ComplexityIssue[];
  suggestions: string[];
}

/**
 * Specific complexity issue found
 */
export interface ComplexityIssue {
  type: 'high-depth' | 'many-validations' | 'complex-union' | 'nested-transforms' | 'expensive-regex';
  severity: 'low' | 'medium' | 'high';
  message: string;
  location?: string;
}

/**
 * Analysis result for multiple schemas
 */
export interface ComplexityReport {
  totalSchemas: number;
  averageComplexity: number;
  maxComplexity: number;
  minComplexity: number;
  complexSchemas: Array<{
    schema: SchemaInfo;
    metrics: ComplexityMetrics;
  }>;
  recommendations: string[];
  performanceEstimate: PerformanceEstimate;
}

/**
 * Performance impact estimate
 */
export interface PerformanceEstimate {
  parseTimeMs: number;
  validationTimeMs: number;
  memoryMb: number;
  rating: 'excellent' | 'good' | 'moderate' | 'poor';
}

/**
 * Analyzer for schema complexity and performance optimization
 */
export class ComplexityAnalyzer {
  private readonly complexityThresholds = {
    low: 5,
    medium: 10,
    high: 20,
    extreme: 30
  };

  /**
   * Analyze complexity of a single schema
   */
  analyzeSchema(schema: SchemaInfo): ComplexityMetrics {
    const metrics: ComplexityMetrics = {
      score: 0,
      depth: 0,
      validationCount: 0,
      fieldCount: 0,
      unionBranches: 0,
      transformCount: 0,
      refineCount: 0,
      regexCount: 0,
      issues: [],
      suggestions: []
    };

    // Analyze schema chain
    this.analyzeSchemaChain(schema.zodChain, metrics);

    // Analyze properties if available
    if (schema.properties) {
      metrics.fieldCount = schema.properties.length;
      this.analyzeProperties(schema.properties, metrics);
    }

    // Calculate overall complexity score
    metrics.score = this.calculateComplexityScore(metrics);

    // Generate suggestions
    metrics.suggestions = this.generateSuggestions(metrics);

    // Identify issues
    metrics.issues = this.identifyIssues(metrics);

    return metrics;
  }

  /**
   * Analyze multiple schemas and generate report
   */
  analyzeSchemas(schemas: SchemaInfo[]): ComplexityReport {
    const analyzedSchemas = schemas.map(schema => ({
      schema,
      metrics: this.analyzeSchema(schema)
    }));

    // Sort by complexity
    analyzedSchemas.sort((a, b) => b.metrics.score - a.metrics.score);

    // Calculate statistics
    const scores = analyzedSchemas.map(s => s.metrics.score);
    const totalComplexity = scores.reduce((sum, score) => sum + score, 0);
    const averageComplexity = totalComplexity / schemas.length;

    // Identify complex schemas (top 20% or score > 15)
    const complexThreshold = Math.max(15, scores[Math.floor(scores.length * 0.2)] || 15);
    const complexSchemas = analyzedSchemas.filter(s => s.metrics.score >= complexThreshold);

    // Generate performance estimate
    const performanceEstimate = this.estimatePerformance(analyzedSchemas);

    // Generate recommendations
    const recommendations = this.generateGlobalRecommendations(analyzedSchemas);

    return {
      totalSchemas: schemas.length,
      averageComplexity,
      maxComplexity: Math.max(...scores),
      minComplexity: Math.min(...scores),
      complexSchemas,
      recommendations,
      performanceEstimate
    };
  }

  /**
   * Analyze schema chain for complexity indicators
   */
  private analyzeSchemaChain(chain: string, metrics: ComplexityMetrics): void {
    // Count validation methods
    const validationMethods = [
      '.min(', '.max(', '.length(', '.email(', '.url(', '.uuid(',
      '.cuid(', '.datetime(', '.ip(', '.includes(', '.startsWith(',
      '.endsWith(', '.gt(', '.gte(', '.lt(', '.lte(', '.int(',
      '.positive(', '.negative(', '.nonpositive(', '.nonnegative('
    ];

    for (const method of validationMethods) {
      metrics.validationCount += (chain.match(new RegExp('\\' + method, 'g')) || []).length;
    }

    // Count transforms
    metrics.transformCount = (chain.match(/\.transform\(/g) || []).length;

    // Count refinements
    metrics.refineCount = (chain.match(/\.refine\(/g) || []).length;

    // Count regex patterns
    metrics.regexCount = (chain.match(/\.(regex|pattern)\(/g) || []).length;

    // Count union branches
    const unionMatches = chain.match(/\.union\(\[(.*?)\]\)/g);
    if (unionMatches) {
      for (const match of unionMatches) {
        // Rough estimate of union branches
        metrics.unionBranches += (match.match(/z\./g) || []).length;
      }
    }

    // Calculate nesting depth
    metrics.depth = this.calculateNestingDepth(chain);
  }

  /**
   * Analyze schema properties for additional complexity
   */
  private analyzeProperties(properties: any[], metrics: ComplexityMetrics): void {
    for (const prop of properties) {
      // Check for complex nested structures
      if (prop.zodValidator?.includes('.object(')) {
        metrics.depth++;
      }

      // Check for arrays of objects
      if (prop.zodValidator?.includes('.array(') &&
          prop.zodValidator.includes('.object(')) {
        metrics.score += 2; // Arrays of objects add complexity
      }
    }
  }

  /**
   * Calculate overall complexity score
   */
  private calculateComplexityScore(metrics: ComplexityMetrics): number {
    let score = 0;

    // Base complexity from field count
    score += Math.log2(metrics.fieldCount + 1) * 2;

    // Validation complexity
    score += metrics.validationCount * 0.5;

    // Transform and refine complexity
    score += metrics.transformCount * 2;
    score += metrics.refineCount * 1.5;

    // Regex complexity (expensive operations)
    score += metrics.regexCount * 3;

    // Union complexity
    score += metrics.unionBranches * 1.5;

    // Depth penalty (exponential for deep nesting)
    score += Math.pow(1.5, Math.max(0, metrics.depth - 3));

    return Math.round(score * 10) / 10;
  }

  /**
   * Calculate nesting depth
   */
  private calculateNestingDepth(chain: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of chain) {
      if (char === '(' || char === '{' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')' || char === '}' || char === ']') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  /**
   * Identify specific complexity issues
   */
  private identifyIssues(metrics: ComplexityMetrics): ComplexityIssue[] {
    const issues: ComplexityIssue[] = [];

    if (metrics.depth > 7) {
      issues.push({
        type: 'high-depth',
        severity: metrics.depth > 10 ? 'high' : 'medium',
        message: `Schema has excessive nesting depth (${metrics.depth} levels)`
      });
    }

    if (metrics.validationCount > 20) {
      issues.push({
        type: 'many-validations',
        severity: metrics.validationCount > 30 ? 'high' : 'medium',
        message: `Schema has many validation rules (${metrics.validationCount} validations)`
      });
    }

    if (metrics.unionBranches > 10) {
      issues.push({
        type: 'complex-union',
        severity: 'high',
        message: `Complex union type with ${metrics.unionBranches} branches`
      });
    }

    if (metrics.transformCount > 3) {
      issues.push({
        type: 'nested-transforms',
        severity: 'medium',
        message: `Multiple transform operations (${metrics.transformCount}) may impact performance`
      });
    }

    if (metrics.regexCount > 2) {
      issues.push({
        type: 'expensive-regex',
        severity: metrics.regexCount > 5 ? 'high' : 'medium',
        message: `Multiple regex validations (${metrics.regexCount}) are computationally expensive`
      });
    }

    return issues;
  }

  /**
   * Generate optimization suggestions
   */
  private generateSuggestions(metrics: ComplexityMetrics): string[] {
    const suggestions: string[] = [];

    if (metrics.score > this.complexityThresholds.high) {
      suggestions.push('Consider breaking this schema into smaller, composable parts');
    }

    if (metrics.depth > 5) {
      suggestions.push('Flatten deeply nested structures where possible');
    }

    if (metrics.unionBranches > 5) {
      suggestions.push('Use discriminated unions for better performance and type inference');
    }

    if (metrics.transformCount > 2) {
      suggestions.push('Combine multiple transforms into a single operation');
    }

    if (metrics.regexCount > 0) {
      suggestions.push('Consider using built-in validators instead of regex where possible');
    }

    if (metrics.refineCount > 3) {
      suggestions.push('Consolidate multiple refine operations into a single validation');
    }

    if (metrics.validationCount > 15) {
      suggestions.push('Review if all validations are necessary for your use case');
    }

    return suggestions;
  }

  /**
   * Generate global recommendations for the codebase
   */
  private generateGlobalRecommendations(
    analyzedSchemas: Array<{ schema: SchemaInfo; metrics: ComplexityMetrics }>
  ): string[] {
    const recommendations: string[] = [];

    // Check for common patterns
    const avgComplexity = analyzedSchemas.reduce((sum, s) => sum + s.metrics.score, 0) / analyzedSchemas.length;

    if (avgComplexity > this.complexityThresholds.medium) {
      recommendations.push('Overall schema complexity is high. Consider creating a schema style guide');
    }

    // Check for duplicate patterns
    const schemaPatterns = new Map<string, number>();
    for (const { schema } of analyzedSchemas) {
      const pattern = this.extractPattern(schema.zodChain);
      schemaPatterns.set(pattern, (schemaPatterns.get(pattern) || 0) + 1);
    }

    const duplicates = Array.from(schemaPatterns.entries())
      .filter(([, count]) => count > 2);

    if (duplicates.length > 0) {
      recommendations.push('Found repeated schema patterns. Consider creating reusable schema components');
    }

    // Performance recommendations
    const complexCount = analyzedSchemas.filter(s => s.metrics.score > this.complexityThresholds.high).length;
    if (complexCount > analyzedSchemas.length * 0.3) {
      recommendations.push('Many schemas are complex. Consider implementing lazy loading for validation');
    }

    return recommendations;
  }

  /**
   * Estimate performance impact
   */
  private estimatePerformance(
    analyzedSchemas: Array<{ schema: SchemaInfo; metrics: ComplexityMetrics }>
  ): PerformanceEstimate {
    const totalComplexity = analyzedSchemas.reduce((sum, s) => sum + s.metrics.score, 0);

    // Rough estimates based on complexity
    const parseTimeMs = totalComplexity * 0.5;
    const validationTimeMs = totalComplexity * 0.3;
    const memoryMb = Math.max(10, totalComplexity * 0.1);

    let rating: PerformanceEstimate['rating'];
    if (totalComplexity < 100) {
      rating = 'excellent';
    } else if (totalComplexity < 300) {
      rating = 'good';
    } else if (totalComplexity < 500) {
      rating = 'moderate';
    } else {
      rating = 'poor';
    }

    return {
      parseTimeMs: Math.round(parseTimeMs),
      validationTimeMs: Math.round(validationTimeMs),
      memoryMb: Math.round(memoryMb),
      rating
    };
  }

  /**
   * Extract pattern signature for duplicate detection
   */
  private extractPattern(chain: string): string {
    // Simplified pattern extraction
    return chain
      .replace(/\([^)]*\)/g, '()')
      .replace(/\[[^\]]*\]/g, '[]')
      .replace(/\{[^}]*\}/g, '{}')
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""')
      .substring(0, 50);
  }

  /**
   * Format complexity report for display
   */
  formatReport(report: ComplexityReport): string {
    const lines: string[] = [];

    lines.push(pc.bold(pc.cyan('Schema Complexity Analysis Report')));
    lines.push('');

    // Summary statistics
    lines.push(pc.bold('Summary:'));
    lines.push(`  Total Schemas: ${report.totalSchemas}`);
    lines.push(`  Average Complexity: ${report.averageComplexity.toFixed(1)}`);
    lines.push(`  Max Complexity: ${report.maxComplexity.toFixed(1)}`);
    lines.push(`  Min Complexity: ${report.minComplexity.toFixed(1)}`);
    lines.push('');

    // Performance estimate
    lines.push(pc.bold('Performance Estimate:'));
    const perf = report.performanceEstimate;
    const ratingColor = {
      excellent: pc.green,
      good: pc.cyan,
      moderate: pc.yellow,
      poor: pc.red
    }[perf.rating];

    lines.push(`  Parse Time: ${perf.parseTimeMs}ms`);
    lines.push(`  Validation Time: ${perf.validationTimeMs}ms`);
    lines.push(`  Memory Usage: ${perf.memoryMb}MB`);
    lines.push(`  Rating: ${ratingColor(perf.rating.toUpperCase())}`);
    lines.push('');

    // Complex schemas
    if (report.complexSchemas.length > 0) {
      lines.push(pc.bold(pc.yellow('Complex Schemas:')));
      for (const { schema, metrics } of report.complexSchemas.slice(0, 5)) {
        lines.push(`  ${pc.cyan(schema.exportName || schema.name)}`);
        lines.push(`    Complexity: ${this.getComplexityIndicator(metrics.score)}`);
        lines.push(`    File: ${pc.gray(schema.filePath)}`);

        if (metrics.issues.length > 0) {
          lines.push(`    Issues:`);
          for (const issue of metrics.issues) {
            const severityColor = {
              low: pc.gray,
              medium: pc.yellow,
              high: pc.red
            }[issue.severity];
            lines.push(`      ${severityColor('●')} ${issue.message}`);
          }
        }

        if (metrics.suggestions.length > 0) {
          lines.push(`    Suggestions:`);
          for (const suggestion of metrics.suggestions.slice(0, 2)) {
            lines.push(`      → ${suggestion}`);
          }
        }
        lines.push('');
      }
    }

    // Global recommendations
    if (report.recommendations.length > 0) {
      lines.push(pc.bold('Recommendations:'));
      for (const recommendation of report.recommendations) {
        lines.push(`  • ${recommendation}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get visual complexity indicator
   */
  private getComplexityIndicator(score: number): string {
    const level = score < this.complexityThresholds.low ? 'low' :
                  score < this.complexityThresholds.medium ? 'medium' :
                  score < this.complexityThresholds.high ? 'high' : 'extreme';

    const color = {
      low: pc.green,
      medium: pc.yellow,
      high: pc.red,
      extreme: pc.bgRed
    }[level];

    const bar = '█'.repeat(Math.min(10, Math.floor(score / 3)));
    return `${score.toFixed(1)} ${color(bar)}`;
  }
}