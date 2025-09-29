"use strict";
/**
 * @fileoverview Unit Tests for Unified Configuration System
 * @module UnifiedConfigTests
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const unified_config_system_1 = require("../../src/core/unified-config-system");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Mock fs
jest.mock('fs');
describe('UnifiedConfigSystem', () => {
    let manager;
    const mockFs = fs;
    beforeEach(() => {
        manager = new unified_config_system_1.UnifiedConfigManager();
        manager.invalidateCache();
        jest.clearAllMocks();
    });
    describe('UnifiedConfigSchema', () => {
        it('should validate default configuration', async () => {
            // Test that loading empty config through manager applies defaults
            const manager = new unified_config_system_1.UnifiedConfigManager();
            mockFs.existsSync.mockReturnValue(false);
            const config = await manager.load();
            expect(config.include).toContain('./src/**/*.ts');
            expect(config.exclude).toContain('**/node_modules/**');
            expect(config.rules?.['no-any-types']).toBe('error');
            expect(config.output?.format).toBe('pretty');
            expect(config.analysis?.complexity?.enabled).toBe(true);
        });
        it('should validate custom configuration', () => {
            const customConfig = {
                name: 'my-project',
                rules: {
                    'no-any-types': 'warn'
                },
                output: {
                    format: 'json',
                    verbose: true
                }
            };
            const config = unified_config_system_1.UnifiedConfigSchema.parse(customConfig);
            expect(config.name).toBe('my-project');
            expect(config.rules?.['no-any-types']).toBe('warn');
            expect(config.output?.format).toBe('json');
            expect(config.output?.verbose).toBe(true);
        });
        it('should handle legacy zodkit configuration', () => {
            const legacyConfig = {
                zodkit: {
                    schemaDir: './custom-schemas',
                    outputDir: './custom-output',
                    rules: ['strict']
                }
            };
            const config = unified_config_system_1.UnifiedConfigSchema.parse(legacyConfig);
            expect(config.zodkit?.schemaDir).toBe('./custom-schemas');
            expect(config.zodkit?.outputDir).toBe('./custom-output');
            expect(config.zodkit?.rules).toEqual(['strict']);
        });
        it('should reject invalid rule severities', () => {
            const invalidConfig = {
                rules: {
                    'no-any-types': 'invalid'
                }
            };
            expect(() => unified_config_system_1.UnifiedConfigSchema.parse(invalidConfig)).toThrow();
        });
        it('should reject invalid output formats', () => {
            const invalidConfig = {
                output: {
                    format: 'invalid'
                }
            };
            expect(() => unified_config_system_1.UnifiedConfigSchema.parse(invalidConfig)).toThrow();
        });
    });
    describe('UnifiedConfigManager', () => {
        describe('load()', () => {
            it('should load default configuration when no config files exist', async () => {
                mockFs.existsSync.mockReturnValue(false);
                const config = await manager.load();
                expect(config.include).toContain('./src/**/*.ts');
                expect(config.rules?.['no-any-types']).toBe('error');
                expect(config.output?.format).toBe('pretty');
            });
            it('should load JavaScript configuration file', async () => {
                const jsConfig = {
                    name: 'test-project',
                    rules: { 'no-any-types': 'warn' },
                    output: { format: 'json' }
                };
                mockFs.existsSync.mockImplementation((filePath) => {
                    return filePath.includes('zodkit.config.js');
                });
                // Mock require to return our config
                jest.doMock(path.resolve(process.cwd(), 'zodkit.config.js'), () => jsConfig, { virtual: true });
                const config = await manager.load();
                expect(config.name).toBe('test-project');
                expect(config.rules?.['no-any-types']).toBe('warn');
                expect(config.output?.format).toBe('json');
            });
            it('should load JSON configuration file when JS config not found', async () => {
                // Create fresh manager to avoid cached config
                const freshManager = new unified_config_system_1.UnifiedConfigManager();
                const jsonConfig = {
                    name: 'json-test-project',
                    rules: {
                        'no-any-types': 'warn'
                    }
                };
                mockFs.existsSync.mockImplementation((filePath) => {
                    const pathStr = String(filePath);
                    // Only zodkit.config.json exists, not zodkit.config.js
                    if (pathStr.endsWith('zodkit.config.js'))
                        return false;
                    if (pathStr.endsWith('zodkit.config.json'))
                        return true;
                    if (pathStr.endsWith('package.json'))
                        return false;
                    return false;
                });
                mockFs.readFileSync.mockImplementation((filePath) => {
                    const pathStr = String(filePath);
                    if (pathStr.endsWith('zodkit.config.json')) {
                        return JSON.stringify(jsonConfig);
                    }
                    throw new Error(`File not found: ${filePath}`);
                });
                const config = await freshManager.load();
                expect(config.name).toBe('json-test-project');
                expect(config.rules?.['no-any-types']).toBe('warn');
            });
            it('should load from package.json zodkit field', async () => {
                const packageJson = {
                    name: 'my-package',
                    zodkit: {
                        rules: { 'no-any-types': 'error' }
                    }
                };
                mockFs.existsSync.mockImplementation((filePath) => {
                    return filePath.includes('package.json');
                });
                jest.doMock(path.resolve(process.cwd(), 'package.json'), () => packageJson, { virtual: true });
                const config = await manager.load();
                expect(config.rules?.['no-any-types']).toBe('error');
            });
            it('should cache loaded configuration', async () => {
                mockFs.existsSync.mockReturnValue(false);
                const config1 = await manager.load();
                const config2 = await manager.load();
                expect(config1).toBe(config2); // Same object reference
            });
            it('should handle loading errors gracefully', async () => {
                // Create fresh manager to avoid cached config
                const freshManager = new unified_config_system_1.UnifiedConfigManager();
                mockFs.existsSync.mockReturnValue(false); // No config files exist
                // Clear previous mocks
                jest.resetModules();
                // Should not throw, should use defaults
                const config = await freshManager.load();
                expect(config.rules?.['no-any-types']).toBe('error');
            });
        });
        describe('getSchemaPatterns()', () => {
            it('should collect patterns from all sources', async () => {
                const config = unified_config_system_1.UnifiedConfigSchema.parse({
                    include: ['./src/**/*.ts'],
                    schemas: {
                        patterns: ['./lib/**/*.js']
                    },
                    targets: {
                        api: {
                            patterns: ['./api/**/*.ts']
                        }
                    }
                });
                const patterns = manager.getSchemaPatterns(config);
                expect(patterns).toContain('./src/**/*.ts');
                expect(patterns).toContain('./lib/**/*.js');
                expect(patterns).toContain('./api/**/*.ts');
            });
            it('should deduplicate patterns', async () => {
                const config = unified_config_system_1.UnifiedConfigSchema.parse({
                    include: ['./src/**/*.ts'],
                    schemas: {
                        patterns: ['./src/**/*.ts'] // Duplicate
                    }
                });
                const patterns = manager.getSchemaPatterns(config);
                const srcPatterns = patterns.filter(p => p === './src/**/*.ts');
                expect(srcPatterns).toHaveLength(1);
            });
        });
        describe('getExcludePatterns()', () => {
            it('should collect exclude patterns from all sources', async () => {
                const config = unified_config_system_1.UnifiedConfigSchema.parse({
                    exclude: ['**/node_modules/**'],
                    schemas: {
                        patterns: ['./schemas/**/*.ts'],
                        exclude: ['**/dist/**']
                    },
                    targets: {
                        api: {
                            patterns: ['./api/**/*.ts'],
                            exclude: ['**/test/**']
                        }
                    }
                });
                const patterns = manager.getExcludePatterns(config);
                expect(patterns).toContain('**/node_modules/**');
                expect(patterns).toContain('**/dist/**');
                expect(patterns).toContain('**/test/**');
            });
        });
        describe('applyPreset()', () => {
            it('should apply development preset', async () => {
                const baseConfig = unified_config_system_1.UnifiedConfigSchema.parse({});
                const config = manager.applyPreset(baseConfig, 'development');
                expect(config.output?.verbose).toBe(true);
                expect(config.hotReload?.enabled).toBe(true);
                expect(config.optimization?.cache?.enabled).toBe(true);
            });
            it('should apply production preset', async () => {
                const baseConfig = unified_config_system_1.UnifiedConfigSchema.parse({});
                const config = manager.applyPreset(baseConfig, 'production');
                expect(config.output?.format).toBe('json');
                expect(config.output?.verbose).toBe(false);
                expect(config.hotReload?.enabled).toBe(false);
                expect(config.rules?.['require-validation']).toBe('error');
            });
            it('should apply strict preset', async () => {
                const baseConfig = unified_config_system_1.UnifiedConfigSchema.parse({});
                const config = manager.applyPreset(baseConfig, 'strict');
                expect(config.rules?.['require-validation']).toBe('error');
                expect(config.rules?.['no-any-types']).toBe('error');
                expect(config.rules?.['prefer-strict-schemas']).toBe('error');
                expect(config.rules?.['use-descriptive-names']).toBe('error');
            });
        });
        describe('getComponentConfig()', () => {
            it('should return specific component configuration', async () => {
                const config = unified_config_system_1.UnifiedConfigSchema.parse({
                    analysis: {
                        complexity: { maxDepth: 5 }
                    }
                });
                const analysisConfig = manager.getComponentConfig(config, 'analysis');
                expect(analysisConfig.complexity.maxDepth).toBe(5);
                expect(analysisConfig.complexity.enabled).toBe(true); // Default value
            });
        });
        describe('validate()', () => {
            it('should validate correct configuration', () => {
                const validConfig = {
                    rules: { 'no-any-types': 'error' },
                    output: { format: 'json' }
                };
                const result = manager.validate(validConfig);
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });
            it('should return validation errors for invalid configuration', () => {
                const invalidConfig = {
                    rules: { 'no-any-types': 'invalid-severity' },
                    output: { format: 'invalid-format' }
                };
                const result = manager.validate(invalidConfig);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors.some(err => err.includes('rules.no-any-types'))).toBe(true);
                expect(result.errors.some(err => err.includes('output.format'))).toBe(true);
            });
        });
        describe('invalidateCache()', () => {
            it('should clear cached configuration', async () => {
                mockFs.existsSync.mockReturnValue(false);
                const config1 = await manager.load();
                manager.invalidateCache();
                const config2 = await manager.load();
                expect(config1).not.toBe(config2); // Different object references
            });
        });
    });
    describe('ConfigPresets', () => {
        it('should have all required presets', () => {
            expect(unified_config_system_1.ConfigPresets.development).toBeDefined();
            expect(unified_config_system_1.ConfigPresets.production).toBeDefined();
            expect(unified_config_system_1.ConfigPresets.ci).toBeDefined();
            expect(unified_config_system_1.ConfigPresets.strict).toBeDefined();
        });
        it('should have appropriate development preset settings', () => {
            const preset = unified_config_system_1.ConfigPresets.development;
            expect(preset.output?.verbose).toBe(true);
            expect(preset.hotReload?.enabled).toBe(true);
            expect(preset.optimization?.cache?.enabled).toBe(true);
        });
        it('should have appropriate production preset settings', () => {
            const preset = unified_config_system_1.ConfigPresets.production;
            expect(preset.output?.format).toBe('json');
            expect(preset.output?.verbose).toBe(false);
            expect(preset.hotReload?.enabled).toBe(false);
        });
        it('should have appropriate CI preset settings', () => {
            const preset = unified_config_system_1.ConfigPresets.ci;
            expect(preset.output?.format).toBe('junit');
            expect(preset.optimization?.cache?.enabled).toBe(false);
        });
    });
    describe('Global configManager', () => {
        it('should be an instance of UnifiedConfigManager', () => {
            expect(unified_config_system_1.configManager).toBeInstanceOf(unified_config_system_1.UnifiedConfigManager);
        });
        it('should load configuration', async () => {
            mockFs.existsSync.mockReturnValue(false);
            const config = await unified_config_system_1.configManager.load();
            expect(config).toBeDefined();
            expect(config.rules).toBeDefined();
        });
    });
    describe('Configuration Merging', () => {
        it('should properly merge nested configurations', () => {
            const base = {
                rules: { 'no-any-types': 'error' },
                output: { format: 'pretty', verbose: false }
            };
            const override = {
                rules: { 'prefer-strict-schemas': 'warn' },
                output: { verbose: true }
            };
            const manager = new unified_config_system_1.UnifiedConfigManager();
            const merged = manager.mergeConfigs(base, override);
            expect(merged.rules['no-any-types']).toBe('error');
            expect(merged.rules['prefer-strict-schemas']).toBe('warn');
            expect(merged.output.format).toBe('pretty');
            expect(merged.output.verbose).toBe(true);
        });
    });
});
//# sourceMappingURL=unified-config.test.js.map