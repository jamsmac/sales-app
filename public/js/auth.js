// Система авторизации
const API_URL = window.location.origin;

// Обработка формы входа
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('errorMessage');
    const successMsg = document.getElementById('successMessage');
    
    // Скрыть сообщения
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
    
    // Показать загрузку
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn-text').style.display = 'none';
    loginBtn.querySelector('.btn-loader').style.display = 'inline';
    
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Сохранить токен и данные пользователя
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Показать успех
            successMsg.style.display = 'block';
            
            // Перенаправить на dashboard
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            throw new Error(data.error || 'Ошибка входа');
        }
    } catch (error) {
        errorMsg.textContent = error.message;
        errorMsg.style.display = 'block';
        
        // Сбросить кнопку
        loginBtn.disabled = false;
        loginBtn.querySelector('.btn-text').style.display = 'inline';
        loginBtn.querySelector('.btn-loader').style.display = 'none';
    }
});

// Проверка авторизации при загрузке
if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
}
