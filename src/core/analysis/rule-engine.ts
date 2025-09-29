/**
 * @fileoverview Comprehensive rule engine for zodkit validation
 * @module RuleEngine
 */

import { Node } from 'ts-morph';
import { Config } from './config';
import { SchemaInfo } from './schema-discovery';
import { ValidationError } from './validator';
import { IgnoreParser, IgnoreContext, ValidationErrorWithIgnore } from '../utils/ignore-parser';

export interface RuleContext {
  config: Config;
  schemaInfo: SchemaInfo;
  sourceCode: string;
  ignoreContext: IgnoreContext;
  filePath: string;
}

export interface RuleDefinition {
  name: string;
  category: 'prohibition' | 'best-practice' | 'security' | 'performance';
  description: string;
  severity: 'error' | 'warn' | 'off';
  fixable: boolean;
  check: (context: RuleContext, node: Node) => ValidationError[];
}

/**
 * Comprehensive rule engine with all zodkit validation rules
 */
export class RuleEngine {
  private readonly rules: Map<string, RuleDefinition> = new Map();

  constructor() {
    this.registerAllRules();
  }

  /**
   * Register all available rules
   */
  private registerAllRules(): void {
    // Prohibition Rules (no*)
    this.registerRule({
      name: 'no-any-types',
      category: 'prohibition',
      description: 'Disallow z.any() usage',
      severity: 'error',
      fixable: true,
      check: this.checkNoAnyTypes
    });

    this.registerRule({
      name: 'no-unknown-fallback',
      category: 'prohibition',
      description: 'Prefer specific types over z.unknown()',
      severity: 'warn',
      fixable: false,
      check: this.checkNoUnknownFallback
    });

    this.registerRule({
      name: 'no-unsafe-coercion',
      category: 'security',
      description: 'Disallow z.coerce() without validation',
      severity: 'warn',
      fixable: true,
      check: this.checkNoUnsafeCoercion
    });

    this.registerRule({
      name: 'no-empty-schema',
      category: 'prohibition',
      description: 'Disallow z.object({}) without reason',
      severity: 'error',
      fixable: true,
      check: this.checkNoEmptySchema
    });

    this.registerRule({
      name: 'no-circular-refs',
      category: 'prohibition',
      description: 'Detect circular schema references',
      severity: 'error',
      fixable: false,
      check: this.checkNoCircularRefs
    });

    this.registerRule({
      name: 'no-unsafe-transforms',
      category: 'security',
      description: 'Disallow dangerous .transform() usage',
      severity: 'error',
      fixable: false,
      check: this.checkNoUnsafeTransforms
    });

    // Best Practice Rules (use*, prefer*)
    this.registerRule({
      name: 'use-strict-schemas',
      category: 'best-practice',
      description: 'Prefer .strict() over loose objects',
      severity: 'warn',
      fixable: true,
      check: this.checkUseStrictSchemas
    });

    this.registerRule({
      name: 'use-descriptive-names',
      category: 'best-practice',
      description: 'Require meaningful schema names',
      severity: 'warn',
      fixable: false,
      check: this.checkUseDescriptiveNames
    });

    this.registerRule({
      name: 'use-format-validation',
      category: 'best-practice',
      description: 'Use .email(), .url(), .uuid() for format validation',
      severity: 'error',
      fixable: true,
      check: this.checkUseFormatValidation
    });

    this.registerRule({
      name: 'prefer-union',
      category: 'best-practice',
      description: 'Prefer z.union() over complex logic',
      severity: 'warn',
      fixable: true,
      check: this.checkPreferUnion
    });

    // Performance Rules
    this.registerRule({
      name: 'no-expensive-parsing',
      category: 'performance',
      description: 'Avoid expensive parsing patterns',
      severity: 'warn',
      fixable: false,
      check: this.checkNoExpensiveParsing
    });

    this.registerRule({
      name: 'use-lazy-schemas',
      category: 'performance',
      description: 'Use z.lazy() for recursive schemas',
      severity: 'warn',
      fixable: true,
      check: this.checkUseLazySchemas
    });

    // Security Rules
    this.registerRule({
      name: 'no-eval-in-schemas',
      category: 'security',
      description: 'Disallow eval() in schema definitions',
      severity: 'error',
      fixable: false,
      check: this.checkNoEvalInSchemas
    });

    this.registerRule({
      name: 'validate-external-data',
      category: 'security',
      description: 'Require validation for external data',
      severity: 'error',
      fixable: false,
      check: this.checkValidateExternalData
    });
  }

