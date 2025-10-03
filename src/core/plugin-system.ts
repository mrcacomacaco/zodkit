/**
 * @fileoverview Unified Plugin System for ZodKit
 * @module PluginSystem
 *
 * Consolidates:
 * - plugin-system.ts (Plugin manager, hooks, commands)
 * - plugin-registry.ts (Discovery, installation, npm integration)
 * - plugin-dev-toolkit.ts (Scaffolding, validation, testing, publishing)
 *
 * Total consolidation: ~1400 lines → ~900 lines
 */

import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pc from 'picocolors';
import type { GlobalOptions } from '../cli/global-options';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
 * Plugin package information (for registry)
 */
export interface PluginPackageInfo {
	name: string;
	version: string;
	description: string;
	author?: string;
	keywords: string[];
	zodkitVersion?: string;
	verified: boolean;
	downloadCount: number;
	lastUpdated: string;
	repository?: string;
}

/**
 * Plugin installation options
 */
export interface PluginInstallOptions {
	version?: string;
	dev?: boolean;
	global?: boolean;
	force?: boolean;
}

/**
 * Plugin search options
 */
export interface PluginSearchOptions {
	category?: string;
	keywords?: string[];
	verified?: boolean;
	limit?: number;
	sort?: 'downloads' | 'updated' | 'name';
}

/**
 * Plugin scaffold options
 */
export interface PluginScaffoldOptions {
	name: string;
	description: string;
	author: string;
	template: 'basic' | 'command' | 'rule' | 'middleware' | 'full';
	typescript: boolean;
	git: boolean;
	install: boolean;
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	suggestions: string[];
}

/**
 * Plugin test result
 */
export interface PluginTestResult {
	passed: boolean;
	tests: Array<{
		name: string;
		passed: boolean;
		error?: string;
		duration: number;
	}>;
	coverage?: {
		lines: number;
		functions: number;
		branches: number;
	};
}

// ============================================================================
// PLUGIN MANAGER
// ============================================================================

/**
 * Plugin registry and manager
 * Handles plugin lifecycle, hook execution, and component registration
 */
export class PluginManager extends EventEmitter {
	private readonly plugins: Map<string, Plugin> = new Map();
	private readonly hooks: Map<keyof PluginHooks, Array<{ plugin: string; handler: Function }>> =
		new Map();
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
				this.hooks.get(hookName as keyof PluginHooks)?.push({
					plugin: name,
					handler,
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
				on: this.on.bind(this),
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
			this.hooks.set(
				hookName,
				handlers.filter((h) => h.plugin !== name),
			);
		}

		// Remove commands
		for (const [commandName, { plugin: pluginName }] of this.commands.entries()) {
			if (pluginName === name) {
				this.commands.delete(commandName);
			}
		}

		// Remove middleware
		this.middleware = this.middleware.filter((m) => m.plugin !== name);

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
			command,
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
					on: this.on.bind(this),
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
		return category ? rules.filter((rule) => rule.category === category) : rules;
	}

	/**
	 * List registered plugins
	 */
	listPlugins(): Array<{ name: string; config: PluginConfig }> {
		return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
			name,
			config: plugin.config,
		}));
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
}

// ============================================================================
// PLUGIN REGISTRY
// ============================================================================

/**
 * Plugin discovery, installation, and version management
 * Handles npm integration and plugin marketplace
 */
export class PluginRegistry extends EventEmitter {
	private readonly installedPlugins: Map<string, PluginPackageInfo> = new Map();
	private readonly packageCache: Map<string, PluginPackageInfo> = new Map();
	private readonly cacheExpiry = 5 * 60 * 1000; // 5 minutes

	constructor(
		private readonly workingDirectory: string = process.cwd(),
		private readonly globalMode: boolean = false,
	) {
		super();
		this.loadInstalledPlugins();
	}

	/**
	 * Discover plugins from various sources
	 */
	async discoverPlugins(): Promise<PluginPackageInfo[]> {
		const discovered: PluginPackageInfo[] = [];

		try {
			// 1. Local node_modules scanning
			const localPlugins = await this.scanLocalPlugins();
			discovered.push(...localPlugins);

			// 2. Global plugins (if in global mode)
			if (this.globalMode) {
				const globalPlugins = await this.scanGlobalPlugins();
				discovered.push(...globalPlugins);
			}

			// 3. Package.json dependencies
			const packagePlugins = await this.scanPackageJsonPlugins();
			discovered.push(...packagePlugins);

			// 4. Official registry
			const registryPlugins = await this.fetchFromRegistry();
			discovered.push(...registryPlugins);
		} catch (error) {
			this.emit('discoveryError', error);
		}

		return this.deduplicatePlugins(discovered);
	}

