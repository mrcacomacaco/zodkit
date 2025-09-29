# Docker Guide for zodkit

This guide explains how to use zodkit with Docker containers for consistent development, testing, and deployment environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
- [Docker Images](#docker-images)
- [Docker Compose Profiles](#docker-compose-profiles)
- [Usage Examples](#usage-examples)
- [Building Images](#building-images)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Option 1: Pull from Registry (Coming Soon)

```bash
# Pull the latest image
docker pull zodkit:latest

# Run zodkit on current directory
docker run --rm -v $(pwd):/workspace zodkit:latest check
```

### Option 2: Build Locally

```bash
# Build the Docker image
npm run docker:build

# Run zodkit
npm run docker:run check
```

### Option 3: Use Docker Compose

```bash
# Run CLI command
docker-compose --profile cli run zodkit check

# Start development mode with watch
docker-compose --profile dev up

# Run CI checks
docker-compose --profile ci run zodkit-ci
```

## Use Cases

Docker containerization is particularly useful for:

### 1. **Consistent Development Environment**
- Ensures all team members use the same Node.js version and dependencies
- Eliminates "works on my machine" problems
- Provides isolated environment without affecting local Node.js setup

### 2. **CI/CD Pipelines**
- Reliable builds across different CI platforms (GitHub Actions, GitLab CI, Jenkins)
- Consistent testing environment
- Easy integration with container-based CI systems

### 3. **Production Deployment**
- Microservices architecture where zodkit runs as a validation service
- Scheduled validation jobs in Kubernetes or Docker Swarm
- Serverless deployments (AWS Lambda, Google Cloud Run)

### 4. **Team Standardization**
- Enforce specific zodkit version across all environments
- Prevent version conflicts with other Node.js tools
- Easy onboarding for new team members

### 5. **Legacy Systems Integration**
- Run zodkit on systems without Node.js installed
- Integration with non-Node.js projects (Java, Python, .NET)
- Consistent tooling across polyglot environments

## Docker Images

### Base Image: `node:18-alpine`
- Lightweight Alpine Linux base
- Node.js 18 LTS for stability and performance
- Small image size (~150MB total)

### Multi-stage Build
1. **Builder stage**: Compiles TypeScript and installs dependencies
2. **Production stage**: Contains only runtime files and dependencies

### Security Features
- Non-root user (`zodkit:1001`)
- Minimal attack surface with Alpine Linux
- No unnecessary packages or tools
- Proper signal handling with `dumb-init`

## Docker Compose Profiles

### CLI Profile (`--profile cli`)
Basic zodkit usage for one-off commands:

```bash
docker-compose --profile cli run zodkit check
docker-compose --profile cli run zodkit init
docker-compose --profile cli run zodkit fix --dry-run
```

### Development Profile (`--profile dev`)
Watch mode for active development:

```bash
# Start watching for changes
docker-compose --profile dev up

# Run in background
docker-compose --profile dev up -d

# View logs
docker-compose logs -f zodkit-dev
```

### CI Profile (`--profile ci`)
Optimized for continuous integration:

```bash
# Run validation and generate JSON report
docker-compose --profile ci run zodkit-ci

# Check exit code
echo $?
```

### Benchmark Profile (`--profile benchmark`)
Performance testing and analysis:

```bash
# Run benchmarks and save results
docker-compose --profile benchmark run zodkit-benchmark
```

## Usage Examples

### Basic Validation

```bash
# Validate current project
docker run --rm -v $(pwd):/workspace zodkit:latest check

# With specific configuration
docker run --rm -v $(pwd):/workspace zodkit:latest check --config custom.config.js

# Generate coverage report
docker run --rm -v $(pwd):/workspace zodkit:latest check --coverage
```

### Interactive Usage

```bash
# Interactive shell in container
docker run --rm -it -v $(pwd):/workspace --entrypoint /bin/sh zodkit:latest

# Inside container, run zodkit commands
/workspace $ zodkit check
/workspace $ zodkit fix --interactive
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Validate Zod Schemas
  run: |
    docker run --rm \
      -v ${{ github.workspace }}:/workspace \
      zodkit:latest check --ci --format json
```

```yaml
# GitLab CI example
zodkit_validation:
  image: zodkit:latest
  script:
    - zodkit check --ci --format junit --output reports/zodkit.xml
  artifacts:
    reports:
      junit: reports/zodkit.xml
```

### Development Workflow

```bash
# Start development environment
npm run docker:dev

# In another terminal, make changes to your schemas
# The container will automatically revalidate

# Stop development environment
docker-compose --profile dev down
```

### Scheduled Validation

```yaml
# docker-compose for scheduled job
version: '3.8'
services:
  zodkit-cron:
    image: zodkit:latest
    volumes:
      - ./project:/workspace:ro
      - ./reports:/workspace/reports
    environment:
      - CRON_SCHEDULE=0 */6 * * *  # Every 6 hours
    command: ["check", "--ci", "--output", "reports/validation.json"]
    restart: unless-stopped
```

## Building Images

### Basic Build

```bash
# Build with default settings
npm run docker:build

# Build specific version
./scripts/docker-build.sh --version 1.0.0
```

### Advanced Build Options

```bash
# Build and push to registry
./scripts/docker-build.sh \
  --registry docker.io/username \
  --version 1.0.0 \
  --latest \
  --push

# Multi-platform build
./scripts/docker-build.sh \
  --platforms linux/amd64,linux/arm64 \
  --push

# Build with custom build args
./scripts/docker-build.sh \
  --build-arg NODE_ENV=production \
  --build-arg ZODDED_VERSION=1.0.0
```

### Registry Publishing

```bash
# Tag and push to Docker Hub
docker tag zodkit:latest username/zodkit:latest
docker push username/zodkit:latest

# Or use the build script
./scripts/docker-build.sh \
  --registry docker.io/username \
  --push \
  --latest
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Docker Build and Test

on: [push, pull_request]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: ./scripts/docker-build.sh --version ${{ github.sha }}

      - name: Test zodkit functionality
        run: |
          docker run --rm -v $(pwd):/workspace \
            zodkit:${{ github.sha }} check --ci

      - name: Push to registry
        if: github.ref == 'refs/heads/main'
        run: |
          echo ${{ secrets.DOCKER_TOKEN }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          ./scripts/docker-build.sh \
            --registry ${{ secrets.DOCKER_USERNAME }}/zodkit \
            --version latest \
            --push
```

### Kubernetes Deployment

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: zodkit-validation
spec:
  schedule: "0 */12 * * *"  # Every 12 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: zodkit
            image: zodkit:latest
            command: ["zodkit", "check", "--ci"]
            volumeMounts:
            - name: source-code
              mountPath: /workspace
              readOnly: true
            - name: reports
              mountPath: /workspace/reports
          volumes:
          - name: source-code
            configMap:
              name: project-source
          - name: reports
            persistentVolumeClaim:
              claimName: validation-reports
          restartPolicy: OnFailure
```

## Troubleshooting

### Common Issues

#### 1. Permission Errors
```bash
# Fix: Use proper volume mounting
docker run --rm -v $(pwd):/workspace:ro zodkit:latest check

# Or change ownership
sudo chown -R 1001:1001 ./reports
```

#### 2. File Not Found
```bash
# Fix: Ensure you're in the correct directory
cd /path/to/your/project
docker run --rm -v $(pwd):/workspace zodkit:latest check
```

#### 3. Node.js Version Issues
```bash
# Check Node.js version in container
docker run --rm zodkit:latest node --version

# Rebuild with specific Node.js version
./scripts/docker-build.sh --build-arg NODE_VERSION=18.19.0
```

#### 4. Configuration Not Found
```bash
# Mount config file specifically
docker run --rm \
  -v $(pwd):/workspace \
  -v $(pwd)/zodkit.config.js:/workspace/zodkit.config.js:ro \
  zodkit:latest check
```

### Debug Mode

```bash
# Run with debug output
docker run --rm -v $(pwd):/workspace \
  -e ZODDED_LOG_LEVEL=debug \
  zodkit:latest check --verbose

# Interactive debugging
docker run --rm -it \
  -v $(pwd):/workspace \
  --entrypoint /bin/sh \
  zodkit:latest
```

### Health Checks

```bash
# Check container health
docker run --rm zodkit:latest --version

# Inspect image
docker inspect zodkit:latest

# View container logs
docker-compose --profile dev logs zodkit-dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `ZODDED_LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `CI` | `false` | Enable CI mode |
| `ZODDED_CONFIG_PATH` | `zodkit.config.js` | Configuration file path |

## Performance Considerations

- **Image Size**: ~150MB (optimized with Alpine Linux)
- **Startup Time**: ~2-3 seconds for basic commands
- **Memory Usage**: ~50-100MB depending on project size
- **CPU Usage**: Scales with project complexity

## Best Practices

1. **Use specific tags** in production, not `latest`
2. **Mount volumes as read-only** when possible
3. **Use multi-stage builds** to keep image size small
4. **Run as non-root user** for security
5. **Set resource limits** in production deployments
6. **Use health checks** for long-running containers
7. **Cache layers** effectively in CI/CD pipelines