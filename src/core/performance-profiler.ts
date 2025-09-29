/**
 * @fileoverview Unified Performance Profiler and Benchmarking System
 * @module PerformanceProfiler
 *
 * Consolidated from:
 * - performance-benchmarks.ts
 * - profiling/performance-profiler.ts
 * - profiling/performance-optimizer.ts
 */

import { EventEmitter } from 'events';
import * as z from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance, PerformanceObserver } from 'perf_hooks';
import * as pc from 'picocolors';

// === BENCHMARK TYPES (from performance-benchmarks.ts) ===

/**
 * Benchmark result for a single test
 */
export interface BenchmarkResult {
  name: string;
  operations: number;
  totalTime: number;
  averageTime: number;
  opsPerSecond: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  memoryUsage?: number;
}

/**
 * Performance recommendation
 */
export interface PerformanceRecommendation {
  category: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  impact: string;
  recommendation: string;
  before?: string;
  after?: string;
  estimatedImprovement?: string;
}

/**
 * Benchmark suite configuration
 */
export interface BenchmarkConfig {
  iterations: number;
  warmupRounds: number;
  timeout: number;
  collectMemory: boolean;
  compareBaseline: boolean;
}

// === PROFILER TYPES (from profiling/performance-profiler.ts) ===

export interface PerformanceProfile {
  id: string;
  name: string;
  created: Date;
  updated: Date;
  schema: z.ZodTypeAny;
  schemaSource: string;
  benchmarks: PerformanceBenchmark[];
  optimizations: PerformanceOptimization[];
  metrics: PerformanceMetrics;
  settings: ProfilerSettings;
  baseline: PerformanceBaseline;
  trends: PerformanceTrend[];
}

