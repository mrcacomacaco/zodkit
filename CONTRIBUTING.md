# Contributing to ZodKit

Thank you for your interest in contributing to ZodKit! This document provides comprehensive guidelines for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Areas for Contribution](#areas-for-contribution)

## Getting Started

### Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **npm**: v9+ (comes with Node.js)
- **Git**: v2.0+
- **TypeScript**: Knowledge of TypeScript basics
- **Zod**: Familiarity with Zod schema validation

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zodkit.git
   cd zodkit
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/JSONbored/zodkit.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Build the project**:
   ```bash
   npm run build
   ```

6. **Run tests**:
   ```bash
   npm test
   ```

7. **Start development mode** (watch for changes):
   ```bash
   npm run dev
   ```

### Development Commands

```bash
# Build TypeScript
npm run build:tsc

# Build webpack bundle
npm run build:webpack

# Watch mode (auto-rebuild on changes)
npm run dev

# Run CLI locally
npm start [command]
# or
node dist/cli/index.js [command]

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/stats.test.ts

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Generate documentation
npm run docs
```

## Project Structure

```
zodkit/
├── src/
│   ├── cli/                     # CLI interface
│   │   ├── commands/            # Command implementations
│   │   │   ├── lint.ts          # Schema linting (6 rules)
│   │   │   ├── stats.ts         # Statistics & bundle impact
│   │   │   ├── create.ts        # Interactive schema builder
│   │   │   ├── check.ts         # Fast validation
│   │   │   ├── analyze.ts       # Deep analysis
│   │   │   └── ...
│   │   ├── command-builder.ts   # Command definitions
│   │   ├── global-options.ts    # Shared options
│   │   └── index.ts             # CLI entry point
│   ├── core/                    # Core functionality
│   │   ├── ast/                 # AST parsing (ts-morph)
│   │   │   ├── parser.ts        # TypeScript parser
│   │   │   ├── extractor.ts     # Zod schema extractor
│   │   │   ├── visitor.ts       # AST visitor
│   │   │   └── walker.ts        # AST walker
│   │   ├── rules/               # Linting rules
│   │   │   ├── engine.ts        # Rule execution engine
│   │   │   ├── fixer.ts         # Auto-fix system
│   │   │   └── builtin/         # Built-in rules
│   │   │       ├── no-any-type.ts
│   │   │       ├── no-loose-objects.ts
│   │   │       ├── require-description.ts
│   │   │       └── ...
│   │   ├── schema-stats.ts      # Statistics aggregator
│   │   ├── analysis.ts          # Schema analysis
│   │   ├── hot-reload.ts        # File watching
│   │   └── ...
│   ├── types/                   # TypeScript type definitions
│   └── utils/                   # Utility functions
├── tests/
│   ├── unit/                    # Unit tests
│   │   ├── stats.test.ts        # Stats tests (21 tests)
│   │   ├── lint.test.ts         # Lint tests (89 tests)
│   │   ├── create.test.ts       # Create tests (166 tests)
│   │   └── ...
│   ├── integration/             # Integration tests
│   └── performance/             # Performance benchmarks
├── scripts/                     # Build scripts
├── docs/                        # Documentation
└── dist/                        # Compiled output
```

### Key Modules

#### AST System (`src/core/ast/`)
- **parser.ts**: Wraps ts-morph for TypeScript AST parsing
- **extractor.ts**: Extracts Zod schema information from AST
- **visitor.ts**: Visits AST nodes to find schema definitions
- **walker.ts**: Walks AST tree for analysis

#### Linting System (`src/core/rules/`)
- **engine.ts**: Executes rules on schemas
- **fixer.ts**: Applies auto-fixes to code
- **builtin/**: 6 built-in linting rules

#### Statistics System (`src/core/schema-stats.ts`)
- Type distribution analysis
- Complexity metrics calculation
- Hotspot detection
- Bundle impact estimation

#### CLI Commands (`src/cli/commands/`)
- **lint.ts**: Schema linting with auto-fix
- **stats.ts**: Statistics and bundle analysis
- **create.ts**: Interactive schema builder with 7 templates

## Development Workflow

### Code Style

- We use ESLint and Prettier for code formatting
- Run `npm run lint` to check for linting errors
- Run `npm run lint:fix` to auto-fix linting issues
- Run `npm run format` to format code with Prettier

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/stats.test.ts

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance
```

### Writing Tests

We use **Jest** for testing. Place tests in the `tests/` directory matching the source structure:

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createStatsAggregator } from '../../src/core/schema-stats';

describe('Stats Aggregator', () => {
  const testDir = join(__dirname, '.temp-test');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should calculate bundle impact', async () => {
    const aggregator = createStatsAggregator();
    await aggregator.addFile('path/to/schema.ts');

    const stats = aggregator.generateStats({ includeBundleImpact: true });

    expect(stats.bundleImpact).toBeDefined();
    expect(stats.bundleImpact!.estimatedSize).toBeGreaterThan(0);
  });
});
```

### Test Coverage Requirements

Coverage thresholds are enforced by Jest (see `jest.config.js`):

- **Global**: 35% branches, 35% functions, 45% lines, 45% statements
- **Core modules** (well-tested):
  - `src/core/schema-stats.ts`: 65-80%
  - `src/cli/commands/lint.ts`: 55-70%

### Test Organization

- **Unit tests** (`tests/unit/`): Test individual functions and modules
- **Integration tests** (`tests/integration/`): Test command workflows
- **Performance tests** (`tests/performance/`): Benchmark critical paths

**Current Test Stats:**
- 21 tests for stats module (bundle impact, type detection, complexity)
- 89 tests for lint module (rules, auto-fix, severity filtering)
- 166 tests for create module (templates, interactive flow, validation)

### Commit Messages

We follow conventional commit format:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks

Example: `feat: add schema validation for API routes`

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them with descriptive messages

3. Ensure all tests pass and code follows our style guidelines:
   ```bash
   npm run validate
   ```

4. Push your branch and create a pull request

5. Fill out the pull request template with:
   - Description of changes
   - Related issue numbers
   - Testing instructions
   - Breaking changes (if any)

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` types - use proper type definitions
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

### Architecture

- Follow the existing project structure
- Keep functions small and focused
- Use dependency injection where appropriate
- Write self-documenting code

### Performance

- Consider performance implications of changes
- Use appropriate data structures
- Avoid unnecessary computations
- Profile performance-critical code

## Issue Reporting

When reporting issues, please include:

- zodkit version
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages (if any)
- Minimal reproduction case

## Feature Requests

For feature requests, please:

- Check if the feature already exists or is planned
- Describe the use case and motivation
- Provide examples of how it would be used
- Consider implementation complexity

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

## Areas for Contribution

We welcome contributions in the following areas:

### High Priority

- **Bug fixes**: Check [open issues](https://github.com/JSONbored/zodkit/issues) labeled `bug`
- **Test coverage**: Increase coverage for core modules
- **Documentation**: Improve examples, tutorials, and API docs
- **Performance**: Optimize AST parsing and schema analysis

### Feature Requests

- **New linting rules**: Additional schema validation rules
  - Example: `no-circular-refs`, `max-nesting-depth`, `required-examples`
- **Schema templates**: More predefined templates for create command
  - Example: Event, Order, Invoice, Settings, Config
- **Export formats**: Additional output formats
  - Example: GraphQL schema, Protobuf, JSON Schema draft-2020-12
- **IDE integration**: VS Code extension, Language Server Protocol

### Good First Issues

Look for issues labeled `good-first-issue` - these are beginner-friendly:

- Documentation improvements
- Adding test cases
- Fixing typos
- Simple bug fixes
- Adding examples to README

### Ideas for New Contributors

1. **Add a new template** to the create command (e.g., EventSchema, OrderSchema)
2. **Improve error messages** with more context and suggestions
3. **Add examples** to the documentation
4. **Write a blog post** about using ZodKit
5. **Create a tutorial** video or guide

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/JSONbored/zodkit/discussions)
- **Bugs**: Open an [Issue](https://github.com/JSONbored/zodkit/issues)
- **Feature Requests**: Open an [Issue](https://github.com/JSONbored/zodkit/issues) with the `enhancement` label
- **Security**: Email security concerns privately (do not open public issues for security vulnerabilities)

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for each release
- README.md contributors section
- GitHub contributors page

## License

By contributing to ZodKit, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to ZodKit!** 🎉