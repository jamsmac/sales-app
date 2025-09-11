const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../utils/database');

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const user = db.getUserByUsername(username);
        
        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        // В демо версии простая проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: process.env.SESSION_DURATION || '8h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Verify token
router.get('/verify', require('../middleware/auth.middleware'), (req, res) => {
    const user = db.getUserById(req.user.id);
    res.json({
        user: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role
        }
    });
});

module.exports = router;
