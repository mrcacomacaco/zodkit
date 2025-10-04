/**
 * @fileoverview Runtime validation schemas for CLI command options
 * @module Core/CommandValidation
 */

import { z } from 'zod';

/**
 * Lint command options validation schema
 */
export const LintOptionsSchema = z
	.object({
		patterns: z.array(z.string()).optional(),
		fix: z.boolean().optional(),
		rules: z
			.record(z.string(), z.union([z.boolean(), z.record(z.string(), z.unknown())]))
			.optional(),
		severity: z.enum(['error', 'warning', 'info']).optional(),
		output: z.string().optional(),
		format: z.enum(['text', 'json']).optional(),
		config: z.string().optional(),
	})
	.strict();

export type ValidatedLintOptions = z.infer<typeof LintOptionsSchema>;

/**
 * Stats command options validation schema
 */
export const StatsOptionsSchema = z
	.object({
		output: z.string().optional(),
		format: z.enum(['text', 'json']).optional(),
		verbose: z.boolean().optional(),
		complexity: z.boolean().optional(),
		patterns: z.boolean().optional(),
		hotspots: z.boolean().optional(),
		bundleImpact: z.boolean().optional(),
	})
	.strict();

export type ValidatedStatsOptions = z.infer<typeof StatsOptionsSchema>;

/**
 * Create command options validation schema
 */
export const CreateOptionsSchema = z
	.object({
		output: z.string().optional(),
		name: z.string().optional(),
		interactive: z.boolean().optional(),
		template: z
			.enum(['user', 'product', 'post', 'comment', 'address', 'apiResponse', 'pagination'])
			.optional(),
		format: z.enum(['text', 'json']).optional(),
		// Generation workflow options
		patterns: z.boolean().optional(),
		preserveJsdoc: z.boolean().optional(),
		overwrite: z.boolean().optional(),
		incremental: z.boolean().optional(),
	})
	.strict();

export type ValidatedCreateOptions = z.infer<typeof CreateOptionsSchema>;

/**
 * Pattern argument validation (single string or array)
 */
export const PatternsArgSchema = z.union([z.string(), z.array(z.string())]).optional();

/**
 * Generic command options validator
 */
export function validateCommandOptions<T>(
	schema: z.ZodSchema<T>,
	options: unknown,
	commandName: string,
): T {
	try {
		return schema.parse(options);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const messages = error.issues.map((err) => `  - ${err.path.join('.')}: ${err.message}`);
			throw new Error(`Invalid options for '${commandName}' command:\n${messages.join('\n')}`);
		}
		throw error;
	}
}
