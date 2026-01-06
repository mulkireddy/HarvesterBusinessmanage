// --- State Management ---
const AppData = {
    farmers: JSON.parse(localStorage.getItem('hm_farmers')) || [],
    expenses: JSON.parse(localStorage.getItem('hm_expenses')) || [],
};

// File System Handle
let fileHandle = null;

const save = async () => {
    // 1. Save to LocalStorage (Always backup/cache)
    localStorage.setItem('hm_farmers', JSON.stringify(AppData.farmers));
    localStorage.setItem('hm_expenses', JSON.stringify(AppData.expenses));

    // 2. Save to Disk (If connected)
    if (fileHandle) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(AppData, null, 2));
            await writable.close();
        } catch (err) {
            console.error('Failed to save to disk:', err);
            alert('Error saving to file. Check permissions.');
        }
    }
};

// --- DOM Elements ---
const views = {
    farmers: document.getElementById('farmers-view'),
    expenses: document.getElementById('expenses-view'),
    analytics: document.getElementById('analytics-view'),
};

const navBtns = document.querySelectorAll('.nav-btn');
const tables = {
    farmers: document.querySelector('#farmers-table tbody'),
    expenses: document.querySelector('#expenses-table tbody'),
};

// --- Formatters ---
const formatCurrency = (num) => '₹' + Number(num).toLocaleString('en-IN');
const formatDate = (d) => new Date(d).toLocaleDateString('en-GB');

// --- Navigation ---
const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
const allNavBtns = [...navBtns, ...mobileNavBtns];

