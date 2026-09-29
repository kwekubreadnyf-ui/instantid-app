// ============================================
// routes/auth.js
// Handles user signup, login, logout
// ============================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db/database');

// ============================================
// SIGNUP
// ============================================
router.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`;
        db.run(sql, [username, email, passwordHash], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Username or email already in use.' });
                }
                console.error('DB error:', err.message);
                return res.status(500).json({ error: 'Database error.' });
            }
            res.status(201).json({ message: 'User created successfully.', userId: this.lastID });
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ============================================
// LOGIN
// ============================================
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    // 1. Find user by email
    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) {
            console.error('Login DB error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // 2. Compare the provided password with the stored hash
        try {
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            // 3. Create the session
            req.session.userId = user.id;
            req.session.username = user.username;

            res.json({
                message: 'Login successful.',
                user: { id: user.id, username: user.username, email: user.email }
            });
        } catch (err) {
            console.error('bcrypt compare error:', err);
            res.status(500).json({ error: 'Server error.' });
        }
    });
});

// ============================================
// GET CURRENT USER (used by dashboard)
// ============================================
router.get('/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    res.json({
        id: req.session.userId,
        username: req.session.username
    });
});

// ============================================
// LOGOUT
// ============================================
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');   // Default session cookie name
        res.json({ message: 'Logged out.' });
    });
});

module.exports = router;


// ============================================
// GET ALL USERS (for the contacts list)
// ============================================
router.get('/users', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in.' });
    }

    // Get all users except yourself
    const sql = `SELECT id, username, email FROM users WHERE id != ? ORDER BY username`;
    db.all(sql, [req.session.userId], (err, rows) => {
        if (err) {
            console.error('Users fetch error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        res.json(rows);
    });
});
//DEBUD
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    console.log('🔍 LOGIN ATTEMPT');
    console.log('   Email:', email);
    console.log('   Password length:', password ? password.length : 0);

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) {
            console.error('Login DB error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        if (!user) {
            console.log('   ❌ No user found for email:', email);
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        console.log('   ✅ User found:', user.username);

        try {
            const match = await bcrypt.compare(password, user.password_hash);
            console.log('   🔐 Password match:', match);

            if (!match) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            req.session.userId = user.id;
            req.session.username = user.username;

            console.log('   🎉 Session created for user:', user.username);

            res.json({
                message: 'Login successful.',
                user: { id: user.id, username: user.username, email: user.email }
            });
        } catch (err) {
            console.error('bcrypt compare error:', err);
            res.status(500).json({ error: 'Server error.' });
        }
    });
});