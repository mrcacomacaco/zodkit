# Zodded

> ⚠️ **BETA SOFTWARE** - This project is currently in beta. While core functionality is stable, expect some rough edges and potential breaking changes. Report issues on [GitHub](https://github.com/JSONbored/zodded/issues).

A modern CLI tool for static analysis and validation of Zod schemas - think "ESLint for Zod schemas".

## Features

✅ **MDX Frontmatter Validation** - Validate YAML frontmatter against Zod schemas
✅ **React Component Props** - Ensure component usage matches Zod prop schemas
✅ **API Route Validation** - Validate API request/response structures
✅ **Configuration Validation** - Validate config files and environment variables
✅ **Fast Performance** - Handle large codebases (1000+ files) efficiently
✅ **Watch Mode** - Real-time validation during development
✅ **Multiple Output Formats** - Pretty, JSON, JUnit for CI/CD integration

## Installation

### npm (Cross-platform)
```bash
# Install beta globally
npm install -g zodded@beta

# Or use with npx
npx zodded@beta
```

### Homebrew (macOS)
```bash
# Add the tap
brew tap JSONbored/zodded

# Install zodded
brew install zodded
```

### Quick Start

```bash
# Basic validation
zodded

# With custom config
zodded --config zod.config.js

# Watch mode for development
zodded --watch

# Different output formats
zodded --format json
zodded --format junit
```

## Configuration

Create a `zod.config.js` file in your project root:

```javascript
module.exports = {
  // Schema detection
  schemas: {
    patterns: ['./lib/schemas/**/*.ts', './src/types/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.spec.ts']
  },

  // Validation targets
  targets: {
    mdx: {
      patterns: ['./content/**/*.mdx'],
      frontmatterSchemas: 'auto' // or specific mapping
    },
    components: {
      patterns: ['./components/**/*.tsx', './src/**/*.tsx'],
      propSchemas: 'auto'
    },
    api: {
      patterns: ['./pages/api/**/*.ts', './src/api/**/*.ts'],
      requestSchemas: 'auto',
      responseSchemas: 'auto'
    }
  },

  // Rules configuration
  rules: {
    'require-validation': 'error',
    'no-any-fallback': 'warn',
    'prefer-strict-schemas': 'warn'
  },

  // Output options
  output: {
    format: 'pretty', // 'pretty' | 'json' | 'junit'
    verbose: false,
    showSuccessful: false
  }
};
```

## CLI Options

```bash
zodded validate [options]

Options:
  -c, --config <path>          path to configuration file (default: "zod.config.js")
  -i, --include <patterns...>  file patterns to include
  -e, --exclude <patterns...>  file patterns to exclude
  -f, --format <format>        output format (pretty, json, junit) (default: "pretty")
  -o, --output <path>          output file path
  -w, --watch                  watch files for changes
  --verbose                    verbose output
  --silent                     suppress all output except errors
  -h, --help                   display help for command
```

## Example Output

```bash
❌ Validation Errors:

src/content/blog/post.mdx:2:1 - error ZV2002: Invalid date format
    Expected: Valid ISO date string
    Received: "invalid-date"

    1 | ---
  > 2 | datePublished: "invalid-date"
      | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    3 | title: "My Blog Post"
    4 | ---

    💡 Suggestion: Use ISO date format like "2025-09-26"

Summary:
  Files checked: 15
  Schemas validated: 8
  Errors: 2
  Status: ❌ Issues found
```

## Use Cases

### 1. MDX/Markdown Frontmatter Validation
Validate blog posts, documentation, and content files:

```typescript
// schemas/blog.ts
export const BlogPostSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean(),
  tags: z.array(z.string())
});
```

### 2. React Component Props Validation
Ensure component usage matches schemas:

```typescript
// components/UserCard.tsx
const UserCardPropsSchema = z.object({
  user: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string().url().optional()
  })
});
```

### 3. API Route Validation
Validate API request/response structures:

```typescript
// api/users.ts
const CreateUserRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime()
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Zod Schema Validation
on: [push, pull_request]

jobs:
  validate-schemas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx zodded --format junit --output validation-results.xml
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Schema Validation Results
          path: validation-results.xml
          reporter: java-junit
```

### npm script

```json
{
  "scripts": {
    "validate:schemas": "zodded",
    "validate:watch": "zodded --watch",
    "validate:ci": "zodded --format junit --output validation-results.xml"
  }
}
```

## Performance

- **Fast**: Validates 1000+ files in under 10 seconds
- **Accurate**: 95%+ accuracy in detecting validation issues
- **Memory efficient**: Uses TypeScript's AST parsing with optimizations
- **Incremental**: Watch mode only re-validates changed files

## Error Codes

- **ZV1001**: Missing frontmatter
- **ZV1002**: No schema found for validation
- **ZV1003**: Failed to parse file
- **ZV2001**: Required property missing
- **ZV2002**: Invalid date format
- **ZV2003**: Type mismatch

## Troubleshooting

### Common Issues and Solutions

#### 🚨 No schemas found / Schema discovery issues

**Problem**: zodded reports "No schemas found" or fails to discover your Zod schemas.

**Solutions**:
1. **Check your schema patterns** in `zod.config.js`:
   ```javascript
   schemas: {
     patterns: ['./src/schemas/**/*.ts', './lib/types/**/*.ts'],
     exclude: ['**/*.test.ts'] // Make sure you're not excluding schema files
   }
   ```

2. **Verify schema exports** - schemas must be exported:
   ```typescript
   // ✅ Good
   export const UserSchema = z.object({ name: z.string() });

   // ❌ Bad - not exported
   const UserSchema = z.object({ name: z.string() });
   ```

3. **Check TypeScript compilation**:
   ```bash
   npx tsc --noEmit  # Ensure your TypeScript compiles
   ```

4. **Use the doctor command** for diagnosis:
   ```bash
   zodded doctor --verbose
   ```

#### 🐛 Performance Issues / Slow validation

**Problem**: zodded is slow or times out on large codebases.

**Solutions**:
1. **Optimize file patterns** - be more specific:
   ```javascript
   // ✅ Good - specific patterns
   patterns: ['./src/schemas/**/*.ts']

   // ❌ Avoid - too broad
   patterns: ['./src/**/*.ts']
   ```

2. **Exclude unnecessary files**:
   ```javascript
   exclude: [
     '**/*.test.ts',
     '**/*.spec.ts',
     '**/node_modules/**',
     '**/dist/**',
     '**/*.d.ts'
   ]
   ```

3. **Use performance benchmarks**:
   ```bash
   zodded benchmark --test schema-discovery --save
   ```

4. **Enable performance monitoring**:
   ```bash
   zodded --performance  # Shows timing breakdown
   ```

#### 📁 File watching issues (--watch mode)

**Problem**: Watch mode doesn't detect file changes or causes high CPU usage.

**Solutions**:
1. **Check file system limits** (macOS/Linux):
   ```bash
   # Increase file watcher limits
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. **Exclude build directories**:
   ```javascript
   exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**']
   ```

3. **Use polling on network drives**:
   ```bash
   CHOKIDAR_USEPOLLING=true zodded --watch
   ```

#### 🔧 Configuration Issues

**Problem**: Configuration file not found or invalid settings.

**Solutions**:
1. **Verify config file location** - zodded looks for:
   - `zod.config.js`
   - `zod.config.ts`
   - `zodded.config.js`
   - `zodded.config.ts`
   - `.zoddedrc.js`
   - `.zoddedrc.ts`

2. **Check config syntax**:
   ```bash
   node -c zod.config.js  # Validate JavaScript syntax
   ```

3. **Use init command** to create a template:
   ```bash
   zodded init  # Creates a basic config file
   ```

4. **Test config loading**:
   ```bash
   zodded doctor --verbose  # Shows config loading details
   ```

#### 🔍 Module Resolution / Import Issues

**Problem**: zodded can't resolve imports or find modules.

**Solutions**:
1. **Check tsconfig.json** paths and baseUrl:
   ```json
   {
     "compilerOptions": {
       "baseUrl": "./src",
       "paths": {
         "@/*": ["*"]
       }
     }
   }
   ```

2. **Verify dependencies are installed**:
   ```bash
   npm ls zod  # Check if Zod is installed
   ```

3. **Use absolute imports** in schemas:
   ```typescript
   // ✅ Good
   import { z } from 'zod';

   // ❌ Problematic relative imports across boundaries
   import { z } from '../../../node_modules/zod';
   ```

#### 💾 Memory Issues / Out of Memory

**Problem**: zodded crashes with "out of memory" errors on large projects.

**Solutions**:
1. **Increase Node.js memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" zodded
   ```

2. **Process files in batches**:
   ```bash
   zodded --include "src/components/**" --format json > comp-results.json
   zodded --include "src/pages/**" --format json > pages-results.json
   ```

3. **Monitor memory usage**:
   ```bash
   zodded benchmark --test schema-discovery --gc
   ```

#### 🏭 CI/CD Integration Issues

**Problem**: zodded works locally but fails in CI/CD pipelines.

**Solutions**:
1. **Ensure consistent Node.js versions**:
   ```yaml
   # GitHub Actions
   - uses: actions/setup-node@v3
     with:
       node-version: '18'  # Match your local version
   ```

2. **Install dependencies properly**:
   ```yaml
   - run: npm ci  # Use npm ci instead of npm install in CI
   ```

3. **Set proper working directory**:
   ```yaml
   - run: npx zodded --config ./config/zod.config.js
     working-directory: ./project-root
   ```

4. **Handle file permissions**:
   ```bash
   chmod +x node_modules/.bin/zodded
   ```

#### 🔄 Schema Update / Hot Reload Issues

**Problem**: Changes to schemas aren't reflected immediately.

**Solutions**:
1. **Clear TypeScript cache**:
   ```bash
   rm -rf node_modules/.cache/
   npx tsc --build --clean
   ```

2. **Use watch mode** for development:
   ```bash
   zodded --watch --verbose
   ```

3. **Check file modification times**:
   ```bash
   zodded analyze --verbose  # Shows file timestamps
   ```

### Getting Help

If you're still experiencing issues:

1. **Run diagnostics**:
   ```bash
   zodded doctor --verbose > zodded-diagnostics.txt
   ```

2. **Enable debug logging**:
   ```bash
   DEBUG=zodded:* zodded --verbose
   ```

3. **Check system requirements**:
   - Node.js 16.0.0 or higher
   - TypeScript 4.0 or higher (if using .ts configs)
   - At least 2GB available RAM for large projects

4. **Create a minimal reproduction**:
   ```bash
   mkdir zodded-test && cd zodded-test
   npm init -y
   npm install zod zodded
   zodded init
   # Add minimal schema and test case
   ```

5. **Report issues** at: https://github.com/JSONbored/zodded/issues

Include:
- zodded version (`zodded --version`)
- Node.js version (`node --version`)
- Operating system
- Project structure (file tree)
- Configuration file
- Diagnostic output
- Steps to reproduce

## FAQ

### General Questions

#### Q: What is zodded and how is it different from regular Zod validation?

**A:** zodded is a static analysis tool that validates your files against Zod schemas without running your code. While regular Zod validation happens at runtime, zodded analyzes your source code, MDX frontmatter, and component props at build/development time to catch validation issues early.

Think of it as "ESLint for Zod schemas" - it helps you catch validation errors before they reach production.

#### Q: Do I need to change my existing Zod schemas to use zodded?

**A:** No! zodded works with your existing Zod schemas as-is. Just make sure they're exported from your TypeScript files:

```typescript
// ✅ zodded can discover this
export const UserSchema = z.object({ name: z.string() });

// ❌ zodded cannot discover this (not exported)
const UserSchema = z.object({ name: z.string() });
```

#### Q: What file types does zodded support?

**A:** zodded supports:
- **MDX/Markdown files** - validates YAML frontmatter
- **TypeScript/JavaScript** - analyzes component props and API schemas
- **JSON files** - validates configuration files
- **YAML files** - validates data files and configurations

#### Q: Is zodded suitable for large codebases?

**A:** Yes! zodded is designed for scale:
- Processes 1000+ files efficiently
- Uses incremental validation in watch mode
- Memory-optimized TypeScript AST parsing
- Supports performance benchmarking and monitoring

### Setup and Configuration

#### Q: How do I get started with zodded?

**A:** Quick start in 3 steps:

1. **Install zodded**:
   ```bash
   npm install -g zodded
   # or use npx zodded
   ```

2. **Create configuration**:
   ```bash
   zodded init  # Creates zod.config.js
   ```

3. **Run validation**:
   ```bash
   zodded  # Validates your project
   ```

#### Q: Where should I put my Zod schemas?

**A:** Common patterns:
- `./src/schemas/` - Dedicated schema directory
- `./lib/types/` - Type definitions
- `./src/types/` - Co-located with components
- `./api/schemas/` - API-specific schemas

Configure patterns in `zod.config.js`:
```javascript
schemas: {
  patterns: ['./src/schemas/**/*.ts', './lib/types/**/*.ts']
}
```

#### Q: Can I use zodded without a configuration file?

**A:** Yes! zodded works with sensible defaults:
- Looks for schemas in common locations
- Validates MDX frontmatter automatically
- Uses pretty output format
- Includes basic file patterns

However, a config file gives you more control and better performance.

#### Q: How do I integrate zodded with my existing build process?

**A:** Add npm scripts to `package.json`:

```json
{
  "scripts": {
    "validate": "zodded",
    "validate:watch": "zodded --watch",
    "validate:ci": "zodded --format junit",
    "build": "zodded && next build"
  }
}
```

### Usage and Features

#### Q: What's the difference between errors and warnings?

**A:**
- **Errors** (🔴) - Schema validation failures that should be fixed
- **Warnings** (🟡) - Best practice suggestions or potential issues

Configure severity in `zod.config.js`:
```javascript
rules: {
  'require-validation': 'error',    // Must validate
  'no-any-fallback': 'warn',       // Suggestion
  'prefer-strict-schemas': 'warn'   // Best practice
}
```

#### Q: How do I validate API routes and responses?

**A:** Define request/response schemas and configure validation:

```typescript
// api/users.ts
export const CreateUserRequest = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

export const UserResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email()
});
```

```javascript
// zod.config.js
targets: {
  api: {
    patterns: ['./pages/api/**/*.ts'],
    requestSchemas: 'auto',
    responseSchemas: 'auto'
  }
}
```

#### Q: How does MDX frontmatter validation work?

**A:** zodded extracts YAML frontmatter and validates it against your schemas:

```typescript
// schemas/blog.ts
export const BlogPostSchema = z.object({
  title: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean().default(false)
});
```

```markdown
---
title: "My Blog Post"
date: "2025-09-27"
published: true
---

# Content here...
```

#### Q: Can I validate React component props?

**A:** Yes! Define prop schemas and zodded will validate component usage:

```typescript
// components/UserCard.tsx
export const UserCardProps = z.object({
  user: z.object({
    name: z.string(),
    email: z.string().email(),
    avatar: z.string().url().optional()
  }),
  showEmail: z.boolean().default(true)
});

export function UserCard(props: z.infer<typeof UserCardProps>) {
  // Component implementation
}
```

#### Q: How do I exclude files from validation?

**A:** Use the `exclude` patterns in your config:

```javascript
schemas: {
  exclude: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**'
  ]
}
```

### Development Workflow

#### Q: Should I run zodded in my pre-commit hooks?

**A:** Yes! Add to `.husky/pre-commit` or similar:

```bash
#!/bin/sh
npm run validate  # Runs zodded
npm run lint
npm run test
```

This catches validation issues before they're committed.

#### Q: How do I use zodded in watch mode during development?

**A:** Run with the `--watch` flag:

```bash
zodded --watch --verbose  # Shows detailed changes
```

This automatically re-validates when files change, perfect for development.

#### Q: Can I get JSON output for tool integration?

**A:** Yes! Use different output formats:

```bash
zodded --format json          # JSON output
zodded --format junit         # JUnit XML for CI
zodded --format sarif         # SARIF for security tools
zodded --format pretty        # Human-readable (default)
```

### Performance and Optimization

#### Q: zodded is slow on my large project. How can I optimize it?

**A:** Several optimization strategies:

1. **Be specific with patterns**:
   ```javascript
   // ✅ Fast - specific
   patterns: ['./src/schemas/**/*.ts']

   // ❌ Slow - too broad
   patterns: ['./src/**/*.ts']
   ```

2. **Exclude unnecessary files**:
   ```javascript
   exclude: ['**/*.test.ts', '**/node_modules/**']
   ```

3. **Use performance monitoring**:
   ```bash
   zodded benchmark --save  # Identify bottlenecks
   ```

4. **Process in batches for very large projects**:
   ```bash
   zodded --include "src/components/**"
   zodded --include "src/pages/**"
   ```

#### Q: How much memory does zodded use?

**A:** Memory usage depends on project size:
- Small projects (< 100 files): ~50-100MB
- Medium projects (100-500 files): ~100-300MB
- Large projects (500+ files): ~300MB-1GB

For large projects, consider:
- Increasing Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096"`
- Using more specific file patterns
- Processing files in batches

#### Q: Can I benchmark zodded's performance?

**A:** Yes! zodded includes built-in benchmarking:

```bash
zodded benchmark                           # Run all benchmarks
zodded benchmark --test schema-discovery   # Test specific operation
zodded benchmark --iterations 20 --save   # Custom iterations + save
```

### CI/CD Integration

#### Q: How do I integrate zodded with GitHub Actions?

**A:** Create `.github/workflows/validate.yml`:

```yaml
name: Schema Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx zodded --format junit --output validation-results.xml
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Schema Validation Results
          path: validation-results.xml
          reporter: java-junit
```

#### Q: How do I make validation failures fail my CI build?

**A:** zodded exits with non-zero code on errors by default. For warnings only:

```bash
zodded --ci  # Strict mode - warnings also fail build
```

#### Q: Can I run zodded in parallel with other checks?

**A:** Yes! Run zodded alongside other tools:

```yaml
- name: Run checks in parallel
  run: |
    npx zodded --format json > validation.json &
    npm run lint > lint.json &
    npm run typecheck > typecheck.json &
    wait  # Wait for all background jobs
```

### Advanced Usage

#### Q: Can I create custom validation rules?

**A:** Currently, zodded supports built-in rules. Custom rules are planned for future releases. You can:

1. **Use rule configuration** to adjust severity:
   ```javascript
   rules: {
     'require-validation': 'error',
     'no-any-fallback': 'off'  // Disable rule
   }
   ```

2. **Create wrapper schemas** for custom validation:
   ```typescript
   const StrictEmailSchema = z.string().email().refine(
     email => email.includes('@company.com'),
     'Must use company email'
   );
   ```

#### Q: How do I validate environment variables and config files?

**A:** Create schemas for your config structure:

```typescript
// schemas/config.ts
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(20)
});

export const AppConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    port: z.number().int().positive()
  })
});
```

#### Q: Can I integrate zodded with my IDE?

**A:** While there's no official IDE extension yet, you can:

1. **Use file watchers** in your IDE to run zodded on save
2. **Run as a task** in VS Code:
   ```json
   // .vscode/tasks.json
   {
     "version": "2.0.0",
     "tasks": [
       {
         "label": "Validate Schemas",
         "type": "shell",
         "command": "zodded",
         "group": "build",
         "presentation": {
           "echo": true,
           "reveal": "always"
         }
       }
     ]
   }
   ```

3. **Use output parsing** to show errors in the problems panel

#### Q: What's the roadmap for zodded?

**A:** Planned features include:
- IDE extensions (VS Code, WebStorm)
- Custom validation rules API
- Plugin system for framework-specific validations
- Performance optimizations
- Enhanced error messages and suggestions
- Support for more file formats

Check our [GitHub issues](https://github.com/JSONbored/zodded/issues) for the latest roadmap and feature requests.

## Contributing

zodded is built with modern TypeScript and uses:
- **ts-morph** for TypeScript AST parsing
- **gray-matter** for frontmatter extraction
- **fast-glob** for efficient file matching
- **chokidar** for file watching
- **commander** for CLI interface

## License

MIT