/**
 * @fileoverview Core hint engine for Zod schema best practices and performance
 * @module HintEngine
 */

import { Node, Project, SourceFile, CallExpression, PropertyAccessExpression } from 'ts-morph';
import * as pc from 'picocolors';

export interface Hint {
  id: string;
  severity: 'error' | 'warning' | 'info' | 'performance';
  message: string;
  file: string;
  line: number;
  column: number;
  rule: string;
  fix?: {
    description: string;
    replacement: string;
    range: { start: number; end: number };
  };
  impact?: 'breaking' | 'safe' | 'performance';
  documentation?: string;
}

export interface HintRule {
  id: string;
  name: string;
  description: string;
  severity: Hint['severity'];
  category: 'performance' | 'security' | 'best-practice' | 'simplification';
  check: (node: Node, sourceFile: SourceFile) => Hint | null;
  autoFixable: boolean;
}

export interface HintEngineOptions {
  rules?: string[];
  excludeRules?: string[];
  severity?: Hint['severity'][];
  autoFix?: boolean;
  cache?: boolean;
  configPath?: string;
}

export class HintEngine {
  private project: Project;
  private rules: Map<string, HintRule> = new Map();
  private cache: Map<string, Hint[]> = new Map();
  private options: HintEngineOptions;

  constructor(options: HintEngineOptions = {}) {
    this.options = options;
    this.project = new Project({
      tsConfigFilePath: 'tsconfig.json',
      skipAddingFilesFromTsConfig: true
    });

    this.loadBuiltInRules();
  }

  private loadBuiltInRules(): void {
    // Performance Rules
    this.addRule({
      id: 'prefer-pick-over-omit',
      name: 'Prefer pick over omit for large objects',
      description: 'Using pick() is more performant than omit() when selecting few fields from many',
      severity: 'performance',
      category: 'performance',
      autoFixable: true,
      check: (node: Node) => {
        if (!Node.isCallExpression(node)) return null;

        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return null;

        const property = expression.getName();
        if (property !== 'omit') return null;

        // Check if parent is a Zod object schema
        const parent = expression.getExpression();
        if (!this.isZodSchema(parent)) return null;

        // Get the omit argument
        const args = node.getArguments();
        if (args.length === 0) return null;

        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());

        // Count fields being omitted vs total fields
        // This is simplified - real implementation would analyze the schema structure
        const omittedCount = this.countOmittedFields(args[0]);

        if (omittedCount > 5) {
          return {
            id: 'hint-perf-001',
            severity: 'performance',
            message: `Consider using .pick() instead of .omit() when excluding many fields (${omittedCount} fields omitted)`,
            file: sourceFile.getFilePath(),
            line,
            column,
            rule: 'prefer-pick-over-omit',
            impact: 'performance',
            documentation: 'https://github.com/colinhacks/zod#pick-and-omit'
          };
        }

        return null;
      }
    });

