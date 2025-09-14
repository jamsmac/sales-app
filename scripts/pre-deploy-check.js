#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Проверка готовности к деплою...\n');

const checks = [];

// 1. Проверка .env файла
function checkEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        return { 
            status: '❌', 
            message: '.env файл отсутствует',
            fix: 'Скопируйте .env.example в .env и заполните переменные'
        };
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Проверка критических переменных
    const required = ['JWT_SECRET', 'DATABASE_TYPE'];
    const missing = required.filter(key => !envContent.includes(`${key}=`));
    
    if (missing.length > 0) {
        return {
            status: '❌',
            message: `Отсутствуют переменные: ${missing.join(', ')}`,
            fix: 'Добавьте недостающие переменные в .env'
        };
    }
    
    // Проверка дефолтных значений
    if (envContent.includes('JWT_SECRET=your-super-secret-jwt-key-here')) {
        return {
            status: '⚠️',
            message: 'Используется дефолтный JWT_SECRET',
            fix: 'Сгенерируйте безопасный ключ: openssl rand -hex 32'
        };
    }
    
    return { status: '✅', message: '.env файл настроен' };
}

// 2. Проверка Supabase
function checkSupabase() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        return { status: '⏭️', message: 'Пропуск проверки Supabase' };
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('DATABASE_TYPE=supabase')) {
        const hasUrl = envContent.includes('SUPABASE_URL=https://');
        const hasKey = envContent.includes('SUPABASE_SERVICE_KEY=eyJ');
        
        if (!hasUrl || !hasKey) {
            return {
                status: '❌',
                message: 'Supabase не настроен',
                fix: 'Добавьте SUPABASE_URL и SUPABASE_SERVICE_KEY в .env'
            };
        }
        
        return { status: '✅', message: 'Supabase настроен' };
    }
    
    return { status: '✅', message: 'Используется SQLite' };
}

// 3. Проверка зависимостей
function checkDependencies() {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    const required = ['express', 'jsonwebtoken', 'bcryptjs', '@supabase/supabase-js'];
    const missing = required.filter(dep => !package.dependencies[dep]);
    
    if (missing.length > 0) {
        return {
            status: '❌',
            message: `Отсутствуют зависимости: ${missing.join(', ')}`,
            fix: 'Выполните: npm install'
        };
    }
    
    return { status: '✅', message: 'Все зависимости установлены' };
}

// 4. Проверка критических файлов
function checkCriticalFiles() {
    const criticalFiles = [
        'server/server.js',
        'server/middleware/auth.middleware.js',
        'server/routes/auth.js',
        'server/routes/files-memory.js',
        'server/utils/supabase.js',
        'supabase-schema.sql'
    ];
    
    const missing = criticalFiles.filter(file => 
        !fs.existsSync(path.join(__dirname, '..', file))
    );
    
    if (missing.length > 0) {
        return {
            status: '❌',
            message: `Отсутствуют файлы: ${missing.join(', ')}`,
            fix: 'Убедитесь, что все файлы на месте'
        };
    }
    
    return { status: '✅', message: 'Все критические файлы на месте' };
}

// 5. Проверка безопасности
function checkSecurity() {
    const issues = [];
    
    // Проверка на fallback JWT
    const authMiddlewarePath = path.join(__dirname, '..', 'server/middleware/auth.middleware.js');
    if (fs.existsSync(authMiddlewarePath)) {
        const authMiddleware = fs.readFileSync(authMiddlewarePath, 'utf8');
        
        if (authMiddleware.includes("|| 'fallback-secret")) {
            issues.push('JWT fallback в auth.middleware.js');
        }
    }
    
    const authRoutePath = path.join(__dirname, '..', 'server/routes/auth.js');
    if (fs.existsSync(authRoutePath)) {
        const authRoute = fs.readFileSync(authRoutePath, 'utf8');
        
        if (authRoute.includes("|| 'fallback-secret")) {
            issues.push('JWT fallback в auth.js');
        }
    }
    
    if (issues.length > 0) {
        return {
            status: '🔴',
            message: `Критические уязвимости: ${issues.join(', ')}`,
            fix: 'Удалите fallback значения JWT_SECRET из кода'
        };
    }
    
    return { status: '✅', message: 'Базовые проверки безопасности пройдены' };
}

// Запуск проверок
checks.push(checkEnvFile());
checks.push(checkSupabase());
checks.push(checkDependencies());
checks.push(checkCriticalFiles());
checks.push(checkSecurity());

// Вывод результатов
console.log('РЕЗУЛЬТАТЫ ПРОВЕРКИ:');
console.log('═══════════════════════════════════════════\n');

let hasErrors = false;
let hasWarnings = false;

checks.forEach(check => {
    console.log(`${check.status} ${check.message}`);
    if (check.fix) {
        console.log(`   📝 Исправление: ${check.fix}`);
    }
    
    if (check.status === '❌' || check.status === '🔴') hasErrors = true;
    if (check.status === '⚠️') hasWarnings = true;
});

console.log('\n═══════════════════════════════════════════');

if (hasErrors) {
    console.log('\n🔴 ДЕПЛОЙ НЕВОЗМОЖЕН: Исправьте критические ошибки');
    process.exit(1);
} else if (hasWarnings) {
    console.log('\n⚠️  ДЕПЛОЙ ВОЗМОЖЕН, но есть предупреждения');
    process.exit(0);
} else {
    console.log('\n✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ! Готово к деплою');
    process.exit(0);
}
