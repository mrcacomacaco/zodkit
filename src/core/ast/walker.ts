/**
 * @fileoverview AST Walker - Tree traversal for Zod schemas
 * @module AST/Walker
 *
 * Provides visitor pattern for walking Zod schema AST nodes
 */

import type { Node, SourceFile } from 'ts-morph';
import type { ZodSchemaInfo } from './extractor';

// === TYPES ===

export interface WalkerVisitor {
	visitSchema?: (schema: ZodSchemaInfo) => void | boolean; // return false to skip children
	visitNode?: (node: Node) => void | boolean;
	visitSourceFile?: (sourceFile: SourceFile) => void | boolean;
}

export interface WalkOptions {
	skipChildren?: boolean;
	filter?: (node: Node) => boolean;
}

// === AST WALKER ===

/**
 * AST Walker for traversing TypeScript/Zod AST
 */
export class ASTWalker {
	/**
	 * Walk source file with visitor
	 */
	walk(sourceFile: SourceFile, visitor: WalkerVisitor, options: WalkOptions = {}): void {
		// Visit source file
		if (visitor.visitSourceFile) {
			const shouldContinue = visitor.visitSourceFile(sourceFile);
			if (shouldContinue === false) return;
		}

		// Walk all descendants
		sourceFile.forEachDescendant((node) => {
			// Apply filter
			if (options.filter && !options.filter(node)) {
				return;
			}

			// Visit node
			if (visitor.visitNode) {
				const shouldContinue = visitor.visitNode(node);
				if (shouldContinue === false) {
					return;
				}
			}
		});
	}

	/**
	 * Walk schemas with visitor
	 */
	walkSchemas(schemas: ZodSchemaInfo[], visitor: WalkerVisitor): void {
		for (const schema of schemas) {
			if (visitor.visitSchema) {
				const shouldContinue = visitor.visitSchema(schema);
				if (shouldContinue === false) {
					continue;
				}
			}
		}
	}

	/**
	 * Walk and collect nodes
	 */
	collect<T extends Node>(
		sourceFile: SourceFile,
		predicate: (node: Node) => node is T,
	): T[] {
		const collected: T[] = [];

		sourceFile.forEachDescendant((node) => {
			if (predicate(node)) {
				collected.push(node);
			}
		});

		return collected;
	}

	/**
	 * Find first node matching predicate
	 */
	findFirst<T extends Node>(
		sourceFile: SourceFile,
		predicate: (node: Node) => node is T,
	): T | undefined {
		let found: T | undefined;

		sourceFile.forEachDescendant((node) => {
			if (!found && predicate(node)) {
				found = node;
			}
		});

		return found;
	}

	/**
	 * Walk with depth tracking
	 */
	walkWithDepth(
		sourceFile: SourceFile,
		visitor: (node: Node, depth: number) => void | boolean,
	): void {
		const walk = (node: Node, depth: number): void => {
			const shouldContinue = visitor(node, depth);
			if (shouldContinue === false) return;

			node.forEachChild((child) => {
				walk(child, depth + 1);
			});
		};

		sourceFile.forEachChild((child) => walk(child, 0));
	}

	/**
	 * Walk with parent tracking
	 */
	walkWithParent(
		sourceFile: SourceFile,
		visitor: (node: Node, parent: Node | undefined) => void | boolean,
	): void {
		const walk = (node: Node, parent: Node | undefined): void => {
			const shouldContinue = visitor(node, parent);
			if (shouldContinue === false) return;

			node.forEachChild((child) => {
				walk(child, node);
			});
		};

		sourceFile.forEachChild((child) => walk(child, undefined));
	}
}

/**
 * Create AST walker
 */
export function createWalker(): ASTWalker {
	return new ASTWalker();
}

export default ASTWalker;
