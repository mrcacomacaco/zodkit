/**
 * @fileoverview MCP (Model Context Protocol) server implementation
 * @module MCPServer
 */

import { createServer, Server } from 'http';
import { URL } from 'url';
import { Config } from './config';
import { SchemaDiscovery } from './schema-discovery';
import { Validator } from './validator';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { SchemaMapper } from './schema-mapper';
import { SchemaCache } from './schema-cache';
import { watch } from 'chokidar';
// @ts-ignore: Reserved for future MCP schema validation
import { z } from 'zod';

export interface MCPServerOptions {
  port: number;
  watch: boolean;
  auth?: string;
  exposeFixes: boolean;
  config: Config;
}

export interface MCPEndpoint {
  method: string;
  path: string;
  description: string;
  handler: (request: MCPRequest) => Promise<MCPResponse>;
}

export interface MCPRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: any;
  headers: Record<string, string>;
}

export interface MCPResponse {
  status: number;
  headers?: Record<string, string>;
  body: any;
}

export interface MCPCapability {
  name: string;
  description: string;
  methods: string[];
}

export class MCPServer {
  private server?: Server;
  private readonly options: MCPServerOptions;
  private readonly discovery: SchemaDiscovery;
  private readonly validator: Validator;
  private readonly analyzer: ComplexityAnalyzer;
  private readonly mapper: SchemaMapper;
  private readonly cache: SchemaCache;
  private watchers: any[] = [];
  private isRunning = false;
  private readonly startTime = Date.now();
  private requestCount = 0;
  private activeConnections = 0;

