// Database migration script to add new columns for AI-enhanced task management
require('dotenv').config();
const db = require('./db');
const logger = require('./logger');

function runMigration() {
  logger.info('Running database migration for AI-enhanced task management...');
  
  try {
    // Check if the tasks table exists
    const tasksTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    if (!tasksTable) {
      logger.info('Creating tasks table...');
      db.prepare(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          deadline TEXT,
          created_at INTEGER NOT NULL,
          guild_id TEXT,
          creator_id TEXT,
          completion_percentage INTEGER DEFAULT 0
        )
      `).run();
    } else {
      // Check if columns need to be added to tasks table
      const tasksColumns = db.prepare('PRAGMA table_info(tasks)').all().map(col => col.name);
      
      if (!tasksColumns.includes('description')) {
        logger.info('Adding description column to tasks table...');
        db.prepare('ALTER TABLE tasks ADD COLUMN description TEXT').run();
      }
      
      if (!tasksColumns.includes('deadline')) {
        logger.info('Adding deadline column to tasks table...');
        db.prepare('ALTER TABLE tasks ADD COLUMN deadline TEXT').run();
      }
      
      if (!tasksColumns.includes('completion_percentage')) {
        logger.info('Adding completion_percentage column to tasks table...');
        db.prepare('ALTER TABLE tasks ADD COLUMN completion_percentage INTEGER DEFAULT 0').run();
      }
    }
    
    // Check if the stages table exists
    const stagesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stages'").get();
    if (!stagesTable) {
      logger.info('Creating stages table...');
      db.prepare(`
        CREATE TABLE stages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          name TEXT NOT NULL,
          desc TEXT,
          assignee TEXT,
          done INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          completion_notes TEXT,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `).run();
    } else {
      // Check if columns need to be added to stages table
      const stagesColumns = db.prepare('PRAGMA table_info(stages)').all().map(col => col.name);
      
      if (!stagesColumns.includes('completed_at')) {
        logger.info('Adding completed_at column to stages table...');
        db.prepare('ALTER TABLE stages ADD COLUMN completed_at INTEGER').run();
      }
      
      if (!stagesColumns.includes('completion_notes')) {
        logger.info('Adding completion_notes column to stages table...');
        db.prepare('ALTER TABLE stages ADD COLUMN completion_notes TEXT').run();
      }
    }
    
    // Create or update task_suggestions table for storing AI-generated suggestions
    const suggestionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_suggestions'").get();
    if (!suggestionsTable) {
      logger.info('Creating task_suggestions table...');
      db.prepare(`
        CREATE TABLE task_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          stage_suggestions TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `).run();
    }
    
    logger.info('Database migration completed successfully.');
  } catch (error) {
    logger.error('Error during database migration:', error);
    throw error;
  }
}

// Only run the migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
