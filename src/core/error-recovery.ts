/**
 * @fileoverview Intelligent error recovery and suggestions system
 * @module ErrorRecovery
 */

import * as pc from 'picocolors';
import { suggestionEngine } from './command-suggestions';

/**
 * Error types we can intelligently handle
 */
export enum ErrorType {
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  INVALID_OPTION = 'INVALID_OPTION',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SCHEMA_PARSE_ERROR = 'SCHEMA_PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Recovery suggestion with action
 */
export interface RecoverySuggestion {
  message: string;
  action?: string;
  command?: string;
  confidence: number;
  type: 'fix' | 'suggestion' | 'information';
}

/**
 * Error context for intelligent analysis
 */
export interface ErrorContext {
  command?: string;
  args?: string[];
  options?: Record<string, any>;
  workingDirectory?: string;
  errorMessage?: string;
  stackTrace?: string;
}

/**
 * Intelligent error recovery engine
 */
export class ErrorRecoveryEngine {
  /**
   * Analyze error and provide recovery suggestions
   */
  analyzeError(error: Error | string, context: ErrorContext = {}): {
    type: ErrorType;
    suggestions: RecoverySuggestion[];
  } {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const type = this.classifyError(errorMessage, context);
    const suggestions = this.generateSuggestions(type, errorMessage, context);

    return { type, suggestions };
  }

