/**
 * @fileoverview Rule Engine - Runs analysis rules on schemas
 * @module RuleEngine
 */

import type { SourceFile } from 'ts-morph';
import { createASTParser, createZodExtractor, type ZodSchemaInfo } from '../ast';
import { SchemaWalker } from '../ast/visitor';
import type { RuleViolation } from './types';
import {
	checkDescription,
	createRequireDescriptionVisitor,
	type RequireDescriptionOptions,
} from './builtin/require-description';
import {
	checkPreferMeta,
	createPreferMetaVisitor,
	type PreferMetaOptions,
} from './builtin/prefer-meta';
import {
	checkNoAnyType,
	createNoAnyTypeVisitor,
	type NoAnyTypeOptions,
} from './builtin/no-any-type';
import {
	checkPreferDiscriminatedUnion,
	createPreferDiscriminatedUnionVisitor,
	type PreferDiscriminatedUnionOptions,
} from './builtin/prefer-discriminated-union';

export interface RuleEngineOptions {
	/** Enable/disable specific rules */
	rules?: {
		'require-description'?: boolean | RequireDescriptionOptions;
		'prefer-meta'?: boolean | PreferMetaOptions;
		'no-any-type'?: boolean | NoAnyTypeOptions;
		'prefer-discriminated-union'?: boolean | PreferDiscriminatedUnionOptions;
	};
	/** Auto-fix violations */
	autoFix?: boolean;
}

export interface RuleEngineResult {
	violations: RuleViolation[];
	fixesApplied: number;
}

/**
 * Rule engine that runs all enabled rules on schemas
 */
export class RuleEngine {
	private readonly options: RuleEngineOptions;

	constructor(options: RuleEngineOptions = {}) {
		this.options = options;
	}

	/**
	 * Run all enabled rules on a schema file
	 */
	async analyzeFile(filePath: string): Promise<RuleEngineResult> {
		const violations: RuleViolation[] = [];

		// Parse file with AST
		const parser = createASTParser({ skipFileDependencyResolution: true });
		const extractor = createZodExtractor();

		const sourceFile = parser.addSourceFile(filePath);
		const schemas = extractor.extractSchemas(sourceFile);

		// Run rules on each schema
		for (const schema of schemas) {
			const schemaViolations = await this.analyzeSchema(schema, sourceFile);
			violations.push(...schemaViolations);
		}

		return {
			violations,
			fixesApplied: 0, // TODO: implement auto-fix
		};
	}

	/**
	 * Run all enabled rules on a single schema
	 */
	async analyzeSchema(schema: ZodSchemaInfo, sourceFile: SourceFile): Promise<RuleViolation[]> {
		const violations: RuleViolation[] = [];

		// Get rule configurations
		const rules = this.options.rules || {};

		// Run require-description rule
		if (this.isRuleEnabled('require-description', rules)) {
			const opts = this.getRuleOptions('require-description', rules);
			const violation = checkDescription(schema, sourceFile, {
				...opts,
				autoFix: this.options.autoFix,
			});
			if (violation) violations.push(violation);
		}

		// Run prefer-meta rule
		if (this.isRuleEnabled('prefer-meta', rules)) {
			const opts = this.getRuleOptions('prefer-meta', rules);
			const violation = checkPreferMeta(schema, sourceFile, {
				...opts,
				autoFix: this.options.autoFix,
			});
			if (violation) violations.push(violation);
		}

		// Run no-any-type rule
		if (this.isRuleEnabled('no-any-type', rules)) {
			const opts = this.getRuleOptions('no-any-type', rules);
			const schemaViolations = checkNoAnyType(schema, sourceFile, {
				...opts,
				autoFix: this.options.autoFix,
			});
			violations.push(...schemaViolations);
		}

		// Run prefer-discriminated-union rule
		if (this.isRuleEnabled('prefer-discriminated-union', rules)) {
			const opts = this.getRuleOptions('prefer-discriminated-union', rules);
			const violation = checkPreferDiscriminatedUnion(schema, opts);
			if (violation) violations.push(violation);
		}

		return violations;
	}

	/**
	 * Run rules using visitor pattern (alternative approach)
	 */
	async analyzeSchemaWithVisitor(
		schema: ZodSchemaInfo,
		sourceFile: SourceFile,
		rootNode: any,
	): Promise<RuleViolation[]> {
		const violations: RuleViolation[] = [];
		const rules = this.options.rules || {};

		const walker = new SchemaWalker();

		// Add enabled rule visitors
		if (this.isRuleEnabled('require-description', rules)) {
			const opts = this.getRuleOptions('require-description', rules);
			walker.addVisitor(createRequireDescriptionVisitor(violations, sourceFile, opts));
		}

		if (this.isRuleEnabled('prefer-meta', rules)) {
			const opts = this.getRuleOptions('prefer-meta', rules);
			walker.addVisitor(createPreferMetaVisitor(violations, sourceFile, opts));
		}

		if (this.isRuleEnabled('no-any-type', rules)) {
			const opts = this.getRuleOptions('no-any-type', rules);
			walker.addVisitor(createNoAnyTypeVisitor(violations, sourceFile, opts));
		}

		if (this.isRuleEnabled('prefer-discriminated-union', rules)) {
			const opts = this.getRuleOptions('prefer-discriminated-union', rules);
			walker.addVisitor(createPreferDiscriminatedUnionVisitor(violations, opts));
		}

		// Walk the schema
		walker.walk(schema, rootNode);

		return violations;
	}

	/**
	 * Check if a rule is enabled
	 */
	private isRuleEnabled(
		ruleName: string,
		rules: NonNullable<RuleEngineOptions['rules']>,
	): boolean {
		const config = rules[ruleName as keyof typeof rules];
		if (config === undefined) return true; // Enabled by default
		if (typeof config === 'boolean') return config;
		return true; // If options object provided, rule is enabled
	}

	/**
	 * Get rule options
	 */
	private getRuleOptions(ruleName: string, rules: NonNullable<RuleEngineOptions['rules']>): any {
		const config = rules[ruleName as keyof typeof rules];
		if (typeof config === 'object') return config;
		return {};
	}

	/**
	 * Get default rule configuration
	 */
	static getDefaultConfig(): RuleEngineOptions {
		return {
			rules: {
				'require-description': { requireAll: true, minLength: 10 },
				'prefer-meta': { autoFix: false },
				'no-any-type': { alternative: 'unknown' },
				'prefer-discriminated-union': { minOptions: 3 },
			},
			autoFix: false,
		};
	}
}

/**
 * Create a rule engine with default config
 */
export function createRuleEngine(options?: RuleEngineOptions): RuleEngine {
	const defaultConfig = RuleEngine.getDefaultConfig();
	return new RuleEngine({
		...defaultConfig,
		...options,
		rules: {
			...defaultConfig.rules,
			...options?.rules,
		},
	});
}
