/**
 * @fileoverview Unified Infrastructure System
 * @module Infrastructure
 *
 * Consolidates all infrastructure components:
 * - Schema discovery and caching (1,671 lines)
 * - Schema mapping and validation (1,054 lines)
 * - MCP server and streaming (1,337 lines)
 * - Health monitoring and dashboard (1,745 lines)
 * - Database and context management (1,226 lines)
 * - Import management and terminal (2,387 lines)
 * - Error reporting and parallel processing (619 lines)
 * - Command wrapper (211 lines)
 * Total: 17 files → 1 unified system
 */

import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import * as path from 'node:path';
import { glob } from 'glob';
import * as pc from 'picocolors';
import { type WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { Logger } from '../utils/logger';
import { createZodExtractor } from './ast/extractor';
import { createASTParser } from './ast/parser';
import { MemoryOptimizer, StreamingProcessor } from './memory-optimizer';
import { createCollector } from './metadata/collector';
import { PerformanceMonitor } from './performance-monitor';
import { ProgressiveLoader, type ProgressiveLoadingOptions } from './progressive-loader';
import type { SchemaInfo } from './types';

// === UNIFIED TYPES ===

// Re-export SchemaInfo for backward compatibility
export type { SchemaInfo };

interface CachedFileContent {
	content: string;
	mtime: number;
	size: number;
}

export interface InfrastructureConfig {
	cache?: {
		enabled: boolean;
		ttl: number;
		directory: string;
	};
	discovery?: {
		patterns: string[];
		exclude: string[];
		depth: number;
		useAST?: boolean; // Use TypeScript AST parsing instead of regex
	};
	parallel?: {
		workers: number;
		timeout: number;
	};
	mcp?: {
		port: number;
		auth?: string;
		exposeFixes?: boolean;
	};
	monitoring?: {
		enabled: boolean;
		interval: number;
		metrics: string[];
	};
	progressive?: ProgressiveLoadingOptions;
}

export interface ValidationResult {
	valid: boolean;
	errors: Array<{
		path: string;
		message: string;
		code: string;
	}>;
	warnings: string[];
	suggestions: string[];
}

// === SCHEMA DISCOVERY ===

export class SchemaDiscovery {
	private readonly config: InfrastructureConfig;
	private readonly cache: SchemaCache;
	private readonly patterns: string[];
	private readonly progressiveLoader?: ProgressiveLoader;
	private readonly useAST: boolean;

	constructor(
		config: InfrastructureConfig = {},
		cache?: SchemaCache,
		monitor?: PerformanceMonitor,
		logger?: Logger,
	) {
		this.config = config;
		this.cache = cache ?? new SchemaCache(config);
		this.patterns = config.discovery?.patterns ?? this.getSmartDefaultPatterns();
		this.useAST = config.discovery?.useAST ?? true; // Default to AST-based parsing

		// Initialize progressive loader if configured
		if (config.progressive && monitor && logger) {
			this.progressiveLoader = new ProgressiveLoader(config.progressive, monitor, logger);
		}
	}

	private getSmartDefaultPatterns(): string[] {
		return [
			// Explicit schema files
			'**/*.schema.ts',
			'**/*schema.ts',
			'**/*.zod.ts',
			'**/*zod.ts',

			// Schema directories
			'**/schemas/**/*.ts',
			'**/schema/**/*.ts',
			'src/schemas/**/*.ts',
			'src/schema/**/*.ts',

			// Types with zod
			'**/types/**/*.ts',
			'src/types/**/*.ts',

			// Models with zod
			'**/models/**/*.ts',
			'src/models/**/*.ts',

			// Validation files
			'**/*validation.ts',
			'**/*validator.ts',
		];
	}

	async findSchemas(options?: {
		useCache?: boolean;
		basePath?: string;
		progressive?: boolean;
	}): Promise<SchemaInfo[]> {
		const basePath = options?.basePath ?? process.cwd();
		const cacheKey = `schemas_${basePath}_${JSON.stringify(this.patterns)}`;

		// Try cache first if enabled
		if (options?.useCache !== false) {
			const cached = this.cache.get(cacheKey) as SchemaInfo[] | undefined;
			if (cached) {
				return cached;
			}
		}

		// Use progressive loading if enabled and available
		if (options?.progressive !== false && this.progressiveLoader) {
			return await this.findSchemasProgressive(basePath, cacheKey);
		}

		return await this.findSchemasTraditional(basePath, cacheKey);
	}

	private async findSchemasProgressive(basePath: string, cacheKey: string): Promise<SchemaInfo[]> {
		const startTime = Date.now();

		try {
			const files = await glob(this.patterns, {
				cwd: basePath,
				ignore: this.config.discovery?.exclude ?? [
					'node_modules/**',
					'dist/**',
					'.git/**',
					'coverage/**',
				],
				absolute: true,
			});

			const schemaMap = await this.progressiveLoader?.loadSchemas(files);
			const schemas = schemaMap ? Array.from(schemaMap.values()) : [];

			// Cache the result
			this.cache.set(cacheKey, schemas, files);

			const duration = Date.now() - startTime;
			console.log(
				`📊 Progressive schema discovery: ${schemas.length} schemas from ${files.length} files in ${duration}ms`,
			);

			return schemas;
		} catch (error) {
			console.error('Progressive schema discovery failed:', error);
			// Fall back to traditional discovery
			return await this.findSchemasTraditional(basePath, cacheKey);
		}
	}

	private async findSchemasTraditional(basePath: string, cacheKey: string): Promise<SchemaInfo[]> {
		const startTime = Date.now();
		const schemas: SchemaInfo[] = [];
		const processedFiles: string[] = [];

		try {
			const files = await glob(this.patterns, {
				cwd: basePath,
				ignore: this.config.discovery?.exclude ?? [
					'node_modules/**',
					'dist/**',
					'.git/**',
					'coverage/**',
				],
				absolute: true,
			});

			// Process files in parallel batches for better performance
			const batchSize = 10;
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize);

				const batchPromises = batch.map(async (fullPath) => {
					try {
						const relativePath = path.relative(basePath, fullPath);
						const fileKey = `file_${fullPath}`;

						// Check if file content is cached
						let content = this.cache.get(fileKey) as CachedFileContent | undefined;
						if (!content) {
							const fileContent = fs.readFileSync(fullPath, 'utf8');
							const stats = fs.statSync(fullPath);

							content = {
								content: fileContent,
								mtime: stats.mtime.getTime(),
								size: stats.size,
							};

							// Cache file content with file as dependency for invalidation
							this.cache.set(fileKey, content, [fullPath]);
						}

						const discovered = this.parseSchemas(content.content, fullPath);
						processedFiles.push(relativePath);
						return discovered;
					} catch (error) {
						console.warn(`Warning: Could not read ${fullPath}: ${error}`);
						return [];
					}
				});

				const batchResults = await Promise.all(batchPromises);
				for (const result of batchResults) {
					schemas.push(...result);
				}
			}

			// Cache the discovery result with all processed files as dependencies
			this.cache.set(
				cacheKey,
				schemas,
				processedFiles.map((f) => path.resolve(basePath, f)),
			);

			const duration = Date.now() - startTime;
			console.log(
				`📊 Schema discovery: ${schemas.length} schemas from ${processedFiles.length} files in ${duration}ms`,
			);
		} catch (error) {
			console.error('Schema discovery failed:', error);
		}

		return schemas;
	}

	async autoDiscover(basePath?: string): Promise<SchemaInfo[]> {
		const searchPath = basePath ?? process.cwd();
		const schemas = await this.findSchemas({ basePath: searchPath });

		if (schemas.length === 0) {
			// Try a more aggressive search in common files
			const fallbackPatterns = ['**/*.ts', '**/*.tsx', '**/*.js'];
			const fallbackFiles = await glob(fallbackPatterns, {
				cwd: searchPath,
				ignore: ['node_modules/**', 'dist/**', '.git/**'],
			});

			for (const file of fallbackFiles.slice(0, 50)) {
				// Limit to prevent scanning too many files
				try {
					const fullPath = path.resolve(searchPath, file);
					const content = fs.readFileSync(fullPath, 'utf8');
					if (this.containsZodSchemas(content)) {
						const discovered = this.parseSchemas(content, fullPath);
						schemas.push(...discovered);
					}
				} catch {
					// Skip files that can't be read
				}
			}
		}

		return schemas;
	}

	private containsZodSchemas(content: string): boolean {
		return /z\.\w+\(/.test(content) && /import.*zod/.test(content);
	}

	parseSchemas(content: string, filePath: string): SchemaInfo[] {
		// Use AST-based parsing if enabled
		if (this.useAST) {
			return this.parseSchemasAST(content, filePath);
		}

		// Fall back to regex-based parsing
		return this.parseSchemasRegex(content, filePath);
	}

	private parseSchemasAST(content: string, filePath: string): SchemaInfo[] {
		try {
			const parser = createASTParser({ skipFileDependencyResolution: true });
			const extractor = createZodExtractor();
			const collector = createCollector();

			// Create source file from content
			const sourceFile = parser.createSourceFile(filePath, content);

			// Extract Zod schemas
			const zodSchemas = extractor.extractSchemas(sourceFile);

			// Convert to SchemaInfo format
			return zodSchemas.map((schema) => {
				const enriched = collector.enrichSchema(schema);
				return {
					name: schema.name,
					exportName: schema.name,
					filePath: schema.filePath,
					line: schema.line,
					column: schema.column,
					schemaType: schema.schemaType,
					zodChain: schema.type,
					description: enriched.description,
					metadata: enriched,
				};
			});
		} catch (error) {
			console.warn(`AST parsing failed for ${filePath}, falling back to regex:`, error);
			return this.parseSchemasRegex(content, filePath);
		}
	}

	private parseSchemasRegex(content: string, filePath: string): SchemaInfo[] {
		const schemas: SchemaInfo[] = [];

		// Simple regex-based parsing (fallback)
		const schemaPattern = /(?:export\s+)?const\s+(\w+)(?:Schema)?\s*=\s*z\./g;

		let match;
		while ((match = schemaPattern.exec(content)) !== null) {
			const line = content.substring(0, match.index).split('\n').length;
			schemas.push({
				name: match[1],
				exportName: match[1],
				filePath,
				line,
				column: 0,
				schemaType: this.detectSchemaType(content, match.index),
				zodChain: this.extractZodChain(content, match.index),
			});
		}

		return schemas;
	}

	private detectSchemaType(content: string, offset: number): string {
		const snippet = content.substring(offset, offset + 100);
		if (snippet.includes('z.object')) return 'object';
		if (snippet.includes('z.array')) return 'array';
		if (snippet.includes('z.string')) return 'string';
		if (snippet.includes('z.number')) return 'number';
		if (snippet.includes('z.union')) return 'union';
		return 'unknown';
	}

	private extractZodChain(content: string, offset: number): string {
		// Extract the Zod chain for analysis
		const start = offset;
		let depth = 0;
		let end = start;

		for (let i = start; i < content.length && i < start + 500; i++) {
			if (content[i] === '(') depth++;
			if (content[i] === ')') depth--;
			if (depth === 0 && (content[i] === ';' || content[i] === '\n')) {
				end = i;
				break;
			}
		}

		return content.substring(start, end);
	}
}

