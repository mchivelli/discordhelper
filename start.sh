#!/bin/bash

echo "Starting Discord Helper Bot..."

# Source environment variables
if [ -f .env ]; then
    echo "Loading environment variables..."
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
fi

# Ensure data directories exist with proper permissions
echo "Setting up data directories..."
mkdir -p data/tasks data/stages data/task_suggestions \
         data/bot_settings data/announcements data/changelogs \
         data/chat_messages data/chat_summaries data/issues \
         data/admin_tasks data/admin_task_assignees

# Fix permissions for all data directories
echo "Fixing data directory permissions..."
chown -R $(id -u):$(id -g) data/
chmod -R 755 data/

# Production startup script for Discord Task Bot
# This ensures all prerequisites are met before starting the bot

set -e
echo "=== Discord Task Bot Production Startup Script ==="
echo "$(date) - Starting initialization"

# Check for required environment variables
if [ -z "$DISCORD_TOKEN" ]; then
  echo " ERROR: DISCORD_TOKEN environment variable is not set"
  exit 1
fi

# Set up database directory and ensure proper permissions
DB_DIR="$(dirname "${DB_PATH:-./data/database.sqlite}")"
echo "Setting up database directory: $DB_DIR"
mkdir -p "$DB_DIR"
chmod -R 755 "$DB_DIR" 2>/dev/null || true
echo " Database directory setup complete"

# Initialize database if it doesn't exist
DB_FILE="${DB_PATH:-./data/database.sqlite}"
if [ ! -f "$DB_FILE" ]; then
  echo "Database file not found, initializing new database..."
  touch "$DB_FILE"
  chmod 644 "$DB_FILE" 2>/dev/null || true
fi

# Run database migrations with retries
MAX_RETRIES=3
RETRY_COUNT=0
DB_MIGRATION_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$DB_MIGRATION_SUCCESS" = "false" ]; do
  echo "Running database migrations (attempt $(($RETRY_COUNT + 1))/${MAX_RETRIES})..."
  if node src/utils/db-migration.js; then
    echo "✅ Database migrations complete"
    DB_MIGRATION_SUCCESS=true
  else
    RETRY_COUNT=$(($RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️ Database migration failed, retrying in 5 seconds..."
      sleep 5
    else
      echo "❌ Database migration failed after $MAX_RETRIES attempts"
      echo "The bot will start anyway but may not function correctly"
    fi
  fi
done

# Deploy commands to Discord with retries
MAX_RETRIES=3
RETRY_COUNT=0
DEPLOY_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$DEPLOY_SUCCESS" = "false" ]; do
  echo "Deploying Discord slash commands (attempt $(($RETRY_COUNT + 1))/${MAX_RETRIES})..."
  if node src/utils/deploy.js; then
    echo "✅ Command deployment complete"
    DEPLOY_SUCCESS=true
  else
    RETRY_COUNT=$(($RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️ Command deployment failed, retrying in 5 seconds..."
      sleep 5
    else
      echo "❌ Command deployment failed after $MAX_RETRIES attempts"
      echo "The bot will start anyway but commands may not be available"
    fi
  fi
done

# Test AI connection if API key is provided
if [ -n "$OPENROUTER_API_KEY" ]; then
  echo "Testing AI integration..."
  node -e "
    const { checkAIStatus } = require('./src/utils/ai');
    
    async function testAI() {
      try {
        const status = await checkAIStatus();
        if (status.success) {
          console.log('✅ AI integration successful!');
          console.log(status.message);
        } else {
          console.log('⚠️ AI integration not working:');
          console.log(status.message);
          console.log('Bot will use fallback responses for AI features');
        }
      } catch (err) {
        console.error('Error testing AI:', err);
        console.log('Bot will use fallback responses for AI features');
      }
    }
    
    testAI();
  "
else
  echo "⚠️ OPENROUTER_API_KEY is not set - AI features will use fallbacks"
fi

# Clean up any temporary files before starting
find /tmp -name "discord-task-bot-*" -type f -mtime +1 -delete 2>/dev/null || true

# Output environment info (without sensitive details)
echo "\nEnvironment Information:"
echo "- NODE_ENV: ${NODE_ENV:-production}"
echo "- DB_PATH: ${DB_PATH:-./data/database.sqlite}"
echo "- Runtime: $(node -v)"
echo "- Container started at: $(date)"

# Start the bot
echo "\nStarting Discord Task Bot..."
exec node src/index.js
