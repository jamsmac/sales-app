const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const db = require('../utils/database');

// Настройка multer
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
    fileFilter: (req, file, cb) => {
        if (file.originalname.match(/\.(xlsx|xls)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Только Excel файлы'));
        }
    }
});

// Upload file (admin only)
router.post('/upload', auth, (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    next();
}, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const stats = db.processFileData(data, req.file, req.user.id);
        
        res.json({
            success: true,
            stats: stats,
            message: `Файл обработан. Добавлено ${stats.new} новых записей.`
        });
    } catch (error) {
        console.error('File processing error:', error);
        res.status(500).json({ error: 'Ошибка обработки файла' });
    }
});

// Get files list
router.get('/', auth, (req, res) => {
    const files = db.getFiles();
    res.json(files);
});

module.exports = router;
