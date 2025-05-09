# Base image
FROM node:18-alpine
WORKDIR /app

# Install dependencies including build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ build-essential

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy dependency files
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Use non-root user for security
USER node

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "src/index.js"]
