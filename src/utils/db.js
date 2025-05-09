// Database layer using better-sqlite3 with optimized PRAGMAs
const Database = require('better-sqlite3');
const fs = require('fs-extra');
const path = require('path');

// Resolve full path and ensure it's normalized for the current OS
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tasks.db');
const absolutePath = path.resolve(dbPath);

// Make sure parent directory exists
fs.ensureDirSync(path.dirname(absolutePath));

console.log(`Using database at: ${absolutePath}`);

const db = new Database(absolutePath, { verbose: console.log, fileMustExist: false });

// Set optimized pragmas for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  name TEXT NOT NULL,
  desc TEXT NOT NULL,
  assignee TEXT,
  done INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  due_date INTEGER,
  PRIMARY KEY(task_id, idx),
  FOREIGN KEY(task_id) REFERENCES tasks(id)
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
`);
module.exports = db;
