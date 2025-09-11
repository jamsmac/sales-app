const bcrypt = require('bcryptjs');

// Простая база данных в памяти
class Database {
    constructor() {
        // Пользователи системы
        this.users = [
            {
                id: 1,
                username: 'admin',
                password: bcrypt.hashSync('admin123', 10),
                fullName: 'Администратор',
                role: 'admin'
            },
            {
                id: 2,
                username: 'buh1',
                password: bcrypt.hashSync('buh123', 10),
                fullName: 'Иванова А.П.',
                role: 'accountant'
            }
        ];
        
        // Полные данные заказов со ВСЕМИ колонками
        this.orders = [];
        this.files = [];
        
        // Агрегированные данные для отчетности
        this.yearlyData = {};
        this.monthlyData = {};
        this.dailyData = {};
        this.productData = {};
    }
    
    // Users
    getUserByUsername(username) {
        return this.users.find(u => u.username === username);
    }
    
    getUserById(id) {
        return this.users.find(u => u.id === id);
    }
    
    // Orders
    getOrders(filters = {}) {
        let orders = [...this.orders];
        
        if (filters.startDate) {
            orders = orders.filter(o => new Date(o.date) >= new Date(filters.startDate));
        }
        if (filters.endDate) {
            orders = orders.filter(o => new Date(o.date) <= new Date(filters.endDate));
        }
        if (filters.paymentType) {
            orders = orders.filter(o => o.paymentType === filters.paymentType);
        }
        if (filters.product) {
            orders = orders.filter(o => 
                o.product.toLowerCase().includes(filters.product.toLowerCase())
            );
        }
        
        return orders;
    }
    
    // ИСПРАВЛЕНО: Очистка БД НЕ удаляет пользователей
    clear() {
        // Очищаем только данные, НО НЕ ПОЛЬЗОВАТЕЛЕЙ!
        this.orders = [];
        this.files = [];
        this.yearlyData = {};
        this.monthlyData = {};
        this.dailyData = {};
        this.productData = {};
        
        return { 
            success: true, 
            message: 'База данных очищена (пользователи сохранены)' 
        };
    }

    // Обработка файла с сохранением ВСЕХ 20 колонок
    processFileData(rawExcelData, file, userId) {
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
                    id: this.orders.length + 1,
                    
                    // Основные поля
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
                    uploadedAt: new Date(),
                    
                    // Совместимость со старым API
                    product: row[2] || 'Без названия',
                    flavor: row[3] || 'Стандарт',
                    price: Math.abs(amount),
                    date: parsedDate.iso
                };
                
                // Проверка дубликатов
                const exists = this.orders.find(o => 
                    o.orderNumber === order.orderNumber && 
                    o.checkNumber === order.checkNumber &&
                    o.operationDate === order.operationDate
                );
                
                if (exists) {
                    stats.duplicate++;
                } else {
                    this.orders.push(order);
                    stats.new++;
                    
                    // Обновляем агрегированные данные для отчетности
                    this.updateAggregatedData(order);
                }
                
            } catch (error) {
                console.error(`Ошибка обработки строки ${i}:`, error);
                stats.errors++;
            }
        }
        
        // Сохраняем информацию о файле
        this.files.push({
            id: this.files.length + 1,
            fileName: file.originalname,
            fileSize: file.size,
            uploadDate: new Date(),
            recordsTotal: stats.total,
            recordsNew: stats.new,
            recordsDuplicate: stats.duplicate,
            recordsErrors: stats.errors,
            uploadedBy: userId
        });
        
        return stats;
    }
    
    // Обновление агрегированных данных для отчетности
    updateAggregatedData(order) {
        const yearKey = `${order.year}`;
        const monthKey = `${order.year}_${order.month}`;
        const dayKey = `${order.year}_${order.month}_${order.day}`;
        
        // Инициализация структур
        if (!this.yearlyData[yearKey]) {
            this.yearlyData[yearKey] = this.initPaymentData();
        }
        if (!this.monthlyData[monthKey]) {
            this.monthlyData[monthKey] = this.initPaymentData();
        }
        if (!this.dailyData[dayKey]) {
            this.dailyData[dayKey] = this.initPaymentData();
        }
        
        // Обновление данных
        const type = order.paymentType;
        const amount = order.totalAmount;
        
        this.yearlyData[yearKey][type].count++;
        this.yearlyData[yearKey][type].total += amount;
        
        this.monthlyData[monthKey][type].count++;
        this.monthlyData[monthKey][type].total += amount;
        
        this.dailyData[dayKey][type].count++;
        this.dailyData[dayKey][type].total += amount;
        
        // Обновление данных по продуктам
        const productKey = `${order.productName}|||${order.productVariant}`;
        if (!this.productData[productKey]) {
            this.productData[productKey] = {
                productCode: order.productCode,
                productName: order.productName,
                productVariant: order.productVariant,
                sales: 0,
                returns: 0,
                revenue: 0,
                returnAmount: 0,
                quantity: 0
            };
        }
        
        if (order.isReturn) {
            this.productData[productKey].returns++;
            this.productData[productKey].returnAmount += amount;
        } else {
            this.productData[productKey].sales++;
            this.productData[productKey].revenue += amount;
            this.productData[productKey].quantity += order.quantity;
        }
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
    
    // Statistics
    getStatistics() {
        const stats = {
            total: this.orders.length,
            totalRevenue: this.orders.reduce((sum, o) => sum + o.price, 0),
            byPaymentType: {},
            byProduct: {}
        };
        
        this.orders.forEach(order => {
            // По типам оплаты
            if (!stats.byPaymentType[order.paymentType]) {
                stats.byPaymentType[order.paymentType] = {
                    count: 0,
                    total: 0
                };
            }
            stats.byPaymentType[order.paymentType].count++;
            stats.byPaymentType[order.paymentType].total += order.price;
        });
        
        return stats;
    }
    
    // Files
    getFiles() {
        return this.files.map(f => ({
            ...f,
            uploadedByName: this.getUserById(f.uploadedBy)?.fullName
        }));
    }
    
    // Database info
    getInfo() {
        return {
            totalRecords: this.orders.length,
            totalFiles: this.files.length,
            lastUpdate: this.orders.length > 0 
                ? this.orders[this.orders.length - 1].createdAt 
                : null,
            dbSize: JSON.stringify(this).length / 1024
        };
    }
    
    // Clear database
    clear() {
        this.orders = [];
        this.files = [];
        this.changelog = [];
    }
    
    // Helpers
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
    
    // Получение данных для отчетности
    getReportsData() {
        return {
            yearly: this.yearlyData,
            monthly: this.monthlyData,
            daily: this.dailyData,
            products: this.productData
        };
    }
    
    // Получение детализации для периода
    getPeriodDetails(periodKey, paymentType = 'ALL') {
        return this.orders.filter(order => {
            // Фильтр по типу платежа
            if (paymentType !== 'ALL' && order.paymentType !== paymentType) {
                return false;
            }
            
            // Фильтр по периоду
            if (periodKey.includes('_')) {
                const parts = periodKey.split('_');
                if (parts.length === 2) {
                    // Месяц
                    return order.year == parts[0] && order.month == parts[1];
                } else if (parts.length === 3) {
                    // День
                    return order.year == parts[0] && 
                           order.month == parts[1] && 
                           order.day == parts[2];
                }
            } else {
                // Год
                return order.year == periodKey;
            }
            
            return false;
        });
    }
}

module.exports = new Database();
