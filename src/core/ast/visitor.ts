/**
 * @fileoverview Schema Visitor Pattern
 * @module ASTVisitor
 *
 * Provides traversal and analysis capabilities for Zod schemas using the visitor pattern.
 * Allows rules and analyzers to walk through schema structures systematically.
 */

import type { Node, SyntaxKind } from 'ts-morph';
import type { ZodSchemaInfo } from './extractor';

/**
 * Visitor context passed to each visit method
 */
export interface VisitorContext {
	/** Current node being visited */
	node: Node;
	/** Parent node */
	parent?: Node;
	/** Path from root to current node */
	path: string[];
	/** Current depth in the tree */
	depth: number;
	/** Schema information */
	schema: ZodSchemaInfo;
	/** Custom metadata */
	metadata: Record<string, unknown>;
}

/**
 * Visitor interface for implementing custom schema analysis
 */
export interface SchemaVisitor {
	/** Called when entering a node */
	enter?(context: VisitorContext): void | boolean;
	/** Called when exiting a node */
	exit?(context: VisitorContext): void;
	/** Called for specific Zod method calls */
	visitZodMethod?(method: string, context: VisitorContext): void;
	/** Called for object shapes */
	visitObjectShape?(properties: Map<string, Node>, context: VisitorContext): void;
	/** Called for unions */
	visitUnion?(options: Node[], context: VisitorContext): void;
	/** Called for arrays */
	visitArray?(element: Node, context: VisitorContext): void;
	/** Called for refinements */
	visitRefinement?(refinement: Node, context: VisitorContext): void;
	/** Called for transforms */
	visitTransform?(transform: Node, context: VisitorContext): void;
}

/**
 * Schema walker that traverses Zod schemas using visitor pattern
 */
export class SchemaWalker {
	private visitors: SchemaVisitor[] = [];

	/**
	 * Register a visitor
	 */
	addVisitor(visitor: SchemaVisitor): void {
		this.visitors.push(visitor);
	}

	/**
	 * Remove a visitor
	 */
	removeVisitor(visitor: SchemaVisitor): void {
		const index = this.visitors.indexOf(visitor);
		if (index > -1) {
			this.visitors.splice(index, 1);
		}
	}

	/**
	 * Walk through a schema with registered visitors
	 */
	walk(schema: ZodSchemaInfo, rootNode: Node): void {
		const context: VisitorContext = {
			node: rootNode,
			path: [schema.name],
			depth: 0,
			schema,
			metadata: {},
		};

		this.visitNode(context);
	}

	/**
	 * Visit a single node
	 */
	private visitNode(context: VisitorContext): void {
		// Enter phase
		for (const visitor of this.visitors) {
			if (visitor.enter) {
				const shouldContinue = visitor.enter(context);
				if (shouldContinue === false) return;
			}
		}

		// Detect Zod-specific patterns
		this.detectZodPatterns(context);

		// Visit children
		const children = context.node.getChildren();
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childContext: VisitorContext = {
				node: child,
				parent: context.node,
				path: [...context.path, `child[${i}]`],
				depth: context.depth + 1,
				schema: context.schema,
				metadata: { ...context.metadata },
			};
			this.visitNode(childContext);
		}

