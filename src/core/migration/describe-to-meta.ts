/**
 * @fileoverview Describe-to-Meta Migrator
 * @module Migration/DescribeToMeta
 *
 * Automatically converts .describe() calls to .meta() with enhanced metadata.
 */

import type { SourceFile } from 'ts-morph';
import type { Fix } from '../rules/fixer';

export interface MigrationResult {
	/** Source file path */
	filePath: string;
	/** Number of migrations performed */
	migrationsCount: number;
	/** Migration details */
	migrations: Migration[];
	/** Whether changes were made */
	hasChanges: boolean;
}

export interface Migration {
	/** Schema name */
	schemaName: string;
	/** Original describe() call */
	originalDescribe: string;
	/** New .meta() call */
	newMeta: string;
	/** Line number */
	line: number;
	/** Additional metadata suggestions */
	suggestions?: MetadataSuggestion[];
}

export interface MetadataSuggestion {
	/** Suggestion type */
	type: 'title' | 'category' | 'version' | 'examples' | 'tags';
	/** Suggested value */
	value: any;
	/** Confidence score */
	confidence: number;
	/** Reason for suggestion */
	reason: string;
}

export interface MigrationOptions {
	/** Infer additional metadata from schema name and context */
	inferMetadata?: boolean;
	/** Generate example values */
	generateExamples?: boolean;
	/** Add version field */
	addVersion?: boolean;
	/** Default version */
	defaultVersion?: string;
	/** Preserve original .describe() as comment */
	preserveOriginal?: boolean;
}

export class DescribeToMetaMigrator {
	private readonly options: Required<MigrationOptions>;

	constructor(options: MigrationOptions = {}) {
		this.options = {
			inferMetadata: true,
			generateExamples: false,
			addVersion: true,
			defaultVersion: '1.0.0',
			preserveOriginal: false,
			...options,
		};
	}

	/**
	 * Migrate a source file from .describe() to .meta()
	 */
	migrateFile(sourceFile: SourceFile): MigrationResult {
		const filePath = sourceFile.getFilePath();
		const migrations: Migration[] = [];

		// Find all variable declarations with Zod schemas
		const varDeclarations = sourceFile.getVariableDeclarations();

		for (const varDecl of varDeclarations) {
			const initializer = varDecl.getInitializer();
			if (!initializer) continue;

			const text = initializer.getText();
			if (!text.startsWith('z.')) continue;

			const schemaName = varDecl.getName();

			// Check if it uses .describe() instead of .meta()
			if (text.includes('.describe(') && !text.includes('.meta(')) {
				const migration = this.migrateSchema(schemaName, initializer, sourceFile);
				if (migration) {
					migrations.push(migration);
				}
			}
		}

		return {
			filePath,
			migrationsCount: migrations.length,
			migrations,
			hasChanges: migrations.length > 0,
		};
	}

