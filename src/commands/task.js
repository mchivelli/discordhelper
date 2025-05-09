const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const { getPrereqs, getSuggestions, generateTaskStages, enhanceTaskDescription, enhanceTaskNote } = require('../utils/ai');
const { stageActionRow } = require('../components/buttons');
const { stageSuggestionsActionRow, advanceStageActionRow, createCompletionNotesModal } = require('../components/task-components');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Manage project tasks and stages')
    .addSubcommand(sub => 
      sub.setName('create')
      .setDescription('Create a new task with a unique ID')
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Optional custom ID for the task')
        .setRequired(false))
      .addStringOption(o => 
        o.setName('name')
        .setDescription('Name of the task (e.g., "Website Redesign")')
        .setRequired(true))
      .addStringOption(o => 
        o.setName('contents')
        .setDescription('Detailed description of what the task involves')
        .setRequired(false))
      .addStringOption(o => 
        o.setName('deadline')
        .setDescription('Deadline date (format: YYYY-MM-DD or DD.MM.YYYY)')
        .setRequired(false))
      .addStringOption(o => 
        o.setName('template')
        .setDescription('Use a predefined template for common task types')
        .setRequired(false)
        .addChoices(
          { name: 'Web Development', value: 'web' },
          { name: 'Meeting Preparation', value: 'meeting' },
          { name: 'Content Creation', value: 'content' },
          { name: 'Bug Fixing', value: 'bugfix' },
          { name: 'Event Planning', value: 'event' }
        ))
      .addBooleanOption(o => 
        o.setName('aihelp')
        .setDescription('Use AI to suggest stages for this task')
        .setRequired(false)))
    .addSubcommand(sub => 
      sub.setName('add-stage')
      .setDescription('Add a new stage to an existing task')
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Task ID (e.g., "t12345")')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption(o => 
        o.setName('name')
        .setDescription('Stage name (e.g., "Design", "Development")')
        .setRequired(true))
      .addStringOption(o => 
        o.setName('desc')
        .setDescription('Detailed description of this stage')
        .setRequired(true)))
    .addSubcommand(sub => 
      sub.setName('list')
      .setDescription('List all stages for a task')
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Task ID (e.g., "t12345")')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand(sub => 
      sub.setName('advance')
      .setDescription('Mark current stage as done and advance to next stage')
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Task ID (e.g., "t12345")')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption(o => 
        o.setName('notes')
        .setDescription('Completion notes for this stage')
        .setRequired(false))
      .addBooleanOption(o => 
        o.setName('enhancewithai')
        .setDescription('Enhance completion notes with AI')
        .setRequired(false)))
    .addSubcommand(sub => 
      sub.setName('assign')
      .setDescription('Assign the current stage to a user')
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Task ID (e.g., "t12345")')
        .setRequired(true)
        .setAutocomplete(true))
      .addUserOption(u => 
        u.setName('user')
        .setDescription('Discord user to assign')
        .setRequired(true)))
    .addSubcommand(sub => 
      sub.setName('stats')
      .setDescription('Show overall statistics for all tasks'))
    .addSubcommand(sub => 
      sub.setName('help')
      .setDescription('Show help information about using task commands'))
    .addSubcommand(sub => 
      sub.setName('ai-status')
      .setDescription('Check if AI services are working properly'))
    .addSubcommand(sub => 
      sub.setName('analytics')
      .setDescription('Get insights about tasks and productivity in this server')),
        
  // Handle autocomplete interactions
  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'id') {
      // Get the partial input typed by the user
      const partialId = focusedOption.value.toLowerCase();
      
      // Get tasks from the database based on the partial ID
      let choices = [];
      
      try {
        // Query tasks based on partial ID match
        const tasks = db.prepare(
          `SELECT id, name FROM tasks WHERE id LIKE ? OR name LIKE ? LIMIT 25`
        ).all(`%${partialId}%`, `%${partialId}%`);
        
        choices = tasks.map(task => ({
          name: `${task.id}: ${task.name}`.substring(0, 100),
          value: task.id
        }));
        
        // If we have very few or no matches from DB, add AI suggestions
        if (choices.length < 3 && partialId.length > 0) {
          try {
            const suggestions = await getSuggestions(partialId, 'task name');
            const suggestionChoices = suggestions.map(s => ({
              name: `${s.value} (suggestion)`,
              value: `t${Date.now()}_${s.value.substring(0, 10).replace(/\s+/g, '_').toLowerCase()}`
            }));
            choices = [...choices, ...suggestionChoices].slice(0, 25);
          } catch (error) {
            console.error('Error getting AI suggestions:', error);
            // Continue without AI suggestions
          }
        }
      } catch (err) {
        console.error('Error in autocomplete:', err);
        // Return empty choices on error
      }
      
      return interaction.respond(choices);
    }
  },
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'create': {
        try {
          // Get all the user options
          const name = interaction.options.getString('name');
          const customId = interaction.options.getString('id');
          const contents = interaction.options.getString('contents') || '';
          const deadline = interaction.options.getString('deadline') || '';
          const templateId = interaction.options.getString('template');
          const useAI = interaction.options.getBoolean('aihelp') || false;
          
          // Generate task ID (custom or timestamp-based)
          const id = customId || `t${Date.now()}`.substring(0, 8);
          
          // Check if ID already exists
          const existingTask = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
          if (existingTask) {
            return interaction.reply({ 
              content: `❌ A task with ID \`${id}\` already exists. Please choose a different ID.`, 
              ephemeral: true 
            });
          }
          
          // Process contents with AI if needed
          let enhancedContents = contents;
          if (useAI && contents) {
            await interaction.deferReply();
            try {
              enhancedContents = await enhanceTaskDescription(name, contents);
            } catch (error) {
              logger.error('Error enhancing task description:', error);
              // Continue with original contents if AI enhancement fails
            }
          } else if (templateId || useAI) {
            // We'll need to defer the reply for template usage or AI help
            await interaction.deferReply();
          }
          
          // Insert task into database
          db.prepare('INSERT INTO tasks(id, name, description, deadline, created_at, guild_id, creator_id) VALUES(?, ?, ?, ?, ?, ?, ?)')
            .run(id, name, enhancedContents, deadline, Date.now(), interaction.guildId, interaction.user.id);
          
          // If a template is specified, use template stages
          if (templateId) {
            try {
              // Import the templates utility
              const { getTemplateStages } = require('../utils/task-templates');
              
              // Get stages from the template
              const templateStages = getTemplateStages(templateId);
              
              if (templateStages && templateStages.length > 0) {
                // Add each stage from the template
                for (let i = 0; i < templateStages.length; i++) {
                  const stage = templateStages[i];
                  const idx = db.prepare('SELECT COUNT(*) as c FROM stages WHERE task_id=?').get(id).c;
                  db.prepare('INSERT INTO stages(task_id,idx,name,desc,created_at) VALUES(?,?,?,?,?)')
                    .run(id, idx, stage.name, stage.description, Date.now());
                }
                
                // Create embed to display template stages
                const stagesEmbed = new EmbedBuilder()
                  .setTitle(`Template Stages for Task: ${name}`)
                  .setDescription(`Added ${templateStages.length} stages from the ${templateId} template.`)
                  .setColor(0x3498db)
                  .setFooter({ text: `Task ID: ${id}` });
                
                // Add each stage to the embed
                templateStages.forEach((stage, index) => {
                  stagesEmbed.addFields({ 
                    name: `Stage ${index + 1}: ${stage.name}`, 
                    value: stage.description || 'No description provided'
                  });
                });
                
                return interaction.editReply({
                  content: `📋 Created task \`${id}\`: **${name}**`,
                  embeds: [stagesEmbed],
                  components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`view_${id}`)
                      .setLabel('View Task')
                      .setStyle(ButtonStyle.Primary)
                  )]
                });
              }
            } catch (error) {
              logger.error('Error applying template:', error);
              // Continue if template application fails
            }
          }
          
          // If AI help is requested, generate stage suggestions
          if (useAI) {
            try {
              // Generate stage suggestions using AI
              const suggestedStages = await generateTaskStages(name, enhancedContents || name, deadline);
              
              // Store suggestions in database
              const suggestionResult = db.prepare(
                'INSERT INTO task_suggestions(task_id, stage_suggestions, created_at) VALUES(?, ?, ?)'
              ).run(id, JSON.stringify(suggestedStages), Date.now());
              
              const suggestionId = suggestionResult.lastInsertRowid;
              
              // Create embed to display suggestions
              const suggestionsEmbed = new EmbedBuilder()
                .setTitle(`AI-Suggested Stages for Task: ${name}`)
                .setDescription(`Here are some suggested stages for your task. You can accept them as-is, modify them, or skip them and add your own stages later.`)
                .setColor(0x4caf50)
                .setFooter({ text: `Task ID: ${id}` });
              
              // Add each suggested stage to the embed
              suggestedStages.forEach((stage, index) => {
                suggestionsEmbed.addFields({ 
                  name: `Stage ${index + 1}: ${stage.name}`, 
                  value: stage.description || 'No description provided'
                });
              });
              
              // Send response with buttons for user interaction
              return interaction.editReply({
                content: `📋 Created task \`${id}\`: **${name}**`,
                embeds: [suggestionsEmbed],
                components: [stageSuggestionsActionRow(id, suggestionId)]
              });
              
            } catch (error) {
              logger.error('Error generating AI stage suggestions:', error);
              
              // Fall back to standard response if AI fails
              if (!interaction.replied && !interaction.deferred) {
                return interaction.reply(`📋 Created task \`${id}\`: **${name}**\nAdd stages with \`/task add-stage\``);
              } else {
                return interaction.editReply(`📋 Created task \`${id}\`: **${name}**\nAdd stages with \`/task add-stage\``);
              }
            }
          } else if (!templateId) {
            // Standard response without AI or template
            if (!interaction.replied && !interaction.deferred) {
              return interaction.reply(`📋 Created task \`${id}\`: **${name}**\nAdd stages with \`/task add-stage\``);
            } else {
              return interaction.editReply(`📋 Created task \`${id}\`: **${name}**\nAdd stages with \`/task add-stage\``);
            }
          }
        } catch (error) {
          logger.error('Error creating task:', error);
          return interaction.reply({ 
            content: `An error occurred while creating the task: ${error.message}`, 
            ephemeral: true 
          });
        }
      }
      case 'add-stage': {
        const id = interaction.options.getString('id');
        const name = interaction.options.getString('name');
        const desc = interaction.options.getString('desc');
        const idx = db.prepare('SELECT COUNT(*) as c FROM stages WHERE task_id=?').get(id).c;
        db.prepare('INSERT INTO stages(task_id,idx,name,desc,created_at) VALUES(?,?,?,?,?)').run(id, idx, name, desc, Date.now());
        return interaction.reply(`➕ Stage **${name}** added to task \`${id}\``);
      }
      case 'list': {
        try {
          const id = interaction.options.getString('id');
          
          // Get task details
          const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
          if (!task) {
            return interaction.reply({ content: `Task \`${id}\` not found.`, ephemeral: true });
          }
          
          // Get stages for this task
          const stages = db.prepare('SELECT * FROM stages WHERE task_id = ? ORDER BY idx').all(id);
          
          // Calculate completion percentage
          const totalStages = stages.length;
          const completedStages = stages.filter(s => s.done === 1).length;
          const completionPercentage = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
          
          // Update task completion percentage in database
          db.prepare('UPDATE tasks SET completion_percentage = ? WHERE id = ?').run(completionPercentage, id);
          
          // Format deadline with enhanced display
          const deadlineDisplay = task.deadline ? 
            `Deadline: ${this.formatDate(task.deadline)}` : 
            'No deadline set';
          
          // Create embed
          const embed = new EmbedBuilder()
            .setTitle(`Task: "${task.name}" [${completionPercentage}%]`)
            .setDescription(task.description ? task.description : 'No description provided')
            .setColor(0x3498db)
            .setFooter({ text: `Task ID: ${id} | Created: ${new Date(task.created_at).toLocaleDateString()}` })
            .addFields({ name: deadlineDisplay, value: '\u200B' });
          
          // No stages message
          if (!stages.length) {
            embed.addFields({ name: 'No stages defined', value: 'Add stages with `/task add-stage`' });
            return interaction.reply({ embeds: [embed], components: [stageActionRow(id)] });
          }
          
          // Add stages to embed
          stages.forEach(stage => {
            let statusValue = '';
            
            if (stage.done === 1) {
              const completedDate = stage.completed_at ? 
                new Date(stage.completed_at).toLocaleDateString() : 
                'Date not recorded';
              
              statusValue = `✅ Done [${completedDate}]`;
              
              // Add completion notes if available
              if (stage.completion_notes) {
                statusValue += `\n${stage.completion_notes}`;
              }
            } else if (stage.assignee) {
              statusValue = `👤 Assigned to <@${stage.assignee}>`;
            } else {
              statusValue = '⏳ Pending';
            }
            
            embed.addFields({ 
              name: `${stage.idx + 1}. ${stage.name}`, 
              value: statusValue 
            });
          });
          
          // Add a progress bar
          const progressBar = this.createProgressBar(completionPercentage);
          embed.addFields({ name: 'Progress', value: progressBar });
          
          // Create appropriate action row based on completion status
          const components = [stageActionRow(id)];
          
          // Add advance stage button if task is not complete
          if (completionPercentage < 100) {
            const currentStage = stages.find(s => s.done === 0);
            if (currentStage) {
              components.push(advanceStageActionRow(id, currentStage.idx));
            }
          }
          
          return interaction.reply({ embeds: [embed], components });
        } catch (error) {
          logger.error('Error listing task:', error);
          return interaction.reply({ 
            content: `An error occurred while listing the task: ${error.message}`, 
            ephemeral: true 
          });
        }
      }
      case 'advance': {
        try {
          const id = interaction.options.getString('id');
          const notes = interaction.options.getString('notes');
          const enhanceWithAi = interaction.options.getBoolean('enhancewithai') || false;
          
          // Get the current stage (first incomplete stage)
          const currentStage = db.prepare('SELECT * FROM stages WHERE task_id = ? AND done = 0 ORDER BY idx').get(id);
          if (!currentStage) {
            return interaction.reply('All stages done 🎉');
          }
          
          // If notes were provided and AI enhancement requested, process notes
          let processedNotes = notes;
          if (notes && enhanceWithAi) {
            await interaction.deferReply();
            try {
              processedNotes = await enhanceTaskNote(notes, currentStage.name);
            } catch (error) {
              logger.error('Error enhancing task notes:', error);
              // Continue with original notes if AI enhancement fails
            }
          }
          
          // Mark the current stage as complete
          db.prepare(
            'UPDATE stages SET done = 1, completed_at = ?, completion_notes = ? WHERE task_id = ? AND idx = ?'
          ).run(Date.now(), processedNotes, id, currentStage.idx);
          
          // Calculate new completion percentage
          const totalStages = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ?').get(id).count;
          const completedStages = db.prepare('SELECT COUNT(*) as count FROM stages WHERE task_id = ? AND done = 1').get(id).count;
          const completionPercentage = Math.round((completedStages / totalStages) * 100);
          
          // Update task completion percentage
          db.prepare('UPDATE tasks SET completion_percentage = ? WHERE id = ?').run(completionPercentage, id);
          
          // Get the next stage (if any)
          const nextStage = db.prepare('SELECT * FROM stages WHERE task_id = ? AND done = 0 ORDER BY idx').get(id);
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setTitle(`Task Progress Update: [${completionPercentage}%]`)
            .setColor(0x4caf50)
            .addFields({ 
              name: `✅ Completed: ${currentStage.name}`, 
              value: processedNotes || 'No completion notes provided'
            })
            .setFooter({ text: `Task ID: ${id}` });
          
          // Add progress bar
          const progressBar = this.createProgressBar(completionPercentage);
          embed.addFields({ name: 'Progress', value: progressBar });
          
          if (nextStage) {
            // Get prerequisites for the next stage
            const prereq = await getPrereqs(`Task ${id}`, nextStage.name, nextStage.desc);
            
            embed.addFields({ 
              name: `⏭️ Next Stage: ${nextStage.name}`, 
              value: nextStage.desc || 'No description provided'
            });
            
            embed.addFields({ 
              name: '📋 Prerequisites', 
              value: prereq
            });
            
            if (!interaction.replied && !interaction.deferred) {
              return interaction.reply({ 
                embeds: [embed],
                components: [advanceStageActionRow(id, nextStage.idx)]
              });
            } else {
              return interaction.editReply({ 
                embeds: [embed],
                components: [advanceStageActionRow(id, nextStage.idx)]
              });
            }
          } else {
            // All stages completed
            embed.setDescription('🎉 All stages completed!');
            
            if (!interaction.replied && !interaction.deferred) {
              return interaction.reply({ embeds: [embed] });
            } else {
              return interaction.editReply({ embeds: [embed] });
            }
          }
        } catch (error) {
          logger.error('Error advancing stage:', error);
          return interaction.reply({ 
            content: `An error occurred while advancing the stage: ${error.message}`, 
            ephemeral: true 
          });
        }
      }
      case 'assign': {
        try {
          const id = interaction.options.getString('id');
          const user = interaction.options.getUser('user');
          
          // Get the current active stage (first uncompleted stage)
          const row = db.prepare('SELECT * FROM stages WHERE task_id = ? AND done = 0 ORDER BY idx').get(id);
          
          if (!row) {
            return interaction.reply({ 
              content: '❌ No active stage found for this task. All stages may be completed.', 
              ephemeral: true 
            });
          }
          
          // Assign the user to the stage
          db.prepare('UPDATE stages SET assignee = ? WHERE task_id = ? AND idx = ?').run(user.id, id, row.idx);
          
          // Try to send a DM to the assigned user
          try {
            await user.send(`You've been assigned to stage **${row.name}** of Task \`${id}\`.`);
          } catch (dmError) {
            logger.error('Could not send DM to assigned user:', dmError);
            // Continue anyway - the assignment is still valid
          }
          
          return interaction.reply(`👤 Assigned <@${user.id}> to **${row.name}** for task \`${id}\``);
        } catch (error) {
          logger.error('Error assigning user to task:', error);
          return interaction.reply({ 
            content: `An error occurred while assigning the user: ${error.message}`, 
            ephemeral: true 
          });
        }
        break;
      }
      case 'help': {
        // Task help command
        const helpEmbed = new EmbedBuilder()
          .setTitle('AI-Enhanced Task Management Guide')
          .setDescription('Guide for using AI-enhanced task management commands')
          .setColor(0x4caf50)
          .addFields(
            { name: '📝 Creating a Task', value: '`/task create name:"Your Task Name" contents:"Description" deadline:"YYYY-MM-DD" template:"web" aihelp:True`\nCreates a new task with optional template or AI-suggested stages.' },
            { name: '📑 Using Templates', value: 'Use the `template` parameter to quickly create tasks with predefined stages:\n- `web`: Web Development (5 stages)\n- `meeting`: Meeting Preparation (5 stages)\n- `content`: Content Creation (5 stages)\n- `bugfix`: Bug Fixing (5 stages)\n- `event`: Event Planning (5 stages)' },
            { name: '➕ Adding Stages', value: '`/task add-stage id:"taskID" name:"Stage Name" desc:"Stage description"`\nAdds a stage to an existing task. Stages are completed in order.' },
            { name: '📋 Listing Stages', value: '`/task list id:"taskID"`\nShows all stages for a specific task with their status, progress, and deadline information.' },
            { name: '⏭️ Advancing Stages', value: '`/task advance id:"taskID" notes:"Completion notes" enhancewithai:True`\nMarks the current stage as complete with optional AI-enhanced notes and advances to the next stage.' },
            { name: '👤 Assigning Tasks', value: '`/task assign id:"taskID" user:@username`\nAssigns the current stage of a task to a user.' },
            { name: '📊 Task Statistics', value: '`/task stats`\nDisplays overall statistics about tasks in this server.' },
            { name: '🤖 AI Status', value: '`/task ai-status`\nChecks if AI integration is working properly.' },
            { name: '📊 Analytics Dashboard', value: '`/task analytics`\nView detailed analytics about task completion and upcoming deadlines.' }
          )
          .setFooter({ text: 'AI-enhanced task management system', iconURL: interaction.client.user.displayAvatarURL() });
        
        return interaction.reply({ embeds: [helpEmbed] });
      }
      case 'ai-status': {
        try {
          await interaction.deferReply();
          
          // Import the AI utility
          const { checkAIStatus } = require('../utils/ai');
          
          // Check AI status
          const status = await checkAIStatus();
          
          // Create status embed
          const statusEmbed = new EmbedBuilder()
            .setTitle('AI Integration Status')
            .setDescription(status.message)
            .setColor(status.success ? 0x4caf50 : 0xe74c3c)
            .addFields(
              { 
                name: 'Status', 
                value: status.success ? '✅ Working' : '❌ Not Working'
              },
              {
                name: 'Environment', 
                value: `Running in ${process.env.NODE_ENV || 'development'} mode`
              },
              {
                name: 'AI Model', 
                value: process.env.MODEL_NAME || 'Not configured (using fallbacks)'
              }
            )
            .setFooter({ text: 'AI-enhanced task management • Check your .env file for configuration' });
          
          // Add advice for troubleshooting if not working
          if (!status.success) {
            statusEmbed.addFields({
              name: 'Troubleshooting', 
              value: '1. Check that you have set OPENROUTER_API_KEY in your .env file\n' +
                      '2. Verify that MODEL_NAME is properly configured\n' +
                      '3. Make sure your API key has sufficient credits\n' +
                      '4. The bot will use fallback responses if AI services are unavailable'
            });
          }
          
          return interaction.editReply({ embeds: [statusEmbed] });
        } catch (error) {
          logger.error('Error checking AI status:', error);
          return interaction.reply({ 
            content: `An error occurred while checking AI status: ${error.message}`, 
            ephemeral: true 
          });
        }
      }
      case 'analytics': {
        // Get task analytics
        await interaction.deferReply();
        
        try {
          // Get guild ID for server-specific analytics
          const guildId = interaction.guildId;
          
          // Get current timestamp for date calculations
          const now = Date.now();
          const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
          const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
          
          // Get overall task stats
          const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE guild_id = ?').get(guildId).count;
          const completedTasks = db.prepare(
            'SELECT COUNT(*) as count FROM tasks WHERE guild_id = ? AND completion_percentage = 100'
          ).get(guildId).count;
          const inProgressTasks = db.prepare(
            'SELECT COUNT(*) as count FROM tasks WHERE guild_id = ? AND completion_percentage > 0 AND completion_percentage < 100'
          ).get(guildId).count;
          const notStartedTasks = db.prepare(
            'SELECT COUNT(*) as count FROM tasks WHERE guild_id = ? AND completion_percentage = 0'
          ).get(guildId).count;
          
          // Calculate completion rate
          const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          
          // Get recently completed tasks
          const recentCompletions = db.prepare(
            `SELECT t.id, t.name, t.completion_percentage, s.completed_at
             FROM tasks t
             JOIN stages s ON t.id = s.task_id
             WHERE t.guild_id = ? AND s.completed_at > ? AND s.done = 1
             GROUP BY t.id
             ORDER BY s.completed_at DESC
             LIMIT 5`
          ).all(guildId, oneWeekAgo);
          
          // Get upcoming deadlines
          const upcomingDeadlines = db.prepare(
            `SELECT id, name, deadline, completion_percentage
             FROM tasks
             WHERE guild_id = ? AND deadline IS NOT NULL AND deadline != ''
               AND (completion_percentage < 100 OR completion_percentage IS NULL)
             ORDER BY
               CASE
                 WHEN deadline LIKE '%-%' THEN date(deadline)
                 WHEN deadline LIKE '%.%.%' THEN date(substr(deadline, 7, 4) || '-' || substr(deadline, 4, 2) || '-' || substr(deadline, 1, 2))
                 ELSE date(deadline)
               END ASC
             LIMIT 5`
          ).all(guildId);
          
          // Create main embed for overall analytics
          const analyticsEmbed = new EmbedBuilder()
            .setTitle('📊 Task Analytics Dashboard')
            .setDescription(`Task statistics for this server`)
            .setColor(0x3498db)
            .setTimestamp()
            .addFields(
              { name: '📋 Total Tasks', value: `${totalTasks}`, inline: true },
              { name: '✅ Completed', value: `${completedTasks} (${completionRate}%)`, inline: true },
              { name: '⏱️ In Progress', value: `${inProgressTasks}`, inline: true },
              { name: '🆕 Not Started', value: `${notStartedTasks}`, inline: true }
            );
          
          // Add visual completion rate bar
          analyticsEmbed.addFields({
            name: '📈 Task Completion Rate',
            value: this.createProgressBar(completionRate)
          });
          
          // Add recent completions if any
          if (recentCompletions.length > 0) {
            let recentCompStr = '';
            recentCompletions.forEach(task => {
              const completeDate = new Date(task.completed_at).toLocaleDateString();
              recentCompStr += `\n• \`${task.id}\` **${task.name}** - ${completeDate}`;
            });
            analyticsEmbed.addFields({ name: '🎉 Recent Task Completions', value: recentCompStr || 'None' });
          }
          
          // Create embed for upcoming deadlines
          const deadlinesEmbed = new EmbedBuilder()
            .setTitle('⏰ Upcoming Deadlines')
            .setDescription('Tasks with approaching deadlines')
            .setColor(0xe74c3c);
          
          if (upcomingDeadlines.length > 0) {
            let deadlinesStr = '';
            upcomingDeadlines.forEach(task => {
              const formattedDate = this.formatDate(task.deadline);
              const progressBar = this.createProgressBar(task.completion_percentage || 0);
              deadlinesStr += `\n• \`${task.id}\` **${task.name}**\n  ${formattedDate}\n  ${progressBar}`;
            });
            deadlinesEmbed.setDescription(deadlinesStr);
          } else {
            deadlinesEmbed.setDescription('No upcoming deadlines found');
          }
          
          // Respond with embeds
          await interaction.editReply({ embeds: [analyticsEmbed, deadlinesEmbed] });
          
        } catch (error) {
          logger.error('Error generating analytics:', error);
          interaction.editReply('❌ An error occurred while generating analytics: ' + error.message);
        }
      }
    }
  },

  /**
   * Creates a visual progress bar
   * @param {number} percentage - Progress percentage (0-100)
   * @returns {string} - Text-based progress bar with emoji indicators
   */
  createProgressBar(percentage) {
    const filledChar = '■';
    const emptyChar = '□';
    const barLength = 15; // Slightly shorter bar to fit better in Discord
    const filledLength = Math.round((percentage / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    const filled = filledChar.repeat(filledLength);
    const empty = emptyChar.repeat(emptyLength);
    
    // Add emoji indicators based on progress
    let statusEmoji = '';
    if (percentage === 0) {
      statusEmoji = '🆕 ';
    } else if (percentage < 25) {
      statusEmoji = '🔄 ';
    } else if (percentage < 50) {
      statusEmoji = '⚙️ ';
    } else if (percentage < 75) {
      statusEmoji = '📈 ';
    } else if (percentage < 100) {
      statusEmoji = '🔜 ';
    } else {
      statusEmoji = '✅ ';
    }
    
    return `${statusEmoji}${filled}${empty} ${percentage}%`;
  },
  
  /**
   * Format a timestamp or date string for display
   * @param {number|string} timestamp - Timestamp in ms or date string
   * @returns {string} - Formatted date string
   */
  formatDate(timestamp) {
    if (!timestamp) return 'No date set';
    
    try {
      // Try to parse the input as a date string first
      let date;
      if (typeof timestamp === 'string') {
        // Handle DD.MM.YYYY format (convert to YYYY-MM-DD for parsing)
        if (timestamp.includes('.')) {
          const parts = timestamp.split('.');
          if (parts.length === 3) {
            timestamp = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
        date = new Date(timestamp);
      } else {
        // Handle as timestamp
        date = new Date(timestamp);
      }
      
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      // Format as DD.MM.YYYY
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const isToday = date.toDateString() === today.toDateString();
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      
      // Add emoji and special indicator for dates close to today
      let prefix = '';
      
      // Check if date is in the past
      if (date < today && date.toDateString() !== today.toDateString()) {
        prefix = '⚠️ ';
      } else if (isToday) {
        prefix = '📅 Today: ';
      } else if (isTomorrow) {
        prefix = '📆 Tomorrow: ';
      } else {
        // Calculate days until the date
        const diffTime = date.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0 && diffDays <= 7) {
          prefix = `🔜 In ${diffDays} day${diffDays > 1 ? 's' : ''}: `;
        } else if (diffDays > 7 && diffDays <= 14) {
          prefix = `📅 In ${Math.floor(diffDays / 7)} week: `;
        }
      }
      
      return `${prefix}${day}.${month}.${year}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return String(timestamp) || 'Unknown date';
    }
  }
}