		// Exit phase
		for (const visitor of this.visitors) {
			if (visitor.exit) {
				visitor.exit(context);
			}
		}
	}

	/**
	 * Detect and visit Zod-specific patterns
	 */
	private detectZodPatterns(context: VisitorContext): void {
		const text = context.node.getText();

		// Detect Zod method calls
		const zodMethodMatch = text.match(/\.(\w+)\(/);
		if (zodMethodMatch) {
			const method = zodMethodMatch[1];
			for (const visitor of this.visitors) {
				if (visitor.visitZodMethod) {
					visitor.visitZodMethod(method, context);
				}
			}

			// Specific pattern handlers
			switch (method) {
				case 'object':
					this.visitObjectPattern(context);
					break;
				case 'union':
				case 'discriminatedUnion':
					this.visitUnionPattern(context);
					break;
				case 'array':
					this.visitArrayPattern(context);
					break;
				case 'refine':
				case 'superRefine':
					this.visitRefinementPattern(context);
					break;
				case 'transform':
					this.visitTransformPattern(context);
					break;
			}
		}
	}

	/**
	 * Visit object pattern
	 */
	private visitObjectPattern(context: VisitorContext): void {
		// Extract object properties
		const properties = new Map<string, Node>();
		const objectLiteral = this.findObjectLiteral(context.node);

		if (objectLiteral) {
			for (const prop of objectLiteral.getProperties()) {
				const name = prop.getChildAtIndex(0)?.getText();
				if (name) {
					properties.set(name, prop);
				}
			}
		}

		for (const visitor of this.visitors) {
			if (visitor.visitObjectShape) {
				visitor.visitObjectShape(properties, context);
			}
		}
	}

	/**
	 * Visit union pattern
	 */
	private visitUnionPattern(context: VisitorContext): void {
		const arrayLiteral = this.findArrayLiteral(context.node);
		const options: Node[] = arrayLiteral?.getElements() || [];

		for (const visitor of this.visitors) {
			if (visitor.visitUnion) {
				visitor.visitUnion(options, context);
			}
		}
	}

	/**
	 * Visit array pattern
	 */
	private visitArrayPattern(context: VisitorContext): void {
		const args = this.getCallArguments(context.node);
		const element = args[0];

		if (element) {
			for (const visitor of this.visitors) {
				if (visitor.visitArray) {
					visitor.visitArray(element, context);
				}
			}
		}
	}

	/**
	 * Visit refinement pattern
	 */
	private visitRefinementPattern(context: VisitorContext): void {
		const args = this.getCallArguments(context.node);
		const refinement = args[0];

		if (refinement) {
			for (const visitor of this.visitors) {
				if (visitor.visitRefinement) {
					visitor.visitRefinement(refinement, context);
				}
			}
		}
	}

	/**
	 * Visit transform pattern
	 */
	private visitTransformPattern(context: VisitorContext): void {
		const args = this.getCallArguments(context.node);
		const transform = args[0];

		if (transform) {
			for (const visitor of this.visitors) {
				if (visitor.visitTransform) {
					visitor.visitTransform(transform, context);
				}
			}
		}
	}

	/**
	 * Helper: Find object literal in node
	 */
	private findObjectLiteral(node: Node): any {
		// Look for ObjectLiteralExpression in children
		for (const child of node.getChildren()) {
			if (child.getKindName() === 'ObjectLiteralExpression') {
				return child;
			}
			const found = this.findObjectLiteral(child);
			if (found) return found;
		}
		return null;
	}

	/**
	 * Helper: Find array literal in node
	 */
	private findArrayLiteral(node: Node): any {
		for (const child of node.getChildren()) {
			if (child.getKindName() === 'ArrayLiteralExpression') {
				return child;
			}
			const found = this.findArrayLiteral(child);
			if (found) return found;
		}
		return null;
	}

	/**
	 * Helper: Get call expression arguments
	 */
	private getCallArguments(node: Node): Node[] {
		for (const child of node.getChildren()) {
			if (child.getKindName() === 'CallExpression') {
				const args = child.getChildrenOfKind(274 as SyntaxKind); // SyntaxList
				if (args.length > 0) {
					return args[0].getChildren();
				}
			}
			const found = this.getCallArguments(child);
			if (found.length > 0) return found;
		}
		return [];
	}
}

/**
 * Convenience function to create and use a visitor
 */
export function visitSchema(
	schema: ZodSchemaInfo,
	rootNode: Node,
	visitor: SchemaVisitor,
): void {
	const walker = new SchemaWalker();
	walker.addVisitor(visitor);
	walker.walk(schema, rootNode);
}

/**
 * Create a visitor from callback functions
 */
export function createVisitor(callbacks: Partial<SchemaVisitor>): SchemaVisitor {
	return callbacks as SchemaVisitor;
}

/**
 * Combine multiple visitors into one
 */
export function combineVisitors(...visitors: SchemaVisitor[]): SchemaVisitor {
	return {
		enter(context) {
			for (const visitor of visitors) {
				if (visitor.enter) {
					const result = visitor.enter(context);
					if (result === false) return false;
				}
			}
		},
		exit(context) {
			for (const visitor of visitors) {
				if (visitor.exit) {
					visitor.exit(context);
				}
			}
		},
		visitZodMethod(method, context) {
			for (const visitor of visitors) {
				if (visitor.visitZodMethod) {
					visitor.visitZodMethod(method, context);
				}
			}
		},
		visitObjectShape(properties, context) {
			for (const visitor of visitors) {
				if (visitor.visitObjectShape) {
					visitor.visitObjectShape(properties, context);
				}
			}
		},
		visitUnion(options, context) {
			for (const visitor of visitors) {
				if (visitor.visitUnion) {
					visitor.visitUnion(options, context);
				}
			}
		},
		visitArray(element, context) {
			for (const visitor of visitors) {
				if (visitor.visitArray) {
					visitor.visitArray(element, context);
				}
			}
		},
		visitRefinement(refinement, context) {
			for (const visitor of visitors) {
				if (visitor.visitRefinement) {
					visitor.visitRefinement(refinement, context);
				}
			}
		},
		visitTransform(transform, context) {
			for (const visitor of visitors) {
				if (visitor.visitTransform) {
					visitor.visitTransform(transform, context);
				}
			}
		},
	};
}
