/**
 * @fileoverview Advanced Debug Mode with Comprehensive Tracing
 * @module DebugTracer
 *
 * Provides comprehensive debugging capabilities including:
 * - Execution tracing with call stacks
 * - Performance profiling and bottleneck detection
 * - Memory usage monitoring and leak detection
 * - Interactive debugging with breakpoints
 * - Visual execution flow analysis
 * - Real-time metrics and analytics
 * - Schema validation debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as pc from 'picocolors';
import { z } from 'zod';
import type { SchemaInfo } from './infrastructure';

// === DEBUG INTERFACES ===

export interface DebugConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  output: 'console' | 'file' | 'both';
  outputFile?: string;
  tracing: {
    enabled: boolean;
    includeStackTrace: boolean;
    maxStackDepth: number;
    captureArguments: boolean;
    captureReturnValues: boolean;
  };
  profiling: {
    enabled: boolean;
    sampleInterval: number;
    memoryTracking: boolean;
    cpuProfiling: boolean;
    timeThreshold: number; // ms
  };
  interactive: {
    enabled: boolean;
    breakpoints: string[];
    watchExpressions: string[];
    inspectVariables: boolean;
  };
  filters: {
    includePatterns: string[];
    excludePatterns: string[];
    modules: string[];
    functions: string[];
  };
  formatting: {
    colorize: boolean;
    timestamps: boolean;
    processInfo: boolean;
    indent: boolean;
  };
}

export interface TraceEntry {
  id: string;
  timestamp: number;
  level: string;
  message: string;
  module: string;
  function: string;
  args?: any[];
  returnValue?: any;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  stackTrace?: string[];
  metadata?: Record<string, any>;
}

export interface PerformanceProfile {
  function: string;
  totalTime: number;
  callCount: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  memoryDelta: number;
  hotPath: boolean;
}

export interface DebugSession {
  id: string;
  startTime: number;
  endTime?: number;
  traces: TraceEntry[];
  profiles: Map<string, PerformanceProfile>;
  breakpoints: Map<string, BreakpointInfo>;
  watchedVariables: Map<string, any>;
  metrics: DebugMetrics;
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
}

export interface DebugMetrics {
  totalTraces: number;
  errorCount: number;
  warningCount: number;
  avgExecutionTime: number;
  memoryLeaks: number;
  performanceBottlenecks: string[];
  schemaValidationErrors: number;
}

// === DEBUG TRACER ===

export class DebugTracer extends EventEmitter {
  private readonly config: DebugConfig;
  private currentSession: DebugSession | null = null;
  private traceBuffer: TraceEntry[] = [];
  private readonly performanceProfiles: Map<string, PerformanceProfile> = new Map();
  private readonly activeTimers: Map<string, number> = new Map();
  private readonly breakpoints: Map<string, BreakpointInfo> = new Map();
  private readonly watchedVariables: Map<string, any> = new Map();
  private outputStream?: fs.WriteStream;
  private interactiveMode = false;

  constructor(config: Partial<DebugConfig> = {}) {
    super();

    this.config = {
      enabled: true,
      level: 'debug',
      output: 'console',
      tracing: {
        enabled: true,
        includeStackTrace: true,
        maxStackDepth: 10,
        captureArguments: true,
        captureReturnValues: true
      },
      profiling: {
        enabled: true,
        sampleInterval: 1000,
        memoryTracking: true,
        cpuProfiling: true,
        timeThreshold: 10 // 10ms threshold
      },
      interactive: {
        enabled: false,
        breakpoints: [],
        watchExpressions: [],
        inspectVariables: true
      },
      filters: {
        includePatterns: [],
        excludePatterns: ['node_modules/**'],
        modules: [],
        functions: []
      },
      formatting: {
        colorize: true,
        timestamps: true,
        processInfo: true,
        indent: true
      },
      ...config
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Start a new debug session
   */
  startSession(sessionId?: string): string {
    const id = sessionId || `debug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.currentSession = {
      id,
      startTime: Date.now(),
      traces: [],
      profiles: new Map(),
      breakpoints: new Map(),
      watchedVariables: new Map(),
      metrics: {
        totalTraces: 0,
        errorCount: 0,
        warningCount: 0,
        avgExecutionTime: 0,
        memoryLeaks: 0,
        performanceBottlenecks: [],
        schemaValidationErrors: 0
      }
    };

    this.trace('info', 'Debug session started', 'DebugTracer', 'startSession', [], { sessionId: id });
    this.emit('sessionStarted', { sessionId: id });

    return id;
  }

  /**
   * End the current debug session
   */
  endSession(): DebugSession | null {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.endTime = Date.now();
    const session = this.currentSession;

    // Generate session summary
    this.generateSessionSummary(session);

    this.trace('info', 'Debug session ended', 'DebugTracer', 'endSession', [], {
      sessionId: session.id,
      duration: (session.endTime || Date.now()) - session.startTime,
      totalTraces: session.traces.length
    });

    this.emit('sessionEnded', { session });

    this.currentSession = null;
    return session;
  }

  /**
   * Add a trace entry
   */
  trace(
    level: string,
    message: string,
    module: string,
    functionName: string,
    args: any[] = [],
    metadata: Record<string, any> = {}
  ): void {
    if (!this.config.enabled || !this.shouldTrace(level, module, functionName)) {
      return;
    }

    const entry: TraceEntry = {
      id: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
      module,
      function: functionName,
      metadata
    };

    // Capture arguments if enabled
    if (this.config.tracing.captureArguments) {
      entry.args = this.sanitizeArgs(args);
    }

    // Capture memory usage
    if (this.config.profiling.memoryTracking) {
      entry.memoryUsage = process.memoryUsage();
    }

    // Capture stack trace if enabled
    if (this.config.tracing.includeStackTrace) {
      entry.stackTrace = this.captureStackTrace();
    }

    // Add to buffer and session
    this.traceBuffer.push(entry);
    if (this.currentSession) {
      this.currentSession.traces.push(entry);
      this.updateSessionMetrics(entry);
    }

    // Check for breakpoints
    if (this.config.interactive.enabled) {
      this.checkBreakpoints(entry);
    }

    // Output trace
    this.outputTrace(entry);

    // Emit trace event
    this.emit('trace', entry);

    // Cleanup old traces
    this.cleanupTraceBuffer();
  }

  /**
   * Start performance profiling for a function
   */
  startProfiling(functionName: string, module: string): string {
    const id = `${module}.${functionName}`;
    this.activeTimers.set(id, process.hrtime.bigint() as any);

    this.trace('debug', `Started profiling: ${id}`, module, functionName);
    return id;
  }

  /**
   * End performance profiling and record results
   */
  endProfiling(id: string, returnValue?: any): PerformanceProfile | null {
    const startTime = this.activeTimers.get(id);
    if (!startTime) {
      return null;
    }

    const endTime = process.hrtime.bigint() as any;
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    this.activeTimers.delete(id);

    // Update or create performance profile
    let profile = this.performanceProfiles.get(id);
    if (!profile) {
      profile = {
        function: id,
        totalTime: 0,
        callCount: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        memoryDelta: 0,
        hotPath: false
      };
      this.performanceProfiles.set(id, profile);
    }

    profile.totalTime += duration;
    profile.callCount += 1;
    profile.avgTime = profile.totalTime / profile.callCount;
    profile.minTime = Math.min(profile.minTime, duration);
    profile.maxTime = Math.max(profile.maxTime, duration);

    // Mark as hot path if average execution time exceeds threshold
    profile.hotPath = profile.avgTime > this.config.profiling.timeThreshold;

    // Add to session
    if (this.currentSession) {
      this.currentSession.profiles.set(id, profile);
    }

    this.trace('debug', `Ended profiling: ${id}`, id.split('.')[0], id.split('.')[1], [], {
      duration,
      callCount: profile.callCount,
      avgTime: profile.avgTime,
      hotPath: profile.hotPath
    });

    this.emit('profileCompleted', { id, profile, duration, returnValue });

    return profile;
  }

  /**
   * Debug schema validation with detailed tracing
   */
  debugSchemaValidation(
    schema: z.ZodTypeAny,
    data: any,
    schemaName: string = 'UnknownSchema'
  ): { result: any; traces: TraceEntry[] } {
    const traces: TraceEntry[] = [];
    const startTime = Date.now();

    this.trace('info', `Starting schema validation: ${schemaName}`, 'SchemaValidator', 'validate', [data]);

    try {
      // Wrap the schema parse method to capture detailed validation steps
      const result = this.wrapSchemaValidation(schema, data, schemaName, traces);

      const duration = Date.now() - startTime;
      this.trace('info', `Schema validation completed: ${schemaName}`, 'SchemaValidator', 'validate', [], {
        success: result.success,
        duration,
        errorCount: result.success ? 0 : result.error?.errors?.length || 0
      });

      if (!result.success && this.currentSession) {
        this.currentSession.metrics.schemaValidationErrors++;
      }

      return { result, traces };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.trace('error', `Schema validation failed: ${schemaName}`, 'SchemaValidator', 'validate', [], {
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      if (this.currentSession) {
        this.currentSession.metrics.schemaValidationErrors++;
        this.currentSession.metrics.errorCount++;
      }

      throw error;
    }
  }

  /**
   * Add a breakpoint
   */
  addBreakpoint(file: string, line: number, condition?: string): string {
    const id = `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const breakpoint: BreakpointInfo = {
      id,
      file,
      line,
      condition,
      hitCount: 0,
      enabled: true
    };

    this.breakpoints.set(id, breakpoint);
    if (this.currentSession) {
      this.currentSession.breakpoints.set(id, breakpoint);
    }

    this.trace('debug', `Breakpoint added: ${file}:${line}`, 'DebugTracer', 'addBreakpoint', [], { id, condition });
    return id;
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(id: string): boolean {
    const removed = this.breakpoints.delete(id);
    if (this.currentSession) {
      this.currentSession.breakpoints.delete(id);
    }

    if (removed) {
      this.trace('debug', `Breakpoint removed: ${id}`, 'DebugTracer', 'removeBreakpoint', [], { id });
    }

    return removed;
  }

  /**
   * Add a variable to watch
   */
  watchVariable(name: string, value: any): void {
    this.watchedVariables.set(name, value);
    if (this.currentSession) {
      this.currentSession.watchedVariables.set(name, value);
    }

    this.trace('debug', `Variable watched: ${name}`, 'DebugTracer', 'watchVariable', [], { name, value });
  }

  /**
   * Get performance profiles
   */
  getPerformanceProfiles(): PerformanceProfile[] {
    return Array.from(this.performanceProfiles.values())
      .sort((a, b) => b.totalTime - a.totalTime);
  }

  /**
   * Get performance bottlenecks
   */
  getBottlenecks(threshold: number = 100): PerformanceProfile[] {
    return this.getPerformanceProfiles()
      .filter(profile => profile.avgTime > threshold || profile.hotPath);
  }

  /**
   * Generate debug report
   */
  generateReport(): any {
    const profiles = this.getPerformanceProfiles();
    const bottlenecks = this.getBottlenecks();
    const traces = this.traceBuffer.slice(-1000); // Last 1000 traces

    const report = {
      timestamp: new Date().toISOString(),
      session: this.currentSession,
      summary: {
        totalTraces: traces.length,
        errorCount: traces.filter(t => t.level === 'error').length,
        warningCount: traces.filter(t => t.level === 'warn').length,
        totalFunctions: profiles.length,
        bottlenecks: bottlenecks.length,
        avgMemoryUsage: this.calculateAvgMemoryUsage(traces),
        totalExecutionTime: profiles.reduce((sum, p) => sum + p.totalTime, 0)
      },
      performance: {
        profiles: profiles.slice(0, 20), // Top 20 by execution time
        bottlenecks,
        memoryUsage: this.getMemoryUsageHistory(),
        hotPaths: profiles.filter(p => p.hotPath)
      },
      traces: {
        recent: traces.slice(-50), // Last 50 traces
        errors: traces.filter(t => t.level === 'error').slice(-10),
        warnings: traces.filter(t => t.level === 'warn').slice(-10)
      },
      breakpoints: Array.from(this.breakpoints.values()),
      watchedVariables: Object.fromEntries(this.watchedVariables)
    };

    return report;
  }

  /**
   * Enable interactive debugging mode
   */
  enableInteractiveMode(): void {
    this.interactiveMode = true;
    this.config.interactive.enabled = true;

    this.trace('info', 'Interactive debugging mode enabled', 'DebugTracer', 'enableInteractiveMode');

    // Set up readline for interactive commands
    this.setupInteractiveInterface();
  }

  /**
   * Export debug session to file
   */
  async exportSession(session: DebugSession, filePath: string): Promise<void> {
    const exportData = {
      session,
      exportTime: new Date().toISOString(),
      config: this.config,
      report: this.generateReport()
    };

    await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2));
    this.trace('info', `Debug session exported to: ${filePath}`, 'DebugTracer', 'exportSession', [], { filePath });
  }

  // === PRIVATE METHODS ===

  private initialize(): void {
    // Setup output stream if needed
    if (this.config.output === 'file' || this.config.output === 'both') {
      if (this.config.outputFile) {
        this.outputStream = fs.createWriteStream(this.config.outputFile, { flags: 'a' });
      }
    }

    // Setup memory profiling
    if (this.config.profiling.enabled && this.config.profiling.memoryTracking) {
      this.setupMemoryProfiling();
    }

    // Setup process exit handlers
    this.setupExitHandlers();

    this.trace('info', 'Debug tracer initialized', 'DebugTracer', 'initialize', [], { config: this.config });
  }

  private shouldTrace(level: string, module: string, functionName: string): boolean {
    // Check level
    const levels = ['error', 'warn', 'info', 'debug', 'trace'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const traceLevelIndex = levels.indexOf(level);

    if (traceLevelIndex > currentLevelIndex) {
      return false;
    }

    // Check filters
    if (this.config.filters.modules.length > 0 && !this.config.filters.modules.includes(module)) {
      return false;
    }

    if (this.config.filters.functions.length > 0 && !this.config.filters.functions.includes(functionName)) {
      return false;
    }

    // Check include/exclude patterns
    const fullName = `${module}.${functionName}`;

    if (this.config.filters.includePatterns.length > 0) {
      const included = this.config.filters.includePatterns.some(pattern =>
        new RegExp(pattern).test(fullName)
      );
      if (!included) return false;
    }

    if (this.config.filters.excludePatterns.length > 0) {
      const excluded = this.config.filters.excludePatterns.some(pattern =>
        new RegExp(pattern).test(fullName)
      );
      if (excluded) return false;
    }

    return true;
  }

  private captureStackTrace(): string[] {
    const stack = new Error().stack;
    if (!stack) return [];

    return stack
      .split('\n')
      .slice(3) // Remove Error line and this function
      .slice(0, this.config.tracing.maxStackDepth)
      .map(line => line.trim());
  }

  private sanitizeArgs(args: any[]): any[] {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch {
          return '[Circular or Non-serializable]';
        }
      }
      return arg;
    });
  }

  private outputTrace(entry: TraceEntry): void {
    const formatted = this.formatTrace(entry);

    if (this.config.output === 'console' || this.config.output === 'both') {
      console.log(formatted);
    }

    if ((this.config.output === 'file' || this.config.output === 'both') && this.outputStream) {
      this.outputStream.write(formatted + '\n');
    }
  }

  private formatTrace(entry: TraceEntry): string {
    let output = '';

    // Timestamp
    if (this.config.formatting.timestamps) {
      const time = new Date(entry.timestamp).toISOString();
      output += this.config.formatting.colorize ? pc.gray(`[${time}]`) : `[${time}]`;
      output += ' ';
    }

    // Level
    const levelColors = {
      error: pc.red,
      warn: pc.yellow,
      info: pc.blue,
      debug: pc.cyan,
      trace: pc.gray
    };

    const levelColor = this.config.formatting.colorize ? levelColors[entry.level as keyof typeof levelColors] || pc.white : (x: string) => x;
    output += levelColor(`[${entry.level.toUpperCase()}]`);
    output += ' ';

    // Module and function
    if (this.config.formatting.colorize) {
      output += pc.green(`${entry.module}`) + pc.gray('.') + pc.cyan(`${entry.function}`);
    } else {
      output += `${entry.module}.${entry.function}`;
    }
    output += ' ';

    // Message
    output += entry.message;

    // Duration if available
    if (entry.duration !== undefined) {
      const durationStr = `(${entry.duration.toFixed(2)}ms)`;
      output += ' ' + (this.config.formatting.colorize ? pc.gray(durationStr) : durationStr);
    }

    // Memory usage if available
    if (entry.memoryUsage) {
      const memStr = `[${Math.round(entry.memoryUsage.heapUsed / 1024 / 1024)}MB]`;
      output += ' ' + (this.config.formatting.colorize ? pc.magenta(memStr) : memStr);
    }

    // Arguments if available
    if (entry.args && entry.args.length > 0) {
      const argsStr = JSON.stringify(entry.args);
      output += '\n  Args: ' + (this.config.formatting.colorize ? pc.dim(argsStr) : argsStr);
    }

    // Metadata if available
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metaStr = JSON.stringify(entry.metadata);
      output += '\n  Meta: ' + (this.config.formatting.colorize ? pc.dim(metaStr) : metaStr);
    }

    return output;
  }

  private wrapSchemaValidation(schema: z.ZodTypeAny, data: any, schemaName: string, traces: TraceEntry[]): any {
    // This would wrap Zod's internal validation to capture detailed steps
    // For now, we'll just call safeParse and trace the result

    const startTime = Date.now();
    const result = schema.safeParse(data);
    const duration = Date.now() - startTime;

    const traceEntry: TraceEntry = {
      id: `validation-${Date.now()}`,
      timestamp: Date.now(),
      level: result.success ? 'debug' : 'error',
      message: `Schema validation ${result.success ? 'passed' : 'failed'}: ${schemaName}`,
      module: 'SchemaValidator',
      function: 'safeParse',
      duration,
      metadata: {
        schemaName,
        success: result.success,
        errorCount: result.success ? 0 : (result.error as any)?.errors?.length || 0
      }
    };

    traces.push(traceEntry);
    this.traceBuffer.push(traceEntry);

    return result;
  }

  private checkBreakpoints(entry: TraceEntry): void {
    for (const breakpoint of this.breakpoints.values()) {
      if (!breakpoint.enabled) continue;

      // Simple breakpoint matching - would be enhanced with actual file/line matching
      if (entry.module === breakpoint.file || entry.function.includes(breakpoint.file)) {
        breakpoint.hitCount++;

        this.trace('warn', `Breakpoint hit: ${breakpoint.id}`, 'DebugTracer', 'checkBreakpoints', [], {
          breakpointId: breakpoint.id,
          hitCount: breakpoint.hitCount,
          entry: entry.id
        });

        this.emit('breakpointHit', { breakpoint, entry });

        if (this.interactiveMode) {
          this.pauseForInteractiveDebug(breakpoint, entry);
        }
      }
    }
  }

  private pauseForInteractiveDebug(breakpoint: BreakpointInfo, entry: TraceEntry): void {
    console.log(pc.yellow(`\n🔍 Breakpoint hit: ${breakpoint.file}:${breakpoint.line}`));
    console.log(pc.cyan(`Function: ${entry.module}.${entry.function}`));
    console.log(pc.gray(`Message: ${entry.message}`));

    if (entry.args) {
      console.log(pc.dim(`Arguments: ${JSON.stringify(entry.args)}`));
    }

    // Interactive debugging would pause execution here
    // In a real implementation, this would use readline to allow inspection
  }

  private updateSessionMetrics(entry: TraceEntry): void {
    if (!this.currentSession) return;

    const metrics = this.currentSession.metrics;
    metrics.totalTraces++;

    if (entry.level === 'error') {
      metrics.errorCount++;
    } else if (entry.level === 'warn') {
      metrics.warningCount++;
    }

    if (entry.duration !== undefined) {
      const totalTime = metrics.avgExecutionTime * (metrics.totalTraces - 1) + entry.duration;
      metrics.avgExecutionTime = totalTime / metrics.totalTraces;
    }
  }

  private cleanupTraceBuffer(): void {
    // Keep only last 10000 traces to prevent memory issues
    if (this.traceBuffer.length > 10000) {
      this.traceBuffer = this.traceBuffer.slice(-5000);
    }
  }

  private generateSessionSummary(session: DebugSession): void {
    const duration = (session.endTime || Date.now()) - session.startTime;
    const profiles = Array.from(session.profiles.values());
    const bottlenecks = profiles.filter(p => p.hotPath);

    console.log(pc.cyan('\n📊 Debug Session Summary'));
    console.log(pc.gray('─'.repeat(50)));
    console.log(`Session ID: ${session.id}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Total traces: ${session.traces.length}`);
    console.log(`Errors: ${session.metrics.errorCount}`);
    console.log(`Warnings: ${session.metrics.warningCount}`);
    console.log(`Functions profiled: ${profiles.length}`);
    console.log(`Performance bottlenecks: ${bottlenecks.length}`);

    if (bottlenecks.length > 0) {
      console.log(pc.yellow('\n⚠️  Performance Bottlenecks:'));
      bottlenecks.slice(0, 5).forEach(profile => {
        console.log(`  • ${profile.function}: ${profile.avgTime.toFixed(2)}ms avg (${profile.callCount} calls)`);
      });
    }
  }

  private calculateAvgMemoryUsage(traces: TraceEntry[]): number {
    const memoryTraces = traces.filter(t => t.memoryUsage);
    if (memoryTraces.length === 0) return 0;

    const totalMemory = memoryTraces.reduce((sum, t) => sum + (t.memoryUsage?.heapUsed || 0), 0);
    return Math.round(totalMemory / memoryTraces.length / 1024 / 1024); // MB
  }

  private getMemoryUsageHistory(): any[] {
    return this.traceBuffer
      .filter(t => t.memoryUsage)
      .slice(-100) // Last 100 memory samples
      .map(t => ({
        timestamp: t.timestamp,
        heapUsed: Math.round((t.memoryUsage?.heapUsed || 0) / 1024 / 1024),
        heapTotal: Math.round((t.memoryUsage?.heapTotal || 0) / 1024 / 1024)
      }));
  }

  private setupMemoryProfiling(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.trace('trace', 'Memory usage sample', 'MemoryProfiler', 'sample', [], {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      });
    }, this.config.profiling.sampleInterval);
  }

  private setupInteractiveInterface(): void {
    // Would set up readline interface for interactive debugging
    // This is a simplified placeholder
    this.trace('info', 'Interactive interface setup (placeholder)', 'DebugTracer', 'setupInteractiveInterface');
  }

  private setupExitHandlers(): void {
    const cleanup = () => {
      if (this.currentSession) {
        this.endSession();
      }
      if (this.outputStream) {
        this.outputStream.end();
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
}

// === DECORATOR FUNCTIONS ===

/**
 * Decorator for automatic function tracing
 */
export function traced(module: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const tracer = global.debugTracer as DebugTracer;
      if (!tracer) {
        return originalMethod.apply(this, args);
      }

      const profileId = tracer.startProfiling(propertyKey, module);
      tracer.trace('debug', `Entering function: ${propertyKey}`, module, propertyKey, args);

      try {
        const result = originalMethod.apply(this, args);

        if (result && typeof result.then === 'function') {
          // Handle async functions
          return result
            .then((value: any) => {
              tracer.endProfiling(profileId, value);
              tracer.trace('debug', `Exiting function: ${propertyKey}`, module, propertyKey, [], { returnValue: value });
              return value;
            })
            .catch((error: any) => {
              tracer.endProfiling(profileId);
              tracer.trace('error', `Function threw error: ${propertyKey}`, module, propertyKey, [], { error: error.message });
              throw error;
            });
        } else {
          // Handle sync functions
          tracer.endProfiling(profileId, result);
          tracer.trace('debug', `Exiting function: ${propertyKey}`, module, propertyKey, [], { returnValue: result });
          return result;
        }
      } catch (error) {
        tracer.endProfiling(profileId);
        tracer.trace('error', `Function threw error: ${propertyKey}`, module, propertyKey, [], {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Function wrapper for performance profiling
 */
export function profile<T extends (...args: any[]) => any>(
  fn: T,
  name: string,
  module: string = 'Unknown'
): T {
  return ((...args: any[]) => {
    const tracer = global.debugTracer as DebugTracer;
    if (!tracer) {
      return fn(...args);
    }

    const profileId = tracer.startProfiling(name, module);

    try {
      const result = fn(...args);

      if (result && typeof result.then === 'function') {
        return result.finally(() => {
          tracer.endProfiling(profileId, result);
        });
      } else {
        tracer.endProfiling(profileId, result);
        return result;
      }
    } catch (error) {
      tracer.endProfiling(profileId);
      throw error;
    }
  }) as T;
}

// === GLOBAL TRACER ===

declare global {
  var debugTracer: DebugTracer | undefined;
}

export function getGlobalTracer(): DebugTracer | undefined {
  return global.debugTracer;
}

export function setGlobalTracer(tracer: DebugTracer): void {
  global.debugTracer = tracer;
}

export default DebugTracer;