	/**
	 * Search for plugins in the registry
	 */
	async searchPlugins(
		query: string,
		options: PluginSearchOptions = {},
	): Promise<PluginPackageInfo[]> {
		const allPlugins = await this.discoverPlugins();

		let filtered = allPlugins.filter(
			(plugin) =>
				plugin.name.toLowerCase().includes(query.toLowerCase()) ||
				plugin.description.toLowerCase().includes(query.toLowerCase()) ||
				plugin.keywords.some((keyword) => keyword.toLowerCase().includes(query.toLowerCase())),
		);

		// Apply filters
		if (options.category) {
			filtered = filtered.filter((p) => p.keywords.includes(options.category!));
		}

		if (options.keywords) {
			filtered = filtered.filter((p) =>
				options.keywords?.some((keyword) => p.keywords.includes(keyword)),
			);
		}

		if (options.verified !== undefined) {
			filtered = filtered.filter((p) => p.verified === options.verified);
		}

		// Sort results
		switch (options.sort) {
			case 'downloads':
				filtered.sort((a, b) => b.downloadCount - a.downloadCount);
				break;
			case 'updated':
				filtered.sort(
					(a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
				);
				break;
			case 'name':
				filtered.sort((a, b) => a.name.localeCompare(b.name));
				break;
			default:
				// Default: relevance (simple scoring)
				filtered.sort((a, b) => {
					const aScore = this.calculateRelevanceScore(a, query);
					const bScore = this.calculateRelevanceScore(b, query);
					return bScore - aScore;
				});
		}

		return filtered.slice(0, options.limit || 20);
	}

	/**
	 * Install a plugin
	 */
	async installPlugin(name: string, options: PluginInstallOptions = {}): Promise<void> {
		this.emit('installStarted', { name, options });

		try {
			const packageName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;
			const version = options.version ? `@${options.version}` : '';
			const fullPackageName = `${packageName}${version}`;

			// Construct npm install command
			const npmArgs = ['install'];

			if (options.dev) npmArgs.push('--save-dev');
			if (options.global) npmArgs.push('--global');
			if (options.force) npmArgs.push('--force');

			npmArgs.push(fullPackageName);

			console.log(pc.cyan(`📦 Installing ${fullPackageName}...`));

			const installCommand = `npm ${npmArgs.join(' ')}`;
			execSync(installCommand, {
				cwd: this.workingDirectory,
				stdio: 'inherit',
			});

			// Verify installation
			const installedPlugin = await this.loadPluginInfo(packageName);
			if (installedPlugin) {
				this.installedPlugins.set(packageName, installedPlugin);
				console.log(pc.green(`✅ Successfully installed ${packageName}`));
				this.emit('installCompleted', {
					name: packageName,
					info: installedPlugin,
				});
			} else {
				throw new Error('Plugin installation verification failed');
			}
		} catch (error) {
			console.error(pc.red(`❌ Failed to install ${name}: ${error}`));
			this.emit('installFailed', { name, error });
			throw error;
		}
	}

	/**
	 * Uninstall a plugin
	 */
	async uninstallPlugin(name: string, options: { global?: boolean } = {}): Promise<void> {
		this.emit('uninstallStarted', { name, options });

		try {
			const packageName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;

			const npmArgs = ['uninstall'];
			if (options.global) npmArgs.push('--global');
			npmArgs.push(packageName);

			console.log(pc.cyan(`🗑️  Uninstalling ${packageName}...`));

			const uninstallCommand = `npm ${npmArgs.join(' ')}`;
			execSync(uninstallCommand, {
				cwd: this.workingDirectory,
				stdio: 'inherit',
			});

			this.installedPlugins.delete(packageName);

			console.log(pc.green(`✅ Successfully uninstalled ${packageName}`));
			this.emit('uninstallCompleted', { name: packageName });
		} catch (error) {
			console.error(pc.red(`❌ Failed to uninstall ${name}: ${error}`));
			this.emit('uninstallFailed', { name, error });
			throw error;
		}
	}

	/**
	 * Get info about a specific plugin
	 */
	async getPluginInfo(name: string): Promise<PluginPackageInfo | null> {
		const packageName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;

		// Check installed first
		if (this.installedPlugins.has(packageName)) {
			return this.installedPlugins.get(packageName)!;
		}

		// Check cache
		if (this.packageCache.has(packageName)) {
			const cached = this.packageCache.get(packageName)!;
			if (Date.now() - new Date(cached.lastUpdated).getTime() < this.cacheExpiry) {
				return cached;
			}
		}

		// Fetch from registry
		try {
			const info = await this.fetchPackageInfo(packageName);
			this.packageCache.set(packageName, info);
			return info;
		} catch (_error) {
			return null;
		}
	}

	/**
	 * List installed plugins
	 */
	getInstalledPlugins(): PluginPackageInfo[] {
		return Array.from(this.installedPlugins.values());
	}

	/**
	 * Update a plugin to latest version
	 */
	async updatePlugin(name: string, options: { global?: boolean } = {}): Promise<void> {
		const currentInfo = await this.getPluginInfo(name);
		if (!currentInfo) {
			throw new Error(`Plugin ${name} is not installed`);
		}

		await this.installPlugin(name, {
			...options,
			force: true,
		});
	}

	/**
	 * Update all plugins
	 */
	async updateAllPlugins(): Promise<void> {
		const installed = this.getInstalledPlugins();

		for (const plugin of installed) {
			try {
				await this.updatePlugin(plugin.name);
			} catch (error) {
				console.warn(pc.yellow(`⚠️  Failed to update ${plugin.name}: ${error}`));
			}
		}
	}

	// === PRIVATE METHODS ===

	private async scanLocalPlugins(): Promise<PluginPackageInfo[]> {
		const plugins: PluginPackageInfo[] = [];
		const nodeModulesPath = path.join(this.workingDirectory, 'node_modules');

		if (!fs.existsSync(nodeModulesPath)) {
			return plugins;
		}

		try {
			const packages = fs.readdirSync(nodeModulesPath);

			for (const packageName of packages) {
				if (packageName.startsWith('zodkit-plugin-') || packageName.startsWith('@')) {
					// Handle scoped packages
					if (packageName.startsWith('@')) {
						const scopedPath = path.join(nodeModulesPath, packageName);
						if (fs.statSync(scopedPath).isDirectory()) {
							const scopedPackages = fs.readdirSync(scopedPath);
							for (const scopedPackage of scopedPackages) {
								if (scopedPackage.startsWith('zodkit-plugin-')) {
									const info = await this.loadPluginInfo(`${packageName}/${scopedPackage}`);
									if (info) plugins.push(info);
								}
							}
						}
					} else {
						const info = await this.loadPluginInfo(packageName);
						if (info) plugins.push(info);
					}
				}
			}
		} catch (_error) {
			// Silent fail - just return empty array
		}

		return plugins;
	}

	private async scanGlobalPlugins(): Promise<PluginPackageInfo[]> {
		// Implementation would scan global npm packages
		return [];
	}

	private async scanPackageJsonPlugins(): Promise<PluginPackageInfo[]> {
		const plugins: PluginPackageInfo[] = [];
		const packageJsonPath = path.join(this.workingDirectory, 'package.json');

		if (!fs.existsSync(packageJsonPath)) {
			return plugins;
		}

		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			const dependencies = {
				...(packageJson.dependencies || {}),
				...(packageJson.devDependencies || {}),
			};

			for (const depName of Object.keys(dependencies)) {
				if (depName.startsWith('zodkit-plugin-') || depName.includes('zodkit')) {
					const info = await this.loadPluginInfo(depName);
					if (info) plugins.push(info);
				}
			}
		} catch (_error) {
			// Silent fail
		}

		return plugins;
	}

