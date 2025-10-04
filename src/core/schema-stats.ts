/**
 * @fileoverview Schema Statistics Aggregator
 * @module SchemaStats
 *
 * Analyzes schemas and generates comprehensive statistics including:
 * - Schema counts and types
 * - Complexity metrics
 * - Usage patterns
 * - Hotspot detection
 */

import type { SourceFile } from 'ts-morph';
import { createASTParser, createZodExtractor, type ZodSchemaInfo } from './ast';

export interface SchemaStats {
	totalSchemas: number;
	schemasByType: Record<string, number>;
	complexityMetrics: ComplexityMetrics;
	usagePatterns: UsagePattern[];
	hotspots: SchemaHotspot[];
	recommendations: string[];
	bundleImpact?: BundleImpact;
}

export interface BundleImpact {
	estimatedSize: number;
	bySchema: Array<{
		name: string;
		estimatedSize: number;
		percentOfTotal: number;
	}>;
	largestSchemas: Array<{
		name: string;
		estimatedSize: number;
		reason: string;
	}>;
	optimizationTips: string[];
}

export interface ComplexityMetrics {
	averageDepth: number;
	maxDepth: number;
	averageFieldCount: number;
	maxFieldCount: number;
	totalRefinements: number;
	totalTransforms: number;
	complexSchemas: Array<{
		name: string;
		complexity: number;
		reasons: string[];
	}>;
}

export interface UsagePattern {
	pattern: string;
	count: number;
	examples: string[];
}

export interface SchemaHotspot {
	name: string;
	file: string;
	issues: string[];
	severity: 'high' | 'medium' | 'low';
	suggestions: string[];
}

export interface SchemaStatsOptions {
	includeComplexity?: boolean;
	includeUsagePatterns?: boolean;
	includeHotspots?: boolean;
	includeBundleImpact?: boolean;
	complexityThreshold?: number;
}

/**
 * Schema Statistics Aggregator
 */
export class SchemaStatsAggregator {
	private schemas: Array<{ schema: ZodSchemaInfo; file: string }> = [];

	/**
	 * Add a file to analyze
	 */
	async addFile(filePath: string): Promise<void> {
		const parser = createASTParser({ skipFileDependencyResolution: true });
		const extractor = createZodExtractor();

		const sourceFile = parser.addSourceFile(filePath);
		const schemas = extractor.extractSchemas(sourceFile);

		for (const schema of schemas) {
			this.schemas.push({ schema, file: filePath });
		}
	}

	/**
	 * Generate comprehensive statistics
	 */
	generateStats(options: SchemaStatsOptions = {}): SchemaStats {
		const stats: SchemaStats = {
			totalSchemas: this.schemas.length,
			schemasByType: this.calculateTypeDistribution(),
			complexityMetrics: this.calculateComplexity(options.complexityThreshold || 10),
			usagePatterns: options.includeUsagePatterns ? this.analyzeUsagePatterns() : [],
			hotspots: options.includeHotspots ? this.detectHotspots() : [],
			recommendations: this.generateRecommendations(),
			bundleImpact: options.includeBundleImpact ? this.calculateBundleImpact() : undefined,
		};

		return stats;
	}

	/**
	 * Calculate type distribution
	 */
	private calculateTypeDistribution(): Record<string, number> {
		const distribution: Record<string, number> = {};

		for (const { schema } of this.schemas) {
			// Use the schemaType field which is already properly extracted
			const baseType = schema.schemaType || 'unknown';
			distribution[baseType] = (distribution[baseType] || 0) + 1;
		}

		return distribution;
	}

	/**
	 * Calculate complexity metrics
	 */
	private calculateComplexity(threshold: number): ComplexityMetrics {
		const depths: number[] = [];
		const fieldCounts: number[] = [];
		let totalRefinements = 0;
		let totalTransforms = 0;
		const complexSchemas: Array<{ name: string; complexity: number; reasons: string[] }> = [];

		for (const { schema } of this.schemas) {
			const depth = this.calculateSchemaDepth(schema);
			const fieldCount = this.calculateFieldCount(schema);
			const complexity = depth * 2 + fieldCount;

			depths.push(depth);
			fieldCounts.push(fieldCount);

			// Count refinements and transforms
			const schemaCode = schema.callChain.join('.');
			if (schemaCode.includes('refine')) totalRefinements++;
			if (schemaCode.includes('transform')) totalTransforms++;

			// Track complex schemas
			if (complexity > threshold) {
				const reasons: string[] = [];
				if (depth > 3) reasons.push(`Deep nesting (${depth} levels)`);
				if (fieldCount > 10) reasons.push(`Many fields (${fieldCount})`);
				if (schemaCode.includes('refine')) reasons.push('Uses refinements');
				if (schemaCode.includes('transform')) reasons.push('Uses transforms');

				complexSchemas.push({
					name: schema.name,
					complexity,
					reasons,
				});
			}
		}

		return {
			averageDepth: depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0,
			maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
			averageFieldCount:
				fieldCounts.length > 0 ? fieldCounts.reduce((a, b) => a + b, 0) / fieldCounts.length : 0,
			maxFieldCount: fieldCounts.length > 0 ? Math.max(...fieldCounts) : 0,
			totalRefinements,
			totalTransforms,
			complexSchemas: complexSchemas.sort((a, b) => b.complexity - a.complexity),
		};
	}

