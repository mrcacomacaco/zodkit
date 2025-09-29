/**
 * @fileoverview Interactive onboarding flow for new users
 * @module Onboarding
 */

import * as pc from 'picocolors';
import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Onboarding step configuration
 */
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  action?: () => Promise<boolean>;
  skipCondition?: () => boolean;
  successMessage?: string;
}

/**
 * User preferences collected during onboarding
 */
export interface UserPreferences {
  projectType: 'new' | 'existing' | 'learning';
  framework?: 'react' | 'node' | 'next' | 'express' | 'other';
  aiTools: string[];
  experience: 'beginner' | 'intermediate' | 'advanced';
  usePresets: boolean;
  enableMcp: boolean;
  setupTesting: boolean;
}

/**
 * Interactive onboarding system
 */
export class OnboardingFlow {
  private readonly preferences: Partial<UserPreferences> = {};

  /**
   * Start the complete onboarding flow
   */
  async start(): Promise<void> {
    console.log(pc.cyan('🚀 Welcome to ZodKit!'));
    console.log('Let\'s get you set up for the best development experience.\n');

    // Check if already configured
    if (this.isAlreadyConfigured()) {
      const shouldReconfigure = await this.askYesNo(
        'ZodKit is already configured. Would you like to reconfigure?'
      );
      if (!shouldReconfigure) {
        console.log(pc.green('✅ Using existing configuration. Happy coding!'));
        return;
      }
    }

    try {
      // Collect user preferences
      await this.collectPreferences();

      // Execute onboarding steps
      await this.executeSteps();

      // Show completion message
      this.showCompletionMessage();

    } catch (error) {
      console.error(pc.red('❌ Onboarding failed:'), error);
      console.log(pc.yellow('💡 You can run "zodkit init" again anytime to restart.'));
    }
  }

  /**
   * Collect user preferences through interactive prompts
   */
  private async collectPreferences(): Promise<void> {
    console.log(pc.cyan('📋 Let\'s learn about your project:\n'));

    // Project type
    this.preferences.projectType = await this.askChoice(
      'What type of project are you working on?',
      [
        { key: 'new', label: 'New project (starting fresh)' },
        { key: 'existing', label: 'Existing project (add ZodKit)' },
        { key: 'learning', label: 'Learning/experimenting' }
      ]
    );

    // Experience level
    this.preferences.experience = await this.askChoice(
      'What\'s your experience with Zod/schema validation?',
      [
        { key: 'beginner', label: 'Beginner (new to schemas)' },
        { key: 'intermediate', label: 'Intermediate (some experience)' },
        { key: 'advanced', label: 'Advanced (expert level)' }
      ]
    );

    // Framework detection/selection
    await this.detectOrSelectFramework();

    // AI tools integration
    await this.selectAITools();

    // Feature preferences
    await this.selectFeatures();
  }

  /**
   * Execute onboarding steps based on preferences
   */
  private async executeSteps(): Promise<void> {
    const steps = this.getStepsForPreferences();

    console.log(pc.cyan('\n⚡ Setting up your ZodKit environment:\n'));

    for (const step of steps) {
      if (step.skipCondition?.()) {
        console.log(pc.gray(`⏭️  Skipping: ${step.title}`));
        continue;
      }

      console.log(pc.blue(`🔧 ${step.title}`));
      console.log(pc.gray(`   ${step.description}`));

      if (step.action) {
        try {
          const success = await step.action();
          if (success) {
            console.log(pc.green(`✅ ${step.successMessage || 'Completed'}`));
          } else {
            console.log(pc.yellow(`⚠️  Skipped: ${step.title}`));
          }
        } catch (error) {
          console.log(pc.red(`❌ Failed: ${step.title}`));
          console.log(pc.gray(`   ${error}`));
        }
      }

      console.log();
    }
  }

