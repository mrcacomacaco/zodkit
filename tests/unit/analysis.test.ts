/**
 * @fileoverview Unit Tests for Analysis System
 * @module AnalysisTests
 */

import { Analyzer } from '../../src/core/analysis';
import { z } from 'zod';

describe('Analyzer', () => {
  let analyzer: Analyzer;

  beforeEach(() => {
    analyzer = new Analyzer();
  });

  describe('Schema Complexity Analysis', () => {
    it('should analyze simple object schema', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
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
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              level4: z.object({
                deep: z.string()
              })
            })
          })
        })
      });

      const result = await analyzer.analyze(schema, { mode: 'complexity' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'deep-nesting'
        })
      );
      expect(result.suggestions).toContain('Consider flattening nested schemas');
    });

    it('should detect complex unions', async () => {
      const schema = z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.object({ type: z.literal('object') }),
        z.null(),
        z.undefined()
      ]);

      const result = await analyzer.analyze(schema, { mode: 'complexity' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'complex-union'
        })
      );
      expect(result.suggestions).toContain('Consider using discriminated unions');
    });
  });

  describe('Rule Analysis', () => {
    it('should detect z.any() usage', async () => {
      const schema = z.any();

      const result = await analyzer.analyze(schema, { mode: 'rules' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'no-any'
        })
      );
    });

    it('should detect missing descriptions', async () => {
      const schema = z.string();

      const result = await analyzer.analyze(schema, { mode: 'rules' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'require-description'
        })
      );
    });

    it('should detect missing min constraints on numbers', async () => {
      const schema = z.number();

      const result = await analyzer.analyze(schema, { mode: 'rules' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'min-value'
        })
      );
    });
  });

  describe('API Analysis', () => {
    it('should analyze API naming conventions', async () => {
      const schema = z.object({
        'invalidName!': z.string(),
        'another-bad-name': z.string(),
        validName: z.string(),
        valid_snake_case: z.string()
      });

      const result = await analyzer.analyze(schema, { mode: 'api' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'api-naming'
        })
      );
    });

    it('should detect too many required fields', async () => {
      const fields: Record<string, z.ZodString> = {};
      for (let i = 0; i < 15; i++) {
        fields[`field${i}`] = z.string();
      }
      const schema = z.object(fields);

      const result = await analyzer.analyze(schema, { mode: 'api' });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'too-many-required'
        })
      );
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

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          rule: 'high-null-ratio'
        })
      );
      expect(result.suggestions).toContain('Consider using optional fields instead of nulls');
    });
  });

  describe('Hints Analysis', () => {
    it('should suggest splitting large schemas', async () => {
      const fields: Record<string, z.ZodString> = {};
      for (let i = 0; i < 60; i++) {
        fields[`field${i}`] = z.string();
      }
      const schema = z.object(fields);

      const result = await analyzer.analyze(schema, { mode: 'hints' });

      expect(result.suggestions).toContain('Consider splitting large schemas into smaller modules');
    });
  });

  describe('Full Analysis', () => {
    it('should perform comprehensive analysis', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email()
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
      const schema = z.any();

      const result = await analyzer.analyze(schema, {
        mode: 'full',
        autoFix: true
      });

      expect(result.fixes).toBeDefined();
      expect(Array.isArray(result.fixes)).toBe(true);
    });
  });
});