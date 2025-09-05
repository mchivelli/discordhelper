require('dotenv').config();
const API_KEY = process.env.OPENROUTER_API_KEY;
const logger = require('./logger');

// AI models configuration
const MODEL = process.env.MODEL_NAME || 'google/gemini-2.5-pro-exp-03-25';
// Prefer a strong, inexpensive summarization model by default. Can be overridden via env.
const SUMMARIZATION_MODEL = process.env.SUMMARIZATION_MODEL || 'google/gemini-1.5-flash';
const SUMMARY_MAX_MESSAGES = parseInt(process.env.SUMMARY_MAX_MESSAGES || '300', 10);
const SUMMARY_TOKEN_BUDGET = parseInt(process.env.SUMMARY_TOKEN_BUDGET || '6000', 10); // approximate input budget
const SUMMARY_CHUNK_SIZE = parseInt(process.env.SUMMARY_CHUNK_SIZE || '250', 10);
const SUMMARY_MAX_CHUNKS = parseInt(process.env.SUMMARY_MAX_CHUNKS || '8', 10);
// Allow longer per-message content so the model can capture nuance
const SUMMARY_PER_MESSAGE_CHAR_LIMIT = parseInt(process.env.SUMMARY_PER_MESSAGE_CHAR_LIMIT || '400', 10);
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Helper function to make API requests to the LLM
async function callLLMAPI(messages, maxTokens = 200, modelOverride = null, throwOnError = false) {
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
      if (throwOnError) {
        throw new Error(err || 'LLM API error');
      }
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

// Generate a compact, offline summary as a fallback when LLM is unavailable
function generateOfflineSummary(messages, timeRange, context) {
  const trimmed = Array.isArray(messages) ? messages.slice(-SUMMARY_MAX_MESSAGES) : [];
  const totalUsed = trimmed.length;

  const userCounts = new Map();
  const wordCounts = new Map();
  const stop = new Set([
    'the','and','for','you','are','with','that','this','have','from','was','but','not','your','just','they','can','all','like','get','about','what','when','why','who','how','where','then','than','has','had','did','does','don','got','its','it\'s','i\'m','i\'ll','we\'re','we\'ll','he','she','his','her','them','their','ours','mine','yours','its','it','to','of','in','on','at','as','is','be','or','an','a'
  ]);

  const sampleMessages = [];
  for (const msg of trimmed) {
    const username = (msg.username || 'user').toString();
    userCounts.set(username, (userCounts.get(username) || 0) + 1);

    const content = (msg.content || '').toString();
    if (content && content.length > 10 && sampleMessages.length < 3) {
      sampleMessages.push(`${username}: ${content}`);
    }

    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w && w.length > 2 && !stop.has(w));
    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }

  const topParticipants = Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([u, c]) => `${u} (${c})`)
    .join(', ');

  const topTopics = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
    .join(', ');

  const lines = [];
  lines.push(`Summary of ${context} • ${timeRange}`);
  if (topTopics) lines.push(`Key topics: ${topTopics}`);
  if (topParticipants) lines.push(`Participant highlights: ${topParticipants}`);
  if (sampleMessages.length) {
    lines.push('Representative messages:');
    sampleMessages.forEach(s => lines.push(`• ${s}`));
  }
  lines.push(`Messages analyzed: ${totalUsed}${messages.length > totalUsed ? ` (of ${messages.length})` : ''}`);
  return lines.join('\n');
}

// ===== Token and message compaction utilities =====
function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4); // rough heuristic
}

function sanitizeContent(text) {
  if (!text) return '';
  let t = String(text);
  // Condense whitespace but preserve Discord mentions like <@123> and <#456>
  t = t.replace(/\s+/g, ' ').trim();
  // Optionally shorten very long URLs to reduce token usage
  t = t.replace(/https?:\/\/\S{60,}/g, '🔗');
  return t;
}

function preprocessMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const cleaned = [];
  for (const m of messages) {
    const content = sanitizeContent(m.content || '');
    if (!content) continue;
    const username = (m.username || 'user').toString();
    const timestamp = typeof m.timestamp === 'number' ? m.timestamp : Date.now();
    cleaned.push({ username, content, timestamp });
  }
  // per-message char limit
  return cleaned.map(m => ({
    username: m.username,
    timestamp: m.timestamp,
    content: m.content.length > SUMMARY_PER_MESSAGE_CHAR_LIMIT
      ? m.content.slice(0, SUMMARY_PER_MESSAGE_CHAR_LIMIT) + '…'
      : m.content
  }));
}

function buildTranscript(lines, maxTokenBudget) {
  let usedTokens = 0;
  const out = [];
  let usedCount = 0;
  for (const m of lines) {
    const time = new Date(m.timestamp).toISOString().substring(11, 16); // HH:MM 24h
    const line = `[${time}] ${m.username}: ${m.content}`;
    const t = estimateTokensFromText(line) + 1;
    if (usedTokens + t > maxTokenBudget) break;
    usedTokens += t;
    out.push(line);
    usedCount++;
  }
  return { transcript: out.join('\n'), usedCount, fits: usedCount === lines.length };
}

async function summarizeChunk(transcript, chunkIndex, totalChunks, context) {
  const chunkPrompt = `You are summarizing Discord messages for ${context}.
This is chunk ${chunkIndex} of ${totalChunks}. Read the compact transcript and produce 6-10 tagged bullet points using these tags:
[Topic] main theme; [Decision] concrete outcome; [Action] follow-up with owner; [Participant] notable contribution.
Use exact usernames from the transcript when attributing; do not invent names. Be specific and avoid generic phrasing.
Transcript:\n${transcript}\n\nReturn only tagged bullets, one per line.`;
  const result = await callLLMAPI([{ role: 'user', content: chunkPrompt }], 280, SUMMARIZATION_MODEL, true);
  return typeof result === 'string' ? result : '';
}

