const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { getPrereqs, getSuggestions } = require('../utils/ai');
const { stageActionRow } = require('../components/buttons');

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
        .setRequired(true)))
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
        .setAutocomplete(true)))
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
      .setDescription('Show help information about using task commands')),
        
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
      
      await interaction.respond(choices);
    }
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'create': {
        const name = interaction.options.getString('name');
        const id = `t${Date.now()}`;
        db.prepare('INSERT INTO tasks(id,name,created_at) VALUES(?,?,?)').run(id, name, Date.now());
        return interaction.reply(`✅ Task **${name}** created (ID: \`${id}\`)`);
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
        const id = interaction.options.getString('id');
        const rows = db.prepare('SELECT * FROM stages WHERE task_id=? ORDER BY idx').all(id);
        if (!rows.length) return interaction.reply('No stages.');
        const emb = new EmbedBuilder().setTitle(`Task ${id} Stages`);
        rows.forEach(s => emb.addFields({ name: `${s.idx+1}. ${s.name}`, value: s.done ? '✅ Done' : s.assignee ? `👤 <@${s.assignee}>` : '⏳ Pending' }));
        return interaction.reply({ embeds: [emb], components: [stageActionRow(id)] });
      }
      case 'advance': {
        const id = interaction.options.getString('id');
        const next = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (!next) return interaction.reply('All stages done 🎉');
        db.prepare('UPDATE stages SET done=1 WHERE task_id=? AND idx=?').run(id, next.idx);
        const upcoming = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (upcoming) {
          const prereq = await getPrereqs(`Task ${id}`, upcoming.name, upcoming.desc);
          return interaction.reply({ content: `Advanced to **${upcoming.name}**. Prereqs:\n${prereq}` });
        } else {
          return interaction.reply('🎉 All stages completed!');
        }
      }
      case 'assign': {
        const id = interaction.options.getString('id');
        const user = interaction.options.getUser('user');
        const row = db.prepare('SELECT * FROM stages WHERE task_id=? AND done=0 ORDER BY idx').get(id);
        if (!row) return interaction.reply('No active stage.');
        db.prepare('UPDATE stages SET assignee=? WHERE task_id=? AND idx=?').run(user.id, id, row.idx);
        await user.send(`You’ve been assigned to stage **${row.name}** of Task \`${id}\`.`);
        return interaction.reply(`👤 Assigned <@${user.id}> to **${row.name}**`);
      }
      case 'stats': {
        const total = db.prepare('SELECT COUNT(*) as c FROM stages').get().c;
        const done = db.prepare('SELECT COUNT(*) as c FROM stages WHERE done=1').get().c;
        return interaction.reply(`📊 ${done}/${total} stages completed.`);
      }
      case 'help': {
        const helpEmbed = new EmbedBuilder()
          .setTitle('🔍 Task Bot Help')
          .setDescription('Guide for using task management commands')
          .setColor(0x4caf50)
          .addFields(
            { name: '📝 Creating a Task', value: '`/task create name:"Your Task Name"`\nCreates a new task with a unique ID.' },
            { name: '➕ Adding Stages', value: '`/task add-stage id:"taskID" name:"Stage Name" desc:"Stage description"`\nAdds a stage to an existing task. Stages are completed in order.' },
            { name: '📋 Listing Stages', value: '`/task list id:"taskID"`\nShows all stages for a specific task with their status.' },
            { name: '⏭️ Advancing Stages', value: '`/task advance id:"taskID"`\nMarks the current stage as complete and advances to the next one. AI will provide prerequisite info for the next stage.' },
            { name: '👤 Assigning Stages', value: '`/task assign id:"taskID" user:@username`\nAssigns the current active stage to a Discord user.' },
            { name: '📊 Statistics', value: '`/task stats`\nShows overall completion statistics across all tasks.' },
            { name: '💡 Tips', value: 'You can type part of a task ID in any command and the bot will suggest matching tasks.\nUse buttons under task lists to quickly advance or view details.' }
          )
          .setFooter({ text: 'Task Bot • Type / to see all available commands' });
          
        return interaction.reply({ embeds: [helpEmbed] });
      }
    }
  }
}
