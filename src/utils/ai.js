require('dotenv').config();
const API_KEY = process.env.OPENROUTER_API_KEY;

// AI models configuration
const MODEL = process.env.MODEL_NAME || 'google/gemini-2.5-pro-exp-03-25';
const SUMMARIZATION_MODEL = process.env.SUMMARIZATION_MODEL || 'anthropic/claude-3.5-haiku';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Helper function to make API requests to the LLM
async function callLLMAPI(messages, maxTokens = 200, modelOverride = null) {
  // Discord-optimized fallback responses if API call fails or is not configured
  const fallbackResponses = {
    'getPrereqs': 'Make sure all previous stages are complete. Gather necessary resources and coordinate with team members.',
    'enhanceAnnouncement': messages[1]?.content?.replace('Please enhance this announcement: ', '') || 'Announcement content unavailable.',
    'getSuggestions': [],
    'generateTaskStages': [
      { name: '📋 Planning', description: 'Define objectives and requirements for this Discord task.' },
      { name: '🔧 Setup', description: 'Prepare necessary resources and configure initial environment.' },
      { name: '⚙️ Implementation', description: 'Execute the main work required to complete the task.' },
      { name: '🧪 Testing', description: 'Verify functionality and review results before finalizing.' },
      { name: '🚀 Deployment', description: 'Release the completed work to the community.' }
    ],
    'enhanceTaskNote': messages[1]?.content?.replace('Stage: ', '').replace('\nCompletion Notes: ', '').split('\n\nPlease enhance')[0] || 'Completed successfully.',
    'enhanceTaskDescription': messages[1]?.content?.replace('Task Name: ', '').replace('\nOriginal Description: ', '').split('\n\nPlease enhance')[0] || 'Task description unavailable.'
  };
  
  // Check if API key is configured
  if (!API_KEY) {
    console.warn('OpenRouter API key not configured. Using fallback responses.');
    // Determine which function is calling based on message content
    for (const [funcName, fallback] of Object.entries(fallbackResponses)) {
      if (messages[0]?.content?.includes(funcName) || 
          messages[1]?.content?.includes(funcName)) {
        return fallback;
      }
    }
    return fallbackResponses.getPrereqs; // Default fallback
  }
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://discord-task-bot.example.com',
        'X-Title': 'Discord Task Management Bot'
      },
      body: JSON.stringify({
        model: modelOverride || MODEL || 'google/gemini-2.5-pro-exp-03-25', // Use override model if provided
        messages: messages,
        max_tokens: maxTokens
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error(`OpenRouter error: ${err}`);
      // Use fallback response based on function name
      for (const [funcName, fallback] of Object.entries(fallbackResponses)) {
        if (messages[0]?.content?.includes(funcName) || 
            messages[1]?.content?.includes(funcName)) {
          return fallback;
        }
      }
      return fallbackResponses.getPrereqs; // Default fallback
    }
    
    const json = await res.json();
    if (!json.choices?.length) {
      console.error('No AI response');
      // Use fallback response
      for (const [funcName, fallback] of Object.entries(fallbackResponses)) {
        if (messages[0]?.content?.includes(funcName) || 
            messages[1]?.content?.includes(funcName)) {
          return fallback;
        }
      }
      return fallbackResponses.getPrereqs; // Default fallback
    }
    
    return json.choices[0].message.content;
  } catch (error) {
    console.error('Error calling AI API:', error);
    // Use fallback response
    for (const [funcName, fallback] of Object.entries(fallbackResponses)) {
      if (messages[0]?.content?.includes(funcName) || 
          messages[1]?.content?.includes(funcName)) {
        return fallback;
      }
    }
    return fallbackResponses.getPrereqs; // Default fallback
  }
}

async function getPrereqs(taskName, stageName, desc) {
  const prompt = `Task: ${taskName}\nStage: ${stageName}\nDescription: ${desc}\nList the prerequisites and necessities succinctly.`;
  
  return callLLMAPI([{ role: 'user', content: prompt }]);
}

