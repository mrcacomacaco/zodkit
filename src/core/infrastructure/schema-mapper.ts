/**
 * @fileoverview Schema relationship mapper and analyzer
 * @module SchemaMapper
 */

import { SchemaInfo } from './schema-discovery';
import { readFileSync } from 'fs';
import { dirname, basename } from 'path';

export interface SchemaRelationship {
  from: string;
  to: string;
  type: 'extends' | 'references' | 'uses' | 'imports' | 'composes';
  context?: string;
  line?: number;
  strength: number; // 0-1, how strong the relationship is
}

export interface SchemaNode {
  name: string;
  type: string;
  file: string;
  line: number;
  complexity: number;
  fields?: string[];
  isExported: boolean;
  usage?: UsageLocation[];
  metadata: {
    size: number; // Lines of code
    dependencies: number;
    dependents: number;
    lastModified?: Date;
  };
}

export interface UsageLocation {
  file: string;
  line: number;
  type: 'import' | 'parse' | 'validate' | 'transform' | 'reference';
  context?: string;
}

export interface RelationshipMap {
  schemas: SchemaNode[];
  relationships: SchemaRelationship[];
  metadata: {
    totalSchemas: number;
    totalRelationships: number;
    maxDepth: number;
    circularDependencies?: string[][];
    clusters?: SchemaCluster[];
    orphanedSchemas?: string[];
  };
}

export interface SchemaCluster {
  id: string;
  schemas: string[];
  relationships: number;
  type: 'component' | 'domain' | 'utility';
}

export interface MapOptions {
  maxDepth?: number;
  includeUsage?: boolean;
  includeTransitive?: boolean;
  followImports?: boolean;
}

export class SchemaMapper {
  private readonly fileContentCache: Map<string, string> = new Map();

  /**
   * Build comprehensive relationship map for schemas
   */
  async buildRelationshipMap(
    schemas: SchemaInfo[],
    options: MapOptions = {}
  ): Promise<RelationshipMap> {
    const {
      maxDepth = 3,
      includeUsage = true,
      includeTransitive = true,
      followImports = true
    } = options;

    // Convert schemas to nodes
    const nodes: SchemaNode[] = await Promise.all(
      schemas.map(schema => this.schemaToNode(schema, includeUsage))
    );

    // Find all relationships
    const relationships: SchemaRelationship[] = [];

    // Direct relationships from schema definitions
    for (const schema of schemas) {
      const schemaRels = await this.findSchemaRelationships(schema, schemas);
      relationships.push(...schemaRels);
    }

    // Usage relationships if enabled
    if (includeUsage) {
      const usageRels = await this.findUsageRelationships(schemas);
      relationships.push(...usageRels);
    }

    // Import relationships if enabled
    if (followImports) {
      const importRels = await this.findImportRelationships(schemas);
      relationships.push(...importRels);
    }

    // Transitive relationships if enabled
    if (includeTransitive) {
      const transitiveRels = this.findTransitiveRelationships(
        relationships,
        maxDepth
      );
      relationships.push(...transitiveRels);
    }

    // Analyze for patterns
    const circularDependencies = this.findCircularDependencies(
      nodes.map(n => n.name),
      relationships
    );

    const clusters = this.identifySchemaCluster(nodes, relationships);
    const orphanedSchemas = this.findOrphanedSchemas(nodes, relationships);

    return {
      schemas: nodes,
      relationships: this.deduplicateRelationships(relationships),
      metadata: {
        totalSchemas: nodes.length,
        totalRelationships: relationships.length,
        maxDepth,
        circularDependencies,
        clusters,
        orphanedSchemas
      }
    };
  }

