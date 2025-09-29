/**
 * @fileoverview Advanced schema diff and migration visualization
 * @module SchemaDiff
 */

import * as pc from 'picocolors';
import { z } from 'zod';

/**
 * Types of schema changes
 */
export enum ChangeType {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
  MOVED = 'MOVED',
  RENAMED = 'RENAMED'
}

/**
 * Impact levels for changes
 */
export enum ImpactLevel {
  BREAKING = 'BREAKING',
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  PATCH = 'PATCH'
}

/**
 * Schema change representation
 */
export interface SchemaChange {
  id: string;
  type: ChangeType;
  path: string;
  oldValue?: any;
  newValue?: any;
  impact: ImpactLevel;
  description: string;
  suggestion?: string;
  migration?: string;
  affectedFields?: string[];
}

/**
 * Migration strategy options
 */
export interface MigrationStrategy {
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  timeline: string;
  steps: MigrationStep[];
  rollbackPlan?: string;
}

/**
 * Individual migration step
 */
export interface MigrationStep {
  id: string;
  phase: number;
  action: string;
  description: string;
  validation: string;
  rollback: string;
  dependencies?: string[];
}

/**
 * Diff analysis result
 */
export interface DiffResult {
  summary: {
    total: number;
    breaking: number;
    major: number;
    minor: number;
    patch: number;
  };
  changes: SchemaChange[];
  compatibility: 'compatible' | 'breaking' | 'risky';
  migrationStrategies: MigrationStrategy[];
  timeline: string;
  riskAssessment: string;
}

/**
 * Advanced schema diff engine
 */
export class SchemaDiffEngine {
  /**
   * Compare two schemas and generate detailed diff
   */
  async diff(oldSchema: any, newSchema: any, options: {
    detectRenames?: boolean;
    includeStrategies?: boolean;
    generateMigration?: boolean;
  } = {}): Promise<DiffResult> {

    const changes = this.detectChanges(oldSchema, newSchema, '', options.detectRenames);
    const summary = this.generateSummary(changes);
    const compatibility = this.assessCompatibility(changes);
    const strategies = options.includeStrategies ? this.generateMigrationStrategies(changes) : [];

    return {
      summary,
      changes,
      compatibility,
      migrationStrategies: strategies,
      timeline: this.estimateTimeline(changes),
      riskAssessment: this.assessRisk(changes)
    };
  }

  /**
   * Detect all changes between schemas
   */
  private detectChanges(
    oldSchema: any,
    newSchema: any,
    path: string = '',
    detectRenames: boolean = true
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Handle object schemas
    if (this.isObjectSchema(oldSchema) && this.isObjectSchema(newSchema)) {
      changes.push(...this.diffObjectSchemas(oldSchema, newSchema, path, detectRenames));
    }
    // Handle array schemas
    else if (this.isArraySchema(oldSchema) && this.isArraySchema(newSchema)) {
      changes.push(...this.diffArraySchemas(oldSchema, newSchema, path));
    }
    // Handle primitive type changes
    else if (oldSchema !== newSchema) {
      changes.push(this.createTypeChange(oldSchema, newSchema, path));
    }

    return changes;
  }

  /**
   * Diff object schemas
   */
  private diffObjectSchemas(
    oldSchema: any,
    newSchema: any,
    path: string,
    detectRenames: boolean
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldFields = this.extractFields(oldSchema);
    const newFields = this.extractFields(newSchema);

    // Detect added fields
    for (const [fieldName, fieldSchema] of Object.entries(newFields)) {
      if (!(fieldName in oldFields)) {
        changes.push({
          id: `${path}.${fieldName}`,
          type: ChangeType.ADDED,
          path: `${path}.${fieldName}`,
          newValue: fieldSchema,
          impact: this.isOptionalField(fieldSchema) ? ImpactLevel.MINOR : ImpactLevel.MAJOR,
          description: `Added field '${fieldName}'`,
          suggestion: this.isOptionalField(fieldSchema)
            ? 'Safe addition - field is optional'
            : 'Consider making field optional for backward compatibility',
          migration: this.generateFieldAdditionMigration(fieldName, fieldSchema)
        });
      }
    }

    // Detect removed fields
    for (const [fieldName, fieldSchema] of Object.entries(oldFields)) {
      if (!(fieldName in newFields)) {
        changes.push({
          id: `${path}.${fieldName}`,
          type: ChangeType.REMOVED,
          path: `${path}.${fieldName}`,
          oldValue: fieldSchema,
          impact: ImpactLevel.BREAKING,
          description: `Removed field '${fieldName}'`,
          suggestion: 'Consider deprecation period before removal',
          migration: this.generateFieldRemovalMigration(fieldName)
        });
      }
    }

    // Detect modified fields
    for (const [fieldName, oldFieldSchema] of Object.entries(oldFields)) {
      if (fieldName in newFields) {
        const newFieldSchema = newFields[fieldName];
        const fieldChanges = this.detectChanges(
          oldFieldSchema,
          newFieldSchema,
          `${path}.${fieldName}`,
          detectRenames
        );
        changes.push(...fieldChanges);
      }
    }

    // Detect potential renames
    if (detectRenames) {
      changes.push(...this.detectRenames(oldFields, newFields, path));
    }

    return changes;
  }