  /**
   * Register a single rule
   */
  private registerRule(rule: RuleDefinition): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Run all enabled rules against a schema
   */
  runRules(context: RuleContext, node: Node): ValidationErrorWithIgnore[] {
    const errors: ValidationErrorWithIgnore[] = [];

    for (const [ruleName, rule] of this.rules) {
      // Check if rule is enabled in config
      const ruleSeverity = this.getRuleSeverity(context.config, ruleName);
      if (ruleSeverity === 'off') {
        continue;
      }

      try {
        const ruleErrors = rule.check(context, node);

        // Convert to errors with ignore information
        for (const error of ruleErrors) {
          const ignored = IgnoreParser.isIgnored(
            context.ignoreContext,
            ruleName,
            error.line
          );

          errors.push({
            ...error,
            ignored,
            severity: ignored ? 'warning' : (ruleSeverity === 'error' ? 'error' : 'warning')
          });
        }
      } catch (ruleError) {
        // Rule execution error - log but don't crash
        console.warn(`Error running rule ${ruleName}:`, ruleError);
      }
    }

    return errors;
  }

  /**
   * Get rule severity from config
   */
  private getRuleSeverity(config: Config, ruleName: string): 'error' | 'warn' | 'off' {
    return config.rules[ruleName as keyof typeof config.rules] || 'off';
  }

  // Rule Implementation Methods
  // ========================

  private readonly checkNoAnyTypes = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    if (text.includes('z.any()')) {
      errors.push({
        code: 'ZD001',
        message: 'Avoid using z.any() - use specific types instead',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'error',
        rule: 'no-any-types',
        expected: 'Specific Zod type (z.string(), z.number(), etc.)',
        received: 'z.any()',
        suggestion: 'Replace z.any() with a specific type like z.string() or z.unknown()'
      });
    }

