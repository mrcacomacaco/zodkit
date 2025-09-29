/**
 * @fileoverview Generate documentation from Zod schemas
 * @module DocsCommand
 */

import * as pc from 'picocolors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import fg from 'fast-glob';

interface DocsOptions {
  output?: string;
  format?: 'markdown' | 'html' | 'json';
  include?: string[];
  exclude?: string[];
  template?: string;
  title?: string;
  watch?: boolean;
}

interface SchemaDoc {
  name: string;
  description?: string;
  properties: PropertyDoc[];
  examples?: string[];
  filePath: string;
}

interface PropertyDoc {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  constraints?: string[];
  example?: any;
}

export async function docsCommand(options: DocsOptions): Promise<void> {
  try {
    console.log(pc.blue('📚 Generating schema documentation...'));

    const outputPath = options.output || './docs/schemas';
    const format = options.format || 'markdown';

    // Ensure output directory exists
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }

    // Find schema files
    const patterns = options.include || ['src/**/*.schema.ts', 'src/schemas/**/*.ts', '**/*.zod.ts'];
    const excludePatterns = options.exclude || ['node_modules/**', 'dist/**', '**/*.test.ts'];

    const files = await fg(patterns, { ignore: excludePatterns });

    if (files.length === 0) {
      console.log(pc.yellow('⚠️  No schema files found. Make sure your files match the patterns:'));
      patterns.forEach(p => console.log(`  - ${p}`));
      return;
    }

    console.log(pc.gray(`Found ${files.length} schema files`));

    const schemaDocs: SchemaDoc[] = [];

    // Parse each schema file
    for (const file of files) {
      try {
        const docs = await parseSchemaFile(file);
        schemaDocs.push(...docs);
      } catch (error) {
        console.warn(pc.yellow(`Warning: Could not parse ${file}: ${error}`));
      }
    }

    if (schemaDocs.length === 0) {
      console.log(pc.yellow('⚠️  No valid schemas found in the files'));
      return;
    }

    // Generate documentation
    console.log(pc.gray(`Generating ${format} documentation for ${schemaDocs.length} schemas...`));

    switch (format) {
      case 'markdown':
        await generateMarkdownDocs(schemaDocs, outputPath, options);
        break;
      case 'html':
        await generateHtmlDocs(schemaDocs, outputPath, options);
        break;
      case 'json':
        await generateJsonDocs(schemaDocs, outputPath, options);
        break;
    }

    console.log(pc.green(`✅ Documentation generated in ${outputPath}`));

    // Show quick preview
    if (format === 'markdown' && schemaDocs.length > 0) {
      console.log(pc.cyan('\n📋 Quick preview:'));
      const firstSchema = schemaDocs[0];
      console.log(`  Schema: ${firstSchema.name}`);
      console.log(`  Properties: ${firstSchema.properties.length}`);
      console.log(`  File: ${firstSchema.filePath}`);
    }

  } catch (error) {
    console.error(pc.red('❌ Documentation generation failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function parseSchemaFile(filePath: string): Promise<SchemaDoc[]> {
  const content = readFileSync(filePath, 'utf8');
  const schemas: SchemaDoc[] = [];

  // Extract schema definitions using regex (simple approach)
  const schemaRegex = /export\s+const\s+(\w+(?:Schema|Validator|Model))\s*=\s*z\.([\s\S]*?)(?=\n\n|\nexport|\n\/\/|\n\*|$)/g;

  let match;
  while ((match = schemaRegex.exec(content)) !== null) {
    const [, name, definition] = match;

    try {
      const properties = parseSchemaDefinition(definition);
      const description = extractDescription(content, name);

      schemas.push({
        name,
        description,
        properties,
        filePath: filePath,
        examples: extractExamples(content, name)
      });
    } catch (error) {
      console.warn(pc.yellow(`Warning: Could not parse schema ${name}: ${error}`));
    }
  }

  return schemas;
}

function parseSchemaDefinition(definition: string): PropertyDoc[] {
  const properties: PropertyDoc[] = [];

  // Handle object schemas
  const objectMatch = definition.match(/object\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (objectMatch) {
    const objectBody = objectMatch[1];

    // Parse properties
    const propRegex = /(\w+)\s*:\s*z\.(\w+)\([^)]*\)([.\w()]*)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(objectBody)) !== null) {
      const [fullMatch, propName, baseType, modifiers] = propMatch;

      const property: PropertyDoc = {
        name: propName,
        type: baseType,
        required: !modifiers.includes('.optional()'),
        constraints: extractConstraints(fullMatch)
      };

      properties.push(property);
    }
  }

  return properties;
}

function extractConstraints(definition: string): string[] {
  const constraints: string[] = [];

  // Common Zod constraints
  const constraintPatterns = [
    { pattern: /\.min\((\d+)\)/, format: (match: RegExpMatchArray) => `minimum: ${match[1]}` },
    { pattern: /\.max\((\d+)\)/, format: (match: RegExpMatchArray) => `maximum: ${match[1]}` },
    { pattern: /\.length\((\d+)\)/, format: (match: RegExpMatchArray) => `exact length: ${match[1]}` },
    { pattern: /\.email\(\)/, format: () => 'email format' },
    { pattern: /\.url\(\)/, format: () => 'URL format' },
    { pattern: /\.uuid\(\)/, format: () => 'UUID format' },
    { pattern: /\.positive\(\)/, format: () => 'positive number' },
    { pattern: /\.negative\(\)/, format: () => 'negative number' },
    { pattern: /\.int\(\)/, format: () => 'integer' },
  ];

  for (const { pattern, format } of constraintPatterns) {
    const match = definition.match(pattern);
    if (match) {
      constraints.push(format(match));
    }
  }

  return constraints;
}

