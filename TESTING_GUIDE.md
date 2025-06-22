# Discord Bot Testing Guide

## New Features to Test

### 1. 🏛️ Faction Management System

#### Test Faction Creation
```
/task faction create name:"Mythica Empire" color:#FF0000 members:@user1 @user2 @user3
```

**Expected Results**:
- ✅ Creates a role called "Mythica Empire" with red color
- ✅ Adds all mentioned members to the role
- ✅ Updates member nicknames with `[MYT]` prefix
- ✅ Shows success embed with member status
- ✅ Handles nickname length limits (32 chars max)

#### Test Faction Deletion
```
/task faction delete role:@Mythica Empire
```

**Expected Results**:
- ✅ Removes the role from all members
- ✅ Cleans up member nicknames (removes `[MYT]` prefix)
- ✅ Deletes the role completely
- ✅ Shows success embed with cleanup status

#### Test Faction Abbreviation Generation
| Faction Name | Expected Abbreviation |
|---|---|
| Mythica Empire | MYT |
| The SunForge Empire | SFE |
| Red Kingdom | RDK |
| Order of the Phoenix | OTP |
| Warriors | WAR |

### 2. 📋 DevLog Integration

#### Test Task Completion DevLog
1. Create a task with stages:
```
/task create name:"Test Website Update" contents:"Update the main website" aihelp:true
```

2. Complete all stages using the bot interface

**Expected Results**:
- ✅ When all stages are completed, a DevLog entry is automatically posted
- ✅ DevLog appears in Channel ID: `1348366844225917030`, Thread ID: `1386336937115389952`
- ✅ DevLog includes:
  - Task name and description
  - Task ID
  - Completion date
  - Who completed it
  - All completed stages with dates and notes
  - Total completion time

### 3. 🤖 Enhanced AI Integration

#### Test AI Follow-up Suggestions
1. Complete a task with multiple stages
2. Check that AI suggests relevant follow-up tasks
3. Test creating follow-up tasks from suggestions

**Expected Results**:
- ✅ AI suggests 2-4 relevant follow-up tasks
- ✅ User can create follow-up tasks via modal
- ✅ Follow-up tasks can have AI-generated stages
- ✅ Clear workflow from completion → suggestion → creation

### 4. 🛠️ Fixed Issues Testing

#### Test Task Removal (Previously Crashed)
```
/task create name:"Test Remove Task" contents:"Test task for removal"
/task remove id:[task_id]
```

**Expected Results**:
- ✅ No more "Cannot read properties of null (reading 'count')" error
- ✅ Task and all stages removed successfully
- ✅ Clear success message with count of removed stages

#### Test Count Queries
```
/task analytics
/task list id:[any_task_id]
```

**Expected Results**:
- ✅ No crashes on COUNT queries
- ✅ Proper handling of empty results
- ✅ Accurate completion percentages

## Complete Workflow Test

### End-to-End Task Management
1. **Create faction**:
   ```
   /task faction create name:"Test Alliance" color:#00FF00 members:@testuser
   ```

2. **Create task with AI**:
   ```
   /task create name:"Alliance Strategy Meeting" aihelp:true contents:"Plan quarterly strategy"
   ```

3. **Accept AI suggestions** and complete stages

4. **Verify DevLog entry** is created automatically

5. **Create follow-up task** from AI suggestions

6. **Clean up**:
   ```
   /task remove id:[task_id]
   /task faction delete role:@Test Alliance
   ```

## Color Autocomplete Testing

Test the color autocomplete for faction creation:
- Type `/task faction create name:"Test" color:` and verify color suggestions appear
- Test partial matching (typing "red" should show red options)
- Test hex code validation (invalid codes should be rejected)

## Error Handling Tests

### Invalid Inputs
- Invalid hex colors (should be rejected)
- Non-existent task IDs (should show helpful errors)
- Missing permissions (should show permission errors)
- Invalid member mentions (should handle gracefully)

### Edge Cases
- Very long faction names (should handle truncation)
- Members without permission to change nicknames
- Channels/threads that don't exist
- AI service unavailable (should use fallbacks)

## Performance Tests

- Create multiple tasks simultaneously
- Test with large numbers of faction members
- Verify database operations don't block
- Check memory usage with many concurrent operations

## Integration Tests

### DevLog Channel Setup
Verify the bot can access:
- Channel ID: `1348366844225917030`
- Thread ID: `1386336937115389952`

If these don't exist, the bot should log warnings but continue functioning.

### AI Service Testing
```
/task check-ai
```
Should show current AI service status and provide troubleshooting tips if needed.

## Success Criteria

All tests should pass without errors, and the bot should:
- ✅ Handle all edge cases gracefully
- ✅ Provide clear user feedback
- ✅ Log appropriate information for debugging
- ✅ Maintain data consistency
- ✅ Respect Discord's rate limits and API constraints 