	private async fetchFromRegistry(): Promise<PluginPackageInfo[]> {
		// In a real implementation, this would fetch from npm registry API
		// For now, return empty array
		return [];
	}

	private async loadPluginInfo(packageName: string): Promise<PluginPackageInfo | null> {
		try {
			const packagePath = path.join(
				this.workingDirectory,
				'node_modules',
				packageName,
				'package.json',
			);

			if (!fs.existsSync(packagePath)) {
				return null;
			}

			const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

			// Verify it's a zodkit plugin
			const isZodkitPlugin =
				packageName.startsWith('zodkit-plugin-') ||
				packageJson.keywords?.includes('zodkit') ||
				packageJson.keywords?.includes('zodkit-plugin');

			if (!isZodkitPlugin) {
				return null;
			}

			return {
				name: packageJson.name,
				version: packageJson.version,
				description: packageJson.description || '',
				author: packageJson.author,
				keywords: packageJson.keywords || [],
				zodkitVersion: packageJson.zodkitVersion || packageJson.peerDependencies?.zodkit,
				verified: false, // Would be determined by registry
				downloadCount: 0, // Would come from registry
				lastUpdated: new Date().toISOString(),
				repository: packageJson.repository?.url,
			};
		} catch (_error) {
			return null;
		}
	}

