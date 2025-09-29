/**
 * @fileoverview Contract testing between frontend/backend services
 * @module ContractCommand
 */

import * as pc from 'picocolors';
import { Command } from 'commander';
import { ConfigManager } from '../../core/config';
import { SchemaDiscovery } from '../../core/infrastructure/schema-discovery';
import { SchemaTester } from '../../core/testing/schema-tester';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ContractOptions {
  between?: string[];
  validate?: boolean;
  generate?: boolean;
  ci?: boolean;
  output?: string;
  format?: 'jest' | 'vitest' | 'mocha' | 'playwright';
  strict?: boolean;
  watch?: boolean;
}

export async function contractCommand(
  options: ContractOptions,
  command: Command
): Promise<void> {
  const globalOpts = command.parent?.opts() ?? {};
  const isJsonMode = (globalOpts as { json?: boolean })?.json ?? false;

  try {
    if (!isJsonMode) {
      console.log(pc.blue('🤝 zodkit contract') + pc.gray(' - Contract testing between services...'));
    }

    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    const discovery = new SchemaDiscovery(config);
    const tester = new SchemaTester();

    // Discover all schemas
    const schemas = await discovery.findSchemas();
    if (schemas.length === 0) {
      throw new Error('No schemas found in project');
    }

    // Determine services to test
    let services: string[] = [];
    if (options.between && options.between.length > 0) {
      services = options.between;
    } else {
      // Auto-detect services from schema paths
      services = tester.detectServices(schemas);
    }

    if (services.length < 2) {
      throw new Error('At least 2 services are required for contract testing');
    }

    // Validate existing contracts
    if (options.validate) {
      const results = await tester.validateContracts(schemas, services, {
        strict: options.strict ?? false,
        ci: options.ci ?? false
      });

      if (isJsonMode) {
        const resultData = results as { passed: boolean; contracts: unknown[]; violations: unknown[] };
        console.log(JSON.stringify({
          success: resultData.passed,
          validation: results,
          contracts: resultData.contracts,
          violations: resultData.violations
        }, null, 2));
      } else {
        displayValidationResults(results, services);
      }

      if (options.ci && !(results as { passed: boolean }).passed) {
        process.exit(1);
      }
      return;
    }

    // Generate contract tests
    if (options.generate) {
      const format = options.format ?? 'jest';
      const outputDir = options.output ?? './contracts';

      const generated = await tester.generateContractTests(schemas, services, {
        format,
        outputDir,
        strict: options.strict ?? false
      });

      // Ensure output directory exists
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write test files
      for (const testFile of generated.files) {
        const filePath = join(outputDir, testFile.name);
        writeFileSync(filePath, testFile.content);
      }

      if (isJsonMode) {
        console.log(JSON.stringify({
          success: true,
          generated: {
            files: generated.files.length,
            contracts: generated.contracts.length,
            outputDir
          },
          contracts: generated.contracts
        }, null, 2));
      } else {
        displayGenerationResults(generated as GenerationResults, outputDir, format);
      }
      return;
    }

    // Default: analyze contracts and show recommendations
    const analysis = await tester.analyzeContracts(schemas, services);

    if (isJsonMode) {
      console.log(JSON.stringify({
        success: true,
        analysis,
        services,
        recommendations: analysis.recommendations
      }, null, 2));
    } else {
      displayContractAnalysis(analysis as ContractAnalysis, services);
    }

  } catch (error) {
    if (isJsonMode) {
      console.log(JSON.stringify({
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'CONTRACT_ERROR'
        }
      }, null, 2));
    } else {
      console.error(pc.red('❌ Contract testing failed:'), error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function displayValidationResults(results: unknown, services: string[]): void {
  const validationResults = results as {
    contracts: Array<{ status: string; name: string; endpoint: string }>;
    passed: boolean;
    violations?: Array<{
      contract: string;
      service: string;
      type: string;
      description: string;
      expected?: unknown;
      actual?: unknown;
      suggestion?: string;
    }>;
    warnings?: Array<{ message: string }>;
    coverage?: number;
  };
  console.log('\n' + pc.bold('🔍 Contract Validation Results'));
  console.log(pc.gray('─'.repeat(60)));

  console.log(pc.cyan('Services:'), services.join(' ↔ '));
  console.log(pc.cyan('Contracts:'), validationResults.contracts.length);
  console.log(pc.cyan('Status:'), validationResults.passed ? pc.green('✓ PASSED') : pc.red('✗ FAILED'));

  if (validationResults.violations && validationResults.violations.length > 0) {
    console.log('\n' + pc.red('❌ Contract Violations:'));
    validationResults.violations.forEach((violation, i: number) => {
      console.log(`\n  ${i + 1}. ${pc.bold(violation.contract)}`);
      console.log(`     Service: ${violation.service}`);
      console.log(`     Type: ${violation.type}`);
      console.log(`     ${pc.red('Issue:')} ${violation.description}`);

      if (violation.expected && violation.actual) {
        console.log(`     ${pc.gray('Expected:')} ${JSON.stringify(violation.expected)}`);
        console.log(`     ${pc.gray('Actual:')} ${JSON.stringify(violation.actual)}`);
      }

      if (violation.suggestion) {
        console.log(`     ${pc.yellow('💡 Suggestion:')} ${violation.suggestion}`);
      }
    });
  }

  if (validationResults.contracts.length > 0) {
    console.log('\n' + pc.green('✓ Valid Contracts:'));
    validationResults.contracts.forEach((contract) => {
      if (contract.status === 'valid') {
        console.log(`  ✓ ${contract.name} (${contract.endpoint})`);
      }
    });
  }

  if (validationResults.warnings?.length > 0) {
    console.log('\n' + pc.yellow('⚠️  Warnings:'));
    validationResults.warnings.forEach((warning) => {
      console.log(`  • ${warning.message}`);
    });
  }

  console.log('\n' + pc.bold('Summary:'));
  console.log(`  Contracts: ${validationResults.contracts.length}`);
  console.log(`  Violations: ${validationResults.violations?.length ?? 0}`);
  console.log(`  Coverage: ${(validationResults as { coverage?: number }).coverage?.toFixed(1) ?? '0.0'}%`);
}

interface GenerationResults {
  files: Array<{
    name: string;
    lines: number;
  }>;
  contracts: Array<{
    name: string;
    endpoint: string;
    methods: string[];
    testCount: number;
  }>;
}

function displayGenerationResults(generated: GenerationResults, outputDir: string, format: string): void {
  console.log('\n' + pc.bold('✨ Contract Tests Generated'));
  console.log(pc.gray('─'.repeat(60)));

  console.log(pc.cyan('Format:'), format);
  console.log(pc.cyan('Output Directory:'), outputDir);
  console.log(pc.cyan('Test Files:'), generated.files.length);
  console.log(pc.cyan('Contracts:'), generated.contracts.length);

  console.log('\n' + pc.bold('Generated Files:'));
  generated.files.forEach((file) => {
    console.log(`  📄 ${file.name} (${file.lines} lines)`);
  });

  console.log('\n' + pc.bold('Contract Coverage:'));
  generated.contracts.forEach((contract) => {
    console.log(`  🤝 ${contract.name}`);
    console.log(`     Endpoint: ${contract.endpoint}`);
    console.log(`     Methods: ${contract.methods.join(', ')}`);
    console.log(`     Tests: ${contract.testCount}`);
  });

  console.log('\n' + pc.bold('Next Steps:'));
  console.log(`1. Run tests: ${pc.cyan(`npm test ${outputDir}`)}`);
  console.log(`2. Add to CI: Include contract tests in your pipeline`);
  console.log(`3. Update contracts: Re-run when schemas change`);

  if (format === 'jest') {
    console.log(`4. Configure Jest: Add ${pc.cyan(outputDir)} to testMatch`);
  } else if (format === 'playwright') {
    console.log(`4. Configure Playwright: Add contract test configuration`);
  }
}

interface ContractAnalysis {
  potentialContracts: unknown[];
  compatibility: {
    score: number;
    matrix?: Record<string, unknown>;
  };
  recommendations?: Array<{
    type: string;
    message: string;
    priority: string;
    action?: string;
  }>;
}

function displayContractAnalysis(analysis: ContractAnalysis, services: string[]): void {
  console.log('\n' + pc.bold('📊 Contract Analysis'));
  console.log(pc.gray('─'.repeat(60)));

  console.log(pc.cyan('Services:'), services.join(' ↔ '));
  console.log(pc.cyan('Potential Contracts:'), analysis.potentialContracts.length);
  console.log(pc.cyan('Schema Compatibility:'), `${analysis.compatibility.score.toFixed(1)}%`);

  // Show compatibility matrix
  if (analysis.compatibility.matrix) {
    console.log('\n' + pc.bold('Service Compatibility Matrix:'));
    console.log(pc.gray('Green = Compatible, Yellow = Partially Compatible, Red = Incompatible\n'));

    const matrix = analysis.compatibility.matrix as Record<string, Record<string, number>>;
    const services = Object.keys(matrix);

    // Header
    console.log('       ' + services.map(s => s.substring(0, 8).padEnd(9)).join(''));

    services.forEach(serviceA => {
      const row = serviceA.substring(0, 6).padEnd(7);
      const cells = services.map(serviceB => {
        const score = matrix[serviceA]?.[serviceB] ?? 0;
        let color = pc.red;
        if (score > 80) color = pc.green;
        else if (score > 60) color = pc.yellow;
        return color(score.toFixed(0).padStart(3) + '%    ');
      }).join('');
      console.log(row + cells);
    });
  }

  // Show potential contracts
  if (analysis.potentialContracts.length > 0) {
    console.log('\n' + pc.bold('🔍 Potential Contracts:'));
    analysis.potentialContracts.slice(0, 10).forEach((contract, i: number) => {
      const contractData = contract as {
        endpoint: string;
        services: string[];
        request?: { schema?: string };
        response?: { schema?: string };
        compatibility: number;
        issues?: string[];
      };
      console.log(`\n  ${i + 1}. ${pc.cyan(contractData.endpoint)}`);
      console.log(`     Services: ${contractData.services.join(' ↔ ')}`);
      console.log(`     Request: ${contractData.request?.schema ?? 'none'}`);
      console.log(`     Response: ${contractData.response?.schema ?? 'none'}`);
      console.log(`     Compatibility: ${contractData.compatibility}%`);

      if (contractData.issues && contractData.issues.length > 0) {
        console.log(`     ${pc.yellow('Issues:')} ${contractData.issues.join(', ')}`);
      }
    });

    if (analysis.potentialContracts.length > 10) {
      console.log(`\n  ... and ${analysis.potentialContracts.length - 10} more`);
    }
  }

  // Show recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('\n' + pc.bold('💡 Recommendations:'));
    analysis.recommendations.forEach((rec, i: number) => {
      console.log(`\n  ${i + 1}. ${pc.yellow(rec.type)}: ${rec.message}`);

      if (rec.action) {
        console.log(`     ${pc.cyan('Action:')} ${rec.action}`);
      }

      if (rec.priority) {
        const priorityColor = rec.priority === 'high' ? pc.red :
                             rec.priority === 'medium' ? pc.yellow : pc.gray;
        console.log(`     ${pc.gray('Priority:')} ${priorityColor(rec.priority)}`);
      }
    });
  }

  // Show next steps
  console.log('\n' + pc.bold('Next Steps:'));
  console.log('1. Generate tests: ' + pc.cyan('zodkit contract --generate'));
  console.log('2. Validate contracts: ' + pc.cyan('zodkit contract --validate'));
  console.log('3. Add to CI pipeline: ' + pc.cyan('zodkit contract --validate --ci'));
}