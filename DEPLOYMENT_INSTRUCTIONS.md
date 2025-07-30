# 🚀 Chat Summarization Feature - Deployment Instructions

## What Was Implemented

✅ **Complete Chat Summarization System** featuring:
- **AI-powered summaries** using Claude 3.5 Haiku (cost-effective and fast)
- **Manual commands** (`/summarize channel`, `/summarize server`, `/summarize history`)
- **Automatic daily summaries** posted to system channels at 8 AM
- **Database storage** for message tracking and summary history
- **Flexible time ranges** (1 hour to 1 week)
- **Permission controls** (server summaries require Manage Messages)

## 📋 Deployment Steps

### 1. Update Environment Variables

Add to your `.env` file:

```env
# New variables for chat summarization
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku
SUMMARY_CRON=0 8 * * *

# Make sure you have these existing variables
OPENROUTER_API_KEY=your_openrouter_api_key_here
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
```

### 2. Update Discord Bot Settings

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Go to your bot's settings
2. Navigate to **Bot** → **Privileged Gateway Intents**
3. Enable these intents:
   - ✅ **PRESENCE INTENT**
   - ✅ **SERVER MEMBERS INTENT** 
   - ✅ **MESSAGE CONTENT INTENT** ⚠️ **CRITICAL FOR CHAT SUMMARIZATION**

### 3. Deploy New Commands

Run the deployment script to register the new `/summarize` command:

```bash
# Install dependencies (if needed)
npm install

# Deploy slash commands to Discord
node src/utils/deploy.js
```

### 4. Update Bot Permissions

In your Discord server, ensure the bot has:
- ✅ **Read Message History**
- ✅ **Send Messages**
- ✅ **Embed Links** 
- ✅ **Use Slash Commands**

### 5. Start/Restart the Bot

```bash
# For production
npm start

# For development
npm run dev

# For Docker
docker-compose down && docker-compose up -d
```

## 🧪 Testing the Feature

### Test Manual Summarization

1. **Channel Summary**:
   ```
   /summarize channel channel:#general hours:24
   ```

2. **Server Summary** (requires Manage Messages):
   ```
   /summarize server hours:24
   ```

3. **View History**:
   ```
   /summarize history days:7
   ```

### Verify Automatic Daily Summaries

The bot will automatically post daily summaries at 8 AM (configurable via `SUMMARY_CRON`). Check your server's system channel or the first available text channel.

## 💰 Cost Monitoring

### With Claude 3.5 Haiku ($0.80/$4.00 per million tokens):

- **Small server** (100 messages/day): ~$0.01-0.02/day
- **Medium server** (500 messages/day): ~$0.05-0.10/day  
- **Large server** (2000 messages/day): ~$0.20-0.40/day

### Free Alternative:

Set `SUMMARIZATION_MODEL=google/gemini-2.0-flash-experimental` for free usage (with rate limits).

## 🔧 Configuration Options

### Customize Automatic Summary Time

```env
# Examples:
SUMMARY_CRON=0 8 * * *    # 8 AM daily (default)
SUMMARY_CRON=0 20 * * *   # 8 PM daily
SUMMARY_CRON=0 12 * * 1   # Noon every Monday only
```

### Customize AI Model

```env
# Recommended for quality and cost
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku

# Budget option
SUMMARIZATION_MODEL=google/gemini-2.5-flash

# Free option (with limits)
SUMMARIZATION_MODEL=google/gemini-2.0-flash-experimental
```

## 🐛 Troubleshooting

### "No messages found"
- **Wait 24+ hours** after deployment for message collection
- **Check bot permissions** in target channels
- **Verify MESSAGE_CONTENT intent** is enabled

### "Permission denied"
- **Read Message History** permission required for the bot
- **Manage Messages** permission required for users running server summaries

### AI summarization fails
- **Check OpenRouter API key** is valid and has credits
- **Verify model name** matches available models
- Bot falls back to basic summary format if AI fails

### Commands not appearing
- **Run the deploy script**: `node src/utils/deploy.js`
- **Check Discord Developer Portal** bot settings
- **Wait up to 1 hour** for global command registration

## 📊 Monitoring Usage

Check logs for:

```bash
# Message collection
grep "storing chat message" logs/

# Summary generation  
grep "Generated.*summary" logs/

# Automatic scheduling
grep "daily automatic chat summarization" logs/

# AI costs (if logging enabled)
grep "OpenRouter" logs/
```

## 🎯 Next Steps

1. **Monitor costs** for the first week to understand usage patterns
2. **Adjust SUMMARY_CRON** timing to match your community's activity
3. **Set up role permissions** for server-wide summary access
4. **Consider channel-specific** automatic summaries for high-traffic servers

---

**🚀 Your Discord bot now has powerful AI chat summarization! Users can start using `/summarize` commands immediately, and daily summaries will begin automatically.**

Need help? Check the logs and ensure your OpenRouter API key is properly configured with sufficient credits.