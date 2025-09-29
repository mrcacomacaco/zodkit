import * as pc from 'picocolors';
// @ts-ignore: Reserved for future schema validation
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
// @ts-ignore: Reserved for future use
// import { existsSync, join } from 'fs' and 'path';
import fg from 'fast-glob';

export interface RefactoringOptions {
  dryRun?: boolean;
  backup?: boolean;
  aggressive?: boolean;
  preserveComments?: boolean;
  targetFrameworks?: string[];
  includeTests?: boolean;
  analyzeUsage?: boolean;
  confidence?: 'low' | 'medium' | 'high';
}

export interface SchemaUsage {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  context: string;
  usageType: 'validation' | 'type' | 'inference' | 'transformation';
  isImported: boolean;
  importAlias?: string;
  confidence: number;
}

export interface RefactoringImpact {
  affectedFiles: string[];
  usageLocations: SchemaUsage[];
  breakingChanges: BreakingChange[];
  compatibilityScore: number;
  migrationComplexity: 'low' | 'medium' | 'high';
  estimatedEffort: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface BreakingChange {
  type: 'property_removed' | 'property_required' | 'type_changed' | 'constraint_added' | 'structure_changed';
  description: string;
  location: string;
  severity: 'minor' | 'major' | 'critical';
  migration: string;
  autoFixable: boolean;
}

export interface RefactoringSuggestion {
  id: string;
  title: string;
  description: string;
  category: 'performance' | 'maintainability' | 'type_safety' | 'consistency' | 'modernization';
  impact: RefactoringImpact;
  beforeCode: string;
  afterCode: string;
  benefits: string[];
  risks: string[];
  autoApplicable: boolean;
  confidence: number;
  estimatedSavings?: {
    performance?: string;
    maintainability?: string;
    bundleSize?: string;
  };
}

export interface RefactoringResult {
  applied: RefactoringSuggestion[];
  skipped: RefactoringSuggestion[];
  errors: RefactoringError[];
  summary: {
    filesModified: number;
    schemasOptimized: number;
    performanceImprovement: string;
    maintainabilityScore: number;
  };
}

export interface RefactoringError {
  suggestion: string;
  error: string;
  filePath?: string;
  lineNumber?: number;
  severity: 'warning' | 'error';
  resolution?: string;
}

export class SchemaRefactoringAssistant {
  private readonly projectRoot: string;
  // @ts-ignore: _schemaPatterns reserved for future pattern matching optimization
  private readonly _schemaPatterns: RegExp[];
  private readonly usageCache: Map<string, SchemaUsage[]>;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this._schemaPatterns = [
      /z\.[a-zA-Z]+\(/g,
      /\.parse\(/g,
      /\.safeParse\(/g,
      /\.parseAsync\(/g,
      /\.safeParseAsync\(/g,
      /\.infer<typeof/g,
      /Schema\s*=/g
    ];
    this.usageCache = new Map();
  }

  async analyzeSchemaUsage(schemaPath: string, options: RefactoringOptions = {}): Promise<SchemaUsage[]> {
    const cacheKey = `${schemaPath}-${JSON.stringify(options)}`;
    if (this.usageCache.has(cacheKey)) {
      return this.usageCache.get(cacheKey)!;
    }

    const usages: SchemaUsage[] = [];
    const schemaContent = readFileSync(schemaPath, 'utf-8');
    const schemaExports = this.extractSchemaExports(schemaContent);

    // Find all TypeScript/JavaScript files that might use this schema
    const sourceFiles = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: this.projectRoot,
      absolute: true,
      ignore: ['node_modules/**', '**/*.d.ts', 'dist/**', 'build/**']
    });

    for (const filePath of sourceFiles) {
      if (filePath === schemaPath) continue;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const fileUsages = this.findSchemaUsagesInFile(
          content,
          filePath,
          schemaExports,
          schemaPath
        );
        usages.push(...fileUsages);
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    this.usageCache.set(cacheKey, usages);
    return usages;
  }

  async generateRefactoringSuggestions(
    schemaPath: string,
    options: RefactoringOptions = {}
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    const schemaContent = readFileSync(schemaPath, 'utf-8');
    const usage = await this.analyzeSchemaUsage(schemaPath, options);

    // Performance optimizations
    suggestions.push(...await this.suggestPerformanceOptimizations(schemaContent, schemaPath, usage));

    // Type safety improvements
    suggestions.push(...await this.suggestTypeSafetyImprovements(schemaContent, schemaPath, usage));

    // Maintainability enhancements
    suggestions.push(...await this.suggestMaintainabilityImprovements(schemaContent, schemaPath, usage));

    // Consistency improvements
    suggestions.push(...await this.suggestConsistencyImprovements(schemaContent, schemaPath, usage));

    // Modernization suggestions
    suggestions.push(...await this.suggestModernizationImprovements(schemaContent, schemaPath, usage));

    // Filter by confidence level
    const minConfidence = this.getMinConfidenceThreshold(options.confidence || 'medium');
    return suggestions.filter(s => s.confidence >= minConfidence);
  }

  async applyRefactoringSuggestions(
    suggestions: RefactoringSuggestion[],
    options: RefactoringOptions = {}
  ): Promise<RefactoringResult> {
    const result: RefactoringResult = {
      applied: [],
      skipped: [],
      errors: [],
      summary: {
        filesModified: 0,
        schemasOptimized: 0,
        performanceImprovement: '0%',
        maintainabilityScore: 0
      }
    };

    if (options.dryRun) {
      console.log(pc.yellow('🎭 Dry run mode - no files will be modified'));
    }

    for (const suggestion of suggestions) {
      try {
        if (!suggestion.autoApplicable && !options.aggressive) {
          result.skipped.push(suggestion);
          continue;
        }

        if (suggestion.impact.riskLevel === 'high' && !options.aggressive) {
          result.skipped.push(suggestion);
          continue;
        }

        if (!options.dryRun) {
          await this.applySingleSuggestion(suggestion, options);
        }

        result.applied.push(suggestion);
      } catch (error) {
        result.errors.push({
          suggestion: suggestion.id,
          error: error instanceof Error ? error.message : String(error),
          severity: 'error'
        });
      }
    }

    // Calculate summary
    result.summary = this.calculateRefactoringSummary(result.applied);

    return result;
  }

  async analyzeMigrationImpact(
    fromSchema: string,
    toSchema: string,
    options: RefactoringOptions = {}
  ): Promise<RefactoringImpact> {
    const fromPath = resolve(fromSchema);
    const toPath = resolve(toSchema);

    const fromContent = readFileSync(fromPath, 'utf-8');
    const toContent = readFileSync(toPath, 'utf-8');

    const fromStructure = this.parseSchemaStructure(fromContent);
    const toStructure = this.parseSchemaStructure(toContent);

    const breakingChanges = this.identifyBreakingChanges(fromStructure, toStructure);
    const usageLocations = await this.analyzeSchemaUsage(fromPath, options);

    const compatibilityScore = this.calculateCompatibilityScore(breakingChanges, usageLocations);
    const migrationComplexity = this.assessMigrationComplexity(breakingChanges, usageLocations);
    const riskLevel = this.assessRiskLevel(breakingChanges, usageLocations);

    return {
      affectedFiles: [...new Set(usageLocations.map(u => u.filePath))],
      usageLocations,
      breakingChanges,
      compatibilityScore,
      migrationComplexity,
      estimatedEffort: this.estimateEffort(breakingChanges, usageLocations),
      riskLevel
    };
  }

  private extractSchemaExports(content: string): string[] {
    const exports: string[] = [];
    const exportMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+)\s*=/g);

    for (const match of exportMatches) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  private findSchemaUsagesInFile(
    content: string,
    filePath: string,
    schemaExports: string[],
    schemaPath: string
  ): SchemaUsage[] {
    const usages: SchemaUsage[] = [];
    const lines = content.split('\n');

    // Check for imports
    const importPattern = new RegExp(`import\\s+.*\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"]`, 'g');
    let importMatch;
    const importedSchemas = new Set<string>();

    while ((importMatch = importPattern.exec(content)) !== null) {
      const imports = (importMatch[1] || '').split(',').map(i => i.trim());
      const importPath = importMatch[2] || '';

      if (importPath && this.resolveImportPath(importPath, filePath) === schemaPath) {
        imports.forEach(imp => {
          const cleanImport = imp.replace(/\s+as\s+\w+/, '').trim();
          if (schemaExports.includes(cleanImport)) {
            importedSchemas.add(cleanImport);
          }
        });
      }
    }

    // Find usages of imported schemas
    lines.forEach((line, lineIndex) => {
      for (const schema of importedSchemas) {
        if (line.includes(schema)) {
          const columnIndex = line.indexOf(schema);
          const usageType = this.determineUsageType(line, schema);

          usages.push({
            filePath,
            lineNumber: lineIndex + 1,
            columnNumber: columnIndex + 1,
            context: line.trim(),
            usageType,
            isImported: true,
            confidence: this.calculateUsageConfidence(line, schema, usageType)
          });
        }
      }
    });

    return usages;
  }

  private async suggestPerformanceOptimizations(
    content: string,
    schemaPath: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Suggest lazy schemas for rarely used complex objects
    if (this.hasComplexNestedSchemas(content) && this.isRarelyUsed(usage)) {
      suggestions.push({
        id: 'lazy-schema-optimization',
        title: 'Convert to Lazy Schema',
        description: 'Convert complex nested schemas to lazy schemas for better performance',
        category: 'performance',
        impact: await this.calculateImpact(schemaPath, 'lazy-conversion', usage),
        beforeCode: this.extractComplexSchemas(content),
        afterCode: this.generateLazySchemaVersion(content),
        benefits: [
          'Reduced initial bundle size',
          'Faster schema compilation',
          'Better memory usage'
        ],
        risks: ['Potential runtime performance impact for frequent validation'],
        autoApplicable: true,
        confidence: 0.8,
        estimatedSavings: {
          performance: '15-30% faster compilation',
          bundleSize: '5-15% reduction'
        }
      });
    }

    // Suggest schema caching for frequently used schemas
    if (this.isFrequentlyUsed(usage)) {
      suggestions.push({
        id: 'schema-caching',
        title: 'Add Schema Caching',
        description: 'Cache compiled schemas for frequently used validation',
        category: 'performance',
        impact: await this.calculateImpact(schemaPath, 'caching', usage),
        beforeCode: this.extractValidationCalls(content),
        afterCode: this.generateCachedValidationVersion(content),
        benefits: [
          'Faster validation for repeated use',
          'Reduced CPU usage',
          'Better scalability'
        ],
        risks: ['Increased memory usage'],
        autoApplicable: true,
        confidence: 0.9,
        estimatedSavings: {
          performance: '40-70% faster validation'
        }
      });
    }

    return suggestions;
  }

  private async suggestTypeSafetyImprovements(
    content: string,
    schemaPath: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Suggest stricter types
    if (this.hasLooseTypes(content)) {
      suggestions.push({
        id: 'stricter-types',
        title: 'Add Stricter Type Constraints',
        description: 'Replace loose types with more specific constraints',
        category: 'type_safety',
        impact: await this.calculateImpact(schemaPath, 'stricter-types', usage),
        beforeCode: this.extractLooseTypes(content),
        afterCode: this.generateStricterTypes(content),
        benefits: [
          'Better runtime validation',
          'Clearer API contracts',
          'Fewer runtime errors'
        ],
        risks: ['Potential breaking changes for existing data'],
        autoApplicable: false,
        confidence: 0.7
      });
    }

    // Suggest branded types for better type safety
    if (this.canUseBrandedTypes(content)) {
      suggestions.push({
        id: 'branded-types',
        title: 'Use Branded Types',
        description: 'Add branded types for better compile-time safety',
        category: 'type_safety',
        impact: await this.calculateImpact(schemaPath, 'branded-types', usage),
        beforeCode: this.extractStringTypes(content),
        afterCode: this.generateBrandedTypes(content),
        benefits: [
          'Compile-time type safety',
          'Prevention of type confusion',
          'Better IDE support'
        ],
        risks: ['Requires TypeScript updates'],
        autoApplicable: true,
        confidence: 0.85
      });
    }

    return suggestions;
  }

  private async suggestMaintainabilityImprovements(
    content: string,
    schemaPath: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Suggest schema composition for repeated patterns
    if (this.hasRepeatedPatterns(content)) {
      suggestions.push({
        id: 'schema-composition',
        title: 'Extract Common Schema Patterns',
        description: 'Extract repeated patterns into reusable schema components',
        category: 'maintainability',
        impact: await this.calculateImpact(schemaPath, 'composition', usage),
        beforeCode: this.extractRepeatedPatterns(content),
        afterCode: this.generateComposedSchemas(content),
        benefits: [
          'Reduced code duplication',
          'Easier maintenance',
          'Better consistency'
        ],
        risks: ['Increased complexity for simple cases'],
        autoApplicable: true,
        confidence: 0.75
      });
    }

    // Suggest better error messages
    if (this.hasGenericErrorMessages(content)) {
      suggestions.push({
        id: 'custom-error-messages',
        title: 'Add Custom Error Messages',
        description: 'Add descriptive error messages for better debugging',
        category: 'maintainability',
        impact: await this.calculateImpact(schemaPath, 'error-messages', usage),
        beforeCode: this.extractGenericValidations(content),
        afterCode: this.generateCustomErrorMessages(content),
        benefits: [
          'Better developer experience',
          'Faster debugging',
          'Clearer validation feedback'
        ],
        risks: ['Slightly larger bundle size'],
        autoApplicable: true,
        confidence: 0.9
      });
    }

    return suggestions;
  }

  private async suggestConsistencyImprovements(
    content: string,
    schemaPath: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Suggest consistent naming conventions
    if (this.hasInconsistentNaming(content)) {
      suggestions.push({
        id: 'consistent-naming',
        title: 'Standardize Naming Conventions',
        description: 'Apply consistent naming patterns across schemas',
        category: 'consistency',
        impact: await this.calculateImpact(schemaPath, 'naming', usage),
        beforeCode: this.extractInconsistentNames(content),
        afterCode: this.generateConsistentNames(content),
        benefits: [
          'Better code readability',
          'Easier navigation',
          'Team consistency'
        ],
        risks: ['Breaking changes to imports'],
        autoApplicable: false,
        confidence: 0.8
      });
    }

    return suggestions;
  }

  private async suggestModernizationImprovements(
    content: string,
    schemaPath: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Suggest modern Zod features
    if (this.usesLegacyPatterns(content)) {
      suggestions.push({
        id: 'modernize-zod',
        title: 'Use Modern Zod Features',
        description: 'Update to use latest Zod features and patterns',
        category: 'modernization',
        impact: await this.calculateImpact(schemaPath, 'modernization', usage),
        beforeCode: this.extractLegacyPatterns(content),
        afterCode: this.generateModernPatterns(content),
        benefits: [
          'Better performance',
          'Improved type inference',
          'Future compatibility'
        ],
        risks: ['Requires Zod version update'],
        autoApplicable: true,
        confidence: 0.85
      });
    }

    return suggestions;
  }

  // Helper methods for analysis
  private hasComplexNestedSchemas(content: string): boolean {
    return /z\.object\({[\s\S]*z\.object\({[\s\S]*}\)[\s\S]*}\)/.test(content);
  }

  private isRarelyUsed(usage: SchemaUsage[]): boolean {
    return usage.length < 5;
  }

  private isFrequentlyUsed(usage: SchemaUsage[]): boolean {
    return usage.length > 20;
  }

  private hasLooseTypes(content: string): boolean {
    return /z\.any\(\)|z\.unknown\(\)|z\.string\(\)(?!\.)/.test(content);
  }

  private canUseBrandedTypes(content: string): boolean {
    return /z\.string\(\)/.test(content) && /email|url|id|token/.test(content.toLowerCase());
  }

  private hasRepeatedPatterns(content: string): boolean {
    const patterns = content.match(/z\.[a-zA-Z]+\([^)]*\)/g) || [];
    const uniquePatterns = new Set(patterns);
    return patterns.length > uniquePatterns.size * 1.5;
  }

  private hasGenericErrorMessages(content: string): boolean {
    return !content.includes('.message(') && content.includes('z.');
  }

  private hasInconsistentNaming(content: string): boolean {
    const names = content.match(/(?:const|let|export)\s+(\w+Schema|\w+Validator)/g) || [];
    const hasSchema = names.some(name => name.includes('Schema'));
    const hasValidator = names.some(name => name.includes('Validator'));
    return hasSchema && hasValidator;
  }

  private usesLegacyPatterns(content: string): boolean {
    return /\.optional\(\)\.nullable\(\)/.test(content) || /\.transform\(/.test(content);
  }

  // Impact calculation helpers
  private async calculateImpact(
    _schemaPath: string,
    _changeType: string,
    usage: SchemaUsage[]
  ): Promise<RefactoringImpact> {
    return {
      affectedFiles: [...new Set(usage.map(u => u.filePath))],
      usageLocations: usage,
      breakingChanges: [],
      compatibilityScore: 0.9,
      migrationComplexity: 'low',
      estimatedEffort: '1-2 hours',
      riskLevel: 'low'
    };
  }

  // Code generation helpers
  private extractComplexSchemas(content: string): string {
    const match = content.match(/z\.object\({[\s\S]*z\.object\({[\s\S]*}\)[\s\S]*}\)/);
    return match ? match[0] : content.slice(0, 200);
  }

  private generateLazySchemaVersion(content: string): string {
    return content.replace(
      /z\.object\({([\s\S]*?)}\)/g,
      'z.lazy(() => z.object({$1}))'
    );
  }

  private extractValidationCalls(content: string): string {
    const matches = content.match(/\.parse\(.*?\)|\.safeParse\(.*?\)/g);
    return matches ? matches.join('\n') : '';
  }

  private generateCachedValidationVersion(content: string): string {
    return `const cachedSchema = ${content.match(/z\.[^;]+/)?.[0] || 'schema'};
export const validateWithCache = (data: unknown) => cachedSchema.parse(data);`;
  }

  private extractLooseTypes(content: string): string {
    const matches = content.match(/z\.any\(\)|z\.unknown\(\)|z\.string\(\)(?!\.)/g);
    return matches ? matches.join('\n') : '';
  }

  private generateStricterTypes(content: string): string {
    return content
      .replace(/z\.any\(\)/g, 'z.unknown()')
      .replace(/z\.string\(\)(?!\.)/g, 'z.string().min(1)')
      .replace(/z\.unknown\(\)/g, 'z.record(z.unknown())');
  }

  private extractStringTypes(content: string): string {
    const matches = content.match(/z\.string\(\)(?:\.[a-zA-Z()]+)*/g);
    return matches ? matches.join('\n') : '';
  }

  private generateBrandedTypes(content: string): string {
    return content
      .replace(/z\.string\(\)\.email\(\)/g, 'z.string().email().brand<"Email">()')
      .replace(/z\.string\(\)\.url\(\)/g, 'z.string().url().brand<"URL">()')
      .replace(/z\.string\(\)\.uuid\(\)/g, 'z.string().uuid().brand<"UUID">()');
  }

  private extractRepeatedPatterns(content: string): string {
    return content.slice(0, 300) + '...';
  }

  private generateComposedSchemas(content: string): string {
    return `// Common patterns extracted
const BaseEntity = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Composed schemas
${content}`;
  }

  private extractGenericValidations(content: string): string {
    const matches = content.match(/z\.[a-zA-Z]+\([^)]*\)(?!\.[a-zA-Z])/g);
    return matches ? matches.slice(0, 3).join('\n') : '';
  }

  private generateCustomErrorMessages(content: string): string {
    return content.replace(
      /z\.string\(\)/g,
      'z.string().message("Please provide a valid string")'
    ).replace(
      /z\.number\(\)/g,
      'z.number().message("Please provide a valid number")'
    );
  }

  private extractInconsistentNames(content: string): string {
    const matches = content.match(/(?:const|let|export)\s+\w+(?:Schema|Validator)/g);
    return matches ? matches.join('\n') : '';
  }

  private generateConsistentNames(content: string): string {
    return content.replace(/Validator/g, 'Schema');
  }

  private extractLegacyPatterns(content: string): string {
    const matches = content.match(/\.optional\(\)\.nullable\(\)|\.transform\([^)]+\)/g);
    return matches ? matches.join('\n') : '';
  }

