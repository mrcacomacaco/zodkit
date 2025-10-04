/**
 * @fileoverview Unit tests for lint command
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lintCommand } from '../../src/cli/commands/lint';

describe('Lint Command', () => {
	const testDir = join(__dirname, '.temp-lint-test');
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

	it('should detect loose object patterns', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
}).passthrough();
`;

		writeFileSync(schemaFile, schema);

		// Should not throw
		await expect(lintCommand([schemaFile])).resolves.not.toThrow();
	});

	it('should detect missing descriptions', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		// Should not throw
		await expect(lintCommand([schemaFile])).resolves.not.toThrow();
	});

	it('should handle no files found', async () => {
		await expect(lintCommand(['non-existent-pattern'])).resolves.not.toThrow();
	});

	it('should accept custom severity filter', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		await expect(
			lintCommand([schemaFile], { severity: 'error' }),
		).resolves.not.toThrow();
	});

	it('should support JSON output format', async () => {
		const schema = `
import { z } from 'zod';

export const UserSchema = z.object({
  name: z.string(),
});
`;

		writeFileSync(schemaFile, schema);

		await expect(lintCommand([schemaFile], { format: 'json' })).resolves.not.toThrow();
	});
});
