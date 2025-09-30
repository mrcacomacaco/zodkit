/**
 * @fileoverview Unified Configuration System
 * @module Config
 *
 * Consolidated configuration system supporting multiple config file formats
 * with intelligent defaults and comprehensive validation.
 *
 * Replaces: unified-config-system.ts, unified-config.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

// === SCHEMA DEFINITIONS ===

const RuleSeverity = z.enum(['error', 'warn', 'off']);

const PatternConfig = z.object({
  patterns: z.array(z.string()),
  exclude: z.array(z.string()).optional()
});

const RulesConfig = z.object({
  // Core validation rules
  'require-validation': RuleSeverity.default('error'),
  'no-any-types': RuleSeverity.default('error'),
  'no-empty-schema': RuleSeverity.default('error'),
  'validate-external-data': RuleSeverity.default('error'),

  // Quality rules
  'prefer-strict-schemas': RuleSeverity.default('warn'),
  'use-descriptive-names': RuleSeverity.default('warn'),
  'no-unused-schemas': RuleSeverity.default('warn'),
  'prefer-specific-types': RuleSeverity.default('warn'),

  // Performance rules
  'no-expensive-parsing': RuleSeverity.default('warn'),
  'use-efficient-transforms': RuleSeverity.default('warn'),

  // Security rules
  'no-eval-in-schemas': RuleSeverity.default('error'),
  'no-prototype-pollution': RuleSeverity.default('error'),

  // Additional rules
  'no-unsafe-coercion': RuleSeverity.default('warn'),
  'no-any-fallback': RuleSeverity.default('error')
}).partial();

const OutputConfig = z.object({
  format: z.enum(['pretty', 'json', 'junit', 'sarif']).default('pretty'),
  file: z.string().optional(),
  verbose: z.boolean().default(false),
  showSuccessful: z.boolean().default(false)
}).partial();

const CacheConfig = z.object({
  enabled: z.boolean().default(true),
  directory: z.string().default('.zodkit/cache'),
  ttl: z.number().default(300000), // 5 minutes
  maxSize: z.number().default(100) // MB
}).partial();

const OptimizationConfig = z.object({
  cache: CacheConfig.optional(),
  parallel: z.object({
    enabled: z.boolean().default(true),
    workers: z.number().default(4)
  }).optional()
}).partial();

const AnalysisConfig = z.object({
  complexity: z.object({
    enabled: z.boolean().default(true),
    maxDepth: z.number().default(10),
    maxFields: z.number().default(50)
  }).optional(),
  performance: z.object({
    enabled: z.boolean().default(true),
    maxTime: z.number().default(5000)
  }).optional(),
  rules: RulesConfig.optional()
}).partial();

const HotReloadConfig = z.object({
  enabled: z.boolean().default(false),
  patterns: z.array(z.string()).default(['**/*.ts', '**/*.js']),
  ignored: z.array(z.string()).default([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.d.ts'
  ]),
  debounceMs: z.number().default(100)
}).partial();

// === UNIFIED CONFIGURATION SCHEMA ===

export const ConfigSchema = z.object({
  // Basic project info
  name: z.string().optional(),
  version: z.string().optional(),

  // Schema detection patterns
  include: z.array(z.string()).default([
    './src/**/*.ts',
    './lib/**/*.ts',
    './types/**/*.ts',
    './**/*.{ts,tsx,js,jsx}'
  ]),
  exclude: z.array(z.string()).default([
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.d.ts',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**'
  ]),

  // Schema configuration
  schemas: PatternConfig.optional(),

  // Target-specific configurations
  targets: z.object({
    mdx: PatternConfig.optional(),
    components: PatternConfig.optional(),
    api: PatternConfig.optional()
  }).optional().default({}),

  // Rules configuration
  rules: RulesConfig.optional(),

  // Output and reporting
  output: OutputConfig.optional(),

  // Hot reload settings
  hotReload: HotReloadConfig.optional(),

  // Optimization settings
  optimization: OptimizationConfig.optional(),

  // Analysis settings
  analysis: AnalysisConfig.optional(),

  // Plugin configuration
  plugins: z.array(z.union([
    z.string(),
    z.object({
      name: z.string(),
      options: z.record(z.string(), z.unknown()).optional()
    })
  ])).optional().default([]),

  // Advanced options
  tsconfig: z.string().optional(),
  strict: z.boolean().default(false),
  bail: z.boolean().default(false)
});

