import * as pc from 'picocolors';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import fg from 'fast-glob';
import { RefactorAssistant, RefactorOptions, RefactorOperation } from '../../core/refactor-assistant';
import { SchemaRefactoringAssistant, RefactoringOptions } from '../../core/schema-refactoring';

export interface RefactorCommandOptions {
  schema?: string;
  operation?: 'rename' | 'add-field' | 'remove-field' | 'change-type' | 'split' | 'merge' | 'extract-union';
  target?: string;
  newName?: string;
  fieldName?: string;
  fieldType?: string;
  analyze?: boolean;
  suggest?: boolean;
  plan?: boolean;
  execute?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  backup?: boolean;
  safeMode?: boolean;
  confidence?: number;
  force?: boolean;
  // New smart refactoring options
  smart?: boolean;
  auto?: boolean;
  category?: 'performance' | 'maintainability' | 'type_safety' | 'consistency' | 'modernization' | 'all';
  impact?: boolean;
  aggressive?: boolean;
  output?: string;
}

export async function refactorCommand(options: RefactorCommandOptions): Promise<void> {
  try {
    console.log(pc.blue('🔧 zodkit refactor - Smart Schema Refactoring Assistant'));

    const assistant = new RefactorAssistant();
    const smartAssistant = new SchemaRefactoringAssistant();
    const projectPath = resolve('.');

    // Smart refactoring mode - comprehensive analysis and suggestions
    if (options.smart || options.auto || options.category || options.impact) {
      await handleSmartRefactoring(smartAssistant, options);
      return;
    }

    // Suggest mode - analyze and suggest refactoring opportunities
    if (options.suggest || (!options.schema && !options.analyze && !options.plan && !options.execute)) {
      console.log(pc.cyan('\n🧠 Analyzing schemas for refactoring opportunities...'));

      if (options.schema) {
        const suggestions = await assistant.suggestRefactorOperations(options.schema, projectPath);

        if (suggestions.length === 0) {
          console.log(pc.green(`✅ No refactoring suggestions for ${options.schema}`));
          return;
        }

        console.log(pc.yellow(`\n💡 Found ${suggestions.length} refactoring suggestions for ${options.schema}:\n`));

        suggestions.forEach((suggestion, index) => {
          const riskColor = suggestion.risk === 'high' ? pc.red :
                           suggestion.risk === 'medium' ? pc.yellow : pc.green;
          const automationIcon = suggestion.automation === 'full' ? '🤖' :
                                suggestion.automation === 'partial' ? '🔄' : '👤';

          console.log(`${index + 1}. ${automationIcon} ${suggestion.description}`);
          console.log(`   ${pc.gray('Type:')} ${suggestion.type}`);
          console.log(`   ${pc.gray('Risk:')} ${riskColor(suggestion.risk)}`);
          console.log(`   ${pc.gray('Confidence:')} ${Math.round(suggestion.confidence * 100)}%`);
          console.log(`   ${pc.gray('Automation:')} ${suggestion.automation}`);
          if (suggestion.preview) {
            console.log(`   ${pc.gray('Preview:')}\n${pc.dim(suggestion.preview.split('\n').map(l => `     ${l}`).join('\n'))}`);
          }
          console.log('');
        });

        console.log(pc.blue('Next steps:'));
        console.log(`  ${pc.gray('$')} zodkit refactor --schema ${options.schema} --analyze    # Analyze impact`);
        console.log(`  ${pc.gray('$')} zodkit refactor --schema ${options.schema} --plan       # Create refactor plan`);
        console.log(`  ${pc.gray('$')} zodkit refactor --schema ${options.schema} --execute    # Execute refactoring`);

      } else {
        console.log(pc.yellow('⚠️  Please specify a schema name to analyze:'));
        console.log(`  ${pc.gray('$')} zodkit refactor --suggest --schema UserSchema`);
      }
      return;
    }

    // Analyze mode - show impact analysis for specific operation
    if (options.analyze) {
      if (!options.schema || !options.operation) {
        console.log(pc.red('❌ Schema name and operation required for analysis'));
        console.log(`  ${pc.gray('$')} zodkit refactor --analyze --schema UserSchema --operation rename --new-name UserProfile`);
        return;
      }

      console.log(pc.cyan(`\n📊 Analyzing impact of ${options.operation} on ${options.schema}...`));

      const operation = createOperationFromOptions(options);
      const impact = await assistant.analyzeRefactorImpact(options.schema, operation, projectPath);

      console.log(pc.yellow(`\n📈 Impact Analysis:`));
      console.log(`   ${pc.gray('Affected files:')} ${impact.affectedFiles.length}`);
      console.log(`   ${pc.gray('Breaking changes:')} ${impact.breakingChanges.length}`);
      console.log(`   ${pc.gray('Safe migrations:')} ${impact.safeMigrations.length}`);
      console.log(`   ${pc.gray('Test updates needed:')} ${impact.testUpdates.length}`);
      console.log(`   ${pc.gray('Import updates:')} ${impact.importUpdates.length}`);
      console.log(`   ${pc.gray('Risk score:')} ${getRiskColor(impact.riskScore)}${Math.round(impact.riskScore * 100)}%`);
      console.log(`   ${pc.gray('Estimated time:')} ${impact.estimatedTime}`);
      console.log(`   ${pc.gray('Confidence:')} ${Math.round(impact.confidence * 100)}%`);

      if (impact.affectedFiles.length > 0) {
        console.log(pc.cyan('\n📁 Affected Files:'));
        impact.affectedFiles.forEach(file => {
          console.log(`   ${pc.gray('•')} ${file}`);
        });
      }

      if (impact.breakingChanges.length > 0) {
        console.log(pc.red('\n⚠️  Breaking Changes:'));
        impact.breakingChanges.forEach(change => {
          const fixIcon = change.canAutoFix ? '🔧' : '👤';
          console.log(`   ${fixIcon} ${change.file}:${change.line}:${change.column}`);
          console.log(`     ${pc.red(change.description)}`);
          console.log(`     ${pc.gray('→')} ${change.suggestion}`);
        });
      }

      if (impact.safeMigrations.length > 0) {
        console.log(pc.green('\n✅ Safe Migrations:'));
        impact.safeMigrations.forEach(migration => {
          console.log(`   ${pc.green('•')} ${migration.file}: ${migration.operation} (${Math.round(migration.confidence * 100)}% confidence)`);
        });
      }

      console.log(pc.blue('\nNext steps:'));
      console.log(`  ${pc.gray('$')} zodkit refactor --plan --schema ${options.schema} --operation ${options.operation}    # Create execution plan`);

      return;
    }

    // Plan mode - create detailed refactor plan
    if (options.plan) {
      if (!options.schema || !options.operation) {
        console.log(pc.red('❌ Schema name and operation required for planning'));
        return;
      }

      console.log(pc.cyan(`\n📋 Creating refactor plan for ${options.schema}...`));

      const operation = createOperationFromOptions(options);
      const plan = await assistant.createRefactorPlan([operation], projectPath);

      console.log(pc.yellow(`\n🗺️  Refactor Plan:`));
      console.log(`   ${pc.gray('Operations:')} ${plan.operations.length}`);
      console.log(`   ${pc.gray('Dependencies:')} ${plan.dependencies.length}`);
      console.log(`   ${pc.gray('Timeline steps:')} ${plan.timeline.length}`);
      console.log(`   ${pc.gray('Overall risk:')} ${getRiskColor(plan.impact.riskScore)}${Math.round(plan.impact.riskScore * 100)}%`);
      console.log(`   ${pc.gray('Estimated time:')} ${plan.impact.estimatedTime}`);

      console.log(pc.cyan('\n📅 Execution Timeline:'));
      plan.timeline.forEach((step, index) => {
        const parallelIcon = step.parallel ? '⚡' : '🔄';
        console.log(`   ${index + 1}. ${parallelIcon} ${step.operation.description}`);
        console.log(`      ${pc.gray('Dependencies:')} ${step.dependencies.length > 0 ? step.dependencies.join(', ') : 'None'}`);
        console.log(`      ${pc.gray('Estimated time:')} ${step.estimatedTime} minutes`);
      });

      if (plan.dependencies.length > 0) {
        console.log(pc.cyan('\n🔗 Dependencies:'));
        plan.dependencies.forEach(dep => {
          console.log(`   ${pc.gray('•')} ${dep.from} → ${dep.to}: ${dep.reason}`);
        });
      }

      console.log(pc.cyan('\n🔙 Rollback Plan:'));
      plan.rollbackPlan.forEach((step, index) => {
        console.log(`   ${index + 1}. ${step.description}`);
        console.log(`      ${pc.gray('Command:')} ${step.command}`);
      });

      console.log(pc.blue('\nNext steps:'));
      console.log(`  ${pc.gray('$')} zodkit refactor --execute --schema ${options.schema} --operation ${options.operation}    # Execute plan`);
      console.log(`  ${pc.gray('$')} zodkit refactor --execute --dry-run                                                      # Simulate execution`);

      return;
    }

    // Execute mode - perform the refactoring
    if (options.execute) {
      if (!options.schema || !options.operation) {
        console.log(pc.red('❌ Schema name and operation required for execution'));
        return;
      }

      const operation = createOperationFromOptions(options);
      const plan = await assistant.createRefactorPlan([operation], projectPath);

      if (options.dryRun) {
        console.log(pc.cyan(`\n🎭 Simulating refactor execution (dry run)...`));
      } else {
        console.log(pc.cyan(`\n🚀 Executing refactor plan...`));
      }

      // Show risk warning for high-risk operations
      if (plan.impact.riskScore > 0.7 && !options.force) {
        console.log(pc.red(`\n⚠️  HIGH RISK OPERATION (${Math.round(plan.impact.riskScore * 100)}% risk score)`));
        console.log(pc.yellow('This refactoring has a high risk of breaking changes.'));
        console.log(pc.yellow('Consider running with --dry-run first or use --force to proceed.'));
        return;
      }

      const refactorOptions: RefactorOptions = {
        backup: options.backup !== false, // Default to true
        safeMode: options.safeMode !== false, // Default to true
        preserveComments: true,
        updateImports: true,
        updateTests: true,
        confidence: options.confidence || 0.8
      };

      if (options.dryRun !== undefined) {
        refactorOptions.dryRun = options.dryRun;
      }
      if (options.interactive !== undefined) {
        refactorOptions.interactive = options.interactive;
      }

      const result = await assistant.executeRefactorPlan(plan, refactorOptions);

      if (result.success) {
        console.log(pc.green(`\n✅ Refactor completed successfully!`));
        console.log(`   ${pc.gray('Files analyzed:')} ${result.metrics.filesAnalyzed}`);
        console.log(`   ${pc.gray('Files modified:')} ${result.metrics.filesModified}`);
        console.log(`   ${pc.gray('Lines changed:')} ${result.metrics.linesChanged}`);
        console.log(`   ${pc.gray('Duration:')} ${Math.round(result.metrics.duration / 1000)}s`);

        if (result.filesChanged.length > 0) {
          console.log(pc.cyan('\n📝 Modified Files:'));
          result.filesChanged.forEach(file => {
            console.log(`   ${pc.green('✓')} ${file}`);
          });
        }

        if (result.warnings.length > 0) {
          console.log(pc.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach(warning => {
            console.log(`   ${pc.yellow('•')} ${warning}`);
          });
        }
      } else {
        console.log(pc.red(`\n❌ Refactor failed!`));

        if (result.errors.length > 0) {
          console.log(pc.red('Errors:'));
          result.errors.forEach(error => {
            console.log(`   ${pc.red('•')} ${error}`);
          });
        }

        console.log(pc.cyan('\n🔙 Rollback Plan Available:'));
        result.rollbackPlan.forEach((step, index) => {
          console.log(`   ${index + 1}. ${step.description}`);
          console.log(`      ${pc.gray('$')} ${step.command}`);
        });
      }

      console.log(pc.blue('\nNext steps:'));
      console.log(`  ${pc.gray('$')} zodkit check                    # Verify schemas are valid`);
      console.log(`  ${pc.gray('$')} npm test                        # Run tests to verify changes`);

      return;
    }

    // Default: show usage
    console.log(pc.yellow('Usage:'));
    console.log(`  ${pc.gray('$')} zodkit refactor --suggest --schema UserSchema               # Get refactoring suggestions`);
    console.log(`  ${pc.gray('$')} zodkit refactor --analyze --schema UserSchema --operation rename --new-name UserProfile`);
    console.log(`  ${pc.gray('$')} zodkit refactor --plan --schema UserSchema --operation add-field --field-name email --field-type string`);
    console.log(`  ${pc.gray('$')} zodkit refactor --execute --schema UserSchema --operation remove-field --field-name deprecated`);
    console.log(`  ${pc.gray('$')} zodkit refactor --execute --dry-run                         # Simulate execution`);

  } catch (error) {
    console.error(pc.red('❌ Refactor command failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function createOperationFromOptions(options: RefactorCommandOptions): RefactorOperation {
  const operation: RefactorOperation = {
    type: options.operation === 'split' ? 'split-schema' : options.operation === 'merge' ? 'merge-schemas' : options.operation!,
    target: options.target || options.schema!,
    description: generateOperationDescription(options),
    confidence: options.confidence || 0.8,
    risk: determineRisk(options.operation!),
    automation: determineAutomation(options.operation!),
    preview: 'Preview will be generated based on analysis'
  };

  return operation;
}

function generateOperationDescription(options: RefactorCommandOptions): string {
  switch (options.operation) {
    case 'rename':
      return `Rename ${options.schema} to ${options.newName}`;
    case 'add-field':
      return `Add field '${options.fieldName}' of type '${options.fieldType}' to ${options.schema}`;
    case 'remove-field':
      return `Remove field '${options.fieldName}' from ${options.schema}`;
    case 'change-type':
      return `Change type of '${options.fieldName}' to '${options.fieldType}' in ${options.schema}`;
    case 'split':
      return `Split ${options.schema} into smaller schemas`;
    case 'merge':
      return `Merge schemas into ${options.schema}`;
    case 'extract-union':
      return `Extract common fields from ${options.schema} into union type`;
    default:
      return `Perform ${options.operation} on ${options.schema}`;
  }
}

function determineRisk(operation: string): 'low' | 'medium' | 'high' {
  const riskLevels = {
    'add-field': 'low',
    'rename': 'medium',
    'extract-union': 'medium',
    'merge': 'medium',
    'remove-field': 'high',
    'change-type': 'high',
    'split': 'high'
  } as const;

  return riskLevels[operation as keyof typeof riskLevels] || 'medium';
}

function determineAutomation(operation: string): 'full' | 'partial' | 'manual' {
  const automationLevels = {
    'add-field': 'full',
    'rename': 'partial',
    'remove-field': 'partial',
    'change-type': 'partial',
    'extract-union': 'manual',
    'merge': 'manual',
    'split': 'manual'
  } as const;

  return automationLevels[operation as keyof typeof automationLevels] || 'partial';
}

function getRiskColor(riskScore: number): (text: string) => string {
  if (riskScore > 0.7) return pc.red;
  if (riskScore > 0.4) return pc.yellow;
  return pc.green;
}

async function handleSmartRefactoring(
  assistant: SchemaRefactoringAssistant,
  options: RefactorCommandOptions
): Promise<void> {
  const refactoringOptions: RefactoringOptions = {
    backup: options.backup !== false,
    confidence: options.confidence ?
      (options.confidence <= 1 ? options.confidence : options.confidence / 100) :
      (options.confidence as any) || 'medium',
    preserveComments: true,
    includeTests: true,
    analyzeUsage: true
  };

  if (options.dryRun !== undefined) {
    refactoringOptions.dryRun = options.dryRun;
  }
  if (options.aggressive !== undefined) {
    refactoringOptions.aggressive = options.aggressive;
  }

  // Find schema files to analyze
  const schemaFiles = await findSchemaFiles(options.target);

  if (schemaFiles.length === 0) {
    console.log(pc.yellow('⚠️  No schema files found to refactor'));
    console.log(pc.gray('Use --target to specify a different search path'));
    return;
  }

  console.log(pc.gray(`Found ${schemaFiles.length} schema file(s) to analyze`));

  // Show impact analysis
  if (options.impact) {
    await showImpactAnalysis(assistant, schemaFiles, refactoringOptions);
    return;
  }

  // Generate suggestions mode
  if (options.smart || (!options.auto)) {
    await showRefactoringSuggestions(
      assistant,
      schemaFiles,
      refactoringOptions,
      options
    );
    return;
  }

  // Apply refactoring mode
  if (options.auto) {
    await applyRefactoring(
      assistant,
      schemaFiles,
      refactoringOptions,
      options
    );
    return;
  }
}

async function findSchemaFiles(target?: string): Promise<string[]> {
  const searchPath = target || process.cwd();

  const patterns = [
    '**/*.schema.ts',
    '**/*.schemas.ts',
    '**/schemas/**/*.ts',
    '**/validations/**/*.ts',
    '**/validators/**/*.ts'
  ];

  const files = await fg(patterns, {
    cwd: searchPath,
    absolute: true,
    ignore: ['node_modules/**', 'dist/**', 'build/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
  });

  // Filter files that actually contain Zod schemas
  const schemaFiles: string[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('z.') && (content.includes('from "zod"') || content.includes("from 'zod'"))) {
        schemaFiles.push(file);
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return schemaFiles;
}

async function showImpactAnalysis(
  assistant: SchemaRefactoringAssistant,
  schemaFiles: string[],
  options: RefactoringOptions
): Promise<void> {
  console.log(pc.cyan('\n📊 Schema Impact Analysis'));

  for (const schemaFile of schemaFiles) {
    console.log(pc.blue(`\n🔍 Analyzing: ${schemaFile}`));

    try {
      const usage = await assistant.analyzeSchemaUsage(schemaFile, options);

      console.log(`   ${pc.gray('Used in:')} ${usage.length} location(s)`);

      if (usage.length > 0) {
        const uniqueFiles = new Set(usage.map(u => u.filePath));
        console.log(`   ${pc.gray('Affected files:')} ${uniqueFiles.size}`);

        const usageByType = usage.reduce((acc, u) => {
          acc[u.usageType] = (acc[u.usageType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        Object.entries(usageByType).forEach(([type, count]) => {
          console.log(`   ${pc.gray('•')} ${type}: ${count}`);
        });

        if (usage.length <= 5) {
          console.log(pc.green('   🟢 Low impact - safe to refactor'));
        } else if (usage.length <= 15) {
          console.log(pc.yellow('   🟡 Medium impact - review changes carefully'));
        } else {
          console.log(pc.red('   🔴 High impact - consider staged rollout'));
        }
      } else {
        console.log(pc.gray('   No usage found - possibly unused schema'));
      }

    } catch (error) {
      console.log(pc.red(`   Error analyzing: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  console.log(pc.blue('\nNext steps:'));
  console.log(`  ${pc.gray('$')} zodkit refactor --smart              # Get refactoring suggestions`);
  console.log(`  ${pc.gray('$')} zodkit refactor --auto --dry-run     # Preview changes`);
}

async function showRefactoringSuggestions(
  assistant: SchemaRefactoringAssistant,
  schemaFiles: string[],
  refactoringOptions: RefactoringOptions,
  options: RefactorCommandOptions
): Promise<void> {
  console.log(pc.cyan('\n💡 Schema Refactoring Suggestions'));

  let totalSuggestions = 0;
  const allSuggestions = [];

  for (const schemaFile of schemaFiles) {
    try {
      const suggestions = await assistant.generateRefactoringSuggestions(schemaFile, refactoringOptions);

      // Filter by category if specified
      const filteredSuggestions = options.category && options.category !== 'all'
        ? suggestions.filter(s => s.category === options.category)
        : suggestions;

      if (filteredSuggestions.length === 0) continue;

      console.log(pc.blue(`\n📁 ${schemaFile}`));

      filteredSuggestions.forEach((suggestion, _index) => {
        const confidenceColor = suggestion.confidence >= 0.8 ? pc.green : suggestion.confidence >= 0.6 ? pc.yellow : pc.red;
        const categoryIcon = getCategoryIcon(suggestion.category);

        console.log(`\n   ${categoryIcon} ${pc.bold(suggestion.title)}`);
        console.log(`      ${pc.gray(suggestion.description)}`);
        console.log(`      ${pc.gray('Category:')} ${suggestion.category}`);
        console.log(`      ${pc.gray('Confidence:')} ${confidenceColor(`${Math.round(suggestion.confidence * 100)}%`)}`);
        console.log(`      ${pc.gray('Auto-applicable:')} ${suggestion.autoApplicable ? pc.green('Yes') : pc.red('No')}`);
        console.log(`      ${pc.gray('Risk level:')} ${getRiskColor(suggestion.impact.riskLevel === 'low' ? 0.2 : suggestion.impact.riskLevel === 'medium' ? 0.5 : 0.8)(suggestion.impact.riskLevel)}`);

        if (suggestion.estimatedSavings) {
          console.log(`      ${pc.gray('Benefits:')}`);
          Object.entries(suggestion.estimatedSavings).forEach(([type, saving]) => {
            console.log(`        ${pc.cyan('•')} ${type}: ${saving}`);
          });
        }

        if (suggestion.benefits.length > 0) {
          console.log(`      ${pc.gray('Benefits:')} ${suggestion.benefits.slice(0, 2).join(', ')}`);
        }

        console.log(`      ${pc.gray('ID:')} ${suggestion.id}`);
      });

      totalSuggestions += filteredSuggestions.length;
      allSuggestions.push(...filteredSuggestions);

    } catch (error) {
      console.log(pc.red(`   Error analyzing ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  if (totalSuggestions === 0) {
    console.log(pc.green('\n✅ No refactoring suggestions found - your schemas look great!'));
    return;
  }

  // Summary by category
  console.log(pc.cyan('\n📈 Summary by Category:'));
  const byCategory = allSuggestions.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byCategory).forEach(([category, count]) => {
    const icon = getCategoryIcon(category as any);
    console.log(`   ${icon} ${category}: ${count} suggestion(s)`);
  });

  // Show auto-applicable suggestions
  const autoApplicable = allSuggestions.filter(s => s.autoApplicable);
  if (autoApplicable.length > 0) {
    console.log(pc.green(`\n🤖 ${autoApplicable.length} suggestion(s) can be auto-applied`));
  }

  console.log(pc.blue('\nNext steps:'));
  console.log(`  ${pc.gray('$')} zodkit refactor --auto --dry-run      # Preview all changes`);
  console.log(`  ${pc.gray('$')} zodkit refactor --auto                 # Apply auto-applicable suggestions`);
  console.log(`  ${pc.gray('$')} zodkit refactor --impact               # Show detailed impact analysis`);

  if (options.category !== 'performance') {
    console.log(`  ${pc.gray('$')} zodkit refactor --smart --category performance  # Focus on performance improvements`);
  }
}

async function applyRefactoring(
  assistant: SchemaRefactoringAssistant,
  schemaFiles: string[],
  refactoringOptions: RefactoringOptions,
  options: RefactorCommandOptions
): Promise<void> {
  if (options.dryRun) {
    console.log(pc.yellow('🎭 Dry run mode - showing changes without applying them'));
  } else {
    console.log(pc.cyan('🔧 Applying Schema Refactoring'));
  }

  let totalApplied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const schemaFile of schemaFiles) {
    try {
      const suggestions = await assistant.generateRefactoringSuggestions(schemaFile, refactoringOptions);

      // Filter suggestions based on options
      let filteredSuggestions = suggestions;

      if (options.auto) {
        filteredSuggestions = suggestions.filter(s => s.autoApplicable);
      }

      if (options.category && options.category !== 'all') {
        filteredSuggestions = filteredSuggestions.filter(s => s.category === options.category);
      }

      if (filteredSuggestions.length === 0) continue;

      console.log(pc.blue(`\n📁 Processing: ${schemaFile}`));

      const result = await assistant.applyRefactoringSuggestions(filteredSuggestions, refactoringOptions);

      // Report results for this file
      console.log(`   ${pc.green('✅')} Applied: ${result.applied.length}`);
      console.log(`   ${pc.yellow('⏭️')} Skipped: ${result.skipped.length}`);
      console.log(`   ${pc.red('❌')} Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`      ${pc.red('•')} ${error.suggestion}: ${error.error}`);
        });
      }

      totalApplied += result.applied.length;
      totalSkipped += result.skipped.length;
      totalErrors += result.errors.length;

    } catch (error) {
      console.log(pc.red(`   Error processing ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`));
      totalErrors++;
    }
  }

  // Final summary
  console.log(pc.cyan('\n📊 Refactoring Summary:'));
  console.log(`   ${pc.green('Applied:')} ${totalApplied} suggestion(s)`);
  console.log(`   ${pc.yellow('Skipped:')} ${totalSkipped} suggestion(s)`);
  console.log(`   ${pc.red('Errors:')} ${totalErrors} error(s)`);

  if (totalApplied > 0) {
    console.log(pc.green('\n✨ Refactoring completed successfully!'));

    if (!options.dryRun) {
      console.log(pc.blue('\nRecommended next steps:'));
      console.log(`  ${pc.gray('$')} zodkit check                     # Validate refactored schemas`);
      console.log(`  ${pc.gray('$')} npm run test                    # Run your test suite`);
      console.log(`  ${pc.gray('$')} zodkit sync --status            # Check sync status`);
    }
  } else if (totalSkipped > 0) {
    console.log(pc.yellow('\n⚠️  All suggestions were skipped'));
    console.log('Consider using --aggressive flag for more comprehensive refactoring');
  } else {
    console.log(pc.green('\n✅ No refactoring needed - your schemas are already optimized!'));
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'performance': return '⚡';
    case 'maintainability': return '🔧';
    case 'type_safety': return '🛡️';
    case 'consistency': return '📏';
    case 'modernization': return '🚀';
    default: return '💡';
  }
}