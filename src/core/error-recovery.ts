/**
 * @fileoverview Comprehensive Error Recovery System
 * @module ErrorRecovery
 *
 * Handles error recovery, circuit breakers, and graceful degradation
 * Ensures ZodKit continues to function even when encountering issues
 */

import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as pc from 'picocolors';

// === ERROR TYPES ===

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
	operation: string;
	file?: string;
	schema?: string;
	command?: string;
	args?: any[];
	timestamp: number;
	stackTrace?: string;
}

export interface RecoveryAction {
	type: 'retry' | 'fallback' | 'skip' | 'abort';
	description: string;
	execute: () => Promise<any>;
}

export interface ErrorReport {
	id: string;
	error: Error;
	severity: ErrorSeverity;
	context: ErrorContext;
	recoveryActions: RecoveryAction[];
	resolved: boolean;
	attempts: number;
	lastAttempt: number;
}

// === CIRCUIT BREAKER ===

export interface CircuitBreakerConfig {
	failureThreshold: number;
	recoveryTimeout: number;
	monitoringPeriod: number;
}

export enum CircuitState {
	CLOSED = 'closed',
	OPEN = 'open',
	HALF_OPEN = 'half-open',
}

export class CircuitBreaker extends EventEmitter {
	private state: CircuitState = CircuitState.CLOSED;
	private failures: number = 0;
	private lastFailure: number = 0;
	private successes: number = 0;
	private readonly config: CircuitBreakerConfig;

	constructor(
		private readonly operation: string,
		config: Partial<CircuitBreakerConfig> = {},
	) {
		super();
		this.config = {
			failureThreshold: config.failureThreshold || 5,
			recoveryTimeout: config.recoveryTimeout || 60000, // 1 minute
			monitoringPeriod: config.monitoringPeriod || 300000, // 5 minutes
		};
	}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.state === CircuitState.OPEN) {
			if (Date.now() - this.lastFailure < this.config.recoveryTimeout) {
				throw new Error(`Circuit breaker is OPEN for ${this.operation}`);
			}
			this.state = CircuitState.HALF_OPEN;
		}

		try {
			const result = await fn();

			// Success handling
			if (this.state === CircuitState.HALF_OPEN) {
				this.reset();
			}
			this.successes++;

			return result;
		} catch (error) {
			this.recordFailure();
			throw error;
		}
	}

	private recordFailure(): void {
		this.failures++;
		this.lastFailure = Date.now();

		if (this.failures >= this.config.failureThreshold) {
			this.open();
		}

		this.emit('failure', {
			operation: this.operation,
			failures: this.failures,
			state: this.state,
		});
	}

	private open(): void {
		this.state = CircuitState.OPEN;
		this.emit('opened', {
			operation: this.operation,
			failures: this.failures,
		});

		console.warn(
			`${pc.yellow('⚡ Circuit breaker OPENED')} for ${this.operation} (${this.failures} failures)`,
		);
	}

	private reset(): void {
		this.state = CircuitState.CLOSED;
		this.failures = 0;
		this.successes = 0;

		this.emit('closed', {
			operation: this.operation,
		});

		console.log(`${pc.green('✅ Circuit breaker CLOSED')} for ${this.operation}`);
	}

	getState(): { state: CircuitState; failures: number; successes: number } {
		return {
			state: this.state,
			failures: this.failures,
			successes: this.successes,
		};
	}
}

// === ERROR RECOVERY MANAGER ===

export class ErrorRecoveryManager extends EventEmitter {
	private readonly errorReports = new Map<string, ErrorReport>();
	private readonly circuitBreakers = new Map<string, CircuitBreaker>();
	private readonly recoveryStrategies = new Map<string, RecoveryAction[]>();

	constructor() {
		super();
		this.setupDefaultStrategies();
	}

