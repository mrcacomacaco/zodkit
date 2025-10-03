/**
 * @fileoverview Smart command suggestions based on usage patterns and context
 * @module CommandSuggestions
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Command suggestion with confidence score
 */
export interface CommandSuggestion {
	command: string;
	description: string;
	confidence: number;
	reason: string;
	example?: string;
}

/**
 * Project context for intelligent suggestions
 */
export interface ProjectContext {
	hasSchemas: boolean;
	hasTypes: boolean;
	hasTests: boolean;
	hasConfig: boolean;
	projectSize: 'small' | 'medium' | 'large';
	framework?: string;
	recentErrors?: string[];
}

/**
 * Smart command suggestion engine
 */
export class CommandSuggestionEngine {
	private readonly context: ProjectContext;

	constructor() {
		this.context = this.analyzeProjectContext();
	}

	/**
	 * Analyze current project context
	 */
	private analyzeProjectContext(): ProjectContext {
		const cwd = process.cwd();

		return {
			hasSchemas: this.detectSchemas(cwd),
			hasTypes: this.detectTypeScript(cwd),
			hasTests: this.detectTests(cwd),
			hasConfig: this.detectConfig(cwd),
			projectSize: this.estimateProjectSize(cwd),
			framework: this.detectFramework(cwd),
		};
	}

