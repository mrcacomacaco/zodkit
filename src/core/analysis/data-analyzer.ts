/**
 * @fileoverview Advanced Data Analyzer for pattern recognition and schema inference
 * @module DataAnalyzer
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { DataAnalysis, PatternInfo, AnalysisStats } from './schema-generator';

export interface AnalysisOptions {
  detectPatterns?: boolean;
  inferTypes?: boolean;
  findOptionalFields?: boolean;
  detectArrayPatterns?: boolean;
  analyzeComplexity?: boolean;
  context?: string;
}

export interface LearningOptions {
  recursive?: boolean;
  fileTypes?: string[];
  extractJSON?: boolean;
  patternRecognition?: boolean;
  temporalAnalysis?: boolean;
}

export interface ExtractedPattern {
  name: string;
  confidence: number;
  occurrences: number;
  structure: Record<string, any>;
  examples: any[];
}

export class DataAnalyzer {
  // @ts-ignore: Reserved for future pattern analysis features
  private readonly patterns = new Map<string, PatternInfo>();
  // @ts-ignore: Reserved for future type frequency analysis
  private readonly typeFrequency = new Map<string, number>();

  async analyzeData(data: any, options: AnalysisOptions = {}): Promise<DataAnalysis> {
    const samples = Array.isArray(data) ? data : [data];
    const structure = this.extractStructure(samples);
    const patterns = await this.detectPatterns(samples, options);
    const statistics = this.calculateStatistics(samples, structure);

    return {
      type: this.inferDataType(structure),
      structure,
      patterns,
      statistics,
      samples: samples.slice(0, 10) // Limit samples for performance
    };
  }

  async learnFromPath(path: string, options: LearningOptions = {}): Promise<ExtractedPattern[]> {
    const patterns: ExtractedPattern[] = [];
    const files = this.findFiles(path, options);

    for (const file of files) {
      try {
        const filePatterns = await this.analyzeFile(file, options);
        patterns.push(...filePatterns);
      } catch (error) {
        // Skip files that can't be analyzed
        continue;
      }
    }

    // Merge similar patterns
    return this.mergePatterns(patterns);
  }

  async extractJSONFromText(text: string): Promise<any[]> {
    const jsonObjects: any[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Try to extract JSON from log lines
      const jsonMatches = trimmed.match(/\{.*\}/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            jsonObjects.push(parsed);
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Try to parse entire line as JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          jsonObjects.push(parsed);
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return jsonObjects;
  }

  private extractStructure(samples: any[]): Record<string, any> {
    if (samples.length === 0) {
      return {};
    }

    // Start with first sample as base structure
    const structure = this.deepClone(samples[0]);

    // Merge information from other samples
    for (let i = 1; i < samples.length; i++) {
      this.mergeStructures(structure, samples[i]);
    }

    return structure;
  }

  private async detectPatterns(samples: any[], options: AnalysisOptions): Promise<PatternInfo[]> {
    const patterns: PatternInfo[] = [];

    if (!options.detectPatterns) {
      return patterns;
    }

    // Detect string patterns
    const stringPattern = this.detectStringPatterns(samples);
    if (stringPattern) {
      patterns.push(stringPattern);
    }

    // Detect enum patterns
    const enumPattern = this.detectEnumPatterns(samples);
    if (enumPattern) {
      patterns.push(enumPattern);
    }

    // Detect array patterns
    if (options.detectArrayPatterns) {
      const arrayPattern = this.detectArrayPatterns(samples);
      if (arrayPattern) {
        patterns.push(arrayPattern);
      }
    }

    // Detect object structure patterns
    const objectPattern = this.detectObjectPatterns(samples);
    if (objectPattern) {
      patterns.push(objectPattern);
    }

    return patterns;
  }

  private detectStringPatterns(samples: any[]): PatternInfo | null {
    const stringValues: string[] = [];

    this.collectValues(samples, stringValues, 'string');

    if (stringValues.length === 0) {
      return null;
    }

    // Detect common string patterns
    const emailCount = stringValues.filter(s => this.isEmail(s)).length;
    const urlCount = stringValues.filter(s => this.isURL(s)).length;
    const uuidCount = stringValues.filter(s => this.isUUID(s)).length;
    const dateCount = stringValues.filter(s => this.isDate(s)).length;

    const total = stringValues.length;

    if (emailCount / total > 0.8) {
      return {
        type: 'email',
        confidence: emailCount / total,
        examples: stringValues.filter(s => this.isEmail(s)).slice(0, 3),
        constraints: ['email()']
      };
    }

    if (urlCount / total > 0.8) {
      return {
        type: 'url',
        confidence: urlCount / total,
        examples: stringValues.filter(s => this.isURL(s)).slice(0, 3),
        constraints: ['url()']
      };
    }

    if (uuidCount / total > 0.8) {
      return {
        type: 'uuid',
        confidence: uuidCount / total,
        examples: stringValues.filter(s => this.isUUID(s)).slice(0, 3),
        constraints: ['uuid()']
      };
    }

    if (dateCount / total > 0.8) {
      return {
        type: 'datetime',
        confidence: dateCount / total,
        examples: stringValues.filter(s => this.isDate(s)).slice(0, 3),
        constraints: ['datetime()']
      };
    }

    return null;
  }

  private detectEnumPatterns(samples: any[]): PatternInfo | null {
    const stringValues: string[] = [];
    this.collectValues(samples, stringValues, 'string');

    if (stringValues.length === 0) {
      return null;
    }

    // Count unique values
    const valueCounts = new Map<string, number>();
    stringValues.forEach(value => {
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    });

    const uniqueValues = Array.from(valueCounts.keys());

    // Consider it an enum if we have few unique values relative to total
    if (uniqueValues.length <= 10 && uniqueValues.length < stringValues.length * 0.1) {
      return {
        type: 'string-enum',
        confidence: 1 - (uniqueValues.length / stringValues.length),
        examples: uniqueValues.slice(0, 5),
        constraints: [`enum([${uniqueValues.map(v => `'${v}'`).join(', ')}])`]
      };
    }

    return null;
  }

  private detectArrayPatterns(samples: any[]): PatternInfo | null {
    const arrays: any[][] = [];
    this.collectValues(samples, arrays, 'array');

    if (arrays.length === 0) {
      return null;
    }

    // Analyze array element types
    const elementTypes = new Set<string>();
    let totalElements = 0;

    arrays.forEach(arr => {
      arr.forEach(element => {
        elementTypes.add(typeof element);
        totalElements++;
      });
    });

    if (elementTypes.size === 1) {
      const elementType = Array.from(elementTypes)[0];
      return {
        type: 'homogeneous-array',
        confidence: 1.0,
        examples: arrays.slice(0, 2).map(arr => arr.slice(0, 3)).flat() as string[],
        constraints: [`array(z.${elementType}())`]
      };
    }

    return {
      type: 'mixed-array',
      confidence: 0.7,
      examples: arrays.slice(0, 2).map(arr => arr.slice(0, 3)).flat() as string[],
      constraints: ['array(z.unknown())']
    };
  }

  private detectObjectPatterns(samples: any[]): PatternInfo | null {
    if (!Array.isArray(samples) || samples.length === 0) {
      return null;
    }

    const keyFrequency = new Map<string, number>();
    let objectCount = 0;

    samples.forEach(sample => {
      if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
        objectCount++;
        Object.keys(sample).forEach(key => {
          keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
        });
      }
    });

    if (objectCount === 0) {
      return null;
    }

    const commonKeys = Array.from(keyFrequency.entries())
      .filter(([_, count]) => count / objectCount > 0.5)
      .map(([key]) => key);

    return {
      type: 'object-structure',
      confidence: commonKeys.length / keyFrequency.size,
      examples: commonKeys.slice(0, 5),
      constraints: [`object with common keys: ${commonKeys.join(', ')}`]
    };
  }

  private calculateStatistics(samples: any[], _structure: Record<string, any>): AnalysisStats {
    const uniqueKeys = new Set<string>();
    let totalDepth = 0;
    let nullCount = 0;
    let totalValues = 0;

    const calculateDepth = (obj: any, depth = 0): number => {
      if (typeof obj !== 'object' || obj === null) {
        return depth;
      }

      let maxDepth = depth;
      Object.values(obj).forEach(value => {
        const valueDepth = calculateDepth(value, depth + 1);
        maxDepth = Math.max(maxDepth, valueDepth);
      });

      return maxDepth;
    };

    const collectStats = (obj: any) => {
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        Object.keys(obj).forEach(key => uniqueKeys.add(key));
        Object.values(obj).forEach(value => {
          totalValues++;
          if (value === null || value === undefined) {
            nullCount++;
          }
          if (typeof value === 'object') {
            collectStats(value);
          }
        });
      }
    };

    samples.forEach(sample => {
      totalDepth += calculateDepth(sample);
      collectStats(sample);
    });

    const complexity = uniqueKeys.size + (totalDepth / samples.length) * 2;

    return {
      sampleCount: samples.length,
      uniqueKeys: uniqueKeys.size,
      avgDepth: totalDepth / samples.length,
      complexity,
      nullabilityRatio: totalValues > 0 ? nullCount / totalValues : 0
    };
  }

  private findFiles(path: string, options: LearningOptions): string[] {
    const files: string[] = [];
    const allowedExtensions = options.fileTypes || ['.json', '.log', '.txt'];

    const traverse = (currentPath: string) => {
      try {
        const items = readdirSync(currentPath);

        for (const item of items) {
          const fullPath = join(currentPath, item);
          const stat = statSync(fullPath);

          if (stat.isDirectory() && options.recursive) {
            traverse(fullPath);
          } else if (stat.isFile()) {
            const hasAllowedExtension = allowedExtensions.some(ext =>
              fullPath.toLowerCase().endsWith(ext)
            );
            if (hasAllowedExtension) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    traverse(path);
    return files;
  }

  private async analyzeFile(filePath: string, options: LearningOptions): Promise<ExtractedPattern[]> {
    const content = readFileSync(filePath, 'utf-8');
    const patterns: ExtractedPattern[] = [];

    if (filePath.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        const analysis = await this.analyzeData(data, { detectPatterns: true });

        patterns.push({
          name: this.getFileBaseName(filePath),
          confidence: 0.9,
          occurrences: 1,
          structure: analysis.structure,
          examples: analysis.samples
        });
      } catch {
        // Skip invalid JSON files
      }
    } else if (options.extractJSON) {
      const extractedJSON = await this.extractJSONFromText(content);
      if (extractedJSON.length > 0) {
        const analysis = await this.analyzeData(extractedJSON, { detectPatterns: true });

        patterns.push({
          name: `${this.getFileBaseName(filePath)}_extracted`,
          confidence: 0.7,
          occurrences: extractedJSON.length,
          structure: analysis.structure,
          examples: analysis.samples
        });
      }
    }

    return patterns;
  }

  private mergePatterns(patterns: ExtractedPattern[]): ExtractedPattern[] {
    const merged = new Map<string, ExtractedPattern>();

    patterns.forEach(pattern => {
      const key = this.generatePatternKey(pattern.structure);

      if (merged.has(key)) {
        const existing = merged.get(key)!;
        existing.occurrences += pattern.occurrences;
        existing.confidence = Math.max(existing.confidence, pattern.confidence);
        existing.examples.push(...pattern.examples);
      } else {
        merged.set(key, { ...pattern });
      }
    });

    return Array.from(merged.values());
  }

  private generatePatternKey(structure: Record<string, any>): string {
    // Create a stable key based on structure shape
    const keys = Object.keys(structure).sort();
    return keys.join('|');
  }

  private getFileBaseName(filePath: string): string {
    return filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
  }

  private collectValues(data: any, collector: any[], type: string): void {
    if (Array.isArray(data)) {
      data.forEach(item => this.collectValues(item, collector, type));
    } else if (typeof data === 'object' && data !== null) {
      Object.values(data).forEach(value => this.collectValues(value, collector, type));
    } else if (typeof data === type || (type === 'array' && Array.isArray(data))) {
      if (type === 'array' && Array.isArray(data)) {
        collector.push(data);
      } else if (type !== 'array') {
        collector.push(data);
      }
    }
  }

  private mergeStructures(target: any, source: any): void {
    if (typeof target !== 'object' || typeof source !== 'object') {
      return;
    }

    if (target === null || source === null) {
      return;
    }

    Object.keys(source).forEach(key => {
      if (!(key in target)) {
        target[key] = source[key];
      } else if (typeof target[key] === 'object' && typeof source[key] === 'object') {
        this.mergeStructures(target[key], source[key]);
      }
    });
  }

  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned: any = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = this.deepClone(obj[key]);
    });

    return cloned;
  }

  private inferDataType(structure: Record<string, any>): string {
    if (Array.isArray(structure)) {
      return 'array';
    }

    if (typeof structure === 'object' && structure !== null) {
      return 'object';
    }

    return typeof structure;
  }

  // Pattern recognition helpers
  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isURL(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  private isUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !isNaN(Date.parse(value));
  }
}