/**
 * @fileoverview Main entry point for the zodkit library
 * Exports the core API for programmatic usage
 */

// Core modules - unified exports
export {
  Infrastructure,
  SchemaDiscovery,
  SchemaCache,
  SchemaMapper,
  Validator,
  MCPServer,
  ParallelProcessor,
  HealthMonitor,
  ErrorReporter
} from './core/infrastructure';
export type {
  InfrastructureConfig,
  SchemaInfo,
  ValidationResult
} from './core/infrastructure';

// Analysis system
export {
  Analyzer,
  ComplexityAnalyzer,
  RuleEngine,
  APIInspector,
  DataAnalyzer,
  HintEngine
} from './core/analysis';
export type {
  AnalysisResult,
  AnalysisOptions,
  Issue,
  Fix
} from './core/analysis';

// Configuration
export { ConfigManager } from './core/config';
export type { Config } from './core/config';

// Error system
export { ErrorSystem } from './core/error-system';
export type { ErrorRecoveryOptions } from './core/error-system';

// Schema operations
export { SchemaGeneration } from './core/schema-generation';
export { SchemaTesting } from './core/schema-testing';
export { SchemaTransformation } from './core/schema-transformation';

// Utilities
export {
  Utils,
  FileWatcher,
  IgnoreParser,
  Logger,
  PerformanceMonitor
} from './utils';
export type {
  LogLevel,
  LoggerOptions,
  PerformanceMetrics
} from './utils';