const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../utils/db');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const TODO_CHANNEL_ID = '1292819438370033685';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admintasks')
    .setDescription('Manage administrative tasks')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new admin task')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Task title')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Task description')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('assignee1')
            .setDescription('First assignee (admin)')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('assignee2')
            .setDescription('Second assignee (admin)')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('assignee3')
            .setDescription('Third assignee (admin)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all admin tasks'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('mytasks')
        .setDescription('List tasks assigned to you'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete an admin task')
        .addStringOption(option =>
          option.setName('task_id')
            .setDescription('Task ID to delete')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('recover')
        .setDescription('🚑 EMERGENCY: Recover all tasks from database')
        .addStringOption(option =>
          option.setName('channel_id')
            .setDescription('New TODO channel ID')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('backfill')
        .setDescription('Archive messages from existing admin task threads so future recoveries can replay them')
        .addStringOption(option =>
          option.setName('task_id')
            .setDescription('Specific task ID to backfill (leave empty to backfill all)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'task_id') {
      const tasks = db.prepare('SELECT task_id, title FROM admin_tasks ORDER BY created_at DESC LIMIT 25').all();
      
      // Filter out invalid entries and ensure we have valid choices
      const validTasks = tasks.filter(task => task && task.task_id && task.title);
      
      const choices = validTasks.map(task => ({
        name: `${task.task_id}: ${task.title}`.substring(0, 100),
        value: task.task_id
      }));
      
      // If no valid tasks, provide a helpful message
      if (choices.length === 0) {
        choices.push({
          name: 'No admin tasks found',
          value: 'no_tasks_found'
        });
      }
      
      return interaction.respond(choices);
    }
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        return this.createTask(interaction);
      case 'list':
        return this.listTasks(interaction);
      case 'mytasks':
        return this.listMyTasks(interaction);
      case 'delete':
        return this.deleteTask(interaction);
      case 'recover':
        return this.recoverTasks(interaction);
      case 'backfill':
        return this.backfillMessages(interaction);
    }
  },

  async createTask(interaction) {
    try {
      await interaction.deferReply();

      // Get the To-Do channel
      const todoChannel = await interaction.guild.channels.fetch(TODO_CHANNEL_ID).catch(() => null);
      if (!todoChannel) {
        return interaction.editReply('❌ To-Do channel not found! Please check the channel ID configuration.');
      }

      // Get task details
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const assignees = [];
      
      // Collect assignees
      for (let i = 1; i <= 4; i++) {
        const user = interaction.options.getUser(`assignee${i}`);
        if (user) assignees.push(user);
      }
      
      const isUnassigned = assignees.length === 0;

      // Generate task ID
      const timestamp = Date.now();
      const taskId = `task-${timestamp}`;
      
      // Store task in database first (without thread_id)
      db.prepare(`
        INSERT INTO admin_tasks (
          task_id, title, description, status, creator_id, 
          channel_id, guild_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId, title, description, 'in_progress', interaction.user.id,
        TODO_CHANNEL_ID, interaction.guildId, timestamp
      );

      // Store assignees
      for (const assignee of assignees) {
        db.prepare('INSERT INTO admin_task_assignees (task_id, user_id) VALUES (?, ?)')
          .run(taskId, assignee.id);
      }

      // Format date
      const date = new Date(timestamp);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      // Create task embed (without thread link initially)
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(isUnassigned ? 0x808080 : 0xFFA500) // Gray for unassigned, Orange for in progress
        .addFields(
          { name: 'Status', value: isUnassigned ? '⏳ Unassigned' : '🔄 In Progress', inline: true },
          { name: 'Creator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Assigned To', value: isUnassigned ? '❓ Unclaimed - Click "Claim Task" to assign yourself' : assignees.map(u => `<@${u.id}>`).join(', '), inline: false }
        )
        .setFooter({ text: `Task ID: ${taskId} • ${dateStr}` })
        .setTimestamp();

      // Create action buttons based on whether task is assigned
      const actionRow = new ActionRowBuilder();
      
      if (isUnassigned) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`admintask_claim_${taskId}`)
            .setLabel('Claim Task')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✋')
        );
      } else {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`admintask_complete_${taskId}`)
            .setLabel('Mark Complete')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`admintask_progress_${taskId}`)
            .setLabel('Mark In Progress')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
          new ButtonBuilder()
            .setCustomId(`admintask_reopen_${taskId}`)
            .setLabel('Reopen')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔓')
        );
      }

      // Send the task message in the main channel
      const taskMessage = await todoChannel.send({ embeds: [embed], components: [actionRow] });

      // Create thread under the task message
      const thread = await taskMessage.startThread({
        name: `Task: ${title}`,
        autoArchiveDuration: 10080, // 7 days
        reason: `Admin task thread created by ${interaction.user.tag}`
      });

      // Update the embed to include the thread link
      embed.addFields({ name: 'Discussion Thread', value: `<#${thread.id}>`, inline: true });
      await taskMessage.edit({ embeds: [embed], components: [actionRow] });

      // Update database with thread_id
      db.prepare('UPDATE admin_tasks SET thread_id = ? WHERE task_id = ?')
        .run(thread.id, taskId);

      // Store message ID
      db.prepare('UPDATE admin_tasks SET message_id = ? WHERE task_id = ?')
        .run(taskMessage.id, taskId);

      // Add initial message to thread
      await thread.send(`This thread is for discussing the task: **${title}**\n\nAssigned admins can coordinate here to implement the required steps.`);

      // Notify assignees
      const mentions = assignees.map(u => `<@${u.id}>`).join(' ');
      await thread.send(`${mentions} - You have been assigned to this task.`);

      await interaction.editReply(`✅ Admin task created successfully!\n📋 **Task:** ${title}\n🧵 **Thread:** <#${thread.id}>`);

    } catch (error) {
      logger.error('Error creating admin task:', error);
      if (interaction.deferred) {
        await interaction.editReply('❌ Failed to create admin task: ' + error.message);
      } else {
        await interaction.reply({ content: '❌ Failed to create admin task: ' + error.message, ephemeral: true });
      }
    }
  },

  async listTasks(interaction) {
    try {
      await interaction.deferReply();

      const statusFilter = interaction.options.getString('status') || 'all';
      
      let query = 'SELECT * FROM admin_tasks';
      const params = [];
      
      if (statusFilter !== 'all') {
        query += ' WHERE status = ?';
        params.push(statusFilter);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const tasks = db.prepare(query).all(...params);

      if (tasks.length === 0) {
        return interaction.editReply('📋 No admin tasks found.');
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Admin Tasks')
        .setColor(0x3498db)
        .setTimestamp();

      for (const task of tasks.slice(0, 10)) {
        const assignees = db.prepare('SELECT user_id FROM admin_task_assignees WHERE task_id = ?')
          .all(task.task_id)
          .map(a => `<@${a.user_id}>`)
          .join(', ');

        const statusEmoji = {
          'not_started': '⏳',
          'in_progress': '🔄',
          'complete': '✅'
        }[task.status] || '❓';

        embed.addFields({
          name: `${statusEmoji} ${task.title}`,
          value: `**Status:** ${task.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}\n**Assigned:** ${assignees || 'None'}\n**Thread:** <#${task.thread_id}>\n**ID:** \`${task.task_id}\``,
          inline: false
        });
      }

      if (tasks.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${tasks.length} tasks` });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error listing admin tasks:', error);
      if (interaction.deferred) {
        await interaction.editReply('❌ Failed to list tasks: ' + error.message);
      } else {
        await interaction.reply({ content: '❌ Failed to list tasks: ' + error.message, ephemeral: true });
      }
    }
  },

  async listMyTasks(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;
      const statusFilter = interaction.options.getString('status') || 'all';
      
      // Get tasks assigned to this user
      let query = `
        SELECT t.*, GROUP_CONCAT(a.user_id) as assignees
        FROM admin_tasks t
        JOIN admin_task_assignees a ON t.task_id = a.task_id
        WHERE a.user_id = ?
      `;
      const params = [userId];
      
      if (statusFilter !== 'all') {
        query += ' AND t.status = ?';
        params.push(statusFilter);
      }
      
      query += ' GROUP BY t.task_id ORDER BY t.created_at DESC';
      
      const tasks = db.prepare(query).all(...params);

      if (tasks.length === 0) {
        const statusText = statusFilter === 'all' ? 'any status' : statusFilter.replace('_', ' ');
        return interaction.editReply(`📋 You have no admin tasks assigned with ${statusText}.`);
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Your Assigned Admin Tasks')
        .setColor(0x3498db)
        .setTimestamp();

      for (const task of tasks.slice(0, 10)) {
        const allAssignees = db.prepare('SELECT user_id FROM admin_task_assignees WHERE task_id = ?')
          .all(task.task_id)
          .map(a => `<@${a.user_id}>`)
          .join(', ');

        const statusEmoji = {
          'not_started': '⏳',
          'in_progress': '🔄',
          'complete': '✅'
        }[task.status] || '❓';

        const statusDisplay = task.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

        embed.addFields({
          name: `${statusEmoji} ${task.title}`,
          value: `**Status:** ${statusDisplay}\n**Description:** ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}\n**All Assignees:** ${allAssignees}\n**Thread:** <#${task.thread_id}>\n**ID:** \`${task.task_id}\``,
          inline: false
        });
      }

      if (tasks.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${tasks.length} tasks assigned to you` });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error listing user tasks:', error);
      if (interaction.deferred) {
        await interaction.editReply('❌ Failed to list your tasks: ' + error.message);
      } else {
        await interaction.reply({ content: '❌ Failed to list your tasks: ' + error.message, ephemeral: true });
      }
    }
  },

  async deleteTask(interaction) {
    try {
      await interaction.deferReply();

      const taskId = interaction.options.getString('task_id');
      
      // Get task details
      const task = db.prepare('SELECT * FROM admin_tasks WHERE task_id = ?').get(taskId);
      
      if (!task) {
        return interaction.editReply('❌ Task not found.');
      }

      // Try to delete the thread (ONLY if it's actually a thread, not a channel)
      try {
        if (task.thread_id) {
          const channel = await interaction.guild.channels.fetch(task.thread_id).catch(() => null);
          
          // CRITICAL SAFETY CHECK: Only delete if it's actually a thread
          if (channel && channel.isThread()) {
            await channel.delete('Admin task deleted');
            logger.info(`Deleted thread ${task.thread_id} for task ${taskId}`);
          } else if (channel) {
            logger.error(`SAFETY ABORT: Attempted to delete non-thread channel ${task.thread_id} (type: ${channel.type}). This is likely the parent channel!`);
            await interaction.followUp({ 
              content: `⚠️ **SAFETY ABORT**: The stored thread_id points to a regular channel, not a thread. The channel was NOT deleted for safety. Please contact an admin to fix the database.`,
              ephemeral: true 
            });
          }
        }
      } catch (error) {
        logger.warn('Could not delete thread:', error);
      }
      // Delete from database
      db.prepare('DELETE FROM admin_task_assignees WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM admin_tasks WHERE task_id = ?').run(taskId);

      await interaction.editReply(`✅ Admin task **${task.title}** has been deleted.`);

    } catch (error) {
      logger.error('Error deleting admin task:', error);
      if (interaction.deferred) {
        await interaction.editReply('❌ Failed to delete task: ' + error.message);
      } else {
        await interaction.reply({ content: '❌ Failed to delete task: ' + error.message, ephemeral: true });
      }
    }
  },

  async recoverTasks(interaction) {
    try {
      await interaction.deferReply();

      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply('❌ Only administrators can use the recovery command.');
      }

      const newChannelId = interaction.options.getString('channel_id');
      const todoChannel = await interaction.guild.channels.fetch(newChannelId).catch(() => null);
      
      if (!todoChannel) {
        return interaction.editReply('❌ Channel not found! Please provide a valid channel ID.');
      }

      if (todoChannel.type !== ChannelType.GuildText) {
        return interaction.editReply('❌ The provided channel must be a text channel.');
      }

      const tasks = db.prepare('SELECT * FROM admin_tasks ORDER BY created_at ASC').all();
      
      if (tasks.length === 0) {
        return interaction.editReply('❌ No tasks found in database to recover.');
      }

      await interaction.editReply(`🔄 **Starting Recovery Process**\n\nFound ${tasks.length} tasks. This may take a moment...\n\n_Do not cancel!_`);

      let recovered = 0;
      let failed = 0;
      const errors = [];

      for (const task of tasks) {
        try {
          const assignees = db.prepare('SELECT user_id FROM admin_task_assignees WHERE task_id = ?').all(task.task_id);
          const assigneeList = assignees.map(a => `<@${a.user_id}>`).join(', ') || '❓ Unassigned';
          const isUnassigned = assignees.length === 0;

          const date = new Date(task.created_at);
          const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

          let statusEmoji = '🔄';
          let statusText = 'In Progress';
          let embedColor = 0xFFA500;

          if (task.status === 'complete') {
            statusEmoji = '✅';
            statusText = 'Complete';
            embedColor = 0x00FF00;
          } else if (isUnassigned) {
            statusEmoji = '⏳';
            statusText = 'Unassigned';
            embedColor = 0x808080;
          }

          const embed = new EmbedBuilder()
            .setTitle(task.title)
            .setDescription(task.description)
            .setColor(embedColor)
            .addFields(
              { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true },
              { name: 'Creator', value: `<@${task.creator_id}>`, inline: true },
              { name: 'Assigned To', value: assigneeList, inline: false }
            )
            .setFooter({ text: `Task ID: ${task.task_id} • ${dateStr}` })
            .setTimestamp();

          const actionRow = new ActionRowBuilder();
          
          if (task.status === 'complete') {
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`admintask_reopen_${task.task_id}`)
                .setLabel('Reopen')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔓')
            );
          } else if (isUnassigned) {
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`admintask_claim_${task.task_id}`)
                .setLabel('Claim Task')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✋')
            );
          } else {
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`admintask_complete_${task.task_id}`)
                .setLabel('Mark Complete')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
              new ButtonBuilder()
                .setCustomId(`admintask_progress_${task.task_id}`)
                .setLabel('Mark In Progress')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
              new ButtonBuilder()
                .setCustomId(`admintask_reopen_${task.task_id}`)
                .setLabel('Reopen')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔓')
            );
          }

          const taskMessage = await todoChannel.send({ embeds: [embed], components: [actionRow] });

          const threadName = task.status === 'complete' 
            ? `[Complete] Task: ${task.title.substring(0, 80)}`
            : `Task: ${task.title.substring(0, 93)}`;
            
          const thread = await taskMessage.startThread({
            name: threadName,
            autoArchiveDuration: 10080,
            reason: 'Admin task recovery'
          });

          embed.addFields({ name: 'Discussion Thread', value: `<#${thread.id}>`, inline: true });
          await taskMessage.edit({ embeds: [embed], components: [actionRow] });

          db.prepare('UPDATE admin_tasks SET thread_id = ?, message_id = ?, channel_id = ? WHERE task_id = ?')
            .run(thread.id, taskMessage.id, newChannelId, task.task_id);

          await thread.send(`📋 **Task Recovered**\n\nThis task was recovered from the database after channel deletion.\n\nOriginal creation: ${dateStr}`);

          if (assignees.length > 0) {
            const mentions = assignees.map(a => `<@${a.user_id}>`).join(' ');
            await thread.send(`${mentions} - You are assigned to this task.`);
          }

          // Replay archived thread messages (if available)
          try {
            let archived = db.prepare(
              'SELECT * FROM admin_task_thread_messages WHERE task_id = ? ORDER BY timestamp ASC'
            ).all(task.task_id);

            // Fallback: use chat_messages from the old thread if no dedicated archive exists
            if ((!archived || archived.length === 0) && task.thread_id) {
              try {
                archived = db.prepare(
                  'SELECT * FROM chat_messages WHERE guild_id = ? AND channel_id = ? ORDER BY timestamp ASC'
                ).all(task.guild_id, task.thread_id);
              } catch (fallbackErr) {
                logger.warn('Fallback fetch of chat_messages failed:', fallbackErr);
              }
            }

            if (archived && archived.length > 0) {
              await thread.send(`📦 Replaying ${archived.length} archived message(s) from the original thread...`);

              const sendChunked = async (text) => {
                const maxLen = 1900; // Leave margin under 2000
                if (!text) return;
                if (text.length <= maxLen) {
                  await thread.send({ content: text });
                  return;
                }
                for (let i = 0; i < text.length; i += maxLen) {
                  await thread.send({ content: text.slice(i, i + maxLen) });
                  await new Promise(r => setTimeout(r, 150));
                }
              };

              for (const m of archived) {
                try {
                  const authorId = m.author_id || m.user_id || 'unknown';
                  const authorTag = m.author_tag || m.username || 'unknown';
                  const ts = Math.floor(((m.timestamp || Date.now()) / 1000));
                  const header = `<t:${ts}:f> • <@${authorId}> (${authorTag})`;
                  const content = (m.content || '').toString();
                  let attachmentsText = '';
                  try {
                    const atts = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : (m.attachments || []);
                    if (Array.isArray(atts) && atts.length > 0) {
                      attachmentsText = '\n' + atts.map(a => `🔗 ${a.name || 'file'}: ${a.url}`).join('\n');
                    }
                  } catch {}
                  const text = `${header}\n${content}${attachmentsText}`.trim();
                  await sendChunked(text);
                  await new Promise(r => setTimeout(r, 150));
                } catch (replayErr) {
                  logger.warn('Failed to replay an archived message:', replayErr);
                }
              }
            }
          } catch (archiveErr) {
            logger.warn('Error during thread message replay:', archiveErr);
          }

          if (task.status === 'complete') {
            await thread.setLocked(true).catch(() => {});
            await thread.setArchived(true).catch(() => {});
          }

          recovered++;
          logger.info(`Recovered task ${task.task_id}: ${task.title}`);
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (taskError) {
          failed++;
          errors.push(`${task.task_id}: ${taskError.message}`);
          logger.error(`Failed to recover task ${task.task_id}:`, taskError);
        }
      }

      let report = `✅ **Recovery Complete!**\n\n`;
      report += `✅ **Recovered:** ${recovered} tasks\n`;
      if (failed > 0) {
        report += `❌ **Failed:** ${failed} tasks\n\n`;
        report += `**Errors:**\n${errors.slice(0, 5).map(e => `- ${e}`).join('\n')}`;
        if (errors.length > 5) {
          report += `\n_...and ${errors.length - 5} more errors_`;
        }
      }
      report += `\n\n**New TODO Channel:** <#${newChannelId}>`;
      report += `\n\n⚠️ **IMPORTANT:** Update line 7 in \`src/commands/admintasks.js\`:\n\`\`\`javascript\nconst TODO_CHANNEL_ID = '${newChannelId}';\n\`\`\``;

      await interaction.followUp(report);

    } catch (error) {
      logger.error('Error recovering tasks:', error);
      if (interaction.deferred) {
        await interaction.editReply('❌ Failed to recover tasks: ' + error.message);
      } else {
        await interaction.reply({ content: '❌ Failed to recover tasks: ' + error.message, ephemeral: true });
      }
    }
  }
  ,
  async backfillMessages(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply('❌ Only administrators can use the backfill command.');
      }

      const specificTaskId = interaction.options.getString('task_id');
      let tasks = [];
      if (specificTaskId && specificTaskId !== 'no_tasks_found') {
        const t = db.prepare('SELECT * FROM admin_tasks WHERE task_id = ?').get(specificTaskId);
        if (t) tasks = [t];
      } else {
        tasks = db.prepare('SELECT * FROM admin_tasks ORDER BY created_at ASC').all();
      }

      if (!tasks || tasks.length === 0) {
        return interaction.editReply('📋 No admin tasks found to backfill.');
      }

      let totalArchived = 0;
      let threadsProcessed = 0;
      let threadsMissing = 0;
      for (const task of tasks) {
        if (!task.thread_id) {
          threadsMissing++;
          continue;
        }
        const thread = await interaction.guild.channels.fetch(task.thread_id).catch(() => null);
        if (!thread || !thread.isThread()) {
          threadsMissing++;
          continue;
        }

        threadsProcessed++;
        let lastId = undefined;
        while (true) {
          const batch = await thread.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
          if (!batch || batch.size === 0) break;
          const sorted = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
          for (const msg of sorted) {
            try {
              const attachments = msg.attachments?.size > 0
                ? JSON.stringify(Array.from(msg.attachments.values()).map(a => ({ url: a.url, name: a.name, size: a.size })))
                : null;
              db.prepare(`
                INSERT OR REPLACE INTO admin_task_thread_messages 
                (message_id, task_id, thread_id, author_id, author_tag, content, timestamp, attachments)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                msg.id,
                task.task_id,
                thread.id,
                msg.author?.id || 'unknown',
                msg.author?.tag || 'unknown',
                msg.content || '',
                msg.createdTimestamp || Date.now(),
                attachments
              );
              totalArchived++;
            } catch (e) {
              logger.warn(`Backfill: Failed to archive message ${msg.id} in thread ${thread.id}:`, e);
            }
          }
          lastId = sorted[0]?.id;
          await new Promise(r => setTimeout(r, 250)); // small delay to respect rate limits
        }
        await new Promise(r => setTimeout(r, 500));
      }

      return interaction.editReply(`✅ Backfill complete. Threads processed: ${threadsProcessed}, missing/inaccessible: ${threadsMissing}. Messages archived: ${totalArchived}.`);
    } catch (error) {
      logger.error('Error backfilling messages:', error);
      if (interaction.deferred) {
        return interaction.editReply('❌ Backfill failed: ' + error.message);
      } else {
        return interaction.reply({ content: '❌ Backfill failed: ' + error.message, ephemeral: true });
      }
    }
  }
};
