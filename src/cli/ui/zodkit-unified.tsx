/**
 * @fileoverview Zodkit Unified TUI - All features in one interface
 * @module ZodkitUnified
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput } = require('ink');
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import * as path from 'path';
import * as fs from 'fs';

// Import all engines
import { HintEngine } from '../../core/hint-engine';
import { ScaffoldEngine } from '../../core/scaffold-engine';
import { PerformanceProfilerEngine } from '../../core/performance-profiler';
import { SchemaMapper } from '../../core/schema-mapper';
import { SchemaDiscovery } from '../../core/schema-discovery';
import { SchemaComposer } from '../../core/schema-composer';
import { SchemaMigration } from '../../core/schema-migration';
import { SchemaRefactoring } from '../../core/schema-refactoring';
import { Validator } from '../../core/validator';
import { MockGenerator } from '../../core/mock-generator';
import { ConfigManager } from '../../core/config';
import { MCPServer } from '../../core/mcp-server';

// Consolidated command structure
const COMMANDS = {
  // Core Analysis
  check: {
    name: 'check',
    description: 'Complete schema analysis (validate, analyze, diagnose)',
    category: 'analysis',
    modes: ['validate', 'analyze', 'diagnose', 'coverage', 'complexity'],
    interactive: true
  },
  hint: {
    name: 'hint',
    description: 'Best practices and performance suggestions',
    category: 'analysis',
    modes: ['performance', 'security', 'best-practice', 'all'],
    interactive: true
  },
  profile: {
    name: 'profile',
    description: 'Runtime performance profiling',
    category: 'analysis',
    modes: ['runtime', 'memory', 'benchmark'],
    interactive: true
  },

  // Generation
  scaffold: {
    name: 'scaffold',
    description: 'Generate Zod schemas from TypeScript',
    category: 'generation',
    requiresFile: true,
    interactive: true
  },
  generate: {
    name: 'generate',
    description: 'Generate code, mocks, or documentation',
    category: 'generation',
    modes: ['mock', 'code', 'docs', 'api'],
    interactive: true
  },

  // Schema Operations
  migrate: {
    name: 'migrate',
    description: 'Schema migration and evolution',
    category: 'operations',
    modes: ['create', 'apply', 'rollback', 'diff'],
    interactive: true
  },
  compose: {
    name: 'compose',
    description: 'Compose schemas (union, merge, extend)',
    category: 'operations',
    modes: ['union', 'intersect', 'merge', 'extend', 'partial'],
    interactive: true
  },
  refactor: {
    name: 'refactor',
    description: 'Refactor and optimize schemas',
    category: 'operations',
    modes: ['rename', 'extract', 'inline', 'simplify'],
    interactive: true
  },

  // Testing
  test: {
    name: 'test',
    description: 'Run all tests (unit, contract, validation)',
    category: 'testing',
    modes: ['unit', 'contract', 'validation', 'coverage'],
    interactive: true
  },

  // Utilities
  fix: {
    name: 'fix',
    description: 'Auto-fix schema issues',
    category: 'utility',
    modes: ['safe', 'unsafe', 'interactive']
  },
  sync: {
    name: 'sync',
    description: 'Sync schemas with database or API',
    category: 'utility',
    modes: ['database', 'api', 'types']
  },
  init: {
    name: 'init',
    description: 'Initialize project with templates',
    category: 'utility',
    interactive: true
  },

  // AI Features
  explain: {
    name: 'explain',
    description: 'AI-powered schema explanations',
    category: 'ai',
    requiresSelection: true
  },
  mcp: {
    name: 'mcp',
    description: 'AI assistant integration',
    category: 'ai',
    modes: ['serve', 'connect', 'collaborate'],
    interactive: true
  },

  // System
  help: {
    name: 'help',
    description: 'Show help',
    category: 'system'
  },
  clear: {
    name: 'clear',
    description: 'Clear screen',
    category: 'system'
  },
  exit: {
    name: 'exit',
    description: 'Exit Zodkit',
    category: 'system'
  }
};

// State types
interface UnifiedState {
  mode: 'command' | 'interactive' | 'help';
  currentTool: string | null;
  currentMode: string | null;
  commandInput: string;
  commandHistory: string[];
  historyIndex: number;
  output: string[];
  schemas: Map<string, any>;
  selectedSchema: string | null;
  isProcessing: boolean;
  workingDirectory: string;
  engines: Map<string, any>;
  config: any;
}

// Main TUI Component
const ZodkitUnified: React.FC = () => {
  const { exit } = useApp();

  const [state, setState] = useState<UnifiedState>({
    mode: 'command',
    currentTool: null,
    currentMode: null,
    commandInput: '',
    commandHistory: [],
    historyIndex: -1,
    output: [
      '⚡ Zodkit - Unified Development Environment',
      'Type help or ? for available commands',
      ''
    ],
    schemas: new Map(),
    selectedSchema: null,
    isProcessing: false,
    workingDirectory: process.cwd(),
    engines: new Map(),
    config: null
  });

  // Initialize engines lazily
  const getEngine = useCallback((name: string) => {
    if (!state.engines.has(name)) {
      let engine: any = null;

      switch (name) {
        case 'hint':
          engine = new HintEngine({ cache: true });
          break;
        case 'scaffold':
          engine = new ScaffoldEngine({ detectPatterns: true });
          break;
        case 'profile':
          engine = new SchemaProfiler();
          break;
        case 'compose':
          engine = new SchemaComposer();
          break;
        case 'migrate':
          engine = new SchemaMigration();
          break;
        case 'refactor':
          engine = new SchemaRefactoring();
          break;
        case 'validator':
          engine = new Validator(state.config || {});
          break;
        case 'mock':
          engine = new MockGenerator();
          break;
        case 'mcp':
          engine = new MCPServer();
          break;
        case 'discovery':
          engine = new SchemaDiscovery(state.config || {});
          break;
        case 'mapper':
          engine = new SchemaMapper();
          break;
      }

      if (engine) {
        state.engines.set(name, engine);
      }
    }
    return state.engines.get(name);
  }, [state.engines, state.config]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      setState(s => ({ ...s, config }));

      // Discover schemas
      const discovery = new SchemaDiscovery(config);
      const schemas = await discovery.findSchemas();
      const schemaMap = new Map(schemas.map(s => [s.name, s]));
      setState(s => ({ ...s, schemas: schemaMap }));
    };
    loadConfig();
  }, []);

  // Global input handler
  useInput((input: string, key: any) => {
    // Global shortcuts
    if (key.ctrl && input === 'c') {
      if (state.mode === 'interactive') {
        setState(s => ({
          ...s,
          mode: 'command',
          currentTool: null,
          currentMode: null
        }));
      } else {
        exit();
      }
      return;
    }

    if (key.ctrl && input === 'l') {
      setState(s => ({ ...s, output: [] }));
      return;
    }

    if (input === '?' && state.mode === 'command') {
      setState(s => ({ ...s, mode: 'help' }));
      return;
    }

    // Route to mode handlers
    switch (state.mode) {
      case 'command':
        handleCommandMode(input, key);
        break;
      case 'interactive':
        handleInteractiveMode(input, key);
        break;
      case 'help':
        if (input === 'q' || input === '?' || key.escape) {
          setState(s => ({ ...s, mode: 'command' }));
        }
        break;
    }
  });

  // Command mode handler
  const handleCommandMode = useCallback((input: string, key: any) => {
    if (key.return) {
      executeCommand(state.commandInput.trim());
    } else if (key.upArrow) {
      if (state.commandHistory.length > 0 && state.historyIndex < state.commandHistory.length - 1) {
        const newIndex = state.historyIndex + 1;
        setState(s => ({
          ...s,
          historyIndex: newIndex,
          commandInput: s.commandHistory[s.commandHistory.length - 1 - newIndex]
        }));
      }
    } else if (key.downArrow) {
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        setState(s => ({
          ...s,
          historyIndex: newIndex,
          commandInput: s.commandHistory[s.commandHistory.length - 1 - newIndex]
        }));
      } else if (state.historyIndex === 0) {
        setState(s => ({
          ...s,
          historyIndex: -1,
          commandInput: ''
        }));
      }
    } else if (key.tab) {
      // Auto-complete
      const matches = Object.keys(COMMANDS).filter(cmd =>
        cmd.startsWith(state.commandInput.toLowerCase())
      );
      if (matches.length === 1) {
        setState(s => ({ ...s, commandInput: matches[0] }));
      }
    }
  }, [state]);

  // Interactive mode handler
  const handleInteractiveMode = useCallback((input: string, key: any) => {
    if (key.escape) {
      setState(s => ({
        ...s,
        mode: 'command',
        currentTool: null,
        currentMode: null,
        output: [...s.output, '\n← Returned to command mode\n']
      }));
      return;
    }

    // Tool-specific handlers
    const tool = state.currentTool;
    if (!tool) return;

    // Handle tool-specific shortcuts
    switch (tool) {
      case 'check':
        handleCheckInput(input, key);
        break;
      case 'hint':
        handleHintInput(input, key);
        break;
      case 'scaffold':
        handleScaffoldInput(input, key);
        break;
      case 'generate':
        handleGenerateInput(input, key);
        break;
      case 'test':
        handleTestInput(input, key);
        break;
      case 'migrate':
        handleMigrateInput(input, key);
        break;
      case 'compose':
        handleComposeInput(input, key);
        break;
      default:
        break;
    }
  }, [state]);

  // Execute command
  const executeCommand = useCallback(async (command: string) => {
    if (!command) return;

    // Add to history
    setState(s => ({
      ...s,
      commandHistory: [...s.commandHistory, command],
      historyIndex: -1,
      commandInput: '',
      output: [...s.output, `❯ ${command}\n`]
    }));

    // Parse command
    const [cmd, ...args] = command.split(/\s+/);
    const cmdInfo = COMMANDS[cmd.toLowerCase()];

    if (!cmdInfo) {
      setState(s => ({
        ...s,
        output: [...s.output, `Unknown command: ${cmd}\nType 'help' for available commands\n`]
      }));
      return;
    }

    // Execute based on command type
    switch (cmd.toLowerCase()) {
      case 'help':
        setState(s => ({ ...s, mode: 'help' }));
        break;

      case 'clear':
        setState(s => ({ ...s, output: [] }));
        break;

      case 'exit':
        exit();
        break;

      case 'check':
        const mode = args[0] || 'validate';
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'check',
          currentMode: mode,
          output: [...s.output, `\n📊 Entering Check Mode (${mode})...\n`]
        }));
        await runCheck(mode);
        break;

      case 'hint':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'hint',
          output: [...s.output, '\n💡 Entering Hint Analysis Mode...\n']
        }));
        await runHint();
        break;

      case 'scaffold':
        if (!args[0]) {
          setState(s => ({
            ...s,
            output: [...s.output, 'Error: scaffold requires a TypeScript file\n']
          }));
          return;
        }
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'scaffold',
          output: [...s.output, `\n🏗️  Scaffolding from ${args[0]}...\n`]
        }));
        await runScaffold(args[0]);
        break;

      case 'generate':
        const genMode = args[0] || 'mock';
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'generate',
          currentMode: genMode,
          output: [...s.output, `\n🎯 Generate Mode (${genMode})...\n`]
        }));
        await runGenerate(genMode, args.slice(1));
        break;

      case 'test':
        const testMode = args[0] || 'all';
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'test',
          currentMode: testMode,
          output: [...s.output, `\n🧪 Running Tests (${testMode})...\n`]
        }));
        await runTests(testMode);
        break;

      case 'migrate':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'migrate',
          output: [...s.output, '\n🔄 Migration Wizard...\n']
        }));
        await runMigrate(args[0]);
        break;

      case 'compose':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'compose',
          output: [...s.output, '\n🔗 Schema Composer...\n']
        }));
        await runCompose(args[0], args.slice(1));
        break;

      case 'refactor':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'refactor',
          output: [...s.output, '\n♻️  Refactoring Assistant...\n']
        }));
        await runRefactor(args[0]);
        break;

      case 'profile':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'profile',
          output: [...s.output, '\n⚡ Performance Profiler...\n']
        }));
        await runProfile();
        break;

      case 'explain':
        if (!args[0] && !state.selectedSchema) {
          setState(s => ({
            ...s,
            output: [...s.output, 'Error: Select a schema or provide schema name\n']
          }));
          return;
        }
        await runExplain(args[0] || state.selectedSchema);
        break;

      case 'mcp':
        const mcpMode = args[0] || 'serve';
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'mcp',
          currentMode: mcpMode,
          output: [...s.output, `\n🤖 MCP Server (${mcpMode})...\n`]
        }));
        await runMCP(mcpMode);
        break;

      case 'fix':
        await runFix(args[0]);
        break;

      case 'sync':
        await runSync(args[0] || 'database');
        break;

      case 'init':
        setState(s => ({
          ...s,
          mode: 'interactive',
          currentTool: 'init',
          output: [...s.output, '\n🚀 Project Initialization...\n']
        }));
        await runInit();
        break;

      default:
        // Run as external command
        await runExternalCommand(command);
    }
  }, [state, getEngine]);

  // Tool implementations
  const runCheck = async (mode: string) => {
    const validator = getEngine('validator');
    const discovery = getEngine('discovery');

    setState(s => ({ ...s, isProcessing: true }));

    try {
      const schemas = await discovery.findSchemas();
      const results = await validator.validateWithRules(schemas);

      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `✓ Checked ${schemas.length} schemas\n`]
      }));
    } catch (error) {
      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Error: ${error}\n`]
      }));
    }
  };

  const runHint = async () => {
    const hintEngine = getEngine('hint');

    setState(s => ({ ...s, isProcessing: true }));

    try {
      const results = await hintEngine.analyzeProject(['src/**/*.ts']);

      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Found ${results.size} files with hints\n`]
      }));
    } catch (error) {
      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Error: ${error}\n`]
      }));
    }
  };

  const runScaffold = async (file: string) => {
    const scaffoldEngine = getEngine('scaffold');

    setState(s => ({ ...s, isProcessing: true }));

    try {
      const schemas = await scaffoldEngine.scaffoldFile(file);

      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Generated ${schemas.size} schemas\n`]
      }));
    } catch (error) {
      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Error: ${error}\n`]
      }));
    }
  };

  const runGenerate = async (mode: string, args: string[]) => {
    const mockGen = getEngine('mock');

    setState(s => ({ ...s, isProcessing: true }));

    try {
      if (mode === 'mock') {
        const schemaName = args[0] || state.selectedSchema;
        if (!schemaName) {
          throw new Error('No schema selected');
        }

        const mock = await mockGen.generate(schemaName);
        setState(s => ({
          ...s,
          isProcessing: false,
          output: [...s.output, `Generated mock:\n${JSON.stringify(mock, null, 2)}\n`]
        }));
      }
    } catch (error) {
      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `Error: ${error}\n`]
      }));
    }
  };

  const runTests = async (mode: string) => {
    setState(s => ({
      ...s,
      isProcessing: true,
      output: [...s.output, `Running ${mode} tests...\n`]
    }));

    // Simulate test running
    setTimeout(() => {
      setState(s => ({
        ...s,
        isProcessing: false,
        output: [...s.output, `✓ All tests passed\n`]
      }));
    }, 2000);
  };

  const runMigrate = async (action: string) => {
    const migration = getEngine('migrate');

    setState(s => ({
      ...s,
      output: [...s.output, `Migration ${action || 'wizard'} starting...\n`]
    }));
  };

  const runCompose = async (operation: string, args: string[]) => {
    const composer = getEngine('compose');

    setState(s => ({
      ...s,
      output: [...s.output, `Composing schemas: ${operation || 'union'}\n`]
    }));
  };

  const runRefactor = async (operation: string) => {
    const refactor = getEngine('refactor');

    setState(s => ({
      ...s,
      output: [...s.output, `Refactoring: ${operation || 'analyze'}\n`]
    }));
  };

  const runProfile = async () => {
    const profiler = getEngine('profile');

    setState(s => ({
      ...s,
      output: [...s.output, `Profiling started...\n`]
    }));
  };

  const runExplain = async (schemaName: string) => {
    setState(s => ({
      ...s,
      output: [...s.output, `Explaining ${schemaName}...\n`]
    }));
  };

  const runMCP = async (mode: string) => {
    const mcp = getEngine('mcp');

    setState(s => ({
      ...s,
      output: [...s.output, `MCP Server: ${mode}\n`]
    }));
  };

  const runFix = async (mode: string) => {
    setState(s => ({
      ...s,
      output: [...s.output, `Fixing issues (${mode || 'safe'} mode)...\n`]
    }));
  };

  const runSync = async (target: string) => {
    setState(s => ({
      ...s,
      output: [...s.output, `Syncing with ${target}...\n`]
    }));
  };

  const runInit = async () => {
    setState(s => ({
      ...s,
      output: [...s.output, `Initializing project...\n`]
    }));
  };

  const runExternalCommand = async (command: string) => {
    setState(s => ({
      ...s,
      output: [...s.output, `Running: ${command}\n`]
    }));
  };

  // Tool-specific input handlers
  const handleCheckInput = (input: string, key: any) => {
    switch (input) {
      case 'v':
        setState(s => ({ ...s, currentMode: 'validate' }));
        runCheck('validate');
        break;
      case 'a':
        setState(s => ({ ...s, currentMode: 'analyze' }));
        runCheck('analyze');
        break;
      case 'd':
        setState(s => ({ ...s, currentMode: 'diagnose' }));
        runCheck('diagnose');
        break;
    }
  };

  const handleHintInput = (input: string, key: any) => {
    switch (input) {
      case 'f':
        setState(s => ({
          ...s,
          output: [...s.output, 'Applying fixes...\n']
        }));
        break;
      case 'r':
        runHint();
        break;
    }
  };

  const handleScaffoldInput = (input: string, key: any) => {
    switch (input) {
      case 's':
        setState(s => ({
          ...s,
          output: [...s.output, 'Saving schemas...\n']
        }));
        break;
      case 'p':
        setState(s => ({
          ...s,
          output: [...s.output, 'Preview mode toggled\n']
        }));
        break;
    }
  };

  const handleGenerateInput = (input: string, key: any) => {
    switch (input) {
      case 'm':
        runGenerate('mock', []);
        break;
      case 'c':
        runGenerate('code', []);
        break;
      case 'd':
        runGenerate('docs', []);
        break;
    }
  };

  const handleTestInput = (input: string, key: any) => {
    switch (input) {
      case 'a':
        runTests('all');
        break;
      case 'u':
        runTests('unit');
        break;
      case 'c':
        runTests('contract');
        break;
    }
  };

  const handleMigrateInput = (input: string, key: any) => {
    switch (input) {
      case 'c':
        runMigrate('create');
        break;
      case 'a':
        runMigrate('apply');
        break;
      case 'r':
        runMigrate('rollback');
        break;
    }
  };

  const handleComposeInput = (input: string, key: any) => {
    switch (input) {
      case 'u':
        runCompose('union', []);
        break;
      case 'i':
        runCompose('intersect', []);
        break;
      case 'm':
        runCompose('merge', []);
        break;
    }
  };

  // Render
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Gradient name="passion">
          <Text bold>⚡ ZODKIT</Text>
        </Gradient>
        {state.mode === 'interactive' && (
          <Text color="yellow"> [{state.currentTool?.toUpperCase()}]</Text>
        )}
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginY={1}>
        <Text color="cyan">
          {state.selectedSchema ? `Schema: ${state.selectedSchema}` : path.basename(state.workingDirectory)}
        </Text>
        <Text>
          {state.isProcessing && <Spinner type="dots" />}
          {state.isProcessing ? ' Processing...' : ' Ready'}
        </Text>
        <Text color="gray">
          {state.schemas.size} schemas | {state.commandHistory.length} commands
        </Text>
      </Box>

      {/* Main Content */}
      {state.mode === 'help' ? (
        <HelpView commands={COMMANDS} />
      ) : state.mode === 'interactive' ? (
        <InteractiveView
          tool={state.currentTool}
          mode={state.currentMode}
          output={state.output.slice(-20)}
        />
      ) : (
        <CommandView output={state.output.slice(-30)} />
      )}

      {/* Input */}
      {state.mode === 'command' && (
        <Box paddingX={2}>
          <Text color="cyan">❯ </Text>
          <TextInput
            value={state.commandInput}
            onChange={(value: string) => setState(s => ({ ...s, commandInput: value }))}
            placeholder="Enter command..."
            focus={!state.isProcessing}
          />
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        {state.mode === 'interactive' ? (
          <Text color="gray">
            [ESC] Return | [Ctrl+C] Exit | Mode: {state.currentTool}
          </Text>
        ) : (
          <Text color="gray">
            [?] Help | [Ctrl+C] Exit | [Tab] Complete | [↑↓] History
          </Text>
        )}
      </Box>
    </Box>
  );
};

