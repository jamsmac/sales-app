const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const ordersRoutes = require('./routes/orders');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/exports', express.static(path.join(__dirname, '../exports')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reports', reportsRoutes);

// Database info endpoint
app.get('/api/database/info', require('./middleware/auth.middleware'), (req, res) => {
    const db = require('./utils/database');
    res.json(db.getInfo());
});

// Clear database (admin only)
app.delete('/api/database/clear', 
    require('./middleware/auth.middleware'),
    (req, res, next) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Требуются права администратора' });
        }
        next();
    },
    (req, res) => {
        const db = require('./utils/database');
        db.clear();
        res.json({ success: true, message: 'База данных очищена' });
    }
);

// Export endpoint
app.get('/api/export', require('./middleware/auth.middleware'), async (req, res) => {
    const XLSX = require('xlsx');
    const fs = require('fs').promises;
    const db = require('./utils/database');
    
    try {
        const orders = db.getOrders();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(orders);
        XLSX.utils.book_append_sheet(wb, ws, 'Orders');
        
        const fileName = `export_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '../exports', fileName);
        
        await fs.mkdir(path.join(__dirname, '../exports'), { recursive: true });
        XLSX.writeFile(wb, filePath);
        
        res.json({ 
            success: true,
            fileName: fileName,
            url: `/exports/${fileName}`
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка экспорта' });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   📊 Система анализа продаж v5.0     ║
    ╠═══════════════════════════════════════╣
    ║   Сервер запущен на порту: ${PORT}      ║
    ║   URL: http://localhost:${PORT}          ║
    ╠═══════════════════════════════════════╣
    ║   Тестовые учетные данные:           ║
    ║   Admin: admin / admin123             ║
    ║   Бухгалтер: buh1 / buh123          ║
    ╚═══════════════════════════════════════╝
    `);
});
