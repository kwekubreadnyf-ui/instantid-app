// ============================================
// InstantID Server - Main Backend File
// ============================================

const express = require('express');
const path = require('path');
const session = require('express-session');
require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Parse incoming JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: 'instantid-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,   // 24 hours
        httpOnly: true
    }
}));

// ============================================
// ROUTES
// ============================================

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');   // <-- ADD THIS

app.use('/api', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);   // <-- ADD THIS

// Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('==========================================');
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
    console.log('==========================================');
    console.log('Press Ctrl + C to stop the server.');
});