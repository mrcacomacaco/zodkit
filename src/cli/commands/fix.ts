import * as pc from 'picocolors';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { basename } from 'path';
import { ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/schema-discovery';
import { Validator } from '../../core/validator';
import { ValidationError, ValidationResult } from '../../core/validator';

export interface FixOptions {
  config?: string;
  unsafe?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  backup?: boolean;
  diff?: boolean;
  verbose?: boolean;
}

interface FixableIssue {
  error: ValidationError;
  fix: SchemaFix;
  confidence: 'high' | 'medium' | 'low';
  description: string;
}

interface SchemaFix {
  type: 'add-property' | 'fix-type' | 'fix-format' | 'add-frontmatter' | 'update-schema';
  target: 'file' | 'schema';
  filePath: string;
  changes: FileChange[];
}

interface FileChange {
  line: number;
  column: number;
  originalText: string;
  newText: string;
  reason: string;
}

export async function fixCommand(options: FixOptions): Promise<void> {
  try {
    console.log(pc.blue('🔧 zodkit fix - Auto-fixing schema validation issues...'));

    // Load configuration
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig(options.config);

    // Initialize core components
    const schemaDiscovery = new SchemaDiscovery(config);
    const validator = new Validator(config);

    // Run validation to find issues
    console.log(pc.gray('🔍 Analyzing issues...'));
    const schemas = await schemaDiscovery.findSchemas();
    const results = await validator.validate(schemas);

    if (results.success) {
      console.log(pc.green('✅ No issues found to fix!'));
      return;
    }

    // Analyze which issues can be fixed
    const fixableIssues = analyzeFixableIssues(results, options.unsafe ?? false);

    if (fixableIssues.length === 0) {
      console.log(pc.yellow('⚠️  No automatically fixable issues found.'));
      console.log('Run `zodkit check` for details on manual fixes needed.');
      return;
    }

    console.log(pc.blue(`\n🔍 Found ${fixableIssues.length} fixable issue(s):`));

    // Group issues by confidence level
    const highConfidence = fixableIssues.filter(issue => issue.confidence === 'high');
    const mediumConfidence = fixableIssues.filter(issue => issue.confidence === 'medium');
    const lowConfidence = fixableIssues.filter(issue => issue.confidence === 'low');

    console.log(`  ${pc.green('High confidence:')} ${highConfidence.length}`);
    console.log(`  ${pc.yellow('Medium confidence:')} ${mediumConfidence.length}`);
    console.log(`  ${pc.red('Low confidence:')} ${lowConfidence.length}`);

    // Interactive mode - ask user which fixes to apply
    let issuesToFix: FixableIssue[] = [];

    if (options.interactive) {
      issuesToFix = await selectInteractiveFixes(fixableIssues);
    } else {
      // Auto-select based on confidence and unsafe flag
      issuesToFix = [...highConfidence];

      if (options.unsafe) {
        issuesToFix.push(...mediumConfidence, ...lowConfidence);
      } else {
        // Only include medium confidence if user confirms
        if (mediumConfidence.length > 0) {
          const answer = await inquirer.prompt([{
            type: 'confirm',
            name: 'includeMedium',
            message: `Apply ${mediumConfidence.length} medium confidence fix(es)?`,
            default: false
          }]);

          if (answer.includeMedium) {
            issuesToFix.push(...mediumConfidence);
          }
        }
      }
    }

    if (issuesToFix.length === 0) {
      console.log(pc.yellow('No fixes selected. Exiting.'));
      return;
    }

    // Show diff if requested
    if (options.diff) {
      showDiff(issuesToFix);

      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with these changes?',
        default: true
      }]);

      if (!answer.proceed) {
        console.log(pc.yellow('Cancelled.'));
        return;
      }
    }

    // Apply fixes
    if (options.dryRun) {
      console.log(pc.blue('\n📋 Dry run - showing what would be changed:'));
      showDryRun(issuesToFix);
    } else {
      applyFixes(issuesToFix, options);
    }

    // Run validation again to show results
    if (!options.dryRun) {
      console.log(pc.blue('\n🔍 Running validation after fixes...'));
      const newResults = await validator.validate(schemas);

      const fixedCount = results.errors.length - newResults.errors.length;
      if (fixedCount > 0) {
        console.log(pc.green(`✅ Fixed ${fixedCount} issue(s)!`));
      }

      if (newResults.errors.length > 0) {
        console.log(pc.yellow(`⚠️  ${newResults.errors.length} issue(s) still remain.`));
        console.log('Run `zodkit check` for details on remaining issues.');
      } else {
        console.log(pc.green('🎉 All issues have been resolved!'));
      }
    }

  } catch (error) {
    console.error(pc.red('❌ Fix command failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function analyzeFixableIssues(results: ValidationResult, allowUnsafe: boolean): FixableIssue[] {
  const fixableIssues: FixableIssue[] = [];

  for (const error of results.errors) {
    const fixes = generateFixesForError(error, allowUnsafe);
    fixableIssues.push(...fixes);
  }

  return fixableIssues;
}

function generateFixesForError(error: ValidationError, allowUnsafe: boolean): FixableIssue[] {
  const fixes: FixableIssue[] = [];

  switch (error.code) {
    case 'ZV1001': // Missing frontmatter
      fixes.push({
        error,
        fix: {
          type: 'add-frontmatter',
          target: 'file',
          filePath: error.file,
          changes: [{
            line: 1,
            column: 1,
            originalText: '',
            newText: generateDefaultFrontmatter(),
            reason: 'Add basic frontmatter structure'
          }]
        },
        confidence: 'high',
        description: 'Add basic frontmatter to MDX file'
      });
      break;

    case 'ZV2001': // Required property missing
      if (error.expected && error.received === 'undefined') {
        fixes.push({
          error,
          fix: {
            type: 'add-property',
            target: 'file',
            filePath: error.file,
            changes: [{
              line: error.line,
              column: error.column,
              originalText: '',
              newText: generatePropertyValue(error.message, error.expected),
              reason: `Add missing required property`
            }]
          },
          confidence: 'medium',
          description: `Add missing property: ${extractPropertyName(error.message)}`
        });
      }
      break;

    case 'ZV2002': // Invalid date format
      if (error.received && error.expected?.includes('ISO')) {
        const fixedDate = fixDateFormat(error.received);
        if (fixedDate) {
          fixes.push({
            error,
            fix: {
              type: 'fix-format',
              target: 'file',
              filePath: error.file,
              changes: [{
                line: error.line,
                column: error.column,
                originalText: error.received,
                newText: fixedDate,
                reason: 'Fix date format to YYYY-MM-DD'
              }]
            },
            confidence: 'high',
            description: `Fix date format: ${error.received} → ${fixedDate}`
          });
        }
      }
      break;

    case 'ZV2003': // Type mismatch
      if (error.expected && error.received) {
        const fixedValue = fixTypeValue(error.received, error.expected);
        if (fixedValue && (allowUnsafe || isTypeSafeConversion(error.received, error.expected))) {
          fixes.push({
            error,
            fix: {
              type: 'fix-type',
              target: 'file',
              filePath: error.file,
              changes: [{
                line: error.line,
                column: error.column,
                originalText: `"${error.received}"`,
                newText: fixedValue,
                reason: `Convert ${error.received} to ${error.expected}`
              }]
            },
            confidence: isTypeSafeConversion(error.received, error.expected) ? 'high' : 'low',
            description: `Fix type: ${error.received} (${typeof error.received}) → ${error.expected}`
          });
        }
      }
      break;
  }

  return fixes;
}

function generateDefaultFrontmatter(): string {
  return `---
title: "Untitled"
description: "Add description here"
date: "${new Date().toISOString().split('T')[0]}"
published: false
---

`;
}

function generatePropertyValue(errorMessage: string, expectedType: string): string {
  const propertyName = extractPropertyName(errorMessage);

  switch (expectedType) {
    case 'string':
      return `${propertyName}: ""`;
    case 'boolean':
      return `${propertyName}: false`;
    case 'number':
      return `${propertyName}: 0`;
    case 'array':
      return `${propertyName}: []`;
    default:
      return `${propertyName}: null`;
  }
}

function extractPropertyName(errorMessage: string): string {
  const match = errorMessage.match(/Property "([^"]+)"/);
  const propertyName = match?.[1];
  return propertyName ?? 'unknown';
}

function fixDateFormat(dateString: string): string | null {
  // Try to parse various date formats and convert to YYYY-MM-DD
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return null;
  }

  const isoString = date.toISOString();
  const datePart = isoString.split('T')[0];
  return datePart ?? null;
}

