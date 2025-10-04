/**
 * @fileoverview Shared Rule Types
 * @module RuleTypes
 */

import type { Fix } from './fixer';

/**
 * Rule violation interface used by all rules
 */
export interface RuleViolation {
	schemaName: string;
	filePath: string;
	line: number;
	column: number;
	message: string;
	severity: 'error' | 'warning' | 'info';
	fix?: Fix;
	suggestions?: string[];
}