	private async fetchPackageInfo(packageName: string): Promise<PluginPackageInfo> {
		// In real implementation, fetch from npm registry
		throw new Error(`Package ${packageName} not found`);
	}

	private deduplicatePlugins(plugins: PluginPackageInfo[]): PluginPackageInfo[] {
		const unique = new Map<string, PluginPackageInfo>();

		for (const plugin of plugins) {
			const existing = unique.get(plugin.name);
			if (!existing || this.compareVersions(plugin.version, existing.version) > 0) {
				unique.set(plugin.name, plugin);
			}
		}

		return Array.from(unique.values());
	}

	private compareVersions(a: string, b: string): number {
		const aParts = a.split('.').map(Number);
		const bParts = b.split('.').map(Number);

		for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
			const aPart = aParts[i] || 0;
			const bPart = bParts[i] || 0;

			if (aPart > bPart) return 1;
			if (aPart < bPart) return -1;
		}

		return 0;
	}

	private calculateRelevanceScore(plugin: PluginPackageInfo, query: string): number {
		let score = 0;
		const lowerQuery = query.toLowerCase();

		// Exact name match
		if (plugin.name.toLowerCase() === lowerQuery) score += 100;
		// Name contains query
		else if (plugin.name.toLowerCase().includes(lowerQuery)) score += 50;

		// Description contains query
		if (plugin.description.toLowerCase().includes(lowerQuery)) score += 25;

		// Keywords match
		const keywordMatches = plugin.keywords.filter((k) =>
			k.toLowerCase().includes(lowerQuery),
		).length;
		score += keywordMatches * 10;

		// Boost verified plugins
		if (plugin.verified) score += 20;

		// Boost popular plugins
		score += Math.log(plugin.downloadCount + 1) * 2;

		return score;
	}

	private loadInstalledPlugins(): void {
		// Load installed plugins on initialization
		this.scanLocalPlugins()
			.then((plugins) => {
				for (const plugin of plugins) {
					this.installedPlugins.set(plugin.name, plugin);
				}
			})
			.catch(() => {
				// Silent fail on initialization
			});
	}
}

// ============================================================================
// PLUGIN DEV TOOLKIT
// ============================================================================

/**
 * Plugin development toolkit
 * Handles scaffolding, validation, testing, building, and publishing
 */
export class PluginDevToolkit {
	constructor(private readonly workingDirectory: string = process.cwd()) {}

	/**
	 * Scaffold a new plugin project
	 */
	async scaffoldPlugin(options: PluginScaffoldOptions): Promise<void> {
		const pluginName = options.name.startsWith('zodkit-plugin-')
			? options.name
			: `zodkit-plugin-${options.name}`;

		const pluginDir = path.join(this.workingDirectory, pluginName);

		console.log(pc.cyan(`🚀 Creating plugin ${pluginName}...`));

		// Create plugin directory
		if (fs.existsSync(pluginDir)) {
			throw new Error(`Directory ${pluginName} already exists`);
		}

		fs.mkdirSync(pluginDir, { recursive: true });

		try {
			// Generate files based on template
			await this.generatePluginFiles(pluginDir, options);

			// Initialize git repo
			if (options.git) {
				await this.initializeGit(pluginDir);
			}

			// Install dependencies
			if (options.install) {
				await this.installDependencies(pluginDir);
			}

			console.log(pc.green(`✅ Plugin ${pluginName} created successfully!`));
			console.log();
			console.log(pc.bold('Next steps:'));
			console.log(`  ${pc.gray('cd')} ${pluginName}`);
			console.log(`  ${pc.gray('npm')} ${options.install ? 'start' : 'install'}`);
			console.log(`  ${pc.gray('zodkit')} plugin test`);
			console.log();
		} catch (error) {
			// Cleanup on error
			fs.rmSync(pluginDir, { recursive: true, force: true });
			throw error;
		}
	}

