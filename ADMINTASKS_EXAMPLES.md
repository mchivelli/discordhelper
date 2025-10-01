# Admin Tasks - Visual Examples

## Example 1: Creating and Completing a Task

### Step 1: Create Task
```
/admintasks create title:"Review moderation logs"
```

**Bot Response:**
```
┌─────────────────────────────────────────┐
│ 📋 Review moderation logs               │
├─────────────────────────────────────────┤
│ No description provided                 │
│                                          │
│ 👤 Assigned To                          │
│ Unassigned - Click below to assign     │
│ yourself                                │
│                                          │
│ 📊 Status                               │
│ 🔄 Pending                              │
│                                          │
│ Task ID: st_1696167123456_abc123       │
│ Created: 10/1/2025, 3:05:23 PM         │
├─────────────────────────────────────────┤
│ [✋ Assign Me] [📄 Details]            │
└─────────────────────────────────────────┘
```

### Step 2: User Clicks "Assign Me"
**Updated Message:**
```
┌─────────────────────────────────────────┐
│ 📋 Review moderation logs               │
├─────────────────────────────────────────┤
│ No description provided                 │
│                                          │
│ 👤 Assigned To                          │
│ @JohnDoe                                │
│                                          │
│ 📊 Status                               │
│ 🔄 Pending                              │
│                                          │
│ Task ID: st_1696167123456_abc123       │
│ Created: 10/1/2025, 3:05:23 PM         │
├─────────────────────────────────────────┤
│ [✅ Mark Complete] [📄 Details]        │
└─────────────────────────────────────────┘
```

### Step 3: User Clicks "Mark Complete"
**Collapsed Message:**
```
┌─────────────────────────────────────────┐
│ ✅ Review moderation logs               │
├─────────────────────────────────────────┤
│ Completed: 10/1/2025, 3:15:47 PM       │
│                                          │
│ Task ID: st_1696167123456_abc123       │
└─────────────────────────────────────────┘
```

---

## Example 2: Task with Assignee

### Create Task with Assignee
```
/admintasks create title:"Update server rules" assignee:@ModeratorName description:"Add new guidelines for voice channels"
```

**Bot Response:**
```
┌─────────────────────────────────────────┐
│ 📋 Update server rules                  │
├─────────────────────────────────────────┤
│ Add new guidelines for voice channels   │
│                                          │
│ 👤 Assigned To                          │
│ @ModeratorName                          │
│                                          │
│ 📊 Status                               │
│ 🔄 Pending                              │
│                                          │
│ Task ID: st_1696167234567_def456       │
│ Created: 10/1/2025, 3:07:14 PM         │
├─────────────────────────────────────────┤
│ [✅ Mark Complete] [📄 Details]        │
└─────────────────────────────────────────┘
```

---

## Example 3: Listing Tasks with Pagination

### List Command (Page 1)
```
/admintasks list
```

**Bot Response:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Admin Tasks                                               │
├─────────────────────────────────────────────────────────────┤
│ Showing page 1 of 3 (12 total tasks)                        │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ 🔄 Update server rules                                      │
│ ID: st_1696167234567_def456                                │
│ Assignee: @ModeratorName                                    │
│ Status: pending                                             │
│ Description: Add new guidelines for voice channels          │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ ✅ Review moderation logs                                   │
│ ID: st_1696167123456_abc123                                │
│ Assignee: @JohnDoe                                          │
│ Status: completed                                           │
│ Completed: 10/1/2025, 3:15:47 PM                           │
│ Description: No description                                 │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ 🔄 Plan next event                                          │
│ ID: st_1696166999123_ghi789                                │
│ Assignee: Unassigned (self-assign available)               │
│ Status: pending                                             │
│ Description: Coordinate with team for monthly event         │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ 🔄 Check server backups                                     │
│ ID: st_1696166888234_jkl012                                │
│ Assignee: @AdminUser                                        │
│ Status: pending                                             │
│ Description: No description                                 │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ ✅ Prepare monthly report                                   │
│ ID: st_1696166777345_mno345                                │
│ Assignee: @JaneDoe                                          │
│ Status: completed                                           │
│ Completed: 9/30/2025, 11:45:22 PM                          │
│ Description: Compile stats for September                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│      [Page 1/3]       [Next ▶]                             │
└─────────────────────────────────────────────────────────────┘
```

### After Clicking "Next ▶"
```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Admin Tasks                                               │
├─────────────────────────────────────────────────────────────┤
│ Showing page 2 of 3 (12 total tasks)                        │
│                                                              │
│ ... (5 more tasks) ...                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [◀ Previous]    [Page 2/3]    [Next ▶]                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Example 4: My Tasks

