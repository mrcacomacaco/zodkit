/**
 * @fileoverview Rule: require-refinements - Encourage using refinements for complex validation
 * @module Rules/RequireRefinements
 */

import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast';
import type { RuleViolation } from '../types';

export interface RequireRefinementsOptions {
	/** Minimum fields before suggesting refinements */
	minFields?: number;
	/** Check for custom validation patterns */
	checkCustomValidation?: boolean;
	/** Auto-fix violations */
	autoFix?: boolean;
}

/**
 * Check if schema should use refinements for complex validation
 */
export function checkRequireRefinements(
	schema: ZodSchemaInfo,
	sourceFile: SourceFile,
	options: RequireRefinementsOptions = {},
): RuleViolation | null {
	const { minFields = 3, checkCustomValidation = true } = options;

	// Get the schema definition node
	const declaration = sourceFile
		.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
		.find((decl) => {
			return decl.getName() === schema.name;
		});

	if (!declaration) return null;

	const initializer = declaration.getInitializer();
	if (!initializer) return null;

	const text = initializer.getText();

	// Skip if already has refinements or superRefine
	if (text.includes('.refine(') || text.includes('.superRefine(')) {
		return null;
	}

	const issues: string[] = [];

	// Check for object schemas with multiple fields
	if (text.includes('z.object({')) {
		// Count fields (simple heuristic)
		const fieldMatches = text.match(/\w+:/g);
		const fieldCount = fieldMatches ? fieldMatches.length : 0;

		if (fieldCount >= minFields) {
			// Check for patterns that suggest need for refinements
			const hasDateFields = /date|time|timestamp/i.test(text);
			const hasNumericRanges = text.includes('.min(') && text.includes('.max(');
			const hasRelatedFields = /start.*end|min.*max|from.*to/i.test(text);

			if (hasRelatedFields) {
				issues.push('Schema has related fields that might need cross-field validation');
			}

			if (hasDateFields && hasRelatedFields) {
				issues.push('Date range validation should use .refine() for start < end checks');
			}

			if (hasNumericRanges && fieldCount > 3) {
				issues.push('Complex numeric constraints might benefit from .refine() for clarity');
			}
		}
	}

	// Check for patterns that often need custom validation
	if (checkCustomValidation) {
		// Password and confirm password pattern
		if (/password.*confirm/i.test(text) && !text.includes('.refine(')) {
			issues.push('Password confirmation should use .refine() to check equality');
		}

		// Email and confirmEmail pattern
		if (/email.*confirm/i.test(text) && !text.includes('.refine(')) {
			issues.push('Email confirmation should use .refine() to check equality');
		}

		// Age and birthdate pattern
		if (/age.*birth|birth.*age/i.test(text)) {
			issues.push('Age and birthdate should be validated for consistency with .refine()');
		}
	}

	if (issues.length === 0) return null;

	const { line, column } = sourceFile.getLineAndColumnAtPos(initializer.getStart());

	return {
		schemaName: schema.name,
		filePath: schema.filePath,
		line,
		column,
		message: `Consider adding refinements: ${issues.join('; ')}`,
		severity: 'info',
		suggestions: [
			'Use .refine() for cross-field validation',
			'Use .superRefine() for complex multi-field checks with detailed error paths',
			'Add custom validation messages for better user experience',
			'Example: .refine((data) => data.start < data.end, { message: "Start must be before end" })',
		],
	};
}

/**
 * Create visitor for checking refinement requirements
 */
export function createRequireRefinementsVisitor(options: RequireRefinementsOptions = {}) {
	return (schema: ZodSchemaInfo, sourceFile: SourceFile) =>
		checkRequireRefinements(schema, sourceFile, options);
}
