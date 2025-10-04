/**
 * @fileoverview Schema Diff Engine - Compare Zod schemas and detect breaking changes
 * @module SchemaDiff
 */

import { z } from 'zod';

// === TYPES ===

export interface SchemaDiffResult {
	changes: SchemaChange[];
	breakingChanges: BreakingChange[];
	summary: DiffSummary;
	migrationGuide?: string;
}

export interface SchemaChange {
	type: ChangeType;
	path: string;
	from?: any;
	to?: any;
	severity: 'info' | 'warning' | 'error';
	message: string;
	breaking: boolean;
}

export interface BreakingChange {
	type: BreakingChangeType;
	path: string;
	from: any;
	to: any;
	impact: 'high' | 'medium' | 'low';
	description: string;
	mitigation?: string;
}

export interface DiffSummary {
	totalChanges: number;
	breaking: number;
	nonBreaking: number;
	additions: number;
	deletions: number;
	modifications: number;
	compatible: boolean;
}

export type ChangeType =
	| 'field_added'
	| 'field_removed'
	| 'field_renamed'
	| 'type_changed'
	| 'constraint_added'
	| 'constraint_removed'
	| 'constraint_changed'
	| 'optional_added'
	| 'optional_removed'
	| 'enum_value_added'
	| 'enum_value_removed'
	| 'array_type_changed'
	| 'union_variant_added'
	| 'union_variant_removed'
	| 'refinement_added'
	| 'refinement_removed';

export type BreakingChangeType =
	| 'required_field_added'
	| 'field_removed'
	| 'type_narrowed'
	| 'constraint_tightened'
	| 'enum_value_removed'
	| 'optional_to_required'
	| 'union_variant_removed';

export interface DiffOptions {
	detectBreaking?: boolean;
	generateMigration?: boolean;
	ignoreMetadata?: boolean;
	strictMode?: boolean;
	compareDescriptions?: boolean;
}

// === SCHEMA DIFF ENGINE ===

export class SchemaDiff {
	private options: Required<DiffOptions>;

	constructor(options: DiffOptions = {}) {
		this.options = {
			detectBreaking: options.detectBreaking ?? true,
			generateMigration: options.generateMigration ?? true,
			ignoreMetadata: options.ignoreMetadata ?? false,
			strictMode: options.strictMode ?? false,
			compareDescriptions: options.compareDescriptions ?? false,
		};
	}

	/**
	 * Compare two Zod schemas and detect all changes
	 */
	diff(oldSchema: z.ZodTypeAny, newSchema: z.ZodTypeAny, path = 'root'): SchemaDiffResult {
		const changes: SchemaChange[] = [];
		const breakingChanges: BreakingChange[] = [];

		// Perform deep comparison
		this.compareSchemas(oldSchema, newSchema, path, changes, breakingChanges);

		// Calculate summary
		const summary = this.calculateSummary(changes, breakingChanges);

		// Generate migration guide if requested
		const migrationGuide = this.options.generateMigration
			? this.generateMigrationGuide(changes, breakingChanges)
			: undefined;

		return {
			changes,
			breakingChanges,
			summary,
			migrationGuide,
		};
	}

	/**
	 * Deep comparison of two schemas
	 */
	private compareSchemas(
		oldSchema: z.ZodTypeAny,
		newSchema: z.ZodTypeAny,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldType = (oldSchema as any)._def.typeName;
		const newType = (newSchema as any)._def.typeName;

		// Type changed - breaking!
		if (oldType !== newType) {
			const change: SchemaChange = {
				type: 'type_changed',
				path,
				from: oldType,
				to: newType,
				severity: 'error',
				message: `Type changed from ${oldType} to ${newType}`,
				breaking: true,
			};
			changes.push(change);

			const breakingChange: BreakingChange = {
				type: 'type_narrowed',
				path,
				from: oldType,
				to: newType,
				impact: 'high',
				description: `Schema type was changed from ${oldType} to ${newType}`,
				mitigation: `Update all usages to handle the new type ${newType}`,
			};
			breakingChanges.push(breakingChange);
			return;
		}

		// Compare based on type
		switch (oldType) {
			case 'ZodObject':
				this.compareObjects(oldSchema as z.ZodObject<any>, newSchema as z.ZodObject<any>, path, changes, breakingChanges);
				break;
			case 'ZodArray':
				this.compareArrays(oldSchema as z.ZodArray<any>, newSchema as z.ZodArray<any>, path, changes, breakingChanges);
				break;
			case 'ZodUnion':
				this.compareUnions(oldSchema as z.ZodUnion<any>, newSchema as z.ZodUnion<any>, path, changes, breakingChanges);
				break;
			case 'ZodEnum':
				this.compareEnums(oldSchema as z.ZodEnum<any>, newSchema as z.ZodEnum<any>, path, changes, breakingChanges);
				break;
			case 'ZodString':
			case 'ZodNumber':
			case 'ZodBoolean':
				this.comparePrimitives(oldSchema, newSchema, path, changes, breakingChanges);
				break;
			case 'ZodOptional':
				this.compareOptionals(oldSchema as z.ZodOptional<any>, newSchema as z.ZodOptional<any>, path, changes, breakingChanges);
				break;
			case 'ZodNullable':
				this.compareNullables(oldSchema as z.ZodNullable<any>, newSchema as z.ZodNullable<any>, path, changes, breakingChanges);
				break;
		}
	}

