/**
 * @fileoverview Watch Command Implementation
 * @module WatchCommand
 *
 * CLI command for starting hot reload monitoring with real-time schema updates.
 */

import { relative } from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig } from '../../core/config';
import { type HotReloadConfig, HotReloadManager } from '../../core/hot-reload';
import { createInfrastructure } from '../../core/infrastructure';
import { PerformanceMonitor } from '../../core/performance-monitor';
import { Logger } from '../../utils/logger';
import { createCommand as createCommandConfig } from '../command-builder';

export interface WatchOptions {
	config?: string;
	patterns?: string[];
	ignore?: string[];
	debounce?: number;
	verbose?: boolean;
	performance?: boolean;
	dependency?: boolean;
	strategy?: 'conservative' | 'aggressive' | 'smart';
}

export const watchCommandConfig = createCommandConfig(
	'watch',
	'Watch for schema changes and hot reload automatically',
	undefined,
) as any;

export async function watchCommand(options: WatchOptions = {}, _command?: Command): Promise<void> {
	const startTime = Date.now();

	try {
		// Load configuration
		const config = await loadConfig(options.config);

		// Initialize infrastructure
		const performanceMonitor = new PerformanceMonitor(options.performance !== false);

		const logger = new Logger({
			level: options.verbose ? 'debug' : 'info',
		} as any);

		const infrastructure = createInfrastructure(config as any, performanceMonitor, logger);

		// Configure hot reload
		const hotReloadConfig: HotReloadConfig = {
			enabled: true,
			patterns: options.patterns ||
				(config as any).discovery?.patterns || ['src/**/*.ts', '**/*.schema.ts'],
			ignored: options.ignore || [
				'**/node_modules/**',
				'**/.git/**',
				'**/dist/**',
				'**/build/**',
				'**/*.d.ts',
				'**/*.test.ts',
				'**/*.spec.ts',
			],
			debounceMs: options.debounce || 300,
			dependencyTracking: {
				enabled: options.dependency !== false,
				maxDepth: 5,
				trackImports: true,
				trackTypes: true,
				trackReExports: true,
			},
			invalidation: {
				strategy: options.strategy || 'smart',
				cascadeInvalidation: true,
				preserveCache: false,
				maxCacheAge: 5 * 60 * 1000, // 5 minutes
			},
			performance: {
				maxReloadTime: 5000,
				throttleReloads: true,
				batchUpdates: true,
				updateBatchSize: 10,
			},
		};

		const hotReloadManager = new HotReloadManager(hotReloadConfig, performanceMonitor, logger);
		hotReloadManager.setInfrastructure(infrastructure);

		// Setup event handlers
		setupEventHandlers(hotReloadManager, logger);

		// Start systems
		logger.info(pc.blue('🔥 Starting ZodKit hot reload watcher...'));

		await infrastructure.initialize();
		await hotReloadManager.start();

		const initTime = Date.now() - startTime;
		const patterns = hotReloadConfig.patterns.join(', ');

		console.log(`\n${pc.green('✅ Hot reload system started')} ${pc.gray(`(${initTime}ms)`)}`);
		console.log(`${pc.blue('👀 Watching:')} ${pc.cyan(patterns)}`);
		console.log(`${pc.blue('🎯 Strategy:')} ${pc.yellow(hotReloadConfig.invalidation.strategy)}`);
		console.log(
			`${pc.blue('⚡ Dependency tracking:')} ${pc.yellow(hotReloadConfig.dependencyTracking.enabled ? 'enabled' : 'disabled')}`,
		);

		const dependencyGraph = hotReloadManager.getDependencyGraph();
		console.log(`${pc.blue('📊 Tracking:')} ${pc.cyan(`${dependencyGraph.size} files`)}`);

		console.log(`\n${pc.gray('Press Ctrl+C to stop watching...')}\n`);

		// Track all active timers and intervals for cleanup
		const activeTimers: Set<NodeJS.Timeout> = new Set();
		let isShuttingDown = false;

		// Keep the process alive with tracked timeout
		const keepAlive = () => {
			if (isShuttingDown) return;
			const timeout = setTimeout(() => {
				activeTimers.delete(timeout);
				keepAlive();
			}, 1000);
			activeTimers.add(timeout);
		};
		keepAlive();

		// Handle graceful shutdown
		const shutdown = async () => {
			if (isShuttingDown) return;
			isShuttingDown = true;

			logger.info('Shutting down hot reload system...');

			// Clear all active timers immediately
			for (const timer of activeTimers) {
				clearTimeout(timer);
			}
			activeTimers.clear();

			try {
				// Stop hot reload manager with timeout
				await Promise.race([
					hotReloadManager.stop(),
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error('Hot reload stop timeout')), 2000),
					),
				]).catch((err) => {
					if (options.verbose) logger.debug('Hot reload stop error:', err);
				});

				// Shutdown infrastructure with timeout
				if (infrastructure.shutdown) {
					await Promise.race([
						infrastructure.shutdown(),
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error('Infrastructure shutdown timeout')), 2000),
						),
					]).catch((err) => {
						if (options.verbose) logger.debug('Infrastructure shutdown error:', err);
					});
				}

				console.log(`\n${pc.green('✅ Hot reload system stopped gracefully')}`);
			} catch (error) {
				if (options.verbose) {
					logger.error('Error during shutdown:', error);
				}
			} finally {
				// Force exit immediately - no setTimeout needed
				process.exit(0);
			}
		};

		// Register shutdown handlers
		process.once('SIGINT', shutdown);
		process.once('SIGTERM', shutdown);
	} catch (error) {
		console.error(`${pc.red('❌ Failed to start hot reload system:')}`);
		console.error(error instanceof Error ? error.message : String(error));

		if (options.verbose && error instanceof Error && error.stack) {
			console.error('\nStack trace:');
			console.error(pc.gray(error.stack));
		}

		process.exit(1);
	}
}

