#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (err) {
    return 0;
  }
}

function getGzippedSize(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const gzipped = zlib.gzipSync(fileContent);
    return gzipped.length;
  } catch (err) {
    return 0;
  }
}

function analyzeDirectory(dir, baseDir = dir) {
  const results = {
    files: [],
    totalSize: 0,
    totalGzipped: 0,
    largestFiles: []
  };

  function walkDir(currentDir) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith('.js') || file.endsWith('.json')) {
        const size = getFileSize(filePath);
        const gzipped = getGzippedSize(filePath);
        const relativePath = path.relative(baseDir, filePath);

        results.files.push({
          path: relativePath,
          size,
          gzipped,
          ratio: ((1 - gzipped / size) * 100).toFixed(1)
        });

        results.totalSize += size;
        results.totalGzipped += gzipped;
      }
    }
  }

  walkDir(dir);

  // Sort by size and get top 10 largest files
  results.largestFiles = results.files
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  return results;
}

function analyzeDependencies() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const dependencies = packageJson.dependencies || {};

  const depSizes = [];

  for (const [name, version] of Object.entries(dependencies)) {
    const depPath = path.join('node_modules', name);
    if (fs.existsSync(depPath)) {
      const stats = analyzeDirectory(depPath);
      depSizes.push({
        name,
        version,
        size: stats.totalSize,
        gzipped: stats.totalGzipped,
        files: stats.files.length
      });
    }
  }

  return depSizes.sort((a, b) => b.size - a.size);
}

function main() {
  console.log(`${colors.bold}${colors.blue}📦 Bundle Size Analysis for zodkit${colors.reset}\n`);

  // Check if dist exists
  if (!fs.existsSync('dist')) {
    console.log(`${colors.red}Error: dist/ directory not found. Run 'npm run build' first.${colors.reset}`);
    process.exit(1);
  }

  // Analyze dist directory
  console.log(`${colors.cyan}Analyzing dist/ directory...${colors.reset}\n`);
  const distAnalysis = analyzeDirectory('dist');

  console.log(`${colors.bold}Distribution Statistics:${colors.reset}`);
  console.log(`  Total files: ${distAnalysis.files.length}`);
  console.log(`  Total size: ${formatBytes(distAnalysis.totalSize)}`);
  console.log(`  Gzipped size: ${formatBytes(distAnalysis.totalGzipped)}`);
  console.log(`  Compression ratio: ${((1 - distAnalysis.totalGzipped / distAnalysis.totalSize) * 100).toFixed(1)}%`);

  // Show largest files
  console.log(`\n${colors.bold}Largest Files in dist/:${colors.reset}`);
  for (const file of distAnalysis.largestFiles.slice(0, 5)) {
    const sizeColor = file.size > 50000 ? colors.red : file.size > 20000 ? colors.yellow : colors.green;
    console.log(`  ${sizeColor}${file.path.padEnd(50)}${colors.reset} ${formatBytes(file.size).padStart(10)} → ${formatBytes(file.gzipped).padStart(10)} (${file.ratio}% smaller)`);
  }

  // Analyze npm package
  console.log(`\n${colors.cyan}Creating npm package preview...${colors.reset}`);
  try {
    execSync('npm pack --dry-run', { stdio: 'pipe' });
    const packOutput = execSync('npm pack --dry-run 2>&1 | grep -E "npm notice"', { encoding: 'utf8' });
    const lines = packOutput.split('\n').filter(line => line.includes('size') || line.includes('files'));

    console.log(`${colors.bold}NPM Package Statistics:${colors.reset}`);
    lines.forEach(line => {
      const cleanLine = line.replace('npm notice ', '  ');
      console.log(cleanLine);
    });
  } catch (err) {
    console.log(`  ${colors.yellow}Could not analyze npm package${colors.reset}`);
  }

  // Analyze dependencies
  console.log(`\n${colors.cyan}Analyzing dependencies...${colors.reset}`);
  const depAnalysis = analyzeDependencies();

  console.log(`${colors.bold}Largest Dependencies:${colors.reset}`);
  const totalDepSize = depAnalysis.reduce((sum, dep) => sum + dep.size, 0);

  for (const dep of depAnalysis.slice(0, 5)) {
    const percentage = ((dep.size / totalDepSize) * 100).toFixed(1);
    const sizeColor = dep.size > 1000000 ? colors.red : dep.size > 500000 ? colors.yellow : colors.green;
    console.log(`  ${sizeColor}${dep.name.padEnd(30)}${colors.reset} ${formatBytes(dep.size).padStart(10)} (${percentage}% of deps)`);
  }

  // Optimization suggestions
  console.log(`\n${colors.bold}${colors.blue}💡 Optimization Suggestions:${colors.reset}`);

  const suggestions = [];

  // Check for large files
  const veryLargeFiles = distAnalysis.files.filter(f => f.size > 100000);
  if (veryLargeFiles.length > 0) {
    suggestions.push(`Found ${veryLargeFiles.length} files over 100KB - consider code splitting`);
  }

  // Check for heavy dependencies
  const heavyDeps = depAnalysis.filter(d => d.size > 1000000);
  if (heavyDeps.length > 0) {
    suggestions.push(`Heavy dependencies detected: ${heavyDeps.map(d => d.name).join(', ')}`);
  }

  // Check compression ratio
  if (distAnalysis.totalGzipped / distAnalysis.totalSize > 0.4) {
    suggestions.push('Poor compression ratio - consider minification');
  }

  // Check total package size
  if (distAnalysis.totalSize > 1000000) {
    suggestions.push('Total size exceeds 1MB - consider removing unused code');
  }

  // Specific dependency suggestions
  if (depAnalysis.find(d => d.name === 'ts-morph')) {
    suggestions.push('ts-morph is heavy (TypeScript compiler) - ensure it\'s needed at runtime');
  }

  if (suggestions.length === 0) {
    console.log(`  ${colors.green}✅ Bundle size looks good!${colors.reset}`);
  } else {
    suggestions.forEach(suggestion => {
      console.log(`  ${colors.yellow}⚠${colors.reset}  ${suggestion}`);
    });
  }

  // Size limits check
  console.log(`\n${colors.bold}Size Limits:${colors.reset}`);
  const limits = {
    dist: 500000,  // 500KB
    npm: 1000000,  // 1MB
    gzipped: 200000 // 200KB
  };

  const checkLimit = (name, value, limit) => {
    const percentage = ((value / limit) * 100).toFixed(0);
    const status = value <= limit
      ? `${colors.green}✅ PASS${colors.reset}`
      : `${colors.red}❌ FAIL${colors.reset}`;
    const color = value <= limit ? colors.green : colors.red;
    console.log(`  ${name.padEnd(20)} ${formatBytes(value).padStart(10)} / ${formatBytes(limit).padStart(10)} ${status} (${color}${percentage}%${colors.reset})`);
  };

  checkLimit('Dist size', distAnalysis.totalSize, limits.dist);
  checkLimit('Gzipped size', distAnalysis.totalGzipped, limits.gzipped);

  // Final status
  const allPassed = distAnalysis.totalSize <= limits.dist &&
                    distAnalysis.totalGzipped <= limits.gzipped;

  console.log(`\n${colors.bold}Final Status: ${allPassed ? `${colors.green}✅ All size checks passed!` : `${colors.red}❌ Some size limits exceeded`}${colors.reset}\n`);

  process.exit(allPassed ? 0 : 1);
}

// Run analysis
main();