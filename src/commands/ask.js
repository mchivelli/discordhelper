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

      // Build response embed
      const embed = new EmbedBuilder()
        .setTitle(`💬 ${question.length > 80 ? question.substring(0, 77) + '...' : question}`)
        .setDescription(result.answer)
        .setColor(result.confidence === 'High' ? 0x5865F2 : result.confidence === 'Medium' ? 0xFEE75C : 0xED4245);

      // Add metadata fields
      embed.addFields([
        {
          name: '📊 Analysis Scope',
          value: `${result.messageCount} messages from ${scope}`,
          inline: true
        },
        {
          name: '👥 Participants',
          value: `${result.participantCount} user${result.participantCount !== 1 ? 's' : ''}`,
          inline: true
        },
        {
          name: '📅 Time Period',
          value: timeRange,
          inline: true
        }
      ]);

      // Add confidence and strategy indicators
      const confidenceEmoji = {
        'High': '🟢',
        'Medium': '🟡',
        'Low': '🔴'
      }[result.confidence] || '⚪';

      const strategyLabel = {
        'hybrid': '📚 Summaries + Targeted Messages',
        'summary-only': '📚 Existing Summaries',
        'raw': '📝 Raw Messages'
      }[result.strategy] || result.strategy;

      embed.addFields([
        {
          name: '🎯 Confidence',
          value: `${confidenceEmoji} ${result.confidence}`,
          inline: true
        },
        {
          name: '🔍 Strategy',
          value: strategyLabel,
          inline: true
        }
      ]);

      // Add coverage warning if data is incomplete
      if (typeof result.coveragePct === 'number' && result.coveragePct < 80) {
        embed.addFields([{
          name: '⚠️ Data Coverage',
          value: `${result.coveragePct}% of the requested time range has stored messages. Answer may be incomplete.`,
          inline: false
        }]);
      }

      // Add supporting details if available
      if (result.supportingDetails && result.supportingDetails.length > 0) {
        const detailsText = result.supportingDetails
          .slice(0, 5)  // Max 5 details
          .map((detail, i) => `• ${detail}`)
          .join('\n');

        embed.addFields([
          {
            name: '📌 Supporting Details',
            value: detailsText.substring(0, 1024)  // Discord field limit
          }
        ]);
      }

      embed.setFooter({
        text: `AI Q&A | ${result.modelUsed} | ~${result.tokensUsed} tokens | ${result.coveragePct ?? '?'}% coverage`
      });
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
