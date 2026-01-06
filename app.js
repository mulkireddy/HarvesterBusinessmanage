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
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.dataset.tab;
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[tab].classList.add('active');
    });
});

// --- Logic: Farmers ---
function renderFarmers() {
    tables.farmers.innerHTML = '';

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
        f.status = status; // Ensure consistancy

        totalRev += Number(f.total);
        totalAcres += Number(f.acres);
        pendingPayment += Number(balance);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(f.date)}</td>
            <td><strong>${f.name}</strong></td>
            <td>${f.place}</td>
            <td>${f.contact}</td>
            <td>${f.acres}</td>
            <td>${formatCurrency(f.total)}</td>
            <td class="green-text">${formatCurrency(f.paidAmount)}</td>
            <td class="red-text"><strong>${formatCurrency(balance)}</strong></td>
            <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
            <td>
                <button class="action-btn share" onclick="shareFarmer('${f.id}')" title="WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
                <button class="action-btn" onclick="editFarmer('${f.id}')" title="Edit"><i class="ph ph-pencil"></i></button>
                <button class="action-btn delete" onclick="deleteFarmer('${f.id}')" title="Delete"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tables.farmers.appendChild(tr);
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
    document.getElementById('f-rate').value = 2000;
    document.getElementById('f-paid').value = 0;
    document.getElementById('f-status').value = 'Pending';
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
    let status = 'Pending';
    if (paid >= total && total > 0) status = 'Paid';
    else if (paid > 0) status = 'Partial';

    document.getElementById('f-status').value = status;
};

['f-acres', 'f-rate', 'f-paid'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcTotal);
});

farmerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('f-id').value;

    const total = Number(document.getElementById('f-total').value);
    const paid = Number(document.getElementById('f-paid').value);

    const data = {
        id: id || crypto.randomUUID(),
        name: document.getElementById('f-name').value,
        date: document.getElementById('f-date').value,
        contact: document.getElementById('f-contact').value,
        place: document.getElementById('f-place').value,
        acres: document.getElementById('f-acres').value,
        rate: document.getElementById('f-rate').value,
        total: total,
        paidAmount: paid,
        status: document.getElementById('f-status').value, // derived from calc
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
});

// Expense Form
const expenseForm = document.getElementById('expense-form');
document.getElementById('add-expense-btn').addEventListener('click', () => {
    expenseForm.reset();
    document.getElementById('e-date').valueAsDate = new Date();
    modalFuncs.open('expense-modal');
});

expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        id: crypto.randomUUID(),
        date: document.getElementById('e-date').value,
        category: document.getElementById('e-category').value,
        desc: document.getElementById('e-desc').value,
        amount: document.getElementById('e-amount').value,
    };
    AppData.expenses.push(data);
    save();
    renderExpenses();
    modalFuncs.close('expense-modal');
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
    document.getElementById('f-acres').value = f.acres;
    document.getElementById('f-rate').value = f.rate;

    // Handle migration for edit
    document.getElementById('f-paid').value = f.paidAmount !== undefined ? f.paidAmount : (f.status === 'Paid' ? f.total : 0);
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
------------------
Acres: ${f.acres}
Rate: ₹${f.rate}/acre
*Total Bill: ₹${f.total}*
Amount Paid: ₹${f.paidAmount || 0}
*Balance Due: ₹${balance}*
------------------
Status: ${f.status}
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


// --- Init ---
renderFarmers();
renderExpenses();