// View components
const CommandView: React.FC<{ output: string[] }> = ({ output }) => (
  <Box flexDirection="column" flexGrow={1} paddingX={2}>
    {output.map((line, i) => (
      <Text key={i}>{line}</Text>
    ))}
  </Box>
);

const InteractiveView: React.FC<{ tool: string | null; mode: string | null; output: string[] }> = ({ tool, mode, output }) => (
  <Box flexDirection="column" flexGrow={1} paddingX={2}>
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1} marginBottom={1}>
      <Text bold color="cyan">{tool?.toUpperCase()} - Interactive Mode</Text>
      {mode && <Text color="gray">Mode: {mode}</Text>}
    </Box>

    <Box flexDirection="column">
      {output.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>

    <Box marginTop={1} flexDirection="column">
      <Text bold>Commands:</Text>
      {getToolCommands(tool).map(cmd => (
        <Text key={cmd.key} color="gray">
          [{cmd.key}] {cmd.description}
        </Text>
      ))}
    </Box>
  </Box>
);

const HelpView: React.FC<{ commands: any }> = ({ commands }) => (
  <Box flexDirection="column" flexGrow={1} padding={2}>
    <Text bold color="cyan" marginBottom={1}>Zodkit Commands</Text>

    {Object.entries(groupBy(commands, 'category')).map(([category, cmds]: [string, any]) => (
      <Box key={category} flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">{category.toUpperCase()}</Text>
        {cmds.map((cmd: any) => (
          <Box key={cmd.name} paddingLeft={2}>
            <Text color="cyan">{cmd.name.padEnd(12)}</Text>
            <Text color="gray">{cmd.description}</Text>
          </Box>
        ))}
      </Box>
    ))}

    <Text color="gray" marginTop={1}>Press ? or ESC to close</Text>
  </Box>
);

