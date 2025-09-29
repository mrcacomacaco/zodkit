# ZodKit ⚡

> **Streamlined Zod Schema Toolkit**

A comprehensive yet streamlined CLI for Zod schema development - combining static analysis, code generation, testing, and AI-powered assistance. Optimized architecture with 19 focused commands for maximum productivity.

[![Version](https://img.shields.io/npm/v/zodkit.svg)](https://npmjs.org/package/zodkit)
[![License](https://img.shields.io/npm/l/zodkit.svg)](https://github.com/JSONbored/zodkit/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/zodkit.svg)](https://npmjs.org/package/zodkit)

## 🚀 Quick Start

```bash
# Install globally
npm install -g zodkit

# Launch the unified TUI (recommended)
zodkit dashboard

# Or use individual commands
zodkit check        # Analyze schemas
zodkit hint         # Get best practices
zodkit scaffold types.ts  # Generate Zod from TypeScript
zodkit docs         # Generate schema documentation
zodkit test         # Test schemas with fuzzing
```

## 🎯 Key Features

### **Streamlined Architecture** - 19 Focused Commands
ZodKit has been optimized to provide maximum functionality with minimal complexity:

- **Core Commands** - Essential schema operations (check, hint, fix, test, generate)
- **Advanced Tools** - Schema migration, refactoring, composition, and collaboration
- **Smart Aliases** - Convenient shortcuts for common workflows
- **Unified Performance** - Consolidated performance profiling and optimization

### **Core Capabilities**

#### 📊 **Analysis & Validation**
- **Check** - Complete schema analysis combining validation, diagnostics, and coverage
- **Hint** - Performance tips and best practice suggestions with auto-fix
- **Profile** - Runtime performance monitoring and benchmarking

#### 🏗️ **Code Generation**
- **Scaffold** - Generate Zod schemas from TypeScript with smart pattern detection
  - Detects emails, URLs, UUIDs, dates automatically
  - Preserves JSDoc comments
  - Handles complex generics
- **Generate** - Create mock data, API schemas from JSON/OpenAPI
- **Docs** - Generate comprehensive documentation from schemas

#### 🔄 **Schema Operations**
- **Migrate** - Schema evolution wizard with breaking change detection
- **Compose** - Combine schemas (union, intersect, merge, extend)
- **Refactor** - Rename, extract, inline, and simplify schemas

#### 🧪 **Testing & Quality**
- **Test** - Advanced schema testing with fuzzing, property testing, and performance benchmarks
- **Check** - Fast schema analysis with `--fast` mode for quick feedback
- **Fix** - Auto-fix schema issues with safe/unsafe modes
- **Sync** - Synchronize schemas with databases and APIs

#### 🤖 **AI Integration**
- **Explain** - AI-powered schema explanations
- **MCP** - Model Context Protocol server for AI assistants
- **Collaborate** - Real-time collaboration features

## 💡 The Zodkit TUI Experience

### Launch the TUI
```bash
zodkit ui
# or
zodkit dashboard
# or
zodkit tui
```

### Inside the TUI

```
⚡ ZODKIT - Development Environment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready | 0 commands

❯ check              # Runs analysis
❯ hint               # Opens hint mode with auto-fix
❯ scaffold types.ts  # Interactive scaffolding
❯ docs               # Generate documentation
❯ test               # Run all tests
❯ ?                  # Show help
```

### Smart Routing

Commands intelligently route to the appropriate mode:

- **Simple commands** → Execute and show output
- **Interactive tools** → Switch to full-featured interface
- **ESC key** → Always returns to command mode

## ⚡ Optimization Achievements

ZodKit has been comprehensively optimized for performance and maintainability:

### 📊 Streamlining Results
- **File Count**: Reduced from 259 to ~180 TypeScript files (-30%)
- **Command Files**: Consolidated from 34 to 19 command files (-44%)
- **Orphaned Commands**: Removed 16 unregistered command files
- **Performance Modules**: Unified 4 separate systems into 1 comprehensive module
- **Config Schema**: Simplified from 83 to 13 essential rules (-85%)

### 🏗️ Architecture Improvements
- **Unified Performance System**: Single `performance-profiler.ts` replacing fragmented modules
- **Simplified Configuration**: Streamlined config with presets for common scenarios
- **Consolidated Commands**: Enhanced existing commands instead of creating duplicates
- **Removed Redundancy**: Eliminated duplicate functionality and unused imports
- **Enhanced CLI Help**: Accurate help text reflecting streamlined structure

### 🎯 Maintained Functionality
All core features preserved while achieving significant simplification:
- Complete schema analysis and validation
- AI-powered best practice suggestions
- Performance profiling and optimization
- Schema generation and scaffolding
- Migration and refactoring tools
- Team collaboration features
- Comprehensive testing suite

## 📚 Command Reference

### Analysis Commands
```bash
check [mode]      # validate | analyze | diagnose | coverage (use --fast for quick feedback)
hint              # Interactive best practices with auto-fix
profile [mode]    # runtime | memory | benchmark
```

### Generation & Documentation
```bash
scaffold <file>   # TypeScript → Zod with patterns
generate [type]   # mock | api schemas from JSON/OpenAPI
docs              # Generate comprehensive documentation (markdown/html/json)
```

### Schema Operations
```bash
migrate [action]  # create | apply | rollback | diff
compose [op]      # union | intersect | merge | extend
refactor [op]     # rename | extract | inline | simplify
```

### Testing & Quality
```bash
test [suite]      # unit | contract | validation | all
fix [mode]        # safe | unsafe | interactive
sync [target]     # database | api | types
```

### AI Features
```bash
explain <schema>  # Get AI explanation
mcp [mode]        # serve | connect | collaborate
```

### System Commands
```bash
init              # Initialize project
clear             # Clear screen
help              # Show help
exit              # Exit zodkit
```

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

### TypeScript to Zod Generation

Input TypeScript:
```typescript
interface User {
  id: string;
  email: string;
  age: number;
  createdAt: Date;
  password: string;
  website?: string;
}
```

Generated Zod (with smart patterns):
```typescript
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

### MDX Frontmatter Validation

```yaml
# content/blog/post.mdx
---
title: "My Post"
date: "2025-01-15"
published: true
tags: ["zod", "typescript"]
---
```

Validates against:
```typescript
export const BlogPostSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  published: z.boolean(),
  tags: z.array(z.string())
});
```

### Mock Data Generation

```bash
❯ generate mock User --count 3
```

Output:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user1@example.com",
    "age": 28,
    "createdAt": "2025-01-15T10:30:00Z",
    "password": "SecurePass123!",
    "website": "https://example.com"
  },
  // ... more entries
]
```

### Documentation Generation

Generate comprehensive documentation from your schemas:

```bash
❯ zodkit docs --format markdown --output ./docs
```

**Generated Markdown:**
```markdown
# UserSchema

User validation schema with email and age validation.

## Properties

| Name | Type | Required | Constraints |
|------|------|----------|-------------|
| id | string | ✅ | UUID format |
| email | string | ✅ | Email format |
| age | number | ✅ | minimum: 0, maximum: 150 |
| createdAt | date | ✅ | - |
| website | string | ❌ | URL format |

## Usage

```typescript
import { UserSchema } from './schemas/user';

const result = UserSchema.safeParse(data);
if (result.success) {
  console.log("Valid:", result.data);
} else {
  console.error("Invalid:", result.error);
}
```

**Formats Available:**
- `--format markdown` (default) - Clean docs for GitHub/GitBook
- `--format html` - Styled HTML documentation
- `--format json` - Machine-readable schema metadata

## 🚄 Performance

- **Fast**: Processes 1000+ files in under 10 seconds
- **Smart Caching**: Incremental updates in watch mode
- **Memory Efficient**: Optimized AST parsing
- **Parallel Processing**: Multi-threaded analysis

## 🔌 IDE Integration

### VS Code Task
```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Zodkit UI",
      "type": "shell",
      "command": "zodkit",
      "args": ["ui"],
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
    "dev": "zodkit ui",
    "validate": "zodkit check",
    "generate": "zodkit scaffold",
    "test:schemas": "zodkit test"
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

## 🏗️ Architecture

Zodkit is built with:
- **React + Ink** - Beautiful terminal UIs
- **ts-morph** - TypeScript AST analysis
- **Commander** - CLI framework
- **Zod** - Schema validation core
- **Fast-glob** - File system operations
- **Chokidar** - File watching

## 🎯 Why Zodkit?

### Before Zodkit
- Multiple disconnected tools for schema work
- Manual schema writing from TypeScript
- No pattern detection or smart refinements
- Separate tools for testing, mocking, analysis
- Command-line only, no interactive features

### With Zodkit
- **One unified TUI** for everything
- **Smart code generation** with pattern detection
- **Interactive tools** with rich feedback
- **AI integration** for assistance
- **Claude Code-like experience** for Zod development

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