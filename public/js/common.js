const LOGO_IMG = `<img src="assets/nsa-logo.webp" alt="NSA logo" />`;

const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  employees: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  departments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  theme: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getToken() {
  return localStorage.getItem('ems_token');
}

function getUsername() {
  return localStorage.getItem('ems_username') || 'admin';
}

function requireAuthOrRedirect() {
  if (!getToken()) {
    window.location.href = 'index.html';
  }
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_username');
    window.location.href = 'index.html';
    throw new Error('Unauthorized');
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function logout() {
  const token = getToken();
  if (token) {
    fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  localStorage.removeItem('ems_token');
  localStorage.removeItem('ems_username');
  window.location.href = 'index.html';
}

function initTheme() {
  const saved = localStorage.getItem('ems_theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ems_theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ems_theme', 'dark');
  }
}

function renderSidebar(activePage) {
  const el = document.getElementById('app-sidebar');
  if (!el) return;
  el.innerHTML = `
    <div class="sidebar-brand">
      <span class="logo">${LOGO_IMG}</span>
      <span>
        <div class="title">NSA Employee Mgmt</div>
        <div class="subtitle">Namibia Statistics Agency</div>
      </span>
    </div>
    <nav class="sidebar-nav">
      <a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">${ICONS.dashboard} Dashboard</a>
      <a href="employees.html" class="${activePage === 'employees' ? 'active' : ''}">${ICONS.employees} Employees</a>
      <a href="departments.html" class="${activePage === 'departments' ? 'active' : ''}">${ICONS.departments} Departments</a>
    </nav>
    <div class="sidebar-footer">
      <button class="icon-btn" id="theme-toggle-btn">${ICONS.theme} Toggle theme</button>
      <div class="sidebar-user">
        <span class="badge" id="whoami"></span>
        <button class="icon-btn" id="logout-btn">${ICONS.logout} Log out</button>
      </div>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  const who = document.getElementById('whoami');
  if (who) who.textContent = getUsername();
}

/* --- Toast notifications --- */
function ensureToastHost() {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message, type = 'success') {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-in'));
  setTimeout(() => {
    toast.classList.remove('toast-in');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

/* --- Custom confirm dialog (replaces window.confirm) --- */
function ensureConfirmHost() {
  let host = document.getElementById('confirm-overlay');
  if (!host) {
    host = document.createElement('div');
    host.id = 'confirm-overlay';
    host.className = 'modal-overlay';
    host.innerHTML = `
      <div class="modal confirm-modal">
        <h2 id="confirm-title">Are you sure?</h2>
        <p id="confirm-message"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="confirm-cancel-btn" data-dismiss>Cancel</button>
          <button type="button" class="btn btn-danger" id="confirm-ok-btn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(host);
  }
  return host;
}

function confirmAction(message, title = 'Please confirm') {
  const host = ensureConfirmHost();
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  host.classList.add('open');

  return new Promise((resolve) => {
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    const cleanup = (result) => {
      host.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/* --- CSV export --- */
function exportToCsv(filename, rows, columns) {
  const escapeCsv = (value) => {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row => columns.map(c => escapeCsv(row[c.key])).join(',')).join('\n');
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* --- Modal dismissal: Escape key + click on backdrop --- */
function dismissOverlay(overlay) {
  const dismissBtn = overlay.querySelector('[data-dismiss]');
  if (dismissBtn) {
    dismissBtn.click();
  } else {
    overlay.classList.remove('open');
  }
}

function setupModalDismissal() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) dismissOverlay(openOverlay);
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
      dismissOverlay(e.target);
    }
  });
}

/* --- Sortable table headers --- */
function makeSortable(theadEl, onSort) {
  const state = { key: null, dir: 1 };
  theadEl.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.add('sortable');
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.dir = state.key === key ? -state.dir : 1;
      state.key = key;
      theadEl.querySelectorAll('th[data-sort]').forEach(h => h.removeAttribute('data-dir'));
      th.setAttribute('data-dir', state.dir === 1 ? 'asc' : 'desc');
      onSort(key, state.dir);
    });
  });
}

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    const av = (a[key] ?? '').toString().toLowerCase();
    const bv = (b[key] ?? '').toString().toLowerCase();
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv) * dir;
  });
}

initTheme();
setupModalDismissal();
