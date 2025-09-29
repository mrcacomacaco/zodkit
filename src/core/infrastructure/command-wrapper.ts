/**
 * @fileoverview Command wrapper for context preservation and analytics
 * @module CommandWrapper
 */

import * as pc from 'picocolors';
import { ContextManager, SessionInsight } from './context-manager';
import { SchemaInfo } from './schema-discovery';

export interface CommandResult {
  success: boolean;
  errorCount: number;
  warningCount: number;
  schemasProcessed: number;
  filesModified: string[];
  data?: any;
}

export interface WrappedCommandOptions {
  showSuggestions?: boolean;
  trackContext?: boolean;
  showInsights?: boolean;
}

export class CommandWrapper {
  private readonly contextManager: ContextManager;

  constructor(projectRoot?: string) {
    this.contextManager = new ContextManager(projectRoot);
  }

  async wrapCommand(
    command: string,
    args: string[],
    options: Record<string, any>,
    executor: () => Promise<CommandResult>,
    wrappedOptions: WrappedCommandOptions = {}
  ): Promise<CommandResult> {
    const {
      showSuggestions = true,
      trackContext = true,
      showInsights = false
    } = wrappedOptions;

    let contextId: string | undefined;
    // @ts-ignore: Reserved for future performance metrics
    const startTime = Date.now();

    try {
      // Start context tracking
      if (trackContext) {
        contextId = await this.contextManager.startCommand(command, args, options);
      }

      // Show pre-command suggestions if enabled
      if (showSuggestions && !options.json && !options.quiet) {
        await this.showPreCommandSuggestions(command);
      }

      // Execute the actual command
      const result = await executor();

      // End context tracking
      if (trackContext && contextId) {
        await this.contextManager.endCommand(contextId, result);
      }

      // Show post-command insights
      if (showInsights && !options.json && !options.quiet) {
        await this.showPostCommandInsights(command, result);
      }

      return result;

    } catch (error) {
      // Handle command failure
      const failureResult: CommandResult = {
        success: false,
        errorCount: 1,
        warningCount: 0,
        schemasProcessed: 0,
        filesModified: []
      };

      if (trackContext && contextId) {
        await this.contextManager.endCommand(contextId, failureResult);
      }

      throw error;
    }
  }

  async getContext(query: any) {
    return this.contextManager.getContext(query);
  }

  async getSuggestions(command?: string): Promise<SessionInsight[]> {
    return this.contextManager.getSuggestions(command);
  }

  async exportSession(): Promise<string> {
    return this.contextManager.exportSession();
  }

  async clearHistory(olderThanDays?: number): Promise<void> {
    return this.contextManager.clearHistory(olderThanDays);
  }

  private async showPreCommandSuggestions(command: string): Promise<void> {
    try {
      const suggestions = await this.contextManager.getSuggestions(command);

      if (suggestions.length > 0) {
        console.log(pc.cyan('💡 Suggestions based on recent activity:'));
        suggestions.slice(0, 2).forEach((suggestion, i) => {
          console.log(`   ${i + 1}. ${suggestion.message}`);
          if (suggestion.command) {
            console.log(`      ${pc.gray('Try:')} ${pc.cyan(suggestion.command)}`);
          }
        });
        console.log('');
      }
    } catch {
      // Silently ignore suggestion errors
    }
  }

  private async showPostCommandInsights(_command: string, result: CommandResult): Promise<void> {
    try {
      // Show insights based on command results
      const insights: SessionInsight[] = [];

      if (result.success && result.errorCount === 0) {
        insights.push({
          type: 'optimization',
          message: 'Great! All validations passed. Consider setting up automated checks.',
          confidence: 0.8,
          actionable: true,
          command: 'zodkit init --ci'
        });
      }

      if (result.errorCount > 5) {
        insights.push({
          type: 'warning',
          message: `Found ${result.errorCount} errors. Use 'fix' command to auto-resolve common issues.`,
          confidence: 0.9,
          actionable: true,
          command: 'zodkit fix'
        });
      }

      if (result.schemasProcessed > 20) {
        insights.push({
          type: 'optimization',
          message: 'Large project detected. Consider using profile mode to monitor performance.',
          confidence: 0.7,
          actionable: true,
          command: 'zodkit profile --watch'
        });
      }

      if (insights.length > 0) {
        console.log('\n' + pc.cyan('🔍 Insights:'));
        insights.forEach((insight, i) => {
          console.log(`   ${i + 1}. ${insight.message}`);
          if (insight.command) {
            console.log(`      ${pc.gray('Suggestion:')} ${pc.cyan(insight.command)}`);
          }
        });
      }
    } catch {
      // Silently ignore insight errors
    }
  }
}

// Helper function to create command-specific wrappers
export function createCommandWrapper(projectRoot?: string) {
  return new CommandWrapper(projectRoot);
}

// Utility function to track schema operations
export function trackSchemaOperation(
  _operation: string,
  schemas: SchemaInfo[],
  filesModified: string[] = []
): CommandResult {
  return {
    success: true,
    errorCount: 0,
    warningCount: 0,
    schemasProcessed: schemas.length,
    filesModified
  };
}

// Utility function to track validation results
export function trackValidationResults(
  errors: any[],
  warnings: any[],
  schemas: SchemaInfo[],
  filesModified: string[] = []
): CommandResult {
  return {
    success: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    schemasProcessed: schemas.length,
    filesModified
  };
}