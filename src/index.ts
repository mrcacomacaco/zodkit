/**
 * @fileoverview Main entry point for the zodkit library
 * Exports the core API for programmatic usage
 */

// Core validation functionality
export { Validator } from './core/validator';
export type { ValidationResult, ValidationError } from './core/validator';

// Configuration management
export { ConfigManager } from './core/config';
export type { Config } from './core/config';

// Schema discovery
export { SchemaDiscovery } from './core/schema-discovery';
export type { SchemaInfo } from './core/schema-discovery';

// Error reporting
export { ErrorReporter } from './core/error-reporter';

// Coverage reporting
export { CoverageReporter } from './core/coverage-reporter';

// Utility exports
export { FileWatcher } from './utils/file-watcher';
export { PerformanceMonitor } from './utils/performance-monitor';

// Logging utilities
export { Logger, createLogger, logger, timer } from './utils/logger';
export type { LogLevel, LoggerOptions, LogContext } from './utils/logger';

// Error recovery utilities
export { ErrorRecoveryManager, errorRecovery, withRetry, withGracefulDegradation } from './utils/error-recovery';
export type { RetryOptions } from './utils/error-recovery';