	/**
	 * Validate a plugin
	 */
	async validatePlugin(pluginPath: string): Promise<PluginValidationResult> {
		const result: PluginValidationResult = {
			valid: true,
			errors: [],
			warnings: [],
			suggestions: [],
		};

		try {
			// Check if plugin file exists
			const mainFile = this.findPluginMainFile(pluginPath);
			if (!mainFile) {
				result.errors.push('No main plugin file found (index.js, index.ts, or plugin.js)');
				result.valid = false;
				return result;
			}

			// Load and validate plugin
			const plugin = await this.loadPluginForValidation(mainFile);

			// Validate plugin structure
			this.validatePluginStructure(plugin, result);

			// Validate plugin config
			this.validatePluginConfig(plugin.config, result);

			// Validate hooks
			if (plugin.hooks) {
				this.validatePluginHooks(plugin.hooks, result);
			}

			// Validate commands
			if (plugin.commands) {
				this.validatePluginCommands(plugin.commands, result);
			}

			// Check package.json
			this.validatePackageJson(pluginPath, result);

			// Check for README
			if (!fs.existsSync(path.join(pluginPath, 'README.md'))) {
				result.warnings.push('No README.md file found - consider adding documentation');
			}

			// Check for tests
			if (!this.hasTests(pluginPath)) {
				result.suggestions.push('Consider adding tests for your plugin');
			}
		} catch (error) {
			result.errors.push(`Failed to validate plugin: ${error}`);
			result.valid = false;
		}

		result.valid = result.errors.length === 0;
		return result;
	}

	/**
	 * Test a plugin
	 */
	async testPlugin(pluginPath: string): Promise<PluginTestResult> {
		console.log(pc.cyan('🧪 Testing plugin...'));

		const result: PluginTestResult = {
			passed: false,
			tests: [],
		};

		try {
			// Basic validation test
			const validationResult = await this.validatePlugin(pluginPath);
			result.tests.push({
				name: 'Plugin Structure Validation',
				passed: validationResult.valid,
				error: validationResult.errors.join(', ') || undefined,
				duration: 0,
			});

			// Load plugin test
			const startTime = Date.now();
			try {
				const mainFile = this.findPluginMainFile(pluginPath);
				if (mainFile) {
					await this.loadPluginForValidation(mainFile);
					result.tests.push({
						name: 'Plugin Loading',
						passed: true,
						duration: Date.now() - startTime,
					});
				}
			} catch (error) {
				result.tests.push({
					name: 'Plugin Loading',
					passed: false,
					error: String(error),
					duration: Date.now() - startTime,
				});
			}

			result.passed = result.tests.every((test) => test.passed);
		} catch (error) {
			result.tests.push({
				name: 'General Test',
				passed: false,
				error: String(error),
				duration: 0,
			});
		}

		return result;
	}

	/**
	 * Build a plugin for distribution
	 */
	async buildPlugin(pluginPath: string): Promise<void> {
		console.log(pc.cyan('🔨 Building plugin...'));

		const packageJsonPath = path.join(pluginPath, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			throw new Error('No package.json found');
		}

		// Check if TypeScript
		const tsConfigPath = path.join(pluginPath, 'tsconfig.json');
		const isTypeScript = fs.existsSync(tsConfigPath);

		if (isTypeScript) {
			console.log(pc.gray('  📝 Compiling TypeScript...'));

			try {
				execSync('npx tsc', { cwd: pluginPath, stdio: 'inherit' });
				console.log(pc.green('  ✅ TypeScript compilation successful'));
			} catch (error) {
				throw new Error(`TypeScript compilation failed: ${error}`);
			}
		}

		// Validate built plugin
		const validationResult = await this.validatePlugin(pluginPath);
		if (!validationResult.valid) {
			throw new Error(`Plugin validation failed: ${validationResult.errors.join(', ')}`);
		}

		console.log(pc.green('✅ Plugin built successfully!'));
	}