/**
 * Enhance an announcement with AI suggestions
 * @param {string} content - The original announcement content
 * @returns {Promise<string>} - Enhanced announcement content
 */
async function enhanceAnnouncement(content) {
  const messages = [
    { 
      role: 'system', 
      content: 'You are a professional communications expert. Your task is to improve the provided announcement to make it clearer, more engaging, and professional while preserving all key information. Keep the same length or shorter.'
    },
    { 
      role: 'user', 
      content: `Please enhance this announcement: ${content}`
    }
  ];
  
  return callLLMAPI(messages, 400);
}

/**
 * Generate suggestions for task commands based on partial input
 * @param {string} partial - Partial command input
 * @param {string} context - Context of the command (task/stage/etc)
 * @returns {Promise<Array>} - Array of suggestion objects
 */
async function getSuggestions(partial, context) {
  // Example suggestions for different contexts to guide users on proper formatting
  const exampleSuggestions = {
    'task name': [
      { value: 'Website Redesign', description: 'A project to update the company website' },
      { value: 'Marketing Campaign', description: 'Q2 Marketing initiative for product launch' },
      { value: 'Bug Fixes', description: 'Critical fixes for the production system' },
      { value: 'New Feature', description: 'Implementing the user-requested feature' }
    ],
    'stage name': [
      { value: 'Research', description: 'Initial research and requirements gathering' },
      { value: 'Design', description: 'Creating mockups and design assets' },
      { value: 'Development', description: 'Building the core functionality' },
      { value: 'Testing', description: 'QA and bug fixing process' },
      { value: 'Deployment', description: 'Release to production' }
    ],
    'stage description': [
      { value: 'Gather requirements from stakeholders', description: 'Set up meetings and document needs' },
      { value: 'Create wireframes and mockups', description: 'Design the visual elements and user flow' },
      { value: 'Implement back-end API endpoints', description: 'Build the necessary server functionality' },
      { value: 'Write unit and integration tests', description: 'Ensure code quality and prevent regressions' }
    ]
  };
  
  // If we have examples for this context, use them first
  if (exampleSuggestions[context] && partial.length < 3) {
    return exampleSuggestions[context];
  }
  
  // Otherwise, use AI for more contextual suggestions
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant for a task management bot. Generate 3-5 instructive, realistic suggestions for ${context} based on the partial input. Focus on TEACHING THE USER THE CORRECT FORMAT through examples. Return a JSON array with suggestion objects. Each object must have "value" and "description" properties where the description explains how to use the suggestion properly.`
    },
    {
      role: 'user',
      content: `Partial input: "${partial}". Context: ${context}. Return only valid JSON array.`
    }
  ];
  
  const result = await callLLMAPI(messages, 300);
  
  // Extract the JSON array from the response
  try {
    // Find anything that looks like a JSON array
    const match = result.match(/\[\s*\{.*\}\s*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    } 
    // If no array found, try parsing the whole response
    return JSON.parse(result);
  } catch (error) {
    console.error('Failed to parse AI suggestions:', error);
    return [];
  }
}

/**
 * Generate AI-suggested stages for a task
 * @param {string} taskName - Name of the task
 * @param {string} description - Description of the task
 * @param {string} deadline - Optional deadline
 * @param {string} generateInstructions - Optional specific instructions for generation
 * @returns {Promise<Array>} - Array of suggested stage objects
 */
async function generateTaskStages(taskName, description, deadline = '', generateInstructions = '') {
  let systemPrompt = 'You are a task management assistant for a Discord server. Generate 3-5 task stages that would help complete the given task successfully. Each stage should have a name and description. Add an emoji at the start of each stage name. Respond with a proper JSON array. Use different emojis for each stage.';
  
  if (generateInstructions) {
    systemPrompt += ` Focus on the following specific instructions: ${generateInstructions}`;
  }
  
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: `Task: ${taskName}\nDescription: ${description}${deadline ? `\nDeadline: ${deadline}` : ''}\n\nPlease suggest logical stages to complete this task. Format your response as a valid JSON array of objects, each with "name" and "description" properties. The name should start with an emoji. Do not use any text outside of the JSON array.`
    }
  ];
  
  let result;
  try {
    result = await callLLMAPI(messages, 800);
    console.log('AI Stage Suggestions Result:', result);
  } catch (error) {
    console.error('Error generating task stages:', error);
    // Return default stages if API call fails
    return [
      { name: '📋 Planning', description: 'Define objectives and organize resources for this Discord task.' },
      { name: '🔧 Setup', description: 'Prepare the necessary environment and configurations.' },
      { name: '⚙️ Implementation', description: 'Execute the main work required to complete the task.' },
      { name: '🧪 Testing', description: 'Review and verify everything works correctly.' },
      { name: '🚀 Deployment', description: 'Release the completed work to the community.' }
    ];
  }
  
  try {
    // Find anything that looks like a JSON array
    const match = result.match(/\[\s*\{.*\}\s*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    } 
    // If no array found, try parsing the whole response
    try {
      return JSON.parse(result);
    } catch {
      // If still can't parse, extract from markdown code blocks if present
      const codeBlockMatch = result.match(/```(?:json)?([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return JSON.parse(codeBlockMatch[1].trim());
      }
    }
  } catch (error) {
    console.error('Failed to parse AI stage suggestions:', error);
    // Return Discord-optimized default stages if parsing fails
    return [
      { name: '📋 Planning', description: 'Define objectives and organize resources for this Discord task.' },
      { name: '🔧 Setup', description: 'Prepare the necessary environment and configurations.' },
      { name: '⚙️ Implementation', description: 'Execute the main work required to complete the task.' },
      { name: '🧪 Testing', description: 'Review and verify everything works correctly.' },
      { name: '🚀 Deployment', description: 'Release the completed work to the community.' }
    ];
  }
}

