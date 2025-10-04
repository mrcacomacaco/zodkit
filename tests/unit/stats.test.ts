/**
 * @fileoverview Unit tests for stats command
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createStatsAggregator } from '../../src/core/schema-stats';

describe('Stats Aggregator', () => {
	const testDir = join(__dirname, '.temp-stats-test');
	const schemaFile = join(testDir, 'test.schema.ts');

	beforeEach(() => {
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it('should count total schemas', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const PostSchema = z.object({
  title: z.string(),
  content: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats();
		expect(stats.totalSchemas).toBe(2);
	});

	it('should calculate type distribution', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
});

export const IdsSchema = z.array(z.string());
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats();
		expect(Object.keys(stats.schemasByType).length).toBeGreaterThan(0);
	});

	it('should detect complexity metrics', async () => {
		const schema = `
import { z } from 'zod';

export const ComplexSchema = z.object({
  user: z.object({
    profile: z.object({
      name: z.string(),
    }),
  }),
});
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats({ includeComplexity: true });
		expect(stats.complexityMetrics.maxDepth).toBeGreaterThan(0);
	});

	it('should detect usage patterns', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  email: z.string().email(),
  website: z.string().url(),
});
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats({ includeUsagePatterns: true });
		expect(Array.isArray(stats.usagePatterns)).toBe(true);
	});

	it('should detect hotspots', async () => {
		const schema = `
import { z } from 'zod';

export const ProblematicSchema = z.object({
  data: z.any(),
}).passthrough();
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats({ includeHotspots: true });
		expect(stats.hotspots.length).toBeGreaterThan(0);
	});

	it('should generate recommendations', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats();
		expect(Array.isArray(stats.recommendations)).toBe(true);
	});

	it('should handle empty projects', async () => {
		const schema = `
// No schemas here
const foo = 'bar';
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats();
		expect(stats.totalSchemas).toBe(0);
	});

	it('should support complexity threshold', async () => {
		const schema = `
import { z } from 'zod';

export const SimpleSchema = z.object({
  id: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		const aggregator = createStatsAggregator();
		await aggregator.addFile(schemaFile);

		const stats = aggregator.generateStats({ complexityThreshold: 5 });
		expect(stats.complexityMetrics.complexSchemas.length).toBe(0);
	});

	describe('Bundle Impact Analysis', () => {
		it('should calculate bundle impact', async () => {
			const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeBundleImpact: true });
			expect(stats.bundleImpact).toBeDefined();
			expect(stats.bundleImpact!.estimatedSize).toBeGreaterThan(0);
		});

		it('should identify largest schemas', async () => {
			const schema = `
import { z } from 'zod';

export const SmallSchema = z.object({
  id: z.string(),
});

export const LargeSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  url: z.string().url(),
  data: z.object({
    nested: z.object({
      deep: z.string(),
    }),
  }),
}).refine((data) => true);
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeBundleImpact: true });
			expect(stats.bundleImpact!.largestSchemas.length).toBeGreaterThan(0);
			expect(stats.bundleImpact!.largestSchemas[0].name).toBe('LargeSchema');
		});

		it('should provide optimization tips for refinements', async () => {
			const schema = `
import { z } from 'zod';

export const Schema1 = z.object({ id: z.string() }).refine(() => true);
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeBundleImpact: true });
			expect(stats.bundleImpact).toBeDefined();
			// Check if optimization tips are present (may be empty if thresholds not met)
			expect(Array.isArray(stats.bundleImpact!.optimizationTips)).toBe(true);
		});

		it('should calculate size by schema', async () => {
			const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeBundleImpact: true });
			expect(stats.bundleImpact!.bySchema.length).toBeGreaterThan(0);
			expect(stats.bundleImpact!.bySchema[0].percentOfTotal).toBeGreaterThan(0);
		});

		it('should handle schemas without bundle impact', async () => {
			const schema = `
import { z } from 'zod';

export const SimpleSchema = z.object({
  id: z.string(),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeBundleImpact: false });
			expect(stats.bundleImpact).toBeUndefined();
		});
	});

	describe('Type Detection', () => {
		it('should correctly identify object types', async () => {
			const schema = `
import { z } from 'zod';

export const ObjectSchema = z.object({
  name: z.string(),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats();
			expect(stats.schemasByType.object).toBe(1);
		});

		it('should correctly identify array types', async () => {
			const schema = `
import { z } from 'zod';

export const ArraySchema = z.array(z.string());
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats();
			expect(stats.schemasByType.array).toBe(1);
		});

		it('should correctly identify string types', async () => {
			const schema = `
import { z } from 'zod';

export const StringSchema = z.string();
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats();
			expect(stats.schemasByType.string).toBe(1);
		});

		it('should correctly identify enum types', async () => {
			const schema = `
import { z } from 'zod';

export const EnumSchema = z.enum(['a', 'b', 'c']);
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats();
			expect(stats.schemasByType.enum).toBe(1);
		});
	});

	describe('Complexity Metrics', () => {
		it('should calculate schema depth correctly', async () => {
			const schema = `
import { z } from 'zod';

export const DeepSchema = z.object({
  level1: z.object({
    level2: z.object({
      level3: z.string(),
    }),
  }),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeComplexity: true });
			expect(stats.complexityMetrics.maxDepth).toBeGreaterThanOrEqual(3);
		});

		it('should calculate field count correctly', async () => {
			const schema = `
import { z } from 'zod';

export const ManyFieldsSchema = z.object({
  field1: z.string(),
  field2: z.string(),
  field3: z.string(),
  field4: z.string(),
  field5: z.string(),
});
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeComplexity: true });
			expect(stats.complexityMetrics.maxFieldCount).toBeGreaterThanOrEqual(5);
		});

		it('should count refinements', async () => {
			const schema = `
import { z } from 'zod';

export const RefinedSchema = z.object({
  age: z.number(),
}).refine((data) => data.age > 0);
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeComplexity: true });
			expect(stats.complexityMetrics.totalRefinements).toBe(1);
		});

		it('should count transforms', async () => {
			const schema = `
import { z } from 'zod';

export const TransformedSchema = z.object({
  name: z.string(),
}).transform((data) => ({ ...data, upper: data.name.toUpperCase() }));
`;

			writeFileSync(schemaFile, schema);

			const aggregator = createStatsAggregator();
			await aggregator.addFile(schemaFile);

			const stats = aggregator.generateStats({ includeComplexity: true });
			expect(stats.complexityMetrics.totalTransforms).toBe(1);
		});
	});
});
