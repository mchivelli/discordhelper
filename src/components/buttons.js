const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function stageActionRow(taskId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`advance_${taskId}`)
      .setLabel('Advance')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`details_${taskId}`)
      .setLabel('Details')
      .setStyle(ButtonStyle.Primary)
  );
}

module.exports = { stageActionRow };
