/**
 * @fileoverview Unit Tests for CLI Functionality
 * @module CLITests
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

describe('ZodKit CLI', () => {
  const cliPath = path.join(__dirname, '../../src/cli/functional.ts');
  const nodeCommand = `node -r ts-node/register ${cliPath}`;

  describe('Basic CLI Operations', () => {
    it('should display help when run without arguments', async () => {
      const { stdout } = await execAsync(nodeCommand);

      expect(stdout).toContain('ZodKit CLI');
      expect(stdout).toContain('Schema validation and analysis toolkit');
      expect(stdout).toContain('zodkit check');
      expect(stdout).toContain('zodkit analyze');
      expect(stdout).toContain('zodkit init');
      expect(stdout).toContain('zodkit fix');
    }, 10000);

    it('should display version information', async () => {
      const { stdout } = await execAsync(`${nodeCommand} --version`);

      expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    }, 10000);

    it('should display help for specific commands', async () => {
      const { stdout } = await execAsync(`${nodeCommand} check --help`);

      expect(stdout).toContain('check');
      expect(stdout).toContain('Quick schema validation');
      expect(stdout).toContain('--json');
      expect(stdout).toContain('--unused');
      expect(stdout).toContain('--duplicates');
      expect(stdout).toContain('--complexity');
    }, 10000);
  });

  describe('Check Command', () => {
    it('should run check command without errors', async () => {
      const { stdout, stderr } = await execAsync(`${nodeCommand} check`);

      expect(stderr).toBe('');
      expect(stdout).toContain('zodkit check');
      expect(stdout).toContain('Checking all schemas');
    }, 10000);

    it('should output JSON when requested', async () => {
      const { stdout } = await execAsync(`${nodeCommand} check --json`);

      const output = JSON.parse(stdout);
      expect(output).toHaveProperty('command', 'check');
      expect(output).toHaveProperty('results');
      expect(output.results).toHaveProperty('schemas');
      expect(output.results).toHaveProperty('issues');
      expect(output.results).toHaveProperty('files');
    }, 10000);

    it('should handle specific schema targets', async () => {
      const { stdout } = await execAsync(`${nodeCommand} check user --json`);

      const output = JSON.parse(stdout);
      expect(output).toHaveProperty('schema', 'user');
      expect(output.results).toHaveProperty('schemas');
    }, 10000);
  });

  describe('Analyze Command', () => {
    it('should run analyze command', async () => {
      const { stdout, stderr } = await execAsync(`${nodeCommand} analyze`);

      expect(stderr).toBe('');
      expect(stdout).toContain('zodkit analyze');
      expect(stdout).toContain('Analyzing all schemas');
    }, 10000);

    it('should support different analysis modes', async () => {
      const { stdout } = await execAsync(`${nodeCommand} analyze --mode complexity --json`);

      const output = JSON.parse(stdout);
      expect(output).toHaveProperty('command', 'analyze');
      expect(output.options).toHaveProperty('mode', 'complexity');
    }, 10000);

    it('should output detailed analysis results', async () => {
      const { stdout } = await execAsync(`${nodeCommand} analyze --json`);

      const output = JSON.parse(stdout);
      expect(output.results).toHaveProperty('mode');
      expect(output.results).toHaveProperty('complexity');
      expect(output.results).toHaveProperty('suggestions');
      expect(output.results).toHaveProperty('performance');
    }, 10000);
  });

  describe('Init Command', () => {
    it('should initialize a project', async () => {
      const { stdout, stderr } = await execAsync(`${nodeCommand} init test-project`);

      expect(stderr).toBe('');
      expect(stdout).toContain('zodkit init');
      expect(stdout).toContain('Initializing test-project');
      expect(stdout).toContain('Created zodkit.config.json');
      expect(stdout).toContain('Project initialized successfully');
    }, 10000);

    it('should provide next steps guidance', async () => {
      const { stdout } = await execAsync(`${nodeCommand} init my-project`);

      expect(stdout).toContain('Next steps:');
      expect(stdout).toContain('Create schemas');
      expect(stdout).toContain('zodkit check');
      expect(stdout).toContain('zodkit analyze');
    }, 10000);
  });

  describe('Fix Command', () => {
    it('should run fix command', async () => {
      const { stdout, stderr } = await execAsync(`${nodeCommand} fix`);

      expect(stderr).toBe('');
      expect(stdout).toContain('zodkit fix');
      expect(stdout).toContain('Auto-fixing schema issues');
    }, 10000);

    it('should support dry run mode', async () => {
      const { stdout } = await execAsync(`${nodeCommand} fix --dry-run`);

      expect(stdout).toContain('Dry run mode');
      expect(stdout).toContain('no changes will be made');
    }, 10000);

    it('should handle cases with no issues', async () => {
      const { stdout } = await execAsync(`${nodeCommand} fix`);

      // Since we don't have real schemas, it should report no issues
      expect(stdout).toContain('No issues found to fix');
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      try {
        await execAsync(`${nodeCommand} nonexistent-command`);
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr || error.stdout).toContain('Unknown command');
      }
    }, 10000);

    it('should handle invalid options gracefully', async () => {
      try {
        await execAsync(`${nodeCommand} check --invalid-option`);
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr || error.stdout).toContain('Unknown option');
      }
    }, 10000);
  });
});