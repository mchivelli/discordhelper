// Load environment variables with fallback support
const { loadEnv } = require('./utils/env-loader');
loadEnv();
const readline = require('readline');
const { generateTaskStages, enhanceTaskDescription, enhanceTaskNote, checkAIStatus } = require('./utils/ai');
const { getTemplateList, getTemplate, getTemplateStages } = require('./utils/task-templates');
const db = require('./utils/db');
const util = require('util');

// Mock interaction object to simulate Discord interactions
class MockInteraction {
  constructor() {
    this.replied = false;
    this.deferred = false;
    this.guildId = 'cli-test-guild';
    this.user = { id: 'cli-user', username: 'CLI User' };
    this.response = null;
  }

  async deferReply() {
    this.deferred = true;
    console.log('Processing request...');
    return this;
  }

  async reply(content) {
    this.replied = true;
    this.response = content;
    
    if (typeof content === 'string') {
      console.log('\nResponse:', content);
    } else if (content.content) {
      console.log('\nResponse:', content.content);
    }
    
    if (content.embeds) {
      for (const embed of content.embeds) {
        console.log('\n--- EMBED ---');
        console.log(`Title: ${embed.title}`);
        console.log(`Description: ${embed.description || 'No description'}`);
        
        if (embed.fields && embed.fields.length > 0) {
          console.log('\nFields:');
          for (const field of embed.fields) {
            console.log(`* ${field.name}:`);
            console.log(`  ${field.value}`);
          }
        }
        
        if (embed.footer) {
          console.log(`\nFooter: ${embed.footer.text}`);
        }
        console.log('-------------\n');
      }
    }
    
    if (content.components) {
      console.log('\nAvailable Actions:');
      for (const row of content.components) {
        for (const component of row.components) {
          console.log(`[${component.label || component.customId}]`);
        }
      }
    }
    
    return this;
  }

  async editReply(content) {
    return this.reply(content);
  }

  async respond(choices) {
    console.log('\nAutocomplete options:');
    choices.forEach((choice, index) => {
      console.log(`${index + 1}. ${choice.name} (${choice.value})`);
    });
    return this;
  }

  getSubcommand() {
    return this._subcommand;
  }

  setSubcommand(value) {
    this._subcommand = value;
    return this;
  }

  options = {
    _values: {},
    getString(key) {
      return this._values[key];
    },
    getBoolean(key) {
      return this._values[key] === 'true' || this._values[key] === true;
    },
    getUser(key) {
      return { id: this._values[key], username: this._values[key], send: async (msg) => console.log(`DM to user: ${msg}`) };
    },
    setOption(key, value) {
      this._values[key] = value;
    },
    getFocused() {
      return { name: 'id', value: this._values.id || '' };
    }
  };
}