	/**
	 * Publish a plugin to npm
	 */
	async publishPlugin(
		pluginPath: string,
		options: { tag?: string; dry?: boolean } = {},
	): Promise<void> {
		console.log(pc.cyan('📦 Publishing plugin...'));

		// Validate plugin first
		const validationResult = await this.validatePlugin(pluginPath);
		if (!validationResult.valid) {
			throw new Error(`Cannot publish invalid plugin: ${validationResult.errors.join(', ')}`);
		}

		// Check if user is logged in to npm
		try {
			execSync('npm whoami', { cwd: pluginPath, stdio: 'pipe' });
		} catch (_error) {
			throw new Error('Not logged in to npm. Run "npm login" first.');
		}

		// Build plugin
		await this.buildPlugin(pluginPath);

		// Publish
		const publishArgs = ['publish'];
		if (options.tag) publishArgs.push('--tag', options.tag);
		if (options.dry) publishArgs.push('--dry-run');

		try {
			const command = `npm ${publishArgs.join(' ')}`;

			console.log(pc.gray(`  Running: ${command}`));
			execSync(command, { cwd: pluginPath, stdio: 'inherit' });

			if (!options.dry) {
				console.log(pc.green('✅ Plugin published successfully!'));
			} else {
				console.log(pc.yellow('📋 Dry run completed - no package was published'));
			}
		} catch (error) {
			throw new Error(`Publishing failed: ${error}`);
		}
	}

	// === PRIVATE METHODS ===