  private generateModernPatterns(content: string): string {
    return content
      .replace(/\.optional\(\)\.nullable\(\)/g, '.nullish()')
      .replace(/\.transform\(/g, '.pipe(z.coerce.');
  }

  // Utility methods
  private resolveImportPath(importPath: string, fromFile: string): string {
    if (importPath.startsWith('.')) {
      return resolve(dirname(fromFile), importPath);
    }
    return importPath;
  }

  private determineUsageType(line: string, _schema: string): SchemaUsage['usageType'] {
    if (line.includes('.parse(') || line.includes('.safeParse(')) {
      return 'validation';
    }
    if (line.includes('z.infer<typeof')) {
      return 'type';
    }
    if (line.includes('.transform(') || line.includes('.pipe(')) {
      return 'transformation';
    }
    return 'inference';
  }

  private calculateUsageConfidence(line: string, schema: string, usageType: string): number {
    let confidence = 0.5;

    if (line.includes(schema + '.')) confidence += 0.3;
    if (line.includes('parse') || line.includes('infer')) confidence += 0.2;
    if (usageType === 'validation') confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private parseSchemaStructure(content: string): any {
    // Simplified schema structure parsing
    return { content, exports: this.extractSchemaExports(content) };
  }

  private identifyBreakingChanges(_from: any, _to: any): BreakingChange[] {
    // Simplified breaking change detection
    return [];
  }

  private calculateCompatibilityScore(changes: BreakingChange[], _usage: SchemaUsage[]): number {
    if (changes.length === 0) return 1.0;
    return Math.max(0, 1.0 - (changes.length * 0.1));
  }

  private assessMigrationComplexity(changes: BreakingChange[], usage: SchemaUsage[]): 'low' | 'medium' | 'high' {
    if (changes.length === 0) return 'low';
    if (changes.length < 5 && usage.length < 10) return 'medium';
    return 'high';
  }

  private assessRiskLevel(changes: BreakingChange[], usage: SchemaUsage[]): 'low' | 'medium' | 'high' {
    const criticalChanges = changes.filter(c => c.severity === 'critical').length;
    if (criticalChanges > 0) return 'high';
    if (changes.length > 5 || usage.length > 20) return 'medium';
    return 'low';
  }

  private estimateEffort(changes: BreakingChange[], usage: SchemaUsage[]): string {
    const hours = Math.max(1, changes.length * 0.5 + usage.length * 0.1);
    if (hours < 2) return '1-2 hours';
    if (hours < 8) return '2-8 hours';
    if (hours < 24) return '1-3 days';
    return '3+ days';
  }

  private getMinConfidenceThreshold(level: 'low' | 'medium' | 'high'): number {
    switch (level) {
      case 'low': return 0.3;
      case 'medium': return 0.6;
      case 'high': return 0.8;
      default: return 0.6;
    }
  }

  private async applySingleSuggestion(
    suggestion: RefactoringSuggestion,
    _options: RefactoringOptions
  ): Promise<void> {
    // Implementation would apply the actual code changes
    // This is a placeholder for the actual implementation
    console.log(pc.blue(`Applying: ${suggestion.title}`));
  }

  private calculateRefactoringSummary(applied: RefactoringSuggestion[]): RefactoringResult['summary'] {
    return {
      filesModified: new Set(applied.flatMap(s => s.impact.affectedFiles)).size,
      schemasOptimized: applied.length,
      performanceImprovement: applied.some(s => s.category === 'performance') ? '10-30%' : '0%',
      maintainabilityScore: Math.min(100, 50 + applied.length * 10)
    };
  }
}