// Utility function to format the task command output nicely
function formatProgressBar(percentage) {
  const filledChar = '■';
  const emptyChar = '□';
  const barLength = 15;
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
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// Load the task command
const taskCommand = require('./commands/task.js');

// Main CLI loop
async function runCLI() {
  console.log('=== Task Management CLI Tester ===');
  console.log('This tool allows you to test the task management system without Discord.\n');
  
  try {
    // Check AI status
    console.log('Checking AI service status...');
    const aiStatus = await checkAIStatus();
    if (aiStatus.success) {
      console.log('✅ AI services are working!');
      console.log(`Using model: ${process.env.MODEL_NAME || 'default'}`);
    } else {
      console.log('⚠️ AI services are not configured or not working.');
      console.log(aiStatus.message);
    }
    
    // Main loop
    while (true) {
      console.log('\nAvailable commands:');
      console.log('1. Create a task');
      console.log('2. List task templates');
      console.log('3. Add a stage to a task');
      console.log('4. List task stages');
      console.log('5. Advance a task');
      console.log('6. Show analytics');
      console.log('7. Exit');
      
      const choice = await question('\nEnter your choice (1-7): ');
      
      if (choice === '7') {
        console.log('Exiting CLI tester...');
        break;
      }
      
      const interaction = new MockInteraction();
      
      try {
        switch (choice) {
          case '1': {
            // Create a task
            interaction.setSubcommand('create');
            
            const taskName = await question('Enter task name: ');
            interaction.options.setOption('name', taskName);
            
            const useCustomId = await question('Use custom ID? (y/N): ');
            if (useCustomId.toLowerCase() === 'y') {
              const customId = await question('Enter custom ID: ');
              interaction.options.setOption('id', customId);
            }
            
            const contents = await question('Enter task description (optional): ');
            if (contents) interaction.options.setOption('contents', contents);
            
            const deadline = await question('Enter deadline (YYYY-MM-DD or DD.MM.YYYY, optional): ');
            if (deadline) interaction.options.setOption('deadline', deadline);
            
            console.log('\nAvailable templates:');
            const templates = getTemplateList();
            templates.forEach((template, index) => {
              console.log(`${index + 1}. ${template.name} (${template.id})`);
            });
            console.log('0. No template');
            
            const templateChoice = await question('Choose a template (0-5): ');
            if (templateChoice !== '0' && templates[parseInt(templateChoice) - 1]) {
              interaction.options.setOption('template', templates[parseInt(templateChoice) - 1].id);
            }
            
            const useAI = await question('Use AI to generate stages? (y/N): ');
            interaction.options.setOption('aihelp', useAI.toLowerCase() === 'y');
            
            await taskCommand.execute(interaction);
            break;
          }
          case '2': {
            // List templates
            console.log('\nAvailable task templates:');
            const templates = getTemplateList();
            
            for (const template of templates) {
              console.log(`\n=== ${template.name} (${template.id}) ===`);
              const stages = getTemplateStages(template.id);
              
              if (stages && stages.length > 0) {
                stages.forEach((stage, index) => {
                  console.log(`\nStage ${index + 1}: ${stage.name}`);
                  console.log(`Description: ${stage.description}`);
                });
              } else {
                console.log('No stages defined for this template.');
              }
            }
            break;
          }
          case '3': {
            // Add a stage
            interaction.setSubcommand('add-stage');
            
            const taskId = await question('Enter task ID: ');
            interaction.options.setOption('id', taskId);
            
            const stageName = await question('Enter stage name: ');
            interaction.options.setOption('name', stageName);
            
            const stageDesc = await question('Enter stage description: ');
            interaction.options.setOption('desc', stageDesc);
            
            await taskCommand.execute(interaction);
            break;
          }
          case '4': {
            // List task stages
            interaction.setSubcommand('list');
            
            const taskId = await question('Enter task ID: ');
            interaction.options.setOption('id', taskId);
            
            await taskCommand.execute(interaction);
            break;
          }
          case '5': {
            // Advance a task
            interaction.setSubcommand('advance');
            
            const taskId = await question('Enter task ID: ');
            interaction.options.setOption('id', taskId);
            
            const notes = await question('Enter completion notes (optional): ');
            if (notes) interaction.options.setOption('notes', notes);
            
            const enhanceNotes = await question('Enhance notes with AI? (y/N): ');
            interaction.options.setOption('enhancewithai', enhanceNotes.toLowerCase() === 'y');
            
            await taskCommand.execute(interaction);
            break;
          }
          case '6': {
            // Show analytics
            interaction.setSubcommand('analytics');
            await taskCommand.execute(interaction);
            break;
          }
          default:
            console.log('Invalid choice. Please try again.');
        }
      } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error(error.stack);
      }
      
      await question('\nPress Enter to continue...');
    }
  } catch (error) {
    console.error('Unhandled error:', error);
  } finally {
    rl.close();
  }
}

// Add support for async readline
async function main() {
  try {
    await runCLI();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run the CLI tool
main();
