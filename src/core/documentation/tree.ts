/**
 * @fileoverview Documentation Tree Structure
 * @module DocumentationTree
 *
 * Organizes schema metadata into a hierarchical tree for various output formats.
 */

import type { ZodSchemaInfo } from '../ast/extractor';
import type { SchemaMetadata } from '../metadata/types';

/**
 * Documentation tree node representing a schema or category
 */
export interface DocNode {
	/** Node identifier */
	id: string;
	/** Node type */
	type: 'schema' | 'category' | 'namespace';
	/** Display name */
	name: string;
	/** Node description */
	description?: string;
	/** Full file path (for schema nodes) */
	filePath?: string;
	/** Schema metadata (for schema nodes) */
	metadata?: SchemaMetadata;
	/** Schema type definition (for schema nodes) */
	schemaType?: string;
	/** Child nodes */
	children: DocNode[];
	/** Parent node reference */
	parent?: DocNode;
	/** Depth in tree (0 = root) */
	depth: number;
	/** Additional tags/labels */
	tags: string[];
	/** Relationships to other nodes */
	relationships: DocRelationship[];
}

/**
 * Relationship between documentation nodes
 */
export interface DocRelationship {
	/** Relationship type */
	type: 'extends' | 'uses' | 'references' | 'similar';
	/** Target node ID */
	targetId: string;
	/** Relationship description */
	description?: string;
}

/**
 * Documentation tree configuration
 */
export interface DocTreeConfig {
	/** Group schemas by category (from metadata) */
	groupByCategory?: boolean;
	/** Group schemas by file path */
	groupByPath?: boolean;
	/** Group schemas by namespace */
	groupByNamespace?: boolean;
	/** Include relationships */
	includeRelationships?: boolean;
	/** Maximum tree depth */
	maxDepth?: number;
	/** Sort order: alpha, date, category */
	sortBy?: 'alpha' | 'date' | 'category';
}

/**
 * Build documentation tree from schemas
 */
export class DocumentationTree {
	private readonly root: DocNode;
	private readonly nodeMap: Map<string, DocNode> = new Map();
	private readonly config: DocTreeConfig;

	constructor(config: DocTreeConfig = {}) {
		this.config = {
			groupByCategory: true,
			groupByPath: false,
			groupByNamespace: false,
			includeRelationships: true,
			maxDepth: 10,
			sortBy: 'category',
			...config,
		};

		this.root = {
			id: 'root',
			type: 'category',
			name: 'Schemas',
			description: 'All Zod schemas in the project',
			children: [],
			depth: 0,
			tags: [],
			relationships: [],
		};

		this.nodeMap.set('root', this.root);
	}

	/**
	 * Add schemas to the tree
	 */
	addSchemas(schemas: ZodSchemaInfo[]): void {
		for (const schema of schemas) {
			this.addSchema(schema);
		}

		// Sort children at each level
		this.sortTree(this.root);

		// Build relationships if enabled
		if (this.config.includeRelationships) {
			this.buildRelationships();
		}
	}

	/**
	 * Add a single schema to the tree
	 */
	private addSchema(schema: ZodSchemaInfo): void {
		// Determine parent node based on grouping strategy
		const parent = this.determineParent(schema);

		// Extract metadata safely
		const meta = schema.metadata as any;
		const description = schema.description || (meta?.description as string | undefined);
		const tags = Array.isArray(meta?.tags) ? (meta.tags as string[]) : [];

		// Create schema node
		const node: DocNode = {
			id: `${schema.name}-${schema.filePath}`,
			type: 'schema',
			name: schema.name,
			description,
			filePath: schema.filePath,
			metadata: meta,
			schemaType: schema.type,
			children: [],
			parent,
			depth: parent.depth + 1,
			tags,
			relationships: [],
		};

		parent.children.push(node);
		this.nodeMap.set(node.id, node);
	}

	/**
	 * Determine parent node based on grouping strategy
	 */
	private determineParent(schema: ZodSchemaInfo): DocNode {
		const meta = schema.metadata as any;

		// Group by category
		if (this.config.groupByCategory && meta?.category) {
			const category = meta.category as string;
			const categoryId = `category-${category}`;
			let categoryNode = this.nodeMap.get(categoryId);

			if (!categoryNode) {
				categoryNode = {
					id: categoryId,
					type: 'category',
					name: category,
					description: `Schemas in the ${category} category`,
					children: [],
					parent: this.root,
					depth: 1,
					tags: [],
					relationships: [],
				};
				this.root.children.push(categoryNode);
				this.nodeMap.set(categoryId, categoryNode);
			}

			return categoryNode;
		}

		// Group by file path
		if (this.config.groupByPath) {
			const pathParts = schema.filePath.split('/');
			const fileName = pathParts[pathParts.length - 1];
			const fileId = `file-${fileName}`;
			let fileNode = this.nodeMap.get(fileId);

			if (!fileNode) {
				fileNode = {
					id: fileId,
					type: 'namespace',
					name: fileName,
					description: `Schemas from ${fileName}`,
					filePath: schema.filePath,
					children: [],
					parent: this.root,
					depth: 1,
					tags: [],
					relationships: [],
				};
				this.root.children.push(fileNode);
				this.nodeMap.set(fileId, fileNode);
			}

			return fileNode;
		}

		// Default to root
		return this.root;
	}

