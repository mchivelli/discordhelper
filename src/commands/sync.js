const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { syncChannel, backfillChannel } = require('../utils/sync');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Manage message synchronization for vector search')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Sync a specific channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to sync (defaults to current)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('backfill')
        .setDescription('Backfill a channel with historical messages')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to backfill')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Days of history to backfill (default: 14, max: 30)')
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check sync status')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to check (defaults to current)')
            .setRequired(false))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ This command requires "Manage Messages" permission.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'channel') {
        await this.handleChannelSync(interaction);
      } else if (subcommand === 'backfill') {
        await this.handleBackfill(interaction);
      } else if (subcommand === 'status') {
        await this.handleStatus(interaction);
      }
    } catch (error) {
      logger.error('Error in sync command:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  },

  async handleChannelSync(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const guildId = interaction.guild.id;

    await interaction.editReply({
      content: `🔄 Syncing channel #${channel.name}...`
    });

    try {
      await syncChannel(interaction.client, db, guildId, channel.id);

      await interaction.editReply({
        content: `✅ Sync completed for #${channel.name}`
      });
    } catch (error) {
      logger.error('Error syncing channel:', error);
      throw error;
    }
  },

  async handleBackfill(interaction) {
    const channel = interaction.options.getChannel('channel');
    const days = interaction.options.getInteger('days') || 14;
    const guildId = interaction.guild.id;

    await interaction.editReply({
      content: `🔄 Backfilling #${channel.name} for the last ${days} days... This may take a while.`
    });

    try {
      await backfillChannel(interaction.client, db, channel.id, days);

      await interaction.editReply({
        content: `✅ Backfill completed for #${channel.name} (${days} days)`
      });
    } catch (error) {
      logger.error('Error backfilling channel:', error);
      throw error;
    }
  },

  async handleStatus(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const guildId = interaction.guild.id;

    try {
      const syncState = db.prepare(`
        SELECT * FROM sync_state
        WHERE guild_id = ? AND channel_id = ?
      `).get(guildId, channel.id);

      if (!syncState) {
        return interaction.editReply({
          content: `📊 #${channel.name} has not been synced yet. Use /sync channel to start the sync.`
        });
      }

      const lastSync = new Date(syncState.last_sync_ts).toLocaleString();
      const messageCount = db.prepare(`
        SELECT COUNT(*) as count FROM chat_messages
        WHERE guild_id = ? AND channel_id = ?
      `).get(guildId, channel.id).count;

      const chunkCount = db.prepare(`
        SELECT COUNT(*) as count FROM message_chunks
        WHERE guild_id = ? AND channel_id = ?
      `).get(guildId, channel.id).count;

      const embed = new EmbedBuilder()
        .setTitle(`📊 Sync Status: #${channel.name}`)
        .addFields(
          { name: 'Last Sync', value: lastSync, inline: true },
          { name: 'Messages Stored', value: messageCount.toString(), inline: true },
          { name: 'Chunks Created', value: chunkCount.toString(), inline: true },
          { name: 'Last Message ID', value: syncState.last_message_id || 'N/A', inline: false }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error checking sync status:', error);
      throw error;
    }
  }
};
