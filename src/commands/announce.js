const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { enhanceAnnouncement } = require('../utils/ai');
const db = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Create and preview announcements')
    .addSubcommand(sub => 
      sub.setName('create')
      .setDescription('Create a new announcement')
      .addStringOption(option => 
        option.setName('content')
        .setDescription('The announcement content')
        .setRequired(true))
      .addStringOption(option => 
        option.setName('title')
        .setDescription('Optional title for the announcement')
        .setRequired(false))
      .addBooleanOption(option => 
        option.setName('enhance')
        .setDescription('Use AI to enhance the announcement')
        .setRequired(false)))
    .addSubcommand(sub => 
      sub.setName('edit')
      .setDescription('Edit a draft announcement')
      .addStringOption(option => 
        option.setName('id')
        .setDescription('The draft announcement ID to edit')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption(option => 
        option.setName('content')
        .setDescription('New content for the announcement')
        .setRequired(true))),
  
  async autocomplete(interaction) {
    // Handle autocomplete for announcement drafts
    if (interaction.options.getSubcommand() === 'edit') {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'id') {
        // Get all draft announcements from ephemeral storage
        // This is simplified - in a real implementation, use a database
        const drafts = interaction.client.announcements || [];
        const filtered = drafts.filter(draft => 
          draft.authorId === interaction.user.id && 
          draft.id.startsWith(focusedOption.value)
        );
        
        await interaction.respond(
          filtered.map(draft => ({
            name: `${draft.id}: ${draft.title || draft.content.substring(0, 30)}...`,
            value: draft.id
          })).slice(0, 25)
        );
      }
    }
  },
  
  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'create') {
        const content = interaction.options.getString('content');
        const title = interaction.options.getString('title') || 'Announcement';
        const enhance = interaction.options.getBoolean('enhance') || false;
        
        // Create a unique ID for this draft
        const draftId = `ann-${Date.now().toString().substr(-6)}`;
        
        let enhancedContent = content;
        
        // If enhance option is selected, use AI to improve the content
        if (enhance) {
          await interaction.deferReply({ ephemeral: true });
          try {
            enhancedContent = await enhanceAnnouncement(content);
            logger.info(`Enhanced announcement for user ${interaction.user.tag}`);
          } catch (error) {
            logger.error('Error enhancing announcement:', error);
            await interaction.editReply({ 
              content: 'Failed to enhance announcement. Showing original content instead.',
              ephemeral: true 
            });
          }
        }
        
        // Store the draft in the database
        db.prepare(
          'INSERT INTO announcements (id, title, content, original_content, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(draftId, title, enhancedContent, content, interaction.user.id, Date.now());
        
        logger.info(`Created announcement draft ${draftId} by ${interaction.user.tag}`);
        
        // Create a preview embed
        const previewEmbed = new EmbedBuilder()
          .setTitle(`Announcement: ${title}`)
          .setDescription(enhancedContent)
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
              .setLabel('Edit')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`discard_${draftId}`)
              .setLabel('Discard')
              .setStyle(ButtonStyle.Danger)
          );
        
        const response = enhance ? await interaction.editReply({
          content: 'Here\'s a preview of your announcement:',
          embeds: [previewEmbed],
          components: [actionRow],
          ephemeral: true
        }) : await interaction.reply({
          content: 'Here\'s a preview of your announcement:',
          embeds: [previewEmbed],
          components: [actionRow],
          ephemeral: true
        });
        
      } else if (subcommand === 'edit') {
        const draftId = interaction.options.getString('id');
        const newContent = interaction.options.getString('content');
        
        // Find the draft to edit in the database
        const draft = db.prepare(
          'SELECT * FROM announcements WHERE id = ? AND author_id = ? AND posted = 0'
        ).get(draftId, interaction.user.id);
        
        if (!draft) {
          return interaction.reply({
            content: 'Draft announcement not found or you are not the author.',
            ephemeral: true
          });
        }
        
        // Update the draft content in the database
        db.prepare(
          'UPDATE announcements SET content = ? WHERE id = ?'
        ).run(newContent, draftId);
        
        logger.info(`Updated announcement draft ${draftId} by ${interaction.user.tag}`);
        
        // Get the updated draft
        const updatedDraft = db.prepare('SELECT * FROM announcements WHERE id = ?').get(draftId);
        
        // Create updated preview
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
      }
    } catch (error) {
      logger.error('Error in announce command:', error);
      await interaction.reply({ 
        content: 'An error occurred while processing your command.',
        ephemeral: true 
      });
    }
  }
};
