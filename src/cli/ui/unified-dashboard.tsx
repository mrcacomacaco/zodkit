/**
 * @fileoverview Unified TUI Dashboard - Single interface for all zodkit commands
 * @module UnifiedDashboard
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { render } from 'ink';
const { Box, Text, useApp, useInput, useStdout } = require('ink');
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

interface Command {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'generation' | 'testing' | 'utility' | 'ai';
  aliases?: string[];
  examples: string[];
}

interface CommandHistoryItem {
  id: string;
  command: string;
  timestamp: Date;
  status: 'running' | 'success' | 'error';
  output?: string[];
  error?: string;
  duration?: number;
}

interface DashboardState {
  mode: 'command' | 'output' | 'help' | 'history';
  commandInput: string;
  commandHistory: CommandHistoryItem[];
  currentOutput: string[];
  isExecuting: boolean;
  selectedHistoryIndex: number;
  showCommandPalette: boolean;
  filteredCommands: Command[];
  selectedCommandIndex: number;
  activeProcess: ChildProcess | null;
  workingDirectory: string;
  theme: 'dark' | 'light' | 'neon';
}

const COMMANDS: Command[] = [
  {
    id: 'check',
    name: 'check',
    description: 'Analyze schemas for issues',
    category: 'analysis',
    aliases: ['c', 'analyze'],
    examples: [
      'check',
      'check UserSchema',
      'check --watch',
      'check --coverage'
    ]
  },
  {
    id: 'hint',
    name: 'hint',
    description: 'Performance & best practice suggestions',
    category: 'analysis',
    aliases: ['h', 'suggest'],
    examples: [
      'hint',
      'hint --fix',
      'hint --watch --fix',
      'hint --severity error'
    ]
  },
  {
    id: 'scaffold',
    name: 'scaffold',
    description: 'Generate Zod schemas from TypeScript',
    category: 'generation',
    aliases: ['s', 'generate'],
    examples: [
      'scaffold types.ts',
      'scaffold types.ts --output schemas.ts',
      'scaffold types.ts --watch',
      'scaffold types.ts --patterns'
    ]
  },
  {
    id: 'fix',
    name: 'fix',
    description: 'Auto-fix schema issues',
    category: 'utility',
    aliases: ['f'],
    examples: [
      'fix',
      'fix UserSchema',
      'fix --unsafe',
      'fix --dry-run'
    ]
  },
  {
    id: 'map',
    name: 'map',
    description: 'Visualize schema relationships',
    category: 'analysis',
    aliases: ['m', 'visualize'],
    examples: [
      'map',
      'map UserSchema',
      'map --depth 3',
      'map --export graph.json'
    ]
  },
  {
    id: 'profile',
    name: 'profile',
    description: 'Runtime performance profiling',
    category: 'analysis',
    aliases: ['p', 'perf'],
    examples: [
      'profile --runtime',
      'profile --report',
      'profile --export metrics.json'
    ]
  },
  {
    id: 'mock',
    name: 'mock',
    description: 'Generate mock data from schemas',
    category: 'generation',
    aliases: ['mk'],
    examples: [
      'mock UserSchema',
      'mock UserSchema --count 100',
      'mock --realistic',
      'mock --locale en-US'
    ]
  },
  {
    id: 'test',
    name: 'test',
    description: 'Run schema tests',
    category: 'testing',
    aliases: ['t'],
    examples: [
      'test',
      'test UserSchema',
      'test --watch',
      'test --coverage'
    ]
  },
  {
    id: 'migrate',
    name: 'migrate',
    description: 'Schema migration assistant',
    category: 'utility',
    aliases: ['mg'],
    examples: [
      'migrate create',
      'migrate analyze',
      'migrate execute',
      'migrate rollback'
    ]
  },
  {
    id: 'explain',
    name: 'explain',
    description: 'Explain schemas in detail',
    category: 'ai',
    aliases: ['e', 'describe'],
    examples: [
      'explain UserSchema',
      'explain --all',
      'explain --relationships'
    ]
  },
  {
    id: 'mcp',
    name: 'mcp',
    description: 'AI integration server',
    category: 'ai',
    aliases: [],
    examples: [
      'mcp serve',
      'mcp status',
      'mcp stop'
    ]
  },
  {
    id: 'compose',
    name: 'compose',
    description: 'Compose complex schemas',
    category: 'generation',
    aliases: ['comp'],
    examples: [
      'compose union --input user.ts admin.ts',
      'compose merge --input base.ts ext.ts',
      'compose transform --input schema.ts --transform partial'
    ]
  }
];

const UnifiedDashboard: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [state, setState] = useState<DashboardState>({
    mode: 'command',
    commandInput: '',
    commandHistory: [],
    currentOutput: [],
    isExecuting: false,
    selectedHistoryIndex: -1,
    showCommandPalette: false,
    filteredCommands: COMMANDS,
    selectedCommandIndex: 0,
    activeProcess: null,
    workingDirectory: process.cwd(),
    theme: 'dark'
  });

  const outputEndRef = useRef<number>(0);

  useInput((input: string, key: any) => {
    // Global shortcuts
    if (key.ctrl && input === 'c') {
      if (state.activeProcess) {
        state.activeProcess.kill();
        setState(s => ({ ...s, activeProcess: null, isExecuting: false }));
      } else if (state.showCommandPalette) {
        setState(s => ({ ...s, showCommandPalette: false }));
      } else {
        exit();
      }
      return;
    }

    if (key.ctrl && input === 'l') {
      setState(s => ({ ...s, currentOutput: [], commandInput: '' }));
      return;
    }

    if (key.ctrl && input === 'p') {
      setState(s => ({ ...s, showCommandPalette: !s.showCommandPalette }));
      return;
    }

    if (input === '?') {
      setState(s => ({ ...s, mode: s.mode === 'help' ? 'command' : 'help' }));
      return;
    }

    // Mode-specific input handling
    if (state.mode === 'command' && !state.showCommandPalette) {
      handleCommandMode(input, key);
    } else if (state.showCommandPalette) {
      handleCommandPalette(input, key);
    } else if (state.mode === 'history') {
      handleHistoryMode(input, key);
    } else if (state.mode === 'help') {
      if (input === 'q' || key.escape) {
        setState(s => ({ ...s, mode: 'command' }));
      }
    }
  });

  const handleCommandMode = (input: string, key: any) => {
    if (key.return) {
      executeCommand(state.commandInput);
    } else if (key.upArrow) {
      // Navigate command history
      if (state.commandHistory.length > 0) {
        const newIndex = Math.min(
          state.selectedHistoryIndex + 1,
          state.commandHistory.length - 1
        );
        const historyItem = state.commandHistory[state.commandHistory.length - 1 - newIndex];
        setState(s => ({
          ...s,
          selectedHistoryIndex: newIndex,
          commandInput: historyItem.command
        }));
      }
    } else if (key.downArrow) {
      if (state.selectedHistoryIndex > 0) {
        const newIndex = state.selectedHistoryIndex - 1;
        const historyItem = state.commandHistory[state.commandHistory.length - 1 - newIndex];
        setState(s => ({
          ...s,
          selectedHistoryIndex: newIndex,
          commandInput: historyItem.command
        }));
      } else {
        setState(s => ({
          ...s,
          selectedHistoryIndex: -1,
          commandInput: ''
        }));
      }
    } else if (key.tab) {
      // Auto-complete
      const matches = COMMANDS.filter(cmd =>
        cmd.name.startsWith(state.commandInput) ||
        cmd.aliases?.some(alias => alias.startsWith(state.commandInput))
      );
      if (matches.length === 1) {
        setState(s => ({ ...s, commandInput: matches[0].name + ' ' }));
      } else if (matches.length > 1) {
        setState(s => ({
          ...s,
          showCommandPalette: true,
          filteredCommands: matches
        }));
      }
    }
  };

  const handleCommandPalette = (input: string, key: any) => {
    if (key.escape) {
      setState(s => ({ ...s, showCommandPalette: false }));
    } else if (key.upArrow) {
      setState(s => ({
        ...s,
        selectedCommandIndex: Math.max(0, s.selectedCommandIndex - 1)
      }));
    } else if (key.downArrow) {
      setState(s => ({
        ...s,
        selectedCommandIndex: Math.min(
          s.filteredCommands.length - 1,
          s.selectedCommandIndex + 1
        )
      }));
    } else if (key.return) {
      const selected = state.filteredCommands[state.selectedCommandIndex];
      setState(s => ({
        ...s,
        commandInput: selected.name + ' ',
        showCommandPalette: false,
        selectedCommandIndex: 0
      }));
    }
  };

  const handleHistoryMode = (input: string, key: any) => {
    if (input === 'h' || key.escape) {
      setState(s => ({ ...s, mode: 'command' }));
    }
  };

  const executeCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    const trimmedCommand = command.trim();
    const startTime = Date.now();

    // Create history item
    const historyItem: CommandHistoryItem = {
      id: `cmd-${Date.now()}`,
      command: trimmedCommand,
      timestamp: new Date(),
      status: 'running',
      output: []
    };

    setState(s => ({
      ...s,
      commandHistory: [...s.commandHistory, historyItem],
      currentOutput: [...s.currentOutput, `\n${pc.cyan('❯')} ${trimmedCommand}\n`],
      isExecuting: true,
      commandInput: '',
      selectedHistoryIndex: -1
    }));

    try {
      // Execute the command using zodkit CLI
      const [cmd, ...args] = trimmedCommand.split(' ');

      // Check if it's a built-in command
      if (cmd === 'clear' || cmd === 'cls') {
        setState(s => ({ ...s, currentOutput: [], isExecuting: false }));
        return;
      } else if (cmd === 'pwd') {
        setState(s => ({
          ...s,
          currentOutput: [...s.currentOutput, `${s.workingDirectory}\n`],
          isExecuting: false
        }));
        return;
      } else if (cmd === 'cd') {
        const newDir = args[0] || process.env.HOME || '/';
        const resolvedPath = path.resolve(state.workingDirectory, newDir);
        setState(s => ({
          ...s,
          workingDirectory: resolvedPath,
          currentOutput: [...s.currentOutput, `Changed to: ${resolvedPath}\n`],
          isExecuting: false
        }));
        return;
      } else if (cmd === 'exit' || cmd === 'quit') {
        exit();
        return;
      }

      // Execute zodkit command
      const child = spawn('npx', ['zodkit', cmd, ...args], {
        cwd: state.workingDirectory,
        shell: true
      });

      setState(s => ({ ...s, activeProcess: child }));

      // Collect output
      const output: string[] = [];

      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l);
        output.push(...lines);
        setState(s => ({
          ...s,
          currentOutput: [...s.currentOutput, ...lines.map(l => l + '\n')]
        }));
      });

      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l);
        output.push(...lines);
        setState(s => ({
          ...s,
          currentOutput: [...s.currentOutput, ...lines.map(l => pc.red(l) + '\n')]
        }));
      });

      // Handle completion
      child.on('close', (code: number) => {
        const duration = Date.now() - startTime;
        const status = code === 0 ? 'success' : 'error';

        // Update history item
        const updatedHistory = state.commandHistory.map(item =>
          item.id === historyItem.id
            ? { ...item, status, output, duration }
            : item
        );

        setState(s => ({
          ...s,
          commandHistory: updatedHistory,
          isExecuting: false,
          activeProcess: null,
          currentOutput: [
            ...s.currentOutput,
            `\n${status === 'success' ? pc.green('✓') : pc.red('✗')} Command completed in ${duration}ms\n`
          ]
        }));
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setState(s => ({
        ...s,
        currentOutput: [...s.currentOutput, pc.red(`Error: ${errorMsg}\n`)],
        isExecuting: false,
        activeProcess: null
      }));

      // Update history item with error
      const updatedHistory = state.commandHistory.map(item =>
        item.id === historyItem.id
          ? { ...item, status: 'error', error: errorMsg }
          : item
      );
      setState(s => ({ ...s, commandHistory: updatedHistory }));
    }
  }, [state.workingDirectory, state.commandHistory]);

  // Auto-scroll output
  useEffect(() => {
    outputEndRef.current = state.currentOutput.length;
  }, [state.currentOutput]);

  // Render based on mode
  if (state.mode === 'help') {
    return <HelpView onClose={() => setState(s => ({ ...s, mode: 'command' }))} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Gradient name="passion">
          <Text bold>⚡ ZODKIT</Text>
        </Gradient>
        <Text color="gray"> - Unified Development Interface</Text>
      </Box>

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={2} marginBottom={1}>
        <Text color="cyan">{path.basename(state.workingDirectory)}</Text>
        <Text color="gray">
          {state.isExecuting ? <Spinner type="dots" /> : '●'}
          {state.isExecuting ? ' Running...' : ' Ready'}
        </Text>
        <Text color="gray">
          {state.commandHistory.length} commands | {state.currentOutput.length} lines
        </Text>
      </Box>

      {/* Output Area */}
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
        height="70%"
      >
        <Box flexDirection="column" height="100%">
          {state.currentOutput.length === 0 ? (
            <Box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
              <Text color="gray">Welcome to Zodkit!</Text>
              <Text color="gray">Type a command or press ? for help</Text>
              <Text color="gray">Ctrl+P for command palette</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {state.currentOutput.slice(-30).map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Command Palette Overlay */}
      {state.showCommandPalette && (
        <Box
          position="absolute"
          top={5}
          left="25%"
          width="50%"
          borderStyle="double"
          borderColor="cyan"
          paddingX={2}
          paddingY={1}
        >
          <Box flexDirection="column">
            <Text bold color="cyan" marginBottom={1}>Command Palette</Text>
            {state.filteredCommands.map((cmd, i) => (
              <Box key={cmd.id}>
                <Text color={i === state.selectedCommandIndex ? 'cyan' : 'white'}>
                  {i === state.selectedCommandIndex ? '▶ ' : '  '}
                  {cmd.name}
                </Text>
                <Text color="gray"> - {cmd.description}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Command Input */}
      <Box paddingX={2}>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={state.commandInput}
          onChange={(value: string) => setState(s => ({ ...s, commandInput: value }))}
          placeholder="Enter command... (? for help, Ctrl+P for palette)"
          focus={!state.showCommandPalette && state.mode === 'command'}
        />
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="gray">
          [?] Help | [Ctrl+C] Cancel/Exit | [Ctrl+L] Clear | [Ctrl+P] Palette | [Tab] Complete
        </Text>
      </Box>
    </Box>
  );
};

const HelpView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useInput((input: string) => {
    if (input === 'q' || input === '?') {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan" marginBottom={1}>Zodkit Help</Text>

      <Text bold marginBottom={1}>Available Commands:</Text>
      {COMMANDS.map(cmd => (
        <Box key={cmd.id} marginBottom={1}>
          <Box>
            <Text color="yellow">{cmd.name}</Text>
            {cmd.aliases && cmd.aliases.length > 0 && (
              <Text color="gray"> ({cmd.aliases.join(', ')})</Text>
            )}
          </Box>
          <Text color="gray">  {cmd.description}</Text>
          <Box flexDirection="column" paddingLeft={2}>
            {cmd.examples.slice(0, 2).map((ex, i) => (
              <Text key={i} color="gray">  $ {ex}</Text>
            ))}
          </Box>
        </Box>
      ))}

      <Text bold marginTop={2} marginBottom={1}>Keyboard Shortcuts:</Text>
      <Text>  Ctrl+C    - Cancel command or exit</Text>
      <Text>  Ctrl+L    - Clear output</Text>
      <Text>  Ctrl+P    - Open command palette</Text>
      <Text>  Tab       - Auto-complete command</Text>
      <Text>  ↑/↓       - Navigate command history</Text>
      <Text>  ?         - Toggle help</Text>

      <Text bold marginTop={2} marginBottom={1}>Special Commands:</Text>
      <Text>  clear/cls - Clear the screen</Text>
      <Text>  pwd       - Show working directory</Text>
      <Text>  cd [dir]  - Change directory</Text>
      <Text>  exit/quit - Exit the dashboard</Text>

      <Text marginTop={2} color="gray">Press [q] or [?] to close help</Text>
    </Box>
  );
};

// Helper to import picocolors
const pc = {
  cyan: (str: string) => `\x1b[36m${str}\x1b[0m`,
  red: (str: string) => `\x1b[31m${str}\x1b[0m`,
  green: (str: string) => `\x1b[32m${str}\x1b[0m`,
  yellow: (str: string) => `\x1b[33m${str}\x1b[0m`,
  gray: (str: string) => `\x1b[90m${str}\x1b[0m`,
  blue: (str: string) => `\x1b[34m${str}\x1b[0m`,
  magenta: (str: string) => `\x1b[35m${str}\x1b[0m`
};

// Export the dashboard class
export class ZodkitDashboard {
  async start(): Promise<void> {
    // @ts-ignore - Ink type compatibility
    const app = render(<UnifiedDashboard />);
    // @ts-ignore - waitUntilExit method availability
    if (app && typeof app.waitUntilExit === 'function') {
      // @ts-ignore - waitUntilExit method call
      await app.waitUntilExit();
    }
  }
}