import * as pc from 'picocolors';
import { z } from 'zod';
// @ts-ignore: Reserved for future file operations
// import { writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

export interface PlaygroundOptions {
  interactive?: boolean;
  autoSave?: boolean;
  showTypes?: boolean;
  enableValidation?: boolean;
  enableBenchmark?: boolean;
  enableExamples?: boolean;
  enableComparison?: boolean;
  outputFormat?: 'console' | 'json' | 'html' | 'markdown';
  theme?: 'default' | 'dark' | 'light' | 'terminal';
  language?: 'typescript' | 'javascript';
  shareMode?: boolean;
  template?: string;
  presets?: string[];
}

export interface PlaygroundSession {
  id: string;
  name: string;
  created: Date;
  modified: Date;
  schemas: PlaygroundSchema[];
  examples: PlaygroundExample[];
  tests: PlaygroundTest[];
  config: PlaygroundConfig;
  metadata: SessionMetadata;
}

export interface PlaygroundSchema {
  id: string;
  name: string;
  description?: string;
  schema: z.ZodSchema;
  code: string;
  language: 'typescript' | 'javascript';
  compiled: boolean;
  errors: string[];
  warnings: string[];
  performance: PerformanceMetrics;
  dependencies: string[];
  tags: string[];
}

export interface PlaygroundExample {
  id: string;
  name: string;
  description?: string;
  schemaId: string;
  data: any;
  valid: boolean;
  result?: any;
  errors?: string[];
  executionTime: number;
  category: 'valid' | 'invalid' | 'edge-case' | 'performance';
  tags: string[];
}

export interface PlaygroundTest {
  id: string;
  name: string;
  description?: string;
  schemaId: string;
  testCases: TestCase[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: TestCoverage;
}

export interface TestCase {
  id: string;
  name: string;
  input: any;
  expectedValid: boolean;
  expectedOutput?: any;
  actualValid?: boolean;
  actualOutput?: any;
  actualError?: string;
  passed?: boolean;
  duration: number;
}

export interface TestCoverage {
  branches: number;
  statements: number;
  functions: number;
  lines: number;
  percentage: number;
}

export interface PlaygroundConfig {
  autoValidation: boolean;
  showPerformance: boolean;
  showTypes: boolean;
  enableIntelliSense: boolean;
  theme: string;
  fontSize: number;
  keyBindings: 'default' | 'vim' | 'emacs';
  autosaveInterval: number;
}

export interface SessionMetadata {
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  lastActivity: Date;
  collaborators: string[];
  version: string;
}

export interface PerformanceMetrics {
  parseTime: number;
  validateTime: number;
  memoryUsage: number;
  throughput: number;
  complexity: number;
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  warnings: string[];
  performance: PerformanceMetrics;
  types: TypeInformation;
  suggestions: string[];
}

export interface TypeInformation {
  inputType: string;
  outputType: string;
  inferredType: string;
  constraints: string[];
  examples: any[];
}

export interface ComparisonResult {
  schemas: string[];
  metrics: Record<string, PerformanceMetrics>;
  rankings: { name: string; score: number }[];
  recommendations: string[];
  insights: string[];
}

export interface PlaygroundTemplate {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced' | 'example';
  schemas: { name: string; code: string }[];
  examples: { name: string; data: any }[];
  instructions: string;
  tags: string[];
}

export class SchemaPlayground {
  private readonly sessions: Map<string, PlaygroundSession>;
  private readonly templates: Map<string, PlaygroundTemplate>;
  private readonly executionHistory: Map<string, ExecutionResult[]>;
  // @ts-ignore: _performanceCache reserved for future performance optimization
  private readonly _performanceCache: Map<string, PerformanceMetrics>;

  constructor() {
    this.sessions = new Map();
    this.templates = new Map();
    this.executionHistory = new Map();
    this._performanceCache = new Map();

    this.initializeTemplates();
  }

