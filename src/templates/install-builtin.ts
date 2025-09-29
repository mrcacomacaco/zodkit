import { SchemaTemplateManager } from '../core/schema-templates';
import { BuiltinTemplates } from './builtin-templates';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function installBuiltinTemplates(basePath?: string): Promise<void> {
  const manager = new SchemaTemplateManager(basePath);
  await manager.initialize();

  console.log('Installing built-in templates...');

  for (const template of BuiltinTemplates) {
    try {
      // Check if template already exists
      const existing = await manager.getTemplate(template.id);
      if (existing) {
        console.log(`Template ${template.name} already exists, skipping...`);
        continue;
      }

      // Create template files
      const templateDir = path.join(manager['templatePath'], template.id);
      await ensureDirectory(templateDir);

      // Save template metadata
      const metadataPath = path.join(templateDir, 'template.json');
      await fs.writeFile(metadataPath, JSON.stringify(template, null, 2));

      // Generate schema file
      const schemaPath = path.join(templateDir, 'schema.ts');
      const schemaCode = generateSchemaCode(template);
      await fs.writeFile(schemaPath, schemaCode);

      // Generate examples
      if (template.examples.length > 0) {
        const examplesDir = path.join(templateDir, 'examples');
        await ensureDirectory(examplesDir);

        for (const example of template.examples) {
          const examplePath = path.join(examplesDir, `${example.id}.ts`);
          const exampleCode = generateExampleCode(template, example);
          await fs.writeFile(examplePath, exampleCode);
        }
      }

      // Generate README
      const readmePath = path.join(templateDir, 'README.md');
      const readmeContent = generateReadme(template);
      await fs.writeFile(readmePath, readmeContent);

      // Add to manager's template map
      manager['templates'].set(template.id, template);

      console.log(`✓ Installed template: ${template.name}`);
    } catch (error) {
      console.error(`✗ Failed to install template ${template.name}:`, error);
    }
  }

  console.log(`Successfully installed ${BuiltinTemplates.length} built-in templates!`);
}

async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

function generateSchemaCode(template: any): string {
  const schemaName = toPascalCase(template.name.replace(/Schema$/, '')) + 'Schema';
  const typeName = toPascalCase(template.name.replace(/Schema$/, ''));

  return `import { z } from 'zod';

/**
 * ${template.name}
 * ${template.description}
 *
 * @author ${template.author.name}
 * @version ${template.version}
 * @category ${template.category}
 * @tags ${template.tags.join(', ')}
 * @difficulty ${template.difficulty}
 * @license ${template.license}
 */
export const ${schemaName} = ${generateZodCode(template.schema)};

export type ${typeName} = z.infer<typeof ${schemaName}>;

// Re-export for convenience
export default ${schemaName};
`;
}

function generateExampleCode(template: any, example: any): string {
  const schemaName = toPascalCase(template.name.replace(/Schema$/, '')) + 'Schema';

  return `// ${example.title}
// ${example.description}
// Difficulty: ${example.difficulty}

import { ${schemaName} } from '../schema';

// ${example.explanation}

${example.code}

// Example input data:
const exampleInput = ${JSON.stringify(example.input, null, 2)};

// Example output data:
const exampleOutput = ${JSON.stringify(example.output, null, 2)};

// Validate the input
try {
  const result = ${schemaName}.parse(exampleInput);
  console.log('Validation successful:', result);
} catch (error) {
  console.error('Validation failed:', error);
}

export { exampleInput, exampleOutput };
`;
}

function generateReadme(template: any): string {
  const features = template.metadata.features.map((f: string) => `- ${f}`).join('\n');
  const useCases = template.metadata.useCases.map((u: string) => `- ${u}`).join('\n');
  const tags = template.tags.map((t: string) => `\`${t}\``).join(' ');

  return `# ${template.name}

${template.description}

## Overview

${template.documentation.overview}

## Installation

\`\`\`bash
${template.documentation.installation}
\`\`\`

## Usage

${template.documentation.usage}

## Examples

${template.examples.map((example: any) => `
### ${example.title}

${example.description}

\`\`\`typescript
${example.code}
\`\`\`
`).join('\n')}

## Features

${features}

## Use Cases

${useCases}

## Technical Details

- **Framework**: ${template.metadata.framework}
- **Language**: ${template.metadata.language}
- **Complexity**: ${template.metadata.complexity}
- **Performance**: ${template.metadata.performance.validationSpeed}
- **Bundle Size**: ${template.metadata.performance.bundleSize} bytes

## Tags

${tags}

## Dependencies

${template.dependencies.map((dep: any) => `- ${dep.name} ${dep.version} (${dep.type})`).join('\n')}

## Metadata

- **ID**: ${template.id}
- **Version**: ${template.version}
- **Author**: ${template.author.name}${template.author.email ? ` <${template.author.email}>` : ''}
- **License**: ${template.license}
- **Created**: ${template.created.toISOString().split('T')[0]}
- **Updated**: ${template.updated.toISOString().split('T')[0]}

## Support

For questions or issues with this template, please visit our [documentation](https://zodded.dev) or [GitHub repository](https://github.com/zodded/templates).
`;
}

function generateZodCode(schema: any): string {
  // This is a simplified version - in a real implementation,
  // you'd need a more sophisticated schema-to-code generator
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return 'z.any() // Complex schema - see template for details';
  }
}

function toPascalCase(str: string): string {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
    return word.toUpperCase();
  }).replace(/\s+/g, '');
}

// CLI helper function
export async function runInstallBuiltinTemplates(): Promise<void> {
  try {
    await installBuiltinTemplates();
    process.exit(0);
  } catch (error) {
    console.error('Failed to install built-in templates:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runInstallBuiltinTemplates();
}