    return errors;
  };

  private readonly checkNoUnknownFallback = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    if (text.includes('z.unknown()') && !text.includes('// zodkit-ignore')) {
      errors.push({
        code: 'ZD002',
        message: 'Consider using a more specific type instead of z.unknown()',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'no-unknown-fallback',
        expected: 'Specific type',
        received: 'z.unknown()',
        suggestion: 'Use z.string(), z.object(), or z.union() for better type safety'
      });
    }

    return errors;
  };

  private readonly checkNoUnsafeCoercion = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for z.coerce without additional validation
    if (text.includes('z.coerce.') && !text.includes('.min(') && !text.includes('.max(') && !text.includes('.refine(')) {
      errors.push({
        code: 'ZD003',
        message: 'z.coerce() should include additional validation',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'no-unsafe-coercion',
        suggestion: 'Add .min(), .max(), or .refine() for safer coercion'
      });
    }

    return errors;
  };

  private readonly checkNoEmptySchema = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    if (text.includes('z.object({})') && !text.includes('// zodkit-ignore')) {
      errors.push({
        code: 'ZD004',
        message: 'Empty object schema should have a comment explaining why',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'error',
        rule: 'no-empty-schema',
        suggestion: 'Add properties to the schema or use z.record() for dynamic objects'
      });
    }

    return errors;
  };

  private readonly checkNoCircularRefs = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();
    const schemaName = context.schemaInfo.name;

    // Check if schema references itself directly
    if (text.includes(schemaName) && text !== `const ${schemaName} =`) {
      // Look for patterns like: z.object({ self: MySchema })
      const selfRefPattern = new RegExp(`\\b${schemaName}\\b`, 'g');
      const matches = text.match(selfRefPattern);

      if (matches && matches.length > 1) { // More than just the declaration
        errors.push({
          code: 'ZD011',
          message: `Potential circular reference detected in schema "${schemaName}"`,
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart() - node.getStartLinePos(),
          severity: 'error',
          rule: 'no-circular-refs',
          suggestion: 'Use z.lazy() for recursive schemas: z.lazy(() => MySchema)'
        });
      }
    }

    return errors;
  };

  private readonly checkNoUnsafeTransforms = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for dangerous patterns in transforms
    if (text.includes('.transform(') && (text.includes('eval(') || text.includes('Function('))) {
      errors.push({
        code: 'ZD005',
        message: 'Unsafe transform detected - avoid eval() or Function() in transforms',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'error',
        rule: 'no-unsafe-transforms'
      });
    }

    return errors;
  };

  private readonly checkUseStrictSchemas = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    if (text.includes('z.object({') && !text.includes('.strict()') && !text.includes('.passthrough()')) {
      errors.push({
        code: 'ZD006',
        message: 'Consider using .strict() for better type safety',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'use-strict-schemas',
        suggestion: 'Add .strict() to reject unknown properties'
      });
    }

    return errors;
  };

  private readonly checkUseDescriptiveNames = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (context.schemaInfo.name.length < 3 || /^[a-z]+$/.test(context.schemaInfo.name)) {
      errors.push({
        code: 'ZD007',
        message: 'Schema names should be descriptive and follow naming conventions',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'use-descriptive-names',
        suggestion: 'Use PascalCase and descriptive names (e.g., UserProfileSchema)'
      });
    }

    return errors;
  };

  private readonly checkUseFormatValidation = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for string patterns that should use format validation
    if (text.includes('z.string()') && text.includes('.regex(')) {
      const regexPatterns = [
        { pattern: /email/i, suggestion: 'Use .email() instead of regex for email validation' },
        { pattern: /url|uri/i, suggestion: 'Use .url() instead of regex for URL validation' },
        { pattern: /uuid/i, suggestion: 'Use .uuid() instead of regex for UUID validation' }
      ];

      for (const { pattern, suggestion } of regexPatterns) {
        if (pattern.test(text)) {
          errors.push({
            code: 'ZD008',
            message: 'Use built-in format validation instead of regex',
            file: context.filePath,
            line: node.getStartLineNumber(),
            column: node.getStart() - node.getStartLinePos(),
            severity: 'error',
            rule: 'use-format-validation',
            suggestion
          });
        }
      }
    }

    return errors;
  };

  private readonly checkPreferUnion = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for complex conditional patterns that could use z.union()
    if (text.includes('.or(') || (text.includes('.refine(') && text.includes('||'))) {
      errors.push({
        code: 'ZD012',
        message: 'Consider using z.union() instead of complex conditional logic',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'prefer-union',
        suggestion: 'Use z.union([schema1, schema2]) for cleaner type unions'
      });
    }

    return errors;
  };

  private readonly checkNoExpensiveParsing = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for nested transforms that could be expensive
    if ((text.match(/\.transform\(/g) || []).length > 2) {
      errors.push({
        code: 'ZD009',
        message: 'Multiple nested transforms may impact performance',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'no-expensive-parsing',
        suggestion: 'Consider combining transforms or using preprocessing'
      });
    }

    return errors;
  };

  private readonly checkUseLazySchemas = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    // Check for recursive patterns that should use z.lazy()
    if (text.includes('z.object(') && text.includes(context.schemaInfo.name) && !text.includes('z.lazy(')) {
      errors.push({
        code: 'ZD013',
        message: 'Use z.lazy() for recursive schema definitions',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'warning',
        rule: 'use-lazy-schemas',
        suggestion: 'Wrap recursive references in z.lazy(() => YourSchema)'
      });
    }

    return errors;
  };

  private readonly checkNoEvalInSchemas = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const text = node.getText();

    if (text.includes('eval(') || text.includes('Function(') || text.includes('new Function(')) {
      errors.push({
        code: 'ZD010',
        message: 'Avoid eval() or Function() in schema definitions',
        file: context.filePath,
        line: node.getStartLineNumber(),
        column: node.getStart() - node.getStartLinePos(),
        severity: 'error',
        rule: 'no-eval-in-schemas'
      });
    }

    return errors;
  };

  private readonly checkValidateExternalData = (context: RuleContext, node: Node): ValidationError[] => {
    const errors: ValidationError[] = [];
    const sourceCode = context.sourceCode;

    // Check for external data patterns that should be validated
    const externalDataPatterns = [
      'process.env',
      'req.body',
      'req.query',
      'req.params',
      'JSON.parse',
      'fetch(',
      'axios.',
      'localStorage',
      'sessionStorage'
    ];

    for (const pattern of externalDataPatterns) {
      if (sourceCode.includes(pattern) && !sourceCode.includes('.parse(')) {
        errors.push({
          code: 'ZD014',
          message: `External data source "${pattern}" should be validated with Zod`,
          file: context.filePath,
          line: node.getStartLineNumber(),
          column: node.getStart() - node.getStartLinePos(),
          severity: 'error',
          rule: 'validate-external-data',
          suggestion: 'Use schema.parse() or schema.safeParse() to validate external data'
        });
        break; // Only report once per schema
      }
    }

    return errors;
  };
}