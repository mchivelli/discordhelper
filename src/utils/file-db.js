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
    this.query = '';
  }
  
  /**
   * Get a single item by ID or execute a query
   * @param {string} id - ID of the item to get or query parameter
   * @returns {Object|null} - The item, or null if not found
   */
  get(id) {
    // Handle COUNT queries
    if (this.query && this.query.toLowerCase().includes('count')) {
      return this.executeCountQuery(id);
    }
    
    // Handle regular SELECT queries with WHERE clauses
    if (this.query && this.query.toLowerCase().includes('where')) {
      return this.executeSelectQuery(id);
    }
    
    // Check cache first for simple ID lookups
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
   * Execute COUNT queries
   * @param {string} param - Query parameter
   * @returns {Object} - Object with count property
   */
  executeCountQuery(param) {
    const items = loadTable(this.tableName);
    
    // Handle COUNT(*) with WHERE clause
    if (param && this.query.toLowerCase().includes('where')) {
      let count = 0;
      
      // Parse WHERE conditions based on common patterns
      if (this.query.toLowerCase().includes('task_id')) {
        count = items.filter(item => item.task_id === param).length;
      } else if (this.query.toLowerCase().includes('guild_id')) {
        count = items.filter(item => item.guild_id === param).length;
      } else if (this.query.toLowerCase().includes('done = 1')) {
        count = items.filter(item => item.task_id === param && item.done === 1).length;
      } else if (this.query.toLowerCase().includes('completion_percentage = 100')) {
        count = items.filter(item => item.guild_id === param && item.completion_percentage === 100).length;
      } else if (this.query.toLowerCase().includes('completion_percentage > 0 and completion_percentage < 100')) {
        count = items.filter(item => item.guild_id === param && item.completion_percentage > 0 && item.completion_percentage < 100).length;
      } else if (this.query.toLowerCase().includes('completion_percentage = 0')) {
        count = items.filter(item => item.guild_id === param && item.completion_percentage === 0).length;
      } else {
        // Generic filter
        count = items.length;
      }
      
      return { count };
    }
    
    // Simple COUNT(*) without WHERE
    return { count: items.length };
  }
  
  /**
   * Execute SELECT queries with WHERE clauses
   * @param {...*} params - Query parameters
   * @returns {Object|null} - Query result
   */
  executeSelectQuery(...params) {
    const items = loadTable(this.tableName);
    
    // Handle common SELECT patterns
    if (this.query.toLowerCase().includes('where id =')) {
      return items.find(item => item.id === params[0]) || null;
    } else if (this.query.toLowerCase().includes('where task_id =') && this.query.toLowerCase().includes('and idx =')) {
      return items.find(item => item.task_id === params[0] && item.idx === parseInt(params[1])) || null;
    } else if (this.query.toLowerCase().includes('where task_id =') && this.query.toLowerCase().includes('and done = 0')) {
      return items.find(item => item.task_id === params[0] && item.done === 0) || null;
    } else if (this.query.toLowerCase().includes('where task_id =') && this.query.toLowerCase().includes('order by idx')) {
      const filtered = items.filter(item => item.task_id === params[0]);
      filtered.sort((a, b) => a.idx - b.idx);
      return this.query.toLowerCase().includes('and done = 0') 
        ? filtered.find(item => item.done === 0) || null
        : filtered[0] || null;
    } else if (this.query.toLowerCase().includes('where rowid =')) {
      return items.find(item => item.id === params[0]) || null;
    }
    
    return null;
  }
  
  /**
   * Get all items from a table with optional filtering
   * @param {...*} params - Query parameters  
   * @returns {Array} - All items in the table
   */
  all(...params) {
    const items = loadTable(this.tableName);
    
    // Handle WHERE clauses in ALL queries
    if (this.query && this.query.toLowerCase().includes('where')) {
      let filtered = items;
      
      if (this.query.toLowerCase().includes('task_id =')) {
        filtered = items.filter(item => item.task_id === params[0]);
      } else if (this.query.toLowerCase().includes('guild_id =')) {
        filtered = items.filter(item => item.guild_id === params[0]);
      } else if (this.query.toLowerCase().includes('deadline is not null')) {
        filtered = items.filter(item => item.guild_id === params[0] && item.deadline && item.deadline !== '');
      }
      
      // Handle ORDER BY
      if (this.query.toLowerCase().includes('order by')) {
        if (this.query.toLowerCase().includes('order by idx')) {
          filtered.sort((a, b) => a.idx - b.idx);
        } else if (this.query.toLowerCase().includes('order by created_at desc')) {
          filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        }
      }
      
      return filtered;
    }
    
    return items;
  }
  
  /**
   * Insert or update an item
   * @param {...*} args - Arguments based on query format
   * @returns {Object} - Result with changes count and lastInsertRowid
   */
  run(...args) {
    // Handle DELETE operations
    if (this.query && this.query.toLowerCase().includes('delete')) {
      return this.executeDelete(...args);
    }
    
    // Handle UPDATE operations
    if (this.query && this.query.toLowerCase().includes('update')) {
      return this.executeUpdate(...args);
    }
    
    // Handle INSERT operations
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
            // Use composite key for stages
            const id = `${args[0]}_${args[1]}`;
            item = {
              id: id,
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
              id: Date.now(), // Use timestamp as ID for auto-increment behavior
              task_id: args[0],
              stage_suggestions: args[1],
              created_at: args[2] || Date.now(),
              status: args[3] || 'pending'
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
  
  /**
   * Execute DELETE operations
   * @param {...*} args - Query parameters
   * @returns {Object} - Result with changes count
   */
  executeDelete(...args) {
    const items = loadTable(this.tableName);
    let deletedCount = 0;
    
    if (this.query.toLowerCase().includes('where task_id =')) {
      const taskId = args[0];
      items.forEach(item => {
        if (item.task_id === taskId) {
          deleteItem(this.tableName, item.id);
          deletedCount++;
        }
      });
    } else if (this.query.toLowerCase().includes('where id =')) {
      const id = args[0];
      if (deleteItem(this.tableName, id)) {
        deletedCount = 1;
      }
    }
    
    return { changes: deletedCount };
  }
  
  /**
   * Execute UPDATE operations
   * @param {...*} args - Query parameters
   * @returns {Object} - Result with changes count
   */
  executeUpdate(...args) {
    const items = loadTable(this.tableName);
    let updatedCount = 0;
    
    // Parse UPDATE queries based on common patterns
    if (this.query.toLowerCase().includes('set completion_percentage =') && this.query.toLowerCase().includes('where id =')) {
      const percentage = args[0];
      const id = args[1];
      const item = items.find(i => i.id === id);
      if (item) {
        item.completion_percentage = percentage;
        saveItem(this.tableName, item);
        updatedCount = 1;
      }
    } else if (this.query.toLowerCase().includes('set done = 1') && this.query.toLowerCase().includes('where task_id =')) {
      const taskId = args[2];
      const idx = parseInt(args[3]);
      const item = items.find(i => i.task_id === taskId && i.idx === idx);
      if (item) {
        item.done = 1;
        item.completed_at = args[0];
        if (args[1]) item.completion_notes = args[1];
        saveItem(this.tableName, item);
        updatedCount = 1;
      }
    } else if (this.query.toLowerCase().includes('set status =') && this.query.toLowerCase().includes('where rowid =')) {
      const status = args[0];
      const rowid = args[1];
      const item = items.find(i => i.id == rowid);
      if (item) {
        item.status = status;
        saveItem(this.tableName, item);
        updatedCount = 1;
      }
    } else if (this.query.toLowerCase().includes('set assignee =')) {
      const assignee = args[0];
      const taskId = args[1];
      const item = items.find(i => i.task_id === taskId && i.done === 0);
      if (item) {
        item.assignee = assignee;
        saveItem(this.tableName, item);
        updatedCount = 1;
      }
    }
    
    return { changes: updatedCount };
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
    
    const builder = new QueryBuilder(tableName);
    builder.query = query; // Store the query for processing
    return builder;
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
