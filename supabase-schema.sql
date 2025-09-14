-- ВЫПОЛНИТЕ ЭТОТ SQL В SUPABASE SQL EDITOR
-- (Dashboard → SQL Editor → New Query)

-- 1. Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'accountant')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 2. Таблица заказов/продаж
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50),
    product_code VARCHAR(50),
    product_name VARCHAR(200) NOT NULL,
    product_variant VARCHAR(100),
    payment_type VARCHAR(20) NOT NULL,
    payment_type_raw VARCHAR(100),
    quantity DECIMAL(10,2) DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'шт',
    price_per_unit DECIMAL(10,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    is_return BOOLEAN DEFAULT FALSE,
    operation_date DATE NOT NULL,
    operation_time TIME,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    cashier VARCHAR(100),
    shift VARCHAR(50),
    check_number VARCHAR(50),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'completed',
    file_id INTEGER,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Таблица загруженных файлов
CREATE TABLE IF NOT EXISTS uploaded_files (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    file_size INTEGER,
    file_url TEXT,
    storage_path TEXT,
    mime_type VARCHAR(100),
    records_total INTEGER DEFAULT 0,
    records_new INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_duplicate INTEGER DEFAULT 0,
    records_error INTEGER DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_status VARCHAR(20) DEFAULT 'pending',
    processing_error TEXT
);

-- 4. Таблица агрегированных данных для быстрых отчетов
CREATE TABLE IF NOT EXISTS sales_summary (
    id SERIAL PRIMARY KEY,
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('year', 'month', 'day')),
    period_key VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER,
    day INTEGER,
    payment_type VARCHAR(20) NOT NULL,
    transactions_count INTEGER DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(period_key, payment_type)
);

-- 5. Таблица товаров для аналитики
CREATE TABLE IF NOT EXISTS products_summary (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50),
    product_name VARCHAR(200) NOT NULL,
    product_variant VARCHAR(100),
    sales_count INTEGER DEFAULT 0,
    returns_count INTEGER DEFAULT 0,
    total_quantity DECIMAL(10,2) DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    total_returns DECIMAL(10,2) DEFAULT 0,
    last_sale_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_name, product_variant)
);

-- 6. Индексы для производительности
CREATE INDEX idx_orders_date ON orders(operation_date);
CREATE INDEX idx_orders_year_month ON orders(year, month);
CREATE INDEX idx_orders_payment_type ON orders(payment_type);
CREATE INDEX idx_orders_product ON orders(product_name);
CREATE INDEX idx_sales_summary_period ON sales_summary(period_key);
CREATE INDEX idx_products_summary_name ON products_summary(product_name);

-- 7. Функция для обновления агрегированных данных
CREATE OR REPLACE FUNCTION update_sales_summary()
RETURNS TRIGGER AS $$
BEGIN
    -- Обновляем годовую статистику
    INSERT INTO sales_summary (period_type, period_key, year, payment_type, transactions_count, total_amount)
    VALUES ('year', NEW.year::TEXT, NEW.year, NEW.payment_type, 1, NEW.total_amount)
    ON CONFLICT (period_key, payment_type) 
    DO UPDATE SET 
        transactions_count = sales_summary.transactions_count + 1,
        total_amount = sales_summary.total_amount + NEW.total_amount,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Обновляем месячную статистику
    INSERT INTO sales_summary (period_type, period_key, year, month, payment_type, transactions_count, total_amount)
    VALUES ('month', NEW.year || '_' || NEW.month, NEW.year, NEW.month, NEW.payment_type, 1, NEW.total_amount)
    ON CONFLICT (period_key, payment_type)
    DO UPDATE SET
        transactions_count = sales_summary.transactions_count + 1,
        total_amount = sales_summary.total_amount + NEW.total_amount,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Обновляем дневную статистику
    INSERT INTO sales_summary (period_type, period_key, year, month, day, payment_type, transactions_count, total_amount)
    VALUES ('day', NEW.year || '_' || NEW.month || '_' || NEW.day, NEW.year, NEW.month, NEW.day, NEW.payment_type, 1, NEW.total_amount)
    ON CONFLICT (period_key, payment_type)
    DO UPDATE SET
        transactions_count = sales_summary.transactions_count + 1,
        total_amount = sales_summary.total_amount + NEW.total_amount,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Триггер для автоматического обновления статистики
CREATE TRIGGER trigger_update_sales_summary
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION update_sales_summary();

-- 9. Функция для обновления статистики товаров
CREATE OR REPLACE FUNCTION update_products_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO products_summary (
        product_code, product_name, product_variant,
        sales_count, returns_count, total_quantity,
        total_revenue, total_returns, last_sale_date
    )
    VALUES (
        NEW.product_code, NEW.product_name, NEW.product_variant,
        CASE WHEN NEW.is_return THEN 0 ELSE 1 END,
        CASE WHEN NEW.is_return THEN 1 ELSE 0 END,
        CASE WHEN NEW.is_return THEN 0 ELSE NEW.quantity END,
        CASE WHEN NEW.is_return THEN 0 ELSE NEW.total_amount END,
        CASE WHEN NEW.is_return THEN NEW.total_amount ELSE 0 END,
        NEW.operation_date
    )
    ON CONFLICT (product_name, product_variant)
    DO UPDATE SET
        sales_count = products_summary.sales_count + CASE WHEN NEW.is_return THEN 0 ELSE 1 END,
        returns_count = products_summary.returns_count + CASE WHEN NEW.is_return THEN 1 ELSE 0 END,
        total_quantity = products_summary.total_quantity + CASE WHEN NEW.is_return THEN 0 ELSE NEW.quantity END,
        total_revenue = products_summary.total_revenue + CASE WHEN NEW.is_return THEN 0 ELSE NEW.total_amount END,
        total_returns = products_summary.total_returns + CASE WHEN NEW.is_return THEN NEW.total_amount ELSE 0 END,
        last_sale_date = GREATEST(products_summary.last_sale_date, NEW.operation_date),
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Триггер для товаров
CREATE TRIGGER trigger_update_products_summary
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION update_products_summary();

-- 11. Вставка тестовых пользователей (с хешированными паролями)
-- Пароли: admin123 и buh123 (уже захешированы bcrypt)
INSERT INTO users (username, password_hash, full_name, role) VALUES
    ('admin', '$2a$10$8KmVjVZqPqF8LxaD1dYv4.CCmJ8JTQj8nO9BQ2iCBF.oVKjYz4zDa', 'Администратор', 'admin'),
    ('buh1', '$2a$10$xTvZ5nCYvGkNPqHMNhnJLuVPBBGcKxFUHxB4kRi/YJh3UyKo2B/Gu', 'Иванова А.П.', 'accountant')
ON CONFLICT (username) DO NOTHING;

-- 12. Политики безопасности Row Level Security (RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_summary ENABLE ROW LEVEL SECURITY;

-- Политика для orders: все могут читать, только админы могут изменять
CREATE POLICY "Orders viewable by all authenticated users" ON orders
    FOR SELECT USING (true);

CREATE POLICY "Orders editable by admins only" ON orders
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Просмотр структуры (для проверки)
SELECT 'База данных успешно создана!' as message;
