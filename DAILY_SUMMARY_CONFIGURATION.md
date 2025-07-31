# 📊 Daily Summary Configuration Guide

## Overview
This document explains the updated Daily Summarization features for your Discord bot. The changes address your requirements to:

1. **Post Daily Summarizations in a different channel**
2. **Limit summarizations to previous day's messages only (not last 24 hours)**

## 🆕 What's Changed

### 1. Channel Configuration
- **New Environment Variable**: `DAILY_SUMMARY_CHANNEL_ID`
- The bot now supports configuring a specific channel for daily summaries
- Maintains backward compatibility with existing fallback logic

### 2. Improved Date Filtering  
- **Previous Issue**: Bot used "last 24 hours" which could include today's messages
- **Fixed**: Now uses **previous day only** (yesterday 00:00:00 to 23:59:59)
- Ensures summaries are truly for the previous day, not a rolling 24-hour window

## ⚙️ Configuration

### Environment Variables

Add this to your `.env` file or environment configuration:

```env
# Daily Summary Channel Configuration (NEW)
DAILY_SUMMARY_CHANNEL_ID=your_channel_id_here

# Existing configuration (optional)
SUMMARY_CRON=0 8 * * *                    # Default: 8 AM daily
SUMMARIZATION_MODEL=anthropic/claude-3.5-haiku
```

### How to Get Channel ID

1. **Enable Developer Mode in Discord:**
   - User Settings → Advanced → Developer Mode (ON)

2. **Get Channel ID:**
   - Right-click the channel you want to use for daily summaries
   - Click "Copy Channel ID"
   - Paste this ID as the value for `DAILY_SUMMARY_CHANNEL_ID`

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

## 📅 Date Filtering Improvements

### Before (Issues)
```javascript
// Got messages from last 24 hours
const messages = getRecentMessages(db, guild.id, null, 24);
// If cron runs at 8 AM, this gets messages from yesterday 8 AM to today 8 AM
```

### After (Fixed)
```javascript
// Gets messages from previous day only
const messages = getPreviousDayMessages(db, guild.id, null);
// Always gets messages from yesterday 00:00:00 to yesterday 23:59:59
```

### Function Details
- **`getPreviousDayMessages()`**: New function specifically for daily summaries
- **Precise Time Range**: Yesterday start (00:00:00) to yesterday end (23:59:59)
- **Timezone Aware**: Uses server's local timezone
- **Consistent Results**: Same summary content regardless of when cron job runs

## 🚀 Deployment Steps

### 1. Update Environment Variables

Add the new variable to your environment:

```bash
# Option 1: Add to .env file
echo "DAILY_SUMMARY_CHANNEL_ID=your_channel_id_here" >> .env

# Option 2: Set environment variable directly
export DAILY_SUMMARY_CHANNEL_ID=your_channel_id_here
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
# ✅ "Using configured daily summary channel: #your-channel"
# ✅ "Sent automatic summary to guild-name #your-channel"

# Or these fallback messages:
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
Daily Chat Summary
📊 Yesterday's Activity

[AI-generated summary of yesterday's messages]

---
142 messages processed • Use /summarize history to view more
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

✅ **Dedicated Channel**: Daily summaries go to your specified channel  
✅ **Precise Date Range**: Only previous day's messages (not rolling 24 hours)  
✅ **Better Logging**: Clear logs showing which channel is being used  
✅ **Backward Compatible**: Existing servers work without configuration  
✅ **Consistent Results**: Same summary content regardless of execution time  

Your daily summaries are now more predictable and can be directed to the appropriate channel!