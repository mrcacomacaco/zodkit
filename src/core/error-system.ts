/**
 * @fileoverview Unified Error System - Consolidates all error handling
 * @module ErrorSystem
 *
 * Consolidates:
 * - core/error-recovery.ts (command error recovery)
 * - utils/error-recovery.ts (retry logic)
 * - utils/error-formatter.ts (error formatting)
 * Total: ~3 files → 1 unified system
 */

import * as pc from 'picocolors';
import { z } from 'zod';
import { join } from 'path';

// === UNIFIED ERROR TYPES ===

export enum ErrorType {
  // Command errors
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  INVALID_OPTION = 'INVALID_OPTION',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',

  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Schema errors
  SCHEMA_PARSE_ERROR = 'SCHEMA_PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // System errors
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',

  UNKNOWN = 'UNKNOWN'
}

export interface ErrorContext {
  type: ErrorType;
  message: string;
  code?: string | number;
  path?: string;
  suggestion?: string;
  originalError?: Error;
  metadata?: Record<string, unknown>;
}

export interface RecoverySuggestion {
  message: string;
  action?: string;
  command?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

// === UNIFIED ERROR HANDLER ===

export class ErrorSystem {
  private static instance: ErrorSystem;
  private readonly errorLog: ErrorContext[] = [];
  private readonly recoveryStrategies: Map<ErrorType, RecoverySuggestion[]> = new Map();

  private constructor() {
    this.initializeRecoveryStrategies();
  }

  static getInstance(): ErrorSystem {
    if (!ErrorSystem.instance) {
      ErrorSystem.instance = new ErrorSystem();
    }
    return ErrorSystem.instance;
  }

  /**
   * Handle any error with intelligent recovery suggestions
   */
  handle(error: unknown, context?: Partial<ErrorContext>): ErrorContext {
    const errorContext = this.createErrorContext(error, context);
    this.errorLog.push(errorContext);

    // Get recovery suggestions
    const suggestions = this.getRecoverySuggestions(errorContext);

    // Display formatted error
    this.displayError(errorContext, suggestions);

    return errorContext;
  }

  /**
   * Format error for display
   */
  format(error: unknown, options?: { verbose?: boolean; color?: boolean }): string {
    const ctx = this.createErrorContext(error);
    const color = options?.color !== false;
    const verbose = options?.verbose || false;

    let output = '';

    // Main error message
    if (color) {
      output += pc.red('❌ Error: ') + pc.white(ctx.message);
    } else {
      output += '❌ Error: ' + ctx.message;
    }

    // Add path if available
    if (ctx.path) {
      output += '\n' + (color ? pc.gray(`   Path: ${ctx.path}`) : `   Path: ${ctx.path}`);
    }

    // Add code if available
    if (ctx.code) {
      output += '\n' + (color ? pc.gray(`   Code: ${ctx.code}`) : `   Code: ${ctx.code}`);
    }

    // Add suggestion if available
    if (ctx.suggestion) {
      output += '\n' + (color ? pc.yellow(`   💡 ${ctx.suggestion}`) : `   💡 ${ctx.suggestion}`);
    }

    // Add stack trace in verbose mode
    if (verbose && ctx.originalError?.stack) {
      output += '\n\n' + (color ? pc.gray(ctx.originalError.stack) : ctx.originalError.stack);
    }

    return output;
  }

  /**
   * Retry a function with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      backoffMultiplier = 2,
      maxDelay = 10000,
      jitter = true,
      onRetry
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts) {
          throw lastError;
        }

        if (onRetry) {
          onRetry(attempt, lastError);
        }

        // Calculate delay with exponential backoff
        let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
        delay = Math.min(delay, maxDelay);

        // Add jitter to prevent thundering herd
        if (jitter) {
          delay *= 0.5 + Math.random();
        }

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Format Zod validation errors
   */
  formatZodError(error: z.ZodError, options?: { color?: boolean }): string {
    const color = options?.color !== false;
    let output = color ? pc.red('Validation failed:') : 'Validation failed:';

    for (const issue of error.issues) {
      const path = issue.path.join('.');
      let message = issue.message;

      // Improve error messages to be more descriptive
      if (issue.code === 'too_small' && issue.type === 'number') {
        const minimum = (issue as any).minimum;
        message = `Number must be >= ${minimum} (minimum constraint violated)`;
      } else if (issue.code === 'too_big' && issue.type === 'number') {
        const maximum = (issue as any).maximum;
        message = `Number must be <= ${maximum} (maximum constraint violated)`;
      } else if (issue.code === 'invalid_string') {
        message = `Invalid string format: ${issue.message}`;
      } else if (issue.code === 'invalid_type') {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }

      if (color) {
        output += `\n  ${pc.yellow('→')} ${pc.gray(path || 'root')}: ${message}`;
      } else {
        output += `\n  → ${path || 'root'}: ${message}`;
      }
    }

    return output;
  }

