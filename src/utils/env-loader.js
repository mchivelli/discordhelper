/**
 * Simple environment variable loader with fallback to handle missing dotenv
 */
function loadEnv() {
  try {
    // Try to load dotenv if available
    require('dotenv').config();
  } catch (error) {
    console.warn('dotenv package not found, using basic environment variable loading');
    
    // Basic .env file parser as fallback
    const fs = require('fs');
    const path = require('path');
    
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
          const trimmedLine = line.trim();
          // Skip comments and empty lines
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            const value = trimmedLine.substring(equalIndex + 1).trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
            process.env[key] = cleanValue;
          }
        }
        console.log('Environment variables loaded from .env file');
      } else {
        console.warn('.env file not found');
      }
    } catch (fsError) {
      console.warn('Error loading .env file:', fsError.message);
    }
  }
}

module.exports = { loadEnv };
