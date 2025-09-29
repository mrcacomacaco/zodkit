import * as pc from 'picocolors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
  colors?: boolean;
}

export interface LogContext {
  component?: string;
  operation?: string;
  file?: string;
  metadata?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const LOG_COLORS = {
  debug: pc.gray,
  info: pc.blue,
  warn: pc.yellow,
  error: pc.red,
};

export class Logger {
  private level: LogLevel;
  private readonly prefix: string;
  private readonly timestamp: boolean;
  private readonly colors: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? 'zodkit';
    this.timestamp = options.timestamp ?? true;
    this.colors = options.colors ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const parts: string[] = [];

    // Timestamp
    if (this.timestamp) {
      const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
      parts.push(pc.gray(`[${timestamp}]`));
    }

    // Level indicator
    const levelColor = LOG_COLORS[level as keyof typeof LOG_COLORS] || pc.white;
    const levelIndicator = this.colors ? levelColor(`[${level.toUpperCase()}]`) : `[${level.toUpperCase()}]`;
    parts.push(levelIndicator);

    // Prefix
    if (this.prefix) {
      parts.push(this.colors ? pc.cyan(`[${this.prefix}]`) : `[${this.prefix}]`);
    }

    // Component context
    if (context?.component) {
      parts.push(this.colors ? pc.magenta(`[${context.component}]`) : `[${context.component}]`);
    }

    // Operation context
    if (context?.operation) {
      parts.push(this.colors ? pc.green(`[${context.operation}]`) : `[${context.operation}]`);
    }

    // Main message
    parts.push(message);

    // File context
    if (context?.file) {
      parts.push(this.colors ? pc.dim(`(${context.file})`) : `(${context.file})`);
    }

    return parts.join(' ');
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, context));

    if (context?.metadata) {
      console.debug(this.colors ? pc.gray('  Metadata:') : '  Metadata:', context.metadata);
    }
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message, context));

    if (context?.metadata) {
      console.info(this.colors ? pc.blue('  Metadata:') : '  Metadata:', context.metadata);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, context));

    if (context?.metadata) {
      console.warn(this.colors ? pc.yellow('  Metadata:') : '  Metadata:', context.metadata);
    }
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage('error', message, context));

    if (error) {
      if (error instanceof Error) {
        console.error(this.colors ? pc.red('  Error:') : '  Error:', error.message);
        if (error.stack && this.level === 'debug') {
          console.error(this.colors ? pc.gray('  Stack:') : '  Stack:', error.stack);
        }
      } else {
        const errorMessage = error instanceof Error
          ? error.message
          : (typeof error === 'object' && error !== null)
            ? JSON.stringify(error)
            : (error !== null && error !== undefined && (typeof error === 'string' || typeof error === 'number'))
              ? String(error)
              : 'Unknown error';
        console.error(this.colors ? pc.red('  Error:') : '  Error:', errorMessage);
      }
    }

    if (context?.metadata) {
      console.error(this.colors ? pc.red('  Metadata:') : '  Metadata:', context.metadata);
    }
  }

  // Convenience methods for common use cases
  success(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    const successMessage = this.colors ? pc.green('✅ ' + message) : '✅ ' + message;
    console.info(this.formatMessage('info', successMessage, context));
  }

  failure(message: string, error?: unknown, context?: LogContext): void {
    const failureMessage = this.colors ? pc.red('❌ ' + message) : '❌ ' + message;
    this.error(failureMessage, error, context);
  }

  progress(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    const progressMessage = this.colors ? pc.blue('🔄 ' + message) : '🔄 ' + message;
    console.info(this.formatMessage('info', progressMessage, context));
  }

  complete(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    const completeMessage = this.colors ? pc.green('✅ ' + message) : '✅ ' + message;
    console.info(this.formatMessage('info', completeMessage, context));
  }

  // Create child logger with additional context
  child(context: LogContext): Logger {
    return new Logger({
      level: this.level,
      prefix: context.component ?? this.prefix,
      timestamp: this.timestamp,
      colors: this.colors,
    });
  }

  // Set log level at runtime
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  // Get current log level
  getLevel(): LogLevel {
    return this.level;
  }
}

// Default logger instance
export const logger = new Logger();

// Factory function for creating component-specific loggers
export function createLogger(component: string, options?: LoggerOptions): Logger {
  return new Logger({
    ...options,
    prefix: component,
  });
}

// Performance timing utilities
export class LogTimer {
  private readonly startTime: number;
  private readonly logger: Logger;
  private readonly operation: string;
  private readonly context: LogContext | undefined;

  constructor(logger: Logger, operation: string, context?: LogContext) {
    this.logger = logger;
    this.operation = operation;
    this.context = context;
    this.startTime = Date.now();

    this.logger.debug(`Starting ${operation}`, this.context);
  }

  end(message?: string): number {
    const duration = Date.now() - this.startTime;
    const finalMessage = message ?? `Completed ${this.operation}`;

    this.logger.info(`${finalMessage} (${duration}ms)`, {
      ...this.context,
      metadata: {
        ...this.context?.metadata,
        duration,
        operation: this.operation,
      },
    });

    return duration;
  }

  checkpoint(label: string): number {
    const elapsed = Date.now() - this.startTime;
    this.logger.debug(`${this.operation} - ${label} (${elapsed}ms)`, {
      ...this.context,
      metadata: {
        ...this.context?.metadata,
        elapsed,
        checkpoint: label,
      },
    });

    return elapsed;
  }
}

// Helper function to create performance timers
export function timer(logger: Logger, operation: string, context?: LogContext): LogTimer {
  return new LogTimer(logger, operation, context);
}