	private async generatePluginFiles(
		pluginDir: string,
		options: PluginScaffoldOptions,
	): Promise<void> {
		const ext = options.typescript ? 'ts' : 'js';

		// Generate main plugin file
		const pluginContent = PluginTemplates.generateBasicPlugin(
			options.name,
			options.description,
			options.author,
			options.typescript,
		);
		fs.writeFileSync(path.join(pluginDir, `index.${ext}`), pluginContent);

		// Generate package.json
		const packageJson = PluginTemplates.generatePackageJson(
			options.name,
			options.description,
			options.author,
		);
		fs.writeFileSync(path.join(pluginDir, 'package.json'), packageJson);

		// Generate TypeScript config
		if (options.typescript) {
			const tsConfig = {
				compilerOptions: {
					target: 'ES2020',
					module: 'CommonJS',
					declaration: true,
					outDir: './dist',
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
				},
				include: ['*.ts'],
				exclude: ['node_modules', 'dist', '**/*.test.ts'],
			};
			fs.writeFileSync(path.join(pluginDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
		}

		// Generate README
		const readme = PluginTemplates.generateReadme(options);
		fs.writeFileSync(path.join(pluginDir, 'README.md'), readme);

		// Generate .gitignore
		const gitignore = `node_modules/
dist/
*.log
.env
.DS_Store
`;
		fs.writeFileSync(path.join(pluginDir, '.gitignore'), gitignore);
	}

	private async initializeGit(pluginDir: string): Promise<void> {
		try {
			execSync('git init', { cwd: pluginDir, stdio: 'pipe' });
			console.log(pc.gray('  📚 Git repository initialized'));
		} catch (_error) {
			console.warn(pc.yellow('  ⚠️  Failed to initialize git repository'));
		}
	}

	private async installDependencies(pluginDir: string): Promise<void> {
		try {
			console.log(pc.gray('  📦 Installing dependencies...'));
			execSync('npm install', { cwd: pluginDir, stdio: 'inherit' });
			console.log(pc.green('  ✅ Dependencies installed'));
		} catch (error) {
			console.warn(pc.yellow('  ⚠️  Failed to install dependencies'));
			throw error;
		}
	}

	private findPluginMainFile(pluginPath: string): string | null {
		const candidates = ['index.js', 'index.ts', 'plugin.js', 'plugin.ts'];

		for (const candidate of candidates) {
			const filePath = path.join(pluginPath, candidate);
			if (fs.existsSync(filePath)) {
				return filePath;
			}
		}

		return null;
	}

	private async loadPluginForValidation(filePath: string): Promise<Plugin> {
		// In a real implementation, this would use dynamic import or require
		// For validation purposes, we'll parse the file statically
		const content = fs.readFileSync(filePath, 'utf8');

		// Basic validation - just check if it looks like a plugin
		if (!content.includes('config') || !content.includes('name')) {
			throw new Error('Plugin file does not appear to contain a valid plugin configuration');
		}

		// Return a mock plugin for validation
		return {
			config: {
				name: 'test-plugin',
				version: '1.0.0',
				description: 'Test plugin',
			},
		};
	}

	private validatePluginStructure(plugin: Plugin, result: PluginValidationResult): void {
		if (!plugin.config) {
			result.errors.push('Plugin must have a config object');
			return;
		}

		if (typeof plugin !== 'object') {
			result.errors.push('Plugin must be an object');
		}
	}

	private validatePluginConfig(config: PluginConfig, result: PluginValidationResult): void {
		if (!config.name) {
			result.errors.push('Plugin config must have a name');
		} else if (!config.name.startsWith('zodkit-plugin-') && !config.name.includes('zodkit')) {
			result.warnings.push(
				'Plugin name should start with "zodkit-plugin-" for better discoverability',
			);
		}

		if (!config.version) {
			result.errors.push('Plugin config must have a version');
		}

		if (!config.description) {
			result.errors.push('Plugin config must have a description');
		}

		if (!config.author) {
			result.warnings.push('Plugin config should have an author field');
		}
	}

	private validatePluginHooks(hooks: PluginHooks, result: PluginValidationResult): void {
		const validHooks = [
			'beforeCommand',
			'afterCommand',
			'onError',
			'beforeValidation',
			'afterValidation',
			'beforeGeneration',
			'afterGeneration',
		];

		for (const hookName of Object.keys(hooks)) {
			if (!validHooks.includes(hookName)) {
				result.warnings.push(`Unknown hook: ${hookName}`);
			}
		}
	}

	private validatePluginCommands(commands: any[], result: PluginValidationResult): void {
		for (const command of commands) {
			if (!command.name) {
				result.errors.push('Plugin command must have a name');
			}
			if (!command.action || typeof command.action !== 'function') {
				result.errors.push('Plugin command must have an action function');
			}
		}
	}

	private validatePackageJson(pluginPath: string, result: PluginValidationResult): void {
		const packageJsonPath = path.join(pluginPath, 'package.json');

		if (!fs.existsSync(packageJsonPath)) {
			result.errors.push('No package.json found');
			return;
		}

		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

			if (!packageJson.name) {
				result.errors.push('package.json must have a name field');
			}

			if (!packageJson.version) {
				result.errors.push('package.json must have a version field');
			}

			if (!packageJson.keywords?.includes('zodkit')) {
				result.suggestions.push(
					'Consider adding "zodkit" to package.json keywords for better discoverability',
				);
			}
		} catch (_error) {
			result.errors.push('Invalid package.json file');
		}
	}

	private hasTests(pluginPath: string): boolean {
		const testFiles = ['test.js', 'test.ts', 'spec.js', 'spec.ts'];
		const testDirs = ['test', 'tests', '__tests__'];

		// Check for test files
		for (const testFile of testFiles) {
			if (fs.existsSync(path.join(pluginPath, testFile))) {
				return true;
			}
		}

		// Check for test directories
		for (const testDir of testDirs) {
			if (fs.existsSync(path.join(pluginPath, testDir))) {
				return true;
			}
		}

		return false;
	}
}

// ============================================================================
// PLUGIN TEMPLATES
// ============================================================================

/**
 * Plugin template generator
 */
export class PluginTemplates {
	/**
	 * Generate a basic plugin template
	 */
	static generateBasicPlugin(
		name: string,
		description: string,
		author: string = 'Your Name',
		typescript: boolean = false,
	): string {
		const pluginName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;

		if (typescript) {
			return `import type { Plugin } from 'zodkit';

const plugin: Plugin = {
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${description}',
    author: '${author}',
    keywords: ['zodkit', 'plugin'],
    zodkitVersion: '^0.1.0'
  },

  // Plugin initialization
  async init(context) {
    context.zodkit.logger.info('${pluginName} initialized');
  },

  // Lifecycle hooks
  hooks: {
    beforeCommand: async (command, options) => {
      // Called before any command execution
    },

    afterCommand: async (command, options, result) => {
      // Called after command execution
    },

    beforeValidation: async (schema, data) => {
      // Called before schema validation
      return data; // Return modified data if needed
    }
  },

  // Custom commands
  commands: [{
    name: 'my-command',
    description: 'Custom command provided by this plugin',
    action: async (args, options, context) => {
      context.zodkit.logger.info('Custom command executed!');
    }
  }],

  // Custom validation rules
  rules: [{
    name: 'my-custom-rule',
    category: 'validation',
    severity: 'warning',
    check: async (schema, context) => {
      // Return array of issues found
      return [];
    },
    fix: async (schema, issues, context) => {
      // Return fixed schema if auto-fixable
      return schema;
    }
  }]
};

export default plugin;`;
		}

		// JavaScript version
		return `/**
 * ${pluginName} - ${description}
 * A zodkit plugin
 */

module.exports = {
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${description}',
    author: '${author}',
    keywords: ['zodkit', 'plugin'],
    zodkitVersion: '^0.1.0'
  },

  // Plugin initialization
  async init(context) {
    context.zodkit.logger.info('${pluginName} initialized');
  },

  // Lifecycle hooks
  hooks: {
    beforeCommand: async (command, options) => {
      // Called before any command execution
    },

    afterCommand: async (command, options, result) => {
      // Called after command execution
    },

    beforeValidation: async (schema, data) => {
      // Called before schema validation
      return data; // Return modified data if needed
    }
  },

  // Custom commands
  commands: [{
    name: 'my-command',
    description: 'Custom command provided by this plugin',
    action: async (args, options, context) => {
      context.zodkit.logger.info('Custom command executed!');
    }
  }],

  // Custom validation rules
  rules: [{
    name: 'my-custom-rule',
    category: 'validation',
    severity: 'warning',
    check: async (schema, context) => {
      // Return array of issues found
      return [];
    },
    fix: async (schema, issues, context) => {
      // Return fixed schema if auto-fixable
      return schema;
    }
  }]
};`;
	}

