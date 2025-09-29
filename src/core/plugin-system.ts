/**
 * @fileoverview Plugin system architecture for extensibility
 * @module PluginSystem
 */

import { EventEmitter } from 'events';
import { GlobalOptions } from '../cli/global-options';

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  beforeCommand?: (command: string, options: any) => Promise<void> | void;
  afterCommand?: (command: string, options: any, result: any) => Promise<void> | void;
  onError?: (error: Error, command: string) => Promise<void> | void;
  beforeValidation?: (schema: any, data: any) => Promise<any> | any;
  afterValidation?: (result: any, schema: any, data: any) => Promise<any> | any;
  beforeGeneration?: (source: any, options: any) => Promise<any> | any;
  afterGeneration?: (result: any, source: any, options: any) => Promise<any> | any;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  keywords?: string[];
  dependencies?: string[];
  zodkitVersion?: string;
}

/**
 * Plugin interface
 */
export interface Plugin {
  config: PluginConfig;
  hooks?: PluginHooks;
  commands?: PluginCommand[];
  middleware?: PluginMiddleware[];
  rules?: PluginRule[];
  init?: (context: PluginContext) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

/**
 * Plugin command definition
 */
export interface PluginCommand {
  name: string;
  description: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: any;
  }>;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  action: (args: any[], options: any, context: PluginContext) => Promise<void> | void;
}

/**
 * Plugin middleware for request/response transformation
 */
export interface PluginMiddleware {
  name: string;
  priority: number;
  transform: (data: any, context: PluginContext) => Promise<any> | any;
}

/**
 * Plugin rule for custom validation/analysis
 */
export interface PluginRule {
  name: string;
  category: 'validation' | 'performance' | 'security' | 'style';
  severity: 'error' | 'warning' | 'info';
  check: (schema: any, context: PluginContext) => Promise<any[]> | any[];
  fix?: (schema: any, issues: any[], context: PluginContext) => Promise<any> | any;
}

/**
 * Plugin execution context
 */
export interface PluginContext {
  zodkit: {
    version: string;
    config: any;
    logger: {
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };
  globalOptions: GlobalOptions;
  workingDirectory: string;
  emit: (event: string, data?: any) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
}

/**
 * Plugin registry and manager
 */
export class PluginManager extends EventEmitter {
  private readonly plugins: Map<string, Plugin> = new Map();
  private readonly hooks: Map<keyof PluginHooks, Array<{ plugin: string; handler: Function }>> = new Map();
  private readonly commands: Map<string, { plugin: string; command: PluginCommand }> = new Map();
  private middleware: Array<{ plugin: string; middleware: PluginMiddleware }> = [];
  private readonly rules: Map<string, { plugin: string; rule: PluginRule }> = new Map();

  constructor(private readonly context: Omit<PluginContext, 'emit' | 'on'>) {
    super();
  }

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    const { name } = plugin.config;

    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }

    // Validate plugin
    this.validatePlugin(plugin);

    // Register plugin
    this.plugins.set(name, plugin);

    // Register hooks
    if (plugin.hooks) {
      for (const [hookName, handler] of Object.entries(plugin.hooks)) {
        if (!this.hooks.has(hookName as keyof PluginHooks)) {
          this.hooks.set(hookName as keyof PluginHooks, []);
        }
        this.hooks.get(hookName as keyof PluginHooks)!.push({
          plugin: name,
          handler
        });
      }
    }

    // Register commands
    if (plugin.commands) {
      for (const command of plugin.commands) {
        if (this.commands.has(command.name)) {
          throw new Error(`Command ${command.name} is already registered by another plugin`);
        }
        this.commands.set(command.name, { plugin: name, command });
      }
    }

    // Register middleware
    if (plugin.middleware) {
      for (const middleware of plugin.middleware) {
        this.middleware.push({ plugin: name, middleware });
      }
      // Sort by priority
      this.middleware.sort((a, b) => b.middleware.priority - a.middleware.priority);
    }

    // Register rules
    if (plugin.rules) {
      for (const rule of plugin.rules) {
        if (this.rules.has(rule.name)) {
          throw new Error(`Rule ${rule.name} is already registered by another plugin`);
        }
        this.rules.set(rule.name, { plugin: name, rule });
      }
    }

