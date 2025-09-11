// Модуль отчетности с полным функционалом иерархической таблицы
const Reports = {
    data: {
        yearly: {},
        monthly: {},
        daily: {},
        products: {}
    },
    
    MONTH_NAMES: ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    
    async init() {
        await this.loadData();
        this.buildTable();
        this.updateStatistics();
    },
    
    async loadData() {
        try {
            const response = await App.apiRequest('/api/reports/data');
            this.data = response;
        } catch (error) {
            console.error('Ошибка загрузки данных отчетности:', error);
        }
    },
    
    updateStatistics() {
        let totals = {
            CASH: { count: 0, total: 0 },
            QR: { count: 0, total: 0 },
            VIP: { count: 0, total: 0 },
            CARD: { count: 0, total: 0 },
            RETURN: { count: 0, total: 0 }
        };
        
        // Суммируем по всем месяцам
        Object.values(this.data.monthly || {}).forEach(month => {
            Object.keys(totals).forEach(type => {
                totals[type].count += month[type]?.count || 0;
                totals[type].total += month[type]?.total || 0;
            });
        });
        
        // Чистая выручка
        const netRevenue = totals.CASH.total + totals.QR.total + 
                          totals.VIP.total + totals.CARD.total - totals.RETURN.total;
        
        // Обновляем карточки
        document.getElementById('reportStatTotal').textContent = App.formatNumber(netRevenue);
        document.getElementById('reportStatCash').textContent = App.formatNumber(totals.CASH.total);
        document.getElementById('reportStatQR').textContent = App.formatNumber(totals.QR.total);
        document.getElementById('reportStatVIP').textContent = App.formatNumber(totals.VIP.total);
        document.getElementById('reportStatCard').textContent = App.formatNumber(totals.CARD.total);
        document.getElementById('reportStatReturn').textContent = '-' + App.formatNumber(totals.RETURN.total);
    },
    
    buildTable() {
        const tbody = document.getElementById('reportsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        // Сортировка годов
        const years = Object.keys(this.data.yearly || {}).sort();
        
        years.forEach(yearKey => {
            const yearData = this.data.yearly[yearKey];
            const yearRow = this.createTableRow('year', yearKey, `${yearKey} год`, yearData);
            tbody.appendChild(yearRow);
            
            // Месяцы года
            const months = Object.keys(this.data.monthly || {})
                .filter(key => key.startsWith(yearKey + '_'))
                .sort((a, b) => {
                    const monthA = parseInt(a.split('_')[1]);
                    const monthB = parseInt(b.split('_')[1]);
                    return monthA - monthB;
                });
            
            months.forEach(monthKey => {
                const monthData = this.data.monthly[monthKey];
                const month = parseInt(monthKey.split('_')[1]);
                const monthName = this.MONTH_NAMES[month];
                
                const monthRow = this.createTableRow('month', monthKey, 
                    `${monthName} ${yearKey}`, monthData);
                monthRow.classList.add(`year_${yearKey}`, 'month-row');
                monthRow.style.display = 'none';
                tbody.appendChild(monthRow);
                
                // Дни месяца
                const days = Object.keys(this.data.daily || {})
                    .filter(key => key.startsWith(monthKey + '_'))
                    .sort((a, b) => {
                        const dayA = parseInt(a.split('_')[2]);
                        const dayB = parseInt(b.split('_')[2]);
                        return dayA - dayB;
                    });
                
                days.forEach(dayKey => {
                    const dayData = this.data.daily[dayKey];
                    const day = parseInt(dayKey.split('_')[2]);
                    
                    const dayRow = this.createTableRow('day', dayKey, 
                        `${day} ${monthName}`, dayData);
                    dayRow.classList.add(`month_${monthKey}`, 'day-row');
                    dayRow.style.display = 'none';
                    tbody.appendChild(dayRow);
                });
            });
        });
    },
    
    createTableRow(type, key, label, data) {
        const row = document.createElement('tr');
        row.className = `${type}-row`;
        row.id = `report_row_${key}`;
        
        const expandBtn = type !== 'day' ? 
            `<button class="expand-btn" onclick="Reports.toggleRow('${key}')" id="report_btn_${key}">+</button>` : '';
        
        // Расчет итогов
        const total = (data.CASH?.total || 0) + (data.QR?.total || 0) + 
                     (data.VIP?.total || 0) + (data.CARD?.total || 0) - 
                     (data.RETURN?.total || 0);
        
        const totalCount = (data.CASH?.count || 0) + (data.QR?.count || 0) + 
                          (data.VIP?.count || 0) + (data.CARD?.count || 0);
        
        const indent = type === 'month' ? 20 : type === 'day' ? 40 : 0;
        
        row.innerHTML = `
            <td>${expandBtn}</td>
            <td style="padding-left: ${20 + indent}px; font-weight: ${type === 'year' ? '600' : '400'}">
                ${label}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'CASH')">
                ${data.CASH?.count || 0}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'CASH')">
                ${App.formatNumber(data.CASH?.total || 0)}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'QR')">
                ${data.QR?.count || 0}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'QR')">
                ${App.formatNumber(data.QR?.total || 0)}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'VIP')">
                ${data.VIP?.count || 0}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'VIP')">
                ${App.formatNumber(data.VIP?.total || 0)}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'CARD')">
                ${data.CARD?.count || 0}
            </td>
            <td class="text-right clickable" onclick="Reports.showDetails('${key}', 'CARD')">
                ${App.formatNumber(data.CARD?.total || 0)}
            </td>
            <td class="text-right">${data.RETURN?.count || 0}</td>
            <td class="text-right return-value">-${App.formatNumber(data.RETURN?.total || 0)}</td>
            <td class="text-right font-bold clickable" onclick="Reports.showDetails('${key}', 'ALL')">
                ${totalCount}
            </td>
            <td class="text-right font-bold clickable" onclick="Reports.showDetails('${key}', 'ALL')">
                ${App.formatNumber(total)}
            </td>
        `;
        
        return row;
    },
    
    toggleRow(key) {
        const btn = document.getElementById(`report_btn_${key}`);
        if (!btn) return;
        
        const isExpanded = btn.textContent === '-';
        
        if (key.includes('_')) {
            // Месяц - показываем/скрываем дни
            const dayRows = document.querySelectorAll(`.month_${key}`);
            dayRows.forEach(row => {
                row.style.display = isExpanded ? 'none' : 'table-row';
            });
        } else {
            // Год - показываем/скрываем месяцы
            const monthRows = document.querySelectorAll(`.year_${key}`);
            monthRows.forEach(row => {
                row.style.display = isExpanded ? 'none' : 'table-row';
                
                // При сворачивании года скрываем и дни
                if (isExpanded) {
                    const monthKey = row.id.replace('report_row_', '');
                    const dayRows = document.querySelectorAll(`.month_${monthKey}`);
                    dayRows.forEach(dayRow => dayRow.style.display = 'none');
                    
                    const monthBtn = document.getElementById(`report_btn_${monthKey}`);
                    if (monthBtn) monthBtn.textContent = '+';
                }
            });
        }
        
        btn.textContent = isExpanded ? '+' : '-';
        btn.classList.toggle('expanded', !isExpanded);
    },
    
    expandAll() {
        // Раскрываем все года
        Object.keys(this.data.yearly || {}).forEach(year => {
            const btn = document.getElementById(`report_btn_${year}`);
            if (btn && btn.textContent === '+') {
                this.toggleRow(year);
            }
        });
        
        // Раскрываем все месяцы
        Object.keys(this.data.monthly || {}).forEach(month => {
            const btn = document.getElementById(`report_btn_${month}`);
            if (btn && btn.textContent === '+') {
                this.toggleRow(month);
            }
        });
    },
    
    collapseAll() {
        // Сворачиваем месяцы
        Object.keys(this.data.monthly || {}).forEach(month => {
            const btn = document.getElementById(`report_btn_${month}`);
            if (btn && btn.textContent === '-') {
                this.toggleRow(month);
            }
        });
        
        // Сворачиваем года
        Object.keys(this.data.yearly || {}).forEach(year => {
            const btn = document.getElementById(`report_btn_${year}`);
            if (btn && btn.textContent === '-') {
                this.toggleRow(year);
            }
        });
    },
    
    async showDetails(periodKey, paymentType) {
        try {
            const response = await App.apiRequest(
                `/api/reports/details?period=${periodKey}&type=${paymentType}`
            );
            
            this.showProductDetailsModal(response, periodKey, paymentType);
        } catch (error) {
            App.showToast('Ошибка загрузки деталей', 'error');
        }
    },
    
    async showGlobalDetails(paymentType) {
        try {
            const response = await App.apiRequest(
                `/api/reports/details?type=${paymentType}`
            );
            
            this.showProductDetailsModal(response, 'all', paymentType);
        } catch (error) {
            App.showToast('Ошибка загрузки деталей', 'error');
        }
    },
    
    showProductDetailsModal(data, period, type) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        const periodLabel = period === 'all' ? 'Все периоды' : 
                          this.getPeriodLabel(period);
        const typeLabel = type === 'ALL' ? 'Все типы' : type;
        
        modalTitle.textContent = `${periodLabel} - ${typeLabel}`;
        
        // Агрегация по продуктам
        const products = {};
        data.forEach(item => {
            const key = `${item.productName}|||${item.productVariant}`;
            if (!products[key]) {
                products[key] = {
                    productCode: item.productCode,
                    productName: item.productName,
                    productVariant: item.productVariant,
                    count: 0,
                    quantity: 0,
                    total: 0
                };
            }
            products[key].count++;
            products[key].quantity += item.quantity || 1;
            products[key].total += item.isReturn ? -item.totalAmount : item.totalAmount;
        });
        
        const productsArray = Object.values(products).sort((a, b) => b.total - a.total);
        
        let html = `
            <div class="modal-controls">
                <input type="text" class="search-input" placeholder="Поиск..." 
                       id="modalSearch" onkeyup="Reports.filterModal()">
                <button class="btn btn-success" 
                        onclick="Reports.exportDetails('${periodLabel}_${typeLabel}', 
                        ${JSON.stringify(productsArray).replace(/"/g, '&quot;')})">
                    📥 Экспорт
                </button>
            </div>
            <table style="width: 100%; margin-top: 20px;">
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Код</th>
                        <th>Товар</th>
                        <th>Вариант</th>
                        <th class="text-right">Операций</th>
                        <th class="text-right">Количество</th>
                        <th class="text-right">Сумма</th>
                    </tr>
                </thead>
                <tbody id="modalTableBody">
        `;
        
        let totalCount = 0;
        let totalQuantity = 0;
        let totalSum = 0;
        
        productsArray.forEach((product, index) => {
            totalCount += product.count;
            totalQuantity += product.quantity;
            totalSum += product.total;
            
            html += `
                <tr class="modal-row">
                    <td>${index + 1}</td>
                    <td class="product-code">${product.productCode || '-'}</td>
                    <td class="product-name">${product.productName}</td>
                    <td class="product-variant">${product.productVariant}</td>
                    <td class="text-right">${product.count}</td>
                    <td class="text-right">${product.quantity}</td>
                    <td class="text-right ${product.total < 0 ? 'return-value' : ''}">
                        ${App.formatNumber(product.total)}
                    </td>
                </tr>
            `;
        });
        
        html += `
                <tr style="font-weight: 600; background: var(--hover-bg);">
                    <td colspan="4">ИТОГО</td>
                    <td class="text-right">${totalCount}</td>
                    <td class="text-right">${totalQuantity}</td>
                    <td class="text-right">${App.formatNumber(totalSum)}</td>
                </tr>
            </tbody>
            </table>
        `;
        
        modalBody.innerHTML = html;
        modal.classList.add('active');
    },
    
    getPeriodLabel(period) {
        if (period.includes('_')) {
            const parts = period.split('_');
            if (parts.length === 2) {
                const month = parseInt(parts[1]);
                return `${this.MONTH_NAMES[month]} ${parts[0]}`;
            } else if (parts.length === 3) {
                const month = parseInt(parts[1]);
                const day = parseInt(parts[2]);
                return `${day} ${this.MONTH_NAMES[month]} ${parts[0]}`;
            }
        }
        return `${period} год`;
    },
    
    filterModal() {
        const search = document.getElementById('modalSearch').value.toLowerCase();
        const rows = document.querySelectorAll('.modal-row');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(search) ? '' : 'none';
        });
    },
    
    exportDetails(title, data) {
        const exportData = data.map((item, index) => ({
            '№': index + 1,
            'Код': item.productCode || '-',
            'Товар': item.productName,
            'Вариант': item.productVariant,
            'Операций': item.count,
            'Количество': item.quantity,
            'Сумма': item.total
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Детализация');
        
        const fileName = `${title.replace(/[^а-яА-Яa-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        App.showToast('Файл экспортирован', 'success');
    },
    
    async exportToExcel() {
        // Экспорт всей таблицы отчетности
        const exportData = [];
        
        // Собираем данные по годам
        Object.keys(this.data.yearly || {}).sort().forEach(yearKey => {
            const yearData = this.data.yearly[yearKey];
            exportData.push({
                'Период': `${yearKey} год`,
                'Тип': 'Год',
                'Наличные (кол-во)': yearData.CASH?.count || 0,
                'Наличные (сумма)': yearData.CASH?.total || 0,
                'QR (кол-во)': yearData.QR?.count || 0,
                'QR (сумма)': yearData.QR?.total || 0,
                'VIP (кол-во)': yearData.VIP?.count || 0,
                'VIP (сумма)': yearData.VIP?.total || 0,
                'Карты (кол-во)': yearData.CARD?.count || 0,
                'Карты (сумма)': yearData.CARD?.total || 0,
                'Возвраты (кол-во)': yearData.RETURN?.count || 0,
                'Возвраты (сумма)': yearData.RETURN?.total || 0
            });
            
            // Добавляем месяцы
            Object.keys(this.data.monthly || {})
                .filter(key => key.startsWith(yearKey + '_'))
                .sort()
                .forEach(monthKey => {
                    const monthData = this.data.monthly[monthKey];
                    const month = parseInt(monthKey.split('_')[1]);
                    
                    exportData.push({
                        'Период': `${this.MONTH_NAMES[month]} ${yearKey}`,
                        'Тип': 'Месяц',
                        'Наличные (кол-во)': monthData.CASH?.count || 0,
                        'Наличные (сумма)': monthData.CASH?.total || 0,
                        'QR (кол-во)': monthData.QR?.count || 0,
                        'QR (сумма)': monthData.QR?.total || 0,
                        'VIP (кол-во)': monthData.VIP?.count || 0,
                        'VIP (сумма)': monthData.VIP?.total || 0,
                        'Карты (кол-во)': monthData.CARD?.count || 0,
                        'Карты (сумма)': monthData.CARD?.total || 0,
                        'Возвраты (кол-во)': monthData.RETURN?.count || 0,
                        'Возвраты (сумма)': monthData.RETURN?.total || 0
                    });
                });
        });
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Отчетность');
        
        const fileName = `Отчетность_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        App.showToast('Отчет экспортирован', 'success');
    }
};
