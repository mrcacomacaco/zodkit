import * as pc from 'picocolors';
import { SchemaDiscovery, SyncOptions, SyncResult } from '../../core/infrastructure/schema-discovery';
import { ConfigManager } from '../../core/config';

export interface SyncCommandOptions {
  watch?: boolean;
  autoSync?: boolean;
  conflicts?: 'auto' | 'interactive' | 'manual';
  dryRun?: boolean;
  backup?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  status?: boolean;
  reset?: boolean;
}

export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  try {
    console.log(pc.blue('🔄 zodkit sync - Zero-Config Schema Discovery & Sync'));

    const configManager = new ConfigManager();
    await configManager.loadConfig();
    const config = configManager.getConfig();

    const discovery = new SchemaDiscovery(config);

    // Status mode - show current sync status
    if (options.status) {
      await showSyncStatus(discovery, options);
      return;
    }

    // Reset mode - clear sync cache
    if (options.reset) {
      await resetSyncCache(discovery, options);
      return;
    }

    // Watch mode - continuous monitoring
    if (options.watch) {
      await startWatchMode(discovery, options);
      return;
    }

    // Auto-sync mode - one-time setup
    if (options.autoSync) {
      await enableAutoSync(discovery, options);
      return;
    }

    // Default: run sync once
    await runSingleSync(discovery, options);

  } catch (error) {
    console.error(pc.red('❌ Sync command failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function showSyncStatus(discovery: SchemaDiscovery, options: SyncCommandOptions): Promise<void> {
  console.log(pc.cyan('\n📊 Schema Sync Status'));

  try {
    const conflicts = await discovery.getConflicts();
    const schemas = await discovery.findSchemas({ useCache: true });

    console.log(`   ${pc.gray('Total schemas:')} ${schemas.length}`);
    console.log(`   ${pc.gray('Conflicts:')} ${conflicts.length > 0 ? pc.red(conflicts.length) : pc.green('0')}`);

    if (conflicts.length > 0) {
      console.log(pc.red('\n⚠️  Schema Conflicts:'));
      conflicts.forEach((conflict, index) => {
        console.log(`   ${index + 1}. ${pc.yellow(conflict.schemaName)} (${conflict.type})`);
        console.log(`      ${pc.gray('Files:')} ${conflict.files.join(', ')}`);
        console.log(`      ${pc.gray('Resolution:')} ${conflict.resolution || 'manual'}`);
      });

      console.log(pc.blue('\nResolve conflicts:'));
      console.log(`  ${pc.gray('$')} zodkit sync --conflicts interactive    # Interactive resolution`);
      console.log(`  ${pc.gray('$')} zodkit refactor --suggest              # Get refactoring suggestions`);
    }

    if (options.verbose) {
      console.log(pc.cyan('\n📁 Schema Files:'));
      const fileGroups = new Map<string, typeof schemas>();
      schemas.forEach(schema => {
        const group = fileGroups.get(schema.filePath) || [];
        group.push(schema);
        fileGroups.set(schema.filePath, group);
      });

      fileGroups.forEach((fileSchemas, filePath) => {
        console.log(`   ${pc.green('•')} ${filePath}`);
        fileSchemas.forEach(schema => {
          const exportIndicator = schema.isExported ? '📤' : '📦';
          console.log(`     ${exportIndicator} ${schema.name} (${schema.schemaType})`);
        });
      });
    }

  } catch (error) {
    console.log(pc.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
  }

  console.log(pc.blue('\nNext steps:'));
  console.log(`  ${pc.gray('$')} zodkit sync                    # Run sync`);
  console.log(`  ${pc.gray('$')} zodkit sync --watch            # Start watch mode`);
  console.log(`  ${pc.gray('$')} zodkit sync --auto-sync        # Enable auto-sync`);
}

async function resetSyncCache(discovery: SchemaDiscovery, options: SyncCommandOptions): Promise<void> {
  console.log(pc.yellow('\n🔄 Resetting sync cache...'));

  try {
    // Clear internal cache
    const result = await discovery.syncSchemas({
      dryRun: false,
      conflictResolution: 'auto'
    });

    console.log(pc.green(`✅ Sync cache reset successfully`));
    console.log(`   ${pc.gray('Schemas discovered:')} ${result.discovered}`);

    if (!options.quiet) {
      console.log(pc.blue('\nNext steps:'));
      console.log(`  ${pc.gray('$')} zodkit sync --status          # Check status`);
      console.log(`  ${pc.gray('$')} zodkit sync                   # Run sync`);
    }

  } catch (error) {
    console.log(pc.red(`❌ Failed to reset cache: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function startWatchMode(discovery: SchemaDiscovery, options: SyncCommandOptions): Promise<void> {
  console.log(pc.cyan('\n👀 Starting watch mode...'));
  console.log(pc.gray('Press Ctrl+C to stop watching'));

  const syncOptions: SyncOptions = {
    watchMode: true,
    conflictResolution: options.conflicts || 'auto'
  };

  if (options.backup !== undefined) {
    syncOptions.backup = options.backup;
  }
  if (options.dryRun !== undefined) {
    syncOptions.dryRun = options.dryRun;
  }

  // Set up event listeners
  discovery.on('sync:start', () => {
    if (!options.quiet) {
      console.log(pc.blue('🔄 Syncing schemas...'));
    }
  });

  discovery.on('sync:complete', (result: SyncResult) => {
    if (!options.quiet) {
      console.log(pc.green(`✅ Sync complete (${result.duration}ms)`));
      if (result.discovered > 0) console.log(`   ${pc.cyan('•')} Discovered: ${result.discovered}`);
      if (result.updated > 0) console.log(`   ${pc.yellow('•')} Updated: ${result.updated}`);
      if (result.removed > 0) console.log(`   ${pc.red('•')} Removed: ${result.removed}`);
    }
  });

  discovery.on('file:changed', ({ filePath }) => {
    if (options.verbose) {
      console.log(pc.gray(`📝 File changed: ${filePath}`));
    }
  });

  discovery.on('file:added', ({ filePath }) => {
    if (options.verbose) {
      console.log(pc.green(`➕ File added: ${filePath}`));
    }
  });

  discovery.on('file:removed', ({ filePath }) => {
    if (options.verbose) {
      console.log(pc.red(`➖ File removed: ${filePath}`));
    }
  });

  discovery.on('schema:discovered', (schema) => {
    if (options.verbose) {
      console.log(pc.green(`🆕 Schema discovered: ${schema.name} in ${schema.filePath}`));
    }
  });

  discovery.on('schema:updated', ({ __previous: _previous, current }) => {
    if (options.verbose) {
      console.log(pc.yellow(`🔄 Schema updated: ${current.name} in ${current.filePath}`));
    }
  });

  discovery.on('schema:removed', (schema) => {
    if (options.verbose) {
      console.log(pc.red(`🗑️  Schema removed: ${schema.name} from ${schema.filePath}`));
    }
  });

  discovery.on('sync:error', (error) => {
    console.log(pc.red(`❌ Sync error: ${error.error || error.message || String(error)}`));
  });

  try {
    await discovery.enableAutoSync(syncOptions);

    // Initial sync
    const initialResult = await discovery.syncSchemas(syncOptions);

    if (!options.quiet) {
      console.log(pc.green(`\n✅ Initial sync complete`));
      console.log(`   ${pc.gray('Discovered:')} ${initialResult.discovered}`);
      console.log(`   ${pc.gray('Updated:')} ${initialResult.updated}`);
      console.log(`   ${pc.gray('Removed:')} ${initialResult.removed}`);

      if (initialResult.conflicts.length > 0) {
        console.log(pc.yellow(`   ${pc.gray('Conflicts:')} ${initialResult.conflicts.length}`));
      }
    }

    console.log(pc.blue('\n🎯 Watching for changes... (Ctrl+C to stop)'));

    // Keep the process alive
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log(pc.yellow('\n👋 Stopping watch mode...'));
        resolve(undefined);
      });
    });

  } catch (error) {
    console.log(pc.red(`❌ Watch mode failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function enableAutoSync(discovery: SchemaDiscovery, options: SyncCommandOptions): Promise<void> {
  console.log(pc.cyan('\n🤖 Enabling auto-sync...'));

  const syncOptions: SyncOptions = {
    autoSync: true,
    conflictResolution: options.conflicts || 'auto',
    backup: options.backup !== false // Default to true
  };

  if (options.dryRun !== undefined) {
    syncOptions.dryRun = options.dryRun;
  }

  try {
    await discovery.enableAutoSync(syncOptions);

    console.log(pc.green(`✅ Auto-sync enabled successfully`));
    console.log(pc.gray('Schemas will be automatically synchronized when files change.'));

    if (!options.quiet) {
      console.log(pc.blue('\nManagement commands:'));
      console.log(`  ${pc.gray('$')} zodkit sync --status          # Check sync status`);
      console.log(`  ${pc.gray('$')} zodkit sync --watch           # Manual watch mode`);
      console.log(`  ${pc.gray('$')} zodkit sync --reset           # Reset and re-sync`);
    }

  } catch (error) {
    console.log(pc.red(`❌ Failed to enable auto-sync: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function runSingleSync(discovery: SchemaDiscovery, options: SyncCommandOptions): Promise<void> {
  console.log(pc.cyan('\n🔄 Running schema sync...'));

  const syncOptions: SyncOptions = {
    conflictResolution: options.conflicts || 'auto'
  };

  if (options.backup !== undefined) {
    syncOptions.backup = options.backup;
  }
  if (options.dryRun !== undefined) {
    syncOptions.dryRun = options.dryRun;
  }

  if (options.dryRun) {
    console.log(pc.yellow('🎭 Dry run mode - no changes will be made'));
  }

  try {
    const result = await discovery.syncSchemas(syncOptions);

    if (result.discovered === 0 && result.updated === 0 && result.removed === 0) {
      console.log(pc.green(`✅ Schemas are up to date`));
    } else {
      console.log(pc.green(`✅ Sync completed (${result.duration}ms)`));
      if (result.discovered > 0) console.log(`   ${pc.cyan('•')} Discovered: ${result.discovered} schemas`);
      if (result.updated > 0) console.log(`   ${pc.yellow('•')} Updated: ${result.updated} schemas`);
      if (result.removed > 0) console.log(`   ${pc.red('•')} Removed: ${result.removed} schemas`);
    }

    if (result.conflicts.length > 0) {
      console.log(pc.yellow(`\n⚠️  Found ${result.conflicts.length} conflict(s):`));
      result.conflicts.forEach((conflict, index) => {
        console.log(`   ${index + 1}. ${pc.yellow(conflict.schemaName)} (${conflict.type})`);
        console.log(`      ${pc.gray('Files:')} ${conflict.files.join(', ')}`);
      });

      console.log(pc.blue('\nResolve conflicts:'));
      console.log(`  ${pc.gray('$')} zodkit sync --conflicts interactive    # Interactive resolution`);
      console.log(`  ${pc.gray('$')} zodkit refactor --suggest              # Get refactoring suggestions`);
    }

    if (result.errors.length > 0) {
      console.log(pc.red(`\n❌ Found ${result.errors.length} error(s):`));
      result.errors.forEach((error, index) => {
        const severityColor = error.severity === 'error' ? pc.red : pc.yellow;
        console.log(`   ${index + 1}. ${severityColor(error.error)}`);
        console.log(`      ${pc.gray('File:')} ${error.filePath}`);
        if (error.suggestion) {
          console.log(`      ${pc.gray('Suggestion:')} ${error.suggestion}`);
        }
      });
    }

    if (!options.quiet) {
      console.log(pc.blue('\nNext steps:'));
      console.log(`  ${pc.gray('$')} zodkit sync --watch            # Start watch mode`);
      console.log(`  ${pc.gray('$')} zodkit sync --auto-sync        # Enable auto-sync`);
      console.log(`  ${pc.gray('$')} zodkit check                   # Validate schemas`);
    }

  } catch (error) {
    console.log(pc.red(`❌ Sync failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}