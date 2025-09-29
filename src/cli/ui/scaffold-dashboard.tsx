/**
 * @fileoverview Interactive TUI dashboard for TypeScript to Zod scaffolding
 * @module ScaffoldDashboard
 */

import React, { useState, useEffect } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput } = require('ink');
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { ScaffoldEngine, GeneratedSchema, PatternDetector } from '../../core/scaffold-engine';
import * as path from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

interface ScaffoldDashboardProps {
  engine: ScaffoldEngine;
  inputFile: string;
  outputFile?: string;
  watchMode?: boolean;
}

interface ScaffoldState {
  schemas: Map<string, GeneratedSchema>;
  selectedSchema: string | null;
  selectedIndex: number;
  view: 'overview' | 'preview' | 'patterns' | 'diff';
  filter: 'all' | 'interface' | 'type' | 'enum' | 'class';
  showHelp: boolean;
  isProcessing: boolean;
  lastUpdate: Date | null;
  savedCount: number;
  editMode: boolean;
  showPatterns: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'conflict';
  originalContent: string;
  generatedContent: string;
  detectedPatterns: Array<{ name: string; property: string; pattern: string }>;
}

const ScaffoldDashboard: React.FC<ScaffoldDashboardProps> = ({
  engine,
  inputFile,
  outputFile,
  watchMode
}) => {
  const [state, setState] = useState<ScaffoldState>({
    schemas: new Map(),
    selectedSchema: null,
    selectedIndex: 0,
    view: 'overview',
    filter: 'all',
    showHelp: false,
    isProcessing: false,
    lastUpdate: null,
    savedCount: 0,
    editMode: false,
    showPatterns: true,
    syncStatus: 'idle',
    originalContent: '',
    generatedContent: '',
    detectedPatterns: []
  });

  const { exit } = useApp();

  useInput((input: string, key: any) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }

    // View switching
    if (input === '1') setState(s => ({ ...s, view: 'overview' }));
    if (input === '2') setState(s => ({ ...s, view: 'preview' }));
    if (input === '3') setState(s => ({ ...s, view: 'patterns' }));
    if (input === '4') setState(s => ({ ...s, view: 'diff' }));

    // Filter switching
    if (input === 'a') setState(s => ({ ...s, filter: 'all' }));
    if (input === 'i') setState(s => ({ ...s, filter: 'interface' }));
    if (input === 't') setState(s => ({ ...s, filter: 'type' }));
    if (input === 'e') setState(s => ({ ...s, filter: 'enum' }));
    if (input === 'c') setState(s => ({ ...s, filter: 'class' }));

    // Navigation
    if (key.upArrow || input === 'k') {
      setState(s => {
        const schemas = Array.from(s.schemas.keys());
        const newIndex = Math.max(0, s.selectedIndex - 1);
        return {
          ...s,
          selectedIndex: newIndex,
          selectedSchema: schemas[newIndex] || null
        };
      });
    }
    if (key.downArrow || input === 'j') {
      setState(s => {
        const schemas = Array.from(s.schemas.keys());
        const newIndex = Math.min(schemas.length - 1, s.selectedIndex + 1);
        return {
          ...s,
          selectedIndex: newIndex,
          selectedSchema: schemas[newIndex] || null
        };
      });
    }

    // Actions
    if (input === 's' || input === 'S') {
      saveSchemas();
    }
    if (input === 'r') {
      processFile();
    }
    if (input === 'p') {
      setState(s => ({ ...s, showPatterns: !s.showPatterns }));
    }
    if (input === '?') {
      setState(s => ({ ...s, showHelp: !s.showHelp }));
    }
    if (key.return && state.selectedSchema) {
      setState(s => ({ ...s, view: 'preview' }));
    }
  });

  const processFile = async () => {
    setState(s => ({ ...s, isProcessing: true }));

    try {
      const schemas = await engine.scaffoldFile(inputFile);
      const patterns = detectAllPatterns(schemas);

      // Read original file content
      const originalContent = readFileSync(inputFile, 'utf-8');

      // Generate output content
      const imports = await engine.generateImports(schemas);
      const schemaCode = Array.from(schemas.values())
        .map(s => s.schema)
        .join('\n\n');
      const generatedContent = imports + schemaCode;

      setState(s => ({
        ...s,
        schemas,
        isProcessing: false,
        lastUpdate: new Date(),
        originalContent,
        generatedContent,
        detectedPatterns: patterns,
        selectedSchema: Array.from(schemas.keys())[0] || null,
        selectedIndex: 0
      }));
    } catch (error) {
      setState(s => ({ ...s, isProcessing: false }));
      console.error('Error processing file:', error);
    }
  };

  const saveSchemas = async () => {
    if (state.schemas.size === 0) return;

    const output = outputFile || inputFile.replace(/\.ts$/, '.schema.ts');

    try {
      // Generate imports
      const imports = await engine.generateImports(state.schemas);

      // Generate all schemas
      const schemaCode = Array.from(state.schemas.values())
        .map(s => {
          let code = '';
          if (s.jsDoc) {
            code += `/**\n * ${s.jsDoc}\n */\n`;
          }
          code += s.schema;
          return code;
        })
        .join('\n\n');

      const fullContent = imports + schemaCode;

      writeFileSync(output, fullContent, 'utf-8');

      setState(s => ({
        ...s,
        savedCount: s.savedCount + 1,
        syncStatus: 'synced'
      }));
    } catch (error) {
      console.error('Error saving schemas:', error);
      setState(s => ({ ...s, syncStatus: 'conflict' }));
    }
  };

  const detectAllPatterns = (schemas: Map<string, GeneratedSchema>) => {
    const patterns: Array<{ name: string; property: string; pattern: string }> = [];

    for (const [name, schema] of schemas) {
      // Parse schema code to find patterns
      const patternMatches = schema.schema.matchAll(/(\w+):\s*z\.\w+\(\)([^,\n]*)/g);
      for (const match of patternMatches) {
        const property = match[1];
        const refinements = match[2];
        if (refinements && refinements.trim()) {
          patterns.push({
            name,
            property,
            pattern: refinements.trim()
          });
        }
      }
    }

    return patterns;
  };

  // Initial processing
  useEffect(() => {
    processFile();
  }, []);

  // Watch mode
  useEffect(() => {
    if (!watchMode) return;

    const fs = require('fs');
    const watcher = fs.watch(inputFile, () => {
      processFile();
    });

    return () => watcher.close();
  }, [watchMode]);

  if (state.showHelp) {
    return <HelpView onClose={() => setState(s => ({ ...s, showHelp: false }))} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="magenta" paddingX={1}>
        <Gradient name="teen">
          <BigText text="SCAFFOLD" font="simple" />
        </Gradient>
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginBottom={1}>
        <Text color={state.isProcessing ? 'yellow' : 'green'}>
          {state.isProcessing ? <Spinner type="dots" /> : '●'} {state.isProcessing ? 'Processing...' : 'Ready'}
        </Text>
        <Text color="gray">
          {state.schemas.size} schemas | {state.detectedPatterns.length} patterns | Saved: {state.savedCount}
        </Text>
        <Text color={getSyncStatusColor(state.syncStatus)}>
          {getSyncStatusIcon(state.syncStatus)} {state.syncStatus}
        </Text>
      </Box>

      {/* View Tabs */}
      <Box marginBottom={1} paddingX={2}>
        <Text color={state.view === 'overview' ? 'magenta' : 'gray'}>[1] Overview  </Text>
        <Text color={state.view === 'preview' ? 'magenta' : 'gray'}>[2] Preview  </Text>
        <Text color={state.view === 'patterns' ? 'magenta' : 'gray'}>[3] Patterns  </Text>
        <Text color={state.view === 'diff' ? 'magenta' : 'gray'}>[4] Diff  </Text>
      </Box>

      {/* Filter Bar */}
      <Box marginBottom={1} paddingX={2}>
        <Text color="gray">Filter: </Text>
        <Text color={state.filter === 'all' ? 'white' : 'gray'}>[a]ll  </Text>
        <Text color={state.filter === 'interface' ? 'cyan' : 'gray'}>[i]nterface  </Text>
        <Text color={state.filter === 'type' ? 'yellow' : 'gray'}>[t]ype  </Text>
        <Text color={state.filter === 'enum' ? 'green' : 'gray'}>[e]num  </Text>
        <Text color={state.filter === 'class' ? 'blue' : 'gray'}>[c]lass  </Text>
      </Box>

      {/* Main Content */}
      <Box flexDirection="column" flexGrow={1} paddingX={2}>
        {state.view === 'overview' && (
          <OverviewView
            schemas={state.schemas}
            filter={state.filter}
            selectedSchema={state.selectedSchema}
            selectedIndex={state.selectedIndex}
            patterns={state.detectedPatterns}
          />
        )}
        {state.view === 'preview' && (
          <PreviewView
            schemas={state.schemas}
            selectedSchema={state.selectedSchema}
            showPatterns={state.showPatterns}
          />
        )}
        {state.view === 'patterns' && (
          <PatternsView patterns={state.detectedPatterns} />
        )}
        {state.view === 'diff' && (
          <DiffView
            original={state.originalContent}
            generated={state.generatedContent}
          />
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="gray">
          [q] Quit | [1-4] Views | [↑↓] Navigate | [s] Save | [r] Rescan | [p] Patterns | [?] Help
        </Text>
      </Box>
    </Box>
  );
};

const OverviewView: React.FC<{
  schemas: Map<string, GeneratedSchema>;
  filter: string;
  selectedSchema: string | null;
  selectedIndex: number;
  patterns: Array<{ name: string; property: string; pattern: string }>;
}> = ({ schemas, filter, selectedSchema, selectedIndex, patterns }) => {
  const filteredSchemas = Array.from(schemas.entries()).filter(([_, schema]) => {
    if (filter === 'all') return true;
    return schema.sourceType === filter;
  });

  const stats = {
    interfaces: Array.from(schemas.values()).filter(s => s.sourceType === 'interface').length,
    types: Array.from(schemas.values()).filter(s => s.sourceType === 'type').length,
    enums: Array.from(schemas.values()).filter(s => s.sourceType === 'enum').length,
    classes: Array.from(schemas.values()).filter(s => s.sourceType === 'class').length,
    withGenerics: Array.from(schemas.values()).filter(s => s.hasGenerics).length,
    withPatterns: patterns.length
  };

  return (
    <Box flexDirection="column">
      <Text bold color="magenta" marginBottom={1}>Schema Overview</Text>

      {/* Stats Cards */}
      <Box marginBottom={2}>
        <MetricCard label="Interfaces" value={stats.interfaces} color="cyan" />
        <MetricCard label="Types" value={stats.types} color="yellow" />
        <MetricCard label="Enums" value={stats.enums} color="green" />
        <MetricCard label="Classes" value={stats.classes} color="blue" />
      </Box>

      {/* Feature Stats */}
      <Box marginBottom={2}>
        <Box borderStyle="single" padding={1} marginRight={2}>
          <Text>🧬 Generics: {stats.withGenerics}</Text>
        </Box>
        <Box borderStyle="single" padding={1}>
          <Text>🎯 Patterns: {stats.withPatterns}</Text>
        </Box>
      </Box>

      {/* Schema List */}
      <Box flexDirection="column">
        <Text bold marginBottom={1}>Schemas ({filteredSchemas.length})</Text>
        {filteredSchemas.length === 0 ? (
          <Text color="gray">No schemas found</Text>
        ) : (
          filteredSchemas.map(([name, schema], i) => {
            const isSelected = i === selectedIndex;
            const typeColor = getTypeColor(schema.sourceType);
            const typeIcon = getTypeIcon(schema.sourceType);

            return (
              <Box key={name}>
                <Text color={isSelected ? 'white' : 'gray'}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text color={typeColor}> {typeIcon} </Text>
                <Text color={isSelected ? 'white' : typeColor}>
                  {name}
                </Text>
                {schema.hasGenerics && <Text color="magenta"> &lt;T&gt;</Text>}
                {schema.refinements.length > 0 && (
                  <Text color="green"> ✓ {schema.refinements.length} patterns</Text>
                )}
                {schema.jsDoc && <Text color="gray"> // {schema.jsDoc.substring(0, 30)}...</Text>}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};

const PreviewView: React.FC<{
  schemas: Map<string, GeneratedSchema>;
  selectedSchema: string | null;
  showPatterns: boolean;
}> = ({ schemas, selectedSchema, showPatterns }) => {
  if (!selectedSchema) {
    return <Text color="gray">Select a schema to preview</Text>;
  }

  const schema = schemas.get(selectedSchema);
  if (!schema) {
    return <Text color="red">Schema not found</Text>;
  }

  // Format code with syntax highlighting (simplified)
  const formatCode = (code: string) => {
    const lines = code.split('\n');
    return lines.map((line, i) => {
      const formatted = line
        .replace(/\b(export|const|type|enum|class|interface)\b/g, '\x1b[35m$1\x1b[0m') // Keywords in magenta
        .replace(/\b(z\.\w+)/g, '\x1b[36m$1\x1b[0m') // Zod methods in cyan
        .replace(/(['"])(.*?)\1/g, '\x1b[32m$1$2$1\x1b[0m') // Strings in green
        .replace(/\/\/.*/g, '\x1b[90m$&\x1b[0m'); // Comments in gray

      return (
        <Text key={i}>
          <Text color="gray">{String(i + 1).padStart(3, ' ')} │ </Text>
          <Text>{formatted}</Text>
        </Text>
      );
    });
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="magenta">Preview: </Text>
        <Text color="cyan">{selectedSchema}</Text>
        <Text color="gray"> ({schema.sourceType})</Text>
      </Box>

      {/* Schema Info */}
      <Box marginBottom={1}>
        {schema.jsDoc && (
          <Box marginBottom={1}>
            <Text color="gray">📝 {schema.jsDoc}</Text>
          </Box>
        )}
        {schema.dependencies.size > 0 && (
          <Box marginBottom={1}>
            <Text color="yellow">
              🔗 Dependencies: {Array.from(schema.dependencies).join(', ')}
            </Text>
          </Box>
        )}
        {showPatterns && schema.refinements.length > 0 && (
          <Box marginBottom={1}>
            <Text color="green">
              🎯 Patterns detected: {schema.refinements.length}
            </Text>
          </Box>
        )}
      </Box>

      {/* Code Preview */}
      <Box borderStyle="single" borderColor="cyan" padding={1}>
        <Box flexDirection="column">
          {formatCode(schema.schema)}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Press [s] to save this schema</Text>
      </Box>
    </Box>
  );
};

const PatternsView: React.FC<{
  patterns: Array<{ name: string; property: string; pattern: string }>;
}> = ({ patterns }) => {
  const patternGroups = patterns.reduce((acc, p) => {
    const key = p.pattern;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {} as Record<string, typeof patterns>);

  return (
    <Box flexDirection="column">
      <Text bold color="magenta" marginBottom={1}>Detected Patterns</Text>

      {patterns.length === 0 ? (
        <Text color="gray">No patterns detected</Text>
      ) : (
        <>
          <Box marginBottom={2}>
            <Text>Found {patterns.length} pattern applications across {Object.keys(patternGroups).length} unique patterns</Text>
          </Box>

          {Object.entries(patternGroups).map(([pattern, instances]) => (
            <Box key={pattern} flexDirection="column" marginBottom={2}>
              <Text color="green" bold>Pattern: {pattern}</Text>
              {instances.map((instance, i) => (
                <Box key={i} paddingLeft={2}>
                  <Text color="cyan">{instance.name}</Text>
                  <Text>.</Text>
                  <Text color="yellow">{instance.property}</Text>
                </Box>
              ))}
            </Box>
          ))}

          <Box borderStyle="single" borderColor="gray" padding={1} marginTop={2}>
            <Box flexDirection="column">
              <Text bold>Pattern Examples:</Text>
              <Text color="green">• .email()</Text>
              <Text> - Email validation</Text>
              <Text color="green">• .url()</Text>
              <Text> - URL validation</Text>
              <Text color="green">• .uuid()</Text>
              <Text> - UUID format</Text>
              <Text color="green">• .min(0).max(150)</Text>
              <Text> - Age range</Text>
              <Text color="green">• .regex(/pattern/)</Text>
              <Text> - Custom patterns</Text>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

const DiffView: React.FC<{
  original: string;
  generated: string;
}> = ({ original, generated }) => {
  const originalLines = original.split('\n').slice(0, 20);
  const generatedLines = generated.split('\n').slice(0, 20);

  return (
    <Box flexDirection="row" width="100%">
      {/* Original TypeScript */}
      <Box flexDirection="column" width="50%" marginRight={1}>
        <Text bold color="cyan" marginBottom={1}>Original TypeScript</Text>
        <Box borderStyle="single" borderColor="cyan" padding={1}>
          <Box flexDirection="column">
            {originalLines.map((line, i) => (
              <Text key={i}>
                <Text color="gray">{String(i + 1).padStart(3)} │ </Text>
                <Text>{line.substring(0, 40)}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Generated Zod */}
      <Box flexDirection="column" width="50%">
        <Text bold color="magenta" marginBottom={1}>Generated Zod Schema</Text>
        <Box borderStyle="single" borderColor="magenta" padding={1}>
          <Box flexDirection="column">
            {generatedLines.map((line, i) => (
              <Text key={i}>
                <Text color="gray">{String(i + 1).padStart(3)} │ </Text>
                <Text>{line.substring(0, 40)}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
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
      <Text bold color="magenta" marginBottom={1}>Scaffold Dashboard Help</Text>

      <Text bold marginBottom={1}>Views:</Text>
      <Text>[1] Overview - List of all detected schemas</Text>
      <Text>[2] Preview  - Detailed view of selected schema</Text>
      <Text>[3] Patterns - All detected patterns and refinements</Text>
      <Text>[4] Diff     - Side-by-side comparison</Text>

      <Text bold marginTop={1} marginBottom={1}>Filters:</Text>
      <Text>[a] All       - Show all schemas</Text>
      <Text>[i] Interface - Only interfaces</Text>
      <Text>[t] Type      - Only type aliases</Text>
      <Text>[e] Enum      - Only enums</Text>
      <Text>[c] Class     - Only classes/DTOs</Text>

      <Text bold marginTop={1} marginBottom={1}>Actions:</Text>
      <Text>[s] Save      - Write schemas to file</Text>
      <Text>[r] Rescan    - Re-process input file</Text>
      <Text>[p] Patterns  - Toggle pattern display</Text>
      <Text>[↑↓/jk] Navigate - Move selection</Text>
      <Text>[Enter] View  - Open selected schema</Text>

      <Text bold marginTop={1} marginBottom={1}>Icons:</Text>
      <Text color="cyan">◆ Interface</Text>
      <Text color="yellow">● Type</Text>
      <Text color="green">▲ Enum</Text>
      <Text color="blue">■ Class</Text>

      <Text bold marginTop={1} marginBottom={1}>Pattern Detection:</Text>
      <Text>The tool automatically detects common patterns:</Text>
      <Text color="gray">• Email addresses, URLs, UUIDs</Text>
      <Text color="gray">• Age ranges, port numbers, percentages</Text>
      <Text color="gray">• Phone numbers, IP addresses</Text>
      <Text color="gray">• Usernames, passwords, slugs</Text>

      <Text marginTop={2} color="gray">Press [?] or [q] to close help</Text>
    </Box>
  );
};

// Helper Components
const MetricCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <Box
    borderStyle="round"
    borderColor={color as any}
    padding={1}
    marginRight={2}
    minWidth={12}
  >
    <Box flexDirection="column">
      <Text color="gray">{label}</Text>
      <Text color={color as any} bold>{value}</Text>
    </Box>
  </Box>
);

// Helper functions
function getTypeColor(type: string): string {
  switch (type) {
    case 'interface': return 'cyan';
    case 'type': return 'yellow';
    case 'enum': return 'green';
    case 'class': return 'blue';
    default: return 'white';
  }
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'interface': return '◆';
    case 'type': return '●';
    case 'enum': return '▲';
    case 'class': return '■';
    default: return '○';
  }
}

function getSyncStatusColor(status: string): string {
  switch (status) {
    case 'synced': return 'green';
    case 'syncing': return 'yellow';
    case 'conflict': return 'red';
    default: return 'gray';
  }
}

function getSyncStatusIcon(status: string): string {
  switch (status) {
    case 'synced': return '✓';
    case 'syncing': return '↻';
    case 'conflict': return '✗';
    default: return '○';
  }
}

// Export the dashboard class
export class ScaffoldDashboardUI {
  private engine: ScaffoldEngine;
  private inputFile: string;
  private outputFile?: string;
  private watchMode: boolean;

  constructor(engine: ScaffoldEngine, inputFile: string, outputFile?: string, watchMode = false) {
    this.engine = engine;
    this.inputFile = inputFile;
    this.outputFile = outputFile;
    this.watchMode = watchMode;
  }

  async start(): Promise<void> {
    // @ts-ignore - Ink type compatibility
    const app = render(
      <ScaffoldDashboard
        engine={this.engine}
        inputFile={this.inputFile}
        outputFile={this.outputFile}
        watchMode={this.watchMode}
      />
    );
    // @ts-ignore - waitUntilExit method availability
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore - waitUntilExit method call
      await app.waitUntilExit();
    }
  }
}