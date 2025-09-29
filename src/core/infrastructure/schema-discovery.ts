import { Project, SourceFile, Node, SyntaxKind, VariableDeclaration, ScriptTarget } from 'ts-morph';
import fg from 'fast-glob';
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { dirname } from 'path';
// @ts-ignore: Reserved for future hash-based schema identification
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { Config } from './config';
import { SchemaCache } from './schema-cache';
import { createParallelProcessor } from './parallel-processor';

export interface SchemaInfo {
  name: string;
  filePath: string;
  line: number;
  column: number;
  schemaType: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'union' | 'intersection' | 'unknown';
  exportName?: string | undefined;
  isExported: boolean;
  zodChain: string; // The full Zod chain (e.g., "z.object({ name: z.string() })")
  properties?: SchemaProperty[] | undefined;
}

export interface SchemaProperty {
  name: string;
  type: string;
  optional: boolean;
  zodValidator: string;
}

export interface SyncOptions {
  autoSync?: boolean;
  watchMode?: boolean;
  conflictResolution?: 'auto' | 'interactive' | 'manual';
  backup?: boolean;
  dryRun?: boolean;
}

export interface SyncResult {
  discovered: number;
  updated: number;
  removed: number;
  conflicts: SchemaConflict[];
  errors: SyncError[];
  duration: number;
}

export interface SchemaConflict {
  schemaName: string;
  files: string[];
  type: 'duplicate-name' | 'type-mismatch' | 'version-conflict';
  resolution?: 'merge' | 'rename' | 'manual';
}

export interface SyncError {
  filePath: string;
  error: string;
  severity: 'warning' | 'error';
  suggestion?: string;
}

export interface SchemaUsage {
  filePath: string;
  line: number;
  column: number;
  context: 'validation' | 'type' | 'parse' | 'safeParse' | 'transform';
  confidence: number;
}

export interface SchemaMetadata {
  description?: string;
  version?: string;
  tags?: string[];
  complexity: 'low' | 'medium' | 'high';
  usageCount: number;
  lastModified: number;
}

export class SchemaDiscovery extends EventEmitter {
  private readonly project: Project;
  private readonly config: Config;
  private readonly cache: SchemaCache;
  private readonly parallelProcessor = createParallelProcessor();
  private syncCache: Map<string, SchemaInfo> = new Map();
  private readonly syncCacheFile = '.zodkit/sync-cache.json';

  constructor(config: Config, cache?: SchemaCache) {
    super();
    this.config = config;
    this.cache = cache ?? new SchemaCache();
    this.loadSyncCache();
    this.project = new Project({
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: 1, // CommonJS
        moduleResolution: 2, // Node
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      useInMemoryFileSystem: false,
    });
  }

  async findSchemas(options?: {
    useCache?: boolean;
    parallel?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }): Promise<SchemaInfo[]> {
    const patterns = this.config.schemas.patterns;
    const exclude = this.config.schemas.exclude;

    const files = await fg(patterns, {
      ignore: exclude,
      absolute: true,
    });

    const schemas: SchemaInfo[] = [];
    const useCache = options?.useCache ?? true;
    const useParallel = options?.parallel ?? files.length > 10;

    if (useParallel) {
      // Process files in parallel for better performance
      const fileResults = await this.parallelProcessor.processFiles(
        files,
        async (filePath) => this.processFile(filePath, useCache),
        { ...(options?.onProgress !== undefined && { onProgress: options.onProgress }) }
      );

      for (const fileSchemas of fileResults) {
        if (fileSchemas && Array.isArray(fileSchemas)) {
          schemas.push(...fileSchemas);
        }
      }
    } else {
      // Sequential processing for smaller projects
      let completed = 0;
      for (const filePath of files) {
        const fileSchemas = await this.processFile(filePath, useCache);
        if (fileSchemas) {
          schemas.push(...fileSchemas);
        }
        completed++;
        if (options?.onProgress) {
          options.onProgress(completed, files.length);
        }
      }
    }

    return schemas;
  }

