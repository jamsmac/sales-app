// Главный модуль приложения
const App = {
    API_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:3001' 
        : window.location.origin,
    
    user: null,
    token: null,
    data: {
        orders: [],
        stats: {},
        files: []
    },
    
    // Инициализация
    async init() {
        // Проверка авторизации
        this.token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        
        if (!this.token || !userStr) {
            window.location.href = '/login.html';
            return;
        }
        
        this.user = JSON.parse(userStr);
        
        // Применить роль
        this.applyUserRole();
        
        // Загрузить данные
        await this.loadData();
        
        // Инициализировать интерфейс
        this.initUI();
    },
    
    // Применение роли пользователя
    applyUserRole() {
        const { role, fullName } = this.user;
        
        // Обновить UI
        document.getElementById('userName').textContent = fullName;
        document.getElementById('userRole').textContent = 
            role === 'admin' ? 'Администратор' : 'Бухгалтер';
        
        // Добавить класс роли
        if (role === 'accountant') {
            document.body.classList.add('role-accountant');
            document.getElementById('roleBadge').textContent = 'Режим просмотра';
        }
    },
    
    // Загрузка данных
    async loadData() {
        try {
            this.showLoading(true);
            
            // Загрузить заказы
            const ordersResponse = await this.apiRequest('/api/orders');
            this.data.orders = ordersResponse;
            
            // Загрузить статистику
            const statsResponse = await this.apiRequest('/api/orders/stats');
            this.data.stats = statsResponse;
            
            // Загрузить файлы (для админов)
            if (this.user.role === 'admin') {
                const filesResponse = await this.apiRequest('/api/files');
                this.data.files = filesResponse;
            }
            
            // Обновить интерфейс
            this.updateStats();
            this.buildTable();
            
        } catch (error) {
            this.showToast('Ошибка загрузки данных', 'error');
            console.error(error);
        } finally {
            this.showLoading(false);
        }
    },
    
    // API запрос
    async apiRequest(endpoint, options = {}) {
        const response = await fetch(`${this.API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Токен истек
                localStorage.clear();
                window.location.href = '/login.html';
            }
            throw new Error(`API Error: ${response.status}`);
        }
        
        return response.json();
    },
    
    // Инициализация UI
    initUI() {
        // Обработчики вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Обработчик загрузки файлов
        if (this.user.role === 'admin') {
            this.initFileUpload();
        }
        
        // Поиск в таблице
        document.getElementById('tableSearch')?.addEventListener('input', (e) => {
            this.filterTable(e.target.value);
        });
    },
    
    // Переключение вкладок
    switchTab(tabName) {
        // Деактивировать все вкладки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Активировать выбранную
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Загрузить контент вкладки при необходимости
        if (tabName === 'charts') {
            this.buildCharts();
        } else if (tabName === 'products') {
            this.buildProducts();
        } else if (tabName === 'database') {
            this.buildDatabase();
        }
    },
    
    // Обновление статистики
    updateStats() {
        const stats = this.data.stats;
        const statsGrid = document.getElementById('statsGrid');
        
        const cards = [
            {
                icon: '💰',
                label: 'Общая выручка',
                value: this.formatNumber(stats.totalRevenue || 0),
                color: 'primary'
            },
            {
                icon: '📦',
                label: 'Всего заказов',
                value: stats.total || 0,
                color: 'info'
            },
            {
                icon: '💵',
                label: 'Наличные',
                value: this.formatNumber(stats.byPaymentType?.CASH?.total || 0),
                color: 'success'
            },
            {
                icon: '📱',
                label: 'QR платежи',
                value: this.formatNumber(stats.byPaymentType?.QR?.total || 0),
                color: 'info'
            },
            {
                icon: '💳',
                label: 'Карты',
                value: this.formatNumber(stats.byPaymentType?.CARD?.total || 0),
                color: 'warning'
            },
            {
                icon: '↩️',
                label: 'Возвраты',
                value: this.formatNumber(stats.returns || 0),
                color: 'error'
            }
        ];
        
        statsGrid.innerHTML = cards.map(card => `
            <div class="stat-card stat-${card.color}">
                <div class="stat-icon">${card.icon}</div>
                <div class="stat-value">${card.value}</div>
                <div class="stat-label">${card.label}</div>
            </div>
        `).join('');
    },
    
    // Построение таблицы
    buildTable() {
        const table = document.getElementById('dataTable');
        if (!table) return;
        
        // Заголовки
        const thead = table.querySelector('thead');
        thead.innerHTML = `
            <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Товар</th>
                <th>Вариант</th>
                <th>Тип оплаты</th>
                <th class="text-right">Сумма</th>
            </tr>
        `;
        
        // Данные
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = this.data.orders.map((order, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${new Date(order.date).toLocaleDateString('ru-RU')}</td>
                <td>${order.product}</td>
                <td>${order.flavor}</td>
                <td>${this.getPaymentTypeLabel(order.paymentType)}</td>
                <td class="text-right">${this.formatNumber(order.price)}</td>
            </tr>
        `).join('');
    },
    
    // Инициализация загрузки файлов
    initFileUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        // Drag & Drop
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea?.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea?.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                await this.uploadFile(file);
            }
        });
        
        // Выбор файла
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.uploadFile(file);
            }
        });
    },
    
    // Загрузка файла
    async uploadFile(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            this.showToast('Только файлы Excel (.xlsx, .xls)', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.API_URL}/api/files/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast(result.message, 'success');
                
                // Показать статистику загрузки
                this.showUploadStats(result.stats);
                
                // Перезагрузить данные
                await this.loadData();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    // Показать статистику загрузки
    showUploadStats(stats) {
        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>📊 Результаты обработки файла</h3>
                    <button onclick="App.closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="upload-stats">
                        <div class="stat-item">
                            <span>Всего обработано:</span>
                            <strong>${stats.total} записей</strong>
                        </div>
                        <div class="stat-item success">
                            <span>✅ Новых добавлено:</span>
                            <strong>${stats.new} записей</strong>
                        </div>
                        <div class="stat-item warning">
                            <span>🔄 Обновлено:</span>
                            <strong>${stats.updated} записей</strong>
                        </div>
                        <div class="stat-item info">
                            <span>⚠️ Дубликатов:</span>
                            <strong>${stats.duplicate} записей</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
        modal.classList.add('active');
    },
    
    // Построение графиков
    buildCharts() {
        // Здесь будет код для Chart.js
        const chartsGrid = document.getElementById('chartsGrid');
        chartsGrid.innerHTML = '<p>Графики в разработке...</p>';
    },
    
    // Построение товаров
    buildProducts() {
        const container = document.getElementById('productsContainer');
        container.innerHTML = '<p>Анализ товаров в разработке...</p>';
    },
    
    // Построение базы данных
    async buildDatabase() {
        const dbContent = document.getElementById('dbContent');
        
        try {
            const info = await this.apiRequest('/api/database/info');
            
            document.getElementById('dbStats').innerHTML = `
                <div class="db-info-grid">
                    <div class="db-info-card">
                        <span>Записей в базе:</span>
                        <strong>${info.totalRecords}</strong>
                    </div>
                    <div class="db-info-card">
                        <span>Загружено файлов:</span>
                        <strong>${info.totalFiles}</strong>
                    </div>
                    <div class="db-info-card">
                        <span>Последнее обновление:</span>
                        <strong>${info.lastUpdate ? new Date(info.lastUpdate).toLocaleString('ru-RU') : '-'}</strong>
                    </div>
                    <div class="db-info-card">
                        <span>Размер базы:</span>
                        <strong>${Math.round(info.dbSize)} KB</strong>
                    </div>
                </div>
            `;
            
            if (this.user.role === 'admin') {
                const files = await this.apiRequest('/api/files');
                dbContent.innerHTML = `
                    <h3>История загруженных файлов</h3>
                    <div class="files-list">
                        ${files.map(file => `
                            <div class="file-item">
                                <span class="file-name">📄 ${file.fileName}</span>
                                <span class="file-date">${new Date(file.uploadDate).toLocaleString('ru-RU')}</span>
                                <span class="file-stats">
                                    <span class="badge">+${file.recordsNew}</span>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } catch (error) {
            dbContent.innerHTML = '<p>Ошибка загрузки информации о базе данных</p>';
        }
    },
    
    // Утилиты
    formatNumber(num) {
        return new Intl.NumberFormat('ru-RU').format(Math.round(num));
    },
    
    getPaymentTypeLabel(type) {
        const labels = {
            'CASH': 'Наличные',
            'QR': 'QR код',
            'VIP': 'VIP',
            'CARD': 'Карта',
            'RETURN': 'Возврат'
        };
        return labels[type] || type;
    },
    
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    },
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.toggle('active', show);
    },
    
    closeModal() {
        document.getElementById('modal').classList.remove('active');
    },
    
    filterTable(searchTerm) {
        const rows = document.querySelectorAll('#dataTable tbody tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }
};

// Функция выхода
function logout() {
    if (confirm('Вы действительно хотите выйти?')) {
        localStorage.clear();
        window.location.href = '/login.html';
    }
}

// Функции для админа
async function clearDatabase() {
    if (!confirm('Вы уверены? Все данные будут удалены!')) return;
    
    try {
        await App.apiRequest('/api/database/clear', { method: 'DELETE' });
        App.showToast('База данных очищена', 'success');
        await App.loadData();
    } catch (error) {
        App.showToast('Ошибка очистки базы данных', 'error');
    }
}

async function exportDatabase() {
    try {
        const result = await App.apiRequest('/api/export');
        window.open(`${App.API_URL}${result.url}`, '_blank');
        App.showToast('Экспорт выполнен', 'success');
    } catch (error) {
        App.showToast('Ошибка экспорта', 'error');
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
