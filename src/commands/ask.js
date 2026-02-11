const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { answerQuestionWithContext, getRecentMessages, getChannelMessages } = require('../utils/ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask AI a question about recent chat discussions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Ask about a specific channel')
        .addStringOption(option =>
          option.setName('question')
            .setDescription('Your question or what you want to know')
            .setRequired(true)
            .setMaxLength(500))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to analyze (defaults to current)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('hours')
            .setDescription('Hours to look back (1-168, default: 24)')
            .setMinValue(1)
            .setMaxValue(168)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('messages')
            .setDescription('Number of recent messages (10-1000)')
            .setMinValue(10)
            .setMaxValue(1000)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Ask about server-wide discussions (requires Manage Messages permission)')
        .addStringOption(option =>
          option.setName('question')
            .setDescription('Your question or what you want to know')
            .setRequired(true)
            .setMaxLength(500))
        .addIntegerOption(option =>
          option.setName('hours')
            .setDescription('Hours to look back (1-168, default: 24)')
            .setMinValue(1)
            .setMaxValue(168)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('messages')
            .setDescription('Number of recent messages (10-1000)')
            .setMinValue(10)
            .setMaxValue(1000)
            .setRequired(false))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      // Defer reply since this may take time
      await interaction.deferReply();

      // Get common parameters
      const question = interaction.options.getString('question');
      const hours = interaction.options.getInteger('hours');
      const messageLimit = interaction.options.getInteger('messages');

      // Validate: can't specify both hours and messages
      if (hours && messageLimit) {
        return interaction.editReply({
          content: '❌ Please specify either `hours` OR `messages`, not both.',
          ephemeral: true
        });
      }

      // Set defaults
      const hoursToLookBack = hours || 24;
      const guildId = interaction.guild.id;
      const guildName = interaction.guild.name;

      let messages = [];
      let channelId = null;
      let channelName = null;
      let scope = '';
      let timeRange = '';

      if (subcommand === 'channel') {
        // Channel-specific analysis
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        channelId = targetChannel.id;
        channelName = targetChannel.name;
        scope = `#${channelName}`;

        if (messageLimit) {
          // Get specific number of messages
          timeRange = `last ${messageLimit} messages`;
          messages = await getRecentMessages(db, guildId, channelId, null, messageLimit);
        } else {
          // Get messages by time
          timeRange = `last ${hoursToLookBack} hour${hoursToLookBack > 1 ? 's' : ''}`;
          messages = await getRecentMessages(db, guildId, channelId, hoursToLookBack);
        }

      } else if (subcommand === 'server') {
        // Server-wide analysis - requires permission
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.editReply({
            content: '❌ You need **Manage Messages** permission to use server-wide ask.',
            ephemeral: true
          });
        }

        scope = `server: ${guildName}`;

        if (messageLimit) {
          timeRange = `last ${messageLimit} messages`;
          messages = await getRecentMessages(db, guildId, null, null, messageLimit);
        } else {
          timeRange = `last ${hoursToLookBack} hour${hoursToLookBack > 1 ? 's' : ''}`;
          messages = await getRecentMessages(db, guildId, null, hoursToLookBack);
        }
      }

      // Check if we have messages
      if (!messages || messages.length === 0) {
        return interaction.editReply({
          content: `📭 No messages found in the specified time period.\n\n**Suggestions:**\n• Try a longer time period\n• Check if the bot has message history in this channel\n• Use \`/summarize fetch_history\` to fetch messages from Discord`,
          ephemeral: true
        });
      }

      logger.info(`[ASK] Processing question for ${scope}: "${question.substring(0, 50)}..." with ${messages.length} messages`);

      // Build context object with db access for tiered retrieval
      const context = {
        scope,
        timeRange,
        channelName,
        guildName,
        db,
        guildId,
        channelId,
        hours: messageLimit ? null : hoursToLookBack
      };

      // Call AI to answer the question
      const result = await answerQuestionWithContext(question, messages, context);

      // Build response embed — compact, no emoji clutter
      const confidenceColor = { 'High': 0x57F287, 'Medium': 0xFEE75C, 'Low': 0xED4245 };
      const strategyLabel = { 'hybrid': 'Summaries + Keywords', 'summary-only': 'Summaries', 'raw': 'Raw Messages' };

      const embed = new EmbedBuilder()
        .setTitle(question.length > 100 ? question.substring(0, 97) + '...' : question)
        .setDescription(result.answer)
        .setColor(confidenceColor[result.confidence] || 0x5865F2);

      // Single compact metadata field
      const meta = [
        `**Scope:** ${result.messageCount} msgs from ${scope} (${timeRange})`,
        `**Confidence:** ${result.confidence} | **Strategy:** ${strategyLabel[result.strategy] || result.strategy}`
      ];
      if (typeof result.coveragePct === 'number' && result.coveragePct < 80) {
        meta.push(`**Coverage:** ${result.coveragePct}% — answer may be incomplete`);
      }
      embed.addFields([{ name: 'Details', value: meta.join('\n'), inline: false }]);

      // Supporting details — compact
      if (result.supportingDetails && result.supportingDetails.length > 0) {
        const detailsText = result.supportingDetails
          .slice(0, 4)
          .map(d => `- ${d}`)
          .join('\n');
        embed.addFields([{ name: 'Evidence', value: detailsText.substring(0, 1024) }]);
      }

      // Direct quotes from messages
      if (result.quotes && result.quotes.length > 0) {
        const quotesText = result.quotes
          .slice(0, 3)
          .map(q => `> ${q}`)
          .join('\n');
        embed.addFields([{ name: 'Quotes', value: quotesText.substring(0, 1024) }]);
      }

      embed.setFooter({ text: `${result.modelUsed} | ${result.tokensUsed} tokens | ${result.coveragePct ?? '?'}% coverage` });
      embed.setTimestamp();

      // Send response
      await interaction.editReply({ embeds: [embed] });

      logger.info(`[ASK] Successfully answered question for ${scope}`);

    } catch (error) {
      logger.error('Error in /ask command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription('An error occurred while processing your question. Please try again.')
        .setColor(0xED4245)
        .addFields([
          { name: 'Error Details', value: error.message.substring(0, 1024) }
        ])
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};
