"use strict";
/**
 * @fileoverview Unit Tests for Hot Reload System
 * @module HotReloadTests
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const hot_reload_1 = require("../../src/core/hot-reload");
const events_1 = require("events");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Mock dependencies
jest.mock('chokidar');
jest.mock('fs/promises');
describe('HotReloadManager', () => {
    let hotReload;
    let mockPerformanceMonitor;
    let mockLogger;
    let mockInfrastructure;
    let testConfig;
    let tempDir;
    beforeEach(async () => {
        // Create temp directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zodkit-test-'));
        // Setup mocks
        mockPerformanceMonitor = {
            recordEvent: jest.fn(),
            getStats: jest.fn(),
            startTimer: jest.fn(),
            endTimer: jest.fn()
        };
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };
        mockInfrastructure = {
            discoverSchemas: jest.fn().mockResolvedValue([]),
            discoverSchemasInFile: jest.fn().mockResolvedValue([]),
            invalidateCache: jest.fn().mockResolvedValue(undefined)
        };
        testConfig = {
            enabled: true,
            patterns: ['**/*.ts', '**/*.js'],
            ignored: ['**/node_modules/**'],
            debounceMs: 100,
            dependencyTracking: {
                enabled: true,
                maxDepth: 5,
                trackImports: true,
                trackTypes: true,
                trackReExports: true
            },
            invalidation: {
                strategy: 'smart',
                cascadeInvalidation: true,
                preserveCache: false,
                maxCacheAge: 300000
            },
            performance: {
                maxReloadTime: 5000,
                throttleReloads: true,
                batchUpdates: true,
                updateBatchSize: 10
            }
        };
        hotReload = new hot_reload_1.HotReloadManager(testConfig, mockPerformanceMonitor, mockLogger);
        hotReload.setInfrastructure(mockInfrastructure);
    });
    afterEach(async () => {
        await hotReload.stop();
        // Cleanup temp directory
        try {
            await fs.rmdir(tempDir, { recursive: true });
        }
        catch {
            // Ignore cleanup errors
        }
    });
    describe('Configuration and Initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(hotReload).toBeInstanceOf(hot_reload_1.HotReloadManager);
            expect(hotReload).toBeInstanceOf(events_1.EventEmitter);
        });
        it('should not start when disabled', async () => {
            const disabledConfig = { ...testConfig, enabled: false };
            const disabledHotReload = new hot_reload_1.HotReloadManager(disabledConfig, mockPerformanceMonitor, mockLogger);
            await disabledHotReload.start();
            expect(mockLogger.debug).toHaveBeenCalledWith('Hot reload is disabled');
        });
        it('should start successfully when enabled', async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([
                { filePath: '/test/schema1.ts', name: 'Schema1' },
                { filePath: '/test/schema2.ts', name: 'Schema2' }
            ]);
            // Mock fs operations
            fs.stat.mockResolvedValue({
                mtime: new Date(),
                isFile: () => true
            });
            fs.readFile.mockResolvedValue('export const schema = z.object({});');
            await hotReload.start();
            expect(mockLogger.info).toHaveBeenCalledWith('Starting hot reload system...');
            expect(mockInfrastructure.discoverSchemas).toHaveBeenCalled();
        });
    });
    describe('Dependency Graph Building', () => {
        it('should build dependency graph from discovered schemas', async () => {
            const testSchemas = [
                { filePath: '/test/user.schema.ts', name: 'UserSchema' },
                { filePath: '/test/post.schema.ts', name: 'PostSchema' }
            ];
            mockInfrastructure.discoverSchemas.mockResolvedValue(testSchemas);
            fs.stat.mockResolvedValue({
                mtime: new Date(),
                isFile: () => true
            });
            fs.readFile.mockResolvedValue('export const schema = z.object({});');
            await hotReload.start();
            const dependencyGraph = hotReload.getDependencyGraph();
            expect(dependencyGraph.size).toBeGreaterThan(0);
        });
        it('should track dependencies between files', async () => {
            const userSchemaContent = `
        import { z } from 'zod';
        import { BaseSchema } from './base.schema';
        export const UserSchema = z.object({ id: z.string() });
      `;
            const baseSchemaContent = `
        import { z } from 'zod';
        export const BaseSchema = z.object({ createdAt: z.date() });
      `;
            mockInfrastructure.discoverSchemas.mockResolvedValue([
                { filePath: '/test/user.schema.ts', name: 'UserSchema' },
                { filePath: '/test/base.schema.ts', name: 'BaseSchema' }
            ]);
            fs.stat.mockResolvedValue({
                mtime: new Date(),
                isFile: () => true
            });
            fs.readFile
                .mockResolvedValueOnce(userSchemaContent)
                .mockResolvedValueOnce(baseSchemaContent);
            await hotReload.start();
            const dependencyGraph = hotReload.getDependencyGraph();
            const userNode = dependencyGraph.get(path.resolve('/test/user.schema.ts'));
            expect(userNode).toBeDefined();
            expect(userNode?.dependencies.size).toBeGreaterThan(0);
        });
        it('should extract different types of imports', () => {
            const testContent = `
        import { z } from 'zod';
        import type { Schema } from './types';
        import('./dynamic-import');
        const require = require('./commonjs-import');
        export { exported } from './re-export';
      `;
            // We need to access the private method for testing
            const dependencies = hotReload.extractDependencies(testContent, '/test/file.ts');
            expect(dependencies.has('./types')).toBe(true);
            expect(dependencies.has('./dynamic-import')).toBe(true);
            expect(dependencies.has('./commonjs-import')).toBe(true);
            expect(dependencies.has('./re-export')).toBe(true);
            expect(dependencies.has('zod')).toBe(false); // External dependency
        });
    });
    describe('File Change Handling', () => {
        beforeEach(async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            fs.stat.mockResolvedValue({
                mtime: new Date(),
                isFile: () => true
            });
            fs.readFile.mockResolvedValue('export const schema = z.object({});');
            await hotReload.start();
        });
        it('should handle file changes with debouncing', async () => {
            const testFile = '/test/schema.ts';
            const eventPromise = new Promise(resolve => {
                hotReload.once('file-changed', resolve);
            });
            // Simulate file change
            await hotReload.handleFileChange(testFile, 'change');
            // Wait for debounced event
            const event = await eventPromise;
            expect(event).toHaveProperty('type', 'file-changed');
            expect(event).toHaveProperty('filePath', path.resolve(testFile));
        });
        it('should process file additions', async () => {
            const testFile = '/test/new-schema.ts';
            fs.stat.mockResolvedValue({
                mtime: new Date(),
                isFile: () => true
            });
            fs.readFile.mockResolvedValue('export const newSchema = z.object({});');
            await hotReload.processFileChange(testFile, 'add');
            expect(mockInfrastructure.invalidateCache).toHaveBeenCalledWith(path.resolve(testFile));
            expect(mockInfrastructure.discoverSchemasInFile).toHaveBeenCalledWith(path.resolve(testFile));
        });
        it('should handle file removals', async () => {
            const testFile = '/test/removed-schema.ts';
            // First add the file to dependency graph
            const node = {
                filePath: path.resolve(testFile),
                dependencies: new Set(['/test/dependency.ts']),
                dependents: new Set(['/test/dependent.ts']),
                lastModified: Date.now(),
                hash: 'test-hash',
                invalidated: false
            };
            hotReload.dependencyGraph.set(path.resolve(testFile), node);
            await hotReload.handleFileRemoval(testFile);
            const dependencyGraph = hotReload.getDependencyGraph();
            expect(dependencyGraph.has(path.resolve(testFile))).toBe(false);
        });
    });
    describe('Invalidation Strategies', () => {
        beforeEach(async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            await hotReload.start();
        });
        it('should calculate invalidation set correctly', () => {
            // Setup dependency chain: A -> B -> C
            const fileA = '/test/a.ts';
            const fileB = '/test/b.ts';
            const fileC = '/test/c.ts';
            const nodeA = {
                filePath: path.resolve(fileA),
                dependencies: new Set([path.resolve(fileB)]),
                dependents: new Set(),
                lastModified: Date.now(),
                hash: 'hash-a',
                invalidated: false
            };
            const nodeB = {
                filePath: path.resolve(fileB),
                dependencies: new Set([path.resolve(fileC)]),
                dependents: new Set([path.resolve(fileA)]),
                lastModified: Date.now(),
                hash: 'hash-b',
                invalidated: false
            };
            const nodeC = {
                filePath: path.resolve(fileC),
                dependencies: new Set(),
                dependents: new Set([path.resolve(fileB)]),
                lastModified: Date.now(),
                hash: 'hash-c',
                invalidated: false
            };
            hotReload.dependencyGraph.set(path.resolve(fileA), nodeA);
            hotReload.dependencyGraph.set(path.resolve(fileB), nodeB);
            hotReload.dependencyGraph.set(path.resolve(fileC), nodeC);
            const invalidationSet = hotReload.calculateInvalidationSet(fileC);
            expect(invalidationSet.has(path.resolve(fileC))).toBe(true);
            expect(invalidationSet.has(path.resolve(fileB))).toBe(true);
            expect(invalidationSet.has(path.resolve(fileA))).toBe(true);
        });
        it('should respect max depth in invalidation', () => {
            const shallowConfig = {
                ...testConfig,
                dependencyTracking: {
                    ...testConfig.dependencyTracking,
                    maxDepth: 1
                }
            };
            const shallowHotReload = new hot_reload_1.HotReloadManager(shallowConfig, mockPerformanceMonitor, mockLogger);
            // Test that deep dependencies are not invalidated beyond maxDepth
            const testFile = '/test/deep.ts';
            const invalidationSet = shallowHotReload.calculateInvalidationSet(testFile);
            expect(invalidationSet.size).toBeLessThanOrEqual(2); // File itself + 1 level
        });
    });
    describe('Performance and Batching', () => {
        beforeEach(async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            await hotReload.start();
        });
        it('should batch multiple file updates', async () => {
            const files = ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts'];
            // Add files to reload queue
            files.forEach(file => {
                hotReload.reloadQueue.set(path.resolve(file), Date.now());
            });
            const eventPromise = new Promise(resolve => {
                hotReload.once('reload-complete', resolve);
            });
            await hotReload.processBatchedReloads();
            const event = await eventPromise;
            expect(event).toHaveProperty('type', 'reload-complete');
            expect(event).toHaveProperty('dependentFiles');
        });
        it('should record performance metrics', async () => {
            const testFile = '/test/perf-test.ts';
            await hotReload.processFileChange(testFile, 'change');
            expect(mockPerformanceMonitor.recordEvent).toHaveBeenCalledWith('hot-reload', expect.any(Number));
        });
        it('should handle reload queue correctly', () => {
            const testFiles = ['/test/file1.ts', '/test/file2.ts'];
            testFiles.forEach(file => {
                hotReload.reloadQueue.set(path.resolve(file), Date.now());
            });
            const queueFiles = hotReload.getReloadQueue();
            expect(queueFiles).toHaveLength(2);
            expect(queueFiles).toContain(path.resolve(testFiles[0]));
            expect(queueFiles).toContain(path.resolve(testFiles[1]));
        });
    });
    describe('Public API', () => {
        beforeEach(async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            await hotReload.start();
        });
        it('should provide access to dependency graph', () => {
            const graph = hotReload.getDependencyGraph();
            expect(graph).toBeInstanceOf(Map);
        });
        it('should provide file statistics', () => {
            const testFile = '/test/stats.ts';
            const testNode = {
                filePath: path.resolve(testFile),
                dependencies: new Set(),
                dependents: new Set(),
                lastModified: Date.now(),
                hash: 'test-hash',
                invalidated: false
            };
            hotReload.dependencyGraph.set(path.resolve(testFile), testNode);
            const stats = hotReload.getFileStats(testFile);
            expect(stats).toEqual(testNode);
        });
        it('should allow manual file invalidation', async () => {
            const testFile = '/test/manual.ts';
            await hotReload.invalidateFile(testFile);
            const queueFiles = hotReload.getReloadQueue();
            expect(queueFiles).toContain(path.resolve(testFile));
        });
        it('should clear cache correctly', async () => {
            // Add some data to cache
            hotReload.reloadQueue.set('/test/file.ts', Date.now());
            await hotReload.clearCache();
            expect(hotReload.getDependencyGraph().size).toBe(0);
            expect(hotReload.getReloadQueue()).toHaveLength(0);
            expect(mockLogger.debug).toHaveBeenCalledWith('Hot reload cache cleared');
        });
    });
    describe('Error Handling', () => {
        it('should handle file read errors gracefully', async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([
                { filePath: '/test/broken.ts', name: 'BrokenSchema' }
            ]);
            fs.stat.mockRejectedValue(new Error('File not found'));
            await expect(hotReload.start()).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });
        it('should handle infrastructure errors', async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            await hotReload.start();
            mockInfrastructure.invalidateCache.mockRejectedValue(new Error('Cache error'));
            const testFile = '/test/error.ts';
            await expect(hotReload.reloadFile(testFile)).rejects.toThrow('Cache error');
        });
        it('should emit error events on watcher errors', async () => {
            await hotReload.start();
            const errorPromise = new Promise(resolve => {
                hotReload.once('error', resolve);
            });
            // Simulate watcher error
            const mockError = new Error('Watcher error');
            hotReload.watcher?.emit('error', mockError);
            const error = await errorPromise;
            expect(error).toBe(mockError);
        });
    });
    describe('Event Emission', () => {
        beforeEach(async () => {
            mockInfrastructure.discoverSchemas.mockResolvedValue([]);
            await hotReload.start();
        });
        it('should emit started event', async () => {
            const newHotReload = new hot_reload_1.HotReloadManager(testConfig, mockPerformanceMonitor, mockLogger);
            newHotReload.setInfrastructure(mockInfrastructure);
            const startedPromise = new Promise(resolve => {
                newHotReload.once('started', resolve);
            });
            await newHotReload.start();
            await startedPromise;
            expect(true).toBe(true); // Event was emitted
            await newHotReload.stop();
        });
        it('should emit stopped event', async () => {
            const stoppedPromise = new Promise(resolve => {
                hotReload.once('stopped', resolve);
            });
            await hotReload.stop();
            await stoppedPromise;
            expect(true).toBe(true); // Event was emitted
        });
    });
});
//# sourceMappingURL=hot-reload.test.js.map