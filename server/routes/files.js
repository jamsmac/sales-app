const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        // Безопасное имя файла с timestamp
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});

// Фильтр файлов - только Excel
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/octet-stream' // fallback для некоторых браузеров
    ];
    
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    } else {
        cb(new Error('Разрешены только файлы Excel (.xlsx, .xls)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB максимум
        files: 1 // только один файл за раз
    }
});

// Middleware для проверки прав администратора
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            error: 'Доступ запрещен. Требуются права администратора.' 
        });
    }
    next();
};

// Валидация Excel структуры
const validateExcelStructure = (data) => {
    if (!Array.isArray(data) || data.length < 2) {
        throw new Error('Файл должен содержать заголовки и хотя бы одну строку данных');
    }
    
    const headers = data[0];
    if (!headers || headers.length < 13) {
        throw new Error('Файл должен содержать минимум 13 колонок данных');
    }
    
    // Проверяем наличие критически важных колонок
    const requiredColumns = [2, 10, 12]; // productName, totalAmount, operationDate
    for (let colIndex of requiredColumns) {
        let hasData = false;
        for (let i = 1; i < Math.min(data.length, 10); i++) { // проверяем первые 10 строк
            if (data[i] && data[i][colIndex]) {
                hasData = true;
                break;
            }
        }
        if (!hasData) {
            throw new Error(`Отсутствуют данные в критически важной колонке ${colIndex + 1}`);
        }
    }
    
    return true;
};

// Upload file
router.post('/upload', auth, adminOnly, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не был загружен' });
        }
        
        console.log(`📁 Обработка файла: ${req.file.originalname}`);
        
        // Чтение Excel файла
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Валидация структуры
        validateExcelStructure(data);
        
        // Обработка данных
        const stats = await db.processFileData(data, req.file, req.user.id);
        
        // Удаляем временный файл
        try {
            await fs.unlink(req.file.path);
        } catch (unlinkError) {
            console.warn('Не удалось удалить временный файл:', unlinkError);
        }
        
        console.log(`✅ Файл обработан: ${stats.new} новых записей из ${stats.total}`);
        
        res.json({
            success: true,
            message: `Файл успешно обработан. Добавлено ${stats.new} новых записей.`,
            stats: stats
        });
        
    } catch (error) {
        console.error('File upload error:', error);
        
        // Удаляем файл в случае ошибки
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.warn('Не удалось удалить файл после ошибки:', unlinkError);
            }
        }
        
        // Определяем тип ошибки для пользователя
        let userMessage = 'Ошибка обработки файла';
        if (error.message.includes('структур') || error.message.includes('колонок')) {
            userMessage = error.message;
        } else if (error.message.includes('Excel') || error.message.includes('XLSX')) {
            userMessage = 'Ошибка чтения Excel файла. Проверьте формат файла.';
        }
        
        res.status(400).json({ 
            error: userMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get uploaded files list
router.get('/', auth, adminOnly, async (req, res) => {
    try {
        const files = await db.getFiles();
        res.json(files);
    } catch (error) {
        console.error('Files fetch error:', error);
        res.status(500).json({ error: 'Ошибка получения списка файлов' });
    }
});

// Error handler для multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл слишком большой. Максимальный размер: 50MB' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Можно загружать только один файл за раз' });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: 'Неожиданное поле файла' });
        }
    }
    
    if (error.message.includes('Excel')) {
        return res.status(400).json({ error: error.message });
    }
    
    console.error('File upload middleware error:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
});

module.exports = router;
