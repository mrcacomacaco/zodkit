/**
 * @fileoverview Advanced schema debugging tools with deep analysis
 * @module SchemaDebugger
 */

import { z } from 'zod';
type SafeParseReturnType<Input, Output> = z.ZodSafeParseSuccess<Output> | z.ZodSafeParseError<Input>;
import { EventEmitter } from 'events';
import * as pc from 'picocolors';

/**
 * Debug session configuration
 */
export interface DebugConfig {
  enableStackTrace?: boolean;
  enablePerformanceTracking?: boolean;
  enableMemoryProfiling?: boolean;
  enableVerboseLogging?: boolean;
  maxDepth?: number;
  captureIntermediateResults?: boolean;
  enableBreakpoints?: boolean;
  outputFormat?: 'console' | 'json' | 'html' | 'markdown';
  saveToFile?: boolean;
  includeMetadata?: boolean;
}

/**
 * Debug severity levels
 */
export type DebugSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Debug issue types
 */
export type DebugIssueType =
  | 'validation_failure'
  | 'type_mismatch'
  | 'constraint_violation'
  | 'performance_issue'
  | 'memory_leak'
  | 'circular_reference'
  | 'schema_complexity'
  | 'transformation_error'
  | 'parsing_error'
  | 'runtime_error';

/**
 * Debug context information
 */
export interface DebugContext {
  schemaPath: string[];
  dataPath: string[];
  currentValue: any;
  expectedType: string;
  actualType: string;
  constraints: any[];
  metadata: Record<string, any>;
  timestamp: number;
  sessionId: string;
}

/**
 * Debug issue details
 */
export interface DebugIssue {
  id: string;
  type: DebugIssueType;
  severity: DebugSeverity;
  message: string;
  description: string;
  context: DebugContext;
  stackTrace?: string[];
  suggestions: DebugSuggestion[];
  relatedIssues: string[];
  performance?: PerformanceMetrics;
  fixes: AutoFix[];
  codeSnippet?: string;
  documentation?: string;
}

/**
 * Debug suggestion
 */
export interface DebugSuggestion {
  type: 'quick_fix' | 'refactor' | 'optimization' | 'best_practice';
  title: string;
  description: string;
  code?: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  effort: 'easy' | 'moderate' | 'complex';
}

/**
 * Auto-fix capability
 */
export interface AutoFix {
  id: string;
  name: string;
  description: string;
  canAutoApply: boolean;
  isDestructive: boolean;
  apply: () => Promise<string>;
  preview: () => string;
  confidence: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  validationTime: number;
  memoryUsage: number;
  cpuUsage: number;
  operationCount: number;
  recursionDepth: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Debug session state
 */
export interface DebugSession {
  id: string;
  name: string;
  config: Required<DebugConfig>;
  issues: DebugIssue[];
  breakpoints: DebugBreakpoint[];
  callStack: DebugFrame[];
  variables: Record<string, any>;
  performance: PerformanceMetrics;
  startTime: number;
  endTime?: number;
  isActive: boolean;
}

/**
 * Debug breakpoint
 */
export interface DebugBreakpoint {
  id: string;
  schemaPath: string[];
  condition?: string;
  isEnabled: boolean;
  hitCount: number;
  logMessage?: string;
}

/**
 * Debug stack frame
 */
export interface DebugFrame {
  function: string;
  schemaPath: string[];
  dataPath: string[];
  value: any;
  metadata: Record<string, any>;
  timestamp: number;
}

/**
 * Validation trace step
 */
export interface ValidationTrace {
  step: number;
  operation: string;
  schemaPath: string[];
  dataPath: string[];
  input: any;
  output: any;
  success: boolean;
  duration: number;
  issues: DebugIssue[];
  metadata: Record<string, any>;
}

/**
 * Schema complexity analysis
 */
export interface ComplexityAnalysis {
  overallScore: number;
  factors: ComplexityFactor[];
  recommendations: string[];
  breakdown: {
    depth: number;
    breadth: number;
    unionComplexity: number;
    intersectionComplexity: number;
    refineComplexity: number;
    transformComplexity: number;
  };
}

/**
 * Complexity factor
 */
export interface ComplexityFactor {
  type: string;
  score: number;
  description: string;
  impact: 'low' | 'medium' | 'high';
  location: string[];
}

/**
 * Advanced schema debugger
 */
export class SchemaDebugger extends EventEmitter {
  private readonly sessions = new Map<string, DebugSession>();
  private readonly globalBreakpoints = new Map<string, DebugBreakpoint>();
  private readonly traceBuffer = new Map<string, ValidationTrace[]>();
  private readonly performanceProfiler: PerformanceProfiler;
  private readonly complexityAnalyzer: ComplexityAnalyzer;
  private readonly autoFixEngine: AutoFixEngine;

