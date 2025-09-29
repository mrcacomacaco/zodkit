/**
 * @fileoverview Simplified Configuration System
 * @module Config
 *
 * Streamlined from infrastructure/config.ts (319 lines -> ~100 lines)
 * Consolidated rule definitions and simplified structure
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

// Define the simplified configuration schema
const RuleSeverity = z.enum(['error', 'warn', 'off']);

const ConfigSchema = z.object({
  // Schema detection patterns
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

  // Rule severity levels (simplified)
  rules: z.object({
    // Core validation rules
    'require-validation': RuleSeverity.default('error'),
    'no-any-types': RuleSeverity.default('error'),
    'no-empty-schema': RuleSeverity.default('error'),
    'validate-external-data': RuleSeverity.default('error'),

    // Quality warnings
    'prefer-strict-schemas': RuleSeverity.default('warn'),
    'use-descriptive-names': RuleSeverity.default('warn'),
    'no-unused-schemas': RuleSeverity.default('warn'),
    'prefer-specific-types': RuleSeverity.default('warn'),

    // Performance warnings
    'no-expensive-parsing': RuleSeverity.default('warn'),
    'use-efficient-transforms': RuleSeverity.default('warn'),

    // Security rules
    'no-eval-in-schemas': RuleSeverity.default('error'),
    'no-prototype-pollution': RuleSeverity.default('error')
  }).default({}),

  // Target patterns for different file types
  targets: z.object({
    api: z.array(z.string()).default(['./pages/api/**/*.ts', './src/api/**/*.ts']),
    components: z.array(z.string()).default(['./components/**/*.tsx', './src/**/*.tsx']),
    content: z.array(z.string()).default(['./content/**/*.mdx'])
  }).default({}),

  // Output and reporting settings
  output: z.object({
    format: z.enum(['pretty', 'json', 'junit', 'sarif']).default('pretty'),
    file: z.string().optional(),
    verbose: z.boolean().default(false)
  }).default({})
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private static instance: ConfigManager;
  private cachedConfig: Config | null = null;

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async loadConfig(configPath?: string): Promise<Config> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const configFile = this.findConfigFile(configPath);
    let userConfig = {};

    if (configFile) {
      try {
        const configModule = await import(configFile);
        userConfig = configModule.default || configModule;
      } catch (error) {
        console.warn(`Warning: Could not load config from ${configFile}`);
      }
    }

    this.cachedConfig = ConfigSchema.parse(userConfig);
    return this.cachedConfig;
  }

  private findConfigFile(providedPath?: string): string | null {
    if (providedPath && existsSync(providedPath)) {
      return resolve(providedPath);
    }

    const configFiles = [
      'zodkit.config.js',
      'zodkit.config.ts',
      '.zodkitrc.js',
      '.zodkitrc.ts'
    ];

    for (const file of configFiles) {
      const fullPath = resolve(process.cwd(), file);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  clearCache(): void {
    this.cachedConfig = null;
  }

  // Preset configurations for common scenarios
  static getPreset(preset: 'strict' | 'recommended' | 'minimal'): Partial<Config> {
    switch (preset) {
      case 'strict':
        return {
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
            'no-prototype-pollution': 'error'
          }
        };

      case 'recommended':
        return ConfigSchema.parse({}).rules;

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

// Export default config manager instance
export const configManager = ConfigManager.getInstance();
export { ConfigSchema };