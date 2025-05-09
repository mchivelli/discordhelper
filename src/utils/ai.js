require('dotenv').config();
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL_NAME;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Helper function to make API requests to the LLM
async function callLLMAPI(messages, maxTokens = 200) {
  // Fallback response if API call fails or is not configured
  const fallbackResponses = {
    'getPrereqs': 'Make sure all previous stages are complete. Gather any necessary materials and information.',
    'enhanceAnnouncement': messages[1]?.content?.replace('Please enhance this announcement: ', '') || 'Announcement content unavailable.',
    'getSuggestions': [],
    'generateTaskStages': [
      { name: 'Planning', description: 'Define the scope and requirements for this task.' },
      { name: 'Implementation', description: 'Execute the core work needed to complete the task.' },
      { name: 'Testing', description: 'Verify functionality and quality before finalizing.' },
      { name: 'Deployment', description: 'Release or implement the final product.' }
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
        model: MODEL || 'openai/gpt-3.5-turbo',
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
 * @returns {Promise<Array>} - Array of suggested stage objects
 */
async function generateTaskStages(taskName, description, deadline = '') {
  const messages = [
    {
      role: 'system',
      content: 'You are a project management assistant. Create 3-5 logical stages for completing the described task. Each stage should have a clear name and detailed description.'
    },
    {
      role: 'user',
      content: `Task: ${taskName}\nDescription: ${description}${deadline ? `\nDeadline: ${deadline}` : ''}\n\nPlease suggest logical stages for completing this task. Return a JSON array of objects with "name" and "description" properties.`
    }
  ];
  
  const result = await callLLMAPI(messages, 500);
  
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
    console.error('Failed to parse AI stage suggestions:', error);
    // Return default stages if parsing fails
    return [
      { name: 'Planning', description: 'Define the scope and requirements' },
      { name: 'Implementation', description: 'Execute the core work' },
      { name: 'Testing', description: 'Verify functionality and quality' },
      { name: 'Deployment', description: 'Release to production' }
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
      content: 'You are a professional documentation assistant. Your task is to improve the provided completion notes to make them clearer, more structured, and professional while preserving all key information.'
    },
    {
      role: 'user',
      content: `Stage: ${stageName}\nCompletion Notes: ${notes}\n\nPlease enhance these completion notes to be more professional and informative.`
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
      content: 'You are a professional project management assistant. Your task is to improve the provided task description to make it clearer, more actionable, and properly structured.'
    },
    {
      role: 'user',
      content: `Task Name: ${taskName}\nOriginal Description: ${description}\n\nPlease enhance this task description to be more professional, specific and well-structured.`
    }
  ];
  
  return callLLMAPI(messages, 400);
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

module.exports = { 
  getPrereqs, 
  enhanceAnnouncement, 
  getSuggestions, 
  generateTaskStages, 
  enhanceTaskNote,
  enhanceTaskDescription,
  checkAIStatus 
};