export type Config = z.infer<typeof ConfigSchema>;
export type RuleSeverityType = z.infer<typeof RuleSeverity>;

// === CONFIGURATION MANAGER ===

export class ConfigManager {
  private static instance: ConfigManager;
  private cachedConfig: Config | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from file or use defaults
   */
  async loadConfig(configPath?: string): Promise<Config> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const configFile = this.findConfigFile(configPath);
    let userConfig: Partial<Config> = {};

    if (configFile) {
      try {
        // Try JSON first
        if (configFile.endsWith('.json')) {
          const content = readFileSync(configFile, 'utf-8');
          userConfig = JSON.parse(content);
        } else {
          // Try dynamic import for JS/TS
          const configModule = await import(configFile);
          userConfig = configModule.default || configModule;
        }
      } catch (error) {
        console.warn(`Warning: Could not load config from ${configFile}`);
        console.warn(error instanceof Error ? error.message : String(error));
      }
    }

    // Parse and validate with defaults
    this.cachedConfig = ConfigSchema.parse(userConfig);
    return this.cachedConfig;
  }

  /**
   * Get current config (must call loadConfig first)
   */
  getConfig(): Config {
    if (!this.cachedConfig) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return this.cachedConfig;
  }

  /**
   * Find configuration file in standard locations
   */
  private findConfigFile(providedPath?: string): string | null {
    if (providedPath && existsSync(providedPath)) {
      return resolve(providedPath);
    }

    const configFiles = [
      'zodkit.config.js',
      'zodkit.config.ts',
      'zodkit.config.json',
      '.zodkitrc.js',
      '.zodkitrc.ts',
      '.zodkitrc.json',
      '.zodkitrc'
    ];

    for (const file of configFiles) {
      const fullPath = resolve(process.cwd(), file);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Clear cached configuration
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Merge user config with defaults
   */
  mergeConfig(userConfig: Partial<Config>): Config {
    const defaultConfig = ConfigSchema.parse({});
    return ConfigSchema.parse({ ...defaultConfig, ...userConfig });
  }

  /**
   * Get infrastructure-compatible config
   * For compatibility with Infrastructure class
   */
  async getInfrastructureConfig(): Promise<any> {
    const config = await this.loadConfig();
    return {
      include: config.include,
      exclude: config.exclude,
      cache: config.optimization?.cache,
      parallel: config.optimization?.parallel,
      hotReload: config.hotReload,
      analysis: config.analysis
    };
  }

  /**
   * Get preset configurations
   */
  static getPreset(preset: 'strict' | 'recommended' | 'minimal'): Partial<Config> {
    switch (preset) {
      case 'strict':
        return {
          strict: true,
          rules: {
            'require-validation': 'error',
            'no-any-types': 'error',
            'no-empty-schema': 'error',
            'validate-external-data': 'error',
            'prefer-strict-schemas': 'error',
            'use-descriptive-names': 'error',
            'no-unused-schemas': 'error',
            'prefer-specific-types': 'error',
            'no-expensive-parsing': 'error',
            'use-efficient-transforms': 'error',
            'no-eval-in-schemas': 'error',
            'no-prototype-pollution': 'error',
            'no-unsafe-coercion': 'error',
            'no-any-fallback': 'error'
          }
        };

      case 'recommended':
        return ConfigSchema.parse({});

      case 'minimal':
        return {
          rules: {
            'require-validation': 'error',
            'no-any-types': 'warn',
            'validate-external-data': 'error',
            'no-eval-in-schemas': 'error',
            'no-prototype-pollution': 'error'
          }
        };

      default:
        return {};
    }
  }
}

// === EXPORTS ===

// Singleton instance
export const configManager = ConfigManager.getInstance();

// Unified config alias for compatibility
export const unifiedConfig = configManager;

// Convenience functions
export const loadConfig = async (configPath?: string): Promise<Config> => {
  return configManager.loadConfig(configPath);
};

export const getConfig = (): Config => {
  return configManager.getConfig();
};

export const clearConfigCache = (): void => {
  configManager.clearCache();
};

// Default export
export default ConfigManager;