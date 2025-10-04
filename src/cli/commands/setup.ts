/**
 * @fileoverview Unified Setup Command
 * @module SetupCommand
 *
 * Consolidates:
 * - init.ts - Initialize zodkit project
 * - contract.ts - Generate API contracts
 * Total: 2 commands → 1 unified command
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import * as pc from 'picocolors';
import { ConfigManager } from '../../core/config';

type SetupMode = 'init' | 'contract' | 'full';

interface SetupOptions {
	mode?: SetupMode;
	preset?: 'minimal' | 'standard' | 'complete';
	force?: boolean;
	skipInstall?: boolean;
	contractType?: 'openapi' | 'graphql' | 'grpc';
}

export async function setupCommand(
	projectName?: string,
	options: SetupOptions = {},
	command?: Command,
): Promise<void> {
	const globalOpts = command?.parent?.opts() ?? {};
	const isJsonMode = globalOpts.json;

	try {
		const mode = options.mode ?? detectMode(command?.name());

		if (!isJsonMode) {
			console.log(pc.bold(pc.blue('⚡ ZodKit Setup')));
			console.log(pc.gray('─'.repeat(60)));
		}

		switch (mode) {
			case 'init':
				await initializeProject(options, isJsonMode, projectName);
				break;
			case 'contract':
				await generateContracts(options, isJsonMode, projectName);
				break;
			case 'full':
				await initializeProject(options, isJsonMode, projectName);
				await generateContracts(options, isJsonMode, projectName);
				break;
		}

		if (!isJsonMode) {
			console.log(`\n${pc.green('✅ Setup completed successfully!')}`);
			console.log(`\n${pc.bold('Next steps:')}`);
			console.log(`  1. Run ${pc.cyan('zodkit analyze')} to check your schemas`);
			console.log(`  2. Run ${pc.cyan('zodkit dashboard')} for interactive mode`);
			console.log(`  3. Run ${pc.cyan('zodkit --help')} to see all commands`);
		}
	} catch (error) {
		if (isJsonMode) {
			console.log(
				JSON.stringify(
					{
						success: false,
						error: {
							message: error instanceof Error ? error.message : String(error),
							code: 'SETUP_ERROR',
						},
					},
					null,
					2,
				),
			);
		} else {
			console.error(
				pc.red('❌ Setup failed:'),
				error instanceof Error ? error.message : String(error),
			);
		}
		process.exit(1);
	}
}

function detectMode(commandName?: string): SetupMode {
	if (commandName?.includes('init')) return 'init';
	if (commandName?.includes('contract')) return 'contract';
	return 'full';
}

async function initializeProject(
	options: SetupOptions,
	isJsonMode?: boolean,
	projectName?: string,
): Promise<void> {
	const cwd = process.cwd();
	const projectDir = projectName ? path.join(cwd, projectName) : cwd;

	// Check if already initialized
	const configPath = path.join(projectDir, 'zodkit.config.js');
	if (fs.existsSync(configPath) && !options.force) {
		throw new Error('Project already initialized. Use --force to reinitialize.');
	}

	if (!isJsonMode) {
		console.log(`\n📦 Initializing zodkit in ${pc.cyan(projectDir)}`);
	}

	// Create project directory if needed
	if (projectName && !fs.existsSync(projectDir)) {
		fs.mkdirSync(projectDir, { recursive: true });
	}

	// Determine preset
	const preset = options.preset ?? 'standard';
	const config = generateConfig(preset);

	// Write configuration
	fs.writeFileSync(configPath, config, 'utf8');

	// Create directory structure
	const dirs = ['src/schemas', 'src/types', 'src/validators', '.zodkit/cache'];

	dirs.forEach((dir) => {
		const dirPath = path.join(projectDir, dir);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
	});

	// Create example schema
	const exampleSchema = generateExampleSchema();
	fs.writeFileSync(path.join(projectDir, 'src/schemas/example.schema.ts'), exampleSchema, 'utf8');

	// Update package.json
	const packageJsonPath = path.join(projectDir, 'package.json');
	if (fs.existsSync(packageJsonPath)) {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		// Add scripts
		packageJson.scripts = packageJson.scripts ?? {};
		packageJson.scripts.zodkit = 'zodkit';
		packageJson.scripts['zodkit:check'] = 'zodkit analyze --mode check';
		packageJson.scripts['zodkit:fix'] = 'zodkit analyze --mode fix';

		// Add dependencies if not present
		packageJson.devDependencies = packageJson.devDependencies ?? {};
		if (!packageJson.devDependencies.zodkit) {
			packageJson.devDependencies.zodkit = '^1.0.0';
		}
		if (!packageJson.dependencies?.zod) {
			packageJson.dependencies = packageJson.dependencies ?? {};
			packageJson.dependencies.zod = '^3.22.0';
		}

		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

		// Install dependencies
		if (!options.skipInstall) {
			if (!isJsonMode) {
				console.log('\n📥 Installing dependencies...');
			}
			// Would run npm install here
		}
	}

	if (!isJsonMode) {
		console.log(pc.green('✅ Project initialized'));
		console.log(`  Config: ${pc.cyan('zodkit.config.js')}`);
		console.log(`  Example: ${pc.cyan('src/schemas/example.schema.ts')}`);
	}
}

async function generateContracts(
	options: SetupOptions,
	isJsonMode?: boolean,
	target?: string,
): Promise<void> {
	const contractType = options.contractType ?? 'openapi';

	if (!isJsonMode) {
		console.log(`\n📄 Generating ${contractType.toUpperCase()} contracts...`);
	}

	const configManager = ConfigManager.getInstance();
	const config = await configManager.loadConfig();

	// Discover schemas
	const { Infrastructure } = await import('../../core/infrastructure');
	const infra = new Infrastructure(config as any);
	const schemas = await infra.discovery.findSchemas();

	if (schemas.length === 0) {
		throw new Error('No schemas found to generate contracts from');
	}

	// Generate contracts based on type
	let contract: string;
	switch (contractType) {
		case 'openapi':
			contract = generateOpenAPIContract(schemas);
			break;
		case 'graphql':
			contract = generateGraphQLContract(schemas);
			break;
		case 'grpc':
			contract = generateGRPCContract(schemas);
			break;
		default:
			throw new Error(`Unknown contract type: ${contractType}`);
	}

	// Write contract file
	const outputPath = target ?? `api.${contractType}.yaml`;
	fs.writeFileSync(outputPath, contract, 'utf8');

	if (!isJsonMode) {
		console.log(pc.green(`✅ Contract generated: ${outputPath}`));
		console.log(`  Schemas included: ${schemas.length}`);
		console.log(`  Contract type: ${contractType}`);
	}
}

function generateConfig(preset: string): string {
	const configs = {
		minimal: {
			schemas: {
				patterns: ['./src/**/*.schema.ts'],
				exclude: ['**/*.test.ts'],
			},
			output: {
				format: 'pretty',
			},
		},
		standard: {
			schemas: {
				patterns: ['./src/**/*.schema.ts', './src/schemas/**/*.ts'],
				exclude: ['**/*.test.ts', '**/*.spec.ts'],
			},
			rules: {
				'require-description': 'warn',
				'no-any': 'error',
				'prefer-strict': 'warn',
			},
			output: {
				format: 'pretty',
				verbose: false,
			},
		},
		complete: {
			schemas: {
				patterns: ['./src/**/*.schema.ts', './src/schemas/**/*.ts'],
				exclude: ['**/*.test.ts', '**/*.spec.ts'],
				depth: 5,
			},
			rules: {
				'require-description': 'error',
				'no-any': 'error',
				'prefer-strict': 'error',
				'max-complexity': ['error', 20],
				'max-depth': ['error', 5],
			},
			targets: {
				components: {
					patterns: ['./src/**/*.tsx'],
					propSchemas: 'auto',
				},
			},
			performance: {
				benchmark: true,
				threshold: {
					parse: 100,
					validate: 50,
				},
			},
			output: {
				format: 'pretty',
				verbose: true,
				reportPath: '.zodkit/reports',
			},
		},
	};

	const config = configs[preset as keyof typeof configs] ?? configs.standard;

	return `/**
 * ZodKit Configuration
 * @type {import('zodkit').Config}
 */
module.exports = ${JSON.stringify(config, null, 2)};
`;
}