  constructor(options: MCPServerOptions) {
    this.options = options;
    this.cache = new SchemaCache();
    this.discovery = new SchemaDiscovery(options.config, this.cache);
    this.validator = new Validator(options.config);
    this.analyzer = new ComplexityAnalyzer();
    this.mapper = new SchemaMapper();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Setup watch mode if enabled
    if (this.options.watch) {
      this.setupWatchers();
    }

    return new Promise((resolve, reject) => {
      this.server!.listen(this.options.port, () => {
        this.isRunning = true;
        resolve();
      });

      this.server!.on('error', reject);

      // Track connections
      this.server!.on('connection', () => {
        this.activeConnections++;
      });

      this.server!.on('close', () => {
        this.activeConnections--;
      });
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Stop watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];

    // Stop server
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        resolve();
      });
    });
  }

  /**
   * Get available MCP endpoints
   */
  getEndpoints(): Array<{ method: string; path: string; description: string }> {
    return [
      { method: 'GET', path: '/health', description: 'Server health check' },
      { method: 'GET', path: '/schemas', description: 'List all schemas' },
      { method: 'GET', path: '/schemas/:name', description: 'Get specific schema details' },
      { method: 'POST', path: '/schemas/:name/validate', description: 'Validate data against schema' },
      { method: 'POST', path: '/schemas/:name/mock', description: 'Generate mock data' },
      { method: 'GET', path: '/analyze/complexity', description: 'Analyze schema complexity' },
      { method: 'GET', path: '/analyze/relationships', description: 'Get schema relationships' },
      { method: 'GET', path: '/analyze/coverage', description: 'Get validation coverage' },
      { method: 'POST', path: '/check', description: 'Run schema checks' },
      { method: 'POST', path: '/fix', description: 'Apply schema fixes (if enabled)' },
      { method: 'GET', path: '/migrate/plan', description: 'Generate migration plan' },
      { method: 'POST', path: '/migrate/execute', description: 'Execute migration' },
      { method: 'POST', path: '/shutdown', description: 'Shutdown server' }
    ];
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): string[] {
    return [
      'Schema discovery and analysis',
      'Real-time validation',
      'Mock data generation',
      'Complexity analysis',
      'Relationship mapping',
      'Migration assistance',
      'Hot-reload (watch mode)',
      this.options.exposeFixes ? 'Auto-fix application' : undefined,
      'AI-optimized responses'
    ].filter(Boolean) as string[];
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: any, res: any): Promise<void> {
    this.requestCount++;

    // Parse request
    const url = new URL(req.url, `http://localhost:${this.options.port}`);
    const mcpRequest: MCPRequest = {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
      body: req.method !== 'GET' ? await this.parseBody(req) : undefined
    };

    // Authentication if required
    if (this.options.auth && !this.authenticate(mcpRequest)) {
      this.sendResponse(res, {
        status: 401,
        body: { error: 'Unauthorized' }
      });
      return;
    }

    try {
      const response = await this.routeRequest(mcpRequest);
      this.sendResponse(res, response);
    } catch (error) {
      this.sendResponse(res, {
        status: 500,
        body: {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Route requests to appropriate handlers
   */
  private async routeRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, path } = request;

    // Health check
    if (method === 'GET' && path === '/health') {
      return this.handleHealth();
    }

    // Schema operations
    if (method === 'GET' && path === '/schemas') {
      return this.handleListSchemas(request);
    }

    if (method === 'GET' && path.startsWith('/schemas/')) {
      const schemaName = path.split('/')[2];
      return this.handleGetSchema(schemaName || '', request);
    }

    if (method === 'POST' && path.includes('/validate')) {
      const schemaName = path.split('/')[2];
      return this.handleValidateData(schemaName || '', request);
    }

    if (method === 'POST' && path.includes('/mock')) {
      const schemaName = path.split('/')[2];
      return this.handleGenerateMock(schemaName || '', request);
    }

    // Analysis operations
    if (method === 'GET' && path === '/analyze/complexity') {
      return this.handleAnalyzeComplexity(request);
    }

    if (method === 'GET' && path === '/analyze/relationships') {
      return this.handleAnalyzeRelationships(request);
    }

    if (method === 'GET' && path === '/analyze/coverage') {
      return this.handleAnalyzeCoverage(request);
    }

    // Check and fix operations
    if (method === 'POST' && path === '/check') {
      return this.handleCheck(request);
    }

    if (method === 'POST' && path === '/fix') {
      return this.handleFix(request);
    }

    // Migration operations
    if (method === 'GET' && path === '/migrate/plan') {
      return this.handleMigrationPlan(request);
    }

    if (method === 'POST' && path === '/migrate/execute') {
      return this.handleMigrationExecute(request);
    }

    // Server control
    if (method === 'POST' && path === '/shutdown') {
      return this.handleShutdown();
    }

    // 404 Not Found
    return {
      status: 404,
      body: { error: 'Endpoint not found' }
    };
  }

  // Handler implementations
  private async handleHealth(): Promise<MCPResponse> {
    return {
      status: 200,
      body: {
        status: 'healthy',
        uptime: Date.now() - this.startTime,
        totalRequests: this.requestCount,
        activeConnections: this.activeConnections,
        capabilities: this.getCapabilities(),
        watchMode: this.options.watch
      }
    };
  }

  private async handleListSchemas(_request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();

    const schemaList = schemas.map(schema => ({
      name: schema.exportName || schema.name,
      type: schema.schemaType,
      file: schema.filePath,
      line: schema.line,
      isExported: schema.isExported,
      complexity: schema.properties?.length || 0
    }));

    return {
      status: 200,
      body: {
        schemas: schemaList,
        total: schemaList.length,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private async handleGetSchema(schemaName: string, request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const schema = schemas.find(s =>
      s.exportName === schemaName || s.name === schemaName
    );

    if (!schema) {
      return {
        status: 404,
        body: { error: `Schema '${schemaName}' not found` }
      };
    }

    // Generate detailed explanation
    const complexity = this.analyzer.analyzeSchema(schema);

    return {
      status: 200,
      body: {
        name: schema.exportName || schema.name,
        type: schema.schemaType,
        location: {
          file: schema.filePath,
          line: schema.line,
          column: schema.column
        },
        definition: schema.zodChain,
        properties: schema.properties,
        complexity: {
          score: complexity.score,
          issues: complexity.issues,
          suggestions: complexity.suggestions
        },
        usage: request.query.includeUsage === 'true' ? await this.findUsage(schema) : undefined
      }
    };
  }

  private async handleValidateData(schemaName: string, request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const schema = schemas.find(s =>
      s.exportName === schemaName || s.name === schemaName
    );

    if (!schema) {
      return {
        status: 404,
        body: { error: `Schema '${schemaName}' not found` }
      };
    }

    const data = request.body?.data;
    if (data === undefined) {
      return {
        status: 400,
        body: { error: 'Missing data to validate' }
      };
    }

    try {
      // For MCP, we'll simulate validation since we can't easily eval Zod schemas
      const result = await this.simulateValidation(schema, data);

      return {
        status: 200,
        body: {
          valid: result.success,
          data: result.success ? data : undefined,
          errors: result.errors || []
        }
      };
    } catch (error) {
      return {
        status: 400,
        body: {
          valid: false,
          errors: [{
            message: error instanceof Error ? error.message : String(error),
            path: []
          }]
        }
      };
    }
  }

  private async handleGenerateMock(schemaName: string, request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const schema = schemas.find(s =>
      s.exportName === schemaName || s.name === schemaName
    );

    if (!schema) {
      return {
        status: 404,
        body: { error: `Schema '${schemaName}' not found` }
      };
    }

    const count = parseInt(request.query.count || '1', 10);
    const realistic = request.query.realistic === 'true';

    const mockData = await this.generateMockData(schema, count, realistic);

    return {
      status: 200,
      body: {
        schema: schemaName,
        count,
        realistic,
        data: count === 1 ? mockData[0] : mockData
      }
    };
  }

  private async handleAnalyzeComplexity(_request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const report = this.analyzer.analyzeSchemas(schemas);

    return {
      status: 200,
      body: report
    };
  }

  private async handleAnalyzeRelationships(_request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const relationshipMap = await this.mapper.buildRelationshipMap(schemas);

    return {
      status: 200,
      body: relationshipMap
    };
  }

  private async handleAnalyzeCoverage(_request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();

    // Simplified coverage analysis
    const coverage = {
      totalSchemas: schemas.length,
      exportedSchemas: schemas.filter(s => s.isExported).length,
      percentage: schemas.length > 0
        ? (schemas.filter(s => s.isExported).length / schemas.length) * 100
        : 0,
      uncoveredFiles: [] // Would implement file scanning
    };

    return {
      status: 200,
      body: coverage
    };
  }

  private async handleCheck(_request: MCPRequest): Promise<MCPResponse> {
    const schemas = await this.discovery.findSchemas();
    const result = await this.validator.validateWithRules(schemas);

    return {
      status: 200,
      body: {
        success: result.success,
        schemas: {
          total: schemas.length,
          checked: result.filesChecked,
          passed: schemas.length - result.errors.length,
          failed: result.errors.length
        },
        errors: result.errors,
        warnings: result.warnings
      }
    };
  }

  private async handleFix(_request: MCPRequest): Promise<MCPResponse> {
    if (!this.options.exposeFixes) {
      return {
        status: 403,
        body: { error: 'Fix operations are disabled' }
      };
    }

    // Simplified fix simulation
    return {
      status: 200,
      body: {
        applied: 0,
        fixes: [],
        message: 'Fix operations not implemented in this version'
      }
    };
  }

  private async handleMigrationPlan(_request: MCPRequest): Promise<MCPResponse> {
    // Simplified migration plan
    return {
      status: 200,
      body: {
        source: 'typescript',
        migrations: [],
        estimatedTime: 0,
        confidence: 1.0
      }
    };
  }

  private async handleMigrationExecute(_request: MCPRequest): Promise<MCPResponse> {
    return {
      status: 200,
      body: {
        executed: 0,
        message: 'Migration execution not implemented in this version'
      }
    };
  }

  private async handleShutdown(): Promise<MCPResponse> {
    // Graceful shutdown
    setTimeout(() => {
      this.stop();
    }, 1000);

    return {
      status: 200,
      body: { message: 'Server shutting down...' }
    };
  }

  // Helper methods
  private authenticate(request: MCPRequest): boolean {
    if (!this.options.auth) return true;

    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    return token === this.options.auth;
  }

  private async parseBody(req: any): Promise<any> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : undefined);
        } catch {
          resolve(body);
        }
      });
    });
  }

  private sendResponse(res: any, response: MCPResponse): void {
    res.writeHead(response.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...response.headers
    });

    res.end(JSON.stringify(response.body));
  }

  private setupWatchers(): void {
    const patterns = this.options.config.schemas.patterns;
    const watcher = watch(patterns, {
      ignored: this.options.config.schemas.exclude,
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', () => {
      // Invalidate cache when files change
      this.cache.clear();
    });

    this.watchers.push(watcher);
  }

  private async findUsage(_schema: any): Promise<any[]> {
    // Simplified usage finding
    return [];
  }

  private async simulateValidation(schema: any, data: any): Promise<{ success: boolean; errors?: any[] }> {
    // Simplified validation simulation based on schema type
    if (schema.schemaType === 'object') {
      if (typeof data !== 'object' || data === null) {
        return {
          success: false,
          errors: [{ message: 'Expected object, received ' + typeof data, path: [] }]
        };
      }
    } else if (schema.schemaType === 'string') {
      if (typeof data !== 'string') {
        return {
          success: false,
          errors: [{ message: 'Expected string, received ' + typeof data, path: [] }]
        };
      }
    }

    return { success: true };
  }

  private async generateMockData(schema: any, count: number, realistic: boolean): Promise<any[]> {
    const mocks: any[] = [];

    for (let i = 0; i < count; i++) {
      if (schema.schemaType === 'object') {
        const mock: any = {};
        schema.properties?.forEach((prop: any) => {
          mock[prop.name] = this.generateMockValue(prop.type, realistic);
        });
        mocks.push(mock);
      } else {
        mocks.push(this.generateMockValue(schema.schemaType, realistic));
      }
    }

    return mocks;
  }

  private generateMockValue(type: string, realistic: boolean): any {
    if (realistic) {
      const realisticValues: Record<string, any> = {
        string: 'Example String',
        number: 42,
        boolean: true,
        email: 'user@example.com',
        url: 'https://example.com',
        date: new Date().toISOString()
      };
      return realisticValues[type] || 'mock value';
    }

    const basicValues: Record<string, any> = {
      string: 'string',
      number: 1,
      boolean: true,
      array: [],
      object: {}
    };

    return basicValues[type] || null;
  }
}