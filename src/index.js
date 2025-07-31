require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events, EmbedBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');

// Import logger
const logger = require('./utils/logger');

// Ensure data directory exists
const dataDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data');
fs.ensureDirSync(dataDir);
logger.info(`Data directory ensured at: ${dataDir}`);

// Set up rate limiting
const rateLimits = new Map();
const COOLDOWN_DURATION = 3000; // 3 seconds

console.log('Loading database...');
const db = require('./utils/db');
console.log('Database loaded');

console.log('Loading AI utilities...');
const { getPrereqs, storeChatMessage, generateChatSummary, getRecentMessages, getPreviousDayMessages, saveChatSummary } = require('./utils/ai');
console.log('AI utilities loaded');

console.log('Loading patch utilities...');
const { generatePatchAnnouncement, postChangelogEntry } = require('./utils/patch-utils');
console.log('Patch utilities loaded');

console.log('Creating Discord client...');
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
client.commands = new Collection();
console.log('Discord client created');

// Initialize changelog settings object
client.changelogSettings = {};

// Load commands
console.log('Loading commands...');
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
console.log(`Found ${commandFiles.length} command files: ${commandFiles.join(', ')}`);
logger.info(`Loading ${commandFiles.length} commands...`);

for (const file of commandFiles) {
  console.log(`Loading command: ${file}`);
  try {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}`);
    console.log(`Successfully loaded: ${command.data.name}`);
  } catch (error) {
    logger.error(`Failed to load command ${file}:`, error);
    console.log(`Failed to load ${file}:`, error);
  }
}
console.log('Commands loaded successfully');

// Set up daily backups if in production
console.log('Setting up production features...');
if (process.env.NODE_ENV === 'production') {
  console.log('In production mode, setting up backup cron job...');
  cron.schedule('0 0 * * *', () => { // Daily at midnight
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tasks.db');
      const backupDir = path.join(process.cwd(), 'data', 'backups');
      
      // Ensure backup directory exists
      fs.ensureDirSync(backupDir);
      
      // Create the backup path
      const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
      
      // Clean up old backups (keep only latest 7)
      try {
        const backupFiles = fs.readdirSync(backupDir)
          .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
          .sort((a, b) => b.localeCompare(a)); // Sort in descending order
        
        // Remove backups beyond the 7th
        if (backupFiles.length > 6) { // We're about to create a new one, so keep 6 existing ones
          backupFiles.slice(6).forEach(file => {
            try {
              fs.unlinkSync(path.join(backupDir, file));
              logger.info(`Removed old backup: ${file}`);
            } catch (removeErr) {
              logger.warn(`Failed to remove old backup ${file}:`, removeErr);
            }
          });
        }
      } catch (cleanupErr) {
        logger.warn('Error during backup cleanup:', cleanupErr);
      }
      
      // Create backup
      fs.copyFileSync(dbPath, backupPath);
      logger.info(`Created database backup: ${backupPath}`);
    } catch (error) {
      logger.error('Database backup failed:', error);
    }
  });
  console.log('Backup cron job setup complete');
} else {
  console.log('Not in production mode, skipping backup setup');
}
console.log('Production features setup complete');

console.log('Setting up Discord event handlers...');
client.on(Events.ClientReady, () => {
  console.log('ClientReady event fired!');
  logger.info(`✅ SUCCESS: Logged in as ${client.user.tag}`);
  
  // Load changelog channel settings from database or environment variables
  try {
    // For file-based database, just use environment variable directly
    if (process.env.CHANGELOG_CHANNEL_ID) {
      client.changelogSettings.channelId = process.env.CHANGELOG_CHANNEL_ID;
      logger.info(`Loaded changelog channel ID from environment: ${process.env.CHANGELOG_CHANNEL_ID}`);
    }
  } catch (error) {
    logger.error('Failed to load changelog settings:', error);
  }
  
  // Set up daily reminders
  cron.schedule(process.env.REMINDER_CRON || '0 9 * * *', () => {
    client.guilds.cache.forEach(guild => {
      const ch = guild.systemChannel;
      if (ch) {
        ch.send('Daily reminder: check your pending stages with `/task list`.')
          .then(() => logger.info(`Sent reminder to guild ${guild.name}`))
          .catch(err => logger.error(`Failed to send reminder to guild ${guild.name}:`, err));
      }
    });
  });

  // Set up daily automatic chat summarization
  cron.schedule(process.env.SUMMARY_CRON || '0 8 * * *', async () => {
    logger.info('Starting daily automatic chat summarization...');
    
    for (const guild of client.guilds.cache.values()) {
      try {
        // Get messages from previous day only (not last 24 hours)
        const messages = getPreviousDayMessages(db, guild.id, null);
        
        if (!messages || messages.length < 10) {
          logger.info(`Skipping summary for ${guild.name}: insufficient messages (${messages?.length || 0})`);
          continue;
        }

        // Generate summary
        logger.info(`Generating automatic summary for ${guild.name} (${messages.length} messages)`);
        const summary = await generateChatSummary(messages, 'Yesterday', guild.name);
        
        // Save to database
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        saveChatSummary(db, guild.id, null, summary, messages.length, dateStr);
        
        // Find target channel - prioritize configured daily summary channel
        let targetChannel = null;
        
        // First, try to find the configured daily summary channel
        if (process.env.DAILY_SUMMARY_CHANNEL_ID) {
          targetChannel = guild.channels.cache.get(process.env.DAILY_SUMMARY_CHANNEL_ID);
          if (targetChannel) {
            logger.info(`Using configured daily summary channel: #${targetChannel.name}`);
          } else {
            logger.warn(`Configured daily summary channel ID ${process.env.DAILY_SUMMARY_CHANNEL_ID} not found in ${guild.name}`);
          }
        }
        
        // Fallback to system channel or first available text channel
        if (!targetChannel) {
          targetChannel = guild.systemChannel;
          if (targetChannel) {
            logger.info(`Using system channel: #${targetChannel.name}`);
          }
        }
        
        if (!targetChannel) {
          targetChannel = guild.channels.cache.find(c => 
            c.type === 0 && // Text channel
            c.permissionsFor(guild.members.me)?.has(['SendMessages', 'EmbedLinks'])
          );
          if (targetChannel) {
            logger.info(`Using first available text channel: #${targetChannel.name}`);
          }
        }
        
        if (targetChannel) {
          const embed = new EmbedBuilder()
            .setTitle('📊 Daily Chat Summary')
            .setDescription(summary)
            .setColor(0x3498db)
            .setTimestamp()
            .setFooter({ 
              text: `${messages.length} messages processed • Use /summarize history to view more`,
              iconURL: client.user.displayAvatarURL()
            });

          await targetChannel.send({ embeds: [embed] });
          logger.info(`Sent automatic summary to ${guild.name} #${targetChannel.name}`);
        } else {
          logger.warn(`No suitable channel found for automatic summary in ${guild.name}`);
        }
        
      } catch (error) {
        logger.error(`Error generating automatic summary for guild ${guild.name}:`, error);
      }
    }
    
    logger.info('Daily automatic chat summarization completed');
  });
  
  logger.info('✅ Bot is ready to handle interactions - Chat summarization is active!');
  console.log('ClientReady handler completed');
});

