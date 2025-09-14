# 🚀 Полная инструкция интеграции Supabase

## ШАГ 1: НАСТРОЙКА SUPABASE

### 1.1 Создайте проект в Supabase (если еще нет)
1. Перейдите на https://app.supabase.com
2. Создайте новый проект
3. Сохраните пароль базы данных
4. Дождитесь завершения создания проекта

### 1.2 Получите ключи подключения
В настройках проекта Supabase найдите:
- **Project URL**: `https://xxxxx.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (в Settings → API)

## ШАГ 2: СОЗДАНИЕ ТАБЛИЦ В SUPABASE

1. Откройте Supabase Dashboard → SQL Editor
2. Создайте новый запрос (New Query)
3. Скопируйте и выполните содержимое файла `supabase-schema.sql`
4. Нажмите "Run" для выполнения

Схема создаст следующие таблицы:
- `users` - пользователи системы
- `orders` - заказы/продажи
- `uploaded_files` - загруженные файлы
- `sales_summary` - агрегированная статистика
- `products_summary` - статистика по товарам

## ШАГ 3: НАСТРОЙКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Заполните переменные Supabase в `.env`:
```env
# === SUPABASE CONFIGURATION ===
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here

# === DATABASE SELECTION ===
DATABASE_TYPE=supabase
```

## ШАГ 4: УСТАНОВКА ЗАВИСИМОСТЕЙ

Выполните в корне проекта:
```bash
npm install @supabase/supabase-js dotenv
```

## ШАГ 5: ОБНОВЛЕНИЕ КОДА СЕРВЕРА

### 5.1 Обновите server/server.js
Замените импорт базы данных:

```javascript
// Старый код:
// const db = require('./utils/database');

// Новый код:
const DATABASE_TYPE = process.env.DATABASE_TYPE || 'sqlite';
const db = DATABASE_TYPE === 'supabase' 
    ? require('./utils/supabase')
    : require('./utils/database');
```

### 5.2 Обновите маршруты файлов
Для Railway/Heroku используйте memory-версию:

```javascript
// В server/server.js замените:
// app.use('/api/files', require('./routes/files'));

// На:
app.use('/api/files', require('./routes/files-memory'));
```

## ШАГ 6: ТЕСТИРОВАНИЕ

### 6.1 Локальное тестирование
```bash
npm start
```

### 6.2 Тестирование загрузки файлов
Откройте в браузере: `http://localhost:3000/test-upload.html`

1. Нажмите "1. Тест авторизации" (admin/admin123)
2. Нажмите "2. Тест API"
3. Создайте тестовый файл: "Создать тестовый Excel"
4. Загрузите файл: "3. Тест загрузки выбранного файла"

## ШАГ 7: РАЗВЕРТЫВАНИЕ

### 7.1 Railway
1. Подключите GitHub репозиторий к Railway
2. Добавьте переменные окружения в Railway Dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `DATABASE_TYPE=supabase`
   - `JWT_SECRET`

### 7.2 Heroku
```bash
heroku config:set SUPABASE_URL=https://your-project.supabase.co
heroku config:set SUPABASE_SERVICE_KEY=your-service-key
heroku config:set DATABASE_TYPE=supabase
heroku config:set JWT_SECRET=your-jwt-secret
```

## СТРУКТУРА БАЗЫ ДАННЫХ

### Таблица `users`
- `id` - уникальный идентификатор
- `username` - имя пользователя
- `password_hash` - хеш пароля
- `full_name` - полное имя
- `role` - роль (admin/accountant)

### Таблица `orders`
- `id` - уникальный идентификатор
- `product_name` - название товара
- `product_variant` - вариант товара
- `payment_type` - тип оплаты
- `total_amount` - общая сумма
- `operation_date` - дата операции
- `is_return` - флаг возврата

### Автоматические триггеры
- Обновление статистики продаж при добавлении заказа
- Обновление статистики товаров
- Агрегация данных по периодам

## ПОЛЬЗОВАТЕЛИ ПО УМОЛЧАНИЮ

Созданы автоматически при выполнении схемы:

| Логин | Пароль | Роль | Полное имя |
|-------|--------|------|------------|
| admin | admin123 | admin | Администратор |
| buh1 | buh123 | accountant | Иванова А.П. |

## БЕЗОПАСНОСТЬ

### Row Level Security (RLS)
- Включен для всех основных таблиц
- Политики ограничивают доступ по ролям
- Только админы могут изменять данные

### Рекомендации
1. Используйте сильные пароли
2. Регулярно обновляйте Service Role Key
3. Ограничьте доступ к переменным окружения
4. Включите двухфакторную аутентификацию в Supabase

## МОНИТОРИНГ И ОТЛАДКА

### Логи Supabase
- Dashboard → Logs → API Logs
- Мониторинг запросов и ошибок

### Отладка приложения
- Используйте `test-upload.html` для тестирования
- Проверяйте консоль браузера
- Анализируйте логи сервера

## РЕЗЕРВНОЕ КОПИРОВАНИЕ

### Экспорт данных
```sql
-- В Supabase SQL Editor
COPY (SELECT * FROM orders) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM users) TO STDOUT WITH CSV HEADER;
```

### Автоматическое резервное копирование
Supabase автоматически создает резервные копии:
- Ежедневные снимки
- Point-in-time recovery
- Настройки в Dashboard → Settings → Database

## МАСШТАБИРОВАНИЕ

### Оптимизация запросов
- Используйте индексы (уже созданы в схеме)
- Применяйте пагинацию для больших выборок
- Кешируйте часто запрашиваемые данные

### Мониторинг производительности
- Dashboard → Reports → Performance
- Анализ медленных запросов
- Мониторинг использования ресурсов

## МИГРАЦИЯ С SQLITE

Если у вас есть данные в SQLite:

1. Экспортируйте данные из SQLite
2. Преобразуйте в формат Supabase
3. Импортируйте через SQL Editor или API

```javascript
// Пример миграции пользователей
const sqlite = require('./utils/database');
const supabase = require('./utils/supabase');

async function migrateUsers() {
    const users = sqlite.getUsers();
    for (const user of users) {
        await supabase.supabase
            .from('users')
            .insert({
                username: user.username,
                password_hash: user.password,
                full_name: user.fullName,
                role: user.role
            });
    }
}
```

## ПОДДЕРЖКА

### Документация
- [Supabase Docs](https://supabase.com/docs)
- [JavaScript Client](https://supabase.com/docs/reference/javascript)
- [PostgreSQL Guide](https://supabase.com/docs/guides/database)

### Сообщество
- [Supabase Discord](https://discord.supabase.com)
- [GitHub Issues](https://github.com/supabase/supabase/issues)

## ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ

### Q: Можно ли использовать и SQLite, и Supabase одновременно?
A: Да, переключение происходит через переменную `DATABASE_TYPE` в `.env`

### Q: Как изменить структуру таблиц?
A: Выполните ALTER TABLE запросы в Supabase SQL Editor

### Q: Что делать при ошибках подключения?
A: Проверьте правильность URL и ключей, статус проекта в Supabase Dashboard

### Q: Как увеличить лимиты?
A: Обновите план в Supabase Dashboard → Settings → Billing

---

✅ **Интеграция завершена!** Ваше приложение теперь использует Supabase как основную базу данных.
