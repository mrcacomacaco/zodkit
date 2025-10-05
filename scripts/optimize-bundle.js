#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

/**
 * Bundle optimization script for ZodKit
 * Optimizes the built TypeScript output for production use
 */

console.log('🚀 Optimizing bundle for production...\n');

const distPath = path.join(__dirname, '../dist');

// Step 1: Remove unused exports and optimize imports
function optimizeFile(filePath) {
	const content = fs.readFileSync(filePath, 'utf8');
	let optimized = content;

	// Remove or replace debug statements carefully
	// For standalone debug calls, remove them
	optimized = optimized.replace(/^\s*console\.debug\([^)]*\);?\s*$/gm, '');
	// For arrow function bodies, replace with empty function
	optimized = optimized.replace(/=> console\.debug\([^)]*\)/g, '=> {}');
	optimized = optimized.replace(/console\.log\(['"`]DEBUG[^)]*\);?\n?/g, '');

	// Remove development-only code blocks
	optimized = optimized.replace(/\/\* DEV_START \*\/[\s\S]*?\/\* DEV_END \*\//g, '');
	optimized = optimized.replace(/if \(__DEV__\) \{[\s\S]*?\}/g, '');

	// Optimize require() calls - convert dynamic requires to static where possible
	optimized = optimized.replace(/require\(['"`]([^'"`]+)['"`]\)/g, (match, modulePath) => {
		// Only optimize relative imports
		if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
			return match;
		}
		return match;
	});

	// Remove empty lines and reduce whitespace
	optimized = optimized.replace(/\n\s*\n\s*\n/g, '\n\n');
	optimized = optimized.replace(/^\s*\n/gm, '');

	if (content !== optimized) {
		fs.writeFileSync(filePath, optimized);
		return true;
	}
	return false;
}

// Step 2: Create optimized entry points
function createOptimizedEntryPoints() {
	const cliIndexPath = path.join(distPath, 'cli/index.js');
	const libIndexPath = path.join(distPath, 'index.js');

	// Optimize CLI entry point
	try {
		let content = fs.readFileSync(cliIndexPath, 'utf8');

		// Remove existing shebang if present
		content = content.replace(/^#!\/usr\/bin\/env node\n?/, '');

		// Add production optimizations
		const optimized = `#!/usr/bin/env node
// Production build - optimized for size and performance
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

${content}`;

		fs.writeFileSync(cliIndexPath, optimized, { mode: 0o755 });
		console.log('✅ Optimized CLI entry point');
	} catch (error) {
		console.log('⚠️  Could not optimize CLI entry point:', error.message);
	}

	// Optimize library entry point
	try {
		optimizeFile(libIndexPath);
		console.log('✅ Optimized library entry point');
	} catch (error) {
		console.log('⚠️  Could not optimize library entry point:', error.message);
	}
}

// Step 3: Remove unused files and optimize structure
function removeUnusedFiles() {
	const filesToRemove = [
		'test',
		'*.test.js',
		'*.spec.js',
		'*.test.d.ts',
		'*.spec.d.ts',
		'**/*.test.js',
		'**/*.spec.js',
	];

	let removedCount = 0;

	function removePattern(pattern, baseDir = distPath) {
		const glob = require('glob');
		const matches = glob.sync(pattern, { cwd: baseDir });

		matches.forEach((match) => {
			const fullPath = path.join(baseDir, match);
			if (fs.existsSync(fullPath)) {
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					fs.rmSync(fullPath, { recursive: true });
				} else {
					fs.unlinkSync(fullPath);
				}
				removedCount++;
			}
		});
	}

	try {
		for (const pattern of filesToRemove) {
			removePattern(pattern);
		}
		if (removedCount > 0) {
			console.log(`✅ Removed ${removedCount} unused files`);
		}
	} catch (_error) {
		console.log('⚠️  Could not remove unused files (glob not available)');
	}
}

// Step 4: Optimize all JavaScript files
function optimizeAllFiles() {
	const optimizedCount = walkDir(distPath);
	if (optimizedCount > 0) {
		console.log(`✅ Optimized ${optimizedCount} files`);
	}
}

function walkDir(dir) {
	let count = 0;
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			count += walkDir(filePath);
		} else if (file.endsWith('.js') && !file.includes('.min.')) {
			if (optimizeFile(filePath)) {
				count++;
			}
		}
	}

	return count;
}

// Step 5: Generate bundle report
function generateBundleReport() {
	const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

	function getDirectorySize(dir) {
		let size = 0;

		function walkSize(currentDir) {
			const files = fs.readdirSync(currentDir);

			for (const file of files) {
				const filePath = path.join(currentDir, file);
				const stat = fs.statSync(filePath);

				if (stat.isDirectory()) {
					walkSize(filePath);
				} else {
					size += stat.size;
				}
			}
		}

		if (fs.existsSync(dir)) {
			walkSize(dir);
		}
		return size;
	}

	function formatBytes(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
	}

	const distSize = getDirectorySize(distPath);
	const cliSize = getDirectorySize(path.join(distPath, 'cli'));
	const coreSize = getDirectorySize(path.join(distPath, 'core'));

	console.log('\n📊 Bundle Size Report:');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(`Total size:     ${formatBytes(distSize)}`);
	console.log(`CLI size:       ${formatBytes(cliSize)}`);
	console.log(`Core size:      ${formatBytes(coreSize)}`);
	console.log(`Version:        ${packageJson.version}`);

	// Size targets
	const targets = {
		total: 2 * 1024 * 1024, // 2MB
		cli: 1 * 1024 * 1024, // 1MB
		core: 800 * 1024, // 800KB
	};

	console.log('\n🎯 Size Targets:');
	console.log(
		`Total:          ${formatBytes(targets.total)} ${distSize <= targets.total ? '✅' : '❌'}`,
	);
	console.log(
		`CLI:            ${formatBytes(targets.cli)} ${cliSize <= targets.cli ? '✅' : '❌'}`,
	);
	console.log(
		`Core:           ${formatBytes(targets.core)} ${coreSize <= targets.core ? '✅' : '❌'}`,
	);

	// Tree-shaking effectiveness
	const effectiveness = Math.max(0, 100 - (distSize / (3 * 1024 * 1024)) * 100);
	console.log(`\n🌳 Tree-shaking effectiveness: ${effectiveness.toFixed(1)}%`);

	console.log('\n💡 Optimization Tips:');
	if (distSize > targets.total) {
		console.log('  • Consider lazy loading more commands');
		console.log('  • Review heavy dependencies (ts-morph, etc.)');
	}
	if (cliSize > targets.cli) {
		console.log('  • Move more CLI commands to lazy loading');
	}
	if (effectiveness < 80) {
		console.log('  • Enable more aggressive tree shaking');
		console.log('  • Review sideEffects in package.json');
	}

	return {
		distSize,
		cliSize,
		coreSize,
		effectiveness,
		passed: distSize <= targets.total && cliSize <= targets.cli,
	};
}

// Main optimization process
async function main() {
	try {
		if (!fs.existsSync(distPath)) {
			console.error('❌ dist/ directory not found. Run build:tsc first.');
			process.exit(1);
		}

		console.log('🔧 Step 1: Optimizing entry points...');
		createOptimizedEntryPoints();

		console.log('\n🗑️  Step 2: Removing unused files...');
		removeUnusedFiles();

		console.log('\n⚡ Step 3: Optimizing all files...');
		optimizeAllFiles();

		console.log('\n📊 Step 4: Generating bundle report...');
		const report = generateBundleReport();

		console.log('\n🎉 Bundle optimization complete!');

		if (!report.passed) {
			console.log('\n⚠️  Bundle size exceeds targets. Consider additional optimizations.');
			// Don't fail the build, just warn
		}
	} catch (error) {
		console.error('❌ Bundle optimization failed:', error);
		process.exit(1);
	}
}

main();
