# Admin Tasks Guide

## Overview

The `/admintasks` command provides a streamlined system for managing simple administrative tasks within your Discord server. Tasks are displayed as embeds with interactive buttons, and completed tasks automatically collapse to a smaller, cleaner format.

## Features

✅ **Auto-collapse on completion** - Completed tasks shrink to a compact single-line format  
✅ **Self-assignment** - Tasks without assignees show a button for users to assign themselves  
✅ **Multi-assignee support** - Tasks can have multiple assigned users  
✅ **Pagination** - List commands support pagination (5 tasks per page)  
✅ **Backward compatible** - Works seamlessly with existing task data  

## Commands

### Create a Task

```
/admintasks create title:<title> [description:<desc>] [assignee:@user]
```

**Parameters:**
- `title` (required) - Brief title for the task
- `description` (optional) - Detailed description of what needs to be done
- `assignee` (optional) - User to assign the task to. Leave empty for self-assignment

**Examples:**
```
/admintasks create title:"Update server rules"
/admintasks create title:"Review moderation logs" assignee:@John
/admintasks create title:"Plan next event" description:"Coordinate with team for monthly community event"
```

### List All Tasks

```
/admintasks list [page:<number>]
```

Shows all admin tasks for the server with pagination support.

**Parameters:**
- `page` (optional) - Page number to display (default: 1)

**Features:**
- Displays 5 tasks per page
- Shows assignees, status, and completion info
- Interactive pagination buttons for multi-page results

### List Your Tasks

```
/admintasks mytasks [page:<number>]
```

Shows only tasks assigned to you (ephemeral - only you can see it).

**Parameters:**
- `page` (optional) - Page number to display (default: 1)

## Task States

### Pending Tasks (Full Display)

Pending tasks show as full embeds with:
- Title and description
- Assignee information
- Interactive buttons:
  - **✅ Mark Complete** - Complete the task (shown if you're assigned)
  - **✋ Assign Me** - Assign yourself (shown if unassigned)
  - **📄 Details** - View detailed information

### Completed Tasks (Collapsed Display)

Once marked complete, tasks automatically collapse to:
- ✅ Title
- Completion timestamp
- No action buttons

This keeps your channels clean while preserving task history.

## Buttons and Interactions

### ✅ Mark Complete
- Available to: Admins, task creator, and assigned users
- Action: Marks task as complete and collapses the message
- The original message is edited in-place

### ✋ Assign Me
- Available to: All users (when task is unassigned)
- Action: Assigns the task to you and updates the message
- Multiple users can self-assign to the same task

### 📄 Details
- Available to: Everyone
- Action: Shows detailed task information (ephemeral)
- Includes: Creator, assignees, created date, completion date

### Pagination Buttons
- **◀ Previous** - Go to previous page
- **Page X/Y** - Current page indicator
- **Next ▶** - Go to next page

## Permissions

All `/admintasks` commands require **Administrator** permissions to execute.

However:
- Any user can interact with task buttons (self-assign, view details)
- Only admins, creators, or assigned users can complete tasks

## Database Schema

Tasks are stored in the `simple_tasks` table with the following fields:

```sql
CREATE TABLE simple_tasks (
  id TEXT PRIMARY KEY,           -- Unique task ID (st_timestamp_random)
  title TEXT NOT NULL,           -- Task title
  description TEXT,              -- Optional description
  assignee_ids TEXT DEFAULT '[]', -- JSON array of assigned user IDs
  creator_id TEXT NOT NULL,      -- User who created the task
  guild_id TEXT NOT NULL,        -- Discord server ID
  status TEXT DEFAULT 'pending', -- 'pending' or 'completed'
  completed_at INTEGER,          -- Timestamp when completed
  created_at INTEGER NOT NULL,   -- Timestamp when created
  message_id TEXT,               -- Discord message ID
  channel_id TEXT                -- Discord channel ID
);
```

## Technical Details

### Message Editing
When a task is completed, the bot edits the original message rather than sending a new one. This:
- Keeps channels clean
- Preserves task location in conversation
- Maintains task history without clutter

### Multi-Assignee Support
The `assignee_ids` field stores a JSON array of user IDs, allowing:
- Multiple users assigned to one task
- Flexible assignment workflows
- Proper permission checks for all assignees

### Backward Compatibility
The system handles old task entries gracefully:
- Empty assignee_ids default to `[]`
- Missing fields use sensible defaults
- Existing messages continue to work

### Pagination Implementation
List commands paginate at 5 items per page with:
- Efficient database queries
- Interactive button navigation
- Page validation and bounds checking

## Best Practices

1. **Use descriptive titles** - Keep them concise but clear
2. **Add descriptions for complex tasks** - Provide context
3. **Leave assignee empty for collaborative tasks** - Let team members self-assign
4. **Assign specific users for urgent tasks** - Ensures accountability
5. **Review with `/admintasks list`** regularly - Stay on top of pending work

## Troubleshooting

**Task buttons not working?**
- Ensure you have proper permissions
- Check if you're assigned to the task
- Verify you're an admin for completion rights

**List showing empty?**
- Confirm tasks exist in the guild
- Check pagination - try different pages
- Use `/admintasks mytasks` to see your specific tasks

**Tasks not collapsing?**
- This is automatic when marking complete
- Ensure the bot has permission to edit messages
- Check bot's role has "Manage Messages" permission

## Examples

### Quick Task for Team
```
/admintasks create title:"Check server backups"
```
Anyone can self-assign and complete it.

### Assigned Task
```
/admintasks create title:"Review ban appeals" assignee:@ModeratorName description:"Review pending appeals in mod channel"
```
Specific user is assigned with clear instructions.

### Task with Context
```
/admintasks create title:"Prepare monthly report" description:"Compile activity stats, moderation actions, and member growth for March. Due by end of month."
```
Detailed description provides full context.

---

**Need help?** Contact a server administrator or check the bot documentation.
