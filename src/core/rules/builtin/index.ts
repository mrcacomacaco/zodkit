/**
 * @fileoverview Built-in Analysis Rules
 * @module BuiltinRules
 */

export * from './require-description';
export * from './prefer-meta';
export * from './no-any-type';
export * from './prefer-discriminated-union';

/**
 * All built-in rules registry
 */
export const builtinRules = {
	'require-description': () => import('./require-description'),
	'prefer-meta': () => import('./prefer-meta'),
	'no-any-type': () => import('./no-any-type'),
	'prefer-discriminated-union': () => import('./prefer-discriminated-union'),
};

/**
 * Default rule configuration
 */
export const defaultRuleConfig = {
	'require-description': { enabled: true, severity: 'error', autoFix: false },
	'prefer-meta': { enabled: true, severity: 'info', autoFix: false },
	'no-any-type': { enabled: true, severity: 'error', autoFix: false },
	'prefer-discriminated-union': { enabled: true, severity: 'info', autoFix: false },
};
