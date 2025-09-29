#!/usr/bin/env node

import { Command } from 'commander';
import * as pc from 'picocolors';
import { version } from '../../package.json';
import { addGlobalOptions, OptionGroups } from './global-options';
import { checkCommand } from './commands/check';
import { initCommand } from './commands/init';
import { fixCommand } from './commands/fix';
import { explainCommand } from './commands/explain';
import { migrateCommand } from './commands/migrate';
import { generateCommand } from './commands/generate';
import { refactorCommand } from './commands/refactor';
import { syncCommand } from './commands/sync';
import { testCommand } from './commands/test';
import { profilerCommand as profileCommand } from './commands/profiler';
import { composeCommand } from './commands/compose';
import { contractCommand } from './commands/contract';
import { mockCommand } from './commands/mock';
import { mcpCommand } from './commands/mcp';
import { mapCommand } from './commands/map';
import { contextCommand } from './commands/context';
import { cacheCommand } from './commands/cache';
import { healthCommand } from './commands/health';
import { bridgeCommand } from './commands/bridge';
import { collaborateCommand } from './commands/collaborate';
import { debugCommand } from './commands/debug';
import { templatesCommand } from './commands/templates';
import { interactiveCommand } from './commands/interactive';
import { ideCommand } from './commands/ide';
import { forensicsCommand } from './commands/forensics';
import { profilerCommand } from './commands/profiler';
import { hintCommand } from './commands/hint';
import { scaffoldCommand } from './commands/scaffold';
import { dashboardCommand } from './commands/dashboard';

const program = new Command();

// Add global options to main program
addGlobalOptions(program
  .name('zodkit')
  .description(`${pc.blue('⚡ zodkit')} - AI-optimized Zod schema intelligence platform

${pc.cyan('🎯 Recommended:')}
  ${pc.gray('$')} zodkit ui                 # Launch unified TUI dashboard

${pc.cyan('Quick Start (CLI mode):')}
  ${pc.gray('$')} zodkit check              # Analyze schemas for issues
  ${pc.gray('$')} zodkit fix                # Auto-fix schema problems
  ${pc.gray('$')} zodkit hint --interactive # Best practice suggestions
  ${pc.gray('$')} zodkit scaffold types.ts  # Generate Zod from TypeScript

${pc.cyan('Smart Aliases:')}
  ${pc.gray('$')} zodkit analyze            # alias for: check --analyze --coverage
  ${pc.gray('$')} zodkit optimize           # alias for: hint --fix --performance
  ${pc.gray('$')} zodkit gen                # alias for: generate
  ${pc.gray('$')} zodkit perf               # alias for: profile --runtime

${pc.cyan('Documentation:')} https://zodkit.dev
${pc.cyan('GitHub:')} https://github.com/JSONbored/zodkit`)
  .version(version))
  .option('--no-color', 'Disable colored output');

// Main unified dashboard - the primary way to use zodkit
program
  .command('dashboard')
  .alias('ui')
  .alias('tui')
  .description(`Launch the unified TUI dashboard - All zodkit features in one interface

${pc.cyan('This is the recommended way to use zodkit!')}

${pc.cyan('Features:')}
  • Run any zodkit command interactively
  • Command palette with auto-complete (Ctrl+P)
  • Command history navigation
  • Real-time output streaming
  • Built-in help system

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit dashboard              # Launch the dashboard
  ${pc.gray('$')} zodkit ui                     # Shorter alias
  ${pc.gray('$')} zodkit tui                    # Terminal UI alias

${pc.cyan('Inside the dashboard:')}
  ${pc.gray('❯')} check                        # Run check command
  ${pc.gray('❯')} hint --fix                   # Run hint with auto-fix
  ${pc.gray('❯')} scaffold types.ts            # Generate schemas
  ${pc.gray('❯')} ?                            # Show help`)
  .option('--theme <theme>', 'color theme: dark, light, neon', 'dark')
  .option('--cwd <path>', 'initial working directory')
  .option('--history <file>', 'load command history from file')
  .action(dashboardCommand);

// Primary commands - streamlined with global options
OptionGroups.analysis(program
  .command('check')
  .description(`Analyze schemas for issues and validation problems

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit check                      # Check all schemas
  ${pc.gray('$')} zodkit check UserSchema           # Check specific schema
  ${pc.gray('$')} zodkit check --coverage           # Coverage report`)
  .argument('[schema]', 'specific schema to check')
  .option('--unused', 'find unused schemas')
  .option('--duplicates', 'find duplicate schemas')
  .option('--complexity', 'analyze complexity'))
  .action(checkCommand);

program
  .command('fix')
  .description(`Automatically fix schema issues

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit fix                        # Fix all auto-fixable issues
  ${pc.gray('$')} zodkit fix UserSchema             # Fix specific schema`)
  .argument('[schema]', 'specific schema to fix')
  .option('--unsafe', 'apply potentially unsafe fixes')
  .action(fixCommand);

// New developer experience features
program
  .command('hint')
  .description(`Inline performance & best practice suggestions for Zod schemas

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit hint                       # Analyze all schemas
  ${pc.gray('$')} zodkit hint --interactive         # Interactive TUI dashboard
  ${pc.gray('$')} zodkit hint --watch --fix         # Watch mode with auto-fix
  ${pc.gray('$')} zodkit hint --severity error      # Only show errors
  ${pc.gray('$')} zodkit hint src/**/*.ts --fix     # Fix all issues`)
  .argument('[patterns...]', 'file patterns to analyze')
  .option('--watch', 'watch for changes')
  .option('--fix', 'automatically fix issues')
  .option('--interactive', 'launch interactive TUI dashboard')
  .option('--severity <levels>', 'filter by severity: error,warning,info,performance')
  .option('--rules <rules>', 'specific rules to run')
  .option('--json', 'output as JSON')
  .option('--quiet', 'suppress output except errors')
  .option('--config <path>', 'path to config file')
  .action(hintCommand);

