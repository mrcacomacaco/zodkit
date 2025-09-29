/**
 * @fileoverview Schema Health Monitor for comprehensive codebase analysis
 * @module HealthMonitor
 */

// @ts-ignore: Reserved for future schema validation
import * as z from 'zod';
import { EventEmitter } from 'events';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { Config } from './config';
import { SchemaInfo, SchemaDiscovery } from './schema-discovery';
import { getGlobalCache } from './schema-cache';
import { getGlobalStreamingService } from './streaming-service';

/**
 * Health check severity levels
 */
export type HealthSeverity = 'critical' | 'warning' | 'info' | 'success';

/**
 * Health check categories
 */
export type HealthCategory =
  | 'structure'
  | 'performance'
  | 'security'
  | 'maintainability'
  | 'compatibility'
  | 'coverage'
  | 'complexity'
  | 'dependencies'
  | 'naming'
  | 'documentation';

/**
 * Individual health check result
 */
export interface HealthCheck {
  id: string;
  name: string;
  category: HealthCategory;
  severity: HealthSeverity;
  message: string;
  description?: string;
  file?: string;
  line?: number;
  column?: number;
  rule: string;
  code: string;
  suggestion?: string;
  autoFixable?: boolean;
  impact: 'low' | 'medium' | 'high';
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

/**
 * Health score breakdown by category
 */
export interface HealthScore {
  overall: number; // 0-100
  categories: Record<HealthCategory, {
    score: number;
    checks: number;
    issues: number;
    weight: number;
  }>;
  trend: 'improving' | 'stable' | 'declining';
  lastUpdate: number;
}

/**
 * Comprehensive health report
 */
export interface HealthReport {
  timestamp: number;
  projectPath: string;
  summary: {
    totalSchemas: number;
    healthySchemas: number;
    totalChecks: number;
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    autoFixableIssues: number;
  };
  score: HealthScore;
  checks: HealthCheck[];
  schemas: SchemaHealthInfo[];
  recommendations: HealthRecommendation[];
  metrics: HealthMetrics;
  trends: HealthTrend[];
}

/**
 * Schema-specific health information
 */
export interface SchemaHealthInfo {
  schema: SchemaInfo;
  health: {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    checks: HealthCheck[];
    complexity: ComplexityMetrics;
    usage: UsageMetrics;
    dependencies: DependencyInfo[];
  };
}

/**
 * Health monitoring configuration
 */
export interface HealthConfig {
  enabled?: boolean;
  watchMode?: boolean;
  checkInterval?: number; // in milliseconds
  includeCategories?: HealthCategory[];
  excludeCategories?: HealthCategory[];
  thresholds?: {
    critical: number; // score threshold for critical
    warning: number;  // score threshold for warning
  };
  weights?: Partial<Record<HealthCategory, number>>;
  autoFix?: boolean;
  generateReports?: boolean;
  reportPath?: string;
  historicalData?: boolean;
  maxHistoryDays?: number;
  enableTrending?: boolean;
  notifications?: {
    onCritical?: boolean;
    onScoreChange?: number; // threshold for score change notifications
    webhookUrl?: string;
  };
}

/**
 * Complexity metrics for schemas
 */
export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  structural: number;
  nesting: number;
  properties: number;
  unions: number;
  intersections: number;
  conditionals: number;
  recursions: number;
  score: number; // 0-100, lower is better
}

/**
 * Usage metrics for schemas
 */
export interface UsageMetrics {
  references: number;
  imports: number;
  validations: number;
  testCoverage: number;
  apiEndpoints: number;
  lastUsed?: number;
  popularity: number; // 0-100
}

/**
 * Dependency information
 */
export interface DependencyInfo {
  type: 'extends' | 'imports' | 'uses' | 'references';
  target: string;
  file: string;
  line?: number;
  bidirectional: boolean;
  strength: 'weak' | 'medium' | 'strong';
}

/**
 * Health recommendations
 */
export interface HealthRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: HealthCategory;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actions: RecommendationAction[];
  confidence: number;
  relatedChecks: string[];
}

/**
 * Recommendation actions
 */