// Generate chat summary using AI, with hierarchical fallback and input trimming
async function generateChatSummary(messages, timeRange, context, previousSummary = null) {
  try {
    // If no messages, return offline
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const offline = generateOfflineSummary([], timeRange, context);
      return { summary: offline, modelUsed: 'offline', messagesUsed: 0 };
    }

    // If API key absent, offline immediately
    if (!API_KEY) {
      const offline = generateOfflineSummary(messages, timeRange, context);
      return { summary: offline, modelUsed: 'offline', messagesUsed: Math.min(messages.length, SUMMARY_MAX_MESSAGES) };
    }

    // Preprocess and compact to allow more messages efficiently
    const preprocessed = preprocessMessages(messages);

    // Compute participant stats and top keywords for richer prompts
    const userCounts = new Map();
    const wordCounts = new Map();
    const stop = new Set([
      'the','and','for','you','are','with','that','this','have','from','was','but','not','your','just','they','can','all','like','get','about','what','when','why','who','how','where','then','than','has','had','did','does','don','got','its','it\'s','i\'m','i\'ll','we\'re','we\'ll','he','she','his','her','them','their','ours','mine','yours','its','it','to','of','in','on','at','as','is','be','or','an','a'
    ]);
    for (const m of messages) {
      const username = (m.username || 'user').toString();
      userCounts.set(username, (userCounts.get(username) || 0) + 1);
      const words = String(m.content || '')
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w && w.length > 2 && !stop.has(w));
      for (const w of words) {
        wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
      }
    }
    const topParticipants = Array.from(userCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([u, c]) => `${u} (${c})`)
      .join(', ');
    const topTopics = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w)
      .join(', ');

    // Primary attempt: single-pass within budget
    const overheadTokens = 600; // instructions + headers approx
    const budget = Math.max(1000, SUMMARY_TOKEN_BUDGET - overheadTokens);
    const { transcript, usedCount, fits } = buildTranscript(preprocessed, budget);

    let basePrompt = `You are a precise meeting summarizer for Discord chats.
Analyze the following messages from ${context} over ${timeRange} and write an accurate, concise summary that reflects what actually happened.

Context metadata:
- Participants by message count: ${topParticipants || 'n/a'}
- Notable keywords: ${topTopics || 'n/a'}${previousSummary ? `
- Previous day context provided below` : ''}

Instructions:
- Attribute statements and actions to the exact usernames seen in the transcript. Do not invent names.
- Prefer concrete points over generic language. Capture disagreements, decisions, and follow-ups.
- Keep chronology clear. If actions were proposed vs. decided, make that distinction explicit.
- Keep it ~200-300 words.`;
    if (previousSummary) {
      basePrompt += `\n\nPrevious Day's Summary (context):\n${previousSummary}\n\nPay attention to continuations, follow-ups, and evolving topics.`;
    }
    const fullPrompt = `${basePrompt}\n\nTranscript (each line is [HH:MM] username: message):\n${transcript}\n\nFormat the output with clear sections:
• Overview (2-3 sentences)
• Key Topics (bullets)
• Decisions & Outcomes (bullets)
• Action Items (bullets with explicit owners, e.g., [alice] do X)
• Participant Highlights (who contributed and how)
Avoid generic filler; be specific to this conversation.`;

    if (fits) {
      const result = await callLLMAPI([{ role: 'user', content: fullPrompt }], 500, SUMMARIZATION_MODEL, true);
      const text = (result && typeof result === 'string') ? result : '';
      if (!text) throw new Error('Empty AI response');
      return { summary: text, modelUsed: SUMMARIZATION_MODEL, messagesUsed: usedCount };
    }

    // Hierarchical approach: chunk -> summarize -> synthesize
    const maxMessages = SUMMARY_CHUNK_SIZE * SUMMARY_MAX_CHUNKS;
    const windowed = preprocessed.length > maxMessages
      ? preprocessed.slice(-maxMessages)
      : preprocessed;
    const chunks = [];
    for (let i = 0; i < windowed.length; i += SUMMARY_CHUNK_SIZE) {
      chunks.push(windowed.slice(i, i + SUMMARY_CHUNK_SIZE));
    }

    const chunkBudget = Math.floor(SUMMARY_TOKEN_BUDGET * 0.7);
    const chunkSummaries = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const lines = chunks[idx];
      const { transcript: chunkTranscript } = buildTranscript(lines, chunkBudget);
      try {
        const s = await summarizeChunk(chunkTranscript, idx + 1, chunks.length, context);
        chunkSummaries.push(`Chunk ${idx + 1}/${chunks.length}:\n${s}`);
      } catch (e) {
        // If a chunk fails, generate a minimal offline bullet list as backup for that chunk
        const offline = generateOfflineSummary(lines, `Chunk ${idx + 1}`, context);
        chunkSummaries.push(`Chunk ${idx + 1}/${chunks.length} (offline):\n${offline}`);
      }
    }

    const synthesisPrompt = `You are synthesizing a final daily summary from partial chunk summaries for ${context} over ${timeRange}. Eliminate duplicates, unify themes, resolve contradictions, and attribute actions/decisions to people using the exact usernames from the text.
\nChunk summaries:\n${chunkSummaries.join('\n\n')}\n\nProduce a single, well-structured summary with sections:
• Overview (2-3 sentences)
• Key Topics (bullets)
• Decisions & Outcomes (bullets)
• Action Items (bullets with explicit owners)
• Participant Highlights (who contributed and how)
Keep it ~200-300 words, concise, specific, and easy to scan.`;
    const finalResult = await callLLMAPI([{ role: 'user', content: synthesisPrompt }], 520, SUMMARIZATION_MODEL, true);
    const finalText = (finalResult && typeof finalResult === 'string') ? finalResult : '';
    if (!finalText) throw new Error('Empty synthesis result');
    return { summary: finalText, modelUsed: SUMMARIZATION_MODEL, messagesUsed: windowed.length };
  } catch (error) {
    console.error('Error generating chat summary:', error);
    const offline = generateOfflineSummary(messages || [], timeRange, context);
    const used = Array.isArray(messages) ? Math.min(messages.length, SUMMARY_MAX_MESSAGES) : 0;
    return { summary: offline, modelUsed: 'offline', messagesUsed: used };
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

// Get messages from specified source channels for the last X hours
async function getMessagesFromSourceChannels(db, guild, hours = 24) {
  try {
    const sourceChannelIds = process.env.DAILY_SUMMARY_SOURCE_CHANNELS 
      ? process.env.DAILY_SUMMARY_SOURCE_CHANNELS.split(',').map(id => id.trim())
      : null;

    // If no specific channels configured, get from all channels (current behavior)
    if (!sourceChannelIds || sourceChannelIds.length === 0) {
      logger.info(`No specific source channels configured for ${guild.name}, using all channels`);
      return getRecentMessages(db, guild.id, null, hours);
    }

    // Validate that the configured channels exist in the guild
    const validChannelIds = [];
    for (const channelId of sourceChannelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        validChannelIds.push(channelId);
        logger.info(`Including messages from #${channel.name} for daily summary`);
      } else {
        logger.warn(`Configured source channel ${channelId} not found in ${guild.name}`);
      }
    }

    if (validChannelIds.length === 0) {
      logger.warn(`No valid source channels found for ${guild.name}, falling back to all channels`);
      return getRecentMessages(db, guild.id, null, hours);
    }

    // Get messages from all valid source channels
    let allMessages = [];
    for (const channelId of validChannelIds) {
      const channelMessages = getRecentMessages(db, guild.id, channelId, hours);
      if (channelMessages && channelMessages.length > 0) {
        allMessages = allMessages.concat(channelMessages);
      }
    }

    // Sort all messages by timestamp to maintain chronological order
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    logger.info(`Retrieved ${allMessages.length} messages from ${validChannelIds.length} source channels for ${guild.name}`);
    return allMessages;

  } catch (error) {
    logger.error('Error getting messages from source channels:', error);
    // Fallback to all channels
    return getRecentMessages(db, guild.id, null, hours);
  }
}