  constructor() {
    super();
    this.performanceProfiler = new PerformanceProfiler();
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.autoFixEngine = new AutoFixEngine();
  }

  /**
   * Start a new debug session
   */
  startSession(name: string, config: Partial<DebugConfig> = {}): DebugSession {
    const sessionId = this.generateSessionId();

    const fullConfig: Required<DebugConfig> = {
      enableStackTrace: config.enableStackTrace ?? true,
      enablePerformanceTracking: config.enablePerformanceTracking ?? true,
      enableMemoryProfiling: config.enableMemoryProfiling ?? false,
      enableVerboseLogging: config.enableVerboseLogging ?? false,
      maxDepth: config.maxDepth ?? 100,
      captureIntermediateResults: config.captureIntermediateResults ?? true,
      enableBreakpoints: config.enableBreakpoints ?? false,
      outputFormat: config.outputFormat ?? 'console',
      saveToFile: config.saveToFile ?? false,
      includeMetadata: config.includeMetadata ?? true
    };

    const session: DebugSession = {
      id: sessionId,
      name,
      config: fullConfig,
      issues: [],
      breakpoints: [],
      callStack: [],
      variables: {},
      performance: {
        validationTime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        operationCount: 0,
        recursionDepth: 0,
        cacheHits: 0,
        cacheMisses: 0
      },
      startTime: Date.now(),
      isActive: true
    };

    this.sessions.set(sessionId, session);
    this.traceBuffer.set(sessionId, []);

    this.emit('sessionStarted', session);
    return session;
  }

