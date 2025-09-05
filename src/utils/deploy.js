require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands'))
  .filter(file => file.endsWith('.js'))
  // Sort by name for deterministic ordering
  .sort((a, b) => a.localeCompare(b));

// Load commands
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  const json = command.data.toJSON();
  // Reorder options so all required options come before optional ones (Discord API requirement)
  const reorder = (optArray) => {
    if (!Array.isArray(optArray)) return optArray;
    // Place required first, keep relative order otherwise
    const required = optArray.filter(o => o.required);
    const optional = optArray.filter(o => !o.required);
    const merged = [...required, ...optional];
    // Recurse for subcommands/groups
    for (const o of merged) {
      if (o.options && Array.isArray(o.options)) {
        o.options = reorder(o.options);
      }
    }
    return merged;
  };
  if (Array.isArray(json.options)) {
    json.options = reorder(json.options);
  }
  commands.push(json);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands - global or to a specific guild based on environment
(async () => {
  try {
    console.log('Started refreshing application commands.');
    // Debug: print command names and option order
    try {
      console.log('Commands to deploy:', commands.map(c => c.name));
    } catch (_) {}
    
    if (process.env.GUILD_ID) {
      // Development - guild commands update instantly
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully registered commands for guild ${process.env.GUILD_ID}`);
    } else {
      // Production - global commands (takes up to an hour to update)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('Successfully registered global commands');
    }
  } catch (error) {
    console.error(error);
  }
})();
