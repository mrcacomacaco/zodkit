/**
 * @fileoverview Shared Core Types
 * @module CoreTypes
 *
 * Shared type definitions used across core modules to prevent circular dependencies.
 */

/**
 * Information about a discovered Zod schema
 */
export interface SchemaInfo {
	name: string;
	exportName?: string;
	filePath: string;
	line: number;
	column: number;
	schemaType: string;
	zodChain?: string;
	properties?: Array<{
		name: string;
		type: string;
		optional: boolean;
		zodValidator?: string;
	}>;
	dependencies?: string[];
	complexity?: number;
}
