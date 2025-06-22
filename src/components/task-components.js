// Task-specific UI components for Discord interactions
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

/**
 * Create buttons for task stage suggestions interaction
 * @param {string} taskId - Task ID
 * @param {string} suggestionsId - Suggestions record ID
 * @returns {ActionRowBuilder} - Action row with buttons
 */
function stageSuggestionsActionRow(taskId, suggestionsId) {
  // Ensure IDs don't cause issues by limiting length and removing special characters
  const safeTaskId = taskId.toString().substring(0, 20).replace(/[^a-zA-Z0-9_-]/g, '');
  // Don't truncate suggestion IDs - they need to be complete for database lookup
  const safeSuggestionsId = suggestionsId.toString();
  
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${safeTaskId}_${safeSuggestionsId}`)
        .setLabel('Accept All Stages')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`modify_${safeTaskId}_${safeSuggestionsId}`)
        .setLabel('Modify Stages')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`skip_${safeTaskId}_${safeSuggestionsId}`)
        .setLabel('Skip AI Stages')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Create buttons for task advancement with AI enhancement
 * @param {string} taskId - Task ID
 * @param {number} stageIdx - Stage index
 * @returns {ActionRowBuilder} - Action row with buttons
 */
function advanceStageActionRow(taskId, stageIdx) {
  // Ensure IDs don't cause issues by limiting length and removing special characters
  const safeTaskId = taskId.toString().substring(0, 20).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeStageIdx = Math.min(stageIdx, 9999); // Limit to reasonable number
  
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`advance_simple_${safeTaskId}_${safeStageIdx}`)
        .setLabel('Mark Complete')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`advance_notes_${safeTaskId}_${safeStageIdx}`)
        .setLabel('Add Completion Notes')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`view_${safeTaskId}`)
        .setLabel('View Task')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Create a modal for adding completion notes
 * @param {string} taskId - Task ID
 * @param {number} stageIdx - Stage index
 * @param {string} stageName - Stage name
 * @param {boolean} useAI - Whether to enhance notes with AI
 * @returns {ModalBuilder} - Modal for notes input
 */
function createCompletionNotesModal(taskId, stageIdx, stageName, useAI = false) {
  // Ensure IDs and values are safe
  const safeTaskId = taskId.toString().substring(0, 20).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeStageIdx = Math.min(stageIdx, 9999); // Limit to reasonable number
  const safeStageName = stageName.substring(0, 50);
  
  const modalId = useAI 
    ? `complete_notes_ai_${safeTaskId}_${safeStageIdx}` 
    : `complete_notes_${safeTaskId}_${safeStageIdx}`;
  
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(`Complete Stage: ${safeStageName}`);
    
  // Add text input for completion notes
  const notesInput = new TextInputBuilder()
    .setCustomId('completion_notes')
    .setLabel('Completion Notes')
    .setPlaceholder('Describe what was accomplished in this stage...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  
  // Add AI enhancement option  
  const aiEnhanceInput = new TextInputBuilder()
    .setCustomId('enhance_with_ai')
    .setLabel('Enhance with AI? (type yes or no)')
    .setPlaceholder('yes')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(5);
    
  const notesRow = new ActionRowBuilder().addComponents(notesInput);
  const aiRow = new ActionRowBuilder().addComponents(aiEnhanceInput);
  
  modal.addComponents(notesRow, aiRow);
  
  return modal;
}

/**
 * Create a modal for modifying suggested stages
 * @param {string} taskId - Task ID
 * @param {string} suggestionsId - Suggestions record ID
 * @param {Array} stages - Array of suggested stages
 * @returns {ModalBuilder} - Modal for stage modification
 */
function createModifySuggestionsModal(taskId, suggestionsId, stages) {
  // Ensure IDs don't cause issues
  const safeTaskId = taskId.toString().substring(0, 20).replace(/[^a-zA-Z0-9_-]/g, '');
  // Don't truncate suggestion IDs - they need to be complete for database lookup
  const safeSuggestionsId = suggestionsId.toString();
  
  const modal = new ModalBuilder()
    .setCustomId(`modify_suggestions_${safeTaskId}_${safeSuggestionsId}`)
    .setTitle('Modify Suggested Stages');
  
  // Safely handle stages array
  const safeStages = Array.isArray(stages) ? stages : [];
  
  // Create text input for each stage (max 5)
  const components = [];
  for (let i = 0; i < Math.min(safeStages.length, 5); i++) {
    const stage = safeStages[i] || { name: `Stage ${i+1}`, description: '' };
    const safeName = (stage.name || `Stage ${i+1}`).substring(0, 50);
    const safeDesc = (stage.description || '').substring(0, 200);
    
    const stageInput = new TextInputBuilder()
      .setCustomId(`stage_${i}`)
      .setLabel(`Stage ${i+1}: ${safeName}`)
      .setValue(`${safeName}: ${safeDesc}`)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(300);
      
    components.push(new ActionRowBuilder().addComponents(stageInput));
  }
  
  // Ensure we have at least one component
  if (components.length === 0) {
    const defaultInput = new TextInputBuilder()
      .setCustomId('stage_0')
      .setLabel('Stage 1')
      .setValue('Planning: Define the scope and requirements')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(300);
      
    components.push(new ActionRowBuilder().addComponents(defaultInput));
  }
  
  modal.addComponents(...components);
  return modal;
}

module.exports = {
  stageSuggestionsActionRow,
  advanceStageActionRow,
  createCompletionNotesModal,
  createModifySuggestionsModal
};
