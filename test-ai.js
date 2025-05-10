// Test script for AI integration
require('dotenv').config();
const { checkAIStatus, generateTaskStages } = require('./src/utils/ai');

async function testAI() {
  console.log('\n--- TESTING AI INTEGRATION ---\n');
  
  // Test 1: Check AI status
  console.log('Test 1: Checking AI Status...');
  const statusResult = await checkAIStatus();
  console.log(`Status: ${statusResult.success ? '✅ Working' : '❌ Not working'}`);
  console.log(`Message: ${statusResult.message}`);
  console.log('\n-------------------\n');
  
  // Test 2: Generate task stages
  console.log('Test 2: Testing Task Stage Generation...');
  try {
    const sampleTask = {
      name: 'Create Discord Server Welcome Bot',
      description: 'Develop a bot that welcomes new members and provides server information automatically.'
    };
    
    console.log(`Task: ${sampleTask.name}`);
    console.log(`Description: ${sampleTask.description}`);
    console.log('\nGenerating AI suggestions...\n');
    
    const stages = await generateTaskStages(sampleTask.name, sampleTask.description);
    
    console.log('Results:');
    stages.forEach((stage, index) => {
      console.log(`\n${index + 1}. ${stage.name}`);
      console.log(`   ${stage.description}`);
    });
  } catch (error) {
    console.error('Error generating stages:', error.message);
  }
  
  console.log('\n--- TEST COMPLETE ---');
}

// Run tests
testAI();
