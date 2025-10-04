/**
 * @fileoverview Prefer Meta Rule
 * @module PreferMetaRule
 *
 * Encourages using .meta() over .describe() for richer schema metadata.
 */

import type { SourceFile } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast/extractor';
import type { SchemaVisitor, VisitorContext } from '../../ast/visitor';
import { createFixer, createFixerContext } from '../fixer';
import type { RuleViolation } from '../types';

export interface PreferMetaOptions {
	/** Auto-convert .describe() to .meta() */
	autoFix?: boolean;
	/** Warn about missing metadata fields */
	suggestFields?: string[];
}

/**
 * Check if schema uses .describe() instead of .meta()
 */
export function checkPreferMeta(
	schema: ZodSchemaInfo,
	sourceFile: SourceFile,
	options: PreferMetaOptions = {},
): RuleViolation | null {
	const opts = {
		autoFix: options.autoFix ?? false,
		suggestFields: options.suggestFields ?? ['title', 'examples', 'category'],
	};

	const hasDescribe = schema.type.includes('.describe(');
	const hasMeta = schema.type.includes('.meta(');

	// If using .describe() but not .meta(), suggest .meta()
	if (hasDescribe && !hasMeta) {
		const violation: RuleViolation = {
			schemaName: schema.name,
			filePath: schema.filePath,
			line: schema.line,
			column: schema.column ?? 0,
			message: `Schema "${schema.name}" uses .describe() instead of .meta(). Consider using .meta() for richer metadata.`,
			severity: 'info',
		};

		// Generate fix if auto-fix enabled
		if (opts.autoFix) {
			const fixer = createFixer();
			const context = createFixerContext(sourceFile, 'prefer-meta', violation.message);

			// Extract description from .describe()
			const describeMatch = schema.type.match(/\.describe\(['"`]([^'"`]+)['"`]\)/);
			const description = describeMatch ? describeMatch[1] : '';

			// Find .describe() position
			const schemaText = sourceFile.getFullText();
			const describePos = schemaText.indexOf(`.describe(`, sourceFile.getPos());

			if (describePos > -1) {
				// Find the closing parenthesis
				let parenDepth = 0;
				let endPos = describePos + '.describe('.length;
				for (let i = endPos; i < schemaText.length; i++) {
					if (schemaText[i] === '(') parenDepth++;
					if (schemaText[i] === ')') {
						if (parenDepth === 0) {
							endPos = i + 1;
							break;
						}
						parenDepth--;
					}
				}

				// Create .meta() replacement
				const metaObj = {
					description,
					title: schema.name,
				};

				const metaStr = `.meta(${JSON.stringify(metaObj, null, 2)})`;

				violation.fix = fixer.replace(context, describePos, endPos, metaStr);
			}
		}

		return violation;
	}

	// Check if .meta() is missing suggested fields
	if (hasMeta && schema.metadata) {
		const missingFields = opts.suggestFields.filter((field) => !schema.metadata?.[field]);

		if (missingFields.length > 0) {
			return {
				schemaName: schema.name,
				filePath: schema.filePath,
				line: schema.line,
				column: schema.column ?? 0,
				message: `Schema "${schema.name}" .meta() is missing recommended fields: ${missingFields.join(', ')}`,
				severity: 'info',
			};
		}
	}

	return null;
}

/**
 * Create a visitor that checks for .meta() usage
 */
export function createPreferMetaVisitor(
	violations: RuleViolation[],
	sourceFile: SourceFile,
	options: PreferMetaOptions = {},
): SchemaVisitor {
	return {
		enter(context: VisitorContext): undefined {
			const violation = checkPreferMeta(context.schema, sourceFile, options);
			if (violation) {
				violations.push(violation);
			}
			return undefined;
		},
	};
}

/**
 * Rule metadata
 */
export const preferMetaRule = {
	name: 'prefer-meta',
	description: 'Prefer .meta() over .describe() for richer metadata',
	category: 'best-practices',
	recommended: true,
	fixable: true,
	defaultSeverity: 'info' as const,
	options: {
		autoFix: false,
		suggestFields: ['title', 'examples', 'category'],
	},
};