function extractDescription(content: string, schemaName: string): string | undefined {
  // Look for JSDoc comments before the schema
  const beforeSchema = content.substring(0, content.indexOf(schemaName));
  const commentMatch = beforeSchema.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);

  if (commentMatch) {
    return commentMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();
  }

  return undefined;
}

function extractExamples(content: string, schemaName: string): string[] {
  const examples: string[] = [];

  // Look for example usage in comments
  const exampleRegex = new RegExp(`@example[\\s\\S]*?${schemaName}[\\s\\S]*?\\n`, 'g');
  let match;

  while ((match = exampleRegex.exec(content)) !== null) {
    examples.push(match[0].replace('@example', '').trim());
  }

  return examples;
}

async function generateMarkdownDocs(schemas: SchemaDoc[], outputPath: string, options: DocsOptions): Promise<void> {
  const title = options.title || 'Schema Documentation';

  // Generate main index file
  const indexContent = generateMarkdownIndex(schemas, title);
  writeFileSync(resolve(outputPath, 'README.md'), indexContent);

  // Generate individual schema files
  for (const schema of schemas) {
    const schemaContent = generateMarkdownSchema(schema);
    const fileName = `${schema.name.toLowerCase()}.md`;
    writeFileSync(resolve(outputPath, fileName), schemaContent);
  }
}

function generateMarkdownIndex(schemas: SchemaDoc[], title: string): string {
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push('> Auto-generated documentation for Zod schemas');
  lines.push('');

  lines.push('## Schemas');
  lines.push('');

  for (const schema of schemas) {
    const link = `${schema.name.toLowerCase()}.md`;
    lines.push(`- [${schema.name}](${link}) - ${schema.description || 'No description'}`);
  }

  lines.push('');
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('| Schema | Properties | File |');
  lines.push('|--------|------------|------|');

  for (const schema of schemas) {
    const fileName = basename(schema.filePath);
    lines.push(`| ${schema.name} | ${schema.properties.length} | ${fileName} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Generated on ${new Date().toISOString()}*`);

  return lines.join('\n');
}

function generateMarkdownSchema(schema: SchemaDoc): string {
  const lines: string[] = [];

  lines.push(`# ${schema.name}`);
  lines.push('');

  if (schema.description) {
    lines.push(schema.description);
    lines.push('');
  }

  lines.push('## Properties');
  lines.push('');

  if (schema.properties.length === 0) {
    lines.push('*No properties defined*');
  } else {
    lines.push('| Name | Type | Required | Constraints |');
    lines.push('|------|------|----------|-------------|');

    for (const prop of schema.properties) {
      const required = prop.required ? '✅' : '❌';
      const constraints = prop.constraints?.join(', ') || '-';
      lines.push(`| ${prop.name} | ${prop.type} | ${required} | ${constraints} |`);
    }
  }

  lines.push('');

  if (schema.examples && schema.examples.length > 0) {
    lines.push('## Examples');
    lines.push('');

    for (const example of schema.examples) {
      lines.push('```typescript');
      lines.push(example);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Usage');
  lines.push('');
  lines.push('```typescript');
  lines.push(`import { ${schema.name} } from '${schema.filePath.replace(/\.(ts|js)$/, '')}';`);
  lines.push('');
  lines.push('// Validate data');
  lines.push(`const result = ${schema.name}.safeParse(data);`);
  lines.push('if (result.success) {');
  lines.push('  console.log("Valid:", result.data);');
  lines.push('} else {');
  lines.push('  console.error("Invalid:", result.error);');
  lines.push('}');
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push(`*Source: [${basename(schema.filePath)}](${schema.filePath})*`);

  return lines.join('\n');
}

async function generateHtmlDocs(schemas: SchemaDoc[], outputPath: string, options: DocsOptions): Promise<void> {
  const title = options.title || 'Schema Documentation';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 40px; }
    .schema { margin-bottom: 40px; padding: 20px; border: 1px solid #e1e4e8; border-radius: 6px; }
    .property { margin: 10px 0; padding: 10px; background: #f6f8fa; border-radius: 4px; }
    .required { color: #d73a49; }
    .optional { color: #6f42c1; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${schemas.map(schema => `
    <div class="schema">
      <h2>${schema.name}</h2>
      ${schema.description ? `<p>${schema.description}</p>` : ''}
      <h3>Properties</h3>
      ${schema.properties.map(prop => `
        <div class="property">
          <strong>${prop.name}</strong>
          <span class="${prop.required ? 'required' : 'optional'}">
            (${prop.type}${prop.required ? ', required' : ', optional'})
          </span>
          ${prop.constraints && prop.constraints.length > 0 ? `<br><small>Constraints: ${prop.constraints.join(', ')}</small>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('')}
  <footer>
    <p><small>Generated on ${new Date().toISOString()}</small></p>
  </footer>
</body>
</html>`;

  writeFileSync(resolve(outputPath, 'index.html'), html);
}

async function generateJsonDocs(schemas: SchemaDoc[], outputPath: string, _options: DocsOptions): Promise<void> {
  const docsData = {
    generated: new Date().toISOString(),
    schemas: schemas.map(schema => ({
      name: schema.name,
      description: schema.description,
      filePath: schema.filePath,
      properties: schema.properties,
      examples: schema.examples
    }))
  };

  writeFileSync(resolve(outputPath, 'schemas.json'), JSON.stringify(docsData, null, 2));
}