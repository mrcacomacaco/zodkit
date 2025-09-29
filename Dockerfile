# Multi-stage build for optimal image size
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the project
RUN npm run build

# Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S zodkit && \
    adduser -S zodkit -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy additional files
COPY README.md LICENSE CHANGELOG.md ./

# Change ownership to non-root user
RUN chown -R zodkit:zodkit /app

# Switch to non-root user
USER zodkit

# Create volume for project files
VOLUME ["/workspace"]

# Set default working directory for commands
WORKDIR /workspace

# Add zodkit to PATH
ENV PATH="/app/dist/cli:$PATH"

# Expose potential ports (for future web UI)
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node /app/dist/cli/index.js --version || exit 1

# Set default entrypoint
ENTRYPOINT ["dumb-init", "--", "node", "/app/dist/cli/index.js"]

# Default command
CMD ["--help"]

# Labels for metadata
LABEL maintainer="JSONbored" \
      version="0.1.0" \
      description="Modern CLI tool for static analysis and validation of Zod schemas" \
      org.opencontainers.image.title="zodkit" \
      org.opencontainers.image.description="Modern CLI tool for static analysis and validation of Zod schemas" \
      org.opencontainers.image.vendor="JSONbored" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.source="https://github.com/JSONbored/zodkit" \
      org.opencontainers.image.licenses="MIT"