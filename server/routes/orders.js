const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Валидация для фильтров
const ordersValidation = [
    query('startDate').optional().isISO8601().withMessage('Некорректная дата начала'),
    query('endDate').optional().isISO8601().withMessage('Некорректная дата окончания'),
    query('paymentType').optional().isIn(['CASH', 'QR', 'VIP', 'CARD', 'RETURN']).withMessage('Некорректный тип платежа'),
    query('product').optional().isLength({ max: 200 }).withMessage('Название товара слишком длинное')
];

// Get orders
router.get('/', auth, ordersValidation, async (req, res) => {
    try {
        // Проверка валидации
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Некорректные параметры фильтрации',
                details: errors.array()
            });
        }

        const { startDate, endDate, paymentType, product } = req.query;
        const orders = await db.getOrders({ startDate, endDate, paymentType, product });
        res.json(orders);
    } catch (error) {
        console.error('Orders fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения заказов' });
    }
});

// Get statistics
router.get('/stats', auth, async (req, res) => {
    try {
        const stats = await db.getStatistics();
        res.json(stats);
    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

module.exports = router;
