/**
 * @fileoverview Unified Configuration System
 * @module UnifiedConfigSystem
 *
 * Consolidates all configuration systems into a single, coherent system
 * that supports multiple config file formats and provides intelligent defaults.
 */

import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// === CORE CONFIGURATION SCHEMA ===

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

  // Additional rules for compatibility
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
});

const OptimizationConfig = z.object({
  cache: CacheConfig.optional().default({
    enabled: true,
    directory: '.zodkit/cache',
    ttl: 300000,
    maxSize: 100
  }),
  parallel: z.object({
    enabled: z.boolean().default(true),
    workers: z.number().default(4)
  }).optional().default({
    enabled: true,
    workers: 4
  })
});

const AnalysisConfig = z.object({
  complexity: z.object({
    enabled: z.boolean().default(true),
    maxDepth: z.number().default(10),
    maxFields: z.number().default(50)
  }).optional().default({
    enabled: true,
    maxDepth: 10,
    maxFields: 50
  }),
  performance: z.object({
    enabled: z.boolean().default(true),
    maxTime: z.number().default(5000)
  }).optional().default({
    enabled: true,
    maxTime: 5000
  }),
  rules: RulesConfig.optional(),
  api: z.object({
    enabled: z.boolean().default(true),
    strict: z.boolean().default(false)
  }).optional().default({
    enabled: true,
    strict: false
  })
});

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
});

// === UNIFIED CONFIGURATION SCHEMA ===

