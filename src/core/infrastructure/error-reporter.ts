import * as pc from 'picocolors';
import { ValidationResult, ValidationError } from './validator';
import { Config } from './config';

export class ErrorReporter {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async report(result: ValidationResult, outputPath?: string): Promise<boolean> {
    const format = this.config.output?.format || 'pretty';

    let output: string;
    let success: boolean;

    switch (format) {
      case 'json':
        output = this.generateJSON(result);
        success = result.success;
        break;
      case 'junit':
        output = this.generateJUnit(result);
        success = result.success;
        break;
      case 'sarif':
        output = this.generateSARIF(result);
        success = result.success;
        break;
      case 'pretty':
      default:
        return this.reportPretty(result);
    }

    if (outputPath) {
      await this.writeToFile(output, outputPath);
      if (!this.config.output?.verbose) {
        console.log(`Results written to ${outputPath}`);
      }
    } else {
      console.log(output);
    }

    return success;
  }

  private reportPretty(result: ValidationResult): boolean {
    console.log();

    if (result.success) {
      console.log(pc.green('✅ All validations passed!'));
      this.printSummary(result);
      return true;
    }

    // Print errors
    if (result.errors.length > 0) {
      console.log(pc.red('❌ Validation Errors:'));
      console.log();

      for (const error of result.errors) {
        this.printPrettyError(error);
      }
    }

    // Print warnings
    if (result.warnings.length > 0) {
      console.log(pc.yellow('⚠️  Warnings:'));
      console.log();

      for (const warning of result.warnings) {
        this.printPrettyError(warning);
      }
    }

    this.printSummary(result);
    return result.success;
  }

  private printPrettyError(error: ValidationError): void {
    const severityColor = error.severity === 'error' ? pc.red : pc.yellow;

    // File location
    console.log(severityColor(`${error.file}:${error.line}:${error.column} - ${error.severity} ${error.code}: ${error.message}`));

    // Show expected vs received if available
    if (error.expected && error.received) {
      console.log(pc.gray(`    Expected: ${error.expected}`));
      console.log(pc.gray(`    Received: ${error.received}`));
    }

    // Show code context (simulated)
    this.printCodeContext(error);

    // Show suggestion if available
    if (error.suggestion) {
      console.log(pc.blue(`    💡 Suggestion: ${error.suggestion}`));
    }

    console.log();
  }

  private printCodeContext(error: ValidationError): void {
    // For MVP, show a simulated code context
    // In a full implementation, this would read the actual file and show the problematic lines

    const lineNumber = error.line;
    const beforeLine = Math.max(1, lineNumber - 1);
    const afterLine = lineNumber + 1;

    console.log();
    console.log(pc.gray(`    ${beforeLine} |   ---`));
    console.log(pc.gray(`  > ${lineNumber} |   ${this.getSimulatedLine(error)}`));
    console.log(pc.gray(`       |   ${' '.repeat(error.column - 1)}${pc.red('~~~')}`));
    console.log(pc.gray(`    ${afterLine} |   ---`));
  }

  private getSimulatedLine(error: ValidationError): string {
    // Simulate different types of problematic lines based on error code
    switch (error.code) {
      case 'ZV1001':
        return '<!-- Missing frontmatter -->';
      case 'ZV2001':
        return 'datePublished: "invalid-date"';
      case 'ZV2002':
        return 'published: "true" // should be boolean';
      default:
        return '// problematic code here';
    }
  }

  private printSummary(result: ValidationResult): void {
    console.log();
    console.log(pc.bold('Summary:'));
    console.log(`  Files checked: ${result.filesChecked}`);
    console.log(`  Schemas validated: ${result.schemasValidated}`);

    if (result.errors.length > 0) {
      console.log(pc.red(`  Errors: ${result.errors.length}`));
    }

    if (result.warnings.length > 0) {
      console.log(pc.yellow(`  Warnings: ${result.warnings.length}`));
    }

    if (result.success) {
      console.log(pc.green('  Status: ✅ All good!'));
    } else {
      console.log(pc.red('  Status: ❌ Issues found'));
    }
    console.log();
  }

