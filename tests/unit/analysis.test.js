"use strict";
/**
 * @fileoverview Unit Tests for Analysis System
 * @module AnalysisTests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const analysis_1 = require("../../src/core/analysis");
const zod_1 = require("zod");
describe('Analyzer', () => {
    let analyzer;
    beforeEach(() => {
        analyzer = new analysis_1.Analyzer();
    });
    describe('Schema Complexity Analysis', () => {
        it('should analyze simple object schema', async () => {
            const schema = zod_1.z.object({
                name: zod_1.z.string(),
                age: zod_1.z.number()
            });
            const result = await analyzer.analyze(schema, { mode: 'complexity' });
            expect(result).toBeDefined();
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.level).toBe('low');
            expect(result.metrics).toHaveProperty('complexity');
            expect(result.metrics).toHaveProperty('depth');
            expect(result.metrics).toHaveProperty('fields');
        });
        it('should detect deep nesting', async () => {
            const schema = zod_1.z.object({
                level1: zod_1.z.object({
                    level2: zod_1.z.object({
                        level3: zod_1.z.object({
                            level4: zod_1.z.object({
                                deep: zod_1.z.string()
                            })
                        })
                    })
                })
            });
            const result = await analyzer.analyze(schema, { mode: 'complexity' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'deep-nesting'
            }));
            expect(result.suggestions).toContain('Consider flattening nested schemas');
        });
        it('should detect complex unions', async () => {
            const schema = zod_1.z.union([
                zod_1.z.string(),
                zod_1.z.number(),
                zod_1.z.boolean(),
                zod_1.z.array(zod_1.z.string()),
                zod_1.z.object({ type: zod_1.z.literal('object') }),
                zod_1.z.null(),
                zod_1.z.undefined()
            ]);
            const result = await analyzer.analyze(schema, { mode: 'complexity' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'complex-union'
            }));
            expect(result.suggestions).toContain('Consider using discriminated unions');
        });
    });
    describe('Rule Analysis', () => {
        it('should detect z.any() usage', async () => {
            const schema = zod_1.z.any();
            const result = await analyzer.analyze(schema, { mode: 'rules' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'no-any'
            }));
        });
        it('should detect missing descriptions', async () => {
            const schema = zod_1.z.string();
            const result = await analyzer.analyze(schema, { mode: 'rules' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'require-description'
            }));
        });
        it('should detect missing min constraints on numbers', async () => {
            const schema = zod_1.z.number();
            const result = await analyzer.analyze(schema, { mode: 'rules' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'min-value'
            }));
        });
    });
    describe('API Analysis', () => {
        it('should analyze API naming conventions', async () => {
            const schema = zod_1.z.object({
                'invalidName!': zod_1.z.string(),
                'another-bad-name': zod_1.z.string(),
                validName: zod_1.z.string(),
                valid_snake_case: zod_1.z.string()
            });
            const result = await analyzer.analyze(schema, { mode: 'api' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'api-naming'
            }));
        });
        it('should detect too many required fields', async () => {
            const fields = {};
            for (let i = 0; i < 15; i++) {
                fields[`field${i}`] = zod_1.z.string();
            }
            const schema = zod_1.z.object(fields);
            const result = await analyzer.analyze(schema, { mode: 'api' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'too-many-required'
            }));
        });
    });
    describe('Data Analysis', () => {
        it('should analyze data patterns', async () => {
            const data = {
                field1: null,
                field2: null,
                field3: 'value',
                field4: null
            };
            const result = await analyzer.analyze(data, { mode: 'data' });
            expect(result.issues).toContainEqual(expect.objectContaining({
                rule: 'high-null-ratio'
            }));
            expect(result.suggestions).toContain('Consider using optional fields instead of nulls');
        });
    });
    describe('Hints Analysis', () => {
        it('should suggest splitting large schemas', async () => {
            const fields = {};
            for (let i = 0; i < 60; i++) {
                fields[`field${i}`] = zod_1.z.string();
            }
            const schema = zod_1.z.object(fields);
            const result = await analyzer.analyze(schema, { mode: 'hints' });
            expect(result.suggestions).toContain('Consider splitting large schemas into smaller modules');
        });
    });
    describe('Full Analysis', () => {
        it('should perform comprehensive analysis', async () => {
            const schema = zod_1.z.object({
                name: zod_1.z.string(),
                age: zod_1.z.number(),
                email: zod_1.z.string().email()
            });
            const result = await analyzer.analyze(schema, { mode: 'full' });
            expect(result).toBeDefined();
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.level).toMatch(/^(low|medium|high|extreme)$/);
            expect(Array.isArray(result.issues)).toBe(true);
            expect(Array.isArray(result.suggestions)).toBe(true);
            expect(typeof result.metrics).toBe('object');
        });
        it('should generate fixes when requested', async () => {
            const schema = zod_1.z.any();
            const result = await analyzer.analyze(schema, {
                mode: 'full',
                autoFix: true
            });
            expect(result.fixes).toBeDefined();
            expect(Array.isArray(result.fixes)).toBe(true);
        });
    });
});
//# sourceMappingURL=analysis.test.js.map