    // Initialize plugin
    if (plugin.init) {
      await plugin.init({
        ...this.context,
        emit: this.emit.bind(this),
        on: this.on.bind(this)
      });
    }

    this.emit('pluginRegistered', { name, plugin });
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not registered`);
    }

    // Clean up plugin
    if (plugin.destroy) {
      await plugin.destroy();
    }

    // Remove from all registries
    this.plugins.delete(name);

    // Remove hooks
    for (const [hookName, handlers] of this.hooks.entries()) {
      this.hooks.set(hookName, handlers.filter(h => h.plugin !== name));
    }

    // Remove commands
    for (const [commandName, { plugin: pluginName }] of this.commands.entries()) {
      if (pluginName === name) {
        this.commands.delete(commandName);
      }
    }

    // Remove middleware
    this.middleware = this.middleware.filter(m => m.plugin !== name);

    // Remove rules
    for (const [ruleName, { plugin: pluginName }] of this.rules.entries()) {
      if (pluginName === name) {
        this.rules.delete(ruleName);
      }
    }

    this.emit('pluginUnregistered', { name, plugin });
  }

  /**
   * Execute a hook
   */
  async executeHook<K extends keyof PluginHooks>(
    hookName: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    const handlers = this.hooks.get(hookName) || [];

    for (const { handler } of handlers) {
      try {
        await handler(...args);
      } catch (error) {
        this.emit('hookError', { hookName, error });
      }
    }
  }

  /**
   * Get plugin commands for CLI registration
   */
  getPluginCommands(): Array<{ name: string; command: PluginCommand }> {
    return Array.from(this.commands.values()).map(({ command }) => ({
      name: command.name,
      command
    }));
  }

  /**
   * Apply middleware to data
   */
  async applyMiddleware(data: any): Promise<any> {
    let result = data;

    for (const { middleware } of this.middleware) {
      try {
        result = await middleware.transform(result, {
          ...this.context,
          emit: this.emit.bind(this),
          on: this.on.bind(this)
        });
      } catch (error) {
        this.emit('middlewareError', { middleware: middleware.name, error });
      }
    }

    return result;
  }

  /**
   * Get available rules
   */
  getRules(category?: PluginRule['category']): PluginRule[] {
    const rules = Array.from(this.rules.values()).map(({ rule }) => rule);
    return category ? rules.filter(rule => rule.category === category) : rules;
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: Plugin): void {
    if (!plugin.config?.name) {
      throw new Error('Plugin must have a name');
    }

    if (!plugin.config?.version) {
      throw new Error('Plugin must have a version');
    }

    if (!plugin.config?.description) {
      throw new Error('Plugin must have a description');
    }

    // Validate commands
    if (plugin.commands) {
      for (const command of plugin.commands) {
        if (!command.name || !command.action) {
          throw new Error('Plugin commands must have name and action');
        }
      }
    }

    // Validate rules
    if (plugin.rules) {
      for (const rule of plugin.rules) {
        if (!rule.name || !rule.check) {
          throw new Error('Plugin rules must have name and check function');
        }
      }
    }
  }

  /**
   * List registered plugins
   */
  listPlugins(): Array<{ name: string; config: PluginConfig }> {
    return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
      name,
      config: plugin.config
    }));
  }
}

/**
 * Plugin discovery and loading utilities
 */
export class PluginLoader {
  /**
   * Load plugin from package
   */
  static async loadFromPackage(packageName: string): Promise<Plugin> {
    try {
      const pluginModule = await import(packageName);
      const plugin = pluginModule.default || pluginModule;

      if (!plugin || typeof plugin !== 'object') {
        throw new Error(`Invalid plugin export from ${packageName}`);
      }

      return plugin as Plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin ${packageName}: ${error}`);
    }
  }

  /**
   * Discover plugins in node_modules
   */
  static async discoverPlugins(): Promise<string[]> {
    // In real implementation, scan node_modules for packages with 'zodkit-plugin-' prefix
    // or packages that have 'zodkit' in keywords
    return [];
  }
}

/**
 * Global plugin manager instance
 */
export let pluginManager: PluginManager;

/**
 * Initialize plugin system
 */
export function initializePluginSystem(context: Omit<PluginContext, 'emit' | 'on'>): PluginManager {
  pluginManager = new PluginManager(context);
  return pluginManager;
}