program
  .command('scaffold')
  .description(`Generate Zod schemas from TypeScript types with smart pattern detection

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit scaffold types.ts          # Generate schemas
  ${pc.gray('$')} zodkit scaffold types.ts --interactive # TUI dashboard
  ${pc.gray('$')} zodkit scaffold types.ts --watch  # Auto-regenerate on changes
  ${pc.gray('$')} zodkit scaffold types.ts --output schemas.ts
  ${pc.gray('$')} zodkit scaffold --patterns         # Enable pattern detection`)
  .argument('<input>', 'TypeScript file with types/interfaces')
  .option('--output <path>', 'output file path (default: <input>.schema.ts)')
  .option('--watch', 'watch for changes and regenerate')
  .option('--interactive', 'launch interactive TUI dashboard')
  .option('--patterns', 'enable smart pattern detection', true)
  .option('--preserve-jsdoc', 'preserve JSDoc comments', true)
  .option('--refinements', 'add smart refinements', true)
  .option('--generics', 'handle generic types', true)
  .option('--two-way', 'enable two-way sync')
  .option('--incremental', 'incremental updates only')
  .option('--import-style <style>', 'import style: named|namespace|auto', 'auto')
  .option('--dry-run', 'preview without writing files')
  .option('--custom-patterns <file>', 'custom pattern detection rules')
  .action(scaffoldCommand);

// New AI-optimized commands
program
  .command('explain')
  .description(`Explain a schema in detail (AI-friendly)

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit explain UserSchema         # Explain specific schema
  ${pc.gray('$')} zodkit explain --all              # Explain all schemas
  ${pc.gray('$')} zodkit explain --json             # JSON output for AI`)
  .argument('[schema]', 'schema to explain')
  .option('--all', 'explain all schemas')
  .option('--relationships', 'include relationship info')
  .option('--usage', 'show where schema is used')
  .option('--examples', 'include example data')
  .action(explainCommand);

program
  .command('migrate')
  .description(`Schema migration and evolution assistant with safe evolution strategies

${pc.cyan('Migration Actions:')}
  ${pc.green('create')}      Create new migration from schema changes
  ${pc.green('analyze')}     Analyze migration compatibility and risks
  ${pc.green('validate')}    Validate migration before execution
  ${pc.green('execute')}     Execute migration with safety checks
  ${pc.green('rollback')}    Rollback migration with automatic recovery
  ${pc.green('plan')}        Create evolution plan for complex changes
  ${pc.green('status')}      Show migration status and history
  ${pc.green('list')}        List all available migrations
  ${pc.green('diff')}        Show schema differences
  ${pc.green('preview')}     Preview migration effects
  ${pc.green('history')}     Show migration history
  ${pc.green('cleanup')}     Clean up old migrations
  ${pc.green('interactive')} Interactive migration creation and management

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit migrate create --from schema-v1.ts --to schema-v2.ts --name "add-email-field"
  ${pc.gray('$')} zodkit migrate analyze --from schema-v1.ts --to schema-v2.ts --strategy gradual
  ${pc.gray('$')} zodkit migrate execute migration-123 --strategy blue-green --dry-run
  ${pc.gray('$')} zodkit migrate rollback migration-123 --force
  ${pc.gray('$')} zodkit migrate plan --from current.ts --to target.ts --phases 3
  ${pc.gray('$')} zodkit migrate interactive           # Guided migration creation`)
  .argument('[action]', 'migration action: create, analyze, validate, execute, rollback, plan, status, list, diff, preview, history, cleanup, interactive')
  .option('--from <path>', 'source schema file path')
  .option('--to <path>', 'target schema file path')
  .option('--name <name>', 'migration name')
  .option('--strategy <type>', 'migration strategy: gradual, immediate, blue-green, feature-flag, versioned', 'gradual')
  .option('--phases <n>', 'number of migration phases for evolution planning', parseInt)
  .option('--migration-id <id>', 'specific migration ID for operations')
  .option('--rollback-strategy <type>', 'rollback strategy: automatic, manual, snapshot')
  .option('--risk-tolerance <level>', 'risk tolerance: low, medium, high', 'medium')
  .option('--compatibility-mode <mode>', 'compatibility mode: strict, loose, legacy')
  .option('--validation-level <level>', 'validation level: basic, comprehensive, strict')
  .option('--dry-run', 'preview migration without executing')
  .option('--force', 'force migration execution (bypass safety checks)')
  .option('--backup', 'create backup before migration', true)
  .option('--timeline <duration>', 'migration timeline (e.g., "2w", "1m")')
  .option('--environment <env>', 'target environment: development, staging, production')
  .option('--parallel', 'enable parallel migration execution')
  .option('--monitoring', 'enable migration monitoring')
  .option('--notifications', 'enable migration notifications')
  .option('--auto-rollback', 'enable automatic rollback on failure')
  .option('--impact-analysis', 'perform detailed impact analysis')
  .option('--breaking-changes', 'allow breaking changes')
  .option('--preview-data <path>', 'test data for migration preview')
  .option('--output-format <format>', 'output format: console, json, table, detailed', 'console')
  .option('--interactive', 'interactive mode for guided migration')
  .action(migrateCommand);

program
  .command('generate')
  .description(`Generate Zod schemas from real data sources

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit generate --from-json data.json --output ./schemas
  ${pc.gray('$')} zodkit generate --from-url https://api.example.com/users --output ./schemas
  ${pc.gray('$')} zodkit generate --from-database users --connection postgres://... --output ./schemas
  ${pc.gray('$')} zodkit generate --learn --input ./logs --output ./schemas
  ${pc.gray('$')} zodkit generate --from json --input ./data --output ./schemas --name UserData`)
  .option('--from <source>', 'source type: json, typescript, openapi', 'json')
  .option('--from-json <path>', 'generate from JSON file with advanced analysis')
  .option('--from-url <url>', 'generate from API endpoint responses')
  .option('--from-database <table>', 'generate from database table (use "all" for all tables)')
  .option('--connection <string>', 'database connection string')
  .option('--learn', 'learn patterns from existing data files')
  .option('--watch <pattern>', 'watch for file changes and regenerate')
  .option('-i, --input <path>', 'input file or directory')
  .option('-o, --output <path>', 'output directory for generated schemas')
  .option('-n, --name <name>', 'schema name prefix')
  .option('--format <type>', 'output format: typescript, javascript, zod-only', 'typescript')
  .option('--strict', 'use strict type inference')
  .option('--optional', 'make all fields optional by default')
  .option('--merge', 'merge similar object structures')
  .option('--samples <count>', 'number of API samples to analyze', '3')
  .option('--overwrite', 'overwrite existing schema files')
  .option('-c, --config <path>', 'custom config file path')
  .action(generateCommand);

