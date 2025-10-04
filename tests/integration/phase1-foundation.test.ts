/**
 * Phase 1 Foundation Integration Test
 * Verifies AST parsing, metadata extraction, and registry work end-to-end
 */

import { describe, it, expect } from '@jest/globals';
import { createASTParser } from '../../src/core/ast/parser';
import { createZodExtractor } from '../../src/core/ast/extractor';
import { createCollector } from '../../src/core/metadata/collector';
import { createRegistry } from '../../src/core/metadata/registry';

describe('Phase 1: Foundation Components', () => {
	const testSchema = `
import { z } from 'zod';

/**
 * User schema for authentication
 * @description Validates user data
 * @example { name: "John", email: "john@example.com" }
 */
export const UserSchema = z.object({
  name: z.string().describe("User's full name"),
  email: z.string().email(),
  age: z.number().optional()
}).meta({
  title: "User",
  category: "auth",
  examples: [
    { name: "Alice", email: "alice@example.com", age: 30 }
  ]
});

export const PostSchema = z.object({
  title: z.string(),
  content: z.string()
}).describe("Blog post schema");
`;

	describe('AST Parser', () => {
		it('should parse TypeScript source', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			expect(sourceFile).toBeDefined();
			expect(sourceFile.getFilePath()).toContain('test.ts');
		});

		it('should extract imports', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const sourceFile = parser.createSourceFile('test.ts', testSchema);
			const imports = parser.parseImports(sourceFile);

			expect(imports).toHaveLength(1);
			expect(imports[0].moduleSpecifier).toBe('zod');
			expect(imports[0].namedImports).toContain('z');
		});

		it('should extract exports', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const sourceFile = parser.createSourceFile('test.ts', testSchema);
			const exports = parser.parseExports(sourceFile);

			expect(exports.length).toBeGreaterThanOrEqual(2);
			const exportNames = exports.map((e) => e.name);
			expect(exportNames).toContain('UserSchema');
			expect(exportNames).toContain('PostSchema');
		});
	});

	describe('Zod Schema Extractor', () => {
		it('should extract Zod schemas', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);

			expect(schemas).toHaveLength(2);
			expect(schemas[0].name).toBe('UserSchema');
			expect(schemas[0].schemaType).toBe('object');
			expect(schemas[0].isExported).toBe(true);
		});

		it('should extract schema metadata', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const userSchema = schemas.find((s) => s.name === 'UserSchema');

			expect(userSchema).toBeDefined();
			expect(userSchema!.metadata).toBeDefined();
			expect(userSchema!.metadata!.title).toBe('User');
			expect(userSchema!.metadata!.category).toBe('auth');
		});

		it('should extract .describe() description', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const postSchema = schemas.find((s) => s.name === 'PostSchema');

			expect(postSchema).toBeDefined();
			expect(postSchema!.description).toBe('Blog post schema');
		});
	});

	describe('Metadata Collector', () => {
		it('should enrich schema with metadata', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const collector = createCollector();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const userSchema = schemas[0];
			const enriched = collector.enrichSchema(userSchema);

			expect(enriched.title).toBe('User');
			expect(enriched.category).toBe('auth');
			expect(enriched.examples).toBeDefined();
		});
	});

	describe('ZodKit Registry', () => {
		it('should create and read schema entries', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const registry = createRegistry();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const entry = registry.create(schemas[0], { category: 'test' });

			expect(entry.id).toBeDefined();
			expect(entry.metadata.name).toBe('UserSchema');
			expect(entry.metadata.category).toBe('test');

			const retrieved = registry.read(entry.id);
			expect(retrieved).toEqual(entry);
		});

		it('should query schemas by type', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const registry = createRegistry();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			schemas.forEach((schema) => registry.create(schema));

			const objectSchemas = registry.query({ schemaType: 'object' });
			expect(objectSchemas.length).toBe(2);
		});

		it('should update schema metadata', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const registry = createRegistry();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const entry = registry.create(schemas[0]);

			const updated = registry.update(
				entry.id,
				{ deprecated: true, version: '2.0.0' },
				{ merge: true },
			);

			expect(updated?.metadata.deprecated).toBe(true);
			expect(updated?.metadata.version).toBe('2.0.0');
			expect(updated?.metadata.name).toBe('UserSchema'); // Preserved
		});

		it('should delete schemas', () => {
			const registry = createRegistry();
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const entry = registry.create(schemas[0]);

			expect(registry.count()).toBe(1);

			const deleted = registry.delete(entry.id);
			expect(deleted).toBe(true);
			expect(registry.count()).toBe(0);
		});

		it('should handle schema references', () => {
			const registry = createRegistry();
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const sourceFile = parser.createSourceFile('test.ts', testSchema);

			const schemas = extractor.extractSchemas(sourceFile);
			const entry1 = registry.create(schemas[0]);
			const entry2 = registry.create(schemas[1]);

			registry.addReference(entry1.id, entry2.id);

			expect(entry1.references).toContain(entry2.id);
			expect(entry2.referencedBy).toContain(entry1.id);

			const deps = registry.getDependencies(entry1.id);
			expect(deps.length).toBe(1);
			expect(deps[0].id).toBe(entry2.id);
		});
	});

	describe('End-to-End Integration', () => {
		it('should discover, extract, and register schemas', () => {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const collector = createCollector();
			const registry = createRegistry();

			// Parse source
			const sourceFile = parser.createSourceFile('user.schema.ts', testSchema);

			// Extract schemas
			const schemas = extractor.extractSchemas(sourceFile);

			// Enrich and register
			schemas.forEach((schema) => {
				const enriched = collector.enrichSchema(schema);
				registry.create(schema, enriched);
			});

			// Verify
			expect(registry.count()).toBe(2);

			const userEntry = registry.readByName('UserSchema');
			expect(userEntry).toBeDefined();
			expect(userEntry!.metadata.title).toBe('User');
			expect(userEntry!.metadata.category).toBe('auth');
			expect(userEntry!.schema.schemaType).toBe('object');
		});
	});
});
