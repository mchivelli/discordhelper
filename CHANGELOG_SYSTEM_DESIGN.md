# Changelog Version System - Design Document

## Overview
Integrate changelog version tracking with admin tasks, allowing automatic documentation of completed tasks and AI-powered version summaries.

---

## Database Schema

### New Tables

#### `changelog_versions`
```sql
CREATE TABLE IF NOT EXISTS changelog_versions (
  version TEXT PRIMARY KEY,              -- e.g., "1.20.2"
  thread_id TEXT NOT NULL,               -- Discord thread ID
  channel_id TEXT NOT NULL,              -- Parent channel ID
  guild_id TEXT NOT NULL,                -- Guild ID
  status TEXT DEFAULT 'open',            -- 'open' or 'complete'
  is_current INTEGER DEFAULT 0,          -- 1 if current version, 0 otherwise
  created_by TEXT NOT NULL,              -- User ID who created
  created_at INTEGER NOT NULL,           -- Timestamp
  completed_at INTEGER,                  -- Timestamp when marked complete
  completion_report TEXT                 -- AI-generated summary
);
```

#### `changelog_entries`
```sql
CREATE TABLE IF NOT EXISTS changelog_entries (
  id TEXT PRIMARY KEY,                   -- Unique ID
  version TEXT NOT NULL,                 -- Version this belongs to
  entry_type TEXT NOT NULL,              -- 'task', 'manual', 'note'
  entry_text TEXT NOT NULL,              -- The actual entry content
  task_id TEXT,                          -- Reference to admin_tasks (if applicable)
  author_id TEXT NOT NULL,               -- Who created this entry
  created_at INTEGER NOT NULL,           -- Timestamp
  FOREIGN KEY(version) REFERENCES changelog_versions(version) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES admin_tasks(task_id) ON DELETE SET NULL
);
```

---

## Commands

### `/changelog setversion <version>`
**Description**: Set the current changelog version

**Behavior**:
1. If this is the FIRST version:
   - Create version record with `is_current = 1`
   - Create Discord thread: `Changelog: v{version}`
   - Post welcome message with instructions
   
2. If a current version already exists:
   - Show modal asking: "Complete previous version [X]?"
   - Options: "Keep Open" or "Mark Complete"
   - If "Mark Complete": Generate AI summary for old version
   - Create new version and set as current

**Thread Format**:
```
📋 Changelog: v1.20.2
Status: 🟢 Open | Started: 01/10/2025

═══════════════════════════════════════

📌 COMPLETED TASKS
────────────────────────────────────────
✅ Origins and Origin-Classes
   → Completed by: @User
   → Date: 01/10/2025 15:30

✅ Bug Fix: Task buttons not working
   → Completed by: @User
   → Date: 01/10/2025 16:45

📝 MANUAL ENTRIES
────────────────────────────────────────
• Fixed thread archiving issue
• Added claim feature for unassigned tasks

═══════════════════════════════════════
Total: 2 tasks, 2 manual entries
```

### `/changelog add <entry>`
**Description**: Manually add an entry to current version

**Behavior**:
1. Check if current version exists
2. Add entry to `changelog_entries` with type='manual'
3. Update the changelog thread with the new entry
4. Keep entries compact and organized

### `/changelog complete`
**Description**: Mark current version as complete and generate report

**Behavior**:
1. Get current version
2. Fetch all entries for this version
3. Generate AI summary including:
   - What was accomplished
   - Who contributed
   - Key highlights
   - Statistics (tasks completed, entries added)
4. Post summary in thread
5. Lock and archive the thread
6. Rename thread to: `Changelog: v{version} [Complete]`
7. Set `is_current = 0` and `status = 'complete'`

### `/changelog list [status]`
**Description**: List all changelog versions

**Options**:
- `status`: Filter by 'open', 'complete', or 'all' (default: all)

### `/changelog view <version>`
**Description**: View specific version details

---

## Integration with Admin Tasks

### When Admin Task is Marked Complete:

**File**: `src/index.js` - Admin task complete handler

