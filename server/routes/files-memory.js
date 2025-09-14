// server/routes/files-memory.js
// АЛЬТЕРНАТИВНАЯ ВЕРСИЯ БЕЗ СОХРАНЕНИЯ НА ДИСК (для Railway)

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

console.log('📁 Files router (memory storage) загружен');

// Настройка multer для хранения в памяти вместо диска
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage, // Используем память вместо диска
    limits: { 
        fileSize: 10 * 1024 * 1024, // Ограничим 10MB для памяти
        files: 1
    },
    fileFilter: (req, file, cb) => {
        console.log('🔍 Проверка файла:', file.originalname);
        
        if (file.originalname.match(/\.(xlsx|xls)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Только Excel файлы (.xlsx, .xls) разрешены'));
        }
    }
});

// Upload endpoint с обработкой в памяти
router.post('/upload', 
    auth,
    (req, res, next) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Требуются права администратора' });
        }
        next();
    },
    upload.single('file'),
    async (req, res) => {
        console.log('📊 Обработка загруженного файла из памяти');
        
        if (!req.file) {
            console.error('❌ Файл не получен');
            return res.status(400).json({ error: 'Файл не был загружен' });
        }
        
        console.log('📄 Информация о файле:');
        console.log('   - Размер:', req.file.size, 'байт');
        console.log('   - Оригинальное имя:', req.file.originalname);
        console.log('   - MIME тип:', req.file.mimetype);
        
        try {
            // Читаем Excel прямо из буфера в памяти
            console.log('📖 Чтение Excel из буфера...');
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            
            console.log('   - Листов в файле:', workbook.SheetNames.length);
            
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            console.log('   - Строк данных:', data.length);
            
            // Создаем объект файла для совместимости с database.js
            const fileInfo = {
                filename: `memory-${Date.now()}`,
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            };
            
            // Обработка данных
            const stats = db.processFileData(data, fileInfo, req.user.id);
            console.log('✅ Данные обработаны:', stats);
            
            res.json({
                success: true,
                stats: stats,
                message: `Файл успешно обработан. Добавлено ${stats.new} новых записей.`,
                file: {
                    name: req.file.originalname,
                    size: req.file.size,
                    records: data.length - 1
                }
            });
            
        } catch (error) {
            console.error('❌ Ошибка обработки файла:', error);
            res.status(500).json({ 
                error: 'Ошибка обработки файла',
                message: error.message
            });
        }
    }
);

// Get files list
router.get('/', auth, (req, res) => {
    try {
        const files = db.getFiles();
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения списка файлов' });
    }
});

module.exports = router;
