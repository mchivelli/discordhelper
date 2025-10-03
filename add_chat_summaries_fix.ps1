# PowerShell script to add chat_summaries support to file-db.js

$filePath = "c:\Users\paulm\Desktop\discordhelper\src\utils\file-db.js"
$content = Get-Content $filePath -Raw

# The code to insert
$insertCode = @"

      // Special handling for chat_summaries queries
      if (this.tableName === 'chat_summaries') {
        const q = this.query.toLowerCase();
        let idx = 0;
        let filtered = items;
        
        if (q.includes('guild_id =')) {
          const guildId = params[idx++];
          filtered = filtered.filter(item => item.guild_id === guildId);
        }
        
        if (q.includes('date >=')) {
          const cutoffDate = params[idx++];
          filtered = filtered.filter(item => item.date >= cutoffDate);
        }
        
        if (q.includes('channel_id =')) {
          const channelId = params[idx++];
          filtered = filtered.filter(item => item.channel_id === channelId);
        }
        
        if (q.includes('order by date desc')) {
          filtered.sort((a, b) => {
            if (a.date < b.date) return 1;
            if (a.date > b.date) return -1;
            return 0;
          });
        } else if (q.includes('order by created_at desc')) {
          filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }
        
        if (q.includes('limit')) {
          const limit = params[params.length - 1];
          filtered = filtered.slice(0, typeof limit === 'number' ? limit : 0);
        }
        
        console.log(``DEBUG: all() - chat_summaries filtered count:``, filtered.length);
        return filtered;
      }
"@

# Find the insertion point (after the chat_messages block closes)
$searchPattern = "        console\.log\(`"DEBUG: all\(\) - chat_messages filtered count:`", filtered\.length\);`r?`n        return filtered;`r?`n      }"

if ($content -match $searchPattern) {
    Write-Host "Found insertion point!"
    $newContent = $content -replace $searchPattern, ($matches[0] + $insertCode)
    
    # Backup original
    Copy-Item $filePath "$filePath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    
    # Write new content
    Set-Content -Path $filePath -Value $newContent -NoNewline
    
    Write-Host "✅ Successfully added chat_summaries support!"
    Write-Host "Backup created at: $filePath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
} else {
    Write-Host "❌ Could not find insertion point. The file may have already been modified."
    Write-Host "Please manually add the code after line 371."
}
"@
