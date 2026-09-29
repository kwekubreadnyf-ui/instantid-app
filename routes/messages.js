// ============================================
// routes/messages.js
// Handles in-app messages AND external WhatsApp replies
// ============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const geolocate = require('../utils/geolocate');

function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
    next();
}

// ============================================
// SEND A MESSAGE (in-app, to a registered user)
// ============================================
router.post('/', requireLogin, async (req, res) => {
    const { recipientId, content } = req.body;
    const senderId = req.session.userId;

    if (!recipientId || !content || content.trim() === '') {
        return res.status(400).json({ error: 'Recipient and content required.' });
    }

    // Capture sender's IP and geolocate
    const senderIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const location = await geolocate(senderIp);

    const sql = `
        INSERT INTO messages 
            (sender_id, recipient_id, content, sender_ip, sender_city, sender_country, sender_lat, sender_lon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
        senderId, recipientId, content.trim(),
        location ? location.ip : senderIp,
        location ? location.city : null,
        location ? location.country : null,
        location ? location.lat : null,
        location ? location.lon : null
    ], function (err) {
        if (err) {
            console.error('Message insert error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        res.status(201).json({ messageId: this.lastID });
    });
});

// ============================================
// SEND VIA WHATSAPP (to an external contact)
// ============================================
router.post('/external', requireLogin, async (req, res) => {
    const { contactName, contactPhone, content } = req.body;
    const senderId = req.session.userId;

    if (!contactName || !contactPhone || !content || content.trim() === '') {
        return res.status(400).json({ error: 'Name, phone, and content required.' });
    }

    // Generate a unique token for the reply link
    const token = crypto.randomBytes(16).toString('hex');

    // Capture sender's location
    const senderIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const location = await geolocate(senderIp);

    const sql = `
        INSERT INTO messages 
            (sender_id, recipient_id, content, token, is_external, contact_name, contact_phone,
             sender_ip, sender_city, sender_country, sender_lat, sender_lon)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `;

    // recipient_id is set to sender_id for schema compliance (self-reference)
    db.run(sql, [
        senderId, senderId, content.trim(), token, contactName, contactPhone,
        location ? location.ip : senderIp,
        location ? location.city : null,
        location ? location.country : null,
        location ? location.lat : null,
        location ? location.lon : null
    ], function (err) {
        if (err) {
            console.error('External message error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }

        res.status(201).json({
            messageId: this.lastID,
            token: token
        });
    });
});

// ============================================
// GET MESSAGE BY TOKEN (public — no auth)
// Used by /reply.html to show the original message
// ============================================
router.get('/token/:token', (req, res) => {
    const sql = `
        SELECT 
            m.id, m.content, m.contact_name, m.contact_phone, m.created_at,
            u.username AS sender_username
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.token = ? AND m.is_external = 1
    `;

    db.get(sql, [req.params.token], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!row) return res.status(404).json({ error: 'Message not found or invalid link.' });
        res.json(row);
    });
});

// ============================================
// SUBMIT REPLY VIA TOKEN (public — no auth)
// Captures the replier's IP and geolocates it
// ============================================
router.post('/token/:token', async (req, res) => {
    const { content } = req.body;
    const token = req.params.token;

    if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Reply cannot be empty.' });
    }

    // Find original message
    const findSql = `SELECT id, sender_id FROM messages WHERE token = ? AND is_external = 1`;
    db.get(findSql, [token], async (err, original) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!original) return res.status(404).json({ error: 'Invalid or expired link.' });

        // Capture replier's IP and location
        const replierIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const location = await geolocate(replierIp);

        // Insert the reply as a new message
        const insertSql = `
            INSERT INTO messages 
                (sender_id, recipient_id, content, reply_to_message_id, is_external,
                 contact_name, contact_phone,
                 sender_ip, sender_city, sender_country, sender_lat, sender_lon)
            VALUES (?, ?, ?, ?, 0, 'Reply', '', ?, ?, ?, ?, ?)
        `;

        db.run(insertSql, [
            original.sender_id,  // reply linked to original sender
            original.sender_id,  // visible in their conversation
            content.trim(),
            original.id,
            location ? location.ip : replierIp,
            location ? location.city : null,
            location ? location.country : null,
            location ? location.lat : null,
            location ? location.lon : null
        ], function (err) {
            if (err) {
                console.error('Reply insert error:', err.message);
                return res.status(500).json({ error: 'Database error.' });
            }
            res.status(201).json({
                message: 'Reply sent.',
                replyId: this.lastID,
                location: location
            });
        });
    });
});

// ============================================
// GET CONVERSATION WITH A USER (existing)
// ============================================
router.get('/:userId', requireLogin, (req, res) => {
    const myId = req.session.userId;
    const otherId = parseInt(req.params.userId);

    if (!otherId) return res.status(400).json({ error: 'Invalid user ID.' });

    const sql = `
        SELECT 
            m.id, m.sender_id, m.recipient_id, m.content,
            m.sender_ip, m.sender_city, m.sender_country, m.sender_lat, m.sender_lon,
            m.created_at, m.is_external, m.contact_name,
            u.username AS sender_username
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE 
            (m.sender_id = ? AND m.recipient_id = ?)
            OR (m.sender_id = ? AND m.recipient_id = ?)
        ORDER BY m.created_at ASC
    `;

    db.all(sql, [myId, otherId, otherId, myId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
});

// ============================================
// GET MY EXTERNAL MESSAGES (WhatsApp conversations)
// ============================================
router.get('/external/list', requireLogin, (req, res) => {
    const sql = `
        SELECT id, contact_name, contact_phone, content, created_at, token
        FROM messages
        WHERE sender_id = ? AND is_external = 1
        ORDER BY created_at DESC
    `;
    db.all(sql, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
});

module.exports = router;

// ============================================
// GET DASHBOARD STATS
// ============================================
router.get('/stats/summary', requireLogin, (req, res) => {
    const userId = req.session.userId;

    const queries = {
        totalSent: `SELECT COUNT(*) AS count FROM messages WHERE sender_id = ? AND is_external = 0`,
        totalReceived: `SELECT COUNT(*) AS count FROM messages WHERE recipient_id = ? AND sender_id != ? AND is_external = 0`,
        externalSent: `SELECT COUNT(*) AS count FROM messages WHERE sender_id = ? AND is_external = 1`,
        totalContacts: `SELECT COUNT(*) AS count FROM contacts WHERE user_id = ?`,
        totalUsers: `SELECT COUNT(*) AS count FROM users WHERE id != ?`
    };

    const stats = {};

    // Run all queries
    db.get(queries.totalSent, [userId], (err, r1) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.messagesSent = r1.count;

        db.get(queries.totalReceived, [userId, userId], (err, r2) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.messagesReceived = r2.count;

            db.get(queries.externalSent, [userId], (err, r3) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.whatsappSent = r3.count;

                db.get(queries.totalContacts, [userId], (err, r4) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.contacts = r4.count;

                    db.get(queries.totalUsers, [userId], (err, r5) => {
                        if (err) return res.status(500).json({ error: err.message });
                        stats.otherUsers = r5.count;

                        res.json(stats);
                    });
                });
            });
        });
    });
});