# Discord Helper Bot

A comprehensive Discord bot for task management, change tracking, and announcements with AI-powered enhancements.

## Features

### Task Management
- Create tasks with multiple stages
- Track and advance through task stages
- Assign stages to Discord users
- AI-generated prerequisites for upcoming stages
- Daily reminders for pending tasks

### Changelog & Patch Notes
- Log updates and configuration changes
- Generate professional patch announcements
- Preview and confirmation workflow before posting
- Categorized changes (Added, Fixed, Changed, etc.)

### Announcements
- Create and manage announcements with AI enhancement
- Preview announcements before posting
- Professional formatting with reduced emoji usage

### Chat Summarization (NEW! 🆕)
- AI-powered chat summaries for channels and entire servers
- Manual summarization with `/summarize` command
- Automatic daily summaries posted to system channel
- Flexible time ranges (1 hour to 1 week)
- Historical summary viewing and management
- Cost-effective with Claude 3.5 Haiku AI model

### System Features
- Persistent SQLite database storage with automated backups
- Comprehensive error handling and logging
- Rate limiting to prevent command abuse

## Installation

### Prerequisites

- Node.js 16+ (18+ recommended)
- Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)
- OpenRouter API key for AI features

### Ubuntu Installation

```bash
# Update system packages
sudo apt-get update

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools for better-sqlite3
sudo apt-get install -y python3 make g++ build-essential

# Clone the repository (replace with your repo URL if needed)
git clone <repository-url>
cd discord-task-bot-final

# Install dependencies
npm install

# Create data directory
mkdir -p data

# Set up environment variables
cp .env.example .env
# Edit .env with your token, API key, etc.
nano .env
```

### Environment Variables

Create a `.env` file with the following variables:

```
# Discord
DISCORD_TOKEN=your_discord_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_dev_guild_id  # Optional, for guild-specific commands

# OpenRouter
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MODEL_NAME=gemini-2.0-flash-exp:free  # Or any other supported model
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku  # Recommended for chat summaries

# Persistence
DB_PATH=./data/tasks.db

# Reminders & Summaries
REMINDER_CRON=0 9 * * *  # Daily at 9am
SUMMARY_CRON=0 8 * * *   # Daily chat summaries at 8am
```

## Usage

### Registering Commands

Before running the bot for the first time, register the slash commands:

```bash
npm run deploy-commands
```

### Starting the Bot

```bash
# Production mode
npm start

# Development mode with auto-restart
npm run dev
```

### Docker Deployment (Production Ready)

The project includes a production-ready Docker setup with automatic health checks, database migrations, and AI integration testing at startup.

```bash
# Set up your environment variables first
cp .env.example .env
nano .env  # Add your DISCORD_TOKEN and OPENROUTER_API_KEY

# Build and start containers in production mode
docker-compose up -d

# View logs
docker-compose logs -f

# Check container health status
docker-compose ps

# Stop containers
docker-compose down
```

### AI Integration

This bot uses OpenRouter API for AI-enhanced features. To ensure proper AI functionality:

1. Get an API key from [OpenRouter.ai](https://openrouter.ai/)
2. Add the API key to your `.env` file as `OPENROUTER_API_KEY`
3. Choose models:
   - `MODEL_NAME` - General AI tasks (default: free Gemini model)
   - `SUMMARIZATION_MODEL` - Chat summaries (recommended: `anthropic/claude-3.5-haiku`)

At startup, the bot will automatically:
- Test the AI connection
- Fall back to basic functionality if AI is unavailable
- Report the AI status in the logs

#### AI Model Costs

**Chat Summarization** (Claude 3.5 Haiku):
- Small server (100 msgs/day): ~$0.01-0.02/day
- Medium server (500 msgs/day): ~$0.05-0.10/day  
- Large server (2000 msgs/day): ~$0.20-0.40/day

**Free Alternative**: Use `google/gemini-2.0-flash-experimental` for testing

You can manually check AI status with:
```bash
# For Docker deployments
docker-compose exec bot node -e "require('./src/utils/ai').checkAIStatus().then(console.log)"

# For local deployments
node -e "require('./src/utils/ai').checkAIStatus().then(console.log)"
```

## Bot Commands

### Task Management
- `/task create <n>` - Create a new task
- `/task add-stage <id> <n> <desc>` - Add a stage to a task
- `/task list <id>` - List all stages for a task
- `/task advance <id>` - Advance to the next stage
- `/task assign <id> <user>` - Assign a stage to a user
- `/task stats` - Show overall task statistics
- `/task help` - Show detailed help for task commands

### Changelog Management
- `/changelog add` - Add a new changelog entry with version, category, and details
- `/changelog list` - View recent changelog entries
- `/changelog set-channel` - Configure channel for posting changelog entries

### Announcements
- `/announce create` - Create a new announcement with optional AI enhancement
- `/announce list` - List pending announcement drafts
- `/announce post <id>` - Post a previously created announcement
- `/announce preview <id>` - Preview a draft announcement

### Chat Summarization (NEW!)
- `/summarize channel [channel] [hours]` - Summarize messages from a specific channel
- `/summarize server [hours]` - Generate server-wide activity summary (requires Manage Messages)
- `/summarize history [days]` - View recent summaries and activity reports

## Troubleshooting

### Common Issues

1. **SQLite Build Errors**: Ensure you've installed the build dependencies
2. **Discord API Errors**: Verify your token and permissions
3. **Command Not Found**: Make sure you've run the deploy-commands script
4. **Database Issues**: Check the data directory has correct permissions
5. **Chat Summarization Not Working**: 
   - Ensure bot has `MESSAGE_CONTENT` intent enabled
   - Check bot permissions in target channels
   - Verify OpenRouter API key is configured

### Logs

Check the console output for detailed logs, including database operations and error messages.

## License

MIT