	/**
	 * Sort tree nodes
	 */
	private sortTree(node: DocNode): void {
		if (node.children.length === 0) return;

		// Sort children
		node.children.sort((a, b) => {
			switch (this.config.sortBy) {
				case 'alpha':
					return a.name.localeCompare(b.name);
				case 'category':
					// Categories first, then schemas alphabetically
					if (a.type !== b.type) {
						return a.type === 'category' ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				default:
					return 0;
			}
		});

		// Recursively sort children
		for (const child of node.children) {
			this.sortTree(child);
		}
	}

	/**
	 * Build relationships between nodes
	 */
	private buildRelationships(): void {
		const nodes = Array.from(this.nodeMap.values()).filter((n) => n.type === 'schema');

		for (const node of nodes) {
			if (!node.schemaType) continue;

			// Find schemas that this one extends or references
			for (const otherNode of nodes) {
				if (node.id === otherNode.id) continue;

				// Check if this schema extends another
				if (node.schemaType.includes(`extend(${otherNode.name})`)) {
					node.relationships.push({
						type: 'extends',
						targetId: otherNode.id,
						description: `Extends ${otherNode.name}`,
					});
				}

				// Check if this schema uses another (via .merge, .and, etc.)
				if (
					node.schemaType.includes(`merge(${otherNode.name})`) ||
					node.schemaType.includes(`and(${otherNode.name})`)
				) {
					node.relationships.push({
						type: 'uses',
						targetId: otherNode.id,
						description: `Uses ${otherNode.name}`,
					});
				}

				// Check for references (schema name mentioned in type)
				if (
					node.schemaType.includes(otherNode.name) &&
					!node.relationships.some((r) => r.targetId === otherNode.id)
				) {
					node.relationships.push({
						type: 'references',
						targetId: otherNode.id,
						description: `References ${otherNode.name}`,
					});
				}
			}
		}
	}

	/**
	 * Get the tree root
	 */
	getRoot(): DocNode {
		return this.root;
	}

	/**
	 * Get node by ID
	 */
	getNode(id: string): DocNode | undefined {
		return this.nodeMap.get(id);
	}

	/**
	 * Get all schema nodes
	 */
	getSchemas(): DocNode[] {
		return Array.from(this.nodeMap.values()).filter((n) => n.type === 'schema');
	}

	/**
	 * Get schemas by category
	 */
	getSchemasByCategory(category: string): DocNode[] {
		return this.getSchemas().filter((n) => n.metadata?.category === category);
	}

	/**
	 * Get schemas by tag
	 */
	getSchemasByTag(tag: string): DocNode[] {
		return this.getSchemas().filter((n) => n.tags.includes(tag));
	}

	/**
	 * Walk the tree with a visitor function
	 */
	walk(visitor: (node: DocNode) => undefined | boolean, node: DocNode = this.root): void {
		const shouldContinue = visitor(node);
		if (shouldContinue === false) return;

		for (const child of node.children) {
			this.walk(visitor, child);
		}
	}

	/**
	 * Convert tree to flat list
	 */
	toArray(): DocNode[] {
		const result: DocNode[] = [];
		this.walk((node) => {
			result.push(node);
			return undefined;
		});
		return result;
	}

	/**
	 * Convert tree to JSON
	 */
	toJSON(): any {
		const nodeToJSON = (node: DocNode): any => ({
			id: node.id,
			type: node.type,
			name: node.name,
			description: node.description,
			filePath: node.filePath,
			metadata: node.metadata,
			tags: node.tags,
			relationships: node.relationships,
			children: node.children.map(nodeToJSON),
		});

		return nodeToJSON(this.root);
	}

	/**
	 * Get tree statistics
	 */
	getStats() {
		const stats = {
			totalNodes: 0,
			schemaNodes: 0,
			categoryNodes: 0,
			maxDepth: 0,
			totalRelationships: 0,
		};

		this.walk((node) => {
			stats.totalNodes++;
			if (node.type === 'schema') stats.schemaNodes++;
			if (node.type === 'category') stats.categoryNodes++;
			if (node.depth > stats.maxDepth) stats.maxDepth = node.depth;
			stats.totalRelationships += node.relationships.length;
			return undefined;
		});

		return stats;
	}
}

/**
 * Create a documentation tree
 */
export function createDocumentationTree(
	schemas: ZodSchemaInfo[],
	config?: DocTreeConfig,
): DocumentationTree {
	const tree = new DocumentationTree(config);
	tree.addSchemas(schemas);
	return tree;
}
