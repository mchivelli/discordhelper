# 📊 Daily Summary Configuration Guide

## Overview
This document explains the updated Daily Summarization features for your Discord bot. The changes address your requirements to:

1. **Post Daily Summarizations in a different channel**
2. **Only encompass messages from the last 24 hours**
3. **Keep previous day's summary in mind when generating new summaries**
4. **Define multiple chat channels for information gathering**

## 🆕 What's Changed

### 1. Channel Configuration
- **Output Channel**: `DAILY_SUMMARY_CHANNEL_ID` - Where summaries are posted
- **Source Channels**: `DAILY_SUMMARY_SOURCE_CHANNELS` - Which channels to gather messages from
- The bot now supports configuring both output and source channels
- Maintains backward compatibility with existing fallback logic

### 2. Enhanced Time Filtering  
- **Previous**: Used "previous day only" (yesterday 00:00:00 to 23:59:59)
- **Updated**: Now uses **actual last 24 hours** from when the cron job runs
- This ensures summaries capture the most recent activity, regardless of when the job runs

### 3. Previous Day Context
- Bot now retrieves and considers the previous day's summary when generating new ones
- Helps maintain continuity in discussions and track ongoing topics
- Shows relationships between consecutive days' activities

### 4. Multiple Source Channels
- Configure specific channels to include in daily summaries
- Supports both staff channels and user chat channels
- Filters messages only from the channels you want to monitor

## ⚙️ Configuration

### Environment Variables

Add these to your `.env` file or environment configuration:

```env
# Daily Summary Configuration
DAILY_SUMMARY_CHANNEL_ID=your_output_channel_id_here          # Where to post summaries
DAILY_SUMMARY_SOURCE_CHANNELS=ch1_id,ch2_id,ch3_id           # Which channels to monitor (comma-separated)

# Existing configuration (optional)
SUMMARY_CRON=0 8 * * *                                       # Default: 8 AM daily
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku               # AI model for summaries
```

### New Environment Variables Explained

#### `DAILY_SUMMARY_SOURCE_CHANNELS` (New)
- **Purpose**: Specify which channels to include in daily summaries
- **Format**: Comma-separated list of channel IDs
- **Example**: `123456789,987654321,555666777`
- **Behavior**: If not set, includes messages from ALL channels (current behavior)

### How to Get Channel IDs

1. **Enable Developer Mode in Discord:**
   - User Settings → Advanced → Developer Mode (ON)

2. **Get Output Channel ID:**
   - Right-click the channel where you want daily summaries posted
   - Click "Copy Channel ID"
   - Use this as `DAILY_SUMMARY_CHANNEL_ID`

3. **Get Source Channel IDs:**
   - For each channel you want to monitor (staff channels, user channels, etc.)
   - Right-click the channel → "Copy Channel ID"
   - Combine all IDs with commas for `DAILY_SUMMARY_SOURCE_CHANNELS`

### Example Configuration

```env
# Post summaries to #daily-summaries channel
DAILY_SUMMARY_CHANNEL_ID=123456789012345678

# Monitor messages from #staff-chat, #general, and #announcements
DAILY_SUMMARY_SOURCE_CHANNELS=111111111111111111,222222222222222222,333333333333333333
```

## 🔄 Channel Selection Logic

The bot now uses this priority order:

1. **Configured Channel** (if `DAILY_SUMMARY_CHANNEL_ID` is set)
   - Looks for the specified channel ID
   - Logs: `"Using configured daily summary channel: #channel-name"`

2. **System Channel** (fallback)
   - Uses the server's system channel
   - Logs: `"Using system channel: #channel-name"`

3. **First Available Text Channel** (final fallback)
   - Finds first text channel with proper permissions
   - Logs: `"Using first available text channel: #channel-name"`

## 📅 Enhanced Features Details

### Time Filtering - Last 24 Hours
```javascript
// Gets messages from last 24 hours (rolling window)
const messages = await getMessagesFromSourceChannels(db, guild, 24);
// If cron runs at 8 AM, this gets messages from yesterday 8 AM to today 8 AM
```

### Source Channel Filtering
```javascript
// Example: Only get messages from specified channels
const sourceChannels = ['123456789', '987654321', '555666777'];
// Bot will only analyze messages from these channels
```

### Previous Day Context
```javascript
// Bot retrieves yesterday's summary and includes it in AI context
const previousSummary = await getPreviousDaySummary(db, guild.id);
// AI uses this to maintain continuity and track ongoing discussions
```

### Function Details
- **`getMessagesFromSourceChannels()`**: Gets messages from specific channels only
- **`getPreviousDaySummary()`**: Retrieves previous day's summary for context
- **Enhanced AI Prompt**: Considers previous day's summary when generating new ones
- **Smart Fallbacks**: Falls back to all channels if source channels not configured

