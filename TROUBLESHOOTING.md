# Troubleshooting Guide

This guide helps you resolve common issues when using ZodKit.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Build Issues](#build-issues)
- [Runtime Errors](#runtime-errors)
- [Command-Specific Issues](#command-specific-issues)
- [Performance Issues](#performance-issues)
- [Getting Help](#getting-help)

## Installation Issues

### `npm install` fails with peer dependency warnings

**Problem:**
```
npm WARN ERESOLVE overriding peer dependency
npm WARN Found: typescript@5.x.x
```

**Solution:**
```bash
# Use npm's legacy peer deps resolver
npm install --legacy-peer-deps

# Or use force (not recommended)
npm install --force
```

### Module not found errors after installation

**Problem:**
```
Error: Cannot find module 'ts-morph'
```

**Solution:**
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### TypeScript version conflicts

**Problem:**
```
error TS2304: Cannot find name 'z'
```

**Solution:**
Ensure you have compatible TypeScript version:
```bash
npm install typescript@^5.0.0 --save-dev
```

## Build Issues

### TypeScript compilation errors

**Problem:**
```
src/core/schema-stats.ts:100:15 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'ZodSchemaInfo'
```

**Solution:**
1. Clean build artifacts:
   ```bash
   rm -rf dist
   npm run build:tsc
   ```

2. Check TypeScript configuration:
   ```bash
   npx tsc --showConfig
   ```

3. Ensure all dependencies are installed:
   ```bash
   npm install
   ```

### Webpack build fails

**Problem:**
```
ERROR in ./src/cli/index.ts
Module not found: Error: Can't resolve 'ts-morph'
```

**Solution:**
```bash
# Rebuild with clean slate
npm run build:clean
npm run build

# If issue persists, check webpack config
cat webpack.config.js | grep externals
```

### Build hangs or is very slow

**Problem:**
Build process takes more than 5 minutes or appears to hang.

**Solution:**
1. Increase Node.js memory:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run build
   ```

2. Use TypeScript incremental compilation:
   ```bash
   npm run dev  # Watch mode is faster
   ```

## Runtime Errors

### "Cannot find module" errors when running CLI

**Problem:**
```bash
$ zodkit lint
Error: Cannot find module '/usr/local/lib/node_modules/zodkit/dist/cli/index.js'
```

**Solution:**
1. Rebuild the project:
   ```bash
   npm run build
   ```

2. If installed globally, reinstall:
   ```bash
   npm uninstall -g zodkit
   npm install -g zodkit
   ```

3. Or use npx:
   ```bash
   npx zodkit lint
   ```

### "Permission denied" errors

**Problem:**
```bash
$ zodkit lint
bash: /usr/local/bin/zodkit: Permission denied
```

**Solution:**
```bash
# Fix permissions
sudo chmod +x /usr/local/bin/zodkit

# Or reinstall without sudo
npm install -g zodkit
```

### AST parsing errors

**Problem:**
```
Error: Failed to parse source file
SyntaxError: Unexpected token
```

**Solution:**
1. Ensure file is valid TypeScript:
   ```bash
   npx tsc --noEmit path/to/file.ts
   ```

2. Check for unsupported syntax:
   - ZodKit uses ts-morph which may not support all experimental features
   - Try simplifying the schema temporarily

3. Skip problematic files:
   ```bash
   zodkit lint "src/**/*.ts" "!src/problematic.ts"
   ```

## Command-Specific Issues

### Lint Command

#### Lint reports no issues but schemas have problems

**Problem:**
```bash
$ zodkit lint
✓ No issues found
```

But you know there are issues.

**Solution:**
1. Check file patterns:
   ```bash
   zodkit lint "src/**/*.schema.ts" --verbose
   ```

2. Verify schemas are being found:
   ```bash
   zodkit check  # Should show schema count
   ```

3. Check if schemas are properly exported:
   ```typescript
   // Bad - not exported
   const UserSchema = z.object({...});

   // Good - exported
   export const UserSchema = z.object({...});
   ```

#### Auto-fix changes unexpected code

**Problem:**
Lint auto-fix modifies code incorrectly.

**Solution:**
1. Always review changes before accepting:
   ```bash
   zodkit lint --fix --dry-run  # Preview changes
   ```

2. Use version control:
   ```bash
   git diff  # Review changes
   git checkout -- .  # Revert if needed
   ```

3. Report the issue with a minimal reproduction case

### Stats Command

#### Stats shows 0 schemas

**Problem:**
```bash
$ zodkit stats
Total schemas: 0
```

**Solution:**
1. Check file patterns:
   ```bash
   zodkit stats "src/**/*.ts" --verbose
   ```

2. Verify Zod schemas are properly defined:
   ```typescript
   // Must use z.object, z.array, etc.
   export const MySchema = z.object({
     name: z.string(),
   });
   ```

3. Check for schema naming:
   ```typescript
   // Schema variables should be exported
   export const UserSchema = z.object({...});  // ✓ Found
   const user = z.object({...});               // ✗ Not found
   ```

#### Bundle impact shows unexpected sizes

**Problem:**
Bundle sizes seem incorrect or too high.

**Solution:**
1. Bundle impact is an **estimate** based on schema complexity
2. Actual sizes may vary depending on:
   - Tree-shaking effectiveness
   - Bundler configuration
   - Zod version

3. Use it for relative comparison, not absolute sizing

#### Complexity metrics seem wrong

**Problem:**
Schema depth or field count doesn't match expectations.

**Solution:**
1. Check the schema definition:
   ```bash
   zodkit stats --verbose  # Shows detailed metrics
   ```

2. Understand depth calculation:
   - Counts nested `z.object()` and `z.array()` calls
   - Does not count method chains like `.optional().nullable()`

3. Field count only works for object schemas:
   ```typescript
   z.object({ a: z.string() })  // fieldCount: 1
   z.array(z.string())          // fieldCount: 0
   ```

### Create Command

#### Interactive prompts don't work

**Problem:**
```bash
$ zodkit create
# No prompts appear, or terminal hangs
```

**Solution:**
1. Ensure terminal supports interactivity:
   ```bash
   # Test with simple prompt
   zodkit create --template user --name Test
   ```

2. Check if stdin is available:
   ```bash
   # May not work in some CI environments
   # Use non-interactive mode
   zodkit create --template user --name MySchema --output schema.ts
   ```

3. Update Node.js to v18+:
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

#### Template generates invalid code

**Problem:**
Generated schema has TypeScript errors.

**Solution:**
1. Report the issue with template name and steps to reproduce
2. Manually fix generated code
3. Consider using a different template as a starting point

#### Cannot save schema to file

**Problem:**
```
Error: EACCES: permission denied, open 'schema.ts'
```

**Solution:**
```bash
# Check directory permissions
ls -la $(dirname schema.ts)

# Create directory if needed
mkdir -p schemas

# Try different output path
zodkit create --output ./schemas/my-schema.ts
```

## Performance Issues

### CLI commands are slow

**Problem:**
Commands take more than 10 seconds to execute.

**Solution:**
1. Use caching:
   ```bash
   zodkit analyze --fast  # Uses cached results
   ```

2. Limit file patterns:
   ```bash
   zodkit stats "src/schemas/**/*.ts"  # Not "**/*.ts"
   ```

3. Exclude large files:
   ```bash
   zodkit lint "src/**/*.ts" "!src/generated/**"
   ```

### High memory usage

**Problem:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Solution:**
1. Increase Node.js memory:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   zodkit stats
   ```

2. Process files in batches:
   ```bash
   # Instead of all at once
   zodkit stats "src/schemas/part1/**/*.ts"
   zodkit stats "src/schemas/part2/**/*.ts"
   ```

3. Use streaming mode (if available):
   ```bash
   zodkit analyze --streaming
   ```

### AST parsing is slow

**Problem:**
Parsing large TypeScript files takes a long time.

**Solution:**
1. Use `skipFileDependencyResolution`:
   ```typescript
   // In zodkit.config.json
   {
     "parser": {
       "skipFileDependencyResolution": true
     }
   }
   ```

2. Simplify schemas - split large schemas into smaller ones

3. Use progressive loading:
   ```bash
   zodkit analyze --progressive
   ```

## Configuration Issues

### Config file not being loaded

**Problem:**
```bash
$ zodkit lint
# Doesn't use zodkit.config.json settings
```

**Solution:**
1. Check config file name and location:
   ```bash
   ls zodkit.config.json  # Must be in project root
   ```

2. Validate JSON syntax:
   ```bash
   cat zodkit.config.json | jq .  # Should parse without errors
   ```

3. Use explicit config path:
   ```bash
   zodkit lint --config ./path/to/config.json
   ```

### Rules not being applied

**Problem:**
Custom linting rules are ignored.

**Solution:**
1. Check rule configuration:
   ```json
   {
     "rules": {
       "require-description": "error",
       "no-any-type": "warn"
     }
   }
   ```

2. Ensure rule names are correct (case-sensitive)

3. Check rule severity is not "off":
   ```json
   {
     "rules": {
       "require-description": "off"  // ✗ Disabled
     }
   }
   ```

## Common Error Messages

### "No schemas found in project"

**Causes:**
- Schema files not matching pattern
- Schemas not exported
- TypeScript compilation errors

**Fix:**
```bash
# Check what files are being scanned
zodkit check --verbose

# Verify schema export
export const MySchema = z.object({...});  # Must be exported
```

### "Failed to extract schema information"

**Causes:**
- Complex schema definitions
- Unsupported Zod features
- AST parsing errors

**Fix:**
```bash
# Try with simpler schema
zodkit analyze --mode check  # Faster, less analysis

# Check TypeScript compilation
npx tsc --noEmit
```

### "Rule execution failed"

**Causes:**
- Invalid schema structure
- Plugin compatibility issues

**Fix:**
```bash
# Skip problematic rules
zodkit lint --severity error  # Only run error-level rules

# Update zodkit
npm update zodkit
```

## Getting Help

### Before Opening an Issue

1. **Check this troubleshooting guide** thoroughly
2. **Search existing issues**: https://github.com/JSONbored/zodkit/issues
3. **Update to latest version**:
   ```bash
   npm update zodkit
   ```
4. **Try with minimal reproduction**:
   - Create a small test case
   - Isolate the problem

### What to Include in Bug Reports

```markdown
**Environment:**
- ZodKit version: (run `zodkit --version`)
- Node.js version: (run `node --version`)
- npm version: (run `npm --version`)
- Operating System: (e.g., macOS 13.0, Ubuntu 22.04)

**Steps to Reproduce:**
1. Run `zodkit lint src/schema.ts`
2. See error: ...

**Expected Behavior:**
Should lint schema without errors.

**Actual Behavior:**
Gets error: "Cannot find module..."

**Minimal Reproduction:**
```typescript
// src/schema.ts
import { z } from 'zod';
export const MySchema = z.object({
  name: z.string(),
});
```

**Additional Context:**
- Tried solutions: X, Y, Z
- Workarounds: None found
```

### Getting Quick Help

- **Discord/Slack**: Check project README for community links
- **GitHub Discussions**: For questions and discussions
- **Stack Overflow**: Tag with `zodkit` and `zod`
- **Twitter**: Tweet @zodkit_cli (if available)

### Professional Support

For enterprise support, contact: support@zodkit.dev

---

**Didn't find your issue?** [Open a new issue](https://github.com/JSONbored/zodkit/issues/new) with details!