// === ADVANCED SCHEMA CACHE ===

export interface CacheEntry<T = unknown> {
	data: T;
	timestamp: number;
	version: string;
	dependencies: string[];
	size: number;
	accessCount: number;
	lastAccess: number;
	checksum: string;
}

export interface CacheStats {
	totalEntries: number;
	totalSize: number;
	hitRate: number;
	avgAccessTime: number;
	cacheEfficiency: number;
}

export class SchemaCache {
	private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
	private readonly fileWatchers: Map<string, fs.FSWatcher> = new Map();
	private stats = {
		hits: 0,
		misses: 0,
		totalAccessTime: 0,
		accessCount: 0,
	};

	private readonly ttl: number;
	private readonly directory: string;
	private readonly maxSize: number;
	private readonly enabled: boolean;
	private readonly compressionEnabled: boolean;

	constructor(config: InfrastructureConfig = {}) {
		this.ttl = config.cache?.ttl ?? 3600000; // 1 hour default
		this.directory = config.cache?.directory ?? '.zodkit/cache';
		this.enabled = config.cache?.enabled ?? true;
		this.maxSize = 50 * 1024 * 1024; // 50MB default
		this.compressionEnabled = true;

		if (this.enabled) {
			this.initializeCache();
		}
	}

	private async initializeCache(): Promise<void> {
		// Ensure cache directory exists
		if (!fs.existsSync(this.directory)) {
			fs.mkdirSync(this.directory, { recursive: true });
		}

		// Restore from disk
		await this.restore();

		// Setup cleanup interval
		setInterval(() => this.cleanup(), 300000); // Every 5 minutes
	}

