/**
 * @fileoverview Configuration presets for different use cases
 * @module ConfigPresets
 */

import { GlobalOptions } from '../cli/global-options';

/**
 * Predefined configuration presets for common workflows
 */
export interface ConfigPreset {
  name: string;
  description: string;
  options: Partial<GlobalOptions>;
  commands?: Record<string, any>;
}

/**
 * Available configuration presets
 */
export const ConfigPresets: Record<string, ConfigPreset> = {
  // Development workflow
  development: {
    name: 'Development',
    description: 'Fast iteration with detailed feedback',
    options: {
      verbose: true,
      watch: true,
      backup: true,
      interactive: true,
      format: 'console'
    },
    commands: {
      check: { coverage: true, performance: true },
      hint: { fix: true, severity: 'warning' },
      scaffold: { patterns: true, twoWay: true }
    }
  },

  // Production deployment
  production: {
    name: 'Production',
    description: 'Strict validation for production deployment',
    options: {
      quiet: true,
      strict: true,
      backup: false,
      force: false,
      format: 'json'
    },
    commands: {
      check: { strict: true, performance: true, unused: true },
      hint: { severity: 'error' },
      test: { bail: true, iterations: 1000 }
    }
  },

  // Continuous Integration
  ci: {
    name: 'CI/CD',
    description: 'Optimized for continuous integration pipelines',
    options: {
      json: true,
      quiet: true,
      strict: true,
      parallel: true,
      timeout: 30000
    },
    commands: {
      check: { strict: true, coverage: true },
      test: { bail: true, parallel: true },
      hint: { severity: 'error', rules: 'critical' }
    }
  },

  // Fast iteration
  fast: {
    name: 'Fast',
    description: 'Speed-optimized for rapid development',
    options: {
      parallel: true,
      backup: false,
      quiet: true,
      force: true
    },
    commands: {
      check: { complexity: false, performance: false },
      hint: { fix: true, severity: 'error' },
      scaffold: { incremental: true }
    }
  },

  // Safe refactoring
  safe: {
    name: 'Safe',
    description: 'Maximum safety for refactoring operations',
    options: {
      backup: true,
      strict: true,
      dryRun: true,
      interactive: true,
      verbose: true
    },
    commands: {
      migrate: { strategy: 'gradual', validate: true, rollback: true },
      refactor: { backup: true, interactive: true },
      compose: { validate: true, dryRun: true }
    }
  },

  // Learning/exploration
  learning: {
    name: 'Learning',
    description: 'Educational mode with detailed explanations',
    options: {
      verbose: true,
      interactive: true,
      format: 'console'
    },
    commands: {
      check: { coverage: true, complexity: true, performance: true },
      explain: { relationships: true, usage: true, examples: true },
      hint: { severity: 'info' }
    }
  },

  // Performance optimization
  performance: {
    name: 'Performance',
    description: 'Focus on performance analysis and optimization',
    options: {
      parallel: true,
      format: 'table'
    },
    commands: {
      profile: { runtime: true, monitoring: true, iterations: 10000 },
      hint: { performance: true, fix: true },
      check: { performance: true, complexity: true }
    }
  },

  // Large codebase
  enterprise: {
    name: 'Enterprise',
    description: 'Optimized for large enterprise codebases',
    options: {
      parallel: true,
      timeout: 300000, // 5 minutes
      format: 'json',
      backup: true
    },
    commands: {
      check: { coverage: true, unused: true, duplicates: true },
      profile: { monitoring: true },
      migrate: { strategy: 'gradual', phases: 5 }
    }
  }
};

/**
 * Apply a configuration preset
 */
export function applyPreset(presetName: string): Partial<GlobalOptions> {
  const preset = ConfigPresets[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(ConfigPresets).join(', ')}`);
  }

  return preset.options;
}

/**
 * Get command-specific options from a preset
 */
export function getPresetCommandOptions(presetName: string, commandName: string): any {
  const preset = ConfigPresets[presetName];
  if (!preset?.commands?.[commandName]) {
    return {};
  }

  return preset.commands[commandName];
}

/**
 * List available presets
 */
export function listPresets(): Array<{ name: string; description: string }> {
  return Object.entries(ConfigPresets).map(([key, preset]) => ({
    name: key,
    description: preset.description
  }));
}

/**
 * Create a custom preset
 */
export function createCustomPreset(
  name: string,
  description: string,
  options: Partial<GlobalOptions>,
  commands?: Record<string, any>
): ConfigPreset {
  return {
    name,
    description,
    options,
    commands
  };
}

/**
 * Merge multiple presets
 */
export function mergePresets(...presetNames: string[]): Partial<GlobalOptions> {
  const mergedOptions: Partial<GlobalOptions> = {};

  for (const presetName of presetNames) {
    const presetOptions = applyPreset(presetName);
    Object.assign(mergedOptions, presetOptions);
  }

  return mergedOptions;
}