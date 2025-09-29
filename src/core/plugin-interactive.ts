/**
 * @fileoverview Interactive Plugin Creation
 * @module PluginInteractive
 *
 * Interactive CLI for creating zodkit plugins
 */

import * as pc from 'picocolors';
import { PluginDevToolkit, PluginScaffoldOptions } from './plugin-dev-toolkit';

// === INTERACTIVE PLUGIN CREATION ===

/**
 * Create a plugin interactively with prompts
 */
export async function createPluginInteractive(name: string, options: any): Promise<void> {
  console.log(pc.bold(pc.blue('🚀 Welcome to the ZodKit Plugin Creator!')));
  console.log();

  const scaffoldOptions: PluginScaffoldOptions = {
    name,
    description: '',
    author: '',
    template: 'basic',
    typescript: true,
    git: true,
    install: true
  };

  try {
    // Use simple prompts for now - in real implementation would use inquirer
    console.log(pc.cyan('Creating plugin with the following configuration:'));
    console.log(`  Name: ${pc.green(name)}`);

    // Get description
    scaffoldOptions.description = options.description || `A zodkit plugin: ${name}`;
    console.log(`  Description: ${scaffoldOptions.description}`);

    // Get author
    scaffoldOptions.author = options.author || 'Anonymous';
    console.log(`  Author: ${scaffoldOptions.author}`);

    // Get template
    scaffoldOptions.template = options.template || 'basic';
    console.log(`  Template: ${scaffoldOptions.template}`);

    // Get language
    scaffoldOptions.typescript = options.javascript !== true;
    console.log(`  Language: ${scaffoldOptions.typescript ? 'TypeScript' : 'JavaScript'}`);

    console.log();
    console.log(pc.cyan('🔨 Creating plugin...'));

    const toolkit = new PluginDevToolkit();
    await toolkit.scaffoldPlugin(scaffoldOptions);

    console.log();
    console.log(pc.green('✅ Plugin created successfully!'));
    console.log();
    console.log(pc.bold('What you can do next:'));
    console.log(`  ${pc.cyan('cd')} ${name}`);
    console.log(`  ${pc.cyan('zodkit plugins test')}     - Test your plugin`);
    console.log(`  ${pc.cyan('zodkit plugins validate')} - Validate your plugin`);
    console.log(`  ${pc.cyan('zodkit plugins build')}    - Build for distribution`);
    console.log(`  ${pc.cyan('zodkit plugins publish')}  - Publish to npm`);

  } catch (error) {
    console.error(pc.red(`Failed to create plugin: ${error}`));
    process.exit(1);
  }
}

/**
 * Simple prompt helper (would use inquirer in real implementation)
 */
function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    import readline from "readline";
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const displayQuestion = defaultValue
      ? `${question} (${pc.gray(defaultValue)}): `
      : `${question}: `;

    rl.question(displayQuestion, (answer: string) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Multiple choice prompt helper
 */
function promptChoice(question: string, choices: string[], defaultChoice: string): Promise<string> {
  return new Promise((resolve) => {
    console.log(question);
    choices.forEach((choice, index) => {
      const isDefault = choice === defaultChoice;
      const marker = isDefault ? pc.green('●') : pc.gray('○');
      console.log(`  ${marker} ${choice}${isDefault ? pc.gray(' (default)') : ''}`);
    });

    import readline from "readline";
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Choice: ', (answer: string) => {
      rl.close();
      const choice = answer.trim() || defaultChoice;
      if (choices.includes(choice)) {
        resolve(choice);
      } else {
        console.log(pc.red(`Invalid choice. Please select from: ${choices.join(', ')}`));
        resolve(promptChoice(question, choices, defaultChoice));
      }
    });
  });
}

/**
 * Yes/No prompt helper
 */
function promptConfirm(question: string, defaultValue: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? 'Y/n' : 'y/N';
    import readline from "readline";
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${question} (${defaultText}): `, (answer: string) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

export default { createPluginInteractive };