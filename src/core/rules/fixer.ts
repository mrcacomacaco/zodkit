/**
 * @fileoverview Auto-Fix Fixer API
 * @module Fixer
 *
 * Provides API for automatically fixing schema issues detected by rules.
 */

import type { SourceFile } from 'ts-morph';

/**
 * Represents a single fix that can be applied to source code
 */
export interface Fix {
	/** Unique identifier for this fix */
	id: string;
	/** Human-readable description */
	description: string;
	/** File path */
	filePath: string;
	/** Line number */
	line: number;
	/** Column number */
	column?: number;
	/** Impact level */
	impact: 'safe' | 'risky' | 'breaking';
	/** Changes to apply */
	changes: FixChange[];
	/** Related rule */
	rule: string;
}

/**
 * Represents a single change within a fix
 */
export interface FixChange {
	/** Type of change */
	type: 'replace' | 'insert' | 'delete' | 'move';
	/** Start position */
	start: number;
	/** End position */
	end: number;
	/** Original text */
	oldText: string;
	/** Replacement text */
	newText: string;
}

/**
 * Result of applying fixes
 */
export interface FixResult {
	/** Number of fixes applied */
	applied: number;
	/** Number of fixes skipped */
	skipped: number;
	/** Number of fixes failed */
	failed: number;
	/** Files modified */
	filesModified: string[];
	/** Errors encountered */
	errors: Array<{ fix: Fix; error: Error }>;
}

/**
 * Fixer context passed to fix generators
 */
export interface FixerContext {
	/** Source file being fixed */
	sourceFile: SourceFile;
	/** Rule that detected the issue */
	rule: string;
	/** Issue description */
	issue: string;
	/** Additional metadata */
	metadata: Record<string, unknown>;
}

/**
 * Auto-fixer that applies code transformations
 */
export class Fixer {
	private fixes: Fix[] = [];

	/**
	 * Create a replacement fix
	 */
	replace(context: FixerContext, start: number, end: number, newText: string): Fix {
		const oldText = context.sourceFile.getFullText().substring(start, end);

		const fix: Fix = {
			id: this.generateId(),
			description: `Replace "${oldText}" with "${newText}"`,
			filePath: context.sourceFile.getFilePath(),
			line: context.sourceFile.getLineAndColumnAtPos(start).line,
			column: context.sourceFile.getLineAndColumnAtPos(start).column,
			impact: this.determineImpact(oldText, newText),
			changes: [
				{
					type: 'replace',
					start,
					end,
					oldText,
					newText,
				},
			],
			rule: context.rule,
		};

		this.fixes.push(fix);
		return fix;
	}

	/**
	 * Create an insertion fix
	 */
	insert(context: FixerContext, position: number, text: string): Fix {
		const fix: Fix = {
			id: this.generateId(),
			description: `Insert "${text}"`,
			filePath: context.sourceFile.getFilePath(),
			line: context.sourceFile.getLineAndColumnAtPos(position).line,
			column: context.sourceFile.getLineAndColumnAtPos(position).column,
			impact: 'safe',
			changes: [
				{
					type: 'insert',
					start: position,
					end: position,
					oldText: '',
					newText: text,
				},
			],
			rule: context.rule,
		};

		this.fixes.push(fix);
		return fix;
	}

	/**
	 * Create a deletion fix
	 */
	delete(context: FixerContext, start: number, end: number): Fix {
		const oldText = context.sourceFile.getFullText().substring(start, end);

		const fix: Fix = {
			id: this.generateId(),
			description: `Delete "${oldText}"`,
			filePath: context.sourceFile.getFilePath(),
			line: context.sourceFile.getLineAndColumnAtPos(start).line,
			column: context.sourceFile.getLineAndColumnAtPos(start).column,
			impact: this.determineImpact(oldText, ''),
			changes: [
				{
					type: 'delete',
					start,
					end,
					oldText,
					newText: '',
				},
			],
			rule: context.rule,
		};

		this.fixes.push(fix);
		return fix;
	}