## 🚀 Deployment Steps

### 1. Update Environment Variables

Add the new variables to your environment:

```bash
# Option 1: Add to .env file
echo "DAILY_SUMMARY_CHANNEL_ID=your_output_channel_id" >> .env
echo "DAILY_SUMMARY_SOURCE_CHANNELS=ch1_id,ch2_id,ch3_id" >> .env

# Option 2: Set environment variables directly
export DAILY_SUMMARY_CHANNEL_ID=your_output_channel_id
export DAILY_SUMMARY_SOURCE_CHANNELS=ch1_id,ch2_id,ch3_id
```

### 2. Restart the Bot

```bash
# For Docker
docker-compose down && docker-compose up -d

# For PM2
pm2 restart your-bot-name

# For direct node
# Stop and start your bot process
```

### 3. Verify Configuration

Check the logs when the cron job runs (default: 8 AM daily):

```bash
# Look for these log messages:

# Source channel configuration:
# ✅ "Including messages from #staff-chat for daily summary"
# ✅ "Including messages from #general for daily summary"
# ⚠️  "No specific source channels configured, using all channels"

# Previous day context:
# ✅ "Found previous day summary for guild 123456789"
# ℹ️  "No previous day summary found for guild 123456789"

# Output channel selection:
# ✅ "Using configured daily summary channel: #daily-summaries"
# ✅ "Sent automatic summary to guild-name #daily-summaries"

# Fallback messages:
# ⚠️  "Using system channel: #general" 
# ⚠️  "Using first available text channel: #random"
```

## 🧪 Testing the Changes

### Test Immediately (Without Waiting for Cron)

You can test the date filtering logic by temporarily modifying the cron schedule:

```bash
# Set to run every minute for testing
SUMMARY_CRON="* * * * *"

# Or test with specific time
SUMMARY_CRON="30 14 * * *"  # 2:30 PM daily
```

**⚠️ Remember to change it back to your desired schedule after testing!**

### Verify Date Range

1. **Check Database**: Ensure messages exist from yesterday
2. **Monitor Logs**: Look for message count in logs
3. **Compare Results**: Summary should only include yesterday's messages

## 🐛 Troubleshooting

### Channel Not Found
```
⚠️ "Configured daily summary channel ID 123456789 not found in guild-name"
```
- **Solution**: Verify the channel ID is correct and the bot has access

### No Messages Found
```
ℹ️ "Skipping summary for guild-name: insufficient messages (0)"
```
- **Common Cause**: No messages from yesterday (happens on first day after deployment)
- **Solution**: Wait until there are messages from the previous day

### Permission Issues
- **Required Permissions**: 
  - Read Message History
  - Send Messages  
  - Embed Links
- **Check**: Bot has these permissions in the target channel

## 📊 Summary Example

When working correctly, you'll see:

```
📊 Daily Chat Summary
📈 Last 24 Hours Activity

**Building on Previous Day**: Yesterday we discussed the new feature rollout timeline and server optimization priorities.

**Today's Key Discussions**:
- Continued planning for the authentication system redesign
- Resolved the database connection issues from yesterday 
- New proposal for user interface improvements
- Follow-up on the security audit recommendations

**Notable Participants**: @Alice led the auth system discussion, @Bob provided database solutions, @Charlie proposed UI changes

**Action Items**: 
- Alice to finish auth system mockups by Friday
- Bob to implement connection pooling fix
- Team to review Charlie's UI proposal next week

**Continuity Notes**: The authentication system discussion builds directly on yesterday's security concerns, showing good progress on the planned roadmap.

---
156 messages from 3 channels • Use /summarize history to view more
```

## 🔄 Rolling Back (If Needed)

If you need to revert to the old behavior:

1. **Remove Environment Variable**: 
   ```bash
   unset DAILY_SUMMARY_CHANNEL_ID
   ```

2. **The bot will automatically fall back to**:
   - System channel → First available text channel

3. **Date filtering** will still use the improved previous-day logic (this is an improvement you likely want to keep)

---

## 💡 Summary of Benefits

✅ **Dedicated Output Channel**: Daily summaries go to your specified channel  
✅ **Selective Source Channels**: Only monitor the channels you care about (staff + user channels)  
✅ **Rolling 24-Hour Window**: Captures the most recent activity regardless of when cron runs  
✅ **Previous Day Context**: AI maintains continuity by considering yesterday's summary  
✅ **Enhanced AI Analysis**: Better summaries that track ongoing discussions and action items  
✅ **Better Logging**: Clear logs showing source channels, context retrieval, and output channels  
✅ **Backward Compatible**: Existing servers work without configuration (falls back to all channels)  
✅ **Flexible Configuration**: Mix staff channels and user channels as needed  

Your daily summaries are now more intelligent, contextual, and targeted to your specific needs!