export interface RecommendationAction {
  type: 'refactor' | 'optimize' | 'fix' | 'document' | 'test' | 'remove';
  description: string;
  command?: string;
  automated: boolean;
  risk: 'low' | 'medium' | 'high';
}

/**
 * Health metrics for monitoring
 */
export interface HealthMetrics {
  checksPerformed: number;
  checksPerSecond: number;
  avgProcessingTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  filesScanned: number;
  schemasAnalyzed: number;
  errorsDetected: number;
  autoFixesApplied: number;
}

/**
 * Health trend data
 */
export interface HealthTrend {
  timestamp: number;
  score: number;
  categories: Record<HealthCategory, number>;
  issues: Record<HealthSeverity, number>;
  schemas: number;
}

/**
 * Comprehensive schema health monitoring system
 */
export class HealthMonitor extends EventEmitter {
  private readonly config: Required<HealthConfig>;
  private readonly cache = getGlobalCache();
  // @ts-ignore: Reserved for future streaming integration
  private readonly streamingService = getGlobalStreamingService();
  private watchTimer?: NodeJS.Timeout;
  private isRunning = false;
  private history: HealthTrend[] = [];
  private lastReport?: HealthReport;

  constructor(config: HealthConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? true,
      watchMode: config.watchMode ?? false,
      checkInterval: config.checkInterval ?? 300000, // 5 minutes
      includeCategories: config.includeCategories ?? [
        'structure', 'performance', 'security', 'maintainability',
        'compatibility', 'coverage', 'complexity', 'dependencies'
      ],
      excludeCategories: config.excludeCategories ?? [],
      thresholds: {
        critical: config.thresholds?.critical ?? 60,
        warning: config.thresholds?.warning ?? 80,
        ...config.thresholds
      },
      weights: {
        structure: 20,
        performance: 15,
        security: 25,
        maintainability: 15,
        compatibility: 10,
        coverage: 10,
        complexity: 5,
        ...config.weights
      },
      autoFix: config.autoFix ?? false,
      generateReports: config.generateReports ?? true,
      reportPath: config.reportPath ?? './health-reports',
      historicalData: config.historicalData ?? true,
      maxHistoryDays: config.maxHistoryDays ?? 30,
      enableTrending: config.enableTrending ?? true,
      notifications: {
        onCritical: true,
        onScoreChange: 10,
        ...config.notifications
      }
    };
  }

  /**
   * Start health monitoring
   */
  async start(projectPath: string = process.cwd()): Promise<void> {
    if (this.isRunning) {
      throw new Error('Health monitor is already running');
    }

    this.isRunning = true;
    this.emit('start', { projectPath });

    try {
      // Initial health check
      const report = await this.performHealthCheck(projectPath);
      await this.processReport(report);

      // Start watch mode if enabled
      if (this.config.watchMode) {
        this.startWatchMode(projectPath);
      }

    } catch (error) {
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop health monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      delete (this as any).watchTimer;
    }

    this.emit('stop');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(projectPath: string): Promise<HealthReport> {
    const startTime = Date.now();

    this.emit('checkStart', { projectPath });

    try {
      // Discover schemas
      const config: Config = {
        schemas: {
          patterns: ['**/*.ts', '**/*.js'],
          exclude: []
        },
        targets: {},
        rules: {} as any,
        output: {
          format: 'pretty' as const,
          verbose: false,
          showSuccessful: false
        }
      } as unknown as Config;
      const discovery = new SchemaDiscovery(config);
      const schemas = await discovery.findSchemas();

      // Initialize health checks
      const allChecks: HealthCheck[] = [];
      const schemaHealthInfos: SchemaHealthInfo[] = [];

      // Process schemas in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < schemas.length; i += batchSize) {
        const batch = schemas.slice(i, i + batchSize);
        const batchPromises = batch.map(schema => this.analyzeSchemaHealth(schema));
        const batchResults = await Promise.allSettled(batchPromises);

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            schemaHealthInfos.push(result.value);
            allChecks.push(...result.value.health.checks);
          }
        }
      }

      // Perform codebase-wide checks
      const codebaseChecks = await this.performCodebaseChecks(projectPath, schemas);
      allChecks.push(...codebaseChecks);

      // Calculate health score
      const score = this.calculateHealthScore(allChecks, schemas.length);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(allChecks, schemaHealthInfos);

      // Collect metrics
      const metrics = this.collectMetrics(startTime, schemas.length, allChecks.length);

      // Create report
      const report: HealthReport = {
        timestamp: Date.now(),
        projectPath,
        summary: {
          totalSchemas: schemas.length,
          healthySchemas: schemaHealthInfos.filter(s => s.health.status === 'healthy').length,
          totalChecks: allChecks.length,
          totalIssues: allChecks.filter(c => c.severity !== 'success').length,
          criticalIssues: allChecks.filter(c => c.severity === 'critical').length,
          warningIssues: allChecks.filter(c => c.severity === 'warning').length,
          autoFixableIssues: allChecks.filter(c => c.autoFixable).length
        },
        score,
        checks: allChecks,
        schemas: schemaHealthInfos,
        recommendations,
        metrics,
        trends: this.calculateTrends()
      };

      this.emit('checkComplete', { report, duration: Date.now() - startTime });
      return report;

    } catch (error) {
      this.emit('checkError', error);
      throw error;
    }
  }

  /**
   * Get current health status
   */
  async getHealthStatus(projectPath: string = process.cwd()): Promise<HealthReport> {
    // Try to get cached report first
    const cacheKey = `health-report:${projectPath}`;
    const cached = this.cache.get(cacheKey);

    if (cached && (cached as any).lastModified && Date.now() - (cached as any).lastModified < 60000) { // 1 minute cache
      return cached as unknown as HealthReport;
    }

    // Perform fresh health check
    const report = await this.performHealthCheck(projectPath);

    // Cache the result
    this.cache.set(cacheKey, report as any, JSON.stringify(report), 0); // Store health report

    return report;
  }

  /**
   * Get health trends over time
   */
  getHealthTrends(days: number = 7): HealthTrend[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.history.filter(trend => trend.timestamp >= cutoff);
  }

  /**
   * Apply automatic fixes for auto-fixable issues
   */
  async applyAutoFixes(report: HealthReport): Promise<{ fixed: number; failed: number; errors: Error[] }> {
    if (!this.config.autoFix) {
      throw new Error('Auto-fix is disabled in configuration');
    }

    const autoFixableChecks = report.checks.filter(check => check.autoFixable);
    const results = { fixed: 0, failed: 0, errors: [] as Error[] };

    for (const check of autoFixableChecks) {
      try {
        await this.applyFix(check);
        results.fixed++;
        this.emit('autoFix', { check, success: true });
      } catch (error) {
        results.failed++;
        results.errors.push(error instanceof Error ? error : new Error(String(error)));
        this.emit('autoFix', { check, success: false, error });
      }
    }

    return results;
  }

  /**
   * Export health report
   */
  async exportReport(report: HealthReport, format: 'json' | 'html' | 'csv' | 'pdf' = 'json'): Promise<string> {
    const timestamp = new Date(report.timestamp).toISOString().split('T')[0];
    const filename = `health-report-${timestamp}.${format}`;
    const filepath = join(this.config.reportPath, filename);

    switch (format) {
      case 'json':
        await writeFile(filepath, JSON.stringify(report, null, 2));
        break;

      case 'html':
        const html = await this.generateHTMLReport(report);
        await writeFile(filepath, html);
        break;

      case 'csv':
        const csv = this.generateCSVReport(report);
        await writeFile(filepath, csv);
        break;

      case 'pdf':
        throw new Error('PDF export not yet implemented');

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return filepath;
  }

  // Private methods

  private async analyzeSchemaHealth(schema: SchemaInfo): Promise<SchemaHealthInfo> {
    const checks: HealthCheck[] = [];

    // Structure checks
    if (this.shouldRunCategory('structure')) {
      checks.push(...await this.runStructureChecks(schema));
    }

    // Performance checks
    if (this.shouldRunCategory('performance')) {
      checks.push(...await this.runPerformanceChecks(schema));
    }

    // Security checks
    if (this.shouldRunCategory('security')) {
      checks.push(...await this.runSecurityChecks(schema));
    }

    // Maintainability checks
    if (this.shouldRunCategory('maintainability')) {
      checks.push(...await this.runMaintainabilityChecks(schema));
    }

    // Complexity analysis
    const complexity = await this.analyzeComplexity(schema);

    // Usage analysis
    const usage = await this.analyzeUsage(schema);

    // Dependency analysis
    const dependencies = await this.analyzeDependencies(schema);

    // Calculate schema health score
    const score = this.calculateSchemaScore(checks, complexity);
    const status = this.determineHealthStatus(score);

    return {
      schema,
      health: {
        score,
        status,
        checks,
        complexity,
        usage,
        dependencies
      }
    };
  }

  private async runStructureChecks(schema: SchemaInfo): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Check for empty schemas
    if (!schema.properties || schema.properties.length === 0) {
      checks.push({
        id: `structure-empty-${schema.name}`,
        name: 'Empty Schema',
        category: 'structure',
        severity: 'warning',
        message: 'Schema has no properties defined',
        file: schema.filePath,
        line: schema.line,
        rule: 'no-empty-schema',
        code: 'STRUCTURE_EMPTY',
        suggestion: 'Add properties to the schema or consider if it\'s needed',
        autoFixable: false,
        impact: 'medium',
        confidence: 0.9
      });
    }

    // Check for proper naming
    if (!/^[A-Z][a-zA-Z0-9]*Schema$/.test(schema.name)) {
      checks.push({
        id: `structure-naming-${schema.name}`,
        name: 'Schema Naming Convention',
        category: 'naming',
        severity: 'info',
        message: 'Schema name should follow PascalCase and end with "Schema"',
        file: schema.filePath,
        line: schema.line,
        rule: 'schema-naming-convention',
        code: 'NAMING_CONVENTION',
        suggestion: `Consider renaming to ${this.suggestSchemaName(schema.name)}`,
        autoFixable: true,
        impact: 'low',
        confidence: 0.8
      });
    }

    // Check for missing descriptions (check if name is too generic)
    if (schema.name.length < 3 || ['Schema', 'Data', 'Object'].includes(schema.name)) {
      checks.push({
        id: `structure-description-${schema.name}`,
        name: 'Missing Description',
        category: 'documentation',
        severity: 'info',
        message: 'Schema lacks documentation',
        file: schema.filePath,
        line: schema.line,
        rule: 'require-description',
        code: 'MISSING_DESCRIPTION',
        suggestion: 'Add JSDoc comment describing the schema purpose',
        autoFixable: false,
        impact: 'low',
        confidence: 0.7
      });
    }

    return checks;
  }

  private async runPerformanceChecks(schema: SchemaInfo): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Check for overly complex validation patterns
    const complexityScore = await this.calculateComplexityScore(schema);
    if (complexityScore > 80) {
      checks.push({
        id: `performance-complexity-${schema.name}`,
        name: 'High Complexity',
        category: 'performance',
        severity: 'warning',
        message: `Schema complexity score is ${complexityScore}/100`,
        file: schema.filePath,
        line: schema.line,
        rule: 'complexity-limit',
        code: 'HIGH_COMPLEXITY',
        suggestion: 'Consider breaking down into smaller, composable schemas',
        autoFixable: false,
        impact: 'high',
        confidence: 0.8,
        metadata: { complexityScore }
      });
    }

    // Check for inefficient patterns
    if (schema.zodChain?.includes('z.string().regex(')) {
      checks.push({
        id: `performance-regex-${schema.name}`,
        name: 'Regex Performance',
        category: 'performance',
        severity: 'info',
        message: 'Regex validation can be performance-intensive',
        file: schema.filePath,
        rule: 'regex-performance',
        code: 'REGEX_USAGE',
        suggestion: 'Consider using z.string().email(), .url(), or other built-in validators',
        autoFixable: false,
        impact: 'medium',
        confidence: 0.6
      });
    }

    return checks;
  }

  private async runSecurityChecks(schema: SchemaInfo): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Check for potential injection vulnerabilities
    if (schema.zodChain?.includes('z.string()') && !schema.zodChain.includes('.min(')) {
      checks.push({
        id: `security-string-length-${schema.name}`,
        name: 'Unbounded String',
        category: 'security',
        severity: 'warning',
        message: 'String field without length limits may be vulnerable to DoS attacks',
        file: schema.filePath,
        rule: 'string-length-limit',
        code: 'UNBOUNDED_STRING',
        suggestion: 'Add .min() and .max() length constraints',
        autoFixable: true,
        impact: 'high',
        confidence: 0.7
      });
    }

    // Check for sensitive data patterns
    const sensitivePatterns = ['password', 'secret', 'token', 'key', 'auth'];
    for (const pattern of sensitivePatterns) {
      if (schema.zodChain?.toLowerCase().includes(pattern)) {
        checks.push({
          id: `security-sensitive-${schema.name}-${pattern}`,
          name: 'Sensitive Data',
          category: 'security',
          severity: 'critical',
          message: `Potential sensitive data field: ${pattern}`,
          file: schema.filePath,
          rule: 'sensitive-data-handling',
          code: 'SENSITIVE_DATA',
          suggestion: 'Ensure proper handling, hashing, and validation of sensitive data',
          autoFixable: false,
          impact: 'high',
          confidence: 0.8,
          metadata: { sensitivePattern: pattern }
        });
      }
    }

    return checks;
  }

  private async runMaintainabilityChecks(schema: SchemaInfo): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Check for code duplication
    const duplicatePatterns = await this.findDuplicatePatterns(schema);
    for (const pattern of duplicatePatterns) {
      checks.push({
        id: `maintainability-duplicate-${schema.name}`,
        name: 'Duplicate Pattern',
        category: 'maintainability',
        severity: 'warning',
        message: `Duplicate validation pattern found: ${pattern}`,
        file: schema.filePath,
        rule: 'no-duplicate-patterns',
        code: 'DUPLICATE_PATTERN',
        suggestion: 'Extract common patterns into reusable schema components',
        autoFixable: true,
        impact: 'medium',
        confidence: 0.7,
        metadata: { pattern }
      });
    }

    return checks;
  }

  private async performCodebaseChecks(projectPath: string, schemas: SchemaInfo[]): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Coverage analysis
    if (this.shouldRunCategory('coverage')) {
      const coverage = await this.analyzeCoverage(projectPath, schemas);
      if (coverage.percentage < 70) {
        checks.push({
          id: 'codebase-coverage',
          name: 'Low Schema Coverage',
          category: 'coverage',
          severity: 'warning',
          message: `Schema coverage is ${coverage.percentage}% (${coverage.covered}/${coverage.total} files)`,
          rule: 'schema-coverage',
          code: 'LOW_COVERAGE',
          suggestion: 'Add schema validation to more data interfaces',
          autoFixable: false,
          impact: 'medium',
          confidence: 0.8,
          metadata: coverage
        });
      }
    }

    // Dependency analysis
    if (this.shouldRunCategory('dependencies')) {
      const circularDeps = await this.findCircularDependencies(schemas);
      for (const cycle of circularDeps) {
        checks.push({
          id: `dependencies-circular-${cycle.join('-')}`,
          name: 'Circular Dependency',
          category: 'dependencies',
          severity: 'critical',
          message: `Circular dependency detected: ${cycle.join(' → ')}`,
          rule: 'no-circular-dependencies',
          code: 'CIRCULAR_DEPENDENCY',
          suggestion: 'Refactor schemas to eliminate circular references',
          autoFixable: false,
          impact: 'high',
          confidence: 0.9,
          metadata: { cycle }
        });
      }
    }

    return checks;
  }

  private calculateHealthScore(checks: HealthCheck[], _schemaCount: number): HealthScore {
    const categoryScores: Record<HealthCategory, { score: number; checks: number; issues: number; weight: number }> = {} as any;

    // Initialize category scores
    for (const category of this.config.includeCategories) {
      categoryScores[category] = {
        score: 100,
        checks: 0,
        issues: 0,
        weight: this.config.weights[category] || 10
      };
    }

    // Calculate category scores based on checks
    for (const check of checks) {
      const category = categoryScores[check.category];
      if (category) {
        category.checks++;

        if (check.severity !== 'success') {
          category.issues++;

          // Reduce score based on severity and confidence
          const impact = {
            critical: 20,
            warning: 10,
            info: 5,
            success: 0
          }[check.severity];

          category.score -= impact * check.confidence;
        }
      }
    }

    // Calculate overall score
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [_category, data] of Object.entries(categoryScores)) {
      data.score = Math.max(0, Math.min(100, data.score));
      weightedSum += data.score * data.weight;
      totalWeight += data.weight;
    }

    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;

    // Determine trend
    const trend = this.calculateTrend(overall);

    return {
      overall,
      categories: categoryScores,
      trend,
      lastUpdate: Date.now()
    };
  }

  private async generateRecommendations(checks: HealthCheck[], schemas: SchemaHealthInfo[]): Promise<HealthRecommendation[]> {
    const recommendations: HealthRecommendation[] = [];

    // Group checks by category and severity
    const groupedChecks = this.groupChecksByCategory(checks);

    // Generate category-specific recommendations
    for (const [category, categoryChecks] of Object.entries(groupedChecks)) {
      const criticalCount = categoryChecks.filter(c => c.severity === 'critical').length;
      const warningCount = categoryChecks.filter(c => c.severity === 'warning').length;

      if (criticalCount > 0 || warningCount > 2) {
        recommendations.push(await this.generateCategoryRecommendation(category as HealthCategory, categoryChecks));
      }
    }

    // Generate schema-specific recommendations
    const problematicSchemas = schemas.filter(s => s.health.score < 70);
    for (const schemaInfo of problematicSchemas) {
      recommendations.push(await this.generateSchemaRecommendation(schemaInfo));
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private shouldRunCategory(category: HealthCategory): boolean {
    return this.config.includeCategories.includes(category) &&
           !this.config.excludeCategories.includes(category);
  }

  private calculateComplexityScore(schema: SchemaInfo): number {
    // Simplified complexity calculation
    let score = 0;
    const source = schema.zodChain || '';

    // Count nested structures
    score += (source.match(/z\.object\(/g) || []).length * 10;
    score += (source.match(/z\.array\(/g) || []).length * 5;
    score += (source.match(/z\.union\(/g) || []).length * 15;
    score += (source.match(/z\.intersection\(/g) || []).length * 15;
    score += (source.match(/z\.lazy\(/g) || []).length * 20;

    return Math.min(100, score);
  }

  private async analyzeComplexity(schema: SchemaInfo): Promise<ComplexityMetrics> {
    const source = schema.zodChain || '';

    return {
      cyclomatic: this.calculateCyclomaticComplexity(source),
      cognitive: this.calculateCognitiveComplexity(source),
      structural: this.calculateStructuralComplexity(source),
      nesting: this.calculateNestingLevel(source),
      properties: (source.match(/\w+:/g) || []).length,
      unions: (source.match(/z\.union\(/g) || []).length,
      intersections: (source.match(/z\.intersection\(/g) || []).length,
      conditionals: (source.match(/z\.when\(/g) || []).length,
      recursions: (source.match(/z\.lazy\(/g) || []).length,
      score: this.calculateComplexityScore(schema)
    };
  }

  private async analyzeUsage(_schema: SchemaInfo): Promise<UsageMetrics> {
    // This would integrate with actual usage tracking
    return {
      references: 0,
      imports: 0,
      validations: 0,
      testCoverage: 0,
      apiEndpoints: 0,
      popularity: 50
    };
  }

  private async analyzeDependencies(_schema: SchemaInfo): Promise<DependencyInfo[]> {
    // This would analyze actual schema dependencies
    return [];
  }

  private calculateSchemaScore(checks: HealthCheck[], complexity: ComplexityMetrics): number {
    let score = 100;

    for (const check of checks) {
      const impact = {
        critical: 25,
        warning: 10,
        info: 3,
        success: 0
      }[check.severity];

      score -= impact * check.confidence;
    }

    // Factor in complexity
    score -= complexity.score * 0.2;

    return Math.max(0, Math.min(100, score));
  }

  private determineHealthStatus(score: number): 'healthy' | 'warning' | 'critical' {
    if (score >= this.config.thresholds.warning) return 'healthy';
    if (score >= this.config.thresholds.critical) return 'warning';
    return 'critical';
  }

  private calculateCyclomaticComplexity(source: string): number {
    // Count decision points
    let complexity = 1; // base complexity
    complexity += (source.match(/\bif\b/g) || []).length;
    complexity += (source.match(/\bfor\b/g) || []).length;
    complexity += (source.match(/\bwhile\b/g) || []).length;
    complexity += (source.match(/\?\s*:|&&|\|\|/g) || []).length;
    return complexity;
  }

  private calculateCognitiveComplexity(source: string): number {
    // Simplified cognitive complexity calculation
    let complexity = 0;
    const lines = source.split('\n');
    let nestingLevel = 0;

    for (const line of lines) {
      if (line.includes('{')) nestingLevel++;
      if (line.includes('}')) nestingLevel = Math.max(0, nestingLevel - 1);

      if (line.includes('if') || line.includes('for') || line.includes('while')) {
        complexity += nestingLevel + 1;
      }
    }

    return complexity;
  }

  private calculateStructuralComplexity(source: string): number {
    return (source.match(/z\.\w+\(/g) || []).length;
  }

  private calculateNestingLevel(source: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const char of source) {
      if (char === '{' || char === '(') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}' || char === ')') {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    return maxNesting;
  }

  private suggestSchemaName(currentName: string): string {
    // Convert to PascalCase and add Schema suffix
    const cleaned = currentName.replace(/[^a-zA-Z0-9]/g, '');
    const pascalCase = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return pascalCase.endsWith('Schema') ? pascalCase : `${pascalCase}Schema`;
  }

  private async findDuplicatePatterns(_schema: SchemaInfo): Promise<string[]> {
    // This would analyze for duplicate validation patterns
    return [];
  }

  private async analyzeCoverage(_projectPath: string, _schemas: SchemaInfo[]): Promise<{ percentage: number; covered: number; total: number }> {
    // This would analyze actual file coverage
    return { percentage: 85, covered: 17, total: 20 };
  }

  private async findCircularDependencies(_schemas: SchemaInfo[]): Promise<string[][]> {
    // This would detect actual circular dependencies
    return [];
  }

  private calculateTrend(currentScore: number): 'improving' | 'stable' | 'declining' {
    if (this.history.length === 0) return 'stable';

    const lastScore = this.history[this.history.length - 1]?.score || currentScore;
    const diff = currentScore - lastScore;

    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  private calculateTrends(): HealthTrend[] {
    return this.history.slice(-10); // Return last 10 trends
  }

  private groupChecksByCategory(checks: HealthCheck[]): Record<string, HealthCheck[]> {
    return checks.reduce((acc, check) => {
      if (!acc[check.category]) acc[check.category] = [];
      acc[check.category]?.push(check);
      return acc;
    }, {} as Record<string, HealthCheck[]>);
  }

  private async generateCategoryRecommendation(category: HealthCategory, checks: HealthCheck[]): Promise<HealthRecommendation> {
    const criticalCount = checks.filter(c => c.severity === 'critical').length;

    return {
      id: `rec-${category}-${Date.now()}`,
      priority: criticalCount > 0 ? 'critical' : 'high',
      category,
      title: `Address ${category} Issues`,
      description: `Found ${checks.length} ${category} issues that need attention`,
      impact: `Resolving these issues will improve code ${category}`,
      effort: checks.length > 10 ? 'high' : checks.length > 5 ? 'medium' : 'low',
      actions: [{
        type: 'fix',
        description: `Review and fix ${category} issues`,
        automated: false,
        risk: 'low'
      }],
      confidence: 0.8,
      relatedChecks: checks.map(c => c.id)
    };
  }

  private async generateSchemaRecommendation(schemaInfo: SchemaHealthInfo): Promise<HealthRecommendation> {
    return {
      id: `rec-schema-${schemaInfo.schema.name}-${Date.now()}`,
      priority: schemaInfo.health.score < 50 ? 'high' : 'medium',
      category: 'maintainability',
      title: `Improve ${schemaInfo.schema.name} Schema`,
      description: `Schema has a health score of ${schemaInfo.health.score}/100`,
      impact: 'Better schema health improves code quality and maintainability',
      effort: 'medium',
      actions: [{
        type: 'refactor',
        description: 'Refactor schema to address health issues',
        automated: false,
        risk: 'medium'
      }],
      confidence: 0.7,
      relatedChecks: schemaInfo.health.checks.map(c => c.id)
    };
  }

  private collectMetrics(startTime: number, schemaCount: number, checkCount: number): HealthMetrics {
    const duration = Date.now() - startTime;

    return {
      checksPerformed: checkCount,
      checksPerSecond: checkCount / (duration / 1000),
      avgProcessingTime: duration / schemaCount,
      cacheHitRate: 0.85, // Would get from actual cache
      memoryUsage: process.memoryUsage().heapUsed,
      filesScanned: schemaCount,
      schemasAnalyzed: schemaCount,
      errorsDetected: 0,
      autoFixesApplied: 0
    };
  }

  private async applyFix(_check: HealthCheck): Promise<void> {
    // This would implement actual auto-fixes
    throw new Error('Auto-fix not yet implemented for this check type');
  }

  private async generateHTMLReport(report: HealthReport): Promise<string> {
    // This would generate a comprehensive HTML report
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Schema Health Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .score { font-size: 24px; font-weight: bold; }
          .healthy { color: green; }
          .warning { color: orange; }
          .critical { color: red; }
        </style>
      </head>
      <body>
        <h1>Schema Health Report</h1>
        <div class="score">Overall Score: ${report.score.overall}/100</div>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        <p>Total Issues: ${report.summary.totalIssues}</p>
      </body>
      </html>
    `;
  }

  private generateCSVReport(report: HealthReport): string {
    const headers = ['Check ID', 'Category', 'Severity', 'Message', 'File', 'Line', 'Auto-fixable'];
    const rows = report.checks.map(check => [
      check.id,
      check.category,
      check.severity,
      check.message,
      check.file || '',
      check.line?.toString() || '',
      check.autoFixable?.toString() || 'false'
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private startWatchMode(projectPath: string): void {
    this.watchTimer = setInterval(async () => {
      try {
        const report = await this.performHealthCheck(projectPath);
        await this.processReport(report);
      } catch (error) {
        this.emit('watchError', error);
      }
    }, this.config.checkInterval);
  }

  private async processReport(report: HealthReport): Promise<void> {
    // Store in history
    if (this.config.enableTrending) {
      this.history.push({
        timestamp: report.timestamp,
        score: report.score.overall,
        categories: Object.fromEntries(
          Object.entries(report.score.categories).map(([cat, data]) => [cat, data.score])
        ) as Record<HealthCategory, number>,
        issues: {
          critical: report.summary.criticalIssues,
          warning: report.summary.warningIssues,
          info: 0,
          success: 0
        },
        schemas: report.summary.totalSchemas
      });

      // Limit history size
      const maxEntries = (this.config.maxHistoryDays * 24 * 60) / (this.config.checkInterval / 60000);
      if (this.history.length > maxEntries) {
        this.history = this.history.slice(-maxEntries);
      }
    }

    // Generate reports
    if (this.config.generateReports) {
      await this.exportReport(report, 'json');
    }

    // Send notifications
    await this.sendNotifications(report);

    // Store last report
    this.lastReport = report;

    this.emit('reportProcessed', report);
  }

  private async sendNotifications(report: HealthReport): Promise<void> {
    const config = this.config.notifications;

    if (config.onCritical && report.summary.criticalIssues > 0) {
      this.emit('notification', {
        type: 'critical',
        message: `Critical health issues detected: ${report.summary.criticalIssues} critical issues`,
        report
      });
    }

    if (config.onScoreChange && this.lastReport) {
      const scoreDiff = Math.abs(report.score.overall - this.lastReport.score.overall);
      if (scoreDiff >= config.onScoreChange) {
        this.emit('notification', {
          type: 'scoreChange',
          message: `Health score changed by ${scoreDiff} points`,
          report,
          previousScore: this.lastReport.score.overall
        });
      }
    }
  }
}

/**
 * Global health monitor instance
 */
let globalHealthMonitor: HealthMonitor | null = null;

/**
 * Get or create global health monitor instance
 */
export function getGlobalHealthMonitor(config?: HealthConfig): HealthMonitor {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new HealthMonitor(config);
  }
  return globalHealthMonitor;
}