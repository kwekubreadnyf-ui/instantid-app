// ============================================
// db/database.js
// Sets up the SQLite database and tables
// ============================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'instantid.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database.');
    createTables();
  }
});

function createTables() {
  db.serialize(() => {
    
    // 1. USERS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. MESSAGES TABLE (original)
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        sender_ip TEXT,
        sender_city TEXT,
        sender_country TEXT,
        sender_lat REAL,
        sender_lon REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (recipient_id) REFERENCES users(id)
      )
    `);

    // 3. CONTACTS TABLE (phonebook)
    db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 4. MIGRATIONS — add new columns to messages
    // These will run every startup; SQLite ignores duplicates by erroring silently
    const migrations = [
      `ALTER TABLE messages ADD COLUMN token TEXT`,
      `ALTER TABLE messages ADD COLUMN is_external INTEGER DEFAULT 0`,
      `ALTER TABLE messages ADD COLUMN contact_name TEXT`,
      `ALTER TABLE messages ADD COLUMN contact_phone TEXT`,
      `ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER`,
      `ALTER TABLE messages ADD COLUMN reply_ip TEXT`,
      `ALTER TABLE messages ADD COLUMN reply_city TEXT`,
      `ALTER TABLE messages ADD COLUMN reply_country TEXT`,
      `ALTER TABLE messages ADD COLUMN reply_lat REAL`,
      `ALTER TABLE messages ADD COLUMN reply_lon REAL`
    ];

    migrations.forEach(sql => {
      db.run(sql, (err) => {
        // Silently ignore "duplicate column" errors
        if (err && !err.message.includes('duplicate column')) {
          console.error('Migration error:', err.message);
        }
      });
    });

    console.log('✅ Database tables and migrations ready.');
  });
}

module.exports = db;