/**
 * Enhance task completion notes with AI
 * @param {string} notes - Original completion notes
 * @param {string} stageName - Name of the completed stage
 * @returns {Promise<string>} - Enhanced completion notes
 */
async function enhanceTaskNote(notes, stageName) {
  const messages = [
    {
      role: 'system',
      content: 'You are a Discord task assistant specializing in documentation. Your task is to improve the provided completion notes to make them clearer, more structured, and engaging for Discord community members. Use friendly language while preserving key information.'
    },
    {
      role: 'user',
      content: `Stage: ${stageName}\nCompletion Notes: ${notes}\n\nPlease enhance these completion notes to be more informative and engaging for our Discord server. Keep it concise but comprehensive.`
    }
  ];
  
  return callLLMAPI(messages, 300);
}

/**
 * Generate an improved task description
 * @param {string} taskName - Name of the task
 * @param {string} description - Original task description
 * @returns {Promise<string>} - Enhanced task description
 */
async function enhanceTaskDescription(taskName, description) {
  const messages = [
    {
      role: 'system',
      content: 'You are a Discord community task assistant. Your task is to improve the provided description to make it clearer, more actionable, and properly structured for Discord server members. Use friendly, engaging language appropriate for online communities.'
    },
    {
      role: 'user',
      content: `Task Name: ${taskName}\nOriginal Description: ${description}\n\nPlease enhance this task description to be more engaging, specific, and well-structured for our Discord server members. Keep it concise but informative.`
    }
  ];
  
  return callLLMAPI(messages, 400);
}

/**
 * Generate AI-suggested follow-up tasks or next actions after task completion
 * @param {string} taskName - Name of the completed task
 * @param {string} description - Description of the completed task
 * @param {Array} completedStages - Array of completed stages with their details
 * @returns {Promise<Array>} - Array of suggested follow-up task objects
 */