```javascript
// After marking task complete, add to changelog
const currentVersion = db.prepare(
  'SELECT version FROM changelog_versions WHERE is_current = 1'
).get();

if (currentVersion) {
  // Create changelog entry
  const entryId = `entry-${Date.now()}`;
  const entryText = `${task.title}`;
  
  db.prepare(`
    INSERT INTO changelog_entries 
    (id, version, entry_type, entry_text, task_id, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entryId, 
    currentVersion.version, 
    'task', 
    entryText, 
    taskId, 
    interaction.user.id, 
    Date.now()
  );
  
  // Update changelog thread
  await updateChangelogThread(currentVersion.version);
}
```

---

## Thread Update Logic

### Compact Entry Format:
```javascript
function formatChangelogEntries(version) {
  const entries = db.prepare(`
    SELECT * FROM changelog_entries 
    WHERE version = ? 
    ORDER BY created_at ASC
  `).all(version);
  
  let taskSection = '';
  let manualSection = '';
  
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}/${...}`;
    
    if (entry.entry_type === 'task') {
      taskSection += `✅ ${entry.entry_text}\n`;
      taskSection += `   → Completed by: <@${entry.author_id}>\n`;
      taskSection += `   → Date: ${dateStr}\n\n`;
    } else if (entry.entry_type === 'manual') {
      manualSection += `• ${entry.entry_text}\n`;
    }
  }
  
  return { taskSection, manualSection, count: entries.length };
}
```

---

## AI Summary Generation

### Prompt Template:
```
Generate a concise changelog summary for version {version}.

Completed Tasks:
{task_list}

Manual Entries:
{manual_list}

Contributors:
{contributor_list}

Please provide:
1. Brief overview (2-3 sentences)
2. Key accomplishments (bullet points, max 5)
3. Notable contributors and their work
4. One-line version description

Keep it professional, clear, and under 500 words.
```

### Summary Format:
```markdown
## Version 1.20.2 - Summary Report

**Status**: ✅ Complete
**Duration**: 5 days (01/10/2025 - 06/10/2025)
**Contributors**: @User1, @User2, @User3

### Overview
This version focused on improving the admin task system with thread 
management fixes and adding a claim feature for unassigned tasks.

### Key Accomplishments
• Fixed thread archiving and renaming issues
• Implemented task claim feature for admins
• Enhanced task completion workflow
• Added changelog version tracking
• Improved error logging and handling

### Contributors
• @User1: Thread operations fix, changelog system
• @User2: Testing and bug reports
• @User3: UI improvements

### Statistics
📊 2 major tasks completed
📝 3 manual entries added
👥 3 contributors
⏱️ 5 days development time

**Version Description**: Admin task system overhaul with thread management
```

---

## Implementation Order

1. ✅ **Phase 1**: Database schema (add tables)
2. ✅ **Phase 2**: `/changelog setversion` command
3. ✅ **Phase 3**: Thread creation and formatting
4. ✅ **Phase 4**: `/changelog add` command
5. ✅ **Phase 5**: Integration with admin task completion
6. ✅ **Phase 6**: `/changelog complete` with AI summary
7. ✅ **Phase 7**: `/changelog list` and `/changelog view`

---

## Configuration

### Environment Variables
```env
CHANGELOG_CHANNEL_ID=1234567890  # Where changelog threads are created
```

### Bot Permissions Required
- `SEND_MESSAGES`
- `MANAGE_THREADS`
- `EMBED_LINKS`

---

## Testing Checklist

- [ ] Create first version (no previous version)
- [ ] Add manual entry
- [ ] Complete admin task (auto-adds to changelog)
- [ ] Set new version (prompt for completing previous)
- [ ] Mark version complete (AI summary generated)
- [ ] Thread properly renamed and archived
- [ ] List versions shows correct data
- [ ] View specific version works
- [ ] Multiple completed tasks in same version
- [ ] Backwards compatibility with non-changelog tasks

---

## Notes

- **Thread Naming**: Max 100 chars, use version only
- **Compact Format**: Keep entries one-line when possible
- **Auto-update**: Thread updates in real-time as tasks complete
- **Backwards Compat**: Tasks without current version still work normally
