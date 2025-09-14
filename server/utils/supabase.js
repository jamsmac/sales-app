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
}

// Создаем единственный экземпляр
const supabaseDb = new SupabaseDatabase();

module.exports = supabaseDb;
