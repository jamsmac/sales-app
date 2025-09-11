const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../utils/database');

// Rate limiting для логина
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    message: {
        error: 'Слишком много попыток входа. Попробуйте через 15 минут.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Валидация для логина
const loginValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Имя пользователя должно быть от 3 до 50 символов')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Имя пользователя может содержать только буквы, цифры и подчеркивания'),
    body('password')
        .isLength({ min: 6, max: 100 })
        .withMessage('Пароль должен быть от 6 до 100 символов')
];

// Login
router.post('/login', loginLimiter, loginValidation, async (req, res) => {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            error: 'Некорректные данные',
            details: errors.array()
        });
    }

    const { username, password } = req.body;
    
    try {
        const user = await db.getUserByUsername(username);
        
        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        // Проверяем наличие JWT_SECRET
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || jwtSecret === 'secret') {
            console.error('⚠️  ВНИМАНИЕ: Используется небезопасный JWT_SECRET!');
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            jwtSecret || 'fallback-secret-change-in-production',
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
router.get('/verify', require('../middleware/auth.middleware'), async (req, res) => {
    try {
        const user = await db.getUserById(req.user.id);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
