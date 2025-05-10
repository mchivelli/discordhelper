# Multi-stage build to ensure proper compilation of better-sqlite3
# First stage: build the better-sqlite3 module for our exact Node.js version
FROM node:18.20.8 AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files only
COPY package*.json ./

# Create a temporary package.json with only better-sqlite3
RUN node -e "const pkg = require('./package.json'); \
    const newPkg = { \
        name: 'better-sqlite3-builder', \
        dependencies: { \
            'better-sqlite3': pkg.dependencies['better-sqlite3'] \
        } \
    }; \
    require('fs').writeFileSync('temp-package.json', JSON.stringify(newPkg, null, 2));"

# Install only better-sqlite3 to isolate the build
RUN mv temp-package.json package.json && npm install --build-from-source

# Second stage: clean runtime image with the pre-built module
FROM node:18.20.8

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    sqlite3 \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create data directory
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy package files
COPY package*.json ./

# Install production dependencies EXCEPT better-sqlite3 (we'll copy the built one)
RUN npm ci --production --omit=dev --ignore-scripts

# Copy the pre-built better-sqlite3 module from builder stage
COPY --from=builder /build/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Copy application code
COPY . .

# Make startup script executable
RUN chmod +x start.sh

# Use non-root user for security
USER node

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Health check to verify bot is running
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${HEALTH_PORT:-3000}/health || exit 1

# Use startup script to ensure database, commands, and AI are ready
CMD ["/bin/sh", "start.sh"]
