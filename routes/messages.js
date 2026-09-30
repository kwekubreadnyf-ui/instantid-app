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

function cleanIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    return raw.split(',')[0].trim();
}

// ============================================
// SEND A MESSAGE (in-app)
// ============================================
router.post('/', requireLogin, async (req, res) => {
    const { recipientId, content } = req.body;
    const senderId = req.session.userId;

    if (!recipientId || !content || content.trim() === '') {
        return res.status(400).json({ error: 'Recipient and content required.' });
    }

    const senderIp = cleanIp(req);
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
// SEND VIA WHATSAPP (external contact)
// ============================================
router.post('/external', requireLogin, async (req, res) => {
    const { contactName, contactPhone, content } = req.body;
    const senderId = req.session.userId;

    if (!contactName || !contactPhone || !content || content.trim() === '') {
        return res.status(400).json({ error: 'Name, phone, and content required.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const senderIp = cleanIp(req);
    const location = await geolocate(senderIp);

    const sql = `
        INSERT INTO messages 
            (sender_id, recipient_id, content, token, is_external, contact_name, contact_phone,
             sender_ip, sender_city, sender_country, sender_lat, sender_lon)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `;

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
        res.status(201).json({ messageId: this.lastID, token: token });
    });
});

// ============================================
// GET MESSAGE BY TOKEN (public)
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
// SUBMIT REPLY VIA TOKEN (public)
// ============================================
router.post('/token/:token', async (req, res) => {
    const { content } = req.body;
    const token = req.params.token;

    if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Reply cannot be empty.' });
    }

    const findSql = `SELECT id, sender_id, recipient_id, contact_name FROM messages WHERE token = ? AND is_external = 1`;
    db.get(findSql, [token], async (err, original) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!original) return res.status(404).json({ error: 'Invalid or expired link.' });

        const replierIp = cleanIp(req);
        const location = await geolocate(replierIp);

        // Reply is stored so it appears in the ORIGINAL sender's conversation.
        // sender_id = original recipient (the replier side)
        // recipient_id = original sender (the user)
        // contact_name = "Reply: <original contact>" to mark it as an incoming reply
        const insertSql = `
            INSERT INTO messages 
                (sender_id, recipient_id, content, reply_to_message_id, is_external,
                 contact_name, contact_phone,
                 sender_ip, sender_city, sender_country, sender_lat, sender_lon)
            VALUES (?, ?, ?, ?, 0, ?, '', ?, ?, ?, ?, ?)
        `;

        db.run(insertSql, [
            original.recipient_id,
            original.sender_id,
            content.trim(),
            original.id,
            'Reply: ' + (original.contact_name || 'External'),
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
// GET CONVERSATION WITH A USER
// ============================================
router.get('/:userId', requireLogin, (req, res) => {
    const myId = req.session.userId;
    const otherId = parseInt(req.params.userId);

    if (!otherId) return res.status(400).json({ error: 'Invalid user ID.' });

    const sql = `
        SELECT 
            m.id, m.sender_id, m.recipient_id, m.content,
            m.sender_ip, m.sender_city, m.sender_country, m.sender_lat, m.sender_lon,
            m.created_at, m.is_external, m.contact_name, m.reply_to_message_id,
            u.username AS sender_username
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE 
            (m.sender_id = ? AND m.recipient_id = ?)
            OR (m.sender_id = ? AND m.recipient_id = ?)
            OR (m.contact_name LIKE 'Reply:%' AND m.recipient_id = ?)
        ORDER BY m.created_at ASC
    `;

    db.all(sql, [myId, otherId, otherId, myId, myId], (err, rows) => {
        if (err) {
            console.error('Messages fetch error:', err.message);
            return res.status(500).json({ error: 'Database error.' });
        }
        res.json(rows);
    });
});

// ============================================
// DASHBOARD STATS
// ============================================
router.get('/stats/summary', requireLogin, (req, res) => {
    const userId = req.session.userId;
    const stats = {};

    db.get(`SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND is_external = 0`, [userId], (e1, r1) => {
        if (e1) return res.status(500).json({ error: e1.message });
        stats.messagesSent = r1.c;

        db.get(`SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND sender_id != ? AND is_external = 0`, [userId, userId], (e2, r2) => {
            if (e2) return res.status(500).json({ error: e2.message });
            stats.messagesReceived = r2.c;

            db.get(`SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND is_external = 1`, [userId], (e3, r3) => {
                if (e3) return res.status(500).json({ error: e3.message });
                stats.whatsappSent = r3.c;

                db.get(`SELECT COUNT(*) AS c FROM contacts WHERE user_id = ?`, [userId], (e4, r4) => {
                    if (e4) return res.status(500).json({ error: e4.message });
                    stats.contacts = r4.c;

                    db.get(`SELECT COUNT(*) AS c FROM users WHERE id != ?`, [userId], (e5, r5) => {
                        if (e5) return res.status(500).json({ error: e5.message });
                        stats.otherUsers = r5.c;
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// ============================================
// GET MY EXTERNAL MESSAGES
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