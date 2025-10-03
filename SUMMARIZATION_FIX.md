# 🔧 Summarization System - Comprehensive Fix Guide

**Issue:** Summarization commands not working properly  
**Date:** 2025-10-03 09:30  
**Status:** INVESTIGATION COMPLETE - FIX REQUIRED

---

## 🔍 Root Cause Analysis

The summarization system has **TWO critical issues**:

### Issue 1: Missing `chat_summaries` Query Support in file-db.js
**Problem:** The file-based database doesn't properly handle `chat_summaries` table queries with complex WHERE clauses.

**Evidence:**
- `chat_messages` has full query support (lines 331-371 in file-db.js)
- `chat_summaries` queries fall through to generic handler
- Generic handler doesn't support `date >=` filters or proper ordering

**Impact:**
- `/summarize history` returns empty or incorrect results
- Summaries are saved but not retrieved properly
- Date-based filtering doesn't work

### Issue 2: Message Storage May Not Be Active
**Problem:** Messages need to be stored in the database for summarization to work.

**Evidence:**
- Summarization relies on `getRecentMessages()` from database
- If message tracking isn't running, database will be empty
- Users must use `/summarize fetch_history` first

---

## ✅ Required Fixes

### Fix 1: Add chat_summaries Query Support

**File:** `src/utils/file-db.js`  
**Location:** After line 371 (after chat_messages handler)

**Code to Add:**
```javascript
      // Special handling for chat_summaries queries
      if (this.tableName === 'chat_summaries') {
        const q = this.query.toLowerCase();
        let idx = 0;
        let filtered = items;
        
        // guild filter (required)
        if (q.includes('guild_id =')) {
          const guildId = params[idx++];
          filtered = filtered.filter(item => item.guild_id === guildId);
        }
        
        // date range filter (WHERE guild_id = ? AND date >= ?)
        if (q.includes('date >=')) {
          const cutoffDate = params[idx++];
          filtered = filtered.filter(item => item.date >= cutoffDate);
        }
        
        // channel filter (optional) - can be null for server-wide
        if (q.includes('channel_id =')) {
          const channelId = params[idx++];
          filtered = filtered.filter(item => item.channel_id === channelId);
        }
        
        // ordering
        if (q.includes('order by date desc')) {
          filtered.sort((a, b) => {
            if (a.date < b.date) return 1;
            if (a.date > b.date) return -1;
            return 0;
          });
        } else if (q.includes('order by created_at desc')) {
          filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }
        
        // limit
        if (q.includes('limit')) {
          const limit = params[params.length - 1];
          filtered = filtered.slice(0, typeof limit === 'number' ? limit : 0);
        }
        
        console.log(`DEBUG: all() - chat_summaries filtered count:`, filtered.length);
        return filtered;
      }
```

**Where to Insert:**
Right after the closing brace `}` of the `chat_messages` block (line 371), before `let filtered = items;`

---

### Fix 2: Verify Message Tracking is Running

**Check if messages are being stored:**

1. **Look at index.js line ~280** - Check if message tracking is active
2. **Check data/chat_messages/ directory** - Should contain JSON files
3. **If empty**, messages aren't being tracked

**Solution if not tracking:**
- Messages are tracked automatically when bot sees them
- OR users must run `/summarize fetch_history` first

---

## 🧪 Testing the Fix

### Test 1: Fetch Message History
```
/summarize fetch_history channel:#general days:1
```

**Expected:**
- Bot fetches last 24 hours of messages
- Stores them in `data/chat_messages/`
- Shows count: "X messages stored"

### Test 2: Generate Channel Summary
```
/summarize channel hours:24
```

**Expected:**
- Bot reads messages from database
- Generates AI summary using Claude
- Displays summary embed with message count

### Test 3: View Summary History
```
/summarize history days:7
```

**Expected:**
- Shows list of all summaries from last 7 days
- Groups by date
- Shows channel and message count for each

### Test 4: Server-Wide Summary
```
/summarize server hours:12
```

**Expected:**
- Summarizes all channels (requires Manage Messages permission)
- Shows combined summary
- Stores as server-wide summary (null channel_id)

---

## 🔧 Alternative: Use SQL Database Instead

**If file-db issues persist**, consider switching back to SQLite:

1. **Change in all command files:**
   ```javascript
   // Replace
   const db = require('../utils/file-db');
   // With
   const db = require('../utils/db');
   ```

2. **SQLite handles all queries natively** - no custom parsing needed

3. **Better performance** for large datasets

---

## 📊 Expected Behavior After Fix

### /summarize channel
- ✅ Reads messages from database (not Discord API)
- ✅ Generates AI summary with Claude
- ✅ Saves summary to chat_summaries table
- ✅ Shows embed with summary and message count

### /summarize server
- ✅ Reads messages from all channels
- ✅ Requires "Manage Messages" permission
- ✅ Generates combined AI summary
- ✅ Stores with null channel_id

### /summarize history
- ✅ Retrieves summaries from last N days
- ✅ Groups by date
- ✅ Shows channel and message count
- ✅ Properly filters by guild_id and date range

### /summarize fetch_history
- ✅ Fetches messages from Discord API
- ✅ Stores in database for future use
- ✅ Shows progress and final count
- ✅ Respects time range (1-14 days)

---

## 🚨 Common Issues & Solutions

### "No messages found"
**Cause:** Database is empty  
**Fix:** Run `/summarize fetch_history` first

### "No summaries found"
**Cause:** chat_summaries queries not working  
**Fix:** Apply Fix 1 above (add query support)

### "Error generating summary"
**Cause:** AI API key missing or invalid  
**Fix:** Check ANTHROPIC_API_KEY in environment variables

### Summaries are generic/offline
**Cause:** AI service unavailable or API key missing  
**Fix:** Bot falls back to offline summary - check API key

---

## 📝 Implementation Steps

### Step 1: Apply file-db.js Fix
1. Open `src/utils/file-db.js`
2. Find line 371 (end of chat_messages handler)
3. Insert the chat_summaries handler code shown above
4. Save file

### Step 2: Restart Bot
```bash
pm2 restart discordhelper
# or
docker restart discordhelper
```

### Step 3: Test
1. Run `/summarize fetch_history days:1`
2. Wait for completion
3. Run `/summarize channel hours:24`
4. Verify summary appears
5. Run `/summarize history days:7`
6. Verify history shows the summary

### Step 4: Verify Data
Check these directories:
- `data/chat_messages/` - Should have JSON files
- `data/chat_summaries/` - Should have summary JSON files

---

## 🎯 Success Criteria

After fix:
- ✅ `/summarize fetch_history` stores messages successfully
- ✅ `/summarize channel` generates summaries
- ✅ `/summarize server` works for admins
- ✅ `/summarize history` shows past summaries
- ✅ No "No summaries found" errors (when summaries exist)
- ✅ Proper date filtering in history

---

## 📞 Additional Support

If issues persist after applying fixes:

1. **Check logs:** Look for errors in bot console
2. **Check data directories:** Verify JSON files exist
3. **Test AI API:** Verify ANTHROPIC_API_KEY is valid
4. **Check permissions:** Bot needs Read Message History

---

**Status:** Ready to apply Fix 1. The code is provided above - just needs to be inserted into file-db.js at the correct location.
