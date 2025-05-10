#!/bin/bash
set -e

echo "=== SQLite to File-based Storage Migration Script ==="
echo "This script will replace SQLite with file-based storage."

# Create file-based database implementation
cat > src/utils/file-db.js << 'EOL'
/**
 * File-based database replacement for better-sqlite3
 * Uses JSON files for storage to avoid native module issues
 */
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Storage location for database files
const DB_ROOT = process.env.DB_PATH 
  ? path.dirname(process.env.DB_PATH)
  : path.join(process.cwd(), 'data');

// Ensure the data directory exists
fs.ensureDirSync(DB_ROOT);

// Create table directories
const TABLES = {
  tasks: path.join(DB_ROOT, 'tasks'),
  stages: path.join(DB_ROOT, 'stages'),
  task_suggestions: path.join(DB_ROOT, 'task_suggestions'),
  bot_settings: path.join(DB_ROOT, 'bot_settings'),
  announcements: path.join(DB_ROOT, 'announcements'),
  changelogs: path.join(DB_ROOT, 'changelogs')
};

// Ensure all table directories exist
Object.values(TABLES).forEach(dir => fs.ensureDirSync(dir));

// Cache loaded data to improve performance
const cache = {
  tasks: new Map(),
  stages: new Map(),
  task_suggestions: new Map(),
  bot_settings: new Map(),
  announcements: new Map(),
  changelogs: new Map()
};

/**
 * Load all files from a table directory
 * @param {string} tableName - Name of the table
 * @returns {Array} - Array of all items in the table
 */
function loadTable(tableName) {
  if (!TABLES[tableName]) {
    throw new Error(`Table '${tableName}' does not exist`);
  }
  
  const items = [];
  const files = fs.readdirSync(TABLES[tableName]);
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const data = fs.readJsonSync(path.join(TABLES[tableName], file));
        items.push(data);
        // Update cache
        cache[tableName].set(data.id || data.key, data);
      } catch (err) {
        console.error(`Error loading file ${file} from ${tableName}:`, err);
      }
    }
  }
  
  return items;
}

/**
 * Save an item to its table
 * @param {string} tableName - Name of the table
 * @param {Object} item - Item to save
 * @returns {Object} - The saved item
 */
function saveItem(tableName, item) {
  if (!TABLES[tableName]) {
    throw new Error(`Table '${tableName}' does not exist`);
  }
  
  // Generate an ID if one doesn't exist
  if (!item.id && tableName !== 'bot_settings') {
    item.id = crypto.randomUUID();
  }
  
  const fileName = tableName === 'bot_settings'
    ? `${item.key}.json`
    : `${item.id}.json`;
    
  const filePath = path.join(TABLES[tableName], fileName);
  
  fs.writeJsonSync(filePath, item, { spaces: 2 });
  
  // Update cache
  const cacheKey = tableName === 'bot_settings' ? item.key : item.id;
  cache[tableName].set(cacheKey, item);
  
  return item;
}

/**
 * Delete an item from its table
 * @param {string} tableName - Name of the table
 * @param {string} id - ID of the item to delete
 * @returns {boolean} - Whether the deletion was successful
 */
function deleteItem(tableName, id) {
  if (!TABLES[tableName]) {
    throw new Error(`Table '${tableName}' does not exist`);
  }
  
  const filePath = path.join(TABLES[tableName], `${id}.json`);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    // Update cache
    cache[tableName].delete(id);
    return true;
  }
  
  return false;
}

/**
 * Query builder mimicking SQLite queries
 */
