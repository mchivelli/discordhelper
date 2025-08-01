const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../utils/db');
const { generateChatSummary, getRecentMessages, saveChatSummary, getExistingSummaries, storeChatMessage } = require('../utils/ai');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summarize')
    .setDescription('Generate AI-powered summaries of Discord chat discussions')
          .addSubcommand(sub => 
      sub.setName('channel')
      .setDescription('Summarize messages from a specific channel')
      .addChannelOption(o => 
        o.setName('channel')
        .setDescription('Channel to summarize (defaults to current channel)')
        .setRequired(false))
      .addIntegerOption(o => 
        o.setName('hours')
        .setDescription('Hours to look back (1-168, default: 24)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(168))
      .addIntegerOption(o =>
        o.setName('messages')
        .setDescription('Number of recent messages to summarize (10-1000)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(1000))) // Max 1000 messages
    .addSubcommand(sub => 
      sub.setName('server')
      .setDescription('Summarize messages from the entire server')
      .addIntegerOption(o => 
        o.setName('hours')
        .setDescription('Hours to look back (1-168, default: 24)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(168))
      .addIntegerOption(o =>
        o.setName('messages')
        .setDescription('Number of recent messages to summarize (10-1000)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(1000)))
    .addSubcommand(sub => 
      sub.setName('history')
      .setDescription('View recent summaries')
      .addIntegerOption(o => 
        o.setName('days')
        .setDescription('Days to look back (1-30, default: 7)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)))
    .addSubcommand(sub =>
      sub.setName('fetch_history')
        .setDescription('Manually fetch and store chat history for a channel')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('The channel to fetch history from (defaults to current)')
            .setRequired(false))
        .addIntegerOption(o =>
          o.setName('days')
            .setDescription('Number of days of history to fetch (1-14, default: 1)')
            .setMinValue(1)
            .setMaxValue(14)
            .setRequired(false))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      await interaction.deferReply();

      if (subcommand === 'history') {
        await this.handleHistory(interaction);
      } else if (subcommand === 'channel') {
        await this.handleChannelSummary(interaction);
      } else if (subcommand === 'server') {
        await this.handleServerSummary(interaction);
      } else if (subcommand === 'fetch_history') {
        await this.handleFetchHistory(interaction);
      }
    } catch (error) {
      logger.error('Error in summarize command:', error);
      
      const errorMessage = 'An error occurred while generating the summary. Please try again later.';
      
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },

  async handleHistory(interaction) {
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guild.id;
    
    try {
      const summaries = getExistingSummaries(db, guildId, null, days);
      
      if (!summaries || summaries.length === 0) {
        await interaction.editReply({ 
          content: `📄 No summaries found for the last ${days} day(s). Use \`/summarize channel\` or \`/summarize server\` to create some!` 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📚 Chat Summary History (Last ${days} Days)`)
        .setDescription(`Found ${summaries.length} summary/summaries`)
        .setColor(0x3498db)
        .setTimestamp()
        .setFooter({ text: 'Discord Chat Summarization' });

      // Group summaries by date
      const summariesByDate = {};
      summaries.forEach(summary => {
        if (!summariesByDate[summary.date]) {
          summariesByDate[summary.date] = [];
        }
        summariesByDate[summary.date].push(summary);
      });

      // Add fields for each date
      Object.keys(summariesByDate).sort().reverse().slice(0, 10).forEach(date => {
        const dateSummaries = summariesByDate[date];
        const summaryText = dateSummaries.map(s => {
          const channelMention = s.channel_id ? `<#${s.channel_id}>` : 'Server-wide';
          return `• ${channelMention}: ${s.message_count} messages`;
        }).join('\n');
        
        embed.addFields({
          name: `📅 ${new Date(date).toLocaleDateString()}`,
          value: summaryText,
          inline: false
        });
      });

      if (Object.keys(summariesByDate).length > 10) {
        embed.addFields({
          name: 'Note',
          value: `Showing latest 10 dates. Use a smaller day range for more detailed history.`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting summary history:', error);
      await interaction.editReply({ 
        content: 'Error retrieving summary history. Please try again later.' 
      });
    }
  },

  async handleChannelSummary(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const hours = interaction.options.getInteger('hours') || 24;
    const messageLimit = interaction.options.getInteger('messages');
    const guildId = interaction.guild.id;
    
    // Verify permissions
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ReadMessageHistory)) {
      await interaction.editReply({ 
        content: `❌ I don't have permission to read message history in ${channel}.` 
      });
      return;
    }

    try {
      // Get recent messages from database
      const messages = getRecentMessages(db, guildId, channel.id, hours, messageLimit);
      
      if (!messages || messages.length === 0) {
        const noMessagesContent = messageLimit 
          ? `📭 No messages found in ${channel}. Make sure I'm tracking messages in this channel.`
          : `📭 No messages found in ${channel} from the last ${hours} hour(s). Make sure I'm tracking messages in this channel.`;
          
        await interaction.editReply({ content: noMessagesContent });
        return;
      }

      const timeRange = messageLimit 
        ? `Last ${messages.length} Messages`
        : hours === 24 ? 'Last 24 Hours' : `Last ${hours} Hours`;
      
      // Generate summary
      const summary = await generateChatSummary(messages, timeRange, channel.name);
      
      // Save summary to database
      const today = new Date().toISOString().split('T')[0];
      saveChatSummary(db, guildId, channel.id, summary, messages.length, today);
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`💬 ${channel.name} Summary`)
        .setDescription(summary)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ 
          text: `${messages.length} messages processed • Powered by AI`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });
      
      logger.info(`Generated channel summary for #${channel.name} (${messages.length} messages, ${hours}h) by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error generating channel summary:', error);
      await interaction.editReply({ 
        content: `❌ Error generating summary for ${channel}. Please try again later.` 
      });
    }
  },

  async handleServerSummary(interaction) {
    const hours = interaction.options.getInteger('hours') || 24;
    const messageLimit = interaction.options.getInteger('messages');
    const guildId = interaction.guild.id;
    
    // Check if user has manage messages permission for server-wide summaries
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.editReply({ 
        content: '❌ You need "Manage Messages" permission to generate server-wide summaries.' 
      });
      return;
    }

    try {
      // Get recent messages from all channels
      const messages = getRecentMessages(db, guildId, null, hours, messageLimit);
      
      if (!messages || messages.length === 0) {
        const noMessagesContent = messageLimit
          ? `📭 No messages found in this server. Make sure I'm tracking messages in your channels.`
          : `📭 No messages found in this server from the last ${hours} hour(s). Make sure I'm tracking messages in your channels.`;
          
        await interaction.editReply({ content: noMessagesContent });
        return;
      }

      const timeRange = messageLimit
        ? `Last ${messages.length} Messages`
        : hours === 24 ? 'Last 24 Hours' : `Last ${hours} Hours`;
      
      // Generate summary
      const summary = await generateChatSummary(messages, timeRange, 'the server');
      
      // Save summary to database (null channel_id for server-wide)
      const today = new Date().toISOString().split('T')[0];
      saveChatSummary(db, guildId, null, summary, messages.length, today);
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`🌐 ${interaction.guild.name} Server Summary`)
        .setDescription(summary)
        .setColor(0x9b59b6)
        .setTimestamp()
        .setFooter({ 
          text: `${messages.length} messages processed • Powered by AI`,
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });
      
      logger.info(`Generated server summary for ${interaction.guild.name} (${messages.length} messages, ${hours}h) by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error generating server summary:', error);
      await interaction.editReply({ 
        content: '❌ Error generating server summary. Please try again later.' 
      });
    }
  },

  async handleFetchHistory(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const days = interaction.options.getInteger('days') || 1;
    const guildId = interaction.guild.id;
    
    // Check permissions
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ReadMessageHistory)) {
      await interaction.editReply({ 
        content: `❌ I don't have permission to read message history in ${channel}.` 
      });
      return;
    }

    try {
      await interaction.editReply({ 
        content: `🔄 Fetching message history from ${channel} for the last ${days} day(s)...` 
      });

      let totalFetched = 0;
      let totalStored = 0;
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      // Fetch messages from Discord API
      let lastMessageId = null;
      let keepFetching = true;
      
      while (keepFetching) {
        const options = { limit: 100 };
        if (lastMessageId) {
          options.before = lastMessageId;
        }
        
        const messages = await channel.messages.fetch(options);
        
        if (messages.size === 0) {
          keepFetching = false;
          break;
        }
        
        let messagesInTimeRange = 0;
        
        for (const [messageId, message] of messages) {
          totalFetched++;
          
          // Check if message is within our time range
          if (message.createdTimestamp < cutoffTime) {
            keepFetching = false;
            break;
          }
          
          messagesInTimeRange++;
          
          // Store non-bot messages
          if (!message.author.bot && message.guild) {
            try {
              storeChatMessage(db, message);
              totalStored++;
            } catch (error) {
              logger.error(`Failed to store message ${messageId}:`, error);
              console.log(`Failed to store message ${messageId}:`, error);
            }
          }
          
          lastMessageId = messageId;
        }
        
        // If no messages in this batch were in our time range, stop
        if (messagesInTimeRange === 0) {
          keepFetching = false;
        }
        
        // Rate limiting - small delay between API calls
        if (keepFetching) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Get the message count in database (using file-based DB)
      const allMessages = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get();
      const finalCount = allMessages ? allMessages.count : totalStored;
      
      const embed = new EmbedBuilder()
        .setTitle('📥 Message History Fetched')
        .setDescription(`Successfully fetched message history from ${channel}`)
        .addFields(
          { name: '📊 Messages Processed', value: totalFetched.toString(), inline: true },
          { name: '💾 Messages Stored', value: totalStored.toString(), inline: true },
          { name: '📝 Total in Database', value: finalCount.toString(), inline: true },
          { name: '⏱️ Time Range', value: `${days} day(s)`, inline: true }
        )
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ 
          text: 'You can now use /summarize channel or /summarize server',
          iconURL: interaction.client.user.displayAvatarURL()
        });

      await interaction.editReply({ 
        content: null,
        embeds: [embed] 
      });
      
      logger.info(`Fetched ${totalFetched} messages, stored ${totalStored} from #${channel.name} (${days} days) by ${interaction.user.tag}`);
      
    } catch (error) {
      logger.error('Error fetching message history:', error);
      await interaction.editReply({ 
        content: `❌ Error fetching message history from ${channel}: ${error.message}` 
      });
    }
  }
};