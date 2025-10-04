/**
 * @fileoverview AST Parser - ts-morph integration layer
 * @module AST/Parser
 *
 * Provides TypeScript AST parsing using ts-morph for schema discovery and analysis
 */

import * as path from 'node:path';
import {
	type Node,
	Project,
	type ProjectOptions,
	type SourceFile,
	type SyntaxKind,
} from 'ts-morph';

// === TYPES ===

export interface ParserOptions {
	tsConfigFilePath?: string;
	skipAddingFilesFromTsConfig?: boolean;
	compilerOptions?: ProjectOptions['compilerOptions'];
	skipFileDependencyResolution?: boolean;
}

export interface ParsedFile {
	filePath: string;
	sourceFile: SourceFile;
	imports: ImportInfo[];
	exports: ExportInfo[];
}

export interface ImportInfo {
	moduleSpecifier: string;
	namedImports: string[];
	defaultImport?: string;
	namespaceImport?: string;
	isTypeOnly: boolean;
}

export interface ExportInfo {
	name: string;
	kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'enum';
	isDefault: boolean;
	node: Node;
}

// === AST PARSER ===

/**
 * AST Parser using ts-morph
 * Provides high-level API for TypeScript AST parsing and manipulation
 */
export class ASTParser {
	private readonly project: Project;
	private readonly fileCache = new Map<string, ParsedFile>();

	constructor(options: ParserOptions = {}) {
		this.project = new Project({
			tsConfigFilePath: options.tsConfigFilePath,
			skipAddingFilesFromTsConfig: options.skipAddingFilesFromTsConfig ?? false,
			compilerOptions: options.compilerOptions ?? {
				strict: true,
				target: 99, // ESNext
				module: 99, // ESNext
			},
			skipFileDependencyResolution: options.skipFileDependencyResolution ?? true,
		});
	}

	/**
	 * Add source file to project
	 */
	addSourceFile(filePath: string): SourceFile {
		const absolutePath = path.resolve(filePath);

		// Check cache
		const cached = this.fileCache.get(absolutePath);
		if (cached) {
			return cached.sourceFile;
		}

		// Add to project
		const sourceFile = this.project.addSourceFileAtPath(absolutePath);
		this.cacheFile(sourceFile);

		return sourceFile;
	}

	/**
	 * Add source files from glob pattern
	 */
	addSourceFiles(pattern: string): SourceFile[] {
		const sourceFiles = this.project.addSourceFilesAtPaths(pattern);
		sourceFiles.forEach((sf) => this.cacheFile(sf));
		return sourceFiles;
	}

	/**
	 * Get or create source file from content
	 */
	createSourceFile(filePath: string, content: string): SourceFile {
		const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
		this.cacheFile(sourceFile);
		return sourceFile;
	}

	/**
	 * Get source file by path
	 */
	getSourceFile(filePath: string): SourceFile | undefined {
		const absolutePath = path.resolve(filePath);
		const cached = this.fileCache.get(absolutePath);
		return cached?.sourceFile ?? this.project.getSourceFile(absolutePath);
	}

	/**
	 * Get all source files
	 */
	getSourceFiles(): SourceFile[] {
		return this.project.getSourceFiles();
	}

	/**
	 * Parse imports from source file
	 */
	parseImports(sourceFile: SourceFile): ImportInfo[] {
		const imports: ImportInfo[] = [];

		sourceFile.getImportDeclarations().forEach((importDecl) => {
			const moduleSpecifier = importDecl.getModuleSpecifierValue();
			const namedImports = importDecl.getNamedImports().map((named) => named.getName());
			const defaultImport = importDecl.getDefaultImport()?.getText();
			const namespaceImport = importDecl.getNamespaceImport()?.getText();
			const isTypeOnly = importDecl.isTypeOnly();

			imports.push({
				moduleSpecifier,
				namedImports,
				defaultImport,
				namespaceImport,
				isTypeOnly,
			});
		});

		return imports;
	}