function fixTypeValue(value: string, expectedType: string): string | null {
  switch (expectedType) {
    case 'boolean':
      if (value === 'true' || value === 'false') {
        return value; // Already boolean string
      }
      if (value === 'yes' || value === 'on' || value === '1') {
        return 'true';
      }
      if (value === 'no' || value === 'off' || value === '0') {
        return 'false';
      }
      break;

    case 'number':
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toString();
      }
      break;

    case 'string':
      return `"${value}"`;
  }

  return null;
}

function isTypeSafeConversion(value: string, targetType: string): boolean {
  switch (targetType) {
    case 'boolean':
      return ['true', 'false', 'yes', 'no', 'on', 'off', '1', '0'].includes(value.toLowerCase());
    case 'number':
      return !isNaN(parseFloat(value));
    case 'string':
      return true;
    default:
      return false;
  }
}

async function selectInteractiveFixes(fixableIssues: FixableIssue[]): Promise<FixableIssue[]> {
  console.log(pc.blue('\n🎯 Interactive fix selection:'));

  const choices = fixableIssues.map((issue, index) => ({
    name: `${getConfidenceIcon(issue.confidence)} ${issue.description} (${issue.error.file}:${issue.error.line})`,
    value: index,
    checked: issue.confidence === 'high'
  }));

  const answers = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedFixes',
    message: 'Select fixes to apply:',
    choices,
    pageSize: 10
  }]);

  return (answers.selectedFixes as number[]).map((index: number) => fixableIssues[index]).filter((issue): issue is FixableIssue => issue !== undefined);
}

