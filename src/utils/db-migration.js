// Database migration script to add new columns for AI-enhanced task management
require('dotenv').config();
const db = require('./db');
const logger = require('./logger');

function runMigration() {
  logger.info('Running database migration for file-based storage...');
  
  try {
    // With our file-based system, we don't need to run actual migrations
    // The table directories are automatically created by file-db.js
    
    // However, we still run the CREATE TABLE statements as a no-op
    // to maintain compatibility with the existing code structure
    
    // Define tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        deadline TEXT,
        created_at INTEGER NOT NULL,
        guild_id TEXT,
        creator_id TEXT,
        completion_percentage INTEGER DEFAULT 0
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS stages (
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        name TEXT NOT NULL,
        desc TEXT NOT NULL,
        assignee TEXT,
        done INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        completion_notes TEXT,
        due_date INTEGER,
        PRIMARY KEY(task_id, idx)
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        stage_suggestions TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        original_content TEXT,
        author_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        posted INTEGER DEFAULT 0,
        posted_channel_id TEXT
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        category TEXT NOT NULL,
        changes TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        is_patch INTEGER DEFAULT 0,
        announcement_id TEXT,
        posted INTEGER DEFAULT 0,
        posted_channel_id TEXT
      )
    `);
    
    logger.info('File-based storage setup completed successfully.');
  } catch (error) {
    logger.error('Error during file-based storage setup:', error);
    throw error;
  }
}

// Only run the migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
