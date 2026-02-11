require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { TASK_STATUS, ISSUE_STATUS, COLORS, PREFIXES } = require('./utils/constants');
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
const { getPrereqs, storeChatMessage, generateChatSummary, getRecentMessages, getPreviousDayMessages, getMessagesFromSourceChannels, getPreviousDaySummary, saveChatSummary } = require('./utils/ai');
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
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js') && !f.includes('-HomePC'));
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
  logger.info(`SUCCESS: Logged in as ${client.user.tag}`);

  // Load changelog channel settings from database or environment variables
  try {
    // For file-based database, just use environment variable directly
    if (process.env.CHANGELOG_CHANNEL_ID) {
      client.changelogSettings.channelId = process.env.CHANGELOG_CHANNEL_ID;
      logger.info(`Loaded changelog channel ID from environment: ${process.env.CHANGELOG_CHANNEL_ID}`);
    } else {
      // Fallback: load from bot_settings if present
      try {
        const db = require('./utils/db');
        const row = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id');
        if (row?.value) {
          client.changelogSettings.channelId = row.value;
          logger.info(`Loaded changelog channel ID from DB: ${row.value}`);
        }
      } catch (e) {
        logger.warn('Could not load changelog channel from DB:', e.message);
      }
    }
  } catch (error) {
    logger.error('Failed to load changelog settings:', error);
  }

  // Set up daily reminders
  cron.schedule(process.env.REMINDER_CRON || '0 9 * * *', () => {
    client.guilds.cache.forEach(guild => {
      let targetChannel = null;

      // Prefer configured reminder channel if provided
      if (process.env.REMINDER_CHANNEL_ID) {
        targetChannel = guild.channels.cache.get(process.env.REMINDER_CHANNEL_ID);
        if (targetChannel) {
          logger.info(`Using configured reminder channel: #${targetChannel.name}`);
        } else {
          logger.warn(`Configured reminder channel ID ${process.env.REMINDER_CHANNEL_ID} not found in ${guild.name}`);
        }
      }

      // Fallback to system channel
      if (!targetChannel) {
        targetChannel = guild.systemChannel;
        if (targetChannel) {
          logger.info(`Using system channel for reminders: #${targetChannel.name}`);
        }
      }

      // Final fallback: first available text channel with send perms
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(c =>
          c.type === 0 && // Text channel
          c.permissionsFor(guild.members.me)?.has(['SendMessages'])
        );
        if (targetChannel) {
          logger.info(`Using first available text channel for reminders: #${targetChannel.name}`);
        }
      }

      if (targetChannel) {
        targetChannel.send('Daily reminder: check your pending stages with `/task list`.')
          .then(() => logger.info(`Sent reminder to guild ${guild.name}`))
          .catch(err => logger.error(`Failed to send reminder to guild ${guild.name}:`, err));
      } else {
        logger.warn(`No suitable channel found for daily reminders in ${guild.name}`);
      }
    });
  });

  // Set up daily automatic chat summarization
  cron.schedule(process.env.SUMMARY_CRON || '0 8 * * *', async () => {
    logger.info('Starting daily automatic chat summarization...');

    for (const guild of client.guilds.cache.values()) {
      try {
        // Get messages from previous day only (00:00–23:59) with optional source channel filtering
        let messages = [];
        const sourceChannelsEnv = process.env.DAILY_SUMMARY_SOURCE_CHANNELS;
        if (sourceChannelsEnv) {
          const sourceChannels = sourceChannelsEnv.split(',').map(s => s.trim()).filter(Boolean);
          if (sourceChannels.length > 0) {
            for (const channelId of sourceChannels) {
              const chMsgs = getPreviousDayMessages(db, guild.id, channelId);
              if (chMsgs?.length) messages.push(...chMsgs);
            }
            // Ensure chronological order
            messages.sort((a, b) => a.timestamp - b.timestamp);
            logger.info(`Using configured source channels for summarization: ${sourceChannels.length} channel(s)`);
          } else {
            messages = getPreviousDayMessages(db, guild.id, null);
          }
        } else {
          messages = getPreviousDayMessages(db, guild.id, null);
        }

        if (!messages || messages.length < 10) {
          logger.info(`Skipping summary for ${guild.name}: insufficient messages (${messages?.length || 0})`);
          continue;
        }

        // Get previous day's summary for context
        const previousSummary = await getPreviousDaySummary(db, guild.id);

        // Generate summary with previous day context
        logger.info(`Generating automatic summary for ${guild.name} (${messages.length} messages)`);
        const { summary, modelUsed, messagesUsed } = await generateChatSummary(messages, 'Yesterday', guild.name, previousSummary);

        // Save to database with yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        saveChatSummary(db, guild.id, null, summary, messages.length, dateStr, modelUsed);

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
          const description = summary;

          const embed = new EmbedBuilder()
            .setTitle('📊 Daily Chat Summary')
            .setDescription(description)
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


  // Set up automatic message cleanup for retention policy
  const retentionDays = parseInt(process.env.MESSAGE_RETENTION_DAYS) || 30;
  const cleanupCronExpression = process.env.MESSAGE_CLEANUP_CRON || '0 3 * * *'; // 3 AM daily

  if (cleanupCronExpression && cleanupCronExpression.trim() && retentionDays > 0) {
    try {
      cron.schedule(cleanupCronExpression, () => {
        logger.info('Starting automatic message cleanup...');

        try {
          const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
          const result = db.prepare('DELETE FROM chat_messages WHERE timestamp < ?').run(cutoffTime);

          if (result.changes > 0) {
            logger.info(`Message cleanup complete: Deleted ${result.changes} messages older than ${retentionDays} days`);
          } else {
            logger.info('Message cleanup complete: No old messages to delete');
          }
        } catch (error) {
          logger.error('Error during message cleanup:', error);
        }
      });

      logger.info(`Message cleanup scheduled: Will delete messages older than ${retentionDays} days at ${cleanupCronExpression}`);
    } catch (error) {
      logger.error('Failed to set up message cleanup cron job:', error);
    }
  } else {
    logger.warn('Message cleanup disabled (MESSAGE_RETENTION_DAYS=0 or no cron expression)');
  }

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
      // Handle issue details modal
      if (customId.startsWith('issue_details_')) {
        try {
          const idPart = customId.replace('issue_details_', '');
          const [issueId, sourceMessageId] = idPart.split('_');
          const steps = interaction.fields.getTextInputValue('steps') || '';
          const expected = interaction.fields.getTextInputValue('expected') || '';
          const actual = interaction.fields.getTextInputValue('actual') || '';
          const extra = interaction.fields.getTextInputValue('extra') || '';

          const detailsObj = { steps, expected, actual, extra };
          const db = require('./utils/db');
          const { buildIssueEmbed, issueActionRow, buildDetailsEmbed } = require('./components/issue-components');

          // Fetch the issue; fallback by message id if id lookup fails
          let issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
          if (!issue && sourceMessageId) {
            const allIssues = db.prepare('SELECT * FROM issues').all();
            issue = allIssues.find(i => i.message_id === sourceMessageId);
          }
          if (!issue) {
            return interaction.reply({ content: 'Issue not found.', ephemeral: true });
          }

          await interaction.deferReply({ ephemeral: true });

          // Find the thread — prefer stored thread_id, fall back to current channel if it's a thread
          let thread = null;
          if (issue.thread_id) {
            thread = await interaction.client.channels.fetch(issue.thread_id).catch(() => null);
          }
          if (!thread && interaction.channel?.isThread()) {
            thread = interaction.channel;
          }

          // Build the details embed for the pinned message
          const detailsEmbed = buildDetailsEmbed(issue, detailsObj, interaction.user);

          let detailsMessageId = issue.details_message_id || null;

          if (thread) {
            if (detailsMessageId) {
              // Edit existing pinned details message
              try {
                const existingMsg = await thread.messages.fetch(detailsMessageId).catch(() => null);
                if (existingMsg) {
                  await existingMsg.edit({ embeds: [detailsEmbed] });
                } else {
                  // Message was deleted — create a new one
                  const newMsg = await thread.send({ embeds: [detailsEmbed] });
                  await newMsg.pin().catch(() => {});
                  detailsMessageId = newMsg.id;
                }
              } catch (e) {
                logger.warn('Could not edit details message, creating new one:', e.message);
                const newMsg = await thread.send({ embeds: [detailsEmbed] });
                await newMsg.pin().catch(() => {});
                detailsMessageId = newMsg.id;
              }
            } else {
              // Create new pinned details message
              const newMsg = await thread.send({ embeds: [detailsEmbed] });
              await newMsg.pin().catch(() => {});
              detailsMessageId = newMsg.id;
            }
          }

          // Update DB with details and details_message_id
          db.prepare('UPDATE issues SET details = ?, details_message_id = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(detailsObj), detailsMessageId, Date.now(), issue.id);

          // Also update the thread embed (the one with buttons) if possible
          if (thread) {
            try {
              const updatedIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id) || issue;
              const embed = buildIssueEmbed(updatedIssue, interaction.user);
              // Find the embed message in the thread (the one with action buttons)
              const threadMessages = await thread.messages.fetch({ limit: 20 });
              const embedMsg = threadMessages.find(m =>
                m.author.id === interaction.client.user.id &&
                m.components?.length > 0
              );
              if (embedMsg) {
                await embedMsg.edit({ embeds: [embed], components: [issueActionRow(updatedIssue.id, updatedIssue.status, embedMsg.id)] });
              }
            } catch (e) {
              logger.warn('Could not update thread embed:', e.message);
            }
          }

          return interaction.editReply({ content: 'Details saved and pinned in thread.' });
        } catch (error) {
          logger.error('Error saving issue details:', error);
          if (interaction.deferred) {
            return interaction.editReply({ content: `Failed to save details: ${error.message}` });
          }
          return interaction.reply({ content: `Failed to save details: ${error.message}`, ephemeral: true });
        }
      }


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
                    .setDescription('Suggested follow-up tasks and next actions:')
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
                .setTitle(`Suggested Stages for "${taskName}"`)
                .setDescription('Here are stage suggestions for your follow-up task. You can accept all or modify them.')
                .setColor('#2196F3')
                .setFooter({ text: 'Suggestions' });

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

              embed.addFields({ name: 'Suggestions', value: 'Stage suggestions generated. See below.' });

              await interaction.editReply({
                embeds: [embed, suggestionsEmbed],
                components: [row]
              });
            } catch (error) {
              logger.error('Error generating AI suggestions for follow-up task:', error);
              embed.addFields({ name: 'Suggestions', value: 'Failed to generate suggestions. Please add stages manually.' });
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
      // Handle admin task buttons
      if (['admintask'].includes(buttonAction)) {
        handledByFirstHandler = true;
        try {
          const action = customIdParts[1]; // complete | progress | reopen | claim
          const taskId = customIdParts.slice(2).join('_');
          const db = require('./utils/db');
          const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const { TASK_STATUS, COLORS, PREFIXES } = require('./utils/constants');

          // Get task from database
          const task = db.prepare('SELECT * FROM admin_tasks WHERE task_id = ?').get(taskId);
          if (!task) {
            return interaction.reply({ content: 'Task not found.', ephemeral: true });
          }

          // Handle SAVECHANGELOG action separately
          if (action === 'savechangelog') {
            try {
              await interaction.deferReply({ ephemeral: true });
              const currentVersion = db.prepare('SELECT * FROM changelog_versions WHERE is_current = 1').get();
              if (!currentVersion) {
                return interaction.editReply({ content: 'No active changelog version. Use `/changelog setversion` first.' });
              }

              let existing = [];
              try {
                existing = db.prepare('SELECT * FROM changelog_entries WHERE version = ?').all(currentVersion.version);
              } catch (e) { existing = []; }

              const already = Array.isArray(existing) && existing.some(e => e.task_id === taskId);
              if (already) {
                return interaction.editReply({ content: `Already saved to version ${currentVersion.version}.` });
              }

              const entryId = `entry-${Date.now()}`;
              db.prepare(`
              INSERT INTO changelog_entries
              (id, version, entry_type, entry_text, task_id, author_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(entryId, currentVersion.version, 'task', task.title, taskId, interaction.user.id, Date.now());

              // Post a direct entry line to the version thread
              try {
                const versionThread = await interaction.client.channels.fetch(currentVersion.thread_id).catch(() => null);
                if (versionThread && versionThread.isThread()) {
                  try { if (versionThread.archived) await versionThread.setArchived(false); } catch { }
                  try { if (versionThread.locked) await versionThread.setLocked(false); } catch { }
                  const ts = Math.floor(Date.now() / 1000);
                  const threadLink = task.thread_id ? `https://discord.com/channels/${interaction.guildId}/${task.thread_id}` : 'N/A';
                  const entryLine = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `**${task.title}**\n` +
                    `Completed by: <@${interaction.user.id}>\n` +
                    `Date: <t:${ts}:f>\n` +
                    `**[View Task Thread →](${threadLink})**\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                  await versionThread.send({ content: entryLine });
                }
              } catch (postErr) {
                logger.error('[CHANGELOG] Failed to post direct entry to changelog thread:', postErr);
              }

              // Refresh summary
              const changelogCommand = interaction.client.commands.get('changelog');
              if (changelogCommand && changelogCommand.updateChangelogThread) {
                await changelogCommand.updateChangelogThread(currentVersion.version, interaction.client);
              }

              await interaction.editReply({ content: `Saved to changelog version ${currentVersion.version}.` });

              // Disable the Save to Changelog button
              try {
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`admintask_savechangelog_${taskId}`)
                    .setLabel('Save to Changelog')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                  new ButtonBuilder()
                    .setCustomId(`admintask_reopen_${taskId}`)
                    .setLabel('Reopen')
                    .setStyle(ButtonStyle.Secondary)
                );
                await interaction.message.edit({ components: [row] }).catch(() => { });
              } catch (editErr) { }
            } catch (saveErr) {
              logger.error('[CHANGELOG] Error during Save to Changelog:', saveErr);
              if (interaction.deferred) await interaction.editReply({ content: 'Error saving to changelog.' });
            }
            return;
          }

          // Handle CLAIM action
          if (action === 'claim') {
            if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
              return interaction.reply({ content: 'Only administrators can claim tasks.', ephemeral: true });
            }

            db.prepare('INSERT INTO admin_task_assignees (task_id, user_id) VALUES (?, ?)').run(taskId, interaction.user.id);
            db.prepare('UPDATE admin_tasks SET status = ? WHERE task_id = ?').run(TASK_STATUS.IN_PROGRESS, taskId);

            const assignees = db.prepare('SELECT user_id FROM admin_task_assignees WHERE task_id = ?').all(taskId);
            const assigneeList = assignees.map(a => `<@${a.user_id}>`).join(', ');

            const embed = new EmbedBuilder()
              .setTitle(task.title)
              .setDescription(task.description)
              .setColor(COLORS.ORANGE)
              .addFields(
                { name: 'Created By', value: `<@${task.creator_id}>`, inline: true },
                { name: 'Assigned To', value: assigneeList, inline: true }
              )
              .setFooter({ text: `Task ID: ${taskId}` })
              .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`admintask_complete_${taskId}`).setLabel('Mark Complete').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`admintask_progress_${taskId}`).setLabel('Mark In Progress').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`admintask_reopen_${taskId}`).setLabel('Reopen').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ embeds: [embed], components: [actionRow] });

            if (task.message_id && task.channel_id) {
              try {
                const mainChannel = await interaction.guild.channels.fetch(task.channel_id);
                const mainMessage = await mainChannel.messages.fetch(task.message_id);
                const updatedMessage = `${PREFIXES.TASK.IN_PROGRESS} **${task.title}** • ${assigneeList} • \`${taskId}\``;
                await mainMessage.edit(updatedMessage);
              } catch (err) { }
            }

            if (task.thread_id) {
              try {
                const thread = await interaction.guild.channels.fetch(task.thread_id);
                if (thread && thread.isThread()) {
                  const newThreadName = `${PREFIXES.TASK.IN_PROGRESS} ${task.title.substring(0, 100 - PREFIXES.TASK.IN_PROGRESS.length - 1)}`;
                  await thread.setName(newThreadName).catch(() => { });
                  await thread.send(`**Task Claimed**\n<@${interaction.user.id}> has claimed this task.`);
                }
              } catch (error) { }
            }
            return;
          }

          // Handle Status Change
          const assignees = db.prepare('SELECT user_id FROM admin_task_assignees WHERE task_id = ?').all(taskId);
          const assigneeList = assignees.map(a => `<@${a.user_id}>`).join(', ');

          let newStatus = task.status;
          let statusText = 'In Progress';
          let embedColor = COLORS.ORANGE;

          if (action === 'complete') {
            newStatus = TASK_STATUS.COMPLETE;
            statusText = 'Complete';
            embedColor = COLORS.GREEN;
          } else if (action === 'progress') {
            newStatus = TASK_STATUS.IN_PROGRESS;
            statusText = 'In Progress';
            embedColor = COLORS.ORANGE;
          } else if (action === 'reopen') {
            newStatus = TASK_STATUS.IN_PROGRESS;
            statusText = 'In Progress';
            embedColor = COLORS.ORANGE;
          }

          db.prepare('UPDATE admin_tasks SET status = ? WHERE task_id = ?').run(newStatus, taskId);

          const date = new Date(task.created_at);
          const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

          let embed;
          let actionRow;

          if (newStatus === TASK_STATUS.COMPLETE) {
            embed = new EmbedBuilder()
              .setTitle(`${task.title}`)
              .setColor(embedColor)
              .addFields(
                { name: 'Status', value: `${statusText}`, inline: true },
                { name: 'Completed by', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setFooter({ text: `Task ID: ${taskId} • Completed ${dateStr}` })
              .setTimestamp();

            actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`admintask_savechangelog_${taskId}`).setLabel('Save to Changelog').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`admintask_reopen_${taskId}`).setLabel('Reopen').setStyle(ButtonStyle.Secondary)
            );
          } else {
            embed = new EmbedBuilder()
              .setTitle(task.title)
              .setDescription(task.description)
              .setColor(embedColor)
              .addFields(
                { name: 'Status', value: `${statusText}`, inline: true },
                { name: 'Creator', value: `<@${task.creator_id}>`, inline: true },
                { name: 'Assigned To', value: assigneeList || 'None', inline: false },
                { name: 'Discussion Thread', value: `<#${task.thread_id}>`, inline: true }
              )
              .setFooter({ text: `Task ID: ${taskId} • ${dateStr}` })
              .setTimestamp();

            actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`admintask_complete_${taskId}`).setLabel('Mark Complete').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`admintask_progress_${taskId}`).setLabel('Mark In Progress').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`admintask_reopen_${taskId}`).setLabel('Reopen').setStyle(ButtonStyle.Secondary)
            );
          }

          await interaction.update({ embeds: [embed], components: [actionRow] });

          // Update main channel
          if (task.message_id && task.channel_id) {
            try {
              const mainChannel = await interaction.guild.channels.fetch(task.channel_id);
              const mainMessage = await mainChannel.messages.fetch(task.message_id);

              let statusPrefix;
              if (newStatus === TASK_STATUS.COMPLETE) statusPrefix = PREFIXES.TASK.COMPLETE;
              else if (newStatus === TASK_STATUS.IN_PROGRESS) statusPrefix = PREFIXES.TASK.IN_PROGRESS;
              else statusPrefix = PREFIXES.TASK.UNASSIGNED;

              const assigneeText = assignees.length === 0 ? 'Unassigned' : assigneeList;
              const updatedMessage = `${statusPrefix} **${task.title}** • ${assigneeText} • \`${taskId}\``;
              await mainMessage.edit(updatedMessage);
            } catch (err) { }
          }

          // Thread operations
          if (task.thread_id) {
            try {
              const thread = await interaction.guild.channels.fetch(task.thread_id);
              if (thread && thread.isThread()) {
                if (action === 'complete') {
                  const newThreadName = `${PREFIXES.TASK.COMPLETE} ${task.title.substring(0, 100 - PREFIXES.TASK.COMPLETE.length - 1)}`;

                  if (thread.archived) await thread.setArchived(false);
                  await thread.setName(newThreadName).catch(() => { });

                  await thread.send(`**Task Completed**\nMarked as complete by: <@${interaction.user.id}>`);

                  await thread.setLocked(true).catch(() => { });
                  await thread.setArchived(true).catch(() => { });
                } else {
                  if (thread.archived) await thread.setArchived(false);
                  if (thread.locked) await thread.setLocked(false);

                  const newThreadName = `${PREFIXES.TASK.IN_PROGRESS} ${task.title.substring(0, 100 - PREFIXES.TASK.IN_PROGRESS.length - 1)}`;
                  await thread.setName(newThreadName).catch(() => { });

                  const msg = action === 'reopen'
                    ? `**Task Reopened**\nStatus changed to: **${statusText}**`
                    : `**Task Status Updated**\nStatus changed to: **${statusText}**`;
                  await thread.send(msg);
                }
              }
            } catch (error) { }
          }

        } catch (error) {
          logger.error('Error handling admin task button:', error);
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'Error updating task status.', ephemeral: true });
          } else {
            await interaction.reply({ content: 'Error updating task status.', ephemeral: true });
          }
        }
        return;
      }

      // Handle changelog version buttons
      if (['changelog'].includes(buttonAction)) {
        handledByFirstHandler = true;
        try {
          const action = customIdParts[1];
          const { EmbedBuilder } = require('discord.js');

          if (action === 'complete' && customIdParts[2] === 'version') {
            const version = customIdParts.slice(3).join('_');
            await interaction.deferReply({ ephemeral: true });
            const db = require('./utils/db');
            const versionData = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);
            if (!versionData) return interaction.editReply('Version not found!');
            if (versionData.status === 'complete') return interaction.editReply('This version is already complete!');

            const changelogCommand = interaction.client.commands.get('changelog');
            await interaction.editReply('Generating summary report...');
            const summary = await changelogCommand.generateVersionSummary(version, interaction.client);

            db.prepare(`UPDATE changelog_versions SET status = 'complete', is_current = 0, completed_at = ?, completion_report = ? WHERE version = ?`).run(Date.now(), summary, version);

            const thread = await interaction.guild.channels.fetch(versionData.thread_id).catch(() => null);
            if (thread && thread.isThread()) {
              const summaryEmbed = new EmbedBuilder().setTitle(`Version ${version} - Completion Report`).setDescription(summary).setColor(0x00FF00).setTimestamp();
              await thread.send({ embeds: [summaryEmbed] });
              await thread.setName(`Changelog: v${version} [Complete]`).catch(() => { });
              await thread.setLocked(true).catch(() => { });
              await thread.setArchived(true).catch(() => { });
            }
            await interaction.message.edit({ components: [] }).catch(() => { });
            return interaction.editReply(`Version \`${version}\` marked as complete!`);
          }

          const newVersion = customIdParts[3];
          if (action === 'cancel') return interaction.update({ content: 'Cancelled.', components: [] });

          if (action === 'complete' || action === 'keep') {
            await interaction.deferUpdate();
            const db = require('./utils/db');
            if (action === 'complete') {
              // ... existing logic simplified ...
              const currentVersion = db.prepare('SELECT * FROM changelog_versions WHERE is_current = 1').get();
              if (currentVersion) {
                db.prepare(`UPDATE changelog_versions SET status = 'complete', is_current = 0, completed_at = ? WHERE version = ?`).run(Date.now(), currentVersion.version);
                // ... thread updates ...
              }
            } else {
              db.prepare('UPDATE changelog_versions SET is_current = 0 WHERE is_current = 1').run();
            }

            const changelogChannelId = interaction.client.changelogSettings?.channelId || db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id')?.value;
            const changelogChannel = await interaction.guild.channels.fetch(changelogChannelId).catch(() => null);
            if (changelogChannel) {
              const changelogCommand = interaction.client.commands.get('changelog');
              if (changelogCommand) await changelogCommand.createVersion(interaction, newVersion, changelogChannel);
            }
          }
        } catch (error) {
          logger.error('Error handling changelog button:', error);
        }
        return;
      }
      // Handle issue buttons
      if (['issue'].includes(buttonAction)) {
        handledByFirstHandler = true;
        try {
          const action = customIdParts[1]; // bug | solved | reopen | details
          // customId patterns:
          // issue_details_<issueId> OR issue_details_<issueId>_<messageId>
          // issue_bug_<issueId>
          // Collect identifier carefully to avoid underscores breaking the id
          const identifier = customIdParts.slice(2).join('_');
          const [issueId, sourceMessageId] = identifier.split('_');
          const db = require('./utils/db');
          const { buildIssueEmbed, issueActionRow, createIssueDetailsModal } = require('./components/issue-components');
          const { ISSUE_STATUS, PREFIXES } = require('./utils/constants');

          if (action === 'details') {
            // Fetch existing details to pre-fill modal when editing
            let existingDetails = null;
            const existingIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
            if (existingIssue?.details) {
              try {
                existingDetails = typeof existingIssue.details === 'string'
                  ? JSON.parse(existingIssue.details)
                  : existingIssue.details;
              } catch (_) {}
            }
            const modal = createIssueDetailsModal(issueId, interaction.message?.id, existingDetails);
            return interaction.showModal(modal);
          }

          // Load issue
          let issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
          if (!issue) {
            const tryMsgId = sourceMessageId || interaction.message?.id;
            if (tryMsgId) {
              const allIssues = db.prepare('SELECT * FROM issues').all();
              issue = allIssues.find(i => i.message_id === tryMsgId);
            }
          }
          // Deep fallback: reconstruct minimal issue from embed footer if DB is missing
          if (!issue && interaction.message?.embeds?.length) {
            const footerText = interaction.message.embeds[0]?.footer?.text || '';
            const match = footerText.match(/Issue ID:\s*(\S+)/i);
            if (match && match[1]) {
              issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(match[1]);
            }
          }
          // If still not found, try to rebuild from the visible message data
          if (!issue && interaction.message) {
            const title = interaction.message.embeds?.[0]?.title?.replace(/^.*?\s/, '') || 'Untitled Issue';
            const description = interaction.message.embeds?.[0]?.description || '';
            const channelId = interaction.channelId;
            const rebuilt = {
              id: issueId,
              title,
              description,
              status: ISSUE_STATUS.OPEN,
              severity: 'normal',
              reporter_id: interaction.user.id,
              assignee_id: null,
              guild_id: interaction.guildId,
              channel_id: channelId,
              thread_id: null,
              message_id: interaction.message.id,
              details: null,
              created_at: Date.now(),
              updated_at: Date.now()
            };
            try {
              db.prepare('INSERT OR REPLACE INTO issues (id, title, description, status, severity, reporter_id, assignee_id, guild_id, channel_id, thread_id, message_id, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(rebuilt.id, rebuilt.title, rebuilt.description, rebuilt.status, rebuilt.severity, rebuilt.reporter_id, rebuilt.assignee_id, rebuilt.guild_id, rebuilt.channel_id, rebuilt.thread_id, rebuilt.message_id, rebuilt.details, rebuilt.created_at, rebuilt.updated_at);
              issue = rebuilt;
            } catch (_) { }
          }
          if (!issue) {
            return interaction.reply({ content: 'Issue not found.', ephemeral: true });
          }

          // Update status
          let newStatus = issue.status;
          if (action === ISSUE_STATUS.BUG) newStatus = ISSUE_STATUS.BUG;
          if (action === ISSUE_STATUS.SOLVED) newStatus = ISSUE_STATUS.SOLVED;
          if (action === 'reopen') newStatus = ISSUE_STATUS.OPEN;

          if (newStatus !== issue.status) {
            db.prepare('UPDATE issues SET status = ?, updated_at = ? WHERE id = ?')
              .run(newStatus, Date.now(), issueId);
          }

          const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(issue.id) || issue;
          const embed = buildIssueEmbed(updated, null);

          // Update the embed in the thread
          try {
            if (interaction.message) {
              await interaction.message.edit({ embeds: [embed], components: [issueActionRow(updated.id, updated.status, interaction.message.id)] });
            }
          } catch (e) {
            logger.warn('Could not update thread message:', e.message);
          }

          // Update compact message in main channel
          if (updated.message_id && updated.channel_id) {
            try {
              const mainChannel = await interaction.client.channels.fetch(updated.channel_id);
              const mainMessage = await mainChannel.messages.fetch(updated.message_id);

              let statusPrefix;
              if (newStatus === ISSUE_STATUS.SOLVED) statusPrefix = PREFIXES.ISSUE.SOLVED;
              else if (newStatus === ISSUE_STATUS.BUG) statusPrefix = PREFIXES.ISSUE.BUG;
              else statusPrefix = PREFIXES.ISSUE.OPEN;

              const severityLabel = (updated.severity || 'normal').charAt(0).toUpperCase() + (updated.severity || 'normal').slice(1);
              const desc = updated.description || '';
              const descSnippet = desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
              const compactMessage = descSnippet
                ? `${statusPrefix} **${updated.title}** • ${severityLabel} • \`${updated.id}\`\n> ${descSnippet}`
                : `${statusPrefix} **${updated.title}** • ${severityLabel} • \`${updated.id}\``;
              await mainMessage.edit(compactMessage);
            } catch (e) {
              logger.warn('Could not update main channel message:', e.message);
            }
          }

          // Rename thread based on status — fallback to current channel if it's a thread
          let thread = null;
          if (updated.thread_id) {
            try {
              thread = await interaction.guild.channels.fetch(updated.thread_id);
            } catch (e) {
              logger.warn('Could not fetch thread by stored ID:', e.message);
            }
          }
          if (!thread && interaction.channel?.isThread()) {
            thread = interaction.channel;
          }
          if (thread && thread.isThread()) {
            try {
                let statusPrefix;
                if (newStatus === ISSUE_STATUS.SOLVED) {
                  statusPrefix = PREFIXES.ISSUE.SOLVED;
                } else if (newStatus === ISSUE_STATUS.BUG) {
                  statusPrefix = PREFIXES.ISSUE.BUG;
                } else {
                  statusPrefix = PREFIXES.ISSUE.OPEN;
                }

                const newThreadName = `${statusPrefix} ${updated.title.substring(0, 100 - statusPrefix.length - 1)}`;

                // Unarchive if needed before renaming
                if (thread.archived) {
                  await thread.setArchived(false);
                }

                await thread.setName(newThreadName);
                logger.info(`Renamed issue thread to: ${newThreadName}`);

                // Post status update in thread
                const statusMessages = {
                  [ISSUE_STATUS.SOLVED]: `**Issue Solved** by <@${interaction.user.id}>`,
                  [ISSUE_STATUS.BUG]: `**Marked as Bug** by <@${interaction.user.id}>`,
                  [ISSUE_STATUS.OPEN]: `**Issue Reopened** by <@${interaction.user.id}>`
                };
                await thread.send(statusMessages[newStatus] || `Status updated to ${newStatus}`);

                // Lock and archive solved issues
                if (newStatus === ISSUE_STATUS.SOLVED) {
                  try {
                    await thread.setLocked(true);
                    await thread.setArchived(true);
                    logger.info('Locked and archived solved issue thread');
                  } catch (err) {
                    logger.warn('Could not lock/archive thread:', err);
                  }
                } else {
                  // Unlock and unarchive if reopening
                  try {
                    await thread.setLocked(false);
                    await thread.setArchived(false);
                  } catch (err) {
                    logger.warn('Could not unlock/unarchive thread:', err);
                  }
                }
            } catch (e) {
              logger.warn('Could not rename thread:', e.message);
            }
          }

          return interaction.reply({ content: `Status updated to ${newStatus}.`, ephemeral: true });
        } catch (error) {
          return interaction.reply({ content: `Failed to update issue: ${error.message}`, ephemeral: true });
        }
      }


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
              content: `Successfully added ${suggestedStages.length} suggested stages to task \`${taskId}\`: **${task?.name || 'Unknown task'}**.
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
              content: `Skipped suggested stages for task \`${taskId}\`: **${task.name}**.
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
                      .setDescription('Suggested follow-up tasks and next actions:')
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
      const actionKey = parts.slice(0, 2).join('_');
      const id = parts.length >= 2 ? parts[1] : null;


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
          let prefix = `${idx + 1}.`;

          if (stage.done === 1) {
            status = '✅ Done';
            if (stage.completed_at) {
              status += ` (${new Date(stage.completed_at).toLocaleDateString()})`;
            }
          } else if (idx === currentStageIdx) {
            // This is the current active stage
            prefix = `**🔄 ${idx + 1}.`;
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
      else if (actionKey === 'post_changelog') {
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
          const changelogId = parts[2];
          const targetChannelId = parts.length > 3 ? parts[3] : null;
          await postChangelogEntry(client, changelogId, targetChannelId);

          await interaction.reply({
            content: 'Changelog entry posted successfully!',
            ephemeral: true
          });
        } catch (error) {
          const changelogId = parts[2];
          logger.error(`Error posting changelog ${changelogId}:`, error);
          await interaction.reply({
            content: `Failed to post changelog: ${error.message}`,
            ephemeral: true
          });
        }
        return;
      }

      // Handle changelog discard button
      else if (actionKey === 'discard_changelog') {
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
          const changelogId = parts[2];
          const result = db.prepare(
            'DELETE FROM changelogs WHERE id = ?'
          ).run(changelogId);

          if (result.changes === 0) {
            await interaction.reply({
              content: 'Changelog entry not found.',
              ephemeral: true
            });
            return;
          }

          logger.info(`User ${interaction.user.tag} discarded changelog ${changelogId}`);
          await interaction.reply({
            content: 'Changelog entry discarded.',
            ephemeral: true
          });
        } catch (error) {
          const changelogId = parts[2];
          logger.error(`Error discarding changelog ${changelogId}:`, error);
          await interaction.reply({
            content: `Failed to discard changelog: ${error.message}`,
            ephemeral: true
          });
        }
        return;
      }

      // Handle create patch announcement button
      else if (actionKey === 'create_patch') {
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
          const changelogId = parts[2];
          const changelog = db.prepare(
            'SELECT * FROM changelogs WHERE id = ?'
          ).get(changelogId);

          if (!changelog) {
            await interaction.reply({
              content: 'Changelog entry not found.',
              ephemeral: true
            });
            return;
          }

          // Generate patch announcement
          const announcement = await generatePatchAnnouncement({ id: changelogId });

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

      // Handle simple_tasks (admintasks) button interactions
      else if (oldAction === 'st') {
        const stAction = parts[1]; // complete, assign, details, list
        const taskId = parts[2];

        try {
          // Handle complete button
          if (stAction === 'complete') {
            // Get the task
            const task = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);

            if (!task) {
              await interaction.reply({ content: '❌ Task not found.', ephemeral: true });
              return;
            }

            // Verify this button is on the correct message (safety check)
            if (interaction.message && task.message_id && interaction.message.id !== task.message_id) {
              logger.warn(`Button message ID mismatch: button on ${interaction.message.id}, task stored ${task.message_id}`);
              // Continue anyway, but log the mismatch
            }

            // Check permissions: admin, creator, or assignee
            const assigneeIds = JSON.parse(task.assignee_ids || '[]');
            const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
            const isCreator = task.creator_id === interaction.user.id;
            const isAssignee = assigneeIds.includes(interaction.user.id);

            if (!isAdmin && !isCreator && !isAssignee) {
              await interaction.reply({
                content: '⛔ You do not have permission to complete this task.',
                ephemeral: true
              });
              return;
            }

            logger.info(`Admin task ${taskId} being completed by ${interaction.user.tag} (admin:${isAdmin}, creator:${isCreator}, assignee:${isAssignee})`);

            // Mark as completed
            db.prepare('UPDATE simple_tasks SET status = ?, completed_at = ? WHERE id = ?')
              .run('completed', Date.now(), taskId);

            // Update the message with collapsed format
            const updatedTask = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);
            const admintasksCommand = client.commands.get('admintasks');

            if (admintasksCommand && interaction.message) {
              const collapsedEmbed = admintasksCommand.createTaskEmbed(updatedTask);
              const collapsedButtons = admintasksCommand.createTaskButtons(updatedTask);

              logger.info(`Updating message ${interaction.message.id} with collapsed format for task ${taskId}`);

              await interaction.update({
                embeds: [collapsedEmbed],
                components: collapsedButtons
              });

              logger.info(`Admin task ${taskId} successfully completed and collapsed by ${interaction.user.tag}`);
            } else {
              logger.warn(`Could not update message for task ${taskId} - command or message not found`);
              await interaction.reply({ content: '✅ Task marked as complete!', ephemeral: true });
            }

            return;
          }

          // Handle self-assign button
          else if (stAction === 'assign') {
            // Get the task
            const task = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);

            if (!task) {
              await interaction.reply({ content: '❌ Task not found.', ephemeral: true });
              return;
            }

            // Verify this button is on the correct message (safety check)
            if (interaction.message && task.message_id && interaction.message.id !== task.message_id) {
              logger.warn(`Button message ID mismatch: button on ${interaction.message.id}, task stored ${task.message_id}`);
              // Continue anyway, but log the mismatch
            }

            // Add user to assignee_ids
            const assigneeIds = JSON.parse(task.assignee_ids || '[]');

            if (assigneeIds.includes(interaction.user.id)) {
              await interaction.reply({
                content: '⚠️ You are already assigned to this task.',
                ephemeral: true
              });
              return;
            }

            logger.info(`User ${interaction.user.tag} self-assigning to task ${taskId}`);

            assigneeIds.push(interaction.user.id);
            db.prepare('UPDATE simple_tasks SET assignee_ids = ? WHERE id = ?')
              .run(JSON.stringify(assigneeIds), taskId);

            // Update the message with new buttons
            const updatedTask = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);
            const admintasksCommand = client.commands.get('admintasks');

            if (admintasksCommand && interaction.message) {
              const updatedEmbed = admintasksCommand.createTaskEmbed(updatedTask);
              const updatedButtons = admintasksCommand.createTaskButtons(updatedTask);

              logger.info(`Updating message ${interaction.message.id} with new assignee for task ${taskId}`);

              await interaction.update({
                embeds: [updatedEmbed],
                components: updatedButtons
              });

              logger.info(`Admin task ${taskId} successfully self-assigned by ${interaction.user.tag}`);
            } else {
              logger.warn(`Could not update message for task ${taskId} - command or message not found`);
              await interaction.reply({ content: '✅ Task assigned to you!', ephemeral: true });
            }

            return;
          }

          // Handle details button
          else if (stAction === 'details') {
            const task = db.prepare('SELECT * FROM simple_tasks WHERE id = ?').get(taskId);

            if (!task) {
              await interaction.reply({ content: '❌ Task not found.', ephemeral: true });
              return;
            }

            const assigneeIds = JSON.parse(task.assignee_ids || '[]');
            const assigneeText = assigneeIds.length > 0
              ? assigneeIds.map(id => `<@${id}>`).join(', ')
              : '_Unassigned_';

            const detailsEmbed = new EmbedBuilder()
              .setTitle(`📋 ${task.title}`)
              .setDescription(task.description || '_No description_')
              .setColor(task.status === 'completed' ? 0x2ecc71 : 0x3498db)
              .addFields(
                { name: '👤 Assigned To', value: assigneeText, inline: true },
                { name: '📊 Status', value: task.status, inline: true },
                { name: '👨‍💼 Creator', value: `<@${task.creator_id}>`, inline: true },
                { name: '📅 Created', value: new Date(task.created_at).toLocaleString(), inline: true }
              )
              .setFooter({ text: `Task ID: ${task.id}` });

            if (task.completed_at) {
              detailsEmbed.addFields({
                name: '✅ Completed',
                value: new Date(task.completed_at).toLocaleString(),
                inline: true
              });
            }

            await interaction.reply({ embeds: [detailsEmbed], ephemeral: true });
            return;
          }

          // Handle list pagination buttons
          else if (stAction === 'list') {
            const page = parseInt(taskId); // In this case, taskId is actually the page number

            if (isNaN(page)) {
              await interaction.reply({ content: '❌ Invalid page number.', ephemeral: true });
              return;
            }

            const admintasksCommand = client.commands.get('admintasks');
            if (!admintasksCommand) {
              await interaction.reply({ content: '❌ Command not available.', ephemeral: true });
              return;
            }

            // Create a mock interaction object with the page option
            const mockInteraction = {
              ...interaction,
              options: {
                getInteger: (name) => name === 'page' ? page : null,
                getSubcommand: () => 'list'
              },
              guildId: interaction.guildId,
              editReply: interaction.update.bind(interaction),
              deferReply: async () => { } // No-op since we'll use update
            };

            await admintasksCommand.handleList(mockInteraction);
            return;
          }
        } catch (error) {
          logger.error(`Error handling simple_tasks button (${stAction}):`, error);
          await interaction.reply({
            content: `An error occurred: ${error.message}`,
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
  // Skip DMs only (we still want to archive bot messages in threads)
  if (!message.guild) {
    return;
  }

  // Check bot's permissions in the channel
  const channelPerms = message.channel.permissionsFor(message.guild.members.me);
  if (!channelPerms || !channelPerms.has('ViewChannel') || !channelPerms.has('ReadMessageHistory')) {
    return;
  }

  // ALWAYS archive admin task thread messages regardless of source channel filtering
  let archivedToAdminTask = false;
  let isChangelogThread = false;
  try {
    const isThread = typeof message.channel.isThread === 'function' && message.channel.isThread();
    if (isThread) {
      // Find admin task for this thread
      const allTasks = db.prepare('SELECT * FROM admin_tasks').all();
      const adminTask = allTasks.find(t => t && t.thread_id === message.channel.id);
      if (adminTask) {
        const attachments = message.attachments?.size > 0
          ? JSON.stringify(Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name, size: a.size })))
          : null;
        db.prepare(`
          INSERT OR REPLACE INTO admin_task_thread_messages 
          (message_id, task_id, thread_id, author_id, author_tag, content, timestamp, attachments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          message.id,
          adminTask.task_id,
          message.channel.id,
          message.author.id,
          message.author.tag,
          message.content || '',
          message.createdTimestamp,
          attachments
        );
        archivedToAdminTask = true;
      }

      // Detect changelog thread and exclude from general chat storage
      try {
        const versions = db.prepare('SELECT * FROM changelog_versions').all();
        isChangelogThread = Array.isArray(versions) && versions.some(v => v && v.thread_id === message.channel.id);
      } catch { }
    }
  } catch (err) {
    logger.warn('Failed to archive admin task thread message:', err);
  }

  // OPTIMIZATION: Only store general chat messages from configured source channels (if specified)
  const sourceChannelsEnv = process.env.DAILY_SUMMARY_SOURCE_CHANNELS;
  if (!archivedToAdminTask && !isChangelogThread && sourceChannelsEnv) {
    const sourceChannels = sourceChannelsEnv.split(',').map(s => s.trim()).filter(Boolean);
    if (sourceChannels.length > 0 && !sourceChannels.includes(message.channel.id)) {
      // Skip general storage for non-source channels
      return;
    }
  }

  // Store general chat messages (exclude bot messages)
  if (!archivedToAdminTask && !isChangelogThread && !message.author.bot) {
    try {
      storeChatMessage(db, message);
    } catch (error) {
      logger.error('Error storing message for chat summary:', error);
    }
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
