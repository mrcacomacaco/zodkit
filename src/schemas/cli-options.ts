import { z } from 'zod';

// Generate command options schema
export const GenerateOptionsSchema = z.object({
  from: z.enum(['json', 'typescript', 'openapi']).optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  name: z.string().optional(),
  strict: z.boolean().optional(),
  config: z.string().optional(),
});

export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;

// Benchmark command options schema
export const BenchmarkOptionsSchema = z.object({
  iterations: z.string(),
  warmup: z.string(),
  gc: z.boolean(),
  save: z.boolean(),
  compare: z.string().optional(),
  test: z.string(),
  timeout: z.string(),
});

export type BenchmarkOptions = z.infer<typeof BenchmarkOptionsSchema>;

// Init command options schema
export const InitOptionsSchema = z.object({
  pm: z.enum(['pnpm', 'bun', 'yarn', 'npm']).optional(),
  editors: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  rules: z.enum(['strict', 'relaxed', 'custom']).optional(),
  targets: z.array(z.string()).optional(),
  config: z.string().optional(),
});

export type InitOptions = z.infer<typeof InitOptionsSchema>;

// Analyze command options schema
export const AnalyzeOptionsSchema = z.object({
  unused: z.boolean().optional(),
  duplicates: z.boolean().optional(),
  complexity: z.boolean().optional(),
  format: z.enum(['pretty', 'json']).optional(),
  output: z.string().optional(),
  config: z.string().optional(),
});

export type AnalyzeOptions = z.infer<typeof AnalyzeOptionsSchema>;

// Fix command options schema
export const FixOptionsSchema = z.object({
  unsafe: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  interactive: z.boolean().optional(),
  backup: z.boolean().optional(),
  config: z.string().optional(),
});

export type FixOptions = z.infer<typeof FixOptionsSchema>;

// Check command options schema
export const CheckOptionsSchema = z.object({
  coverage: z.boolean().optional(),
  watch: z.boolean().optional(),
  format: z.enum(['pretty', 'json', 'junit', 'sarif']).optional(),
  output: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  config: z.string().optional(),
});

export type CheckOptions = z.infer<typeof CheckOptionsSchema>;