	/**
	 * Compare ZodObject schemas
	 */
	private compareObjects(
		oldSchema: z.ZodObject<any>,
		newSchema: z.ZodObject<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldShape = oldSchema.shape;
		const newShape = newSchema.shape;

		const oldKeys = new Set(Object.keys(oldShape));
		const newKeys = new Set(Object.keys(newShape));

		// Detect removed fields (breaking!)
		for (const key of oldKeys) {
			if (!newKeys.has(key)) {
				const fieldPath = `${path}.${key}`;
				const change: SchemaChange = {
					type: 'field_removed',
					path: fieldPath,
					from: oldShape[key],
					severity: 'error',
					message: `Field "${key}" was removed`,
					breaking: true,
				};
				changes.push(change);

				const breakingChange: BreakingChange = {
					type: 'field_removed',
					path: fieldPath,
					from: oldShape[key],
					to: undefined,
					impact: 'high',
					description: `Field "${key}" was removed from the schema`,
					mitigation: `Remove all usages of "${key}" or make it optional before removal`,
				};
				breakingChanges.push(breakingChange);
			}
		}

		// Detect added fields
		for (const key of newKeys) {
			if (!oldKeys.has(key)) {
				const fieldPath = `${path}.${key}`;
				const newField = newSchema;
				const isOptional = this.isOptionalField(newShape[key]);

				if (!isOptional) {
					// Required field added - breaking!
					const change: SchemaChange = {
						type: 'field_added',
						path: fieldPath,
						to: newShape[key],
						severity: 'error',
						message: `Required field "${key}" was added`,
						breaking: true,
					};
					changes.push(change);

					const breakingChange: BreakingChange = {
						type: 'required_field_added',
						path: fieldPath,
						from: undefined,
						to: newShape[key],
						impact: 'high',
						description: `Required field "${key}" was added`,
						mitigation: `Provide a default value or make the field optional`,
					};
					breakingChanges.push(breakingChange);
				} else {
					// Optional field added - non-breaking
					const change: SchemaChange = {
						type: 'field_added',
						path: fieldPath,
						to: newShape[key],
						severity: 'info',
						message: `Optional field "${key}" was added`,
						breaking: false,
					};
					changes.push(change);
				}
			}
		}

		// Detect modified fields
		for (const key of oldKeys) {
			if (newKeys.has(key)) {
				const fieldPath = `${path}.${key}`;
				this.compareSchemas(oldShape[key], newShape[key], fieldPath, changes, breakingChanges);
			}
		}
	}

	/**
	 * Compare ZodArray schemas
	 */
	private compareArrays(
		oldSchema: z.ZodArray<any>,
		newSchema: z.ZodArray<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldElement = (oldSchema as any)._def.type;
		const newElement = (newSchema as any)._def.type;

		this.compareSchemas(oldElement, newElement, `${path}[]`, changes, breakingChanges);
	}

	/**
	 * Compare ZodUnion schemas
	 */
	private compareUnions(
		oldSchema: z.ZodUnion<any>,
		newSchema: z.ZodUnion<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldOptions = (oldSchema as any)._def.options;
		const newOptions = (newSchema as any)._def.options;

		// Simple comparison - count variants
		if (oldOptions.length > newOptions.length) {
			const change: SchemaChange = {
				type: 'union_variant_removed',
				path,
				from: oldOptions.length,
				to: newOptions.length,
				severity: 'error',
				message: 'Union variants were removed',
				breaking: true,
			};
			changes.push(change);

			const breakingChange: BreakingChange = {
				type: 'union_variant_removed',
				path,
				from: oldOptions.length,
				to: newOptions.length,
				impact: 'high',
				description: 'One or more union variants were removed',
				mitigation: 'Ensure existing data does not use removed variants',
			};
			breakingChanges.push(breakingChange);
		} else if (oldOptions.length < newOptions.length) {
			const change: SchemaChange = {
				type: 'union_variant_added',
				path,
				from: oldOptions.length,
				to: newOptions.length,
				severity: 'info',
				message: 'Union variants were added',
				breaking: false,
			};
			changes.push(change);
		}
	}

	/**
	 * Compare ZodEnum schemas
	 */
	private compareEnums(
		oldSchema: z.ZodEnum<any>,
		newSchema: z.ZodEnum<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldValues = (oldSchema as any)._def.values as string[];
		const newValues = (newSchema as any)._def.values as string[];

		const oldSet = new Set(oldValues);
		const newSet = new Set(newValues);

		// Detect removed enum values (breaking!)
		for (const value of oldValues) {
			if (!newSet.has(value)) {
				const change: SchemaChange = {
					type: 'enum_value_removed',
					path,
					from: value,
					severity: 'error',
					message: `Enum value "${value}" was removed`,
					breaking: true,
				};
				changes.push(change);

				const breakingChange: BreakingChange = {
					type: 'enum_value_removed',
					path,
					from: value,
					to: newValues,
					impact: 'high',
					description: `Enum value "${value}" was removed`,
					mitigation: `Migrate existing data from "${value}" to a supported value`,
				};
				breakingChanges.push(breakingChange);
			}
		}

		// Detect added enum values (non-breaking)
		for (const value of newValues) {
			if (!oldSet.has(value)) {
				const change: SchemaChange = {
					type: 'enum_value_added',
					path,
					to: value,
					severity: 'info',
					message: `Enum value "${value}" was added`,
					breaking: false,
				};
				changes.push(change);
			}
		}
	}

