/**
 * @fileoverview No Any Type Rule
 * @module NoAnyTypeRule
 *
 * Prevents use of z.any() which bypasses type safety.
 */

import type { SourceFile } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast/extractor';
import type { SchemaVisitor, VisitorContext } from '../../ast/visitor';
import { createFixer, createFixerContext } from '../fixer';
import type { RuleViolation } from '../types';

export interface NoAnyTypeOptions {
	/** Auto-fix by replacing with z.unknown() */
	autoFix?: boolean;
	/** Suggested alternative */
	alternative?: 'unknown' | 'never';
}

/**
 * Check if schema uses z.any()
 */
export function checkNoAnyType(
	schema: ZodSchemaInfo,
	sourceFile: SourceFile,
	options: NoAnyTypeOptions = {},
): RuleViolation[] {
	const opts = {
		autoFix: options.autoFix ?? false,
		alternative: options.alternative ?? 'unknown',
	};

	const violations: RuleViolation[] = [];

	// Check if schema uses z.any()
	const anyMatches = schema.type.matchAll(/z\.any\(\)/g);

	for (const match of anyMatches) {
		const violation: RuleViolation = {
			schemaName: schema.name,
			filePath: schema.filePath,
			line: schema.line,
			column: schema.column ?? 0,
			message: `Schema "${schema.name}" uses z.any() which bypasses type safety. Use z.${opts.alternative}() instead.`,
			severity: 'error',
		};

		// Generate fix if auto-fix enabled
		if (opts.autoFix && match.index !== undefined) {
			const fixer = createFixer();
			const context = createFixerContext(sourceFile, 'no-any-type', violation.message);

			const schemaText = sourceFile.getFullText();

			// Calculate position from line number
			const lines = schemaText.split('\n');
			let schemaStart = 0;
			for (let i = 0; i < schema.line - 1 && i < lines.length; i++) {
				schemaStart += lines[i].length + 1;
			}

			const anyPos = schemaStart + match.index;

			violation.fix = fixer.replace(
				context,
				anyPos,
				anyPos + 'z.any()'.length,
				`z.${opts.alternative}()`,
			);
		}

		violations.push(violation);
	}

	return violations;
}

/**
 * Create a visitor that checks for z.any()
 */
export function createNoAnyTypeVisitor(
	violations: RuleViolation[],
	sourceFile: SourceFile,
	options: NoAnyTypeOptions = {},
): SchemaVisitor {
	return {
		visitZodMethod(method: string, context: VisitorContext) {
			if (method === 'any') {
				const schemaViolations = checkNoAnyType(context.schema, sourceFile, options);
				violations.push(...schemaViolations);
			}
		},
	};
}

/**
 * Rule metadata
 */
export const noAnyTypeRule = {
	name: 'no-any-type',
	description: 'Disallow z.any() to maintain type safety',
	category: 'type-safety',
	recommended: true,
	fixable: true,
	defaultSeverity: 'error' as const,
	options: {
		autoFix: false,
		alternative: 'unknown',
	},
};
