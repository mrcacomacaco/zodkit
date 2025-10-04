/**
 * @fileoverview Metadata Module - Schema metadata management
 * @module Metadata
 */

export { ZodKitRegistry, createRegistry } from './registry';
export { MetadataCollector, createCollector } from './collector';
export type {
	SchemaMetadata,
	TSDocMetadata,
	RegistryEntry,
	QueryOptions,
	UpdateOptions,
} from './types';