	/**
	 * Create a method insertion fix (e.g., add .describe())
	 */
	insertMethod(
		context: FixerContext,
		targetPosition: number,
		method: string,
		args?: string,
	): Fix {
		const methodCall = args ? `.${method}(${args})` : `.${method}()`;

		return this.insert(context, targetPosition, methodCall);
	}

	/**
	 * Create a metadata insertion fix (e.g., add .meta())
	 */
	insertMetadata(
		context: FixerContext,
		targetPosition: number,
		metadata: Record<string, unknown>,
	): Fix {
		const metadataStr = JSON.stringify(metadata, null, 2);
		return this.insertMethod(context, targetPosition, 'meta', metadataStr);
	}

	/**
	 * Get all pending fixes
	 */
	getFixes(): Fix[] {
		return [...this.fixes];
	}

	/**
	 * Clear all fixes
	 */
	clear(): void {
		this.fixes = [];
	}

	/**
	 * Apply a single fix to source file
	 */
	applyFix(fix: Fix, sourceFile: SourceFile): void {
		const text = sourceFile.getFullText();

		// Sort changes by position (descending) to avoid offset issues
		const sortedChanges = [...fix.changes].sort((a, b) => b.start - a.start);

		let modifiedText = text;

		for (const change of sortedChanges) {
			const before = modifiedText.substring(0, change.start);
			const after = modifiedText.substring(change.end);

			modifiedText = before + change.newText + after;
		}

		sourceFile.replaceWithText(modifiedText);
	}

	/**
	 * Apply multiple fixes to source files
	 */
	async applyFixes(fixes: Fix[], options: { dryRun?: boolean; safeOnly?: boolean } = {}): Promise<FixResult> {
		const result: FixResult = {
			applied: 0,
			skipped: 0,
			failed: 0,
			filesModified: [],
			errors: [],
		};

		// Group fixes by file
		const fixesByFile = new Map<string, Fix[]>();
		for (const fix of fixes) {
			if (options.safeOnly && fix.impact !== 'safe') {
				result.skipped++;
				continue;
			}

			const fileFixes = fixesByFile.get(fix.filePath) || [];
			fileFixes.push(fix);
			fixesByFile.set(fix.filePath, fileFixes);
		}

		// Apply fixes file by file
		for (const [filePath, fileFixes] of fixesByFile) {
			try {
				// Load source file
				const { Project } = await import('ts-morph');
				const project = new Project();
				const sourceFile = project.addSourceFileAtPath(filePath);

				// Apply all fixes for this file
				for (const fix of fileFixes) {
					try {
						if (!options.dryRun) {
							this.applyFix(fix, sourceFile);
						}
						result.applied++;
					} catch (error) {
						result.failed++;
						result.errors.push({ fix, error: error as Error });
					}
				}

				// Save file
				if (!options.dryRun && result.applied > 0) {
					await sourceFile.save();
					result.filesModified.push(filePath);
				}
			} catch (error) {
				for (const fix of fileFixes) {
					result.failed++;
					result.errors.push({ fix, error: error as Error });
				}
			}
		}

		return result;
	}

	/**
	 * Generate unique fix ID
	 */
	private generateId(): string {
		return `fix_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Determine impact level of a change
	 */
	private determineImpact(oldText: string, newText: string): 'safe' | 'risky' | 'breaking' {
		// Additions are generally safe
		if (!oldText && newText) return 'safe';

		// Deletions are risky
		if (oldText && !newText) return 'risky';

		// Adding metadata/descriptions is safe
		if (newText.includes('.meta(') || newText.includes('.describe(')) return 'safe';

		// Type changes are risky
		if (oldText.includes('z.') && newText.includes('z.') && oldText !== newText) {
			return 'risky';
		}

		// Default to risky for replacements
		return 'risky';
	}
}

/**
 * Create a new fixer instance
 */
export function createFixer(): Fixer {
	return new Fixer();
}

/**
 * Helper to create a fixer context
 */
export function createFixerContext(
	sourceFile: SourceFile,
	rule: string,
	issue: string,
	metadata: Record<string, unknown> = {},
): FixerContext {
	return {
		sourceFile,
		rule,
		issue,
		metadata,
	};
}
