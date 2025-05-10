// Basic AI functionality tester
// This script tests if the AI API is working without any dependencies on Discord.js

// Load environment variables
const fs = require('fs');
const path = require('path');

// Simple environment variable loader (no dependencies)
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n');
      
      for (const line of envLines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          const value = trimmedLine.substring(equalIndex + 1).trim();
          process.env[key] = value.replace(/^["'](.*)["']$/, '$1'); // Remove quotes
        }
      }
      console.log('Environment variables loaded from .env file');
    } else {
      console.warn('.env file not found');
    }
  } catch (error) {
    console.warn('Error loading .env file:', error.message);
  }
}

loadEnv();

// Direct implementation of the API call to test without dependencies
async function callLLMAPI(messages, maxTokens = 200) {
  const API_KEY = process.env.OPENROUTER_API_KEY;
  const MODEL_NAME = process.env.MODEL_NAME || 'openai/gpt-3.5-turbo';
  
  if (!API_KEY) {
    return { success: false, message: "AI services not configured: API key missing." };
  }
  
  try {
    console.log(`Making API call to ${MODEL_NAME} with ${messages.length} messages...`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://discord-task-bot.example.com',
        'X-Title': 'Discord Task Bot'
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: messages,
        max_tokens: maxTokens
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`API Error (${response.status}):`, errorData);
      return { 
        success: false, 
        message: `API Error: ${response.status} - ${errorData}` 
      };
    }
    
    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      return { 
        success: false, 
        message: "API returned no choices." 
      };
    }
    
    return { 
      success: true, 
      message: data.choices[0].message.content,
      modelName: data.model
    };
  } catch (error) {
    console.error('Error calling LLM API:', error);
    return { 
      success: false, 
      message: `Error: ${error.message}` 
    };
  }
}

// Functions to test

// Generate task stages based on task name and description
async function generateTaskStages(taskName, taskDescription, deadline) {
  const systemMessage = "You are a professional project manager helping to break down tasks into logical stages. Return exactly 3-5 clear, actionable stages for the given task. Format as a JSON array of objects, each with 'name' (short stage name) and 'description' (detailed instructions) properties. No commentary.";
  
  const userMessage = `Task: ${taskName}\nDescription: ${taskDescription}${deadline ? `\nDeadline: ${deadline}` : ''}`;
  
  const response = await callLLMAPI([
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage }
  ], 400);
  
  if (!response.success) {
    console.log("AI failed to generate stages, using fallback...");
    return [
      { name: "Planning", description: "Define requirements and outline the approach" },
      { name: "Execution", description: "Complete the core tasks identified in planning" },
      { name: "Review", description: "Verify the work and make any necessary adjustments" }
    ];
  }
  
  try {
    // Try to parse the response as JSON
    let cleanedJson = response.message.trim();
    
    // If the response is wrapped in backticks, remove them
    if (cleanedJson.startsWith("```json")) {
      cleanedJson = cleanedJson.substring(7, cleanedJson.length - 3).trim();
    } else if (cleanedJson.startsWith("```")) {
      cleanedJson = cleanedJson.substring(3, cleanedJson.length - 3).trim();
    }
    
    const stages = JSON.parse(cleanedJson);
    
    if (!Array.isArray(stages)) {
      throw new Error("Response is not an array");
    }
    
    // Validate and ensure each stage has the required properties
    return stages.map(stage => ({
      name: stage.name || "Unnamed Stage",
      description: stage.description || "No description provided"
    }));
  } catch (error) {
    console.error("Error parsing AI response:", error);
    console.log("Raw response:", response.message);
    
    // Return fallback stages on error
    return [
      { name: "Planning", description: "Define requirements and outline the approach" },
      { name: "Execution", description: "Complete the core tasks identified in planning" },
      { name: "Review", description: "Verify the work and make any necessary adjustments" }
    ];
  }
}

// Enhance a task description using AI
async function enhanceTaskDescription(taskName, originalDescription) {
  const systemMessage = "You are a professional project manager helping to improve task descriptions. Enhance the given task description to be more detailed and actionable. Keep the core meaning but add clarity and structure. Be concise but thorough.";
  
  const userMessage = `Task Name: ${taskName}\nOriginal Description: ${originalDescription}\n\nPlease enhance this description to be more detailed and actionable.`;
  
  const response = await callLLMAPI([
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage }
  ], 300);
  
  if (!response.success) {
    console.log("AI failed to enhance description, returning original...");
    return originalDescription;
  }
  
  return response.message.trim();
}

// Check AI API status
async function checkAIStatus() {
  const response = await callLLMAPI([
    { role: "system", content: "You are a test system. Respond with 'OK' if you receive this message." },
    { role: "user", content: "Test connection." }
  ], 50);
  
  return {
    success: response.success,
    message: response.success ? 
      `AI services are operational. Using model: ${response.modelName || 'unknown'}` : 
      `AI services not properly configured: ${response.message}`,
    modelName: response.modelName
  };
}

// Main test function
async function runTests() {
  console.log('\n===== Discord Task Bot AI Tester =====\n');
  
  // Test 1: Check AI status
  console.log('Test 1: Checking AI Status...');
  const statusResult = await checkAIStatus();
  console.log(`Status: ${statusResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Message: ${statusResult.message}`);
  console.log('==================================\n');
  
  if (!statusResult.success) {
    console.log('AI services are not properly configured. Make sure your .env file contains:');
    console.log('- OPENROUTER_API_KEY=your_api_key');
    console.log('- MODEL_NAME=your_preferred_model (optional)\n');
    console.log('Stopping tests.');
    return;
  }
  
  // Test 2: Task description enhancement
  console.log('Test 2: Task Description Enhancement...');
  const taskName = "Website Redesign";
  const originalDesc = "Update the company website";
  
  console.log(`Original: "${originalDesc}"`);
  const enhancedDesc = await enhanceTaskDescription(taskName, originalDesc);
  console.log(`Enhanced: "${enhancedDesc}"`);
  console.log(`Result: ${enhancedDesc !== originalDesc ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('==================================\n');
  
  // Test 3: Task stage generation
  console.log('Test 3: Task Stage Generation...');
  const stages = await generateTaskStages(taskName, enhancedDesc, "2023-12-31");
  console.log(`Generated ${stages.length} stages:`);
  stages.forEach((stage, index) => {
    console.log(`\nStage ${index + 1}: ${stage.name}`);
    console.log(`Description: ${stage.description}`);
  });
  console.log(`Result: ${stages.length >= 3 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('==================================\n');
  
  console.log('All tests completed.\n');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