  /**
   * Filter map to focus on specific schema and its connections
   */
  filterForSchema(map: RelationshipMap, schemaName: string): RelationshipMap | null {
    const schema = map.schemas.find(s => s.name === schemaName);
    if (!schema) return null;

    // Find connected schemas (direct and one level out)
    const connectedSchemaNames = new Set([schemaName]);

    // Add direct connections
    map.relationships
      .filter(r => r.from === schemaName || r.to === schemaName)
      .forEach(r => {
        connectedSchemaNames.add(r.from);
        connectedSchemaNames.add(r.to);
      });

    // Add one more level
    Array.from(connectedSchemaNames).forEach(name => {
      map.relationships
        .filter(r => r.from === name || r.to === name)
        .forEach(r => {
          connectedSchemaNames.add(r.from);
          connectedSchemaNames.add(r.to);
        });
    });

    const filteredSchemas = map.schemas.filter(s =>
      connectedSchemaNames.has(s.name)
    );

    const filteredRelationships = map.relationships.filter(r =>
      connectedSchemaNames.has(r.from) && connectedSchemaNames.has(r.to)
    );

    return {
      schemas: filteredSchemas,
      relationships: filteredRelationships,
      metadata: {
        ...map.metadata,
        totalSchemas: filteredSchemas.length,
        totalRelationships: filteredRelationships.length
      }
    };
  }

  /**
   * Convert SchemaInfo to SchemaNode with additional metadata
   */
  private async schemaToNode(
    schema: SchemaInfo,
    includeUsage: boolean
  ): Promise<SchemaNode> {
    const fileContent = await this.getFileContent(schema.filePath);
    // @ts-ignore: lines variable reserved for future line-based analysis
    const lines = fileContent.split('\n');

    // Calculate complexity (simplified)
    const complexity = this.calculateSchemaComplexity(schema);

    // Find usage locations if requested
    let usage: UsageLocation[] = [];
    if (includeUsage) {
      usage = await this.findSchemaUsage(schema);
    }

    const fields = schema.properties?.map(p => p.name);
    return {
      name: schema.exportName || schema.name,
      type: schema.schemaType,
      file: schema.filePath,
      line: schema.line,
      complexity,
      ...(fields !== undefined && { fields }),
      isExported: schema.isExported,
      usage,
      metadata: {
        size: this.calculateSchemaSize(schema, fileContent),
        dependencies: 0, // Will be calculated from relationships
        dependents: 0,   // Will be calculated from relationships
        lastModified: this.getFileModifiedDate(schema.filePath)
      }
    };
  }

