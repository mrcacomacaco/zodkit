# Contributing to zodkit

Thank you for your interest in contributing to zodkit! This document outlines the process for contributing to this project.

## Getting Started

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn package manager
- Git

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zodkit.git
   cd zodkit
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests:
   ```bash
   npm test
   ```

6. Start development mode:
   ```bash
   npm run dev
   ```

## Development Workflow

### Code Style

- We use ESLint and Prettier for code formatting
- Run `npm run lint` to check for linting errors
- Run `npm run lint:fix` to auto-fix linting issues
- Run `npm run format` to format code with Prettier

### Testing

- Write tests for new features and bug fixes
- Ensure all tests pass: `npm test`
- Check test coverage: `npm run test:coverage`
- Tests should be placed in the `test/` directory

### Commit Messages

We follow conventional commit format:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks

Example: `feat: add schema validation for API routes`

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them with descriptive messages

3. Ensure all tests pass and code follows our style guidelines:
   ```bash
   npm run validate
   ```

4. Push your branch and create a pull request

5. Fill out the pull request template with:
   - Description of changes
   - Related issue numbers
   - Testing instructions
   - Breaking changes (if any)

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Avoid `any` types - use proper type definitions
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

### Architecture

- Follow the existing project structure
- Keep functions small and focused
- Use dependency injection where appropriate
- Write self-documenting code

### Performance

- Consider performance implications of changes
- Use appropriate data structures
- Avoid unnecessary computations
- Profile performance-critical code

## Issue Reporting

When reporting issues, please include:

- zodkit version
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages (if any)
- Minimal reproduction case

## Feature Requests

For feature requests, please:

- Check if the feature already exists or is planned
- Describe the use case and motivation
- Provide examples of how it would be used
- Consider implementation complexity

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions

## Questions?

- Check the documentation and existing issues first
- Open a GitHub issue for questions
- Tag maintainers if you need urgent help

## License

By contributing to zodkit, you agree that your contributions will be licensed under the MIT License.