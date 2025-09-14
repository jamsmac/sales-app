#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                🚀 НАСТРОЙКА SUPABASE                     ║
║           Система анализа продаж v5.0                    ║
╚═══════════════════════════════════════════════════════════╝
`);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function main() {
    try {
        console.log('Этот скрипт поможет вам настроить Supabase для вашего проекта.\n');
        
        // Проверяем существование .env файла
        const envPath = path.join(__dirname, '.env');
        const envExamplePath = path.join(__dirname, '.env.example');
        
        if (!fs.existsSync(envPath)) {
            console.log('📝 Создание .env файла из .env.example...');
            if (fs.existsSync(envExamplePath)) {
                fs.copyFileSync(envExamplePath, envPath);
                console.log('✅ .env файл создан');
            } else {
                console.log('❌ .env.example не найден');
                process.exit(1);
            }
        }
        
        console.log('\n🔧 НАСТРОЙКА SUPABASE');
        console.log('Для продолжения вам понадобятся данные из вашего проекта Supabase:');
        console.log('1. Перейдите на https://app.supabase.com');
        console.log('2. Откройте ваш проект');
        console.log('3. Перейдите в Settings → API');
        console.log('4. Скопируйте необходимые ключи\n');
        
        const useSupabase = await question('Хотите настроить Supabase? (y/n): ');
        
        if (useSupabase.toLowerCase() === 'y' || useSupabase.toLowerCase() === 'yes') {
            const supabaseUrl = await question('Введите Supabase URL (https://xxxxx.supabase.co): ');
            const supabaseAnonKey = await question('Введите Supabase Anon Key: ');
            const supabaseServiceKey = await question('Введите Supabase Service Role Key: ');
            
            // Читаем текущий .env файл
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            // Обновляем переменные Supabase
            envContent = envContent.replace(/SUPABASE_URL=.*/, `SUPABASE_URL=${supabaseUrl}`);
            envContent = envContent.replace(/SUPABASE_ANON_KEY=.*/, `SUPABASE_ANON_KEY=${supabaseAnonKey}`);
            envContent = envContent.replace(/SUPABASE_SERVICE_KEY=.*/, `SUPABASE_SERVICE_KEY=${supabaseServiceKey}`);
            envContent = envContent.replace(/DATABASE_TYPE=.*/, 'DATABASE_TYPE=supabase');
            
            // Записываем обновленный .env файл
            fs.writeFileSync(envPath, envContent);
            
            console.log('\n✅ Конфигурация Supabase сохранена в .env файл');
            
            console.log('\n📋 СЛЕДУЮЩИЕ ШАГИ:');
            console.log('1. Выполните SQL схему в Supabase:');
            console.log('   - Откройте Supabase Dashboard → SQL Editor');
            console.log('   - Скопируйте содержимое файла supabase-schema.sql');
            console.log('   - Выполните запрос');
            console.log('');
            console.log('2. Установите зависимости:');
            console.log('   npm install');
            console.log('');
            console.log('3. Запустите сервер:');
            console.log('   npm start');
            console.log('');
            console.log('4. Откройте браузер:');
            console.log('   http://localhost:3000');
            console.log('');
            console.log('5. Для тестирования загрузки файлов:');
            console.log('   http://localhost:3000/test-upload.html');
            
        } else {
            console.log('\n📝 Оставляем SQLite как базу данных по умолчанию');
            
            // Устанавливаем SQLite в .env
            let envContent = fs.readFileSync(envPath, 'utf8');
            envContent = envContent.replace(/DATABASE_TYPE=.*/, 'DATABASE_TYPE=sqlite');
            fs.writeFileSync(envPath, envContent);
            
            console.log('\n📋 СЛЕДУЮЩИЕ ШАГИ:');
            console.log('1. Установите зависимости:');
            console.log('   npm install');
            console.log('');
            console.log('2. Запустите сервер:');
            console.log('   npm start');
            console.log('');
            console.log('3. Откройте браузер:');
            console.log('   http://localhost:3000');
        }
        
        console.log('\n🔐 УЧЕТНЫЕ ДАННЫЕ ПО УМОЛЧАНИЮ:');
        console.log('Администратор: admin / admin123');
        console.log('Бухгалтер: buh1 / buh123');
        
        console.log('\n📚 ДОКУМЕНТАЦИЯ:');
        console.log('- Полная инструкция по Supabase: SUPABASE_INTEGRATION.md');
        console.log('- Тестирование загрузки: /test-upload.html');
        
        console.log('\n✅ Настройка завершена!');
        
    } catch (error) {
        console.error('\n❌ Ошибка настройки:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