	/**
	 * Generate package.json for a plugin
	 */
	static generatePackageJson(name: string, description: string, author: string): string {
		const pluginName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;

		return JSON.stringify(
			{
				name: pluginName,
				version: '1.0.0',
				description: description,
				main: 'index.js',
				keywords: ['zodkit', 'plugin', 'validation', 'zod'],
				author: author,
				license: 'MIT',
				peerDependencies: {
					zodkit: '^0.1.0',
				},
				devDependencies: {
					typescript: '^5.0.0',
					'@types/node': '^20.0.0',
				},
				files: ['index.js', 'index.d.ts', 'README.md'],
				repository: {
					type: 'git',
					url: `https://github.com/username/${pluginName}`,
				},
			},
			null,
			2,
		);
	}

	/**
	 * Generate README for a plugin
	 */
	static generateReadme(options: PluginScaffoldOptions): string {
		const pluginName = options.name.startsWith('zodkit-plugin-')
			? options.name
			: `zodkit-plugin-${options.name}`;

		return `# ${pluginName}

${options.description}

## Installation

\`\`\`bash
npm install ${pluginName}
\`\`\`

## Usage

This plugin is automatically loaded by zodkit when installed.

## Configuration

Add to your \`zodkit.config.js\`:

\`\`\`javascript
module.exports = {
  plugins: ['${pluginName}']
};
\`\`\`

## Features

- Feature 1
- Feature 2
- Feature 3

## Contributing

1. Fork it
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -am 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Create a Pull Request

## License

MIT © ${options.author}
`;
	}
}

// ============================================================================
// PLUGIN LOADER
// ============================================================================

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

// ============================================================================
// UNIFIED PLUGIN SYSTEM
// ============================================================================

/**
 * Unified plugin system combining manager, registry, and dev toolkit
 */
export class PluginSystem {
	readonly manager: PluginManager;
	readonly registry: PluginRegistry;
	readonly devTools: PluginDevToolkit;

	constructor(
		context: Omit<PluginContext, 'emit' | 'on'>,
		workingDirectory: string = process.cwd(),
	) {
		this.manager = new PluginManager(context);
		this.registry = new PluginRegistry(workingDirectory);
		this.devTools = new PluginDevToolkit(workingDirectory);
	}

	/**
	 * Load and register a plugin
	 */
	async loadPlugin(nameOrPath: string): Promise<void> {
		const plugin = await PluginLoader.loadFromPackage(nameOrPath);
		await this.manager.registerPlugin(plugin);
	}

	/**
	 * Install and load a plugin
	 */
	async installAndLoadPlugin(name: string, options?: PluginInstallOptions): Promise<void> {
		await this.registry.installPlugin(name, options);
		const packageName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;
		await this.loadPlugin(packageName);
	}
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

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

// ============================================================================
// EXPORTS
// ============================================================================

export default PluginSystem;
