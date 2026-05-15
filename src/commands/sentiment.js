const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { callLLMFast } = require('../utils/llm');
const { getRecentMessages } = require('../utils/ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sentiment')
    .setDescription('Analyze sentiment of recent messages in a channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to analyze (defaults to current)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('hours')
        .setDescription('Hours of history to analyze (default: 24, max: 168)')
        .setMinValue(1)
        .setMaxValue(168)
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('messages')
        .setDescription('Number of recent messages (default: 100, max: 1000)')
        .setMinValue(10)
        .setMaxValue(1000)
        .setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const hours = interaction.options.getInteger('hours');
    const messageLimit = interaction.options.getInteger('messages');
    const guildId = interaction.guild.id;

    // Validate that user doesn't provide both hours and messages
    if (hours && messageLimit) {
      return interaction.reply({
        content: '❌ Please specify either `hours` OR `messages`, not both.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const finalHours = hours || (messageLimit ? null : 24);
      const messages = getRecentMessages(db, guildId, channel.id, finalHours, messageLimit);

      if (!messages || messages.length === 0) {
        return interaction.editReply({
          content: `❌ No messages found in ${channel}.`
        });
      }

      // Build transcript for sentiment analysis
      const transcript = messages.slice(0, 100).map(m => `${m.username}: ${m.content}`).join('\n');

      // Generate sentiment analysis
      const analysisMessages = [
        {
          role: 'system',
          content: 'Analyze the sentiment of the Discord chat messages. Provide: 1) Overall sentiment (positive/negative/neutral), 2) Key emotional themes, 3) Notable positive/negative comments. Be concise and objective.'
        },
        {
          role: 'user',
          content: transcript
        }
      ];

      const sentiment = await callLLMFast(analysisMessages, 400);

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`😊 Sentiment Analysis: #${channel.name}`)
        .setDescription(sentiment)
        .setColor(0x9b59b6)
        .setTimestamp()
        .setFooter({
          text: `Analyzed ${messages.length} messages`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Sentiment analysis completed for #${channel.name} (${messages.length} messages)`);
    } catch (error) {
      logger.error('Error in sentiment command:', error);
      await interaction.editReply({
        content: `❌ Error analyzing sentiment: ${error.message}`
      });
    }
  }
};