function switchTab(tab) {
    // Update all nav buttons
    allNavBtns.forEach(b => {
        if (b.dataset.tab === tab) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // Switch views
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[tab].classList.add('active');

    if (tab === 'analytics') {
        renderCharts();
    }
}

navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// --- Logic: Farmers ---
function renderFarmers() {
    tables.farmers.innerHTML = '';
    const mobileCardsContainer = document.getElementById('farmers-mobile-cards');
    if (mobileCardsContainer) mobileCardsContainer.innerHTML = '';

    // Filters
    const term = document.getElementById('farmer-search').value.toLowerCase();
    const startDate = document.getElementById('date-start').value;
    const endDate = document.getElementById('date-end').value;

    let totalRev = 0;
    let totalAcres = 0;
    let pendingPayment = 0;

    const filtered = AppData.farmers.filter(f => {
        // Text Match
        const matchesText = f.name.toLowerCase().includes(term) ||
            f.place.toLowerCase().includes(term) ||
            f.contact.includes(term);

        // Date Match
        let matchesDate = true;
        if (startDate) matchesDate = matchesDate && f.date >= startDate;
        if (endDate) matchesDate = matchesDate && f.date <= endDate;

        return matchesText && matchesDate;
    });

    if (filtered.length === 0) {
        document.getElementById('no-farmers-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-farmers-msg').classList.add('hidden');
    }

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(f => {
        // Migration logic for old records
        if (f.paidAmount === undefined) {
            f.paidAmount = f.status === 'Paid' ? f.total : 0;
        }
        const balance = f.total - f.paidAmount;

        // Status Update based on math
        let status = 'Pending';
        if (f.paidAmount >= f.total) status = 'Paid';
        else if (f.paidAmount > 0) status = 'Partial';

        // Force Settlement Override
        if (f.isSettled) status = 'Settled';

        f.status = status; // Ensure consistancy

        totalRev += Number(f.total);
        totalAcres += Number(f.acres);
        pendingPayment += Number(balance);

        // Desktop Table Row
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(f.date)}</td>
            <td><strong>${f.name}</strong></td>
            <td>${f.place}</td>
            <td>${f.crop || '-'}</td>
            <td>${f.contact}</td>
            <td>${f.acres}</td>
            <td>${formatCurrency(f.total)}</td>
            <td class="green-text">${formatCurrency(f.paidAmount)}</td>
            <td class="red-text"><strong>${formatCurrency(balance)}</strong></td>
            <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
            <td>
                <button class="action-btn share" onclick="shareFarmer('${f.id}')" title="WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
                <button class="action-btn" onclick="generateReceipt('${f.id}')" title="Download Receipt"><i class="ph ph-file-pdf"></i></button>
                <button class="action-btn" onclick="editFarmer('${f.id}')" title="Edit"><i class="ph ph-pencil"></i></button>
                <button class="action-btn delete" onclick="deleteFarmer('${f.id}')" title="Delete"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tables.farmers.appendChild(tr);

        // Mobile Card
        if (mobileCardsContainer) {
            const card = document.createElement('div');
            card.className = 'farmer-card';
            card.innerHTML = `
                <div class="farmer-card-header">
                    <div>
                        <div class="farmer-card-name">${f.name}</div>
                        <div class="farmer-card-date">${f.place} • ${f.crop || 'Crop N/A'} • ${formatDate(f.date)}</div>
                    </div>
                    <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                </div>
                <div class="farmer-card-info">
                    <div class="farmer-card-row">
                        <span class="farmer-card-label">Acres</span>
                        <span class="farmer-card-value">${f.acres}</span>
                    </div>
                    <div class="farmer-card-row">
                        <span class="farmer-card-label">Total</span>
                        <span class="farmer-card-value">${formatCurrency(f.total)}</span>
                    </div>
                    <div class="farmer-card-row">
                        <span class="farmer-card-label">Paid</span>
                        <span class="farmer-card-value green-text">${formatCurrency(f.paidAmount)}</span>
                    </div>
                    <div class="farmer-card-row">
                        <span class="farmer-card-label">Balance</span>
                        <span class="farmer-card-value red-text">${formatCurrency(balance)}</span>
                    </div>
                </div>
                <div class="farmer-card-footer">
                    <a href="tel:${f.contact}" class="farmer-card-phone">
                        <i class="ph ph-phone"></i> ${f.contact}
                    </a>
                    <div class="farmer-card-actions">
                        <button class="action-btn share" onclick="shareFarmer('${f.id}')" title="WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
                        <button class="action-btn" onclick="generateReceipt('${f.id}')" title="Download Receipt"><i class="ph ph-file-pdf"></i></button>
                        <button class="action-btn" onclick="editFarmer('${f.id}')" title="Edit"><i class="ph ph-pencil"></i></button>
                        <button class="action-btn delete" onclick="deleteFarmer('${f.id}')" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `;
            mobileCardsContainer.appendChild(card);
        }
    });

    document.getElementById('total-revenue').textContent = formatCurrency(totalRev);
    document.getElementById('total-acres').textContent = totalAcres.toFixed(1);
    document.getElementById('pending-payment').textContent = formatCurrency(pendingPayment);
}

// --- Logic: Expenses ---
function renderExpenses() {
    tables.expenses.innerHTML = '';
    let totalExp = 0;

    // Sort by date desc
    const sorted = [...AppData.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        document.getElementById('no-expenses-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-expenses-msg').classList.add('hidden');
    }

    sorted.forEach(e => {
        totalExp += Number(e.amount);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(e.date)}</td>
            <td>${e.category}</td>
            <td>${e.desc}</td>
            <td>${formatCurrency(e.amount)}</td>
            <td>
                 <button class="action-btn delete" onclick="deleteExpense('${e.id}')"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tables.expenses.appendChild(tr);
    });

    document.getElementById('total-expenses').textContent = formatCurrency(totalExp);
}

// --- Modals & Forms ---
const modalFuncs = {
    open: (id) => document.getElementById(id).classList.remove('hidden'),
    close: (id) => document.getElementById(id).classList.add('hidden'),
};

document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => modalFuncs.close(btn.dataset.close));
});

// Farmer Form
const farmerForm = document.getElementById('farmer-form');
document.getElementById('add-farmer-btn').addEventListener('click', () => {
    farmerForm.reset();
    document.getElementById('f-id').value = '';
    document.getElementById('f-date').valueAsDate = new Date();
    document.getElementById('f-rate').value = '';
    document.getElementById('f-paid').value = 0;
    document.getElementById('f-status').value = 'Pending';
    document.getElementById('f-settled').checked = false;
    document.getElementById('farmer-modal-title').textContent = 'New Record';
    modalFuncs.open('farmer-modal');
    calcTotal(); // Reset calcs
});

// Auto Calculate
const calcTotal = () => {
    const acres = parseFloat(document.getElementById('f-acres').value) || 0;
    const rate = parseFloat(document.getElementById('f-rate').value) || 0;
    const paid = parseFloat(document.getElementById('f-paid').value) || 0;

    const total = (acres * rate).toFixed(0);
    const balance = total - paid;

    document.getElementById('f-total').value = total;
    document.getElementById('f-balance').value = balance;

    // Auto Status
    const isSettled = document.getElementById('f-settled').checked;

    // Auto Status
    let status = 'Pending';
    if (paid >= total && total > 0) status = 'Paid';
    else if (paid > 0) status = 'Partial';

    if (isSettled) status = 'Settled';

    document.getElementById('f-status').value = status;
};

