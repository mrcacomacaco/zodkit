import * as pc from 'picocolors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import fg from 'fast-glob';
import * as ts from 'typescript';

export interface ImportManagerOptions {
  dryRun?: boolean;
  backup?: boolean;
  autoFix?: boolean;
  aggressive?: boolean;
  preserveComments?: boolean;
  sortImports?: boolean;
  removeUnused?: boolean;
  addMissing?: boolean;
  fixPaths?: boolean;
  organizeImports?: boolean;
  respectTsConfig?: boolean;
  pathMappings?: Record<string, string>;
  excludePatterns?: string[];
  includePatterns?: string[];
}

export interface ImportAnalysis {
  filePath: string;
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  issues: ImportIssue[];
  dependencies: string[];
  suggestions: ImportSuggestion[];
  metrics: ImportMetrics;
}

export interface ImportDeclaration {
  source: string;
  specifiers: ImportSpecifier[];
  type: 'default' | 'named' | 'namespace' | 'side-effect';
  line: number;
  column: number;
  raw: string;
  isTypeOnly: boolean;
  isExternal: boolean;
  resolvedPath?: string;
}

export interface ImportSpecifier {
  name: string;
  alias?: string;
  isDefault: boolean;
  isUsed: boolean;
  usageCount: number;
  locations: Array<{ line: number; column: number }>;
}

export interface ExportDeclaration {
  name: string;
  type: 'default' | 'named' | 're-export';
  source?: string;
  line: number;
  column: number;
  raw: string;
}

export interface ImportIssue {
  type: 'missing' | 'unused' | 'circular' | 'invalid-path' | 'duplicate' | 'incorrect-extension' | 'case-mismatch';
  severity: 'error' | 'warning' | 'info';
  description: string;
  location: { line: number; column: number };
  suggestion: string;
  autoFixable: boolean;
  impact: 'high' | 'medium' | 'low';
}

export interface ImportSuggestion {
  id: string;
  type: 'add-import' | 'remove-import' | 'update-path' | 'organize' | 'consolidate' | 'split';
  description: string;
  before: string;
  after: string;
  confidence: number;
  impact: ImportImpact;
  autoApplicable: boolean;
}

export interface ImportImpact {
  bundleSize: number; // percentage change
  performance: number; // percentage improvement
  maintainability: number; // score improvement
  readability: number; // score improvement
}

export interface ImportMetrics {
  totalImports: number;
  externalImports: number;
  internalImports: number;
  unusedImports: number;
  circularDependencies: number;
  averageImportsPerFile: number;
  complexityScore: number;
  organizationScore: number;
}

export interface ImportFixResult {
  filePath: string;
  appliedFixes: ImportSuggestion[];
  skippedFixes: ImportSuggestion[];
  beforeMetrics: ImportMetrics;
  afterMetrics: ImportMetrics;
  improvement: ImportImpact;
  errors: string[];
  success: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  metrics: GraphMetrics;
}

export interface DependencyNode {
  filePath: string;
  name: string;
  type: 'schema' | 'utility' | 'component' | 'type' | 'config';
  exports: string[];
  imports: string[];
  size: number;
  complexity: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'type-import' | 're-export';
  specifiers: string[];
  strength: number; // how tightly coupled
}

export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  cyclomaticComplexity: number;
  maxDepth: number;
  fanIn: Record<string, number>;
  fanOut: Record<string, number>;
  clustering: number;
}

export class UniversalImportManager {
  private readonly pathMappings: Map<string, string>;
  private readonly analysisCache: Map<string, ImportAnalysis>;
  private dependencyGraph: DependencyGraph | null;
  // @ts-ignore: Reserved for future TypeScript config path analysis
  private _tsConfigPath: string | null;

  constructor(options: ImportManagerOptions = {}) {
    this.pathMappings = new Map();
    this.analysisCache = new Map();
    this.dependencyGraph = null;
    this._tsConfigPath = null;

    this.initializePathMappings(options);
  }

