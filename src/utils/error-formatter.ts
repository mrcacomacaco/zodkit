/**
 * @fileoverview Enhanced error formatting with code frames
 * @module ErrorFormatter
 */

import * as pc from 'picocolors';
import { readFileSync, existsSync } from 'fs';
import { ValidationError } from '../core/validator';

/**
 * Options for error formatting
 */
export interface FormatOptions {
  showCodeFrame?: boolean;
  contextLines?: number;
  colors?: boolean;
  relativePaths?: boolean;
  groupByFile?: boolean;
  showSuggestions?: boolean;
}

/**
 * Enhanced error formatter with code frames and suggestions
 */
export class ErrorFormatter {
  private readonly defaultOptions: FormatOptions = {
    showCodeFrame: true,
    contextLines: 3,
    colors: true,
    relativePaths: true,
    groupByFile: true,
    showSuggestions: true
  };

  /**
   * Format validation errors with enhanced display
   */
  formatErrors(errors: ValidationError[], options?: FormatOptions): string {
    const opts = { ...this.defaultOptions, ...options };
    const output: string[] = [];

    if (errors.length === 0) {
      return opts.colors
        ? pc.green('✓ No errors found')
        : '✓ No errors found';
    }

    if (opts.groupByFile) {
      const grouped = this.groupErrorsByFile(errors);
      for (const [file, fileErrors] of grouped) {
        output.push(this.formatFileErrors(file, fileErrors, opts));
      }
    } else {
      for (const error of errors) {
        output.push(this.formatError(error, opts));
      }
    }

    // Add summary
    output.push(this.formatSummary(errors, opts));

    return output.join('\n\n');
  }

  /**
   * Format a single error with code frame
   */
  formatError(error: ValidationError, options: FormatOptions): string {
    const lines: string[] = [];

    // Error header
    const severity = this.formatSeverity(error.severity, options.colors ?? false);
    const location = this.formatLocation(error.file, error.line, error.column, options);
    lines.push(`${severity} ${location}`);

    // Error message
    const message = options.colors
      ? pc.bold(error.message)
      : error.message;
    lines.push(`  ${message}`);

    // Code and rule
    if (error.code) {
      const code = options.colors
        ? pc.gray(`[${error.code}]`)
        : `[${error.code}]`;
      lines.push(`  ${code} ${error.rule}`);
    }

    // Expected vs Received
    if (error.expected || error.received) {
      lines.push('');
      if (error.expected) {
        const expected = options.colors
          ? pc.green(`Expected: ${error.expected}`)
          : `Expected: ${error.expected}`;
        lines.push(`  ${expected}`);
      }
      if (error.received) {
        const received = options.colors
          ? pc.red(`Received: ${error.received}`)
          : `Received: ${error.received}`;
        lines.push(`  ${received}`);
      }
    }

    // Code frame
    if (options.showCodeFrame) {
      const frame = this.generateCodeFrame(
        error.file,
        error.line,
        error.column,
        options.contextLines ?? 3,
        options.colors ?? true
      );
      if (frame) {
        lines.push('');
        lines.push(frame);
      }
    }

    // Suggestion
    if (options.showSuggestions && error.suggestion) {
      lines.push('');
      const suggestion = options.colors
        ? `  ${pc.cyan('→')} ${error.suggestion}`
        : `  → ${error.suggestion}`;
      lines.push(suggestion);
    }

    return lines.join('\n');
  }

