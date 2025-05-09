require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events, EmbedBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');

// Import logger
const logger = require('./utils/logger');

// Ensure data directory exists
const dataDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data');
fs.ensureDirSync(dataDir);
logger.info(`Data directory ensured at: ${dataDir}`);

// Set up rate limiting
const rateLimits = new Map();
const COOLDOWN_DURATION = 3000; // 3 seconds

const db = require('./utils/db');
const { getPrereqs } = require('./utils/ai');
const { generatePatchAnnouncement, postChangelogEntry } = require('./utils/patch-utils');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Initialize changelog settings object
client.changelogSettings = {};

// Load commands
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
logger.info(`Loading ${commandFiles.length} commands...`);

for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: ${command.data.name}`);
  } catch (error) {
    logger.error(`Failed to load command ${file}:`, error);
  }
}

// Set up daily backups if in production
if (process.env.NODE_ENV === 'production') {
  cron.schedule('0 0 * * *', () => { // Daily at midnight
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tasks.db');
      const backupDir = path.join(process.cwd(), 'data', 'backups');
      
      // Ensure backup directory exists
      fs.ensureDirSync(backupDir);
      
      // Create the backup path
      const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
      
      // Clean up old backups (keep only latest 7)
      try {
        const backupFiles = fs.readdirSync(backupDir)
          .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
          .sort((a, b) => b.localeCompare(a)); // Sort in descending order
        
        // Remove backups beyond the 7th
        if (backupFiles.length > 6) { // We're about to create a new one, so keep 6 existing ones
          backupFiles.slice(6).forEach(file => {
            try {
              fs.unlinkSync(path.join(backupDir, file));
              logger.info(`Removed old backup: ${file}`);
            } catch (removeErr) {
              logger.warn(`Failed to remove old backup ${file}:`, removeErr);
            }
          });
        }
      } catch (cleanupErr) {
        logger.warn('Error during backup cleanup:', cleanupErr);
      }
      
      // Create backup
      fs.copyFileSync(dbPath, backupPath);
      logger.info(`Created database backup: ${backupPath}`);
    } catch (error) {
      logger.error('Database backup failed:', error);
    }
  });
}

client.on(Events.ClientReady, () => {
  logger.info(`Logged in as ${client.user.tag}`);
  
  // Load changelog channel settings from database or environment variables
  try {
    // First check database settings
    const settingsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_settings'").get();
    if (settingsTable) {
      const changelogChannelId = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('changelog_channel_id')?.value;
      if (changelogChannelId) {
        client.changelogSettings.channelId = changelogChannelId;
        logger.info(`Loaded changelog channel ID from database: ${changelogChannelId}`);
      }
    }
    
    // If not in database, check environment variable
    if (!client.changelogSettings.channelId && process.env.CHANGELOG_CHANNEL_ID) {
      client.changelogSettings.channelId = process.env.CHANGELOG_CHANNEL_ID;
      logger.info(`Loaded changelog channel ID from environment: ${process.env.CHANGELOG_CHANNEL_ID}`);
      
      // Save to database for future use
      try {
        if (!settingsTable) {
          db.exec('CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        }
        db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)')
          .run('changelog_channel_id', process.env.CHANGELOG_CHANNEL_ID);
      } catch (dbError) {
        logger.warn('Could not save changelog channel to database:', dbError);
      }
    }
  } catch (error) {
    logger.error('Failed to load changelog settings:', error);
  }
  
  // Set up daily reminders
  cron.schedule(process.env.REMINDER_CRON || '0 9 * * *', () => {
    client.guilds.cache.forEach(guild => {
      const ch = guild.systemChannel;
      if (ch) {
        ch.send('Daily reminder: check your pending stages with `/task list`.')
          .then(() => logger.info(`Sent reminder to guild ${guild.name}`))
          .catch(err => logger.error(`Failed to send reminder to guild ${guild.name}:`, err));
      }
    });
  });
  
  logger.info('Bot is ready to handle interactions');
});

// Initialize announcements array
client.announcements = [];

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Implement rate limiting
    const userId = interaction.user.id;
    const now = Date.now();
    
    if (rateLimits.has(userId)) {
      const expirationTime = rateLimits.get(userId) + COOLDOWN_DURATION;
      
      if (now < expirationTime) {
        await interaction.reply({ 
          content: 'Please wait a moment before using another command.',
          ephemeral: true 
        });
        return;
      }
    }
    
    // Set rate limit for user
    rateLimits.set(userId, now);
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      
      if (customId.startsWith('edit_modal_')) {
        const draftId = customId.replace('edit_modal_', '');
        const newContent = interaction.fields.getTextInputValue('content');
        
        try {
          // Find the draft and update it in the database
          const draft = db.prepare(
            'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
          ).get(draftId, interaction.user.id);
          
          if (!draft) {
            await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
            return;
          }
          
          // Update the content in the database
          db.prepare(
            'UPDATE announcements SET content = ? WHERE id = ?'
          ).run(newContent, draftId);
          
          logger.info(`Updated announcement draft ${draftId} by ${interaction.user.tag}`);
          
          // Get the updated draft
          const updatedDraft = db.prepare('SELECT * FROM announcements WHERE id = ?').get(draftId);
          
          // Create a preview embed
          const previewEmbed = new EmbedBuilder()
            .setTitle(`Announcement: ${updatedDraft.title}`)
            .setDescription(updatedDraft.content)
            .setColor(0x3498db)
            .setFooter({ text: `Draft ID: ${draftId}` });
          
          // Create buttons for actions
          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`post_${draftId}`)
                .setLabel('Post Announcement')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`edit_${draftId}`)
                .setLabel('Edit Again')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`discard_${draftId}`)
                .setLabel('Discard')
                .setStyle(ButtonStyle.Danger)
            );
          
          await interaction.reply({
            content: 'Here\'s the updated preview:',
            embeds: [previewEmbed],
            components: [actionRow],
            ephemeral: true
          });
        } catch (error) {
          logger.error('Error updating announcement:', error);
          await interaction.reply({ 
            content: 'An error occurred while updating the announcement.',
            ephemeral: true 
          });
        }
        return;
      }
      return;
    }
    
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error('Autocomplete error:', error);
        }
      }
      return;
    }
    
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction);
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const [action, id] = interaction.customId.split('_');
      
      if (action === 'advance') {
        // Get the next stage
        const next = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (!next) {
          await interaction.reply({ content: 'All stages done 🎉', ephemeral: true });
          return;
        }
        
        // Mark current stage as done
        db.prepare('UPDATE stages SET done=1 WHERE task_id=? AND idx=?').run(id, next.idx);
        
        // Get the next upcoming stage
        const upcoming = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (upcoming) {
          const prereq = await getPrereqs(`Task ${id}`, upcoming.name, upcoming.desc);
          await interaction.reply({ content: `Advanced to **${upcoming.name}**. Prereqs:\n${prereq}` });
        } else {
          await interaction.reply('🎉 All stages completed!');
        }
        return;
      }
      
      if (action === 'details') {
        // Get all stages for the task
        const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
        const stages = db.prepare('SELECT * FROM stages WHERE task_id=? ORDER BY idx').all(id);
        
        if (!task || !stages.length) {
          await interaction.reply({ content: 'No task or stages found.', ephemeral: true });
          return;
        }
        
        let details = `**Task: ${task.name} (${id})**\n\nStages:\n`;
        stages.forEach((stage, idx) => {
          details += `${idx+1}. **${stage.name}** - ${stage.done ? '\u2705 Done' : stage.assignee ? `\ud83d\udc64 <@${stage.assignee}>` : '\u23f3 Pending'}\n`;
          details += `   ${stage.desc}\n`;
        });
        
        await interaction.reply({ content: details, ephemeral: true });
        return;
      }
      
      // Handle announcement buttons
      if (action === 'post') {
        // Verify user has permission to post announcements
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
          await interaction.reply({ 
            content: 'You need Manage Messages permission to post announcements.', 
            ephemeral: true 
          });
          return;
        }
        
        // Find the draft announcement in the database
        const draft = db.prepare(
          'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).get(id, interaction.user.id);
        
        if (!draft) {
          await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
          return;
        }
        
        // Create embed for the announcement
        const announcementEmbed = new EmbedBuilder()
          .setTitle(`${draft.title}`)
          .setDescription(draft.content)
          .setColor(0x3498db)
          .setTimestamp()
          .setFooter({ text: `Posted by ${interaction.user.tag}` });
        
        try {
          // Post the announcement to the channel
          const message = await interaction.channel.send({ embeds: [announcementEmbed] });
          
          // Mark the announcement as posted in the database
          db.prepare(
            'UPDATE announcements SET posted = 1, posted_channel_id = ? WHERE id = ?'
          ).run(interaction.channel.id, id);
          
          logger.info(`Announcement ${id} posted by ${interaction.user.tag} in channel ${interaction.channel.name}`);
          
          await interaction.reply({ content: 'Announcement posted successfully!', ephemeral: true });
        } catch (error) {
          logger.error(`Failed to post announcement ${id}:`, error);
          await interaction.reply({ 
            content: 'Failed to post announcement. Please try again later.', 
            ephemeral: true 
          });
        }
        return;
      }
      
      if (action === 'edit') {
        // Find the draft announcement in the database
        const draft = db.prepare(
          'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).get(id, interaction.user.id);
        
        if (!draft) {
          await interaction.reply({ content: 'Announcement draft not found or you are not the author.', ephemeral: true });
          return;
        }
        
        // Respond with modal for editing
        const modal = new ModalBuilder()
          .setCustomId(`edit_modal_${id}`)
          .setTitle('Edit Announcement');
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel('Announcement Content')
              .setStyle(TextInputStyle.Paragraph)
              .setValue(draft.content)
              .setRequired(true)
          )
        );
        
        logger.info(`User ${interaction.user.tag} is editing announcement ${id}`);
        await interaction.showModal(modal);
        return;
      }
      
      if (action === 'discard') {
        // Check if the draft exists and delete it from the database
        const result = db.prepare(
          'DELETE FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).run(id, interaction.user.id);
        
        if (result.changes === 0) {
          await interaction.reply({ 
            content: 'Announcement draft not found or you are not the author.', 
            ephemeral: true 
          });
          return;
        }
        
        logger.info(`User ${interaction.user.tag} discarded announcement ${id}`);
        await interaction.reply({ content: 'Announcement draft discarded.', ephemeral: true });
        return;
      }
      
      // Handle changelog post button
      if (action === 'post_changelog') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to post changelog entries.', 
              ephemeral: true 
            });
            return;
          }
          
          // Post the changelog entry
          await postChangelogEntry(client, id);
          
          await interaction.reply({ 
            content: 'Changelog entry posted successfully!', 
            ephemeral: true 
          });
        } catch (error) {
          logger.error(`Error posting changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to post changelog: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
      
      // Handle changelog discard button
      if (action === 'discard_changelog') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to discard changelog entries.', 
              ephemeral: true 
            });
            return;
          }
          
          // Delete the changelog entry
          const result = db.prepare(
            'DELETE FROM changelogs WHERE id = ?'
          ).run(id);
          
          if (result.changes === 0) {
            await interaction.reply({ 
              content: 'Changelog entry not found.', 
              ephemeral: true 
            });
            return;
          }
          
          logger.info(`User ${interaction.user.tag} discarded changelog ${id}`);
          await interaction.reply({ 
            content: 'Changelog entry discarded.', 
            ephemeral: true 
          });
        } catch (error) {
          logger.error(`Error discarding changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to discard changelog: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
      
      // Handle create patch announcement button
      if (action === 'create_patch') {
        try {
          // Verify user permissions
          if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ 
              content: 'You need Manage Messages permission to create patch announcements.', 
              ephemeral: true 
            });
            return;
          }
          
          // Get the changelog entry
          const changelog = db.prepare(
            'SELECT * FROM changelogs WHERE id = ?'
          ).get(id);
          
          if (!changelog) {
            await interaction.reply({ 
              content: 'Changelog entry not found.', 
              ephemeral: true 
            });
            return;
          }
          
          // Generate patch announcement
          const announcement = await generatePatchAnnouncement({ id });
          
          // Create preview embed
          const previewEmbed = new EmbedBuilder()
            .setTitle(`Patch Announcement: ${announcement.title}`)
            .setDescription(announcement.content)
            .setColor(0x3498db)
            .setFooter({ text: `Draft ID: ${announcement.announcementId}` });
          
          // Create buttons for actions
          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`post_${announcement.announcementId}`)
                .setLabel('Post Announcement')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`edit_${announcement.announcementId}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`discard_${announcement.announcementId}`)
                .setLabel('Discard')
                .setStyle(ButtonStyle.Danger)
            );
          
          await interaction.reply({
            content: 'Here\'s a preview of the patch announcement:',
            embeds: [previewEmbed],
            components: [actionRow],
            ephemeral: true
          });
        } catch (error) {
          logger.error(`Error creating patch announcement for changelog ${id}:`, error);
          await interaction.reply({ 
            content: `Failed to create patch announcement: ${error.message}`, 
            ephemeral: true 
          });
        }
        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const reply = { content: 'An error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