document.getElementById('f-settled').addEventListener('change', calcTotal);

['f-acres', 'f-rate', 'f-paid'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcTotal);
});

// Dedicated save function for farmers
function saveFarmerRecord() {
    // Validate required fields
    const name = document.getElementById('f-name').value.trim();
    const date = document.getElementById('f-date').value;
    const place = document.getElementById('f-place').value.trim();
    const crop = document.getElementById('f-crop').value.trim();
    const acres = document.getElementById('f-acres').value;
    const rate = document.getElementById('f-rate').value;

    if (!name || !date || !place || !crop || !acres || !rate) {
        alert('Please fill all required fields: Name, Date, Place, Crop, Acres, and Rate');
        return false;
    }

    const id = document.getElementById('f-id').value;
    const total = Number(document.getElementById('f-total').value);
    const paid = Number(document.getElementById('f-paid').value) || 0;

    const data = {
        id: id || crypto.randomUUID(),
        name: name,
        date: date,
        contact: document.getElementById('f-contact').value,
        place: place,
        crop: crop,
        acres: acres,
        rate: rate,
        total: total,
        paidAmount: paid,
        total: total,
        paidAmount: paid,
        status: document.getElementById('f-status').value, // Used for display mainly
        isSettled: document.getElementById('f-settled').checked,
        comments: document.getElementById('f-comments').value,
    };

    if (id) {
        const idx = AppData.farmers.findIndex(f => f.id === id);
        AppData.farmers[idx] = data;
    } else {
        AppData.farmers.push(data);
    }

    save();
    renderFarmers();
    modalFuncs.close('farmer-modal');
    return true;
}

farmerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveFarmerRecord();
});

// Direct click handler for mobile
document.getElementById('save-farmer-btn').addEventListener('click', (e) => {
    e.preventDefault();
    saveFarmerRecord();
});

// Expense Form
const expenseForm = document.getElementById('expense-form');
document.getElementById('add-expense-btn').addEventListener('click', () => {
    expenseForm.reset();
    document.getElementById('e-date').valueAsDate = new Date();
    modalFuncs.open('expense-modal');
});

// Dedicated save function for expenses
function saveExpenseRecord() {
    const date = document.getElementById('e-date').value;
    const amount = document.getElementById('e-amount').value;

    if (!date || !amount) {
        alert('Please fill Date and Amount fields');
        return false;
    }

    const data = {
        id: crypto.randomUUID(),
        date: date,
        category: document.getElementById('e-category').value,
        desc: document.getElementById('e-desc').value,
        amount: amount,
    };
    AppData.expenses.push(data);
    save();
    renderExpenses();
    modalFuncs.close('expense-modal');
    return true;
}

expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveExpenseRecord();
});

// Direct click handler for mobile
document.getElementById('save-expense-btn').addEventListener('click', (e) => {
    e.preventDefault();
    saveExpenseRecord();
});

// --- Search & Filters ---
document.getElementById('farmer-search').addEventListener('input', renderFarmers);
document.getElementById('date-start').addEventListener('change', renderFarmers);
document.getElementById('date-end').addEventListener('change', renderFarmers);

// --- Actions (Global) ---
window.deleteFarmer = (id) => {
    if (confirm('Are you sure you want to delete this record?')) {
        AppData.farmers = AppData.farmers.filter(f => f.id !== id);
        save();
        renderFarmers();
    }
};

window.editFarmer = (id) => {
    const f = AppData.farmers.find(f => f.id === id);
    if (!f) return;

    document.getElementById('f-id').value = f.id;
    document.getElementById('f-name').value = f.name;
    document.getElementById('f-date').value = f.date;
    document.getElementById('f-contact').value = f.contact;
    document.getElementById('f-place').value = f.place;
    document.getElementById('f-crop').value = f.crop || '';
    document.getElementById('f-acres').value = f.acres;
    document.getElementById('f-rate').value = f.rate;

    // Handle migration for edit
    document.getElementById('f-paid').value = f.paidAmount !== undefined ? f.paidAmount : (f.status === 'Paid' ? f.total : 0);
    document.getElementById('f-settled').checked = f.isSettled || false;
    document.getElementById('f-comments').value = f.comments || '';

    calcTotal(); // Recalculate totals/status

    document.getElementById('farmer-modal-title').textContent = 'Edit Record';
    modalFuncs.open('farmer-modal');
};