	/**
	 * Parse exports from source file
	 */
	parseExports(sourceFile: SourceFile): ExportInfo[] {
		const exports: ExportInfo[] = [];

		// Variable exports
		sourceFile.getVariableStatements().forEach((stmt) => {
			if (stmt.isExported()) {
				stmt.getDeclarations().forEach((decl) => {
					exports.push({
						name: decl.getName(),
						kind: 'variable',
						isDefault: stmt.hasDefaultKeyword(),
						node: decl,
					});
				});
			}
		});

		// Function exports
		sourceFile.getFunctions().forEach((func) => {
			if (func.isExported()) {
				const name = func.getName() ?? 'default';
				exports.push({
					name,
					kind: 'function',
					isDefault: func.isDefaultExport(),
					node: func,
				});
			}
		});

		// Class exports
		sourceFile.getClasses().forEach((cls) => {
			if (cls.isExported()) {
				const name = cls.getName() ?? 'default';
				exports.push({
					name,
					kind: 'class',
					isDefault: cls.isDefaultExport(),
					node: cls,
				});
			}
		});

		// Interface exports
		sourceFile.getInterfaces().forEach((iface) => {
			if (iface.isExported()) {
				exports.push({
					name: iface.getName(),
					kind: 'interface',
					isDefault: false,
					node: iface,
				});
			}
		});

		// Type alias exports
		sourceFile.getTypeAliases().forEach((typeAlias) => {
			if (typeAlias.isExported()) {
				exports.push({
					name: typeAlias.getName(),
					kind: 'type',
					isDefault: false,
					node: typeAlias,
				});
			}
		});

		// Enum exports
		sourceFile.getEnums().forEach((enumDecl) => {
			if (enumDecl.isExported()) {
				exports.push({
					name: enumDecl.getName(),
					kind: 'enum',
					isDefault: false,
					node: enumDecl,
				});
			}
		});

		return exports;
	}

	/**
	 * Find nodes by kind
	 */
	findNodesByKind<T extends Node>(sourceFile: SourceFile, kind: SyntaxKind): T[] {
		const nodes: T[] = [];
		sourceFile.forEachDescendant((node) => {
			if (node.getKind() === kind) {
				nodes.push(node as T);
			}
		});
		return nodes;
	}

	/**
	 * Get file dependencies (imports)
	 */
	getFileDependencies(filePath: string): string[] {
		const sourceFile = this.getSourceFile(filePath);
		if (!sourceFile) return [];

		return this.parseImports(sourceFile)
			.map((imp) => imp.moduleSpecifier)
			.filter((spec) => spec.startsWith('.') || spec.startsWith('/'));
	}

	/**
	 * Save changes to disk
	 */
	async save(): Promise<void> {
		await this.project.save();
	}

	/**
	 * Save specific file
	 */
	async saveFile(sourceFile: SourceFile): Promise<void> {
		await sourceFile.save();
	}

	/**
	 * Format all files
	 */
	formatFiles(): void {
		this.project.getSourceFiles().forEach((sf) => sf.formatText());
	}

	/**
	 * Get diagnostics (type errors)
	 */
	getDiagnostics(): string[] {
		const diagnostics = this.project.getPreEmitDiagnostics();
		return diagnostics.map((d) => d.getMessageText().toString());
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.fileCache.clear();
	}

	/**
	 * Get project instance for advanced usage
	 */
	getProject(): Project {
		return this.project;
	}

	// === PRIVATE METHODS ===

	private cacheFile(sourceFile: SourceFile): void {
		const filePath = sourceFile.getFilePath();
		const parsed: ParsedFile = {
			filePath,
			sourceFile,
			imports: this.parseImports(sourceFile),
			exports: this.parseExports(sourceFile),
		};
		this.fileCache.set(filePath, parsed);
	}
}

/**
 * Create AST parser instance
 */
export function createASTParser(options?: ParserOptions): ASTParser {
	return new ASTParser(options);
}

export default ASTParser;