  /**
   * Find relationships from schema definitions
   */
  private async findSchemaRelationships(
    schema: SchemaInfo,
    allSchemas: SchemaInfo[]
  ): Promise<SchemaRelationship[]> {
    const relationships: SchemaRelationship[] = [];
    const schemaName = schema.exportName || schema.name;

    // Analyze Zod chain for references to other schemas
    const zodChain = schema.zodChain;

    // Look for extend patterns
    const extendPattern = /\.extend\((\w+Schema|\w+)\)/g;
    let match;
    while ((match = extendPattern.exec(zodChain)) !== null) {
      const referencedSchema = match[1];
      if (referencedSchema && this.isValidSchemaReference(referencedSchema, allSchemas)) {
        relationships.push({
          from: schemaName,
          to: referencedSchema,
          type: 'extends',
          context: match[0],
          strength: 1.0
        });
      }
    }

    // Look for merge patterns
    const mergePattern = /\.merge\((\w+Schema|\w+)\)/g;
    while ((match = mergePattern.exec(zodChain)) !== null) {
      const referencedSchema = match[1];
      if (referencedSchema && this.isValidSchemaReference(referencedSchema, allSchemas)) {
        relationships.push({
          from: schemaName,
          to: referencedSchema,
          type: 'composes',
          context: match[0],
          strength: 0.9
        });
      }
    }

    // Look for direct schema references in fields
    const referencePattern = /(\w+Schema)(?!\w)/g;
    while ((match = referencePattern.exec(zodChain)) !== null) {
      const referencedSchema = match[1];
      if (referencedSchema && referencedSchema !== schemaName &&
          this.isValidSchemaReference(referencedSchema, allSchemas)) {
        relationships.push({
          from: schemaName,
          to: referencedSchema,
          type: 'references',
          context: 'field reference',
          strength: 0.8
        });
      }
    }

    // Look for union/intersection references
    const unionPattern = /z\.union\(\[([^\]]+)\]\)/g;
    while ((match = unionPattern.exec(zodChain)) !== null) {
      const unionContent = match[1] || '';
      const schemaRefs = unionContent.match(/\w+Schema/g) || [];

      for (const ref of schemaRefs) {
        if (this.isValidSchemaReference(ref, allSchemas)) {
          relationships.push({
            from: schemaName,
            to: ref,
            type: 'uses',
            context: 'union member',
            strength: 0.7
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Find usage relationships by scanning source files
   */
  private async findUsageRelationships(
    _schemas: SchemaInfo[]
  ): Promise<SchemaRelationship[]> {
    const relationships: SchemaRelationship[] = [];

    // This would scan the entire codebase for schema usage
    // For now, implementing a simplified version

    return relationships;
  }

  /**
   * Find import relationships
   */
  private async findImportRelationships(
    schemas: SchemaInfo[]
  ): Promise<SchemaRelationship[]> {
    const relationships: SchemaRelationship[] = [];

    for (const schema of schemas) {
      const fileContent = await this.getFileContent(schema.filePath);
      const imports = this.extractImports(fileContent);

      for (const importInfo of imports) {
        // Check if import is a schema from our collection
        const importedSchema = schemas.find(s =>
          s.exportName === importInfo.name ||
          importInfo.file.includes(basename(s.filePath, '.ts'))
        );

        if (importedSchema) {
          relationships.push({
            from: schema.exportName || schema.name,
            to: importedSchema.exportName || importedSchema.name,
            type: 'imports',
            context: importInfo.file,
            strength: 0.6
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Find transitive relationships
   */
  private findTransitiveRelationships(
    relationships: SchemaRelationship[],
    maxDepth: number
  ): SchemaRelationship[] {
    const transitiveRels: SchemaRelationship[] = [];

    // Build adjacency list
    const graph = new Map<string, string[]>();
    relationships.forEach(rel => {
      if (!graph.has(rel.from)) graph.set(rel.from, []);
      graph.get(rel.from)!.push(rel.to);
    });

    // Find paths of length > 1
    for (const [start, directTargets] of graph.entries()) {
      const visited = new Set<string>();
      this.findPaths(graph, start, directTargets, visited, 1, maxDepth, transitiveRels);
    }

    return transitiveRels;
  }

  private findPaths(
    graph: Map<string, string[]>,
    start: string,
    currentTargets: string[],
    visited: Set<string>,
    depth: number,
    maxDepth: number,
    result: SchemaRelationship[]
  ): void {
    if (depth >= maxDepth) return;

    for (const target of currentTargets) {
      if (visited.has(target)) continue;
      visited.add(target);

      const nextTargets = graph.get(target) || [];
      for (const nextTarget of nextTargets) {
        if (nextTarget !== start) { // Avoid immediate cycles
          result.push({
            from: start,
            to: nextTarget,
            type: 'uses',
            context: `transitive (depth ${depth + 1})`,
            strength: Math.max(0.1, 0.5 / (depth + 1))
          });
        }
      }

      this.findPaths(graph, start, nextTargets, visited, depth + 1, maxDepth, result);
      visited.delete(target);
    }
  }

  /**
   * Find circular dependencies
   */
  private findCircularDependencies(
    schemas: string[],
    relationships: SchemaRelationship[]
  ): string[][] {
    const cycles: string[][] = [];
    const graph = new Map<string, string[]>();

    // Build adjacency list
    relationships.forEach(rel => {
      if (!graph.has(rel.from)) graph.set(rel.from, []);
      graph.get(rel.from)!.push(rel.to);
    });

    // DFS to find cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
          return true;
        }
      }

      recStack.delete(node);
      path.pop();
      return false;
    };

    for (const schema of schemas) {
      if (!visited.has(schema)) {
        dfs(schema);
      }
    }

    return cycles;
  }

  /**
   * Identify schema clusters
   */
  private identifySchemaCluster(
    schemas: SchemaNode[],
    relationships: SchemaRelationship[]
  ): SchemaCluster[] {
    const clusters: SchemaCluster[] = [];

    // Group by file directory (simple clustering)
    const dirGroups = new Map<string, SchemaNode[]>();
    schemas.forEach(schema => {
      const dir = dirname(schema.file);
      if (!dirGroups.has(dir)) dirGroups.set(dir, []);
      dirGroups.get(dir)!.push(schema);
    });

    dirGroups.forEach((schemas, dir) => {
      if (schemas.length > 1) {
        const schemaNames = schemas.map(s => s.name);
        const internalRels = relationships.filter(r =>
          schemaNames.includes(r.from) && schemaNames.includes(r.to)
        ).length;

        clusters.push({
          id: basename(dir),
          schemas: schemaNames,
          relationships: internalRels,
          type: this.classifyClusterType(dir, schemas)
        });
      }
    });

    return clusters;
  }

  private classifyClusterType(
    dir: string,
    _schemas: SchemaNode[]
  ): 'component' | 'domain' | 'utility' {
    const dirName = basename(dir).toLowerCase();

    if (dirName.includes('component') || dirName.includes('ui')) {
      return 'component';
    }
    if (dirName.includes('util') || dirName.includes('helper')) {
      return 'utility';
    }
    return 'domain';
  }

  /**
   * Find orphaned schemas (no relationships)
   */
  private findOrphanedSchemas(
    schemas: SchemaNode[],
    relationships: SchemaRelationship[]
  ): string[] {
    const connectedSchemas = new Set<string>();
    relationships.forEach(rel => {
      connectedSchemas.add(rel.from);
      connectedSchemas.add(rel.to);
    });

    return schemas
      .filter(schema => !connectedSchemas.has(schema.name))
      .map(schema => schema.name);
  }

  // Helper methods
  private async getFileContent(filePath: string): Promise<string> {
    if (!this.fileContentCache.has(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        this.fileContentCache.set(filePath, content);
      } catch {
        this.fileContentCache.set(filePath, '');
      }
    }
    return this.fileContentCache.get(filePath)!;
  }

  private calculateSchemaComplexity(schema: SchemaInfo): number {
    // Simplified complexity calculation
    let complexity = 1;

    complexity += (schema.properties?.length || 0) * 0.5;
    complexity += (schema.zodChain.match(/\./g) || []).length * 0.1;

    if (schema.zodChain.includes('refine')) complexity += 2;
    if (schema.zodChain.includes('transform')) complexity += 1.5;
    if (schema.zodChain.includes('union')) complexity += 1;

    return complexity;
  }

  private calculateSchemaSize(schema: SchemaInfo, _fileContent: string): number {
    // Count lines of the schema definition
    const lines = schema.zodChain.split('\n').length;
    return lines;
  }

  private getFileModifiedDate(filePath: string): Date {
    try {
      const { statSync } = require('fs');
      return statSync(filePath).mtime;
    } catch {
      return new Date();
    }
  }

  private isValidSchemaReference(
    reference: string,
    allSchemas: SchemaInfo[]
  ): boolean {
    return allSchemas.some(s =>
      s.exportName === reference || s.name === reference
    );
  }

  private extractImports(fileContent: string): Array<{ name: string; file: string }> {
    const imports: Array<{ name: string; file: string }> = [];

    // Simple import extraction
    const importPattern = /import\s+(?:\{[^}]*(\w+Schema)[^}]*\}|(\w+Schema))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importPattern.exec(fileContent)) !== null) {
      const name = match[1] || match[2];
      const file = match[3] || '';
      if (name) {
        imports.push({ name, file });
      }
    }

    return imports;
  }

  private async findSchemaUsage(_schema: SchemaInfo): Promise<UsageLocation[]> {
    // Simplified usage finding
    // In production, would scan entire codebase
    return [];
  }

  private deduplicateRelationships(relationships: SchemaRelationship[]): SchemaRelationship[] {
    const seen = new Set<string>();
    return relationships.filter(rel => {
      const key = `${rel.from}-${rel.to}-${rel.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}