program
  .command('refactor')
  .description(`Smart schema refactoring with impact analysis

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit refactor --suggest --schema UserSchema    # Get refactoring suggestions
  ${pc.gray('$')} zodkit refactor --analyze --schema UserSchema --operation rename --new-name UserProfile
  ${pc.gray('$')} zodkit refactor --plan --schema UserSchema --operation add-field --field-name email
  ${pc.gray('$')} zodkit refactor --execute --dry-run              # Simulate refactoring
  ${pc.gray('$')} zodkit refactor --execute --schema UserSchema --operation remove-field --field-name deprecated`)
  .option('-s, --schema <name>', 'schema to refactor')
  .option('--operation <type>', 'refactor operation: rename, add-field, remove-field, change-type, split, merge, extract-union')
  .option('--target <name>', 'target for the operation')
  .option('--new-name <name>', 'new name for rename operations')
  .option('--field-name <name>', 'field name for field operations')
  .option('--field-type <type>', 'field type for add-field/change-type operations')
  .option('--analyze', 'analyze refactoring impact')
  .option('--suggest', 'suggest refactoring opportunities')
  .option('--plan', 'create detailed refactor plan')
  .option('--execute', 'execute refactoring plan')
  .option('--dry-run', 'simulate execution without making changes')
  .option('--interactive', 'interactive mode with confirmations')
  .option('--backup', 'create backup before refactoring', true)
  .option('--safe-mode', 'stop on first error', true)
  .option('--confidence <n>', 'minimum confidence threshold (0-1)', parseFloat)
  .option('--force', 'force execution of high-risk operations')
  .action(refactorCommand);

program
  .command('sync')
  .description(`Zero-config schema discovery and synchronization

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit sync                      # Sync schemas once
  ${pc.gray('$')} zodkit sync --watch              # Start watch mode
  ${pc.gray('$')} zodkit sync --auto-sync          # Enable auto-sync
  ${pc.gray('$')} zodkit sync --status             # Show sync status
  ${pc.gray('$')} zodkit sync --reset              # Reset sync cache
  ${pc.gray('$')} zodkit sync --dry-run            # Preview changes`)
  .option('--watch', 'start watch mode for continuous monitoring')
  .option('--auto-sync', 'enable automatic synchronization')
  .option('--conflicts <mode>', 'conflict resolution mode: auto, interactive, manual', 'auto')
  .option('--dry-run', 'preview changes without applying them')
  .option('--backup', 'create backup before making changes', true)
  .option('--status', 'show current sync status')
  .option('--reset', 'reset sync cache and re-sync')
  .option('--quiet', 'suppress non-error output')
  .option('--verbose', 'show detailed output')
  .action(syncCommand);

program
  .command('test')
  .description(`Instant schema testing and validation with fuzzing

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit test                      # Test all schemas
  ${pc.gray('$')} zodkit test --schema UserSchema  # Test specific schema
  ${pc.gray('$')} zodkit test --fuzz 1000          # Intensive fuzzing (1000 iterations)
  ${pc.gray('$')} zodkit test --performance        # Performance benchmarks
  ${pc.gray('$')} zodkit test --watch              # Continuous testing
  ${pc.gray('$')} zodkit test --generate 100       # Generate test data
  ${pc.gray('$')} zodkit test --interactive        # Guided testing`)
  .option('-s, --schema <name>', 'test specific schema')
  .option('--fuzz <n>', 'number of fuzz test iterations', parseInt)
  .option('--property', 'enable property-based testing', true)
  .option('--edge', 'enable edge case testing', true)
  .option('--performance', 'enable performance testing')
  .option('--coverage', 'enable coverage analysis', true)
  .option('-o, --output <path>', 'output report file path')
  .option('--format <type>', 'report format: json, junit, text, html', 'text')
  .option('--seed <n>', 'random seed for reproducible tests', parseInt)
  .option('--timeout <ms>', 'test timeout in milliseconds', parseInt)
  .option('--parallel', 'run tests in parallel')
  .option('--bail', 'stop on first test failure')
  .option('--watch', 'watch mode - run tests on file changes')
  .option('--suite <path>', 'run specific test suite file')
  .option('--generate <n>', 'generate test data samples', parseInt)
  .option('--benchmark', 'run performance benchmarks')
  .option('--interactive', 'interactive testing mode')
  .option('--verbose', 'verbose output with detailed results')
  .option('--quiet', 'minimal output')
  .action(testCommand);

program
  .command('profile')
  .description(`Profile schema performance in production

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit profile                    # Start profiling
  ${pc.gray('$')} zodkit profile --runtime          # Runtime telemetry
  ${pc.gray('$')} zodkit profile --report           # Generate report
  ${pc.gray('$')} zodkit profile --watch            # Live dashboard`)
  .option('--runtime', 'enable runtime profiling')
  .option('--report', 'generate performance report')
  .option('--watch', 'live performance dashboard')
  .option('--export <path>', 'export telemetry data')
  .action(profileCommand);

