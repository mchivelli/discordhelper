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
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('setversion')
        .setDescription('Set the current changelog version (creates a version thread)')
        .addStringOption(option =>
          option.setName('version')
            .setDescription('Version number (e.g., 1.20.2)')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('addentry')
        .setDescription('Add a manual entry to the current changelog version')
        .addStringOption(option =>
          option.setName('entry')
            .setDescription('Entry text to add')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Mark the current changelog version as complete and generate report'))
    .addSubcommand(sub =>
      sub.setName('versions')
        .setDescription('List all changelog versions')
        .addStringOption(option =>
          option.setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: 'Open', value: 'open' },
              { name: 'Complete', value: 'complete' },
              { name: 'All', value: 'all' }
            )))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a specific changelog version')
        .addStringOption(option =>
          option.setName('version')
            .setDescription('Version to view')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a changelog version and its thread')
        .addStringOption(option =>
          option.setName('version')
            .setDescription('Version to delete')
            .setRequired(true)
            .setAutocomplete(true))),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'version' && interaction.options.getSubcommand() === 'delete') {
      // Get all changelog versions
      const versions = db.prepare('SELECT version FROM changelog_versions ORDER BY created_at DESC LIMIT 25').all();

      // Filter out invalid versions and create choices
      const choices = versions
        .filter(v => v && v.version) // Only include versions with valid version field
        .map(v => ({
          name: String(v.version),
          value: String(v.version)
        }));

      if (choices.length === 0) {
        choices.push({
          name: 'No versions found',
          value: 'no_versions'
        });
      }

      return interaction.respond(choices);
    }
  },

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

      // Handle setversion subcommand
      if (subcommand === 'setversion') {
        return this.handleSetVersion(interaction);
      }

      // Handle addentry subcommand
      if (subcommand === 'addentry') {
        return this.handleAddEntry(interaction);
      }

      // Handle complete subcommand
      if (subcommand === 'complete') {
        return this.handleComplete(interaction);
      }

      // Handle versions subcommand
      if (subcommand === 'versions') {
        return this.handleVersions(interaction);
      }

      // Handle view subcommand
      if (subcommand === 'view') {
        return this.handleView(interaction);
      }

      // Handle delete subcommand
      if (subcommand === 'delete') {
        return this.handleDelete(interaction);
      }
    } catch (error) {
      logger.error('Error in changelog command:', error);
      return interaction.reply({
        content: 'An error occurred while processing the changelog command.',
        ephemeral: true
      });
    }
  },

  async handleSetVersion(interaction) {
    await interaction.deferReply();

    const version = interaction.options.getString('version');

    // Get changelog channel
    const changelogChannelId = interaction.client.changelogSettings?.channelId ||
      db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id')?.value;

    if (!changelogChannelId) {
      return interaction.editReply('❌ No changelog channel set. Use `/changelog set-channel` first.');
    }

    const changelogChannel = await interaction.guild.channels.fetch(changelogChannelId).catch(() => null);
    if (!changelogChannel) {
      return interaction.editReply('❌ Changelog channel not found!');
    }

    // Check if this version already exists
    const existingVersion = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);
    if (existingVersion) {
      return interaction.editReply(`❌ Version \`${version}\` already exists!`);
    }

    // Check if there's a current version
    const currentVersion = db.prepare('SELECT * FROM changelog_versions WHERE is_current = 1').get();

    if (currentVersion) {
      // Ask user if they want to complete the current version
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`changelog_complete_current_${version}`)
            .setLabel(`Complete v${currentVersion.version} & Create v${version}`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`changelog_keep_current_${version}`)
            .setLabel(`Keep v${currentVersion.version} Open & Create v${version}`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('changelog_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.editReply({
        content: `⚠️ Version \`${currentVersion.version}\` is currently open.\nWhat would you like to do?`,
        components: [actionRow]
      });
    }

    // No current version, create this one
    await this.createVersion(interaction, version, changelogChannel);
  },

  async createVersion(interaction, version, changelogChannel) {
    try {
      // Create the embed for the version thread
      const embed = new EmbedBuilder()
        .setTitle(`Changelog: v${version}`)
        .setColor(0x00FF00)
        .setDescription('This version is currently open. Tasks completed will be automatically logged here.')
        .addFields(
          { name: 'Status', value: 'Open', inline: true },
          { name: 'Started', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
        )
        .setTimestamp();

      // Send message to create thread from
      const message = await changelogChannel.send({ embeds: [embed] });

      // Create thread
      const thread = await message.startThread({
        name: `Changelog: v${version}`,
        autoArchiveDuration: 10080, // 7 days
        reason: `Changelog version ${version} created by ${interaction.user.tag}`
      });

      // Store in database with message_id
      db.prepare(`
        INSERT INTO changelog_versions 
        (version, thread_id, channel_id, guild_id, status, is_current, created_by, created_at, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        version,
        thread.id,
        changelogChannel.id,
        interaction.guildId,
        'open',
        1, // Set as current
        interaction.user.id,
        Date.now(),
        message.id // Store the starter message ID
      );

      // Send welcome message with complete button in thread
      const completeButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`changelog_complete_version_${version}`)
            .setLabel('Mark Version Complete & Generate Report')
            .setStyle(ButtonStyle.Success)
            .setLabel('Mark Version Complete & Generate Report')
            .setStyle(ButtonStyle.Success)
        );

      await thread.send({
        content: `**Version ${version} Tracking Started**\n\nAll completed admin tasks will be automatically logged here.\nUse \`/changelog addentry\` to manually add entries.\n\nWhen ready to release, click the button below to generate an AI summary report.`,
        components: [completeButton]
      });

      logger.info(`Created changelog version ${version} in thread ${thread.id}`);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(`Version \`${version}\` created and set as current!\nThread: <#${thread.id}>`);
      } else {
        return interaction.reply(`Version \`${version}\` created and set as current!\nThread: <#${thread.id}>`);
      }
    } catch (error) {
      logger.error('Error creating changelog version:', error);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply('Failed to create version: ' + error.message);
      } else {
        return interaction.reply({ content: 'Failed to create version: ' + error.message, ephemeral: true });
      }
    }
  },

  async handleAddEntry(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const entry = interaction.options.getString('entry');

    // Get current version
    const currentVersion = db.prepare('SELECT * FROM changelog_versions WHERE is_current = 1').get();

    if (!currentVersion) {
      return interaction.editReply('No active changelog version. Use `/changelog setversion` first.');
    }

    // Add entry to database
    const entryId = `entry-${Date.now()}`;
    db.prepare(`
      INSERT INTO changelog_entries
      (id, version, entry_type, entry_text, task_id, author_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entryId, currentVersion.version, 'manual', entry, null, interaction.user.id, Date.now());

    // Update thread
    await this.updateChangelogThread(currentVersion.version, interaction.client);

    return interaction.editReply(`Entry added to version \`${currentVersion.version}\`!`);
  },

  async handleComplete(interaction) {
    await interaction.deferReply();

    // Get current version
    const currentVersion = db.prepare('SELECT * FROM changelog_versions WHERE is_current = 1').get();

    if (!currentVersion) {
      return interaction.editReply('No active changelog version to complete.');
    }

    // Generate AI summary (pass client for thread fetching)
    const summary = await this.generateVersionSummary(currentVersion.version, interaction.client);

    // Update database
    db.prepare(`
      UPDATE changelog_versions 
      SET status = 'complete', is_current = 0, completed_at = ?, completion_report = ?
      WHERE version = ?
    `).run(Date.now(), summary, currentVersion.version);

    // Update thread
    const thread = await interaction.guild.channels.fetch(currentVersion.thread_id).catch(() => null);
    if (thread && thread.isThread()) {
      // Post summary
      const summaryEmbed = new EmbedBuilder()
        .setTitle(`Version ${currentVersion.version} - Completion Report`)
        .setDescription(summary)
        .setColor(0x00FF00)
        .setTimestamp();

      await thread.send({ embeds: [summaryEmbed] });

      // Rename, lock and archive
      await thread.setName(`Changelog: v${currentVersion.version} [Complete]`).catch(() => { });
      await thread.setLocked(true).catch(() => { });
      await thread.setArchived(true).catch(() => { });
    }

    return interaction.editReply(`Version \`${currentVersion.version}\` marked as complete!\nSummary has been posted in the changelog thread.`);
  },

  async handleVersions(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const status = interaction.options.getString('status') || 'all';

    let query = 'SELECT * FROM changelog_versions';
    const params = [];

    if (status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const versions = db.prepare(query).all(...params);

    if (versions.length === 0) {
      return interaction.editReply('No changelog versions found.');
    }

    const embed = new EmbedBuilder()
      .setTitle('Changelog Versions')
      .setColor(0x5865F2)
      .setTimestamp();

    for (const ver of versions.slice(0, 10)) {
      const statusText = ver.status === 'open' ? '[Open]' : '[Complete]';
      const currentBadge = ver.is_current ? ' **[CURRENT]**' : '';
      const entries = db.prepare('SELECT COUNT(*) as count FROM changelog_entries WHERE version = ?').get(ver.version);

      embed.addFields({
        name: `${statusText} v${ver.version}${currentBadge}`,
        value: `**Entries:** ${entries.count}\n**Thread:** <#${ver.thread_id}>\n**Status:** ${ver.status}`,
        inline: false
      });
    }

    if (versions.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${versions.length} versions` });
    }

    return interaction.editReply({ embeds: [embed] });
  },

  async handleView(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const version = interaction.options.getString('version');

    const versionData = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);

    if (!versionData) {
      return interaction.editReply(`Version \`${version}\` not found.`);
    }

    const entries = db.prepare('SELECT * FROM changelog_entries WHERE version = ? ORDER BY created_at ASC').all(version);

    const embed = new EmbedBuilder()
      .setTitle(`Changelog: v${version}`)
      .setColor(versionData.status === 'open' ? 0x00FF00 : 0x808080)
      .setDescription(versionData.completion_report || 'This version is currently open.')
      .addFields(
        { name: 'Status', value: versionData.status === 'open' ? 'Open' : 'Complete', inline: true },
        { name: 'Entries', value: entries.length.toString(), inline: true },
        { name: 'Thread', value: `<#${versionData.thread_id}>`, inline: true }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },

  async updateChangelogThread(version, client) {
    try {
      const versionData = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);
      if (!versionData) return;

      const entries = db.prepare('SELECT * FROM changelog_entries WHERE version = ? ORDER BY created_at ASC').all(version);

      // Format entries
      let taskSection = '';
      let manualSection = '';
      let taskCount = 0;
      let manualCount = 0;

      for (const entry of entries) {
        const date = new Date(entry.created_at);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        if (entry.entry_type === 'task') {
          // Fetch the admin task thread_id if task_id is present
          let threadLink = '';
          if (entry.task_id) {
            try {
              const adminTask = db.prepare('SELECT thread_id, guild_id FROM admin_tasks WHERE task_id = ?').get(entry.task_id);
              if (adminTask && adminTask.thread_id && adminTask.guild_id) {
                const url = `https://discord.com/channels/${adminTask.guild_id}/${adminTask.thread_id}`;
                threadLink = `\n   **[View Thread →](${url})**`;
              }
            } catch (err) {
              logger.warn(`Could not fetch thread for task ${entry.task_id}:`, err);
            }
          }
          taskSection += `**${entry.entry_text}**\n   <@${entry.author_id}> • ${dateStr}${threadLink}\n\n`;
          taskCount++;
        } else if (entry.entry_type === 'manual') {
          manualSection += `• ${entry.entry_text}\n`;
          manualCount++;
        }
      }

      // Build thread message
      let content = `**Changelog: v${version}**\n`;
      content += `Status: ${versionData.status === 'open' ? 'Open' : 'Complete'}\n\n`;
      content += `═══════════════════════════════════════\n\n`;

      if (taskSection) {
        content += `**COMPLETED TASKS**\n`;
        content += `────────────────────────────────────────\n`;
        content += taskSection;
      }

      if (manualSection) {
        content += `**MANUAL ENTRIES**\n`;
        content += `────────────────────────────────────────\n`;
        content += manualSection;
        content += `\n`;
      }

      if (!taskSection && !manualSection) {
        content += `_No entries yet. Complete admin tasks or use \`/changelog addentry\` to add entries._\n\n`;
      }

      content += `═══════════════════════════════════════\n`;
      content += `**Total:** ${taskCount} tasks | ${manualCount} manual entries`;

      // Fetch thread and update
      const thread = await client.channels.fetch(versionData.thread_id).catch(() => null);
      if (thread && thread.isThread()) {
        // Ensure thread is open for posting
        try { if (thread.archived) await thread.setArchived(false); } catch { }
        try { if (thread.locked) await thread.setLocked(false); } catch { }
        // Send as new message (threads don't allow editing starter message)
        const messages = await thread.messages.fetch({ limit: 10 });
        const botMessages = messages.filter(m => m.author.id === client.user.id && m.content.startsWith('**Changelog:'));

        // Delete old summary messages
        for (const msg of botMessages.values()) {
          await msg.delete().catch(() => { });
        }

        // Send new summary
        await thread.send(content);
      }
    } catch (error) {
      logger.error('Error updating changelog thread:', error);
    }
  },

  async generateVersionSummary(version, client = null) {
    const entries = db.prepare('SELECT * FROM changelog_entries WHERE version = ? ORDER BY created_at ASC').all(version);
    const versionData = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);

    if (entries.length === 0) {
      return 'No entries were added to this version.';
    }

    // Get unique contributors
    const contributors = [...new Set(entries.map(e => e.author_id))];

    // Build task list
    const taskEntries = entries.filter(e => e.entry_type === 'task');
    const manualEntries = entries.filter(e => e.entry_type === 'manual');

    // Calculate duration
    const startTime = new Date(versionData.created_at);
    const endTime = new Date();
    const durationDays = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));

    // Fetch thread discussions for task entries to enhance analysis
    const threadDiscussions = [];
    if (client) {
      for (const entry of taskEntries) {
        if (entry.task_id) {
          try {
            const adminTask = db.prepare('SELECT thread_id, title FROM admin_tasks WHERE task_id = ?').get(entry.task_id);
            if (adminTask && adminTask.thread_id) {
              const thread = await client.channels.fetch(adminTask.thread_id).catch(() => null);
              if (thread && thread.isThread()) {
                const messages = await thread.messages.fetch({ limit: 50 }).catch(() => null);
                if (messages && messages.size > 0) {
                  const discussionText = messages.map(m => `${m.author.username}: ${m.content}`).reverse().join('\n');
                  threadDiscussions.push({
                    task: adminTask.title,
                    discussion: discussionText.substring(0, 2000) // Limit per thread
                  });
                }
              }
            }
          } catch (err) {
            logger.warn(`Could not fetch thread for task ${entry.task_id}:`, err.message);
          }
        }
      }
    }

    try {
      // Use AI to generate summary with enhanced context from threads
      const { generateChangelogSummary } = require('../utils/ai');

      const summary = await generateChangelogSummary(
        version,
        taskEntries.map(e => e.entry_text),
        manualEntries.map(e => e.entry_text),
        contributors,
        durationDays,
        threadDiscussions // Pass thread discussions for deeper analysis
      );

      return summary;
    } catch (error) {
      logger.error('Error generating AI summary, using fallback:', error);

      // Fallback summary
      let summary = `## Version ${version} Summary\n\n`;
      summary += `**Duration:** ${durationDays} days\n`;
      summary += `**Contributors:** ${contributors.length}\n`;
      summary += `**Tasks Completed:** ${taskEntries.length}\n`;
      summary += `**Manual Entries:** ${manualEntries.length}\n\n`;

      if (taskEntries.length > 0) {
        summary += `### Completed Tasks\n`;
        taskEntries.slice(0, 5).forEach(e => {
          summary += `• ${e.entry_text}\n`;
        });
      }

      return summary;
    }
  },

  async handleDelete(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const version = interaction.options.getString('version');

    // Get version data
    const versionData = db.prepare('SELECT * FROM changelog_versions WHERE version = ?').get(version);

    if (!versionData) {
      return interaction.editReply(`❌ Changelog version **${version}** not found.`);
    }

    try {
      let threadDeleted = false;
      let starterMessageDeleted = false;

      // Delete the starter message first if we have the message_id
      if (versionData.message_id && versionData.channel_id) {
        try {
          const channel = await interaction.guild.channels.fetch(versionData.channel_id).catch(() => null);
          if (channel) {
            const message = await channel.messages.fetch(versionData.message_id).catch(() => null);
            if (message) {
              await message.delete();
              starterMessageDeleted = true;
              logger.info(`Deleted starter message for version ${version}`);
            }
          }
        } catch (msgErr) {
          logger.warn(`Could not delete starter message for version ${version}:`, msgErr);
        }
      }

      // Delete the thread if it exists (this also deletes the message if not already deleted)
      if (versionData.thread_id) {
        try {
          const thread = await interaction.guild.channels.fetch(versionData.thread_id).catch(() => null);
          if (thread && thread.isThread()) {
            await thread.delete('Changelog version deleted');
            threadDeleted = true;
            logger.info(`Deleted changelog thread for version ${version}`);

            // If we didn't delete the message earlier, it's gone now with the thread
            if (!starterMessageDeleted) {
              starterMessageDeleted = true;
            }
          }
        } catch (error) {
          logger.warn(`Could not delete thread for version ${version}:`, error);
        }
      }

      // Delete all entries for this version
      const entriesDeleted = db.prepare('DELETE FROM changelog_entries WHERE version = ?').run(version);
      logger.info(`Deleted ${entriesDeleted.changes} entries for version ${version}`);

      // Delete the version record
      db.prepare('DELETE FROM changelog_versions WHERE version = ?').run(version);

      const statusMsg = [];
      if (threadDeleted) statusMsg.push('Thread deleted');
      if (starterMessageDeleted) statusMsg.push('Starter message removed');
      statusMsg.push(`${entriesDeleted.changes || 0} entries removed`);
      statusMsg.push('Version record deleted');

      return interaction.editReply(`✅ **Changelog version ${version} deleted successfully!**\n` +
        statusMsg.map(s => `- ${s}`).join('\n'));
    } catch (error) {
      logger.error('Error deleting changelog version:', error);
      return interaction.editReply(`❌ Error deleting version: ${error.message}`);
    }
  }
};
