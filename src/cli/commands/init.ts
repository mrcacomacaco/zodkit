import * as pc from 'picocolors';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { SchemaDiscovery } from '../../core/infrastructure/schema-discovery';
import { AIRulesGenerator } from '../../core/ai-rules-generator';
import { ConfigManager } from '../../core/config';

export interface InitOptions {
  pm?: 'pnpm' | 'bun' | 'yarn' | 'npm';
  ai?: string[];
  mcp?: boolean;
  strict?: boolean;
  skipInstall?: boolean;
  check?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  try {
    // Check if this is an interactive setup (no specific options provided)
    const isInteractiveSetup = !options.pm && !options.ai && !options.mcp && !options.strict;

    if (isInteractiveSetup) {
      // Use new onboarding flow for interactive setup
      const { startOnboarding } = await import('../../core/onboarding');
      await startOnboarding();
      return;
    }

    // Legacy non-interactive setup
    console.log(pc.blue('🚀 Initializing zodkit in your project...'));

    // Validate and sanitize package manager input to prevent command injection
    const allowedPackageManagers = ['npm', 'yarn', 'pnpm', 'bun'] as const;
    const detectedPm = detectPackageManager();
    const userPm = options.pm;

    // Only allow safe, pre-defined package managers
    const isValidPackageManager = (pm: string): pm is typeof allowedPackageManagers[number] => {
      return allowedPackageManagers.includes(pm as typeof allowedPackageManagers[number]);
    };

    const packageManager = (userPm && isValidPackageManager(userPm))
      ? userPm
      : detectedPm;
    const cwd = process.cwd();

    // Step 1: Validate project structure
    validateProject(cwd);

    // Step 2: Install dependencies
    if (!options.skipInstall) {
      installDependencies(packageManager);
    }

    // Step 3: Create configuration file
    createConfigFile(options, cwd);

    // Step 4: Setup AI integrations
    if (options.ai?.length) {
      await setupAIIntegrations(options.ai, options.strict || false, cwd);
    }

    // Step 5: Setup MCP server integration
    if (options.mcp) {
      await setupMCPIntegration(cwd);
    }

    // Step 6: Optional initial check (only if explicitly requested)
    if (options.check) {
      console.log(pc.blue('\n🔍 Running initial validation...'));
      try {
        execSync('npx zodkit check', { stdio: 'inherit' });
      } catch {
        console.log(pc.yellow('⚠️  Initial validation found some issues. Run `npx zodkit check` to see details.'));
      }
    }

    // Success message
    console.log(pc.green('\n✅ zodkit has been successfully initialized!'));
    console.log('\nNext steps:');
    console.log('  1. Review the generated configuration file: zodkit.config.js');
    if (options.ai?.length) {
      console.log(`  2. Check AI-specific rules in .ai/ directory`);
    }
    if (options.mcp) {
      console.log(`  3. Start MCP server: ${pc.cyan('zodkit mcp serve')}`);
    }
    console.log(`  ${options.ai?.length || options.mcp ? '4' : '2'}. Run ${pc.cyan('zodkit check')} to validate your schemas`);
    console.log(`  ${options.ai?.length || options.mcp ? '5' : '3'}. Use ${pc.cyan('zodkit fix')} to auto-fix common issues`);

  } catch (error) {
    console.error(pc.red('❌ Failed to initialize zodkit:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function validateProject(cwd: string): void {
  // Check if package.json exists
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error('No package.json found. Please run this command in a Node.js project root.');
  }

  // Check if it's a TypeScript project
  const tsconfigPath = join(cwd, 'tsconfig.json');
  const hasTypeScript = existsSync(tsconfigPath) || existsSync(join(cwd, 'jsconfig.json'));

  if (!hasTypeScript) {
    console.log(pc.yellow('⚠️  No TypeScript configuration detected. zodkit works best with TypeScript.'));
  }

  // Check if zod is already installed
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const hasZod = packageJson.dependencies?.zod ?? packageJson.devDependencies?.zod;

  if (!hasZod) {
    console.log(pc.blue('📦 Zod will be installed as a dependency.'));
  }
}

function detectPackageManager(): 'pnpm' | 'bun' | 'yarn' | 'npm' {
  if (existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (existsSync('bun.lockb')) return 'bun';
  if (existsSync('yarn.lock')) return 'yarn';
  return 'npm';
}

function installDependencies(packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'): void {
  console.log(pc.blue(`📦 Installing zodkit and dependencies with ${packageManager}...`));

  const dependencies = ['zod'];
  const devDependencies = ['zodkit'];

  try {
    // Install runtime dependencies
    const depsCmd = `${packageManager} ${packageManager === 'npm' ? 'install' : 'add'} ${dependencies.join(' ')}`;
    execSync(depsCmd, { stdio: 'inherit' });

    // Install dev dependencies
    const devFlag = packageManager === 'npm' ? '--save-dev' : packageManager === 'yarn' ? '--dev' : '-D';
    const devCmd = `${packageManager} ${packageManager === 'npm' ? 'install' : 'add'} ${devFlag} ${devDependencies.join(' ')}`;
    execSync(devCmd, { stdio: 'inherit' });

    console.log(pc.green('✅ Dependencies installed successfully'));
  } catch (error) {
    throw new Error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createConfigFile(options: InitOptions, cwd: string): void {
  const configPath = join(cwd, 'zodkit.config.js');

  if (existsSync(configPath)) {
    console.log(pc.yellow('⚠️  Configuration file already exists. Skipping...'));
    return;
  }

  console.log(pc.blue('📝 Creating configuration file...'));

  const targets = (options as any).targets ?? ['all'];
  const rules = (options as any).rules ?? 'strict';

  // Generate configuration based on options
  const config = generateConfig(targets, rules);

  writeFileSync(configPath, config);
  console.log(pc.green('✅ Created zodkit.config.js'));
}

function generateConfig(targets: string[], rules: string): string {
  const targetConfigs: Record<string, unknown> = {};

  // Friendly defaults - scan everything with smart exclusions
  if (targets.includes('all') || targets.includes('mdx')) {
    targetConfigs.mdx = {
      patterns: ['./**/*.mdx'],
      frontmatterSchemas: 'auto'
    };
  }

  if (targets.includes('all') || targets.includes('react')) {
    targetConfigs.components = {
      patterns: ['./**/*.{tsx,jsx}'],
      propSchemas: 'auto'
    };
  }

  if (targets.includes('all') || targets.includes('api')) {
    targetConfigs.api = {
      patterns: ['./**/*.ts'],
      requestSchemas: 'auto',
      responseSchemas: 'auto'
    };
  }

  const rulesConfig = getRulesConfig(rules);

  return `// zodkit configuration file
module.exports = {
  // Schema detection - scan entire codebase
  schemas: {
    patterns: ['./**/*.{ts,tsx,js,jsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}'
    ]
  },

  // Validation targets
  targets: ${JSON.stringify(targetConfigs, null, 4).replace(/"/g, "'")},

  // Rules configuration - comprehensive rule set
  rules: ${JSON.stringify(rulesConfig, null, 4).replace(/"/g, "'")},

  // File overrides (like ESLint)
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-any-types': 'off',
        'use-strict-schemas': 'off',
        'no-empty-schema': 'off'
      }
    }
  ],

  // Ignore patterns
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.d.ts'
  ],

  // Output options
  output: {
    format: 'pretty', // 'pretty' | 'json' | 'junit' | 'sarif'
    verbose: false,
    showSuccessful: false
  }
};
`;
}

function getRulesConfig(rules: string): Record<string, string> {
  switch (rules) {
    case 'strict':
      return {
        'require-validation': 'error',
        'no-any-fallback': 'error',
        'prefer-strict-schemas': 'error'
      };
    case 'relaxed':
      return {
        'require-validation': 'warn',
        'no-any-fallback': 'warn',
        'prefer-strict-schemas': 'warn'
      };
    default:
      return {
        'require-validation': 'error',
        'no-any-fallback': 'warn',
        'prefer-strict-schemas': 'warn'
      };
  }
}

// @ts-ignore: Unused function for future implementation
function _setupEditorConfigurations(_editors: string[], _cwd: string): void {
  console.log(pc.blue('⚙️  Setting up editor configurations...'));

  for (const editor of _editors) {
    switch (editor) {
      case 'vscode':
        setupVSCodeConfig(_cwd);
        break;
      case 'zed':
        setupZedConfig();
        break;
      case 'cursor':
        setupCursorConfig(_cwd);
        break;
      default:
        console.log(pc.yellow(`⚠️  Unknown editor: ${editor}`));
    }
  }
}

function setupVSCodeConfig(cwd: string): void {
  const vscodeDir = join(cwd, '.vscode');
  const settingsPath = join(vscodeDir, 'settings.json');

  // Create .vscode directory if it doesn't exist
  if (!existsSync(vscodeDir)) {
    mkdirSync(vscodeDir, { recursive: true });
  }

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      console.log(pc.yellow('⚠️  Could not parse existing VS Code settings'));
    }
  }

  // Add zodkit-specific settings
  settings['zodkit.enable'] = true;
  settings['zodkit.autoValidate'] = true;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(pc.green('✅ VS Code configuration updated'));
}

function setupZedConfig(): void {
  // For now, just create a basic Zed configuration
  console.log(pc.blue('📝 Zed configuration setup (manual configuration required)'));
}

function setupCursorConfig(cwd: string): void {
  // Cursor uses VS Code configuration
  setupVSCodeConfig(cwd);
  console.log(pc.green('✅ Cursor configuration updated'));
}

// @ts-ignore: Unused function for future implementation
function _setupIntegrations(_integrations: string[], _packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun', _cwd: string): void {
  console.log(pc.blue('🔗 Setting up integrations...'));

  for (const integration of _integrations) {
    switch (integration) {
      case 'husky':
        setupHusky(_packageManager, _cwd);
        break;
      case 'lefthook':
        setupLefthook(_cwd);
        break;
      case 'lint-staged':
        setupLintStaged(_packageManager, _cwd);
        break;
      default:
        console.log(pc.yellow(`⚠️  Unknown integration: ${integration}`));
    }
  }
}

function setupHusky(packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun', cwd: string): void {
  try {
    // Install husky
    const installCmd = `${packageManager} ${packageManager === 'npm' ? 'install --save-dev' : 'add -D'} husky`;
    execSync(installCmd, { stdio: 'inherit' });

    // Initialize husky
    execSync('npx husky init', { stdio: 'inherit' });

    // Add pre-commit hook
    const hookContent = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx zodkit check --ci\n';
    writeFileSync(join(cwd, '.husky', 'pre-commit'), hookContent);

    console.log(pc.green('✅ Husky integration setup complete'));
  } catch {
    console.log(pc.yellow('⚠️  Failed to setup Husky integration'));
  }
}

function setupLefthook(cwd: string): void {
  const lefthookConfig = `
pre-commit:
  commands:
    zodkit:
      run: npx zodkit check --ci
      stage_fixed: true
`;

  writeFileSync(join(cwd, 'lefthook.yml'), lefthookConfig.trim());
  console.log(pc.green('✅ Lefthook configuration created'));
}

function setupLintStaged(packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun', cwd: string): void {
  try {
    // Install lint-staged
    const installCmd = `${packageManager} ${packageManager === 'npm' ? 'install --save-dev' : 'add -D'} lint-staged`;
    execSync(installCmd, { stdio: 'inherit' });

    // Add lint-staged configuration to package.json
    const packageJsonPath = join(cwd, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;

    packageJson['lint-staged'] = {
      '*.{ts,tsx,js,jsx,mdx,md}': ['zodkit check']
    };

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(pc.green('✅ lint-staged configuration added'));
  } catch {
    console.log(pc.yellow('⚠️  Failed to setup lint-staged integration'));
  }
}

async function setupAIIntegrations(aiTools: string[], strict: boolean, cwd: string): Promise<void> {
  console.log(pc.blue('🤖 Setting up AI integrations...'));

  try {
    // Discover existing schemas
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const discovery = new SchemaDiscovery(config);
    const schemas = await discovery.findSchemas();

    // Generate AI rules
    const generator = new AIRulesGenerator();
    const aiConfig = {
      tools: aiTools as ('cursor' | 'claude' | 'copilot' | 'windsurf')[],
      outputDir: join(cwd, '.ai'),
      includeExamples: true,
      includePatterns: true,
      strictMode: strict,
      customRules: []
    };

    const result = await generator.generateRules(schemas, aiConfig);

    console.log(pc.green(`✅ Generated ${result.files.length} AI configuration files`));
    console.log(pc.cyan(`   Total rules: ${result.stats.totalRules}`));
    console.log(pc.cyan(`   Schema rules: ${result.stats.schemaRules}`));
    console.log(pc.cyan(`   Pattern rules: ${result.stats.patternRules}`));

    // Log created files
    result.files.forEach(file => {
      console.log(`   📄 ${file.name} (${Math.round(file.size / 1024)}KB)`);
    });

  } catch (error) {
    console.log(pc.yellow(`⚠️  Failed to setup AI integrations: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function setupMCPIntegration(cwd: string): Promise<void> {
  console.log(pc.blue('🔌 Setting up MCP server integration...'));

  try {
    // Create MCP configuration
    const mcpConfig = {
      mcpServers: {
        zodkit: {
          command: 'npx',
          args: ['zodkit', 'mcp', 'serve', '--port', '3456']
        }
      }
    };

    // Check for different AI assistant configs
    const claudeDir = join(cwd, '.claude');
    if (existsSync(claudeDir)) {
      const settingsPath = join(claudeDir, 'settings.local.json');
      writeFileSync(settingsPath, JSON.stringify(mcpConfig, null, 2));
      console.log(pc.green('✅ Claude Code MCP configuration created'));
    }

    const cursorDir = join(cwd, '.cursor');
    if (existsSync(cursorDir)) {
      const configPath = join(cursorDir, 'config.json');
      let existingConfig = {};
      if (existsSync(configPath)) {
        try {
          existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        } catch {}
      }
      const mergedConfig = { ...existingConfig, 'mcp.servers': mcpConfig.mcpServers };
      writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
      console.log(pc.green('✅ Cursor MCP configuration created'));
    }

    // Create generic MCP config file
    const mcpConfigPath = join(cwd, 'mcp-config.json');
    writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(pc.green('✅ Generic MCP configuration created'));

    console.log(pc.cyan(`   Start server: zodkit mcp serve`));
    console.log(pc.cyan(`   Test server: zodkit mcp status`));

  } catch (error) {
    console.log(pc.yellow(`⚠️  Failed to setup MCP integration: ${error instanceof Error ? error.message : String(error)}`));
  }
}

// @ts-ignore: Unused function for future implementation
function _removeOtherValidators(_packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'): void {
  console.log(pc.blue('🧹 Removing other validation tools...'));

  const validatorsToRemove = [
    'joi',
    'yup',
    'ajv',
    'class-validator',
    'superstruct'
  ];

  for (const validator of validatorsToRemove) {
    try {
      const removeCmd = `${_packageManager} ${_packageManager === 'npm' ? 'uninstall' : 'remove'} ${validator}`;
      execSync(removeCmd, { stdio: 'pipe' });
      console.log(pc.green(`✅ Removed ${validator}`));
    } catch {
      // Ignore errors - package might not be installed
    }
  }
}