export interface PerformanceBenchmark {
  id: string;
  name: string;
  timestamp: Date;
  testData: BenchmarkTestData;
  results: BenchmarkResults;
  environment: BenchmarkEnvironment;
  configuration: BenchmarkConfiguration;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface BenchmarkTestData {
  type: 'synthetic' | 'real-world' | 'stress' | 'edge-cases';
  size: 'small' | 'medium' | 'large' | 'extra-large';
  samples: any[];
  characteristics: DataCharacteristics;
  generation: DataGenerationConfig;
}

export interface DataCharacteristics {
  averageObjectSize: number;
  maxNestingDepth: number;
  fieldCount: number;
  arrayLengths: number[];
  dataTypes: Record<string, number>;
  complexityScore: number;
  uniqueValues: number;
}

export interface DataGenerationConfig {
  strategy: 'random' | 'realistic' | 'edge-cases' | 'custom';
  seed?: number;
  templates?: any[];
  constraints?: Record<string, any>;
}

export interface BenchmarkResults {
  validation: ValidationResults;
  parsing: ParsingResults;
  compilation: CompilationResults;
  memory: MemoryResults;
  summary: ResultsSummary;
}

export interface ValidationResults {
  successfulValidations: number;
  failedValidations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number;
}

export interface ParsingResults {
  totalParsed: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
  errors: number;
}

export interface CompilationResults {
  compileTime: number;
  cacheHits: number;
  cacheMisses: number;
  cacheEfficiency: number;
}

export interface MemoryResults {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  peak: number;
  allocated: number;
  deallocated: number;
  leaks: MemoryLeak[];
}

export interface MemoryLeak {
  type: string;
  size: number;
  location: string;
  stackTrace: string;
}

export interface ResultsSummary {
  overallScore: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendations: PerformanceRecommendation[];
  regressions: PerformanceRegression[];
  improvements: PerformanceImprovement[];
}

export interface PerformanceRegression {
  metric: string;
  before: number;
  after: number;
  change: number;
  significance: 'low' | 'medium' | 'high' | 'critical';
}

export interface PerformanceImprovement {
  metric: string;
  before: number;
  after: number;
  improvement: number;
  significance: 'low' | 'medium' | 'high' | 'critical';
}

export interface BenchmarkEnvironment {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuCount: number;
  memory: number;
  timestamp: Date;
  load: SystemLoad;
}

export interface SystemLoad {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface BenchmarkConfiguration {
  iterations: number;
  warmupRounds: number;
  timeout: number;
  concurrency: number;
  dataSize: number;
  complexity: number;
  caching: boolean;
  gc: boolean;
}

export interface PerformanceOptimization {
  id: string;
  name: string;
  description: string;
  category: OptimizationCategory;
  impact: OptimizationImpact;
  implementation: OptimizationImplementation;
  validation: OptimizationValidation;
  status: OptimizationStatus;
}

export type OptimizationCategory =
  | 'schema-structure'
  | 'validation-logic'
  | 'memory-usage'
  | 'compilation'
  | 'caching'
  | 'parsing';

export interface OptimizationImpact {
  validationTime: number;
  memoryUsage: number;
  compilationTime: number;
  bundleSize: number;
  complexity: number;
}

export interface OptimizationImplementation {
  type: 'automatic' | 'semi-automatic' | 'manual';
  code: string;
  instructions: string;
  prerequisites: string[];
  risks: string[];
}

export interface OptimizationValidation {
  beforeBenchmark: BenchmarkResults;
  afterBenchmark?: BenchmarkResults;
  verified: boolean;
  regressions: PerformanceRegression[];
  improvements: PerformanceImprovement[];
}

export type OptimizationStatus =
  | 'suggested'
  | 'analyzing'
  | 'ready'
  | 'applied'
  | 'verified'
  | 'reverted'
  | 'failed';

export interface PerformanceMetrics {
  current: MetricSnapshot;
  baseline: MetricSnapshot;
  history: MetricSnapshot[];
  trends: MetricTrend[];
}

export interface MetricSnapshot {
  timestamp: Date;
  validation: ValidationMetrics;
  memory: MemoryMetrics;
  compilation: CompilationMetrics;
  overall: OverallMetrics;
}

export interface ValidationMetrics {
  averageTime: number;
  p95Time: number;
  throughput: number;
  errorRate: number;
  complexity: number;
}

export interface MemoryMetrics {
  heapUsed: number;
  peak: number;
  allocations: number;
  deallocations: number;
  leakCount: number;
}

export interface CompilationMetrics {
  time: number;
  cacheHitRate: number;
  bundleSize: number;
  optimizationLevel: number;
}

export interface OverallMetrics {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  regressionCount: number;
  improvementCount: number;
}

export interface MetricTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  magnitude: number;
  period: string;
  significance: 'low' | 'medium' | 'high';
}

export interface ProfilerSettings {
  autoOptimize: boolean;
  notifications: NotificationSettings;
  thresholds: PerformanceThresholds;
  reporting: ReportingSettings;
  storage: StorageSettings;
}

export interface NotificationSettings {
  enabled: boolean;
  regressions: boolean;
  improvements: boolean;
  thresholds: boolean;
  email?: string;
  webhook?: string;
}

export interface PerformanceThresholds {
  validationTime: ThresholdConfig;
  memoryUsage: ThresholdConfig;
  regressionSeverity: ThresholdConfig;
}

export interface ThresholdConfig {
  warning: number;
  critical: number;
  unit: string;
}

export interface ReportingSettings {
  format: 'json' | 'html' | 'pdf' | 'csv';
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  includeCharts: boolean;
  includeRecommendations: boolean;
}

export interface StorageSettings {
  retentionDays: number;
  compression: boolean;
  encryption: boolean;
  location: string;
}

export interface PerformanceBaseline {
  version: string;
  timestamp: Date;
  metrics: MetricSnapshot;
  environment: BenchmarkEnvironment;
  significance: string;
}

export interface PerformanceTrend {
  metric: string;
  startDate: Date;
  endDate: Date;
  direction: 'improving' | 'degrading' | 'stable';
  magnitude: number;
  confidence: number;
  predictions: TrendPrediction[];
}

export interface TrendPrediction {
  date: Date;
  value: number;
  confidence: number;
  scenario: 'optimistic' | 'realistic' | 'pessimistic';
}

// === UNIFIED PERFORMANCE PROFILER ENGINE ===

export class PerformanceProfilerEngine extends EventEmitter {
  private profiles: Map<string, PerformanceProfile> = new Map();
  private settings: ProfilerSettings;
  private observer?: PerformanceObserver;

