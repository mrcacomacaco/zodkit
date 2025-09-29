// zodkit configuration file
module.exports = {
  // Schema detection - scan everything
  schemas: {
    patterns: ['./**/*.{ts,tsx,js,jsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}'
    ]
  },

  // Validation targets - scan everything
  targets: {
    mdx: {
      patterns: ['./**/*.mdx'],
      frontmatterSchemas: 'auto'
    },
    components: {
      patterns: ['./**/*.{tsx,jsx}'],
      propSchemas: 'auto'
    },
    api: {
      patterns: ['./**/*.ts'],
      requestSchemas: 'auto',
      responseSchemas: 'auto'
    }
  },

  // Rules configuration - test comprehensive rules
  rules: {
    'no-any-types': 'error',
    'no-unsafe-coercion': 'warn',
    'no-empty-schema': 'warn',
    'require-validation': 'error',
    'no-any-fallback': 'error',
    'prefer-strict-schemas': 'error'
  },

  // Output options
  output: {
    format: 'pretty', // 'pretty' | 'json' | 'junit' | 'sarif'
    verbose: false,
    showSuccessful: false
  }
};
