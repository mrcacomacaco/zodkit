/**
 * @fileoverview Advanced validation rules for Zod schemas
 * @module AdvancedRules
 */

import { RuleDefinition as Rule, RuleContext } from '../rule-engine';
import { ValidationError } from '../validator';
// @ts-ignore: Reserved for future schema-based rule analysis
import { SchemaInfo } from '../schema-discovery';

/**
 * Rule: Detect potential security vulnerabilities in schemas
 */
export const securityRule: Rule = {
  name: 'security-check',
  description: 'Detects potential security vulnerabilities in Zod schemas',
  category: 'security',
  severity: 'error',
  fixable: false,

  check(context: RuleContext, node: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemaChain = node.getText();

    // Check for dangerous regex patterns
    if (schemaChain.includes('.regex(') || schemaChain.includes('.pattern(')) {
      const regexPattern = /\.(regex|pattern)\((.*?)\)/g;
      let match;

      while ((match = regexPattern.exec(schemaChain)) !== null) {
        const pattern = match[2];

        // Check for ReDoS vulnerable patterns
        if (isReDoSVulnerable(pattern)) {
          errors.push({
            code: 'SEC001',
            message: 'Potential ReDoS vulnerability detected in regex pattern',
            file: context.filePath,
            line: node.getStartLineNumber(),
            column: node.getStart(),
            severity: 'error',
            rule: 'security-check',
            suggestion: 'Use a simpler regex pattern or add input length limits'
          });
        }

        // Check for overly permissive patterns
        if (pattern && pattern.includes('.*') && !pattern.includes('.*?')) {
          errors.push({
            code: 'SEC002',
            message: 'Greedy regex pattern may cause performance issues',
            file: context.filePath,
            line: node.getStartLineNumber(),
            column: node.getStart(),
            severity: 'warning',
            rule: 'security-check',
            suggestion: 'Consider using non-greedy quantifiers (.*?)'
          });
        }
      }
    }

    // Check for missing input sanitization
    if (schemaChain.includes('.url()') && !schemaChain.includes('.transform(')) {
      errors.push({
        code: 'SEC003',
        message: 'URL schema should include validation for allowed protocols',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'security-check',
        suggestion: 'Add .refine() to validate URL protocols (https, http only)'
      });
    }

    // Check for unbounded arrays/strings
    if (schemaChain.includes('.array(') && !schemaChain.includes('.max(')) {
      errors.push({
        code: 'SEC004',
        message: 'Unbounded array may lead to memory exhaustion',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'security-check',
        suggestion: 'Add .max() to limit array size'
      });
    }

    return errors;
  }
};

/**
 * Rule: Check schema complexity and suggest optimizations
 */
export const complexityRule: Rule = {
  name: 'complexity-check',
  description: 'Analyzes schema complexity and suggests optimizations',
  category: 'performance',
  severity: 'warn',
  fixable: false,

  check(context: RuleContext, node: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemaChain = node.getText();

    // Calculate complexity score
    const complexity = calculateComplexity(schemaChain);

    if (complexity > 10) {
      errors.push({
        code: 'COMP001',
        message: `Schema complexity is high (score: ${complexity})`,
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'complexity-check',
        suggestion: 'Consider breaking down into smaller, reusable schemas'
      });
    }

    // Check for deeply nested objects
    const nestingDepth = calculateNestingDepth(schemaChain);
    if (nestingDepth > 5) {
      errors.push({
        code: 'COMP002',
        message: `Deeply nested schema detected (depth: ${nestingDepth})`,
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'complexity-check',
        suggestion: 'Consider flattening the schema structure'
      });
    }

    // Check for redundant validations
    if (hasRedundantValidations(schemaChain)) {
      errors.push({
        code: 'COMP003',
        message: 'Schema contains redundant validations',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'complexity-check',
        suggestion: 'Remove redundant validation chains'
      });
    }

    return errors;
  }
};


/**
 * Rule: Ensure schemas follow naming conventions
 */
export const namingConventionRule: Rule = {
  name: 'naming-convention',
  description: 'Enforces naming conventions for Zod schemas',
  category: 'best-practice',
  severity: 'warn',

  fixable: false,

  check(context: RuleContext, node: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemaInfo = context.schemaInfo;

    // Check schema name format
    if (schemaInfo.exportName) {
      const name = schemaInfo.exportName;

      // Should end with 'Schema'
      if (!name.endsWith('Schema') && !name.endsWith('Type')) {
        errors.push({
          code: 'NAME001',
          message: `Schema name should end with 'Schema' or 'Type'`,
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart(),
          severity: 'warning',
          rule: 'naming-convention',
          expected: `${name}Schema`,
          received: name
        });
      }

      // Should be PascalCase
      if (!isPascalCase(name)) {
        errors.push({
          code: 'NAME002',
          message: 'Schema name should be in PascalCase',
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart(),
          severity: 'warning',
          rule: 'naming-convention',
          suggestion: toPascalCase(name)
        });
      }
    }

    return errors;
  }
};