// Get the previous day's summary for context
async function getPreviousDaySummary(db, guildId) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const stmt = db.prepare(`
      SELECT summary FROM chat_summaries 
      WHERE guild_id = ? AND channel_id IS NULL AND date = ?
      ORDER BY created_at DESC LIMIT 1
    `);
    
    const result = stmt.get(guildId, yesterdayStr);
    
    if (result) {
      logger.info(`Found previous day summary for guild ${guildId}`);
      return result.summary;
    } else {
      logger.info(`No previous day summary found for guild ${guildId}`);
      return null;
    }
  } catch (error) {
    logger.error('Error getting previous day summary:', error);
    return null;
  }
}

// Save chat summary to database
function saveChatSummary(db, guildId, channelId, summary, messageCount, date, aiModel = SUMMARIZATION_MODEL) {
  try {
    const summaryData = {
      id: `${guildId}_${channelId || 'server'}_${date}`,
      guild_id: guildId,
      channel_id: channelId,
      date: date,
      summary: summary,
      message_count: messageCount,
      created_at: Date.now(),
      ai_model: aiModel
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

// ... (new functions added below)

/**
 * Get channel messages for analysis - tries database first, then fetches from Discord
 * @param {string} guildId - Guild ID
 * @param {string|null} channelId - Channel ID (null for server-wide)
 * @param {number} startTime - Start timestamp
 * @param {Object} discordChannel - Discord channel object for fallback fetching
 * @returns {Promise<Array>} Messages array
 */
async function getChannelMessages(guildId, channelId, startTime, discordChannel = null) {
  try {
    const db = require('./db');
    let messages;
    
    if (channelId) {
      // Get messages from specific channel
      messages = db.prepare(`
        SELECT * FROM chat_messages 
        WHERE guild_id = ? AND channel_id = ? AND timestamp >= ?
        ORDER BY timestamp ASC
      `).all(guildId, channelId, startTime);
    } else {
      // Get messages from all channels in guild
      messages = db.prepare(`
        SELECT * FROM chat_messages 
        WHERE guild_id = ? AND timestamp >= ?
        ORDER BY timestamp ASC
      `).all(guildId, startTime);
    }
    
    console.log(`[AI] Database query returned ${messages ? messages.length : 'null'} messages`);
    
    // If no messages in database and we have a Discord channel, fetch from Discord
    if ((!messages || messages.length === 0) && discordChannel && channelId) {
      console.log(`[AI] No stored messages found, attempting Discord fallback for channel ${channelId} (${discordChannel.name})`);
      try {
        messages = await fetchMessagesFromDiscord(discordChannel, startTime, db);
        console.log(`[AI] Discord fallback returned ${messages.length} messages`);
      } catch (error) {
        console.error(`[AI] Discord fallback failed: ${error.message}`);
        messages = [];
      }
    } else if (!discordChannel && channelId) {
      console.warn(`[AI] No Discord channel object provided for fallback fetching (channelId: ${channelId})`);
    } else if (messages && messages.length > 0) {
      console.log(`[AI] Using ${messages.length} messages from database`);
    }
    
    return messages || [];
  } catch (error) {
    logger.error('Error fetching channel messages:', error);
    return [];
  }
}

/**
 * Fetch messages directly from Discord and store them
 * @param {Object} channel - Discord channel object
 * @param {number} startTime - Start timestamp
 * @param {Object} db - Database instance
 * @returns {Promise<Array>} Messages array
 */
async function fetchMessagesFromDiscord(channel, startTime, db) {
  try {
    const messages = [];
    const startDate = new Date(startTime);
    
    console.log(`[DISCORD-FETCH] Fetching messages from Discord channel ${channel.name} (${channel.id}) since ${startDate.toISOString()}`);
    
    // Check if bot has permission to read message history
    const permissions = channel.permissionsFor(channel.guild.members.me);
    console.log(`[DISCORD-FETCH] Checking permissions for channel ${channel.name}`);
    
    if (!permissions) {
      throw new Error(`Cannot get permissions for channel #${channel.name}`);
    }
    
    if (!permissions.has('ReadMessageHistory')) {
      throw new Error(`Bot missing 'Read Message History' permission in #${channel.name}`);
    }
    
    console.log(`[DISCORD-FETCH] Bot has required permissions in #${channel.name}, fetching messages...`);
    
    // Fetch messages in batches
    let lastId = null;
    let fetchedCount = 0;
    const maxMessages = 500; // Reasonable limit
    
    while (fetchedCount < maxMessages) {
      const fetchOptions = {
        limit: 100,
      };
      
      if (lastId) {
        fetchOptions.before = lastId;
      }
      
      const batch = await channel.messages.fetch(fetchOptions);
      if (batch.size === 0) break;
      
      let foundOldMessage = false;
      
      for (const [, message] of batch) {
        if (message.createdTimestamp < startTime) {
          foundOldMessage = true;
          break;
        }
        
        // Store message in database for future use
        storeChatMessage(db, message);
        
        // Add to our results
        messages.push({
          id: `${message.guild.id}_${message.channel.id}_${message.id}`,
          guild_id: message.guild.id,
          channel_id: message.channel.id,
          message_id: message.id,
          username: message.author.username,
          content: message.content,
          timestamp: message.createdTimestamp,
          created_at: Date.now()
        });
        
        fetchedCount++;
        lastId = message.id;
      }
      
      if (foundOldMessage || batch.size < 100) break;
    }
    
    // Sort by timestamp ascending
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
    logger.info(`Fetched ${messages.length} messages from Discord channel ${channel.name}`);
    return messages;
    
  } catch (error) {
    logger.error('Error fetching messages from Discord:', error);
    return [];
  }
}

/**
 * Analyze channel messages with developer-focused insights
 * @param {Array} messages - Array of messages to analyze
 * @param {Object} context - Additional context for analysis
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeChannelMessages(messages, context = {}) {
  try {
    if (!messages || messages.length === 0) {
      return { error: 'No messages to analyze' };
    }

    // Build transcript for analysis
    const transcript = buildTranscript(messages);
    
    // Create detailed developer-focused prompt
    const analysisPrompt = `You are an expert technical analyst and development consultant. Analyze the following chat discussion and provide actionable, developer-focused insights.

Context:
- Scope: ${context.scope || 'Channel'}
- Period: Last ${context.days || 7} days
- Message Count: ${messages.length}
- Guild: ${context.guildName || 'Unknown'}
- Channel: ${context.channelName || 'Unknown'}

Chat Transcript:
${transcript}

Provide a comprehensive analysis in the following JSON format:
{
  "summary": "2-3 sentence executive summary of the discussion",
  "keyTopics": ["array of 3-5 main topics discussed"],
  "decisions": ["array of key decisions or consensus reached"],
  "actionItems": [
    {
      "task": "specific development task",
      "priority": "High/Medium/Low",
      "reason": "why this is important"
    }
  ],
  "technicalInsights": {
    "technologies": ["technologies, frameworks, or tools mentioned"],
    "patterns": ["design patterns or architectural decisions discussed"],
    "suggestions": ["technical recommendations for implementation"]
  },
  "productivityInsights": {
    "blockers": ["identified obstacles or challenges"],
    "improvements": ["process or workflow improvements suggested"],
    "nextSteps": ["immediate next steps for the team"]
  },
  "participantHighlights": {
    "username": "their key contribution or expertise area"
  }
}

Focus on:
1. Technical decisions and their implications
2. Implementation details and code architecture
3. Problems that need solving with concrete solutions
4. Action items that developers can immediately work on
5. Best practices and patterns that should be followed
6. Dependencies, integrations, and technical requirements
7. Performance, security, or scalability concerns
8. Testing strategies and quality assurance needs

${context.detailed ? 'Include detailed technical analysis with specific implementation recommendations and potential code patterns.' : 'Provide concise, actionable insights.'}

Return ONLY valid JSON, no additional text or markdown.`;

    // Call LLM for analysis using dedicated analysis model
    const analysisModel = process.env.ANALYSIS_MODEL || process.env.SUMMARIZATION_MODEL || process.env.MODEL_NAME;
    const response = await callLLMAPI(analysisPrompt, 'json_object', analysisModel);
    
    if (!response || response.error) {
      logger.warn('AI analysis failed, generating fallback analysis');
      return generateFallbackAnalysis(messages, context);
    }

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(response);
    } catch (parseError) {
      logger.error('Failed to parse AI analysis response:', parseError);
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0]);
        } catch {
          return generateFallbackAnalysis(messages, context);
        }
      } else {
        return generateFallbackAnalysis(messages, context);
      }
    }

    // Validate and enhance the analysis
    analysis = validateAndEnhanceAnalysis(analysis, messages, context);
    
    return analysis;
  } catch (error) {
    logger.error('Error in analyzeChannelMessages:', error);
    return generateFallbackAnalysis(messages, context);
  }
}

/**
 * Generate fallback analysis when AI is unavailable
 * @param {Array} messages - Messages array
 * @param {Object} context - Analysis context
 * @returns {Object} Fallback analysis
 */
function generateFallbackAnalysis(messages, context) {
  // Group messages by user
  const userMessages = {};
  const topics = new Set();
  const mentions = new Set();
  
  messages.forEach(msg => {
    if (!userMessages[msg.username]) {
      userMessages[msg.username] = 0;
    }
    userMessages[msg.username]++;
    
    // Extract potential topics (words longer than 4 chars)
    const words = msg.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 4 && !word.startsWith('http')) {
        topics.add(word);
      }
    });
    
    // Extract mentions
    const mentionMatches = msg.content.match(/@\w+/g);
    if (mentionMatches) {
      mentionMatches.forEach(mention => mentions.add(mention));
    }
  });
  
  // Get top contributors
  const topContributors = Object.entries(userMessages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [user, count]) => {
      acc[user] = `${count} messages`;
      return acc;
    }, {});
  
  return {
    summary: `Analysis of ${messages.length} messages from ${context.scope || 'the channel'} over the last ${context.days || 7} days. This is a fallback analysis - AI service is currently unavailable.`,
    keyTopics: Array.from(topics).slice(0, 5),
    decisions: ['Unable to extract decisions - manual review recommended'],
    actionItems: [
      {
        task: 'Review chat transcript manually for action items',
        priority: 'High',
        reason: 'Automated analysis unavailable'
      }
    ],
    technicalInsights: {
      technologies: ['Unable to extract - manual review needed'],
      patterns: [],
      suggestions: ['Enable AI service for detailed technical analysis']
    },
    productivityInsights: {
      blockers: ['AI analysis service unavailable'],
      improvements: ['Restore AI service connection'],
      nextSteps: ['Manual review of discussion required']
    },
    participantHighlights: topContributors
  };
}

