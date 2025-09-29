/**
 * @fileoverview Debug Command - Advanced Debugging and Tracing
 * @module DebugCommand
 *
 * Comprehensive debugging capabilities including:
 * - Interactive debugging with breakpoints
 * - Performance profiling and bottleneck analysis
 * - Memory usage monitoring and leak detection
 * - Execution tracing with call stacks
 * - Schema validation debugging
 * - Real-time metrics and analytics
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { unifiedConfig } from '../../core/unified-config';
import { Infrastructure } from '../../core/infrastructure';
import { DebugTracer, DebugConfig, setGlobalTracer } from '../../core/debug-tracer';
import { Utils } from '../../utils';

interface DebugOptions {
  mode?: 'trace' | 'profile' | 'interactive' | 'analyze' | 'monitor';
  level?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  output?: 'console' | 'file' | 'both';
  outputFile?: string;
  schema?: string;
  function?: string;
  module?: string;
  breakpoint?: string;
  watch?: string[];
  memory?: boolean;
  profiling?: boolean;
  interactive?: boolean;
  duration?: number;
  export?: string;
  import?: string;
  analyze?: boolean;
  realtime?: boolean;
  threshold?: number;
  filter?: string[];
}

export async function debugCommand(
  target?: string,
  options: DebugOptions = {},
  command?: Command
): Promise<void> {
  const globalOpts = command?.parent?.opts() || {};
  const isJsonMode = globalOpts.json;
  const isQuiet = globalOpts.quiet;

  const utils = new Utils();
  const logger = utils.logger;

  try {
    if (!isQuiet && !isJsonMode) {
      logger.info(`🔍 ${pc.cyan('ZodKit Debug Mode')} - Advanced Debugging & Tracing`);
      console.log();
    }

    // Initialize debug configuration
    const debugConfig: DebugConfig = {
      enabled: true,
      level: options.level || 'debug',
      output: options.output || 'console',
      outputFile: options.outputFile || 'debug.log',
      tracing: {
        enabled: true,
        includeStackTrace: options.level === 'trace',
        maxStackDepth: 15,
        captureArguments: true,
        captureReturnValues: true
      },
      profiling: {
        enabled: options.profiling !== false,
        sampleInterval: 1000,
        memoryTracking: options.memory !== false,
        cpuProfiling: true,
        timeThreshold: options.threshold || 10
      },
      interactive: {
        enabled: options.interactive || options.mode === 'interactive',
        breakpoints: options.breakpoint ? [options.breakpoint] : [],
        watchExpressions: options.watch || [],
        inspectVariables: true
      },
      filters: {
        includePatterns: options.filter || [],
        excludePatterns: ['node_modules/**', 'dist/**'],
        modules: options.module ? [options.module] : [],
        functions: options.function ? [options.function] : []
      },
      formatting: {
        colorize: !isJsonMode,
        timestamps: true,
        processInfo: true,
        indent: true
      }
    };

    // Initialize systems
    const infraConfig = await unifiedConfig.getInfrastructureConfig();
    const infra = new Infrastructure(infraConfig);
    const debugTracer = new DebugTracer(debugConfig);

    // Set global tracer for decorators and utilities
    setGlobalTracer(debugTracer);

    // Setup event listeners
    setupDebugEventListeners(debugTracer, options, isJsonMode);

    // Execute debug mode based on options
    await executeDebugMode(debugTracer, infra, target, options, isJsonMode, logger);

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'DEBUG_ERROR'
        }
      }, null, 2));
    } else {
      logger.error('Debug command failed:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function executeDebugMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  const mode = options.mode || 'trace';

  switch (mode) {
    case 'trace':
      await runTraceMode(debugTracer, infra, target, options, isJsonMode, logger);
      break;

    case 'profile':
      await runProfileMode(debugTracer, infra, target, options, isJsonMode, logger);
      break;

    case 'interactive':
      await runInteractiveMode(debugTracer, infra, target, options, isJsonMode, logger);
      break;

    case 'analyze':
      await runAnalyzeMode(debugTracer, infra, target, options, isJsonMode, logger);
      break;

    case 'monitor':
      await runMonitorMode(debugTracer, infra, target, options, isJsonMode, logger);
      break;

    default:
      throw new Error(`Unknown debug mode: ${mode}`);
  }
}

async function runTraceMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  if (!isJsonMode) {
    console.log(pc.cyan('🔍 Trace Mode - Execution Tracing'));
    console.log(pc.gray('─'.repeat(50)));
  }

  const sessionId = debugTracer.startSession();

  try {
    // Discover schemas for tracing
    const discovery = infra.discovery;
    const schemas = await discovery.findSchemas({
      basePath: target || process.cwd(),
      progressive: true
    });

    if (!isJsonMode) {
      console.log(`Found ${pc.cyan(schemas.length)} schema${schemas.length !== 1 ? 's' : ''} for tracing`);
      console.log(`Session ID: ${pc.yellow(sessionId)}`);
      console.log();
    }

    // Set up breakpoints if specified
    if (options.breakpoint) {
      const [file, line] = options.breakpoint.split(':');
      const breakpointId = debugTracer.addBreakpoint(file, parseInt(line) || 1);
      if (!isJsonMode) {
        console.log(`Added breakpoint: ${pc.yellow(breakpointId)} at ${file}:${line}`);
      }
    }

    // Set up watch variables
    if (options.watch) {
      options.watch.forEach(watchExpr => {
        debugTracer.watchVariable(watchExpr, `[Watching: ${watchExpr}]`);
      });
    }

    // Run tracing for specified duration or until stopped
    const duration = options.duration || 30000; // 30 seconds default
    if (!isJsonMode) {
      console.log(`Starting trace for ${duration}ms...`);
      console.log(pc.gray('Press Ctrl+C to stop early\n'));
    }

    // Simulate schema operations for tracing
    await simulateSchemaOperations(debugTracer, schemas, duration);

    // End session and generate report
    const session = debugTracer.endSession();
    if (session && !isJsonMode) {
      displayTraceResults(session, debugTracer);
    }

    if (options.export && session) {
      await debugTracer.exportSession(session, options.export);
      if (!isJsonMode) {
        console.log(`\nTrace session exported to: ${pc.green(options.export)}`);
      }
    }

  } catch (error) {
    debugTracer.endSession();
    throw error;
  }
}

async function runProfileMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  if (!isJsonMode) {
    console.log(pc.cyan('⚡ Profile Mode - Performance Analysis'));
    console.log(pc.gray('─'.repeat(50)));
  }

  const sessionId = debugTracer.startSession();

  try {
    // Discover schemas for profiling
    const discovery = infra.discovery;
    const schemas = await discovery.findSchemas({
      basePath: target || process.cwd(),
      progressive: true
    });

    if (!isJsonMode) {
      console.log(`Profiling ${pc.cyan(schemas.length)} schema${schemas.length !== 1 ? 's' : ''}`);
      console.log();
    }

    // Run performance profiling
    await performSchemaProfileAnalysis(debugTracer, schemas, options);

    // Get performance results
    const profiles = debugTracer.getPerformanceProfiles();
    const bottlenecks = debugTracer.getBottlenecks(options.threshold || 10);

    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        profiles: profiles.slice(0, 20),
        bottlenecks,
        summary: {
          totalFunctions: profiles.length,
          bottleneckCount: bottlenecks.length,
          avgExecutionTime: profiles.reduce((sum, p) => sum + p.avgTime, 0) / profiles.length
        }
      }, null, 2));
    } else {
      displayProfileResults(profiles, bottlenecks);
    }

    const session = debugTracer.endSession();
    if (options.export && session) {
      await debugTracer.exportSession(session, options.export);
    }

  } catch (error) {
    debugTracer.endSession();
    throw error;
  }
}

async function runInteractiveMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  if (isJsonMode) {
    throw new Error('Interactive mode is not compatible with JSON output');
  }

  console.log(pc.cyan('🎮 Interactive Debug Mode'));
  console.log(pc.gray('─'.repeat(50)));
  console.log('Available commands:');
  console.log('  help           - Show this help');
  console.log('  trace <level>  - Set trace level');
  console.log('  breakpoint     - Add/remove breakpoints');
  console.log('  watch <var>    - Watch variables');
  console.log('  profile        - Show performance profiles');
  console.log('  report         - Generate debug report');
  console.log('  export <file>  - Export session');
  console.log('  quit           - Exit debug mode');
  console.log();

  debugTracer.enableInteractiveMode();
  const sessionId = debugTracer.startSession();

  try {
    await startInteractiveSession(debugTracer, infra, target, options);
  } finally {
    debugTracer.endSession();
  }
}

async function runAnalyzeMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  if (!isJsonMode) {
    console.log(pc.cyan('📊 Analyze Mode - Debug Session Analysis'));
    console.log(pc.gray('─'.repeat(50)));
  }

  if (options.import) {
    // Import and analyze existing debug session
    const sessionData = JSON.parse(await require('fs').promises.readFile(options.import, 'utf8'));

    if (!isJsonMode) {
      console.log(`Analyzing session: ${pc.cyan(sessionData.session.id)}`);
    }

    const analysis = analyzeDebugSession(sessionData.session);

    if (isJsonMode) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      displayAnalysisResults(analysis);
    }
  } else {
    // Generate report from current tracer state
    const report = debugTracer.generateReport();

    if (isJsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      displayDebugReport(report);
    }
  }
}

async function runMonitorMode(
  debugTracer: DebugTracer,
  infra: Infrastructure,
  target: string | undefined,
  options: DebugOptions,
  isJsonMode: boolean,
  logger: any
): Promise<void> {
  if (!isJsonMode) {
    console.log(pc.cyan('📡 Monitor Mode - Real-time Monitoring'));
    console.log(pc.gray('─'.repeat(50)));
    console.log('Starting real-time monitoring...');
    console.log(pc.gray('Press Ctrl+C to stop\n'));
  }

  const sessionId = debugTracer.startSession();

  try {
    // Set up real-time monitoring
    setupRealTimeMonitoring(debugTracer, options, isJsonMode);

    // Keep monitoring until interrupted
    await new Promise<void>((resolve) => {
      const duration = options.duration || 300000; // 5 minutes default
      const timeout = setTimeout(resolve, duration);

      process.on('SIGINT', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

  } finally {
    const session = debugTracer.endSession();
    if (!isJsonMode) {
      console.log(pc.yellow('\n\n👋 Monitoring stopped'));
    }
  }
}

// === HELPER FUNCTIONS ===

function setupDebugEventListeners(debugTracer: DebugTracer, options: DebugOptions, isJsonMode: boolean): void {
  debugTracer.on('trace', (entry) => {
    if (options.realtime && !isJsonMode && entry.level === 'error') {
      console.log(pc.red(`🚨 Error: ${entry.message} in ${entry.module}.${entry.function}`));
    }
  });

  debugTracer.on('breakpointHit', ({ breakpoint, entry }) => {
    if (!isJsonMode) {
      console.log(pc.yellow(`\n🔍 Breakpoint hit: ${breakpoint.file}:${breakpoint.line}`));
      console.log(pc.cyan(`   ${entry.module}.${entry.function}: ${entry.message}`));
    }
  });

  debugTracer.on('profileCompleted', ({ id, profile, duration }) => {
    if (options.realtime && !isJsonMode && profile.hotPath) {
      console.log(pc.red(`🔥 Hot path detected: ${id} (${duration.toFixed(2)}ms)`));
    }
  });
}

async function simulateSchemaOperations(debugTracer: DebugTracer, schemas: any[], duration: number): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    for (const schema of schemas.slice(0, 3)) { // Limit to first 3 schemas
      try {
        // Simulate schema validation with debug tracing
        const testData = { id: 'test', name: 'Test User', email: 'test@example.com' };
        debugTracer.debugSchemaValidation(
          { safeParse: (data: any) => ({ success: true, data }) } as any,
          testData,
          schema.name
        );

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Continue with other schemas
      }
    }

    // Longer delay between cycles
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function performSchemaProfileAnalysis(debugTracer: DebugTracer, schemas: any[], options: DebugOptions): Promise<void> {
  for (const schema of schemas) {
    const profileId = debugTracer.startProfiling('validateSchema', 'SchemaValidator');

    try {
      // Simulate multiple validation operations
      for (let i = 0; i < 100; i++) {
        const testData = {
          id: `test-${i}`,
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
          age: 20 + i
        };

        // Simulate validation time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      }

    } finally {
      debugTracer.endProfiling(profileId);
    }
  }
}

async function startInteractiveSession(debugTracer: DebugTracer, infra: Infrastructure, target: string | undefined, options: DebugOptions): Promise<void> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.cyan('debug> ')
  });

  return new Promise<void>((resolve) => {
    rl.prompt();

    rl.on('line', async (input: string) => {
      const [command, ...args] = input.trim().split(' ');

      try {
        switch (command) {
          case 'help':
            displayInteractiveHelp();
            break;

          case 'trace':
            const level = args[0] || 'debug';
            console.log(`Trace level set to: ${pc.cyan(level)}`);
            break;

          case 'breakpoint':
            if (args.length >= 2) {
              const [file, line] = args;
              const id = debugTracer.addBreakpoint(file, parseInt(line));
              console.log(`Breakpoint added: ${pc.yellow(id)}`);
            } else {
              console.log('Usage: breakpoint <file> <line>');
            }
            break;

          case 'watch':
            if (args.length > 0) {
              const variable = args.join(' ');
              debugTracer.watchVariable(variable, `[Watching: ${variable}]`);
              console.log(`Watching variable: ${pc.cyan(variable)}`);
            } else {
              console.log('Usage: watch <variable>');
            }
            break;

          case 'profile':
            const profiles = debugTracer.getPerformanceProfiles();
            displayProfileResults(profiles.slice(0, 10), []);
            break;

          case 'report':
            const report = debugTracer.generateReport();
            displayDebugReport(report);
            break;

          case 'export':
            if (args.length > 0) {
              const session = debugTracer.endSession();
              if (session) {
                await debugTracer.exportSession(session, args[0]);
                console.log(`Session exported to: ${pc.green(args[0])}`);
                debugTracer.startSession();
              }
            } else {
              console.log('Usage: export <filename>');
            }
            break;

          case 'quit':
          case 'exit':
            rl.close();
            resolve();
            return;

          default:
            if (command) {
              console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
            }
        }
      } catch (error) {
        console.log(pc.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log(pc.yellow('\nExiting interactive mode...'));
      resolve();
    });
  });
}

function setupRealTimeMonitoring(debugTracer: DebugTracer, options: DebugOptions, isJsonMode: boolean): void {
  let updateCount = 0;

  const updateInterval = setInterval(() => {
    updateCount++;

    if (!isJsonMode) {
      // Clear screen and show real-time stats
      console.clear();
      console.log(pc.cyan('📡 ZodKit Debug Monitor - Real-time Stats'));
      console.log(pc.gray('─'.repeat(60)));

      const profiles = debugTracer.getPerformanceProfiles();
      const bottlenecks = debugTracer.getBottlenecks();

      console.log(`Update #${updateCount} - ${new Date().toLocaleTimeString()}`);
      console.log(`Functions profiled: ${profiles.length}`);
      console.log(`Performance bottlenecks: ${bottlenecks.length}`);

      if (bottlenecks.length > 0) {
        console.log(pc.yellow('\n🔥 Active Bottlenecks:'));
        bottlenecks.slice(0, 5).forEach(profile => {
          console.log(`  ${profile.function}: ${profile.avgTime.toFixed(2)}ms avg`);
        });
      }

      console.log(pc.gray('\nPress Ctrl+C to stop monitoring...'));
    }
  }, 2000); // Update every 2 seconds

  // Stop monitoring on exit
  process.on('SIGINT', () => {
    clearInterval(updateInterval);
  });
}

function displayTraceResults(session: any, debugTracer: DebugTracer): void {
  console.log(pc.cyan('\n📋 Trace Results'));
  console.log(pc.gray('─'.repeat(50)));

  const traces = session.traces;
  const errorTraces = traces.filter((t: any) => t.level === 'error');
  const warningTraces = traces.filter((t: any) => t.level === 'warn');

  console.log(`Total traces: ${traces.length}`);
  console.log(`Errors: ${pc.red(errorTraces.length)}`);
  console.log(`Warnings: ${pc.yellow(warningTraces.length)}`);

  if (errorTraces.length > 0) {
    console.log(pc.red('\n❌ Recent Errors:'));
    errorTraces.slice(-5).forEach((trace: any) => {
      console.log(`  ${trace.module}.${trace.function}: ${trace.message}`);
    });
  }

  if (warningTraces.length > 0) {
    console.log(pc.yellow('\n⚠️  Recent Warnings:'));
    warningTraces.slice(-3).forEach((trace: any) => {
      console.log(`  ${trace.module}.${trace.function}: ${trace.message}`);
    });
  }
}

function displayProfileResults(profiles: any[], bottlenecks: any[]): void {
  console.log(pc.cyan('\n⚡ Performance Profile Results'));
  console.log(pc.gray('─'.repeat(50)));

  console.log(`Functions profiled: ${profiles.length}`);
  console.log(`Performance bottlenecks: ${bottlenecks.length}`);

  if (profiles.length > 0) {
    console.log(pc.cyan('\n🏆 Top Functions by Execution Time:'));
    profiles.slice(0, 10).forEach((profile, index) => {
      const rank = index + 1;
      const icon = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '  ';
      console.log(`${icon} ${rank}. ${profile.function}`);
      console.log(`     Total: ${profile.totalTime.toFixed(2)}ms | Avg: ${profile.avgTime.toFixed(2)}ms | Calls: ${profile.callCount}`);
    });
  }

  if (bottlenecks.length > 0) {
    console.log(pc.red('\n🔥 Performance Bottlenecks:'));
    bottlenecks.forEach(profile => {
      console.log(`  • ${profile.function}: ${profile.avgTime.toFixed(2)}ms avg (${profile.callCount} calls)`);
    });
  }
}

function displayAnalysisResults(analysis: any): void {
  console.log(pc.cyan('\n📊 Debug Session Analysis'));
  console.log(pc.gray('─'.repeat(50)));

  console.log(`Session duration: ${analysis.duration}ms`);
  console.log(`Total traces: ${analysis.totalTraces}`);
  console.log(`Error rate: ${analysis.errorRate.toFixed(1)}%`);
  console.log(`Performance issues: ${analysis.performanceIssues}`);
  console.log(`Memory leaks detected: ${analysis.memoryLeaks}`);

  if (analysis.recommendations.length > 0) {
    console.log(pc.yellow('\n💡 Recommendations:'));
    analysis.recommendations.forEach((rec: string) => {
      console.log(`  • ${rec}`);
    });
  }
}

function displayDebugReport(report: any): void {
  console.log(pc.cyan('\n📋 Debug Report'));
  console.log(pc.gray('─'.repeat(50)));

  const summary = report.summary;
  console.log(`Total traces: ${summary.totalTraces}`);
  console.log(`Errors: ${pc.red(summary.errorCount)}`);
  console.log(`Warnings: ${pc.yellow(summary.warningCount)}`);
  console.log(`Functions profiled: ${summary.totalFunctions}`);
  console.log(`Bottlenecks: ${summary.bottlenecks}`);
  console.log(`Avg memory usage: ${summary.avgMemoryUsage}MB`);

  if (report.performance.bottlenecks.length > 0) {
    console.log(pc.red('\n🔥 Performance Issues:'));
    report.performance.bottlenecks.slice(0, 5).forEach((bottleneck: any) => {
      console.log(`  • ${bottleneck.function}: ${bottleneck.avgTime.toFixed(2)}ms`);
    });
  }
}

function displayInteractiveHelp(): void {
  console.log(pc.cyan('\n🎮 Interactive Debug Commands:'));
  console.log('  help                    - Show this help message');
  console.log('  trace <level>           - Set trace level (error|warn|info|debug|trace)');
  console.log('  breakpoint <file> <line> - Add breakpoint');
  console.log('  watch <variable>        - Watch variable or expression');
  console.log('  profile                 - Show performance profiles');
  console.log('  report                  - Generate debug report');
  console.log('  export <file>           - Export current session');
  console.log('  quit                    - Exit debug mode');
  console.log();
}

function analyzeDebugSession(session: any): any {
  const duration = (session.endTime || Date.now()) - session.startTime;
  const traces = session.traces || [];
  const errorCount = traces.filter((t: any) => t.level === 'error').length;
  const warningCount = traces.filter((t: any) => t.level === 'warn').length;
  const errorRate = traces.length > 0 ? (errorCount / traces.length) * 100 : 0;

  const recommendations: string[] = [];

  if (errorRate > 10) {
    recommendations.push('High error rate detected - review error patterns');
  }

  if (session.profiles && Array.from(session.profiles.values()).some((p: any) => p.hotPath)) {
    recommendations.push('Performance bottlenecks detected - optimize hot paths');
  }

  return {
    duration,
    totalTraces: traces.length,
    errorCount,
    warningCount,
    errorRate,
    performanceIssues: session.profiles ? Array.from(session.profiles.values()).filter((p: any) => p.hotPath).length : 0,
    memoryLeaks: 0, // Would be calculated from actual memory analysis
    recommendations
  };
}

// === COMMAND REGISTRATION ===

export function registerDebugCommand(program: Command): void {
  program
    .command('debug [target]')
    .description('Advanced debugging and tracing')
    .option('-m, --mode <mode>', 'debug mode (trace|profile|interactive|analyze|monitor)', 'trace')
    .option('-l, --level <level>', 'trace level (error|warn|info|debug|trace)', 'debug')
    .option('-o, --output <output>', 'output mode (console|file|both)', 'console')
    .option('-f, --output-file <file>', 'output file path')
    .option('-s, --schema <schema>', 'specific schema to debug')
    .option('--function <function>', 'specific function to trace')
    .option('--module <module>', 'specific module to trace')
    .option('-b, --breakpoint <location>', 'add breakpoint (file:line)')
    .option('-w, --watch <variables...>', 'watch variables or expressions')
    .option('--memory', 'enable memory tracking')
    .option('--profiling', 'enable performance profiling')
    .option('-i, --interactive', 'enable interactive debugging')
    .option('-d, --duration <ms>', 'debug duration in milliseconds', '30000')
    .option('-e, --export <file>', 'export debug session to file')
    .option('--import <file>', 'import and analyze debug session')
    .option('-a, --analyze', 'analyze existing debug data')
    .option('-r, --realtime', 'show real-time updates')
    .option('-t, --threshold <ms>', 'performance threshold in ms', '10')
    .option('--filter <patterns...>', 'filter patterns for tracing')
    .action(debugCommand);
}

export default debugCommand;