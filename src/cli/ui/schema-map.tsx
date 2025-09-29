/**
 * @fileoverview Interactive TUI for schema relationship visualization
 * @module SchemaMapUI
 */

import React, { useState } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput } = require('ink');
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

interface SchemaMapUIProps {
  relationshipMap: any;
  focusSchema?: string;
}

const SchemaMap: React.FC<SchemaMapUIProps> = ({ relationshipMap, focusSchema }) => {
  const [selectedSchema, setSelectedSchema] = useState<string>(focusSchema || '');
  const [view, setView] = useState<'graph' | 'tree' | 'matrix' | 'flow'>('graph');
  const [_searchTerm, setSearchTerm] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [highlightType, setHighlightType] = useState<string | null>(null);
  const { exit } = useApp();

  const schemas = relationshipMap.schemas || [];
  const relationships = relationshipMap.relationships || [];

  useInput((input: string, key: any) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    // View switching
    if (input === '1') setView('graph');
    if (input === '2') setView('tree');
    if (input === '3') setView('matrix');
    if (input === '4') setView('flow');

    // Help
    if (input === '?') setShowHelp(!showHelp);

    // Navigation
    if (key.upArrow || input === 'k') {
      navigateSchemas(-1);
    }
    if (key.downArrow || input === 'j') {
      navigateSchemas(1);
    }

    // Select schema
    if (key.return) {
      if (selectedSchema) {
        // Show details
      }
    }

    // Search
    if (input === '/') {
      // Enter search mode
    }

    // Highlight by type
    if (input === 't') {
      cycleHighlightType();
    }

    // Reset
    if (input === 'r') {
      setSelectedSchema('');
      setSearchTerm('');
      setHighlightType(null);
    }
  });

  const navigateSchemas = (direction: number) => {
    const currentIndex = schemas.findIndex((s: any) => s.name === selectedSchema);
    const newIndex = Math.max(0, Math.min(schemas.length - 1, currentIndex + direction));
    setSelectedSchema(schemas[newIndex]?.name || '');
  };

  const cycleHighlightType = () => {
    const types = ['object', 'string', 'number', 'array', 'union'];
    const currentIndex = types.indexOf(highlightType || '');
    const nextIndex = (currentIndex + 1) % types.length;
    setHighlightType(types[nextIndex] || null);
  };

  if (showHelp) {
    return <HelpView onClose={() => setShowHelp(false)} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Gradient name="morning">
          <BigText text="SCHEMA MAP" font="simple" />
        </Gradient>
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginBottom={1}>
        <Text color="green">
          {schemas.length} schemas | {relationships.length} relationships
        </Text>
        <Text color="gray">
          {selectedSchema && `Selected: ${selectedSchema}`}
          {highlightType && ` | Highlighting: ${highlightType}`}
        </Text>
        <Text color="gray">[?] Help</Text>
      </Box>

      {/* Navigation Tabs */}
      <Box marginBottom={1} paddingX={2}>
        <Text color={view === 'graph' ? 'cyan' : 'gray'}>[1] Graph  </Text>
        <Text color={view === 'tree' ? 'cyan' : 'gray'}>[2] Tree  </Text>
        <Text color={view === 'matrix' ? 'cyan' : 'gray'}>[3] Matrix  </Text>
        <Text color={view === 'flow' ? 'cyan' : 'gray'}>[4] Flow  </Text>
      </Box>

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {view === 'graph' && (
          <GraphView
            schemas={schemas}
            relationships={relationships}
            selected={selectedSchema}
            highlight={highlightType}
          />
        )}
        {view === 'tree' && (
          <TreeView
            schemas={schemas}
            relationships={relationships}
            selected={selectedSchema}
          />
        )}
        {view === 'matrix' && (
          <MatrixView
            schemas={schemas}
            relationships={relationships}
          />
        )}
        {view === 'flow' && (
          <FlowView
            schemas={schemas}
            relationships={relationships}
            selected={selectedSchema}
          />
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="gray">
          [q] Quit | [1-4] Views | [↑↓/jk] Navigate | [t] Type | [r] Reset | [?] Help
        </Text>
      </Box>
    </Box>
  );
};

const GraphView: React.FC<{
  schemas: any[];
  relationships: any[];
  selected: string;
  highlight: string | null;
}> = ({ schemas, relationships, selected, highlight }) => {
  const renderNode = (schema: any, _x: number, _y: number) => {
    const isSelected = schema.name === selected;
    const isHighlighted = highlight && schema.type === highlight;

    let color = 'gray';
    if (isSelected) color = 'cyan';
    else if (isHighlighted) color = 'yellow';
    else if (schema.complexity > 10) color = 'red';
    else if (schema.complexity > 5) color = 'yellow';
    else color = 'green';

    return (
      <Text key={schema.name} color={color}>
        ┌─ {schema.name.substring(0, 12)} ─┐
      </Text>
    );
  };

  // Simplified graph layout
  const gridWidth = 4;
  // @ts-ignore: Reserved for future graph layout implementation
  const _nodes = schemas.slice(0, 20).map((schema, index) => {
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    return renderNode(schema, x, y);
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Schema Dependency Graph</Text>
      <Box flexDirection="column">
        {/* Grid layout approximation */}
        {Array.from({ length: Math.ceil(schemas.length / gridWidth) }).map((_, row) => (
          <Box key={row} marginBottom={1}>
            {schemas.slice(row * gridWidth, (row + 1) * gridWidth).map((schema) => {
              const isSelected = schema.name === selected;
              const isHighlighted = highlight && schema.type === highlight;

              let color = 'gray';
              if (isSelected) color = 'cyan';
              else if (isHighlighted) color = 'yellow';
              else if (schema.complexity > 10) color = 'red';
              else if (schema.complexity > 5) color = 'yellow';
              else color = 'green';

              return (
                <Box key={schema.name} marginRight={2} borderStyle="round" borderColor={color} paddingX={1}>
                  <Text color={color}>
                    {schema.name.substring(0, 10)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* Show connections for selected schema */}
      {selected && (
        <Box marginTop={2} flexDirection="column">
          <Text bold>Connections for {selected}:</Text>
          {relationships
            .filter((r: any) => r.from === selected || r.to === selected)
            .slice(0, 5)
            .map((rel: any, i: number) => (
              <Text key={i} color="gray">
                {rel.from === selected ? '→' : '←'} {rel.from === selected ? rel.to : rel.from} ({rel.type})
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
};

const TreeView: React.FC<{
  schemas: any[];
  relationships: any[];
  selected: string;
}> = ({ schemas, relationships, selected }) => {
  // Build tree structure
  const buildTree = (rootSchema?: string) => {
    const visited = new Set();
    const tree: any[] = [];

    const traverse = (schemaName: string, depth = 0): any => {
      if (visited.has(schemaName) || depth > 3) return null;
      visited.add(schemaName);

      const schema = schemas.find(s => s.name === schemaName);
      if (!schema) return null;

      const dependencies = relationships
        .filter((r: any) => r.from === schemaName)
        .map((r: any) => traverse(r.to, depth + 1))
        .filter(Boolean);

      return {
        schema,
        dependencies,
        depth
      };
    };

    if (rootSchema) {
      const root = traverse(rootSchema);
      if (root) tree.push(root);
    } else {
      // Find root schemas (no incoming dependencies)
      const rootSchemas = schemas.filter(s =>
        !relationships.some((r: any) => r.to === s.name)
      );

      rootSchemas.slice(0, 5).forEach(schema => {
        const root = traverse(schema.name);
        if (root) tree.push(root);
      });
    }

    return tree;
  };

  const renderTreeNode = (node: any): React.ReactNode => {
    const indent = '  '.repeat(node.depth);
    const prefix = node.depth === 0 ? '█' : node.depth === 1 ? '├─' : '└─';
    const isSelected = node.schema.name === selected;

    return (
      <Box key={node.schema.name + node.depth} flexDirection="column">
        <Text color={isSelected ? 'cyan' : 'white'}>
          {indent}{prefix} {node.schema.name} ({node.schema.type})
        </Text>
        {node.dependencies.map((dep: any) => renderTreeNode(dep))}
      </Box>
    );
  };

  const tree = buildTree(selected);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Schema Dependency Tree</Text>
      {tree.length === 0 ? (
        <Text color="gray">No schemas to display. Select a schema to see its tree.</Text>
      ) : (
        tree.map(renderTreeNode)
      )}
    </Box>
  );
};

const MatrixView: React.FC<{
  schemas: any[];
  relationships: any[];
}> = ({ schemas, relationships }) => {
  // Build dependency matrix
  const matrix = schemas.slice(0, 10).map(fromSchema =>
    schemas.slice(0, 10).map(toSchema => {
      const rel = relationships.find((r: any) =>
        r.from === fromSchema.name && r.to === toSchema.name
      );
      return rel ? rel.type.charAt(0).toUpperCase() : ' ';
    })
  );

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Dependency Matrix</Text>

      {/* Header row */}
      <Box>
        <Text>           </Text>
        {schemas.slice(0, 10).map((schema, i) => (
          <Text key={i} color="gray">{schema.name.substring(0, 3)} </Text>
        ))}
      </Box>

      {/* Matrix rows */}
      {schemas.slice(0, 10).map((schema, i) => (
        <Box key={i}>
          <Text color="gray">{schema.name.substring(0, 10).padEnd(10)}</Text>
          {matrix[i]?.map((cell, j) => (
            <Text key={j} color={cell !== ' ' ? 'green' : 'gray'}>
              {cell}
            </Text>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray">
          Legend: E=extends, R=references, U=uses, I=imports
        </Text>
      </Box>
    </Box>
  );
};

const FlowView: React.FC<{
  schemas: any[];
  relationships: any[];
  selected: string;
}> = ({ schemas, relationships, selected }) => {
  // Create flow diagram for selected schema
  const selectedSchema = schemas.find(s => s.name === selected);

  if (!selectedSchema) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Schema Flow</Text>
        <Text color="gray">Select a schema to see its data flow</Text>
      </Box>
    );
  }

  const incoming = relationships.filter((r: any) => r.to === selected);
  const outgoing = relationships.filter((r: any) => r.from === selected);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan" marginBottom={1}>Data Flow for {selected}</Text>

      {/* Incoming */}
      {incoming.length > 0 && (
        <Box marginBottom={2} flexDirection="column">
          <Text bold color="green">Incoming:</Text>
          {incoming.map((rel: any, i: number) => (
            <Text key={i} color="gray">
              {rel.from} ──({rel.type})──→ {selected}
            </Text>
          ))}
        </Box>
      )}

      {/* Current schema */}
      <Box marginBottom={2} justifyContent="center">
        <Box borderStyle="double" borderColor="cyan" paddingX={2}>
          <Text bold color="cyan">{selected}</Text>
        </Box>
      </Box>

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="yellow">Outgoing:</Text>
          {outgoing.map((rel: any, i: number) => (
            <Text key={i} color="gray">
              {selected} ──({rel.type})──→ {rel.to}
            </Text>
          ))}
        </Box>
      )}

      {incoming.length === 0 && outgoing.length === 0 && (
        <Text color="gray">No connections found for this schema.</Text>
      )}
    </Box>
  );
};

const HelpView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useInput((input: string) => {
    if (input === '?' || input === 'q') {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan" marginBottom={1}>Schema Map Help</Text>

      <Text bold marginBottom={1}>Views:</Text>
      <Text>[1] Graph   - Visual network of schema connections</Text>
      <Text>[2] Tree    - Hierarchical dependency tree</Text>
      <Text>[3] Matrix  - Dependency matrix view</Text>
      <Text>[4] Flow    - Data flow for selected schema</Text>

      <Text bold marginTop={1} marginBottom={1}>Navigation:</Text>
      <Text>[↑↓] or [jk] - Navigate schemas</Text>
      <Text>[Enter]      - Select/view details</Text>
      <Text>[t]          - Cycle highlight by type</Text>
      <Text>[r]          - Reset selection/filters</Text>

      <Text bold marginTop={1} marginBottom={1}>Legend:</Text>
      <Text color="green">Green   - Simple schemas</Text>
      <Text color="yellow">Yellow  - Medium complexity</Text>
      <Text color="red">Red     - High complexity</Text>
      <Text color="cyan">Cyan    - Selected schema</Text>

      <Text marginTop={2} color="gray">Press [?] or [q] to close help</Text>
    </Box>
  );
};

export class SchemaMapUI {
  private relationshipMap: any;
  private focusSchema?: string;

  constructor(relationshipMap: any, focusSchema?: string) {
    this.relationshipMap = relationshipMap;
    if (focusSchema !== undefined) {
      this.focusSchema = focusSchema;
    }
  }

  async start(): Promise<void> {
    const props: SchemaMapUIProps = {
      relationshipMap: this.relationshipMap
    };
    if (this.focusSchema !== undefined) {
      props.focusSchema = this.focusSchema;
    }

    // @ts-ignore - Ink type compatibility
    const app = render(<SchemaMap {...props} />);
    // @ts-ignore - waitUntilExit method availability
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore - waitUntilExit method call
      await app.waitUntilExit();
    }
  }
}