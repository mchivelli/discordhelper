# Base image
FROM node:18-alpine
WORKDIR /app

# Install dependencies including build tools for better-sqlite3 and curl for healthchecks
RUN apk add --no-cache python3 make g++ build-essential curl bash

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy dependency files
COPY package*.json ./
RUN npm ci --production

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