	private setupDefaultStrategies(): void {
		// File system error recovery
		this.recoveryStrategies.set('FileSystemError', [
			{
				type: 'retry',
				description: 'Retry file operation with exponential backoff',
				execute: async () => {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					return 'retry';
				},
			},
			{
				type: 'fallback',
				description: 'Use cached version if available',
				execute: async () => 'fallback-to-cache',
			},
			{
				type: 'skip',
				description: 'Skip this file and continue',
				execute: async () => 'skip-file',
			},
		]);

		// Schema parsing error recovery
		this.recoveryStrategies.set('SchemaParseError', [
			{
				type: 'fallback',
				description: 'Use simplified parsing',
				execute: async () => 'simplified-parsing',
			},
			{
				type: 'skip',
				description: 'Skip invalid schema',
				execute: async () => 'skip-schema',
			},
		]);

		// Network error recovery
		this.recoveryStrategies.set('NetworkError', [
			{
				type: 'retry',
				description: 'Retry with exponential backoff',
				execute: async () => {
					await new Promise((resolve) => setTimeout(resolve, 2000));
					return 'retry-network';
				},
			},
			{
				type: 'fallback',
				description: 'Use offline mode',
				execute: async () => 'offline-mode',
			},
		]);

		// Memory pressure recovery
		this.recoveryStrategies.set('MemoryError', [
			{
				type: 'fallback',
				description: 'Reduce batch size and retry',
				execute: async () => 'reduce-batch-size',
			},
			{
				type: 'fallback',
				description: 'Enable streaming mode',
				execute: async () => 'streaming-mode',
			},
		]);
	}

	/**
	 * Handle an error with comprehensive recovery
	 */
	async handleError(
		error: Error,
		context: ErrorContext,
		options: { autoRecover?: boolean; severity?: ErrorSeverity } = {},
	): Promise<any> {
		const severity = options.severity || this.determineSeverity(error, context);
		const errorId = this.generateErrorId(error, context);

		const report: ErrorReport = {
			id: errorId,
			error,
			severity,
			context,
			recoveryActions: this.getRecoveryActions(error, context),
			resolved: false,
			attempts: 0,
			lastAttempt: Date.now(),
		};

		this.errorReports.set(errorId, report);

		this.emit('errorDetected', report);

		console.error(`${pc.red('🚨 Error detected')}: ${error.message}`);
		console.error(
			`${pc.gray('Context')}: ${context.operation}${context.file ? ` in ${context.file}` : ''}`,
		);

		// Auto-recovery for non-critical errors
		if (options.autoRecover !== false && severity !== 'critical') {
			return await this.attemptRecovery(report);
		}

		return { error: report, recovered: false };
	}

