# Simple Node.js image - no need for multi-stage build anymore
FROM node:18.20.8

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production --omit=dev

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

# Run bot directly - startup checks are handled in the application
CMD ["node", "src/index.js"]