class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
  }
  
  /**
   * Get a single item by ID
   * @param {string} id - ID of the item to get
   * @returns {Object|null} - The item, or null if not found
   */
  get(id) {
    // Check cache first
    if (cache[this.tableName].has(id)) {
      return cache[this.tableName].get(id);
    }
    
    const filePath = path.join(TABLES[this.tableName], `${id}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readJsonSync(filePath);
        // Update cache
        cache[this.tableName].set(id, data);
        return data;
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return null;
      }
    }
    
    return null;
  }
  
  /**
   * Get all items from a table
   * @returns {Array} - All items in the table
   */
  all() {
    return loadTable(this.tableName);
  }
  
  /**
   * Insert or update an item
   * @param {...*} args - Arguments based on query format
   * @returns {Object} - Result with changes count and lastInsertRowid
   */
  run(...args) {
    // Handle different argument formats
    let item = {};
    
    if (this.tableName === 'bot_settings' && args.length === 2) {
      // Handle key-value pairs for settings
      item = { key: args[0], value: args[1] };
    } else if (typeof args[0] === 'object') {
      // Object format
      item = args[0];
    } else {
      // Convert positional arguments to object based on table
      switch(this.tableName) {
        case 'tasks':
          if (args.length >= 2) {
            item = {
              id: args[0],
              name: args[1],
              description: args[2] || null,
              deadline: args[3] || null,
              completion_percentage: args[4] || 0,
              created_at: args[5] || Date.now(),
              guild_id: args[6] || null,
              creator_id: args[7] || null
            };
          }
          break;
        case 'stages':
          if (args.length >= 4) {
            item = {
              task_id: args[0],
              idx: args[1],
              name: args[2],
              desc: args[3],
              assignee: args[4] || null,
              done: args[5] || 0,
              created_at: args[6] || Date.now(),
              completed_at: args[7] || null,
              completion_notes: args[8] || null,
              due_date: args[9] || null
            };
          }
          break;
        case 'task_suggestions':
          if (args.length >= 3) {
            item = {
              id: args[0] || crypto.randomUUID(),
              task_id: args[1],
              stage_suggestions: args[2],
              created_at: args[3] || Date.now(),
              status: args[4] || 'pending'
            };
          }
          break;
        case 'announcements':
          if (args.length >= 4) {
            item = {
              id: args[0],
              title: args[1],
              content: args[2],
              original_content: args[3],
              author_id: args[4],
              created_at: args[5] || Date.now(),
              posted: args[6] || 0,
              posted_channel_id: args[7] || null
            };
          }
          break;
        case 'changelogs':
          if (args.length >= 5) {
            item = {
              id: args[0],
              version: args[1],
              category: args[2],
              changes: args[3],
              author_id: args[4],
              created_at: args[5] || Date.now(),
              is_patch: args[6] || 0,
              announcement_id: args[7] || null,
              posted: args[8] || 0,
              posted_channel_id: args[9] || null
            };
          }
          break;
      }
    }
    
    // Save the item
    const savedItem = saveItem(this.tableName, item);
    
    // Return a result object similar to SQLite
    return {
      changes: 1,
      lastInsertRowid: this.tableName === 'task_suggestions' ? savedItem.id : null
    };
  }
}

/**
 * Main database interface
 */
const db = {
  exec: (sql) => {
    // No-op to handle schema creation
    console.log(`Ignoring SQL execution (using file storage): ${sql.substring(0, 100)}...`);
    return true;
  },
  
  pragma: (pragma) => {
    // No-op for SQLite pragmas
    console.log(`Ignoring SQLite pragma (using file storage): ${pragma}`);
    return true;
  },
  
  prepare: (query) => {
    // Simple query parsing to determine the table
    const tableName = parseTableName(query);
    if (!tableName) {
      console.warn(`Unsupported query or unknown table: ${query}`);
      return { run: () => ({ changes: 0 }), get: () => null, all: () => [] };
    }
    
    return new QueryBuilder(tableName);
  }
};

/**
 * Parse the table name from a SQL query
 * @param {string} query - The SQL query
 * @returns {string|null} - The table name or null if not found
 */
function parseTableName(query) {
  const lowerQuery = query.toLowerCase();
  const tableNames = Object.keys(TABLES);
  
  for (const table of tableNames) {
    if (lowerQuery.includes(table)) {
      return table;
    }
  }
  
  // Handle special case for checking if a table exists
  if (lowerQuery.includes("sqlite_master") && lowerQuery.includes("table") && lowerQuery.includes("name")) {
    // Return a fake result
    return null;
  }
  
  return null;
}

// Initialize by loading all tables into cache on startup
Object.keys(TABLES).forEach(tableName => {
  console.log(`Initializing ${tableName} table...`);
  loadTable(tableName);
});

console.log(`Using file-based database at: ${DB_ROOT}`);

module.exports = db;
EOL

echo "Created file-based database implementation"

# Replace db.js with new implementation
cat > src/utils/db.js << 'EOL'
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
`);

// Export our file-based database implementation
module.exports = db;
EOL

echo "Updated database layer"

# Update db-migration.js
cat > src/utils/db-migration.js << 'EOL'
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
EOL

echo "Updated database migration script"

# Update package.json to remove better-sqlite3
sed -i 's/"better-sqlite3": "\^[0-9.]*",//g' package.json

echo "Removed better-sqlite3 from dependencies"

# Update Dockerfile
cat > Dockerfile << 'EOL'
# Simple Node.js image - no need for multi-stage build anymore
FROM node:18.20.8

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production --omit=dev

# Copy application code
COPY . .

# Make startup script executable
RUN chmod +x start.sh

# Use non-root user for security
USER node

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Health check to verify bot is running
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${HEALTH_PORT:-3000}/health || exit 1

# Use startup script to ensure database, commands, and AI are ready
CMD ["/bin/sh", "start.sh"]
EOL

echo "Updated Dockerfile"

echo "=== Migration completed ==="
echo "You can now rebuild your Docker container:"
echo "docker-compose down"
echo "docker-compose build --no-cache"
echo "docker-compose up -d"
