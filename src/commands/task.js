const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db');
const { getPrereqs, getSuggestions, generateTaskStages, enhanceTaskDescription, enhanceTaskNote, checkAIStatus } = require('../utils/ai');
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
        o.setName('name')
        .setDescription('Name of the task (e.g., "Website Redesign")')
        .setRequired(true))
      .addStringOption(o => 
        o.setName('contents')
        .setDescription('Detailed description of what the task involves')
        .setRequired(false))
      .addStringOption(o => 
        o.setName('id')
        .setDescription('Optional custom ID for the task')
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
          { name: 'Discord Web Integration', value: 'web' },
          { name: 'Discord Server Meeting', value: 'meeting' },
          { name: 'Server Content Creation', value: 'content' },
          { name: 'Bot Bug Fixing', value: 'bugfix' },
          { name: 'Server Event Planning', value: 'event' },
          { name: 'Discord Moderation', value: 'moderation' }
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
      sub.setName('check-ai')
      .setDescription('Check if AI services are working correctly'))
    .addSubcommand(sub => 
      sub.setName('analytics')
      .setDescription('Get insights about tasks and productivity in this server'))
    .addSubcommand(sub => 
      sub.setName('faction')
      .setDescription('Assign faction role to a user')
      .addUserOption(u => 
        u.setName('user')
        .setDescription('User to assign faction role to')
        .setRequired(true))
      .addStringOption(o => 
        o.setName('faction')
        .setDescription('Which faction to assign')
        .setRequired(true)
        .addChoices(
          { name: 'Red Kingdom', value: 'red_kingdom' },
          { name: 'Blue Alliance', value: 'blue_alliance' },
          { name: 'Green Tribe', value: 'green_tribe' },
          { name: 'Yellow Empire', value: 'yellow_empire' },
          { name: 'Purple Dominion', value: 'purple_dominion' },
          { name: 'Black Order', value: 'black_order' },
          { name: 'White Sanctuary', value: 'white_sanctuary' },
          { name: 'Orange Federation', value: 'orange_federation' }
        ))
      .addStringOption(o => 
        o.setName('role')
        .setDescription('Role within faction')
        .setRequired(true)
        .addChoices(
          { name: 'Leader', value: 'leader' },
          { name: 'Co-Leader', value: 'co_leader' },
          { name: 'General', value: 'general' },
          { name: 'Captain', value: 'captain' },
          { name: 'Diplomat', value: 'diplomat' },
          { name: 'Recruiter', value: 'recruiter' },
          { name: 'Scout', value: 'scout' },
          { name: 'Warrior', value: 'warrior' },
          { name: 'Builder', value: 'builder' },
          { name: 'Farmer', value: 'farmer' },
          { name: 'Miner', value: 'miner' },
          { name: 'Enchanter', value: 'enchanter' },
          { name: 'Brewer', value: 'brewer' },
          { name: 'Scribe', value: 'scribe' },
          { name: 'Spy', value: 'spy' }
        ))),
        
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
    // Check if user has admin permissions before allowing command execution
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      return interaction.reply({
        content: '⛔ This command is restricted to server administrators only.',
        ephemeral: true
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'create': {
        try {
          await interaction.deferReply();
          // Get all the user options
          const name = interaction.options.getString('name');
          const customId = interaction.options.getString('id');
          const contents = interaction.options.getString('contents') || '';
          const deadline = interaction.options.getString('deadline') || '';
          const templateId = interaction.options.getString('template');
          const useAI = interaction.options.getBoolean('aihelp') || false;
          
          // Generate unique ID if none provided
          const id = customId || `t${Date.now()}`;
          
          // Save task to database
          db.prepare(
            'INSERT INTO tasks(id, name, description, deadline, completion_percentage, created_at, guild_id, creator_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(id, name, contents, deadline, 0, Date.now(), interaction.guildId, interaction.user.id);
          
          // Prepare embed to show task was created
          const embed = new EmbedBuilder()
            .setTitle(`Task Created: ${name}`)
            .setDescription(`**Description:** ${contents || 'No description provided'}`)
            .addFields({ name: 'Task ID', value: id, inline: true })
            .setColor('#4CAF50')
            .setFooter({ text: 'Task Management System' })
            .setTimestamp();
          
          if (deadline) {
            embed.addFields({ name: 'Deadline', value: this.formatDate(deadline), inline: true });
          }
          
          // Create task using a predefined template
          if (templateId) {
            const templates = require('../utils/task-templates');
            
            if (templates[templateId]) {
              const template = templates[templateId];
              const stages = template.stages;
              
              // Add stages from template
              stages.forEach((stage, idx) => {
                db.prepare(
                  'INSERT INTO stages(task_id, idx, name, desc, created_at) VALUES(?, ?, ?, ?, ?)'
                ).run(id, idx, stage.name, stage.description, Date.now());
              });
              
              embed.addFields({ name: 'Template', value: template.name, inline: true });
              embed.addFields({ name: 'Stages', value: `Added ${stages.length} stages from template` });
              
              await interaction.editReply({ embeds: [embed] });
            } else {
              await interaction.editReply('Template not found. Creating task without stages.');
            }
          } 
          // Use AI to suggest stages if requested
          else if (useAI) {
            try {
              // Generate stage suggestions using AI with contents field
              const suggestedStages = await generateTaskStages(name, contents || name, deadline);
              
              // Store suggestions in database
              const suggestionResult = db.prepare(
                'INSERT INTO task_suggestions(task_id, stage_suggestions, created_at) VALUES(?, ?, ?)'
              ).run(id, JSON.stringify(suggestedStages), Date.now());
              
              const suggestionId = suggestionResult.lastInsertRowid;
              
              // Create embed to display suggestions
              const suggestionsEmbed = new EmbedBuilder()
                .setTitle(`AI-Suggested Stages for "${name}"`)
                .setDescription(`Here are stage suggestions based on your task description. You can accept all or selected ones.`)
                .setColor('#2196F3')
                .setFooter({ text: 'Powered by AI' });
              
              // Add each stage as a field
              suggestedStages.forEach((stage, idx) => {
                suggestionsEmbed.addFields({
                  name: `${idx + 1}. ${stage.name}`,
                  value: stage.description
                });
              });
              
              // Create buttons for accepting suggestions
              const row = stageSuggestionsActionRow(id, suggestionId);
              
              // Send the suggestions
              embed.addFields({ name: 'AI Suggestions', value: 'Stage suggestions generated. See below.' });
              
              await interaction.editReply({
                embeds: [embed, suggestionsEmbed],
                components: [row]
              });
            } catch (error) {
              logger.error('Error generating AI suggestions:', error);
              embed.addFields({ name: 'AI Suggestions', value: 'Failed to generate suggestions. Please add stages manually.' });
              await interaction.editReply({ embeds: [embed] });
            }
          } else {
            // No template or AI, just create the basic task
            await interaction.editReply({ embeds: [embed] });
          }
        } catch (error) {
          logger.error('Error creating task:', error);
          if (interaction.deferred) {
            await interaction.editReply(`❌ Error creating task: ${error.message}`);
          } else {
            await interaction.reply({ content: `❌ Error creating task: ${error.message}`, ephemeral: true });
          }
        }
        break;
      }

      case 'add-stage': {
        try {
          await interaction.deferReply();
          const id = interaction.options.getString('id');
          const name = interaction.options.getString('name');
          const desc = interaction.options.getString('desc');
          const idx = db.prepare('SELECT COUNT(*) as c FROM stages WHERE task_id=?').get(id).c;
          db.prepare('INSERT INTO stages(task_id,idx,name,desc,created_at) VALUES(?,?,?,?,?)').run(id, idx, name, desc, Date.now());
          return interaction.editReply(`➕ Stage **${name}** added to task \`${id}\``);
        } catch (error) {
          logger.error('Error adding stage:', error);
          if (interaction.deferred) {
            await interaction.editReply(`❌ Error adding stage: ${error.message}`);
          } else {
            await interaction.reply({ content: `❌ Error adding stage: ${error.message}`, ephemeral: true });
          }
        }
      }
      case 'list': {
        try {
          await interaction.deferReply();
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
          if (interaction.deferred) {
            await interaction.editReply({ 
              content: `An error occurred while listing the task: ${error.message}`, 
              ephemeral: true 
            });
          } else {
            await interaction.reply({ 
              content: `An error occurred while listing the task: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
      }
      case 'advance': {
        try {
          await interaction.deferReply();
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
          if (interaction.deferred) {
            await interaction.editReply({ 
              content: `An error occurred while advancing the stage: ${error.message}`, 
              ephemeral: true 
            });
          } else {
            await interaction.reply({ 
              content: `An error occurred while advancing the stage: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
      }
      case 'assign': {
        try {
          await interaction.deferReply();
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
          if (interaction.deferred) {
            await interaction.editReply({ 
              content: `An error occurred while assigning the user: ${error.message}`, 
              ephemeral: true 
            });
          } else {
            await interaction.reply({ 
              content: `An error occurred while assigning the user: ${error.message}`, 
              ephemeral: true 
            });
          }
        }
        break;
      }
      case 'check-ai': {
        try {
          await interaction.deferReply();
          
          // Call the AI status check function
          const aiStatus = await checkAIStatus();
          
          // Create an embed to display the status info
          const embed = new EmbedBuilder()
            .setTitle('🤖 AI Integration Status')
            .setColor(aiStatus.success ? 0x00FF00 : 0xFF0000)
            .setDescription(aiStatus.success ? 
              '✅ **AI services are working correctly!**' : 
              '❌ **AI services are not functioning properly.**')
            .addFields(
              { name: 'Status', value: aiStatus.message },
              { name: 'Available AI Features', value: [
                '• Task stage generation',
                '• Description enhancement',
                '• Completion notes enhancement',
                '• Smart command suggestions'
              ].join('\n')}
            )
            .setFooter({ text: 'Using free models: Gemini or DeepSeek' })
            .setTimestamp();
          
          // Add troubleshooting tips if there's an issue
          if (!aiStatus.success) {
            embed.addFields({
              name: 'Troubleshooting Tips',
              value: [
                '• Check if the `OPENROUTER_API_KEY` is set in the .env file',
                '• Verify the API key is valid and has not expired',
                '• Make sure the `MODEL_NAME` is set correctly (defaults to Gemini)',
                '• Ensure the bot has internet access to connect to OpenRouter'
              ].join('\n')
            });
          }
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error('Error checking AI status:', error);
          if (interaction.deferred) {
            await interaction.editReply({ content: 'Error checking AI status: ' + error.message });
          } else {
            await interaction.reply({ content: 'Error checking AI status: ' + error.message, ephemeral: true });
          }
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
      case 'analytics': {
        try {
          await interaction.deferReply();
          
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
          if (interaction.deferred) {
            await interaction.editReply('❌ An error occurred while generating analytics: ' + error.message);
          } else {
            await interaction.reply({ content: '❌ An error occurred while generating analytics: ' + error.message, ephemeral: true });
          }
        }
      }
      case 'faction': {
        try {
          await interaction.deferReply();
          const user = interaction.options.getUser('user');
          const faction = interaction.options.getString('faction');
          const role = interaction.options.getString('role');
          
          // Get faction name in proper format
          const factionName = faction.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          const roleName = role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
          
          // Check if user is a member of this guild
          const member = interaction.guild.members.cache.get(user.id) || 
                         await interaction.guild.members.fetch(user.id).catch(() => null);
          
          if (!member) {
            return interaction.editReply(`❌ Could not find member ${user.tag} in this server.`);
          }
          
          // Create Discord roles if they don't exist
          // 1. Create/get the faction role
          let factionRole = interaction.guild.roles.cache.find(r => r.name === factionName);
          
          if (!factionRole) {
            // Create faction role with appropriate color
            let roleColor = '#AAAAAA'; // Default color
            if (faction.includes('red')) roleColor = '#FF0000';
            if (faction.includes('blue')) roleColor = '#0000FF';
            if (faction.includes('green')) roleColor = '#00FF00';
            if (faction.includes('yellow')) roleColor = '#FFFF00';
            if (faction.includes('purple')) roleColor = '#800080';
            if (faction.includes('black')) roleColor = '#000000';
            if (faction.includes('white')) roleColor = '#FFFFFF';
            if (faction.includes('orange')) roleColor = '#FFA500';
            
            try {
              factionRole = await interaction.guild.roles.create({
                name: factionName,
                color: roleColor,
                reason: 'Faction role created by Task Bot'
              });
              await interaction.channel.send(`📝 Created new faction role: **${factionName}**`);
            } catch (error) {
              logger.error('Error creating faction role:', error);
              return interaction.editReply(`❌ Could not create faction role: ${error.message}`);
            }
          }
          
          // 2. Create/get the position role within the faction
          const positionRoleName = `${factionName} ${roleName}`;
          let positionRole = interaction.guild.roles.cache.find(r => r.name === positionRoleName);
          
          if (!positionRole) {
            try {
              positionRole = await interaction.guild.roles.create({
                name: positionRoleName,
                reason: 'Faction position role created by Task Bot'
              });
              await interaction.channel.send(`📝 Created new position role: **${positionRoleName}**`);
            } catch (error) {
              logger.error('Error creating position role:', error);
              return interaction.editReply(`❌ Could not create position role: ${error.message}`);
            }
          }
          
          // Assign roles to the member
          try {
            // First, remove any existing faction roles
            const allFactionRoles = Array.from(interaction.guild.roles.cache.values())
              .filter(r => 
                r.name.includes('Kingdom') || 
                r.name.includes('Alliance') || 
                r.name.includes('Tribe') || 
                r.name.includes('Empire') || 
                r.name.includes('Dominion') || 
                r.name.includes('Order') || 
                r.name.includes('Sanctuary') || 
                r.name.includes('Federation')
              );
            
            // Remove old faction and position roles
            for (const oldRole of allFactionRoles) {
              if (member.roles.cache.has(oldRole.id)) {
                await member.roles.remove(oldRole);
              }
            }
            
            // Add new faction and position roles
            await member.roles.add(factionRole);
            await member.roles.add(positionRole);
          } catch (error) {
            logger.error('Error assigning roles to member:', error);
            return interaction.editReply(`❌ Could not assign roles: ${error.message}`);
          }
          
          // Create record in database
          const taskId = `f${Date.now()}`;
          db.prepare('INSERT INTO tasks(id,name,description,created_at,guild_id,creator_id) VALUES(?,?,?,?,?,?)')
            .run(
              taskId,
              `${factionName} Assignment: ${member.displayName}`,
              `Assigned as ${roleName} in ${factionName}`,
              Date.now(),
              interaction.guild.id,
              interaction.user.id
            );
          
          // Success message with emoji based on faction
          let factionEmoji = '🏷️';
          if (faction.includes('red')) factionEmoji = '🔴';
          if (faction.includes('blue')) factionEmoji = '🔵';
          if (faction.includes('green')) factionEmoji = '🟢';
          if (faction.includes('yellow')) factionEmoji = '🟡';
          if (faction.includes('purple')) factionEmoji = '🟣';
          if (faction.includes('black')) factionEmoji = '⚫';
          if (faction.includes('white')) factionEmoji = '⚪';
          if (faction.includes('orange')) factionEmoji = '🟠';
          
          // Create embed for response
          const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`${factionEmoji} Faction Assignment`)
            .setDescription(`**${member.displayName}** has been assigned as **${roleName}** in the **${factionName}**`)
            .addFields(
              { name: 'Roles Added', value: `<@&${factionRole.id}>\n<@&${positionRole.id}>` }
            )
            .setFooter({ text: `Assignment ID: ${taskId}` })
            .setTimestamp();
            
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          logger.error('Error assigning faction:', error);
          await interaction.editReply('❌ An error occurred while assigning faction: ' + error.message);
        }
        break;
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