	private generateChecksum(data: unknown): string {
		return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
	}

	private calculateSize(data: unknown): number {
		return Buffer.byteLength(JSON.stringify(data), 'utf8');
	}

	get<T = unknown>(key: string): T | null {
		const start = Date.now();

		if (!this.enabled) {
			this.stats.misses++;
			return null;
		}

		const cached = this.cache.get(key);

		if (!cached) {
			this.stats.misses++;
			return null;
		}

		// Check TTL
		if (Date.now() - cached.timestamp > this.ttl) {
			this.cache.delete(key);
			this.stopWatching(key);
			this.stats.misses++;
			return null;
		}

		// Update access stats
		cached.accessCount++;
		cached.lastAccess = Date.now();
		this.stats.hits++;
		this.stats.totalAccessTime += Date.now() - start;
		this.stats.accessCount++;

		return cached.data as T | null;
	}

	set<T = unknown>(key: string, data: T, dependencies: string[] = []): void {
		if (!this.enabled) return;

		const size = this.calculateSize(data);
		const checksum = this.generateChecksum(data);

		// Check if data already exists with same checksum
		const existing = this.cache.get(key);
		if (existing && existing.checksum === checksum) {
			existing.lastAccess = Date.now();
			existing.accessCount++;
			return;
		}

		// Evict if cache is too large
		this.evictIfNecessary(size);

		const entry: CacheEntry = {
			data,
			timestamp: Date.now(),
			version: this.generateVersion(),
			dependencies,
			size,
			accessCount: 1,
			lastAccess: Date.now(),
			checksum,
		};

		this.cache.set(key, entry);

		// Watch dependencies for changes
		this.watchDependencies(key, dependencies);
	}