  /**
   * Debug schema validation with comprehensive analysis
   */
  async debugValidation<T>(
    schema: z.ZodType<T>,
    data: any,
    sessionId: string
  ): Promise<{
    result: SafeParseReturnType<any, T>;
    issues: DebugIssue[];
    trace: ValidationTrace[];
    performance: PerformanceMetrics;
    suggestions: DebugSuggestion[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    // @ts-ignore: startTime reserved for future performance monitoring
    const startTime = performance.now();
    const issues: DebugIssue[] = [];
    const trace: ValidationTrace[] = [];
    const suggestions: DebugSuggestion[] = [];

    try {
      // Start performance tracking
      this.performanceProfiler.start();

      // Create instrumented schema
      const instrumentedSchema = this.instrumentSchema(schema, session, issues, trace);

      // Perform validation with debugging
      const result = instrumentedSchema.safeParse(data);

      // Stop performance tracking
      const performanceMetrics = this.performanceProfiler.stop();

      // Analyze failures
      if (!result.success) {
        const detailedIssues = await this.analyzeValidationFailure(
          result.error,
          schema,
          data,
          session
        );
        issues.push(...detailedIssues);
      }

      // Generate suggestions
      const generatedSuggestions = await this.generateSuggestions(schema, data, issues, session);
      suggestions.push(...generatedSuggestions);

      // Store trace
      this.traceBuffer.set(sessionId, trace);

      // Update session
      session.issues.push(...issues);
      session.performance = performanceMetrics;

      this.emit('validationDebugged', {
        sessionId,
        result,
        issues,
        trace,
        suggestions
      });

      return {
        result,
        issues,
        trace,
        performance: performanceMetrics,
        suggestions
      };

    } catch (error) {
      const runtimeIssue = this.createRuntimeIssue(error, session);
      issues.push(runtimeIssue);

      return {
        result: { success: false, error: new z.ZodError([]) } as SafeParseReturnType<any, T>,
        issues,
        trace,
        performance: this.performanceProfiler.stop(),
        suggestions
      };
    }
  }

  /**
   * Analyze schema complexity
   */
  analyzeComplexity(schema: z.ZodType<any>): ComplexityAnalysis {
    return this.complexityAnalyzer.analyze(schema);
  }

  /**
   * Debug schema performance
   */
  async debugPerformance<T>(
    schema: z.ZodType<T>,
    testData: any[],
    sessionId: string
  ): Promise<{
    results: Array<{ data: any; time: number; success: boolean }>;
    analysis: PerformanceAnalysis;
    recommendations: string[];
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    const results: Array<{ data: any; time: number; success: boolean }> = [];
    const timings: number[] = [];

    for (const data of testData) {
      const start = performance.now();
      const result = schema.safeParse(data);
      const end = performance.now();

      const time = end - start;
      timings.push(time);
      results.push({ data, time, success: result.success });
    }

    const analysis: PerformanceAnalysis = {
      totalTime: timings.reduce((sum, time) => sum + time, 0),
      averageTime: timings.reduce((sum, time) => sum + time, 0) / timings.length,
      minTime: Math.min(...timings),
      maxTime: Math.max(...timings),
      standardDeviation: this.calculateStandardDeviation(timings),
      throughput: testData.length / (timings.reduce((sum, time) => sum + time, 0) / 1000),
      bottlenecks: await this.identifyBottlenecks(schema, timings)
    };

    const recommendations = this.generatePerformanceRecommendations(analysis, schema);

    this.emit('performanceDebugged', {
      sessionId,
      results,
      analysis,
      recommendations
    });

    return { results, analysis, recommendations };
  }

  /**
   * Set debug breakpoint
   */
  setBreakpoint(
    sessionId: string,
    schemaPath: string[],
    condition?: string,
    logMessage?: string
  ): DebugBreakpoint {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    const breakpoint: DebugBreakpoint = {
      id: this.generateBreakpointId(),
      schemaPath,
      isEnabled: true,
      hitCount: 0,
      ...(condition !== undefined && { condition }),
      ...(logMessage !== undefined && { logMessage })
    };

    session.breakpoints.push(breakpoint);
    this.globalBreakpoints.set(breakpoint.id, breakpoint);

    this.emit('breakpointSet', { sessionId, breakpoint });
    return breakpoint;
  }

  /**
   * Get debug trace for session
   */
  getTrace(sessionId: string): ValidationTrace[] {
    return this.traceBuffer.get(sessionId) || [];
  }

  /**
   * Generate debug report
   */
  async generateReport(
    sessionId: string,
    format: 'console' | 'json' | 'html' | 'markdown' = 'console'
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    const trace = this.traceBuffer.get(sessionId) || [];

    switch (format) {
      case 'console':
        return this.generateConsoleReport(session, trace);
      case 'json':
        return this.generateJsonReport(session, trace);
      case 'html':
        return this.generateHtmlReport(session, trace);
      case 'markdown':
        return this.generateMarkdownReport(session, trace);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Auto-fix detected issues
   */
  async autoFix(sessionId: string, issueIds?: string[]): Promise<{
    applied: AutoFix[];
    failed: Array<{ fix: AutoFix; error: string }>;
    preview: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    const targetIssues = issueIds
      ? session.issues.filter(issue => issueIds.includes(issue.id))
      : session.issues;

    return this.autoFixEngine.applyFixes(targetIssues);
  }

  /**
   * End debug session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    session.isActive = false;
    session.endTime = Date.now();

    // Clean up breakpoints
    for (const breakpoint of session.breakpoints) {
      this.globalBreakpoints.delete(breakpoint.id);
    }

    this.emit('sessionEnded', session);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): DebugSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  // Private helper methods

  private instrumentSchema<T>(
    schema: z.ZodType<T>,
    session: DebugSession,
    _issues: DebugIssue[],
    trace: ValidationTrace[]
  ): z.ZodType<T> {
    // Create a proxy that intercepts validation calls
    return new Proxy(schema, {
      get: (target, prop) => {
        if (prop === 'safeParse' || prop === 'parse') {
          return (data: any) => {
            const step = trace.length;
            const startTime = performance.now();

            // Check breakpoints
            if (session.config.enableBreakpoints) {
              this.checkBreakpoints(session, [], [], data);
            }

            // Call original method
            const result = (target as any)[prop](data);
            const endTime = performance.now();

            // Record trace
            const traceStep: ValidationTrace = {
              step,
              operation: String(prop),
              schemaPath: [],
              dataPath: [],
              input: data,
              output: result,
              success: result.success !== false,
              duration: endTime - startTime,
              issues: [],
              metadata: {
                schemaType: target.constructor.name,
                timestamp: Date.now()
              }
            };

            trace.push(traceStep);

            return result;
          };
        }

        return target[prop as keyof typeof target];
      }
    });
  }

  private async analyzeValidationFailure(
    error: z.ZodError,
    schema: z.ZodType<any>,
    data: any,
    session: DebugSession
  ): Promise<DebugIssue[]> {
    const issues: DebugIssue[] = [];

    for (const zodIssue of error.issues) {
      const stackTrace = session.config.enableStackTrace ? this.captureStackTrace() : undefined;
      const issue: DebugIssue = {
        id: this.generateIssueId(),
        type: this.mapZodIssueToDebugType(zodIssue.code),
        severity: this.mapZodIssueSeverity(zodIssue.code),
        message: zodIssue.message,
        description: this.generateIssueDescription(zodIssue, data),
        context: {
          schemaPath: zodIssue.path.map(String),
          dataPath: zodIssue.path.map(String),
          currentValue: this.getValueAtPath(data, zodIssue.path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number')),
          expectedType: this.inferExpectedType(zodIssue),
          actualType: typeof this.getValueAtPath(data, zodIssue.path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number')),
          constraints: [],
          metadata: { zodIssue },
          timestamp: Date.now(),
          sessionId: session.id
        },
        suggestions: await this.generateIssueSuggestions(zodIssue, data, schema),
        relatedIssues: [],
        fixes: await this.generateAutoFixes(zodIssue, data, schema),
        codeSnippet: this.generateCodeSnippet(zodIssue, schema),
        documentation: this.generateDocumentation(zodIssue),
        ...(stackTrace !== undefined && { stackTrace })
      };

      issues.push(issue);
    }

    return issues;
  }

  private async generateSuggestions(
    schema: z.ZodType<any>,
    _data: any,
    issues: DebugIssue[],
    _session: DebugSession
  ): Promise<DebugSuggestion[]> {
    const suggestions: DebugSuggestion[] = [];

    // Analyze common patterns
    if (issues.length > 3) {
      suggestions.push({
        type: 'refactor',
        title: 'Consider schema simplification',
        description: 'Multiple validation failures suggest the schema might be too complex',
        confidence: 0.7,
        impact: 'medium',
        effort: 'moderate'
      });
    }

    // Performance suggestions
    const complexity = this.complexityAnalyzer.analyze(schema);
    if (complexity.overallScore > 50) {
      suggestions.push({
        type: 'optimization',
        title: 'Optimize schema complexity',
        description: `Schema complexity score: ${complexity.overallScore}/100`,
        confidence: 0.9,
        impact: 'high',
        effort: 'moderate'
      });
    }

    return suggestions;
  }

  private checkBreakpoints(
    session: DebugSession,
    schemaPath: string[],
    dataPath: string[],
    value: any
  ): void {
    for (const breakpoint of session.breakpoints) {
      if (!breakpoint.isEnabled) continue;

      const pathMatches = this.pathsMatch(breakpoint.schemaPath, schemaPath);
      const conditionMet = !breakpoint.condition || this.evaluateCondition(breakpoint.condition, value);

      if (pathMatches && conditionMet) {
        breakpoint.hitCount++;

        if (breakpoint.logMessage) {
          console.log(pc.blue(`[BREAKPOINT] ${breakpoint.logMessage}`));
        }

        // Emit breakpoint hit event
        this.emit('breakpointHit', {
          sessionId: session.id,
          breakpoint,
          schemaPath,
          dataPath,
          value
        });

        // Pause execution (in a real debugger, this would pause)
        if (session.config.enableVerboseLogging) {
          console.log(pc.yellow(`Breakpoint hit at ${schemaPath.join('.')}`));
          console.log(`Value:`, value);
        }
      }
    }
  }

  private createRuntimeIssue(error: any, session: DebugSession): DebugIssue {
    return {
      id: this.generateIssueId(),
      type: 'runtime_error',
      severity: 'critical',
      message: error.message || 'Runtime error occurred',
      description: `An unexpected runtime error occurred during validation: ${error.message}`,
      context: {
        schemaPath: [],
        dataPath: [],
        currentValue: undefined,
        expectedType: 'unknown',
        actualType: 'error',
        constraints: [],
        metadata: { error: error.toString() },
        timestamp: Date.now(),
        sessionId: session.id
      },
      stackTrace: session.config.enableStackTrace ? error.stack?.split('\n') : undefined,
      suggestions: [{
        type: 'quick_fix',
        title: 'Check input data',
        description: 'Verify that the input data is valid and matches expected format',
        confidence: 0.8,
        impact: 'high',
        effort: 'easy'
      }],
      relatedIssues: [],
      fixes: []
    };
  }

  private async identifyBottlenecks(
    _schema: z.ZodType<any>,
    timings: number[]
  ): Promise<string[]> {
    const bottlenecks: string[] = [];

    // Simple bottleneck detection
    const averageTime = timings.reduce((sum, time) => sum + time, 0) / timings.length;
    const slowTimings = timings.filter(time => time > averageTime * 2);

    if (slowTimings.length > timings.length * 0.1) {
      bottlenecks.push('Inconsistent validation performance detected');
    }

    if (averageTime > 10) {
      bottlenecks.push('Overall validation performance is slow');
    }

    return bottlenecks;
  }

  private generatePerformanceRecommendations(
    analysis: PerformanceAnalysis,
    _schema: z.ZodType<any>
  ): string[] {
    const recommendations: string[] = [];

    if (analysis.averageTime > 5) {
      recommendations.push('Consider simplifying complex schema structures');
    }

    if (analysis.standardDeviation > analysis.averageTime * 0.5) {
      recommendations.push('Performance varies significantly - investigate data-dependent bottlenecks');
    }

    if (analysis.throughput < 1000) {
      recommendations.push('Low throughput detected - consider schema optimization');
    }

    return recommendations;
  }

  private generateConsoleReport(session: DebugSession, trace: ValidationTrace[]): string {
    const lines: string[] = [];

    lines.push(pc.bold(`🐛 Debug Report: ${session.name}`));
    lines.push(pc.gray('─'.repeat(80)));

    // Session info
    lines.push(`\n${pc.cyan('Session Info:')}`);
    lines.push(`  ID: ${session.id}`);
    lines.push(`  Duration: ${session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime}ms`);
    lines.push(`  Issues: ${session.issues.length}`);

    // Issues summary
    if (session.issues.length > 0) {
      lines.push(`\n${pc.red('Issues Found:')}`);

      const issuesByType = session.issues.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [type, count] of Object.entries(issuesByType)) {
        lines.push(`  ${type}: ${count}`);
      }

      // Detailed issues
      lines.push(`\n${pc.red('Detailed Issues:')}`);
      session.issues.slice(0, 5).forEach((issue, index) => {
        lines.push(`\n${index + 1}. ${pc.red(issue.severity.toUpperCase())} ${issue.message}`);
        lines.push(`   Type: ${issue.type}`);
        lines.push(`   Path: ${issue.context.schemaPath.join('.')}`);

        if (issue.suggestions && issue.suggestions.length > 0 && issue.suggestions[0]) {
          lines.push(`   Suggestion: ${issue.suggestions[0].description}`);
        }
      });

      if (session.issues.length > 5) {
        lines.push(`\n   ... and ${session.issues.length - 5} more issues`);
      }
    }

    // Performance summary
    lines.push(`\n${pc.cyan('Performance:')}`);
    lines.push(`  Validation time: ${session.performance.validationTime.toFixed(2)}ms`);
    lines.push(`  Memory usage: ${(session.performance.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    lines.push(`  Operations: ${session.performance.operationCount}`);

    // Trace summary
    if (trace.length > 0) {
      lines.push(`\n${pc.cyan('Validation Trace:')}`);
      lines.push(`  Steps: ${trace.length}`);
      lines.push(`  Total time: ${trace.reduce((sum, step) => sum + step.duration, 0).toFixed(2)}ms`);
    }

    return lines.join('\n');
  }

  private generateJsonReport(session: DebugSession, trace: ValidationTrace[]): string {
    return JSON.stringify({
      session: {
        id: session.id,
        name: session.name,
        duration: session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime,
        config: session.config
      },
      issues: session.issues,
      performance: session.performance,
      trace,
      summary: {
        totalIssues: session.issues.length,
        criticalIssues: session.issues.filter(i => i.severity === 'critical').length,
        errorIssues: session.issues.filter(i => i.severity === 'error').length,
        warningIssues: session.issues.filter(i => i.severity === 'warning').length
      }
    }, null, 2);
  }

  private generateHtmlReport(session: DebugSession, _trace: ValidationTrace[]): string {
    // HTML report generation would go here
    return `<html><head><title>Debug Report: ${session.name}</title></head><body><h1>Debug Report</h1><p>HTML report not yet implemented</p></body></html>`;
  }

  private generateMarkdownReport(session: DebugSession, _trace: ValidationTrace[]): string {
    const lines: string[] = [];

    lines.push(`# Debug Report: ${session.name}`);
    lines.push('');

    lines.push('## Session Information');
    lines.push(`- **ID**: ${session.id}`);
    lines.push(`- **Duration**: ${session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime}ms`);
    lines.push(`- **Issues**: ${session.issues.length}`);
    lines.push('');

    if (session.issues.length > 0) {
      lines.push('## Issues Found');
      lines.push('');

      session.issues.forEach((issue, index) => {
        lines.push(`### ${index + 1}. ${issue.message}`);
        lines.push(`- **Type**: ${issue.type}`);
        lines.push(`- **Severity**: ${issue.severity}`);
        lines.push(`- **Path**: ${issue.context.schemaPath.join('.')}`);
        lines.push(`- **Description**: ${issue.description}`);

        if (issue.suggestions.length > 0) {
          lines.push('- **Suggestions**:');
          issue.suggestions.forEach(suggestion => {
            lines.push(`  - ${suggestion.description}`);
          });
        }
        lines.push('');
      });
    }

    lines.push('## Performance Metrics');
    lines.push(`- **Validation Time**: ${session.performance.validationTime.toFixed(2)}ms`);
    lines.push(`- **Memory Usage**: ${(session.performance.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    lines.push(`- **Operations**: ${session.performance.operationCount}`);
    lines.push('');

    return lines.join('\n');
  }

  // Utility methods

  private generateSessionId(): string {
    return `debug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateIssueId(): string {
    return `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBreakpointId(): string {
    return `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapZodIssueToDebugType(code: string): DebugIssueType {
    switch (code) {
      case 'invalid_type':
        return 'type_mismatch';
      case 'too_small':
      case 'too_big':
        return 'constraint_violation';
      default:
        return 'validation_failure';
    }
  }

  private mapZodIssueSeverity(code: string): DebugSeverity {
    switch (code) {
      case 'invalid_type':
        return 'error';
      case 'too_small':
      case 'too_big':
        return 'warning';
      default:
        return 'info';
    }
  }

  private generateIssueDescription(issue: z.ZodIssue, data: any): string {
    const value = this.getValueAtPath(data, issue.path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number'));
    return `Validation failed at path '${issue.path.join('.')}' with value: ${JSON.stringify(value)}. ${issue.message}`;
  }

  private async generateIssueSuggestions(
    issue: z.ZodIssue,
    _data: any,
    _schema: z.ZodType<any>
  ): Promise<DebugSuggestion[]> {
    const suggestions: DebugSuggestion[] = [];

    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        suggestions.push({
          type: 'quick_fix',
          title: 'Type conversion',
          description: `Convert value to expected type: ${issue.expected}`,
          confidence: 0.8,
          impact: 'high',
          effort: 'easy'
        });
        break;

      case z.ZodIssueCode.too_small:
        suggestions.push({
          type: 'quick_fix',
          title: 'Increase value',
          description: `Increase value to meet minimum requirement`,
          confidence: 0.9,
          impact: 'medium',
          effort: 'easy'
        });
        break;
    }

    return suggestions;
  }

  private async generateAutoFixes(
    issue: z.ZodIssue,
    data: any,
    _schema: z.ZodType<any>
  ): Promise<AutoFix[]> {
    const fixes: AutoFix[] = [];

    if (issue.code === z.ZodIssueCode.invalid_type) {
      fixes.push({
        id: `fix-${Date.now()}`,
        name: 'Type Conversion',
        description: `Convert ${typeof this.getValueAtPath(data, issue.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number'))} to ${issue.expected}`,
        canAutoApply: true,
        isDestructive: false,
        apply: async () => {
          // Auto-fix implementation would go here
          return 'Type conversion applied';
        },
        preview: () => `Convert value to ${issue.expected}`,
        confidence: 0.8
      });
    }

    return fixes;
  }

  private generateCodeSnippet(issue: z.ZodIssue, _schema: z.ZodType<any>): string {
    return `// Schema validation failed at path: ${issue.path.join('.')}\n// Issue: ${issue.message}`;
  }

  private generateDocumentation(issue: z.ZodIssue): string {
    return `For more information about ${issue.code}, see: https://zod.dev/ERROR_HANDLING`;
  }

  private getValueAtPath(data: any, path: (string | number)[]): any {
    let current = data;
    for (const segment of path) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  private inferExpectedType(issue: z.ZodIssue): string {
    if ('expected' in issue) {
      return String(issue.expected);
    }
    return 'unknown';
  }

  private captureStackTrace(): string[] {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(2) : [];
  }

  private pathsMatch(pattern: string[], actual: string[]): boolean {
    if (pattern.length !== actual.length) return false;
    return pattern.every((segment, index) => segment === actual[index] || segment === '*');
  }

  private evaluateCondition(condition: string, value: any): boolean {
    // Simple condition evaluation - in practice, use a proper expression evaluator
    try {
      return new Function('value', `return ${condition}`)(value);
    } catch {
      return false;
    }
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

/**
 * Performance analysis result
 */
interface PerformanceAnalysis {
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  standardDeviation: number;
  throughput: number;
  bottlenecks: string[];
}

/**
 * Performance profiler
 */
class PerformanceProfiler {
  private startTime?: number;
  private readonly metrics: PerformanceMetrics = {
    validationTime: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    operationCount: 0,
    recursionDepth: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  start(): void {
    this.startTime = performance.now();
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
  }

  stop(): PerformanceMetrics {
    if (this.startTime) {
      this.metrics.validationTime = performance.now() - this.startTime;
    }
    return { ...this.metrics };
  }
}

/**
 * Complexity analyzer
 */
class ComplexityAnalyzer {
  analyze(schema: z.ZodType<any>): ComplexityAnalysis {
    const factors: ComplexityFactor[] = [];
    let score = 0;

    // Analyze schema structure
    const analysis = this.analyzeSchemaStructure(schema, []);

    score += analysis.depth * 2;
    score += analysis.breadth;
    score += analysis.unionComplexity * 3;
    score += analysis.intersectionComplexity * 4;
    score += analysis.refineComplexity * 5;

    if (analysis.depth > 10) {
      factors.push({
        type: 'deep_nesting',
        score: analysis.depth * 2,
        description: `Schema nesting depth: ${analysis.depth}`,
        impact: 'high',
        location: []
      });
    }

    return {
      overallScore: Math.min(score, 100),
      factors,
      recommendations: this.generateComplexityRecommendations(score, analysis),
      breakdown: analysis
    };
  }

  private analyzeSchemaStructure(_schema: z.ZodType<any>, path: string[]): {
    depth: number;
    breadth: number;
    unionComplexity: number;
    intersectionComplexity: number;
    refineComplexity: number;
    transformComplexity: number;
  } {
    // Simplified complexity analysis
    return {
      depth: path.length,
      breadth: 1,
      unionComplexity: 0,
      intersectionComplexity: 0,
      refineComplexity: 0,
      transformComplexity: 0
    };
  }

  private generateComplexityRecommendations(score: number, analysis: any): string[] {
    const recommendations: string[] = [];

    if (score > 50) {
      recommendations.push('Consider breaking down complex schemas into smaller, reusable components');
    }

    if (analysis.depth > 10) {
      recommendations.push('Reduce nesting depth by flattening object structures');
    }

    return recommendations;
  }
}

/**
 * Auto-fix engine
 */
class AutoFixEngine {
  async applyFixes(issues: DebugIssue[]): Promise<{
    applied: AutoFix[];
    failed: Array<{ fix: AutoFix; error: string }>;
    preview: string;
  }> {
    const applied: AutoFix[] = [];
    const failed: Array<{ fix: AutoFix; error: string }> = [];
    const previews: string[] = [];

    for (const issue of issues) {
      for (const fix of issue.fixes) {
        if (fix.canAutoApply) {
          try {
            await fix.apply();
            applied.push(fix);
            previews.push(fix.preview());
          } catch (error) {
            failed.push({
              fix,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }

    return {
      applied,
      failed,
      preview: previews.join('\n')
    };
  }
}

/**
 * Create schema debugger instance
 */
export function createSchemaDebugger(): SchemaDebugger {
  return new SchemaDebugger();
}

/**
 * Global debugger instance
 */
let globalDebugger: SchemaDebugger | null = null;

/**
 * Get global debugger instance
 */
export function getGlobalDebugger(): SchemaDebugger {
  if (!globalDebugger) {
    globalDebugger = new SchemaDebugger();
  }
  return globalDebugger;
}