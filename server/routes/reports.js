const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Валидация для отчетов
const reportsValidation = [
    query('period').optional().isIn(['yearly', 'monthly', 'daily']).withMessage('Некорректный период'),
    query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Некорректный год'),
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Некорректный месяц'),
    query('paymentType').optional().isIn(['CASH', 'QR', 'VIP', 'CARD', 'RETURN', 'ALL']).withMessage('Некорректный тип платежа')
];

// Get reports data
router.get('/data', auth, reportsValidation, async (req, res) => {
    try {
        // Проверка валидации
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Некорректные параметры отчета',
                details: errors.array()
            });
        }

        const reportsData = await db.getReportsData();
        res.json(reportsData);
    } catch (error) {
        console.error('Reports data fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения данных отчетов' });
    }
});

// Get period details
router.get('/period/:periodKey', auth, async (req, res) => {
    try {
        const { periodKey } = req.params;
        const { paymentType = 'ALL' } = req.query;
        
        // Валидация periodKey
        if (!periodKey || !/^(\d{4}(_\d{1,2}(_\d{1,2})?)?)$/.test(periodKey)) {
            return res.status(400).json({ error: 'Некорректный ключ периода' });
        }
        
        // Валидация paymentType
        const validPaymentTypes = ['CASH', 'QR', 'VIP', 'CARD', 'RETURN', 'ALL'];
        if (!validPaymentTypes.includes(paymentType)) {
            return res.status(400).json({ error: 'Некорректный тип платежа' });
        }
        
        const details = await db.getPeriodDetails(periodKey, paymentType);
        res.json(details);
    } catch (error) {
        console.error('Period details fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения детализации периода' });
    }
});

// Get analytics summary
router.get('/analytics', auth, async (req, res) => {
    try {
        const [stats, reportsData] = await Promise.all([
            db.getStatistics(),
            db.getReportsData()
        ]);
        
        // Вычисляем дополнительную аналитику
        const analytics = {
            overview: stats,
            trends: calculateTrends(reportsData),
            topProducts: getTopProducts(reportsData.products),
            paymentAnalysis: analyzePayments(stats.byPaymentType)
        };
        
        res.json(analytics);
    } catch (error) {
        console.error('Analytics fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения аналитики' });
    }
});

// Вспомогательные функции для аналитики
function calculateTrends(reportsData) {
    const trends = {
        monthlyGrowth: 0,
        bestMonth: null,
        worstMonth: null,
        seasonality: {}
    };
    
    try {
        const monthlyTotals = {};
        
        // Собираем данные по месяцам
        Object.entries(reportsData.monthly || {}).forEach(([key, data]) => {
            const total = Object.values(data).reduce((sum, payment) => sum + (payment.total || 0), 0);
            monthlyTotals[key] = total;
        });
        
        const months = Object.keys(monthlyTotals).sort();
        if (months.length >= 2) {
            const latest = monthlyTotals[months[months.length - 1]];
            const previous = monthlyTotals[months[months.length - 2]];
            trends.monthlyGrowth = previous > 0 ? ((latest - previous) / previous * 100) : 0;
        }
        
        // Находим лучший и худший месяцы
        const sortedMonths = Object.entries(monthlyTotals).sort((a, b) => b[1] - a[1]);
        if (sortedMonths.length > 0) {
            trends.bestMonth = { period: sortedMonths[0][0], total: sortedMonths[0][1] };
            trends.worstMonth = { period: sortedMonths[sortedMonths.length - 1][0], total: sortedMonths[sortedMonths.length - 1][1] };
        }
        
    } catch (error) {
        console.warn('Ошибка расчета трендов:', error);
    }
    
    return trends;
}

function getTopProducts(productsData) {
    try {
        return Object.values(productsData || {})
            .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
            .slice(0, 10)
            .map(product => ({
                name: product.productName,
                variant: product.productVariant,
                revenue: product.revenue || 0,
                sales: product.sales || 0,
                returns: product.returns || 0,
                returnRate: product.sales > 0 ? (product.returns / product.sales * 100) : 0
            }));
    } catch (error) {
        console.warn('Ошибка получения топ продуктов:', error);
        return [];
    }
}

function analyzePayments(paymentData) {
    try {
        const total = Object.values(paymentData || {}).reduce((sum, payment) => sum + (payment.total || 0), 0);
        
        const analysis = Object.entries(paymentData || {}).map(([type, data]) => ({
            type,
            total: data.total || 0,
            count: data.count || 0,
            percentage: total > 0 ? (data.total / total * 100) : 0,
            avgTransaction: data.count > 0 ? (data.total / data.count) : 0
        })).sort((a, b) => b.total - a.total);
        
        return {
            breakdown: analysis,
            totalTransactions: Object.values(paymentData || {}).reduce((sum, payment) => sum + (payment.count || 0), 0),
            totalRevenue: total,
            mostPopular: analysis[0]?.type || 'N/A',
            avgTransactionValue: analysis.reduce((sum, item) => sum + item.avgTransaction, 0) / analysis.length || 0
        };
    } catch (error) {
        console.warn('Ошибка анализа платежей:', error);
        return { breakdown: [], totalTransactions: 0, totalRevenue: 0 };
    }
}

module.exports = router;
