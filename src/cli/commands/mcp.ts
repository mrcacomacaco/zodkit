/**
 * @fileoverview MCP (Model Context Protocol) server for AI integration
 * @module MCPCommand
 */

import * as pc from 'picocolors';
import { ConfigManager } from '../../core/config';
import { MCPServer } from '../../core/mcp-server';
import { existsSync, writeFileSync } from 'fs';

interface MCPOptions {
  port?: string;
  watch?: boolean;
  auth?: string;
  exposeFixes?: boolean;
}

export async function mcpCommand(
  action: string = 'serve',
  options: MCPOptions,
  command: any
): Promise<void> {
  const globalOpts = command.parent.opts();
  const isJsonMode = globalOpts.json;

  try {
    switch (action) {
      case 'serve':
        await startMCPServer(options, isJsonMode);
        break;
      case 'status':
        await checkMCPStatus(options, isJsonMode);
        break;
      case 'stop':
        await stopMCPServer(options, isJsonMode);
        break;
      case 'config':
        await generateMCPConfig(options, isJsonMode);
        break;
      default:
        throw new Error(`Unknown MCP action: ${action}`);
    }
  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'MCP_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ MCP failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

async function startMCPServer(options: MCPOptions, isJsonMode: boolean): Promise<void> {
  const port = parseInt(options.port || '3456', 10);

  if (!isJsonMode) {
    console.log(pc.blue('🚀 Starting zodkit MCP server...'));
  }

  const configManager = new ConfigManager();
  const config = await configManager.loadConfig();

  const serverOptions: any = {
    port,
    watch: options.watch || false,
    exposeFixes: options.exposeFixes || false,
    config
  };

  if (options.auth !== undefined) {
    serverOptions.auth = options.auth;
  }

  const server = new MCPServer(serverOptions);

  await server.start();

  if (isJsonMode) {
    console.log(JSON.stringify({
      success: true,
      server: {
        port,
        status: 'running',
        endpoints: server.getEndpoints(),
        capabilities: server.getCapabilities()
      }
    }, null, 2));
  } else {
    console.log(pc.green('✅ MCP server started successfully!'));
    console.log(pc.cyan('Port:'), port);
    console.log(pc.cyan('Status:'), 'Running');
    console.log(pc.cyan('Watch mode:'), options.watch ? 'Enabled' : 'Disabled');

    console.log('\n' + pc.bold('Available Endpoints:'));
    server.getEndpoints().forEach(endpoint => {
      console.log(`  ${pc.cyan(endpoint.method)} ${endpoint.path} - ${endpoint.description}`);
    });

    console.log('\n' + pc.bold('MCP Capabilities:'));
    server.getCapabilities().forEach(cap => {
      console.log(`  • ${cap}`);
    });

    console.log('\n' + pc.bold('AI Assistant Configuration:'));
    console.log(pc.gray('Add this to your AI assistant config:'));
    console.log(pc.yellow(JSON.stringify({
      mcpServers: {
        zodkit: {
          command: 'npx',
          args: ['zodkit', 'mcp', 'serve', '--port', port.toString()]
        }
      }
    }, null, 2)));

    console.log('\n' + pc.gray('Press Ctrl+C to stop the server'));

    // Keep server running
    process.on('SIGINT', async () => {
      console.log('\n' + pc.blue('🛑 Stopping MCP server...'));
      await server.stop();
      console.log(pc.green('✅ Server stopped'));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {}); // Infinite promise
  }
}

async function checkMCPStatus(options: MCPOptions, isJsonMode: boolean): Promise<void> {
  const port = parseInt(options.port || '3456', 10);

  try {
    // Check if server is responding
    const response = await fetch(`http://localhost:${port}/health`);
    const health = await response.json();

    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        status: 'running',
        health
      }, null, 2));
    } else {
      console.log(pc.green('✅ MCP server is running'));
      console.log(pc.cyan('Port:'), port);
      const healthData = health as any;
      console.log(pc.cyan('Uptime:'), healthData.uptime);
      console.log(pc.cyan('Requests:'), healthData.totalRequests);
      console.log(pc.cyan('Active connections:'), healthData.activeConnections);
    }
  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        status: 'stopped',
        error: 'Server not responding'
      }, null, 2));
    } else {
      console.log(pc.red('❌ MCP server is not running'));
      console.log(pc.gray(`Try: zodkit mcp serve --port ${port}`));
    }
  }
}

