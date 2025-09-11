const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Получить данные для отчетности
router.get('/data', auth, (req, res) => {
    const reportsData = db.getReportsData();
    res.json(reportsData);
});

// Получить детализацию по периоду
router.get('/details', auth, (req, res) => {
    const { period, type } = req.query;
    
    let details;
    if (period && period !== 'all') {
        details = db.getPeriodDetails(period, type || 'ALL');
    } else {
        // Все данные с фильтром по типу
        details = db.getOrders({ 
            paymentType: type !== 'ALL' ? type : undefined 
        });
    }
    
    res.json(details);
});

// Экспорт отчета
router.get('/export', auth, async (req, res) => {
    const XLSX = require('xlsx');
    const path = require('path');
    const fs = require('fs').promises;
    
    try {
        const reportsData = db.getReportsData();
        
        // Создаем Excel файл
        const wb = XLSX.utils.book_new();
        
        // Лист с годовыми данными
        const yearlyData = Object.entries(reportsData.yearly).map(([year, data]) => ({
            'Год': year,
            'Наличные': data.CASH?.total || 0,
            'QR': data.QR?.total || 0,
            'VIP': data.VIP?.total || 0,
            'Карты': data.CARD?.total || 0,
            'Возвраты': data.RETURN?.total || 0
        }));
        
        const wsYearly = XLSX.utils.json_to_sheet(yearlyData);
        XLSX.utils.book_append_sheet(wb, wsYearly, 'Годовой отчет');
        
        // Сохраняем файл
        const fileName = `report_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '../../exports', fileName);
        
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        XLSX.writeFile(wb, filePath);
        
        res.json({
            success: true,
            fileName,
            url: `/exports/${fileName}`
        });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Ошибка экспорта отчета' });
    }
});

module.exports = router;
