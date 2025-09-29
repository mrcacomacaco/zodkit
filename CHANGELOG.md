# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Main library entry point for programmatic usage
- MIT LICENSE file for legal compliance
- NPM publishing configuration with .npmignore
- TypeScript declaration files support
- Comprehensive package metadata

### Fixed
- Jest configuration for ES module compatibility
- Repository URLs updated from placeholders
- Package.json types field for TypeScript support

### Changed
- Downgraded chalk from v5 to v4.1.2 for CommonJS compatibility

## [0.1.0] - 2025-01-26

### Added
- Initial release of zodkit CLI tool
- MDX frontmatter validation against Zod schemas
- React component props validation
- API route validation
- Configuration file support (zod.config.js)
- Multiple output formats (pretty, json, junit, sarif)
- Watch mode for real-time validation
- Performance monitoring and reporting
- Error reporting with detailed diagnostics
- Schema discovery and analysis
- CLI commands: validate, init, doctor, fix, generate, analyze
- TypeScript support with strict configuration
- Jest testing framework setup
- ESLint and Prettier configuration

### Dependencies
- chalk: ^4.1.2
- chokidar: ^4.0.3
- commander: ^14.0.1
- fast-glob: ^3.3.3
- gray-matter: ^4.0.3
- picocolors: ^1.1.1
- ts-morph: ^27.0.0
- zod: ^4.1.11