/**
 * Validate and enhance analysis results
 * @param {Object} analysis - Raw analysis from AI
 * @param {Array} messages - Original messages
 * @param {Object} context - Analysis context
 * @returns {Object} Validated analysis
 */
function validateAndEnhanceAnalysis(analysis, messages, context) {
  // Ensure all required fields exist
  const validatedAnalysis = {
    summary: analysis.summary || `Analysis of ${messages.length} messages from ${context.scope}`,
    keyTopics: Array.isArray(analysis.keyTopics) ? analysis.keyTopics : [],
    decisions: Array.isArray(analysis.decisions) ? analysis.decisions : [],
    actionItems: Array.isArray(analysis.actionItems) ? analysis.actionItems : [],
    technicalInsights: analysis.technicalInsights || {},
    productivityInsights: analysis.productivityInsights || {},
    participantHighlights: analysis.participantHighlights || {}
  };
  
  // Ensure technicalInsights has proper structure
  if (!validatedAnalysis.technicalInsights.technologies) {
    validatedAnalysis.technicalInsights.technologies = [];
  }
  if (!validatedAnalysis.technicalInsights.patterns) {
    validatedAnalysis.technicalInsights.patterns = [];
  }
  if (!validatedAnalysis.technicalInsights.suggestions) {
    validatedAnalysis.technicalInsights.suggestions = [];
  }
  
  // Ensure productivityInsights has proper structure
  if (!validatedAnalysis.productivityInsights.blockers) {
    validatedAnalysis.productivityInsights.blockers = [];
  }
  if (!validatedAnalysis.productivityInsights.improvements) {
    validatedAnalysis.productivityInsights.improvements = [];
  }
  if (!validatedAnalysis.productivityInsights.nextSteps) {
    validatedAnalysis.productivityInsights.nextSteps = [];
  }
  
  // Ensure action items have proper structure
  validatedAnalysis.actionItems = validatedAnalysis.actionItems.map(item => {
    if (typeof item === 'string') {
      return {
        task: item,
        priority: 'Medium',
        reason: 'Identified from discussion'
      };
    }
    return {
      task: item.task || 'Review required',
      priority: item.priority || 'Medium',
      reason: item.reason || 'Identified from discussion'
    };
  });
  
  return validatedAnalysis;
}

// Export all functions
module.exports = {
    callLLMAPI,
    getPrereqs,
    enhanceAnnouncement,
    getSuggestions,
    generateTaskStages,
    enhanceTaskNote,
    enhanceTaskDescription,
    generateFollowUpTasks,
    checkAIStatus,
    storeChatMessage,
    generateOfflineSummary,
    generateChatSummary,
    getRecentMessages,
    getPreviousDayMessages,
    getChannelMessages,
    fetchMessagesFromDiscord,
    analyzeChannelMessages
};
