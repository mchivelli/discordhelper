// Database layer.
//
// We use the file-based JSON storage shim (file-db.js) because production
// deliberately avoids native modules (no better-sqlite3 build chain inside
// the container). The shim exposes a SQLite-like API: db.prepare(sql)
// returns an object with .get/.all/.run methods.
//
// New tables (message_chunks, sync_state, mod_flags, mod_reports,
// unanswered_questions) are registered in file-db.js. Embeddings (BLOBs)
// are stored separately as .bin files via embedding-store.js because JSON
// is not suitable for Float32Array data.
//
// The CREATE TABLE strings below are kept for documentation; file-db's
// exec() is a no-op that just logs them.
const db = require('./file-db');

// Document the schema (no-op at runtime; file-db uses its hardcoded table list)
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

-- NEW TABLES for vector/mod features
-- Note: in file-db storage, all PKs are TEXT. Embeddings are stored as
-- raw .bin files under data/embeddings/<id>.bin (see embedding-store.js)
-- because JSON cannot efficiently round-trip Float32Array data.

CREATE TABLE IF NOT EXISTS message_chunks (
  id TEXT PRIMARY KEY,           -- guild-channel-startTs composite
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  combined_text TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,           -- synthesized as guildId_channelId
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  last_message_id TEXT,
  last_sync_ts INTEGER
);

CREATE TABLE IF NOT EXISTS mod_reports (
  id TEXT PRIMARY KEY,           -- UUID
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
  created_at INTEGER,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS mod_flags (
  id TEXT PRIMARY KEY,           -- UUID
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  content TEXT,
  classification TEXT NOT NULL,
  confidence REAL,
  details TEXT,
  dismissed INTEGER DEFAULT 0,
  action_taken TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS unanswered_questions (
  id TEXT PRIMARY KEY,           -- UUID
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  content TEXT NOT NULL,
  question_type TEXT,
  confidence REAL,
  detected_at INTEGER,
  resolved INTEGER DEFAULT 0,
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
