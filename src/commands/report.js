const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { categorizeReport } = require('../utils/mod-ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a message for moderation review')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('Message ID to report')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the report')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('evidence')
        .setDescription('Additional evidence or context')
        .setRequired(false)),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id');
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence') || '';
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    await interaction.deferReply({ ephemeral: true });

    try {
      // Try to fetch the message
      const channel = interaction.channel;
      const message = await channel.messages.fetch(messageId).catch(() => null);

      if (!message) {
        return interaction.editReply({
          content: '❌ Message not found or not accessible.'
        });
      }

      // Categorize the report
      const categorization = await categorizeReport(reason, evidence);

      // Store report in database
      const reportId = db.prepare(`
        INSERT INTO mod_reports
        (guild_id, channel_id, message_id, reporter_id, reported_user_id, content, reason, evidence, category, priority, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        guildId,
        channelId,
        messageId,
        userId,
        message.author.id,
        message.content,
        reason,
        evidence,
        categorization.category,
        categorization.priority,
        categorization.summary
      ).lastInsertRowid;

      // Create embed for moderators
      const modEmbed = new EmbedBuilder()
        .setTitle(`🚨 New Moderation Report`)
        .setColor(0xff0000)
        .addFields(
          { name: 'Category', value: categorization.category.toUpperCase(), inline: true },
          { name: 'Priority', value: categorization.priority.toUpperCase(), inline: true },
          { name: 'Report ID', value: reportId.toString(), inline: true },
          { name: 'Reporter', value: `<@${userId}>`, inline: true },
          { name: 'Reported User', value: `<@${message.author.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Summary', value: categorization.summary, inline: false }
        )
        .setTimestamp();

      if (evidence) {
        modEmbed.addFields({ name: 'Evidence', value: evidence, inline: false });
      }

      modEmbed.addFields({
        name: 'Reported Message',
        value: message.content.substring(0, 500),
        inline: false
      });

      // Send to mod channel if configured
      const modChannelId = process.env.MOD_REPORT_CHANNEL_ID;
      if (modChannelId) {
        try {
          const modChannel = await interaction.guild.channels.fetch(modChannelId);
          if (modChannel && modChannel.isTextBased()) {
            await modChannel.send({ embeds: [modEmbed] });
          }
        } catch (error) {
          logger.error('Failed to send report to mod channel:', error);
        }
      }

      await interaction.editReply({
        content: `✅ Report submitted (ID: ${reportId}). Category: ${categorization.category}, Priority: ${categorization.priority}`
      });

      logger.info(`Report ${reportId} submitted by ${userId} for message ${messageId}`);
    } catch (error) {
      logger.error('Error in report command:', error);
      await interaction.editReply({
        content: `❌ Error submitting report: ${error.message}`
      });
    }
  }
};
