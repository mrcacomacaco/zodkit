/**
 * @fileoverview Hot Reloading System with Smart Dependency Tracking
 * @module HotReload
 *
 * Advanced hot reloading system that provides real-time schema reloading
 * with intelligent dependency graph tracking and cache invalidation.
 */

import { EventEmitter } from 'node:events';
import { type FSWatcher, watch } from 'chokidar';

interface WatchOptions {
	ignored?: string | string[];
	persistent?: boolean;
	ignoreInitial?: boolean;
	followSymlinks?: boolean;
	depth?: number;
	awaitWriteFinish?: {
		stabilityThreshold: number;
		pollInterval: number;
	};
}

import { readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
// import { PerformanceMonitor } from './performance-monitor';
import type { Logger } from '../utils/logger';

// import { SchemaInfo } from './schema-discovery';
interface SchemaInfo {
	filePath: string;
	name: string;
}

import type { Infrastructure } from './infrastructure';

export interface HotReloadConfig {
	enabled: boolean;
	patterns: string[];
	ignored?: string | string[];
	debounceMs: number;
	dependencyTracking: {
		enabled: boolean;
		maxDepth: number;
		trackImports: boolean;
		trackTypes: boolean;
		trackReExports: boolean;
	};
	invalidation: {
		strategy: 'conservative' | 'aggressive' | 'smart';
		cascadeInvalidation: boolean;
		preserveCache: boolean;
		maxCacheAge: number;
	};
	performance: {
		maxReloadTime: number;
		throttleReloads: boolean;
		batchUpdates: boolean;
		updateBatchSize: number;
	};
}

export interface DependencyNode {
	filePath: string;
	dependencies: Set<string>;
	dependents: Set<string>;
	lastModified: number;
	hash: string;
	schemaInfo?: SchemaInfo;
	invalidated: boolean;
}

export interface HotReloadEvent {
	type: 'file-changed' | 'dependency-updated' | 'cache-invalidated' | 'reload-complete';
	filePath: string;
	dependentFiles?: string[];
	reloadTime?: number;
	error?: Error;
}

export class HotReloadManager extends EventEmitter {
	private readonly config: HotReloadConfig;
	private watcher: FSWatcher | null = null;
	private readonly dependencyGraph: Map<string, DependencyNode> = new Map();
	private readonly reloadQueue: Map<string, number> = new Map();
	private isReloading = false;
	private readonly reloadDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private readonly logger: Logger;
	private infrastructure?: Infrastructure;

	constructor(config: HotReloadConfig, _performanceMonitor: any, logger: Logger) {
		super();
		this.config = config;
		this.logger = logger;
	}

	setInfrastructure(infrastructure: Infrastructure): void {
		this.infrastructure = infrastructure;
	}

	async start(): Promise<void> {
		if (!this.config.enabled) {
			this.logger.debug('Hot reload is disabled');
			return;
		}

		this.logger.info('Starting hot reload system...');

		try {
			await this.buildDependencyGraph();
			await this.setupFileWatcher();

			this.logger.info(`Hot reload system started, watching ${this.dependencyGraph.size} files`);
			this.emit('started');
		} catch (error) {
			this.logger.error('Failed to start hot reload system:', error);
			throw error;
		}
	}

	async stop(): Promise<void> {
		this.logger.info('Stopping hot reload system...');

		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}

		// Clear all timers
		this.reloadDebounceTimers.forEach((timer) => clearTimeout(timer));
		this.reloadDebounceTimers.clear();
		this.reloadQueue.clear();

		this.logger.info('Hot reload system stopped');
		this.emit('stopped');
	}

	private async buildDependencyGraph(): Promise<void> {
		const startTime = Date.now();
		this.logger.debug('Building dependency graph...');

		// Get all schema files from infrastructure
		const schemaFiles = this.infrastructure ? await this.infrastructure.discoverSchemas() : [];

		for (const schema of schemaFiles) {
			await this.analyzeFile(schema.filePath);
		}

		const buildTime = Date.now() - startTime;
		this.logger.info(
			`Built dependency graph with ${this.dependencyGraph.size} nodes in ${buildTime}ms`,
		);
	}

	private async analyzeFile(filePath: string): Promise<DependencyNode> {
		const absolutePath = resolve(filePath);

		let node = this.dependencyGraph.get(absolutePath);
		if (node) {
			return node;
		}

		try {
			const stats = await stat(absolutePath);
			const content = await readFile(absolutePath, 'utf-8');
			const hash = this.calculateHash(content);

			node = {
				filePath: absolutePath,
				dependencies: new Set(),
				dependents: new Set(),
				lastModified: stats.mtime.getTime(),
				hash,
				invalidated: false,
			};

			this.dependencyGraph.set(absolutePath, node);

			if (this.config.dependencyTracking.enabled) {
				await this.analyzeDependencies(node, content);
			}

			return node;
		} catch (error) {
			this.logger.error(`Failed to analyze file ${filePath}:`, error);
			throw error;
		}
	}

	private async analyzeDependencies(node: DependencyNode, content: string): Promise<void> {
		const dependencies = this.extractDependencies(content, node.filePath);

		for (const depPath of dependencies) {
			const absoluteDepPath = this.resolveDependency(depPath, node.filePath);
			if (!absoluteDepPath) continue;

			node.dependencies.add(absoluteDepPath);

			// Recursively analyze dependency if not already analyzed
			let depNode = this.dependencyGraph.get(absoluteDepPath);
			if (!depNode) {
				try {
					depNode = await this.analyzeFile(absoluteDepPath);
				} catch (_error) {
					// Dependency might be external or non-existent
					continue;
				}
			}

			depNode.dependents.add(node.filePath);
		}
	}

	private extractDependencies(content: string, _filePath: string): Set<string> {
		const dependencies = new Set<string>();

		if (!this.config.dependencyTracking.trackImports) {
			return dependencies;
		}

		// Extract ES6 imports
		const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"`]([^'"`]+)['"`]/g;
		let match;
		while ((match = importRegex.exec(content)) !== null) {
			const importPath = match[1];
			if (importPath && this.isLocalImport(importPath)) {
				dependencies.add(importPath);
			}
		}

		// Extract CommonJS requires
		const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
		match = requireRegex.exec(content);
		while (match !== null) {
			const requirePath = match[1];
			if (requirePath && this.isLocalImport(requirePath)) {
				dependencies.add(requirePath);
			}
			match = requireRegex.exec(content);
		}

		// Extract dynamic imports
		const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
		match = dynamicImportRegex.exec(content);
		while (match !== null) {
			const importPath = match[1];
			if (importPath && this.isLocalImport(importPath)) {
				dependencies.add(importPath);
			}
			match = dynamicImportRegex.exec(content);
		}

		// Extract type imports if enabled
		if (this.config.dependencyTracking.trackTypes) {
			const typeImportRegex = /import\s+type\s+(?:[\w\s{},*]+\s+from\s+)?['"`]([^'"`]+)['"`]/g;
			match = typeImportRegex.exec(content);
			while (match !== null) {
				const importPath = match[1];
				if (importPath && this.isLocalImport(importPath)) {
					dependencies.add(importPath);
				}
				match = typeImportRegex.exec(content);
			}
		}

		// Extract re-exports if enabled
		if (this.config.dependencyTracking.trackReExports) {
			const reExportRegex = /export\s+(?:\*|\{[^}]+\})\s+from\s+['"`]([^'"`]+)['"`]/g;
			match = reExportRegex.exec(content);
			while (match !== null) {
				const importPath = match[1];
				if (importPath && this.isLocalImport(importPath)) {
					dependencies.add(importPath);
				}
				match = reExportRegex.exec(content);
			}
		}

		return dependencies;
	}

	private isLocalImport(importPath: string): boolean {
		return (
			importPath.startsWith('./') ||
			importPath.startsWith('../') ||
			importPath.startsWith('/') ||
			(!importPath.startsWith('@') && !importPath.includes('/'))
		);
	}

	private resolveDependency(depPath: string, fromFile: string): string | null {
		try {
			const basePath = dirname(fromFile);
			const resolved = resolve(basePath, depPath);

			// Try with common extensions
			const extensions = ['.ts', '.js', '.tsx', '.jsx', '.json'];
			for (const ext of extensions) {
				const withExt = `${resolved}${ext}`;
				try {
					require.resolve(withExt);
					return withExt;
				} catch {}
			}

			// Try as index file
			for (const ext of extensions) {
				const indexFile = resolve(resolved, `index${ext}`);
				try {
					require.resolve(indexFile);
					return indexFile;
				} catch {}
			}

			return null;
		} catch {
			return null;
		}
	}

	private async setupFileWatcher(): Promise<void> {
		const watchOptions: WatchOptions = {
			ignored: this.config.ignored || [
				'**/node_modules/**',
				'**/.git/**',
				'**/dist/**',
				'**/build/**',
				'**/*.d.ts',
			],
			persistent: true,
			ignoreInitial: true,
			followSymlinks: false,
			depth: 10,
			awaitWriteFinish: {
				stabilityThreshold: 100,
				pollInterval: 50,
			},
		};

		try {
			this.watcher = watch(this.config.patterns, watchOptions);
		} catch (error) {
			this.logger.error('Failed to initialize file watcher', error);
			throw new Error('Failed to initialize file watcher');
		}

		this.watcher
			.on('change', (path) => this.handleFileChange(path, 'change'))
			.on('add', (path) => this.handleFileChange(path, 'add'))
			.on('unlink', (path) => this.handleFileChange(path, 'unlink'))
			.on('error', (error) => {
				this.logger.error('File watcher error:', error);
				this.emit('error', error);
			});
	}

	private async handleFileChange(
		filePath: string,
		changeType: 'change' | 'add' | 'unlink',
	): Promise<void> {
		const absolutePath = resolve(filePath);

		this.logger.debug(`File ${changeType}: ${relative(process.cwd(), absolutePath)}`);

		// Clear existing debounce timer
		const existingTimer = this.reloadDebounceTimers.get(absolutePath);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new debounce timer
		const timer = setTimeout(async () => {
			this.reloadDebounceTimers.delete(absolutePath);
			await this.processFileChange(absolutePath, changeType);
		}, this.config.debounceMs);

		this.reloadDebounceTimers.set(absolutePath, timer);
	}

	private async processFileChange(
		filePath: string,
		changeType: 'change' | 'add' | 'unlink',
	): Promise<void> {
		const startTime = Date.now();

		try {
			if (changeType === 'unlink') {
				await this.handleFileRemoval(filePath);
			} else {
				await this.handleFileUpdate(filePath);
			}

			const reloadTime = Date.now() - startTime;
			// Record performance metrics if available
			// this.performanceMonitor.recordEvent('hot-reload', reloadTime);

			this.emit('file-changed', {
				type: 'file-changed',
				filePath,
				reloadTime,
			} as HotReloadEvent);
		} catch (error) {
			this.logger.error(`Failed to process file change for ${filePath}:`, error);
			this.emit('error', error);
		}
	}

	private async handleFileUpdate(filePath: string): Promise<void> {
		// Re-analyze the file

		// Determine what needs to be invalidated
		const toInvalidate = this.calculateInvalidationSet(filePath);

		// Queue reloads
		for (const file of toInvalidate) {
			this.reloadQueue.set(file, Date.now());
		}

		// Process reload queue if not already processing
		if (!this.isReloading && this.config.performance.batchUpdates) {
			await this.processBatchedReloads();
		} else if (!this.config.performance.batchUpdates) {
			await this.reloadFile(filePath);
		}
	}

	private async handleFileRemoval(filePath: string): Promise<void> {
		const node = this.dependencyGraph.get(filePath);
		if (!node) return;

		// Remove from dependency graph
		this.dependencyGraph.delete(filePath);

		// Update dependents
		for (const dependent of node.dependents) {
			const depNode = this.dependencyGraph.get(dependent);
			if (depNode) {
				depNode.dependencies.delete(filePath);
				// Invalidate dependent
				this.reloadQueue.set(dependent, Date.now());
			}
		}

		// Update dependencies
		for (const dependency of node.dependencies) {
			const depNode = this.dependencyGraph.get(dependency);
			if (depNode) {
				depNode.dependents.delete(filePath);
			}
		}
	}

	private calculateInvalidationSet(filePath: string): Set<string> {
		const toInvalidate = new Set<string>();
		const visited = new Set<string>();

		const traverse = (file: string, depth: number = 0) => {
			if (visited.has(file) || depth > this.config.dependencyTracking.maxDepth) {
				return;
			}

			visited.add(file);
			toInvalidate.add(file);

			const node = this.dependencyGraph.get(file);
			if (!node) return;

			// Invalidate dependents based on strategy
			if (this.config.invalidation.cascadeInvalidation) {
				for (const dependent of node.dependents) {
					traverse(dependent, depth + 1);
				}
			}
		};

		traverse(filePath);
		return toInvalidate;
	}

	private async processBatchedReloads(): Promise<void> {
		if (this.isReloading || this.reloadQueue.size === 0) {
			return;
		}

		this.isReloading = true;
		const startTime = Date.now();

		try {
			const filesToReload = Array.from(this.reloadQueue.keys()).slice(
				0,
				this.config.performance.updateBatchSize,
			);

			this.logger.debug(`Processing batch reload of ${filesToReload.length} files`);

			// Process files in parallel batches
			const batchSize = Math.min(4, filesToReload.length);
			for (let i = 0; i < filesToReload.length; i += batchSize) {
				const batch = filesToReload.slice(i, i + batchSize);
				await Promise.all(batch.map((file) => this.reloadFile(file)));
			}

			// Remove processed files from queue
			for (const file of filesToReload) {
				this.reloadQueue.delete(file);
			}

			const reloadTime = Date.now() - startTime;
			this.logger.info(`Batch reload completed: ${filesToReload.length} files in ${reloadTime}ms`);

			this.emit('reload-complete', {
				type: 'reload-complete',
				filePath: filesToReload[0],
				dependentFiles: filesToReload,
				reloadTime,
			} as HotReloadEvent);
		} catch (error) {
			this.logger.error('Batch reload failed:', error);
			throw error;
		} finally {
			this.isReloading = false;

			// Process remaining queue if needed
			if (this.reloadQueue.size > 0) {
				setTimeout(() => this.processBatchedReloads(), 100);
			}
		}
	}

	private async reloadFile(filePath: string): Promise<void> {
		if (!this.infrastructure) {
			this.logger.warn('Infrastructure not available for hot reload');
			return;
		}

		try {
			// Invalidate cache for this file
			await this.infrastructure.invalidateCache(filePath);

			// Re-discover schemas for this file
			const schemas = await this.infrastructure.discoverSchemasInFile(filePath);

			this.logger.debug(
				`Reloaded ${schemas.length} schemas from ${relative(process.cwd(), filePath)}`,
			);
		} catch (error) {
			this.logger.error(`Failed to reload file ${filePath}:`, error);
			throw error;
		}
	}

	private calculateHash(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(36);
	}

	// Public API methods

	async invalidateFile(filePath: string): Promise<void> {
		const absolutePath = resolve(filePath);
		const toInvalidate = this.calculateInvalidationSet(absolutePath);

		for (const file of toInvalidate) {
			this.reloadQueue.set(file, Date.now());
		}

		if (this.config.performance.batchUpdates) {
			await this.processBatchedReloads();
		} else {
			await this.reloadFile(absolutePath);
		}
	}

	getDependencyGraph(): Map<string, DependencyNode> {
		return new Map(this.dependencyGraph);
	}

	getFileStats(filePath: string): DependencyNode | null {
		return this.dependencyGraph.get(resolve(filePath)) || null;
	}

	getReloadQueue(): string[] {
		return Array.from(this.reloadQueue.keys());
	}

	async clearCache(): Promise<void> {
		this.dependencyGraph.clear();
		this.reloadQueue.clear();
		for (const timer of this.reloadDebounceTimers.values()) {
			clearTimeout(timer);
		}
		this.reloadDebounceTimers.clear();

		this.logger.debug('Hot reload cache cleared');
	}
}
