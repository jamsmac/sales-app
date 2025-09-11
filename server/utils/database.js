const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        // Создаем папку для базы данных
        const dbDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // Подключение к SQLite базе данных
        this.db = new sqlite3.Database(path.join(dbDir, 'sales.db'), (err) => {
            if (err) {
                console.error('Ошибка подключения к базе данных:', err);
            } else {
                console.log('✅ Подключение к SQLite базе данных установлено');
                this.initTables();
            }
        });
    }
    
    // Инициализация таблиц
    initTables() {
        this.db.serialize(() => {
            // Таблица пользователей
            this.db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    fullName TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'accountant',
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Таблица заказов
            this.db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    orderNumber TEXT,
                    productCode TEXT,
                    productName TEXT NOT NULL,
                    productVariant TEXT DEFAULT 'Стандарт',
                    paymentTypeRaw TEXT,
                    paymentType TEXT NOT NULL,
                    quantity REAL DEFAULT 1,
                    unit TEXT DEFAULT 'шт',
                    pricePerUnit REAL DEFAULT 0,
                    discountPercent REAL DEFAULT 0,
                    discountAmount REAL DEFAULT 0,
                    totalAmount REAL NOT NULL,
                    isReturn BOOLEAN DEFAULT 0,
                    operationTime TEXT,
                    operationDate TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    day INTEGER NOT NULL,
                    cashier TEXT,
                    shift TEXT,
                    checkNumber TEXT,
                    customerName TEXT,
                    customerPhone TEXT,
                    notes TEXT,
                    status TEXT DEFAULT 'completed',
                    fileId TEXT,
                    uploadedBy INTEGER,
                    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    product TEXT, -- для совместимости
                    flavor TEXT,  -- для совместимости
                    price REAL,   -- для совместимости
                    date TEXT,    -- для совместимости
                    FOREIGN KEY (uploadedBy) REFERENCES users (id)
                )
            `);
            
            // Таблица файлов
            this.db.run(`
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fileName TEXT NOT NULL,
                    fileSize INTEGER,
                    uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                    recordsTotal INTEGER DEFAULT 0,
                    recordsNew INTEGER DEFAULT 0,
                    recordsDuplicate INTEGER DEFAULT 0,
                    recordsErrors INTEGER DEFAULT 0,
                    uploadedBy INTEGER,
                    FOREIGN KEY (uploadedBy) REFERENCES users (id)
                )
            `);
            
            // Создаем индексы для производительности
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (operationDate)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders (paymentType)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_product ON orders (productName)`);
            
            // Создаем тестовых пользователей если их нет
            this.createDefaultUsers();
        });
    }
    
    // Создание пользователей по умолчанию
    createDefaultUsers() {
        this.db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            if (err) {
                console.error('Ошибка проверки пользователей:', err);
                return;
            }
            
            if (row.count === 0) {
                const users = [
                    {
                        username: 'admin',
                        password: bcrypt.hashSync('admin123', 10),
                        fullName: 'Администратор',
                        role: 'admin'
                    },
                    {
                        username: 'buh1',
                        password: bcrypt.hashSync('buh123', 10),
                        fullName: 'Иванова А.П.',
                        role: 'accountant'
                    }
                ];
                
                const stmt = this.db.prepare(`
                    INSERT INTO users (username, password, fullName, role) 
                    VALUES (?, ?, ?, ?)
                `);
                
                users.forEach(user => {
                    stmt.run([user.username, user.password, user.fullName, user.role]);
                });
                
                stmt.finalize();
                console.log('✅ Созданы тестовые пользователи');
            }
        });
    }
    
    // Методы для работы с пользователями
    getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT * FROM users WHERE username = ?",
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
    
    getUserById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT * FROM users WHERE id = ?",
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
    
    // Методы для работы с заказами
    getOrders(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = "SELECT * FROM orders WHERE 1=1";
            const params = [];
            
            if (filters.startDate) {
                query += " AND date(operationDate) >= date(?)";
                params.push(filters.startDate);
            }
            if (filters.endDate) {
                query += " AND date(operationDate) <= date(?)";
                params.push(filters.endDate);
            }
            if (filters.paymentType) {
                query += " AND paymentType = ?";
                params.push(filters.paymentType);
            }
            if (filters.product) {
                query += " AND productName LIKE ?";
                params.push(`%${filters.product}%`);
            }
            
            query += " ORDER BY operationDate DESC";
            
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
    
    // Добавление заказа
    addOrder(order) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO orders (
                    orderNumber, productCode, productName, productVariant,
                    paymentTypeRaw, paymentType, quantity, unit, pricePerUnit,
                    discountPercent, discountAmount, totalAmount, isReturn,
                    operationTime, operationDate, year, month, day,
                    cashier, shift, checkNumber, customerName, customerPhone,
                    notes, status, fileId, uploadedBy, product, flavor, price, date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                order.orderNumber, order.productCode, order.productName, order.productVariant,
                order.paymentTypeRaw, order.paymentType, order.quantity, order.unit, order.pricePerUnit,
                order.discountPercent, order.discountAmount, order.totalAmount, order.isReturn ? 1 : 0,
                order.operationTime, order.operationDate, order.year, order.month, order.day,
                order.cashier, order.shift, order.checkNumber, order.customerName, order.customerPhone,
                order.notes, order.status, order.fileId, order.uploadedBy,
                order.product, order.flavor, order.price, order.date
            ], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...order });
            });
            
            stmt.finalize();
        });
    }
    
    // Проверка дубликатов
    checkDuplicate(orderNumber, checkNumber, operationDate) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT id FROM orders WHERE orderNumber = ? AND checkNumber = ? AND operationDate = ?",
                [orderNumber, checkNumber, operationDate],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }
    
    // Обработка файла с данными
    async processFileData(rawExcelData, file, userId) {
        const stats = {
            total: 0,
            new: 0,
            updated: 0,
            duplicate: 0,
            errors: 0
        };
        
        for (let i = 1; i < rawExcelData.length; i++) {
            const row = rawExcelData[i];
            if (!row || row.length < 13) continue;
            
            stats.total++;
            
            try {
                // Определяем тип платежа
                const paymentRaw = String(row[4] || '').toLowerCase().trim();
                let paymentType = this.detectPaymentType(paymentRaw);
                
                // Парсим сумму
                const amount = parseFloat(String(row[10] || '0').replace(/[^\d.-]/g, '')) || 0;
                
                // Если сумма отрицательная - это возврат
                if (amount < 0) {
                    paymentType = 'RETURN';
                }
                
                // Парсим дату
                const dateStr = String(row[12] || '').trim();
                const parsedDate = this.parseDate(dateStr);
                
                // Создаем полную запись со ВСЕМИ данными
                const order = {
                    orderNumber: row[0] || '',
                    productCode: row[1] || '',
                    productName: row[2] || 'Без названия',
                    productVariant: row[3] || 'Стандарт',
                    paymentTypeRaw: row[4] || '',
                    paymentType: paymentType,
                    
                    // Числовые поля
                    quantity: parseFloat(row[5]) || 1,
                    unit: row[6] || 'шт',
                    pricePerUnit: parseFloat(row[7]) || 0,
                    discountPercent: parseFloat(row[8]) || 0,
                    discountAmount: parseFloat(row[9]) || 0,
                    totalAmount: Math.abs(amount),
                    isReturn: amount < 0,
                    
                    // Временные поля
                    operationTime: row[11] || '',
                    operationDate: parsedDate.iso,
                    year: parsedDate.year,
                    month: parsedDate.month,
                    day: parsedDate.day,
                    
                    // Дополнительные поля
                    cashier: row[13] || '',
                    shift: row[14] || '',
                    checkNumber: row[15] || '',
                    customerName: row[16] || '',
                    customerPhone: row[17] || '',
                    notes: row[18] || '',
                    status: row[19] || 'completed',
                    
                    // Служебные поля
                    fileId: file.filename,
                    uploadedBy: userId,
                    
                    // Совместимость со старым API
                    product: row[2] || 'Без названия',
                    flavor: row[3] || 'Стандарт',
                    price: Math.abs(amount),
                    date: parsedDate.iso
                };
                
                // Проверка дубликатов
                const isDuplicate = await this.checkDuplicate(
                    order.orderNumber, 
                    order.checkNumber, 
                    order.operationDate
                );
                
                if (isDuplicate) {
                    stats.duplicate++;
                } else {
                    await this.addOrder(order);
                    stats.new++;
                }
                
            } catch (error) {
                console.error(`Ошибка обработки строки ${i}:`, error);
                stats.errors++;
            }
        }
        
        // Сохраняем информацию о файле
        await this.addFile({
            fileName: file.originalname,
            fileSize: file.size,
            recordsTotal: stats.total,
            recordsNew: stats.new,
            recordsDuplicate: stats.duplicate,
            recordsErrors: stats.errors,
            uploadedBy: userId
        });
        
        return stats;
    }
    
    // Добавление файла
    addFile(fileData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO files (fileName, fileSize, recordsTotal, recordsNew, recordsDuplicate, recordsErrors, uploadedBy)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                fileData.fileName, fileData.fileSize, fileData.recordsTotal,
                fileData.recordsNew, fileData.recordsDuplicate, fileData.recordsErrors,
                fileData.uploadedBy
            ], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...fileData });
            });
            
            stmt.finalize();
        });
    }
    
    // Получение статистики
    getStatistics() {
        return new Promise((resolve, reject) => {
            const queries = [
                "SELECT COUNT(*) as total FROM orders",
                "SELECT SUM(totalAmount) as totalRevenue FROM orders WHERE isReturn = 0",
                "SELECT SUM(totalAmount) as returns FROM orders WHERE isReturn = 1",
                `SELECT 
                    paymentType,
                    COUNT(*) as count,
                    SUM(totalAmount) as total
                 FROM orders 
                 WHERE isReturn = 0
                 GROUP BY paymentType`
            ];
            
            Promise.all([
                new Promise((res, rej) => this.db.get(queries[0], (err, row) => err ? rej(err) : res(row))),
                new Promise((res, rej) => this.db.get(queries[1], (err, row) => err ? rej(err) : res(row))),
                new Promise((res, rej) => this.db.get(queries[2], (err, row) => err ? rej(err) : res(row))),
                new Promise((res, rej) => this.db.all(queries[3], (err, rows) => err ? rej(err) : res(rows)))
            ]).then(([totalData, revenueData, returnsData, paymentData]) => {
                const stats = {
                    total: totalData.total || 0,
                    totalRevenue: revenueData.totalRevenue || 0,
                    returns: returnsData.returns || 0,
                    byPaymentType: {}
                };
                
                paymentData.forEach(row => {
                    stats.byPaymentType[row.paymentType] = {
                        count: row.count,
                        total: row.total
                    };
                });
                
                resolve(stats);
            }).catch(reject);
        });
    }
    
    // Получение файлов
    getFiles() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT f.*, u.fullName as uploadedByName 
                FROM files f 
                LEFT JOIN users u ON f.uploadedBy = u.id 
                ORDER BY f.uploadDate DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
    
    // Информация о базе данных
    getInfo() {
        return new Promise((resolve, reject) => {
            Promise.all([
                new Promise((res, rej) => this.db.get("SELECT COUNT(*) as count FROM orders", (err, row) => err ? rej(err) : res(row))),
                new Promise((res, rej) => this.db.get("SELECT COUNT(*) as count FROM files", (err, row) => err ? rej(err) : res(row))),
                new Promise((res, rej) => this.db.get("SELECT MAX(uploadedAt) as lastUpdate FROM orders", (err, row) => err ? rej(err) : res(row)))
            ]).then(([ordersData, filesData, updateData]) => {
                resolve({
                    totalRecords: ordersData.count || 0,
                    totalFiles: filesData.count || 0,
                    lastUpdate: updateData.lastUpdate,
                    dbSize: 'SQLite DB'
                });
            }).catch(reject);
        });
    }
    
    // Очистка базы данных (только данные, не пользователи)
    clear() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run("DELETE FROM orders");
                this.db.run("DELETE FROM files", (err) => {
                    if (err) reject(err);
                    else resolve({ 
                        success: true, 
                        message: 'База данных очищена (пользователи сохранены)' 
                    });
                });
            });
        });
    }
    
    // Получение данных для отчетности
    getReportsData() {
        return new Promise((resolve, reject) => {
            const queries = {
                yearly: `
                    SELECT year, paymentType, COUNT(*) as count, SUM(totalAmount) as total
                    FROM orders WHERE isReturn = 0
                    GROUP BY year, paymentType
                `,
                monthly: `
                    SELECT year, month, paymentType, COUNT(*) as count, SUM(totalAmount) as total
                    FROM orders WHERE isReturn = 0
                    GROUP BY year, month, paymentType
                `,
                daily: `
                    SELECT year, month, day, paymentType, COUNT(*) as count, SUM(totalAmount) as total
                    FROM orders WHERE isReturn = 0
                    GROUP BY year, month, day, paymentType
                `,
                products: `
                    SELECT 
                        productName,
                        productVariant,
                        COUNT(CASE WHEN isReturn = 0 THEN 1 END) as sales,
                        COUNT(CASE WHEN isReturn = 1 THEN 1 END) as returns,
                        SUM(CASE WHEN isReturn = 0 THEN totalAmount ELSE 0 END) as revenue,
                        SUM(CASE WHEN isReturn = 1 THEN totalAmount ELSE 0 END) as returnAmount,
                        SUM(CASE WHEN isReturn = 0 THEN quantity ELSE 0 END) as quantity
                    FROM orders
                    GROUP BY productName, productVariant
                `
            };
            
            Promise.all([
                new Promise((res, rej) => this.db.all(queries.yearly, (err, rows) => err ? rej(err) : res(rows))),
                new Promise((res, rej) => this.db.all(queries.monthly, (err, rows) => err ? rej(err) : res(rows))),
                new Promise((res, rej) => this.db.all(queries.daily, (err, rows) => err ? rej(err) : res(rows))),
                new Promise((res, rej) => this.db.all(queries.products, (err, rows) => err ? rej(err) : res(rows)))
            ]).then(([yearly, monthly, daily, products]) => {
                resolve({
                    yearly: this.groupReportData(yearly, 'year'),
                    monthly: this.groupReportData(monthly, 'year', 'month'),
                    daily: this.groupReportData(daily, 'year', 'month', 'day'),
                    products: this.groupProductData(products)
                });
            }).catch(reject);
        });
    }
    
    // Группировка данных отчетов
    groupReportData(data, ...keys) {
        const result = {};
        data.forEach(row => {
            const key = keys.map(k => row[k]).join('_');
            if (!result[key]) {
                result[key] = this.initPaymentData();
            }
            result[key][row.paymentType] = {
                count: row.count,
                total: row.total
            };
        });
        return result;
    }
    
    // Группировка данных по продуктам
    groupProductData(data) {
        const result = {};
        data.forEach(row => {
            const key = `${row.productName}|||${row.productVariant}`;
            result[key] = {
                productName: row.productName,
                productVariant: row.productVariant,
                sales: row.sales || 0,
                returns: row.returns || 0,
                revenue: row.revenue || 0,
                returnAmount: row.returnAmount || 0,
                quantity: row.quantity || 0
            };
        });
        return result;
    }
    
    initPaymentData() {
        return {
            CASH: { count: 0, total: 0 },
            QR: { count: 0, total: 0 },
            VIP: { count: 0, total: 0 },
            CARD: { count: 0, total: 0 },
            RETURN: { count: 0, total: 0 }
        };
    }
    
    // Получение детализации для периода
    getPeriodDetails(periodKey, paymentType = 'ALL') {
        return new Promise((resolve, reject) => {
            let query = "SELECT * FROM orders WHERE 1=1";
            const params = [];
            
            // Фильтр по типу платежа
            if (paymentType !== 'ALL') {
                query += " AND paymentType = ?";
                params.push(paymentType);
            }
            
            // Фильтр по периоду
            if (periodKey.includes('_')) {
                const parts = periodKey.split('_');
                if (parts.length === 2) {
                    // Месяц
                    query += " AND year = ? AND month = ?";
                    params.push(parts[0], parts[1]);
                } else if (parts.length === 3) {
                    // День
                    query += " AND year = ? AND month = ? AND day = ?";
                    params.push(parts[0], parts[1], parts[2]);
                }
            } else {
                // Год
                query += " AND year = ?";
                params.push(periodKey);
            }
            
            query += " ORDER BY operationDate DESC";
            
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
    
    // Вспомогательные методы
    detectPaymentType(str) {
        if (!str) return 'UNKNOWN';
        const s = String(str).toLowerCase();
        if (s.includes('наличн')) return 'CASH';
        if (s.includes('таможен') || s.includes('qr')) return 'QR';
        if (s.includes('vip')) return 'VIP';
        if (s.includes('карт') || s.includes('кредит')) return 'CARD';
        return 'UNKNOWN';
    }
    
    parseDate(dateStr) {
        if (!dateStr) {
            const now = new Date();
            return {
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                day: now.getDate(),
                iso: now.toISOString()
            };
        }
        
        let year, month, day;
        
        // Различные форматы дат
        if (dateStr.includes('-')) {
            const parts = dateStr.split(' ')[0].split('-');
            if (parts.length === 3) {
                year = parseInt(parts[0]);
                month = parseInt(parts[1]);
                day = parseInt(parts[2]);
            }
        } else if (dateStr.includes('.')) {
            const parts = dateStr.split(' ')[0].split('.');
            if (parts.length === 3) {
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
                year = parseInt(parts[2]);
            }
        } else if (dateStr.includes('/')) {
            const parts = dateStr.split(' ')[0].split('/');
            if (parts.length === 3) {
                month = parseInt(parts[0]);
                day = parseInt(parts[1]);
                year = parseInt(parts[2]);
            }
        }
        
        // Валидация
        if (year && month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const date = new Date(year, month - 1, day);
            return {
                year,
                month,
                day,
                iso: date.toISOString()
            };
        }
        
        // Возврат текущей даты если парсинг не удался
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            iso: now.toISOString()
        };
    }
    
    // Закрытие соединения с базой данных
    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Ошибка закрытия базы данных:', err);
                } else {
                    console.log('✅ Соединение с базой данных закрыто');
                }
                resolve();
            });
        });
    }
}

module.exports = new Database();
