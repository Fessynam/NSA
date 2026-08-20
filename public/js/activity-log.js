requireAuthOrRedirect();
requireRoleOrRedirect('admin', 'support');
renderSidebar('activity-log');

let lastLoadedLogs = [];

function formatTimestamp(isoLike) {
  const d = new Date(isoLike.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return isoLike;
  return d.toLocaleString();
}

function actionBadgeStyle(action) {
  if (action.includes('failed') || action.includes('deleted')) return 'color: var(--nsa-danger); border-color: var(--nsa-danger);';
  if (action.includes('created') || action === 'login' || action === 'password_reset') return 'color: var(--nsa-gold); border-color: var(--nsa-gold);';
  return '';
}

function renderLogRows(logs) {
  const tbody = document.getElementById('log-tbody');
  const emptyState = document.getElementById('empty-state');

  if (logs.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td style="white-space:nowrap;">${escapeHtml(formatTimestamp(log.created_at))}</td>
      <td>${escapeHtml(log.user_email || 'system')}</td>
      <td><span class="badge" style="${actionBadgeStyle(log.action)}">${escapeHtml(log.action.replace(/_/g, ' '))}</span></td>
      <td>${escapeHtml(log.details || '—')}</td>
    </tr>
  `).join('');
}

async function loadLogs() {
  lastLoadedLogs = await apiFetch('/activity-log');
  renderLogRows(lastLoadedLogs);
}

document.getElementById('search-input').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) {
    renderLogRows(lastLoadedLogs);
    return;
  }
  const filtered = lastLoadedLogs.filter(log =>
    (log.user_email || '').toLowerCase().includes(term) ||
    log.action.toLowerCase().includes(term) ||
    (log.details || '').toLowerCase().includes(term)
  );
  renderLogRows(filtered);
});

loadLogs();
