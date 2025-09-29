/**
 * @fileoverview Unified Configuration System
 * @module UnifiedConfig
 *
 * Bridges the gap between ConfigManager and Infrastructure configs
 * Provides a single source of truth for all zodkit configuration
 */

import { z } from 'zod';
import { Config as BaseConfig } from './config';

// === UNIFIED CONFIGURATION SCHEMA ===

const UnifiedConfigSchema = z.object({
  // Schema Detection (from ConfigManager)
  include: z.array(z.string()).default([
    './src/**/*.ts',
    './lib/**/*.ts',
    './types/**/*.ts'
  ]),
  exclude: z.array(z.string()).default([
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.d.ts',
    '**/node_modules/**'
  ]),

  // Rules (from ConfigManager)
  rules: z.object({
    'require-validation': z.enum(['error', 'warn', 'off']).default('error'),
    'no-any-types': z.enum(['error', 'warn', 'off']).default('error'),
    'no-empty-schema': z.enum(['error', 'warn', 'off']).default('error'),
    'validate-external-data': z.enum(['error', 'warn', 'off']).default('error'),
    'prefer-strict-schemas': z.enum(['error', 'warn', 'off']).default('warn'),
    'use-descriptive-names': z.enum(['error', 'warn', 'off']).default('warn'),
    'no-unused-schemas': z.enum(['error', 'warn', 'off']).default('warn'),
    'prefer-specific-types': z.enum(['error', 'warn', 'off']).default('warn'),
    'no-expensive-parsing': z.enum(['error', 'warn', 'off']).default('warn'),
    'use-efficient-transforms': z.enum(['error', 'warn', 'off']).default('warn'),
    'no-eval-in-schemas': z.enum(['error', 'warn', 'off']).default('error'),
    'no-prototype-pollution': z.enum(['error', 'warn', 'off']).default('error')
  }).optional().default({
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
    'no-prototype-pollution': 'error'
  }),

  // Targets (from ConfigManager)
  targets: z.object({
    api: z.array(z.string()).default(['./pages/api/**/*.ts', './src/api/**/*.ts']),
    components: z.array(z.string()).default(['./components/**/*.tsx', './src/**/*.tsx']),
    content: z.array(z.string()).default(['./content/**/*.mdx'])
  }).optional().default({
    api: ['./pages/api/**/*.ts', './src/api/**/*.ts'],
    components: ['./components/**/*.tsx', './src/**/*.tsx'],
    content: ['./content/**/*.mdx']
  }),

  // Output (from ConfigManager)
  output: z.object({
    format: z.enum(['pretty', 'json', 'junit', 'sarif']).default('pretty'),
    file: z.string().optional(),
    verbose: z.boolean().default(false)
  }).optional().default({
    format: 'pretty',
    verbose: false
  }),

  // Infrastructure Settings (from Infrastructure)
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(3600000), // 1 hour
    directory: z.string().default('.zodkit/cache')
  }).optional().default({
    enabled: true,
    ttl: 3600000,
    directory: '.zodkit/cache'
  }),

  discovery: z.object({
    patterns: z.array(z.string()).default([
      '**/*.schema.ts',
      '**/*schema.ts',
      '**/*.zod.ts',
      '**/schemas/**/*.ts',
      '**/types/**/*.ts',
      '**/models/**/*.ts'
    ]),
    exclude: z.array(z.string()).default([
      'node_modules/**',
      'dist/**',
      '.git/**',
      'coverage/**'
    ]),
    depth: z.number().default(10)
  }).optional().default({
    patterns: [
      '**/*.schema.ts',
      '**/*schema.ts',
      '**/*.zod.ts',
      '**/schemas/**/*.ts',
      '**/types/**/*.ts',
      '**/models/**/*.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.git/**',
      'coverage/**'
    ],
    depth: 10
  }),

  parallel: z.object({
    workers: z.number().default(4),
    timeout: z.number().default(30000)
  }).default(() => ({ workers: 4, timeout: 30000 })),

  mcp: z.object({
    port: z.number().default(3456),
    auth: z.string().optional(),
    exposeFixes: z.boolean().default(false)
  }).default(() => ({ port: 3456, exposeFixes: false })),

  monitoring: z.object({
    enabled: z.boolean().default(false),
    interval: z.number().default(60000),
    metrics: z.array(z.string()).default(['memory', 'cpu', 'schemas'])
  }).default(() => ({ enabled: false, interval: 60000, metrics: ['memory', 'cpu', 'schemas'] }))
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

// === CONFIGURATION ADAPTER ===

