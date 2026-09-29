// ============================================
// db/database.js
// Uses sql.js (pure JS) instead of sqlite3 (native)
// ============================================

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'instantid.db');

let db = null;
let SQL = null;

// Save the in-memory database to disk
function persist() {
    if (!db) return;
    try {
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (err) {
        console.error('Persist error:', err.message);
    }
}

// Wrapper to mimic the sqlite3 API (so existing routes don't break)
const dbWrapper = {
    // Run a query that changes data
    run: function (sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        try {
            db.run(sql, params || []);
            persist();
            if (callback) callback.call({ lastID: getLastInsertId() }, null);
        } catch (err) {
            if (callback) callback(err);
        }
    },

    // Get a single row
    get: function (sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        try {
            const stmt = db.prepare(sql);
            stmt.bind(params || []);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                if (callback) callback(null, row);
            } else {
                stmt.free();
                if (callback) callback(null, null);
            }
        } catch (err) {
            if (callback) callback(err);
        }
    },

    // Get all rows
    all: function (sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        try {
            const stmt = db.prepare(sql);
            stmt.bind(params || []);
            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            stmt.free();
            if (callback) callback(null, rows);
        } catch (err) {
            if (callback) callback(err);
        }
    },

    // For chaining
    serialize: function (fn) {
        if (fn) fn();
    }
};

// Get last inserted ID
function getLastInsertId() {
    try {
        const result = db.exec('SELECT last_insert_rowid() AS id');
        return result[0].values[0][0];
    } catch (e) {
        return null;
    }
}

// Initialize sql.js and load existing DB file
initSqlJs().then((sqlModule) => {
    SQL = sqlModule;
    let existingData = null;

    if (fs.existsSync(dbPath)) {
        try {
            existingData = new Uint8Array(fs.readFileSync(dbPath));
            console.log('✅ Loaded existing database from disk.');
        } catch (err) {
            console.error('Could not read DB file:', err.message);
        }
    }

    db = existingData ? new SQL.Database(existingData) : new SQL.Database();
    console.log('✅ Connected to SQLite database (sql.js).');
    createTables();
}).catch(err => {
    console.error('❌ Failed to initialize sql.js:', err.message);
});

function createTables() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
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
            token TEXT,
            is_external INTEGER DEFAULT 0,
            contact_name TEXT,
            contact_phone TEXT,
            reply_to_message_id INTEGER,
            reply_ip TEXT,
            reply_city TEXT,
            reply_country TEXT,
            reply_lat REAL,
            reply_lon REAL
        )`,
        `CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    tables.forEach(sql => {
        try {
            db.run(sql);
        } catch (err) {
            console.error('Table creation error:', err.message);
        }
    });

    persist();
    console.log('✅ Database tables and migrations ready.');
}

module.exports = dbWrapper;