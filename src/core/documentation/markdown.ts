/**
 * @fileoverview Enhanced Markdown Documentation Generator
 * @module MarkdownGenerator
 *
 * Generates comprehensive Markdown documentation from Zod schemas including:
 * - TSDoc comments (@description, @example, @see, @since)
 * - .meta() metadata (title, category, version, examples)
 * - Schema relationships and dependencies
 */

import type { DocNode, DocRelationship, DocumentationTree } from './tree';

export interface MarkdownOptions {
	/** Include table of contents */
	toc?: boolean;
	/** Include examples */
	includeExamples?: boolean;
	/** Include schema relationships */
	includeRelationships?: boolean;
	/** Include metadata */
	includeMetadata?: boolean;
	/** Custom title */
	title?: string;
	/** Custom header content */
	header?: string;
	/** Custom footer content */
	footer?: string;
	/** Heading level for schemas (default: 2) */
	schemaHeadingLevel?: number;
}

export class MarkdownGenerator {
	private options: Required<MarkdownOptions>;

	constructor(options: MarkdownOptions = {}) {
		this.options = {
			toc: true,
			includeExamples: true,
			includeRelationships: true,
			includeMetadata: true,
			title: 'Schema Documentation',
			header: '',
			footer: '',
			schemaHeadingLevel: 2,
			...options,
		};
	}

	/**
	 * Generate Markdown documentation from documentation tree
	 */
	generate(tree: DocumentationTree): string {
		const sections: string[] = [];

		// Header
		sections.push(this.generateHeader());

		// Table of contents
		if (this.options.toc) {
			sections.push(this.generateTOC(tree));
		}

		// Schemas by category
		const root = tree.getRoot();
		this.generateNodeDocumentation(root, sections);

		// Footer
		if (this.options.footer) {
			sections.push(this.options.footer);
		}

		return sections.join('\n\n');
	}

	/**
	 * Generate header section
	 */
	private generateHeader(): string {
		const parts: string[] = [];

		parts.push(`# ${this.options.title}`);

		if (this.options.header) {
			parts.push(this.options.header);
		}

		parts.push(`_Generated on ${new Date().toLocaleDateString()}_`);

		return parts.join('\n\n');
	}

	/**
	 * Generate table of contents
	 */
	private generateTOC(tree: DocumentationTree): string {
		const lines: string[] = ['## Table of Contents', ''];

		tree.walk((node) => {
			if (node.id === 'root') return;

			const indent = '  '.repeat(node.depth - 1);
			const link = `#${this.slugify(node.name)}`;

			if (node.type === 'schema') {
				lines.push(`${indent}- [${node.name}](${link})`);
			} else if (node.type === 'category') {
				lines.push(`${indent}- **[${node.name}](${link})**`);
			}
		});

		return lines.join('\n');
	}

	/**
	 * Generate documentation for a node and its children
	 */
	private generateNodeDocumentation(node: DocNode, sections: string[]): void {
		// Skip root node
		if (node.id === 'root') {
			for (const child of node.children) {
				this.generateNodeDocumentation(child, sections);
			}
			return;
		}

		// Generate category header
		if (node.type === 'category') {
			sections.push(this.generateCategoryHeader(node));

			for (const child of node.children) {
				this.generateNodeDocumentation(child, sections);
			}
			return;
		}

		// Generate schema documentation
		if (node.type === 'schema') {
			sections.push(this.generateSchemaDoc(node));
		}
	}

	/**
	 * Generate category header
	 */
	private generateCategoryHeader(node: DocNode): string {
		const parts: string[] = [];

		parts.push(`## ${node.name}`);

		if (node.description) {
			parts.push(node.description);
		}

		return parts.join('\n\n');
	}

	/**
	 * Generate schema documentation
	 */
	private generateSchemaDoc(node: DocNode): string {
		const parts: string[] = [];
		const level = '#'.repeat(this.options.schemaHeadingLevel + 1);

		// Schema name and description
		parts.push(`${level} ${node.name}`);

		if (node.description) {
			parts.push(node.description);
		}

		// Metadata (from .meta())
		if (this.options.includeMetadata && node.metadata) {
			parts.push(this.generateMetadataSection(node));
		}

		// Schema type definition
		if (node.schemaType) {
			parts.push(this.generateTypeDefinition(node));
		}

		// Examples (from TSDoc @example or .meta())
		if (this.options.includeExamples) {
			const examples = this.collectExamples(node);
			if (examples.length > 0) {
				parts.push(this.generateExamplesSection(examples));
			}
		}

		// Relationships
		if (this.options.includeRelationships && node.relationships.length > 0) {
			parts.push(this.generateRelationshipsSection(node));
		}

		// Additional metadata fields
		if (node.metadata) {
			const additionalSections = this.generateAdditionalSections(node);
			if (additionalSections) {
				parts.push(additionalSections);
			}
		}

		return parts.join('\n\n');
	}

