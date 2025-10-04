/**
 * @fileoverview Standardized error handling for CLI commands
 * @module Core/ErrorHandler
 */

import * as pc from 'picocolors';
import { z } from 'zod';

/**
 * Error codes for categorizing errors
 */
export enum ErrorCode {
	// File system errors
	FILE_NOT_FOUND = 'FILE_NOT_FOUND',
	FILE_READ_ERROR = 'FILE_READ_ERROR',
	FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
	PERMISSION_DENIED = 'PERMISSION_DENIED',

	// Validation errors
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	SCHEMA_PARSE_ERROR = 'SCHEMA_PARSE_ERROR',
	INVALID_INPUT = 'INVALID_INPUT',

	// Runtime errors
	COMMAND_FAILED = 'COMMAND_FAILED',
	UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
	TIMEOUT = 'TIMEOUT',

	// User errors
	USER_CANCELLED = 'USER_CANCELLED',
	CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * Structured error class for CLI commands
 */
export class CommandError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
		public readonly details?: unknown,
		public readonly suggestions?: string[],
	) {
		super(message);
		this.name = 'CommandError';
		Error.captureStackTrace(this, CommandError);
	}
}

/**
 * Error context for better debugging
 */
interface ErrorContext {
	command: string;
	file?: string;
	line?: number;
	timestamp: Date;
}

/**
 * Standardized error handler for CLI commands
 */
export class ErrorHandler {
	private verbose: boolean = false;

	constructor(options?: { verbose?: boolean }) {
		this.verbose = options?.verbose ?? false;
	}

	/**
	 * Handle errors with standardized formatting and exit codes
	 */
	handle(error: unknown, context: ErrorContext): never {
		// Handle CommandError with structured information
		if (error instanceof CommandError) {
			this.printCommandError(error, context);
			process.exit(this.getExitCode(error.code));
		}

		// Handle Zod validation errors
		if (error instanceof z.ZodError) {
			this.printZodError(error, context);
			process.exit(1);
		}

		// Handle Node.js system errors
		if (this.isNodeError(error)) {
			this.printNodeError(error, context);
			process.exit(1);
		}

		// Handle generic Error instances
		if (error instanceof Error) {
			this.printGenericError(error, context);
			process.exit(1);
		}

		// Handle unknown error types
		this.printUnknownError(error, context);
		process.exit(1);
	}

	/**
	 * Handle errors without exiting (for recoverable errors)
	 */
	handleRecoverable(error: unknown, context: ErrorContext): void {
		if (error instanceof CommandError) {
			this.printCommandError(error, context);
			return;
		}

		if (error instanceof Error) {
			console.error(pc.yellow(`⚠️  ${error.message}`));
			if (this.verbose) {
				console.error(pc.gray(error.stack ?? ''));
			}
			return;
		}

		console.error(pc.yellow(`⚠️  ${String(error)}`));
	}

	/**
	 * Print CommandError with structured formatting
	 */
	private printCommandError(error: CommandError, context: ErrorContext): void {
		console.error(pc.red(`\n❌ ${context.command} failed: ${error.message}`));

		if (error.details && this.verbose) {
			console.error(pc.gray('\nDetails:'));
			console.error(pc.gray(JSON.stringify(error.details, null, 2)));
		}

		if (error.suggestions && error.suggestions.length > 0) {
			console.error(pc.cyan('\n💡 Suggestions:'));
			for (const suggestion of error.suggestions) {
				console.error(pc.cyan(`  • ${suggestion}`));
			}
		}

		if (context.file) {
			console.error(pc.gray(`\nFile: ${context.file}`));
			if (context.line) {
				console.error(pc.gray(`Line: ${context.line}`));
			}
		}

		if (this.verbose && error.stack) {
			console.error(pc.gray('\nStack trace:'));
			console.error(pc.gray(error.stack));
		}
	}

	/**
	 * Print Zod validation error
	 */
	private printZodError(error: z.ZodError, context: ErrorContext): void {
		console.error(pc.red(`\n❌ ${context.command} failed: Validation error`));
		console.error(pc.red('\nValidation errors:'));

		for (const issue of error.issues) {
			const path = issue.path.join('.');
			console.error(pc.red(`  • ${path ?? 'root'}: ${issue.message}`));
		}

		console.error(pc.cyan('\n💡 Suggestion:'));
		console.error(pc.cyan('  • Check your input parameters and try again'));
	}

