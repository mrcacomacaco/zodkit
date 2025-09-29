/**
 * @fileoverview Context preservation system for maintaining state between commands
 * @module ContextManager
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { SchemaInfo } from './schema-discovery';

export interface CommandContext {
  command: string;
  timestamp: number;
  duration: number;
  arguments: string[];
  options: Record<string, any>;
  results: {
    success: boolean;
    errorCount: number;
    warningCount: number;
    schemasProcessed: number;
    filesModified: string[];
  };
  schemas: SchemaSnapshot[];
  projectHash: string;
}

export interface SchemaSnapshot {
  name: string;
  file: string;
  type: string;
  hash: string;
  complexity: number;
  lastModified: number;
}

export interface ContextSession {
  id: string;
  startTime: number;
  endTime?: number;
  commands: CommandContext[];
  insights: SessionInsight[];
}

export interface SessionInsight {
  type: 'pattern' | 'optimization' | 'warning' | 'suggestion';
  message: string;
  confidence: number;
  actionable: boolean;
  command?: string;
}

export interface ContextQuery {
  type: 'last_command' | 'schema_history' | 'error_pattern' | 'optimization_opportunity';
  schema?: string;
  timeRange?: { start: number; end: number };
  limit?: number;
}

export interface QueryResult {
  contexts: CommandContext[];
  insights: SessionInsight[];
  summary: {
    totalCommands: number;
    successRate: number;
    averageDuration: number;
    mostModifiedFiles: string[];
    frequentErrors: string[];
  };
}

export class ContextManager {
  private readonly contextDir: string;
  private readonly sessionFile: string;
  private currentSession: ContextSession | null = null;
  private readonly maxContextHistory = 100;
  private readonly maxSessionDuration = 4 * 60 * 60 * 1000; // 4 hours

  constructor(projectRoot?: string) {
    const root = projectRoot || process.cwd();
    this.contextDir = join(root, '.zodkit', 'context');
    this.sessionFile = join(this.contextDir, 'current-session.json');
    this.ensureContextDir();
  }

  async startCommand(command: string, args: string[], options: Record<string, any>): Promise<string> {
    if (!this.currentSession) {
      await this.startSession();
    }

    const contextId = this.generateContextId(command, args);

    // Store command start info
    const startContext = {
      command,
      timestamp: Date.now(),
      duration: 0,
      arguments: args,
      options: this.sanitizeOptions(options),
      results: {
        success: false,
        errorCount: 0,
        warningCount: 0,
        schemasProcessed: 0,
        filesModified: []
      },
      schemas: [],
      projectHash: ''
    };

    // Add to current session
    this.currentSession!.commands.push(startContext);

    return contextId;
  }

  async endCommand(
    contextId: string,
    results: {
      success: boolean;
      errorCount: number;
      warningCount: number;
      schemasProcessed: number;
      filesModified: string[];
    },
    schemas?: SchemaInfo[]
  ): Promise<void> {
    if (!this.currentSession) return;

    // Find the command context
    const context = this.currentSession.commands.find(c =>
      this.generateContextId(c.command, c.arguments) === contextId
    );

    if (!context) return;

    // Update context with results
    context.duration = Date.now() - context.timestamp;
    context.results = results;
    context.projectHash = await this.calculateProjectHash();

    if (schemas) {
      context.schemas = schemas.map(schema => this.createSchemaSnapshot(schema));
    }

    // Generate insights based on this command
    const insights = this.generateCommandInsights(context);
    this.currentSession.insights.push(...insights);

    // Save session
    await this.saveSession();

    // Archive old sessions periodically
    await this.archiveOldSessions();
  }

  async getContext(query: ContextQuery): Promise<QueryResult> {
    const allContexts = await this.loadAllContexts();
    let filteredContexts = allContexts;

    // Apply filters
    switch (query.type) {
      case 'last_command':
        filteredContexts = allContexts.slice(-1);
        break;
      case 'schema_history':
        if (query.schema) {
          filteredContexts = allContexts.filter(ctx =>
            ctx.schemas.some(s => s.name === query.schema)
          );
        }
        break;
      case 'error_pattern':
        filteredContexts = allContexts.filter(ctx =>
          ctx.results.errorCount > 0
        );
        break;
      case 'optimization_opportunity':
        filteredContexts = allContexts.filter(ctx =>
          ctx.duration > 5000 || ctx.results.errorCount > 10
        );
        break;
    }

    // Apply time range filter
    if (query.timeRange) {
      filteredContexts = filteredContexts.filter(ctx =>
        ctx.timestamp >= query.timeRange!.start &&
        ctx.timestamp <= query.timeRange!.end
      );
    }

    // Apply limit
    if (query.limit) {
      filteredContexts = filteredContexts.slice(-query.limit);
    }

    // Generate insights for the query
    const insights = this.analyzeContexts(filteredContexts);

    // Generate summary
    const summary = this.generateSummary(filteredContexts);

    return {
      contexts: filteredContexts,
      insights,
      summary
    };
  }

  async getSuggestions(_currentCommand?: string): Promise<SessionInsight[]> {
    if (!this.currentSession) return [];

    const recentCommands = this.currentSession.commands.slice(-5);
    const suggestions: SessionInsight[] = [];

    // Analyze patterns in recent commands
    const commandFrequency = new Map<string, number>();
    recentCommands.forEach(cmd => {
      commandFrequency.set(cmd.command, (commandFrequency.get(cmd.command) || 0) + 1);
    });

    // Suggest workflow optimizations
    if (commandFrequency.has('check') && commandFrequency.has('fix')) {
      suggestions.push({
        type: 'optimization',
        message: 'Consider using watch mode to automatically check and fix on file changes',
        confidence: 0.8,
        actionable: true,
        command: 'zodkit check --watch'
      });
    }

    // Suggest based on error patterns
    const errorCommands = recentCommands.filter(cmd => cmd.results.errorCount > 0);
    if (errorCommands.length >= 2) {
      const commonErrors = this.findCommonErrorPatterns(errorCommands);
      if (commonErrors.length > 0) {
        suggestions.push({
          type: 'pattern',
          message: `Recurring validation errors detected. Consider reviewing schema definitions`,
          confidence: 0.9,
          actionable: true,
          command: 'zodkit explain'
        });
      }
    }

    // Suggest profile mode for performance issues
    const slowCommands = recentCommands.filter(cmd => cmd.duration > 10000);
    if (slowCommands.length > 0) {
      suggestions.push({
        type: 'optimization',
        message: 'Slow command execution detected. Profile your schemas for performance insights',
        confidence: 0.7,
        actionable: true,
        command: 'zodkit profile --watch'
      });
    }

    return suggestions;
  }

  async exportSession(): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to export');
    }

    const exportData = {
      session: this.currentSession,
      exportTime: new Date().toISOString(),
      version: '1.0'
    };

    const exportPath = join(this.contextDir, `session-${this.currentSession.id}.json`);
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

    return exportPath;
  }

  async clearHistory(olderThanDays?: number): Promise<void> {
    const cutoffTime = olderThanDays
      ? Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)
      : 0;

    // Clear sessions older than cutoff
    const sessionFiles = this.getSessionFiles();
    for (const file of sessionFiles) {
      try {
        const session = JSON.parse(readFileSync(file, 'utf-8')) as ContextSession;
        if (session.startTime < cutoffTime) {
          // Archive or delete old session
          const archivePath = join(this.contextDir, 'archive', `session-${session.id}.json`);
          const archiveDir = dirname(archivePath);
          if (!existsSync(archiveDir)) {
            mkdirSync(archiveDir, { recursive: true });
          }
          writeFileSync(archivePath, JSON.stringify(session, null, 2));
        }
      } catch {
        // Ignore corrupted session files
      }
    }
  }

  private async startSession(): Promise<void> {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      commands: [],
      insights: []
    };

    await this.saveSession();
  }

  private async saveSession(): Promise<void> {
    if (!this.currentSession) return;

    writeFileSync(this.sessionFile, JSON.stringify(this.currentSession, null, 2));
  }

  private async loadAllContexts(): Promise<CommandContext[]> {
    const contexts: CommandContext[] = [];

    // Load current session
    if (this.currentSession) {
      contexts.push(...this.currentSession.commands);
    }

    // Load recent archived sessions
    const sessionFiles = this.getSessionFiles();
    for (const file of sessionFiles.slice(-10)) { // Last 10 sessions
      try {
        const session = JSON.parse(readFileSync(file, 'utf-8')) as ContextSession;
        contexts.push(...session.commands);
      } catch {
        // Ignore corrupted files
      }
    }

    return contexts.sort((a, b) => a.timestamp - b.timestamp);
  }

  private getSessionFiles(): string[] {
    try {
      const files = require('fs').readdirSync(this.contextDir);
      return files
        .filter((f: string) => f.startsWith('session-') && f.endsWith('.json'))
        .map((f: string) => join(this.contextDir, f));
    } catch {
      return [];
    }
  }

  private generateContextId(command: string, args: string[]): string {
    const input = `${command}:${args.join(':')}:${Date.now()}`;
    return createHash('md5').update(input).digest('hex').slice(0, 8);
  }

  private generateSessionId(): string {
    return createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 12);
  }

  private async calculateProjectHash(): Promise<string> {
    // Simple project fingerprint based on package.json and basic structure
    try {
      const packagePath = join(process.cwd(), 'package.json');
      if (existsSync(packagePath)) {
        const content = readFileSync(packagePath, 'utf-8');
        return createHash('md5').update(content).digest('hex').slice(0, 8);
      }
    } catch {}
    return 'unknown';
  }

  private createSchemaSnapshot(schema: SchemaInfo): SchemaSnapshot {
    const content = schema.zodChain || '';
    const hash = createHash('md5').update(content).digest('hex').slice(0, 8);

    return {
      name: schema.name,
      file: schema.filePath,
      type: schema.schemaType,
      hash,
      complexity: this.calculateComplexity(content),
      lastModified: Date.now()
    };
  }

  private calculateComplexity(content: string): number {
    // Simple complexity metric based on content length and patterns
    let complexity = content.length / 100;

    // Add complexity for nested structures
    complexity += (content.match(/z\.object/g) || []).length * 2;
    complexity += (content.match(/z\.array/g) || []).length * 1.5;
    complexity += (content.match(/z\.union/g) || []).length * 2;

    return Math.round(complexity);
  }

  private generateCommandInsights(context: CommandContext): SessionInsight[] {
    const insights: SessionInsight[] = [];

    // Performance insights
    if (context.duration > 10000) {
      insights.push({
        type: 'warning',
        message: `Command '${context.command}' took ${Math.round(context.duration / 1000)}s. Consider optimizing or using caching.`,
        confidence: 0.8,
        actionable: true,
        command: 'zodkit profile'
      });
    }

    // Error pattern insights
    if (context.results.errorCount > 10) {
      insights.push({
        type: 'warning',
        message: `High error count (${context.results.errorCount}). Review schema definitions for common issues.`,
        confidence: 0.9,
        actionable: true,
        command: 'zodkit explain'
      });
    }

    // Success pattern insights
    if (context.results.success && context.results.errorCount === 0) {
      insights.push({
        type: 'optimization',
        message: `Clean validation! Consider setting up automated checks.`,
        confidence: 0.7,
        actionable: true,
        command: 'zodkit init --ci'
      });
    }

    return insights;
  }

  private analyzeContexts(contexts: CommandContext[]): SessionInsight[] {
    const insights: SessionInsight[] = [];

    if (contexts.length === 0) return insights;

    // Analyze success rate
    const successRate = contexts.filter(c => c.results.success).length / contexts.length;
    if (successRate < 0.8) {
      insights.push({
        type: 'warning',
        message: `Low success rate (${Math.round(successRate * 100)}%). Review common error patterns.`,
        confidence: 0.9,
        actionable: true
      });
    }

    // Analyze performance trends
    const averageDuration = contexts.reduce((sum, c) => sum + c.duration, 0) / contexts.length;
    if (averageDuration > 5000) {
      insights.push({
        type: 'optimization',
        message: `Commands are taking an average of ${Math.round(averageDuration / 1000)}s. Consider optimization.`,
        confidence: 0.8,
        actionable: true,
        command: 'zodkit profile'
      });
    }

    return insights;
  }

  private generateSummary(contexts: CommandContext[]): QueryResult['summary'] {
    if (contexts.length === 0) {
      return {
        totalCommands: 0,
        successRate: 0,
        averageDuration: 0,
        mostModifiedFiles: [],
        frequentErrors: []
      };
    }

    const successCount = contexts.filter(c => c.results.success).length;
    const totalDuration = contexts.reduce((sum, c) => sum + c.duration, 0);

    // Find most modified files
    const fileModifications = new Map<string, number>();
    contexts.forEach(c => {
      c.results.filesModified.forEach(file => {
        fileModifications.set(file, (fileModifications.get(file) || 0) + 1);
      });
    });

    const mostModifiedFiles = Array.from(fileModifications.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => file);

    // Analyze frequent errors (simplified)
    const errorCommands = contexts.filter(c => c.results.errorCount > 0);
    const frequentErrors = errorCommands.length > 0
      ? ['validation_errors', 'type_mismatches']
      : [];

    return {
      totalCommands: contexts.length,
      successRate: successCount / contexts.length,
      averageDuration: totalDuration / contexts.length,
      mostModifiedFiles,
      frequentErrors
    };
  }

  private findCommonErrorPatterns(errorCommands: CommandContext[]): string[] {
    // Simplified pattern detection
    const patterns: string[] = [];

    if (errorCommands.every(cmd => cmd.results.errorCount > 5)) {
      patterns.push('high_error_count');
    }

    if (errorCommands.some(cmd => cmd.command === 'check')) {
      patterns.push('validation_failures');
    }

    return patterns;
  }

  private sanitizeOptions(options: Record<string, any>): Record<string, any> {
    // Remove sensitive information from options
    const sanitized = { ...options };
    delete sanitized.auth;
    delete sanitized.token;
    delete sanitized.password;
    return sanitized;
  }

  private ensureContextDir(): void {
    if (!existsSync(this.contextDir)) {
      mkdirSync(this.contextDir, { recursive: true });
    }
  }

  private async archiveOldSessions(): Promise<void> {
    if (!this.currentSession) return;

    // Archive session if it's too old or has too many commands
    const sessionAge = Date.now() - this.currentSession.startTime;
    if (sessionAge > this.maxSessionDuration || this.currentSession.commands.length > this.maxContextHistory) {
      // Archive current session
      this.currentSession.endTime = Date.now();
      const archivePath = join(this.contextDir, `session-${this.currentSession.id}.json`);
      writeFileSync(archivePath, JSON.stringify(this.currentSession, null, 2));

      // Start new session
      this.currentSession = null;
      await this.startSession();
    }
  }
}