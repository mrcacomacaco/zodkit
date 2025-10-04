/**
 * @fileoverview Metadata Registry - CRUD operations for schema metadata
 * @module Metadata/Registry
 *
 * Centralized registry for managing Zod schema metadata with CRUD operations
 */

import * as crypto from 'node:crypto';
import type { ZodSchemaInfo } from '../ast/extractor';
import type {
	SchemaMetadata,
	RegistryEntry,
	QueryOptions,
	UpdateOptions,
} from './types';

// === ZODKIT REGISTRY ===

/**
 * ZodKit Schema Metadata Registry
 * Provides CRUD operations for schema metadata
 */
export class ZodKitRegistry {
	private readonly entries = new Map<string, RegistryEntry>();
	private readonly nameIndex = new Map<string, string>(); // name -> id
	private readonly fileIndex = new Map<string, Set<string>>(); // filePath -> Set<id>
	private readonly typeIndex = new Map<string, Set<string>>(); // schemaType -> Set<id>
	private readonly tagIndex = new Map<string, Set<string>>(); // tag -> Set<id>

	/**
	 * Create a new schema entry
	 */
	create(schema: ZodSchemaInfo, metadata?: Partial<SchemaMetadata>): RegistryEntry {
		const id = this.generateId(schema);
		const now = Date.now();

		const fullMetadata: SchemaMetadata = {
			id,
			name: schema.name,
			filePath: schema.filePath,
			line: schema.line,
			column: schema.column,
			schemaType: schema.schemaType,
			description: schema.description || metadata?.description,
			examples: schema.examples || metadata?.examples,
			custom: schema.metadata || metadata?.custom,
			zodMeta: schema.metadata,
			createdAt: now,
			updatedAt: now,
			...metadata,
		};

		const entry: RegistryEntry = {
			id,
			metadata: fullMetadata,
			schema,
			references: [],
			referencedBy: [],
		};

		this.entries.set(id, entry);
		this.indexEntry(entry);

		return entry;
	}

	/**
	 * Read schema by ID
	 */
	read(id: string): RegistryEntry | undefined {
		return this.entries.get(id);
	}

	/**
	 * Read schema by name
	 */
	readByName(name: string): RegistryEntry | undefined {
		const id = this.nameIndex.get(name);
		return id ? this.entries.get(id) : undefined;
	}

	/**
	 * Update schema metadata
	 */
	update(
		id: string,
		updates: Partial<SchemaMetadata>,
		options: UpdateOptions = {},
	): RegistryEntry | undefined {
		const entry = this.entries.get(id);
		if (!entry) return undefined;

		// Unindex old entry
		this.unindexEntry(entry);

		// Update metadata
		if (options.merge) {
			entry.metadata = {
				...entry.metadata,
				...updates,
				updatedAt: Date.now(),
			};
		} else {
			entry.metadata = {
				...updates,
				id,
				updatedAt: Date.now(),
			} as SchemaMetadata;
		}

		// Re-index
		this.indexEntry(entry);

		return entry;
	}

	/**
	 * Delete schema by ID
	 */
	delete(id: string): boolean {
		const entry = this.entries.get(id);
		if (!entry) return false;

		this.unindexEntry(entry);
		this.entries.delete(id);

		// Remove references
		entry.references.forEach((refId) => {
			const refEntry = this.entries.get(refId);
			if (refEntry) {
				refEntry.referencedBy = refEntry.referencedBy.filter((rid) => rid !== id);
			}
		});

		entry.referencedBy.forEach((refById) => {
			const refEntry = this.entries.get(refById);
			if (refEntry) {
				refEntry.references = refEntry.references.filter((rid) => rid !== id);
			}
		});

		return true;
	}

	/**
	 * Query schemas
	 */
	query(options: QueryOptions = {}): RegistryEntry[] {
		let results = Array.from(this.entries.values());

		// Filter by name
		if (options.name) {
			results = results.filter((e) => e.metadata.name === options.name);
		}

		// Filter by file path
		if (options.filePath) {
			const ids = this.fileIndex.get(options.filePath);
			if (ids) {
				results = results.filter((e) => ids.has(e.id));
			} else {
				results = [];
			}
		}

		// Filter by schema type
		if (options.schemaType) {
			const ids = this.typeIndex.get(options.schemaType);
			if (ids) {
				results = results.filter((e) => ids.has(e.id));
			} else {
				results = [];
			}
		}

		// Filter by tags
		if (options.tags && options.tags.length > 0) {
			results = results.filter((e) => {
				const entryTags = e.metadata.tags || [];
				return options.tags!.some((tag) => entryTags.includes(tag));
			});
		}

		// Filter by category
		if (options.category) {
			results = results.filter((e) => e.metadata.category === options.category);
		}

		// Filter by deprecated
		if (options.deprecated !== undefined) {
			results = results.filter((e) => e.metadata.deprecated === options.deprecated);
		}

		// Sort
		if (options.sortBy) {
			const order = options.sortOrder === 'desc' ? -1 : 1;
			results.sort((a, b) => {
				const aVal = a.metadata[options.sortBy!];
				const bVal = b.metadata[options.sortBy!];
				if (aVal < bVal) return -order;
				if (aVal > bVal) return order;
				return 0;
			});
		}

		// Pagination
		if (options.offset !== undefined) {
			results = results.slice(options.offset);
		}
		if (options.limit !== undefined) {
			results = results.slice(0, options.limit);
		}

		return results;
	}

