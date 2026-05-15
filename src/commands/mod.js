const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { classifyToxicity, shouldFlagToxicity } = require('../utils/mod-ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderator tools for toxicity detection')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('Check toxicity of a specific message')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('Message ID to check')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List recent toxicity flags')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of flags to show (default: 10, max: 50)')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('dismiss')
        .setDescription('Dismiss a toxicity flag')
        .addStringOption(option =>
          option.setName('flag_id')
            .setDescription('Flag ID to dismiss')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ This command requires Moderator permissions.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'check') {
        await this.handleCheck(interaction);
      } else if (subcommand === 'list') {
        await this.handleList(interaction);
      } else if (subcommand === 'dismiss') {
        await this.handleDismiss(interaction);
      }
    } catch (error) {
      logger.error('Error in mod command:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  },

  async handleCheck(interaction) {
    const messageId = interaction.options.getString('message_id');
    const guildId = interaction.guild.id;

    try {
      // Try to fetch the message
      const channel = interaction.channel;
      const message = await channel.messages.fetch(messageId).catch(() => null);

      if (!message) {
        return interaction.editReply({
          content: '❌ Message not found or not accessible.'
        });
      }

      // Classify toxicity
      const classification = await classifyToxicity(message.content);

      const embed = new EmbedBuilder()
        .setTitle(`🛡️ Toxicity Check`)
        .addFields(
          { name: 'Message', value: message.content.substring(0, 500), inline: false },
          { name: 'Classification', value: classification.classification.toUpperCase(), inline: true },
          { name: 'Confidence', value: `${(classification.confidence * 100).toFixed(1)}%`, inline: true },
          { name: 'Details', value: classification.details, inline: false }
        )
        .setColor(classification.classification === 'safe' ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in mod check:', error);
      throw error;
    }
  },

  async handleList(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;
    const guildId = interaction.guild.id;

    try {
      const flags = db.prepare(`
        SELECT * FROM mod_flags
        WHERE guild_id = ? AND dismissed = 0
        ORDER BY created_at DESC
        LIMIT ?
      `).all(guildId, limit);

      if (!flags || flags.length === 0) {
        return interaction.editReply({
          content: '✅ No active toxicity flags.'
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚩 Recent Toxicity Flags`)
        .setDescription(`Found ${flags.length} active flag(s)`)
        .setColor(0xff9800)
        .setTimestamp();

      flags.forEach((flag, i) => {
        const channelMention = flag.channel_id ? `<#${flag.channel_id}>` : 'unknown';
        const time = new Date(flag.created_at).toLocaleString();
        embed.addFields({
          name: `${i + 1}. ${flag.classification.toUpperCase()} (${time})`,
          value: `User: ${flag.username || 'unknown'}\nChannel: ${channelMention}\nConfidence: ${(flag.confidence * 100).toFixed(1)}%\nFlag ID: ${flag.id}`,
          inline: false
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in mod list:', error);
      throw error;
    }
  },

  async handleDismiss(interaction) {
    const flagId = interaction.options.getString('flag_id');

    try {
      const result = db.prepare(`
        UPDATE mod_flags
        SET dismissed = 1, action_taken = 'Dismissed by moderator'
        WHERE id = ?
      `).run(flagId);

      if (result.changes === 0) {
        return interaction.editReply({
          content: '❌ Flag not found or already dismissed.'
        });
      }

      await interaction.editReply({
        content: `✅ Flag ${flagId} dismissed.`
      });
    } catch (error) {
      logger.error('Error in mod dismiss:', error);
      throw error;
    }
  }
};