program
  .command('compose')
  .description(`Advanced schema composition toolkit with powerful operations

${pc.cyan('Operations:')}
  ${pc.green('union')}        Create union of multiple schemas
  ${pc.green('intersection')} Create intersection of schemas
  ${pc.green('merge')}        Intelligently merge object schemas
  ${pc.green('extend')}       Extend schema with additional properties
  ${pc.green('inherit')}      Create inheritance hierarchy
  ${pc.green('transform')}    Apply transformations (partial, required, etc.)
  ${pc.green('chain')}        Chain multiple operations
  ${pc.green('analyze')}      Analyze schemas for composition opportunities

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit compose union --input user.ts admin.ts
  ${pc.gray('$')} zodkit compose merge --input base.ts extension.ts
  ${pc.gray('$')} zodkit compose transform --input schema.ts --transform partial
  ${pc.gray('$')} zodkit compose chain --input base.ts --chain "partial()|array()"
  ${pc.gray('$')} zodkit compose inherit --input base.ts mixin.ts child.ts
  ${pc.gray('$')} zodkit compose templates                # List transformers
  ${pc.gray('$')} zodkit compose stats                    # Show statistics`)
  .argument('[action]', 'composition action: union, intersection, merge, extend, inherit, transform, chain, analyze, templates, stats')
  .option('--input <files...>', 'input schema files')
  .option('--output <path>', 'output file path')
  .option('--operation <type>', 'composition operation when no action specified')
  .option('--strategy <type>', 'composition strategy: strict, override, merge, union, intersection', 'merge')
  .option('--transform <name>', 'transformer name for transform operation')
  .option('--chain <ops>', 'chain operations: "operation1()|operation2()"')
  .option('--preserve-metadata', 'preserve schema metadata', true)
  .option('--optimize', 'optimize result schemas', true)
  .option('--generate-examples', 'generate usage examples')
  .option('--track-changes', 'track composition changes')
  .option('--max-depth <n>', 'maximum composition depth', '10')
  .option('--cache', 'enable result caching', true)
  .option('--dry-run', 'preview changes without applying')
  .option('--interactive', 'interactive composition mode')
  .option('--verbose', 'show detailed output')
  .action(composeCommand);

program
  .command('contract')
  .description(`Contract testing between services

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit contract --between frontend backend
  ${pc.gray('$')} zodkit contract --validate        # Validate contracts
  ${pc.gray('$')} zodkit contract --generate        # Generate contract tests`)
  .option('--between <services...>', 'services to test')
  .option('--validate', 'validate existing contracts')
  .option('--generate', 'generate contract tests')
  .option('--ci', 'CI mode - fail on contract violations')
  .action(contractCommand);

program
  .command('mock')
  .description(`Generate realistic mock data from schemas

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit mock UserSchema            # Generate one mock
  ${pc.gray('$')} zodkit mock UserSchema --count 100 # Generate 100 mocks
  ${pc.gray('$')} zodkit mock --realistic           # Use AI patterns
  ${pc.gray('$')} zodkit mock --locale en-US        # Locale-specific data`)
  .argument('[schema]', 'schema to generate mocks from')
  .option('--count <n>', 'number of mocks to generate', '1')
  .option('--realistic', 'use realistic AI-powered patterns')
  .option('--locale <code>', 'locale for generated data')
  .option('--seed <n>', 'seed for reproducible generation')
  .option('--relationships', 'maintain referential integrity')
  .action(mockCommand);

program
  .command('map')
  .description(`Map schema relationships and dependencies

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit map                        # Interactive TUI map
  ${pc.gray('$')} zodkit map --visualize            # ASCII visualization
  ${pc.gray('$')} zodkit map UserSchema             # Map specific schema
  ${pc.gray('$')} zodkit map --export graph.json    # Export dependency graph`)
  .argument('[schema]', 'specific schema to map')
  .option('--visualize', 'show ASCII visualization')
  .option('--depth <n>', 'dependency depth to explore')
  .option('--export <path>', 'export dependency graph')
  .action(mapCommand);

// MCP Server command
program
  .command('mcp')
  .description(`Model Context Protocol server for AI integration

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit mcp serve                  # Start MCP server
  ${pc.gray('$')} zodkit mcp serve --port 3456      # Custom port
  ${pc.gray('$')} zodkit mcp status                 # Check server status
  ${pc.gray('$')} zodkit mcp stop                   # Stop server`)
  .argument('[action]', 'serve, status, or stop', 'serve')
  .option('--port <n>', 'server port', '3456')
  .option('--watch', 'hot-reload on schema changes')
  .option('--auth <token>', 'authentication token')
  .option('--expose-fixes', 'allow AI to apply fixes')
  .action(mcpCommand);

program
  .command('context')
  .description(`Analyze and manage command context and history

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit context                    # Show recent activity
  ${pc.gray('$')} zodkit context --query errors     # Show error patterns
  ${pc.gray('$')} zodkit context --suggestions      # Get AI suggestions
  ${pc.gray('$')} zodkit context --export           # Export session data
  ${pc.gray('$')} zodkit context --clear --days 30  # Clear old history`)
  .option('--query <type>', 'query type: last, errors, performance, schema')
  .option('--schema <name>', 'filter by schema name')
  .option('--export', 'export current session')
  .option('--clear', 'clear context history')
  .option('--days <n>', 'days to keep when clearing')
  .option('--insights', 'show detailed insights')
  .option('--suggestions', 'show actionable suggestions')
  .option('--limit <n>', 'limit number of results')
  .action(contextCommand);

program
  .command('cache')
  .description(`Advanced caching and streaming operations management

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit cache stats                # Show cache statistics
  ${pc.gray('$')} zodkit cache clear                # Clear all cache
  ${pc.gray('$')} zodkit cache warmup               # Warm up cache
  ${pc.gray('$')} zodkit cache monitor --watch      # Live cache monitoring
  ${pc.gray('$')} zodkit cache stream               # Show streaming metrics
  ${pc.gray('$')} zodkit cache export ./backup.json # Export cache
  ${pc.gray('$')} zodkit cache invalidate --pattern "validation:*" # Invalidate by pattern`)
  .argument('[action]', 'cache action: stats, clear, warmup, export, import, monitor, stream, invalidate')
  .option('--clear', 'clear all cache entries')
  .option('--stats', 'show cache statistics')
  .option('--warmup', 'warm up cache with common operations')
  .option('--streaming', 'include streaming service metrics')
  .option('--monitor', 'start cache monitoring')
  .option('--watch', 'continuous monitoring mode')
  .option('--export <path>', 'export cache to file')
  .option('--import <path>', 'import cache from file')
  .option('--size <mb>', 'cache size limit in MB')
  .option('--ttl <seconds>', 'time to live in seconds')
  .option('--compression', 'enable compression')
  .option('--eviction-policy <policy>', 'eviction policy: lru, lfu, ttl, priority')
  .option('--persist-to-disk', 'enable disk persistence')
  .option('--memory-limit <mb>', 'memory limit in MB')
  .option('--pattern <regex>', 'pattern for invalidation')
  .option('--tags <tags...>', 'tags for invalidation')
  .action(cacheCommand);