export const UnifiedConfigSchema = z.object({
  // Basic project info
  name: z.string().optional(),
  version: z.string().optional(),

  // Schema detection patterns (unified from all systems)
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

  // Schema configuration (from zodkit.config.js)
  schemas: PatternConfig.optional(),

  // Target-specific configurations
  targets: z.object({
    mdx: PatternConfig.optional(),
    components: PatternConfig.optional(),
    api: PatternConfig.optional()
  }).default({}),

  // Rules configuration (consolidated)
  rules: RulesConfig.optional(),

  // Output configuration
  output: OutputConfig.optional(),

  // Analysis configuration
  analysis: AnalysisConfig.optional(),

  // Optimization configuration
  optimization: OptimizationConfig.optional(),

  // Hot reload configuration
  hotReload: HotReloadConfig.optional(),

  // Legacy zodkit field for backward compatibility
  zodkit: z.object({
    schemaDir: z.string().default('./schemas'),
    outputDir: z.string().default('./generated'),
    rules: z.array(z.string()).default(['recommended'])
  }).optional()
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

// === PRESET CONFIGURATIONS ===

export const ConfigPresets = {
  development: {
    output: { verbose: true, showSuccessful: true },
    hotReload: { enabled: true },
    optimization: { cache: { enabled: true } },
    analysis: {
      complexity: { enabled: true },
      performance: { enabled: true }
    }
  },

  production: {
    output: { format: 'json' as const, verbose: false },
    hotReload: { enabled: false },
    rules: {
      'require-validation': 'error' as const,
      'no-any-types': 'error' as const,
      'prefer-strict-schemas': 'error' as const
    }
  },

  ci: {
    output: { format: 'junit' as const, verbose: false },
    hotReload: { enabled: false },
    optimization: { cache: { enabled: false } }
  },

  strict: {
    rules: {
      'require-validation': 'error' as const,
      'no-any-types': 'error' as const,
      'no-empty-schema': 'error' as const,
      'prefer-strict-schemas': 'error' as const,
      'use-descriptive-names': 'error' as const
    }
  }
} as const;

// === CONFIGURATION MANAGER ===

export class UnifiedConfigManager {
  private cachedConfig: UnifiedConfig | null = null;

  /**
   * Load configuration from multiple sources with precedence order:
   * 1. zodkit.config.js (most specific)
   * 2. zodkit.config.json
   * 3. package.json zodkit field
   * 4. Default configuration
   */
  async load(basePath: string = process.cwd()): Promise<UnifiedConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    let userConfig: Partial<UnifiedConfig & { preset?: string }> = {};

    // Try zodkit.config.js
    const jsConfigPath = resolve(basePath, 'zodkit.config.js');
    if (existsSync(jsConfigPath)) {
      try {
        delete require.cache[jsConfigPath];
        const configModule = require(jsConfigPath);
        userConfig = configModule.default || configModule;
      } catch (error) {
        console.warn(`Warning: Could not load config from ${jsConfigPath}:`, error);
      }
    }

    // Try zodkit.config.json if no JS config
    if (Object.keys(userConfig).length === 0) {
      const jsonConfigPath = resolve(basePath, 'zodkit.config.json');
      if (existsSync(jsonConfigPath)) {
        try {
          const fileContent = readFileSync(jsonConfigPath, 'utf-8');
          const configContent = JSON.parse(fileContent);
          userConfig = configContent.zodkit ? { ...configContent.zodkit, ...configContent } : configContent;
        } catch (error) {
          console.warn(`Warning: Could not load config from ${jsonConfigPath}:`, error);
        }
      }
    }

    // Try package.json zodkit field if no dedicated config
    if (Object.keys(userConfig).length === 0) {
      const packageJsonPath = resolve(basePath, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = require(packageJsonPath);
          if (packageJson.zodkit) {
            userConfig = packageJson.zodkit;
          }
        } catch (error) {
          console.warn(`Warning: Could not read package.json from ${packageJsonPath}:`, error);
        }
      }
    }

    // Apply preset if specified
    if (userConfig.preset && typeof userConfig.preset === 'string') {
      const preset = ConfigPresets[userConfig.preset as keyof typeof ConfigPresets];
      if (preset) {
        userConfig = this.mergeConfigs(preset, userConfig);
      }
    }

    // Parse and validate with defaults
    const baseConfig = {
      include: ['./src/**/*.ts', './lib/**/*.ts', './types/**/*.ts', './**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**'],
      targets: {},
      rules: {
        'require-validation': 'error',
        'no-any-types': 'error',
        'no-empty-schema': 'error',
        'validate-external-data': 'error',
        'prefer-strict-schemas': 'warn',
        'use-descriptive-names': 'warn',
        'no-unused-schemas': 'warn',
        'prefer-specific-types': 'warn',
        'no-expensive-parsing': 'warn',
        'use-efficient-transforms': 'warn',
        'no-eval-in-schemas': 'error',
        'no-prototype-pollution': 'error',
        'no-unsafe-coercion': 'warn',
        'no-any-fallback': 'error'
      },
      output: {
        format: 'pretty',
        verbose: false,
        showSuccessful: false
      },
      analysis: {
        complexity: { enabled: true, maxDepth: 10, maxFields: 50 },
        performance: { enabled: true, maxTime: 5000 },
        rules: {},
        api: { enabled: true, strict: false }
      },
      optimization: {
        cache: { enabled: true, directory: '.zodkit/cache', ttl: 300000, maxSize: 100 },
        parallel: { enabled: true, workers: 4 }
      },
      hotReload: {
        enabled: false,
        patterns: ['**/*.ts', '**/*.js'],
        ignored: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts'],
        debounceMs: 100
      }
    };

    const mergedConfig = this.mergeConfigs(baseConfig, userConfig);
    this.cachedConfig = UnifiedConfigSchema.parse(mergedConfig);
    return this.cachedConfig;
  }

  /**
   * Get effective patterns for schema discovery
   */
  getSchemaPatterns(config: UnifiedConfig): string[] {
    const patterns = new Set<string>();

    // Add include patterns
    config.include.forEach(pattern => patterns.add(pattern));

    // Add schema-specific patterns
    if (config.schemas?.patterns) {
      config.schemas.patterns.forEach(pattern => patterns.add(pattern));
    }

    // Add target-specific patterns
    Object.values(config.targets).forEach(target => {
      if (target?.patterns) {
        target.patterns.forEach(pattern => patterns.add(pattern));
      }
    });

    return Array.from(patterns);
  }

  /**
   * Get effective exclude patterns
   */
  getExcludePatterns(config: UnifiedConfig): string[] {
    const patterns = new Set<string>();

    // Add global exclude patterns
    config.exclude.forEach(pattern => patterns.add(pattern));

    // Add schema-specific exclude patterns
    if (config.schemas?.exclude) {
      config.schemas.exclude.forEach(pattern => patterns.add(pattern));
    }

    // Add target-specific exclude patterns
    Object.values(config.targets).forEach(target => {
      if (target?.exclude) {
        target.exclude.forEach(pattern => patterns.add(pattern));
      }
    });

    return Array.from(patterns);
  }

  /**
   * Apply preset configuration
   */
  applyPreset(config: UnifiedConfig, presetName: keyof typeof ConfigPresets): UnifiedConfig {
    const preset = ConfigPresets[presetName];
    return this.mergeConfigs(config, preset);
  }

  /**
   * Deep merge configurations with proper precedence
   */
  private mergeConfigs(base: any, override: any): any {
    if (typeof override !== 'object' || override === null) {
      return override;
    }

    if (typeof base !== 'object' || base === null) {
      return override;
    }

    const result = { ...base };

    for (const key in override) {
      if (override.hasOwnProperty(key)) {
        if (typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])) {
          result[key] = this.mergeConfigs(result[key] || {}, override[key]);
        } else {
          result[key] = override[key];
        }
      }
    }

    return result;
  }

  /**
   * Invalidate cached configuration
   */
  invalidateCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Get configuration for a specific component
   */
  getComponentConfig(config: UnifiedConfig, component: 'analysis' | 'optimization' | 'hotReload' | 'output'): any {
    return config[component];
  }

  /**
   * Validate configuration
   */
  validate(config: any): { valid: boolean; errors: string[] } {
    try {
      UnifiedConfigSchema.parse(config);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`)
        };
      }
      return { valid: false, errors: [String(error)] };
    }
  }
}

// === EXPORTS ===

export const configManager = new UnifiedConfigManager();

export default {
  UnifiedConfigSchema,
  UnifiedConfigManager,
  ConfigPresets,
  configManager
};