export class ConfigAdapter {
  /**
   * Transform legacy ConfigManager config to unified format
   */
  static fromLegacy(legacyConfig: BaseConfig): UnifiedConfig {
    return UnifiedConfigSchema.parse({
      // Map ConfigManager fields
      include: legacyConfig.include,
      exclude: legacyConfig.exclude,
      rules: legacyConfig.rules,
      targets: legacyConfig.targets,
      output: legacyConfig.output,

      // Add Infrastructure defaults with smart mapping
      discovery: {
        patterns: legacyConfig.include || UnifiedConfigSchema.parse({}).discovery.patterns,
        exclude: legacyConfig.exclude || UnifiedConfigSchema.parse({}).discovery.exclude,
        depth: 10
      },
      cache: {
        enabled: true,
        ttl: 3600000,
        directory: '.zodkit/cache'
      },
      parallel: {
        workers: 4,
        timeout: 30000
      },
      mcp: {
        port: 3456,
        exposeFixes: false
      },
      monitoring: {
        enabled: false,
        interval: 60000,
        metrics: ['memory', 'cpu', 'schemas']
      }
    });
  }

  /**
   * Extract Infrastructure config from unified config
   */
  static toInfrastructureConfig(unified: UnifiedConfig) {
    return {
      cache: unified.cache,
      discovery: unified.discovery,
      parallel: unified.parallel,
      mcp: {
        port: unified.mcp.port,
        exposeFixes: unified.mcp.exposeFixes,
        ...(unified.mcp.auth && { auth: unified.mcp.auth })
      },
      monitoring: unified.monitoring
    };
  }

  /**
   * Extract ConfigManager config from unified config
   */
  static toConfigManagerConfig(unified: UnifiedConfig): BaseConfig {
    return {
      include: unified.include,
      exclude: unified.exclude,
      rules: unified.rules,
      targets: unified.targets,
      output: unified.output
    };
  }
}

// === UNIFIED CONFIG MANAGER ===

export class UnifiedConfigManager {
  private static instance: UnifiedConfigManager;
  private cachedConfig: UnifiedConfig | null = null;

  public static getInstance(): UnifiedConfigManager {
    if (!UnifiedConfigManager.instance) {
      UnifiedConfigManager.instance = new UnifiedConfigManager();
    }
    return UnifiedConfigManager.instance;
  }

  async loadConfig(configPath?: string): Promise<UnifiedConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // Load legacy config using existing ConfigManager
    const { ConfigManager } = await import('./config');
    const legacyManager = ConfigManager.getInstance();
    const legacyConfig = await legacyManager.loadConfig(configPath);

    // Transform to unified format
    this.cachedConfig = ConfigAdapter.fromLegacy(legacyConfig);
    return this.cachedConfig;
  }

  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Get configuration for Infrastructure components
   */
  async getInfrastructureConfig(configPath?: string) {
    const unified = await this.loadConfig(configPath);
    return ConfigAdapter.toInfrastructureConfig(unified);
  }

  /**
   * Get configuration for legacy ConfigManager components
   */
  async getLegacyConfig(configPath?: string) {
    const unified = await this.loadConfig(configPath);
    return ConfigAdapter.toConfigManagerConfig(unified);
  }

  /**
   * Create preset configurations
   */
  static createPreset(preset: 'minimal' | 'standard' | 'complete' | 'enterprise'): Partial<UnifiedConfig> {
    const presets = {
      minimal: {
        rules: {
          'require-validation': 'error' as const,
          'no-any-types': 'warn' as const,
          'no-empty-schema': 'error' as const,
          'validate-external-data': 'error' as const,
          'prefer-strict-schemas': 'warn' as const,
          'use-descriptive-names': 'warn' as const,
          'no-unused-schemas': 'warn' as const,
          'prefer-specific-types': 'warn' as const,
          'no-expensive-parsing': 'warn' as const,
          'use-efficient-transforms': 'warn' as const,
          'no-eval-in-schemas': 'error' as const,
          'no-prototype-pollution': 'error' as const
        },
        cache: { enabled: false, ttl: 3600000, directory: '.zodkit/cache' },
        monitoring: { enabled: false, interval: 60000, metrics: ['memory', 'cpu', 'schemas'] }
      },

      standard: UnifiedConfigSchema.parse({}),

      complete: {
        rules: Object.fromEntries(
          Object.keys(UnifiedConfigSchema.parse({}).rules).map(rule => [rule, 'error'])
        ),
        cache: { enabled: true, ttl: 7200000 }, // 2 hours
        monitoring: { enabled: true },
        parallel: { workers: 8 }
      },

      enterprise: {
        rules: Object.fromEntries(
          Object.keys(UnifiedConfigSchema.parse({}).rules).map(rule => [rule, 'error'])
        ),
        cache: { enabled: true, ttl: 86400000 }, // 24 hours
        monitoring: {
          enabled: true,
          interval: 30000,
          metrics: ['memory', 'cpu', 'schemas', 'performance', 'errors']
        },
        parallel: { workers: 16, timeout: 60000 },
        mcp: { exposeFixes: true }
      }
    };

    return presets[preset] as any;
  }
}

// Export unified config manager instance
export const unifiedConfig = UnifiedConfigManager.getInstance();
export { UnifiedConfigSchema };