program
  .command('health')
  .description(`Comprehensive schema health monitoring and analysis

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit health                     # Show current health status
  ${pc.gray('$')} zodkit health check               # Perform comprehensive health check
  ${pc.gray('$')} zodkit health start --watch       # Start continuous monitoring
  ${pc.gray('$')} zodkit health dashboard          # Start real-time dashboard
  ${pc.gray('$')} zodkit health score               # Show just the health score
  ${pc.gray('$')} zodkit health trends --days 30    # Show 30-day health trends
  ${pc.gray('$')} zodkit health fix                 # Apply auto-fixes for issues
  ${pc.gray('$')} zodkit health report --export ./health.html --format html`)
  .argument('[action]', 'health action: status, check, start, stop, dashboard, score, trends, fix, report, recommendations')
  .option('--start', 'start health monitoring')
  .option('--stop', 'stop health monitoring')
  .option('--watch', 'continuous monitoring mode')
  .option('--dashboard', 'start real-time dashboard')
  .option('--continuous', 'run continuous monitoring')
  .option('--auto-fix', 'enable automatic fixing of issues')
  .option('--export <path>', 'export health report to file')
  .option('--format <type>', 'export format: json, html, csv', 'json')
  .option('--categories <categories...>', 'include specific categories')
  .option('--exclude-categories <categories...>', 'exclude specific categories')
  .option('--severity <level>', 'filter by severity: critical, warning, info')
  .option('--trends', 'show health trends')
  .option('--days <n>', 'number of days for trends', '7')
  .option('--score', 'show only health score')
  .option('--recommendations', 'show recommendations')
  .option('--detailed', 'show detailed report')
  .option('--notifications', 'enable notifications')
  .option('--interval <seconds>', 'monitoring interval in seconds')
  .option('--threshold <score>', 'health score threshold')
  .option('--compact', 'compact dashboard mode')
  .option('--theme <mode>', 'dashboard theme: dark, light, auto', 'auto')
  .option('--quiet', 'minimal output')
  .action(healthCommand);

program
  .command('bridge')
  .description(`Cross-framework schema bridge for universal compatibility

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit bridge convert --from zod --to joi --input schema.ts --output schema.joi.js
  ${pc.gray('$')} zodkit bridge detect --input unknown-schema.js
  ${pc.gray('$')} zodkit bridge compatibility
  ${pc.gray('$')} zodkit bridge list
  ${pc.gray('$')} zodkit bridge validate --from json-schema --input schema.json
  ${pc.gray('$')} zodkit bridge convert --from typescript --to zod < types.ts > schema.zod.ts`)
  .argument('[action]', 'bridge action: convert, detect, validate, compatibility, list, batch, interactive')
  .option('--from <framework>', 'source framework: zod, joi, yup, ajv, json-schema, typescript, etc.')
  .option('--to <framework>', 'target framework: zod, joi, yup, ajv, json-schema, typescript, etc.')
  .option('-i, --input <file>', 'input file (use "-" for stdin)')
  .option('-o, --output <file>', 'output file')
  .option('--detect', 'auto-detect source framework')
  .option('--validate', 'validate converted schema')
  .option('--compatibility', 'show framework compatibility matrix')
  .option('--list', 'list supported frameworks')
  .option('--strict', 'strict conversion mode')
  .option('--preserve-metadata', 'preserve schema metadata')
  .option('--interactive', 'interactive conversion mode')
  .option('--batch', 'batch process multiple files')
  .option('--format <type>', 'output format: code, json, yaml', 'code')
  .option('--include <patterns...>', 'include file patterns for batch')
  .option('--exclude <patterns...>', 'exclude file patterns for batch')
  .option('--dry-run', 'preview conversion without executing')
  .option('--verbose', 'verbose output')
  .action(bridgeCommand);

program
  .command('collaborate')
  .description(`Real-time schema collaboration with conflict resolution

${pc.cyan('Collaboration Modes:')}
  ${pc.green('live')}         Real-time collaborative editing
  ${pc.green('review')}       Code review and approval workflow
  ${pc.green('merge')}        Conflict resolution and merging
  ${pc.green('planning')}     Schema design planning sessions
  ${pc.green('documentation')} Collaborative documentation
  ${pc.green('testing')}      Collaborative testing and validation

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit collaborate create --name "API Design" --mode planning
  ${pc.gray('$')} zodkit collaborate join abc123 --name "John Doe"
  ${pc.gray('$')} zodkit collaborate server --port 3000
  ${pc.gray('$')} zodkit collaborate list
  ${pc.gray('$')} zodkit collaborate watch abc123
  ${pc.gray('$')} zodkit collaborate invite abc123 --invite user@example.com`)
  .argument('[action]', 'collaboration action: create, join, leave, server, list, status, invite, resolve, watch')
  .option('--name <name>', 'user or session name')
  .option('--email <email>', 'user email address')
  .option('--session-id <id>', 'collaboration session ID')
  .option('--mode <type>', 'collaboration mode: live, review, merge, planning, documentation, testing', 'live')
  .option('--role <type>', 'user role: owner, editor, reviewer, observer', 'editor')
  .option('--port <number>', 'server port for WebSocket connections', '3000')
  .option('--max-users <number>', 'maximum users in session', '10')
  .option('--auto-save', 'enable automatic saving', true)
  .option('--save-interval <ms>', 'auto-save interval in milliseconds', '30000')
  .option('--conflict-resolution <type>', 'conflict resolution strategy: automatic, manual, voting', 'manual')
  .option('--require-approval', 'require approval for changes')
  .option('--enable-comments', 'enable commenting system', true)
  .option('--enable-versioning', 'enable version control', true)
  .option('--files <files...>', 'files to add to collaboration session')
  .option('--invite <emails...>', 'email addresses to invite')
  .option('--server', 'start collaboration server')
  .option('--join <session-id>', 'join session by ID')
  .option('--list', 'list active sessions')
  .option('--interactive', 'interactive collaboration mode')
  .option('--watch', 'watch session for real-time updates')
  .action(collaborateCommand);

