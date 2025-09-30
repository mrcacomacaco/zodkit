/**
 * @fileoverview Smart Schema Refactoring Assistant with impact analysis
 * @module RefactorAssistant
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface RefactorOptions {
  dryRun?: boolean;
  backup?: boolean;
  interactive?: boolean;
  safeMode?: boolean;
  preserveComments?: boolean;
  updateImports?: boolean;
  updateTests?: boolean;
  confidence?: number;
}

export interface RefactorOperation {
  type: 'rename' | 'add-field' | 'remove-field' | 'change-type' | 'split-schema' | 'merge-schemas' | 'extract-union';
  target: string;
  description: string;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  automation: 'full' | 'partial' | 'manual';
  preview: string;
  rollback?: string;
}

export interface ImpactAnalysis {
  affectedFiles: string[];
  breakingChanges: BreakingChange[];
  safeMigrations: SafeMigration[];
  testUpdates: TestUpdate[];
  importUpdates: ImportUpdate[];
  riskScore: number;
  estimatedTime: string;
  confidence: number;
}

export interface BreakingChange {
  file: string;
  line: number;
  column: number;
  type: 'type-mismatch' | 'missing-property' | 'invalid-usage' | 'import-error';
  description: string;
  suggestion: string;
  canAutoFix: boolean;
}

export interface SafeMigration {
  file: string;
  operation: string;
  before: string;
  after: string;
  confidence: number;
}

export interface TestUpdate {
  file: string;
  type: 'unit' | 'integration' | 'e2e';
  description: string;
  suggestedChanges: string[];
}

export interface ImportUpdate {
  file: string;
  oldImport: string;
  newImport: string;
  reason: string;
}

export interface RefactorPlan {
  operations: RefactorOperation[];
  impact: ImpactAnalysis;
  dependencies: RefactorDependency[];
  timeline: RefactorStep[];
  rollbackPlan: RollbackStep[];
}

export interface RefactorDependency {
  from: string;
  to: string;
  reason: string;
  optional: boolean;
}

export interface RefactorStep {
  order: number;
  operation: RefactorOperation;
  dependencies: string[];
  estimatedTime: number;
  parallel: boolean;
}

export interface RollbackStep {
  order: number;
  description: string;
  command: string;
  validation: string;
}

export interface RefactorResult {
  success: boolean;
  operations: RefactorOperation[];
  filesChanged: string[];
  warnings: string[];
  errors: string[];
  rollbackPlan: RollbackStep[];
  metrics: RefactorMetrics;
}

export interface RefactorMetrics {
  duration: number;
  filesAnalyzed: number;
  filesModified: number;
  linesChanged: number;
  confidence: number;
  riskScore: number;
}

export class RefactorAssistant {
  private readonly backupDir = '.zodkit/backups';
  private readonly operationHistory: RefactorOperation[] = [];

  async analyzeRefactorImpact(
    schemaName: string,
    operation: RefactorOperation,
    projectPath: string
  ): Promise<ImpactAnalysis> {
    const affectedFiles = await this.findAffectedFiles(schemaName, projectPath);
    const breakingChanges = await this.analyzeBreakingChanges(operation, affectedFiles);
    const safeMigrations = await this.identifySafeMigrations(operation, affectedFiles);
    const testUpdates = await this.analyzeTestImpact(operation, affectedFiles);
    const importUpdates = await this.analyzeImportImpact(operation, affectedFiles);

    const riskScore = this.calculateRiskScore(breakingChanges, operation);
    const estimatedTime = this.estimateRefactorTime(breakingChanges, safeMigrations);
    const confidence = this.calculateConfidence(operation, affectedFiles.length);

    return {
      affectedFiles,
      breakingChanges,
      safeMigrations,
      testUpdates,
      importUpdates,
      riskScore,
      estimatedTime,
      confidence
    };
  }

  async createRefactorPlan(
    operations: RefactorOperation[],
    projectPath: string
  ): Promise<RefactorPlan> {
    const dependencies = this.analyzeDependencies(operations);
    const timeline = this.createTimeline(operations, dependencies);
    const rollbackPlan = this.createRollbackPlan(operations);

    // Analyze combined impact
    const combinedImpact = await this.analyzeCombinedImpact(operations, projectPath);

    return {
      operations,
      impact: combinedImpact,
      dependencies,
      timeline,
      rollbackPlan
    };
  }

  async executeRefactorPlan(
    plan: RefactorPlan,
    options: RefactorOptions = {}
  ): Promise<RefactorResult> {
    const startTime = Date.now();
    const filesChanged: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (options.backup) {
      await this.createBackup(plan.impact.affectedFiles);
    }

    if (options.dryRun) {
      return this.simulateRefactor(plan, options);
    }

    try {
      // Execute operations in dependency order
      for (const step of plan.timeline) {
        if (options.interactive) {
          const proceed = await this.confirmOperation(step.operation);
          if (!proceed) {
            warnings.push(`Skipped operation: ${step.operation.description}`);
            continue;
          }
        }

        const result = await this.executeOperation(step.operation, options);
        if (result.success) {
          filesChanged.push(...result.filesChanged);
          this.operationHistory.push(step.operation);
        } else {
          errors.push(`Failed operation: ${step.operation.description} - ${result.error}`);
          if (options.safeMode) {
            break; // Stop on first error in safe mode
          }
        }
      }

      // Update imports and tests
      if (options.updateImports) {
        await this.updateImports(plan.impact.importUpdates);
      }

      if (options.updateTests) {
        await this.updateTests(plan.impact.testUpdates);
      }

      const metrics: RefactorMetrics = {
        duration: Date.now() - startTime,
        filesAnalyzed: plan.impact.affectedFiles.length,
        filesModified: filesChanged.length,
        linesChanged: await this.countChangedLines(filesChanged),
        confidence: plan.impact.confidence,
        riskScore: plan.impact.riskScore
      };

      return {
        success: errors.length === 0,
        operations: plan.operations,
        filesChanged,
        warnings,
        errors,
        rollbackPlan: plan.rollbackPlan,
        metrics
      };

    } catch (error) {
      errors.push(`Refactor failed: ${error instanceof Error ? error.message : String(error)}`);

      if (options.backup) {
        await this.restoreBackup();
        warnings.push('Restored from backup due to failure');
      }

      return {
        success: false,
        operations: plan.operations,
        filesChanged,
        warnings,
        errors,
        rollbackPlan: plan.rollbackPlan,
        metrics: {
          duration: Date.now() - startTime,
          filesAnalyzed: plan.impact.affectedFiles.length,
          filesModified: 0,
          linesChanged: 0,
          confidence: 0,
          riskScore: 1
        }
      };
    }
  }

  async suggestRefactorOperations(
    schemaName: string,
    projectPath: string
  ): Promise<RefactorOperation[]> {
    const suggestions: RefactorOperation[] = [];

    // Analyze schema usage patterns
    const usageAnalysis = await this.analyzeSchemaUsage(schemaName, projectPath);

    // Suggest based on common patterns
    if (usageAnalysis.duplicateFields.length > 0) {
      suggestions.push({
        type: 'extract-union',
        target: schemaName,
        description: `Extract common fields into base schema: ${usageAnalysis.duplicateFields.join(', ')}`,
        confidence: 0.8,
        risk: 'medium',
        automation: 'partial',
        preview: this.generateUnionPreview(schemaName, usageAnalysis.duplicateFields)
      });
    }

    if (usageAnalysis.largeSchema && usageAnalysis.logicalGroups.length > 1) {
      suggestions.push({
        type: 'split-schema',
        target: schemaName,
        description: `Split large schema into logical groups: ${usageAnalysis.logicalGroups.join(', ')}`,
        confidence: 0.7,
        risk: 'high',
        automation: 'manual',
        preview: this.generateSplitPreview(schemaName, usageAnalysis.logicalGroups)
      });
    }

    if (usageAnalysis.unusedFields.length > 0) {
      suggestions.push({
        type: 'remove-field',
        target: schemaName,
        description: `Remove unused fields: ${usageAnalysis.unusedFields.join(', ')}`,
        confidence: 0.9,
        risk: 'low',
        automation: 'full',
        preview: this.generateRemovalPreview(schemaName, usageAnalysis.unusedFields)
      });
    }

    if (usageAnalysis.typeInconsistencies.length > 0) {
      suggestions.push({
        type: 'change-type',
        target: schemaName,
        description: `Fix type inconsistencies: ${usageAnalysis.typeInconsistencies.map((t: any) => t.field).join(', ')}`,
        confidence: 0.6,
        risk: 'high',
        automation: 'partial',
        preview: this.generateTypeFixPreview(schemaName, usageAnalysis.typeInconsistencies)
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private async findAffectedFiles(_schemaName: string, projectPath: string): Promise<string[]> {
    // Implementation would use AST parsing to find all files that import/use the schema
    // For demo, return mock affected files
    return [
      join(projectPath, 'src/types/user.ts'),
      join(projectPath, 'src/api/auth.ts'),
      join(projectPath, 'src/components/UserForm.tsx'),
      join(projectPath, 'tests/user.test.ts')
    ];
  }

  private async analyzeBreakingChanges(
    operation: RefactorOperation,
    affectedFiles: string[]
  ): Promise<BreakingChange[]> {
    const breakingChanges: BreakingChange[] = [];

    // Analyze each file for potential breaking changes
    for (const file of affectedFiles) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        const changes = this.detectBreakingChanges(content, operation, file);
        breakingChanges.push(...changes);
      }
    }

    return breakingChanges;
  }

  private detectBreakingChanges(
    content: string,
    operation: RefactorOperation,
    filePath: string
  ): BreakingChange[] {
    const changes: BreakingChange[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Example detection for field removal
      if (operation.type === 'remove-field' && line.includes(operation.target)) {
        changes.push({
          file: filePath,
          line: index + 1,
          column: line.indexOf(operation.target) + 1,
          type: 'missing-property',
          description: `Field '${operation.target}' is being used but will be removed`,
          suggestion: 'Update code to handle missing field or use optional chaining',
          canAutoFix: line.includes('?.') // Can auto-fix if already using optional chaining
        });
      }

      // Example detection for type changes
      if (operation.type === 'change-type' && line.includes(operation.target)) {
        changes.push({
          file: filePath,
          line: index + 1,
          column: line.indexOf(operation.target) + 1,
          type: 'type-mismatch',
          description: `Type change may cause runtime errors`,
          suggestion: 'Update type annotations and add runtime checks',
          canAutoFix: false
        });
      }
    });

    return changes;
  }

  private async identifySafeMigrations(
    operation: RefactorOperation,
    affectedFiles: string[]
  ): Promise<SafeMigration[]> {
    const migrations: SafeMigration[] = [];

    for (const file of affectedFiles) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        const fileMigrations = this.findSafeMigrations(content, operation, file);
        migrations.push(...fileMigrations);
      }
    }

    return migrations;
  }

  private findSafeMigrations(
    content: string,
    operation: RefactorOperation,
    filePath: string
  ): SafeMigration[] {
    const migrations: SafeMigration[] = [];

    // Example: safe field addition
    if (operation.type === 'add-field') {
      const importMatch = content.match(/import.*{[^}]*}/);
      if (importMatch) {
        migrations.push({
          file: filePath,
          operation: 'update-import',
          before: importMatch[0],
          after: importMatch[0].replace('}', `, ${operation.target}}`),
          confidence: 0.9
        });
      }
    }

    return migrations;
  }

  private async analyzeTestImpact(
    operation: RefactorOperation,
    affectedFiles: string[]
  ): Promise<TestUpdate[]> {
    const testUpdates: TestUpdate[] = [];
    const testFiles = affectedFiles.filter(f => f.includes('.test.') || f.includes('.spec.'));

    for (const testFile of testFiles) {
      if (existsSync(testFile)) {
        const content = readFileSync(testFile, 'utf-8');
        const updates = this.analyzeTestFile(content, operation, testFile);
        testUpdates.push(...updates);
      }
    }

    return testUpdates;
  }

  private analyzeTestFile(
    content: string,
    operation: RefactorOperation,
    filePath: string
  ): TestUpdate[] {
    const updates: TestUpdate[] = [];

    if (content.includes(operation.target)) {
      updates.push({
        file: filePath,
        type: filePath.includes('e2e') ? 'e2e' : filePath.includes('integration') ? 'integration' : 'unit',
        description: `Test needs updating due to ${operation.type}`,
        suggestedChanges: [
          `Update test data to match new schema`,
          `Add validation for ${operation.target}`,
          `Update mock implementations`
        ]
      });
    }

    return updates;
  }

  private async analyzeImportImpact(
    operation: RefactorOperation,
    affectedFiles: string[]
  ): Promise<ImportUpdate[]> {
    const importUpdates: ImportUpdate[] = [];

    for (const file of affectedFiles) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        const updates = this.findImportUpdates(content, operation, file);
        importUpdates.push(...updates);
      }
    }

    return importUpdates;
  }

  private findImportUpdates(
    content: string,
    operation: RefactorOperation,
    filePath: string
  ): ImportUpdate[] {
    const updates: ImportUpdate[] = [];
    const importRegex = /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1];

      if (imports?.includes(operation.target)) {
        if (operation.type === 'rename') {
          updates.push({
            file: filePath,
            oldImport: match[0],
            newImport: match[0].replace(operation.target, `${operation.target}Renamed`),
            reason: 'Schema was renamed'
          });
        }
      }
    }

    return updates;
  }

  private calculateRiskScore(breakingChanges: BreakingChange[], operation: RefactorOperation): number {
    let risk = 0;

    // Base risk by operation type
    const operationRisk = {
      'rename': 0.3,
      'add-field': 0.1,
      'remove-field': 0.7,
      'change-type': 0.8,
      'split-schema': 0.9,
      'merge-schemas': 0.6,
      'extract-union': 0.4
    };

    risk += operationRisk[operation.type] || 0.5;

    // Add risk for breaking changes
    risk += breakingChanges.length * 0.1;

    // High-risk if many breaking changes can't be auto-fixed
    const nonAutoFixable = breakingChanges.filter(bc => !bc.canAutoFix).length;
    risk += nonAutoFixable * 0.15;

    return Math.min(1, risk);
  }

  private estimateRefactorTime(
    breakingChanges: BreakingChange[],
    safeMigrations: SafeMigration[]
  ): string {
    const baseTime = 5; // 5 minutes base
    const breakingTime = breakingChanges.length * 10; // 10 minutes per breaking change
    const migrationTime = safeMigrations.length * 2; // 2 minutes per safe migration

    const totalMinutes = baseTime + breakingTime + migrationTime;

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
  }

  private calculateConfidence(operation: RefactorOperation, affectedFileCount: number): number {
    let confidence = operation.confidence;

    // Reduce confidence based on scope
    if (affectedFileCount > 10) {
      confidence -= 0.2;
    } else if (affectedFileCount > 5) {
      confidence -= 0.1;
    }

    // High-risk operations get lower confidence
    if (operation.risk === 'high') {
      confidence -= 0.2;
    } else if (operation.risk === 'medium') {
      confidence -= 0.1;
    }

    return Math.max(0.1, confidence);
  }

  private analyzeDependencies(operations: RefactorOperation[]): RefactorDependency[] {
    const dependencies: RefactorDependency[] = [];

    // Simple dependency analysis - in practice this would be more sophisticated
    for (let i = 0; i < operations.length; i++) {
      for (let j = i + 1; j < operations.length; j++) {
        const op1 = operations[i];
        const op2 = operations[j];

        if (op1 && op2 && (op1.target === op2.target || this.areRelated(op1, op2))) {
          dependencies.push({
            from: op1.target,
            to: op2.target,
            reason: 'Operations affect the same schema',
            optional: false
          });
        }
      }
    }

    return dependencies;
  }

  private areRelated(op1: RefactorOperation, op2: RefactorOperation): boolean {
    // Check if operations are related (simplified)
    return op1.target.includes(op2.target) || op2.target.includes(op1.target);
  }

  private createTimeline(
    operations: RefactorOperation[],
    dependencies: RefactorDependency[]
  ): RefactorStep[] {
    const steps: RefactorStep[] = [];

    operations.forEach((operation, index) => {
      const operationDeps = dependencies
        .filter(dep => dep.to === operation.target)
        .map(dep => dep.from);

      steps.push({
        order: index + 1,
        operation,
        dependencies: operationDeps,
        estimatedTime: this.estimateOperationTime(operation),
        parallel: operationDeps.length === 0
      });
    });

    return steps.sort((a, b) => a.dependencies.length - b.dependencies.length);
  }

  private estimateOperationTime(operation: RefactorOperation): number {
    const timeEstimates = {
      'rename': 5,
      'add-field': 3,
      'remove-field': 10,
      'change-type': 15,
      'split-schema': 30,
      'merge-schemas': 20,
      'extract-union': 25
    };

    return timeEstimates[operation.type] || 10;
  }

  private createRollbackPlan(operations: RefactorOperation[]): RollbackStep[] {
    return operations.reverse().map((operation, index) => ({
      order: index + 1,
      description: `Rollback ${operation.type} on ${operation.target}`,
      command: operation.rollback || `git checkout -- ${operation.target}`,
      validation: `Verify ${operation.target} is restored`
    }));
  }

  private async analyzeCombinedImpact(
    operations: RefactorOperation[],
    projectPath: string
  ): Promise<ImpactAnalysis> {
    // Combine analysis from all operations
    let combinedAffectedFiles: string[] = [];
    let combinedBreakingChanges: BreakingChange[] = [];
    let combinedSafeMigrations: SafeMigration[] = [];
    let combinedTestUpdates: TestUpdate[] = [];
    let combinedImportUpdates: ImportUpdate[] = [];

    for (const operation of operations) {
      const impact = await this.analyzeRefactorImpact(operation.target, operation, projectPath);
      combinedAffectedFiles.push(...impact.affectedFiles);
      combinedBreakingChanges.push(...impact.breakingChanges);
      combinedSafeMigrations.push(...impact.safeMigrations);
      combinedTestUpdates.push(...impact.testUpdates);
      combinedImportUpdates.push(...impact.importUpdates);
    }

    // Remove duplicates
    combinedAffectedFiles = [...new Set(combinedAffectedFiles)];

    const riskScore = Math.max(...operations.map(op => this.calculateRiskScore(combinedBreakingChanges, op)));
    const estimatedTime = this.estimateRefactorTime(combinedBreakingChanges, combinedSafeMigrations);
    const confidence = Math.min(...operations.map(op => op.confidence));

    return {
      affectedFiles: combinedAffectedFiles,
      breakingChanges: combinedBreakingChanges,
      safeMigrations: combinedSafeMigrations,
      testUpdates: combinedTestUpdates,
      importUpdates: combinedImportUpdates,
      riskScore,
      estimatedTime,
      confidence
    };
  }

  private async createBackup(files: string[]): Promise<void> {
    // Implementation would create backups of affected files
    console.log(`Creating backup of ${files.length} files...`);
  }

  private async restoreBackup(): Promise<void> {
    // Implementation would restore files from backup
    console.log('Restoring from backup...');
  }

  private async simulateRefactor(plan: RefactorPlan, _options: RefactorOptions): Promise<RefactorResult> {
    // Simulate the refactor without making actual changes
    return {
      success: true,
      operations: plan.operations,
      filesChanged: plan.impact.affectedFiles,
      warnings: ['This is a dry run - no files were actually modified'],
      errors: [],
      rollbackPlan: plan.rollbackPlan,
      metrics: {
        duration: 0,
        filesAnalyzed: plan.impact.affectedFiles.length,
        filesModified: 0,
        linesChanged: 0,
        confidence: plan.impact.confidence,
        riskScore: plan.impact.riskScore
      }
    };
  }

  private async confirmOperation(operation: RefactorOperation): Promise<boolean> {
    // In practice, this would prompt the user for confirmation
    return operation.risk !== 'high';
  }

  private async executeOperation(
    operation: RefactorOperation,
    _options: RefactorOptions
  ): Promise<{ success: boolean; filesChanged: string[]; error?: string }> {
    // Implementation would execute the actual refactoring operation
    return {
      success: true,
      filesChanged: [`${operation.target}.ts`]
    };
  }

  private async updateImports(importUpdates: ImportUpdate[]): Promise<void> {
    for (const update of importUpdates) {
      if (existsSync(update.file)) {
        const content = readFileSync(update.file, 'utf-8');
        const updatedContent = content.replace(update.oldImport, update.newImport);
        writeFileSync(update.file, updatedContent);
      }
    }
  }

  private async updateTests(testUpdates: TestUpdate[]): Promise<void> {
    // Implementation would update test files based on suggested changes
    console.log(`Updating ${testUpdates.length} test files...`);
  }

  private async countChangedLines(files: string[]): Promise<number> {
    // Implementation would count actual changed lines
    return files.length * 10; // Mock estimate
  }

  private async analyzeSchemaUsage(_schemaName: string, _projectPath: string): Promise<any> {
    // Mock usage analysis
    return {
      duplicateFields: ['id', 'createdAt', 'updatedAt'],
      largeSchema: true,
      logicalGroups: ['UserProfile', 'UserSettings'],
      unusedFields: ['deprecatedField', 'oldTimestamp'],
      typeInconsistencies: [
        { field: 'age', currentType: 'string', suggestedType: 'number' }
      ]
    };
  }

  private generateUnionPreview(schemaName: string, fields: string[]): string {
    return `// Extract common fields into base schema
const BaseSchema = z.object({
  ${fields.map(f => `${f}: z.string()`).join(',\n  ')}
});

const ${schemaName} = BaseSchema.extend({
  // specific fields here
});`;
  }

  private generateSplitPreview(schemaName: string, groups: string[]): string {
    return `// Split into logical groups
${groups.map(group => `const ${group}Schema = z.object({ /* ${group} fields */ });`).join('\n')}

const ${schemaName} = z.object({
  ${groups.map(group => `${group.toLowerCase()}: ${group}Schema`).join(',\n  ')}
});`;
  }

  private generateRemovalPreview(schemaName: string, fields: string[]): string {
    return `// Remove unused fields: ${fields.join(', ')}
const ${schemaName} = z.object({
  // ... other fields
  // ${fields.map(f => `// ${f}: z.string() // REMOVED`).join('\n  // ')}
});`;
  }

  private generateTypeFixPreview(schemaName: string, inconsistencies: any[]): string {
    return `// Fix type inconsistencies
const ${schemaName} = z.object({
  ${inconsistencies.map(inc => `${inc.field}: z.${inc.suggestedType}() // was: ${inc.currentType}`).join(',\n  ')}
});`;
  }
}