	/**
	 * Generate metadata section
	 */
	private generateMetadataSection(node: DocNode): string {
		const parts: string[] = ['**Metadata:**', ''];
		const meta = node.metadata!;

		if (meta.title) {
			parts.push(`- **Title:** ${meta.title}`);
		}

		if (meta.category) {
			parts.push(`- **Category:** ${meta.category}`);
		}

		if (meta.version) {
			parts.push(`- **Version:** ${meta.version}`);
		}

		if (meta.tsDoc?.since) {
			parts.push(`- **Since:** ${meta.tsDoc.since}`);
		}

		if (meta.deprecated) {
			parts.push(`- **Deprecated:** ⚠️ ${meta.deprecated}`);
		}

		if (meta.tags && meta.tags.length > 0) {
			parts.push(`- **Tags:** ${meta.tags.join(', ')}`);
		}

		return parts.join('\n');
	}

	/**
	 * Generate type definition section
	 */
	private generateTypeDefinition(node: DocNode): string {
		return ['**Type Definition:**', '', '```typescript', node.schemaType, '```'].join('\n');
	}

	/**
	 * Collect examples from various sources
	 */
	private collectExamples(node: DocNode): any[] {
		const examples: any[] = [];

		// From .meta()
		if (node.metadata?.examples) {
			examples.push(...node.metadata.examples);
		}

		// From TSDoc @example
		if (node.metadata?.tsDoc?.examples) {
			examples.push(...node.metadata.tsDoc.examples);
		}

		return examples;
	}

	/**
	 * Generate examples section
	 */
	private generateExamplesSection(examples: any[]): string {
		const parts: string[] = ['**Examples:**', ''];

		examples.forEach((example, index) => {
			if (examples.length > 1) {
				parts.push(`Example ${index + 1}:`);
			}

			if (typeof example === 'string') {
				parts.push('```typescript', example, '```');
			} else {
				parts.push('```json', JSON.stringify(example, null, 2), '```');
			}

			if (index < examples.length - 1) {
				parts.push('');
			}
		});

		return parts.join('\n');
	}

	/**
	 * Generate relationships section
	 */
	private generateRelationshipsSection(node: DocNode): string {
		const parts: string[] = ['**Relationships:**', ''];

		const groupedRelationships = this.groupRelationships(node.relationships);

		for (const [type, relationships] of Object.entries(groupedRelationships)) {
			if (relationships.length === 0) continue;

			const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
			parts.push(`- **${typeLabel}:**`);

			for (const rel of relationships) {
				const targetName = rel.targetId.split('-').pop() || rel.targetId;
				parts.push(`  - ${targetName}${rel.description ? ` - ${rel.description}` : ''}`);
			}
		}

		return parts.join('\n');
	}

	/**
	 * Group relationships by type
	 */
	private groupRelationships(relationships: DocRelationship[]) {
		return relationships.reduce(
			(acc, rel) => {
				if (!acc[rel.type]) acc[rel.type] = [];
				acc[rel.type].push(rel);
				return acc;
			},
			{} as Record<string, DocRelationship[]>,
		);
	}

	/**
	 * Generate additional metadata sections
	 */
	private generateAdditionalSections(node: DocNode): string {
		const parts: string[] = [];
		const meta = node.metadata!;

		// See also from TSDoc
		if (meta.tsDoc?.see && meta.tsDoc.see.length > 0) {
			parts.push('**See Also:**');
			parts.push('');
			meta.tsDoc.see.forEach((link) => {
				parts.push(`- ${link}`);
			});
		}

		return parts.length > 0 ? parts.join('\n') : '';
	}

	/**
	 * Convert text to slug for anchor links
	 */
	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}
}

/**
 * Generate Markdown documentation from documentation tree
 */
export function generateMarkdown(tree: DocumentationTree, options?: MarkdownOptions): string {
	const generator = new MarkdownGenerator(options);
	return generator.generate(tree);
}
