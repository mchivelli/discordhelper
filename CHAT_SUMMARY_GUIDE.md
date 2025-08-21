# 💬 Discord Chat Summarization Feature

## Overview
This feature adds AI-powered chat summarization to your Discord bot, allowing users to get clear, concise summaries of chat discussions both manually and automatically.

## 🤖 AI Model Recommendation
**Primary**: Claude 3.5 Haiku (`anthropic/claude-3.5-haiku`)
- **Cost**: $0.80/$4.00 per million tokens
- **Speed**: Fastest Claude model - perfect for real-time processing
- **Quality**: Excellent at text summarization and information extraction
- **Context**: 200K tokens - can handle large chat histories

**Alternative Models**:
- **Budget**: Gemini 2.5 Flash (`google/gemini-2.5-flash`) - $0.30/$2.50
- **Free**: Gemini 2.0 Flash Experimental (`google/gemini-2.0-flash-experimental`) - Free tier

## 🚀 Features

### Manual Summarization (`/summarize`)
- **Channel summaries**: Summarize specific channels
- **Server-wide summaries**: Get an overview of all server activity
- **Flexible time ranges**: 1-168 hours (up to 1 week)
- **Historical summaries**: View past summaries

### Automatic Daily Summaries
- **Scheduled at 8 AM daily** (configurable via `SUMMARY_CRON`)
- **Server-wide summaries** posted to system channel
- **Minimum message threshold** (10+ messages)
- **Automatic storage** for historical reference

## 📋 Commands

### `/summarize channel`
**Time-based summary:**
```
/summarize channel [channel:#general] hours:24
```
**Message-count-based summary:**
```
/summarize channel [channel:#general] messages:50
```
- Summarizes messages from a specific channel
- Defaults to current channel if none specified
- **Hours**: 1-168 (summarize last N hours)
- **Messages**: 10-1000 (summarize last N messages)
- ⚠️ **Cannot use both `hours` and `messages` together**

### `/summarize server`
**Time-based summary:**
```
/summarize server hours:24
```
**Message-count-based summary:**
```
/summarize server messages:100
```
- Summarizes messages from entire server
- Requires "Manage Messages" permission
- **Hours**: 1-168 (summarize last N hours)
- **Messages**: 10-1000 (summarize last N messages)
- ⚠️ **Cannot use both `hours` and `messages` together**

### `/summarize history`
```
/summarize history [days:7]
```
- Shows recent summaries
- Days: 1-30 (default: 7)
- Displays organized by date

### `/summarize fetch_history`
```
/summarize fetch_history [channel:#general] [days:1]
```
- Manually fetch and store chat history for a channel
- Useful for building up message database for better summaries
- Days: 1-14 (default: 1)

## 💡 Usage Examples

**Quick channel summary (default 24 hours):**
```
/summarize channel
```

**Specific time range:**
```
/summarize channel channel:#general hours:12
/summarize server hours:48
```

**Specific message count:**
```
/summarize channel channel:#staff-chat messages:100
/summarize server messages:200
```

**View summary history:**
```
/summarize history days:14
```

## ⚙️ Configuration

### Environment Variables
```env
# AI Model for summarization (optional)
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku

# Cron schedule for automatic summaries (optional, default: 8 AM daily)
SUMMARY_CRON=0 8 * * *

# OpenRouter API Key (required)
OPENROUTER_API_KEY=your_api_key_here
```

### Discord Bot Permissions
Required intents:
- `GUILDS`
- `GUILD_MESSAGES` 
- `MESSAGE_CONTENT`

Required permissions:
- Read Message History
- Send Messages
- Embed Links
- Use Slash Commands

## 🗄️ Database Schema

### Chat Messages Table
```sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  attachments TEXT
);
```

### Chat Summaries Table
```sql
CREATE TABLE chat_summaries (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT,           -- NULL for server-wide summaries
  date TEXT NOT NULL,        -- YYYY-MM-DD format
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ai_model TEXT DEFAULT 'claude-3.5-haiku'
);
```

## 🛠️ Technical Details

### Message Processing
- **Automatic capture**: All non-bot messages are stored
- **Filtering**: Ignores commands, system messages, and very short messages
- **Storage optimization**: Keeps messages for 7 days only
- **Privacy**: Respects Discord permissions

### AI Summarization
- **Context-aware**: Includes channel/server information
- **User-friendly**: Discord-formatted with emojis
- **Comprehensive**: Covers topics, participants, decisions, action items
- **Fallback**: Graceful degradation if AI is unavailable

### Performance Optimizations
- **Message limits**: Processes up to 1 week of messages
- **Minimum thresholds**: Skips summarization for very quiet periods
- **Cleanup routines**: Automatic deletion of old data
- **Caching**: Efficient database queries

## 💰 Cost Estimation

### With Claude 3.5 Haiku
- **Small server** (100 messages/day): ~$0.01-0.02/day
- **Medium server** (500 messages/day): ~$0.05-0.10/day  
- **Large server** (2000 messages/day): ~$0.20-0.40/day

### With Free Models
- **All servers**: $0/day (subject to rate limits)

## 🔧 Troubleshooting

### Common Issues

1. **"No messages found"**
   - Bot needs time to collect messages after installation
   - Check bot permissions in target channels
   - Verify message content intent is enabled

2. **"Permission denied"**
   - Ensure bot has Read Message History permission
   - For server summaries, user needs Manage Messages permission

3. **AI summarization fails**
   - Check OpenRouter API key configuration
   - Verify model name in environment variables
   - Falls back to basic summary format

### Logs to Check
```bash
# Message collection
grep "storing chat message" logs/

# Summary generation  
grep "Generated.*summary" logs/

# Automatic scheduling
grep "daily automatic chat summarization" logs/
```

## 🎯 Usage Tips

1. **Start small**: Test with channel summaries first
2. **Check history**: Use `/summarize history` to see past summaries
3. **Adjust timing**: Configure automatic summaries for your server's timezone
4. **Monitor costs**: Keep track of usage if using paid AI models
5. **Permissions**: Set up proper role permissions for server-wide summaries

## 🔄 Future Enhancements

Potential improvements:
- Weekly/monthly summary reports
- Custom summary formats
- Integration with other bot features
- Export summaries to external services
- Advanced filtering options
- Multi-language support

---

**Need help?** Check the logs and ensure your OpenRouter API key is properly configured.