program
  .command('debug')
  .description(`Advanced schema debugging with comprehensive analysis

${pc.cyan('Debug Modes:')}
  ${pc.green('validation')}    Debug validation failures with detailed traces
  ${pc.green('performance')}   Analyze performance bottlenecks
  ${pc.green('complexity')}    Analyze schema complexity
  ${pc.green('breakpoints')}   Set conditional breakpoints
  ${pc.green('trace')}         Enable detailed execution traces
  ${pc.green('auto-fix')}      Apply automatic fixes for common issues

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit debug start --name "User Schema Debug"
  ${pc.gray('$')} zodkit debug validate --schema UserSchema --data ./user.json
  ${pc.gray('$')} zodkit debug performance --schema UserSchema --iterations 1000
  ${pc.gray('$')} zodkit debug breakpoint --schema UserSchema --path "address.street"
  ${pc.gray('$')} zodkit debug analyze --schema UserSchema --complexity
  ${pc.gray('$')} zodkit debug report --session debug-session-1 --format html`)
  .argument('[action]', 'debug action: start, stop, validate, performance, complexity, breakpoint, trace, analyze, fix, report, sessions')
  .option('--session-id <id>', 'debug session ID')
  .option('--name <name>', 'debug session name')
  .option('--schema <name>', 'schema to debug')
  .option('--data <path>', 'test data file path')
  .option('--iterations <n>', 'number of performance test iterations', '100')
  .option('--path <path>', 'schema path for breakpoints (dot notation)')
  .option('--condition <expr>', 'breakpoint condition expression')
  .option('--log-message <msg>', 'custom log message for breakpoint')
  .option('--enable-trace', 'enable detailed execution traces')
  .option('--trace-depth <n>', 'maximum trace depth', '10')
  .option('--complexity', 'enable complexity analysis')
  .option('--performance', 'enable performance profiling')
  .option('--auto-fix', 'enable automatic fix detection and application')
  .option('--suggestions', 'show optimization suggestions')
  .option('--export <path>', 'export debug report to file')
  .option('--format <type>', 'report format: console, json, html, markdown', 'console')
  .option('--include-fixes', 'include auto-fix results in reports')
  .option('--watch', 'watch mode for continuous debugging')
  .option('--interactive', 'interactive debugging mode')
  .option('--verbose', 'verbose debug output')
  .action(debugCommand);

program
  .command('templates')
  .description(`Custom schema templates and marketplace for reusable patterns

${pc.cyan('Template Operations:')}
  ${pc.green('create')}        Create new template from schema
  ${pc.green('install')}       Install template to project
  ${pc.green('search')}        Search marketplace for templates
  ${pc.green('publish')}       Publish template to marketplace
  ${pc.green('marketplace')}   Browse template marketplace
  ${pc.green('validate')}      Validate template structure

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit templates create --name "User Auth" --path ./auth.schema.ts
  ${pc.gray('$')} zodkit templates search --query "authentication" --category api
  ${pc.gray('$')} zodkit templates install --name "auth-template-123" --examples
  ${pc.gray('$')} zodkit templates marketplace --featured
  ${pc.gray('$')} zodkit templates interactive
  ${pc.gray('$')} zodkit templates stats`)
  .argument('[action]', 'template action: create, install, search, list, show, validate, publish, unpublish, stats, marketplace, interactive')
  .option('--name <name>', 'template name or ID')
  .option('--path <path>', 'schema file path')
  .option('--description <desc>', 'template description')
  .option('--category <cat>', 'template category: api, database, forms, etc.')
  .option('--tags <tags>', 'comma-separated tags')
  .option('--author <name>', 'author name')
  .option('--version <ver>', 'template version')
  .option('--license <license>', 'template license')
  .option('--framework <fw>', 'target framework: zod, joi, yup, etc.')
  .option('--language <lang>', 'target language: typescript, javascript')
  .option('--output <path>', 'output directory')
  .option('--format <type>', 'output format: json, console, table, detailed', 'console')
  .option('--examples', 'include/generate examples')
  .option('--docs', 'include/generate documentation')
  .option('--tests', 'include/generate tests')
  .option('--interactive', 'interactive template mode')
  .option('--publish', 'publish after creation')
  .option('--registry <url>', 'template registry URL')
  .option('--customizations <json>', 'template customizations as JSON')
  .option('--overwrite', 'overwrite existing files')
  .option('--backup', 'create backup before changes')
  .option('--validate', 'validate template before operations')
  .option('--search <query>', 'search query')
  .option('--limit <n>', 'limit number of results', '20')
  .option('--offset <n>', 'result offset for pagination', '0')
  .option('--sort-by <field>', 'sort by: name, rating, downloads, updated, created')
  .option('--sort-order <order>', 'sort order: asc, desc')
  .option('--difficulty <level>', 'filter by difficulty: beginner, intermediate, advanced')
  .option('--rating <n>', 'minimum rating filter')
  .option('--featured', 'show featured templates only')
  .option('--trending', 'show trending templates')
  .option('--recent', 'show recent templates')
  .option('--stats', 'show marketplace statistics')
  .action(templatesCommand);

program
  .command('interactive')
  .description(`Interactive mode for AI assistants

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit interactive                # Start interactive session
  ${pc.gray('$')} zodkit interactive --json         # JSON mode for AI`)
  .option('--json', 'JSON input/output mode')
  .option('--context <schema>', 'set initial context')
  .action(interactiveCommand);

