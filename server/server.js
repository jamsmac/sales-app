const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

// Проверка окружения
require('./utils/check-env')();

// КРИТИЧЕСКАЯ ПРОВЕРКА JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-here' || JWT_SECRET.length < 32) {
    console.error('═══════════════════════════════════════════════════════');
    console.error('🔴 FATAL ERROR: JWT_SECRET не настроен!');
    console.error('═══════════════════════════════════════════════════════');
    console.error('1. Откройте файл .env');
    console.error('2. Установите JWT_SECRET минимум 32 символа');
    console.error('3. Пример: JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'));
    console.error('═══════════════════════════════════════════════════════');
    process.exit(1);
}

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const ordersRoutes = require('./routes/orders');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка логирования
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'sales-analytics' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// В development режиме также логируем в консоль
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Создаем папку для логов
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

app.use(compression());

// Настройка morgan для логирования HTTP запросов
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser для httpOnly cookies
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// CSRF защита
const csrf = require('csurf');
const csrfProtection = csrf({ 
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
});

// Применяем CSRF защиту ко всем POST/PUT/DELETE запросам
app.use('/api', csrfProtection);

// Endpoint для получения CSRF токена
app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '5.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Перенаправление с корня на login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/exports', express.static(path.join(__dirname, '../exports')));

// Выбор роутера файлов в зависимости от окружения
const DATABASE_TYPE = process.env.DATABASE_TYPE || 'sqlite';
const filesRouter = DATABASE_TYPE === 'supabase' || process.env.NODE_ENV === 'production'
    ? require('./routes/files-memory')  // Для облака (Railway/Heroku)
    : require('./routes/files');         // Для локальной разработки

console.log(`📁 Используется файловый роутер: ${DATABASE_TYPE === 'supabase' || process.env.NODE_ENV === 'production' ? 'memory' : 'disk'}`);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRouter);
app.use('/api/orders', ordersRoutes);
app.use('/api/reports', reportsRoutes);

const db = DATABASE_TYPE === 'supabase' 
    ? require('./utils/supabase')
    : require('./utils/database');

console.log(`🗄️ Используется база данных: ${DATABASE_TYPE}`);

// Database info endpoint
app.get('/api/database/info', require('./middleware/auth.middleware'), async (req, res) => {
    try {
        const info = await db.getDatabaseInfo();
        res.json(info);
    } catch (error) {
        logger.error('Database info error:', error);
        res.status(500).json({ error: 'Ошибка получения информации о базе данных' });
    }
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
    async (req, res) => {
        try {
            const db = require('./utils/database');
            const result = await db.clear();
            logger.info(`Database cleared by user ${req.user.username}`);
            res.json(result);
        } catch (error) {
            logger.error('Database clear error:', error);
            res.status(500).json({ error: 'Ошибка очистки базы данных' });
        }
    }
);

// Export endpoint
app.get('/api/export', require('./middleware/auth.middleware'), async (req, res) => {
    const XLSX = require('xlsx');
    const fs = require('fs').promises;
    const db = require('./utils/database');
    
    try {
        const orders = await db.getOrders();
        
        if (orders.length === 0) {
            return res.status(400).json({ error: 'Нет данных для экспорта' });
        }
        
        // Создаем workbook
        const wb = XLSX.utils.book_new();
        
        // Подготавливаем данные для экспорта
        const exportData = orders.map(order => ({
            'Номер заказа': order.orderNumber || '',
            'Код товара': order.productCode || '',
            'Название товара': order.productName || '',
            'Вариант': order.productVariant || '',
            'Тип оплаты': order.paymentType || '',
            'Количество': order.quantity || 0,
            'Единица': order.unit || '',
            'Цена за единицу': order.pricePerUnit || 0,
            'Скидка %': order.discountPercent || 0,
            'Сумма скидки': order.discountAmount || 0,
            'Общая сумма': order.totalAmount || 0,
            'Возврат': order.isReturn ? 'Да' : 'Нет',
            'Дата операции': order.operationDate || '',
            'Время операции': order.operationTime || '',
            'Кассир': order.cashier || '',
            'Смена': order.shift || '',
            'Номер чека': order.checkNumber || '',
            'Клиент': order.customerName || '',
            'Телефон': order.customerPhone || '',
            'Примечания': order.notes || '',
            'Статус': order.status || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Настраиваем ширину колонок
        const colWidths = [
            { wch: 15 }, // Номер заказа
            { wch: 12 }, // Код товара
            { wch: 25 }, // Название товара
            { wch: 15 }, // Вариант
            { wch: 12 }, // Тип оплаты
            { wch: 10 }, // Количество
            { wch: 8 },  // Единица
            { wch: 12 }, // Цена за единицу
            { wch: 10 }, // Скидка %
            { wch: 12 }, // Сумма скидки
            { wch: 12 }, // Общая сумма
            { wch: 8 },  // Возврат
            { wch: 18 }, // Дата операции
            { wch: 12 }, // Время операции
            { wch: 15 }, // Кассир
            { wch: 8 },  // Смена
            { wch: 15 }, // Номер чека
            { wch: 20 }, // Клиент
            { wch: 15 }, // Телефон
            { wch: 25 }, // Примечания
            { wch: 12 }  // Статус
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'Заказы');
        
        const fileName = `export_${new Date().toISOString().slice(0, 10)}_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '../exports', fileName);
        
        await fs.mkdir(path.join(__dirname, '../exports'), { recursive: true });
        XLSX.writeFile(wb, filePath);
        
        logger.info(`Export created by user ${req.user.username}: ${fileName}`);
        
        res.json({ 
            success: true,
            fileName: fileName,
            url: `/exports/${fileName}`,
            recordsCount: orders.length
        });
    } catch (error) {
        logger.error('Export error:', error);
        res.status(500).json({ error: 'Ошибка экспорта данных' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(err.status || 500).json({ 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(404).json({ 
        error: 'Маршрут не найден',
        path: req.url,
        method: req.method
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    
    try {
        const db = require('./utils/database');
        await db.close();
        logger.info('Database connection closed');
    } catch (error) {
        logger.error('Error closing database:', error);
    }
    
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    
    try {
        const db = require('./utils/database');
        await db.close();
        logger.info('Database connection closed');
    } catch (error) {
        logger.error('Error closing database:', error);
    }
    
    process.exit(0);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// ВАЖНО: добавьте '0.0.0.0' для Railway
app.listen(PORT, '0.0.0.0', () => {
    const startupMessage = `
    ╔═══════════════════════════════════════╗
    ║   📊 Система анализа продаж v5.0     ║
    ╠═══════════════════════════════════════╣
    ║   Сервер запущен на порту: ${PORT}      ║
    ║   URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:' + PORT} ║
    ║   Окружение: ${process.env.NODE_ENV || 'development'}              ║
    ║   База данных: SQLite                 ║
    ╠═══════════════════════════════════════╣
    ║   Тестовые учетные данные:           ║
    ║   Admin: admin / admin123             ║
    ║   Бухгалтер: buh1 / buh123          ║
    ╠═══════════════════════════════════════╣
    ║   ✅ SQLite база данных              ║
    ║   ✅ Безопасность (rate limiting)    ║
    ║   ✅ Валидация данных                ║
    ║   ✅ Логирование                     ║
    ║   ✅ Graceful shutdown               ║
    ╚═══════════════════════════════════════╝
    `;
    
    console.log(startupMessage);
    logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        database: 'SQLite'
    });
});