  /**
   * Classify error type based on message and context
   */
  private classifyError(errorMessage: string, context: ErrorContext): ErrorType {
    const lowerMessage = errorMessage.toLowerCase();

    // Command not found patterns
    if (lowerMessage.includes('unknown command') ||
        lowerMessage.includes('command not found') ||
        lowerMessage.includes('is not a zodkit command')) {
      return ErrorType.COMMAND_NOT_FOUND;
    }

    // Invalid option patterns
    if (lowerMessage.includes('unknown option') ||
        lowerMessage.includes('invalid option') ||
        lowerMessage.includes('unrecognized flag')) {
      return ErrorType.INVALID_OPTION;
    }

    // Missing argument patterns
    if (lowerMessage.includes('missing required') ||
        lowerMessage.includes('argument required') ||
        lowerMessage.includes('expected argument')) {
      return ErrorType.MISSING_ARGUMENT;
    }

    // File system errors
    if (lowerMessage.includes('no such file') ||
        lowerMessage.includes('file not found') ||
        lowerMessage.includes('cannot find')) {
      return ErrorType.FILE_NOT_FOUND;
    }

    if (lowerMessage.includes('permission denied') ||
        lowerMessage.includes('access denied') ||
        lowerMessage.includes('eacces')) {
      return ErrorType.PERMISSION_DENIED;
    }

    // Schema errors
    if (lowerMessage.includes('schema') &&
        (lowerMessage.includes('parse') || lowerMessage.includes('invalid'))) {
      return ErrorType.SCHEMA_PARSE_ERROR;
    }

    if (lowerMessage.includes('validation') ||
        lowerMessage.includes('expected') && lowerMessage.includes('received')) {
      return ErrorType.VALIDATION_ERROR;
    }

    // Dependency errors
    if (lowerMessage.includes('cannot find module') ||
        lowerMessage.includes('module not found') ||
        lowerMessage.includes('package not found')) {
      return ErrorType.DEPENDENCY_ERROR;
    }

    // Config errors
    if (lowerMessage.includes('config') ||
        lowerMessage.includes('configuration')) {
      return ErrorType.CONFIG_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Generate recovery suggestions based on error type
   */
  private generateSuggestions(
    type: ErrorType,
    errorMessage: string,
    context: ErrorContext
  ): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    switch (type) {
      case ErrorType.COMMAND_NOT_FOUND:
        suggestions.push(...this.handleCommandNotFound(errorMessage, context));
        break;

      case ErrorType.INVALID_OPTION:
        suggestions.push(...this.handleInvalidOption(errorMessage, context));
        break;

      case ErrorType.MISSING_ARGUMENT:
        suggestions.push(...this.handleMissingArgument(errorMessage, context));
        break;

      case ErrorType.FILE_NOT_FOUND:
        suggestions.push(...this.handleFileNotFound(errorMessage, context));
        break;

      case ErrorType.PERMISSION_DENIED:
        suggestions.push(...this.handlePermissionDenied(errorMessage, context));
        break;

      case ErrorType.SCHEMA_PARSE_ERROR:
        suggestions.push(...this.handleSchemaParseError(errorMessage, context));
        break;

      case ErrorType.VALIDATION_ERROR:
        suggestions.push(...this.handleValidationError(errorMessage, context));
        break;

      case ErrorType.DEPENDENCY_ERROR:
        suggestions.push(...this.handleDependencyError(errorMessage, context));
        break;

      case ErrorType.CONFIG_ERROR:
        suggestions.push(...this.handleConfigError(errorMessage, context));
        break;

      default:
        suggestions.push(...this.handleUnknownError(errorMessage, context));
        break;
    }

    // Always add general suggestions
    suggestions.push(...this.getGeneralSuggestions(context));

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private handleCommandNotFound(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const attemptedCommand = this.extractCommandFromError(errorMessage, context);

    if (attemptedCommand) {
      // Find similar commands using fuzzy matching
      const similarCommands = this.findSimilarCommands(attemptedCommand);

      if (similarCommands.length > 0) {
        suggestions.push({
          message: `Did you mean "${similarCommands[0]}"?`,
          command: `zodkit ${similarCommands[0]}`,
          confidence: 0.9,
          type: 'fix'
        });
      }

      // Check if it might be a typo in common commands
      const commonTypos: Record<string, string> = {
        'chck': 'check',
        'chek': 'check',
        'scaffld': 'scaffold',
        'scafold': 'scaffold',
        'generat': 'generate',
        'analyz': 'analyze',
        'optmize': 'optimize'
      };

      if (commonTypos[attemptedCommand]) {
        suggestions.push({
          message: `Did you mean "${commonTypos[attemptedCommand]}"? (common typo)`,
          command: `zodkit ${commonTypos[attemptedCommand]}`,
          confidence: 0.95,
          type: 'fix'
        });
      }
    }

    suggestions.push({
      message: 'Run "zodkit --help" to see all available commands',
      command: 'zodkit --help',
      confidence: 0.7,
      type: 'information'
    });

    suggestions.push({
      message: 'Get smart suggestions based on your project',
      command: 'zodkit suggestions',
      confidence: 0.8,
      type: 'suggestion'
    });

    return suggestions;
  }

  private handleInvalidOption(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const invalidOption = this.extractOptionFromError(errorMessage);

    if (invalidOption && context.command) {
      suggestions.push({
        message: `Run "zodkit ${context.command} --help" to see valid options`,
        command: `zodkit ${context.command} --help`,
        confidence: 0.9,
        type: 'information'
      });

      // Check for common option typos
      const optionTypos: Record<string, string> = {
        '--wat': '--watch',
        '--watc': '--watch',
        '--verbos': '--verbose',
        '--interactiv': '--interactive',
        '--dryrun': '--dry-run',
        '--jason': '--json'
      };

      if (optionTypos[invalidOption]) {
        suggestions.push({
          message: `Did you mean "${optionTypos[invalidOption]}"?`,
          confidence: 0.95,
          type: 'fix'
        });
      }
    }

    return suggestions;
  }

  private handleMissingArgument(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    if (context.command) {
      suggestions.push({
        message: `Run "zodkit ${context.command} --help" to see required arguments`,
        command: `zodkit ${context.command} --help`,
        confidence: 0.9,
        type: 'information'
      });

      // Command-specific suggestions
      switch (context.command) {
        case 'scaffold':
          suggestions.push({
            message: 'Scaffold requires a TypeScript file: zodkit scaffold types.ts',
            command: 'zodkit scaffold types.ts',
            confidence: 0.8,
            type: 'suggestion'
          });
          break;

        case 'check':
          suggestions.push({
            message: 'Check all schemas: zodkit check (no arguments needed)',
            command: 'zodkit check',
            confidence: 0.8,
            type: 'suggestion'
          });
          break;
      }
    }

    return suggestions;
  }

  private handleFileNotFound(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const filePath = this.extractFilePathFromError(errorMessage);

    if (filePath) {
      suggestions.push({
        message: `Check if the file path is correct: ${filePath}`,
        confidence: 0.8,
        type: 'information'
      });

      // Suggest creating the file if it's a common pattern
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        suggestions.push({
          message: `Create the file if it doesn't exist`,
          confidence: 0.7,
          type: 'suggestion'
        });
      }

      // Suggest running from correct directory
      suggestions.push({
        message: 'Make sure you\'re in the correct directory',
        confidence: 0.6,
        type: 'information'
      });
    }

    return suggestions;
  }

  private handlePermissionDenied(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    return [
      {
        message: 'Try running with appropriate permissions',
        confidence: 0.8,
        type: 'suggestion'
      },
      {
        message: 'Check file/directory permissions',
        confidence: 0.7,
        type: 'information'
      },
      {
        message: 'Ensure you have write access to the target directory',
        confidence: 0.6,
        type: 'information'
      }
    ];
  }

  private handleSchemaParseError(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    return [
      {
        message: 'Run zodkit check to identify schema issues',
        command: 'zodkit check',
        confidence: 0.9,
        type: 'fix'
      },
      {
        message: 'Use zodkit fix to auto-fix common schema problems',
        command: 'zodkit fix',
        confidence: 0.8,
        type: 'fix'
      },
      {
        message: 'Get detailed hints about schema issues',
        command: 'zodkit hint',
        confidence: 0.7,
        type: 'suggestion'
      }
    ];
  }

  private handleValidationError(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    return [
      {
        message: 'Check your schema definition for type mismatches',
        confidence: 0.8,
        type: 'information'
      },
      {
        message: 'Use zodkit test to validate your schemas with sample data',
        command: 'zodkit test',
        confidence: 0.7,
        type: 'suggestion'
      },
      {
        message: 'Generate mock data to test your schemas',
        command: 'zodkit mock',
        confidence: 0.6,
        type: 'suggestion'
      }
    ];
  }

  private handleDependencyError(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    const moduleName = this.extractModuleNameFromError(errorMessage);

    if (moduleName) {
      suggestions.push({
        message: `Install missing dependency: npm install ${moduleName}`,
        command: `npm install ${moduleName}`,
        confidence: 0.9,
        type: 'fix'
      });
    }

    suggestions.push({
      message: 'Run npm install to install all dependencies',
      command: 'npm install',
      confidence: 0.8,
      type: 'fix'
    });

    suggestions.push({
      message: 'Check if you\'re in the correct project directory',
      confidence: 0.7,
      type: 'information'
    });

    return suggestions;
  }

  private handleConfigError(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    return [
      {
        message: 'Initialize zodkit configuration',
        command: 'zodkit init',
        confidence: 0.9,
        type: 'fix'
      },
      {
        message: 'Check your zodkit.config.js file for syntax errors',
        confidence: 0.8,
        type: 'information'
      },
      {
        message: 'Use a configuration preset',
        command: 'zodkit --preset dev',
        confidence: 0.7,
        type: 'suggestion'
      }
    ];
  }

  private handleUnknownError(errorMessage: string, context: ErrorContext): RecoverySuggestion[] {
    return [
      {
        message: 'Try running with --verbose for more details',
        confidence: 0.6,
        type: 'information'
      },
      {
        message: 'Check the GitHub issues for similar problems',
        confidence: 0.5,
        type: 'information'
      }
    ];
  }

  private getGeneralSuggestions(context: ErrorContext): RecoverySuggestion[] {
    const contextSuggestions = suggestionEngine.getSuggestions();

    return contextSuggestions.slice(0, 2).map(suggestion => ({
      message: `Try: ${suggestion.description}`,
      command: suggestion.example,
      confidence: suggestion.confidence * 0.5, // Lower confidence for general suggestions
      type: 'suggestion' as const
    }));
  }

  // Helper methods for parsing error messages
  private extractCommandFromError(errorMessage: string, context: ErrorContext): string | null {
    if (context.command) return context.command;

    const match = errorMessage.match(/unknown command[:\s]+"?([^"'\s]+)"?/i);
    return match ? match[1] : null;
  }

  private extractOptionFromError(errorMessage: string): string | null {
    const match = errorMessage.match(/unknown option[:\s]+"?([^"'\s]+)"?/i);
    return match ? match[1] : null;
  }

  private extractFilePathFromError(errorMessage: string): string | null {
    const match = errorMessage.match(/no such file or directory[:\s]+'?([^'"\s]+)'?/i) ||
                  errorMessage.match(/cannot find[:\s]+'?([^'"\s]+)'?/i);
    return match ? match[1] : null;
  }

  private extractModuleNameFromError(errorMessage: string): string | null {
    const match = errorMessage.match(/cannot find module[:\s]+'?([^'"\s]+)'?/i);
    return match ? match[1] : null;
  }

  private findSimilarCommands(attempted: string): string[] {
    const availableCommands = [
      'check', 'fix', 'hint', 'scaffold', 'generate', 'test', 'profile',
      'migrate', 'compose', 'refactor', 'sync', 'mock', 'explain',
      'analyze', 'optimize', 'gen', 'perf', 'ui', 'init'
    ];

    return availableCommands
      .map(cmd => ({ cmd, distance: this.levenshteinDistance(attempted, cmd) }))
      .filter(({ distance }) => distance <= 2)
      .sort((a, b) => a.distance - b.distance)
      .map(({ cmd }) => cmd)
      .slice(0, 3);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

/**
 * Display error with recovery suggestions
 */
export function displayErrorWithRecovery(error: Error | string, context: ErrorContext = {}): void {
  const recovery = new ErrorRecoveryEngine();
  const { type, suggestions } = recovery.analyzeError(error, context);

  const errorMessage = typeof error === 'string' ? error : error.message;

  console.error(pc.red('❌ Error:'), errorMessage);

  if (suggestions.length > 0) {
    console.log(pc.cyan('\n💡 Suggestions:'));

    suggestions.forEach((suggestion, index) => {
      const icon = suggestion.type === 'fix' ? '🔧' :
                   suggestion.type === 'suggestion' ? '💭' : 'ℹ️';

      console.log(`${icon} ${suggestion.message}`);

      if (suggestion.command) {
        console.log(`   ${pc.gray('$')} ${pc.dim(suggestion.command)}`);
      }
    });
  }

  console.log(pc.gray('\n💡 Get more help: zodkit suggestions'));
}

/**
 * Global error recovery instance
 */
export const errorRecovery = new ErrorRecoveryEngine();