const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { answerQuestionWithContext, getRecentMessages, getMessagesByDateRange, getChannelMessages } = require('../utils/ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask AI a question about recent chat discussions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('channel')
        .setDescription('Ask about a specific channel (or up to 3)')
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
        .addChannelOption(option =>
          option.setName('channel2')
            .setDescription('Second channel to include')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addChannelOption(option =>
          option.setName('channel3')
            .setDescription('Third channel to include')
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
            .setRequired(false))
        .addStringOption(option =>
          option.setName('from_date')
            .setDescription('Start date (YYYY-MM-DD)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('to_date')
            .setDescription('End date (YYYY-MM-DD)')
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
            .setRequired(false))
        .addStringOption(option =>
          option.setName('from_date')
            .setDescription('Start date (YYYY-MM-DD)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('to_date')
            .setDescription('End date (YYYY-MM-DD)')
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
      const fromDate = interaction.options.getString('from_date');
      const toDate = interaction.options.getString('to_date');

      // Validate: only one time-scoping method allowed
      const timeMethodCount = [hours, messageLimit, fromDate || toDate].filter(Boolean).length;
      if (timeMethodCount > 1) {
        return interaction.editReply({
          content: '❌ Please specify only one of: `hours`, `messages`, or `from_date`/`to_date`.',
          ephemeral: true
        });
      }

      // Validate date format if provided
      if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
        return interaction.editReply({ content: '❌ `from_date` must be YYYY-MM-DD format.', ephemeral: true });
      }
      if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return interaction.editReply({ content: '❌ `to_date` must be YYYY-MM-DD format.', ephemeral: true });
      }

      // Set defaults
      const hoursToLookBack = hours || 24;
      const guildId = interaction.guild.id;
      const guildName = interaction.guild.name;
      const useDateRange = fromDate || toDate;
      const effectiveFrom = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const effectiveTo = toDate || new Date().toISOString().split('T')[0];

      let messages = [];
      let channelId = null;
      let channelName = null;
      let scope = '';
      let timeRange = '';

      if (subcommand === 'channel') {
        // Collect up to 3 channels
        const ch1 = interaction.options.getChannel('channel') || interaction.channel;
        const ch2 = interaction.options.getChannel('channel2');
        const ch3 = interaction.options.getChannel('channel3');
        const channels = [ch1, ch2, ch3].filter(Boolean);
        const uniqueChannels = [...new Map(channels.map(c => [c.id, c])).values()];

        if (uniqueChannels.length === 1) {
          channelId = uniqueChannels[0].id;
          channelName = uniqueChannels[0].name;
          scope = `#${channelName}`;
        } else {
          channelName = uniqueChannels.map(c => c.name).join(', ');
          scope = uniqueChannels.map(c => `#${c.name}`).join(' + ');
        }

        // Fetch messages from each channel
        for (const ch of uniqueChannels) {
          let chMessages = [];
          if (useDateRange) {
            chMessages = getMessagesByDateRange(db, guildId, ch.id, effectiveFrom, effectiveTo);
          } else if (messageLimit) {
            chMessages = await getRecentMessages(db, guildId, ch.id, null, messageLimit);
          } else {
            chMessages = await getRecentMessages(db, guildId, ch.id, hoursToLookBack);
          }
          if (chMessages?.length) messages.push(...chMessages);
        }

        // Sort combined messages chronologically and dedup
        if (uniqueChannels.length > 1) {
          messages.sort((a, b) => a.timestamp - b.timestamp);
        }

        // Build time range label
        if (useDateRange) {
          timeRange = `${effectiveFrom} to ${effectiveTo}`;
        } else if (messageLimit) {
          timeRange = `last ${messageLimit} messages`;
        } else {
          timeRange = `last ${hoursToLookBack} hour${hoursToLookBack > 1 ? 's' : ''}`;
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

        if (useDateRange) {
          timeRange = `${effectiveFrom} to ${effectiveTo}`;
          messages = getMessagesByDateRange(db, guildId, null, effectiveFrom, effectiveTo);
        } else if (messageLimit) {
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
        hours: (useDateRange || messageLimit) ? null : hoursToLookBack
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