  /**
   * Generate a code frame showing the error location
   */
  generateCodeFrame(
    filePath: string,
    errorLine: number,
    errorColumn: number,
    contextLines: number,
    useColors: boolean
  ): string | null {
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      const startLine = Math.max(1, errorLine - contextLines);
      const endLine = Math.min(lines.length, errorLine + contextLines);

      const frame: string[] = [];
      const lineNumberWidth = String(endLine).length;

      for (let i = startLine; i <= endLine; i++) {
        const line = lines[i - 1];
        const lineNumber = String(i).padStart(lineNumberWidth, ' ');
        const isErrorLine = i === errorLine;

        if (isErrorLine && useColors) {
          // Highlight error line
          frame.push(`${pc.red('>')} ${pc.gray(lineNumber)} │ ${pc.bgRed(line)}`);

          // Add pointer to error column
          if (errorColumn > 0) {
            const pointer = ' '.repeat(lineNumberWidth + errorColumn + 3) + '^';
            frame.push(useColors ? pc.red(pointer) : pointer);
          }
        } else {
          const prefix = isErrorLine ? '>' : ' ';
          const lineStr = useColors
            ? `${prefix} ${pc.gray(lineNumber)} │ ${line}`
            : `${prefix} ${lineNumber} │ ${line}`;
          frame.push(lineStr);
        }
      }

      return frame.join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Format errors grouped by file
   */
  private formatFileErrors(
    file: string,
    errors: ValidationError[],
    options: FormatOptions
  ): string {
    const lines: string[] = [];

    // File header
    const filePath = options.relativePaths
      ? this.getRelativePath(file)
      : file;
    const header = options.colors
      ? pc.underline(pc.cyan(filePath))
      : filePath;
    lines.push(header);

    // Sort errors by line number
    const sorted = errors.sort((a, b) => a.line - b.line);

    for (const error of sorted) {
      const errorStr = this.formatError(error, {
        ...options,
        groupByFile: false // Avoid recursion
      });
      lines.push(this.indent(errorStr, 2));
    }

    return lines.join('\n');
  }

  /**
   * Format severity indicator
   */
  private formatSeverity(severity: 'error' | 'warning', useColors: boolean): string {
    if (!useColors) {
      return severity === 'error' ? 'ERROR' : 'WARNING';
    }

    return severity === 'error'
      ? pc.bgRed(pc.white(' ERROR '))
      : pc.bgYellow(pc.black(' WARNING '));
  }

  /**
   * Format file location
   */
  private formatLocation(
    file: string,
    line: number,
    column: number,
    options: FormatOptions
  ): string {
    const filePath = options.relativePaths
      ? this.getRelativePath(file)
      : file;

    const location = `${filePath}:${line}:${column}`;
    return options.colors ? pc.gray(location) : location;
  }

  /**
   * Format error summary
   */
  private formatSummary(errors: ValidationError[], options: FormatOptions): string {
    const errorCount = errors.filter(e => e.severity === 'error').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;

    const parts: string[] = [];

    if (errorCount > 0) {
      const errorText = `${errorCount} error${errorCount === 1 ? '' : 's'}`;
      parts.push(options.colors ? pc.red(errorText) : errorText);
    }

    if (warningCount > 0) {
      const warningText = `${warningCount} warning${warningCount === 1 ? '' : 's'}`;
      parts.push(options.colors ? pc.yellow(warningText) : warningText);
    }

    const summary = parts.join(', ');
    return options.colors
      ? pc.bold(`Found ${summary}`)
      : `Found ${summary}`;
  }

  /**
   * Group errors by file
   */
  private groupErrorsByFile(errors: ValidationError[]): Map<string, ValidationError[]> {
    const grouped = new Map<string, ValidationError[]>();

    for (const error of errors) {
      const fileErrors = grouped.get(error.file) ?? [];
      fileErrors.push(error);
      grouped.set(error.file, fileErrors);
    }

    return grouped;
  }

  /**
   * Get relative path from current working directory
   */
  private getRelativePath(absolutePath: string): string {
    const cwd = process.cwd();
    if (absolutePath.startsWith(cwd)) {
      return absolutePath.slice(cwd.length + 1);
    }
    return absolutePath;
  }

  /**
   * Indent text by specified spaces
   */
  private indent(text: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return text
      .split('\n')
      .map(line => indent + line)
      .join('\n');
  }

  /**
   * Format errors as JSON for CI/CD
   */
  formatAsJSON(errors: ValidationError[]): string {
    return JSON.stringify(errors, null, 2);
  }

  /**
   * Format errors as SARIF for GitHub Actions
   */
  formatAsSARIF(errors: ValidationError[]): string {
    const sarif = {
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'zodkit',
            version: '1.0.0',
            informationUri: 'https://github.com/JSONbored/zodkit'
          }
        },
        results: errors.map(error => ({
          level: error.severity === 'error' ? 'error' : 'warning',
          message: {
            text: error.message
          },
          locations: [{
            physicalLocation: {
              artifactLocation: {
                uri: error.file
              },
              region: {
                startLine: error.line,
                startColumn: error.column
              }
            }
          }],
          ruleId: error.code,
          ruleIndex: 0
        }))
      }]
    };

    return JSON.stringify(sarif, null, 2);
  }

  /**
   * Format errors as JUnit XML for CI systems
   */
  formatAsJUnit(errors: ValidationError[]): string {
    const testsuites = errors.reduce((acc, error) => {
      const file = error.file;
      if (!acc[file]) {
        acc[file] = [];
      }
      acc[file].push(error);
      return acc;
    }, {} as Record<string, ValidationError[]>);

    const xml: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuites>'
    ];

    for (const [file, fileErrors] of Object.entries(testsuites)) {
      xml.push(`  <testsuite name="${this.escapeXml(file)}" tests="${fileErrors.length}" errors="${fileErrors.filter(e => e.severity === 'error').length}" failures="0">`);

      for (const error of fileErrors) {
        xml.push(`    <testcase name="${this.escapeXml(error.rule)}" classname="${this.escapeXml(file)}">`);
        if (error.severity === 'error') {
          xml.push(`      <error message="${this.escapeXml(error.message)}" type="${error.code}">`);
          xml.push(`        ${this.escapeXml(`Line ${error.line}, Column ${error.column}`)}`);
          if (error.suggestion) {
            xml.push(`        Suggestion: ${this.escapeXml(error.suggestion)}`);
          }
          xml.push('      </error>');
        }
        xml.push('    </testcase>');
      }

      xml.push('  </testsuite>');
    }

    xml.push('</testsuites>');
    return xml.join('\n');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}