	/**
	 * Attempt recovery using available strategies
	 */
	private async attemptRecovery(report: ErrorReport): Promise<any> {
		for (const action of report.recoveryActions) {
			try {
				report.attempts++;
				report.lastAttempt = Date.now();

				console.log(`${pc.cyan('🔄 Attempting recovery')}: ${action.description}`);

				const circuitBreaker = this.getCircuitBreaker(report.context.operation);
				const result = await circuitBreaker.execute(action.execute);

				report.resolved = true;
				this.emit('errorRecovered', report);

				console.log(`${pc.green('✅ Recovery successful')}: ${action.description}`);

				return { error: report, recovered: true, result };
			} catch (recoveryError) {
				console.warn(
					`${pc.yellow('⚠️  Recovery failed')}: ${action.description} - ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
				);
			}
		}

		// All recovery attempts failed
		this.emit('recoveryFailed', report);
		console.error(`${pc.red('❌ All recovery attempts failed')} for ${report.context.operation}`);

		return { error: report, recovered: false };
	}

	/**
	 * Get or create circuit breaker for operation
	 */
	private getCircuitBreaker(operation: string): CircuitBreaker {
		if (!this.circuitBreakers.has(operation)) {
			const breaker = new CircuitBreaker(operation, {
				failureThreshold: 3,
				recoveryTimeout: 30000,
			});

			breaker.on('opened', (event) => {
				this.emit('circuitOpened', event);
			});

			this.circuitBreakers.set(operation, breaker);
		}

		return this.circuitBreakers.get(operation)!;
	}

	/**
	 * Determine error severity
	 */
	private determineSeverity(error: Error, context: ErrorContext): ErrorSeverity {
		// Critical errors that should stop execution
		if (error.message.includes('EACCES') || error.message.includes('permission')) {
			return 'critical';
		}

		// High severity for core functionality
		if (context.operation.includes('analyze') || context.operation.includes('validate')) {
			return 'high';
		}

		// Medium for file operations
		if (context.operation.includes('file') || context.operation.includes('read')) {
			return 'medium';
		}

		return 'low';
	}

	/**
	 * Get recovery actions for error type
	 */
	private getRecoveryActions(error: Error, context: ErrorContext): RecoveryAction[] {
		const errorType = this.classifyError(error);
		const strategies = this.recoveryStrategies.get(errorType) || [];

		// Add context-specific strategies
		const contextStrategies = this.getContextSpecificStrategies(error, context);

		return [...strategies, ...contextStrategies];
	}

	/**
	 * Classify error type
	 */
	private classifyError(error: Error): string {
		if (error.message.includes('ENOENT') || error.message.includes('EACCES')) {
			return 'FileSystemError';
		}

		if (error.message.includes('parse') || error.message.includes('invalid')) {
			return 'SchemaParseError';
		}

		if (error.message.includes('network') || error.message.includes('timeout')) {
			return 'NetworkError';
		}

		if (error.message.includes('memory') || error.message.includes('heap')) {
			return 'MemoryError';
		}

		return 'GenericError';
	}

	/**
	 * Get context-specific recovery strategies
	 */
	private getContextSpecificStrategies(_error: Error, context: ErrorContext): RecoveryAction[] {
		const strategies: RecoveryAction[] = [];

		// File-specific recovery
		if (context.file) {
			strategies.push({
				type: 'fallback',
				description: `Skip problematic file: ${context.file}`,
				execute: async () => `skip-file:${context.file}`,
			});
		}

		// Schema-specific recovery
		if (context.schema) {
			strategies.push({
				type: 'fallback',
				description: `Skip problematic schema: ${context.schema}`,
				execute: async () => `skip-schema:${context.schema}`,
			});
		}

		// Command-specific recovery
		if (context.command === 'analyze') {
			strategies.push({
				type: 'fallback',
				description: 'Use simplified analysis mode',
				execute: async () => 'simplified-analysis',
			});
		}

		return strategies;
	}

	/**
	 * Generate unique error ID
	 */
	private generateErrorId(error: Error, context: ErrorContext): string {
		const hash = crypto
			.createHash('md5')
			.update(`${error.message}_${context.operation}_${context.file || ''}`)
			.digest('hex')
			.substring(0, 8);

		return `error_${hash}`;
	}

	/**
	 * Create safe wrapper for operations
	 */
	createSafeWrapper<T extends any[], R>(
		operation: string,
		fn: (...args: T) => Promise<R>,
		options: {
			severity?: ErrorSeverity;
			autoRecover?: boolean;
			fallback?: (...args: T) => Promise<R>;
		} = {},
	): (...args: T) => Promise<R> {
		return async (...args: T): Promise<R> => {
			try {
				const circuitBreaker = this.getCircuitBreaker(operation);
				return await circuitBreaker.execute(() => fn(...args));
			} catch (error) {
				const context: ErrorContext = {
					operation,
					timestamp: Date.now(),
					args,
				};

				const recovery = await this.handleError(error as Error, context, {
					severity: options.severity,
					autoRecover: options.autoRecover,
				});

				if (recovery.recovered && recovery.result) {
					return recovery.result;
				}

				// Try fallback if provided
				if (options.fallback) {
					try {
						return await options.fallback(...args);
					} catch (fallbackError) {
						console.warn(
							`Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
						);
					}
				}

				throw error;
			}
		};
	}

	/**
	 * Get error statistics
	 */
	getErrorStats(): {
		totalErrors: number;
		resolvedErrors: number;
		circuitBreakerStates: Record<string, any>;
		topErrors: Array<{ operation: string; count: number }>;
	} {
		const totalErrors = this.errorReports.size;
		const resolvedErrors = Array.from(this.errorReports.values()).filter(
			(report) => report.resolved,
		).length;

		const circuitBreakerStates = Object.fromEntries(
			Array.from(this.circuitBreakers.entries()).map(([operation, breaker]) => [
				operation,
				breaker.getState(),
			]),
		);

		const operationCounts = new Map<string, number>();
		this.errorReports.forEach((report) => {
			const count = operationCounts.get(report.context.operation) || 0;
			operationCounts.set(report.context.operation, count + 1);
		});

		const topErrors = Array.from(operationCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([operation, count]) => ({ operation, count }));

		return {
			totalErrors,
			resolvedErrors,
			circuitBreakerStates,
			topErrors,
		};
	}

	/**
	 * Clear error history
	 */
	clearHistory(): void {
		this.errorReports.clear();
		this.circuitBreakers.clear();
		this.emit('historyCleared');
	}

	/**
	 * Graceful shutdown
	 */
	shutdown(): void {
		this.circuitBreakers.clear();
		this.errorReports.clear();
		this.removeAllListeners();
	}
}