  private async processFile(filePath: string, useCache: boolean): Promise<SchemaInfo[]> {
    try {
      // Check if file exists
      if (!existsSync(filePath)) {
        console.warn(`Warning: File not found: ${filePath}`);
        return [];
      }

      const fileContent = readFileSync(filePath, 'utf-8');

      // Check cache first
      if (useCache) {
        const cachedSchema = this.cache.get(filePath, fileContent);
        if (cachedSchema) {
          return [cachedSchema];
        }
      }

      const startTime = Date.now();
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      const fileSchemas = this.extractSchemasFromFile(sourceFile);
      const parseTime = Date.now() - startTime;

      // Cache results
      if (useCache && fileSchemas.length > 0) {
        for (const schema of fileSchemas) {
          this.cache.set(filePath, schema, fileContent, parseTime);
        }
      }

      return fileSchemas;
    } catch (error) {
      console.warn(`Warning: Could not parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private extractSchemasFromFile(sourceFile: SourceFile): SchemaInfo[] {
    const schemas: SchemaInfo[] = [];
    const filePath = sourceFile.getFilePath();

    // Find variable declarations that use Zod
    sourceFile.getVariableDeclarations().forEach(declaration => {
      const schema = this.analyzeVariableDeclaration(declaration, filePath);
      if (schema) {
        schemas.push(schema);
      }
    });

    // Find exported const assertions
    sourceFile.getExportDeclarations().forEach(exportDecl => {
      exportDecl.getNamedExports().forEach(namedExport => {
        const symbol = namedExport.getSymbol();
        if (symbol) {
          const declaration = symbol.getDeclarations()[0];
          if (Node.isVariableDeclaration(declaration)) {
            const schema = this.analyzeVariableDeclaration(declaration, filePath, namedExport.getName());
            if (schema) {
              schemas.push(schema);
            }
          }
        }
      });
    });

    return schemas;
  }

  private analyzeVariableDeclaration(
    declaration: VariableDeclaration,
    filePath: string,
    exportName?: string
  ): SchemaInfo | null {
    const initializer = declaration.getInitializer();
    if (!initializer) return null;

    // Check if this is a Zod schema
    if (!this.isZodExpression(initializer)) return null;

    const name = declaration.getName();
    const position = declaration.getStartLineNumber();
    const column = declaration.getStart() - declaration.getStartLinePos();
    const isExported = this.isExported(declaration) || !!exportName;

    const zodChain = initializer.getText();
    const schemaType = this.determineSchemaType(initializer);
    const properties = this.extractProperties(initializer);

    return {
      name,
      filePath,
      line: position,
      column,
      schemaType,
      exportName,
      isExported,
      zodChain,
      properties,
    };
  }

  private isZodExpression(node: Node): boolean {
    const text = node.getText();

    // Check for common Zod patterns
    return /\bz\.(object|string|number|boolean|array|union|intersection|literal|enum|tuple|record|map|set|date|undefined|null|void|any|unknown|never|function|promise|lazy|instanceof|refine|transform|optional|nullable|default)\b/.test(text);
  }

  private determineSchemaType(node: Node): SchemaInfo['schemaType'] {
    const text = node.getText();

    if (text.includes('z.object(')) return 'object';
    if (text.includes('z.string(')) return 'string';
    if (text.includes('z.number(')) return 'number';
    if (text.includes('z.boolean(')) return 'boolean';
    if (text.includes('z.array(')) return 'array';
    if (text.includes('z.union(')) return 'union';
    if (text.includes('z.intersection(')) return 'intersection';

    return 'unknown';
  }

  private extractProperties(node: Node): SchemaProperty[] | undefined {
    const properties: SchemaProperty[] = [];

    // For now, basic property extraction - can be enhanced later
    if (Node.isCallExpression(node)) {
      const args = node.getArguments();
      if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
        const objectLiteral = args[0];

        objectLiteral.getProperties().forEach(prop => {
          if (Node.isPropertyAssignment(prop)) {
            const name = prop.getName();
            const initializer = prop.getInitializer();
            if (initializer) {
              const zodValidator = initializer.getText();
              const optional = zodValidator.includes('.optional()');
              const type = this.inferTypeFromZodValidator(zodValidator);

              properties.push({
                name,
                type,
                optional,
                zodValidator,
              });
            }
          }
        });
      }
    }

    return properties.length > 0 ? properties : undefined;
  }

  private inferTypeFromZodValidator(validator: string): string {
    if (validator.includes('z.string(')) return 'string';
    if (validator.includes('z.number(')) return 'number';
    if (validator.includes('z.boolean(')) return 'boolean';
    if (validator.includes('z.array(')) return 'array';
    if (validator.includes('z.object(')) return 'object';
    if (validator.includes('z.date(')) return 'Date';
    if (validator.includes('z.union(')) return 'union';

    return 'unknown';
  }

  private isExported(declaration: VariableDeclaration): boolean {
    const statement = declaration.getVariableStatement();
    if (!statement) return false;

    return statement.hasExportKeyword() ||
           statement.getModifiers().some(mod => mod.getKind() === SyntaxKind.ExportKeyword);
  }

  // Zero-Config Sync Features

  async syncSchemas(options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    this.emit('sync:start');

    try {
      const currentSchemas = await this.findSchemas({ useCache: false });
      const previousSchemas = Array.from(this.syncCache.values());

      const result = await this.compareSchemasAndSync(currentSchemas, previousSchemas, options);
      result.duration = Date.now() - startTime;

      // Update sync cache
      this.syncCache.clear();
      currentSchemas.forEach(schema => {
        this.syncCache.set(this.getSchemaKey(schema), schema);
      });
      this.saveSyncCache();

      this.emit('sync:complete', result);
      return result;
    } catch (error) {
      this.emit('sync:error', error);
      throw error;
    }
  }

  async enableAutoSync(options: SyncOptions = {}): Promise<void> {
    this.emit('auto-sync:enabled');

    // Set up file watchers for automatic syncing
    const patterns = this.config.schemas.patterns;
    const exclude = this.config.schemas.exclude;

    const files = await fg(patterns, {
      ignore: exclude,
      absolute: true,
    });

    // Watch for file changes and trigger sync
    const chokidar = await import('chokidar');
    const watcher = chokidar.watch(files, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', async (filePath) => {
      this.emit('file:changed', { filePath });

      try {
        await this.syncSingleFile(filePath, options);
      } catch (error) {
        this.emit('sync:error', { filePath, error });
      }
    });

    watcher.on('add', async (filePath) => {
      this.emit('file:added', { filePath });

      try {
        await this.syncSingleFile(filePath, options);
      } catch (error) {
        this.emit('sync:error', { filePath, error });
      }
    });

    watcher.on('unlink', async (filePath) => {
      this.emit('file:removed', { filePath });
      this.removeSchemasFromFile(filePath);
    });
  }

  async getSchemaUsages(schemaName: string): Promise<SchemaUsage[]> {
    const patterns = this.config.schemas.patterns;
    const exclude = this.config.schemas.exclude;

    const files = await fg(patterns, {
      ignore: exclude,
      absolute: true,
    });

    const usages: SchemaUsage[] = [];

    for (const file of files) {
      try {
        const fileUsages = await this.findSchemaUsagesInFile(file, schemaName);
        usages.push(...fileUsages);
      } catch (error) {
        // Skip files that can't be processed
      }
    }

    return usages;
  }

  async getSchemaMetadata(schemaName: string): Promise<SchemaMetadata | undefined> {
    const schema = Array.from(this.syncCache.values()).find(s => s.name === schemaName);
    if (!schema) return undefined;

    const usages = await this.getSchemaUsages(schemaName);

    const description = this.extractSchemaDescription(schema);
    const version = this.extractSchemaVersion(schema);

    return {
      ...(description !== undefined && { description }),
      ...(version !== undefined && { version }),
      tags: this.extractSchemaTags(schema),
      complexity: this.calculateSchemaComplexity(schema),
      usageCount: usages.length,
      lastModified: statSync(schema.filePath).mtime.getTime()
    };
  }

  async getConflicts(): Promise<SchemaConflict[]> {
    const schemas = Array.from(this.syncCache.values());
    const conflicts: SchemaConflict[] = [];

    // Group schemas by name
    const nameGroups = new Map<string, SchemaInfo[]>();
    schemas.forEach(schema => {
      const group = nameGroups.get(schema.name) || [];
      group.push(schema);
      nameGroups.set(schema.name, group);
    });

    // Find conflicts
    nameGroups.forEach((group, name) => {
      if (group.length > 1) {
        conflicts.push({
          schemaName: name,
          files: group.map(s => s.filePath),
          type: 'duplicate-name',
          resolution: 'manual'
        });
      }
    });

    return conflicts;
  }

  private async compareSchemasAndSync(
    current: SchemaInfo[],
    previous: SchemaInfo[],
    _options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      discovered: 0,
      updated: 0,
      removed: 0,
      conflicts: [],
      errors: [],
      duration: 0
    };

    const currentMap = new Map(current.map(s => [this.getSchemaKey(s), s]));
    const previousMap = new Map(previous.map(s => [this.getSchemaKey(s), s]));

    // Find new schemas
    for (const [key, schema] of currentMap) {
      if (!previousMap.has(key)) {
        result.discovered++;
        this.emit('schema:discovered', schema);
      } else {
        const prev = previousMap.get(key)!;
        if (this.hasSchemaChanged(schema, prev)) {
          result.updated++;
          this.emit('schema:updated', { previous: prev, current: schema });
        }
      }
    }

    // Find removed schemas
    for (const [key, schema] of previousMap) {
      if (!currentMap.has(key)) {
        result.removed++;
        this.emit('schema:removed', schema);
      }
    }

    // Find conflicts
    result.conflicts = await this.getConflicts();

    return result;
  }

  private async syncSingleFile(filePath: string, _options: SyncOptions): Promise<void> {
    try {
      const fileSchemas = await this.processFile(filePath, false);

      // Update sync cache for this file
      this.removeSchemasFromFile(filePath);
      fileSchemas.forEach(schema => {
        this.syncCache.set(this.getSchemaKey(schema), schema);
      });

      this.saveSyncCache();
      this.emit('file:synced', { filePath, schemas: fileSchemas });
    } catch (error) {
      this.emit('sync:error', { filePath, error });
    }
  }

  private removeSchemasFromFile(filePath: string): void {
    const keysToRemove: string[] = [];

    this.syncCache.forEach((schema, key) => {
      if (schema.filePath === filePath) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach(key => {
      this.syncCache.delete(key);
    });
  }

  private async findSchemaUsagesInFile(filePath: string, schemaName: string): Promise<SchemaUsage[]> {
    const usages: SchemaUsage[] = [];

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (line.includes(schemaName)) {
          const column = line.indexOf(schemaName);
          let context: SchemaUsage['context'] = 'validation';

          if (line.includes('.parse(')) context = 'parse';
          else if (line.includes('.safeParse(')) context = 'safeParse';
          else if (line.includes('.transform(')) context = 'transform';
          else if (line.includes(': ')) context = 'type';

          usages.push({
            filePath,
            line: index + 1,
            column: column + 1,
            context,
            confidence: 0.8
          });
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }

    return usages;
  }

  private getSchemaKey(schema: SchemaInfo): string {
    return `${schema.filePath}:${schema.name}`;
  }

  private hasSchemaChanged(current: SchemaInfo, previous: SchemaInfo): boolean {
    return current.zodChain !== previous.zodChain ||
           current.isExported !== previous.isExported ||
           JSON.stringify(current.properties) !== JSON.stringify(previous.properties);
  }

  private extractSchemaDescription(schema: SchemaInfo): string | undefined {
    // Try to extract JSDoc comments above the schema
    try {
      const sourceFile = this.project.getSourceFile(schema.filePath);
      if (sourceFile) {
        const declaration = sourceFile.getVariableDeclarations().find(d => d.getName() === schema.name);
        if (declaration) {
          // @ts-ignore: TypeScript API issue
          const jsDocs = (declaration as any).getJsDocs?.();
          if (jsDocs && jsDocs.length > 0) {
            return jsDocs[0]?.getDescription();
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  private extractSchemaVersion(schema: SchemaInfo): string | undefined {
    // Look for @version tags in JSDoc
    try {
      const sourceFile = this.project.getSourceFile(schema.filePath);
      if (sourceFile) {
        const declaration = sourceFile.getVariableDeclarations().find(d => d.getName() === schema.name);
        if (declaration) {
          // @ts-ignore: TypeScript API issue
          const jsDocs = (declaration as any).getJsDocs?.() || [];
          for (const jsDoc of jsDocs) {
            const versionTag = jsDoc.getTags().find((tag: any) => tag.getTagName() === 'version');
            if (versionTag) {
              return versionTag.getComment();
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  private extractSchemaTags(schema: SchemaInfo): string[] {
    // Look for @tag tags in JSDoc
    const tags: string[] = [];
    try {
      const sourceFile = this.project.getSourceFile(schema.filePath);
      if (sourceFile) {
        const declaration = sourceFile.getVariableDeclarations().find(d => d.getName() === schema.name);
        if (declaration) {
          // @ts-ignore: TypeScript API issue
          const jsDocs = (declaration as any).getJsDocs?.() || [];
          for (const jsDoc of jsDocs) {
            const tagTags = jsDoc.getTags().filter((tag: any) => tag.getTagName() === 'tag');
            tagTags.forEach((tag: any) => {
              const comment = tag.getComment();
              if (comment) {
                tags.push(comment);
              }
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return tags;
  }

  private calculateSchemaComplexity(schema: SchemaInfo): 'low' | 'medium' | 'high' {
    const zodChainLength = schema.zodChain.length;
    const propertyCount = schema.properties?.length || 0;
    const nestingLevel = (schema.zodChain.match(/\{/g) || []).length;

    const complexityScore = zodChainLength + (propertyCount * 10) + (nestingLevel * 20);

    if (complexityScore > 500) return 'high';
    if (complexityScore > 200) return 'medium';
    return 'low';
  }

  private loadSyncCache(): void {
    try {
      if (existsSync(this.syncCacheFile)) {
        const data = JSON.parse(readFileSync(this.syncCacheFile, 'utf-8'));
        this.syncCache = new Map(data.schemas || []);
      }
    } catch {
      // Use empty cache if loading fails
    }
  }

  private saveSyncCache(): void {
    try {
      const cacheDir = dirname(this.syncCacheFile);
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      const data = {
        schemas: Array.from(this.syncCache.entries()),
        lastSync: Date.now(),
        version: '1.0.0'
      };

      writeFileSync(this.syncCacheFile, JSON.stringify(data, null, 2));
    } catch {
      // Ignore save errors
    }
  }
}