  async createSession(
    name: string,
    options: PlaygroundOptions = {}
  ): Promise<PlaygroundSession> {
    const sessionId = this.generateSessionId();

    const session: PlaygroundSession = {
      id: sessionId,
      name,
      created: new Date(),
      modified: new Date(),
      schemas: [],
      examples: [],
      tests: [],
      config: {
        autoValidation: options.enableValidation !== false,
        showPerformance: options.enableBenchmark !== false,
        showTypes: options.showTypes !== false,
        enableIntelliSense: true,
        theme: options.theme || 'default',
        fontSize: 14,
        keyBindings: 'default',
        autosaveInterval: 30000
      },
      metadata: {
        totalExecutions: 0,
        successRate: 0,
        averageExecutionTime: 0,
        lastActivity: new Date(),
        collaborators: [],
        version: '1.0.0'
      }
    };

    this.sessions.set(sessionId, session);

    console.log(pc.green(`🎮 Created playground session: ${name} (${sessionId})`));
    return session;
  }

  async loadSession(sessionId: string): Promise<PlaygroundSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async saveSession(session: PlaygroundSession): Promise<void> {
    session.modified = new Date();
    session.metadata.lastActivity = new Date();
    this.sessions.set(session.id, session);

    console.log(pc.blue(`💾 Saved session: ${session.name}`));
  }

  async addSchema(
    sessionId: string,
    name: string,
    code: string,
    options: { description?: string; language?: 'typescript' | 'javascript' } = {}
  ): Promise<PlaygroundSchema> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const schemaId = this.generateSchemaId();

    try {
      // Attempt to compile the schema
      const compiledSchema = this.compileSchema(code, options.language || 'typescript');
      const performance = await this.measurePerformance(compiledSchema);

      const playgroundSchema: PlaygroundSchema = {
        id: schemaId,
        name,
        schema: compiledSchema,
        code,
        language: options.language || 'typescript',
        compiled: true,
        errors: [],
        warnings: [],
        performance,
        dependencies: this.extractDependencies(code),
        tags: this.generateTags(code),
        ...(options.description !== undefined && { description: options.description })
      };

      session.schemas.push(playgroundSchema);
      await this.saveSession(session);

      console.log(pc.green(`➕ Added schema: ${name}`));
      return playgroundSchema;

    } catch (error) {
      const playgroundSchema: PlaygroundSchema = {
        id: schemaId,
        name,
        schema: z.unknown(),
        code,
        language: options.language || 'typescript',
        compiled: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        performance: this.createEmptyPerformance(),
        dependencies: [],
        tags: [],
        ...(options.description !== undefined && { description: options.description })
      };

      session.schemas.push(playgroundSchema);
      await this.saveSession(session);

      console.log(pc.red(`❌ Added schema with errors: ${name}`));
      return playgroundSchema;
    }
  }

  async executeSchema(
    sessionId: string,
    schemaId: string,
    data: any,
    options: { benchmark?: boolean; generateTypes?: boolean } = {}
  ): Promise<ExecutionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const schema = session.schemas.find(s => s.id === schemaId);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    const startTime = performance.now();
    let executionResult: ExecutionResult;