	/**
	 * Get all entries
	 */
	getAll(): RegistryEntry[] {
		return Array.from(this.entries.values());
	}

	/**
	 * Get entry count
	 */
	count(): number {
		return this.entries.size;
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.entries.clear();
		this.nameIndex.clear();
		this.fileIndex.clear();
		this.typeIndex.clear();
		this.tagIndex.clear();
	}

	/**
	 * Add reference between schemas
	 */
	addReference(fromId: string, toId: string): void {
		const fromEntry = this.entries.get(fromId);
		const toEntry = this.entries.get(toId);

		if (fromEntry && toEntry) {
			if (!fromEntry.references.includes(toId)) {
				fromEntry.references.push(toId);
			}
			if (!toEntry.referencedBy.includes(fromId)) {
				toEntry.referencedBy.push(fromId);
			}
		}
	}

	/**
	 * Remove reference between schemas
	 */
	removeReference(fromId: string, toId: string): void {
		const fromEntry = this.entries.get(fromId);
		const toEntry = this.entries.get(toId);

		if (fromEntry) {
			fromEntry.references = fromEntry.references.filter((id) => id !== toId);
		}
		if (toEntry) {
			toEntry.referencedBy = toEntry.referencedBy.filter((id) => id !== fromId);
		}
	}

	/**
	 * Get schema dependencies (recursive)
	 */
	getDependencies(id: string): RegistryEntry[] {
		const entry = this.entries.get(id);
		if (!entry) return [];

		const deps = new Set<RegistryEntry>();
		const visited = new Set<string>();

		const collect = (entryId: string): void => {
			if (visited.has(entryId)) return;
			visited.add(entryId);

			const current = this.entries.get(entryId);
			if (!current) return;

			current.references.forEach((refId) => {
				const refEntry = this.entries.get(refId);
				if (refEntry) {
					deps.add(refEntry);
					collect(refId);
				}
			});
		};

		collect(id);
		return Array.from(deps);
	}

	/**
	 * Get schemas that depend on this one (reverse dependencies)
	 */
	getDependents(id: string): RegistryEntry[] {
		const entry = this.entries.get(id);
		if (!entry) return [];

		return entry.referencedBy
			.map((refId) => this.entries.get(refId))
			.filter((e): e is RegistryEntry => e !== undefined);
	}

	/**
	 * Export registry as JSON
	 */
	export(): string {
		const data = Array.from(this.entries.values());
		return JSON.stringify(data, null, 2);
	}

	/**
	 * Import registry from JSON
	 */
	import(json: string): void {
		this.clear();
		const data = JSON.parse(json) as RegistryEntry[];
		data.forEach((entry) => {
			this.entries.set(entry.id, entry);
			this.indexEntry(entry);
		});
	}

	// === PRIVATE METHODS ===

	private generateId(schema: ZodSchemaInfo): string {
		const hash = crypto
			.createHash('md5')
			.update(`${schema.filePath}:${schema.name}:${schema.line}`)
			.digest('hex')
			.substring(0, 8);

		return `schema_${hash}`;
	}

	private indexEntry(entry: RegistryEntry): void {
		// Index by name
		this.nameIndex.set(entry.metadata.name, entry.id);

		// Index by file path
		if (!this.fileIndex.has(entry.metadata.filePath)) {
			this.fileIndex.set(entry.metadata.filePath, new Set());
		}
		this.fileIndex.get(entry.metadata.filePath)!.add(entry.id);

		// Index by schema type
		if (!this.typeIndex.has(entry.metadata.schemaType)) {
			this.typeIndex.set(entry.metadata.schemaType, new Set());
		}
		this.typeIndex.get(entry.metadata.schemaType)!.add(entry.id);

		// Index by tags
		entry.metadata.tags?.forEach((tag) => {
			if (!this.tagIndex.has(tag)) {
				this.tagIndex.set(tag, new Set());
			}
			this.tagIndex.get(tag)!.add(entry.id);
		});
	}

	private unindexEntry(entry: RegistryEntry): void {
		// Remove from name index
		this.nameIndex.delete(entry.metadata.name);

		// Remove from file index
		const fileSet = this.fileIndex.get(entry.metadata.filePath);
		if (fileSet) {
			fileSet.delete(entry.id);
			if (fileSet.size === 0) {
				this.fileIndex.delete(entry.metadata.filePath);
			}
		}

		// Remove from type index
		const typeSet = this.typeIndex.get(entry.metadata.schemaType);
		if (typeSet) {
			typeSet.delete(entry.id);
			if (typeSet.size === 0) {
				this.typeIndex.delete(entry.metadata.schemaType);
			}
		}

		// Remove from tag index
		entry.metadata.tags?.forEach((tag) => {
			const tagSet = this.tagIndex.get(tag);
			if (tagSet) {
				tagSet.delete(entry.id);
				if (tagSet.size === 0) {
					this.tagIndex.delete(tag);
				}
			}
		});
	}
}

/**
 * Create ZodKit registry instance
 */
export function createRegistry(): ZodKitRegistry {
	return new ZodKitRegistry();
}

export default ZodKitRegistry;
