// Главный модуль приложения с иерархической отчетностью
const App = {
    API_URL: window.location.origin,
    
    user: null,
    token: null,
    data: {
        orders: [],
        stats: {},
        files: [],
        reports: {},
        hierarchicalData: {}
    },
    
    // Состояние интерфейса
    state: {
        currentTab: 'table',
        selectedPeriods: new Set(),
        expandedPeriods: new Set(),
        searchTerm: '',
        charts: {}
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
        
        // Применить роль и тему
        this.applyUserRole();
        this.initTheme();
        
        // Загрузить данные
        await this.loadData();
        
        // Инициализировать интерфейс
        this.initUI();
        
        // Построить иерархическую таблицу
        this.buildHierarchicalTable();
    },
    
    // Применение роли пользователя
    applyUserRole() {
        const { role, fullName } = this.user;
        
        // Обновить UI
        document.getElementById('userName').textContent = this.escapeHtml(fullName);
        document.getElementById('userRole').textContent = 
            role === 'admin' ? 'Администратор' : 'Бухгалтер';
        
        // Добавить класс роли
        if (role === 'accountant') {
            document.body.classList.add('role-accountant');
            document.getElementById('roleBadge').textContent = 'Режим просмотра';
        } else {
            document.getElementById('roleBadge').textContent = 'Полный доступ';
        }
        
        // Скрыть админские функции для бухгалтеров
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            if (role !== 'admin') {
                el.style.display = 'none';
            }
        });
    },
    
    // Инициализация темы
    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        }
    },
    
    // Экранирование HTML для предотвращения XSS
    escapeHtml(text) {
        if (typeof text !== 'string') return text;
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },
    
    // Загрузка данных
    async loadData() {
        try {
            this.showLoading(true, 'Загрузка данных...');
            
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
            
            // Загрузить данные отчетов
            const reportsResponse = await this.apiRequest('/api/reports/data');
            this.data.reports = reportsResponse;
            
            // Построить иерархические данные
            this.buildHierarchicalData();
            
            // Обновить интерфейс
            this.updateStats();
            
        } catch (error) {
            this.showToast('Ошибка загрузки данных', 'error');
            console.error(error);
        } finally {
            this.showLoading(false);
        }
    },
    
    // Построение иерархических данных
    buildHierarchicalData() {
        const hierarchical = {};
        
        // Группировка заказов по годам, месяцам и дням
        this.data.orders.forEach(order => {
            const date = new Date(order.date || order.operationDate);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            
            const yearKey = year.toString();
            const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
            const dayKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            // Инициализация структуры
            if (!hierarchical[yearKey]) {
                hierarchical[yearKey] = {
                    type: 'year',
                    name: year.toString(),
                    children: {},
                    stats: { CASH: {count: 0, sum: 0}, QR: {count: 0, sum: 0}, VIP: {count: 0, sum: 0}, CARD: {count: 0, sum: 0}, RETURN: {count: 0, sum: 0} }
                };
            }
            
            if (!hierarchical[yearKey].children[monthKey]) {
                const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                                 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                hierarchical[yearKey].children[monthKey] = {
                    type: 'month',
                    name: `${monthNames[month - 1]} ${year}`,
                    children: {},
                    stats: { CASH: {count: 0, sum: 0}, QR: {count: 0, sum: 0}, VIP: {count: 0, sum: 0}, CARD: {count: 0, sum: 0}, RETURN: {count: 0, sum: 0} }
                };
            }
            
            if (!hierarchical[yearKey].children[monthKey].children[dayKey]) {
                hierarchical[yearKey].children[monthKey].children[dayKey] = {
                    type: 'day',
                    name: `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`,
                    stats: { CASH: {count: 0, sum: 0}, QR: {count: 0, sum: 0}, VIP: {count: 0, sum: 0}, CARD: {count: 0, sum: 0}, RETURN: {count: 0, sum: 0} }
                };
            }
            
            // Добавление статистики
            const amount = parseFloat(order.price || order.totalAmount || 0);
            const paymentType = order.paymentType || 'UNKNOWN';
            const isReturn = order.isReturn || false;
            const type = isReturn ? 'RETURN' : paymentType;
            
            // Обновление статистики для дня
            const dayStats = hierarchical[yearKey].children[monthKey].children[dayKey].stats;
            if (dayStats[type]) {
                dayStats[type].count++;
                dayStats[type].sum += amount;
            }
            
            // Обновление статистики для месяца
            const monthStats = hierarchical[yearKey].children[monthKey].stats;
            if (monthStats[type]) {
                monthStats[type].count++;
                monthStats[type].sum += amount;
            }
            
            // Обновление статистики для года
            const yearStats = hierarchical[yearKey].stats;
            if (yearStats[type]) {
                yearStats[type].count++;
                yearStats[type].sum += amount;
            }
        });
        
        this.data.hierarchicalData = hierarchical;
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
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error: ${response.status}`);
        }
        
        return response.json();
    },
    
    // Инициализация UI
    initUI() {
        // Удаляем старые слушатели событий
        this.removeEventListeners();
        
        // Обработчики вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.textContent.includes('Таблица') ? 'table' :
                               e.target.textContent.includes('Графики') ? 'charts' :
                               e.target.textContent.includes('Товары') ? 'products' : 'database';
                this.switchTab(tabName);
            });
        });
        
        // Обработчик загрузки файлов
        if (this.user.role === 'admin') {
            this.initFileUpload();
        }
        
        // Поиск в таблице
        const searchInput = document.getElementById('tableSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.searchTerm = e.target.value;
                this.filterHierarchicalTable();
            });
        }
        
        // Обработчики кнопок управления таблицей
        this.initTableControls();
        
        // Переключатель темы
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme.bind(this));
        }
    },
    
    // Инициализация контролов таблицы
    initTableControls() {
        // Кнопки управления периодами
        const selectAllBtn = document.querySelector('button[onclick="selectAllPeriods()"]');
        const deselectAllBtn = document.querySelector('button[onclick="deselectAllPeriods()"]');
        const expandAllBtn = document.querySelector('button[onclick="expandAll()"]');
        const collapseAllBtn = document.querySelector('button[onclick="collapseAll()"]');
        
        if (selectAllBtn) selectAllBtn.onclick = () => this.selectAllPeriods();
        if (deselectAllBtn) deselectAllBtn.onclick = () => this.deselectAllPeriods();
        if (expandAllBtn) expandAllBtn.onclick = () => this.expandAll();
        if (collapseAllBtn) collapseAllBtn.onclick = () => this.collapseAll();
    },
    
    // Удаление слушателей событий для предотвращения утечек памяти
    removeEventListeners() {
        // Очистка обработчиков графиков
        Object.values(this.state.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.state.charts = {};
    },
    
    // Переключение темы
    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    },
    
    // Переключение вкладок
    switchTab(tabName) {
        this.state.currentTab = tabName;
        
        // Деактивировать все вкладки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Активировать выбранную
        const tabContent = document.getElementById(`${tabName}Tab`);
        const tabBtns = document.querySelectorAll('.tab-btn');
        
        if (tabContent) {
            tabContent.classList.add('active');
            
            // Найти и активировать соответствующую кнопку
            tabBtns.forEach(btn => {
                const btnText = btn.textContent.toLowerCase();
                if ((tabName === 'table' && btnText.includes('таблица')) ||
                    (tabName === 'charts' && btnText.includes('графики')) ||
                    (tabName === 'products' && btnText.includes('товары')) ||
                    (tabName === 'database' && btnText.includes('база'))) {
                    btn.classList.add('active');
                }
            });
            
            // Загрузить контент вкладки при необходимости
            if (tabName === 'charts') {
                setTimeout(() => this.buildCharts(), 100);
            } else if (tabName === 'products') {
                this.buildProducts();
            } else if (tabName === 'database') {
                this.buildDatabase();
            }
        }
    },
    
    // Обновление статистики
    updateStats() {
        const stats = this.data.stats;
        
        // Обновление карточек статистики
        const updateStatCard = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = this.formatNumber(value);
            }
        };
        
        updateStatCard('statTotal', stats.totalRevenue || 0);
        updateStatCard('statCash', stats.byPaymentType?.CASH?.total || 0);
        updateStatCard('statQR', stats.byPaymentType?.QR?.total || 0);
        updateStatCard('statVIP', stats.byPaymentType?.VIP?.total || 0);
        updateStatCard('statCard', stats.byPaymentType?.CARD?.total || 0);
        updateStatCard('statReturn', stats.returns || 0);
    },
    
    // Построение иерархической таблицы
    buildHierarchicalTable() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Сортировка годов по убыванию
        const sortedYears = Object.keys(this.data.hierarchicalData).sort((a, b) => b.localeCompare(a));
        
        sortedYears.forEach(yearKey => {
            const yearData = this.data.hierarchicalData[yearKey];
            this.renderPeriodRow(tbody, yearKey, yearData, 0);
        });
        
        this.updateSummaryPanel();
    },
    
    // Отрисовка строки периода
    renderPeriodRow(container, key, data, level) {
        const row = document.createElement('tr');
        row.className = `period-row ${data.type}-row`;
        row.dataset.key = key;
        row.dataset.level = level;
        
        const hasChildren = data.children && Object.keys(data.children).length > 0;
        const isExpanded = this.state.expandedPeriods.has(key);
        const isSelected = this.state.selectedPeriods.has(key);
        
        // Скрытие строки при поиске
        if (this.state.searchTerm && !this.matchesSearch(data.name)) {
            row.style.display = 'none';
        }
        
        const stats = data.stats;
        const totalCount = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
        const totalSum = Object.values(stats).reduce((sum, s) => sum + s.sum, 0);
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="period-checkbox" ${isSelected ? 'checked' : ''} 
                       onchange="App.togglePeriodSelection('${key}')">
            </td>
            <td>
                ${hasChildren ? `<span class="expand-icon ${isExpanded ? 'expanded' : ''}" 
                                      onclick="App.togglePeriodExpansion('${key}')">▶</span>` : ''}
            </td>
            <td>
                <div class="period-name" style="padding-left: ${level * 20}px;">
                    ${this.escapeHtml(data.name)}
                </div>
            </td>
            <td class="text-right">${stats.CASH.count}</td>
            <td class="text-right">
                <span class="clickable-value" onclick="App.showGlobalDetails('CASH', '${key}')">
                    ${this.formatNumber(stats.CASH.sum)}
                </span>
            </td>
            <td class="text-right">${stats.QR.count}</td>
            <td class="text-right">
                <span class="clickable-value" onclick="App.showGlobalDetails('QR', '${key}')">
                    ${this.formatNumber(stats.QR.sum)}
                </span>
            </td>
            <td class="text-right">${stats.VIP.count}</td>
            <td class="text-right">
                <span class="clickable-value" onclick="App.showGlobalDetails('VIP', '${key}')">
                    ${this.formatNumber(stats.VIP.sum)}
                </span>
            </td>
            <td class="text-right">${stats.CARD.count}</td>
            <td class="text-right">
                <span class="clickable-value" onclick="App.showGlobalDetails('CARD', '${key}')">
                    ${this.formatNumber(stats.CARD.sum)}
                </span>
            </td>
            <td class="text-right">${stats.RETURN.count}</td>
            <td class="text-right return-value">
                <span class="clickable-value" onclick="App.showGlobalDetails('RETURN', '${key}')">
                    ${this.formatNumber(stats.RETURN.sum)}
                </span>
            </td>
            <td class="text-right" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">${totalCount}</td>
            <td class="text-right" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                <span class="clickable-value" onclick="App.showGlobalDetails('ALL', '${key}')" style="color: white;">
                    ${this.formatNumber(totalSum)}
                </span>
            </td>
        `;
        
        container.appendChild(row);
        
        // Отрисовка дочерних элементов
        if (hasChildren && isExpanded) {
            const sortedChildren = Object.keys(data.children).sort((a, b) => {
                if (data.type === 'year') return b.localeCompare(a); // Месяцы по убыванию
                return b.localeCompare(a); // Дни по убыванию
            });
            
            sortedChildren.forEach(childKey => {
                this.renderPeriodRow(container, childKey, data.children[childKey], level + 1);
            });
        }
    },
    
    // Проверка соответствия поиску
    matchesSearch(text) {
        return text.toLowerCase().includes(this.state.searchTerm.toLowerCase());
    },
    
    // Фильтрация иерархической таблицы
    filterHierarchicalTable() {
        const rows = document.querySelectorAll('.period-row');
        rows.forEach(row => {
            const key = row.dataset.key;
            const data = this.findDataByKey(key);
            if (data && this.matchesSearch(data.name)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },
    
    // Поиск данных по ключу
    findDataByKey(key) {
        const parts = key.split('-');
        if (parts.length === 1) {
            // Год
            return this.data.hierarchicalData[key];
        } else if (parts.length === 2) {
            // Месяц
            const year = parts[0];
            return this.data.hierarchicalData[year]?.children[key];
        } else if (parts.length === 3) {
            // День
            const year = parts[0];
            const month = `${parts[0]}-${parts[1]}`;
            return this.data.hierarchicalData[year]?.children[month]?.children[key];
        }
        return null;
    },
    
    // Переключение выбора периода
    togglePeriodSelection(key) {
        if (this.state.selectedPeriods.has(key)) {
            this.state.selectedPeriods.delete(key);
        } else {
            this.state.selectedPeriods.add(key);
        }
        this.updateSummaryPanel();
    },
    
    // Переключение развертывания периода
    togglePeriodExpansion(key) {
        if (this.state.expandedPeriods.has(key)) {
            this.state.expandedPeriods.delete(key);
        } else {
            this.state.expandedPeriods.add(key);
        }
        this.buildHierarchicalTable();
    },
    
    // Выбрать все периоды
    selectAllPeriods() {
        document.querySelectorAll('.period-checkbox').forEach(checkbox => {
            checkbox.checked = true;
            this.state.selectedPeriods.add(checkbox.closest('tr').dataset.key);
        });
        this.updateSummaryPanel();
    },
    
    // Снять выделение всех периодов
    deselectAllPeriods() {
        document.querySelectorAll('.period-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.state.selectedPeriods.clear();
        this.updateSummaryPanel();
    },
    
    // Развернуть все
    expandAll() {
        Object.keys(this.data.hierarchicalData).forEach(yearKey => {
            this.state.expandedPeriods.add(yearKey);
            const yearData = this.data.hierarchicalData[yearKey];
            if (yearData.children) {
                Object.keys(yearData.children).forEach(monthKey => {
                    this.state.expandedPeriods.add(monthKey);
                });
            }
        });
        this.buildHierarchicalTable();
    },
    
    // Свернуть все
    collapseAll() {
        this.state.expandedPeriods.clear();
        this.buildHierarchicalTable();
    },
    
    // Обновление панели итогов
    updateSummaryPanel() {
        const panel = document.getElementById('summaryPanel');
        const title = document.getElementById('summaryTitle');
        const subtitle = document.getElementById('summarySubtitle');
        const stats = document.getElementById('summaryStats');
        const compareBtn = document.getElementById('compareBtn');
        
        if (!panel) return;
        
        const selectedCount = this.state.selectedPeriods.size;
        
        if (selectedCount === 0) {
            panel.classList.remove('active');
            title.textContent = 'Выберите периоды';
            subtitle.textContent = 'для анализа';
            compareBtn.style.display = 'none';
            return;
        }
        
        panel.classList.add('active');
        title.textContent = `Выбрано периодов: ${selectedCount}`;
        subtitle.textContent = 'статистика по выбранным периодам';
        
        // Подсчет общей статистики
        let totalStats = { CASH: {count: 0, sum: 0}, QR: {count: 0, sum: 0}, VIP: {count: 0, sum: 0}, CARD: {count: 0, sum: 0}, RETURN: {count: 0, sum: 0} };
        
        this.state.selectedPeriods.forEach(key => {
            const data = this.findDataByKey(key);
            if (data && data.stats) {
                Object.keys(totalStats).forEach(type => {
                    totalStats[type].count += data.stats[type].count;
                    totalStats[type].sum += data.stats[type].sum;
                });
            }
        });
        
        const totalSum = Object.values(totalStats).reduce((sum, s) => sum + s.sum, 0);
        
        stats.innerHTML = `
            <div class="summary-stat">
                <div class="summary-stat-value">${this.formatNumber(totalStats.CASH.sum)}</div>
                <div class="summary-stat-label">Наличные</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${this.formatNumber(totalStats.QR.sum)}</div>
                <div class="summary-stat-label">QR</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${this.formatNumber(totalStats.VIP.sum)}</div>
                <div class="summary-stat-label">VIP</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${this.formatNumber(totalStats.CARD.sum)}</div>
                <div class="summary-stat-label">Карты</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value return-value">${this.formatNumber(totalStats.RETURN.sum)}</div>
                <div class="summary-stat-label">Возвраты</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value" style="font-size: 20px; color: var(--primary-color);">${this.formatNumber(totalSum)}</div>
                <div class="summary-stat-label">Итого</div>
            </div>
        `;
        
        compareBtn.style.display = selectedCount > 1 ? 'block' : 'none';
    },
    
    // Показать детали по типу оплаты
    showGlobalDetails(paymentType, periodKey = null) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        let title = '';
        let orders = [];
        
        if (paymentType === 'ALL') {
            title = periodKey ? `Все операции за ${this.findDataByKey(periodKey)?.name || periodKey}` : 'Все операции';
            orders = this.data.orders.filter(order => {
                if (periodKey) {
                    const orderDate = new Date(order.date || order.operationDate);
                    return this.orderMatchesPeriod(orderDate, periodKey);
                }
                return true;
            });
        } else {
            const typeLabels = {
                'CASH': 'Наличные',
                'QR': 'QR платежи',
                'VIP': 'VIP клиенты',
                'CARD': 'Карты',
                'RETURN': 'Возвраты'
            };
            title = `${typeLabels[paymentType] || paymentType}${periodKey ? ` за ${this.findDataByKey(periodKey)?.name || periodKey}` : ''}`;
            
            orders = this.data.orders.filter(order => {
                const matchesType = paymentType === 'RETURN' ? order.isReturn : order.paymentType === paymentType;
                if (periodKey) {
                    const orderDate = new Date(order.date || order.operationDate);
                    return matchesType && this.orderMatchesPeriod(orderDate, periodKey);
                }
                return matchesType;
            });
        }
        
        modalTitle.textContent = title;
        
        if (orders.length === 0) {
            modalBody.innerHTML = '<p>Нет данных для отображения</p>';
        } else {
            modalBody.innerHTML = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; font-size: 14px;">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Товар</th>
                                <th>Вариант</th>
                                <th>Тип оплаты</th>
                                <th class="text-right">Сумма</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.map(order => `
                                <tr>
                                    <td>${new Date(order.date || order.operationDate).toLocaleDateString('ru-RU')}</td>
                                    <td>${this.escapeHtml(order.product || order.productName || '')}</td>
                                    <td>${this.escapeHtml(order.flavor || order.productVariant || '')}</td>
                                    <td>${this.escapeHtml(this.getPaymentTypeLabel(order.paymentType))}</td>
                                    <td class="text-right ${order.isReturn ? 'return-value' : ''}">${this.formatNumber(order.price || order.totalAmount || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); text-align: center;">
                    <strong>Итого: ${orders.length} операций на сумму ${this.formatNumber(orders.reduce((sum, o) => sum + (o.price || o.totalAmount || 0), 0))}</strong>
                </div>
            `;
        }
        
        modal.classList.add('active');
    },
    
    // Проверка соответствия заказа периоду
    orderMatchesPeriod(orderDate, periodKey) {
        const parts = periodKey.split('-');
        if (parts.length === 1) {
            // Год
            return orderDate.getFullYear().toString() === periodKey;
        } else if (parts.length === 2) {
            // Месяц
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            return orderDate.getFullYear() === year && (orderDate.getMonth() + 1) === month;
        } else if (parts.length === 3) {
            // День
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            return orderDate.getFullYear() === year && 
                   (orderDate.getMonth() + 1) === month && 
                   orderDate.getDate() === day;
        }
        return false;
    },
    
    // Сравнение выбранных периодов
    compareSelectedPeriods() {
        if (this.state.selectedPeriods.size < 2) {
            this.showToast('Выберите минимум 2 периода для сравнения', 'warning');
            return;
        }
        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = 'Сравнение периодов';
        
        const periods = Array.from(this.state.selectedPeriods).map(key => {
            const data = this.findDataByKey(key);
            return { key, data };
        }).filter(p => p.data);
        
        const comparisonTable = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 14px;">
                    <thead>
                        <tr>
                            <th>Период</th>
                            <th class="text-right">Наличные</th>
                            <th class="text-right">QR</th>
                            <th class="text-right">VIP</th>
                            <th class="text-right">Карты</th>
                            <th class="text-right">Возвраты</th>
                            <th class="text-right">Итого</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${periods.map(period => {
                            const stats = period.data.stats;
                            const total = Object.values(stats).reduce((sum, s) => sum + s.sum, 0);
                            return `
                                <tr>
                                    <td><strong>${this.escapeHtml(period.data.name)}</strong></td>
                                    <td class="text-right">${this.formatNumber(stats.CASH.sum)}</td>
                                    <td class="text-right">${this.formatNumber(stats.QR.sum)}</td>
                                    <td class="text-right">${this.formatNumber(stats.VIP.sum)}</td>
                                    <td class="text-right">${this.formatNumber(stats.CARD.sum)}</td>
                                    <td class="text-right return-value">${this.formatNumber(stats.RETURN.sum)}</td>
                                    <td class="text-right"><strong>${this.formatNumber(total)}</strong></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        modalBody.innerHTML = comparisonTable;
        modal.classList.add('active');
    },
    
    // Инициализация загрузки файлов
    initFileUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (!uploadArea || !fileInput) return;
        
        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                await this.uploadFile(file);
            }
        });
        
        // Выбор файла
        fileInput.addEventListener('change', async (e) => {
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
            this.showLoading(true, 'Загрузка файла...');
            
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
                this.buildHierarchicalTable();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
            // Очистить input
            document.getElementById('fileInput').value = '';
        }
    },
    
    // Показать статистику загрузки
    showUploadStats(stats) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = '📊 Результаты обработки файла';
        modalBody.innerHTML = `
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
                ${stats.errors > 0 ? `
                <div class="stat-item error">
                    <span>❌ Ошибок:</span>
                    <strong>${stats.errors} записей</strong>
                </div>
                ` : ''}
            </div>
        `;
        modal.classList.add('active');
    },
    
    // Построение графиков
    buildCharts() {
        if (!window.Chart) {
            this.showToast('Chart.js не загружен', 'error');
            return;
        }
        
        this.buildSalesTrendChart();
        this.buildPaymentTypesChart();
        this.buildTopProductsChart();
        this.buildPeriodComparisonChart();
    },
    
    // График динамики продаж
    buildSalesTrendChart() {
        const ctx = document.getElementById('salesTrendChart');
        if (!ctx) return;
        
        // Уничтожить существующий график
        if (this.state.charts.salesTrend) {
            this.state.charts.salesTrend.destroy();
        }
        
        // Подготовка данных по месяцам
        const monthlyData = {};
        this.data.orders.forEach(order => {
            const date = new Date(order.date || order.operationDate);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            monthlyData[monthKey] += parseFloat(order.price || order.totalAmount || 0);
        });
        
        const sortedMonths = Object.keys(monthlyData).sort();
        const labels = sortedMonths.map(month => {
            const [year, monthNum] = month.split('-');
            return `${monthNum}/${year}`;
        });
        const data = sortedMonths.map(month => monthlyData[month]);
        
        this.state.charts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Выручка',
                    data: data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatNumber(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => `Выручка: ${this.formatNumber(context.raw)}`
                        }
                    }
                }
            }
        });
    },
    
    // График по типам оплаты
    buildPaymentTypesChart() {
        const ctx = document.getElementById('paymentTypesChart');
        if (!ctx) return;
        
        if (this.state.charts.paymentTypes) {
            this.state.charts.paymentTypes.destroy();
        }
        
        const paymentData = this.data.stats.byPaymentType || {};
        const labels = Object.keys(paymentData).map(type => this.getPaymentTypeLabel(type));
        const data = Object.values(paymentData).map(item => item.total || 0);
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];
        
        this.state.charts.paymentTypes = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = this.formatNumber(context.raw);
                                return `${context.label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    },
    
    // График топ товаров
    buildTopProductsChart() {
        const ctx = document.getElementById('topProductsChart');
        if (!ctx) return;
        
        if (this.state.charts.topProducts) {
            this.state.charts.topProducts.destroy();
        }
        
        // Группировка по товарам
        const productsData = {};
        this.data.orders.forEach(order => {
            const productKey = `${order.product || order.productName || 'Неизвестно'} (${order.flavor || order.productVariant || 'Стандарт'})`;
            if (!productsData[productKey]) {
                productsData[productKey] = 0;
            }
            productsData[productKey] += parseFloat(order.price || order.totalAmount || 0);
        });
        
        const sortedProducts = Object.entries(productsData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        const labels = sortedProducts.map(([name]) => name);
        const data = sortedProducts.map(([,value]) => value);
        
        this.state.charts.topProducts = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Выручка',
                    data: data,
                    backgroundColor: '#4BC0C0',
                    borderColor: '#36A2EB',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatNumber(value)
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => `Выручка: ${this.formatNumber(context.raw)}`
                        }
                    }
                }
            }
        });
    },
    
    // График сравнения периодов
    buildPeriodComparisonChart() {
        const ctx = document.getElementById('periodComparisonChart');
        if (!ctx) return;
        
        if (this.state.charts.periodComparison) {
            this.state.charts.periodComparison.destroy();
        }
        
        // Данные по годам
        const yearlyData = Object.keys(this.data.hierarchicalData).map(yearKey => {
            const yearData = this.data.hierarchicalData[yearKey];
            const total = Object.values(yearData.stats).reduce((sum, s) => sum + s.sum, 0);
            return { year: yearKey, total };
        }).sort((a, b) => a.year.localeCompare(b.year));
        
        const labels = yearlyData.map(item => item.year);
        const data = yearlyData.map(item => item.total);
        
        this.state.charts.periodComparison = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Выручка по годам',
                    data: data,
                    backgroundColor: '#667eea',
                    borderColor: '#764ba2',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatNumber(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => `Выручка: ${this.formatNumber(context.raw)}`
                        }
                    }
                }
            }
        });
    },
    
    // Обновление графиков
    updateCharts() {
        this.buildCharts();
        this.showToast('Графики обновлены', 'success');
    },
    
    // Построение товаров
    buildProducts() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;
        
        // Группировка по товарам
        const productsData = {};
        this.data.orders.forEach(order => {
            const productKey = `${order.product || order.productName || 'Неизвестно'}|${order.flavor || order.productVariant || 'Стандарт'}`;
            if (!productsData[productKey]) {
                productsData[productKey] = {
                    productName: order.product || order.productName || 'Неизвестно',
                    productVariant: order.flavor || order.productVariant || 'Стандарт',
                    sales: 0,
                    returns: 0,
                    revenue: 0
                };
            }
            
            const amount = parseFloat(order.price || order.totalAmount || 0);
            if (order.isReturn) {
                productsData[productKey].returns++;
                productsData[productKey].revenue -= amount;
            } else {
                productsData[productKey].sales++;
                productsData[productKey].revenue += amount;
            }
        });
        
        const products = Object.values(productsData)
            .sort((a, b) => b.revenue - a.revenue);
        
        const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
        
        tbody.innerHTML = products.map((product, index) => {
            const avgCheck = product.sales > 0 ? product.revenue / product.sales : 0;
            const share = totalRevenue > 0 ? (product.revenue / totalRevenue) * 100 : 0;
            
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${this.escapeHtml(product.productName)}</td>
                    <td>${this.escapeHtml(product.productVariant)}</td>
                    <td class="text-right">${product.sales}</td>
                    <td class="text-right">${product.returns}</td>
                    <td class="text-right">${this.formatNumber(product.revenue)}</td>
                    <td class="text-right">${this.formatNumber(avgCheck)}</td>
                    <td class="text-right">${share.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    },
    
    // Экспорт товаров
    async exportProducts() {
        try {
            const result = await this.apiRequest('/api/export/products');
            window.open(`${this.API_URL}${result.url}`, '_blank');
            this.showToast(`Экспорт товаров выполнен`, 'success');
        } catch (error) {
            this.showToast('Ошибка экспорта товаров', 'error');
        }
    },
    
    // Построение базы данных
    async buildDatabase() {
        const dbContent = document.getElementById('dbContent');
        const dbStats = document.getElementById('dbStats');
        
        if (!dbContent || !dbStats) return;
        
        try {
            const info = await this.apiRequest('/api/database/info');
            
            dbStats.innerHTML = `
                <div class="db-stat-card">
                    <span>Записей в базе:</span>
                    <strong>${info.totalRecords}</strong>
                </div>
                <div class="db-stat-card">
                    <span>Загружено файлов:</span>
                    <strong>${info.totalFiles}</strong>
                </div>
                <div class="db-stat-card">
                    <span>Последнее обновление:</span>
                    <strong>${info.lastUpdate ? new Date(info.lastUpdate).toLocaleString('ru-RU') : '-'}</strong>
                </div>
                <div class="db-stat-card">
                    <span>Размер базы данных:</span>
                    <strong>${this.escapeHtml(info.dbSize || 'Неизвестно')}</strong>
                </div>
            `;
            
            if (this.user.role === 'admin') {
                const files = this.data.files;
                dbContent.innerHTML = `
                    <h3>История загруженных файлов</h3>
                    <div class="files-list">
                        ${files.map(file => `
                            <div class="file-item">
                                <span class="file-name">📄 ${this.escapeHtml(file.fileName)}</span>
                                <span class="file-date">${new Date(file.uploadDate).toLocaleString('ru-RU')}</span>
                                <span class="file-stats">
                                    <span class="badge badge-success">+${file.recordsNew}</span>
                                    ${file.recordsDuplicate > 0 ? `<span class="badge badge-warning">${file.recordsDuplicate} дубл.</span>` : ''}
                                    ${file.recordsErrors > 0 ? `<span class="badge badge-error">${file.recordsErrors} ошиб.</span>` : ''}
                                </span>
                                <span class="file-uploader">Загрузил: ${this.escapeHtml(file.uploadedByName || 'Неизвестно')}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                dbContent.innerHTML = '<p>Информация доступна только администраторам</p>';
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
            'RETURN': 'Возврат',
            'UNKNOWN': 'Неизвестно'
        };
        return labels[type] || type;
    },
    
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        // Автоматическое удаление
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    },
    
    showLoading(show, text = 'Загрузка...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (overlay) {
            overlay.classList.toggle('active', show);
            if (loadingText && text) {
                loadingText.textContent = text;
            }
        }
    },
    
    closeModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
};

// Глобальные функции для обратной совместимости
function switchTab(tabName) {
    App.switchTab(tabName);
}

function selectAllPeriods() {
    App.selectAllPeriods();
}

function deselectAllPeriods() {
    App.deselectAllPeriods();
}

function expandAll() {
    App.expandAll();
}

function collapseAll() {
    App.collapseAll();
}

function compareSelectedPeriods() {
    App.compareSelectedPeriods();
}

function showGlobalDetails(paymentType, periodKey) {
    App.showGlobalDetails(paymentType, periodKey);
}

function updateCharts() {
    App.updateCharts();
}

function exportProducts() {
    App.exportProducts();
}

function toggleTheme() {
    App.toggleTheme();
}

function closeModal() {
    App.closeModal();
}

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
        App.buildHierarchicalTable();
    } catch (error) {
        App.showToast('Ошибка очистки базы данных', 'error');
    }
}

async function exportDatabase() {
    try {
        const result = await App.apiRequest('/api/export');
        window.open(`${App.API_URL}${result.url}`, '_blank');
        App.showToast(`Экспорт выполнен: ${result.recordsCount} записей`, 'success');
    } catch (error) {
        App.showToast('Ошибка экспорта', 'error');
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
