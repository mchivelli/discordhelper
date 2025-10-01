# Admin Tasks - Testing Checklist

## Button Interaction Testing

### ✅ Complete Button Tests

#### Test 1: Complete as Assignee
1. Create task: `/admintasks create title:"Test Complete" assignee:@YourName`
2. **Expected**: Task shows with "✅ Mark Complete" button
3. Click "✅ Mark Complete"
4. **Expected**: 
   - Message edits in-place to collapsed format
   - Shows: "✅ Test Complete"
   - Shows completion timestamp
   - No buttons remain
   - Database status = 'completed'
5. **Verify Logs**:
   ```
   Admin task st_xxx being completed by User#1234
   Updating message 123456789 with collapsed format
   Admin task st_xxx successfully completed and collapsed
   ```

#### Test 2: Complete as Admin (not assignee)
1. Create task: `/admintasks create title:"Admin Test" assignee:@OtherUser`
2. Have an admin (not the assignee) click "✅ Mark Complete"
3. **Expected**: Task completes successfully (admins have override permission)
4. **Verify**: Message collapses, logs show admin permission used

#### Test 3: Complete as Creator
1. User A creates unassigned task
2. User B self-assigns
3. User A (creator, not assignee) clicks complete
4. **Expected**: Task completes (creator has permission)

#### Test 4: Complete Permission Denied
1. Create task: `/admintasks create title:"Permission Test" assignee:@UserA`
2. Have UserB (non-admin, not creator, not assignee) click complete
3. **Expected**: Error message "⛔ You do not have permission to complete this task."
4. **Verify**: Task remains pending, message unchanged

### ✋ Self-Assign Button Tests

#### Test 5: First Assignment
1. Create unassigned task: `/admintasks create title:"Self-Assign Test"`
2. **Expected**: Shows "✋ Assign Me" button
3. Click "✋ Assign Me"
4. **Expected**:
   - Message updates in-place
   - Shows your username as assignee
   - Button changes to "✅ Mark Complete"
   - Database assignee_ids includes your ID
5. **Verify Logs**:
   ```
   User User#1234 self-assigning to task st_xxx
   Updating message 123456789 with new assignee
   Admin task st_xxx successfully self-assigned
   ```

#### Test 6: Multiple Assignments
1. Create unassigned task
2. User A clicks "✋ Assign Me"
3. **Expected**: Shows "User A" as assignee
4. User B clicks "✅ Mark Complete" (should see button)
5. **Expected**: Error "⛔ You do not have permission"
6. Check with `/admintasks mytasks user:@UserA` - should show task
7. Check with `/admintasks mytasks user:@UserB` - should NOT show task

#### Test 7: Duplicate Assignment Prevention
1. Create unassigned task
2. User A self-assigns
3. User A clicks complete button again... wait no, button changes
4. Create NEW unassigned task
5. User A self-assigns
6. Check database - assignee_ids should be ["userA_id"] only once

### 📄 Details Button Tests

#### Test 8: View Details (Anyone)
1. Create any task
2. Non-admin clicks "📄 Details"
3. **Expected**: 
   - Ephemeral message (only visible to clicker)
   - Shows full task info
   - Shows creator, assignees, dates, status
4. **Verify**: Other users can't see the details message

#### Test 9: Details of Completed Task
1. Complete a task
2. Click "📄 Details" from list view
3. **Expected**:
   - Shows completed status
   - Shows completion timestamp
   - All fields populated

### 🗂️ List Pagination Tests

#### Test 10: Single Page
1. Create 3 tasks
2. Run `/admintasks list`
3. **Expected**: 
   - Shows all 3 tasks
   - No pagination buttons (only 1 page)

#### Test 11: Multiple Pages
1. Create 12 tasks (more than 5)
2. Run `/admintasks list`
3. **Expected**:
   - Shows 5 tasks on page 1
   - Shows "Page 1/3" button (disabled)
   - Shows "Next ▶" button
4. Click "Next ▶"
5. **Expected**:
   - Message updates in-place
   - Shows next 5 tasks
   - Shows "◀ Previous", "Page 2/3", "Next ▶"
6. Click "◀ Previous"
7. **Expected**: Returns to page 1

#### Test 12: Last Page
1. Navigate to last page
2. **Expected**:
   - Shows remaining tasks (1-5)
   - "Next ▶" button missing
   - Only "◀ Previous" and page indicator

## Message Update Verification

### Test 13: Message ID Consistency
1. Create task and note the message ID
2. Check database: `task.message_id` should match
3. Click any button
4. **Verify Logs**: No "message ID mismatch" warnings
5. **Expected**: Same message ID before and after button click

### Test 14: Multiple Task Messages
1. Create Task A
2. Create Task B
3. Create Task C
4. Click complete on Task B's message
5. **Expected**: 
   - Only Task B's message updates
   - Tasks A and C remain unchanged
6. **Verify**: Each button only affects its own message

### Test 15: Old Messages (No stored message_id)
1. Manually create task in database without message_id
2. Post message with buttons using that task ID
3. Click button
4. **Expected**: 
   - Warning logged about missing message_id
   - Still functions correctly
   - Updates the message that was clicked

