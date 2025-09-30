#!/bin/bash

# Fix ESLint violations systematically
cd "$(dirname "$0")"

echo "🔧 Fixing ESLint violations systematically..."

# Phase 1: Fix simple patterns with sed
echo "Phase 1: Fixing logical OR to nullish coalescing..."
find src -name "*.ts" -type f -exec sed -i '' 's/|| \([^|]*\)/?? \1/g' {} \;

echo "Phase 2: Remove unused Worker import..."
find src -name "*.ts" -type f -exec sed -i '' '/import.*Worker.*worker_threads/d' {} \;

echo "Phase 3: Add void operator for floating promises..."
find src -name "*.ts" -type f -exec sed -i '' 's/^\s*\([a-zA-Z_][a-zA-Z0-9_]*\)\.\([a-zA-Z][a-zA-Z0-9_]*\)(.*);$/    void \1.\2(\3);/g' {} \;

echo "Phase 4: Fix require imports to dynamic imports..."
find src -name "*.ts" -type f -exec sed -i '' 's/require(/await import(/g' {} \;

echo "✅ Basic fixes applied. Running ESLint to see remaining issues..."
npx eslint src --format=json | jq '.[] | .messages | length' | awk '{sum += $1} END {print "Remaining violations:", sum}'