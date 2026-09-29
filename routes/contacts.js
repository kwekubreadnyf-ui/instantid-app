// ============================================
// routes/contacts.js
// Manages the user's phonebook (external contacts)
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../db/database');

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    next();
}

// List all contacts for the logged-in user
router.get('/', requireLogin, (req, res) => {
    const sql = `SELECT id, name, phone FROM contacts WHERE user_id = ? ORDER BY name`;
    db.all(sql, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
});

// Add a new contact
router.post('/', requireLogin, (req, res) => {
    const { name, phone } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: 'Name and phone number required.' });
    }

    // Strip non-digits and + from phone (for WhatsApp URL safety)
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    const sql = `INSERT INTO contacts (user_id, name, phone) VALUES (?, ?, ?)`;
    db.run(sql, [req.session.userId, name.trim(), cleanPhone], function (err) {
        if (err) {
            console.error('Contact insert error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        res.status(201).json({ id: this.lastID, name, phone: cleanPhone });
    });
});

// Delete a contact
router.delete('/:id', requireLogin, (req, res) => {
    const sql = `DELETE FROM contacts WHERE id = ? AND user_id = ?`;
    db.run(sql, [req.params.id, req.session.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json({ message: 'Contact deleted.', changes: this.changes });
    });
});

module.exports = router;