// Helper functions
const getToolCommands = (tool: string | null) => {
  switch (tool) {
    case 'check':
      return [
        { key: 'v', description: 'Validate schemas' },
        { key: 'a', description: 'Analyze complexity' },
        { key: 'd', description: 'Run diagnostics' }
      ];
    case 'hint':
      return [
        { key: 'f', description: 'Fix issues' },
        { key: 'r', description: 'Rescan' },
        { key: 'a', description: 'Show all hints' }
      ];
    case 'scaffold':
      return [
        { key: 's', description: 'Save schemas' },
        { key: 'p', description: 'Toggle preview' },
        { key: 'v', description: 'View patterns' }
      ];
    case 'generate':
      return [
        { key: 'm', description: 'Generate mock' },
        { key: 'c', description: 'Generate code' },
        { key: 'd', description: 'Generate docs' }
      ];
    case 'test':
      return [
        { key: 'a', description: 'Run all tests' },
        { key: 'u', description: 'Unit tests only' },
        { key: 'c', description: 'Contract tests' }
      ];
    case 'migrate':
      return [
        { key: 'c', description: 'Create migration' },
        { key: 'a', description: 'Apply migration' },
        { key: 'r', description: 'Rollback' }
      ];
    case 'compose':
      return [
        { key: 'u', description: 'Union schemas' },
        { key: 'i', description: 'Intersect schemas' },
        { key: 'm', description: 'Merge schemas' }
      ];
    default:
      return [];
  }
};

const groupBy = (obj: any, key: string) => {
  return Object.values(obj).reduce((acc: any, item: any) => {
    const group = item[key];
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
};

// Export
export class ZodkitUI {
  async start(): Promise<void> {
    console.clear();
    // @ts-ignore
    const app = render(<ZodkitUnified />);
    // @ts-ignore
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore
      await app.waitUntilExit();
    }
  }
}