  constructor(settings?: Partial<ProfilerSettings>) {
    super();
    this.settings = {
      autoOptimize: false,
      notifications: {
        enabled: true,
        regressions: true,
        improvements: true,
        thresholds: true
      },
      thresholds: {
        validationTime: { warning: 100, critical: 500, unit: 'ms' },
        memoryUsage: { warning: 50, critical: 100, unit: 'MB' },
        regressionSeverity: { warning: 10, critical: 25, unit: '%' }
      },
      reporting: {
        format: 'json',
        frequency: 'daily',
        includeCharts: true,
        includeRecommendations: true
      },
      storage: {
        retentionDays: 30,
        compression: true,
        encryption: false,
        location: '.zodkit/profiles'
      },
      ...settings
    };
  }

  async createProfile(name: string, schema: z.ZodTypeAny, source: string): Promise<PerformanceProfile> {
    const profile: PerformanceProfile = {
      id: `prof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      created: new Date(),
      updated: new Date(),
      schema,
      schemaSource: source,
      benchmarks: [],
      optimizations: [],
      metrics: {
        current: this.createEmptySnapshot(),
        baseline: this.createEmptySnapshot(),
        history: [],
        trends: []
      },
      settings: this.settings,
      baseline: {
        version: '1.0.0',
        timestamp: new Date(),
        metrics: this.createEmptySnapshot(),
        environment: await this.getEnvironment(),
        significance: 'Initial baseline'
      },
      trends: []
    };

    this.profiles.set(profile.id, profile);
    await this.saveProfile(profile);
    this.emit('profileCreated', profile);

    return profile;
  }

  async runBenchmark(profileId: string, config?: Partial<BenchmarkConfig>): Promise<BenchmarkResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const benchmarkConfig: BenchmarkConfig = {
      iterations: 1000,
      warmupRounds: 100,
      timeout: 30000,
      collectMemory: true,
      compareBaseline: true,
      ...config
    };

    const benchmark = await this.executeBenchmark(profile, benchmarkConfig);
    profile.benchmarks.push(benchmark);
    profile.updated = new Date();

    await this.saveProfile(profile);
    this.emit('benchmarkCompleted', benchmark);

    return this.convertBenchmarkToResult(benchmark);
  }

  async generateRecommendations(profileId: string): Promise<PerformanceRecommendation[]> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const recommendations: PerformanceRecommendation[] = [];

    // Analyze latest benchmark
    const latestBenchmark = profile.benchmarks[profile.benchmarks.length - 1];
    if (latestBenchmark) {
      const analysisResults = await this.analyzePerformance(latestBenchmark.results);
      recommendations.push(...analysisResults);
    }

    // Add optimization suggestions
    const optimizations = await this.suggestOptimizations(profile);
    recommendations.push(...optimizations);

    return recommendations;
  }

  private createEmptySnapshot(): MetricSnapshot {
    return {
      timestamp: new Date(),
      validation: {
        averageTime: 0,
        p95Time: 0,
        throughput: 0,
        errorRate: 0,
        complexity: 0
      },
      memory: {
        heapUsed: 0,
        peak: 0,
        allocations: 0,
        deallocations: 0,
        leakCount: 0
      },
      compilation: {
        time: 0,
        cacheHitRate: 0,
        bundleSize: 0,
        optimizationLevel: 0
      },
      overall: {
        score: 0,
        grade: 'F',
        regressionCount: 0,
        improvementCount: 0
      }
    };
  }

  private async getEnvironment(): Promise<BenchmarkEnvironment> {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: require('os').cpus().length,
      memory: require('os').totalmem(),
      timestamp: new Date(),
      load: {
        cpu: 0,
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        disk: 0,
        network: 0
      }
    };
  }

  private async executeBenchmark(profile: PerformanceProfile, config: BenchmarkConfig): Promise<PerformanceBenchmark> {
    const benchmark: PerformanceBenchmark = {
      id: `bench-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Benchmark ${new Date().toISOString()}`,
      timestamp: new Date(),
      testData: await this.generateTestData(profile.schema),
      results: {
        validation: {
          successfulValidations: 0,
          failedValidations: 0,
          totalTime: 0,
          averageTime: 0,
          minTime: Infinity,
          maxTime: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          throughput: 0
        },
        parsing: {
          totalParsed: 0,
          totalTime: 0,
          averageTime: 0,
          minTime: Infinity,
          maxTime: 0,
          throughput: 0,
          errors: 0
        },
        compilation: {
          compileTime: 0,
          cacheHits: 0,
          cacheMisses: 0,
          cacheEfficiency: 0
        },
        memory: {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
          peak: 0,
          allocated: 0,
          deallocated: 0,
          leaks: []
        },
        summary: {
          overallScore: 0,
          performanceGrade: 'F',
          recommendations: [],
          regressions: [],
          improvements: []
        }
      },
      environment: await this.getEnvironment(),
      configuration: {
        iterations: config.iterations,
        warmupRounds: config.warmupRounds,
        timeout: config.timeout,
        concurrency: 1,
        dataSize: 1000,
        complexity: 1,
        caching: true,
        gc: true
      },
      status: 'running'
    };

    try {
      // Execute validation benchmarks
      await this.runValidationBenchmarks(profile.schema, benchmark, config);
      benchmark.status = 'completed';
    } catch (error) {
      benchmark.status = 'failed';
      throw error;
    }

    return benchmark;
  }

  private async generateTestData(schema: z.ZodTypeAny): Promise<BenchmarkTestData> {
    // Simplified test data generation
    const samples = [];
    for (let i = 0; i < 100; i++) {
      samples.push({ id: i, name: `Test ${i}`, value: Math.random() * 1000 });
    }

    return {
      type: 'synthetic',
      size: 'medium',
      samples,
      characteristics: {
        averageObjectSize: 50,
        maxNestingDepth: 3,
        fieldCount: 10,
        arrayLengths: [1, 5, 10],
        dataTypes: { string: 3, number: 2, boolean: 1 },
        complexityScore: 5,
        uniqueValues: 100
      },
      generation: {
        strategy: 'random',
        seed: 12345
      }
    };
  }

  private async runValidationBenchmarks(schema: z.ZodTypeAny, benchmark: PerformanceBenchmark, config: BenchmarkConfig): Promise<void> {
    const times: number[] = [];
    let successful = 0;
    let failed = 0;

    // Warmup
    for (let i = 0; i < config.warmupRounds; i++) {
      try {
        schema.parse(benchmark.testData.samples[i % benchmark.testData.samples.length]);
      } catch {}
    }

    // Actual benchmark
    for (let i = 0; i < config.iterations; i++) {
      const start = performance.now();
      try {
        schema.parse(benchmark.testData.samples[i % benchmark.testData.samples.length]);
        successful++;
      } catch {
        failed++;
      }
      const end = performance.now();
      times.push(end - start);
    }

    // Calculate statistics
    times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);

    benchmark.results.validation = {
      successfulValidations: successful,
      failedValidations: failed,
      totalTime,
      averageTime: totalTime / times.length,
      minTime: times[0],
      maxTime: times[times.length - 1],
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
      throughput: (config.iterations / totalTime) * 1000
    };
  }

  private convertBenchmarkToResult(benchmark: PerformanceBenchmark): BenchmarkResult {
    const validation = benchmark.results.validation;
    return {
      name: benchmark.name,
      operations: validation.successfulValidations + validation.failedValidations,
      totalTime: validation.totalTime,
      averageTime: validation.averageTime,
      opsPerSecond: validation.throughput,
      minTime: validation.minTime,
      maxTime: validation.maxTime,
      p50: validation.p50,
      p95: validation.p95,
      p99: validation.p99,
      memoryUsage: benchmark.results.memory.heapUsed
    };
  }

  private async analyzePerformance(results: BenchmarkResults): Promise<PerformanceRecommendation[]> {
    const recommendations: PerformanceRecommendation[] = [];

    // Analyze validation performance
    if (results.validation.averageTime > 10) {
      recommendations.push({
        category: 'high',
        issue: 'Slow validation performance',
        impact: `Average validation time is ${results.validation.averageTime.toFixed(2)}ms`,
        recommendation: 'Consider simplifying schema structure or adding caching',
        estimatedImprovement: '30-50% faster validation'
      });
    }

    // Analyze memory usage
    if (results.memory.heapUsed > 50 * 1024 * 1024) { // 50MB
      recommendations.push({
        category: 'medium',
        issue: 'High memory usage',
        impact: `Using ${(results.memory.heapUsed / 1024 / 1024).toFixed(1)}MB of memory`,
        recommendation: 'Optimize data structures and consider streaming validation',
        estimatedImprovement: '20-40% reduction in memory usage'
      });
    }

    return recommendations;
  }

  private async suggestOptimizations(profile: PerformanceProfile): Promise<PerformanceRecommendation[]> {
    // This would contain more sophisticated optimization logic
    return [];
  }

  private async saveProfile(profile: PerformanceProfile): Promise<void> {
    // Save profile to storage (simplified)
    const profileDir = path.join(process.cwd(), this.settings.storage.location);
    await fs.mkdir(profileDir, { recursive: true });
    const profilePath = path.join(profileDir, `${profile.id}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
  }

  async loadProfile(profileId: string): Promise<PerformanceProfile | null> {
    try {
      const profilePath = path.join(process.cwd(), this.settings.storage.location, `${profileId}.json`);
      const data = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(data);
      this.profiles.set(profileId, profile);
      return profile;
    } catch {
      return null;
    }
  }

  async listProfiles(): Promise<PerformanceProfile[]> {
    return Array.from(this.profiles.values());
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const deleted = this.profiles.delete(profileId);
    if (deleted) {
      try {
        const profilePath = path.join(process.cwd(), this.settings.storage.location, `${profileId}.json`);
        await fs.unlink(profilePath);
      } catch {}
    }
    return deleted;
  }
}

// === SIMPLIFIED BENCHMARK RUNNER (from performance-benchmarks.ts) ===

export class BenchmarkRunner {
  async runBenchmarks(schemas: z.ZodTypeAny[], config?: Partial<BenchmarkConfig>): Promise<BenchmarkResult[]> {
    const engine = new PerformanceProfilerEngine();
    const results: BenchmarkResult[] = [];

    for (const schema of schemas) {
      const profile = await engine.createProfile(`Schema-${Date.now()}`, schema, 'benchmark');
      const result = await engine.runBenchmark(profile.id, config);
      results.push(result);
    }

    return results;
  }

  displayResults(results: BenchmarkResult[]): void {
    console.log(pc.blue('\n📊 Performance Benchmark Results\n'));

    for (const result of results) {
      console.log(pc.cyan(`${result.name}:`));
      console.log(`  Operations: ${result.operations}`);
      console.log(`  Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`  Average: ${result.averageTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${result.opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`  P95: ${result.p95.toFixed(2)}ms`);
      console.log(`  P99: ${result.p99.toFixed(2)}ms`);
      if (result.memoryUsage) {
        console.log(`  Memory: ${(result.memoryUsage / 1024 / 1024).toFixed(1)}MB`);
      }
      console.log('');
    }
  }
}

// Export everything for backward compatibility
export default PerformanceProfilerEngine;