// Initialize announcements array
console.log('Initializing client collections...');
client.announcements = [];

// Initialize temporary storage for AI-generated stage suggestions
client.stageSuggestions = new Map();
console.log('Client collections initialized');

// Add a basic health check server for Docker
console.log('Setting up health check server...');
if (process.env.NODE_ENV === 'production') {
  console.log('Starting health check server for production...');
  const http = require('http');
  let HEALTH_PORT = parseInt(process.env.HEALTH_PORT) || 3000;
  
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const isReady = client && client.isReady();
      if (isReady) {
        res.writeHead(200);
        res.end(JSON.stringify({ 
          status: 'healthy', 
          uptime: process.uptime(),
          ready: true,
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(503);
        res.end(JSON.stringify({ status: 'unhealthy', ready: false }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  // Try to start health check server with error handling
  const startHealthServer = (port, maxRetries = 5) => {
    server.listen(port, () => {
      logger.info(`Health check server running on port ${port}`);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && maxRetries > 0) {
        logger.warn(`Port ${port} in use, trying port ${port + 1}`);
        server.close();
        setTimeout(() => startHealthServer(port + 1, maxRetries - 1), 1000);
      } else if (err.code === 'EADDRINUSE') {
        logger.error('Could not start health check server - all ports in use. Bot will continue without health check.');
      } else {
        logger.error('Health check server error:', err);
      }
    });
  };
  
  startHealthServer(HEALTH_PORT);
  
  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      client.destroy();
      process.exit(0);
    });
  });
} else {
  logger.info('Skipping health check server (not in production mode)');
  console.log('Health check server setup skipped (development mode)');
}
console.log('Health check server setup complete');

console.log('Setting up interaction handler...');
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Only apply rate limiting to interactions that can be replied to
    if (interaction.isRepliable()) {
      const userId = interaction.user.id;
      const now = Date.now();
      
      if (rateLimits.has(userId)) {
        const expirationTime = rateLimits.get(userId) + COOLDOWN_DURATION;
        
        if (now < expirationTime) {
          await interaction.reply({ 
            content: 'Please wait a moment before using another command.',
            ephemeral: true 
          });
          return;
        }
      }
      
      // Set rate limit for user
      rateLimits.set(userId, now);
    }
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      
      // Handle task suggestion modifications
      if (customId.startsWith('modify_suggestions_')) {
        try {
          const parts = customId.split('_');
          const taskId = parts[2];
          // Reconstruct the suggestion ID from remaining parts (handles IDs with underscores)
          const suggestionId = parts.slice(3).join('_');
          
          // Get the original suggestions
          const suggestion = db.prepare('SELECT * FROM task_suggestions WHERE id = ?').get(suggestionId);
          
          if (!suggestion) {
            return interaction.reply({ 
              content: 'Could not find the original stage suggestions. Please try again.', 
              ephemeral: true 
            });
          }
          
          const suggestedStages = JSON.parse(suggestion.stage_suggestions);
          const modifiedStages = [];
          
          // Process each modified stage from the form
          for (let i = 0; i < Math.min(suggestedStages.length, 5); i++) {
            try {
              const stageInput = interaction.fields.getTextInputValue(`stage_${i}`);
              
              // Parse the input: first part is the name, rest is description
              const colonIndex = stageInput.indexOf(':');
              if (colonIndex > 0) {
                const name = stageInput.substring(0, colonIndex).trim();
                const description = stageInput.substring(colonIndex + 1).trim();
                modifiedStages.push({ name, description });
              } else {
                // If no colon, treat whole input as name
                modifiedStages.push({ name: stageInput.trim(), description: '' });
              }
            } catch (error) {
              logger.error(`Error parsing stage ${i}:`, error);
              // Skip this stage if parsing fails
            }
          }
          
          // Add each modified stage to the task
          await interaction.deferReply();
          
          for (let i = 0; i < modifiedStages.length; i++) {
            const stage = modifiedStages[i];
            const idxResult = db.prepare('SELECT COUNT(*) as c FROM stages WHERE task_id=?').get(taskId);
            const idx = idxResult ? idxResult.c : 0;
            db.prepare('INSERT INTO stages(task_id,idx,name,desc,created_at) VALUES(?,?,?,?,?)')
              .run(taskId, idx, stage.name, stage.description, Date.now());
          }
          
          // Update suggestion status
          db.prepare('UPDATE task_suggestions SET status = ? WHERE id = ?').run('modified', suggestionId);
          
          // Get task details for the response
          const task = db.prepare('SELECT name FROM tasks WHERE id = ?').get(taskId);
          
          // Send confirmation message
          return interaction.editReply({ 
            content: `✅ Added ${modifiedStages.length} modified stages to task \`${taskId}\`: **${task.name}**.
View with \`/task list id:${taskId}\`.`
          });
        } catch (error) {
          logger.error('Error processing modified stages:', error);
          if (interaction.deferred) {
            return interaction.editReply({ 
              content: `An error occurred: ${error.message}`
            });
          } else {
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
      }
      
      // Handle completion notes submission
      else if (customId.startsWith('complete_notes_')) {
        try {
          const parts = customId.split('_');
          const taskId = parts[2];
          const stageIdx = parts[3];
          const completionNotes = interaction.fields.getTextInputValue('completion_notes');
          const enhanceWithAi = interaction.fields.getTextInputValue('enhance_with_ai')?.toLowerCase?.();
          const useAi = enhanceWithAi === 'yes' || enhanceWithAi === 'true' || enhanceWithAi === 'y';
          
          // Get details about the stage
          const stage = db.prepare('SELECT name FROM stages WHERE task_id = ? AND idx = ?').get(taskId, parseInt(stageIdx));
          if (!stage) {
            return interaction.reply({ content: 'Stage not found.', ephemeral: true });
          }
          
          await interaction.deferReply();
          
          // Process notes with AI if requested
          let processedNotes = completionNotes;
          if (useAi) {
            try {
              const { enhanceTaskNote } = require('./utils/ai');
              processedNotes = await enhanceTaskNote(completionNotes, stage.name);
            } catch (error) {
              logger.error('Error enhancing completion notes:', error);
              // Continue with original notes if AI enhancement fails
            }
          }
          
          // Mark the stage as complete with notes
          db.prepare(
            'UPDATE stages SET done = 1, completed_at = ?, completion_notes = ? WHERE task_id = ? AND idx = ?'
          ).run(Date.now(), processedNotes, taskId, parseInt(stageIdx));
          
          // Calculate new completion percentage
          const totalStagesResult = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ?').get(taskId);
          const completedStagesResult = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ? AND done = 1').get(taskId);
          const totalStages = totalStagesResult ? totalStagesResult.count : 0;
          const completedStages = completedStagesResult ? completedStagesResult.count : 0;
          const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
          
          // Update task completion percentage
          db.prepare('UPDATE tasks SET completion_percentage = ? WHERE id = ?').run(completionPercentage, taskId);
          
          // Get the next stage (if any)
          const nextStage = db.prepare('SELECT * FROM stages WHERE task_id = ? AND done = 0 ORDER BY idx').get(taskId);
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setTitle(`Task Progress Update: [${completionPercentage}%]`)
            .setColor(0x4caf50)
            .addFields({ 
              name: `✅ Completed: ${stage.name}`, 
              value: processedNotes || 'No completion notes provided'
            })
            .setFooter({ text: `Task ID: ${taskId}` });
          
          // Add next stage info if available
          if (nextStage) {
            // Get prerequisites for the next stage
            const { getPrereqs } = require('./utils/ai');
            const prereq = await getPrereqs(`Task ${taskId}`, nextStage.name, nextStage.desc);
            
            embed.addFields({ 
              name: `⏭️ Next Stage: ${nextStage.name}`, 
              value: nextStage.desc || 'No description provided'
            });
            
            embed.addFields({ 
              name: '📋 Prerequisites', 
              value: prereq
            });
            
            // Create advance button for next stage
            const advanceRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`advance_simple_${taskId}_${nextStage.idx}`)
                  .setLabel('Mark Complete')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`advance_notes_${taskId}_${nextStage.idx}`)
                  .setLabel('Add Completion Notes')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`view_task_${taskId}`)
                  .setLabel('View Task')
                  .setStyle(ButtonStyle.Secondary)
              );
            
            return interaction.editReply({ embeds: [embed], components: [advanceRow] });
          } else {
            // All stages completed - suggest follow-up tasks with AI
            embed.setDescription('🎉 All stages completed!');
            
            try {
              // Get task details for AI suggestions and DevLog
              const task = db.prepare('SELECT name, description, created_at FROM tasks WHERE id = ?').get(taskId);
              const allStages = db.prepare('SELECT name, desc, completion_notes, completed_at FROM stages WHERE task_id = ? ORDER BY idx').all(taskId);
              
              if (task) {
                // Post to DevLog
                try {
                  const taskCommand = client.commands.get('task');
                  if (taskCommand && taskCommand.postToDevLog) {
                    await taskCommand.postToDevLog(client, taskId, task, allStages, interaction.user);
                  }
                } catch (devlogError) {
                  logger.error('Error posting to DevLog:', devlogError);
                  // Continue even if DevLog fails
                }
                
                const { generateFollowUpTasks } = require('./utils/ai');
                const followUpSuggestions = await generateFollowUpTasks(
                  task.name, 
                  task.description || '', 
                  allStages
                );
                
                if (followUpSuggestions && followUpSuggestions.length > 0) {
                  // Create follow-up suggestions embed
                  const followUpEmbed = new EmbedBuilder()
                    .setTitle('🚀 What\'s Next?')
                    .setDescription('AI-suggested follow-up tasks and next actions:')
                    .setColor(0x9b59b6);
                  
                  followUpSuggestions.forEach((suggestion, idx) => {
                    followUpEmbed.addFields({
                      name: `${idx + 1}. ${suggestion.name}`,
                      value: suggestion.description
                    });
                  });
                  
                  // Create buttons for follow-up actions
                  const followUpRow = new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId(`create_followup_${taskId}`)
                        .setLabel('Create Follow-up Task')
                        .setStyle(ButtonStyle.Primary),
                      new ButtonBuilder()
                        .setCustomId(`view_task_${taskId}`)
                        .setLabel('View Completed Task')
                        .setStyle(ButtonStyle.Secondary)
                    );
                  
                  return interaction.editReply({ 
                    embeds: [embed, followUpEmbed],
                    components: [followUpRow]
                  });
                }
              }
            } catch (error) {
              logger.error('Error generating follow-up suggestions:', error);
              // Continue with regular completion message if AI fails
            }
            
            return interaction.editReply({ embeds: [embed] });
          }
        } catch (error) {
          logger.error('Error processing completion notes:', error);
          return interaction.reply({ 
            content: `An error occurred: ${error.message}`, 
            ephemeral: true 
          });
        }
      }

      // Handle follow-up task creation modal
      else if (customId.startsWith('followup_task_')) {
        try {
          const originalTaskId = customId.replace('followup_task_', '');
          const taskName = interaction.fields.getTextInputValue('task_name');
          const taskDescription = interaction.fields.getTextInputValue('task_description') || '';
          const useAiStages = interaction.fields.getTextInputValue('use_ai_stages')?.toLowerCase?.() || 'yes';
          const shouldUseAI = useAiStages === 'yes' || useAiStages === 'y' || useAiStages === 'true';
          
          await interaction.deferReply();
          
          // Generate unique ID for the new task
          const newTaskId = `t${Date.now()}`;
          
          // Create the follow-up task
          db.prepare(
            'INSERT INTO tasks(id, name, description, completion_percentage, created_at, guild_id, creator_id) VALUES(?, ?, ?, ?, ?, ?, ?)'
          ).run(newTaskId, taskName, taskDescription, 0, Date.now(), interaction.guildId, interaction.user.id);
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setTitle(`📋 Follow-up Task Created: ${taskName}`)
            .setDescription(`**Description:** ${taskDescription || 'No description provided'}`)
            .addFields({ name: 'Task ID', value: newTaskId, inline: true })
            .addFields({ name: 'Based on', value: `Task ${originalTaskId}`, inline: true })
            .setColor('#4CAF50')
            .setFooter({ text: 'Task Management System' })
            .setTimestamp();
          
          if (shouldUseAI) {
            try {
              // Generate AI stage suggestions for the follow-up task
              const { generateTaskStages } = require('./utils/ai');
              const suggestedStages = await generateTaskStages(taskName, taskDescription);
              
              // Store suggestions in database with explicit ID
              const suggestionId = `sug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const suggestionResult = db.prepare(
                'INSERT INTO task_suggestions(id, task_id, stage_suggestions, created_at) VALUES(?, ?, ?, ?)'
              ).run(suggestionId, newTaskId, JSON.stringify(suggestedStages), Date.now());
              
              // Create embed to display suggestions
              const suggestionsEmbed = new EmbedBuilder()
                .setTitle(`AI-Suggested Stages for "${taskName}"`)
                .setDescription('Here are stage suggestions for your follow-up task. You can accept all or modify them.')
                .setColor('#2196F3')
                .setFooter({ text: 'Powered by AI' });
              
              // Add each stage as a field
              suggestedStages.forEach((stage, idx) => {
                suggestionsEmbed.addFields({
                  name: `${idx + 1}. ${stage.name}`,
                  value: stage.description
                });
              });
              
              // Create buttons for accepting suggestions
              const { stageSuggestionsActionRow } = require('./components/task-components');
              const row = stageSuggestionsActionRow(newTaskId, suggestionId);
              
              embed.addFields({ name: 'AI Suggestions', value: 'Stage suggestions generated. See below.' });
              
              await interaction.editReply({
                embeds: [embed, suggestionsEmbed],
                components: [row]
              });
            } catch (error) {
              logger.error('Error generating AI suggestions for follow-up task:', error);
              embed.addFields({ name: 'AI Suggestions', value: 'Failed to generate suggestions. Please add stages manually.' });
              await interaction.editReply({ embeds: [embed] });
            }
          } else {
            // No AI suggestions requested
            await interaction.editReply({ embeds: [embed] });
          }
        } catch (error) {
          logger.error('Error creating follow-up task:', error);
          if (interaction.deferred) {
            await interaction.editReply(`❌ Error creating follow-up task: ${error.message}`);
          } else {
            await interaction.reply({ content: `❌ Error creating follow-up task: ${error.message}`, ephemeral: true });
          }
        }
      }

      
      if (customId.startsWith('edit_modal_')) {
        const draftId = customId.replace('edit_modal_', '');
        const newContent = interaction.fields.getTextInputValue('content');
        
        try {
          // Find the draft and update it in the database
          const draft = db.prepare(
            'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
          ).get(draftId, interaction.user.id);
          
          if (!draft) {
            await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
            return;
          }
          
          // Update the content in the database
          db.prepare(
            'UPDATE announcements SET content = ? WHERE id = ?'
          ).run(newContent, draftId);
          
          logger.info(`Updated announcement draft ${draftId} by ${interaction.user.tag}`);
          
          // Get the updated draft
          const updatedDraft = db.prepare('SELECT * FROM announcements WHERE id = ?').get(draftId);
          
          // Create a preview embed
          const previewEmbed = new EmbedBuilder()
            .setTitle(`Announcement: ${updatedDraft.title}`)
            .setDescription(updatedDraft.content)
            .setColor(0x3498db)
            .setFooter({ text: `Draft ID: ${draftId}` });
          
          // Create buttons for actions
          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`post_${draftId}`)
                .setLabel('Post Announcement')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`edit_${draftId}`)
                .setLabel('Edit Again')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`discard_${draftId}`)
                .setLabel('Discard')
                .setStyle(ButtonStyle.Danger)
            );
          
          await interaction.reply({
            content: 'Here\'s the updated preview:',
            embeds: [previewEmbed],
            components: [actionRow],
            ephemeral: true
          });
        } catch (error) {
          logger.error('Error updating announcement:', error);
          await interaction.reply({ 
            content: 'An error occurred while updating the announcement.',
            ephemeral: true 
          });
        }
        return;
      }
      return;
    }
    
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error('Autocomplete error:', error);
        }
      }
      return;
    }
    
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction);
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const customIdParts = interaction.customId.split('_');
      const buttonAction = customIdParts[0];
      let handledByFirstHandler = false;
      
      // Handle task-related buttons
      if (['accept', 'modify', 'skip', 'advance', 'view', 'create'].includes(buttonAction)) {
        const taskAction = customIdParts[0];
        let taskId = customIdParts[1];
        
        // Special handling for advance buttons which have format: advance_notes_taskId_stageIdx or advance_simple_taskId_stageIdx
        if (taskAction === 'advance' && (customIdParts[1] === 'notes' || customIdParts[1] === 'simple')) {
          taskId = customIdParts[2]; // The actual task ID is in position 2
        }
        
        console.log(`Button pressed: ${taskAction}, taskId: ${taskId}, full customId: ${interaction.customId}`);
        
        // Handle AI-generated stage suggestions
        if (taskAction === 'accept') {
          handledByFirstHandler = true;
          try {
            // Check if interaction has already been replied to
            if (interaction.replied || interaction.deferred) {
              console.log('Accept button interaction already handled, skipping');
              return;
            }
            
            // Reconstruct the suggestion ID from parts (handles IDs with underscores)
            const suggestionId = customIdParts.slice(2).join('_');
            console.log(`Looking for suggestion with ID: ${suggestionId}`);
            
            // Get the suggested stages from the database
            const suggestion = db.prepare('SELECT stage_suggestions FROM task_suggestions WHERE id = ?').get(suggestionId);
            if (!suggestion) {
              // Debug: List all suggestions to see what's actually in the database
              const allSuggestions = db.prepare('SELECT id, task_id FROM task_suggestions').all();
              console.log('All suggestions in database:', allSuggestions);
              return interaction.reply({ content: 'Unable to find stage suggestions.', ephemeral: true });
            }
            
            // Parse and validate the suggested stages from the database
            let suggestedStages = [];
            try {
              suggestedStages = JSON.parse(suggestion.stage_suggestions);
              // Validate each stage has required properties
              suggestedStages = suggestedStages.filter(stage => {
                return stage && typeof stage === 'object' && stage.name && typeof stage.name === 'string';
              });
              
              console.log(`Validated ${suggestedStages.length} valid stages out of ${JSON.parse(suggestion.stage_suggestions).length} total`);
            } catch (parseError) {
              logger.error('Error parsing stage suggestions:', parseError);
              return interaction.reply({ content: 'Invalid stage data encountered. Please try again.', ephemeral: true });
            }
            
            if (suggestedStages.length === 0) {
              return interaction.reply({ content: 'No valid stages found in the suggestions. Please try again.', ephemeral: true });
            }
            
            // Add each suggested stage to the task
            await interaction.deferReply();
            
            // Insert validated stages into the database
            console.log(`DEBUG: About to insert ${suggestedStages.length} stages for task ${taskId}`);
            for (let i = 0; i < suggestedStages.length; i++) {
              const stage = suggestedStages[i];
              const idxResult = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id=?').get(taskId);
              const idx = idxResult ? idxResult.count : 0;
              
              // Clean stage name - remove markdown formatting
              const cleanName = stage.name.replace(/\*\*/g, '').trim();
              
              console.log(`DEBUG: Inserting stage ${i}: idx=${idx}, name="${cleanName}", taskId=${taskId}`);
              db.prepare('INSERT INTO stages(task_id,idx,name,desc,created_at) VALUES(?,?,?,?,?)')
                .run(taskId, idx, cleanName, stage.description || '', Date.now());
            }
            
            // Verify stages were inserted
            const insertedStages = db.prepare('SELECT * FROM stages WHERE task_id = ? ORDER BY idx').all(taskId);
            console.log(`DEBUG: After insertion, found ${insertedStages.length} stages for task ${taskId}:`, insertedStages.map(s => `idx=${s.idx}, name="${s.name}"`));
            
            // Update suggestion status
            db.prepare('UPDATE task_suggestions SET status = ? WHERE id = ?').run('accepted', suggestionId);
            
            // Get task details for the response
            const task = db.prepare('SELECT name FROM tasks WHERE id = ?').get(taskId);
            
            console.log(`Added ${suggestedStages.length} stages to task ${taskId}. Stage details:`, JSON.stringify(suggestedStages));
            
            // Send confirmation message
            return interaction.editReply({ 
              content: `✅ Successfully added ${suggestedStages.length} AI-suggested stages to task \`${taskId}\`: **${task?.name || 'Unknown task'}**.
View stages with \`/task list id:${taskId}\`.`,
              components: [] 
            });
          } catch (error) {
            logger.error('Error accepting AI-suggested stages:', error);
            return interaction.reply({ 
              content: `An error occurred while adding stages: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        
        // Handle modify stages request
        else if (taskAction === 'modify') {
          handledByFirstHandler = true;
          try {
            // Check if interaction has already been replied to
            if (interaction.replied || interaction.deferred) {
              console.log('Modify button interaction already handled, skipping');
              return;
            }
            
            // Reconstruct the suggestion ID from parts (handles IDs with underscores)
            const suggestionId = customIdParts.slice(2).join('_');
            console.log('Modify button pressed. customId parts:', customIdParts);
            console.log(`Looking for suggestion with ID: ${suggestionId}`);
            
            // Get the suggested stages from the database
            const suggestion = db.prepare('SELECT stage_suggestions FROM task_suggestions WHERE id = ?').get(suggestionId);
            if (!suggestion) {
              // Debug: List all suggestions to see what's actually in the database
              const allSuggestions = db.prepare('SELECT id, task_id FROM task_suggestions').all();
              console.log('All suggestions in database:', allSuggestions);
              return interaction.reply({ content: 'Unable to find stage suggestions.', ephemeral: true });
            }
            
            const suggestedStages = JSON.parse(suggestion.stage_suggestions);
            
            // Use the pre-built component to create the modal
            const { createModifySuggestionsModal } = require('./components/task-components');
            const modal = createModifySuggestionsModal(taskId, suggestionId, suggestedStages);
            
            // Show the modal to the user
            return interaction.showModal(modal);
          } catch (error) {
            logger.error('Error showing stage modification modal:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        
        // Handle skip AI stages
        else if (taskAction === 'skip') {
          handledByFirstHandler = true;
          try {
            // Reconstruct the suggestion ID from parts (handles IDs with underscores)
            const suggestionId = customIdParts.slice(2).join('_');
            
            // Update suggestion status
            db.prepare('UPDATE task_suggestions SET status = ? WHERE id = ?').run('skipped', suggestionId);
            
            // Get task details for the response
            const task = db.prepare('SELECT name FROM tasks WHERE id = ?').get(taskId);
            
            return interaction.update({ 
              content: `Skipped AI-suggested stages for task \`${taskId}\`: **${task.name}**.
Add stages manually with \`/task add-stage\`.`,
              embeds: [],
              components: [] 
            });
          } catch (error) {
            logger.error('Error skipping AI stages:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        
        // Handle advance with notes
        else if (taskAction === 'advance' && customIdParts[1] === 'notes') {
          handledByFirstHandler = true;
          try {
            const stageIdx = parseInt(customIdParts[3]);
            
            // Get stage details
            const stage = db.prepare('SELECT name FROM stages WHERE task_id = ? AND idx = ?').get(taskId, stageIdx);
            if (!stage) {
              return interaction.reply({ content: 'Stage not found.', ephemeral: true });
            }
            
            // Create a modal for completion notes
            const modal = new ModalBuilder()
              .setCustomId(`complete_notes_${taskId}_${stageIdx}`)
              .setTitle(`Complete Stage: ${stage.name}`)
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('completion_notes')
                    .setLabel('Completion Notes')
                    .setPlaceholder('Describe what was accomplished in this stage...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
                ),
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('enhance_with_ai')
                    .setLabel('Enhance with AI? (type yes or no)')
                    .setPlaceholder('yes')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                )
              );
            
            // Show the modal to the user
            return interaction.showModal(modal);
          } catch (error) {
            logger.error('Error showing completion notes modal:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        
        // Handle simple advance (without notes)
        else if (taskAction === 'advance' && customIdParts[1] === 'simple') {
          handledByFirstHandler = true;
          try {
            const stageIdx = parseInt(customIdParts[3]);
            console.log(`DEBUG: Advance simple handler - customIdParts:`, customIdParts);
            console.log(`DEBUG: Advance simple handler - taskId: "${taskId}", stageIdx: ${stageIdx}`);
            
            // Mark the current stage as complete
            console.log(`DEBUG: Advance simple - taskId=${taskId}, stageIdx=${stageIdx}`);
            db.prepare(
              'UPDATE stages SET done = 1, completed_at = ? WHERE task_id = ? AND idx = ?'
            ).run(Date.now(), taskId, stageIdx);
            
            // Calculate new completion percentage
            const totalStagesResult = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ?').get(taskId);
            const completedStagesResult = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ? AND done = 1').get(taskId);
            const totalStages = totalStagesResult ? totalStagesResult.count : 0;
            const completedStages = completedStagesResult ? completedStagesResult.count : 0;
            const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
            
            // Update task completion percentage
            db.prepare('UPDATE tasks SET completion_percentage = ? WHERE id = ?').run(completionPercentage, taskId);
            
            // Get details of the completed stage
            const completedStage = db.prepare('SELECT name FROM stages WHERE task_id = ? AND idx = ?').get(taskId, stageIdx);
            
            // Get the next stage (if any)
            const nextStage = db.prepare('SELECT * FROM stages WHERE task_id = ? AND done = 0 ORDER BY idx').get(taskId);
            
            // Create response
            if (nextStage) {
              const content = `✅ Completed stage **${completedStage.name}**. Next up: **${nextStage.name}**`;
              return interaction.update({ 
                content,
                components: [] 
              });
            } else {
                             // All stages completed - suggest follow-up tasks with AI
               try {
                 // Get task details for AI suggestions and DevLog
                 const task = db.prepare('SELECT name, description, created_at FROM tasks WHERE id = ?').get(taskId);
                 const allStages = db.prepare('SELECT name, desc, completion_notes, completed_at FROM stages WHERE task_id = ? ORDER BY idx').all(taskId);
                 
                 if (task) {
                   // Post to DevLog
                   try {
                     const taskCommand = client.commands.get('task');
                     if (taskCommand && taskCommand.postToDevLog) {
                       await taskCommand.postToDevLog(client, taskId, task, allStages, interaction.user);
                     }
                   } catch (devlogError) {
                     logger.error('Error posting to DevLog:', devlogError);
                     // Continue even if DevLog fails
                   }
                   
                   const { generateFollowUpTasks } = require('./utils/ai');
                   const followUpSuggestions = await generateFollowUpTasks(
                     task.name, 
                     task.description || '', 
                     allStages
                   );
                   
                   if (followUpSuggestions && followUpSuggestions.length > 0) {
                     // Create completion embed with follow-up suggestions
                     const completionEmbed = new EmbedBuilder()
                       .setTitle('🎉 Task Completed!')
                       .setDescription(`**${task.name}** has been completed successfully!`)
                       .setColor(0x4caf50);
                     
                     // Create follow-up suggestions embed
                     const followUpEmbed = new EmbedBuilder()
                       .setTitle('🚀 What\'s Next?')
                       .setDescription('AI-suggested follow-up tasks and next actions:')
                       .setColor(0x9b59b6);
                     
                     followUpSuggestions.forEach((suggestion, idx) => {
                       followUpEmbed.addFields({
                         name: `${idx + 1}. ${suggestion.name}`,
                         value: suggestion.description
                       });
                     });
                     
                     // Create buttons for follow-up actions
                     const followUpRow = new ActionRowBuilder()
                       .addComponents(
                         new ButtonBuilder()
                           .setCustomId(`create_followup_${taskId}`)
                           .setLabel('Create Follow-up Task')
                           .setStyle(ButtonStyle.Primary),
                         new ButtonBuilder()
                           .setCustomId(`view_task_${taskId}`)
                           .setLabel('View Completed Task')
                           .setStyle(ButtonStyle.Secondary)
                       );
                     
                     return interaction.update({ 
                       content: null,
                       embeds: [completionEmbed, followUpEmbed],
                       components: [followUpRow]
                     });
                   }
                 }
               } catch (error) {
                 logger.error('Error generating follow-up suggestions:', error);
                 // Continue with regular completion message if AI fails
               }
              
              const content = `🎉 Completed stage **${completedStage.name}**. All stages complete!`;
              return interaction.update({ 
                content,
                components: [] 
              });
            }
          } catch (error) {
            logger.error('Error advancing stage:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        
        // Handle view task
        else if (taskAction === 'view') {
          handledByFirstHandler = true;
          try {
            // Get task details directly (no admin check needed for viewing)
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            if (!task) {
              await interaction.reply({ content: `❌ Task with ID \`${taskId}\` not found.`, ephemeral: true });
              return;
            }
            
            // Get stages for this task
            const stages = db.prepare('SELECT * FROM stages WHERE task_id = ? ORDER BY idx').all(taskId);
            
            // Calculate completion percentage
            const totalStages = stages.length;
            const completedStages = stages.filter(s => s.done === 1).length;
            const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
            
            // Create embed
            const embed = new EmbedBuilder()
              .setTitle(`Task: "${task.name}" [${completionPercentage}%]`)
              .setDescription(task.description ? task.description : 'No description provided')
              .setColor(0x3498db)
              .setFooter({ text: `Task ID: ${taskId} | Created: ${new Date(task.created_at).toLocaleDateString()}` });
            
            // No stages message
            if (!stages.length) {
              embed.addFields({ name: 'No stages defined', value: 'Add stages with `/task add-stage`' });
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            // Add stages to embed
            stages.forEach(stage => {
              let statusValue = '';
              
              if (stage.done === 1) {
                const completedDate = stage.completed_at ? 
                  new Date(stage.completed_at).toLocaleDateString() : 
                  'Date not recorded';
                
                statusValue = `✅ Done [${completedDate}]`;
                
                // Add completion notes if available
                if (stage.completion_notes) {
                  statusValue += `\n${stage.completion_notes}`;
                }
              } else {
                // Show current stage clearly
                const isCurrentStage = stages.filter(s => s.done === 1).length === stage.idx;
                statusValue = isCurrentStage ? '🔄 **Current Stage**' : '⏳ Pending';
                
                if (stage.assignee) {
                  statusValue += ` - Assigned to <@${stage.assignee}>`;
                }
              }
              
              embed.addFields({
                name: `Stage ${stage.idx + 1}: ${stage.name}`,
                value: `${stage.desc || 'No description'}\n${statusValue}`,
                inline: false
              });
            });
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            logger.error('Error viewing task:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
          return;
        }
        
        // Handle create follow-up task
        else if (taskAction === 'create' && customIdParts[1] === 'followup') {
          handledByFirstHandler = true;
          try {
            const originalTaskId = customIdParts[2];
            
            // Get the original task details
            const originalTask = db.prepare('SELECT name, description FROM tasks WHERE id = ?').get(originalTaskId);
            if (!originalTask) {
              return interaction.reply({ content: 'Original task not found.', ephemeral: true });
            }
            
            // Create a modal for follow-up task creation
            const modal = new ModalBuilder()
              .setCustomId(`followup_task_${originalTaskId}`)
              .setTitle('Create Follow-up Task')
              .addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('task_name')
                    .setLabel('Follow-up Task Name')
                    .setPlaceholder('e.g., Review Results of Website Redesign')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('task_description')
                    .setLabel('Task Description')
                    .setPlaceholder('Describe what needs to be done in this follow-up task...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(1000)
                ),
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId('use_ai_stages')
                    .setLabel('Use AI to suggest stages? (yes/no)')
                    .setPlaceholder('yes')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(3)
                )
              );
            
            // Show the modal to the user
            return interaction.showModal(modal);
          } catch (error) {
            logger.error('Error showing follow-up task creation modal:', error);
            return interaction.reply({ 
              content: `An error occurred: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
      }
      
      // If we reach here, only return early if the first handler actually processed the button
      if (handledByFirstHandler) {
        return;
      }
    }
    
    // Handle other button interactions that don't match the first handler
    if (interaction.isButton()) {
      // Handle original button interactions
      const parts = interaction.customId.split('_');
      const oldAction = parts[0];
      
      if (oldAction === 'advance') {
        let id, stageIdx;
        
        // Handle different button formats:
        // Old format: advance_TaskId
        // New format: advance_simple_TaskId_StageIdx or advance_notes_TaskId_StageIdx
        if (parts.length === 2) {
          // Old format: advance_TaskId
          id = parts[1];
        } else if (parts.length >= 4) {
          // New format: advance_simple_TaskId_StageIdx or advance_notes_TaskId_StageIdx
          id = parts[2];
          stageIdx = parseInt(parts[3]);
        } else {
          await interaction.reply({ content: 'Invalid button format', ephemeral: true });
          return;
        }
        // Get the next stage
        const next = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        console.log(`DEBUG: Looking for next stage for task ${id}`);
        console.log(`DEBUG: Found next stage:`, next);
        
        // Also check all stages for debugging
        const allStages = db.prepare('SELECT * FROM stages WHERE task_id=? ORDER BY idx').all(id);
        console.log(`DEBUG: All stages for task ${id} (should only show ${id} stages):`, allStages);
        console.log(`DEBUG: Stages count: ${allStages.length}`);
        console.log(`DEBUG: Stage task_ids:`, allStages.map(s => s.task_id));
        
        if (!next) {
          await interaction.reply({ content: 'All stages done 🎉', ephemeral: true });
          return;
        }
        
        // Mark current stage as done
        console.log(`DEBUG: Marking stage ${next.idx} as complete for task ${id}`);
        const updateResult = db.prepare('UPDATE stages SET done=1 WHERE task_id=? AND idx=?').run(id, next.idx);
        console.log(`DEBUG: Update result:`, updateResult);
        
        // Get task info for better display
        const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
        const taskName = task ? task.name : id;
        
        // Get the next upcoming stage
        const upcoming = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (upcoming) {
          await interaction.reply({ 
            content: `✅ **${next.name}** completed!\n\n📋 **Task:** ${taskName}\n🔄 **Next Stage:** ${upcoming.name}\n📝 **Description:** ${upcoming.desc || 'No description'}`,
            ephemeral: true
          });
        } else {
          await interaction.reply({ 
            content: `✅ **${next.name}** completed!\n\n🎉 **Task "${taskName}" is now complete!** All stages finished.`,
            ephemeral: true
          });
        }
        return;
      }
      
      if (oldAction === 'details') {
        // Parse ID for details button (format: details_TaskId)
        const id = parts.length >= 2 ? parts[1] : null;
        if (!id) {
          await interaction.reply({ content: 'Invalid button format', ephemeral: true });
          return;
        }
        
        // Get all stages for the task
        const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
        const stages = db.prepare('SELECT * FROM stages WHERE task_id=? ORDER BY idx').all(id);
        
        if (!task || !stages.length) {
          await interaction.reply({ content: 'No task or stages found.', ephemeral: true });
          return;
        }
        
        // Calculate completion percentage and current stage
        const totalStages = stages.length;
        const completedStages = stages.filter(s => s.done === 1).length;
        const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
        const currentStageIdx = completedStages; // The next incomplete stage
        
        let details = `**Task: ${task.name} (${id})** - ${completionPercentage}% Complete\n${task.description || 'No description'}\n\n**Stages:**\n`;
        
        stages.forEach((stage, idx) => {
          let status;
          let prefix = `${idx+1}.`;
          
          if (stage.done === 1) {
            status = '✅ Done';
            if (stage.completed_at) {
              status += ` (${new Date(stage.completed_at).toLocaleDateString()})`;
            }
          } else if (idx === currentStageIdx) {
            // This is the current active stage
            prefix = `**🔄 ${idx+1}.`;
            status = 'CURRENT STAGE**';
          } else {
            status = '⏳ Pending';
            if (stage.assignee) {
              status += ` - <@${stage.assignee}>`;
            }
          }
          
          details += `${prefix} **${stage.name}** - ${status}\n`;
          if (stage.desc) {
            details += `   📝 ${stage.desc}\n`;
          }
          details += '\n';
        });
        
        await interaction.reply({ content: details, ephemeral: true });
        return;
      }
      
      if (oldAction === 'view') {
        // Parse ID for view button (format: view_TaskId)
        const id = parts.length >= 2 ? parts[1] : null;
        if (!id) {
          await interaction.reply({ content: 'Invalid button format', ephemeral: true });
          return;
        }
        
        // Handle view task button - redirect to list command functionality
        try {
          // Get task details
          const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
          if (!task) {
            await interaction.reply({ content: `❌ Task with ID \`${id}\` not found.`, ephemeral: true });
            return;
          }
          
          // Get stages for this task
          const stages = db.prepare('SELECT * FROM stages WHERE task_id = ? ORDER BY idx').all(id);
          
          // Calculate completion percentage
          const totalStages = stages.length;
          const completedStages = stages.filter(s => s.done === 1).length;
          const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
          
          // Create embed
          const embed = new EmbedBuilder()
            .setTitle(`Task: "${task.name}" [${completionPercentage}%]`)
            .setDescription(task.description ? task.description : 'No description provided')
            .setColor(0x3498db)
            .setFooter({ text: `Task ID: ${id} | Created: ${new Date(task.created_at).toLocaleDateString()}` });
          
          // No stages message
          if (!stages.length) {
            embed.addFields({ name: 'No stages defined', value: 'Add stages with `/task add-stage`' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }
          
          // Add stages to embed
          stages.forEach(stage => {
            let statusValue = '';
            
            if (stage.done === 1) {
              const completedDate = stage.completed_at ? 
                new Date(stage.completed_at).toLocaleDateString() : 
                'Date not recorded';
              
              statusValue = `✅ Done [${completedDate}]`;
              
              // Add completion notes if available
              if (stage.completion_notes) {
                statusValue += `\n${stage.completion_notes}`;
              }
            } else if (stage.assignee) {
              statusValue = `👤 Assigned to <@${stage.assignee}>`;
            } else {
              statusValue = '⏳ Pending';
            }
            
            embed.addFields({ 
              name: `${stage.idx + 1}. ${stage.name}`, 
              value: statusValue 
            });
          });
          
          // Add a progress bar
          const progressBar = '■'.repeat(Math.floor(completionPercentage / 10)) + '□'.repeat(10 - Math.floor(completionPercentage / 10));
          embed.addFields({ name: 'Progress', value: `${completionPercentage}% ${progressBar}` });
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error('Error in view button:', error);
          await interaction.reply({ content: `An error occurred: ${error.message}`, ephemeral: true });
        }
        return;
      }
      
      // Handle announcement buttons
      else if (oldAction === 'post') {
        // Verify user has permission to post announcements
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
          await interaction.reply({ 
            content: 'You need Manage Messages permission to post announcements.', 
            ephemeral: true 
          });
          return;
        }
        
        // Find the draft announcement in the database
        const draft = db.prepare(
          'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).get(id, interaction.user.id);
        
        if (!draft) {
          await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
          return;
        }
        
        // Create embed for the announcement
        const announcementEmbed = new EmbedBuilder()
          .setTitle(`${draft.title}`)
          .setDescription(draft.content)
          .setColor(0x3498db)
          .setTimestamp()
          .setFooter({ text: `Posted by ${interaction.user.tag}` });
        
        try {
          // Post the announcement to the channel
          const message = await interaction.channel.send({ embeds: [announcementEmbed] });
          
          // Mark the announcement as posted in the database
          db.prepare(
            'UPDATE announcements SET posted = 1, posted_channel_id = ? WHERE id = ?'
          ).run(interaction.channel.id, id);
          
          logger.info(`Announcement ${id} posted by ${interaction.user.tag} in channel ${interaction.channel.name}`);
          
          await interaction.reply({ content: 'Announcement posted successfully!', ephemeral: true });
        } catch (error) {
          logger.error(`Failed to post announcement ${id}:`, error);
          await interaction.reply({ 
            content: 'Failed to post announcement. Please try again later.', 
            ephemeral: true 
          });
        }
        return;
      }
      
      else if (oldAction === 'edit') {
        // Find the draft announcement in the database
        const draft = db.prepare(
          'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).get(id, interaction.user.id);
        
        if (!draft) {
          await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
          return;
        }
        
        // Respond with modal for editing
        const modal = new ModalBuilder()
          .setCustomId(`edit_modal_${id}`)
          .setTitle('Edit Announcement');
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel('Announcement Content')
              .setStyle(TextInputStyle.Paragraph)
              .setValue(draft.content)
              .setRequired(true)
          )
        );
        
        logger.info(`User ${interaction.user.tag} is editing announcement ${id}`);
        await interaction.showModal(modal);
        return;
      }
      
      else if (oldAction === 'discard') {
        // Check if the draft exists and delete it from the database
        const result = db.prepare(
          'DELETE FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).run(id, interaction.user.id);
        
        if (result.changes === 0) {
          await interaction.reply({ 
            content: 'Announcement draft not found or you are not the author.', 
            ephemeral: true 
          });
          return;
        }
        
        logger.info(`User ${interaction.user.tag} discarded announcement ${id}`);
        await interaction.reply({ content: 'Announcement draft discarded.', ephemeral: true });
        return;
      }
      
      // Handle changelog post button
      else if (oldAction === 'post_changelog') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to post changelog entries.', 
              ephemeral: true 
            });
            return;
          }
          
          // Post the changelog entry
          await postChangelogEntry(client, id);
          
          await interaction.reply({ 
            content: 'Changelog entry posted successfully!', 
            ephemeral: true 
          });
        } catch (error) {
          logger.error(`Error posting changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to post changelog: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
      
      // Handle changelog discard button
      else if (oldAction === 'discard_changelog') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to discard changelog entries.', 
              ephemeral: true 
            });
            return;
          }
          
          // Delete the changelog entry
          const result = db.prepare(
            'DELETE FROM changelogs WHERE id = ?'
          ).run(id);
          
          if (result.changes === 0) {
            await interaction.reply({ 
              content: 'Changelog entry not found.', 
              ephemeral: true 
            });
            return;
          }
          
          logger.info(`User ${interaction.user.tag} discarded changelog ${id}`);
          await interaction.reply({ 
            content: 'Changelog entry discarded.', 
            ephemeral: true 
          });
        } catch (error) {
          logger.error(`Error discarding changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to discard changelog: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
      
      // Handle create patch announcement button
      else if (oldAction === 'create_patch') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to create patch announcements.', 
              ephemeral: true 
            });
            return;
          }
          
          // Get the changelog entry
          const changelog = db.prepare(
            'SELECT * FROM changelogs WHERE id = ?'
          ).get(id);
          
          if (!changelog) {
            await interaction.reply({ 
              content: 'Changelog entry not found.', 
              ephemeral: true 
            });
            return;
          }
          
          // Generate patch announcement
          const announcement = await generatePatchAnnouncement({ id });
          
          // Create preview embed
          const previewEmbed = new EmbedBuilder()
            .setTitle(`Patch Announcement: ${announcement.title}`)
            .setDescription(announcement.content)
            .setColor(0x3498db)
            .setFooter({ text: `Draft ID: ${announcement.announcementId}` });
          
          // Create buttons for actions
          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`post_${announcement.announcementId}`)
                .setLabel('Post Announcement')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`edit_${announcement.announcementId}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`discard_${announcement.announcementId}`)
                .setLabel('Discard')
                .setStyle(ButtonStyle.Danger)
            );
          
          await interaction.reply({
            content: 'Here\'s a preview of the patch announcement:',
            embeds: [previewEmbed],
            components: [actionRow],
            ephemeral: true
          });
        } catch (error) {
          logger.error(`Error creating patch announcement for changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to create patch announcement: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const reply = { content: 'An error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});
console.log('Interaction handler setup complete');

// Add message listener for chat summarization
console.log('Setting up message handler...');
client.on(Events.MessageCreate, async message => {
  // Skip bot messages and DMs
  if (message.author.bot || !message.guild) {
    return;
  }

  // Check bot's permissions in the channel
  const channelPerms = message.channel.permissionsFor(message.guild.members.me);
  if (!channelPerms || !channelPerms.has('ViewChannel') || !channelPerms.has('ReadMessageHistory')) {
    return;
  }

  try {
    storeChatMessage(db, message);
  } catch (error) {
    logger.error('Error storing message for chat summary:', error);
  }
});
console.log('Message handler setup complete');

// Start Discord bot
console.log('All setup complete, starting Discord login...');
logger.info('Starting Discord bot login...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  logger.error('❌ Discord login failed:', error);
  console.log('Discord login failed:', error);
  process.exit(1);
});
console.log('Login call initiated');
