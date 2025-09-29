/**
 * @fileoverview Main entry point for the zodkit library
 * Tree-shaking optimized exports for programmatic usage
 */

// === CORE INFRASTRUCTURE (tree-shakeable) ===
export {
  Infrastructure,
  SchemaDiscovery,
  SchemaCache,
  SchemaMapper,
  Validator,
  MCPServer,
  ParallelProcessor
} from './core/infrastructure';
export type {
  InfrastructureConfig,
  SchemaInfo,
  ValidationResult
} from './core/infrastructure';

// === ANALYSIS SYSTEM ===
export { Analyzer } from './core/analysis';
export { ComplexityAnalyzer } from './core/complexity-analyzer';
export { RuleEngine } from './core/rule-engine';
export type {
  AnalysisResult,
  AnalysisOptions,
  Issue,
  Fix
} from './core/analysis';

// === CONFIGURATION ===
export { ConfigManager } from './core/config';
export type { Config } from './core/config';
export { unifiedConfig } from './core/unified-config';

// === ERROR RECOVERY ===
export {
  ErrorRecoveryManager,
  CircuitBreaker,
  GracefulDegradation
} from './core/error-recovery';
export type {
  ErrorContext,
  RecoveryAction,
  ErrorReport
} from './core/error-recovery';

// === MEMORY OPTIMIZATION ===
export {
  MemoryOptimizer,
  MemoryMonitor,
  StreamingProcessor
} from './core/memory-optimizer';
export type {
  MemoryStats,
  OptimizationOptions
} from './core/memory-optimizer';

// === SCHEMA OPERATIONS (lazy-loaded for tree-shaking) ===
export const createSchemaGenerator = () => import('./core/schema-generation').then(m => m.SchemaGenerator || m.default);
export const createSchemaTester = () => import('./core/schema-testing').then(m => m.SchemaTester || m.default);
export const createSchemaTransformer = () => import('./core/schema-transformation').then(m => m.SchemaTransformer || m.default);

// === UTILITIES ===
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

// === VERSION INFO ===
export const version = require('../package.json').version;