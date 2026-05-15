// Message ingestion and sync pipeline for Discord channels
// Handles daily sync, backfill, and chunk processing with embeddings

const logger = require('./logger');
const { processAndStoreChunks } = require('./embeddings');
const { generateChatSummary, saveChatSummary, storeChatMessage } = require('./ai');

const SYNC_BACKFILL_DAYS = parseInt(process.env.SYNC_BACKFILL_DAYS || '14', 10);

/**
 * Sync a single channel with Discord API
 * @param {Object} client - Discord client
 * @param {Object} db - Database instance
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 */
async function syncChannel(client, db, guildId, channelId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    
    if (!channel || !channel.isTextBased()) {
      logger.warn(`Channel ${channelId} is not text-based or not found`);
      return;
    }

    // Get sync state
    const syncState = db.prepare(`
      SELECT * FROM sync_state WHERE guild_id = ? AND channel_id = ?
    `).get(guildId, channelId);

    let lastMessageId = syncState?.last_message_id || null;
    const backfillDays = syncState ? 1 : SYNC_BACKFILL_DAYS;

    // Calculate start timestamp for backfill
    let startTime = null;
    if (!lastMessageId) {
      startTime = Date.now() - (backfillDays * 24 * 60 * 60 * 1000);
    }

    logger.info(`Syncing channel ${channel.name} in guild ${guild.name} (from ${lastMessageId ? 'last message' : `${backfillDays} days ago`})`);

    // Fetch messages from Discord
    const messages = [];
    let lastId = lastMessageId;
    let fetchMore = true;
    let fetchedCount = 0;

    while (fetchMore && fetchedCount < 1000) {
      const options = { limit: 100 };
      if (lastId) {
        options.after = lastId;
      }

      const fetched = await channel.messages.fetch(options);
      if (fetched.size === 0) {
        fetchMore = false;
        break;
      }

      for (const [msgId, msg] of fetched) {
        if (startTime && msg.createdTimestamp < startTime) {
          fetchMore = false;
          break;
        }

        if (!msg.author.bot) {
          messages.push({
            id: msg.id,
            message_id: msg.id,
            channel_id: msg.channel.id,
            guild_id: msg.guild.id,
            user_id: msg.author.id,
            username: msg.author.tag,
            content: msg.content || '',
            timestamp: msg.createdTimestamp,
            attachments: msg.attachments.size > 0 ? JSON.stringify(Array.from(msg.attachments.values()).map(a => ({
              url: a.url,
              name: a.name,
              size: a.size
            }))) : null
          });
        }

        lastId = msgId;
        fetchedCount++;
      }

      // Rate limiting
      if (fetchMore) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (messages.length === 0) {
      logger.info(`No new messages in channel ${channel.name}`);
      return;
    }

    // Store messages in database
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO chat_messages
      (id, message_id, channel_id, guild_id, user_id, username, content, timestamp, attachments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((msgs) => {
      for (const msg of msgs) {
        insertStmt.run(
          msg.id,
          msg.message_id,
          msg.channel_id,
          msg.guild_id,
          msg.user_id,
          msg.username,
          msg.content,
          msg.timestamp,
          msg.attachments
        );
      }
    });

    insertMany(messages);
    logger.info(`Stored ${messages.length} messages in database`);

    // Process messages into chunks with embeddings
    await processAndStoreChunks(db, guildId, channelId, messages);

    // Update sync state
    const latestMessage = messages[messages.length - 1];
    db.prepare(`
      INSERT OR REPLACE INTO sync_state
      (guild_id, channel_id, last_message_id, last_sync_ts)
      VALUES (?, ?, ?, ?)
    `).run(guildId, channelId, latestMessage.message_id, Date.now());

    logger.info(`Sync completed for channel ${channel.name}: ${messages.length} messages processed`);
  } catch (error) {
    logger.error(`Error syncing channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Backfill a channel from a specific number of days ago
 * @param {Object} client - Discord client
 * @param {Object} db - Database instance
 * @param {string} channelId - Channel ID
 * @param {number} days - Number of days to backfill
 */
async function backfillChannel(client, db, channelId, days) {
  try {
    // Reset sync state for this channel
    db.prepare(`
      DELETE FROM sync_state WHERE channel_id = ?
    `).run(channelId);

    // Get guild ID from the channel
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.guild) {
      throw new Error('Channel not found or not in a guild');
    }

    // Temporarily override backfill days
    const originalBackfill = SYNC_BACKFILL_DAYS;
    process.env.SYNC_BACKFILL_DAYS = days.toString();

    await syncChannel(client, db, channel.guild.id, channelId);

    // Restore original value
    process.env.SYNC_BACKFILL_DAYS = originalBackfill.toString();
  } catch (error) {
    logger.error(`Error backfilling channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Run daily sync for all guilds and channels
 * @param {Object} client - Discord client
 * @param {Object} db - Database instance
 */
async function runDailySync(client, db) {
  try {
    // Safe default: require explicit channel allowlist via SYNC_CHANNEL_IDS (comma-separated).
    // This prevents the bot from embedding every readable channel in every guild on first run,
    // which would be prohibitively expensive on active servers.
    const allowlistRaw = (process.env.SYNC_CHANNEL_IDS || '').trim();
    if (!allowlistRaw) {
      logger.warn('SYNC_CHANNEL_IDS is empty — skipping daily sync. Set it to a comma-separated list of channel IDs to enable semantic indexing.');
      return;
    }
    const allowedChannelIds = new Set(
      allowlistRaw.split(',').map(s => s.trim()).filter(Boolean)
    );

    logger.info(`Starting daily channel sync for ${allowedChannelIds.size} allowlisted channel(s)...`);

    for (const guild of client.guilds.cache.values()) {
      // Get only the allowlisted text channels the bot can read
      const textChannels = guild.channels.cache.filter(c =>
        allowedChannelIds.has(c.id) &&
        c.isTextBased() &&
        c.permissionsFor(guild.members.me)?.has('ReadMessageHistory') &&
        c.permissionsFor(guild.members.me)?.has('ViewChannel')
      );

      if (textChannels.size === 0) continue;
      logger.info(`Processing guild: ${guild.name} (${textChannels.size} allowlisted channels)`);

      for (const channel of textChannels.values()) {
        try {
          await syncChannel(client, db, guild.id, channel.id);
        } catch (error) {
          logger.error(`Failed to sync channel ${channel.name}:`, error);
        }
      }
    }

    logger.info('Daily channel sync completed');

    // Auto-generate daily summaries for each guild
    await generateDailySummaries(client, db);
  } catch (error) {
    logger.error('Error in daily sync:', error);
    throw error;
  }
}

/**
 * Generate daily summaries for all guilds
 * @param {Object} client - Discord client
 * @param {Object} db - Database instance
 */
async function generateDailySummaries(client, db) {
  try {
    logger.info('Generating daily summaries...');

    for (const guild of client.guilds.cache.values()) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const startTime = new Date(yesterday);
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(yesterday);
      endTime.setHours(23, 59, 59, 999);

      const messages = db.prepare(`
        SELECT * FROM chat_messages
        WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `).all(guild.id, startTime.getTime(), endTime.getTime());

      if (messages.length > 0) {
        const { summary, modelUsed, messagesUsed } = await generateChatSummary(
          messages,
          'yesterday',
          guild.name
        );

        saveChatSummary(
          db,
          guild.id,
          null,
          summary,
          messagesUsed,
          yesterday.toISOString().split('T')[0],
          modelUsed
        );

        // Post to configured channel if set
        const summaryChannelId = process.env.DAILY_SUMMARY_CHANNEL_ID;
        if (summaryChannelId) {
          try {
            const summaryChannel = await guild.channels.fetch(summaryChannelId);
            if (summaryChannel && summaryChannel.isTextBased()) {
              await summaryChannel.send({
                content: `📅 **Daily Summary for ${yesterday.toLocaleDateString()}**\n\n${summary}`
              });
            }
          } catch (error) {
            logger.error(`Failed to post daily summary to channel ${summaryChannelId}:`, error);
          }
        }

        logger.info(`Generated daily summary for guild ${guild.name}: ${messagesUsed} messages`);
      }
    }

    logger.info('Daily summary generation completed');
  } catch (error) {
    logger.error('Error generating daily summaries:', error);
  }
}

module.exports = {
  syncChannel,
  backfillChannel,
  runDailySync
};