### MyTasks Command
```
/admintasks mytasks
```

**Bot Response (Ephemeral - only visible to you):**
```
┌─────────────────────────────────────────────────────────────┐
│ 📋 My Admin Tasks                                            │
├─────────────────────────────────────────────────────────────┤
│ Showing page 1 of 1 (2 total tasks)                         │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ ✅ Review moderation logs                                   │
│ ID: st_1696167123456_abc123                                │
│ Status: completed                                           │
│ Completed: 10/1/2025, 3:15:47 PM                           │
│ Description: No description                                 │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ 🔄 Organize community poll                                  │
│ ID: st_1696165555666_pqr678                                │
│ Status: pending                                             │
│ Description: Create poll for next game night theme          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Example 5: Task Details

### Click "📄 Details" Button
**Bot Response (Ephemeral):**
```
┌─────────────────────────────────────────┐
│ 📋 Update server rules                  │
├─────────────────────────────────────────┤
│ Add new guidelines for voice channels   │
│                                          │
│ 👤 Assigned To                          │
│ @ModeratorName                          │
│                                          │
│ 📊 Status                               │
│ pending                                 │
│                                          │
│ 👨‍💼 Creator                            │
│ @AdminUser                              │
│                                          │
│ 📅 Created                              │
│ 10/1/2025, 3:07:14 PM                  │
│                                          │
│ Task ID: st_1696167234567_def456       │
└─────────────────────────────────────────┘
```

---

## Example 6: Multi-Assignee Task

### Multiple Users Self-Assign
```
Initial: [✋ Assign Me] button

User A clicks → Assignee: @UserA
User B clicks → Assignee: @UserA, @UserB
User C clicks → Assignee: @UserA, @UserB, @UserC
```

**Final Display:**
```
┌─────────────────────────────────────────┐
│ 📋 Organize community event             │
├─────────────────────────────────────────┤
│ Coordinate team for monthly meetup      │
│                                          │
│ 👤 Assigned To                          │
│ @UserA, @UserB, @UserC                  │
│                                          │
│ 📊 Status                               │
│ 🔄 Pending                              │
│                                          │
│ Task ID: st_1696168888999_stu901       │
│ Created: 10/1/2025, 3:34:48 PM         │
├─────────────────────────────────────────┤
│ [✅ Mark Complete] [📄 Details]        │
└─────────────────────────────────────────┘
```

Any of the three assignees can mark it complete.

---

## Comparison: Before vs After Completion

### BEFORE (Full Display - Takes ~15 lines)
```
┌─────────────────────────────────────────┐
│ 📋 Check server backups                 │
├─────────────────────────────────────────┤
│ Verify all backups completed            │
│ successfully                            │
│                                          │
│ 👤 Assigned To                          │
│ @AdminUser                              │
│                                          │
│ 📊 Status                               │
│ 🔄 Pending                              │
│                                          │
│ Task ID: st_1696166888234_jkl012       │
│ Created: 10/1/2025, 2:54:48 PM         │
├─────────────────────────────────────────┤
│ [✅ Mark Complete] [📄 Details]        │
└─────────────────────────────────────────┘
```

### AFTER (Collapsed - Takes ~4 lines)
```
┌─────────────────────────────────────────┐
│ ✅ Check server backups                 │
├─────────────────────────────────────────┤
│ Completed: 10/1/2025, 4:22:15 PM       │
│                                          │
│ Task ID: st_1696166888234_jkl012       │
└─────────────────────────────────────────┘
```

**Space Saved**: ~73% reduction in message height!

---

## Workflow Examples

### Workflow 1: Quick Team Task
1. Admin creates unassigned task
2. First available team member self-assigns
3. They complete it when done
4. Message collapses automatically

### Workflow 2: Assigned Task with Handoff
1. Admin creates task assigned to User A
2. User A reviews and starts work
3. User A completes the task
4. Message collapses, providing visual confirmation

### Workflow 3: Collaborative Task
1. Admin creates unassigned task
2. Multiple team members self-assign
3. Any assigned user can complete it
4. Message shows all contributors before collapse

### Workflow 4: Task Review
1. Admin runs `/admintasks list`
2. Reviews pending vs completed tasks
3. Checks which tasks need attention
4. Uses pagination to see all tasks

---

## Color Coding

- **Pending Tasks**: Blue (`0x3498db`)
- **Completed Tasks**: Green (`0x2ecc71`)
- **My Tasks List**: Purple (`0x9b59b6`)

This visual distinction helps quickly identify task states in busy channels.