	/**
	 * Print Node.js system error
	 */
	private printNodeError(error: NodeJS.ErrnoException, context: ErrorContext): void {
		const errorMap: Record<string, { message: string; suggestions: string[] }> = {
			ENOENT: {
				message: 'File or directory not found',
				suggestions: [
					'Check that the file path is correct',
					'Ensure the file exists',
					'Use absolute paths if relative paths are failing',
				],
			},
			EACCES: {
				message: 'Permission denied',
				suggestions: [
					'Check file permissions',
					'Try running with appropriate permissions',
					'Ensure you have write access to the directory',
				],
			},
			EISDIR: {
				message: 'Expected a file, got a directory',
				suggestions: ['Provide a file path, not a directory'],
			},
			EMFILE: {
				message: 'Too many open files',
				suggestions: ['Close some files and try again', 'Increase system file descriptor limit'],
			},
		};

		const errorInfo = errorMap[error.code ?? ''] ?? {
			message: error.message,
			suggestions: ['Check the error details and try again'],
		};

		console.error(pc.red(`\n❌ ${context.command} failed: ${errorInfo.message}`));

		if (error.path) {
			console.error(pc.gray(`Path: ${error.path}`));
		}

		console.error(pc.cyan('\n💡 Suggestions:'));
		for (const suggestion of errorInfo.suggestions) {
			console.error(pc.cyan(`  • ${suggestion}`));
		}

		if (this.verbose) {
			console.error(pc.gray(`\nError code: ${error.code}`));
			console.error(pc.gray(`System error: ${error.syscall}`));
			if (error.stack) {
				console.error(pc.gray('\nStack trace:'));
				console.error(pc.gray(error.stack));
			}
		}
	}

	/**
	 * Print generic Error
	 */
	private printGenericError(error: Error, context: ErrorContext): void {
		console.error(pc.red(`\n❌ ${context.command} failed: ${error.message}`));

		if (this.verbose && error.stack) {
			console.error(pc.gray('\nStack trace:'));
			console.error(pc.gray(error.stack));
		}
	}

	/**
	 * Print unknown error
	 */
	private printUnknownError(error: unknown, context: ErrorContext): void {
		console.error(pc.red(`\n❌ ${context.command} failed: Unknown error`));
		console.error(pc.red(String(error)));

		if (this.verbose) {
			console.error(pc.gray('\nError object:'));
			console.error(pc.gray(JSON.stringify(error, null, 2)));
		}
	}

	/**
	 * Check if error is a Node.js system error
	 */
	private isNodeError(error: unknown): error is NodeJS.ErrnoException {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof (error as NodeJS.ErrnoException).code === 'string'
		);
	}

	/**
	 * Get exit code based on error code
	 */
	private getExitCode(code: ErrorCode): number {
		const exitCodeMap: Record<ErrorCode, number> = {
			[ErrorCode.FILE_NOT_FOUND]: 2,
			[ErrorCode.FILE_READ_ERROR]: 3,
			[ErrorCode.FILE_WRITE_ERROR]: 4,
			[ErrorCode.PERMISSION_DENIED]: 5,
			[ErrorCode.VALIDATION_ERROR]: 6,
			[ErrorCode.SCHEMA_PARSE_ERROR]: 7,
			[ErrorCode.INVALID_INPUT]: 8,
			[ErrorCode.COMMAND_FAILED]: 9,
			[ErrorCode.UNEXPECTED_ERROR]: 10,
			[ErrorCode.TIMEOUT]: 11,
			[ErrorCode.USER_CANCELLED]: 0, // Not really an error
			[ErrorCode.CONFIGURATION_ERROR]: 12,
		};

		return exitCodeMap[code] ?? 1;
	}

	/**
	 * Set verbose mode
	 */
	setVerbose(verbose: boolean): void {
		this.verbose = verbose;
	}
}

/**
 * Create a standardized error handler instance
 */
export function createErrorHandler(options?: { verbose?: boolean }): ErrorHandler {
	return new ErrorHandler(options);
}

/**
 * Quick helper for throwing CommandError
 */
export function throwCommandError(message: string, code: ErrorCode, suggestions?: string[]): never {
	throw new CommandError(message, code, undefined, suggestions);
}
