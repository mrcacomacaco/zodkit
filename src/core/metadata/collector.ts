/**
 * @fileoverview Metadata Collector - Extract and enrich schema metadata
 * @module Metadata/Collector
 *
 * Collects metadata from multiple sources: TSDoc, .meta(), .describe(), etc.
 */

import type { Node } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { ZodSchemaInfo } from '../ast/extractor';
import type { TSDocMetadata, SchemaMetadata } from './types';

// === METADATA COLLECTOR ===

/**
 * Collects and enriches metadata from various sources
 */
export class MetadataCollector {
	/**
	 * Extract TSDoc metadata from node
	 */
	extractTSDoc(node: Node): TSDocMetadata | undefined {
		const jsDocNodes = node.getChildren().filter((child) => child.getKind() === SyntaxKind.JSDoc);

		if (jsDocNodes.length === 0) return undefined;

		const metadata: TSDocMetadata = {
			tags: {},
		};

		jsDocNodes.forEach((jsDoc) => {
			const text = jsDoc.getText();

			// Extract summary (first line)
			const summaryMatch = text.match(/^\/\*\*\s*\n?\s*\*?\s*([^\n@]+)/);
			if (summaryMatch) {
				metadata.summary = summaryMatch[1].trim();
			}

			// Extract @description
			const descMatch = text.match(/@description\s+([^\n@]+)/);
			if (descMatch) {
				metadata.description = descMatch[1].trim();
			}

			// Extract @remarks
			const remarksMatch = text.match(/@remarks\s+([^\n@]+)/);
			if (remarksMatch) {
				metadata.remarks = remarksMatch[1].trim();
			}

			// Extract @example (can be multiple)
			const exampleMatches = text.matchAll(/@example\s+([^\n@]+)/g);
			metadata.examples = Array.from(exampleMatches).map((m) => m[1].trim());

			// Extract @see (can be multiple)
			const seeMatches = text.matchAll(/@see\s+([^\n@]+)/g);
			metadata.see = Array.from(seeMatches).map((m) => m[1].trim());

			// Extract @since
			const sinceMatch = text.match(/@since\s+([^\n@]+)/);
			if (sinceMatch) {
				metadata.since = sinceMatch[1].trim();
			}

			// Extract @deprecated
			const deprecatedMatch = text.match(/@deprecated\s+([^\n@]+)/);
			if (deprecatedMatch) {
				metadata.deprecated = deprecatedMatch[1].trim();
			}

			// Extract custom tags
			const customTagMatches = text.matchAll(/@(\w+)\s+([^\n@]+)/g);
			for (const match of customTagMatches) {
				const [, tagName, tagValue] = match;
				if (
					!['description', 'remarks', 'example', 'see', 'since', 'deprecated'].includes(
						tagName,
					)
				) {
					metadata.tags![tagName] = tagValue.trim();
				}
			}
		});

		return Object.keys(metadata).length > 1 ? metadata : undefined; // More than just tags
	}

	/**
	 * Extract Zod .meta() metadata
	 */
	extractZodMeta(zodExpression: string): Record<string, unknown> | undefined {
		const metaMatch = zodExpression.match(/\.meta\((\{[\s\S]*?\})\)/);
		if (!metaMatch) return undefined;

		try {
			// Parse the metadata object
			let metaStr = metaMatch[1];

			// Replace JavaScript identifiers with quoted strings for JSON parsing
			// Handle simple cases like { key: "value" } -> { "key": "value" }
			metaStr = metaStr.replace(/(\w+):/g, '"$1":');

			// Try JSON.parse first (safer than eval)
			try {
				return JSON.parse(metaStr) as Record<string, unknown>;
			} catch {
				// Fallback to Function for more complex cases
				// eslint-disable-next-line no-new-func
				const meta = new Function(`return ${metaMatch[1]}`)();
				return meta as Record<string, unknown>;
			}
		} catch {
			return undefined;
		}
	}

	/**
	 * Extract .describe() description
	 */
	extractDescription(zodExpression: string): string | undefined {
		const descMatch = zodExpression.match(/\.describe\(['"`](.*?)['"`]\)/);
		return descMatch?.[1];
	}

	/**
	 * Enrich schema info with all metadata sources
	 */
	enrichSchema(schema: ZodSchemaInfo, node?: Node): Partial<SchemaMetadata> {
		const enriched: Partial<SchemaMetadata> = {};

		// Extract TSDoc if node provided
		if (node) {
			const tsDoc = this.extractTSDoc(node);
			if (tsDoc) {
				enriched.tsDoc = tsDoc;
				enriched.description =
					enriched.description || tsDoc.description || tsDoc.summary;
			}
		}

		// Extract Zod metadata
		if (schema.metadata) {
			enriched.zodMeta = schema.metadata;
			enriched.custom = schema.metadata;

			// Extract standard fields from .meta()
			if (schema.metadata.title) {
				enriched.title = schema.metadata.title as string;
			}
			if (schema.metadata.description) {
				enriched.description = schema.metadata.description as string;
			}
			if (schema.metadata.examples) {
				enriched.examples = schema.metadata.examples as unknown[];
			}
			if (schema.metadata.deprecated) {
				enriched.deprecated = schema.metadata.deprecated as boolean;
			}
			if (schema.metadata.tags) {
				enriched.tags = schema.metadata.tags as string[];
			}
			if (schema.metadata.category) {
				enriched.category = schema.metadata.category as string;
			}
			if (schema.metadata.version) {
				enriched.version = schema.metadata.version as string;
			}
			if (schema.metadata.author) {
				enriched.author = schema.metadata.author as string;
			}
		}

		// Fallback to .describe() if no description yet
		if (!enriched.description && schema.description) {
			enriched.description = schema.description;
		}

		// Extract examples from schema
		if (!enriched.examples && schema.examples) {
			enriched.examples = schema.examples;
		}

		return enriched;
	}

	/**
	 * Extract metadata from multiple schemas
	 */
	collectAll(schemas: ZodSchemaInfo[]): Map<string, Partial<SchemaMetadata>> {
		const collected = new Map<string, Partial<SchemaMetadata>>();

		schemas.forEach((schema) => {
			const metadata = this.enrichSchema(schema);
			collected.set(schema.name, metadata);
		});

		return collected;
	}
}

/**
 * Create metadata collector
 */
export function createCollector(): MetadataCollector {
	return new MetadataCollector();
}

export default MetadataCollector;
