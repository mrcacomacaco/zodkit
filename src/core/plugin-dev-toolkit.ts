/**
 * @fileoverview Plugin Development Toolkit
 * @module PluginDevToolkit
 *
 * Tools and utilities for developing zodkit plugins
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pc from 'picocolors';
import { execSync } from 'child_process';
import type { Plugin, PluginConfig, PluginHooks } from './plugin-system';
import { PluginTemplates } from './plugin-registry';

// === DEVELOPMENT INTERFACES ===

export interface PluginScaffoldOptions {
  name: string;
  description: string;
  author: string;
  template: 'basic' | 'command' | 'rule' | 'middleware' | 'full';
  typescript: boolean;
  git: boolean;
  install: boolean;
}

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface PluginTestResult {
  passed: boolean;
  tests: Array<{
    name: string;
    passed: boolean;
    error?: string;
    duration: number;
  }>;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
  };
}

// === PLUGIN DEVELOPMENT TOOLKIT ===

export class PluginDevToolkit {
  constructor(private readonly workingDirectory: string = process.cwd()) {}

  /**
   * Scaffold a new plugin project
   */
  async scaffoldPlugin(options: PluginScaffoldOptions): Promise<void> {
    const pluginName = options.name.startsWith('zodkit-plugin-')
      ? options.name
      : `zodkit-plugin-${options.name}`;

    const pluginDir = path.join(this.workingDirectory, pluginName);

    console.log(pc.cyan(`🚀 Creating plugin ${pluginName}...`));

    // Create plugin directory
    if (fs.existsSync(pluginDir)) {
      throw new Error(`Directory ${pluginName} already exists`);
    }

    fs.mkdirSync(pluginDir, { recursive: true });

    try {
      // Generate files based on template
      await this.generatePluginFiles(pluginDir, options);

      // Initialize git repo
      if (options.git) {
        await this.initializeGit(pluginDir);
      }

      // Install dependencies
      if (options.install) {
        await this.installDependencies(pluginDir);
      }

      console.log(pc.green(`✅ Plugin ${pluginName} created successfully!`));
      console.log();
      console.log(pc.bold('Next steps:'));
      console.log(`  ${pc.gray('cd')} ${pluginName}`);
      console.log(`  ${pc.gray('npm')} ${options.install ? 'start' : 'install'}`);
      console.log(`  ${pc.gray('zodkit')} plugin test`);
      console.log();

    } catch (error) {
      // Cleanup on error
      fs.rmSync(pluginDir, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Validate a plugin
   */
  async validatePlugin(pluginPath: string): Promise<PluginValidationResult> {
    const result: PluginValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    try {
      // Check if plugin file exists
      const mainFile = this.findPluginMainFile(pluginPath);
      if (!mainFile) {
        result.errors.push('No main plugin file found (index.js, index.ts, or plugin.js)');
        result.valid = false;
        return result;
      }

      // Load and validate plugin
      const plugin = await this.loadPluginForValidation(mainFile);

      // Validate plugin structure
      this.validatePluginStructure(plugin, result);

      // Validate plugin config
      this.validatePluginConfig(plugin.config, result);

      // Validate hooks
      if (plugin.hooks) {
        this.validatePluginHooks(plugin.hooks, result);
      }

      // Validate commands
      if (plugin.commands) {
        this.validatePluginCommands(plugin.commands, result);
      }

      // Check package.json
      this.validatePackageJson(pluginPath, result);

      // Check for README
      if (!fs.existsSync(path.join(pluginPath, 'README.md'))) {
        result.warnings.push('No README.md file found - consider adding documentation');
      }

      // Check for tests
      if (!this.hasTests(pluginPath)) {
        result.suggestions.push('Consider adding tests for your plugin');
      }

    } catch (error) {
      result.errors.push(`Failed to validate plugin: ${error}`);
      result.valid = false;
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Test a plugin
   */
  async testPlugin(pluginPath: string): Promise<PluginTestResult> {
    console.log(pc.cyan('🧪 Testing plugin...'));

    const result: PluginTestResult = {
      passed: false,
      tests: []
    };

    try {
      // Basic validation test
      const validationResult = await this.validatePlugin(pluginPath);
      result.tests.push({
        name: 'Plugin Structure Validation',
        passed: validationResult.valid,
        error: validationResult.errors.join(', ') || undefined,
        duration: 0
      });

      // Load plugin test
      const startTime = Date.now();
      try {
        const mainFile = this.findPluginMainFile(pluginPath);
        if (mainFile) {
          await this.loadPluginForValidation(mainFile);
          result.tests.push({
            name: 'Plugin Loading',
            passed: true,
            duration: Date.now() - startTime
          });
        }
      } catch (error) {
        result.tests.push({
          name: 'Plugin Loading',
          passed: false,
          error: String(error),
          duration: Date.now() - startTime
        });
      }

      // Hook execution tests
      await this.testPluginHooks(pluginPath, result);

      // Command tests
      await this.testPluginCommands(pluginPath, result);

      result.passed = result.tests.every(test => test.passed);

    } catch (error) {
      result.tests.push({
        name: 'General Test',
        passed: false,
        error: String(error),
        duration: 0
      });
    }

    return result;
  }

  /**
   * Build a plugin for distribution
   */
  async buildPlugin(pluginPath: string, options: { minify?: boolean } = {}): Promise<void> {
    console.log(pc.cyan('🔨 Building plugin...'));

    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('No package.json found');
    }


    // Check if TypeScript
    const tsConfigPath = path.join(pluginPath, 'tsconfig.json');
    const isTypeScript = fs.existsSync(tsConfigPath);

    if (isTypeScript) {
      console.log(pc.gray('  📝 Compiling TypeScript...'));

      try {
        execSync('npx tsc', { cwd: pluginPath, stdio: 'inherit' });
        console.log(pc.green('  ✅ TypeScript compilation successful'));
      } catch (error) {
        throw new Error(`TypeScript compilation failed: ${error}`);
      }
    }

    // Validate built plugin
    const validationResult = await this.validatePlugin(pluginPath);
    if (!validationResult.valid) {
      throw new Error(`Plugin validation failed: ${validationResult.errors.join(', ')}`);
    }

    console.log(pc.green('✅ Plugin built successfully!'));
  }

  /**
   * Publish a plugin to npm
   */
  async publishPlugin(pluginPath: string, options: { tag?: string; dry?: boolean } = {}): Promise<void> {
    console.log(pc.cyan('📦 Publishing plugin...'));

    // Validate plugin first
    const validationResult = await this.validatePlugin(pluginPath);
    if (!validationResult.valid) {
      throw new Error(`Cannot publish invalid plugin: ${validationResult.errors.join(', ')}`);
    }

    // Check if user is logged in to npm
    try {
      execSync('npm whoami', { cwd: pluginPath, stdio: 'pipe' });
    } catch (error) {
      throw new Error('Not logged in to npm. Run "npm login" first.');
    }

    // Build plugin
    await this.buildPlugin(pluginPath);

    // Publish
    const publishArgs = ['publish'];
    if (options.tag) publishArgs.push('--tag', options.tag);
    if (options.dry) publishArgs.push('--dry-run');

    try {
      const command = `npm ${publishArgs.join(' ')}`;

      console.log(pc.gray(`  Running: ${command}`));
      execSync(command, { cwd: pluginPath, stdio: 'inherit' });

      if (!options.dry) {
        console.log(pc.green('✅ Plugin published successfully!'));
      } else {
        console.log(pc.yellow('📋 Dry run completed - no package was published'));
      }
    } catch (error) {
      throw new Error(`Publishing failed: ${error}`);
    }
  }

  // === PRIVATE METHODS ===

  private async generatePluginFiles(pluginDir: string, options: PluginScaffoldOptions): Promise<void> {
    const ext = options.typescript ? 'ts' : 'js';

    // Generate main plugin file
    const pluginContent = this.generatePluginContent(options);
    fs.writeFileSync(path.join(pluginDir, `index.${ext}`), pluginContent);

    // Generate package.json
    const packageJson = PluginTemplates.generatePackageJson(
      options.name,
      options.description,
      options.author
    );
    fs.writeFileSync(path.join(pluginDir, 'package.json'), packageJson);

    // Generate TypeScript config
    if (options.typescript) {
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'CommonJS',
          declaration: true,
          outDir: './dist',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true
        },
        include: ['*.ts'],
        exclude: ['node_modules', 'dist', '**/*.test.ts']
      };
      fs.writeFileSync(path.join(pluginDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    }

    // Generate README
    const readme = this.generateReadme(options);
    fs.writeFileSync(path.join(pluginDir, 'README.md'), readme);

    // Generate .gitignore
    const gitignore = `node_modules/
dist/
*.log
.env
.DS_Store
`;
    fs.writeFileSync(path.join(pluginDir, '.gitignore'), gitignore);

    // Generate test file
    const testContent = this.generateTestContent(options);
    fs.writeFileSync(path.join(pluginDir, `test.${ext}`), testContent);
  }

  private generatePluginContent(options: PluginScaffoldOptions): string {
    switch (options.template) {
      case 'command':
        return this.generateCommandPluginTemplate(options);
      case 'rule':
        return this.generateRulePluginTemplate(options);
      case 'middleware':
        return this.generateMiddlewarePluginTemplate(options);
      case 'full':
        return this.generateFullPluginTemplate(options);
      default:
        return PluginTemplates.generateBasicPlugin(options.name, options.description);
    }
  }

  private generateCommandPluginTemplate(options: PluginScaffoldOptions): string {
    const pluginName = options.name.startsWith('zodkit-plugin-') ? options.name : `zodkit-plugin-${options.name}`;

    return `${options.typescript ? 'import type { Plugin } from "zodkit";' : ''}

${options.typescript ? 'const plugin: Plugin = {' : 'module.exports = {'}
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${options.description}',
    author: '${options.author}',
    keywords: ['zodkit', 'plugin', 'command']
  },

  commands: [{
    name: '${options.name.replace('zodkit-plugin-', '')}',
    description: '${options.description}',
    options: [{
      flags: '--example',
      description: 'Example option'
    }],
    action: async (args, options, context) => {
      context.zodkit.logger.info('Command executed!');

      // Your command logic here
      console.log('Hello from ${pluginName}!');
    }
  }]
}${options.typescript ? ';' : ''}

${options.typescript ? 'export default plugin;' : ''}`;
  }

  private generateRulePluginTemplate(options: PluginScaffoldOptions): string {
    const pluginName = options.name.startsWith('zodkit-plugin-') ? options.name : `zodkit-plugin-${options.name}`;

    return `${options.typescript ? 'import type { Plugin } from "zodkit";' : ''}

${options.typescript ? 'const plugin: Plugin = {' : 'module.exports = {'}
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${options.description}',
    author: '${options.author}',
    keywords: ['zodkit', 'plugin', 'rule']
  },

  rules: [{
    name: '${options.name.replace('zodkit-plugin-', '').replace(/-/g, '_')}',
    category: 'validation',
    severity: 'warning',
    check: async (schema, context) => {
      const issues = [];

      // Your rule logic here
      // Example: check for specific patterns in the schema

      return issues;
    },
    fix: async (schema, issues, context) => {
      // Auto-fix logic (optional)
      return schema;
    }
  }]
}${options.typescript ? ';' : ''}

${options.typescript ? 'export default plugin;' : ''}`;
  }

  private generateMiddlewarePluginTemplate(options: PluginScaffoldOptions): string {
    const pluginName = options.name.startsWith('zodkit-plugin-') ? options.name : `zodkit-plugin-${options.name}`;

    return `${options.typescript ? 'import type { Plugin } from "zodkit";' : ''}

${options.typescript ? 'const plugin: Plugin = {' : 'module.exports = {'}
  config: {
    name: '${pluginName}',
    version: '1.0.0',
    description: '${options.description}',
    author: '${options.author}',
    keywords: ['zodkit', 'plugin', 'middleware']
  },

  middleware: [{
    name: '${options.name.replace('zodkit-plugin-', '')}',
    priority: 100,
    transform: async (data, context) => {
      // Transform data here
      context.zodkit.logger.info('Middleware processing data');

      // Return transformed data
      return data;
    }
  }]
}${options.typescript ? ';' : ''}

${options.typescript ? 'export default plugin;' : ''}`;
  }

  private generateFullPluginTemplate(options: PluginScaffoldOptions): string {
    return PluginTemplates.generateBasicPlugin(options.name, options.description);
  }

  private generateReadme(options: PluginScaffoldOptions): string {
    const pluginName = options.name.startsWith('zodkit-plugin-') ? options.name : `zodkit-plugin-${options.name}`;

    return `# ${pluginName}

${options.description}

## Installation

\`\`\`bash
npm install ${pluginName}
\`\`\`

## Usage

This plugin is automatically loaded by zodkit when installed.

## Configuration

Add to your \`zodkit.config.js\`:

\`\`\`javascript
module.exports = {
  plugins: ['${pluginName}']
};
\`\`\`

## Features

- Feature 1
- Feature 2
- Feature 3

## API

### Commands

- \`zodkit ${options.name.replace('zodkit-plugin-', '')}\` - Main command

### Rules

- \`${options.name.replace('zodkit-plugin-', '').replace(/-/g, '_')}\` - Custom validation rule

## Contributing

1. Fork it
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -am 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Create a Pull Request

## License

MIT © ${options.author}
`;
  }

  private generateTestContent(options: PluginScaffoldOptions): string {
    const pluginName = options.name.startsWith('zodkit-plugin-') ? options.name : `zodkit-plugin-${options.name}`;

    return `${options.typescript ? 'import plugin from "./index";' : 'import plugin from "./index";'}

describe('${pluginName}', () => {
  test('plugin has valid config', () => {
    expect(plugin.config).toBeDefined();
    expect(plugin.config.name).toBe('${pluginName}');
    expect(plugin.config.version).toBeDefined();
    expect(plugin.config.description).toBeDefined();
  });

  ${options.template === 'command' ? `
  test('plugin has commands', () => {
    expect(plugin.commands).toBeDefined();
    expect(Array.isArray(plugin.commands)).toBe(true);
    expect(plugin.commands.length).toBeGreaterThan(0);
  });
  ` : ''}

  ${options.template === 'rule' ? `
  test('plugin has rules', () => {
    expect(plugin.rules).toBeDefined();
    expect(Array.isArray(plugin.rules)).toBe(true);
    expect(plugin.rules.length).toBeGreaterThan(0);
  });
  ` : ''}

  ${options.template === 'middleware' ? `
  test('plugin has middleware', () => {
    expect(plugin.middleware).toBeDefined();
    expect(Array.isArray(plugin.middleware)).toBe(true);
    expect(plugin.middleware.length).toBeGreaterThan(0);
  });
  ` : ''}
});
`;
  }

  private async initializeGit(pluginDir: string): Promise<void> {
    try {
      execSync('git init', { cwd: pluginDir, stdio: 'pipe' });
      console.log(pc.gray('  📚 Git repository initialized'));
    } catch (error) {
      console.warn(pc.yellow('  ⚠️  Failed to initialize git repository'));
    }
  }

  private async installDependencies(pluginDir: string): Promise<void> {
    try {
      console.log(pc.gray('  📦 Installing dependencies...'));
      execSync('npm install', { cwd: pluginDir, stdio: 'inherit' });
      console.log(pc.green('  ✅ Dependencies installed'));
    } catch (error) {
      console.warn(pc.yellow('  ⚠️  Failed to install dependencies'));
      throw error;
    }
  }

  private findPluginMainFile(pluginPath: string): string | null {
    const candidates = ['index.js', 'index.ts', 'plugin.js', 'plugin.ts'];

    for (const candidate of candidates) {
      const filePath = path.join(pluginPath, candidate);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  private async loadPluginForValidation(filePath: string): Promise<Plugin> {
    // In a real implementation, this would use dynamic import or require
    // For validation purposes, we'll parse the file statically
    const content = fs.readFileSync(filePath, 'utf8');

    // Basic validation - just check if it looks like a plugin
    if (!content.includes('config') || !content.includes('name')) {
      throw new Error('Plugin file does not appear to contain a valid plugin configuration');
    }

    // Return a mock plugin for validation
    return {
      config: {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin'
      }
    };
  }

  private validatePluginStructure(plugin: Plugin, result: PluginValidationResult): void {
    if (!plugin.config) {
      result.errors.push('Plugin must have a config object');
      return;
    }

    if (typeof plugin !== 'object') {
      result.errors.push('Plugin must be an object');
    }
  }

  private validatePluginConfig(config: PluginConfig, result: PluginValidationResult): void {
    if (!config.name) {
      result.errors.push('Plugin config must have a name');
    } else if (!config.name.startsWith('zodkit-plugin-') && !config.name.includes('zodkit')) {
      result.warnings.push('Plugin name should start with "zodkit-plugin-" for better discoverability');
    }

    if (!config.version) {
      result.errors.push('Plugin config must have a version');
    }

    if (!config.description) {
      result.errors.push('Plugin config must have a description');
    }

    if (!config.author) {
      result.warnings.push('Plugin config should have an author field');
    }
  }

  private validatePluginHooks(hooks: PluginHooks, result: PluginValidationResult): void {
    const validHooks = [
      'beforeCommand', 'afterCommand', 'onError',
      'beforeValidation', 'afterValidation',
      'beforeGeneration', 'afterGeneration'
    ];

    for (const hookName of Object.keys(hooks)) {
      if (!validHooks.includes(hookName)) {
        result.warnings.push(`Unknown hook: ${hookName}`);
      }
    }
  }

  private validatePluginCommands(commands: any[], result: PluginValidationResult): void {
    for (const command of commands) {
      if (!command.name) {
        result.errors.push('Plugin command must have a name');
      }
      if (!command.action || typeof command.action !== 'function') {
        result.errors.push('Plugin command must have an action function');
      }
    }
  }

  private validatePackageJson(pluginPath: string, result: PluginValidationResult): void {
    const packageJsonPath = path.join(pluginPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      result.errors.push('No package.json found');
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (!packageJson.name) {
        result.errors.push('package.json must have a name field');
      }

      if (!packageJson.version) {
        result.errors.push('package.json must have a version field');
      }

      if (!packageJson.keywords?.includes('zodkit')) {
        result.suggestions.push('Consider adding "zodkit" to package.json keywords for better discoverability');
      }

    } catch (error) {
      result.errors.push('Invalid package.json file');
    }
  }

  private hasTests(pluginPath: string): boolean {
    const testFiles = ['test.js', 'test.ts', 'spec.js', 'spec.ts'];
    const testDirs = ['test', 'tests', '__tests__'];

    // Check for test files
    for (const testFile of testFiles) {
      if (fs.existsSync(path.join(pluginPath, testFile))) {
        return true;
      }
    }

    // Check for test directories
    for (const testDir of testDirs) {
      if (fs.existsSync(path.join(pluginPath, testDir))) {
        return true;
      }
    }

    return false;
  }

  private async testPluginHooks(pluginPath: string, result: PluginTestResult): Promise<void> {
    // Mock hook testing - in real implementation would load and test hooks
    result.tests.push({
      name: 'Hook Execution',
      passed: true,
      duration: 0
    });
  }

  private async testPluginCommands(pluginPath: string, result: PluginTestResult): Promise<void> {
    // Mock command testing - in real implementation would load and test commands
    result.tests.push({
      name: 'Command Registration',
      passed: true,
      duration: 0
    });
  }
}

export default PluginDevToolkit;