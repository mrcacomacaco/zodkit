/**
 * @fileoverview Require Description Rule
 * @module RequireDescriptionRule
 *
 * Ensures all schemas have descriptions via .describe() or TSDoc comments.
 */

import type { SourceFile } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast/extractor';
import { type SchemaVisitor, type VisitorContext } from '../../ast/visitor';
import { createFixer, createFixerContext, type Fix } from '../fixer';
import type { RuleViolation } from '../types';

export interface RequireDescriptionOptions {
	/** Require descriptions on all schemas */
	requireAll?: boolean;
	/** Require descriptions only on exported schemas */
	exportedOnly?: boolean;
	/** Minimum description length */
	minLength?: number;
	/** Allow TSDoc comments as descriptions */
	allowTSDoc?: boolean;
	/** Auto-fix by adding placeholder descriptions */
	autoFix?: boolean;
}

/**
 * Check if schema has a description
 */
export function checkDescription(
	schema: ZodSchemaInfo,
	sourceFile: SourceFile,
	options: RequireDescriptionOptions = {},
): RuleViolation | null {
	const opts = {
		requireAll: options.requireAll ?? true,
		exportedOnly: options.exportedOnly ?? false,
		minLength: options.minLength ?? 10,
		allowTSDoc: options.allowTSDoc ?? true,
		autoFix: options.autoFix ?? false,
	};

	// Skip if only checking exported and this isn't exported
	if (opts.exportedOnly && !schema.isExported) {
		return null;
	}

	// Check for description from various sources
	const hasDescribe = schema.type.includes('.describe(');
	const hasMeta = schema.metadata?.description;
	const hasTSDoc = schema.description && opts.allowTSDoc;

	const description = hasMeta || (hasTSDoc && schema.description) || '';

	// Check if description exists
	if (!hasDescribe && !description) {
		const violation: RuleViolation = {
			schemaName: schema.name,
			filePath: schema.filePath,
			line: schema.line,
			column: schema.column || 0,
			message: `Schema "${schema.name}" is missing a description. Add .describe() or TSDoc comment.`,
			severity: 'error',
		};

		// Generate fix if auto-fix enabled
		if (opts.autoFix) {
			const fixer = createFixer();
			const context = createFixerContext(sourceFile, 'require-description', violation.message);

			// Find end of schema definition to insert .describe()
			const schemaText = sourceFile.getFullText();

			// Calculate position from line number (line is 1-based, need 0-based)
			const lines = schemaText.split('\n');
			let schemaStart = 0;
			for (let i = 0; i < schema.line - 1 && i < lines.length; i++) {
				schemaStart += lines[i].length + 1; // +1 for newline
			}

			// Find the semicolon or line end after the schema definition
			let insertPos = schemaStart;
			let depth = 0;
			for (let i = schemaStart; i < schemaText.length; i++) {
				const char = schemaText[i];
				if (char === '(' || char === '{' || char === '[') depth++;
				if (char === ')' || char === '}' || char === ']') depth--;
				if (depth === 0 && (char === ';' || char === '\n')) {
					insertPos = i;
					break;
				}
			}

			const placeholderDescription = `${schema.name} schema description`;
			violation.fix = fixer.insertMethod(
				context,
				insertPos,
				'describe',
				`"${placeholderDescription}"`,
			);
		}

		return violation;
	}

	// Check description length
	if (typeof description === 'string' && description.length < opts.minLength) {
		return {
			schemaName: schema.name,
			filePath: schema.filePath,
			line: schema.line,
			column: schema.column || 0,
			message: `Schema "${schema.name}" description is too short (${description.length} chars, minimum: ${opts.minLength}).`,
			severity: 'warning',
		};
	}

	return null;
}

/**
 * Create a visitor that checks for descriptions
 */
export function createRequireDescriptionVisitor(
	violations: RuleViolation[],
	sourceFile: SourceFile,
	options: RequireDescriptionOptions = {},
): SchemaVisitor {
	return {
		enter(context: VisitorContext) {
			const violation = checkDescription(context.schema, sourceFile, options);
			if (violation) {
				violations.push(violation);
			}
		},
	};
}

/**
 * Rule metadata
 */
export const requireDescriptionRule = {
	name: 'require-description',
	description: 'Ensures all schemas have descriptions',
	category: 'best-practices',
	recommended: true,
	fixable: true,
	defaultSeverity: 'error' as const,
	options: {
		requireAll: true,
		exportedOnly: false,
		minLength: 10,
		allowTSDoc: true,
		autoFix: false,
	},
};