window.deleteExpense = (id) => {
    if (confirm('Delete this expense?')) {
        AppData.expenses = AppData.expenses.filter(e => e.id !== id);
        save();
        renderExpenses();
    }
};

window.shareFarmer = (id) => {
    const f = AppData.farmers.find(f => f.id === id);
    if (!f) return;

    const balance = f.total - (f.paidAmount || 0);

    const text = `
*Harvester Bill*
Name: ${f.name}
Date: ${formatDate(f.date)}
Place: ${f.place}
Crop: ${f.crop || 'N/A'}
------------------
Acres: ${f.acres}
Rate: ₹${f.rate}/acre
*Total Bill: ₹${f.total}*
Amount Paid: ₹${f.paidAmount || 0}
*Balance Due: ₹${balance}*
------------------
Status: ${f.isSettled ? 'Settled (Fully Paid)' : f.status}
    `.trim();

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

// --- Export & Import ---
document.getElementById('export-farmers-btn').addEventListener('click', () => {
    const ws = XLSX.utils.json_to_sheet(AppData.farmers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wb, "Farmers");
    XLSX.writeFile(wb, `Harvester_Farmers_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// --- File System Access API (Native Save/Load) ---

const fileSysControls = document.querySelector('.file-controls');
const isFileSysSupported = 'showSaveFilePicker' in window;

if (!isFileSysSupported) {
    // Hide these buttons on Mobile/Unsupported browsers
    // Fallback to Import/Export logic which is already visible
    fileSysControls.style.display = 'none';
    document.querySelector('.divider').style.display = 'none';
}

const updateFileStatus = (name) => {
    const statusEl = document.getElementById('file-status');
    const nameEl = document.getElementById('filename-display');
    statusEl.classList.remove('hidden');
    nameEl.textContent = name;
};

document.getElementById('save-db-btn').addEventListener('click', async () => {
    try {
        const opts = {
            types: [{
                description: 'Harvester Database',
                accept: { 'application/json': ['.json'] },
            }],
            suggestedName: 'harvester_data.json',
        };
        fileHandle = await window.showSaveFilePicker(opts);
        await save();
        updateFileStatus(fileHandle.name);
        alert('Database connected! Changes will now auto-save to this file.');
    } catch (err) {
        // User cancelled or not supported
        if (err.name !== 'AbortError') {
            alert('This browser does not support direct file saving. Please use Chrome or Edge.');
        }
    }
});

document.getElementById('open-db-btn').addEventListener('click', async () => {
    try {
        const opts = {
            types: [{
                description: 'Harvester Database',
                accept: { 'application/json': ['.json'] },
            }],
            multiple: false
        };
        [fileHandle] = await window.showOpenFilePicker(opts);

        // Read file
        const file = await fileHandle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);

        // Validate and Load
        if (json.farmers && json.expenses) {
            AppData.farmers = json.farmers;
            AppData.expenses = json.expenses;
            save(); // Sync to local storage too
            renderFarmers();
            renderExpenses();
            updateFileStatus(fileHandle.name);
            alert('Database loaded successfully.');
        } else {
            alert('Invalid database file.');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('Error opening file.');
        }
    }
});

// --- FAB Button (Mobile) ---
const fabBtn = document.getElementById('fab-add-btn');
if (fabBtn) {
    fabBtn.addEventListener('click', () => {
        // Check which view is active
        if (views.farmers.classList.contains('active')) {
            document.getElementById('add-farmer-btn').click();
        } else if (views.expenses.classList.contains('active')) {
            document.getElementById('add-expense-btn').click();
        }
    });
}

// --- Receipt Generation ---
window.generateReceipt = async (id) => {
    const f = AppData.farmers.find(f => f.id === id);
    if (!f) return;

    // Create a temporary receipt element
    const receipt = document.createElement('div');
    receipt.style.width = '400px';
    receipt.style.padding = '30px';
    receipt.style.backgroundColor = '#fff';
    receipt.style.color = '#333';
    receipt.style.fontFamily = "'Outfit', sans-serif";
    receipt.style.position = 'absolute';
    receipt.style.top = '-9999px';
    receipt.style.left = '-9999px';
    // Border & Shadow to make it look like a card
    receipt.style.border = '1px solid #ddd';

    receipt.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #10b981; margin:0;">Harvester Manager</h2>
            <p style="color: #666; font-size: 0.9rem; margin: 5px 0;">Official Receipt</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <div style="margin-bottom: 15px;">
            <p style="margin:5px 0"><strong>Date:</strong> ${formatDate(f.date)}</p>
            <p style="margin:5px 0"><strong>Farmer:</strong> ${f.name}</p>
            <p style="margin:5px 0"><strong>Place:</strong> ${f.place}</p>
             <p style="margin:5px 0"><strong>Crop:</strong> ${f.crop || '-'}</p>
             <p style="margin:5px 0"><strong>Contact:</strong> ${f.contact}</p>
        </div>
        <table style="width: 100%; collapse: collapse; margin-bottom: 20px;">
            <tr style="background: #f9fafb;">
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Acres</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${f.acres}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Rate</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${f.rate}</td>
            </tr>
            <tr style="font-weight: bold; font-size: 1.1rem; color: #10b981;">
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Total</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${f.total}</td>
            </tr>
             <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Paid</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${f.paidAmount || 0}</td>
            </tr>
             <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Balance</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: ${f.isSettled ? '#10b981' : '#ef4444'}">${(f.total - (f.paidAmount || 0))} ${f.isSettled ? '(Settled)' : ''}</td>
            </tr>
        </table>
        <div style="text-align: center; margin-top: 30px; color: #999; font-size: 0.8rem;">
            <p>Thank you for your business!</p>
        </div>
    `;

    document.body.appendChild(receipt);

    try {
        const canvas = await html2canvas(receipt);
        const imgData = canvas.toDataURL('image/png');

        // Trigger Download
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `Receipt_${f.name.replace(/\s+/g, '_')}.png`;
        link.click();

        document.body.removeChild(receipt);
    } catch (err) {
        console.error('Receipt Gen Error:', err);
        alert('Failed to generate receipt');
        document.body.removeChild(receipt);
    }
};

// --- Analytics (Charts) ---
let cashChartInstance = null;
let cropChartInstance = null;

function renderCharts() {
    if (!document.getElementById('analytics-view').classList.contains('active')) return;

    // 1. Prepare Data for Cash Flow
    // Group by Month (YYYY-MM)
    const monthlyData = {};

    // Revenue
    AppData.farmers.forEach(f => {
        const d = new Date(f.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 };
        monthlyData[key].revenue += Number(f.paidAmount || 0); // Cash collected
    });

    // Expenses
    AppData.expenses.forEach(e => {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 };
        monthlyData[key].expenses += Number(e.amount);
    });

    // Sort Keys
    const sortedKeys = Object.keys(monthlyData).sort();
    const labels = sortedKeys.map(k => {
        const [y, m] = k.split('-');
        return `${new Date(y, m - 1).toLocaleString('default', { month: 'short' })} ${y}`;
    });
    const revData = sortedKeys.map(k => monthlyData[k].revenue);
    const expData = sortedKeys.map(k => monthlyData[k].expenses);

    // 2. Prepare Data for Crops (Sum of Acres)
    const cropAcres = {};
    AppData.farmers.forEach(f => {
        const c = f.crop ? f.crop.trim().toLowerCase() : 'Unknown';
        // Capitalize
        const label = c.charAt(0).toUpperCase() + c.slice(1);
        const acres = parseFloat(f.acres) || 0;
        cropAcres[label] = (cropAcres[label] || 0) + acres;
    });

    const cropLabels = Object.keys(cropAcres);
    const cropData = Object.values(cropAcres);

    // 3. Render Cash Flow Chart
    const ctx1 = document.getElementById('cashflow-chart').getContext('2d');
    if (cashChartInstance) cashChartInstance.destroy();

    cashChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue (Collected)',
                    data: revData,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Expenses',
                    data: expData,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    // 4. Render Crop Chart
    const ctx2 = document.getElementById('crop-chart').getContext('2d');
    if (cropChartInstance) cropChartInstance.destroy();

    cropChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: cropLabels,
            datasets: [{
                data: cropData,
                backgroundColor: [
                    '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.raw.toFixed(2)} Acres`;
                        }
                    }
                }
            }
        }
    });
}

// --- Init ---
renderFarmers();
renderExpenses();
