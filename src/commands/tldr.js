const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { callLLMFast } = require('../utils/llm');
const { searchSimilarChunks, generateEmbedding } = require('../utils/embeddings');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tldr')
    .setDescription('Generate a quick TL;DR summary of a topic from chat history')
    .addStringOption(option =>
      option.setName('topic')
        .setDescription('Topic to summarize')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to search (defaults to all channels)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days of history to search (default: 7, max: 30)')
        .setMinValue(1)
        .setMaxValue(30)
        .setRequired(false)),

  async execute(interaction) {
    const topic = interaction.options.getString('topic');
    const channel = interaction.options.getChannel('channel');
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guild.id;
    const channelId = channel?.id || null;

    await interaction.deferReply();

    try {
      // Generate embedding for the topic
      const queryEmbedding = await generateEmbedding(topic);

      // Calculate time range
      const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const endTime = Date.now();

      // Search for similar chunks
      const similarChunks = searchSimilarChunks(db, queryEmbedding, guildId, {
        channelId,
        startTs: startTime,
        endTs: endTime,
        topK: 10
      });

      if (!similarChunks || similarChunks.length === 0) {
        return interaction.editReply({
          content: '❌ No relevant messages found. Try a different topic or increase the time range.'
        });
      }

      // Build context from similar chunks
      const context = similarChunks.map((chunk, i) => {
        return `[${i + 1}] ${chunk.combined_text}`;
      }).join('\n\n');

      // Generate TL;DR using LLM
      const messages = [
        {
          role: 'system',
          content: 'You are a concise summarizer. Create a very brief TL;DR (Too Long; Didn\'t Read) summary of the provided chat context about the given topic. Focus on key points, decisions, and outcomes. Keep it under 150 words. Use bullet points for clarity.'
        },
        {
          role: 'user',
          content: `Topic: ${topic}\n\nContext:\n${context}\n\nTL;DR:`
        }
      ];

      const tldr = await callLLMFast(messages, 300);

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📝 TL;DR: ${topic}`)
        .setDescription(tldr)
        .setColor(0xff9800)
        .setTimestamp()
        .setFooter({
          text: `Based on ${similarChunks.length} relevant chunks from the last ${days} days`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });

      logger.info(`TL;DR generated for guild ${guildId}: ${topic} (${similarChunks.length} chunks)`);
    } catch (error) {
      logger.error('Error in tldr command:', error);
      await interaction.editReply({
        content: `❌ Error generating TL;DR: ${error.message}`
      });
    }
  }
};