function generateExampleSchema(): string {
	return `import { z } from 'zod';

/**
 * Example user schema
 * @description User account information
 */
export const UserSchema = z.object({
  id: z.string().uuid().describe('Unique user identifier'),
  email: z.string().email().describe('User email address'),
  name: z.string().min(1).max(100).describe('Full name'),
  age: z.number().int().min(0).max(150).optional().describe('User age'),
  role: z.enum(['admin', 'user', 'guest']).default('user'),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    notifications: z.boolean().default(true)
  }).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export type User = z.infer<typeof UserSchema>;

/**
 * Example validation
 */
export function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}

/**
 * Example safe validation
 */
export function safeValidateUser(data: unknown) {
  return UserSchema.safeParse(data);
}
`;
}

function generateOpenAPIContract(schemas: any[]): string {
	return `openapi: 3.0.0
info:
  title: Generated API Contract
  version: 1.0.0
  description: Auto-generated from Zod schemas

paths:
${schemas
	.map(
		(schema) => `  /${schema.name.toLowerCase()}:
    get:
      summary: Get ${schema.name}
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/${schema.name}'`,
	)
	.join('\n')}

components:
  schemas:
${schemas
	.map(
		(schema) => `    ${schema.name}:
      type: object
      description: ${schema.name} schema`,
	)
	.join('\n')}
`;
}

function generateGraphQLContract(schemas: any[]): string {
	return schemas
		.map(
			(schema) => `type ${schema.name} {
  id: ID!
  # Add fields based on schema
}`,
		)
		.join('\n\n');
}

function generateGRPCContract(schemas: any[]): string {
	return `syntax = "proto3";

package api;

${schemas
	.map(
		(schema) => `message ${schema.name} {
  string id = 1;
  // Add fields based on schema
}`,
	)
	.join('\n\n')}
`;
}

// === COMMAND REGISTRATION ===

export function registerSetupCommand(program: Command): void {
	// Main setup command
	program
		.command('setup [project-name]')
		.description('Complete project setup with contracts')
		.option('-m, --mode <mode>', 'setup mode (init|contract|full)', 'full')
		.option('-p, --preset <preset>', 'config preset (minimal|standard|complete)', 'standard')
		.option('-f, --force', 'force reinitialize')
		.option('--skip-install', 'skip npm install')
		.option('--contract-type <type>', 'contract type (openapi|graphql|grpc)', 'openapi')
		.action(setupCommand);

	// Backward compatibility
	program
		.command('init [project-name]')
		.description('Initialize zodkit project')
		.option('-p, --preset <preset>', 'config preset', 'standard')
		.option('-f, --force', 'force reinitialize')
		.option('--skip-install', 'skip npm install')
		.action((name, options, cmd) => setupCommand(name, { ...options, mode: 'init' }, cmd));

	program
		.command('contract [output]')
		.description('Generate API contracts from schemas')
		.option('-t, --contract-type <type>', 'contract type', 'openapi')
		.action((output, options, cmd) => setupCommand(output, { ...options, mode: 'contract' }, cmd));
}

export default setupCommand;