	/**
	 * Get suggestions based on current context and user input
	 */
	getSuggestions(input?: string, lastCommand?: string): CommandSuggestion[] {
		const suggestions: CommandSuggestion[] = [];

		// Context-based suggestions (always shown)
		suggestions.push(...this.getContextSuggestions());

		// Input-based suggestions
		if (input) {
			suggestions.push(...this.getInputSuggestions(input));
		}

		// Follow-up suggestions based on last command
		if (lastCommand) {
			suggestions.push(...this.getFollowUpSuggestions(lastCommand));
		}

		// Sort by confidence and return top suggestions
		return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 6); // Top 6 suggestions
	}

	/**
	 * Get suggestions based on project context
	 */
	private getContextSuggestions(): CommandSuggestion[] {
		const suggestions: CommandSuggestion[] = [];

		// New project setup
		if (!this.context.hasConfig && !this.context.hasSchemas) {
			suggestions.push({
				command: 'init',
				description: 'Initialize zodkit in your project',
				confidence: 0.9,
				reason: 'No zodkit configuration detected',
				example: 'zodkit init --ai cursor,claude',
			});
		}

		// TypeScript to Zod scaffolding
		if (this.context.hasTypes && !this.context.hasSchemas) {
			suggestions.push({
				command: 'scaffold',
				description: 'Generate Zod schemas from TypeScript types',
				confidence: 0.8,
				reason: 'TypeScript files detected but no Zod schemas found',
				example: 'zodkit scaffold types.ts',
			});
		}

		// Schema analysis for existing schemas
		if (this.context.hasSchemas) {
			suggestions.push({
				command: 'check',
				description: 'Analyze your schemas for issues',
				confidence: 0.7,
				reason: 'Schemas detected in project',
				example: 'zodkit check --coverage',
			});

			suggestions.push({
				command: 'hint',
				description: 'Get performance and best practice suggestions',
				confidence: 0.6,
				reason: 'Optimize existing schemas',
				example: 'zodkit hint --fix',
			});
		}

		// Large project suggestions
		if (this.context.projectSize === 'large') {
			suggestions.push({
				command: 'analyze',
				description: 'Comprehensive analysis for large codebase',
				confidence: 0.8,
				reason: 'Large project detected',
				example: 'zodkit analyze --parallel',
			});
		}

		// Testing suggestions
		if (this.context.hasSchemas && !this.context.hasTests) {
			suggestions.push({
				command: 'test',
				description: 'Generate and run schema tests',
				confidence: 0.7,
				reason: 'No tests detected for schemas',
				example: 'zodkit test --fuzz 100',
			});
		}

		return suggestions;
	}

	/**
	 * Get suggestions based on user input
	 */
	private getInputSuggestions(input: string): CommandSuggestion[] {
		const suggestions: CommandSuggestion[] = [];
		const lowerInput = input.toLowerCase();

		// Fuzzy matching for commands
		const commandMatches = [
			{
				pattern: /check|valid|analyz/,
				command: 'check',
				description: 'Analyze schemas for issues',
			},
			{
				pattern: /scaffold|generat|convert/,
				command: 'scaffold',
				description: 'Generate Zod from TypeScript',
			},
			{
				pattern: /hint|suggest|optim/,
				command: 'hint',
				description: 'Get optimization suggestions',
			},
			{
				pattern: /test|valid/,
				command: 'test',
				description: 'Run schema tests',
			},
			{
				pattern: /perf|speed|slow/,
				command: 'perf',
				description: 'Profile schema performance',
			},
			{
				pattern: /fix|repair/,
				command: 'fix',
				description: 'Auto-fix schema issues',
			},
			{
				pattern: /mock|fake|data/,
				command: 'mock',
				description: 'Generate mock data',
			},
			{
				pattern: /ui|dash|interface/,
				command: 'ui',
				description: 'Launch unified dashboard',
			},
		];

		for (const match of commandMatches) {
			if (match.pattern.test(lowerInput)) {
				suggestions.push({
					command: match.command,
					description: match.description,
					confidence: 0.8,
					reason: `Matches input: "${input}"`,
					example: `zodkit ${match.command}`,
				});
			}
		}

		return suggestions;
	}

	/**
	 * Get follow-up suggestions based on last command
	 */
	private getFollowUpSuggestions(lastCommand: string): CommandSuggestion[] {
		const _suggestions: CommandSuggestion[] = [];

		const followUps: Record<string, CommandSuggestion[]> = {
			check: [
				{
					command: 'fix',
					description: 'Fix the issues found',
					confidence: 0.9,
					reason: 'Common follow-up after check',
					example: 'zodkit fix --unsafe',
				},
				{
					command: 'hint',
					description: 'Get optimization suggestions',
					confidence: 0.7,
					reason: 'Optimize after analysis',
					example: 'zodkit hint --fix',
				},
			],
			hint: [
				{
					command: 'fix',
					description: 'Apply the suggested fixes',
					confidence: 0.8,
					reason: 'Apply hints found',
					example: 'zodkit fix',
				},
			],
			scaffold: [
				{
					command: 'check',
					description: 'Validate generated schemas',
					confidence: 0.8,
					reason: 'Verify scaffolded schemas',
					example: 'zodkit check',
				},
				{
					command: 'test',
					description: 'Test the new schemas',
					confidence: 0.7,
					reason: 'Test generated schemas',
					example: 'zodkit test',
				},
			],
			fix: [
				{
					command: 'check',
					description: 'Verify fixes worked',
					confidence: 0.8,
					reason: 'Confirm fixes applied',
					example: 'zodkit check',
				},
			],
		};

		return followUps[lastCommand] || [];
	}

	/**
	 * Detect if project has schema files
	 */
	private detectSchemas(cwd: string): boolean {
		const _patterns = ['**/*.schema.ts', '**/schemas/**/*.ts', '**/zod/**/*.ts'];

		// Simple file existence check (in real implementation, use glob)
		return (
			existsSync(resolve(cwd, 'src/schemas')) ||
			existsSync(resolve(cwd, 'schemas')) ||
			existsSync(resolve(cwd, 'src/zod'))
		);
	}

	/**
	 * Detect TypeScript files
	 */
	private detectTypeScript(cwd: string): boolean {
		return (
			existsSync(resolve(cwd, 'tsconfig.json')) ||
			existsSync(resolve(cwd, 'src')) ||
			existsSync(resolve(cwd, 'types'))
		);
	}

	/**
	 * Detect test files
	 */
	private detectTests(cwd: string): boolean {
		return (
			existsSync(resolve(cwd, 'test')) ||
			existsSync(resolve(cwd, 'tests')) ||
			existsSync(resolve(cwd, '__tests__')) ||
			existsSync(resolve(cwd, 'src/__tests__'))
		);
	}

	/**
	 * Detect zodkit configuration
	 */
	private detectConfig(cwd: string): boolean {
		return (
			existsSync(resolve(cwd, 'zodkit.config.js')) ||
			existsSync(resolve(cwd, 'zodkit.config.ts')) ||
			existsSync(resolve(cwd, '.zodkitrc'))
		);
	}

	/**
	 * Estimate project size
	 */
	private estimateProjectSize(cwd: string): 'small' | 'medium' | 'large' {
		try {
			const srcPath = resolve(cwd, 'src');
			if (!existsSync(srcPath)) return 'small';

			// Rough estimation based on directory count
			const stats = statSync(srcPath);
			if (stats.isDirectory()) {
				// In real implementation, count files recursively
				return 'medium'; // Simplified
			}
		} catch {
			// Ignore errors
		}
		return 'small';
	}

	/**
	 * Detect framework in use
	 */
	private detectFramework(cwd: string): string | undefined {
		try {
			const packageJsonPath = resolve(cwd, 'package.json');
			if (existsSync(packageJsonPath)) {
				// In real implementation, parse package.json and detect frameworks
				return undefined; // Simplified
			}
		} catch {
			// Ignore errors
		}
		return undefined;
	}
}

/**
 * Global suggestion engine instance
 */
export const suggestionEngine = new CommandSuggestionEngine();
