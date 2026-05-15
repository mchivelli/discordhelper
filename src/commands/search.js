const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchSimilarChunks, generateEmbedding } = require('../utils/embeddings');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for messages using semantic similarity')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Search query')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to search (defaults to all channels)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days of history to search (default: 30, max: 90)')
        .setMinValue(1)
        .setMaxValue(90)
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of results (default: 5, max: 20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const channel = interaction.options.getChannel('channel');
    const days = interaction.options.getInteger('days') || 30;
    const limit = interaction.options.getInteger('limit') || 5;
    const guildId = interaction.guild.id;
    const channelId = channel?.id || null;

    await interaction.deferReply();

    try {
      // Generate embedding for the query
      const queryEmbedding = await generateEmbedding(query);

      // Calculate time range
      const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const endTime = Date.now();

      // Search for similar chunks
      const similarChunks = searchSimilarChunks(db, queryEmbedding, guildId, {
        channelId,
        startTs: startTime,
        endTs: endTime,
        topK: limit
      });

      if (!similarChunks || similarChunks.length === 0) {
        return interaction.editReply({
          content: '❌ No results found. Try a different query or increase the time range.'
        });
      }

      // Create embed with results
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results: "${query}"`)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({
          text: `Found ${similarChunks.length} results from the last ${days} days`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      // Add each result as a field
      similarChunks.forEach((chunk, i) => {
        const time = new Date(chunk.start_ts).toLocaleDateString();
        const channelMention = chunk.channel_id ? `<#${chunk.channel_id}>` : 'multiple channels';
        const similarity = (chunk.similarity * 100).toFixed(1);
        
        // Truncate text to fit in embed field (1024 chars max)
        const snippet = chunk.combined_text.substring(0, 800) + (chunk.combined_text.length > 800 ? '...' : '');

        embed.addFields({
          name: `${i + 1}. ${channelMention} • ${time} • ${similarity}% match`,
          value: snippet,
          inline: false
        });
      });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Search completed for guild ${guildId}: "${query}" (${similarChunks.length} results)`);
    } catch (error) {
      logger.error('Error in search command:', error);
      await interaction.editReply({
        content: `❌ Error performing search: ${error.message}`
      });
    }
  }
};
