# Testing Guide

## Prerequisites

1. Bot is running and connected to your Discord server
2. You have a channel with some chat activity
3. Bot has `Read Message History` permission in target channels

---

## Test 1: Backfill Messages

```
/summarize fetch_history channel:#general days:3
```

**Check:**
- Shows "Newly Stored" count > 0 (first run)
- Run it again — "Already Existed" should match previous "Newly Stored", new stored = 0
- Bot messages show as skipped

---

## Test 2: Generate a Summary

```
/summarize channel channel:#general hours:24
```

**Check:**
- Returns an AI-generated summary embed
- This creates a `chat_summaries` entry needed for Test 4

---

## Test 3: Basic /ask (raw strategy)

Pick a channel with **no summary** generated yet:

```
/ask channel question:"What are people talking about?" channel:#other-channel hours:12
```

**Check:**
- Strategy shows: `📝 Raw Messages`
- Answer references actual chat content
- Coverage % shown in footer

---

## Test 4: Summary-aware /ask

Use the same channel you summarized in Test 2:

```
/ask channel question:"What was discussed?" channel:#general hours:24
```

**Check:**
- Strategy shows: `📚 Summaries + Targeted Messages` or `📚 Existing Summaries`
- Should be faster than Test 3

---

## Test 5: Keyword Targeting

```
/ask channel question:"Did anyone mention [specific topic]?" channel:#general hours:48
```

Replace `[specific topic]` with something actually discussed.

**Check:**
- Strategy: `📚 Summaries + Targeted Messages`
- Answer is relevant to the keyword

---

## Test 6: Coverage Warning

```
/ask channel question:"What happened this week?" hours:168
```

**Check:**
- If bot was offline for some hours, coverage < 100%
- If < 80%, yellow warning field appears

---

## Test 7: No Messages

```
/ask channel question:"anything" channel:#empty-channel hours:1
```

**Check:**
- Returns "No messages found" with helpful suggestions

---

## Quick Checklist

| Test | Command | Pass? |
|------|---------|-------|
| Backfill stores new messages | `/summarize fetch_history` | |
| Backfill skips duplicates on re-run | `/summarize fetch_history` (again) | |
| Summary generates | `/summarize channel` | |
| /ask works with raw messages | `/ask channel` (no summary) | |
| /ask uses summaries when available | `/ask channel` (has summary) | |
| /ask keyword targeting works | `/ask channel question:"[topic]"` | |
| Coverage warning shows when data gaps | `/ask channel hours:168` | |
| No messages handled gracefully | `/ask channel` (empty channel) | |