program
  .command('ide')
  .description(`Launch IDE-Quality Terminal Experience with visual schema editing

${pc.cyan('Visual Features:')}
  ${pc.green('syntax')}        Advanced Zod syntax highlighting
  ${pc.green('autocomplete')}  Intelligent code completion
  ${pc.green('validation')}    Real-time error checking
  ${pc.green('minimap')}       Code overview and navigation
  ${pc.green('panels')}        Multi-panel layout system
  ${pc.green('themes')}        Customizable color themes
  ${pc.green('keybindings')}   Vi/Emacs key binding support

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit ide                        # Launch IDE with empty workspace
  ${pc.gray('$')} zodkit ide --file schema.ts       # Open specific file
  ${pc.gray('$')} zodkit ide --workspace ./project  # Open workspace
  ${pc.gray('$')} zodkit ide --theme dark           # Use dark theme
  ${pc.gray('$')} zodkit ide --fullscreen           # Start in fullscreen mode
  ${pc.gray('$')} zodkit ide --panels editor,tree,validation --readonly`)
  .option('--file <path>', 'open specific schema file')
  .option('--workspace <path>', 'open workspace directory')
  .option('--theme <name>', 'color theme: dark, light, high-contrast, monokai', 'dark')
  .option('--config <path>', 'custom configuration file')
  .option('--fullscreen', 'start in fullscreen mode')
  .option('--panels <panels>', 'comma-separated list of panels to show', 'editor,tree,validation')
  .option('--readonly', 'open in read-only mode')
  .option('--debug', 'enable debug mode with verbose output')
  .option('--experimental', 'enable experimental features')
  .action(ideCommand);

program
  .command('forensics')
  .description(`Data Validation Forensics for debugging failures with intelligent analysis

${pc.cyan('Investigation Capabilities:')}
  ${pc.green('analysis')}      Deep validation failure analysis with root cause identification
  ${pc.green('patterns')}      Pattern detection across multiple failures
  ${pc.green('suggestions')}   AI-powered fix suggestions with impact analysis
  ${pc.green('similarity')}    Find similar cases and their resolutions
  ${pc.green('tracking')}      Track investigations and resolution progress
  ${pc.green('reporting')}     Comprehensive forensics reports
  ${pc.green('performance')}   Performance and complexity analysis

${pc.cyan('Investigation Workflow:')}
  ${pc.green('1. create')}     Create forensics session with schema
  ${pc.green('2. investigate')} Investigate validation failures
  ${pc.green('3. analyze')}    Analyze patterns and trends
  ${pc.green('4. suggest')}    Generate intelligent fix suggestions
  ${pc.green('5. apply')}      Apply fixes with validation
  ${pc.green('6. report')}     Generate comprehensive reports

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit forensics create --schema user.ts --name "User Validation Debug"
  ${pc.gray('$')} zodkit forensics investigate --session sess-123 --data invalid-user.json
  ${pc.gray('$')} zodkit forensics investigate --session sess-123 --data users/ --bulk --batch-size 50
  ${pc.gray('$')} zodkit forensics analyze --session sess-123 --patterns --threshold 3
  ${pc.gray('$')} zodkit forensics suggest --session sess-123 --severity critical,high
  ${pc.gray('$')} zodkit forensics similar --similar inv-456 --threshold 0.8
  ${pc.gray('$')} zodkit forensics report --session sess-123 --format html --output report.html`)
  .argument('[action]', 'forensics action: create, investigate, analyze, suggest, apply, report, list, similar, sessions, status, interactive')
  .option('--session <id>', 'forensics session ID')
  .option('--schema <file>', 'schema file for creating new session')
  .option('--data <file>', 'data file or directory for investigation')
  .option('--name <name>', 'session or investigation name')
  .option('--output <file>', 'output file for reports')
  .option('--format <type>', 'output format: json, html, markdown, console', 'console')
  .option('--verbose', 'verbose output with detailed analysis')
  .option('--watch', 'watch mode for continuous monitoring')
  .option('--bulk', 'bulk investigation mode for multiple data files')
  .option('--batch-size <n>', 'batch size for bulk operations', '10')
  .option('--include-analysis', 'include detailed analysis (default: true)')
  .option('--include-suggestions', 'include fix suggestions (default: true)')
  .option('--auto-apply', 'automatically apply safe suggestions')
  .option('--threshold <n>', 'similarity or frequency threshold', '0.7')
  .option('--patterns', 'focus on pattern analysis')
  .option('--similar <id>', 'find cases similar to investigation ID')
  .option('--tags <tags>', 'comma-separated tags for categorization')
  .option('--severity <levels>', 'filter by severity: critical, high, medium, low')
  .option('--category <categories>', 'filter by category: type-mismatch, missing-property, etc.')
  .option('--time-range <range>', 'time range filter: start,end (ISO dates)')
  .action(forensicsCommand);