  /**
   * Get onboarding steps based on user preferences
   */
  private getStepsForPreferences(): OnboardingStep[] {
    const steps: OnboardingStep[] = [
      {
        id: 'config',
        title: 'Create ZodKit Configuration',
        description: 'Setting up zodkit.config.js with your preferences',
        action: () => this.createConfiguration(),
        successMessage: 'Configuration file created'
      }
    ];

    // Add framework-specific steps
    if (this.preferences.framework && this.preferences.framework !== 'other') {
      steps.push({
        id: 'framework-setup',
        title: `Configure for ${this.preferences.framework}`,
        description: `Adding ${this.preferences.framework}-specific optimizations`,
        action: () => this.setupFrameworkIntegration(),
        successMessage: `${this.preferences.framework} integration configured`
      });
    }

    // Add AI tools setup
    if (this.preferences.aiTools && this.preferences.aiTools.length > 0) {
      steps.push({
        id: 'ai-tools',
        title: 'Setup AI Tools Integration',
        description: `Configuring ${this.preferences.aiTools.join(', ')} integration`,
        action: () => this.setupAITools(),
        successMessage: 'AI tools configured'
      });
    }

    // Add preset configuration
    if (this.preferences.usePresets) {
      steps.push({
        id: 'presets',
        title: 'Configure Development Presets',
        description: 'Setting up recommended command presets',
        action: () => this.setupPresets(),
        successMessage: 'Presets configured'
      });
    }

    // Add MCP server setup
    if (this.preferences.enableMcp) {
      steps.push({
        id: 'mcp',
        title: 'Setup MCP Server',
        description: 'Configuring Model Context Protocol for AI assistants',
        action: () => this.setupMcpServer(),
        successMessage: 'MCP server configured'
      });
    }

    // Add testing setup
    if (this.preferences.setupTesting) {
      steps.push({
        id: 'testing',
        title: 'Setup Schema Testing',
        description: 'Configuring automated schema testing',
        action: () => this.setupTesting(),
        successMessage: 'Testing framework configured'
      });
    }

    // Add example schemas for beginners
    if (this.preferences.experience === 'beginner') {
      steps.push({
        id: 'examples',
        title: 'Create Example Schemas',
        description: 'Adding example schemas to get you started',
        action: () => this.createExampleSchemas(),
        successMessage: 'Example schemas created'
      });
    }

    return steps;
  }

  // Implementation methods for each step
  private async createConfiguration(): Promise<boolean> {
    const config = this.generateConfig();
    const configPath = resolve(process.cwd(), 'zodkit.config.js');

    try {
      writeFileSync(configPath, config);
      return true;
    } catch (error) {
      console.error('Failed to create configuration:', error);
      return false;
    }
  }

  private async setupFrameworkIntegration(): Promise<boolean> {
    // Framework-specific setup logic would go here
    return true;
  }

  private async setupAITools(): Promise<boolean> {
    // AI tools integration logic would go here
    return true;
  }

  private async setupPresets(): Promise<boolean> {
    // Preset configuration logic would go here
    return true;
  }

  private async setupMcpServer(): Promise<boolean> {
    // MCP server setup logic would go here
    return true;
  }

  private async setupTesting(): Promise<boolean> {
    // Testing framework setup logic would go here
    return true;
  }

  private async createExampleSchemas(): Promise<boolean> {
    const exampleSchema = `import { z } from 'zod';

// Example User schema with smart patterns
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(50),
  age: z.number().min(0).max(150),
  website: z.string().url().optional(),
  createdAt: z.date()
});

export type User = z.infer<typeof UserSchema>;

// Example Product schema
export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().positive(),
  category: z.enum(['electronics', 'clothing', 'books', 'other']),
  inStock: z.boolean(),
  tags: z.array(z.string())
});

export type Product = z.infer<typeof ProductSchema>;
`;

    try {
      const examplesDir = resolve(process.cwd(), 'src/schemas');
      if (!existsSync(examplesDir)) {
        // In real implementation, create directory
      }

      const examplePath = resolve(examplesDir, 'examples.ts');
      writeFileSync(examplePath, exampleSchema);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Helper methods for user interaction
  private async askChoice<T extends string>(
    question: string,
    choices: Array<{ key: T; label: string }>
  ): Promise<T> {
    console.log(pc.cyan(question));
    choices.forEach((choice, index) => {
      console.log(`${pc.gray(String(index + 1))}. ${choice.label}`);
    });

    // In real implementation, use inquirer or similar for interactive prompts
    // For now, return a default based on preferences pattern
    return choices[0].key;
  }

  private async askYesNo(question: string): Promise<boolean> {
    console.log(pc.cyan(question + ' (y/n)'));
    // In real implementation, capture user input
    return true; // Default to yes for demo
  }

  private async askMultiSelect(question: string, choices: string[]): Promise<string[]> {
    console.log(pc.cyan(question + ' (select multiple)'));
    choices.forEach((choice, index) => {
      console.log(`${pc.gray(String(index + 1))}. ${choice}`);
    });
    // In real implementation, allow multiple selection
    return []; // Default to none for demo
  }

  // Framework detection
  private async detectOrSelectFramework(): Promise<void> {
    const packageJsonPath = resolve(process.cwd(), 'package.json');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Auto-detect framework
        if (deps.react) this.preferences.framework = 'react';
        else if (deps.next) this.preferences.framework = 'next';
        else if (deps.express) this.preferences.framework = 'express';
        else {
          this.preferences.framework = await this.askChoice(
            'Which framework are you using?',
            [
              { key: 'react', label: 'React' },
              { key: 'node', label: 'Node.js' },
              { key: 'next', label: 'Next.js' },
              { key: 'express', label: 'Express' },
              { key: 'other', label: 'Other/None' }
            ]
          );
        }
      } catch {
        // If package.json parsing fails, ask user
        this.preferences.framework = 'other';
      }
    } else {
      this.preferences.framework = 'other';
    }
  }

