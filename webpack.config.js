const path = require('path');
const webpack = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const isProduction = process.env.NODE_ENV === 'production';
const analyze = process.env.ANALYZE === 'true';

const baseConfig = {
  mode: isProduction ? 'production' : 'development',
  target: 'node',
  externals: {
    // Keep Node.js built-ins external
    'fs': 'commonjs fs',
    'path': 'commonjs path',
    'crypto': 'commonjs crypto',
    'util': 'commonjs util',
    'events': 'commonjs events',
    'stream': 'commonjs stream',
    'zlib': 'commonjs zlib',
    'child_process': 'commonjs child_process',
    'os': 'commonjs os',
    // Keep large dependencies external to reduce bundle size
    'zod': 'commonjs zod',
    'commander': 'commonjs commander',
    'ts-morph': 'commonjs ts-morph',
    'fast-glob': 'commonjs fast-glob',
    'chokidar': 'commonjs chokidar'
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@cli': path.resolve(__dirname, 'src/cli'),
      '@utils': path.resolve(__dirname, 'src/utils')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              transpileOnly: !isProduction, // Faster builds in dev
              compilerOptions: {
                // Override for webpack build
                module: 'ESNext',
                target: 'ES2020',
                moduleResolution: 'node',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true
              }
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      '__VERSION__': JSON.stringify(require('./package.json').version),
      '__DEV__': JSON.stringify(!isProduction)
    }),
    // Tree shaking optimization
    new webpack.optimize.ModuleConcatenationPlugin(),
    ...(analyze ? [new BundleAnalyzerPlugin()] : [])
  ],
  optimization: {
    minimize: isProduction,
    usedExports: true, // Enable tree shaking
    sideEffects: false, // Enable aggressive tree shaking
    // Disable split chunks for CLI to avoid conflicts
    splitChunks: false
  },
  performance: {
    maxAssetSize: 250000, // 250KB
    maxEntrypointSize: 250000,
    hints: isProduction ? 'error' : 'warning'
  }
};

module.exports = [
  // CLI Entry Point
  {
    ...baseConfig,
    name: 'cli',
    entry: './src/cli/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'cli/index.js',
      clean: true,
      libraryTarget: 'commonjs2'
    },
    plugins: [
      ...baseConfig.plugins,
      new webpack.BannerPlugin({
        banner: '#!/usr/bin/env node',
        raw: true
      })
    ]
  },
  // Library Entry Point
  {
    ...baseConfig,
    name: 'lib',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'index.js',
      libraryTarget: 'commonjs2',
      library: 'zodkit'
    },
    optimization: {
      ...baseConfig.optimization,
      // More aggressive optimization for library
      splitChunks: false // Single bundle for library
    }
  }
];