  /**
   * Diff array schemas
   */
  private diffArraySchemas(oldSchema: any, newSchema: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Compare array element types
    const oldElementType = this.getArrayElementType(oldSchema);
    const newElementType = this.getArrayElementType(newSchema);

    if (oldElementType !== newElementType) {
      changes.push({
        id: `${path}[]`,
        type: ChangeType.MODIFIED,
        path: `${path}[]`,
        oldValue: oldElementType,
        newValue: newElementType,
        impact: ImpactLevel.BREAKING,
        description: `Array element type changed from ${oldElementType} to ${newElementType}`,
        suggestion: 'Consider using union types for gradual migration',
        migration: 'Use data transformation during migration'
      });
    }

    return changes;
  }

  /**
   * Create type change record
   */
  private createTypeChange(oldType: any, newType: any, path: string): SchemaChange {
    const impact = this.assessTypeChangeImpact(oldType, newType);

    return {
      id: path,
      type: ChangeType.MODIFIED,
      path,
      oldValue: oldType,
      newValue: newType,
      impact,
      description: `Type changed from ${this.getTypeName(oldType)} to ${this.getTypeName(newType)}`,
      suggestion: this.getTypeChangeSuggestion(oldType, newType),
      migration: this.generateTypeMigration(oldType, newType)
    };
  }