  /**
   * Save error report for debugging
   */
  async saveErrorReport(filepath?: string): Promise<void> {
    const reportPath = filepath || join(process.cwd(), '.zodkit', 'error-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      errors: this.errorLog,
      environment: {
        node: process.version,
        platform: process.platform,
        cwd: process.cwd()
      }
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  // === PRIVATE METHODS ===

  private createErrorContext(error: unknown, context?: Partial<ErrorContext>): ErrorContext {
    if (error instanceof Error) {
      return {
        type: this.detectErrorType(error),
        message: error.message,
        originalError: error,
        ...context
      };
    }

    if (typeof error === 'string') {
      return {
        type: ErrorType.UNKNOWN,
        message: error,
        ...context
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      message: String(error),
      ...context
    };
  }

  private detectErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('command not found')) return ErrorType.COMMAND_NOT_FOUND;
    if (message.includes('invalid option')) return ErrorType.INVALID_OPTION;
    if (message.includes('missing argument')) return ErrorType.MISSING_ARGUMENT;
    if (message.includes('enoent') || message.includes('no such file')) return ErrorType.FILE_NOT_FOUND;
    if (message.includes('eacces') || message.includes('permission denied')) return ErrorType.PERMISSION_DENIED;
    if (message.includes('validation') || error instanceof z.ZodError) return ErrorType.VALIDATION_ERROR;
    if (message.includes('parse')) return ErrorType.SCHEMA_PARSE_ERROR;
    if (message.includes('config')) return ErrorType.CONFIG_ERROR;
    if (message.includes('dependency')) return ErrorType.DEPENDENCY_ERROR;
    if (message.includes('network') || message.includes('fetch')) return ErrorType.NETWORK_ERROR;

    return ErrorType.UNKNOWN;
  }

  private initializeRecoveryStrategies(): void {
    // Command errors
    this.recoveryStrategies.set(ErrorType.COMMAND_NOT_FOUND, [
      {
        message: 'Check available commands with --help',
        command: 'zodkit --help',
        confidence: 'high'
      }
    ]);

    // File errors
    this.recoveryStrategies.set(ErrorType.FILE_NOT_FOUND, [
      {
        message: 'Check if the file path is correct',
        action: 'verify path',
        confidence: 'high'
      },
      {
        message: 'Create the missing file',
        action: 'create file',
        confidence: 'medium'
      }
    ]);

    // Schema errors
    this.recoveryStrategies.set(ErrorType.VALIDATION_ERROR, [
      {
        message: 'Check the schema documentation',
        command: 'zodkit docs',
        confidence: 'high'
      },
      {
        message: 'Run with --fix to auto-fix issues',
        command: 'zodkit fix',
        confidence: 'medium'
      }
    ]);
  }

  private getRecoverySuggestions(context: ErrorContext): RecoverySuggestion[] {
    return this.recoveryStrategies.get(context.type) || [];
  }

  private displayError(context: ErrorContext, suggestions: RecoverySuggestion[]): void {
    console.error(this.format(context.originalError || context.message, { color: true }));

    if (suggestions.length > 0) {
      console.log(pc.yellow('\n💡 Suggestions:'));
      for (const suggestion of suggestions) {
        console.log(`   ${pc.gray('→')} ${suggestion.message}`);
        if (suggestion.command) {
          console.log(`      ${pc.cyan(`$ ${suggestion.command}`)}`);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// === CONVENIENCE EXPORTS ===

export const errorSystem = ErrorSystem.getInstance();

export function handleError(error: unknown, context?: Partial<ErrorContext>): ErrorContext {
  return errorSystem.handle(error, context);
}

export function formatError(error: unknown, options?: { verbose?: boolean; color?: boolean }): string {
  return errorSystem.format(error, options);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return errorSystem.retry(fn, options);
}

export function formatZodError(error: z.ZodError, options?: { color?: boolean }): string {
  return errorSystem.formatZodError(error, options);
}

// === BACKWARD COMPATIBILITY ===

// Export for error-recovery.ts compatibility
export { withRetry as withRetry };
export { withRetry as withGracefulDegradation };

// Export for error-formatter.ts compatibility
export { formatError as formatValidationError };
export { formatZodError as formatSchemaError };

// Export for command suggestions
export const suggestionEngine = {
  getSuggestions: (error: string) => {
    const ctx = errorSystem.handle(error);
    return errorSystem['getRecoverySuggestions'](ctx);
  }
};

export default ErrorSystem;