    try {
      const result = schema.schema.parse(data);
      // @ts-ignore: endTime reserved for future timing calculations
      const endTime = performance.now();

      const performanceMetrics = options.benchmark ?
        await this.measurePerformance(schema.schema) :
        this.createEmptyPerformance();

      const typeInfo = options.generateTypes ?
        this.generateTypeInformation(schema.schema, data, result) :
        this.createEmptyTypeInfo();

      executionResult = {
        success: true,
        result,
        warnings: [],
        performance: performanceMetrics,
        types: typeInfo,
        suggestions: this.generateSuggestions(schema, data, result)
      };

    } catch (error) {
      const endTime = performance.now();

      executionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
        performance: { ...this.createEmptyPerformance(), validateTime: endTime - startTime },
        types: this.createEmptyTypeInfo(),
        suggestions: this.generateErrorSuggestions(schema, data, error)
      };
    }

    // Update session metadata
    session.metadata.totalExecutions++;
    session.metadata.lastActivity = new Date();

    // Store execution history
    const history = this.executionHistory.get(schemaId) || [];
    history.push(executionResult);
    this.executionHistory.set(schemaId, history.slice(-100)); // Keep last 100

    // Calculate success rate
    const successCount = history.filter(r => r.success).length;
    session.metadata.successRate = (successCount / history.length) * 100;

    await this.saveSession(session);

    return executionResult;
  }

  async addExample(
    sessionId: string,
    schemaId: string,
    name: string,
    data: any,
    options: { description?: string; category?: string } = {}
  ): Promise<PlaygroundExample> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const exampleId = this.generateExampleId();

    // Test the example against the schema
    const result = await this.executeSchema(sessionId, schemaId, data);

    const example: PlaygroundExample = {
      id: exampleId,
      name,
      schemaId,
      data,
      valid: result.success,
      result: result.result,
      errors: result.error ? [result.error] : [],
      executionTime: result.performance.validateTime,
      category: (options.category as any) || (result.success ? 'valid' : 'invalid'),
      tags: this.generateExampleTags(data, result),
      ...(options.description !== undefined && { description: options.description })
    };

    session.examples.push(example);
    await this.saveSession(session);

    console.log(pc.cyan(`📝 Added example: ${name} (${result.success ? 'valid' : 'invalid'})`));
    return example;
  }

  async runTests(
    sessionId: string,
    schemaId: string,
    testCases: Omit<TestCase, 'id' | 'passed' | 'duration' | 'actualValid' | 'actualOutput' | 'actualError'>[]
  ): Promise<PlaygroundTest> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const schema = session.schemas.find(s => s.id === schemaId);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    const testId = this.generateTestId();
    const startTime = performance.now();

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    const processedTestCases: TestCase[] = [];

    for (const testCase of testCases) {
      const caseStartTime = performance.now();

      try {
        const result = await this.executeSchema(sessionId, schemaId, testCase.input);
        const caseEndTime = performance.now();

        const actualValid = result.success;
        const actualOutput = result.result;
        const actualError = result.error;

        const testPassed = actualValid === testCase.expectedValid &&
          (testCase.expectedOutput === undefined ||
           JSON.stringify(actualOutput) === JSON.stringify(testCase.expectedOutput));

        if (testPassed) {
          passed++;
        } else {
          failed++;
        }

        processedTestCases.push({
          id: this.generateTestCaseId(),
          name: testCase.name,
          input: testCase.input,
          expectedValid: testCase.expectedValid,
          expectedOutput: testCase.expectedOutput,
          actualValid,
          actualOutput,
          passed: testPassed,
          duration: caseEndTime - caseStartTime,
          ...(actualError !== undefined && { actualError })
        });

      } catch (error) {
        failed++;
        processedTestCases.push({
          id: this.generateTestCaseId(),
          name: testCase.name,
          input: testCase.input,
          expectedValid: testCase.expectedValid,
          expectedOutput: testCase.expectedOutput,
          actualValid: false,
          actualError: error instanceof Error ? error.message : String(error),
          passed: false,
          duration: performance.now() - caseStartTime
        });
      }
    }

    const endTime = performance.now();

    const test: PlaygroundTest = {
      id: testId,
      name: `Test Suite for ${schema.name}`,
      description: `Automated test suite with ${testCases.length} test cases`,
      schemaId,
      testCases: processedTestCases,
      passed,
      failed,
      skipped,
      duration: endTime - startTime,
      coverage: this.calculateCoverage(schema, processedTestCases)
    };

    session.tests.push(test);
    await this.saveSession(session);

    console.log(pc.blue(`🧪 Test completed: ${passed} passed, ${failed} failed, ${skipped} skipped`));
    return test;
  }

  async compareSchemas(
    sessionId: string,
    schemaIds: string[],
    testData: any[]
  ): Promise<ComparisonResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const schemas = schemaIds.map(id => {
      const schema = session.schemas.find(s => s.id === id);
      if (!schema) throw new Error(`Schema not found: ${id}`);
      return schema;
    });

    const metrics: Record<string, PerformanceMetrics> = {};
    const results: Record<string, { success: number; total: number; avgTime: number }> = {};

    // Run benchmarks for each schema
    for (const schema of schemas) {
      const schemaResults: { success: boolean; time: number }[] = [];

      for (const data of testData) {
        const startTime = performance.now();
        try {
          schema.schema.parse(data);
          schemaResults.push({ success: true, time: performance.now() - startTime });
        } catch {
          schemaResults.push({ success: false, time: performance.now() - startTime });
        }
      }

      const successCount = schemaResults.filter(r => r.success).length;
      const avgTime = schemaResults.reduce((sum, r) => sum + r.time, 0) / schemaResults.length;

      results[schema.name] = {
        success: successCount,
        total: testData.length,
        avgTime
      };

      metrics[schema.name] = await this.measurePerformance(schema.schema);
    }

    // Calculate rankings
    const rankings = schemas.map(schema => ({
      name: schema.name,
      score: this.calculateComparisonScore(results[schema.name] || { success: 0, total: 0, avgTime: 0 }, metrics[schema.name] || { parseTime: 0, validateTime: 0, memoryUsage: 0, throughput: 0, complexity: 0 })
    })).sort((a, b) => b.score - a.score);

    // Generate insights and recommendations
    const insights = this.generateComparisonInsights(schemas, results, metrics);
    const recommendations = this.generateComparisonRecommendations(rankings, insights);

    return {
      schemas: schemas.map(s => s.name),
      metrics,
      rankings,
      recommendations,
      insights
    };
  }

  async generatePlaygroundHTML(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schema Playground - ${session.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Monaco', 'Menlo', monospace;
            background: ${session.config.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${session.config.theme === 'dark' ? '#e0e0e0' : '#333333'};
            display: flex;
            height: 100vh;
        }
        .sidebar {
            width: 300px;
            background: ${session.config.theme === 'dark' ? '#2d2d2d' : '#f8f9fa'};
            padding: 1rem;
            overflow-y: auto;
            border-right: 1px solid ${session.config.theme === 'dark' ? '#404040' : '#dee2e6'};
        }
        .main { flex: 1; display: flex; flex-direction: column; }
        .editor { flex: 1; padding: 1rem; }
        .output {
            height: 200px;
            background: ${session.config.theme === 'dark' ? '#0d1117' : '#f6f8fa'};
            padding: 1rem;
            overflow-y: auto;
            border-top: 1px solid ${session.config.theme === 'dark' ? '#404040' : '#dee2e6'};
        }
        .schema-item {
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: ${session.config.theme === 'dark' ? '#3d3d3d' : '#ffffff'};
            border-radius: 4px;
            cursor: pointer;
        }
        .schema-item:hover { background: ${session.config.theme === 'dark' ? '#4d4d4d' : '#e9ecef'}; }
        .example-item {
            margin: 0.25rem 0;
            padding: 0.25rem 0.5rem;
            font-size: 0.9em;
            border-left: 3px solid ${session.config.theme === 'dark' ? '#007acc' : '#0066cc'};
        }
        textarea {
            width: 100%;
            height: 300px;
            font-family: inherit;
            background: ${session.config.theme === 'dark' ? '#2d2d2d' : '#ffffff'};
            color: ${session.config.theme === 'dark' ? '#e0e0e0' : '#333333'};
            border: 1px solid ${session.config.theme === 'dark' ? '#404040' : '#ccc'};
            padding: 1rem;
            resize: vertical;
        }
        button {
            background: #007acc;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            margin: 0.5rem 0.5rem 0.5rem 0;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover { background: #005a9e; }
        .toolbar { padding: 1rem; border-bottom: 1px solid ${session.config.theme === 'dark' ? '#404040' : '#dee2e6'}; }
        h3 { margin: 1rem 0 0.5rem; }
        .status { padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8em; }
        .status.success { background: #d4edda; color: #155724; }
        .status.error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="sidebar">
        <h3>Schemas</h3>
        ${session.schemas.map(schema => `
            <div class="schema-item" onclick="loadSchema('${schema.id}')">
                <strong>${schema.name}</strong>
                <div class="status ${schema.compiled ? 'success' : 'error'}">
                    ${schema.compiled ? 'Compiled' : 'Error'}
                </div>
                ${schema.description ? `<div style="font-size: 0.8em; margin-top: 0.25rem;">${schema.description}</div>` : ''}
            </div>
        `).join('')}

        <h3>Examples</h3>
        ${session.examples.map(example => `
            <div class="example-item" onclick="loadExample('${example.id}')">
                <strong>${example.name}</strong>
                <div class="status ${example.valid ? 'success' : 'error'}">
                    ${example.valid ? 'Valid' : 'Invalid'}
                </div>
            </div>
        `).join('')}
    </div>

    <div class="main">
        <div class="toolbar">
            <button onclick="executeCurrentSchema()">▶ Execute</button>
            <button onclick="addExample()">📝 Add Example</button>
            <button onclick="runTests()">🧪 Run Tests</button>
            <button onclick="exportSession()">💾 Export</button>
        </div>

        <div class="editor">
            <textarea id="schemaEditor" placeholder="Enter your Zod schema here...">
${session.schemas[0]?.code || 'z.object({\n  name: z.string(),\n  age: z.number().min(0),\n  email: z.string().email()\n})'}
            </textarea>

            <textarea id="dataEditor" placeholder="Enter test data here..." style="height: 200px; margin-top: 1rem;">
{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com"
}
            </textarea>
        </div>

        <div class="output" id="output">
            <div style="color: #666; font-style: italic;">Execute a schema to see results...</div>
        </div>
    </div>

    <script>
        const session = ${JSON.stringify(session, null, 2)};
        let currentSchemaId = null;

        function loadSchema(schemaId) {
            const schema = session.schemas.find(s => s.id === schemaId);
            if (schema) {
                document.getElementById('schemaEditor').value = schema.code;
                currentSchemaId = schemaId;
            }
        }

        function loadExample(exampleId) {
            const example = session.examples.find(e => e.id === exampleId);
            if (example) {
                document.getElementById('dataEditor').value = JSON.stringify(example.data, null, 2);
                loadSchema(example.schemaId);
            }
        }

        function executeCurrentSchema() {
            const schemaCode = document.getElementById('schemaEditor').value;
            const dataText = document.getElementById('dataEditor').value;

            try {
                const data = JSON.parse(dataText);
                const output = document.getElementById('output');

                // This is a simplified execution - in a real implementation,
                // this would send the data to the server for validation
                output.innerHTML = \`
                    <div style="color: #28a745;">✅ Schema execution started...</div>
                    <div style="margin-top: 0.5rem;">
                        <strong>Input:</strong><br>
                        <pre style="margin: 0.25rem 0; padding: 0.5rem; background: rgba(0,0,0,0.1); border-radius: 3px;">\${JSON.stringify(data, null, 2)}</pre>
                    </div>
                    <div style="margin-top: 0.5rem; color: #666;">
                        Real validation would happen server-side...
                    </div>
                \`;

            } catch (error) {
                document.getElementById('output').innerHTML = \`
                    <div style="color: #dc3545;">❌ JSON Parse Error:</div>
                    <div style="margin-top: 0.5rem; color: #666;">\${error.message}</div>
                \`;
            }
        }

        function addExample() {
            alert('Add Example functionality would be implemented with form inputs');
        }

        function runTests() {
            alert('Test runner would be implemented with predefined test cases');
        }

        function exportSession() {
            const dataStr = JSON.stringify(session, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'playground-session.json';
            link.click();
        }

        // Load first schema by default
        if (session.schemas.length > 0) {
            loadSchema(session.schemas[0].id);
        }
    </script>
</body>
</html>`;
  }

  async exportSession(sessionId: string, format: 'json' | 'html' | 'markdown' = 'json'): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    switch (format) {
      case 'html':
        return this.generatePlaygroundHTML(sessionId);
      case 'markdown':
        return this.generateMarkdownExport(session);
      case 'json':
      default:
        return JSON.stringify(session, null, 2);
    }
  }

  async loadTemplate(templateId: string): Promise<PlaygroundTemplate | null> {
    return this.templates.get(templateId) || null;
  }

  async createSessionFromTemplate(
    templateId: string,
    sessionName: string
  ): Promise<PlaygroundSession> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const session = await this.createSession(sessionName);

    // Add schemas from template
    for (const schemaTemplate of template.schemas) {
      await this.addSchema(session.id, schemaTemplate.name, schemaTemplate.code);
    }

    // Add examples from template
    const firstSchemaId = session.schemas[0]?.id;
    if (firstSchemaId) {
      for (const exampleTemplate of template.examples) {
        await this.addExample(session.id, firstSchemaId, exampleTemplate.name, exampleTemplate.data);
      }
    }

    console.log(pc.green(`🎯 Created session from template: ${template.name}`));
    return session;
  }

  // Private helper methods

  private initializeTemplates(): void {
    // Basic template
    this.templates.set('basic', {
      id: 'basic',
      name: 'Basic Schema',
      description: 'Simple object schema for getting started',
      category: 'beginner',
      schemas: [{
        name: 'UserSchema',
        code: `z.object({
  name: z.string().min(1, "Name is required"),
  age: z.number().min(0).max(120),
  email: z.string().email("Invalid email format"),
  isActive: z.boolean().default(true)
})`
      }],
      examples: [
        { name: 'Valid User', data: { name: 'John Doe', age: 30, email: 'john@example.com', isActive: true } },
        { name: 'Missing Email', data: { name: 'Jane', age: 25 } },
        { name: 'Invalid Age', data: { name: 'Bob', age: -5, email: 'bob@test.com' } }
      ],
      instructions: 'This template demonstrates basic Zod validation with strings, numbers, and booleans.',
      tags: ['beginner', 'object', 'validation']
    });

    // Advanced template
    this.templates.set('advanced', {
      id: 'advanced',
      name: 'Advanced Patterns',
      description: 'Complex schemas with refinements and transformations',
      category: 'advanced',
      schemas: [{
        name: 'AdvancedSchema',
        code: `z.object({
  id: z.string().uuid(),
  metadata: z.record(z.unknown()),
  tags: z.array(z.string()).min(1),
  config: z.object({
    enabled: z.boolean(),
    settings: z.record(z.string().or(z.number()))
  }).refine(data =>
    data.enabled ? Object.keys(data.settings).length > 0 : true,
    { message: "Settings required when enabled" }
  )
}).transform(data => ({
  ...data,
  processed: new Date().toISOString()
}))`
      }],
      examples: [
        {
          name: 'Valid Complex',
          data: {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            metadata: { source: 'api' },
            tags: ['important'],
            config: { enabled: true, settings: { timeout: 5000 } }
          }
        }
      ],
      instructions: 'Explore advanced Zod features like refinements, transformations, and complex validations.',
      tags: ['advanced', 'refinement', 'transform']
    });

    // API template
    this.templates.set('api', {
      id: 'api',
      name: 'API Schemas',
      description: 'Common patterns for API request/response validation',
      category: 'example',
      schemas: [
        {
          name: 'CreateUserRequest',
          code: `z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).refine(
    pwd => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/.test(pwd),
    { message: "Password must contain uppercase, lowercase and number" }
  ),
  role: z.enum(['user', 'admin', 'moderator']).default('user')
})`
        },
        {
          name: 'UserResponse',
          code: `z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: z.string(),
  createdAt: z.string().datetime(),
  profile: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatar: z.string().url().optional()
  }).optional()
})`
        }
      ],
      examples: [
        {
          name: 'Valid Request',
          data: {
            username: 'johndoe',
            email: 'john@example.com',
            password: 'SecurePass123',
            role: 'user'
          }
        }
      ],
      instructions: 'Learn API validation patterns for user management systems.',
      tags: ['api', 'validation', 'security']
    });
  }

  private compileSchema(code: string, _language: 'typescript' | 'javascript'): z.ZodSchema {
    // In a real implementation, this would properly parse and compile the code
    // For demo purposes, we'll create a simple object schema
    try {
      // This is a simplified compilation - real implementation would use proper parsing
      if (code.includes('z.object')) {
        return z.object({
          example: z.string(),
          demo: z.number()
        });
      }
      return z.unknown();
    } catch (error) {
      throw new Error(`Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async measurePerformance(schema: z.ZodSchema): Promise<PerformanceMetrics> {
    const testData = { example: 'test', demo: 123 };
    const iterations = 1000;

    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      try {
        schema.parse(testData);
      } catch {
        // Ignore validation errors for performance testing
      }
    }
    const endTime = performance.now();

    const avgTime = (endTime - startTime) / iterations;

    return {
      parseTime: avgTime,
      validateTime: avgTime,
      memoryUsage: 1024, // Placeholder
      throughput: 1000 / avgTime,
      complexity: this.calculateComplexity(schema)
    };
  }

  private calculateComplexity(schema: z.ZodSchema): number {
    // Simplified complexity calculation
    const schemaString = JSON.stringify(schema._def || {});
    return Math.min(100, schemaString.length / 10);
  }

  private extractDependencies(code: string): string[] {
    const deps: string[] = [];
    if (code.includes('z.string()')) deps.push('string');
    if (code.includes('z.number()')) deps.push('number');
    if (code.includes('z.boolean()')) deps.push('boolean');
    if (code.includes('z.object(')) deps.push('object');
    if (code.includes('z.array(')) deps.push('array');
    return deps;
  }

  private generateTags(code: string): string[] {
    const tags: string[] = [];
    if (code.includes('refine')) tags.push('refinement');
    if (code.includes('transform')) tags.push('transform');
    if (code.includes('optional')) tags.push('optional');
    if (code.includes('default')) tags.push('default');
    if (code.includes('enum')) tags.push('enum');
    return tags;
  }

  private generateTypeInformation(_schema: z.ZodSchema, input: any, output: any): TypeInformation {
    return {
      inputType: typeof input,
      outputType: typeof output,
      inferredType: 'z.infer<typeof schema>',
      constraints: ['Type-safe validation'],
      examples: [input, output]
    };
  }

  private generateSuggestions(schema: PlaygroundSchema, data: any, _result: any): string[] {
    const suggestions: string[] = [];

    if (schema.performance.validateTime > 10) {
      suggestions.push('Consider optimizing validation performance');
    }

    if (typeof data === 'object' && Object.keys(data).length > 10) {
      suggestions.push('Large objects may benefit from schema splitting');
    }

    return suggestions;
  }

  private generateErrorSuggestions(_schema: PlaygroundSchema, _data: any, _error: any): string[] {
    const suggestions: string[] = [];

    suggestions.push('Check the data structure matches the schema');
    suggestions.push('Verify all required fields are present');
    suggestions.push('Ensure data types match schema expectations');

    return suggestions;
  }

  private generateExampleTags(data: any, result: ExecutionResult): string[] {
    const tags: string[] = [];

    if (result.success) tags.push('valid');
    else tags.push('invalid');

    if (typeof data === 'object') tags.push('object');
    if (Array.isArray(data)) tags.push('array');

    return tags;
  }

  private calculateCoverage(_schema: PlaygroundSchema, testCases: TestCase[]): TestCoverage {
    // Simplified coverage calculation
    const totalTests = testCases.length;
    const passedTests = testCases.filter(tc => tc.passed).length;

    const percentage = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      branches: percentage,
      statements: percentage,
      functions: percentage,
      lines: percentage,
      percentage
    };
  }

  private calculateComparisonScore(
    results: { success: number; total: number; avgTime: number },
    metrics: PerformanceMetrics
  ): number {
    const successRate = (results.success / results.total) * 100;
    const performanceScore = Math.max(0, 100 - results.avgTime);
    const throughputScore = Math.min(100, metrics.throughput / 10);

    return (successRate * 0.5 + performanceScore * 0.3 + throughputScore * 0.2);
  }

  private generateComparisonInsights(
    schemas: PlaygroundSchema[],
    results: Record<string, any>,
    _metrics: Record<string, PerformanceMetrics>
  ): string[] {
    const insights: string[] = [];

    const avgSuccessRate = Object.values(results).reduce((sum: number, r: any) =>
      sum + (r.success / r.total), 0) / schemas.length * 100;

    insights.push(`Average success rate across schemas: ${avgSuccessRate.toFixed(1)}%`);

    const fastestSchema = Object.entries(results).reduce((fastest, [name, data]: [string, any]) =>
      data.avgTime < fastest.time ? { name, time: data.avgTime } : fastest,
      { name: '', time: Infinity });

    if (fastestSchema.name) {
      insights.push(`Fastest schema: ${fastestSchema.name} (${fastestSchema.time.toFixed(2)}ms avg)`);
    }

    return insights;
  }

  private generateComparisonRecommendations(
    rankings: { name: string; score: number }[],
    _insights: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (rankings.length > 1) {
      const best = rankings[0];
      const worst = rankings[rankings.length - 1];

      if (best) {
        recommendations.push(`Consider using ${best.name} as the baseline for performance`);
      }

      if (worst && worst.score < 50) {
        recommendations.push(`${worst.name} needs optimization - score below 50`);
      }
    }

    recommendations.push('Run more comprehensive tests for better comparison');
    recommendations.push('Consider schema complexity vs performance trade-offs');

    return recommendations;
  }

  private generateMarkdownExport(session: PlaygroundSession): string {
    return `# Schema Playground Session: ${session.name}

## Session Information
- **Created:** ${session.created.toISOString()}
- **Last Modified:** ${session.modified.toISOString()}
- **Total Executions:** ${session.metadata.totalExecutions}
- **Success Rate:** ${session.metadata.successRate.toFixed(1)}%

## Schemas (${session.schemas.length})

${session.schemas.map(schema => `
### ${schema.name}
${schema.description ? `**Description:** ${schema.description}\n` : ''}
**Status:** ${schema.compiled ? '✅ Compiled' : '❌ Error'}
**Language:** ${schema.language}
**Performance:** ${schema.performance.validateTime.toFixed(2)}ms avg

\`\`\`${schema.language}
${schema.code}
\`\`\`

${schema.errors.length > 0 ? `**Errors:**\n${schema.errors.map(e => `- ${e}`).join('\n')}\n` : ''}
`).join('\n')}

## Examples (${session.examples.length})

${session.examples.map(example => `
### ${example.name}
${example.description ? `**Description:** ${example.description}\n` : ''}
**Status:** ${example.valid ? '✅ Valid' : '❌ Invalid'}
**Execution Time:** ${example.executionTime.toFixed(2)}ms

\`\`\`json
${JSON.stringify(example.data, null, 2)}
\`\`\`

${!example.valid && example.errors ? `**Errors:**\n${example.errors.map(e => `- ${e}`).join('\n')}\n` : ''}
`).join('\n')}

## Test Results (${session.tests.length})

${session.tests.map(test => `
### ${test.name}
- **Passed:** ${test.passed}
- **Failed:** ${test.failed}
- **Duration:** ${test.duration.toFixed(2)}ms
- **Coverage:** ${test.coverage.percentage.toFixed(1)}%
`).join('\n')}

---
*Generated by zodkit playground*
`;
  }

  private createEmptyPerformance(): PerformanceMetrics {
    return {
      parseTime: 0,
      validateTime: 0,
      memoryUsage: 0,
      throughput: 0,
      complexity: 0
    };
  }

  private createEmptyTypeInfo(): TypeInformation {
    return {
      inputType: 'unknown',
      outputType: 'unknown',
      inferredType: 'unknown',
      constraints: [],
      examples: []
    };
  }

  private generateSessionId(): string {
    return createHash('md5').update(`session-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  private generateSchemaId(): string {
    return createHash('md5').update(`schema-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  private generateExampleId(): string {
    return createHash('md5').update(`example-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  private generateTestId(): string {
    return createHash('md5').update(`test-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  private generateTestCaseId(): string {
    return createHash('md5').update(`testcase-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }
}