	/**
	 * Calculate schema depth (nesting level) - estimated from full type text
	 */
	private calculateSchemaDepth(schema: ZodSchemaInfo): number {
		// Use the full type text which contains the complete Zod expression
		const code = schema.type;
		// Count nested z.object( occurrences as depth indicator
		const objectNesting = (code.match(/z\.object\(/g) || []).length;
		const arrayNesting = (code.match(/z\.array\(/g) || []).length;
		return Math.max(1, objectNesting + arrayNesting);
	}

	/**
	 * Calculate field count - estimated from full type text
	 */
	private calculateFieldCount(schema: ZodSchemaInfo): number {
		// Only count fields for object schemas
		if (schema.schemaType !== 'object') return 0;

		// Use the full type text which contains the complete Zod expression
		const code = schema.type;
		// Rough estimate: count field definitions (property: z.something)
		const fieldMatches = code.match(/:\s*z\./g);
		return fieldMatches ? fieldMatches.length : 0;
	}

	/**
	 * Analyze usage patterns
	 */
	private analyzeUsagePatterns(): UsagePattern[] {
		const patterns = new Map<string, { count: number; examples: Set<string> }>();

		for (const { schema } of this.schemas) {
			// Check for common patterns
			const schemaCode = schema.callChain.join('.');

			if (schemaCode.includes('.email()')) {
				this.addPattern(patterns, 'Email validation', schema.name);
			}
			if (schemaCode.includes('.url()')) {
				this.addPattern(patterns, 'URL validation', schema.name);
			}
			if (schemaCode.includes('.uuid()')) {
				this.addPattern(patterns, 'UUID validation', schema.name);
			}
			if (schemaCode.includes('.refine(')) {
				this.addPattern(patterns, 'Custom refinements', schema.name);
			}
			if (schemaCode.includes('.transform(')) {
				this.addPattern(patterns, 'Transforms', schema.name);
			}
			if (schemaCode.includes('.optional()')) {
				this.addPattern(patterns, 'Optional fields', schema.name);
			}
			if (schemaCode.includes('.nullable()')) {
				this.addPattern(patterns, 'Nullable fields', schema.name);
			}
		}

		return Array.from(patterns.entries()).map(([pattern, data]) => ({
			pattern,
			count: data.count,
			examples: Array.from(data.examples).slice(0, 3),
		}));
	}

	/**
	 * Helper to add pattern
	 */
	private addPattern(
		patterns: Map<string, { count: number; examples: Set<string> }>,
		pattern: string,
		example: string,
	): void {
		if (!patterns.has(pattern)) {
			patterns.set(pattern, { count: 0, examples: new Set() });
		}
		const data = patterns.get(pattern)!;
		data.count++;
		data.examples.add(example);
	}

	/**
	 * Detect schema hotspots (potential issues)
	 */
	private detectHotspots(): SchemaHotspot[] {
		const hotspots: SchemaHotspot[] = [];

		for (const { schema, file } of this.schemas) {
			const issues: string[] = [];
			const suggestions: string[] = [];
			const schemaCode = schema.callChain.join('.');

			// Check for missing descriptions
			if (!schema.description) {
				issues.push('Missing description');
				suggestions.push('Add .describe() to document the schema purpose');
			}

			// Check for z.any() usage
			if (schemaCode.includes('z.any()')) {
				issues.push('Uses z.any() which bypasses type safety');
				suggestions.push('Replace z.any() with z.unknown() or specific types');
			}

			// Check for loose objects
			if (schemaCode.includes('.passthrough()')) {
				issues.push('Uses .passthrough() allowing unknown properties');
				suggestions.push('Define explicit properties or document why passthrough is needed');
			}

			// Check complexity
			const depth = this.calculateSchemaDepth(schema);
			const fieldCount = this.calculateFieldCount(schema);
			if (depth > 4) {
				issues.push(`Deep nesting (${depth} levels)`);
				suggestions.push('Consider flattening the schema or extracting nested schemas');
			}
			if (fieldCount > 15) {
				issues.push(`Many fields (${fieldCount})`);
				suggestions.push('Consider splitting into multiple smaller schemas');
			}

			if (issues.length > 0) {
				const severity: 'high' | 'medium' | 'low' =
					issues.length > 3 ? 'high' : issues.length > 1 ? 'medium' : 'low';

				hotspots.push({
					name: schema.name,
					file,
					issues,
					severity,
					suggestions,
				});
			}
		}

		return hotspots.sort((a, b) => {
			const severityOrder = { high: 3, medium: 2, low: 1 };
			return severityOrder[b.severity] - severityOrder[a.severity];
		});
	}

	/**
	 * Generate recommendations
	 */
	private generateRecommendations(): string[] {
		const recommendations: string[] = [];
		const complexityMetrics = this.calculateComplexity(10);

		// Complexity recommendations
		if (complexityMetrics.averageDepth > 3) {
			recommendations.push(
				'Consider reducing schema nesting depth for better maintainability',
			);
		}

		if (complexityMetrics.complexSchemas.length > 0) {
			recommendations.push(
				`${complexityMetrics.complexSchemas.length} complex schema(s) detected - consider refactoring`,
			);
		}

		// Type distribution recommendations
		const hasAnyType = this.schemas.some((s) => s.schema.callChain.join('.').includes('z.any()'));
		if (hasAnyType) {
			recommendations.push('Replace z.any() with z.unknown() or specific types for better type safety');
		}

		// Documentation recommendations
		const undocumented = this.schemas.filter((s) => !s.schema.description).length;
		if (undocumented > 0) {
			recommendations.push(`${undocumented} schema(s) missing descriptions - add .describe() calls`);
		}

		return recommendations;
	}

	/**
	 * Calculate bundle impact (estimated bundle size contribution)
	 */
	private calculateBundleImpact(): BundleImpact {
		// Base Zod import overhead (minified + gzipped estimate)
		const BASE_ZOD_SIZE = 12 * 1024; // ~12KB for core Zod

		// Estimate size for each schema based on complexity
		const schemaEstimates = this.schemas.map(({ schema }) => {
			let size = 200; // Base schema overhead

			const code = schema.callChain.join('.');

			// Add size for complexity
			const depth = this.calculateSchemaDepth(schema);
			const fieldCount = this.calculateFieldCount(schema);

			size += depth * 50; // Nesting adds overhead
			size += fieldCount * 30; // Each field adds overhead

			// Add size for refinements/transforms (these are expensive)
			const refinements = (code.match(/\.refine\(/g) || []).length;
			const transforms = (code.match(/\.transform\(/g) || []).length;
			size += refinements * 150; // Refinements add significant size
			size += transforms * 200; // Transforms add even more

			// Add size for validations
			if (code.includes('.email()')) size += 100;
			if (code.includes('.url()')) size += 100;
			if (code.includes('.uuid()')) size += 80;
			if (code.includes('.datetime()')) size += 120;
			if (code.includes('.regex(')) size += 150;

			return {
				name: schema.name,
				estimatedSize: size,
			};
		});

		const totalSchemaSize = schemaEstimates.reduce((sum, s) => sum + s.estimatedSize, 0);
		const totalSize = BASE_ZOD_SIZE + totalSchemaSize;

		// Sort by size and get largest
		const sorted = [...schemaEstimates].sort((a, b) => b.estimatedSize - a.estimatedSize);
		const largestSchemas = sorted.slice(0, 5).map((s) => {
			const schema = this.schemas.find((sch) => sch.schema.name === s.name)?.schema;
			const code = schema?.callChain.join('.') || '';

			const reasons: string[] = [];
			if (code.includes('.refine(')) reasons.push('Complex refinements');
			if (code.includes('.transform(')) reasons.push('Data transformations');
			if (this.calculateSchemaDepth(schema!) > 3) reasons.push('Deep nesting');
			if (this.calculateFieldCount(schema!) > 10) reasons.push('Many fields');

			return {
				name: s.name,
				estimatedSize: s.estimatedSize,
				reason: reasons.join(', ') || 'Complex schema',
			};
		});

		// Calculate percentages
		const bySchema = schemaEstimates.map((s) => ({
			name: s.name,
			estimatedSize: s.estimatedSize,
			percentOfTotal: (s.estimatedSize / totalSize) * 100,
		}));

		// Generate optimization tips
		const optimizationTips: string[] = [];

		const hasLargeRefinements = this.schemas.some((s) =>
			s.schema.callChain.join('.').includes('.refine('),
		);
		if (hasLargeRefinements) {
			optimizationTips.push(
				'Consider lazy loading schemas with refinements - they add significant bundle size',
			);
		}

		const hasTransforms = this.schemas.some((s) =>
			s.schema.callChain.join('.').includes('.transform('),
		);
		if (hasTransforms) {
			optimizationTips.push(
				'Transforms are expensive - consider using .preprocess() or moving logic to application layer',
			);
		}

		if (sorted[0] && sorted[0].estimatedSize > 1000) {
			optimizationTips.push(
				`Largest schema (${sorted[0].name}) could be split into smaller, more focused schemas`,
			);
		}

		if (this.schemas.length > 50) {
			optimizationTips.push(
				'Large number of schemas - consider code splitting and lazy loading schemas by feature',
			);
		}

		return {
			estimatedSize: totalSize,
			bySchema: bySchema.sort((a, b) => b.estimatedSize - a.estimatedSize),
			largestSchemas,
			optimizationTips,
		};
	}

	/**
	 * Clear all collected data
	 */
	clear(): void {
		this.schemas = [];
	}
}

/**
 * Create a new stats aggregator
 */
export function createStatsAggregator(): SchemaStatsAggregator {
	return new SchemaStatsAggregator();
}
