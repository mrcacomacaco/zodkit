/**
 * @fileoverview Error recovery and resilience utilities
 * @module ErrorRecovery
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger, LogContext } from './logger';

/**
 * Configuration for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  initialDelay: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Jitter to add randomness to retry timing */
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
  jitter: true,
};

/**
 * Error recovery state
 */
interface RecoveryState {
  timestamp: number;
  operation: string;
  attemptCount: number;
  lastError: string;
  context?: Record<string, unknown>;
}

/**
 * Error recovery manager with retry logic, graceful degradation, and state persistence
 */
export class ErrorRecoveryManager {
  private readonly stateFile: string;
  private readonly context: LogContext;
  private recoveryState: Map<string, RecoveryState> = new Map();

  constructor(stateDir: string = '.zodkit', context: LogContext = {}) {
    this.stateFile = join(stateDir, 'recovery-state.json');
    this.context = { ...context, component: 'ErrorRecovery' };
    this.loadRecoveryState();
  }

  /**
   * Execute an operation with retry logic and error recovery
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    const operationId = `${operationName}-${Date.now()}`;

    let lastError: unknown;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        logger.debug(`Attempting ${operationName} (${attempt}/${config.maxAttempts})`, {
          ...this.context,
          operation: operationName,
          metadata: { attempt, maxAttempts: config.maxAttempts },
        });

        const result = await operation();

        // Success - clear any previous recovery state
        this.clearRecoveryState(operationName);

        if (attempt > 1) {
          logger.info(`Successfully recovered ${operationName} after ${attempt} attempts`, {
            ...this.context,
            operation: operationName,
            metadata: { attempts: attempt },
          });
        }

        return result;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Update recovery state
        this.updateRecoveryState(operationName, {
          timestamp: Date.now(),
          operation: operationName,
          attemptCount: attempt,
          lastError: errorMessage,
          context: { operationId, attempt, maxAttempts: config.maxAttempts },
        });

        if (attempt === config.maxAttempts) {
          logger.error(`Final attempt failed for ${operationName}`, error, {
            ...this.context,
            operation: operationName,
            metadata: { totalAttempts: attempt },
          });
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        const delay = config.jitter
          ? baseDelay + Math.random() * 1000
          : baseDelay;

        logger.warn(
          `${operationName} failed, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${config.maxAttempts})`,
          {
            ...this.context,
            operation: operationName,
            metadata: {
              attempt,
              delay,
              maxAttempts: config.maxAttempts,
              error: error instanceof Error ? error.message : String(error)
            },
          }
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute operation with graceful degradation
   */
  async withGracefulDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      return await primaryOperation();
    } catch (primaryError) {
      logger.warn(`Primary operation ${operationName} failed, attempting fallback`, {
        ...this.context,
        operation: operationName,
        metadata: { error: primaryError instanceof Error ? primaryError.message : String(primaryError) },
      });

      try {
        const result = await fallbackOperation();
        logger.info(`Successfully used fallback for ${operationName}`, {
          ...this.context,
          operation: operationName,
        });
        return result;
      } catch (fallbackError) {
        logger.error(`Both primary and fallback operations failed for ${operationName}`, fallbackError, {
          ...this.context,
          operation: operationName,
          metadata: {
            primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          },
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Create a circuit breaker for an operation
   */
  createCircuitBreaker<T>(
    operation: () => Promise<T>,
    operationName: string,
    failureThreshold: number = 5,
    resetTimeout: number = 60000
  ) {
    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (): Promise<T> => {
      const now = Date.now();

      // Check if we should reset from open to half-open
      if (state === 'open' && now - lastFailureTime > resetTimeout) {
        state = 'half-open';
        logger.info(`Circuit breaker for ${operationName} entering half-open state`, {
          ...this.context,
          operation: operationName,
        });
      }

      // Reject immediately if circuit is open
      if (state === 'open') {
        const error = new Error(`Circuit breaker is open for ${operationName}`);
        logger.warn(`Circuit breaker rejected ${operationName}`, {
          ...this.context,
          operation: operationName,
          metadata: { state, failures, lastFailureTime, error: error instanceof Error ? error.message : String(error) },
        });
        throw error;
      }

      try {
        const result = await operation();

        // Success - reset circuit breaker
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
          logger.info(`Circuit breaker for ${operationName} closed after successful recovery`, {
            ...this.context,
            operation: operationName,
          });
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;

        // Open circuit if threshold exceeded
        if (failures >= failureThreshold) {
          state = 'open';
          logger.error(`Circuit breaker opened for ${operationName} after ${failures} failures`, error, {
            ...this.context,
            operation: operationName,
            metadata: { failures, threshold: failureThreshold },
          });
        }

        throw error;
      }
    };
  }

  /**
   * Create a backup and recovery mechanism for file operations
   */
  async withFileBackup<T>(
    filePath: string,
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    let backupCreated = false;

    try {
      // Create backup if file exists
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        writeFileSync(backupPath, content, 'utf-8');
        backupCreated = true;
        logger.debug(`Created backup for ${filePath}`, {
          ...this.context,
          operation: operationName,
          metadata: { backupPath },
        });
      }

      const result = await operation();

      // Clean up backup on success
      if (backupCreated && existsSync(backupPath)) {
        try {
          unlinkSync(backupPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      return result;
    } catch (error) {
      // Restore from backup on failure
      if (backupCreated && existsSync(backupPath)) {
        try {
          const backupContent = readFileSync(backupPath, 'utf-8');
          writeFileSync(filePath, backupContent, 'utf-8');
          logger.info(`Restored ${filePath} from backup after ${operationName} failed`, {
            ...this.context,
            operation: operationName,
            metadata: { backupPath },
          });
        } catch (restoreError) {
          logger.error(`Failed to restore ${filePath} from backup`, restoreError, {
            ...this.context,
            operation: operationName,
          });
        }
      }

      throw error;
    }
  }

  /**
   * Get recovery recommendations based on error patterns
   */
  getRecoveryRecommendations(operationName?: string): string[] {
    const recommendations: string[] = [];
    const states = operationName
      ? [this.recoveryState.get(operationName)].filter((state): state is RecoveryState => state !== undefined)
      : Array.from(this.recoveryState.values());

    for (const state of states) {
      if (state.attemptCount >= 2) {
        recommendations.push(`Consider investigating ${state.operation} - multiple failures detected`);
      }

      if (state.lastError.includes('ENOENT')) {
        recommendations.push(`File not found error in ${state.operation} - check file paths and permissions`);
      }

      if (state.lastError.includes('EACCES')) {
        recommendations.push(`Permission error in ${state.operation} - check file/directory permissions`);
      }

      if (state.lastError.includes('timeout')) {
        recommendations.push(`Timeout in ${state.operation} - consider increasing timeout values or checking network connectivity`);
      }
    }

    return recommendations;
  }

  private updateRecoveryState(operationName: string, state: RecoveryState): void {
    this.recoveryState.set(operationName, state);
    this.saveRecoveryState();
  }

  private clearRecoveryState(operationName: string): void {
    this.recoveryState.delete(operationName);
    this.saveRecoveryState();
  }

  private loadRecoveryState(): void {
    try {
      if (existsSync(this.stateFile)) {
        const data = readFileSync(this.stateFile, 'utf-8');
        const stateData = JSON.parse(data) as Record<string, RecoveryState>;
        this.recoveryState = new Map(Object.entries(stateData));
      }
    } catch (error) {
      logger.warn('Failed to load recovery state', {
        ...this.context,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private saveRecoveryState(): void {
    try {
      const stateData = Object.fromEntries(this.recoveryState);
      writeFileSync(this.stateFile, JSON.stringify(stateData, null, 2), 'utf-8');
    } catch (error) {
      logger.warn('Failed to save recovery state', {
        ...this.context,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global error recovery manager instance
 */
export const errorRecovery = new ErrorRecoveryManager();

/**
 * Convenience function for retrying operations
 */
export function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options?: Partial<RetryOptions>
): Promise<T> {
  return errorRecovery.withRetry(operation, operationName, options);
}

/**
 * Convenience function for graceful degradation
 */
export function withGracefulDegradation<T>(
  primaryOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return errorRecovery.withGracefulDegradation(primaryOperation, fallbackOperation, operationName);
}