const requiredEnvVars = {
    JWT_SECRET: {
        required: true,
        minLength: 32,
        description: 'Секретный ключ для JWT токенов (минимум 32 символа)'
    },
    DATABASE_TYPE: {
        required: true,
        values: ['sqlite', 'supabase'],
        description: 'Тип базы данных: sqlite или supabase'
    },
    SUPABASE_URL: {
        required: () => process.env.DATABASE_TYPE === 'supabase',
        pattern: /^https:\/\/.+\.supabase\.co$/,
        description: 'URL вашего Supabase проекта'
    },
    SUPABASE_SERVICE_KEY: {
        required: () => process.env.DATABASE_TYPE === 'supabase',
        minLength: 100,
        description: 'Service Role Key из Supabase'
    }
};

function checkEnvironment() {
    console.log('🔍 Проверка переменных окружения...');
    const errors = [];
    const warnings = [];
    
    for (const [key, config] of Object.entries(requiredEnvVars)) {
        const value = process.env[key];
        
        // Проверка обязательности
        const isRequired = typeof config.required === 'function' 
            ? config.required() 
            : config.required;
        
        if (isRequired && !value) {
            errors.push(`❌ ${key}: не установлена (${config.description})`);
            continue;
        }
        
        if (!value) continue;
        
        // Проверка длины
        if (config.minLength && value.length < config.minLength) {
            errors.push(`❌ ${key}: слишком короткая (минимум ${config.minLength} символов)`);
        }
        
        // Проверка допустимых значений
        if (config.values && !config.values.includes(value)) {
            errors.push(`❌ ${key}: недопустимое значение "${value}" (допустимые: ${config.values.join(', ')})`);
        }
        
        // Проверка паттерна
        if (config.pattern && !config.pattern.test(value)) {
            errors.push(`❌ ${key}: неверный формат`);
        }
    }
    
    // Дополнительные предупреждения
    if (process.env.NODE_ENV === 'production') {
        if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-here') {
            errors.push('❌ JWT_SECRET: используется дефолтное значение в production!');
        }
        
        if (!process.env.HTTPS) {
            warnings.push('⚠️  HTTPS не настроен для production');
        }
    }
    
    // Вывод результатов
    if (errors.length > 0) {
        console.error('\n═══════════════════════════════════════════════════════');
        console.error('🔴 КРИТИЧЕСКИЕ ОШИБКИ КОНФИГУРАЦИИ:');
        console.error('═══════════════════════════════════════════════════════');
        errors.forEach(err => console.error(err));
        console.error('═══════════════════════════════════════════════════════\n');
        
        // Генерация примера .env
        console.log('📝 Пример правильного .env файла:');
        console.log('-----------------------------------');
        console.log('PORT=3000');
        console.log('NODE_ENV=production');
        console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'));
        console.log('DATABASE_TYPE=supabase');
        console.log('SUPABASE_URL=https://your-project.supabase.co');
        console.log('SUPABASE_SERVICE_KEY=eyJ...');
        console.log('-----------------------------------\n');
        
        process.exit(1);
    }
    
    if (warnings.length > 0) {
        console.warn('\n⚠️  Предупреждения:');
        warnings.forEach(warn => console.warn(warn));
    }
    
    console.log('✅ Все переменные окружения настроены корректно\n');
}

module.exports = checkEnvironment;
