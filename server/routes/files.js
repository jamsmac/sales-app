const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

console.log('📁 Files router загружен');

// ОТЛАДКА: Проверка существования директории uploads
const uploadsDir = path.join(__dirname, '../../uploads');
fs.access(uploadsDir)
    .then(() => console.log('✅ Директория uploads существует:', uploadsDir))
    .catch(() => {
        console.log('⚠️ Создание директории uploads:', uploadsDir);
        return fs.mkdir(uploadsDir, { recursive: true });
    });

// Настройка multer с расширенной отладкой
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        console.log('📂 Multer: Определение директории для сохранения');
        const uploadDir = path.join(__dirname, '../../uploads');
        
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            console.log('✅ Директория готова:', uploadDir);
            cb(null, uploadDir);
        } catch (error) {
            console.error('❌ Ошибка создания директории:', error);
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
        console.log('📝 Multer: Генерация имени файла:', filename);
        cb(null, filename);
    }
});

// Создание multer instance с отладкой
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800,
        files: 1,
        fields: 10
    },
    fileFilter: (req, file, cb) => {
        console.log('🔍 Multer: Проверка файла');
        console.log('   - Оригинальное имя:', file.originalname);
        console.log('   - MIME тип:', file.mimetype);
        console.log('   - Поле формы:', file.fieldname);
        console.log('   - Кодировка:', file.encoding);
        
        if (file.originalname.match(/\.(xlsx|xls)$/i)) {
            console.log('✅ Файл прошел проверку типа');
            cb(null, true);
        } else {
            console.error('❌ Файл не прошел проверку типа');
            cb(new Error('Только Excel файлы (.xlsx, .xls) разрешены'));
        }
    }
});

// Middleware для логирования запросов
router.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    console.log('   Headers:', JSON.stringify(req.headers, null, 2));
    console.log('   User:', req.user ? req.user.username : 'не авторизован');
    next();
});

// Upload endpoint с расширенной отладкой
router.post('/upload', 
    // Проверка авторизации
    (req, res, next) => {
        console.log('🔐 Проверка авторизации для загрузки');
        auth(req, res, (err) => {
            if (err) {
                console.error('❌ Ошибка авторизации:', err);
                return res.status(401).json({ error: 'Требуется авторизация' });
            }
            console.log('✅ Пользователь авторизован:', req.user.username);
            next();
        });
    },
    // Проверка роли
    (req, res, next) => {
        console.log('👤 Проверка роли пользователя');
        if (req.user.role !== 'admin') {
            console.error('❌ Недостаточно прав. Роль:', req.user.role);
            return res.status(403).json({ error: 'Требуются права администратора' });
        }
        console.log('✅ Права администратора подтверждены');
        next();
    },
    // Обработка загрузки с отладкой
    (req, res, next) => {
        console.log('📤 Начало обработки загрузки файла');
        console.log('   Content-Type:', req.headers['content-type']);
        console.log('   Content-Length:', req.headers['content-length']);
        
        const uploadHandler = upload.single('file');
        
        uploadHandler(req, res, (err) => {
            if (err) {
                console.error('❌ Ошибка Multer:', err);
                console.error('   Код ошибки:', err.code);
                console.error('   Сообщение:', err.message);
                console.error('   Стек:', err.stack);
                
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ 
                        error: 'Файл слишком большой (максимум 50MB)',
                        details: `Размер файла: ${req.headers['content-length']} байт`
                    });
                }
                
                return res.status(400).json({ 
                    error: err.message || 'Ошибка при загрузке файла',
                    details: err.toString()
                });
            }
            
            console.log('✅ Multer обработал запрос успешно');
            next();
        });
    },
    // Обработка файла
    async (req, res) => {
        console.log('📊 Обработка загруженного файла');
        
        if (!req.file) {
            console.error('❌ req.file отсутствует');
            console.log('   req.body:', req.body);
            console.log('   req.files:', req.files);
            return res.status(400).json({ 
                error: 'Файл не был загружен',
                details: 'req.file is undefined'
            });
        }
        
        console.log('📄 Информация о загруженном файле:');
        console.log('   - Путь:', req.file.path);
        console.log('   - Размер:', req.file.size, 'байт');
        console.log('   - Оригинальное имя:', req.file.originalname);
        console.log('   - Сохранено как:', req.file.filename);
        
        try {
            // Проверка существования файла
            await fs.access(req.file.path);
            console.log('✅ Файл существует на диске');
            
            // Чтение Excel файла
            console.log('📖 Чтение Excel файла...');
            const workbook = XLSX.readFile(req.file.path);
            console.log('   - Листов в файле:', workbook.SheetNames.length);
            console.log('   - Названия листов:', workbook.SheetNames);
            
            const sheetName = workbook.SheetNames[0];
            console.log('   - Обработка листа:', sheetName);
            
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            console.log('   - Строк данных:', data.length);
            console.log('   - Колонок в первой строке:', data[0] ? data[0].length : 0);
            
            // Обработка данных
            console.log('💾 Сохранение данных в БД...');
            const stats = db.processFileData(data, req.file, req.user.id);
            console.log('✅ Данные обработаны:', stats);
            
            // Удаление временного файла (опционально)
            try {
                await fs.unlink(req.file.path);
                console.log('🗑️ Временный файл удален');
            } catch (e) {
                console.log('⚠️ Не удалось удалить временный файл:', e.message);
            }
            
            // Отправка успешного ответа
            const response = {
                success: true,
                stats: stats,
                message: `Файл успешно обработан. Добавлено ${stats.new} новых записей.`,
                file: {
                    name: req.file.originalname,
                    size: req.file.size,
                    records: data.length - 1
                }
            };
            
            console.log('✅ Отправка успешного ответа:', response);
            res.json(response);
            
        } catch (error) {
            console.error('❌ Ошибка обработки файла:', error);
            console.error('   Сообщение:', error.message);
            console.error('   Стек:', error.stack);
            
            // Попытка удалить файл при ошибке
            if (req.file && req.file.path) {
                try {
                    await fs.unlink(req.file.path);
                    console.log('🗑️ Файл удален после ошибки');
                } catch (e) {
                    console.log('⚠️ Не удалось удалить файл после ошибки');
                }
            }
            
            res.status(500).json({ 
                error: 'Ошибка обработки файла',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
);

// Get files list
router.get('/', auth, (req, res) => {
    console.log('📋 Запрос списка файлов');
    try {
        const files = db.getFiles();
        console.log(`✅ Отправка списка из ${files.length} файлов`);
        res.json(files);
    } catch (error) {
        console.error('❌ Ошибка получения списка файлов:', error);
        res.status(500).json({ error: 'Ошибка получения списка файлов' });
    }
});

// Тестовый endpoint для проверки
router.get('/test', (req, res) => {
    console.log('🧪 Тестовый запрос к files router');
    res.json({ 
        status: 'ok', 
        message: 'Files router работает',
        uploadDir: uploadsDir,
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800
    });
});

module.exports = router;
