const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

console.log('🗄️ Supabase database utility загружен');

class SupabaseDatabase {
    constructor() {
        // Инициализация Supabase клиента
        this.supabaseUrl = process.env.SUPABASE_URL;
        this.supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Используем service key для серверных операций
        
        if (!this.supabaseUrl || !this.supabaseKey) {
            console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_KEY');
            throw new Error('Supabase configuration missing');
        }
        
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
            db: {
                schema: 'public',
            },
            auth: {
                persistSession: false
            },
            global: {
                headers: { 'x-client': 'sales-analytics-v5' },
            },
        });
        console.log('✅ Supabase клиент инициализирован');
        
        // Добавляем retry логику
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 секунда
    }

    // Инициализация базы данных (проверка подключения)
    async init() {
        try {
            console.log('🔍 Проверка подключения к Supabase...');
            const { data, error } = await this.supabase
                .from('users')
                .select('count')
                .limit(1);
            
            if (error) {
                console.error('❌ Ошибка подключения к Supabase:', error);
                throw error;
            }
            
            console.log('✅ Подключение к Supabase успешно');
            return true;
        } catch (error) {
            console.error('❌ Ошибка инициализации Supabase:', error);
            throw error;
        }
    }

    // Аутентификация пользователя
    async authenticateUser(username, password) {
        try {
            console.log('🔐 Аутентификация пользователя:', username);
            
            const { data: users, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .limit(1);
            
            if (error) {
                console.error('❌ Ошибка запроса пользователя:', error);
                throw error;
            }
            
            if (!users || users.length === 0) {
                console.log('❌ Пользователь не найден:', username);
                return null;
            }
            
            const user = users[0];
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
                console.log('❌ Неверный пароль для пользователя:', username);
                return null;
            }
            
            // Обновляем время последнего входа
            await this.supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', user.id);
            
            console.log('✅ Пользователь аутентифицирован:', username);
            return {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role
            };
        } catch (error) {
            console.error('❌ Ошибка аутентификации:', error);
            throw error;
        }
    }

    // Получение всех заказов
    async getOrders() {
        try {
            console.log('📊 Получение заказов из Supabase...');
            
            const { data: orders, error } = await this.supabase
                .from('orders')
                .select('*')
                .order('operation_date', { ascending: false });
            
            if (error) {
                console.error('❌ Ошибка получения заказов:', error);
                throw error;
            }
            
            console.log(`✅ Получено ${orders.length} заказов`);
            return orders.map(order => ({
                id: order.id,
                orderNumber: order.order_number,
                product: order.product_name,
                productName: order.product_name,
                flavor: order.product_variant,
                productVariant: order.product_variant,
                paymentType: order.payment_type,
                quantity: parseFloat(order.quantity),
                price: parseFloat(order.total_amount),
                totalAmount: parseFloat(order.total_amount),
                isReturn: order.is_return,
                date: order.operation_date,
                operationDate: order.operation_date,
                cashier: order.cashier
            }));
        } catch (error) {
            console.error('❌ Ошибка получения заказов:', error);
            throw error;
        }
    }

    // Получение статистики
    async getStats() {
        try {
            console.log('📈 Получение статистики из Supabase...');
            
            // Общая статистика
            const { data: totalStats, error: totalError } = await this.supabase
                .rpc('get_total_stats');
            
            if (totalError) {
                console.log('⚠️ RPC функция недоступна, используем альтернативный запрос');
                
                // Альтернативный способ получения статистики
                const { data: orders, error } = await this.supabase
                    .from('orders')
                    .select('payment_type, total_amount, is_return');
                
                if (error) throw error;
                
                const stats = {
                    totalRevenue: 0,
                    byPaymentType: {},
                    returns: 0
                };
                
                orders.forEach(order => {
                    const amount = parseFloat(order.total_amount);
                    
                    if (order.is_return) {
                        stats.returns += amount;
                    } else {
                        stats.totalRevenue += amount;
                        
                        if (!stats.byPaymentType[order.payment_type]) {
                            stats.byPaymentType[order.payment_type] = { total: 0, count: 0 };
                        }
                        
                        stats.byPaymentType[order.payment_type].total += amount;
                        stats.byPaymentType[order.payment_type].count += 1;
                    }
                });
                
                console.log('✅ Статистика рассчитана');
                return stats;
            }
            
            return totalStats;
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            throw error;
        }
    }

    // Обработка данных из файла
    async processFileData(data, fileInfo, userId) {
        try {
            console.log('💾 Обработка данных файла в Supabase...');
            console.log(`   - Строк данных: ${data.length}`);
            
            const stats = {
                total: data.length - 1, // Исключаем заголовок
                new: 0,
                updated: 0,
                duplicate: 0,
                errors: 0
            };
            
            // Сначала сохраняем информацию о файле
            const { data: fileRecord, error: fileError } = await this.supabase
                .from('uploaded_files')
                .insert({
                    file_name: fileInfo.filename,
                    original_name: fileInfo.originalname,
                    file_size: fileInfo.size,
                    mime_type: fileInfo.mimetype,
                    uploaded_by: userId,
                    processing_status: 'processing'
                })
                .select()
                .single();
            
            if (fileError) {
                console.error('❌ Ошибка сохранения файла:', fileError);
                throw fileError;
            }
            
            const fileId = fileRecord.id;
            console.log(`✅ Файл сохранен с ID: ${fileId}`);
            
            // Обрабатываем данные (пропускаем заголовок)
            const orders = [];
            
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                
                try {
                    // Парсинг строки данных
                    const order = this.parseOrderRow(row, fileId, userId);
                    if (order) {
                        orders.push(order);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка обработки строки ${i}:`, error);
                    stats.errors++;
                }
            }
            
            // Массовая вставка заказов
            if (orders.length > 0) {
                console.log(`📝 Вставка ${orders.length} заказов...`);
                
                const { data: insertedOrders, error: insertError } = await this.supabase
                    .from('orders')
                    .insert(orders)
                    .select();
                
                if (insertError) {
                    console.error('❌ Ошибка вставки заказов:', insertError);
                    stats.errors += orders.length;
                } else {
                    stats.new = insertedOrders.length;
                    console.log(`✅ Вставлено ${stats.new} заказов`);
                }
            }
            
            // Обновляем статистику файла
            await this.supabase
                .from('uploaded_files')
                .update({
                    records_total: stats.total,
                    records_new: stats.new,
                    records_updated: stats.updated,
                    records_duplicate: stats.duplicate,
                    records_error: stats.errors,
                    processing_status: 'completed'
                })
                .eq('id', fileId);
            
            console.log('✅ Обработка файла завершена:', stats);
            return stats;
            
        } catch (error) {
            console.error('❌ Ошибка обработки файла:', error);
            throw error;
        }
    }

    // Парсинг строки заказа
    parseOrderRow(row, fileId, userId) {
        try {
            // Предполагаемая структура: Номер, Код, Товар, Вариант, Тип оплаты, Кол-во, Ед., Цена, Скидка%, Скидка, Сумма, Время, Дата, Кассир
            const [
                orderNumber, productCode, productName, productVariant, paymentType,
                quantity, unit, pricePerUnit, discountPercent, discountAmount,
                totalAmount, time, date, cashier
            ] = row;
            
            if (!productName || !totalAmount || !date) {
                console.log('⚠️ Пропуск строки с недостающими данными');
                return null;
            }
            
            // Парсинг даты
            const operationDate = this.parseDate(date);
            if (!operationDate) {
                console.log('⚠️ Некорректная дата:', date);
                return null;
            }
            
            const dateObj = new Date(operationDate);
            
            return {
                order_number: orderNumber || null,
                product_code: productCode || null,
                product_name: String(productName).trim(),
                product_variant: productVariant ? String(productVariant).trim() : null,
                payment_type: this.normalizePaymentType(paymentType),
                payment_type_raw: paymentType || null,
                quantity: parseFloat(quantity) || 1,
                unit: unit || 'шт',
                price_per_unit: parseFloat(pricePerUnit) || 0,
                discount_percent: parseFloat(discountPercent) || 0,
                discount_amount: parseFloat(discountAmount) || 0,
                total_amount: parseFloat(totalAmount) || 0,
                is_return: this.isReturnTransaction(paymentType, totalAmount),
                operation_date: operationDate,
                operation_time: time || null,
                year: dateObj.getFullYear(),
                month: dateObj.getMonth() + 1,
                day: dateObj.getDate(),
                cashier: cashier || null,
                file_id: fileId,
                uploaded_by: userId
            };
        } catch (error) {
            console.error('❌ Ошибка парсинга строки:', error);
            return null;
        }
    }

    // Нормализация типа оплаты
    normalizePaymentType(paymentType) {
        if (!paymentType) return 'UNKNOWN';
        
        const type = String(paymentType).toUpperCase().trim();
        
        if (type.includes('НАЛИЧН') || type.includes('CASH')) return 'CASH';
        if (type.includes('QR') || type.includes('КР')) return 'QR';
        if (type.includes('VIP') || type.includes('ВИП')) return 'VIP';
        if (type.includes('КАРТ') || type.includes('CARD')) return 'CARD';
        if (type.includes('ВОЗВРАТ') || type.includes('RETURN')) return 'RETURN';
        
        return type;
    }

    // Проверка на возврат
    isReturnTransaction(paymentType, amount) {
        if (paymentType && String(paymentType).toUpperCase().includes('ВОЗВРАТ')) {
            return true;
        }
        
        if (parseFloat(amount) < 0) {
            return true;
        }
        
        return false;
    }

    // Парсинг даты
    parseDate(dateStr) {
        if (!dateStr) return null;
        
        try {
            // Попробуем разные форматы
            const str = String(dateStr).trim();
            
            // DD.MM.YYYY
            if (str.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
                const [day, month, year] = str.split('.');
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            // YYYY-MM-DD
            if (str.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                return str;
            }
            
            // Попробуем стандартный парсинг
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
            
            return null;
        } catch (error) {
            console.error('❌ Ошибка парсинга даты:', error);
            return null;
        }
    }

    // Получение списка файлов
    async getFiles() {
        try {
            const { data: files, error } = await this.supabase
                .from('uploaded_files')
                .select(`
                    *,
                    uploader:uploaded_by(full_name)
                `)
                .order('uploaded_at', { ascending: false });
            
            if (error) throw error;
            
            return files.map(file => ({
                id: file.id,
                fileName: file.file_name,
                originalName: file.original_name,
                fileSize: file.file_size,
                uploadDate: file.uploaded_at,
                recordsTotal: file.records_total,
                recordsNew: file.records_new,
                recordsUpdated: file.records_updated,
                recordsDuplicate: file.records_duplicate,
                recordsErrors: file.records_error,
                uploadedByName: file.uploader?.full_name || 'Неизвестно',
                processingStatus: file.processing_status
            }));
        } catch (error) {
            console.error('❌ Ошибка получения файлов:', error);
            throw error;
        }
    }

    // Получение информации о базе данных
    async getDatabaseInfo() {
        try {
            const { data: ordersCount } = await this.supabase
                .from('orders')
                .select('id', { count: 'exact', head: true });
            
            const { data: filesCount } = await this.supabase
                .from('uploaded_files')
                .select('id', { count: 'exact', head: true });
            
            const { data: lastFile } = await this.supabase
                .from('uploaded_files')
                .select('uploaded_at')
                .order('uploaded_at', { ascending: false })
                .limit(1);
            
            return {
                totalRecords: ordersCount?.length || 0,
                totalFiles: filesCount?.length || 0,
                lastUpdate: lastFile?.[0]?.uploaded_at || null,
                dbSize: 'Supabase (облачная БД)'
            };
        } catch (error) {
            console.error('❌ Ошибка получения информации о БД:', error);
            throw error;
        }
    }

    // Очистка базы данных
    async clearDatabase() {
        try {
            console.log('🗑️ Очистка базы данных...');
            
            // Удаляем заказы
            const { error: ordersError } = await this.supabase
                .from('orders')
                .delete()
                .neq('id', 0); // Удаляем все записи
            
            if (ordersError) throw ordersError;
            
            // Удаляем файлы
            const { error: filesError } = await this.supabase
                .from('uploaded_files')
                .delete()
                .neq('id', 0);
            
            if (filesError) throw filesError;
            
            // Очищаем агрегированные данные
            const { error: summaryError } = await this.supabase
                .from('sales_summary')
                .delete()
                .neq('id', 0);
            
            if (summaryError) throw summaryError;
            
            const { error: productsError } = await this.supabase
                .from('products_summary')
                .delete()
                .neq('id', 0);
            
            if (productsError) throw productsError;
            
            console.log('✅ База данных очищена');
            return true;
        } catch (error) {
            console.error('❌ Ошибка очистки базы данных:', error);
            throw error;
        }
    }

    // Метод обработки Excel данных
    async processFileData(excelData, fileInfo, userId) {
        try {
            console.log('📊 Обработка данных Excel в Supabase...');
            
            // Сохраняем информацию о файле
            const { data: file, error: fileError } = await this.supabase
                .from('uploaded_files')
                .insert({
                    file_name: fileInfo.filename,
                    original_name: fileInfo.originalname,
                    file_size: fileInfo.size,
                    mime_type: fileInfo.mimetype,
                    uploaded_by: userId,
                    processing_status: 'processing'
                })
                .select()
                .single();
            
            if (fileError) throw fileError;
            
            const stats = {
                total: 0,
                new: 0,
                updated: 0,
                duplicate: 0,
                error: 0
            };
            
            // Пропускаем заголовок
            const dataRows = excelData.slice(1);
            stats.total = dataRows.length;
            
            // Обрабатываем каждую строку
            for (const row of dataRows) {
                try {
                    // Маппинг колонок Excel на поля БД
                    const orderData = this.mapExcelRowToOrder(row, excelData[0], file.id);
                    
                    // Проверяем существование заказа
                    const { data: existing } = await this.supabase
                        .from('orders')
                        .select('id')
                        .eq('order_number', orderData.order_number)
                        .single();
                    
                    if (existing) {
                        // Обновляем существующий
                        const { error } = await this.supabase
                            .from('orders')
                            .update(orderData)
                            .eq('id', existing.id);
                        
                        if (error) throw error;
                        stats.updated++;
                    } else {
                        // Создаем новый
                        const { error } = await this.supabase
                            .from('orders')
                            .insert(orderData);
                        
                        if (error) throw error;
                        stats.new++;
                    }
                } catch (error) {
                    console.error('Ошибка обработки строки:', error);
                    stats.error++;
                }
            }
            
            // Обновляем статус файла
            await this.supabase
                .from('uploaded_files')
                .update({
                    processing_status: 'completed',
                    records_total: stats.total,
                    records_new: stats.new,
                    records_updated: stats.updated,
                    records_error: stats.error
                })
                .eq('id', file.id);
            
            console.log('✅ Обработка завершена:', stats);
            return stats;
        } catch (error) {
            console.error('❌ Ошибка обработки файла:', error);
            throw error;
        }
    }

    // Маппинг данных Excel на структуру БД
    mapExcelRowToOrder(row, headers, fileId) {
        // Создаем объект с индексами колонок
        const cols = {};
        headers.forEach((header, index) => {
            cols[header] = index;
        });
        
        // Определяем тип оплаты
        let paymentType = 'CASH';
        const paymentRaw = row[cols['Тип оплаты']] || row[cols['Order resource']] || '';
        
        if (paymentRaw.toLowerCase().includes('qr')) paymentType = 'QR';
        else if (paymentRaw.toLowerCase().includes('card') || paymentRaw.toLowerCase().includes('карт')) paymentType = 'CARD';
        else if (paymentRaw.toLowerCase().includes('vip')) paymentType = 'VIP';
        else if (paymentRaw.toLowerCase().includes('return') || paymentRaw.toLowerCase().includes('возврат')) paymentType = 'RETURN';
        
        // Парсим дату
        let operationDate = new Date();
        if (row[cols['Дата']] || row[cols['Time']]) {
            const dateValue = row[cols['Дата']] || row[cols['Time']];
            // Excel хранит даты как числа (дни с 1900-01-01)
            if (typeof dateValue === 'number') {
                operationDate = new Date((dateValue - 25569) * 86400 * 1000);
            } else {
                operationDate = new Date(dateValue);
            }
        }
        
        // Парсим сумму
        const parseAmount = (value) => {
            if (!value) return 0;
            return parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
        };
        
        return {
            order_number: row[cols['Номер заказа']] || row[cols['Order number']] || `order_${Date.now()}`,
            product_name: row[cols['Наименование товара']] || row[cols['Товар']] || row[cols['Goods name']] || 'Неизвестно',
            product_variant: row[cols['Название вкуса']] || row[cols['Вариант']] || 'Стандарт',
            payment_type: paymentType,
            payment_type_raw: paymentRaw,
            quantity: parseFloat(row[cols['Кол-во']] || row[cols['Quantity']] || 1),
            unit: row[cols['Ед.']] || 'шт',
            price_per_unit: parseAmount(row[cols['Цена']] || row[cols['Price']]),
            total_amount: parseAmount(row[cols['Сумма']] || row[cols['Order price']] || row[cols['Total']]),
            discount_percent: parseFloat(row[cols['Скидка%']] || 0),
            discount_amount: parseAmount(row[cols['Скидка']] || 0),
            is_return: paymentType === 'RETURN',
            operation_date: operationDate.toISOString().split('T')[0],
            operation_time: operationDate.toTimeString().split(' ')[0],
            year: operationDate.getFullYear(),
            month: operationDate.getMonth() + 1,
            day: operationDate.getDate(),
            cashier: row[cols['Кассир']] || row[cols['Оператор']] || null,
            customer_name: row[cols['Клиент']] || null,
            file_id: fileId,
            uploaded_by: null
        };
    }

    // Получение заказов с фильтрацией
    async getOrders(filters = {}) {
        try {
            let query = this.supabase
                .from('orders')
                .select('*')
                .order('operation_date', { ascending: false });
            
            // Применяем фильтры
            if (filters.year) query = query.eq('year', filters.year);
            if (filters.month) query = query.eq('month', filters.month);
            if (filters.day) query = query.eq('day', filters.day);
            if (filters.paymentType && filters.paymentType !== 'ALL') {
                query = query.eq('payment_type', filters.paymentType);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Ошибка получения заказов:', error);
            throw error;
        }
    }

    // Получение статистики заказов
    async getOrdersStats() {
        try {
            const { data, error } = await this.supabase
                .from('sales_summary')
                .select('*')
                .order('period_key', { ascending: false });
            
            if (error) throw error;
            
            // Группируем по периодам
            const stats = {
                total: 0,
                byPaymentType: {
                    CASH: { count: 0, sum: 0 },
                    QR: { count: 0, sum: 0 },
                    VIP: { count: 0, sum: 0 },
                    CARD: { count: 0, sum: 0 },
                    RETURN: { count: 0, sum: 0 }
                },
                byPeriod: {}
            };
            
            data.forEach(row => {
                stats.total += row.total_amount;
                if (stats.byPaymentType[row.payment_type]) {
                    stats.byPaymentType[row.payment_type].count += row.transactions_count;
                    stats.byPaymentType[row.payment_type].sum += row.total_amount;
                }
                
                if (!stats.byPeriod[row.period_key]) {
                    stats.byPeriod[row.period_key] = {
                        total: 0,
                        byType: {}
                    };
                }
                stats.byPeriod[row.period_key].total += row.total_amount;
                stats.byPeriod[row.period_key].byType[row.payment_type] = row.total_amount;
            });
            
            return stats;
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            throw error;
        }
    }

    // Загрузка файла в Supabase Storage
    async uploadFileToStorage(buffer, filename, mimetype) {
        try {
            console.log('📤 Загрузка файла в Supabase Storage...');
            
            // Создаем уникальное имя файла
            const timestamp = Date.now();
            const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `uploads/${timestamp}_${safeName}`;
            
            // Загружаем в Storage
            const { data, error } = await this.supabase.storage
                .from('excel-files')
                .upload(storagePath, buffer, {
                    contentType: mimetype,
                    upsert: false
                });
            
            if (error) throw error;
            
            // Получаем публичный URL
            const { data: { publicUrl } } = this.supabase.storage
                .from('excel-files')
                .getPublicUrl(storagePath);
            
            console.log('✅ Файл загружен:', publicUrl);
            return {
                path: storagePath,
                url: publicUrl
            };
        } catch (error) {
            console.error('❌ Ошибка загрузки в Storage:', error);
            throw error;
        }
    }

    // Скачивание файла из Storage
    async downloadFileFromStorage(path) {
        try {
            const { data, error } = await this.supabase.storage
                .from('excel-files')
                .download(path);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Ошибка скачивания из Storage:', error);
            throw error;
        }
    }

    // Удаление файла из Storage
    async deleteFileFromStorage(path) {
        try {
            const { error } = await this.supabase.storage
                .from('excel-files')
                .remove([path]);
            
            if (error) throw error;
            console.log('✅ Файл удален из Storage');
        } catch (error) {
            console.error('❌ Ошибка удаления из Storage:', error);
            throw error;
        }
    }

    // Методы для совместимости с SQLite интерфейсом
    async getUserByUsername(username) {
        try {
            const { data: users, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .limit(1);
            
            if (error) throw error;
            
            if (!users || users.length === 0) {
                return null;
            }
            
            const user = users[0];
            return {
                id: user.id,
                username: user.username,
                password: user.password_hash,
                fullName: user.full_name,
                role: user.role
            };
        } catch (error) {
            console.error('❌ Ошибка получения пользователя:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const { data: user, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            
            return {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role
            };
        } catch (error) {
            console.error('❌ Ошибка получения пользователя по ID:', error);
            throw error;
        }
    }

    // Получение данных для отчетов
    async getReportsData() {
        try {
            // Можно добавить специфичные запросы для отчетов
            return {
                message: 'Данные отчетов из Supabase'
            };
        } catch (error) {
            console.error('❌ Ошибка получения данных отчетов:', error);
            throw error;
        }
    }

    // Закрытие соединения (для совместимости)
    async close() {
        console.log('🔌 Supabase соединение закрыто');
        return true;
    }
}

// Создаем единственный экземпляр
const supabaseDb = new SupabaseDatabase();

module.exports = supabaseDb;
