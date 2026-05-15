const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { callLLMSmart } = require('../utils/llm');
const { getRecentMessages } = require('../utils/ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('insights')
    .setDescription('Generate AI-powered insights from chat history')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to analyze (defaults to current)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days of history to analyze (default: 7, max: 30)')
        .setMinValue(1)
        .setMaxValue(30)
        .setRequired(false))
    .addStringOption(option =>
      option.setName('focus')
        .setDescription('Specific focus area (e.g., "productivity", "team dynamics", "decisions")')
        .setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const days = interaction.options.getInteger('days') || 7;
    const focus = interaction.options.getString('focus');
    const guildId = interaction.guild.id;

    await interaction.deferReply();

    try {
      const messages = getRecentMessages(db, guildId, channel.id, days * 24, null);

      if (!messages || messages.length === 0) {
        return interaction.editReply({
          content: `❌ No messages found in ${channel}.`
        });
      }

      // Build transcript
      const transcript = messages.slice(0, 200).map(m => `${m.username}: ${m.content}`).join('\n');

      // Generate insights
      const focusPrompt = focus ? `Focus on: ${focus}.` : '';
      const llmMessages = [
        {
          role: 'system',
          content: `Analyze the Discord chat messages and provide actionable insights. Cover: 1) Key themes and patterns, 2) Team dynamics and collaboration, 3) Productivity blockers and enablers, 4) Decision-making patterns, 5) Recommendations for improvement. ${focusPrompt} Be specific and cite examples when possible.`
        },
        {
          role: 'user',
          content: transcript
        }
      ];

      const insights = await callLLMSmart(llmMessages, 1000);

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`💡 Insights: #${channel.name}`)
        .setDescription(insights)
        .setColor(0x00d4aa)
        .setTimestamp()
        .setFooter({
          text: `Based on ${messages.length} messages from the last ${days} days`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Insights generated for #${channel.name} (${messages.length} messages)`);
    } catch (error) {
      logger.error('Error in insights command:', error);
      await interaction.editReply({
        content: `❌ Error generating insights: ${error.message}`
      });
    }
  }
};