program
  .command('profiler')
  .description(`Schema Performance Profiler with intelligent optimization and auto-tuning

${pc.cyan('Profiling Capabilities:')}
  ${pc.green('benchmarking')}   Comprehensive performance benchmarking with statistical analysis
  ${pc.green('optimization')}   AI-powered optimization detection and automatic application
  ${pc.green('monitoring')}     Real-time performance monitoring and alerting
  ${pc.green('prediction')}     Performance forecasting and capacity planning
  ${pc.green('analysis')}       Deep bottleneck analysis and root cause identification
  ${pc.green('comparison')}     Profile comparison and performance regression detection
  ${pc.green('reporting')}      Detailed performance reports with actionable insights

${pc.cyan('Optimization Features:')}
  ${pc.green('auto-tune')}      Automatic schema optimization with safety validation
  ${pc.green('smart-cache')}    Intelligent caching strategies for validation
  ${pc.green('lazy-eval')}      Lazy evaluation optimization for complex schemas
  ${pc.green('parallel')}       Parallel validation for large datasets
  ${pc.green('memory')}         Memory usage optimization and leak detection
  ${pc.green('algorithmic')}    Algorithm-level performance improvements

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit profiler create --schema user.ts --name "User Schema Performance"
  ${pc.gray('$')} zodkit profiler benchmark --profile prof-123 --iterations 10000 --parallel
  ${pc.gray('$')} zodkit profiler analyze --profile prof-123 --detailed --optimization
  ${pc.gray('$')} zodkit profiler optimize --profile prof-123 --auto-optimize --confidence 0.9
  ${pc.gray('$')} zodkit profiler monitor --profile prof-123 --interval 30 --duration 7200
  ${pc.gray('$')} zodkit profiler predict --profile prof-123 --horizon 24 --scenarios load,scale,stress
  ${pc.gray('$')} zodkit profiler compare --profile prof-123 --compare prof-456
  ${pc.gray('$')} zodkit profiler report --profile prof-123 --format html --output performance.html`)
  .argument('[action]', 'profiler action: create, benchmark, analyze, optimize, monitor, predict, report, compare, list, status, trends, alerts, dashboard')
  .option('--profile <id>', 'performance profile ID')
  .option('--schema <file>', 'schema file for creating new profile')
  .option('--name <name>', 'profile or benchmark name')
  .option('--output <file>', 'output file for reports')
  .option('--format <type>', 'output format: json, html, csv, console', 'console')
  .option('--benchmark <type>', 'benchmark type: standard, stress, edge-cases, real-world')
  .option('--iterations <n>', 'number of benchmark iterations', '1000')
  .option('--warmup <n>', 'number of warmup rounds', '100')
  .option('--timeout <ms>', 'benchmark timeout in milliseconds', '30000')
  .option('--parallel', 'enable parallel benchmarking')
  .option('--monitoring', 'enable real-time monitoring during benchmarks')
  .option('--interval <seconds>', 'monitoring interval in seconds', '60')
  .option('--duration <seconds>', 'monitoring duration in seconds')
  .option('--optimization <id>', 'specific optimization ID to apply')
  .option('--auto-optimize', 'automatically apply safe optimizations')
  .option('--validate', 'validate optimizations before applying (default: true)')
  .option('--dry-run', 'simulate optimization without applying changes')
  .option('--threshold <n>', 'confidence threshold for auto-optimization', '0.8')
  .option('--confidence <n>', 'minimum confidence level for predictions', '0.8')
  .option('--horizon <hours>', 'prediction horizon in hours', '24')
  .option('--scenarios <list>', 'comma-separated prediction scenarios')
  .option('--time-range <range>', 'time range for analysis: start,end (ISO dates)')
  .option('--metrics <list>', 'comma-separated metrics to focus on')
  .option('--severity <levels>', 'alert severity filter: info, warning, critical')
  .option('--detailed', 'enable detailed analysis and reporting')
  .option('--baseline', 'use as baseline benchmark')
  .option('--compare <id>', 'profile ID to compare against')
  .option('--trend', 'include trend analysis in reports')
  .option('--predict', 'include performance predictions')
  .action(profilerCommand);

// Legacy but improved commands
program
  .command('init')
  .description(`Initialize zodkit in your project

${pc.cyan('Examples:')}
  ${pc.gray('$')} zodkit init                       # Interactive setup
  ${pc.gray('$')} zodkit init --ai cursor,claude    # Setup AI rules
  ${pc.gray('$')} zodkit init --mcp                 # Enable MCP server`)
  .option('--pm <manager>', 'package manager: pnpm, bun, yarn, npm')
  .option('--ai <tools...>', 'AI tools: cursor, claude, copilot, windsurf')
  .option('--mcp', 'enable MCP server integration')
  .option('--strict', 'strict validation rules')
  .option('--skip-install', 'skip dependency installation')
  .action(initCommand);

// Smart command aliases for common workflows
program
  .command('analyze')
  .alias('a')
  .description('Alias for: check --analyze --coverage --performance')
  .argument('[schema]', 'specific schema to analyze')
  .action(async (schema, options, command) => {
    // Merge global options with analysis-specific options
    const globalOpts = command.parent.opts();
    const analysisOpts = {
      ...options,
      ...globalOpts,
      analyze: true,
      coverage: true,
      performance: true
    };
    await checkCommand(schema, analysisOpts, command);
  });

program
  .command('optimize')
  .alias('opt')
  .description('Alias for: hint --fix --performance --auto-optimize')
  .argument('[patterns...]', 'file patterns to optimize')
  .action(async (patterns, options, command) => {
    const globalOpts = command.parent.opts();
    const optimizeOpts = {
      ...options,
      ...globalOpts,
      fix: true,
      performance: true,
      autoOptimize: true
    };
    await hintCommand(patterns, optimizeOpts, command);
  });

program
  .command('gen')
  .alias('g')
  .description('Alias for: generate')
  .action(async (options, command) => {
    const globalOpts = command.parent.opts();
    await generateCommand({ ...options, ...globalOpts }, command);
  });

program
  .command('perf')
  .alias('p')
  .description('Alias for: profile --runtime --monitoring')
  .action(async (options, command) => {
    const globalOpts = command.parent.opts();
    const perfOpts = {
      ...options,
      ...globalOpts,
      runtime: true,
      monitoring: true
    };
    await profileCommand(perfOpts, command);
  });

// Global error handling
process.on('unhandledRejection', (error: Error) => {
  console.error(pc.red('⚠ Unhandled error:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

// Parse and execute
program.parseAsync(process.argv).catch((error: Error) => {
  const opts = program.opts();

  if (opts.json) {
    // Output error as JSON for AI consumption
    console.log(JSON.stringify({
      success: false,
      error: {
        message: error.message,
        code: 'COMMAND_ERROR',
        stack: opts.verbose ? error.stack : undefined
      }
    }, null, 2));
  } else {
    console.error(pc.red('❌ Error:'), error.message);
    if (opts.verbose) {
      console.error(pc.gray(error.stack || ''));
    }
  }
  process.exit(1);
});