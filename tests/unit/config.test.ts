/**
 * @fileoverview Unit Tests for Configuration System
 * @module ConfigTests
 */

import { ConfigManager } from '../../src/core/config';
import * as path from 'path';
import * as fs from 'fs';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempConfigPath: string;

  beforeEach(() => {
    configManager = new ConfigManager();
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
      const config = await configManager.load();

      expect(config).toBeDefined();
      expect(config.schemaDir).toBe('./schemas');
      expect(config.outputDir).toBe('./generated');
      expect(config.rules).toEqual(['recommended']);
      expect(config.analysis).toBeDefined();
      expect(config.optimization).toBeDefined();
    });

    it('should merge user configuration with defaults', async () => {
      // Create a test config file
      const userConfig = `
module.exports = {
  schemaDir: './custom-schemas',
  rules: ['strict'],
  analysis: {
    complexity: { enabled: false }
  }
};`;
      fs.writeFileSync(tempConfigPath, userConfig);

      // Mock the config file detection
      const originalCwd = process.cwd();
      jest.spyOn(process, 'cwd').mockReturnValue(path.dirname(tempConfigPath));

      const config = await configManager.load();

      expect(config.schemaDir).toBe('./custom-schemas');
      expect(config.rules).toEqual(['strict']);
      expect(config.analysis.complexity.enabled).toBe(false);
      // Should still have defaults for unspecified fields
      expect(config.outputDir).toBe('./generated');

      jest.restoreAllMocks();
    });

    it('should handle missing config file gracefully', async () => {
      jest.spyOn(process, 'cwd').mockReturnValue('/nonexistent/path');

      const config = await configManager.load();

      expect(config).toBeDefined();
      expect(config.schemaDir).toBe('./schemas'); // Default value

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

      await expect(configManager.load()).rejects.toThrow();

      jest.restoreAllMocks();
    });
  });

  describe('Configuration Caching', () => {
    it('should cache loaded configuration', async () => {
      const config1 = await configManager.load();
      const config2 = await configManager.load();

      expect(config1).toBe(config2); // Same object reference
    });

    it('should invalidate cache when configuration changes', async () => {
      const config1 = await configManager.load();

      // Simulate config change
      configManager.invalidateCache();

      const config2 = await configManager.load();

      expect(config1).not.toBe(config2); // Different object references
    });
  });

  describe('Configuration Validation', () => {
    it('should validate analysis configuration', async () => {
      const config = await configManager.load();

      expect(config.analysis).toBeDefined();
      expect(config.analysis.complexity).toBeDefined();
      expect(config.analysis.performance).toBeDefined();
      expect(config.analysis.rules).toBeDefined();
      expect(config.analysis.api).toBeDefined();

      expect(typeof config.analysis.complexity.enabled).toBe('boolean');
      expect(typeof config.analysis.complexity.maxDepth).toBe('number');
      expect(typeof config.analysis.complexity.maxFields).toBe('number');
    });

    it('should validate optimization configuration', async () => {
      const config = await configManager.load();

      expect(config.optimization).toBeDefined();
      expect(config.optimization.cache).toBeDefined();
      expect(config.optimization.parallel).toBeDefined();

      expect(typeof config.optimization.cache.enabled).toBe('boolean');
      expect(typeof config.optimization.cache.directory).toBe('string');
      expect(typeof config.optimization.parallel.enabled).toBe('boolean');
      expect(typeof config.optimization.parallel.workers).toBe('number');
    });

    it('should validate rules configuration', async () => {
      const config = await configManager.load();

      expect(Array.isArray(config.rules)).toBe(true);
      expect(config.rules.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Utilities', () => {
    it('should provide easy access to common settings', async () => {
      const config = await configManager.load();

      expect(typeof config.schemaDir).toBe('string');
      expect(typeof config.outputDir).toBe('string');
      expect(config.schemaDir.length).toBeGreaterThan(0);
      expect(config.outputDir.length).toBeGreaterThan(0);
    });

    it('should support boolean settings', async () => {
      const config = await configManager.load();

      expect(typeof config.analysis.complexity.enabled).toBe('boolean');
      expect(typeof config.optimization.cache.enabled).toBe('boolean');
    });

    it('should support numeric settings', async () => {
      const config = await configManager.load();

      expect(typeof config.analysis.complexity.maxDepth).toBe('number');
      expect(typeof config.optimization.parallel.workers).toBe('number');
      expect(config.analysis.complexity.maxDepth).toBeGreaterThan(0);
      expect(config.optimization.parallel.workers).toBeGreaterThan(0);
    });
  });
});