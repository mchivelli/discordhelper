// Temporary script to check database schema
require('dotenv').config();
const db = require('./src/utils/db');

// Get all table names
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables in database:');
console.log(tables.map(t => t.name).join(', '));

// For each table, get its schema
tables.forEach(table => {
  console.log(`\nSchema for table ${table.name}:`);
  const schema = db.prepare(`PRAGMA table_info(${table.name})`).all();
  console.log(schema.map(col => `${col.name} (${col.type})`).join('\n'));
});

// Check if tasks table exists and show a sample
if (tables.some(t => t.name === 'tasks')) {
  console.log('\nSample tasks:');
  const tasks = db.prepare('SELECT * FROM tasks LIMIT 5').all();
  console.log(JSON.stringify(tasks, null, 2));
}

// Check if stages table exists and show a sample
if (tables.some(t => t.name === 'stages')) {
  console.log('\nSample stages:');
  const stages = db.prepare('SELECT * FROM stages LIMIT 5').all();
  console.log(JSON.stringify(stages, null, 2));
}
