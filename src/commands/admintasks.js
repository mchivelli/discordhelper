const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const db = require('../utils/db');
const logger = require('../utils/logger');

// To-Do Channel ID
const TODO_CHANNEL_ID = '1292819438370033685';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admintasks')
    .setDescription('Manage admin tasks with dedicated discussion threads')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new admin task with a discussion thread')
        .addStringOption(o =>
          o.setName('title')
            .setDescription('Task title (e.g., "Origins and Origin-Classes")')
            .setRequired(true)
            .setMaxLength(100))
        .addStringOption(o =>
          o.setName('description')
            .setDescription('Detailed description of the task')
            .setRequired(true)
            .setMaxLength(1000))
        .addUserOption(o =>
          o.setName('assignee1')
            .setDescription('First admin to assign this task to (leave empty for unassigned)')
            .setRequired(false))
        .addUserOption(o =>
          o.setName('assignee2')
            .setDescription('Second admin to assign (optional)')
            .setRequired(false))
        .addUserOption(o =>
          o.setName('assignee3')
            .setDescription('Third admin to assign (optional)')
            .setRequired(false))
        .addUserOption(o =>
          o.setName('assignee4')
            .setDescription('Fourth admin to assign (optional)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all admin tasks')
        .addStringOption(o =>
          o.setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: 'In Progress', value: 'in_progress' },
              { name: 'Complete', value: 'complete' },
              { name: 'Not Started', value: 'not_started' },
              { name: 'All', value: 'all' }
            )))
    .addSubcommand(sub =>
      sub.setName('mytasks')
        .setDescription('List tasks assigned to you')
        .addStringOption(o =>
          o.setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: 'In Progress', value: 'in_progress' },
              { name: 'Complete', value: 'complete' },
              { name: 'Not Started', value: 'not_started' },
              { name: 'All', value: 'all' }
            )))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete an admin task and its thread')
        .addStringOption(o =>
          o.setName('task_id')
            .setDescription('Task ID to delete')
            .setRequired(true)
            .setAutocomplete(true))),

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

      // Try to delete the thread
      try {
        const thread = await interaction.guild.channels.fetch(task.thread_id);
        if (thread) {
          await thread.delete('Admin task deleted');
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
  }
};