  async analyzeCodebase(projectRoot: string, options: ImportManagerOptions = {}): Promise<ImportAnalysis[]> {
    console.log(pc.blue('🔍 Analyzing codebase imports...'));

    const files = await this.findSourceFiles(projectRoot, options);
    const analyses: ImportAnalysis[] = [];

    for (const filePath of files) {
      try {
        const analysis = await this.analyzeFile(filePath, options);
        analyses.push(analysis);
        this.analysisCache.set(filePath, analysis);
      } catch (error) {
        console.warn(pc.yellow(`⚠️  Could not analyze ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // Build dependency graph
    this.dependencyGraph = this.buildDependencyGraph(analyses);

    return analyses;
  }

  async analyzeFile(filePath: string, options: ImportManagerOptions = {}): Promise<ImportAnalysis> {
    const content = readFileSync(filePath, 'utf-8');
    const ast = this.parseFile(content, filePath);

    const imports = this.extractImports(ast, content);
    const exports = this.extractExports(ast, content);
    const issues = await this.detectIssues(filePath, imports, exports, content, options);
    const dependencies = imports.map(imp => imp.source).filter(Boolean);
    const suggestions = await this.generateSuggestions(filePath, imports, exports, issues, options);
    const metrics = this.calculateMetrics(imports, exports, issues);

    return {
      filePath,
      imports,
      exports,
      issues,
      dependencies,
      suggestions,
      metrics
    };
  }

  async fixImports(
    filePath: string,
    options: ImportManagerOptions = {}
  ): Promise<ImportFixResult> {
    const analysis = await this.analyzeFile(filePath, options);
    const beforeMetrics = analysis.metrics;

    const result: ImportFixResult = {
      filePath,
      appliedFixes: [],
      skippedFixes: [],
      beforeMetrics,
      afterMetrics: beforeMetrics,
      improvement: this.createEmptyImpact(),
      errors: [],
      success: true
    };

    if (options.dryRun) {
      console.log(pc.yellow('🎭 Dry run mode - showing fixes without applying them'));
      result.skippedFixes = analysis.suggestions;
      return result;
    }

    // Sort suggestions by impact and confidence
    const sortedSuggestions = this.prioritizeSuggestions(analysis.suggestions, options);

    let content = readFileSync(filePath, 'utf-8');
    let modified = false;

    for (const suggestion of sortedSuggestions) {
      try {
        if (this.shouldApplySuggestion(suggestion, options)) {
          const newContent = this.applySuggestion(content, suggestion);
          if (newContent !== content) {
            content = newContent;
            modified = true;
            result.appliedFixes.push(suggestion);
          } else {
            result.skippedFixes.push(suggestion);
          }
        } else {
          result.skippedFixes.push(suggestion);
        }
      } catch (error) {
        result.errors.push(`Failed to apply ${suggestion.type}: ${error instanceof Error ? error.message : String(error)}`);
        result.skippedFixes.push(suggestion);
      }
    }

    // Write modified content
    if (modified && !options.dryRun) {
      if (options.backup) {
        writeFileSync(`${filePath}.backup`, readFileSync(filePath, 'utf-8'));
      }
      writeFileSync(filePath, content);

      // Re-analyze to get new metrics
      const newAnalysis = await this.analyzeFile(filePath, options);
      result.afterMetrics = newAnalysis.metrics;
      result.improvement = this.calculateImprovement(beforeMetrics, result.afterMetrics);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  async fixCodebase(
    projectRoot: string,
    options: ImportManagerOptions = {}
  ): Promise<ImportFixResult[]> {
    console.log(pc.cyan('🔧 Fixing imports across codebase...'));

    const analyses = await this.analyzeCodebase(projectRoot, options);
    const results: ImportFixResult[] = [];

    for (const analysis of analyses) {
      try {
        const result = await this.fixImports(analysis.filePath, options);
        results.push(result);

        if (result.appliedFixes.length > 0) {
          console.log(pc.green(`✅ Fixed ${result.appliedFixes.length} import(s) in ${relative(projectRoot, analysis.filePath)}`));
        }
      } catch (error) {
        console.warn(pc.red(`❌ Failed to fix ${analysis.filePath}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    return results;
  }

  async generateDependencyReport(projectRoot: string): Promise<DependencyGraph> {
    if (!this.dependencyGraph) {
      await this.analyzeCodebase(projectRoot);
    }

    return this.dependencyGraph!;
  }

  async detectCircularDependencies(projectRoot: string): Promise<string[][]> {
    const graph = await this.generateDependencyReport(projectRoot);
    return graph.cycles;
  }

  async optimizeImportPaths(
    filePath: string,
    options: ImportManagerOptions = {}
  ): Promise<ImportSuggestion[]> {
    const analysis = await this.analyzeFile(filePath, options);
    const optimizations: ImportSuggestion[] = [];

    for (const importDecl of analysis.imports) {
      // Suggest shorter relative paths
      if (importDecl.isExternal === false && importDecl.source.includes('../')) {
        const optimizedPath = this.optimizeRelativePath(filePath, importDecl.source);
        if (optimizedPath !== importDecl.source) {
          optimizations.push({
            id: `optimize-path-${importDecl.line}`,
            type: 'update-path',
            description: `Optimize import path: ${importDecl.source} → ${optimizedPath}`,
            before: importDecl.raw,
            after: importDecl.raw.replace(importDecl.source, optimizedPath),
            confidence: 0.9,
            impact: {
              bundleSize: 0,
              performance: 5,
              maintainability: 15,
              readability: 20
            },
            autoApplicable: true
          });
        }
      }

      // Suggest barrel imports
      if (this.canUseBarrelImport(importDecl)) {
        const barrelPath = this.findBarrelImport(importDecl.source);
        if (barrelPath) {
          optimizations.push({
            id: `barrel-import-${importDecl.line}`,
            type: 'update-path',
            description: `Use barrel import: ${importDecl.source} → ${barrelPath}`,
            before: importDecl.raw,
            after: importDecl.raw.replace(importDecl.source, barrelPath),
            confidence: 0.7,
            impact: {
              bundleSize: -5,
              performance: 10,
              maintainability: 25,
              readability: 15
            },
            autoApplicable: true
          });
        }
      }
    }

    return optimizations;
  }

  private initializePathMappings(options: ImportManagerOptions): void {
    // Load TypeScript path mappings if available
    if (options.respectTsConfig) {
      this.loadTsConfigPaths();
    }

    // Add custom path mappings
    if (options.pathMappings) {
      Object.entries(options.pathMappings).forEach(([alias, path]) => {
        this.pathMappings.set(alias, path);
      });
    }
  }

  private loadTsConfigPaths(): void {
    const tsConfigPaths = ['tsconfig.json', 'jsconfig.json'];

    for (const configPath of tsConfigPaths) {
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const paths = config.compilerOptions?.paths || {};

          Object.entries(paths).forEach(([alias, targets]) => {
            if (Array.isArray(targets) && targets.length > 0) {
              this.pathMappings.set(alias.replace('/*', ''), targets[0].replace('/*', ''));
            }
          });

          this._tsConfigPath = configPath;
          break;
        } catch (error) {
          console.warn(pc.yellow(`⚠️  Could not parse ${configPath}`));
        }
      }
    }
  }

  private async findSourceFiles(projectRoot: string, options: ImportManagerOptions): Promise<string[]> {
    const patterns = options.includePatterns || [
      '**/*.{ts,tsx,js,jsx}',
      '!node_modules/**',
      '!dist/**',
      '!build/**',
      '!coverage/**',
      '!**/*.d.ts',
      '!**/*.test.{ts,tsx,js,jsx}',
      '!**/*.spec.{ts,tsx,js,jsx}'
    ];

    const files = await fg(patterns, {
      cwd: projectRoot,
      absolute: true,
      ignore: options.excludePatterns || []
    });

    return files;
  }

  private parseFile(content: string, _filePath: string): any {
    try {
      // Use TypeScript API for parsing
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        content,
        ts.ScriptTarget.Latest,
        true
      );
      return sourceFile as any;  // Simplified AST structure
    } catch (error) {
      throw new Error(`Failed to parse ${_filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractImports(_ast: any, content: string): ImportDeclaration[] {
    const imports: ImportDeclaration[] = [];
    // @ts-ignore: Reserved for future line-by-line analysis
    const lines = content.split('\n');

    // This is a simplified implementation
    // In reality, we'd traverse the AST to extract import declarations
    const importRegex = /^import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/gm;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const raw = match[0];
      const specifiersStr = match[1];
      const source = match[2];
      const line = content.substring(0, match.index).split('\n').length;

      const isExternal = source ? !source.startsWith('.') && !source.startsWith('/') : false;
      const isTypeOnly = raw.includes('import type');

      // Parse specifiers (simplified)
      const specifiers: ImportSpecifier[] = [];
      if (specifiersStr?.includes('{')) {
        // Named imports
        const namedMatch = specifiersStr ? specifiersStr.match(/\{([^}]+)\}/) : null;
        if (namedMatch) {
          const namedImports = namedMatch[1] ? namedMatch[1].split(',').map(s => s.trim()) : [];
          namedImports.forEach(namedImport => {
            const [name, alias] = namedImport.split(' as ').map(s => s.trim());
            const spec: ImportSpecifier = {
              name: name || '',
              isDefault: false,
              isUsed: this.isSpecifierUsed(content, alias || name || ''),
              usageCount: this.countSpecifierUsage(content, alias || name || ''),
              locations: this.findSpecifierLocations(content, alias || name || '')
            };
            if (alias !== undefined) {
              spec.alias = alias;
            }
            specifiers.push(spec);
          });
        }
      } else if (specifiersStr && !specifiersStr.includes('*')) {
        // Default import
        const defaultName = (specifiersStr || '').trim();
        specifiers.push({
          name: defaultName,
          isDefault: true,
          isUsed: this.isSpecifierUsed(content, defaultName),
          usageCount: this.countSpecifierUsage(content, defaultName),
          locations: this.findSpecifierLocations(content, defaultName)
        });
      }

      imports.push({
        source: source || '',
        specifiers,
        type: this.determineImportType(specifiersStr || ''),
        line,
        column: 1,
        raw,
        isTypeOnly,
        isExternal,
        resolvedPath: this.resolveImportPath(source || '', dirname(content))
      });
    }

    return imports;
  }

  private extractExports(_ast: any, content: string): ExportDeclaration[] {
    const exports: ExportDeclaration[] = [];

    // Simplified export extraction
    const exportRegex = /^export\s+(?:(default)\s+)?((?:const|let|var|function|class|interface|type)\s+)?(\w+)/gm;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      const isDefault = !!match[1];
      const name = match[3];
      const line = content.substring(0, match.index).split('\n').length;

      exports.push({
        name: name || '',
        type: isDefault ? 'default' : 'named',
        line,
        column: 1,
        raw: match[0]
      });
    }

    return exports;
  }

  private async detectIssues(
    _filePath: string,
    imports: ImportDeclaration[],
    _exports: ExportDeclaration[],
    _content: string,
    _options: ImportManagerOptions
  ): Promise<ImportIssue[]> {
    const issues: ImportIssue[] = [];

    for (const importDecl of imports) {
      // Check for unused imports
      const unusedSpecifiers = importDecl.specifiers.filter(spec => !spec.isUsed);
      if (unusedSpecifiers.length > 0) {
        issues.push({
          type: 'unused',
          severity: 'warning',
          description: `Unused import: ${unusedSpecifiers.map(s => s.name).join(', ')}`,
          location: { line: importDecl.line, column: importDecl.column },
          suggestion: `Remove unused imports or add /* eslint-disable-line */ if intentional`,
          autoFixable: true,
          impact: 'low'
        });
      }

      // Check for invalid paths
      if (!importDecl.isExternal && importDecl.resolvedPath && !existsSync(importDecl.resolvedPath)) {
        issues.push({
          type: 'invalid-path',
          severity: 'error',
          description: `Cannot resolve import path: ${importDecl.source}`,
          location: { line: importDecl.line, column: importDecl.column },
          suggestion: `Update import path or create missing file`,
          autoFixable: false,
          impact: 'high'
        });
      }

      // Check for incorrect file extensions
      if (!importDecl.isExternal && importDecl.source.includes('.ts')) {
        issues.push({
          type: 'incorrect-extension',
          severity: 'warning',
          description: `Import should not include .ts extension: ${importDecl.source}`,
          location: { line: importDecl.line, column: importDecl.column },
          suggestion: `Remove .ts extension from import path`,
          autoFixable: true,
          impact: 'medium'
        });
      }
    }

    // Check for duplicate imports
    const sourceGroups = new Map<string, ImportDeclaration[]>();
    imports.forEach(imp => {
      if (!sourceGroups.has(imp.source)) {
        sourceGroups.set(imp.source, []);
      }
      sourceGroups.get(imp.source)!.push(imp);
    });

    sourceGroups.forEach((impls, source) => {
      if (impls.length > 1) {
        issues.push({
          type: 'duplicate',
          severity: 'warning',
          description: `Duplicate imports from ${source}`,
          location: { line: impls[1]?.line || 0, column: impls[1]?.column || 0 },
          suggestion: `Consolidate imports from ${source}`,
          autoFixable: true,
          impact: 'medium'
        });
      }
    });

    return issues;
  }

  private generateSuggestions(
    filePath: string,
    imports: ImportDeclaration[],
    _exports: ExportDeclaration[],
    issues: ImportIssue[],
    options: ImportManagerOptions
  ): ImportSuggestion[] {
    const suggestions: ImportSuggestion[] = [];

    // Generate suggestions based on issues
    for (const issue of issues) {
      switch (issue.type) {
        case 'unused':
          suggestions.push({
            id: `remove-unused-${issue.location.line}`,
            type: 'remove-import',
            description: issue.description,
            before: this.getLineContent(filePath, issue.location.line),
            after: '// Import removed',
            confidence: 0.9,
            impact: {
              bundleSize: 5,
              performance: 2,
              maintainability: 10,
              readability: 15
            },
            autoApplicable: true
          });
          break;

        case 'duplicate':
          suggestions.push({
            id: `consolidate-${issue.location.line}`,
            type: 'consolidate',
            description: 'Consolidate duplicate imports',
            before: 'Multiple import statements',
            after: 'Single consolidated import',
            confidence: 0.8,
            impact: {
              bundleSize: 3,
              performance: 1,
              maintainability: 15,
              readability: 20
            },
            autoApplicable: true
          });
          break;

        case 'incorrect-extension':
          suggestions.push({
            id: `fix-extension-${issue.location.line}`,
            type: 'update-path',
            description: issue.description,
            before: this.getLineContent(filePath, issue.location.line),
            after: this.getLineContent(filePath, issue.location.line).replace('.ts', ''),
            confidence: 0.95,
            impact: {
              bundleSize: 0,
              performance: 0,
              maintainability: 5,
              readability: 5
            },
            autoApplicable: true
          });
          break;
      }
    }

    // Generate organization suggestions
    if (options.organizeImports && imports.length > 3) {
      suggestions.push({
        id: 'organize-imports',
        type: 'organize',
        description: 'Organize and sort imports',
        before: 'Unorganized imports',
        after: 'Organized imports (external, internal, relative)',
        confidence: 0.85,
        impact: {
          bundleSize: 0,
          performance: 0,
          maintainability: 20,
          readability: 30
        },
        autoApplicable: true
      });
    }

    return suggestions;
  }

  private calculateMetrics(
    imports: ImportDeclaration[],
    exports: ExportDeclaration[],
    _issues: ImportIssue[]
  ): ImportMetrics {
    const totalImports = imports.length;
    const externalImports = imports.filter(imp => imp.isExternal).length;
    const internalImports = totalImports - externalImports;
    const unusedImports = imports.filter(imp =>
      imp.specifiers.some(spec => !spec.isUsed)
    ).length;

    const complexityScore = this.calculateComplexityScore(imports, exports);
    const organizationScore = this.calculateOrganizationScore(imports);

    return {
      totalImports,
      externalImports,
      internalImports,
      unusedImports,
      circularDependencies: 0, // Will be calculated at codebase level
      averageImportsPerFile: totalImports, // Will be averaged at codebase level
      complexityScore,
      organizationScore
    };
  }

  private buildDependencyGraph(analyses: ImportAnalysis[]): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    // Build nodes
    for (const analysis of analyses) {
      nodes.push({
        filePath: analysis.filePath,
        name: this.getNodeName(analysis.filePath),
        type: this.determineNodeType(analysis.filePath),
        exports: analysis.exports.map(exp => exp.name),
        imports: analysis.imports.map(imp => imp.source),
        size: analysis.metrics.totalImports,
        complexity: analysis.metrics.complexityScore
      });
    }

    // Build edges
    for (const analysis of analyses) {
      for (const importDecl of analysis.imports) {
        if (!importDecl.isExternal) {
          const targetNode = nodes.find(node =>
            this.pathsMatch(node.filePath, importDecl.resolvedPath || '')
          );

          if (targetNode) {
            edges.push({
              from: analysis.filePath,
              to: targetNode.filePath,
              type: importDecl.isTypeOnly ? 'type-import' : 'import',
              specifiers: importDecl.specifiers.map(spec => spec.name),
              strength: this.calculateEdgeStrength(importDecl)
            });
          }
        }
      }
    }

    // Detect cycles
    const cycles = this.detectCycles(nodes, edges);

    const metrics: GraphMetrics = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      cyclomaticComplexity: this.calculateGraphComplexity(nodes, edges),
      maxDepth: this.calculateMaxDepth(nodes, edges),
      fanIn: this.calculateFanIn(nodes, edges),
      fanOut: this.calculateFanOut(nodes, edges),
      clustering: this.calculateClustering(nodes, edges)
    };

    return { nodes, edges, cycles, metrics };
  }

  // Helper methods for various calculations
  private isSpecifierUsed(content: string, name: string): boolean {
    const usageRegex = new RegExp(`\\b${name}\\b`, 'g');
    const matches = content.match(usageRegex) || [];
    return matches.length > 1; // More than just the import declaration
  }

  private countSpecifierUsage(content: string, name: string): number {
    const usageRegex = new RegExp(`\\b${name}\\b`, 'g');
    const matches = content.match(usageRegex) || [];
    return Math.max(0, matches.length - 1); // Exclude the import declaration
  }

  private findSpecifierLocations(content: string, name: string): Array<{ line: number; column: number }> {
    const locations: Array<{ line: number; column: number }> = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (index > 0 || !line.includes('import')) { // Skip import line
          locations.push({ line: index + 1, column: match.index + 1 });
        }
      }
    });

    return locations;
  }

  private determineImportType(specifiersStr: string): ImportDeclaration['type'] {
    if (specifiersStr.includes('{')) return 'named';
    if (specifiersStr.includes('* as')) return 'namespace';
    if (specifiersStr.trim() === '') return 'side-effect';
    return 'default';
  }

  private resolveImportPath(source: string, fromDir: string): string {
    if (source.startsWith('.')) {
      return resolve(fromDir, source);
    }
    return source; // External module
  }

  private optimizeRelativePath(filePath: string, importPath: string): string {
    // Simplified path optimization
    if (importPath.includes('../')) {
      const resolved = resolve(dirname(filePath), importPath);
      const optimized = relative(dirname(filePath), resolved);
      if (optimized.length < importPath.length) {
        return optimized.startsWith('.') ? optimized : `./${optimized}`;
      }
    }
    return importPath;
  }

  private canUseBarrelImport(importDecl: ImportDeclaration): boolean {
    return !importDecl.isExternal &&
           importDecl.source.includes('/') &&
           !importDecl.source.includes('index');
  }

  private findBarrelImport(source: string): string | null {
    // Look for index files that could be barrel imports
    const segments = source.split('/');
    if (segments.length > 1) {
      const barrelPath = segments.slice(0, -1).join('/');
      return barrelPath;
    }
    return null;
  }

  private prioritizeSuggestions(
    suggestions: ImportSuggestion[],
    options: ImportManagerOptions
  ): ImportSuggestion[] {
    return suggestions.sort((a, b) => {
      const scoreA = this.calculateSuggestionScore(a, options);
      const scoreB = this.calculateSuggestionScore(b, options);
      return scoreB - scoreA;
    });
  }

  private calculateSuggestionScore(suggestion: ImportSuggestion, options: ImportManagerOptions): number {
    let score = suggestion.confidence * 100;
    score += suggestion.impact.maintainability * 0.5;
    score += suggestion.impact.readability * 0.3;
    score += suggestion.impact.performance * 0.2;

    if (suggestion.autoApplicable) score += 20;
    if (options.aggressive) score += suggestion.impact.bundleSize * 0.1;

    return score;
  }

  private shouldApplySuggestion(suggestion: ImportSuggestion, options: ImportManagerOptions): boolean {
    if (!options.autoFix && !suggestion.autoApplicable) return false;
    if (suggestion.confidence < 0.7) return false;

    const aggressiveness = options.aggressive ? 'high' : 'medium';

    switch (aggressiveness) {
      case 'high':
        return suggestion.confidence >= 0.5;
      case 'medium':
        return suggestion.confidence >= 0.7 && suggestion.autoApplicable;
      default:
        return suggestion.confidence >= 0.9 && suggestion.autoApplicable;
    }
  }

  private applySuggestion(content: string, suggestion: ImportSuggestion): string {
    // Simplified suggestion application
    switch (suggestion.type) {
      case 'remove-import':
        return content.replace(suggestion.before, '');
      case 'update-path':
        return content.replace(suggestion.before, suggestion.after);
      case 'organize':
        return this.organizeImports(content);
      default:
        return content;
    }
  }

  private organizeImports(content: string): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const otherLines: string[] = [];

    let inImportSection = true;

    for (const line of lines) {
      if (line.trim().startsWith('import ')) {
        importLines.push(line);
      } else if (line.trim() === '') {
        if (inImportSection) {
          importLines.push(line);
        } else {
          otherLines.push(line);
        }
      } else {
        inImportSection = false;
        otherLines.push(line);
      }
    }

    // Sort imports: external first, then internal
    const sortedImports = importLines
      .filter(line => line.trim())
      .sort((a, b) => {
        const aExternal = !a.includes("from '.") && !a.includes('from ".') && !a.includes('from "/');
        const bExternal = !b.includes("from '.") && !b.includes('from ".') && !b.includes('from "/');

        if (aExternal && !bExternal) return -1;
        if (!aExternal && bExternal) return 1;
        return a.localeCompare(b);
      });

    return [...sortedImports, '', ...otherLines.filter(line => line.trim())].join('\n');
  }

  private calculateImprovement(before: ImportMetrics, after: ImportMetrics): ImportImpact {
    const bundleSize = before.unusedImports > 0 ?
      ((before.unusedImports - after.unusedImports) / before.unusedImports) * 10 : 0;

    const performance = (after.organizationScore - before.organizationScore) / 10;
    const maintainability = (after.organizationScore - before.organizationScore);
    const readability = maintainability * 1.2;

    return { bundleSize, performance, maintainability, readability };
  }

  private calculateComplexityScore(imports: ImportDeclaration[], _exports: ExportDeclaration[]): number {
    let score = 100;

    // Penalty for many imports
    score -= Math.min(30, imports.length * 2);

    // Penalty for complex import structures
    const complexImports = imports.filter(imp =>
      imp.specifiers.length > 5 || imp.type === 'namespace'
    );
    score -= complexImports.length * 5;

    // Penalty for unused imports
    const unusedImports = imports.filter(imp =>
      imp.specifiers.some(spec => !spec.isUsed)
    );
    score -= unusedImports.length * 3;

    return Math.max(0, score);
  }

  private calculateOrganizationScore(imports: ImportDeclaration[]): number {
    let score = 100;

    // Check if imports are sorted
    const sortedImports = [...imports].sort((a, b) => {
      if (a.isExternal && !b.isExternal) return -1;
      if (!a.isExternal && b.isExternal) return 1;
      return a.source.localeCompare(b.source);
    });

    const isSorted = imports.every((imp, index) =>
      imp.source === sortedImports[index]?.source
    );

    if (!isSorted) score -= 20;

    // Check for grouped imports
    const externalCount = imports.filter(imp => imp.isExternal).length;
    const internalCount = imports.length - externalCount;

    if (externalCount > 0 && internalCount > 0) {
      const firstInternal = imports.findIndex(imp => !imp.isExternal);
      const lastExternal = imports.map(imp => imp.isExternal).lastIndexOf(true);

      if (firstInternal !== -1 && lastExternal !== -1 && firstInternal < lastExternal) {
        score -= 15; // Mixed external and internal imports
      }
    }

    return Math.max(0, score);
  }

  private getNodeName(filePath: string): string {
    return filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';
  }

  private determineNodeType(filePath: string): DependencyNode['type'] {
    if (filePath.includes('schema')) return 'schema';
    if (filePath.includes('util')) return 'utility';
    if (filePath.includes('component')) return 'component';
    if (filePath.includes('type')) return 'type';
    if (filePath.includes('config')) return 'config';
    return 'utility';
  }

  private pathsMatch(path1: string, path2: string): boolean {
    return resolve(path1) === resolve(path2);
  }

  private calculateEdgeStrength(importDecl: ImportDeclaration): number {
    return importDecl.specifiers.reduce((strength, spec) =>
      strength + (spec.usageCount * 0.1), 0.1
    );
  }

  private detectCycles(nodes: DependencyNode[], edges: DependencyEdge[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const outgoingEdges = edges.filter(edge => edge.from === node);

      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, [...path]);
        } else if (recStack.has(edge.to)) {
          const cycleStart = path.indexOf(edge.to);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), edge.to]);
          }
        }
      }

      recStack.delete(node);
    };

    for (const node of nodes) {
      if (!visited.has(node.filePath)) {
        dfs(node.filePath, []);
      }
    }

    return cycles;
  }

  private calculateGraphComplexity(nodes: DependencyNode[], edges: DependencyEdge[]): number {
    return edges.length - nodes.length + 2; // Cyclomatic complexity formula
  }

  private calculateMaxDepth(nodes: DependencyNode[], _edges: DependencyEdge[]): number {
    // Simplified depth calculation
    return Math.ceil(Math.sqrt(nodes.length));
  }

  private calculateFanIn(nodes: DependencyNode[], edges: DependencyEdge[]): Record<string, number> {
    const fanIn: Record<string, number> = {};

    nodes.forEach(node => fanIn[node.filePath] = 0);
    edges.forEach(edge => {
      if (edge.to && fanIn[edge.to] !== undefined) {
        fanIn[edge.to] = (fanIn[edge.to] || 0) + 1;
      }
    });

    return fanIn;
  }

  private calculateFanOut(nodes: DependencyNode[], edges: DependencyEdge[]): Record<string, number> {
    const fanOut: Record<string, number> = {};

    nodes.forEach(node => fanOut[node.filePath] = 0);
    edges.forEach(edge => {
      if (edge.from && fanOut[edge.from] !== undefined) {
        fanOut[edge.from] = (fanOut[edge.from] || 0) + 1;
      }
    });

    return fanOut;
  }

  private calculateClustering(nodes: DependencyNode[], edges: DependencyEdge[]): number {
    // Simplified clustering coefficient
    if (nodes.length < 2) return 0;
    return edges.length / (nodes.length * (nodes.length - 1) / 2);
  }

  private getLineContent(filePath: string, lineNumber: number): string {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      return lines[lineNumber - 1] || '';
    } catch {
      return '';
    }
  }

  private createEmptyImpact(): ImportImpact {
    return {
      bundleSize: 0,
      performance: 0,
      maintainability: 0,
      readability: 0
    };
  }
}