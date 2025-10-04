/**
 * @fileoverview Metadata Types
 * @module Metadata/Types
 */

import type { ZodSchemaInfo } from '../ast/extractor';

// === SCHEMA METADATA ===

export interface SchemaMetadata {
	id: string;
	name: string;
	filePath: string;
	line: number;
	column: number;
	schemaType: string;
	description?: string;
	title?: string;
	examples?: unknown[];
	deprecated?: boolean;
	tags?: string[];
	category?: string;
	version?: string;
	author?: string;
	custom?: Record<string, unknown>;
	tsDoc?: TSDocMetadata;
	zodMeta?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

export interface TSDocMetadata {
	summary?: string;
	description?: string;
	remarks?: string;
	examples?: string[];
	see?: string[];
	since?: string;
	deprecated?: string;
	tags?: Record<string, string>;
}

// === REGISTRY ENTRY ===

export interface RegistryEntry {
	id: string;
	metadata: SchemaMetadata;
	schema: ZodSchemaInfo;
	references: string[]; // IDs of schemas this one references
	referencedBy: string[]; // IDs of schemas that reference this one
}

// === QUERY & FILTER ===

export interface QueryOptions {
	name?: string;
	filePath?: string;
	schemaType?: string;
	tags?: string[];
	category?: string;
	deprecated?: boolean;
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'filePath';
	sortOrder?: 'asc' | 'desc';
}

export interface UpdateOptions {
	merge?: boolean; // Merge with existing metadata or replace
}
