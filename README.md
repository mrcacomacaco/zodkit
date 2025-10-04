# ZodKit ⚡

> **The Complete Zod Schema Toolkit**

A comprehensive CLI for Zod schema development - combining static analysis, code generation, testing, and AI-powered assistance in a unified terminal interface.

[![Version](https://img.shields.io/npm/v/zodkit.svg)](https://npmjs.org/package/zodkit)
[![License](https://img.shields.io/npm/l/zodkit.svg)](https://github.com/JSONbored/zodkit/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/zodkit.svg)](https://npmjs.org/package/zodkit)

## 🚀 Quick Start

```bash
# Install globally
npm install -g zodkit

# Initialize a new project
zodkit init

# Analyze your existing schemas
zodkit check

# Generate Zod from TypeScript
zodkit scaffold src/types.ts

# Create documentation
zodkit docs

# Test your schemas
zodkit test
```

## 🎯 Key Features

### ✅ Production-Ready Features

#### 📊 **Analysis & Validation**
- **analyze** - Unified 4-in-1 analysis (check/hint/fix/full modes)
  - AST-based schema analysis with ts-morph
  - Rule engine with 4 built-in rules
  - Safe auto-fix capability
  - Progressive loading for large codebases
- **check** - Fast schema validation with minimal output
- **fix** - Auto-fix schema issues (safe/unsafe modes)

#### 🏗️ **Code Generation**
- **scaffold** - Generate Zod schemas from TypeScript with smart pattern detection
  - Detects emails, URLs, UUIDs, dates, ports, phones automatically
  - Preserves JSDoc comments
  - Handles complex generics
- **generate** - Multi-source schema generation with AI-powered pattern detection
  - **JSON**: Analyzes JSON data and generates Zod schemas with automatic pattern detection
  - **API**: Inspects REST API endpoints and generates schemas from responses
  - **Database**: Schema introspection (experimental - requires database drivers)
  - Detects email, URL, UUID, date, phone patterns automatically
  - Generates both Zod schemas and TypeScript types
- **mock** - Generate realistic mock data with faker.js
  - 20+ pattern-based generators
  - Multiple output formats (JSON, CSV, SQL, TypeScript)
  - Seed support for reproducible data
- **docs** - Multi-format documentation generation
  - Markdown (with TOC and categories)
  - HTML (with search)
  - JSON Schema (Zod v4 native)
  - OpenAPI 3.1 specification

#### 🔄 **Schema Operations**
- **migrate describe-to-meta** - Automated .describe() → .meta() migration
  - Intelligent metadata inference (title, category, tags)
  - Interactive mode with enhancement prompts
  - Dry-run support
- **diff** - Compare schema versions and detect breaking changes
  - Deep schema comparison with breaking change detection
  - Multiple output formats (text, JSON, Markdown, HTML)
  - Automatic migration guide generation
  - 7 types of breaking changes detected
- **sync** - Synchronize schemas with databases and APIs

#### 🧪 **Testing & Quality**
- **test** - Comprehensive schema testing
  - Fuzzing with configurable iterations
  - Property-based testing
  - Performance benchmarks
  - Contract testing
- **lint** - Schema linting and validation
  - 6 built-in linting rules
  - Detects missing descriptions, loose objects, z.any() usage, and more
  - Multiple output formats (text, JSON)
  - Severity-based filtering (error, warning, info)
- **init** - Project initialization with presets

#### 🤖 **AI Integration**
- **explain** - AI-powered schema explanations with complexity analysis
- **mcp** - Model Context Protocol server for AI assistants

### 🚧 Planned Features (Coming Soon)

- **stats** - Schema statistics and complexity analysis
- **create** - Interactive schema builder with templates
- **refactor** - Rename, extract, inline, and simplify schemas
- **compose** - Combine schemas (union, intersect, merge, extend)

### 🧪 Experimental

- **collaborate** - Real-time collaboration features (early preview)

## 📖 Complete Usage Guide

### Getting Started

#### 1. Initialize Your Project

```bash
# Run the setup wizard
zodkit init

# This creates zodkit.config.json with:
# - Schema file patterns
# - Validation rules
# - Output preferences
```

#### 2. Analyze Existing Schemas

```bash
# Quick validation check
zodkit check

# Deep analysis with all rules
zodkit analyze --mode full

# Get detailed output
zodkit analyze --mode full --verbose
```

**What you'll see:**
- Schema locations and counts
- Rule violations (require-validation, no-any-fallback, etc.)
- Complexity metrics
- Suggestions for improvements

#### 3. Auto-Fix Issues

```bash
# Safe fixes only (reversible)
zodkit fix --safe

# All fixes including potentially breaking changes
zodkit fix --unsafe

# Interactive mode - choose what to fix
zodkit fix --interactive
```

#### 4. Generate Zod from TypeScript

```bash
# Convert a TypeScript file to Zod schemas
zodkit scaffold src/types/user.ts

# Output to specific file
zodkit scaffold src/types/user.ts --output src/schemas/user.schema.ts

# Dry run to preview
zodkit scaffold src/types/user.ts --dry-run
```

**Pattern Detection:**
The scaffold command automatically detects patterns:
- Email fields → `.email()`
- URL fields → `.url()`
- UUID fields → `.uuid()`
- Age fields → `.min(0).max(150)`
- Password fields → `.min(8).max(100)`

#### 5. Generate Documentation

```bash
# Markdown documentation (default)
zodkit docs

# With custom output directory
zodkit docs --output ./docs/schemas

# HTML documentation with search
zodkit docs --format html

# JSON Schema export
zodkit docs --format json

# OpenAPI 3.1 specification
zodkit docs --format openapi
```

**Generated files:**
- `README.md` - Main documentation with TOC
- Category-organized sections
- Property tables with constraints
- Usage examples

#### 6. Test Your Schemas

```bash
# Run all tests
zodkit test

# Specific test suite
zodkit test --suite unit
zodkit test --suite contract
zodkit test --suite validation

# With fuzzing (1000 iterations)
zodkit test --fuzz --iterations 1000

# Performance benchmarks
zodkit test --benchmark
```

#### 7. Migrate .describe() to .meta()

```bash
# Dry run to preview changes
zodkit migrate describe-to-meta --dry-run

# Interactive mode with prompts
zodkit migrate describe-to-meta --interactive

# Automatic migration
zodkit migrate describe-to-meta
```

**What it does:**
- Converts `.describe("text")` to `.meta({ title: "text" })`
- Infers categories from file paths
- Suggests tags based on schema content
- Preserves all existing metadata

#### 8. Watch Mode for Continuous Validation

```bash
# Watch for changes and re-validate
zodkit watch

# Watch with specific patterns
zodkit watch --patterns "src/schemas/**/*.ts"
```

### Advanced Features

#### Generate Schemas from JSON

```bash
# Analyze JSON file and generate Zod schema
zodkit generate --from-json user-data.json --name User

# With pattern detection enabled
zodkit generate --from-json api-response.json --name ApiResponse --strict

# Output to specific directory
zodkit generate --from-json data.json --output ./src/schemas
```

**What it does:**
- Analyzes JSON structure
- Detects patterns (email, URL, UUID, dates, etc.)
- Generates Zod schema with proper validations
- Creates TypeScript types
- Provides confidence score and suggestions

#### Generate from API Endpoints

```bash
# Inspect API endpoint and generate schema
zodkit generate --from-url https://api.example.com/users --name User

# Test multiple HTTP methods
zodkit generate --from-url https://api.example.com/data --samples 5

# With custom headers
zodkit generate --from-url https://api.example.com/protected --header "Authorization: Bearer TOKEN"
```

**What it does:**
- Fetches data from REST API endpoints
- Handles JSON, text, and binary responses
- Timeout and error handling
- Custom headers and HTTP methods support
- Generates schemas from actual API responses

#### Generate from Database (Experimental)

⚠️ **EXPERIMENTAL FEATURE** - Currently returns mock data only.

```bash
# Planned: Analyze database schema (not yet fully functional)
zodkit generate --from-database postgresql://localhost/mydb --name DatabaseSchema
```

**Current Status:**
- Returns mock data for demonstration purposes
- Does NOT connect to real databases yet
- Real implementation requires database drivers

**Future Plans:**
- Full PostgreSQL support via `pg` driver
- MySQL/MariaDB support via `mysql2` driver
- SQLite support via `better-sqlite3`
- Automatic relationship detection
- Schema caching and change tracking

**To use when available, install required drivers:**
```bash
# PostgreSQL
npm install pg @types/pg

# MySQL
npm install mysql2

# SQLite
npm install better-sqlite3
```

#### Generate Mock Data

```bash
# Generate realistic mock data
zodkit mock UserSchema --count 10

# Different output formats
zodkit mock UserSchema --count 100 --output users.json
zodkit mock ProductSchema --format csv --output products.csv
zodkit mock OrderSchema --format sql --output orders.sql

# Reproducible data with seed
zodkit mock UserSchema --count 50 --seed 12345
```

**Pattern-based generation:**
- Email fields → Realistic emails
- Names → Full names with faker
- Dates → Recent dates
- UUIDs → Valid v4 UUIDs
- Prices → Realistic product prices
- Addresses → Full addresses with city/country

#### Compare Schema Versions (Diff)

```bash
# Compare two schema versions and detect breaking changes
zodkit diff --old ./schemas/user.v1.ts --new ./schemas/user.v2.ts

# Generate detailed migration guide
zodkit diff --old ./old-schema.ts --new ./new-schema.ts --migration

# Output to different formats
zodkit diff --old v1.ts --new v2.ts --format markdown --output migration.md
zodkit diff --old v1.ts --new v2.ts --format html --output report.html
zodkit diff --old v1.ts --new v2.ts --format json --output changes.json

# Strict mode for detailed comparison
zodkit diff --old v1.ts --new v2.ts --strict
```

**What it detects:**
- ⚠️ **Breaking Changes**: Required fields added/removed, type changes, constraint tightening, enum values removed
- ✅ **Non-Breaking Changes**: Optional fields added, constraints relaxed, enum values added
- 📊 **Impact Analysis**: High/medium/low impact classification
- 💡 **Migration Guidance**: Automatic mitigation steps and recommendations

**Output formats:**
- **Text**: Colored console output with clear breaking change warnings
- **JSON**: Machine-readable format for CI/CD integration
- **Markdown**: Documentation-ready format with sections
- **HTML**: Beautiful standalone report with styling

#### Lint Schemas for Best Practices

```bash
# Lint all schema files
zodkit lint

# Lint specific files
zodkit lint "src/schemas/**/*.ts"

# Output as JSON
zodkit lint --format json

# Filter by severity
zodkit lint --severity error

# Save report to file
zodkit lint --output lint-report.txt
```

**What it checks:**
- ✅ **Missing Descriptions**: Ensures all schemas have `.describe()` calls
- ✅ **Missing Metadata**: Checks for `.meta()` with required fields
- ✅ **Type Safety**: Detects `z.any()` usage (suggests `z.unknown()` instead)
- ✅ **Loose Objects**: Finds `.passthrough()` and `.catchall()` usage
- ✅ **Validation**: Recommends refinements for complex validation scenarios
- ✅ **Discriminated Unions**: Suggests using discriminated unions for better type inference

**Output:**
- Severity levels: Error, Warning, Info
- Actionable suggestions for each issue
- File/line/column locations
- Summary statistics

#### Sync with External Sources

```bash
# Sync with database schema
zodkit sync --target database

# Sync with API definitions
zodkit sync --target api

# Sync TypeScript types
zodkit sync --target types
```

#### Schema Mapping and Visualization

```bash
# View schema relationships
zodkit map

# Focus on specific schema
zodkit map UserSchema

# Export relationship map
zodkit map --export schema-map.json

# Interactive visualization
zodkit map --visualize
```

#### AI-Powered Explanations

```bash
# Get explanation for a schema
zodkit explain UserSchema

# With complexity analysis
zodkit explain UserSchema --verbose
```

#### Model Context Protocol (MCP) Server

```bash
# Start MCP server for AI assistants
zodkit mcp serve

# Connect to existing MCP server
zodkit mcp connect
```

### Common Workflows

#### New Project Setup
```bash
zodkit init                          # Setup configuration
zodkit scaffold src/types/*.ts       # Generate initial schemas
zodkit docs                          # Create documentation
zodkit test                          # Verify everything works
```

#### Code Quality Workflow
```bash
zodkit check                         # Quick validation
zodkit analyze --mode full           # Deep analysis
zodkit fix --safe                    # Auto-fix issues
zodkit test                          # Run tests
```

#### Documentation Workflow
```bash
zodkit docs --format markdown        # For GitHub/docs sites
zodkit docs --format html            # For internal wikis
zodkit docs --format openapi         # For API documentation
```

#### CI/CD Workflow
```bash
zodkit check --format junit          # For test reporters
zodkit analyze --mode full --json    # For automated analysis
zodkit test --suite validation       # For validation checks
```

## 📚 Command Reference

### Core Commands

| Command | Description | Options |
|---------|-------------|---------|
| `zodkit init` | Initialize project with setup wizard | `--preset <name>` |
| `zodkit check` | Fast schema validation | `--verbose`, `--json` |
| `zodkit analyze` | Deep schema analysis | `--mode <check\|hint\|fix\|full>` |
| `zodkit fix` | Auto-fix schema issues | `--safe`, `--unsafe`, `--interactive` |
| `zodkit docs` | Generate documentation | `--format <markdown\|html\|json\|openapi>`, `--output <dir>` |
| `zodkit test` | Run schema tests | `--suite <unit\|contract\|validation>`, `--fuzz`, `--benchmark` |
| `zodkit watch` | Continuous validation | `--patterns <glob>` |

### Generation Commands

| Command | Description | Options |
|---------|-------------|---------|
| `zodkit scaffold <file>` | TypeScript → Zod conversion | `--output <file>`, `--dry-run` |
| `zodkit generate mock <schema>` | Generate mock data | `--count <n>`, `--format <json\|ts\|csv\|sql>`, `--output <file>` |

### Schema Operations

| Command | Description | Options |
|---------|-------------|---------|
| `zodkit migrate describe-to-meta` | Migrate .describe() to .meta() | `--dry-run`, `--interactive` |
| `zodkit sync` | Sync with external sources | `--target <database\|api\|types>` |
| `zodkit map [schema]` | View schema relationships | `--visualize`, `--export <file>` |

### AI & Advanced

| Command | Description | Options |
|---------|-------------|---------|
| `zodkit explain <schema>` | AI-powered explanations | `--verbose` |
| `zodkit mcp` | MCP server operations | `serve`, `connect` |
| `zodkit setup` | Configuration wizard | Interactive |

## 🎨 Pattern Detection

Scaffold automatically detects and adds refinements for common patterns:

| Pattern | Detection | Generated Refinement |
|---------|-----------|---------------------|
| Email | `email`, `emailAddress` | `.email()` |
| URL | `url`, `link`, `href` | `.url()` |
| UUID | `id`, `uuid`, `guid` | `.uuid()` |
| Date | `date`, `createdAt`, `updatedAt` | `.datetime()` |
| Age | `age` | `.min(0).max(150)` |
| Port | `port` | `.min(1).max(65535)` |
| Phone | `phone`, `mobile` | `.regex(/phone-pattern/)` |
| Password | `password`, `secret` | `.min(8).max(100)` |

## 🔧 Configuration

Create `zodkit.config.js` in your project root:

```javascript
module.exports = {
  // Schema discovery
  schemas: {
    patterns: ['./src/schemas/**/*.ts'],
    exclude: ['**/*.test.ts']
  },

  // Validation targets
  targets: {
    mdx: {
      patterns: ['./content/**/*.mdx'],
      frontmatterSchemas: 'auto'
    },
    components: {
      patterns: ['./src/**/*.tsx'],
      propSchemas: 'auto'
    }
  },

  // Rules
  rules: {
    'require-validation': 'error',
    'no-any-fallback': 'warn',
    'prefer-strict-schemas': 'warn'
  },

  // Output
  output: {
    format: 'pretty',
    verbose: false
  }
};
```

## 🎯 Real-World Examples

### Example 1: Convert TypeScript to Zod

**Scenario:** You have TypeScript interfaces and want runtime validation.

**Step 1:** Create your TypeScript types
```typescript
// src/types/user.ts
interface User {
  id: string;
  email: string;
  age: number;
  createdAt: Date;
  password: string;
  website?: string;
}
```

**Step 2:** Generate Zod schemas
```bash
zodkit scaffold src/types/user.ts --output src/schemas/user.schema.ts
```

**Step 3:** Review generated schema (with smart patterns)
```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().min(0).max(150),
  createdAt: z.date(),
  password: z.string().min(8).max(100),
  website: z.string().url().optional()
});

export type User = z.infer<typeof userSchema>;
```

**Step 4:** Use in your application
```typescript
import { userSchema } from './schemas/user.schema';

const result = userSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.errors });
}

const validUser = result.data; // Type-safe!
```

### Example 2: Generate API Documentation

**Scenario:** Document your schemas for your API consumers.

**Step 1:** Add metadata to your schemas
```typescript
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().min(0).max(150)
}).meta({
  title: 'User',
  category: 'auth',
  version: '1.0.0',
  description: 'User account information'
});
```

**Step 2:** Generate documentation
```bash
zodkit docs --format openapi --output ./api-docs
```

**Step 3:** Use generated OpenAPI spec
- Import into Swagger UI
- Share with API consumers
- Generate client SDKs

### Example 3: Validate MDX Frontmatter

**Scenario:** Validate blog post frontmatter in your content files.

**Step 1:** Create frontmatter schema
```typescript
// src/schemas/blog.schema.ts
export const BlogPostSchema = z.object({
  title: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean(),
  tags: z.array(z.string()),
  author: z.string().optional()
}).meta({
  title: 'Blog Post',
  category: 'content'
});
```

**Step 2:** Configure zodkit for MDX validation
```javascript
// zodkit.config.json
{
  "targets": {
    "mdx": {
      "patterns": ["./content/**/*.mdx"],
      "frontmatterSchemas": "auto"
    }
  }
}
```

**Step 3:** Run validation
```bash
zodkit check
```

**Output:**
```
✓ Found 24 blog posts
✓ All frontmatter valid

Issues found: 0
```

### Example 4: CI/CD Integration

**Scenario:** Validate schemas in your CI pipeline.

**Step 1:** Add to GitHub Actions
```yaml
# .github/workflows/validate-schemas.yml
name: Validate Schemas
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx zodkit check
      - run: npx zodkit test --suite validation
```

**Step 2:** Commit and push
```bash
git add .github/workflows/validate-schemas.yml
git commit -m "Add schema validation to CI"
git push
```

**Result:** Automated schema validation on every commit.

### Example 5: Generate Test Data

**Scenario:** Need realistic mock data for testing.

**Step 1:** Generate mock data
```bash
zodkit generate mock UserSchema --count 100 --output test-data/users.json
```

**Step 2:** Use in tests
```typescript
import users from './test-data/users.json';

describe('User API', () => {
  it('should handle bulk user creation', async () => {
    const response = await api.post('/users/bulk', users);
    expect(response.status).toBe(201);
  });
});
```

## 🚄 Performance

- **Fast** - Processes 1000+ files in under 10 seconds
- **Smart Caching** - Incremental updates in watch mode
- **Memory Efficient** - Optimized AST parsing
- **Parallel Processing** - Multi-threaded analysis

## 🔌 IDE Integration

### VS Code Task
```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Zodkit Check",
      "type": "shell",
      "command": "zodkit",
      "args": ["check"],
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    },
    {
      "label": "Zodkit Watch",
      "type": "shell",
      "command": "zodkit",
      "args": ["watch"],
      "isBackground": true,
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    }
  ]
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "validate": "zodkit check",
    "validate:watch": "zodkit watch",
    "analyze": "zodkit analyze --mode full",
    "docs:generate": "zodkit docs",
    "test:schemas": "zodkit test",
    "schemas:fix": "zodkit fix --safe"
  }
}
```

## 🔄 CI/CD Integration

### GitHub Actions
```yaml
name: Schema Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx zodkit check --format junit --output results.xml
      - uses: dorny/test-reporter@v1
        with:
          name: Schema Results
          path: results.xml
          reporter: java-junit
```

## 🏗️ How It Works

Zodkit uses TypeScript's AST (via ts-morph) to analyze your Zod schemas, extracting metadata from both TSDoc comments and `.meta()` calls. This powers intelligent analysis, automatic documentation generation, and safe code transformations.

### Architecture Flow

```
Your Code (*.ts) → AST Parser → Schema Analysis → Rule Engine → Auto-fix/Docs/Migrations
```

### Built With

- **ts-morph** - TypeScript AST analysis for accurate schema extraction
- **Zod** - Schema validation core
- **React + Ink** - Beautiful terminal UIs
- **Commander** - CLI framework
- **Fast-glob** - Fast file system operations
- **Chokidar** - Efficient file watching

## 🎯 Why Zodkit?

### Before Zodkit
- Multiple disconnected tools for schema work
- Manual schema writing from TypeScript
- No pattern detection or smart refinements
- Separate tools for testing, mocking, analysis
- Command-line only, no interactive features

### With Zodkit
- **Smart code generation** with automatic pattern detection
- **AST-powered analysis** for accurate schema validation
- **Interactive workflows** with rich terminal UIs
- **Multi-format documentation** generation
- **AI integration** for explanations and assistance

## 🗺️ Development Roadmap

### ✅ Completed
- [x] AST-based schema analysis with ts-morph
- [x] Multi-format documentation (Markdown, HTML, JSON Schema, OpenAPI)
- [x] Automated describe-to-meta migration
- [x] Rule engine with auto-fix capability
- [x] TypeScript → Zod scaffolding with pattern detection

### 🚧 In Progress
- [ ] Unified TUI Dashboard (v0.2.0)
- [ ] Enhanced mock data generation with pattern support
- [ ] Comprehensive test suite for core systems

### 📋 Planned
- [ ] Generic schema migrations (breaking change detection, rollback)
- [ ] Refactor command (rename, extract, inline, simplify)
- [ ] Compose command (union, intersect, merge, extend)
- [ ] Migration guide and advanced documentation

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Clone the repo
git clone https://github.com/JSONbored/zodkit.git

# Install dependencies
npm install

# Run in development
npm run dev

# Run tests
npm test
```

## 📝 License

MIT © [JSONbored](https://github.com/JSONbored)

## 🙏 Acknowledgments

- Inspired by [Claude Code](https://claude.ai) for the unified TUI approach
- Built on [Zod](https://github.com/colinhacks/zod) by Colin McDonnell
- Terminal UI powered by [Ink](https://github.com/vadimdemedes/ink)

## 🔗 Links

- [Documentation](https://zodkit.dev)
- [GitHub](https://github.com/JSONbored/zodkit)
- [npm Package](https://www.npmjs.com/package/zodkit)
- [Issue Tracker](https://github.com/JSONbored/zodkit/issues)
- [Changelog](CHANGELOG.md)

---

<p align="center">
  Made with ⚡ by developers, for developers
</p>