## Command Tests

### Test 16: View Own Tasks
1. Self-assign to 2 tasks
2. Run `/admintasks mytasks`
3. **Expected**: Shows only your 2 tasks (ephemeral)

### Test 17: View Other User's Tasks (Admin)
1. Have UserA assigned to tasks
2. Admin runs: `/admintasks mytasks user:@UserA`
3. **Expected**: Shows UserA's tasks
4. Title shows "Admin Tasks for UserA"

### Test 18: View Other User's Tasks (Non-Admin)
1. UserB tries: `/admintasks mytasks user:@UserA`
2. **Expected**: Error "⛔ You need Administrator permission"

### Test 19: List All Tasks
1. Create mix of pending and completed tasks
2. Run `/admintasks list`
3. **Expected**:
   - Shows all tasks (both statuses)
   - Completed tasks show green ✅
   - Pending tasks show blue 🔄
   - Each task shows assignee info

## Edge Cases

### Test 20: Empty Task List
1. New server with no tasks
2. Run `/admintasks list`
3. **Expected**: "📭 No admin tasks found"

### Test 21: No Assigned Tasks
1. Run `/admintasks mytasks` with no assignments
2. **Expected**: "📭 You have no assigned admin tasks"

### Test 22: Rapid Button Clicks
1. Create task with self-assign button
2. Quickly click "✋ Assign Me" multiple times
3. **Expected**: 
   - Only one assignment recorded
   - No duplicate IDs in assignee_ids

### Test 23: Concurrent Assignments
1. Create unassigned task
2. Have 3 users click "✋ Assign Me" near-simultaneously
3. **Expected**: All 3 users should be assigned
4. **Verify**: Database has all 3 user IDs in assignee_ids array

### Test 24: Task with Special Characters
1. Create: `/admintasks create title:"Test \"Quotes\" & <HTML>"`
2. **Expected**: 
   - Displays correctly
   - No parsing errors
   - Buttons work normally

### Test 25: Very Long Title/Description
1. Create task with 100+ character title
2. **Expected**:
   - Displays properly (may truncate in some views)
   - Buttons work
   - Details shows full text

## Database Verification

### After Each Test:
- [ ] Check task exists in database
- [ ] Verify status field ('pending' or 'completed')
- [ ] Verify assignee_ids is valid JSON array
- [ ] Verify message_id matches Discord message
- [ ] Verify completed_at timestamp (if completed)

### Query Examples:
```javascript
// Check task
db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);

// Check assignee_ids is valid JSON
const task = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);
JSON.parse(task.assignee_ids); // Should not throw error

// Verify message_id
task.message_id === discordMessageId
```

## Log Verification

Look for these log patterns:

### Successful Complete:
```
Admin task st_xxx being completed by User#1234 (admin:true/false, creator:true/false, assignee:true/false)
Updating message 123456789 with collapsed format for task st_xxx
Admin task st_xxx successfully completed and collapsed by User#1234
```

### Successful Self-Assign:
```
User User#1234 self-assigning to task st_xxx
Updating message 123456789 with new assignee for task st_xxx
Admin task st_xxx successfully self-assigned by User#1234
```

### Message ID Mismatch (Warning):
```
Button message ID mismatch: button on 111111, task stored 222222
```

### Permission Denied:
(No specific log, just error message to user)

## Performance Tests

### Test 26: Large Task List
1. Create 100 tasks
2. Run `/admintasks list`
3. **Expected**: 
   - Responds within 3 seconds
   - Shows "Page 1/20"
   - Pagination works smoothly

### Test 27: Many Assignees
1. Create task
2. Have 10 users self-assign
3. **Expected**:
   - All assignees shown in embed
   - Any can complete
   - Database query performs well

## Backward Compatibility

### Test 28: Existing Task Data
1. If upgrading, verify old tasks still work
2. **Expected**: 
   - Old tasks show correctly
   - Empty assignee_ids default to []
   - Buttons work on old tasks
   - No migration errors

---

## Quick Test Summary

Run through these 5 core scenarios for quick validation:

1. ✅ **Create & Complete**: Create task, assign, complete → verifies full workflow
2. 🔄 **Self-Assign**: Create unassigned, self-assign, complete → verifies assignment
3. 📄 **Pagination**: Create 8 tasks, paginate through list → verifies pagination
4. 👥 **Multi-User**: Two users assign to same task → verifies multi-assignee
5. 🔒 **Permissions**: Non-assignee tries to complete → verifies security

All 5 pass? ✅ System is working correctly!

---

## Troubleshooting

### Button doesn't update message
- Check: Is `interaction.message` defined?
- Check: Does `client.commands.get('admintasks')` return command?
- Check logs for "Could not update message"

### Wrong message updates
- Check logs for "message ID mismatch"
- Verify task.message_id matches button's message

### Permission errors when should work
- Verify user is in assignee_ids array
- Check isAdmin, isCreator, isAssignee flags in logs
- Verify user has Administrator role

### Assignee not showing
- Check: Is assignee_ids valid JSON?
- Check: Does it contain the user ID string?
- Try: Re-parse with `JSON.parse(task.assignee_ids)`
