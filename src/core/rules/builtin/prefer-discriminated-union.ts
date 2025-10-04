/**
 * @fileoverview Prefer Discriminated Union Rule
 * @module PreferDiscriminatedUnionRule
 *
 * Suggests using discriminated unions over regular unions for better type inference.
 */

import type { Node } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast/extractor';
import type { SchemaVisitor, VisitorContext } from '../../ast/visitor';
import type { RuleViolation } from '../types';

export interface PreferDiscriminatedUnionOptions {
	/** Minimum number of union options to trigger warning */
	minOptions?: number;
	/** Auto-suggest discriminator field */
	autoSuggest?: boolean;
}

/**
 * Check if union could be discriminated
 */
export function checkPreferDiscriminatedUnion(
	schema: ZodSchemaInfo,
	options: PreferDiscriminatedUnionOptions = {},
): RuleViolation | null {
	const opts = {
		minOptions: options.minOptions ?? 3,
		autoSuggest: options.autoSuggest ?? true,
	};

	// Check if schema uses z.union()
	const isUnion = schema.type.includes('z.union(');
	const isDiscriminatedUnion = schema.type.includes('z.discriminatedUnion(');

	if (isUnion && !isDiscriminatedUnion) {
		// Try to count union options
		const unionMatch = schema.type.match(/z\.union\(\[([^\]]+)\]/);
		if (unionMatch) {
			const optionsStr = unionMatch[1];
			// Count comma-separated options (rough estimate)
			const optionCount = optionsStr.split(',').length;

			if (optionCount >= opts.minOptions) {
				const violation: RuleViolation = {
					schemaName: schema.name,
					filePath: schema.filePath,
					line: schema.line,
					column: schema.column ?? 0,
					message: `Schema "${schema.name}" uses z.union() with ${optionCount} options. Consider using z.discriminatedUnion() for better type inference.`,
					severity: 'info',
				};

				if (opts.autoSuggest) {
					violation.suggestions = [
						'Add a discriminator field like "type" or "kind" to each option',
						'Use z.discriminatedUnion("type", [...]) for explicit discrimination',
						'Example: z.discriminatedUnion("type", [z.object({ type: z.literal("a"), ... }), ...])',
					];
				}

				return violation;
			}
		}
	}

	return null;
}

/**
 * Check if objects in union have common fields (potential discriminators)
 */
export function analyzeUnionOptions(unionOptions: Node[]): string[] {
	const potentialDiscriminators: string[] = [];

	// Extract field names from each option
	const fieldsByOption: Set<string>[] = [];

	for (const option of unionOptions) {
		const fields = new Set<string>();
		const text = option.getText();

		// Simple field extraction (look for property names in object)
		const fieldMatches = text.matchAll(/(\w+):/g);
		for (const match of fieldMatches) {
			fields.add(match[1]);
		}

		fieldsByOption.push(fields);
	}

	// Find common fields across all options
	if (fieldsByOption.length > 0) {
		const firstFields = fieldsByOption[0];

		for (const field of firstFields) {
			const isPresentInAll = fieldsByOption.every((fields) => fields.has(field));
			if (isPresentInAll) {
				potentialDiscriminators.push(field);
			}
		}
	}

	return potentialDiscriminators;
}

/**
 * Create a visitor that checks for discriminated unions
 */
export function createPreferDiscriminatedUnionVisitor(
	violations: RuleViolation[],
	options: PreferDiscriminatedUnionOptions = {},
): SchemaVisitor {
	return {
		visitUnion(unionOptions: Node[], context: VisitorContext) {
			const violation = checkPreferDiscriminatedUnion(context.schema, options);

			if (violation) {
				// Analyze union options for potential discriminators
				const discriminators = analyzeUnionOptions(unionOptions);

				if (discriminators.length > 0) {
					violation.suggestions = [
						`Potential discriminator fields found: ${discriminators.join(', ')}`,
						...(violation.suggestions ?? []),
					];
				}

				violations.push(violation);
			}
		},
	};
}

/**
 * Rule metadata
 */
export const preferDiscriminatedUnionRule = {
	name: 'prefer-discriminated-union',
	description: 'Prefer discriminated unions over regular unions for better type inference',
	category: 'best-practices',
	recommended: true,
	fixable: false,
	defaultSeverity: 'info' as const,
	options: {
		minOptions: 3,
		autoSuggest: true,
	},
};