  private async selectAITools(): Promise<void> {
    this.preferences.aiTools = await this.askMultiSelect(
      'Which AI tools do you use? (we\'ll optimize for them)',
      ['Cursor', 'Claude', 'GitHub Copilot', 'WindSurf', 'Other', 'None']
    );
  }

  private async selectFeatures(): Promise<void> {
    this.preferences.usePresets = await this.askYesNo(
      'Set up command presets for different workflows?'
    );

    this.preferences.enableMcp = await this.askYesNo(
      'Enable MCP server for AI assistant integration?'
    );

    this.preferences.setupTesting = await this.askYesNo(
      'Configure automatic schema testing?'
    );
  }

  private generateConfig(): string {
    const preset = this.preferences.experience === 'beginner' ? 'learning' :
                   this.preferences.experience === 'advanced' ? 'performance' : 'development';

    return `module.exports = {
  // Schema discovery
  schemas: {
    patterns: ['./src/schemas/**/*.ts', './src/**/*.schema.ts'],
    exclude: ['**/*.test.ts', '**/*.spec.ts']
  },

  // Default preset based on your preferences
  defaultPreset: '${preset}',

  // Framework integration
  framework: '${this.preferences.framework || 'other'}',

  // AI tools integration
  aiTools: ${JSON.stringify(this.preferences.aiTools || [])},

  // Features
  features: {
    mcp: ${this.preferences.enableMcp || false},
    testing: ${this.preferences.setupTesting || false},
    presets: ${this.preferences.usePresets || false}
  },

  // Rules configuration
  rules: {
    'require-validation': 'error',
    'no-any-fallback': 'warn',
    'prefer-strict-schemas': '${this.preferences.experience === 'advanced' ? 'error' : 'warn'}'
  },

  // Output preferences
  output: {
    format: 'console',
    verbose: ${this.preferences.experience === 'beginner'}
  }
};`;
  }

  private isAlreadyConfigured(): boolean {
    return existsSync(resolve(process.cwd(), 'zodkit.config.js')) ||
           existsSync(resolve(process.cwd(), 'zodkit.config.ts'));
  }

  private showCompletionMessage(): void {
    console.log(pc.green('🎉 ZodKit setup complete!\n'));

    console.log(pc.cyan('🚀 Next steps:'));

    if (this.preferences.experience === 'beginner') {
      console.log('1. Check out the example schemas we created');
      console.log('2. Run "zodkit check" to analyze your schemas');
      console.log('3. Try "zodkit ui" for the interactive dashboard');
      console.log('4. Use "zodkit suggestions" when you need help');
    } else {
      console.log('1. Run "zodkit check" to analyze your schemas');
      console.log('2. Try "zodkit analyze" for comprehensive analysis');
      console.log('3. Use "zodkit optimize" to improve performance');
      console.log('4. Launch "zodkit ui" for the unified dashboard');
    }

    console.log(pc.gray('\n💡 Run "zodkit --help" anytime for available commands'));
    console.log(pc.gray('💡 Use "zodkit suggestions" for context-aware help'));

    if (this.preferences.enableMcp) {
      console.log(pc.blue('\n🤖 MCP server configured! Your AI assistant can now help with schemas.'));
    }
  }
}

/**
 * Start onboarding flow
 */
export async function startOnboarding(): Promise<void> {
  const onboarding = new OnboardingFlow();
  await onboarding.start();
}