async function stopMCPServer(options: MCPOptions, isJsonMode: boolean): Promise<void> {
  const port = parseInt(options.port || '3456', 10);

  try {
    // Send shutdown signal to server
    await fetch(`http://localhost:${port}/shutdown`, {
      method: 'POST'
    });

    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        status: 'stopped'
      }, null, 2));
    } else {
      console.log(pc.green('✅ MCP server stopped'));
    }
  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: 'Server not responding or already stopped'
      }, null, 2));
    } else {
      console.log(pc.yellow('⚠️  Server not responding or already stopped'));
    }
  }
}

async function generateMCPConfig(options: MCPOptions, isJsonMode: boolean): Promise<void> {
  const port = parseInt(options.port || '3456', 10);

  // Generate config for different AI assistants
  const configs = {
    claude: {
      mcpServers: {
        zodkit: {
          command: 'npx',
          args: ['zodkit', 'mcp', 'serve', '--port', port.toString()]
        }
      }
    },
    cursor: {
      'mcp.servers': {
        zodkit: {
          command: 'npx',
          args: ['zodkit', 'mcp', 'serve', '--port', port.toString()],
          description: 'zodkit schema analysis and validation'
        }
      }
    },
    copilot: {
      tools: [{
        name: 'zodkit-mcp',
        url: `http://localhost:${port}`,
        description: 'Zod schema analysis and validation tools'
      }]
    }
  };

  if (isJsonMode) {
    console.log(JSON.stringify({ configs }, null, 2));
  } else {
    console.log(pc.bold('🔧 MCP Configuration Generator'));
    console.log(pc.gray('─'.repeat(50)));

    // Claude Code configuration
    console.log('\n' + pc.cyan('Claude Code (.claude/settings.json):'));
    const claudeConfig = JSON.stringify(configs.claude, null, 2);
    console.log(pc.gray(claudeConfig));

    // Write to file if in a Claude project
    if (existsSync('.claude')) {
      const claudePath = '.claude/settings.local.json';
      writeFileSync(claudePath, claudeConfig);
      console.log(pc.green(`✅ Saved to ${claudePath}`));
    }

    // Cursor configuration
    console.log('\n' + pc.cyan('Cursor (.cursor/config.json):'));
    const cursorConfig = JSON.stringify(configs.cursor, null, 2);
    console.log(pc.gray(cursorConfig));

    // Write to file if in a Cursor project
    if (existsSync('.cursor')) {
      const cursorPath = '.cursor/config.json';
      let existingConfig = {};
      if (existsSync(cursorPath)) {
        try {
          existingConfig = JSON.parse(require('fs').readFileSync(cursorPath, 'utf-8'));
        } catch {}
      }
      const mergedConfig = { ...existingConfig, ...configs.cursor };
      writeFileSync(cursorPath, JSON.stringify(mergedConfig, null, 2));
      console.log(pc.green(`✅ Saved to ${cursorPath}`));
    }

    // GitHub Copilot configuration
    console.log('\n' + pc.cyan('GitHub Copilot (copilot-tools.json):'));
    const copilotConfig = JSON.stringify(configs.copilot, null, 2);
    console.log(pc.gray(copilotConfig));

    console.log('\n' + pc.bold('Next Steps:'));
    console.log('1. Start the MCP server: ' + pc.cyan(`zodkit mcp serve --port ${port}`));
    console.log('2. Restart your AI assistant');
    console.log('3. Test the connection: ' + pc.cyan('Ask your AI about zodkit capabilities'));
  }
}