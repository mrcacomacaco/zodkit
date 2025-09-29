"use strict";
/**
 * @fileoverview Performance benchmarks and regression tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const performance_monitor_1 = require("../../src/utils/performance-monitor");
const schema_discovery_1 = require("../../src/core/schema-discovery");
const validator_1 = require("../../src/core/validator");
const config_1 = require("../../src/core/config");
describe('Performance Benchmarks', () => {
    let performanceMonitor;
    beforeEach(() => {
        performanceMonitor = new performance_monitor_1.PerformanceMonitor('.zodkit/test-metrics');
    });
    afterEach(() => {
        // Clean up metrics after each test
        performanceMonitor.clearMetrics();
    });
    it('should benchmark schema discovery performance', async () => {
        const configManager = new config_1.ConfigManager();
        const config = await configManager.loadConfig();
        const schemaDiscovery = new schema_discovery_1.SchemaDiscovery(config);
        const result = await performanceMonitor.benchmark(async () => {
            await schemaDiscovery.findSchemas();
        }, {
            name: 'schema-discovery',
            iterations: 5,
            warmupIterations: 2,
            timeout: 30000,
            collectGC: true,
        });
        expect(result.iterations).toBe(5);
        expect(result.averageDuration).toBeGreaterThan(0);
        expect(result.standardDeviation).toBeGreaterThanOrEqual(0);
        // Performance expectations (adjust based on your requirements)
        expect(result.averageDuration).toBeLessThan(5000); // Should complete in under 5 seconds
        expect(result.maxDuration).toBeLessThan(10000); // No single run should take more than 10 seconds
    });
    it('should benchmark validation performance', async () => {
        const configManager = new config_1.ConfigManager();
        const config = await configManager.loadConfig();
        const validator = new validator_1.Validator(config);
        const schemaDiscovery = new schema_discovery_1.SchemaDiscovery(config);
        const schemas = await schemaDiscovery.findSchemas();
        const result = await performanceMonitor.benchmark(async () => {
            await validator.validate(schemas.slice(0, 3)); // Use first 3 schemas for testing
        }, {
            name: 'validation',
            iterations: 10,
            warmupIterations: 3,
            timeout: 20000,
            collectGC: true,
        });
        expect(result.iterations).toBe(10);
        expect(result.averageDuration).toBeGreaterThan(0);
        // Performance expectations
        expect(result.averageDuration).toBeLessThan(2000); // Should complete in under 2 seconds
        expect(result.maxDuration).toBeLessThan(5000); // No single run should take more than 5 seconds
    });
    it('should benchmark configuration loading performance', async () => {
        const configManager = new config_1.ConfigManager();
        const result = await performanceMonitor.benchmark(async () => {
            await configManager.loadConfig();
        }, {
            name: 'config-loading',
            iterations: 50,
            warmupIterations: 10,
            timeout: 10000,
            collectGC: false, // Config loading should be lightweight
        });
        expect(result.iterations).toBe(50);
        expect(result.averageDuration).toBeGreaterThan(0);
        // Configuration loading should be very fast
        expect(result.averageDuration).toBeLessThan(100); // Should complete in under 100ms
        expect(result.maxDuration).toBeLessThan(500); // No single run should take more than 500ms
    });
    it('should measure memory usage during operations', async () => {
        const configManager = new config_1.ConfigManager();
        const config = await configManager.loadConfig();
        const schemaDiscovery = new schema_discovery_1.SchemaDiscovery(config);
        performanceMonitor.start('memory-test', { testType: 'memory-monitoring' });
        // Perform memory-intensive operation
        await schemaDiscovery.findSchemas();
        const duration = performanceMonitor.end('memory-test');
        const metric = performanceMonitor.getMetric('memory-test');
        expect(duration).toBeGreaterThan(0);
        expect(metric).toBeDefined();
        expect(metric?.memory).toBeDefined();
        expect(metric?.memory?.heapUsed).toBeDefined();
        expect(metric?.context?.testType).toBe('memory-monitoring');
    });
    it('should save performance metrics to file', async () => {
        performanceMonitor.start('test-operation');
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100));
        performanceMonitor.end('test-operation');
        // This should not throw
        expect(() => {
            performanceMonitor.saveMetrics('test-metrics.json');
        }).not.toThrow();
    });
    it('should handle performance monitoring static methods', async () => {
        const result = await performance_monitor_1.PerformanceMonitor.measureAsync('async-test', async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'test-result';
        });
        expect(result).toBe('test-result');
        const syncResult = performance_monitor_1.PerformanceMonitor.measure('sync-test', () => {
            return 'sync-result';
        });
        expect(syncResult).toBe('sync-result');
    });
    it('should provide performance recommendations', () => {
        // Create a mock slow operation
        performanceMonitor.start('slow-operation');
        performanceMonitor.metrics.set('slow-operation', {
            name: 'slow-operation',
            startTime: 0,
            endTime: 3000,
            duration: 3000,
        });
        const report = performanceMonitor.getReport();
        expect(report).toContain('Performance Tips:');
        expect(report).toContain('slow-operation');
    });
    // Regression tests - these should fail if performance significantly degrades
    describe('Performance Regression Tests', () => {
        it('should not regress in schema discovery time', async () => {
            const configManager = new config_1.ConfigManager();
            const config = await configManager.loadConfig();
            const schemaDiscovery = new schema_discovery_1.SchemaDiscovery(config);
            const startTime = performance.now();
            await schemaDiscovery.findSchemas();
            const duration = performance.now() - startTime;
            // Baseline: small files should process quickly
            expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
        });
        it('should not regress in memory usage', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            const configManager = new config_1.ConfigManager();
            await configManager.loadConfig();
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            // Config loading should not use excessive memory
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
        });
    });
});
//# sourceMappingURL=benchmarks.test.js.map