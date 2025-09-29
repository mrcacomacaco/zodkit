/**
 * @fileoverview Schema relationship mapping and visualization
 * @module MapCommand
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/infrastructure';
import { SchemaMapper } from '../../core/infrastructure';
import { SchemaMapUI } from '../ui/dashboard';
import { writeFileSync } from 'fs';

interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
}

interface MapOptions {
  visualize?: boolean;
  depth?: string;
  export?: string;
}

export async function mapCommand(
  schemaName: string | undefined,
  options: MapOptions,
  command: Command
): Promise<void> {
  const globalOpts = command.parent?.opts() ?? {};
  const isJsonMode = (globalOpts as GlobalOptions)?.json ?? false;

  try {
    console.log(pc.blue('🗺️  zodkit map') + pc.gray(' - Mapping schema relationships...'));

    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const discovery = new SchemaDiscovery(config);
    const mapper = new SchemaMapper();

    // Discover all schemas
    const schemas = await discovery.findSchemas();
    if (schemas.length === 0) {
      throw new Error('No schemas found in project');
    }

    // Build relationship map
    const depth = options.depth ? parseInt(options.depth, 10) : 3;
    const relationshipMap = await mapper.buildRelationshipMap(schemas, {
      maxDepth: depth,
      includeUsage: true,
      includeTransitive: true
    });

    // Filter for specific schema if provided
    if (schemaName) {
      const filtered = mapper.filterForSchema(relationshipMap, schemaName);
      if (!filtered) {
        throw new Error(`Schema '${schemaName}' not found in relationship map`);
      }
    }

    // Export if requested
    if (options.export) {
      const exportData = {
        schemas: relationshipMap.schemas,
        relationships: relationshipMap.relationships,
        metadata: relationshipMap.metadata,
        generatedAt: new Date().toISOString()
      };
      writeFileSync(options.export, JSON.stringify(exportData, null, 2));
      console.log(pc.green(`✓ Map exported to ${options.export}`));
    }

    // Output mode
    if (isJsonMode) {
      console.log(JSON.stringify(relationshipMap, null, 2));
    } else if (options.visualize) {
      // Launch interactive TUI
      const mapUI = new SchemaMapUI(relationshipMap, schemaName);
      await mapUI.start();
    } else {
      // Display text summary
      displayTextMap(relationshipMap, schemaName);
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'MAP_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Map failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function displayTextMap(map: unknown, focusSchema?: string): void {
  const mapData = map as {
    metadata: {
      totalSchemas: number;
      totalRelationships: number;
      maxDepth: number;
      circularDependencies?: string[][];
    };
    schemas: Array<{
      name: string;
      file: string;
    }>;
    relationships: Array<{
      to: string;
      from: string;
    }>;
  };

  console.log('\n' + pc.bold('Schema Relationship Map'));
  console.log(pc.gray('─'.repeat(60)));

  // Summary
  console.log(pc.cyan('Total Schemas:'), mapData.metadata.totalSchemas);
  console.log(pc.cyan('Relationships:'), mapData.metadata.totalRelationships);
  console.log(pc.cyan('Max Depth:'), mapData.metadata.maxDepth);
  console.log(pc.cyan('Circular Dependencies:'), mapData.metadata.circularDependencies?.length ?? 0);

  if (focusSchema) {
    // Show details for specific schema
    const schema = mapData.schemas.find((s) => s.name === focusSchema);
    if (schema) {
      displaySchemaDetails(schema, mapData);
    }
  } else {
    // Show overview
    displayMapOverview(mapData);
  }

  // Show circular dependencies if any
  if (mapData.metadata.circularDependencies && mapData.metadata.circularDependencies.length > 0) {
    console.log('\n' + pc.red('⚠️  Circular Dependencies:'));
    mapData.metadata.circularDependencies.forEach((cycle: string[]) => {
      console.log(`  ${cycle.join(' → ')} → ${cycle[0]}`);
    });
  }

  // Show orphaned schemas
  const orphaned = mapData.schemas.filter((s) =>
    !mapData.relationships.some((r) => r.to === s.name || r.from === s.name)
  );
  if (orphaned.length > 0) {
    console.log('\n' + pc.yellow('🏝️  Orphaned Schemas:'));
    orphaned.forEach((s) => {
      console.log(`  ${s.name} - ${pc.gray(s.file)}`);
    });
  }
}

function displaySchemaDetails(schema: unknown, map: unknown): void {
  const schemaData = schema as {
    name: string;
    file: string;
    line: number;
    type: string;
    complexity: number;
    usage?: Array<{ file: string; line: number; type: string }>;
  };
  const mapData = map as {
    relationships: Array<{ from: string; to: string; type: string }>;
    schemas: Array<{ name: string; file: string }>;
  };

  console.log('\n' + pc.bold(`📘 ${schemaData.name}`));
  console.log(pc.gray(`📍 ${schemaData.file}:${schemaData.line}`));
  console.log(`Type: ${schemaData.type}`);
  console.log(`Complexity: ${schemaData.complexity.toFixed(1)}`);

  // Dependencies (what this schema uses)
  const dependencies = mapData.relationships.filter((r) => r.from === schemaData.name);
  if (dependencies.length > 0) {
    console.log('\n' + pc.blue('Dependencies (uses):'));
    dependencies.forEach((dep) => {
      const target = mapData.schemas.find((s) => s.name === dep.to);
      console.log(`  ├── ${pc.cyan(dep.to)} ${pc.gray(`(${dep.type})`)} - ${target?.file ?? 'unknown'}`);
    });
  }

  // Dependents (what uses this schema)
  const dependents = mapData.relationships.filter((r) => r.to === schemaData.name);
  if (dependents.length > 0) {
    console.log('\n' + pc.green('Dependents (used by):'));
    dependents.forEach((dep) => {
      const source = mapData.schemas.find((s) => s.name === dep.from);
      console.log(`  ├── ${pc.cyan(dep.from)} ${pc.gray(`(${dep.type})`)} - ${source?.file ?? 'unknown'}`);
    });
  }

  // Usage locations
  if (schemaData.usage && schemaData.usage.length > 0) {
    console.log('\n' + pc.magenta('Usage Locations:'));
    schemaData.usage.slice(0, 10).forEach((usage) => {
      console.log(`  ├── ${usage.file}:${usage.line} ${pc.gray(`(${usage.type})`)}`);
    });
    if (schemaData.usage.length > 10) {
      console.log(`  └── ... and ${schemaData.usage.length - 10} more`);
    }
  }
}

function displayMapOverview(map: unknown): void {
  const mapData = map as {
    schemas: Array<{
      name: string;
      type: string;
      complexity: number;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: string;
    }>;
  };

  // Group schemas by type
  const schemasByType = mapData.schemas.reduce((acc: Record<string, typeof mapData.schemas>, schema) => {
    acc[schema.type] ??= [];
    acc[schema.type]!.push(schema);
    return acc;
  }, {} as Record<string, typeof mapData.schemas>);

  console.log('\n' + pc.bold('Schemas by Type:'));
  Object.entries(schemasByType).forEach(([type, schemas]) => {
    console.log(`  ${type}: ${schemas.length}`);
    schemas.slice(0, 5).forEach((s) => {
      console.log(`    ├── ${pc.cyan(s.name)} ${pc.gray(`(complexity: ${s.complexity.toFixed(1)})`)}`);
    });
    if (schemas.length > 5) {
      console.log(`    └── ... and ${schemas.length - 5} more`);
    }
  });

  // Show most connected schemas
  const connectionCounts = mapData.schemas.map((schema) => ({
    name: schema.name,
    connections: mapData.relationships.filter((r) =>
      r.from === schema.name || r.to === schema.name
    ).length
  })).sort((a, b) => b.connections - a.connections);

  if (connectionCounts.length > 0) {
    console.log('\n' + pc.bold('Most Connected Schemas:'));
    connectionCounts.slice(0, 10).forEach((s) => {
      console.log(`  ${pc.cyan(s.name)}: ${s.connections} connection${s.connections === 1 ? '' : 's'}`);
    });
  }

  // Show relationship types
  const relationshipTypes = mapData.relationships.reduce((acc: Record<string, number>, rel) => {
    acc[rel.type] = (acc[rel.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n' + pc.bold('Relationship Types:'));
  Object.entries(relationshipTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}