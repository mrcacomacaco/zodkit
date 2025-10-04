/**
 * @fileoverview AST Extractor - Zod schema extraction from TypeScript AST
 * @module AST/Extractor
 *
 * Extracts Zod schema definitions and metadata from TypeScript source files
 */

import { type Node, type SourceFile, SyntaxKind, type VariableDeclaration } from 'ts-morph';

// === TYPES ===

export interface ZodSchemaInfo {
	name: string;
	type: string;
	filePath: string;
	line: number;
	column: number;
	schemaType: ZodSchemaType;
	description?: string;
	examples?: unknown[];
	metadata?: Record<string, unknown>;
	callChain: string[];
	isExported: boolean;
}

export type ZodSchemaType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'date'
	| 'object'
	| 'array'
	| 'union'
	| 'discriminatedUnion'
	| 'intersection'
	| 'tuple'
	| 'record'
	| 'map'
	| 'set'
	| 'enum'
	| 'nativeEnum'
	| 'literal'
	| 'null'
	| 'undefined'
	| 'void'
	| 'any'
	| 'unknown'
	| 'never'
	| 'custom';

// === ZOD SCHEMA EXTRACTOR ===

/**
 * Extracts Zod schemas from TypeScript AST
 */
export class ZodSchemaExtractor {
	/**
	 * Extract all Zod schemas from source file
	 */
	extractSchemas(sourceFile: SourceFile): ZodSchemaInfo[] {
		const schemas: ZodSchemaInfo[] = [];

		// Find all variable declarations that use 'z.'
		sourceFile.getVariableDeclarations().forEach((varDecl) => {
			const schema = this.extractFromVariable(varDecl, sourceFile);
			if (schema) {
				schemas.push(schema);
			}
		});

		return schemas;
	}

	/**
	 * Extract schema from variable declaration
	 */
	private extractFromVariable(
		varDecl: VariableDeclaration,
		sourceFile: SourceFile,
	): ZodSchemaInfo | null {
		const initializer = varDecl.getInitializer();
		if (!initializer) return null;

		// Check if it's a Zod schema (starts with z.)
		const text = initializer.getText();
		if (!text.startsWith('z.')) return null;

		const name = varDecl.getName();
		const { line, column } = sourceFile.getLineAndColumnAtPos(varDecl.getStart());
		const isExported = this.isExported(varDecl);

		// Extract schema type and call chain
		const { schemaType, callChain } = this.analyzeZodChain(text);

		// Extract metadata (.meta(), .describe(), etc.)
		const metadata = this.extractMetadata(text);
		const description = this.extractDescription(text);
		const examples = this.extractExamples(text);

		return {
			name,
			type: text,
			filePath: sourceFile.getFilePath(),
			line,
			column,
			schemaType,
			description,
			examples,
			metadata,
			callChain,
			isExported,
		};
	}

	/**
	 * Analyze Zod method chain to determine schema type
	 */
	private analyzeZodChain(zodExpression: string): {
		schemaType: ZodSchemaType;
		callChain: string[];
	} {
		// Extract method calls from chain
		const callChain = this.extractCallChain(zodExpression);

		// Determine base schema type from first call
		const firstCall = callChain[0] || '';
		const schemaType = this.inferSchemaType(firstCall);

		return { schemaType, callChain };
	}

	/**
	 * Extract method call chain
	 */
	private extractCallChain(zodExpression: string): string[] {
		const calls: string[] = [];
		const regex = /\.(\w+)\(/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(zodExpression)) !== null) {
			calls.push(match[1]);
		}

		return calls;
	}

	/**
	 * Infer schema type from method name
	 */
	private inferSchemaType(methodName: string): ZodSchemaType {
		const typeMap: Record<string, ZodSchemaType> = {
			string: 'string',
			number: 'number',
			boolean: 'boolean',
			date: 'date',
			object: 'object',
			array: 'array',
			union: 'union',
			discriminatedUnion: 'discriminatedUnion',
			intersection: 'intersection',
			tuple: 'tuple',
			record: 'record',
			map: 'map',
			set: 'set',
			enum: 'enum',
			nativeEnum: 'nativeEnum',
			literal: 'literal',
			null: 'null',
			undefined: 'undefined',
			void: 'void',
			any: 'any',
			unknown: 'unknown',
			never: 'never',
		};

		return typeMap[methodName] || 'custom';
	}

	/**
	 * Extract .meta() metadata
	 */
	private extractMetadata(zodExpression: string): Record<string, unknown> | undefined {
		const metaMatch = zodExpression.match(/\.meta\((\{[\s\S]*?\})\)/);
		if (!metaMatch) return undefined;

		try {
			// Parse the metadata object
			let metaStr = metaMatch[1];

			// Replace JavaScript identifiers with quoted strings for JSON parsing
			metaStr = metaStr.replace(/(\w+):/g, '"$1":');

			// Try JSON.parse first
			try {
				return JSON.parse(metaStr) as Record<string, unknown>;
			} catch {
				// Fallback to Function for complex cases

				const meta = new Function(`return ${metaMatch[1]}`)();
				return meta as Record<string, unknown>;
			}
		} catch {
			return undefined;
		}
	}

	/**
	 * Extract .describe() description
	 */
	private extractDescription(zodExpression: string): string | undefined {
		const descMatch = zodExpression.match(/\.describe\(['"`](.*?)['"`]\)/);
		return descMatch?.[1];
	}

	/**
	 * Extract examples from .meta() or custom fields
	 */
	private extractExamples(zodExpression: string): unknown[] | undefined {
		const metaMatch = zodExpression.match(/\.meta\(({[\s\S]*?})\)/);
		if (!metaMatch) return undefined;

		try {
			const metaStr = metaMatch[1];
			const meta = JSON.parse(metaStr);
			return meta.examples as unknown[];
		} catch {
			return undefined;
		}
	}

	/**
	 * Check if variable is exported
	 */
	private isExported(varDecl: VariableDeclaration): boolean {
		const statement = varDecl.getVariableStatement();
		return statement?.isExported() ?? false;
	}

	/**
	 * Extract TSDoc comments
	 */
	extractTSDoc(node: Node): string | undefined {
		const jsDoc = node.getChildren().find((child) => child.getKind() === SyntaxKind.JSDoc);

		if (!jsDoc) return undefined;

		return jsDoc
			.getText()
			.replace(/^\/\*\*|\*\/$/g, '')
			.trim();
	}

	/**
	 * Find schema by name
	 */
	findSchemaByName(sourceFile: SourceFile, name: string): ZodSchemaInfo | null {
		const schemas = this.extractSchemas(sourceFile);
		return schemas.find((s) => s.name === name) || null;
	}

	/**
	 * Find all schemas of a specific type
	 */
	findSchemasByType(sourceFile: SourceFile, type: ZodSchemaType): ZodSchemaInfo[] {
		const schemas = this.extractSchemas(sourceFile);
		return schemas.filter((s) => s.schemaType === type);
	}
}

/**
 * Create Zod schema extractor
 */
export function createZodExtractor(): ZodSchemaExtractor {
	return new ZodSchemaExtractor();
}

export default ZodSchemaExtractor;