	/**
	 * Migrate a single schema
	 */
	private migrateSchema(schemaName: string, node: any, sourceFile: SourceFile): Migration | null {
		const text = node.getText();

		// Extract .describe() call
		const describeMatch = text.match(/\.describe\s*\(\s*(['"`])(.*?)\1\s*\)/);
		if (!describeMatch) return null;

		const description = describeMatch[2];
		const { line } = sourceFile.getLineAndColumnAtPos(node.getStart());

		// Build .meta() object
		const metaObject: any = {
			description,
		};

		// Infer additional metadata
		const suggestions: MetadataSuggestion[] = [];

		if (this.options.inferMetadata) {
			// Infer title from schema name
			const title = this.inferTitle(schemaName);
			if (title) {
				metaObject.title = title;
				suggestions.push({
					type: 'title',
					value: title,
					confidence: 0.9,
					reason: `Inferred from schema name "${schemaName}"`,
				});
			}

			// Infer category
			const category = this.inferCategory(schemaName, text);
			if (category) {
				metaObject.category = category;
				suggestions.push({
					type: 'category',
					value: category,
					confidence: 0.7,
					reason: `Inferred from schema name and type`,
				});
			}

			// Infer tags
			const tags = this.inferTags(schemaName, description);
			if (tags.length > 0) {
				metaObject.tags = tags;
				suggestions.push({
					type: 'tags',
					value: tags,
					confidence: 0.6,
					reason: 'Extracted from schema name and description',
				});
			}
		}

		// Add version
		if (this.options.addVersion) {
			metaObject.version = this.options.defaultVersion;
		}

		// Generate examples if requested
		if (this.options.generateExamples) {
			const example = this.generateExample(text);
			if (example) {
				metaObject.examples = [example];
				suggestions.push({
					type: 'examples',
					value: [example],
					confidence: 0.5,
					reason: 'Auto-generated example from schema structure',
				});
			}
		}

		// Format .meta() call
		const metaCall = this.formatMetaCall(metaObject);

		// Replace .describe() with .meta()
		const _newSchema = text.replace(/\.describe\s*\(\s*(['"`]).*?\1\s*\)/, metaCall);

		return {
			schemaName,
			originalDescribe: describeMatch[0],
			newMeta: metaCall,
			line,
			suggestions: suggestions.length > 0 ? suggestions : undefined,
		};
	}

	/**
	 * Infer title from schema name
	 */
	private inferTitle(schemaName: string): string | null {
		// Remove Schema/Validator/Model suffix
		let title = schemaName
			.replace(/(Schema|Validator|Model)$/, '')
			.replace(/([A-Z])/g, ' $1')
			.trim();

		// Capitalize first letter
		title = title.charAt(0).toUpperCase() + title.slice(1);

		return title || null;
	}

	/**
	 * Infer category from schema name and content
	 */
	private inferCategory(schemaName: string, _schemaText: string): string | null {
		const name = schemaName.toLowerCase();

		// Common categories
		if (name.includes('user') || name.includes('auth') || name.includes('login')) {
			return 'auth';
		}
		if (name.includes('product') || name.includes('order') || name.includes('payment')) {
			return 'ecommerce';
		}
		if (name.includes('post') || name.includes('article') || name.includes('blog')) {
			return 'content';
		}
		if (name.includes('config') || name.includes('setting')) {
			return 'configuration';
		}
		if (name.includes('api') || name.includes('request') || name.includes('response')) {
			return 'api';
		}

		return null;
	}

	/**
	 * Infer tags from schema name and description
	 */
	private inferTags(schemaName: string, description: string): string[] {
		const tags: string[] = [];
		const combined = `${schemaName} ${description}`.toLowerCase();

		// Common tags
		const tagPatterns = [
			{ pattern: /required/i, tag: 'required' },
			{ pattern: /optional/i, tag: 'optional' },
			{ pattern: /email/i, tag: 'email' },
			{ pattern: /password/i, tag: 'password' },
			{ pattern: /uuid/i, tag: 'uuid' },
			{ pattern: /date/i, tag: 'date' },
			{ pattern: /time/i, tag: 'time' },
			{ pattern: /url/i, tag: 'url' },
			{ pattern: /validation/i, tag: 'validation' },
		];

		for (const { pattern, tag } of tagPatterns) {
			if (pattern.test(combined) && !tags.includes(tag)) {
				tags.push(tag);
			}
		}

		return tags;
	}

	/**
	 * Generate example value from schema
	 */
	private generateExample(schemaText: string): any | null {
		// Simple example generation based on schema type
		if (schemaText.includes('z.object({')) {
			const example: any = {};

			// Extract object properties
			const objectMatch = schemaText.match(/z\.object\(\{([^}]+)\}\)/);
			if (objectMatch) {
				const props = objectMatch[1];
				const propMatches = props.matchAll(/(\w+):\s*z\.(\w+)\(/g);

				for (const match of propMatches) {
					const [, propName, propType] = match;
					example[propName] = this.generateExampleValue(propType);
				}
			}

			return Object.keys(example).length > 0 ? example : null;
		}

		return null;
	}

	/**
	 * Generate example value for a specific type
	 */
	private generateExampleValue(type: string): any {
		const examples: Record<string, any> = {
			string: 'example',
			number: 42,
			boolean: true,
			date: new Date().toISOString(),
			uuid: '550e8400-e29b-41d4-a716-446655440000',
			email: 'user@example.com',
			url: 'https://example.com',
		};

		return examples[type.toLowerCase()] || 'value';
	}

	/**
	 * Format .meta() call
	 */
	private formatMetaCall(metaObject: any): string {
		const entries = Object.entries(metaObject);

		if (entries.length === 1 && entries[0][0] === 'description') {
			// Simple case: only description
			return `.meta({ description: "${metaObject.description}" })`;
		}

		// Multi-line format for complex metadata
		const lines: string[] = ['.meta({'];

		for (const [key, value] of entries) {
			if (typeof value === 'string') {
				lines.push(`  ${key}: "${value}",`);
			} else if (Array.isArray(value)) {
				if (value.length === 0) {
					lines.push(`  ${key}: [],`);
				} else if (typeof value[0] === 'string') {
					lines.push(`  ${key}: [${value.map((v) => `"${v}"`).join(', ')}],`);
				} else {
					lines.push(`  ${key}: ${JSON.stringify(value, null, 2).split('\n').join('\n  ')},`);
				}
			} else {
				lines.push(`  ${key}: ${JSON.stringify(value)},`);
			}
		}

		lines.push('})');
		return lines.join('\n');
	}

	/**
	 * Apply migrations to source file
	 */
	applyMigrations(sourceFile: SourceFile, migrations: Migration[]): void {
		const text = sourceFile.getFullText();
		let newText = text;

		// Apply migrations in reverse order to preserve positions
		const sortedMigrations = [...migrations].sort((a, b) => b.line - a.line);

		for (const migration of sortedMigrations) {
			newText = newText.replace(migration.originalDescribe, migration.newMeta);
		}

		sourceFile.replaceWithText(newText);
	}

	/**
	 * Create Fix object for auto-fix integration
	 */
	createFix(migration: Migration, filePath: string): Fix {
		return {
			id: `describe-to-meta-${migration.schemaName}`,
			description: `Convert ${migration.schemaName}.describe() to .meta()`,
			filePath,
			line: migration.line,
			impact: 'safe',
			changes: [
				{
					type: 'replace',
					start: 0, // Would need actual position
					end: 0,
					oldText: migration.originalDescribe,
					newText: migration.newMeta,
				},
			],
			rule: 'describe-to-meta-migration',
		};
	}
}

/**
 * Create a describe-to-meta migrator
 */
export function createMigrator(options?: MigrationOptions): DescribeToMetaMigrator {
	return new DescribeToMetaMigrator(options);
}