/**
 * Rule: Detect and suggest performance optimizations
 */
export const performanceRule: Rule = {
  name: 'performance-optimization',
  description: 'Suggests performance optimizations for schemas',
  category: 'performance',
  severity: 'warn',

  fixable: false,

  check(context: RuleContext, node: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemaChain = node.getText();

    // Check for expensive operations in arrays
    if (schemaChain.includes('.array(') && schemaChain.includes('.refine(')) {
      errors.push({
        code: 'PERF001',
        message: 'Using .refine() on arrays can be expensive for large datasets',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'performance-optimization',
        suggestion: 'Consider using .transform() with early returns for better performance'
      });
    }

    // Suggest lazy evaluation for unions
    if (schemaChain.includes('.union([') && !schemaChain.includes('.lazy(')) {
      const unionCount = (schemaChain.match(/\.union\(\[/g) || []).length;
      if (unionCount > 3) {
        errors.push({
          code: 'PERF002',
          message: 'Large unions can benefit from lazy evaluation',
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart(),
          severity: 'warning',
          rule: 'performance-optimization',
          suggestion: 'Consider using z.lazy() for complex union types'
        });
      }
    }

    // Check for multiple parse calls
    if (schemaChain.includes('.parse(') && schemaChain.includes('.safeParse(')) {
      errors.push({
        code: 'PERF003',
        message: 'Avoid mixing .parse() and .safeParse() for the same schema',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'performance-optimization',
        suggestion: 'Use .safeParse() consistently for better error handling'
      });
    }

    return errors;
  }
};

/**
 * Rule: Ensure schemas have proper documentation
 */
export const documentationRule: Rule = {
  name: 'schema-documentation',
  description: 'Ensures schemas have proper documentation',
  category: 'best-practice',
  severity: 'warn',

  fixable: false,

  check(context: RuleContext, node: any): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemaChain = node.getText();
    const sourceLines = context.sourceCode.split('\n');

    // Find the line above the schema
    const schemaLine = node.getStartLineNumber() - 1;
    if (schemaLine > 0) {
      const previousLine = sourceLines[schemaLine - 1];

      // Check for JSDoc comment
      if (previousLine && !previousLine.includes('/**') && !previousLine.includes('//')) {
        errors.push({
          code: 'DOC001',
          message: 'Schema is missing documentation comment',
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart(),
          severity: 'warning',
          rule: 'schema-documentation',
          suggestion: 'Add a JSDoc comment describing the schema purpose'
        });
      }
    }

    // Check for .describe() calls
    if (!schemaChain.includes('.describe(')) {
      errors.push({
        code: 'DOC002',
        message: 'Schema fields should include .describe() for better error messages',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        severity: 'warning',
        rule: 'schema-documentation',
        suggestion: 'Add .describe() to provide user-friendly descriptions'
      });
    }

    return errors;
  }
};

/**
 * Helper functions
 */
function isReDoSVulnerable(pattern: string | undefined): boolean {
  if (!pattern) return false;
  // Check for catastrophic backtracking patterns
  const vulnerablePatterns = [
    /(\w+)+/,
    /(\d+)+/,
    /([a-zA-Z]+)+/,
    /(.*)+/
  ];
  return vulnerablePatterns.some(vp => vp.test(pattern));
}

function calculateComplexity(schemaChain: string): number {
  let score = 0;
  const methods = schemaChain.match(/\.(\w+)\(/g) || [];
  score += methods.length;

  // Add extra points for complex methods
  const complexMethods = ['union', 'intersection', 'discriminatedUnion', 'transform', 'superRefine'];
  complexMethods.forEach(method => {
    if (schemaChain.includes(`.${method}(`)) {
      score += 2;
    }
  });

  return score;
}

function calculateNestingDepth(schemaChain: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of schemaChain) {
    if (char === '(' || char === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === ')' || char === '}') {
      currentDepth--;
    }
  }

  return maxDepth;
}

function hasRedundantValidations(schemaChain: string): boolean {
  // Check for redundant min/max combinations
  const hasMinMax = schemaChain.includes('.min(') && schemaChain.includes('.max(');
  const hasLength = schemaChain.includes('.length(');

  return hasMinMax && hasLength;
}

/**
 * Register all advanced rules
 */
export const advancedRules: Rule[] = [
  securityRule,
  complexityRule,
  namingConventionRule,
  performanceRule,
  documentationRule
];
function isPascalCase(str: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(str);
}

function toPascalCase(str: string): string {
  return str.replace(/(?:^|\s)\w/g, match => match.toUpperCase()).replace(/\s+/g, '');
}