  /**
   * Detect potential field renames
   */
  private detectRenames(oldFields: any, newFields: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldFieldNames = Object.keys(oldFields);
    const newFieldNames = Object.keys(newFields);

    const removedFields = oldFieldNames.filter(name => !newFieldNames.includes(name));
    const addedFields = newFieldNames.filter(name => !oldFieldNames.includes(name));

    // Simple rename detection based on type similarity
    for (const removedField of removedFields) {
      for (const addedField of addedFields) {
        if (this.areSimilarTypes(oldFields[removedField], newFields[addedField])) {
          const confidence = this.calculateRenameConfidence(removedField, addedField);

          if (confidence > 0.7) {
            changes.push({
              id: `${path}.${removedField}->${addedField}`,
              type: ChangeType.RENAMED,
              path: `${path}.${removedField}`,
              oldValue: removedField,
              newValue: addedField,
              impact: ImpactLevel.MAJOR,
              description: `Field '${removedField}' likely renamed to '${addedField}' (${Math.round(confidence * 100)}% confidence)`,
              suggestion: 'Verify this is a rename and not separate add/remove operations',
              migration: this.generateRenameMigration(removedField, addedField)
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Generate migration strategies
   */
  private generateMigrationStrategies(changes: SchemaChange[]): MigrationStrategy[] {
    const strategies: MigrationStrategy[] = [];

    const breakingChanges = changes.filter(c => c.impact === ImpactLevel.BREAKING);
    const majorChanges = changes.filter(c => c.impact === ImpactLevel.MAJOR);

    if (breakingChanges.length === 0 && majorChanges.length === 0) {
      // Simple forward migration
      strategies.push({
        name: 'Direct Migration',
        description: 'Apply all changes immediately',
        risk: 'low',
        timeline: '1 day',
        steps: this.generateDirectMigrationSteps(changes)
      });
    } else {
      // Gradual migration strategies
      strategies.push({
        name: 'Gradual Migration',
        description: 'Phased rollout with backward compatibility',
        risk: 'medium',
        timeline: '2-4 weeks',
        steps: this.generateGradualMigrationSteps(changes),
        rollbackPlan: 'Each phase can be independently rolled back'
      });

      strategies.push({
        name: 'Blue-Green Migration',
        description: 'Deploy new schema alongside old, switch traffic',
        risk: 'low',
        timeline: '1-2 weeks',
        steps: this.generateBlueGreenMigrationSteps(changes),
        rollbackPlan: 'Instant rollback by switching traffic back'
      });

      if (breakingChanges.length > 0) {
        strategies.push({
          name: 'Version-Based Migration',
          description: 'Maintain multiple schema versions',
          risk: 'high',
          timeline: '4-8 weeks',
          steps: this.generateVersionedMigrationSteps(changes),
          rollbackPlan: 'Maintain old version indefinitely'
        });
      }
    }

    return strategies;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(changes: SchemaChange[]) {
    return {
      total: changes.length,
      breaking: changes.filter(c => c.impact === ImpactLevel.BREAKING).length,
      major: changes.filter(c => c.impact === ImpactLevel.MAJOR).length,
      minor: changes.filter(c => c.impact === ImpactLevel.MINOR).length,
      patch: changes.filter(c => c.impact === ImpactLevel.PATCH).length
    };
  }

  /**
   * Assess overall compatibility
   */
  private assessCompatibility(changes: SchemaChange[]): 'compatible' | 'breaking' | 'risky' {
    const hasBreaking = changes.some(c => c.impact === ImpactLevel.BREAKING);
    const hasMajor = changes.some(c => c.impact === ImpactLevel.MAJOR);

    if (hasBreaking) return 'breaking';
    if (hasMajor) return 'risky';
    return 'compatible';
  }

  /**
   * Display diff results with beautiful formatting
   */
  displayDiff(result: DiffResult): void {
    console.log(pc.cyan('📊 Schema Diff Analysis\n'));

    // Summary
    this.displaySummary(result.summary, result.compatibility);

    // Changes
    if (result.changes.length > 0) {
      console.log(pc.cyan('\n📋 Detailed Changes:\n'));
      this.displayChanges(result.changes);
    }

    // Migration strategies
    if (result.migrationStrategies.length > 0) {
      console.log(pc.cyan('\n🚀 Migration Strategies:\n'));
      this.displayMigrationStrategies(result.migrationStrategies);
    }

    // Risk assessment
    console.log(pc.cyan('\n⚠️  Risk Assessment:\n'));
    console.log(pc.yellow(result.riskAssessment));
    console.log(pc.gray(`Estimated timeline: ${result.timeline}`));
  }

  private displaySummary(summary: any, compatibility: string): void {
    const compatibilityColor = compatibility === 'compatible' ? pc.green :
                               compatibility === 'risky' ? pc.yellow : pc.red;

    console.log(`Status: ${compatibilityColor(compatibility.toUpperCase())}`);
    console.log(`Total changes: ${summary.total}`);

    if (summary.breaking > 0) {
      console.log(`${pc.red('Breaking')}: ${summary.breaking}`);
    }
    if (summary.major > 0) {
      console.log(`${pc.yellow('Major')}: ${summary.major}`);
    }
    if (summary.minor > 0) {
      console.log(`${pc.blue('Minor')}: ${summary.minor}`);
    }
    if (summary.patch > 0) {
      console.log(`${pc.green('Patch')}: ${summary.patch}`);
    }
  }

  private displayChanges(changes: SchemaChange[]): void {
    const groupedChanges = this.groupChangesByType(changes);

    for (const [type, typeChanges] of Object.entries(groupedChanges)) {
      if (typeChanges.length === 0) continue;

      console.log(pc.bold(`${type} (${typeChanges.length}):`));

      for (const change of typeChanges.slice(0, 10)) { // Show first 10
        const impactColor = change.impact === ImpactLevel.BREAKING ? pc.red :
                           change.impact === ImpactLevel.MAJOR ? pc.yellow :
                           change.impact === ImpactLevel.MINOR ? pc.blue : pc.green;

        console.log(`  ${impactColor(change.impact)} ${change.path}`);
        console.log(`    ${change.description}`);

        if (change.suggestion) {
          console.log(`    💡 ${pc.gray(change.suggestion)}`);
        }
      }

      if (typeChanges.length > 10) {
        console.log(`    ... and ${typeChanges.length - 10} more`);
      }

      console.log();
    }
  }

  private displayMigrationStrategies(strategies: MigrationStrategy[]): void {
    strategies.forEach((strategy, index) => {
      const riskColor = strategy.risk === 'low' ? pc.green :
                       strategy.risk === 'medium' ? pc.yellow : pc.red;

      console.log(`${index + 1}. ${pc.bold(strategy.name)} ${riskColor(`(${strategy.risk} risk)`)}`);
      console.log(`   ${strategy.description}`);
      console.log(`   Timeline: ${strategy.timeline}`);
      console.log(`   Steps: ${strategy.steps.length} phases`);

      if (strategy.rollbackPlan) {
        console.log(`   Rollback: ${pc.gray(strategy.rollbackPlan)}`);
      }

      console.log();
    });
  }

  // Helper methods
  private isObjectSchema(schema: any): boolean {
    return schema && typeof schema === 'object' && schema._def?.typeName === 'ZodObject';
  }

  private isArraySchema(schema: any): boolean {
    return schema && typeof schema === 'object' && schema._def?.typeName === 'ZodArray';
  }

  private extractFields(schema: any): any {
    return schema._def?.shape || {};
  }

  private isOptionalField(schema: any): boolean {
    return schema._def?.typeName === 'ZodOptional';
  }

  private getArrayElementType(schema: any): string {
    return schema._def?.type?._def?.typeName || 'unknown';
  }

  private getTypeName(type: any): string {
    return type?._def?.typeName || typeof type;
  }

  private assessTypeChangeImpact(oldType: any, newType: any): ImpactLevel {
    const oldTypeName = this.getTypeName(oldType);
    const newTypeName = this.getTypeName(newType);

    // String -> Number is breaking
    if (oldTypeName === 'ZodString' && newTypeName === 'ZodNumber') {
      return ImpactLevel.BREAKING;
    }

    // Optional -> Required is breaking
    if (oldTypeName === 'ZodOptional' && newTypeName !== 'ZodOptional') {
      return ImpactLevel.BREAKING;
    }

    // Required -> Optional is safe
    if (oldTypeName !== 'ZodOptional' && newTypeName === 'ZodOptional') {
      return ImpactLevel.MINOR;
    }

    return ImpactLevel.MAJOR;
  }

  private getTypeChangeSuggestion(oldType: any, newType: any): string {
    const oldTypeName = this.getTypeName(oldType);
    const newTypeName = this.getTypeName(newType);

    if (oldTypeName === 'ZodString' && newTypeName === 'ZodNumber') {
      return 'Use .transform() to convert strings to numbers during migration';
    }

    if (oldTypeName !== 'ZodOptional' && newTypeName === 'ZodOptional') {
      return 'Safe change - making field optional';
    }

    return 'Review data compatibility carefully';
  }

  private generateTypeMigration(oldType: any, newType: any): string {
    return 'Custom migration logic required';
  }

  private generateFieldAdditionMigration(fieldName: string, fieldSchema: any): string {
    if (this.isOptionalField(fieldSchema)) {
      return `Field '${fieldName}' is optional - no migration needed`;
    }
    return `Provide default value for '${fieldName}' during migration`;
  }

  private generateFieldRemovalMigration(fieldName: string): string {
    return `Remove '${fieldName}' from data during migration`;
  }

  private generateRenameMigration(oldName: string, newName: string): string {
    return `Copy '${oldName}' to '${newName}' during migration`;
  }

  private areSimilarTypes(type1: any, type2: any): boolean {
    return this.getTypeName(type1) === this.getTypeName(type2);
  }

  private calculateRenameConfidence(oldName: string, newName: string): number {
    // Simple string similarity
    const similarity = this.stringSimilarity(oldName, newName);
    return similarity;
  }

  private stringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private groupChangesByType(changes: SchemaChange[]): Record<string, SchemaChange[]> {
    return changes.reduce((groups, change) => {
      const type = change.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(change);
      return groups;
    }, {} as Record<string, SchemaChange[]>);
  }

  private generateDirectMigrationSteps(changes: SchemaChange[]): MigrationStep[] {
    return [
      {
        id: 'apply-changes',
        phase: 1,
        action: 'Apply all schema changes',
        description: 'Update schema definition with all changes',
        validation: 'Validate new schema against test data',
        rollback: 'Revert to previous schema version'
      }
    ];
  }

  private generateGradualMigrationSteps(changes: SchemaChange[]): MigrationStep[] {
    const steps: MigrationStep[] = [];
    let phase = 1;

    // Phase 1: Add optional fields
    const additions = changes.filter(c => c.type === ChangeType.ADDED);
    if (additions.length > 0) {
      steps.push({
        id: 'add-optional-fields',
        phase: phase++,
        action: 'Add new optional fields',
        description: 'Add all new fields as optional to maintain compatibility',
        validation: 'Ensure existing data still validates',
        rollback: 'Remove added fields'
      });
    }

    // Phase 2: Migrate data
    steps.push({
      id: 'migrate-data',
      phase: phase++,
      action: 'Migrate existing data',
      description: 'Transform existing data to new format',
      validation: 'Validate migrated data against new schema',
      rollback: 'Restore from backup'
    });

    // Phase 3: Remove deprecated fields
    const removals = changes.filter(c => c.type === ChangeType.REMOVED);
    if (removals.length > 0) {
      steps.push({
        id: 'remove-deprecated',
        phase: phase++,
        action: 'Remove deprecated fields',
        description: 'Clean up old fields after migration is complete',
        validation: 'Ensure no references to old fields remain',
        rollback: 'Re-add removed fields'
      });
    }

    return steps;
  }

  private generateBlueGreenMigrationSteps(changes: SchemaChange[]): MigrationStep[] {
    return [
      {
        id: 'deploy-new-schema',
        phase: 1,
        action: 'Deploy new schema version',
        description: 'Deploy new schema alongside existing version',
        validation: 'Validate new schema in parallel environment',
        rollback: 'Remove new deployment'
      },
      {
        id: 'migrate-data',
        phase: 2,
        action: 'Migrate data to new schema',
        description: 'Copy and transform data for new schema',
        validation: 'Verify data integrity in new schema',
        rollback: 'Stop using new schema'
      },
      {
        id: 'switch-traffic',
        phase: 3,
        action: 'Switch traffic to new schema',
        description: 'Route all traffic to new schema version',
        validation: 'Monitor application performance and errors',
        rollback: 'Switch traffic back to old schema'
      }
    ];
  }

  private generateVersionedMigrationSteps(changes: SchemaChange[]): MigrationStep[] {
    return [
      {
        id: 'create-new-version',
        phase: 1,
        action: 'Create schema version 2.0',
        description: 'Implement new schema as separate version',
        validation: 'Validate new schema independently',
        rollback: 'Remove new version'
      },
      {
        id: 'implement-adapters',
        phase: 2,
        action: 'Implement version adapters',
        description: 'Create adapters to convert between versions',
        validation: 'Test bidirectional conversion',
        rollback: 'Remove adapters'
      },
      {
        id: 'gradual-adoption',
        phase: 3,
        action: 'Gradual version adoption',
        description: 'Migrate clients to new version over time',
        validation: 'Monitor adoption metrics',
        rollback: 'Force clients back to old version'
      }
    ];
  }

  private estimateTimeline(changes: SchemaChange[]): string {
    const breakingChanges = changes.filter(c => c.impact === ImpactLevel.BREAKING).length;
    const majorChanges = changes.filter(c => c.impact === ImpactLevel.MAJOR).length;

    if (breakingChanges > 5) return '4-8 weeks';
    if (breakingChanges > 0 || majorChanges > 10) return '2-4 weeks';
    if (majorChanges > 0) return '1-2 weeks';
    return '1-3 days';
  }

  private assessRisk(changes: SchemaChange[]): string {
    const breakingChanges = changes.filter(c => c.impact === ImpactLevel.BREAKING).length;
    const majorChanges = changes.filter(c => c.impact === ImpactLevel.MAJOR).length;

    if (breakingChanges > 3) {
      return 'HIGH RISK: Multiple breaking changes detected. Consider gradual migration strategy.';
    }

    if (breakingChanges > 0) {
      return 'MEDIUM RISK: Breaking changes present. Plan migration carefully.';
    }

    if (majorChanges > 5) {
      return 'MEDIUM RISK: Many major changes. Test thoroughly before deployment.';
    }

    return 'LOW RISK: Changes are mostly backward compatible.';
  }
}

/**
 * Global schema diff engine
 */
export const schemaDiff = new SchemaDiffEngine();