function getConfidenceIcon(confidence: string): string {
  switch (confidence) {
    case 'high': return pc.green('✓');
    case 'medium': return pc.yellow('⚠');
    case 'low': return pc.red('⚡');
    default: return '?';
  }
}

function showDiff(issuesToFix: FixableIssue[]): void {
  console.log(pc.blue('\n📊 Preview of changes:'));

  for (const issue of issuesToFix) {
    console.log(`\n${pc.bold(issue.error.file)}:${issue.error.line}`);
    console.log(pc.gray(`${issue.description}`));

    for (const change of issue.fix.changes) {
      if (change.originalText) {
        console.log(pc.red(`- ${change.originalText}`));
      }
      console.log(pc.green(`+ ${change.newText}`));
    }
  }
}

function showDryRun(issuesToFix: FixableIssue[]): void {
  console.log(pc.blue('\n📋 Dry run results:\n'));

  const fileChanges = new Map<string, FixableIssue[]>();

  // Group changes by file
  for (const issue of issuesToFix) {
    const filePath = issue.fix.filePath;
    if (!fileChanges.has(filePath)) {
      fileChanges.set(filePath, []);
    }
    fileChanges.get(filePath)!.push(issue);
  }

  // Display changes by file
  for (const [filePath, issues] of fileChanges) {
    console.log(pc.bold(filePath));
    for (const issue of issues) {
      console.log(`  ${getConfidenceIcon(issue.confidence)} ${issue.description}`);
      for (const change of issue.fix.changes) {
        console.log(pc.gray(`    Line ${change.line}: ${change.reason}`));
        if (change.originalText) {
          console.log(pc.red(`    - ${change.originalText}`));
        }
        console.log(pc.green(`    + ${change.newText}`));
      }
    }
    console.log();
  }

  console.log(pc.blue(`Total: ${issuesToFix.length} fix(es) would be applied`));
}

function applyFixes(issuesToFix: FixableIssue[], options: FixOptions): void {
  console.log(pc.blue('\n🔧 Applying fixes...'));

  const fileChanges = new Map<string, FixableIssue[]>();

  // Group changes by file
  for (const issue of issuesToFix) {
    const filePath = issue.fix.filePath;
    if (!fileChanges.has(filePath)) {
      fileChanges.set(filePath, []);
    }
    fileChanges.get(filePath)!.push(issue);
  }

  // Apply changes to each file
  for (const [filePath, issues] of fileChanges) {
    applyFixesToFile(filePath, issues, options);
  }

  console.log(pc.green(`✅ Applied ${issuesToFix.length} fix(es)`));
}

function applyFixesToFile(filePath: string, issues: FixableIssue[], options: FixOptions): void {
  // Create backup if requested
  if (options.backup) {
    const backupPath = `${filePath}.zodkit-backup`;
    copyFileSync(filePath, backupPath);
    if (options.verbose) {
      console.log(pc.gray(`Created backup: ${backupPath}`));
    }
  }

  // Read current file content
  let content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Apply changes (sort by line number in reverse order to maintain line positions)
  const sortedIssues = issues.sort((a, b) => {
    const aFirstChange = a.fix.changes[0];
    const bFirstChange = b.fix.changes[0];
    if (!aFirstChange || !bFirstChange) return 0;
    return bFirstChange.line - aFirstChange.line;
  });

  for (const issue of sortedIssues) {
    for (const change of issue.fix.changes) {
      if (change.line === 1 && change.originalText === '') {
        // Adding frontmatter at the beginning
        lines.unshift(...change.newText.split('\n'));
      } else if (change.line <= lines.length) {
        const lineIndex = change.line - 1;
        const currentLine = lines[lineIndex];
        if (!currentLine) continue;

        if (change.originalText) {
          // Replace existing text
          lines[lineIndex] = currentLine.replace(change.originalText, change.newText);
        } else {
          // Add new property - this is a simplified implementation
          // In a real scenario, we'd need more sophisticated YAML/frontmatter parsing
          lines.splice(lineIndex, 0, change.newText);
        }
      }
    }
  }

  // Write modified content back to file
  const newContent = lines.join('\n');
  writeFileSync(filePath, newContent);

  if (options.verbose) {
    console.log(pc.green(`✅ Fixed ${basename(filePath)}`));
  }
}