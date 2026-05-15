// Database layer using better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'bot.db');

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create/open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create all tables (existing + new)
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

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  severity TEXT,
  reporter_id TEXT,
  assignee_id TEXT,
  guild_id TEXT,
  channel_id TEXT,
  thread_id TEXT,
  message_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS admin_tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  creator_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  guild_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_task_assignees (
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY(task_id, user_id),
  FOREIGN KEY(task_id) REFERENCES admin_tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS simple_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee_ids TEXT DEFAULT '[]',
  creator_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  message_id TEXT,
  channel_id TEXT
);

CREATE TABLE IF NOT EXISTS changelog_versions (
  version TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  is_current INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  completion_report TEXT
);

CREATE TABLE IF NOT EXISTS changelog_entries (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  entry_text TEXT NOT NULL,
  task_id TEXT,
  author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(version) REFERENCES changelog_versions(version) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES admin_tasks(task_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_task_thread_messages (
  message_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_tag TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  attachments TEXT,
  FOREIGN KEY(task_id) REFERENCES admin_tasks(task_id) ON DELETE CASCADE
);

-- NEW TABLES for vector/mod features
-- Note: the next commit (file-db refactor) will rewrite this file to use the
-- JSON-file shim, where all PKs are TEXT and embeddings live in
-- data/embeddings/<id>.bin. The CREATE TABLE strings below become docstrings.

CREATE TABLE IF NOT EXISTS message_chunks (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  combined_text TEXT NOT NULL,
  embedding BLOB,
  message_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  last_message_id TEXT,
  last_sync_ts INTEGER,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS mod_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT,
  content TEXT,
  reason TEXT NOT NULL,
  evidence TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  summary TEXT,
  status TEXT DEFAULT 'open',
  resolution TEXT,
  resolved_by TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS mod_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  content TEXT,
  classification TEXT NOT NULL,
  confidence REAL,
  details TEXT,
  context_before TEXT,
  context_after TEXT,
  alert_sent INTEGER DEFAULT 0,
  dismissed INTEGER DEFAULT 0,
  action_taken TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS unanswered_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  content TEXT NOT NULL,
  question_type TEXT,
  confidence REAL,
  detected_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  resolved INTEGER DEFAULT 0,
  resolved_at INTEGER,
  digest_sent INTEGER DEFAULT 0
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_guild_channel_ts ON chat_messages(guild_id, channel_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_guild_ts ON chat_messages(guild_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_chunks_guild_channel ON message_chunks(guild_id, channel_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_mod_flags_guild ON mod_flags(guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mod_reports_guild ON mod_reports(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_unanswered_guild ON unanswered_questions(guild_id, resolved);
CREATE INDEX IF NOT EXISTS idx_summaries_guild_date ON chat_summaries(guild_id, date);
`);

module.exports = db;
