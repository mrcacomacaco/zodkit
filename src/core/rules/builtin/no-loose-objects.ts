/**
 * @fileoverview Rule: no-loose-objects - Ensure objects have specific property definitions
 * @module Rules/NoLooseObjects
 */

import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { ZodSchemaInfo } from '../../ast';
import { createFix } from '../fixer';
import type { RuleViolation } from '../types';

export interface NoLooseObjectsOptions {
	/** Allow passthrough() in specific cases */
	allowPassthrough?: boolean;
	/** Allow catchall() in specific cases */
	allowCatchall?: boolean;
	/** Auto-fix violations */
	autoFix?: boolean;
}

/**
 * Check if schema uses loose object patterns like z.object({}).passthrough()
 */
export function checkNoLooseObjects(
	schema: ZodSchemaInfo,
	sourceFile: SourceFile,
	options: NoLooseObjectsOptions = {},
): RuleViolation | null {
	const { allowPassthrough = false, allowCatchall = false } = options;

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

	// Check for loose patterns
	const violations: string[] = [];

	// Check for .passthrough()
	if (!allowPassthrough && text.includes('.passthrough()')) {
		violations.push('Uses .passthrough() which allows unknown properties');
	}

	// Check for .catchall()
	if (!allowCatchall && text.includes('.catchall(')) {
		violations.push('Uses .catchall() which may be too permissive');
	}

	// Check for empty object with no passthrough/catchall
	if (text.match(/z\.object\(\s*\{\s*\}\s*\)/)) {
		violations.push('Empty object schema with no properties defined');
	}

	if (violations.length === 0) return null;

	const { line, column } = sourceFile.getLineAndColumnAtPos(initializer.getStart());

	return {
		schemaName: schema.name,
		filePath: schema.filePath,
		line,
		column,
		message: `Loose object definition: ${violations.join(', ')}`,
		severity: 'warning',
		suggestions: [
			'Define explicit properties for the object schema',
			'Use strict mode by avoiding .passthrough() and .catchall()',
			'If unknown properties are needed, document why with a comment',
		],
		fix: options.autoFix
			? createFix({
					filePath: schema.filePath,
					start: initializer.getStart(),
					end: initializer.getEnd(),
					replacement: text.replaceAll('.passthrough()', '').replaceAll(/\.catchall\([^)]*\)/g, ''),
				})
			: undefined,
	};
}

/**
 * Create visitor for checking loose objects
 */
export function createNoLooseObjectsVisitor(options: NoLooseObjectsOptions = {}) {
	return (schema: ZodSchemaInfo, sourceFile: SourceFile) =>
		checkNoLooseObjects(schema, sourceFile, options);
}