function setupEventHandlers(hotReloadManager: HotReloadManager, logger: Logger): void {
	let reloadCount = 0;
	let lastReloadTime = Date.now();

	hotReloadManager.on('file-changed', (event) => {
		reloadCount++;
		const _timeSinceLastReload = Date.now() - lastReloadTime;
		lastReloadTime = Date.now();

		const relativePath = relative(process.cwd(), event.filePath);
		const reloadTime = event.reloadTime ? `${event.reloadTime}ms` : 'unknown';

		console.log(
			`${pc.cyan('🔄')} ${pc.green(relativePath)} ${pc.gray(`(${reloadTime}, #${reloadCount})`)}`,
		);

		if (event.dependentFiles && event.dependentFiles.length > 0) {
			const dependentCount = event.dependentFiles.length;
			console.log(
				`   ${pc.gray(`↳ Updated ${dependentCount} dependent file${dependentCount === 1 ? '' : 's'}`)}`,
			);
		}
	});

	hotReloadManager.on('dependency-updated', (event) => {
		const relativePath = relative(process.cwd(), event.filePath);
		console.log(`${pc.yellow('🔗')} ${pc.blue('Dependency:')} ${pc.cyan(relativePath)}`);
	});

	hotReloadManager.on('cache-invalidated', (event) => {
		const relativePath = relative(process.cwd(), event.filePath);
		console.log(`${pc.magenta('🗑️')} ${pc.blue('Cache invalidated:')} ${pc.cyan(relativePath)}`);
	});

	hotReloadManager.on('reload-complete', (event) => {
		const reloadTime = event.reloadTime ? `${event.reloadTime}ms` : 'unknown';
		const fileCount = event.dependentFiles?.length || 1;

		console.log(
			`${pc.green('✅')} ${pc.blue('Batch reload complete:')} ${pc.cyan(`${fileCount} files`)} ${pc.gray(`(${reloadTime})`)}`,
		);
	});

	hotReloadManager.on('error', (error) => {
		console.error(`${pc.red('❌ Hot reload error:')} ${error.message}`);
		logger.error('Hot reload error:', error);
	});

	hotReloadManager.on('started', () => {
		logger.debug('Hot reload manager started');
	});

	hotReloadManager.on('stopped', () => {
		logger.debug('Hot reload manager stopped');
	});

	// Display periodic statistics
	setInterval(() => {
		if (reloadCount > 0) {
			const dependencyGraph = hotReloadManager.getDependencyGraph();
			const queueSize = hotReloadManager.getReloadQueue().length;

			console.log(
				`${pc.blue('📊')} ${pc.gray(`Files: ${dependencyGraph.size}, Reloads: ${reloadCount}, Queue: ${queueSize}`)}`,
			);
		}
	}, 30000); // Every 30 seconds
}

export default watchCommand;
