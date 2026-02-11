# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Discord.js v14 bot for task management, changelog tracking, announcements, issue tracking, and AI-powered chat summarization. Uses OpenRouter API for AI features with graceful fallbacks when unavailable.

## Development Commands

```bash
# Install dependencies (requires Node.js 16+)
npm install

# Deploy slash commands to Discord (run after adding/modifying commands)
npm run deploy-commands

# Start bot in development mode with auto-reload
npm run dev

# Start bot in production mode
npm start

# Run tests
npm test

# Lint code
npm run lint
```

## Architecture

### File-Based Database System

**Critical**: This project uses a custom file-based JSON storage system (`src/utils/file-db.js`) instead of SQLite, despite references to SQLite in comments and documentation. This was done to avoid native module compilation issues across platforms.

- Database "tables" are stored as individual JSON files in `data/<table_name>/` directories
- Each record is a separate `.json` file named by its ID or key
- The `file-db.js` module provides a SQLite-like API (`prepare()`, `all()`, `get()`, `run()`) for compatibility
- Database operations are synchronous and cache results in memory for performance
- Schema definitions in `src/utils/db.js` are executed as no-ops but document the expected structure

**When working with data:**
- Use `db.prepare()` for queries (same API as better-sqlite3)
- Changes write immediately to disk as JSON files
- No migrations needed - schema changes happen implicitly when new fields are written

### AI Integration (OpenRouter)

The bot uses OpenRouter API as an abstraction layer for multiple AI models:

- **Main AI model** (`MODEL_NAME`): General tasks like prerequisites, announcement enhancement, task suggestions
- **Summarization model** (`SUMMARIZATION_MODEL`): Optimized for chat summaries (default: Claude 3.5 Haiku)
- **Fallback system**: All AI functions in `src/utils/ai.js` have hardcoded fallbacks when API is unavailable
- **Cost optimization**: Summarization uses chunking and token budgets to control costs

Key AI functions:
- `getPrereqs()` - Generate task prerequisites
- `generateChatSummary()` - Summarize chat messages
- `enhanceAnnouncement()` - Improve announcement formatting
- `generateTaskStages()` - Auto-generate task stages

### Command Structure

Commands are in `src/commands/`, loaded dynamically by `src/index.js`:

- Each command exports `{ data, execute, autocomplete? }`
- `data` is a SlashCommandBuilder definition
- `execute(interaction)` handles the command logic
- `autocomplete(interaction)` handles option autocomplete (optional)
- Commands use subcommands extensively (e.g., `/task create`, `/task list`)

**Important patterns:**
- Use interaction.deferReply() for long operations
- Rate limiting is handled globally in index.js (3s cooldown)
- Errors are logged via winston logger (`src/utils/logger.js`)

### Scheduled Jobs

The bot uses `node-cron` for scheduled tasks configured in `.env`:

- `REMINDER_CRON` - Daily task reminders (default: 9am)
- `SUMMARY_CRON` - Automatic chat summaries (default: 8am)
- `MESSAGE_CLEANUP_CRON` - Delete old messages (default: 3am)
- Production mode also runs daily database backups at midnight

## Key Files and Modules

- **`src/index.js`** - Main entry point, event handlers, cron jobs, rate limiting
- **`src/utils/db.js`** - Database schema definitions and file-db wrapper
- **`src/utils/file-db.js`** - Core file-based database implementation
- **`src/utils/ai.js`** - OpenRouter API integration with fallbacks
- **`src/utils/logger.js`** - Winston logging configuration
- **`src/utils/patch-utils.js`** - Changelog and patch announcement generation
- **`src/commands/`** - Discord slash command implementations
- **`src/components/`** - Reusable Discord UI components (buttons, modals)

## Environment Configuration

Required variables:
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `CLIENT_ID` - Application ID from Discord Developer Portal
- `OPENROUTER_API_KEY` - API key for AI features

Important optional variables:
- `GUILD_ID` - Limits command registration to single guild (faster dev iteration)
- `DB_PATH` - Database root directory (default: `./data/tasks.db`, but only dirname is used)
- `SUMMARIZATION_MODEL` - Model for chat summaries (recommended: `anthropic/claude-3.5-haiku`)
- `DAILY_SUMMARY_SOURCE_CHANNELS` - Comma-separated channel IDs to track for summaries

## Database Tables

Main tables (stored as directories in `data/`):
- `tasks` - Multi-stage task system with AI-generated prerequisites
- `stages` - Individual task stages with assignees and completion tracking
- `changelogs` - Version changelog entries with category and patch note support
- `announcements` - Draft and posted announcements
- `chat_messages` - Stored messages for summarization
- `chat_summaries` - Generated AI summaries by date/channel
- `issues` - Issue tracking with severity and assignee
- `admin_tasks` - Administrative task tracking with threads
- `simple_tasks` - Lightweight task system
- `changelog_versions` - Version tracking with threads

## Testing

Tests are in `tests/` using Jest. Current test coverage is minimal.

To add tests for a command:
```javascript
const command = require('../src/commands/yourcommand');

describe('YourCommand', () => {
  it('should execute without errors', async () => {
    // Test implementation
  });
});
```

## Common Patterns

**Creating embeds:**
```javascript
const { EmbedBuilder } = require('discord.js');
const embed = new EmbedBuilder()
  .setTitle('Title')
  .setDescription('Description')
  .setColor(0x00ff00);
```

**Database queries:**
```javascript
const db = require('./utils/db');

// Insert
db.prepare('INSERT INTO tasks (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());

// Select
const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
const allTasks = db.prepare('SELECT * FROM tasks').all();
```

**AI calls with fallback:**
```javascript
const { callLLMAPI } = require('./utils/ai');

const result = await callLLMAPI([
  { role: 'system', content: 'System prompt' },
  { role: 'user', content: 'User input' }
], maxTokens, modelOverride);
// Returns fallback response if API unavailable
```

## Known Issues

- The codebase has git merge conflict markers in `src/utils/db.js` and `src/utils/file-db.js` that need resolution
- Some "HomePC" variants of files exist (e.g., `index-HomePC.js`, `ai-HomePC.js`) suggesting environment-specific configurations
- Documentation still references SQLite despite using file-based storage
