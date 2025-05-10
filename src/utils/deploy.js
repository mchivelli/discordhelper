require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));

// Load commands
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands - global or to a specific guild based on environment
(async () => {
  try {
    console.log('Started refreshing application commands.');
    
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
