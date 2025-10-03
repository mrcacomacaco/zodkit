/**
 * @fileoverview Main entry point for the zodkit library
 * Tree-shaking optimized exports for programmatic usage
 */

// Note: ComplexityAnalyzer and RuleEngine integrated into Analyzer class
export type {
	AnalysisOptions,
	AnalysisResult,
	Fix,
	Issue,
} from './core/analysis';
// === ANALYSIS SYSTEM ===
export { Analyzer } from './core/analysis';
export type { Config, RuleSeverityType } from './core/config';
// === CONFIGURATION ===
export {
	ConfigManager,
	ConfigSchema,
	configManager,
	unifiedConfig,
} from './core/config';
export type {
	ErrorContext,
	ErrorReport,
	RecoveryAction,
} from './core/error-recovery';
// === ERROR RECOVERY ===
export {
	CircuitBreaker,
	ErrorRecoveryManager,
	GracefulDegradation,
} from './core/error-recovery';
export type {
	InfrastructureConfig,
	SchemaInfo,
	ValidationResult,
} from './core/infrastructure';
// === CORE INFRASTRUCTURE (tree-shakeable) ===
export {
	Infrastructure,
	MCPServer,
	ParallelProcessor,
	SchemaCache,
	SchemaDiscovery,
	SchemaMapper,
	Validator,
} from './core/infrastructure';
export type { MemoryStats, OptimizationOptions } from './core/memory-optimizer';
// === MEMORY OPTIMIZATION ===
export {
	MemoryMonitor,
	MemoryOptimizer,
	StreamingProcessor,
} from './core/memory-optimizer';

// === SCHEMA OPERATIONS (lazy-loaded for tree-shaking) ===
export const createSchemaGenerator = async () =>
	await import('./core/schema-generation').then((m) => m.SchemaGenerator || m.default);
export const createSchemaTester = async () =>
	await import('./core/schema-testing').then((m) => m.SchemaTester || m.default);
export const createSchemaTransformer = async () =>
	await import('./core/schema-transformation').then((m) => m.SchemaTransformer || m.default);

export type { LoggerOptions, LogLevel, PerformanceMetrics } from './utils';
// === UTILITIES ===
export {
	FileWatcher,
	IgnoreParser,
	Logger,
	PerformanceMonitor,
	Utils,
} from './utils';

// === VERSION INFO ===
import packageJson from '../package.json';
export const version = packageJson.version;