// === GRACEFUL DEGRADATION ===

export class GracefulDegradation {
	private readonly features = new Map<string, boolean>();
	private readonly degradationHistory: Array<{
		feature: string;
		timestamp: number;
		reason: string;
	}> = [];

	constructor() {
		// Initialize all features as enabled
		const defaultFeatures = [
			'schema-discovery',
			'analysis',
			'caching',
			'parallel-processing',
			'tui-dashboard',
			'file-watching',
			'memory-optimization',
		];

		defaultFeatures.forEach((feature) => {
			this.features.set(feature, true);
		});
	}

	/**
	 * Disable a feature gracefully
	 */
	disableFeature(feature: string, reason: string): void {
		this.features.set(feature, false);
		this.degradationHistory.push({
			feature,
			timestamp: Date.now(),
			reason,
		});

		console.warn(`${pc.yellow('⚠️  Feature disabled')}: ${feature} (${reason})`);
	}

	/**
	 * Enable a feature
	 */
	enableFeature(feature: string): void {
		this.features.set(feature, true);
		console.log(`${pc.green('✅ Feature enabled')}: ${feature}`);
	}

	/**
	 * Check if feature is enabled
	 */
	isEnabled(feature: string): boolean {
		return this.features.get(feature) ?? false;
	}

	/**
	 * Get degradation status
	 */
	getStatus(): {
		enabledFeatures: string[];
		disabledFeatures: Array<{ feature: string; reason: string }>;
		recentDegradations: Array<{
			feature: string;
			timestamp: number;
			reason: string;
		}>;
	} {
		const enabledFeatures = Array.from(this.features.entries())
			.filter(([, enabled]) => enabled)
			.map(([feature]) => feature);

		const disabledFeatures = this.degradationHistory
			.filter((entry) => !this.features.get(entry.feature))
			.map((entry) => ({ feature: entry.feature, reason: entry.reason }));

		const recentDegradations = this.degradationHistory
			.filter((entry) => Date.now() - entry.timestamp < 300000) // Last 5 minutes
			.slice(-10);

		return {
			enabledFeatures,
			disabledFeatures,
			recentDegradations,
		};
	}
}

// === EXPORTS ===

export function createErrorRecovery(): ErrorRecoveryManager {
	return new ErrorRecoveryManager();
}

export default ErrorRecoveryManager;
