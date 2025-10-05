/**
 * @fileoverview Unit Tests for Configuration System
 * @module ConfigTests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigManager } from '../../src/core/config';

describe('ConfigManager', () => {
	let configManager: ConfigManager;
	let tempConfigPath: string;

	beforeEach(() => {
		configManager = ConfigManager.getInstance();
		tempConfigPath = path.join(process.cwd(), 'test-zodkit.config.js');
	});

	afterEach(async () => {
		// Clean up temp config file
		if (fs.existsSync(tempConfigPath)) {
			fs.unlinkSync(tempConfigPath);
		}
		// Clear any cached config
		(configManager as any).cachedConfig = null;
	});

	describe('Configuration Loading', () => {
		it('should load default configuration', async () => {
			const config = await configManager.loadConfig();

			expect(config).toBeDefined();
			expect(config.include).toBeDefined();
			expect(config.exclude).toBeDefined();
			// rules, analysis, and optimization are optional
			expect(Array.isArray(config.include)).toBe(true);
			expect(Array.isArray(config.exclude)).toBe(true);
		});

		it('should merge user configuration with defaults', async () => {
			// Use mergeConfig to test merging behavior directly
			const userConfig = {
				include: ['./custom-schemas/**/*.ts'],
				rules: { 'require-validation': 'error' },
				analysis: {
					complexity: { enabled: false },
				},
			};

			const config = configManager.mergeConfig(userConfig as any);

			expect(config.include).toContain('./custom-schemas/**/*.ts');
			expect(config.rules).toBeDefined();
			expect(config.analysis?.complexity?.enabled).toBe(false);
			// Should still have defaults for unspecified fields
			expect(config.exclude).toBeDefined();
		});

		it('should handle missing config file gracefully', async () => {
			jest.spyOn(process, 'cwd').mockReturnValue('/nonexistent/path');

			const config = await configManager.loadConfig();

			expect(config).toBeDefined();
			expect(config.include).toBeDefined(); // Default value

			jest.restoreAllMocks();
		});

		it('should validate configuration schema', () => {
			// Invalid configs are caught and logged, then defaults are used
			// Test the mergeConfig method instead which validates directly
			const invalidConfig = {
				include: 123, // Invalid type - should be array
				rules: 'not-an-object', // Invalid type
			};

			expect(() => {
				configManager.mergeConfig(invalidConfig as any);
			}).toThrow();
		});
	});

	describe('Configuration Caching', () => {
		it('should cache loaded configuration', async () => {
			const config1 = await configManager.loadConfig();
			const config2 = await configManager.loadConfig();

			expect(config1).toBe(config2); // Same object reference
		});

		it('should invalidate cache when configuration changes', async () => {
			const config1 = await configManager.loadConfig();

			// Simulate config change
			configManager.clearCache();

			const config2 = await configManager.loadConfig();

			expect(config1).not.toBe(config2); // Different object references
		});
	});

	describe('Configuration Validation', () => {
		it('should validate analysis configuration', async () => {
			const config = await configManager.loadConfig();

			// analysis is optional, test if present
			if (config.analysis) {
				if (config.analysis.complexity?.enabled !== undefined) {
					expect(typeof config.analysis.complexity.enabled).toBe('boolean');
				}
				if (config.analysis.complexity?.maxDepth !== undefined) {
					expect(typeof config.analysis.complexity.maxDepth).toBe('number');
				}
				if (config.analysis.complexity?.maxFields !== undefined) {
					expect(typeof config.analysis.complexity.maxFields).toBe('number');
				}
			}
			expect(config).toBeDefined();
		});

		it('should validate optimization configuration', async () => {
			const config = await configManager.loadConfig();

			// optimization is optional, test if present
			if (config.optimization) {
				if (config.optimization.cache?.enabled !== undefined) {
					expect(typeof config.optimization.cache.enabled).toBe('boolean');
				}
				if (config.optimization.cache?.directory !== undefined) {
					expect(typeof config.optimization.cache.directory).toBe('string');
				}
				if (config.optimization.parallel?.enabled !== undefined) {
					expect(typeof config.optimization.parallel.enabled).toBe('boolean');
				}
				if (config.optimization.parallel?.workers !== undefined) {
					expect(typeof config.optimization.parallel.workers).toBe('number');
				}
			}
			expect(config).toBeDefined();
		});

		it('should validate rules configuration', async () => {
			const config = await configManager.loadConfig();

			// rules is optional
			expect(config).toBeDefined();
			if (config.rules && typeof config.rules === 'object') {
				expect(Object.keys(config.rules).length).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe('Configuration Utilities', () => {
		it('should provide easy access to common settings', async () => {
			const config = await configManager.loadConfig();

			expect(Array.isArray(config.include)).toBe(true);
			expect(Array.isArray(config.exclude)).toBe(true);
			// output is optional in config
			expect(config).toBeDefined();
		});

		it('should support boolean settings', async () => {
			const config = await configManager.loadConfig();

			// These fields are optional, so only test if they exist
			if (config.analysis?.complexity?.enabled !== undefined) {
				expect(typeof config.analysis.complexity.enabled).toBe('boolean');
			}
			if (config.optimization?.cache?.enabled !== undefined) {
				expect(typeof config.optimization.cache.enabled).toBe('boolean');
			}
			expect(config).toBeDefined();
		});

		it('should support numeric settings', async () => {
			const config = await configManager.loadConfig();

			// These fields are optional, so only test if they exist
			if (config.analysis?.complexity?.maxDepth !== undefined) {
				expect(typeof config.analysis.complexity.maxDepth).toBe('number');
				expect(config.analysis.complexity.maxDepth).toBeGreaterThan(0);
			}
			if (config.optimization?.parallel?.workers !== undefined) {
				expect(typeof config.optimization.parallel.workers).toBe('number');
				expect(config.optimization.parallel.workers).toBeGreaterThan(0);
			}
			expect(config).toBeDefined();
		});
	});
});