	/**
	 * Compare primitive schemas (string, number, boolean)
	 */
	private comparePrimitives(
		oldSchema: z.ZodTypeAny,
		newSchema: z.ZodTypeAny,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		// Check for constraint changes (min, max, regex, etc.)
		const oldChecks = (oldSchema as any)._def.checks || [];
		const newChecks = (newSchema as any)._def.checks || [];

		// Simplified constraint comparison
		if (newChecks.length > oldChecks.length) {
			const change: SchemaChange = {
				type: 'constraint_added',
				path,
				from: oldChecks.length,
				to: newChecks.length,
				severity: 'warning',
				message: 'Constraints were tightened',
				breaking: true,
			};
			changes.push(change);

			const breakingChange: BreakingChange = {
				type: 'constraint_tightened',
				path,
				from: oldChecks,
				to: newChecks,
				impact: 'medium',
				description: 'Additional validation constraints were added',
				mitigation: 'Ensure existing data meets the new constraints',
			};
			breakingChanges.push(breakingChange);
		} else if (newChecks.length < oldChecks.length) {
			const change: SchemaChange = {
				type: 'constraint_removed',
				path,
				from: oldChecks.length,
				to: newChecks.length,
				severity: 'info',
				message: 'Constraints were relaxed',
				breaking: false,
			};
			changes.push(change);
		}
	}

	/**
	 * Compare ZodOptional schemas
	 */
	private compareOptionals(
		oldSchema: z.ZodOptional<any>,
		newSchema: z.ZodOptional<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldInner = oldSchema.unwrap();
		const newInner = newSchema.unwrap();

		this.compareSchemas(oldInner, newInner, path, changes, breakingChanges);
	}

	/**
	 * Compare ZodNullable schemas
	 */
	private compareNullables(
		oldSchema: z.ZodNullable<any>,
		newSchema: z.ZodNullable<any>,
		path: string,
		changes: SchemaChange[],
		breakingChanges: BreakingChange[],
	): void {
		const oldInner = (oldSchema as any).unwrap();
		const newInner = (newSchema as any).unwrap();

		this.compareSchemas(oldInner, newInner, path, changes, breakingChanges);
	}

	/**
	 * Check if a field is optional
	 */
	private isOptionalField(schema: z.ZodTypeAny): boolean {
		const typeName = (schema as any)._def.typeName;
		return typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault';
	}

	/**
	 * Calculate summary statistics
	 */
	private calculateSummary(changes: SchemaChange[], breakingChanges: BreakingChange[]): DiffSummary {
		const breaking = changes.filter((c) => c.breaking).length;
		const nonBreaking = changes.length - breaking;

		const additions = changes.filter((c) => c.type.includes('added')).length;
		const deletions = changes.filter((c) => c.type.includes('removed')).length;
		const modifications = changes.length - additions - deletions;

		return {
			totalChanges: changes.length,
			breaking,
			nonBreaking,
			additions,
			deletions,
			modifications,
			compatible: breakingChanges.length === 0,
		};
	}

	/**
	 * Generate migration guide from changes
	 */
	private generateMigrationGuide(changes: SchemaChange[], breakingChanges: BreakingChange[]): string {
		let guide = '# Schema Migration Guide\n\n';

		if (breakingChanges.length === 0) {
			guide += '✅ **No breaking changes detected**\n\n';
			guide += 'This schema change is backward compatible.\n\n';
		} else {
			guide += `⚠️  **${breakingChanges.length} breaking change(s) detected**\n\n`;
			guide += '## Breaking Changes\n\n';

			for (const bc of breakingChanges) {
				guide += `### ${bc.type} at \`${bc.path}\`\n\n`;
				guide += `**Impact:** ${bc.impact}\n\n`;
				guide += `**Description:** ${bc.description}\n\n`;

				if (bc.mitigation) {
					guide += `**Mitigation:**\n${bc.mitigation}\n\n`;
				}

				guide += '---\n\n';
			}
		}

		if (changes.length > breakingChanges.length) {
			guide += '## Non-Breaking Changes\n\n';

			const nonBreaking = changes.filter((c) => !c.breaking);
			for (const change of nonBreaking) {
				guide += `- **${change.type}** at \`${change.path}\`: ${change.message}\n`;
			}

			guide += '\n';
		}

		return guide;
	}
}

// === FACTORY FUNCTION ===

export function createSchemaDiff(options?: DiffOptions): SchemaDiff {
	return new SchemaDiff(options);
}

export default SchemaDiff;