  private generateJSON(result: ValidationResult): string {
    const output = {
      success: result.success,
      timestamp: new Date().toISOString(),
      summary: {
        filesChecked: result.filesChecked,
        schemasValidated: result.schemasValidated,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
      },
      errors: result.errors,
      warnings: result.warnings,
    };

    return JSON.stringify(output, null, 2);
  }

  private generateJUnit(result: ValidationResult): string {
    const testCases = [...result.errors, ...result.warnings].map(error => {
      const isFailure = error.severity === 'error';

      return `    <testcase classname="${error.rule}" name="${error.file}:${error.line}" time="0">
      ${isFailure ? `<failure message="${this.escapeXML(error.message)}" type="${error.code}">
${this.escapeXML(`${error.file}:${error.line}:${error.column} - ${error.message}`)}
      </failure>` : `<skipped message="${this.escapeXML(error.message)}" />`}
    </testcase>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="zodkit" tests="${result.filesChecked}" failures="${result.errors.length}" errors="0" skipped="${result.warnings.length}" time="0" timestamp="${new Date().toISOString()}">
${testCases.join('\n')}
</testsuite>`;
  }

  private generateSARIF(result: ValidationResult): string {
    const rules = this.generateSARIFRules(result);
    const results = [...result.errors, ...result.warnings].map(error => ({
      ruleId: error.code,
      level: error.severity === 'error' ? 'error' : 'warning',
      message: {
        text: error.message,
      },
      locations: [{
        physicalLocation: {
          artifactLocation: {
            uri: error.file,
          },
          region: {
            startLine: error.line,
            startColumn: error.column,
          },
        },
      }],
      properties: {
        rule: error.rule,
        expected: error.expected,
        received: error.received,
        suggestion: error.suggestion,
      },
    }));

    const sarif = {
      version: '2.1.0',
      $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'zodkit',
            version: '1.0.0',
            informationUri: 'https://github.com/JSONbored/zodkit',
            rules,
          },
        },
        results,
        invocations: [{
          executionSuccessful: result.success,
          endTimeUtc: new Date().toISOString(),
        }],
      }],
    };

    return JSON.stringify(sarif, null, 2);
  }

  private generateSARIFRules(result: ValidationResult): Record<string, unknown>[] {
    const ruleMap = new Map<string, Record<string, unknown>>();

    [...result.errors, ...result.warnings].forEach(error => {
      if (!ruleMap.has(error.code)) {
        ruleMap.set(error.code, {
          id: error.code,
          shortDescription: {
            text: this.getSARIFRuleDescription(error.code),
          },
          fullDescription: {
            text: this.getSARIFRuleFullDescription(error.code),
          },
          defaultConfiguration: {
            level: error.severity === 'error' ? 'error' : 'warning',
          },
          helpUri: `https://github.com/JSONbored/zodkit/docs/rules/${error.code.toLowerCase()}`,
        });
      }
    });

    return Array.from(ruleMap.values());
  }

  private getSARIFRuleDescription(code: string): string {
    const descriptions: Record<string, string> = {
      'ZV1001': 'Missing frontmatter',
      'ZV1002': 'No schema found for validation',
      'ZV1003': 'Failed to parse file',
      'ZV2001': 'Required property missing',
      'ZV2002': 'Invalid date format',
      'ZV2003': 'Type mismatch',
    };

    return descriptions[code] ?? 'Schema validation issue';
  }

  private getSARIFRuleFullDescription(code: string): string {
    const descriptions: Record<string, string> = {
      'ZV1001': 'The file is missing required frontmatter metadata',
      'ZV1002': 'No Zod schema was found to validate this content',
      'ZV1003': 'The file could not be parsed due to syntax errors',
      'ZV2001': 'A required property is missing from the data',
      'ZV2002': 'The date format does not match the expected pattern',
      'ZV2003': 'The property type does not match the schema expectation',
    };

    return descriptions[code] ?? 'A schema validation issue was detected';
  }

  private async writeToFile(content: string, filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, content, 'utf-8');
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}