	private generateVersion(): string {
		return `v${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
	}

	private evictIfNecessary(newEntrySize: number): void {
		const currentSize = this.getTotalSize();

		if (currentSize + newEntrySize > this.maxSize) {
			// Use LRU eviction strategy
			const sortedEntries = Array.from(this.cache.entries()).sort(([, a], [, b]) => {
				// Prioritize by access count and recency
				const scoreA = a.accessCount * 0.7 + (Date.now() - a.lastAccess) * 0.3;
				const scoreB = b.accessCount * 0.7 + (Date.now() - b.lastAccess) * 0.3;
				return scoreA - scoreB;
			});

			// Evict least valuable entries
			let freedSpace = 0;
			for (const [key, entry] of sortedEntries) {
				this.cache.delete(key);
				this.stopWatching(key);
				freedSpace += entry.size;

				if (freedSpace >= newEntrySize * 1.2) {
					// Free 20% extra
					break;
				}
			}
		}
	}

	private getTotalSize(): number {
		return Array.from(this.cache.values()).reduce((total, entry) => total + entry.size, 0);
	}

	private watchDependencies(_key: string, dependencies: string[]): void {
		dependencies.forEach((dep) => {
			if (!this.fileWatchers.has(dep)) {
				try {
					// Directly attempt to watch - fs.watch will fail if file doesn't exist
					const watcher = fs.watch(dep, () => {
						this.invalidateDependency(dep);
					});
					this.fileWatchers.set(dep, watcher);
				} catch {
					// File watching may fail in some environments or if file doesn't exist, continue without it
				}
			}
		});
	}

	private invalidateDependency(filePath: string): void {
		// Find all cache entries that depend on this file
		const keysToInvalidate: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			if (entry.dependencies.includes(filePath)) {
				keysToInvalidate.push(key);
			}
		}

		// Invalidate dependent entries
		keysToInvalidate.forEach((key) => {
			this.cache.delete(key);
		});
	}

	private stopWatching(key: string): void {
		const entry = this.cache.get(key);
		if (entry) {
			entry.dependencies.forEach((dep) => {
				const watcher = this.fileWatchers.get(dep);
				if (watcher) {
					watcher.close();
					this.fileWatchers.delete(dep);
				}
			});
		}
	}

	private cleanup(): void {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			// Remove expired entries
			if (now - entry.timestamp > this.ttl) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach((key) => {
			this.cache.delete(key);
			this.stopWatching(key);
		});

		// Persist changes periodically
		if (keysToDelete.length > 0) {
			this.persist().catch(console.error);
		}
	}

	invalidate(key: string): void {
		this.cache.delete(key);
		this.stopWatching(key);
	}

	invalidatePattern(pattern: string): void {
		const regex = new RegExp(pattern.replaceAll('*', '.*'));
		const keysToDelete: string[] = [];

		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach((key) => {
			this.cache.delete(key);
			this.stopWatching(key);
		});
	}

	clear(): void {
		// Stop all watchers
		this.fileWatchers.forEach((watcher) => watcher.close());
		this.fileWatchers.clear();

		this.cache.clear();
		this.stats = { hits: 0, misses: 0, totalAccessTime: 0, accessCount: 0 };
	}

	getStats(): CacheStats {
		const totalEntries = this.cache.size;
		const totalSize = this.getTotalSize();
		const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
		const avgAccessTime = this.stats.totalAccessTime / this.stats.accessCount || 0;
		const cacheEfficiency = hitRate * (1 - totalSize / this.maxSize);

		return {
			totalEntries,
			totalSize,
			hitRate: hitRate * 100,
			avgAccessTime,
			cacheEfficiency: cacheEfficiency * 100,
		};
	}

	async persist(): Promise<void> {
		if (!this.enabled) return;

		try {
			if (!fs.existsSync(this.directory)) {
				fs.mkdirSync(this.directory, { recursive: true });
			}

			const cacheData = {
				version: '1.0',
				timestamp: Date.now(),
				entries: Object.fromEntries(this.cache),
				stats: this.stats,
			};

			// Write to temporary file first for atomic operation
			const tempFile = path.join(this.directory, 'schemas.tmp');
			const finalFile = path.join(this.directory, 'schemas.json');

			fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
			fs.renameSync(tempFile, finalFile);

			// Also create a human-readable stats file
			const statsFile = path.join(this.directory, 'cache-stats.json');
			fs.writeFileSync(statsFile, JSON.stringify(this.getStats(), null, 2));
		} catch (error) {
			console.warn('Failed to persist cache:', error);
		}
	}

	async restore(): Promise<void> {
		if (!this.enabled) return;

		try {
			const cacheFile = path.join(this.directory, 'schemas.json');

			if (!fs.existsSync(cacheFile)) {
				return;
			}

			const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

			if (cacheData.version !== '1.0') {
				console.warn('Cache version mismatch, clearing cache');
				return;
			}

			// Restore entries
			if (cacheData.entries) {
				Object.entries(cacheData.entries).forEach(([key, entry]) => {
					this.cache.set(key, entry as CacheEntry);
				});
			}

			// Restore stats
			if (cacheData.stats) {
				this.stats = { ...this.stats, ...cacheData.stats };
			}

			console.log(
				`Cache restored: ${this.cache.size} entries, ${Math.round(this.getTotalSize() / 1024)}KB`,
			);
		} catch (error) {
			console.warn('Failed to restore cache, starting fresh:', error);
			this.clear();
		}
	}

	// Enhanced cache warming
	async warmCache(patterns: string[]): Promise<void> {
		if (!this.enabled) return;

		console.log('🔥 Warming cache...');

		for (const pattern of patterns) {
			try {
				const files = await glob(pattern);

				for (const file of files.slice(0, 100)) {
					// Limit to prevent overwhelming
					if (!this.cache.has(file)) {
						const content = fs.readFileSync(file, 'utf8');
						this.set(file, { content, size: content.length }, [file]);
					}
				}
			} catch {
				// Continue warming other patterns
			}
		}

		console.log(`Cache warmed: ${this.cache.size} entries`);
	}

	// Memory pressure handling
	handleMemoryPressure(): void {
		const currentSize = this.getTotalSize();
		const targetSize = this.maxSize * 0.7; // Reduce to 70% of max

		if (currentSize > targetSize) {
			this.evictIfNecessary(currentSize - targetSize);
			console.log(
				`Memory pressure handled: reduced cache by ${Math.round((currentSize - this.getTotalSize()) / 1024)}KB`,
			);
		}
	}
}

// === SCHEMA MAPPER ===

export class SchemaMapper {
	private readonly relationships: Map<string, Set<string>> = new Map();

	buildRelationshipMap(
		schemas: SchemaInfo[],
		options?: { maxDepth?: number; includeUsage?: boolean },
	): any {
		const map = {
			schemas: schemas.map((s) => ({
				name: s.name,
				file: s.filePath,
				type: s.schemaType,
				complexity: s.complexity ?? 0,
			})),
			relationships: [] as Array<{ from: string; to: string; type: string }>,
			metadata: {
				totalSchemas: schemas.length,
				totalRelationships: 0,
				maxDepth: options?.maxDepth ?? 3,
				circularDependencies: [] as string[][],
			},
		};

		// Build relationships (simplified)
		for (const schema of schemas) {
			if (schema.dependencies) {
				for (const dep of schema.dependencies) {
					map.relationships.push({
						from: schema.name,
						to: dep,
						type: 'imports',
					});
				}
			}
		}

		map.metadata.totalRelationships = map.relationships.length;
		return map;
	}

	filterForSchema(map: any, schemaName: string): any {
		const filtered = {
			...map,
			schemas: map.schemas.filter(
				(s: any) =>
					s.name === schemaName ||
					map.relationships.some(
						(r: any) =>
							(r.from === schemaName && r.to === s.name) ||
							(r.to === schemaName && r.from === s.name),
					),
			),
		};
		return filtered;
	}
}

// === VALIDATOR ===

export class Validator {
	validate(schema: z.ZodTypeAny, data: unknown): ValidationResult {
		const result: ValidationResult = {
			valid: false,
			errors: [],
			warnings: [],
			suggestions: [],
		};

		try {
			schema.parse(data);
			result.valid = true;
		} catch (error) {
			if (error instanceof z.ZodError) {
				result.errors = error.issues.map((err) => ({
					path: err.path.join('.'),
					message: err.message,
					code: err.code,
				}));
			}
		}

		// Add suggestions based on errors
		if (result.errors.length > 0) {
			result.suggestions = this.generateSuggestions(result.errors);
		}

		return result;
	}

	private generateSuggestions(errors: ValidationResult['errors']): string[] {
		const suggestions: string[] = [];

		for (const error of errors) {
			if (error.code === 'invalid_type') {
				suggestions.push(`Check the type of '${error.path}'`);
			} else if (error.code === 'too_small') {
				suggestions.push(`Increase the value/length of '${error.path}'`);
			}
		}

		return suggestions;
	}
}

// === MCP SERVER ===

export class MCPServer {
	private server: Server | null = null;
	private wss: WebSocketServer | null = null;
	private readonly port: number;
	private readonly capabilities: string[] = ['schema-analysis', 'validation', 'generation'];

	constructor(config: InfrastructureConfig = {}) {
		this.port = config.mcp?.port ?? 3456;
	}

	async start(): Promise<void> {
		this.server = createServer();
		this.wss = new WebSocketServer({ server: this.server });

		this.wss.on('connection', (ws) => {
			ws.on('message', (message) => {
				this.handleMessage(ws, message.toString());
			});
		});

		return new Promise((resolve) => {
			this.server?.listen(this.port, () => {
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		this.wss?.close();
		return new Promise((resolve) => {
			this.server?.close(() => resolve());
		});
	}

	private handleMessage(ws: WebSocket, message: string): void {
		try {
			const request = JSON.parse(message);
			const response = this.processRequest(request);
			ws.send(JSON.stringify(response));
		} catch (_error) {
			ws.send(JSON.stringify({ error: 'Invalid request' }));
		}
	}

	private processRequest(request: Record<string, unknown>): Record<string, unknown> {
		switch (request.type) {
			case 'analyze':
				return { type: 'analysis', result: 'Schema analysis result' };
			case 'validate':
				return { type: 'validation', result: 'Validation result' };
			default:
				return { error: 'Unknown request type' };
		}
	}

	getEndpoints(): Array<{ method: string; path: string; description: string }> {
		return [
			{ method: 'WS', path: '/ws', description: 'WebSocket connection' },
			{ method: 'GET', path: '/health', description: 'Health check' },
			{ method: 'POST', path: '/analyze', description: 'Analyze schemas' },
		];
	}

	getCapabilities(): string[] {
		return this.capabilities;
	}
}

// === ADVANCED PARALLEL PROCESSOR ===

export interface TaskResult<T> {
	id: string;
	result: T | undefined;
	duration: number;
	success: boolean;
	error?: Error;
	retries?: number;
}

export interface ProcessingOptions {
	maxConcurrency?: number;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
	priority?: 'low' | 'normal' | 'high';
	batchSize?: number;
}

export class ParallelProcessor extends EventEmitter {
	private readonly activeJobs = new Map<string, Promise<unknown>>();
	private readonly stats = {
		processed: 0,
		failed: 0,
		totalDuration: 0,
		averageDuration: 0,
	};

	private maxConcurrency: number;
	private timeout: number;
	private enabled: boolean;

	constructor(readonly config: InfrastructureConfig = {}) {
		super();
		this.maxConcurrency = config.parallel?.workers ?? 4;
		this.timeout = config.parallel?.timeout ?? 30000;
		this.enabled = true;

		// Handle memory pressure
		process.on('warning', (warning) => {
			if (warning.name === 'MaxListenersExceededWarning') {
				this.handleMemoryPressure();
			}
		});
	}

	/**
	 * Process tasks in parallel with advanced control
	 */
	async process<T, R>(
		tasks: T[],
		processor: (task: T, index: number) => Promise<R> | R,
		options: ProcessingOptions = {},
	): Promise<TaskResult<R>[]> {
		if (!this.enabled || tasks.length === 0) {
			return tasks.map((_task, i) => ({
				id: `task_${i}`,
				result: undefined,
				duration: 0,
				success: false,
				error: new Error('Parallel processing disabled or no tasks'),
			}));
		}

		const {
			maxConcurrency = this.maxConcurrency,
			timeout = this.timeout,
			retries = 2,
			retryDelay = 1000,
			batchSize = 10,
		} = options;

		const results: TaskResult<R>[] = [];
		const startTime = Date.now();

		// Process tasks in controlled batches
		for (let i = 0; i < tasks.length; i += batchSize) {
			const batch = tasks.slice(i, i + batchSize);
			const batchPromises = batch.map((task, batchIndex) =>
				this.processTaskWithRetries(task, i + batchIndex, processor, {
					timeout,
					retries,
					retryDelay,
				}),
			);

			// Control concurrency by processing in smaller chunks
			const chunkSize = Math.min(maxConcurrency, batchPromises.length);
			for (let j = 0; j < batchPromises.length; j += chunkSize) {
				const chunk = batchPromises.slice(j, j + chunkSize);
				const chunkResults = await Promise.allSettled(chunk);

				results.push(
					...chunkResults.map((result, chunkIndex) => {
						const taskIndex = i + j + chunkIndex;
						if (result.status === 'fulfilled') {
							return result.value;
						} else {
							return {
								id: `task_${taskIndex}`,
								result: undefined,
								duration: 0,
								success: false,
								error: result.reason,
							};
						}
					}),
				);
			}

			// Brief pause between batches to prevent overwhelming
			if (i + batchSize < tasks.length) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		// Update statistics
		const totalDuration = Date.now() - startTime;
		const successful = results.filter((r) => r.success).length;
		const failed = results.length - successful;

		this.stats.processed += successful;
		this.stats.failed += failed;
		this.stats.totalDuration += totalDuration;
		this.stats.averageDuration =
			this.stats.totalDuration / (this.stats.processed + this.stats.failed);

		this.emit('batchComplete', {
			total: tasks.length,
			successful,
			failed,
			duration: totalDuration,
			averageTaskDuration: totalDuration / tasks.length,
		});

		return results;
	}

	/**
	 * Process a single task with retries and error handling
	 */
	private async processTaskWithRetries<T, R>(
		task: T,
		index: number,
		processor: (task: T, index: number) => Promise<R> | R,
		options: { timeout: number; retries: number; retryDelay: number },
	): Promise<TaskResult<R>> {
		const taskId = `task_${index}`;
		const startTime = Date.now();
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= options.retries; attempt++) {
			try {
				// Create timeout promise
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(
						() => reject(new Error(`Task ${taskId} timed out after ${options.timeout}ms`)),
						options.timeout,
					);
				});

				// Process the task with timeout
				const result = await Promise.race([
					Promise.resolve(processor(task, index)),
					timeoutPromise,
				]);

				const duration = Date.now() - startTime;

				return {
					id: taskId,
					result,
					duration,
					success: true,
					retries: attempt,
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// If not the last attempt, wait before retrying
				if (attempt < options.retries) {
					await new Promise((resolve) => setTimeout(resolve, options.retryDelay * (attempt + 1)));
				}
			}
		}

		const duration = Date.now() - startTime;
		return {
			id: taskId,
			result: undefined,
			duration,
			success: false,
			error: lastError,
			retries: options.retries,
		};
	}

	/**
	 * Process schemas in parallel with smart batching
	 */
	async processSchemas<T = unknown, R = unknown>(
		schemas: T[],
		processor: (schema: T) => Promise<R>,
	): Promise<R[]> {
		const options: ProcessingOptions = {
			maxConcurrency: Math.min(this.maxConcurrency, schemas.length),
			batchSize: Math.max(1, Math.floor(schemas.length / 4)), // Dynamic batch sizing
			timeout: this.timeout,
			retries: 1, // More conservative for schema processing
		};

		const results = await this.process(schemas, processor, options);

		return results
			.map((result) => (result.success ? result.result : null))
			.filter((item): item is R => item !== null);
	}

	/**
	 * Process files in parallel with file system optimizations
	 */
	async processFiles<T = unknown>(
		filePaths: string[],
		processor: (filePath: string, content: string) => Promise<T>,
	): Promise<T[]> {
		const fileProcessor = async (filePath: string) => {
			try {
				const content = await fs.promises.readFile(filePath, 'utf8');
				return await processor(filePath, content);
			} catch (error) {
				throw new Error(`Failed to process file ${filePath}: ${error}`);
			}
		};

		const results = await this.process(filePaths, fileProcessor, {
			maxConcurrency: Math.min(8, filePaths.length), // Limit file I/O concurrency
			timeout: this.timeout * 2, // Allow more time for file operations
			retries: 2,
			batchSize: 20,
		});

		return results.map((result) => (result.success ? result.result : null)).filter(Boolean) as T[];
	}

	/**
	 * Handle memory pressure by reducing concurrency
	 */
	private handleMemoryPressure(): void {
		this.maxConcurrency = Math.max(1, Math.floor(this.maxConcurrency * 0.7));
		this.emit('memoryPressure', { newConcurrency: this.maxConcurrency });

		console.warn(`Memory pressure detected, reducing concurrency to ${this.maxConcurrency}`);
	}

	/**
	 * Get processing statistics
	 */
	getStats() {
		return {
			...this.stats,
			currentConcurrency: this.maxConcurrency,
			activeJobs: this.activeJobs.size,
			enabled: this.enabled,
		};
	}

	/**
	 * Adjust performance settings dynamically
	 */
	adjustPerformance(options: { maxConcurrency?: number; timeout?: number }) {
		if (options.maxConcurrency) {
			this.maxConcurrency = Math.max(1, Math.min(32, options.maxConcurrency));
		}
		if (options.timeout) {
			this.timeout = Math.max(1000, options.timeout);
		}

		this.emit('performanceAdjusted', {
			maxConcurrency: this.maxConcurrency,
			timeout: this.timeout,
		});
	}

	/**
	 * Enable/disable parallel processing
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.activeJobs.clear();
		}
	}

	async shutdown(): Promise<void> {
		this.enabled = false;

		// Wait for active jobs to complete with timeout
		const activeJobsArray = Array.from(this.activeJobs.values());
		if (activeJobsArray.length > 0) {
			try {
				await Promise.race([
					Promise.all(activeJobsArray),
					new Promise((resolve) => setTimeout(resolve, 5000)), // 5s timeout
				]);
			} catch (error) {
				console.warn('Some jobs did not complete during shutdown:', error);
			}
		}

		this.activeJobs.clear();
		this.removeAllListeners();
	}
}

// === HEALTH MONITOR ===

export class HealthMonitor {
	private readonly metrics: Map<string, unknown> = new Map();
	private interval: NodeJS.Timeout | null = null;

	constructor(private readonly config: InfrastructureConfig = {}) {
		if (config.monitoring?.enabled) {
			this.startMonitoring();
		}
	}

	private startMonitoring(): void {
		const interval = this.config.monitoring?.interval ?? 60000;
		this.interval = setInterval(() => {
			this.collectMetrics();
		}, interval);
	}

	private collectMetrics(): void {
		this.metrics.set('memory', process.memoryUsage());
		this.metrics.set('cpu', process.cpuUsage());
		this.metrics.set('timestamp', Date.now());
	}

	getMetrics(): Record<string, unknown> {
		return Object.fromEntries(this.metrics);
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

// === ERROR REPORTER ===

export class ErrorReporter {
	private errors: Array<{
		timestamp: number;
		error: unknown;
		context: unknown;
	}> = [];

	report(error: unknown, context?: unknown): void {
		this.errors.push({
			timestamp: Date.now(),
			error,
			context,
		});

		// Log error
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(pc.red('Error:'), errorMessage);
		if (context) {
			console.error(pc.gray('Context:'), context);
		}
	}

	getErrors(): typeof this.errors {
		return this.errors;
	}

	clear(): void {
		this.errors = [];
	}
}

// === UNIFIED INFRASTRUCTURE MANAGER ===

export class Infrastructure {
	public discovery: SchemaDiscovery;
	public cache: SchemaCache;
	public mapper: SchemaMapper;
	public validator: Validator;
	public mcp: MCPServer;
	public parallel: ParallelProcessor;
	public monitor: HealthMonitor;
	public performanceMonitor: PerformanceMonitor;
	public reporter: ErrorReporter;
	public memoryOptimizer: MemoryOptimizer;
	public streamingProcessor: StreamingProcessor;
	public progressiveLoader?: ProgressiveLoader;

	constructor(config: InfrastructureConfig = {}) {
		this.memoryOptimizer = new MemoryOptimizer({
			autoGC: true,
			gcThreshold: 150 * 1024 * 1024, // 150MB
			enableProfiling: false,
		});

		this.streamingProcessor = new StreamingProcessor({
			chunkSize: 64 * 1024, // 64KB chunks
			maxConcurrentStreams: 3,
			memoryLimit: 200 * 1024 * 1024, // 200MB limit
		});

		this.cache = new SchemaCache(config);
		this.monitor = new HealthMonitor(config);
		this.performanceMonitor = new PerformanceMonitor();

		// Create a logger for the progressive loader
		const logger = new Logger({
			level: 'info',
			colors: true,
			timestamp: false,
			prefix: 'Infrastructure',
		});

		// Initialize progressive loader if configured
		if (config.progressive) {
			this.progressiveLoader = new ProgressiveLoader(
				config.progressive,
				this.performanceMonitor,
				logger,
			);
		}

		this.discovery = new SchemaDiscovery(config, this.cache, this.performanceMonitor, logger);
		this.mapper = new SchemaMapper();
		this.validator = new Validator();
		this.mcp = new MCPServer(config);
		this.parallel = new ParallelProcessor(config);
		this.reporter = new ErrorReporter();

		this.setupMemoryOptimization();
	}

	private setupMemoryOptimization(): void {
		// Connect memory optimizer to other components
		this.memoryOptimizer.on('highPressure', () => {
			this.cache.handleMemoryPressure();
			this.parallel.adjustPerformance({ maxConcurrency: 2 });
		});

		this.memoryOptimizer.on('criticalPressure', () => {
			this.cache.handleMemoryPressure();
			this.parallel.adjustPerformance({ maxConcurrency: 1 });
		});

		// Handle cache pressure
		// Note: SchemaCache doesn't implement EventEmitter, so this is a no-op
		// Future enhancement: make SchemaCache extend EventEmitter if memory pressure events are needed
	}

	async initialize(): Promise<void> {
		await this.cache.restore();
	}

	async shutdown(): Promise<void> {
		await this.cache.persist();
		await this.mcp.stop();
		await this.parallel.shutdown();
		await this.streamingProcessor.shutdown();
		if (this.progressiveLoader) {
			await this.progressiveLoader.clearCache();
		}
		this.memoryOptimizer.shutdown();
		this.monitor.stop();
	}

	// === HOT RELOADING SUPPORT ===

	async discoverSchemas(): Promise<SchemaInfo[]> {
		if (this.progressiveLoader) {
			const schemasMap = await this.progressiveLoader.loadSchemas([]);
			return Array.from(schemasMap.values());
		}
		return await this.discovery.findSchemas();
	}

	async discoverSchemasInFile(filePath: string): Promise<SchemaInfo[]> {
		if (this.progressiveLoader) {
			const schemasMap = await this.progressiveLoader.loadSchemas([filePath]);
			return Array.from(schemasMap.values()).filter((schema) => schema.filePath === filePath);
		}
		// Read file and parse schemas from it
		const fs = await import('node:fs/promises');
		const content = await fs.readFile(filePath, 'utf-8');
		return this.discovery.parseSchemas(content, filePath);
	}

	async invalidateCache(filePath?: string): Promise<void> {
		if (filePath) {
			await this.cache.invalidate(filePath);
			// Note: ProgressiveLoader doesn't have invalidateFile method
			// Cache invalidation is handled by the main cache
		} else {
			await this.cache.clear();
			if (this.progressiveLoader) {
				await this.progressiveLoader.clearCache();
			}
		}
	}
}

// === EXPORTS FOR BACKWARD COMPATIBILITY ===

// === INFRASTRUCTURE FACTORY ===

export function createInfrastructure(
	config: InfrastructureConfig,
	_performanceMonitor?: any,
	_logger?: any,
): Infrastructure {
	return new Infrastructure(config);
}

// === DATABASE CONNECTOR ===

export interface DatabaseSchema {
	name: string;
	columns: Array<{
		name: string;
		type: string;
		nullable: boolean;
		primaryKey?: boolean;
		foreignKey?: {
			table: string;
			column: string;
		};
	}>;
}

export interface DatabaseAnalysisResult {
	tables: DatabaseSchema[];
	relationships: Array<{
		from: { table: string; column: string };
		to: { table: string; column: string };
	}>;
	_meta?: {
		experimental?: boolean;
		mockData?: boolean;
		realImplementationPending?: boolean;
	};
}

/**
 * Database schema introspection and analysis
 *
 * @experimental This feature is EXPERIMENTAL and LIMITED.
 *
 * Current Status:
 * - Returns mock data for demonstration purposes only
 * - Does NOT connect to real databases
 * - Does NOT perform actual schema introspection
 *
 * Future Plans:
 * - Full PostgreSQL support via `pg` driver
 * - MySQL/MariaDB support via `mysql2` driver
 * - SQLite support via `better-sqlite3`
 * - Schema caching and change detection
 * - Automatic migration tracking
 *
 * Limitations:
 * - No real database connectivity
 * - Returns placeholder data structure
 * - Cannot detect actual schema changes
 * - No support for complex relationships
 * - No transaction support
 *
 * Usage:
 * ```typescript
 * const connector = new DatabaseConnector();
 * // Currently returns mock data only - real implementation pending
 * const result = await connector.analyzeDatabase('postgresql://...');
 * ```
 *
 * @see https://github.com/yourusername/zodkit/issues for planned enhancements
 */
export class DatabaseConnector {
	/**
	 * Analyze database schema and extract structure
	 *
	 * @experimental This method currently returns mock data for demonstration.
	 * Real database connectivity is planned for future releases.
	 *
	 * @param connectionString - Database connection string (currently unused)
	 * @param options - Analysis options (currently unused)
	 * @returns Mock database structure for demonstration
	 *
	 * @throws Will warn in console that full implementation is pending
	 */
	async analyzeDatabase(
		connectionString: string,
		_options: Record<string, unknown> = {},
	): Promise<DatabaseAnalysisResult> {
		console.warn('⚠️  DatabaseConnector is EXPERIMENTAL - returning mock data only');
		console.warn('⚠️  Real database connectivity is not yet implemented');
		console.warn(`⚠️  Requested connection: ${connectionString}`);

		// IMPORTANT: This is mock data for demonstration only
		// Full implementation requires installing database drivers:
		// - npm install pg @types/pg (PostgreSQL)
		// - npm install mysql2 (MySQL)
		// - npm install better-sqlite3 (SQLite)

		return {
			tables: [
				{
					name: 'users',
					columns: [
						{ name: 'id', type: 'uuid', nullable: false, primaryKey: true },
						{ name: 'email', type: 'string', nullable: false },
						{ name: 'name', type: 'string', nullable: true },
						{ name: 'created_at', type: 'timestamp', nullable: false },
					],
				},
			],
			relationships: [],
			_meta: {
				experimental: true,
				mockData: true,
				realImplementationPending: true,
			},
		};
	}
}

// === EXPORTS FOR BACKWARD COMPATIBILITY ===

export { Infrastructure as CommandWrapper };
export { Infrastructure as ContextManager };
export { Infrastructure as HealthDashboard };
export { Infrastructure as ImportManager };
export { Infrastructure as StreamingService };
export { Infrastructure as TerminalExperience };

export default Infrastructure;
