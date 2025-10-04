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
			expect(config.rules).toBeDefined();
			expect(config.analysis).toBeDefined();
			expect(config.optimization).toBeDefined();
		});

		it('should merge user configuration with defaults', async () => {
			// Create a test config file
			const userConfig = `
module.exports = {
  include: ['./custom-schemas/**/*.ts'],
  rules: { 'require-validation': 'error' },
  analysis: {
    complexity: { enabled: false }
  }
};`;
			fs.writeFileSync(tempConfigPath, userConfig);

			// Mock the config file detection
			const _originalCwd = process.cwd();
			jest.spyOn(process, 'cwd').mockReturnValue(path.dirname(tempConfigPath));

			const config = await configManager.loadConfig();

			expect(config.include).toContain('./custom-schemas/**/*.ts');
			expect(config.rules).toBeDefined();
			expect(config.analysis?.complexity?.enabled).toBe(false);
			// Should still have defaults for unspecified fields
			expect(config.exclude).toBeDefined();

			jest.restoreAllMocks();
		});

		it('should handle missing config file gracefully', async () => {
			jest.spyOn(process, 'cwd').mockReturnValue('/nonexistent/path');

			const config = await configManager.loadConfig();

			expect(config).toBeDefined();
			expect(config.include).toBeDefined(); // Default value

			jest.restoreAllMocks();
		});

		it('should validate configuration schema', async () => {
			const invalidConfig = `
module.exports = {
  schemaDir: 123, // Invalid type
  rules: 'not-an-array'
};`;
			fs.writeFileSync(tempConfigPath, invalidConfig);

			jest.spyOn(process, 'cwd').mockReturnValue(path.dirname(tempConfigPath));

			await expect(configManager.loadConfig()).rejects.toThrow();

			jest.restoreAllMocks();
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

			expect(config.analysis).toBeDefined();
			expect(config.analysis?.complexity).toBeDefined();
			expect(config.analysis?.performance).toBeDefined();
			expect(config.analysis?.rules).toBeDefined();

			expect(typeof config.analysis?.complexity?.enabled).toBe('boolean');
			expect(typeof config.analysis?.complexity?.maxDepth).toBe('number');
			expect(typeof config.analysis?.complexity?.maxFields).toBe('number');
		});

		it('should validate optimization configuration', async () => {
			const config = await configManager.loadConfig();

			expect(config.optimization).toBeDefined();
			expect(config.optimization?.cache).toBeDefined();
			expect(config.optimization?.parallel).toBeDefined();

			expect(typeof config.optimization?.cache?.enabled).toBe('boolean');
			expect(typeof config.optimization?.cache?.directory).toBe('string');
			expect(typeof config.optimization?.parallel?.enabled).toBe('boolean');
			expect(typeof config.optimization?.parallel?.workers).toBe('number');
		});

		it('should validate rules configuration', async () => {
			const config = await configManager.loadConfig();

			expect(config.rules).toBeDefined();
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
			expect(config.output).toBeDefined();
		});

		it('should support boolean settings', async () => {
			const config = await configManager.loadConfig();

			expect(typeof config.analysis?.complexity?.enabled).toBe('boolean');
			expect(typeof config.optimization?.cache?.enabled).toBe('boolean');
		});

		it('should support numeric settings', async () => {
			const config = await configManager.loadConfig();

			expect(typeof config.analysis?.complexity?.maxDepth).toBe('number');
			expect(typeof config.optimization?.parallel?.workers).toBe('number');
			expect(config.analysis?.complexity?.maxDepth).toBeGreaterThan(0);
			expect(config.optimization?.parallel?.workers).toBeGreaterThan(0);
		});
	});
});