async function generateFollowUpTasks(taskName, description, completedStages = []) {
  const messages = [
    {
      role: 'system',
      content: 'You are a task management assistant for a Discord server. Based on the completed task, suggest 2-4 logical follow-up tasks or next actions that would naturally come after this work. Each suggestion should have a name and description. Add an emoji at the start of each task name. Respond with a valid JSON array.'
    },
    {
      role: 'user',
      content: `Completed Task: ${taskName}\nDescription: ${description}\nCompleted Stages: ${completedStages.map(s => s.name).join(', ')}\n\nPlease suggest follow-up tasks or next actions that would logically come after completing this task. Format your response as a valid JSON array of objects, each with "name" and "description" properties. The name should start with an emoji.`
    }
  ];
  
  try {
    const result = await callLLMAPI(messages, 600);
    
    // Parse the JSON response
    const match = result.match(/\[\s*\{.*\}\s*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
    
    try {
      return JSON.parse(result);
    } catch {
      const codeBlockMatch = result.match(/```(?:json)?([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return JSON.parse(codeBlockMatch[1].trim());
      }
    }
  } catch (error) {
    console.error('Failed to generate follow-up tasks:', error);
  }
  
  // Return generic follow-up suggestions if AI fails
  return [
    { name: '📊 Review Results', description: 'Analyze the outcomes and gather feedback from the completed task.' },
    { name: '📝 Documentation', description: 'Document the process and lessons learned for future reference.' },
    { name: '🔄 Process Improvement', description: 'Identify areas for improvement based on this task experience.' },
    { name: '📢 Share Updates', description: 'Communicate the completion and results to relevant stakeholders.' }
  ];
}

/**
 * Simple function to check if AI services are configured and working
 * @returns {Promise<{success: boolean, message: string}>} Status of AI services
 */
async function checkAIStatus() {
  if (!API_KEY) {
    return { 
      success: false, 
      message: "AI services not configured: API key missing. Using fallback responses."
    };
  }
  
  try {
    // Simple test call to verify API access
    const result = await callLLMAPI([{ 
      role: 'user', 
      content: 'Reply with OK if you can read this message.' 
    }], 50);
    
    const isWorking = result && (result.includes('OK') || result.includes('ok') || result.includes('Yes') || result.includes('yes'));
    
    return { 
      success: isWorking, 
      message: isWorking 
        ? "AI services are configured and working properly." 
        : "AI services configured but not responding as expected. Check API key and model." 
    };
  } catch (error) {
    return { 
      success: false, 
      message: `AI services not working: ${error.message}. Using fallback responses.` 
    };
  }
}

// Store a Discord message in the database for summarization
function storeChatMessage(db, message) {
  try {
    const messageData = {
      id: `${message.guild.id}_${message.channel.id}_${message.id}`,
      message_id: message.id,
      channel_id: message.channel.id,
      guild_id: message.guild.id,
      user_id: message.author.id,
      username: message.author.tag,
      content: message.content || '',
      timestamp: message.createdTimestamp,
      attachments: message.attachments.size > 0 ? JSON.stringify(Array.from(message.attachments.values()).map(a => ({
        url: a.url,
        name: a.name,
        size: a.size
      }))) : null
    };

    // Use INSERT for file-based database
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO chat_messages 
      (id, message_id, channel_id, guild_id, user_id, username, content, timestamp, attachments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      messageData.id,
      messageData.message_id,
      messageData.channel_id,
      messageData.guild_id,
      messageData.user_id,
      messageData.username,
      messageData.content,
      messageData.timestamp,
      messageData.attachments
    );
    
    return true;
  } catch (error) {
    console.error('Error storing chat message:', error);
    throw error;
  }
}

// Generate chat summary using AI
async function generateChatSummary(messages, timeRange, context) {
  const prompt = `Analyze these Discord chat messages from ${context} over ${timeRange} and create a comprehensive summary.

Messages:
${messages.map(m => `${m.username}: ${m.content}`).join('\n')}

Create a well-structured summary that includes:
1. Main topics discussed
2. Key decisions or outcomes
3. Notable participants and their contributions
4. Any action items or next steps

Keep it concise but informative, around 200-300 words.`;

  try {
    const summary = await callLLMAPI([{ role: 'user', content: prompt }], 500, SUMMARIZATION_MODEL);
    return summary;
  } catch (error) {
    console.error('Error generating chat summary:', error);
    throw new Error('Failed to generate chat summary');
  }
}

// Get recent messages from database
function getRecentMessages(db, guildId, channelId = null, hours = 24, messageLimit = null) {
  try {
    let query, params;
    
    // If messageLimit is provided, get the most recent N messages
    if (messageLimit) {
      query = 'SELECT * FROM chat_messages WHERE guild_id = ?';
      params = [guildId];
      
      if (channelId) {
        query += ' AND channel_id = ?';
        params.push(channelId);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(messageLimit);
      
      const stmt = db.prepare(query);
      const messages = stmt.all(...params);
      
      // Reverse to get chronological order
      return messages.reverse();
    } 
    // Otherwise, get messages from the last X hours
    else {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      
      query = 'SELECT * FROM chat_messages WHERE guild_id = ? AND timestamp > ?';
      params = [guildId, cutoffTime];
      
      if (channelId) {
        query += ' AND channel_id = ?';
        params.push(channelId);
      }
      
      query += ' ORDER BY timestamp ASC';
      
      const stmt = db.prepare(query);
      return stmt.all(...params);
    }
  } catch (error) {
    console.error('Error getting recent messages:', error);
    return [];
  }
}

// Get messages from the previous day only (not last 24 hours)
function getPreviousDayMessages(db, guildId, channelId = null) {
  try {
    // Calculate yesterday's date range (00:00:00 to 23:59:59)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const startOfYesterday = new Date(yesterday);
    startOfYesterday.setHours(0, 0, 0, 0);
    
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    
    const startTimestamp = startOfYesterday.getTime();
    const endTimestamp = endOfYesterday.getTime();
    
    let query = 'SELECT * FROM chat_messages WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?';
    let params = [guildId, startTimestamp, endTimestamp];
    
    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }
    
    query += ' ORDER BY timestamp ASC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
    
  } catch (error) {
    console.error('Error getting previous day messages:', error);
    return [];
  }
}

// Save chat summary to database
function saveChatSummary(db, guildId, channelId, summary, messageCount, date) {
  try {
    const summaryData = {
      id: `${guildId}_${channelId || 'server'}_${date}`,
      guild_id: guildId,
      channel_id: channelId,
      date: date,
      summary: summary,
      message_count: messageCount,
      created_at: Date.now(),
      ai_model: SUMMARIZATION_MODEL
    };

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO chat_summaries 
      (id, guild_id, channel_id, date, summary, message_count, created_at, ai_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      summaryData.id,
      summaryData.guild_id,
      summaryData.channel_id,
      summaryData.date,
      summaryData.summary,
      summaryData.message_count,
      summaryData.created_at,
      summaryData.ai_model
    );
    
    return true;
  } catch (error) {
    console.error('Error saving chat summary:', error);
    throw error;
  }
}

// Get existing summaries from database
function getExistingSummaries(db, guildId, channelId = null, days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    let query = 'SELECT * FROM chat_summaries WHERE guild_id = ? AND date >= ?';
    let params = [guildId, cutoffDateStr];
    
    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }
    
    query += ' ORDER BY date DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    console.error('Error getting existing summaries:', error);
    return [];
  }
}

module.exports = { 
  getPrereqs, 
  enhanceAnnouncement, 
  getSuggestions, 
  generateTaskStages, 
  generateFollowUpTasks,
  enhanceTaskNote,
  enhanceTaskDescription,
  checkAIStatus,
  storeChatMessage,
  generateChatSummary,
  getRecentMessages,
  getPreviousDayMessages,
  saveChatSummary,
  getExistingSummaries
};