    // Security Rules
    this.addRule({
      id: 'avoid-passthrough-on-input',
      name: 'Avoid passthrough on user input',
      description: 'Using passthrough() on user input can expose your application to security risks',
      severity: 'warning',
      category: 'security',
      autoFixable: true,
      check: (node: Node) => {
        if (!Node.isCallExpression(node)) return null;

        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return null;

        const property = expression.getName();
        if (property !== 'passthrough') return null;

        const parent = expression.getExpression();
        if (!this.isZodSchema(parent)) return null;

        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());

        // Check if this schema is used for input validation
        if (this.isUsedForInput(node)) {
          return {
            id: 'hint-sec-001',
            severity: 'warning',
            message: 'Avoid using .passthrough() on user input - use .strict() or explicitly define all fields',
            file: sourceFile.getFilePath(),
            line,
            column,
            rule: 'avoid-passthrough-on-input',
            fix: {
              description: 'Replace .passthrough() with .strict()',
              replacement: '.strict()',
              range: {
                start: expression.getStart(),
                end: node.getEnd()
              }
            },
            impact: 'safe',
            documentation: 'https://github.com/colinhacks/zod#strict'
          };
        }

        return null;
      }
    });

    // Best Practice Rules
    this.addRule({
      id: 'optional-vs-nullable',
      name: 'Use optional() vs nullable() correctly',
      description: 'Detect potential misuse of optional() and nullable()',
      severity: 'info',
      category: 'best-practice',
      autoFixable: true,
      check: (node: Node) => {
        if (!Node.isCallExpression(node)) return null;

        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return null;

        const property = expression.getName();
        if (property !== 'nullable' && property !== 'optional') return null;

        const parent = expression.getExpression();
        if (!this.isZodSchema(parent)) return null;

        // Check for common patterns that suggest wrong usage
        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());

        // Check if nullable is followed by optional or vice versa
        const nextCall = this.getNextChainedCall(node);
        if (nextCall) {
          const nextProperty = this.getPropertyName(nextCall);

          if ((property === 'nullable' && nextProperty === 'optional') ||
              (property === 'optional' && nextProperty === 'nullable')) {
            return {
              id: 'hint-bp-001',
              severity: 'info',
              message: `Consider using .nullish() instead of .${property}().${nextProperty}()`,
              file: sourceFile.getFilePath(),
              line,
              column,
              rule: 'optional-vs-nullable',
              fix: {
                description: 'Use .nullish() for undefined | null',
                replacement: '.nullish()',
                range: {
                  start: expression.getStart(),
                  end: nextCall.getEnd()
                }
              },
              impact: 'safe'
            };
          }
        }

        return null;
      }
    });

    // Simplification Rules
    this.addRule({
      id: 'use-literal-for-constants',
      name: 'Use z.literal() for constant values',
      description: 'Detect string/number schemas that could be literals',
      severity: 'info',
      category: 'simplification',
      autoFixable: true,
      check: (node: Node) => {
        if (!Node.isCallExpression(node)) return null;

        const expression = node.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) return null;

        const property = expression.getName();
        if (property !== 'refine') return null;

        const parent = expression.getExpression();
        if (!this.isZodStringOrNumber(parent)) return null;

        const args = node.getArguments();
        if (args.length < 1) return null;

        // Check if refinement is checking for exact value
        const refinementText = args[0].getText();
        const exactValueMatch = refinementText.match(/===\s*["'](.+)["']|===\s*(\d+)/);

        if (exactValueMatch) {
          const sourceFile = node.getSourceFile();
          const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
          const value = exactValueMatch[1] || exactValueMatch[2];

          return {
            id: 'hint-simp-001',
            severity: 'info',
            message: `Consider using z.literal(${value}) instead of refinement for exact value`,
            file: sourceFile.getFilePath(),
            line,
            column,
            rule: 'use-literal-for-constants',
            impact: 'safe'
          };
        }

        return null;
      }
    });
  }

  private addRule(rule: HintRule): void {
    this.rules.set(rule.id, rule);
  }

  public async analyzeFile(filePath: string): Promise<Hint[]> {
    // Check cache
    if (this.options.cache && this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const hints: Hint[] = [];

    // Walk through all nodes in the file
    sourceFile.forEachDescendant((node) => {
      for (const rule of this.rules.values()) {
        // Skip if rule is excluded
        if (this.options.excludeRules?.includes(rule.id)) continue;

        // Skip if specific rules are set and this isn't one
        if (this.options.rules && !this.options.rules.includes(rule.id)) continue;

        // Skip if severity doesn't match filter
        if (this.options.severity && !this.options.severity.includes(rule.severity)) continue;

        const hint = rule.check(node, sourceFile);
        if (hint) {
          hints.push(hint);
        }
      }
    });

    // Cache results
    if (this.options.cache) {
      this.cache.set(filePath, hints);
    }

    return hints;
  }

  public async analyzeProject(patterns: string[]): Promise<Map<string, Hint[]>> {
    const results = new Map<string, Hint[]>();

    // Add source files matching patterns
    this.project.addSourceFilesAtPaths(patterns);

    for (const sourceFile of this.project.getSourceFiles()) {
      const hints = await this.analyzeFile(sourceFile.getFilePath());
      if (hints.length > 0) {
        results.set(sourceFile.getFilePath(), hints);
      }
    }

    return results;
  }

  public async applyFixes(hints: Hint[]): Promise<number> {
    let fixedCount = 0;
    const fileChanges = new Map<string, Array<{ hint: Hint; fix: NonNullable<Hint['fix']> }>>();

    // Group fixes by file
    for (const hint of hints) {
      if (hint.fix && this.rules.get(hint.rule)?.autoFixable) {
        const changes = fileChanges.get(hint.file) || [];
        changes.push({ hint, fix: hint.fix });
        fileChanges.set(hint.file, changes);
      }
    }

    // Apply fixes file by file
    for (const [filePath, changes] of fileChanges) {
      const sourceFile = this.project.getSourceFile(filePath);
      if (!sourceFile) continue;

      // Sort changes by position (reverse order to maintain positions)
      changes.sort((a, b) => b.fix.range.start - a.fix.range.start);

      for (const { fix } of changes) {
        sourceFile.replaceText([fix.range.start, fix.range.end], fix.replacement);
        fixedCount++;
      }

      await sourceFile.save();
    }

    return fixedCount;
  }

  // Helper methods
  private isZodSchema(node: Node): boolean {
    const text = node.getText();
    return text.startsWith('z.') || text.includes('z.object') || text.includes('z.string');
  }

  private isZodStringOrNumber(node: Node): boolean {
    const text = node.getText();
    return text.includes('z.string') || text.includes('z.number');
  }

  private isUsedForInput(node: Node): boolean {
    // Check if this schema is used in a parse or safeParse call
    // or if it's in a file/variable that suggests input validation
    const sourceFile = node.getSourceFile();
    const fileName = sourceFile.getBaseName().toLowerCase();

    return fileName.includes('input') ||
           fileName.includes('request') ||
           fileName.includes('dto') ||
           fileName.includes('payload');
  }

  private countOmittedFields(arg: Node): number {
    // Simplified - count array elements or object keys
    const text = arg.getText();
    const matches = text.match(/['"][^'"]+['"]/g);
    return matches ? matches.length : 1;
  }

  private getNextChainedCall(node: CallExpression): CallExpression | null {
    const parent = node.getParent();
    if (Node.isPropertyAccessExpression(parent)) {
      const grandParent = parent.getParent();
      if (Node.isCallExpression(grandParent)) {
        return grandParent;
      }
    }
    return null;
  }

  private getPropertyName(node: CallExpression): string | null {
    const expression = node.getExpression();
    if (Node.isPropertyAccessExpression(expression)) {
      return expression.getName();
    }
    return null;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getRules(): HintRule[] {
    return Array.from(this.rules.values());
  }

  public getRule(id: string): HintRule | undefined {
    return this.rules.get(id);
  }
}