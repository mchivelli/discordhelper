const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../utils/db');
const logger = require('../utils/logger');
const { issueActionRow, buildIssueEmbed, createIssueDetailsModal } = require('../components/issue-components');

const DEFAULT_ISSUE_CHANNEL_ID = process.env.ISSUE_TRACKER_CHANNEL_ID || '1410922842341507143';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('issue')
    .setDescription('Track issues with a thread and status controls')
    .addSubcommand(sub =>
      sub.setName('track')
        .setDescription('Create and track a new issue in the tracker channel')
        .addStringOption(o => o.setName('title').setDescription('Issue title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Describe the issue').setRequired(true))
        .addStringOption(o => o.setName('severity').setDescription('Severity').setRequired(false)
          .addChoices(
            { name: 'Low', value: 'low' },
            { name: 'Normal', value: 'normal' },
            { name: 'High', value: 'high' },
            { name: 'Critical', value: 'critical' }
          ))
        .addChannelOption(o => o.setName('channel').setDescription('Override target channel').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('set-channel')
        .setDescription('Set the default channel for issue tracking')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post issues').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'set-channel') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: 'You need Manage Channels permission.', ephemeral: true });
        }
        const ch = interaction.options.getChannel('channel');
        if (!ch || !ch.isTextBased()) {
          return interaction.reply({ content: 'Please select a text channel.', ephemeral: true });
        }
        db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)')
          .run('issue_channel_id', ch.id);
        return interaction.reply({ content: `Default issue channel set to <#${ch.id}>`, ephemeral: true });
      }

      if (sub === 'track') {
        await interaction.deferReply();
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const severity = interaction.options.getString('severity') || 'normal';
        const override = interaction.options.getChannel('channel');

        const setting = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('issue_channel_id');
        const channelId = override?.id || setting?.value || DEFAULT_ISSUE_CHANNEL_ID;
        let channel;
        try {
          channel = await interaction.client.channels.fetch(channelId);
        } catch (e) {
          logger.warn('Issue channel fetch failed, falling back to current channel:', e.message);
          channel = interaction.channel;
        }

        // Create the issue record
        const issueId = `iss-${Date.now().toString().slice(-7)}`;
        const issue = {
          id: issueId,
          title,
          description,
          status: 'open',
          severity,
          reporter_id: interaction.user.id,
          assignee_id: null,
          guild_id: interaction.guildId,
          channel_id: channel.id,
          thread_id: null,
          message_id: null,
          details: null,
          created_at: Date.now(),
          updated_at: Date.now()
        };

        db.prepare('INSERT INTO issues (id, title, description, status, severity, reporter_id, assignee_id, guild_id, channel_id, thread_id, message_id, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(issue.id, issue.title, issue.description, issue.status, issue.severity, issue.reporter_id, issue.assignee_id, issue.guild_id, issue.channel_id, issue.thread_id, issue.message_id, issue.details, issue.created_at, issue.updated_at);

        // Post the embed to channel
        const embed = buildIssueEmbed(issue, interaction.user);
        const components = [issueActionRow(issue.id, issue.status)];
        const message = await channel.send({ embeds: [embed], components });

        // Create a thread for discussion
        let thread;
        try {
          thread = await message.startThread({ name: `Issue: ${title.substring(0, 80)}` });
        } catch (e) {
          logger.warn('Could not create thread for issue:', e.message);
        }

        // Update DB with message/thread ids
        const threadId = thread?.id || null;
        issue.thread_id = threadId;
        issue.message_id = message.id;
        issue.updated_at = Date.now();
        db.prepare('UPDATE issues SET thread_id = ?, message_id = ?, updated_at = ? WHERE id = ?')
          .run(issue.thread_id, issue.message_id, issue.updated_at, issue.id);

        // Reply to user
        return interaction.editReply({ content: `Issue created in <#${channel.id}>${threadId ? ` with thread <#${threadId}>` : ''}.`, embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in issue command:', error);
      if (interaction.deferred) {
        return interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
      return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
  }
};


