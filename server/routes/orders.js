const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Get orders
router.get('/', auth, (req, res) => {
    const { startDate, endDate, paymentType, product } = req.query;
    const orders = db.getOrders({ startDate, endDate, paymentType, product });
    res.json(orders);
});

// Get statistics
router.get('/stats', auth, (req, res) => {
    const stats = db.getStatistics();
    res.json(stats);
});

module.exports = router;
