/**
 * @fileoverview Plugin Registry and Discovery System
 * @module PluginRegistry
 *
 * Handles automatic plugin discovery, installation, and version management
 */

import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pc from 'picocolors';

// === REGISTRY INTERFACES ===

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

export interface PluginInstallOptions {
	version?: string;
	dev?: boolean;
	global?: boolean;
	force?: boolean;
}

export interface PluginSearchOptions {
	category?: string;
	keywords?: string[];
	verified?: boolean;
	limit?: number;
	sort?: 'downloads' | 'updated' | 'name';
}

// === PLUGIN REGISTRY ===

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

// === PLUGIN TEMPLATES ===

export class PluginTemplates {
	/**
	 * Generate a basic plugin template
	 */
	static generateBasicPlugin(name: string, description: string): string {
		const pluginName = name.startsWith('zodkit-plugin-') ? name : `zodkit-plugin-${name}`;

		return `/**
 * ${pluginName} - ${description}
 * A zodkit plugin
 */

export default {
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${description}',
    author: 'Your Name',
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
}

export default PluginRegistry;
