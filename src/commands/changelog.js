const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');
const db = require('../utils/db');
const logger = require('../utils/logger');

// Predefined changelog categories
const CHANGELOG_CATEGORIES = [
  { name: 'Added', value: 'added', description: 'New features or capabilities' },
  { name: 'Changed', value: 'changed', description: 'Changes to existing functionality' },
  { name: 'Fixed', value: 'fixed', description: 'Bug fixes' },
  { name: 'Removed', value: 'removed', description: 'Removed features or capabilities' },
  { name: 'Security', value: 'security', description: 'Security improvements or fixes' },
  { name: 'Config', value: 'config', description: 'Configuration changes' },
  { name: 'Performance', value: 'performance', description: 'Performance improvements' }
];

// Helper function to format changelog entry
function formatChangelogEntry(entry) {
  const categoryUpperCase = entry.category.charAt(0).toUpperCase() + entry.category.slice(1);
  return `**${categoryUpperCase}:** ${entry.changes}`;
}

// Helper function to format version according to SemVer
function formatVersion(version) {
  // Try to parse as x.y.z format
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return version;
  }
  
  // Try to handle just a number
  if (/^\d+$/.test(version)) {
    return `1.0.${version}`;
  }
  
  // Return as is if it already has a v prefix
  if (version.startsWith('v')) {
    return version;
  }
  
  // Add v prefix if none of the above
  return `v${version}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Log updates, changes and patches to the changelog channel')
    .addSubcommand(sub =>
      sub.setName('add')
      .setDescription('Add a new entry to the changelog')
      // REQUIRED options must come before non-required ones
      .addStringOption(option =>
        option.setName('category')
        .setDescription('Category of the change')
        .setRequired(true)
        .addChoices(
          ...CHANGELOG_CATEGORIES.map(cat => ({ name: cat.name, value: cat.value }))
        ))
      .addStringOption(option =>
        option.setName('changes')
        .setDescription('Description of the changes')
        .setRequired(true))
      // Optional options below
      .addStringOption(option =>
        option.setName('version')
        .setDescription('Version number (e.g., 1.0.5)')
        .setRequired(false))
      .addBooleanOption(option =>
        option.setName('is_patch')
        .setDescription('Is this a patch that needs announcement?')
        .setRequired(false))
      .addChannelOption(option =>
        option.setName('target')
        .setDescription('Channel or thread to post to (optional preview only)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread, ChannelType.GuildAnnouncement))
    )
    .addSubcommand(sub => 
      sub.setName('list')
      .setDescription('List recent changelog entries')
      .addIntegerOption(option => 
        option.setName('count')
        .setDescription('Number of entries to show (default: 5)')
        .setRequired(false)))
    .addSubcommand(sub => 
      sub.setName('set-channel')
      .setDescription('Set the channel for changelog entries')
      .addChannelOption(option => 
        option.setName('channel')
        .setDescription('Channel to post changelog entries to')
        .setRequired(true))),
  
  async execute(interaction) {
    try {
      // Check for required permissions
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
          content: 'You need Manage Messages permission to use changelog commands.',
          ephemeral: true
        });
      }

      const subcommand = interaction.options.getSubcommand();
      
      // Handle set-channel subcommand
      if (subcommand === 'set-channel') {
        const channel = interaction.options.getChannel('channel');
        
        // Ensure it's a text channel
        if (!channel.isTextBased()) {
          return interaction.reply({
            content: 'The selected channel must be a text channel.',
            ephemeral: true
          });
        }
        
        // Check if the bot has permissions to send messages to this channel
        try {
          const permissions = channel.permissionsFor(interaction.client.user);
          if (!permissions.has(PermissionsBitField.Flags.SendMessages) || 
              !permissions.has(PermissionsBitField.Flags.ViewChannel)) {
            return interaction.reply({
              content: 'I don\'t have permission to send messages in that channel. Please check my permissions.',
              ephemeral: true
            });
          }
        } catch (error) {
          logger.warn(`Error checking permissions for channel ${channel.id}:`, error);
          // Continue anyway, as we'll handle actual posting errors later
        }
        
        // Store the changelog channel ID in the bot client
        if (!interaction.client.changelogSettings) {
          interaction.client.changelogSettings = {};
        }
        
        interaction.client.changelogSettings.channelId = channel.id;
        
        // Persist the setting to database
        const settingsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_settings'").get();
        if (!settingsTable) {
          db.exec('CREATE TABLE bot_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        }
        
        db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)')
          .run('changelog_channel_id', channel.id);
        
        logger.info(`Changelog channel set to #${channel.name} (${channel.id}) by ${interaction.user.tag}`);
        
        return interaction.reply({
          content: `Changelog channel set to <#${channel.id}>.`,
          ephemeral: true
        });
      }
      
      // Handle list subcommand
      if (subcommand === 'list') {
        const count = interaction.options.getInteger('count') || 5;
        
        // Get recent changelog entries
        const entries = db.prepare(
          'SELECT * FROM changelogs ORDER BY created_at DESC LIMIT ?'
        ).all(count);
        
        if (entries.length === 0) {
          return interaction.reply({
            content: 'No changelog entries found.',
            ephemeral: true
          });
        }
        
        // Create embed for listing
        const embed = new EmbedBuilder()
          .setTitle('Recent Changelog Entries')
          .setColor(0x5865F2)
          .setDescription(
            entries.map((entry, index) => {
              const formattedDate = new Date(entry.created_at).toISOString().split('T')[0];
              return `**${index + 1}.** \`${entry.version}\` - ${formattedDate}\n${formatChangelogEntry(entry)}`;
            }).join('\n\n')
          );
        
        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }
      
      // Handle add subcommand
      if (subcommand === 'add') {
        const inputVersion = interaction.options.getString('version');
        const version = inputVersion ? formatVersion(inputVersion) : 'Unversioned';
        const category = interaction.options.getString('category');
        const changes = interaction.options.getString('changes');
        const isPatch = interaction.options.getBoolean('is_patch') || false;
        const target = interaction.options.getChannel('target');
        
        // Generate unique ID
        const changelogId = `cl-${Date.now().toString().substr(-6)}`;
        
        // Create changelog entry embed for preview
        const changelogEmbed = new EmbedBuilder()
          .setTitle(`Changelog: ${version}`)
          .setColor(0x5865F2)
          .setDescription(formatChangelogEntry({ category, changes }))
          .setFooter({ 
            text: `Author: ${interaction.user.tag} | Category: ${category}` 
          })
          .setTimestamp();
        
        // Store in database
        db.prepare(
          'INSERT INTO changelogs (id, version, category, changes, author_id, created_at, is_patch) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(changelogId, version, category, changes, interaction.user.id, Date.now(), isPatch ? 1 : 0);
        
        logger.info(`Created changelog entry ${changelogId} for version ${version} by ${interaction.user.tag}`);
        
        // Create buttons for actions
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`post_changelog_${changelogId}${target ? '_' + target.id : ''}`)
              .setLabel('Post to Changelog Channel')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`discard_changelog_${changelogId}`)
              .setLabel('Discard')
              .setStyle(ButtonStyle.Danger)
          );
        
        // If this is a patch, add option to create announcement
        let announcementRow = null;
        if (isPatch) {
          announcementRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`create_patch_${changelogId}`)
                .setLabel('Create Patch Announcement')
                .setStyle(ButtonStyle.Success)
            );
        }
        
        // Determine if we have a changelog channel set
        let channelSetMessage = '';
        const changelogChannelId = interaction.client.changelogSettings?.channelId || 
          db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id')?.value;
        
        if (!changelogChannelId) {
          channelSetMessage = '\n\n**Warning:** No changelog channel set. Use `/changelog set-channel` to set one.';
        }
        
        // Send preview with options
        const components = [actionRow];
        if (announcementRow) components.push(announcementRow);
        
        return interaction.reply({
          content: `Here's a preview of your changelog entry:${channelSetMessage}`,
          embeds: [changelogEmbed],
          components: components,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error in changelog command:', error);
      return interaction.reply({
        content: 'An error occurred while processing the changelog command.',
        ephemeral: true
      });
    }
  }
};
