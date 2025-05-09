/**
 * Utility functions for handling patch announcements
 * Provides functionality to create, format, and manage patch notifications
 */
const { EmbedBuilder } = require('discord.js');
const db = require('./db');
const logger = require('./logger');
const { enhanceAnnouncement } = require('./ai');

/**
 * Generate a patch announcement based on changelog entry
 * @param {Object} changelog - The changelog entry object
 * @returns {Promise<Object>} - The generated announcement content
 */
async function generatePatchAnnouncement(changelog) {
  try {
    // Get the changelog entry
    const entry = db.prepare(
      'SELECT * FROM changelogs WHERE id = ?'
    ).get(changelog.id);
    
    if (!entry) {
      throw new Error(`Changelog entry ${changelog.id} not found`);
    }
    
    // Get any other entries with the same version
    const relatedEntries = db.prepare(
      'SELECT * FROM changelogs WHERE version = ? AND id != ?'
    ).all(entry.version, entry.id);
    
    // Format the announcement content
    let content = `**Patch ${entry.version} Released**\n\n`;
    
    // Add the primary entry
    const categoryUpperCase = entry.category.charAt(0).toUpperCase() + entry.category.slice(1);
    content += `**${categoryUpperCase}:** ${entry.changes}\n\n`;
    
    // Add any related entries
    if (relatedEntries.length > 0) {
      content += "**Additional Changes:**\n";
      relatedEntries.forEach(related => {
        const relatedCategoryUpper = related.category.charAt(0).toUpperCase() + related.category.slice(1);
        content += `- **${relatedCategoryUpper}:** ${related.changes}\n`;
      });
    }
    
    // Try to enhance the announcement with AI
    let enhancedContent;
    try {
      enhancedContent = await enhanceAnnouncement(content);
      logger.info(`Enhanced patch announcement for ${entry.version}`);
    } catch (error) {
      logger.error('Failed to enhance patch announcement:', error);
      enhancedContent = content;
    }
    
    // Create announcement draft in database
    const announcementId = `patch-${Date.now().toString().substr(-6)}`;
    
    db.prepare(
      'INSERT INTO announcements (id, title, content, original_content, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      announcementId, 
      `Patch ${entry.version}`, 
      enhancedContent, 
      content, 
      entry.author_id, 
      Date.now()
    );
    
    // Link the announcement to the changelog entry
    db.prepare(
      'UPDATE changelogs SET announcement_id = ? WHERE id = ?'
    ).run(announcementId, entry.id);
    
    logger.info(`Created patch announcement ${announcementId} for changelog ${entry.id}`);
    
    return { 
      announcementId,
      title: `Patch ${entry.version}`,
      content: enhancedContent,
      originalContent: content
    };
  } catch (error) {
    logger.error('Error generating patch announcement:', error);
    throw error;
  }
}

/**
 * Post a changelog entry to the designated channel
 * @param {Object} client - Discord client
 * @param {string} changelogId - ID of the changelog entry to post
 * @returns {Promise<Object>} - Result of the posting operation
 */
async function postChangelogEntry(client, changelogId) {
  try {
    // Retrieve the changelog entry
    const entry = db.prepare(
      'SELECT * FROM changelogs WHERE id = ?'
    ).get(changelogId);
    
    if (!entry) {
      throw new Error(`Changelog entry ${changelogId} not found`);
    }
    
    // Get the channel ID from client settings or database
    const changelogChannelId = client.changelogSettings?.channelId || 
      db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id')?.value;
    
    if (!changelogChannelId) {
      throw new Error('No changelog channel set. Please use /changelog set-channel or set CHANGELOG_CHANNEL_ID in your environment.');
    }
    
    // Get the channel
    let channel;
    try {
      channel = await client.channels.fetch(changelogChannelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Changelog channel ${changelogChannelId} is not a valid text channel`);
      }
    } catch (channelError) {
      logger.error(`Failed to fetch changelog channel ${changelogChannelId}:`, channelError);
      throw new Error(`Changelog channel not accessible: ${channelError.message}. Check if the bot has access to the channel.`);
    }
    
    // Format the entry for the embed
    const categoryUpperCase = entry.category.charAt(0).toUpperCase() + entry.category.slice(1);
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`Changelog: ${entry.version}`)
      .setColor(getColorForCategory(entry.category))
      .setDescription(`**${categoryUpperCase}:** ${entry.changes}`)
      .setFooter({ 
        text: entry.is_patch ? 'Patch changelog entry' : 'Changelog entry'
      })
      .setTimestamp(new Date(entry.created_at));
    
    // Send to the channel
    const message = await channel.send({ embeds: [embed] });
    
    // Update the database to mark as posted
    db.prepare(
      'UPDATE changelogs SET posted = 1, posted_channel_id = ? WHERE id = ?'
    ).run(channel.id, changelogId);
    
    logger.info(`Posted changelog ${changelogId} to channel ${channel.name}`);
    
    return { 
      success: true, 
      messageId: message.id, 
      channelId: channel.id 
    };
  } catch (error) {
    logger.error(`Failed to post changelog ${changelogId}:`, error);
    throw error;
  }
}

/**
 * Get the appropriate color for a changelog category
 * @param {string} category - The category name
 * @returns {number} - The color code
 */
function getColorForCategory(category) {
  const colors = {
    added: 0x4caf50,     // Green
    changed: 0x2196f3,    // Blue
    fixed: 0xff9800,      // Orange
    removed: 0xf44336,    // Red
    security: 0x9c27b0,   // Purple
    config: 0x607d8b,     // Blue Grey
    performance: 0x00bcd4 // Cyan
  };
  
  return colors[category] || 0x5865F2; // Default Discord blue
}

module.exports = {
  generatePatchAnnouncement,
  postChangelogEntry,
  getColorForCategory
};
