/**
 * @fileoverview Ignore directive parser for zodkit (like biome-ignore, eslint-disable)
 * @module IgnoreParser
 */

export interface IgnoreDirective {
  type: 'file' | 'next-line' | 'line' | 'block-start' | 'block-end';
  rules: string[]; // Empty array means ignore all rules
  line: number;
  column: number;
  range?: { start: number; end: number };
}

export interface IgnoreContext {
  fileIgnored: boolean;
  lineIgnores: Map<number, Set<string>>; // line -> set of ignored rules
  blockIgnores: Array<{ start: number; end: number; rules: Set<string> }>;
}

/**
 * Parse zodkit-ignore directives from source code
 */
export class IgnoreParser {
  private static readonly IGNORE_PATTERNS = {
    // zodkit-ignore-file
    FILE: /^\s*(?:\/\/|\/\*|\*)\s*zodkit-ignore-file\s*(?:\*\/)?\s*$/i,

    // zodkit-ignore-next-line [rule1, rule2]
    NEXT_LINE: /^\s*(?:\/\/|\/\*|\*)\s*zodkit-ignore-next-line(?:\s+([^*\/\r\n]+))?\s*(?:\*\/)?\s*$/i,

    // zodkit-ignore [rule1, rule2]
    LINE: /zodkit-ignore(?:\s+([^*\/\r\n]+))?\s*(?:\*\/)?/i,

    // zodkit-ignore-start [rule1, rule2]
    BLOCK_START: /^\s*(?:\/\/|\/\*|\*)\s*zodkit-ignore-start(?:\s+([^*\/\r\n]+))?\s*(?:\*\/)?\s*$/i,

    // zodkit-ignore-end
    BLOCK_END: /^\s*(?:\/\/|\/\*|\*)\s*zodkit-ignore-end\s*(?:\*\/)?\s*$/i,
  };

  /**
   * Parse ignore directives from source code
   */
  static parseIgnoreDirectives(sourceCode: string): IgnoreContext {
    const lines = sourceCode.split(/\r?\n/);
    const context: IgnoreContext = {
      fileIgnored: false,
      lineIgnores: new Map(),
      blockIgnores: []
    };

    const blockStack: Array<{ start: number; rules: Set<string> }> = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Check for file-level ignore (must be in first few lines)
      if (lineIndex < 10 && line && this.IGNORE_PATTERNS.FILE.test(line)) {
        context.fileIgnored = true;
        continue;
      }

      // Check for next-line ignore
      const nextLineMatch = line?.match(this.IGNORE_PATTERNS.NEXT_LINE);
      if (nextLineMatch) {
        const rules = this.parseRuleList(nextLineMatch[1] || '');
        const targetLine = lineNumber + 1;
        if (!context.lineIgnores.has(targetLine)) {
          context.lineIgnores.set(targetLine, new Set());
        }
        rules.forEach(rule => context.lineIgnores.get(targetLine)!.add(rule));
        continue;
      }

      // Check for line ignore (on same line)
      const lineMatch = line?.match(this.IGNORE_PATTERNS.LINE);
      if (lineMatch) {
        const rules = this.parseRuleList(lineMatch[1] || '');
        if (!context.lineIgnores.has(lineNumber)) {
          context.lineIgnores.set(lineNumber, new Set());
        }
        rules.forEach(rule => context.lineIgnores.get(lineNumber)!.add(rule));
        continue;
      }

      // Check for block start
      const blockStartMatch = line?.match(this.IGNORE_PATTERNS.BLOCK_START);
      if (blockStartMatch) {
        const rules = this.parseRuleList(blockStartMatch[1] || '');
        blockStack.push({
          start: lineNumber,
          rules: new Set(rules)
        });
        continue;
      }

      // Check for block end
      if (line && this.IGNORE_PATTERNS.BLOCK_END.test(line)) {
        const block = blockStack.pop();
        if (block) {
          context.blockIgnores.push({
            start: block.start,
            end: lineNumber,
            rules: block.rules
          });
        }
        continue;
      }
    }

    return context;
  }

  /**
   * Check if a rule should be ignored at a specific location
   */
  static isIgnored(
    context: IgnoreContext,
    ruleName: string,
    line: number
  ): boolean {
    // File-level ignore
    if (context.fileIgnored) {
      return true;
    }

    // Line-level ignore
    const lineIgnores = context.lineIgnores.get(line);
    if (lineIgnores) {
      return lineIgnores.size === 0 || lineIgnores.has(ruleName);
    }

    // Block-level ignore
    for (const block of context.blockIgnores) {
      if (line >= block.start && line <= block.end) {
        return block.rules.size === 0 || block.rules.has(ruleName);
      }
    }

    return false;
  }

  /**
   * Parse comma-separated rule list
   * Examples: "rule1, rule2" -> ["rule1", "rule2"]
   *          "rule1,rule2,rule3" -> ["rule1", "rule2", "rule3"]
   *          "" -> [] (ignore all rules)
   */
  private static parseRuleList(ruleString: string): string[] {
    if (!ruleString?.trim()) {
      return []; // Empty means ignore all rules
    }

    return ruleString
      .split(',')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0);
  }

  /**
   * Generate ignore directive strings for code fixes
   */
  static generateIgnoreDirective(
    type: 'next-line' | 'line' | 'file',
    rules: string[] = []
  ): string {
    const ruleList = rules.length > 0 ? ` ${rules.join(', ')}` : '';

    switch (type) {
      case 'file':
        return `// zodkit-ignore-file`;
      case 'next-line':
        return `// zodkit-ignore-next-line${ruleList}`;
      case 'line':
        return ` // zodkit-ignore${ruleList}`;
      default:
        return '';
    }
  }
}

/**
 * Enhanced validation error with ignore support
 */
export interface ValidationErrorWithIgnore {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  rule: string;
  expected?: string;
  received?: string;
  suggestion?: string;
  ignored: boolean; // Whether this error is ignored by directives
}