// OpenRouter API Specific Test Script
// This script tests OpenRouter API integration directly

// Basic environment loader - works without dotenv package
function loadEnv() {
  const fs = require('fs');
  const path = require('path');
  
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
          let value = trimmedLine.substring(equalIndex + 1).trim();
          // Remove quotes if present
          value = value.replace(/^["'](.*)["']$/, '$1');
          process.env[key] = value;
        }
      }
      console.log('Environment variables loaded from .env file');
    } else {
      console.warn('No .env file found. Please create one with your OpenRouter API key.');
      console.log('Example .env file:');
      console.log('OPENROUTER_API_KEY=your_openrouter_api_key_here');
      console.log('MODEL_NAME=openai/gpt-3.5-turbo');
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
  }
}

// Load environment variables
loadEnv();

// Async sleep function for waiting between API calls
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Direct OpenRouter API call
async function callOpenRouter(messages, model = null) {
  const API_KEY = process.env.OPENROUTER_API_KEY;
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const MODEL = model || process.env.MODEL_NAME || 'openai/gpt-3.5-turbo';
  
  if (!API_KEY) {
    console.error('❌ ERROR: OPENROUTER_API_KEY is not set in .env file');
    return { success: false, error: 'API key not configured' };
  }
  
  console.log(`Calling OpenRouter API with model: ${MODEL}`);
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://discord-task-bot.example.com',
        'X-Title': 'Discord Task Management Bot'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        max_tokens: 100
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error (${response.status}):`, errorText);
      return { 
        success: false, 
        error: `Status ${response.status}: ${errorText}`,
        status: response.status
      };
    }
    
    const data = await response.json();
    
    // Check if we got a valid response
    if (!data.choices || data.choices.length === 0) {
      return { success: false, error: 'No choices in API response', data };
    }
    
    return {
      success: true,
      message: data.choices[0].message.content,
      model: data.model,
      data: data
    };
  } catch (error) {
    console.error('❌ Error calling OpenRouter API:', error);
    return { success: false, error: error.message };
  }
}

// Run a series of tests
async function runTests() {
  console.log('=== OpenRouter API Integration Test ===\n');
  
  // Test 1: Basic API connection
  console.log('🧪 Test 1: Basic API Connection');
  const basicTest = await callOpenRouter([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Say "OpenRouter test successful" if you can read this.' }
  ]);
  
  if (basicTest.success) {
    console.log('✅ Success! API connection works');
    console.log('Response:', basicTest.message);
    console.log('Using model:', basicTest.model);
  } else {
    console.log('❌ Failed! API connection not working');
    console.log('Error:', basicTest.error);
    console.log('Please check your API key and internet connection.');
    return;
  }
  
  console.log('\n-----------------------------------\n');
  
  // Wait before next test to avoid rate limiting
  await sleep(1000);
  
  // Test 2: Task management features
  console.log('🧪 Test 2: Task Stage Generation');
  const taskTest = await callOpenRouter([
    { role: 'system', content: 'You are a project management assistant. Create 3-5 logical stages for completing the described task. Each stage should have a clear name and detailed description.' },
    { role: 'user', content: 'Task: Website Redesign\nDescription: Update the company website with a modern look and improved functionality.\nDeadline: 2023-12-31\n\nPlease suggest logical stages for completing this task. Return a JSON array of objects with "name" and "description" properties.' }
  ]);
  
  if (taskTest.success) {
    console.log('✅ Success! Task stage generation works');
    console.log('Response:');
    console.log(taskTest.message);
    
    // Try to parse as JSON to verify format
    try {
      // Find anything that looks like a JSON array
      const match = taskTest.message.match(/\[\s*\{.*\}\s*\]/s);
      if (match) {
        const stages = JSON.parse(match[0]);
        console.log('\nParsed stages:');
        stages.forEach((stage, index) => {
          console.log(`\nStage ${index + 1}: ${stage.name}`);
          console.log(`Description: ${stage.description || 'No description'}`);
        });
      } else {
        console.log('\nCouldn\'t extract JSON array from response.');
      }
    } catch (error) {
      console.log('Could not parse response as JSON:', error.message);
    }
  } else {
    console.log('❌ Failed! Task stage generation not working');
    console.log('Error:', taskTest.error);
  }
  
  console.log('\n=== Tests Complete ===');
  
  // Summary
  if (basicTest.success) {
    console.log('\n✅ OpenRouter API integration is working correctly!');
    console.log(`Model being used: ${basicTest.model}`);
    console.log('\nYour task bot should work properly with AI integration.');
  } else {
    console.log('\n❌ OpenRouter API integration is NOT working.');
    console.log('Please check your API key and connection settings.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
