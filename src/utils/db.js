// Database layer using file-based JSON storage to avoid native module issues
// This replaces better-sqlite3 with a file-based solution that works across all Node.js versions
const fs = require('fs-extra');
const path = require('path');

// Import our file-based database implementation
const db = require('./file-db');

// Execute these statements as a no-op to maintain compatibility
// with existing code expecting these tables to be set up
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  deadline TEXT,
  completion_percentage INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  guild_id TEXT,
  creator_id TEXT
);
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
  PRIMARY KEY(task_id, idx),
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS task_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  stage_suggestions TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  original_content TEXT,
  author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  posted INTEGER DEFAULT 0,
  posted_channel_id TEXT
);

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
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  attachments TEXT
);

CREATE TABLE IF NOT EXISTS chat_summaries (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  date TEXT NOT NULL,
  summary TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ai_model TEXT DEFAULT 'claude-3.5-haiku'
);
`);
// Export our file-based database implementation
module.exports = db;
