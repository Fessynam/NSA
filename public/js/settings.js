requireAuthOrRedirect();
requireRoleOrRedirect('admin');
renderSidebar('settings');

function roleLabel(role) {
  return { admin: 'Admin', support: 'Support', viewer: 'Viewer' }[role] || role;
}

async function loadUsers() {
  const users = await apiFetch('/users');
  const tbody = document.getElementById('users-tbody');
  const emptyState = document.getElementById('users-empty-state');

  if (users.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone || '—')}</td>
      <td><span class="role-badge role-${escapeHtml(u.role)}" style="color: var(--nsa-navy); background: var(--nsa-light-gray);">${roleLabel(u.role)}</span></td>
      <td>${u.active ? '<span class="badge">Active</span>' : '<span class="badge" style="color:var(--nsa-danger);">Inactive</span>'}</td>
      <td class="actions-cell">
        <button class="btn btn-outline btn-sm" onclick="editUser(${u.id})">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="resetUserPassword('${escapeHtml(u.username)}')">Reset Password</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function loadSettings() {
  const settings = await apiFetch('/settings');
  document.getElementById('org-name').value = settings.org_name || '';
  document.getElementById('support-email').value = settings.support_email || '';
}

function openFormModal(title, mode) {
  document.getElementById('form-modal-title').textContent = title;
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('password-fields').style.display = mode === 'add' ? '' : 'none';
  document.getElementById('user-password').required = mode === 'add';
  document.getElementById('active-field').style.display = mode === 'edit' ? '' : 'none';
  document.getElementById('form-modal-overlay').classList.add('open');
}

function closeFormModal() {
  document.getElementById('form-modal-overlay').classList.remove('open');
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  usernameAutoFilled = true;
  openFormModal('Add User', 'add');
});

// Auto-suggest a username from first/last name while adding a new user,
// but stop overwriting once the admin starts editing it directly.
let usernameAutoFilled = true;
function suggestUsername() {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const first = slug(document.getElementById('user-first-name').value);
  const last = slug(document.getElementById('user-last-name').value);
  return first && last ? `${first}.${last}` : '';
}
['user-first-name', 'user-last-name'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (document.getElementById('user-id').value) return; // don't auto-fill while editing
    if (!usernameAutoFilled) return;
    document.getElementById('user-username').value = suggestUsername();
  });
});
document.getElementById('user-username').addEventListener('input', () => {
  usernameAutoFilled = false;
});

document.getElementById('cancel-form-btn').addEventListener('click', closeFormModal);

document.getElementById('open-terms-from-form').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('terms-modal-overlay').classList.add('open');
});

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const errorEl = document.getElementById('form-error');
  errorEl.style.display = 'none';

  const payload = {
    first_name: document.getElementById('user-first-name').value.trim(),
    last_name: document.getElementById('user-last-name').value.trim(),
    username: document.getElementById('user-username').value.trim(),
    email: document.getElementById('user-email').value.trim(),
    phone: document.getElementById('user-phone').value.trim(),
    role: document.getElementById('user-role').value
  };

  try {
    if (id) {
      payload.active = document.getElementById('user-active').checked;
      await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('User updated');
    } else {
      payload.password = document.getElementById('user-password').value;
      payload.agreed_to_terms = document.getElementById('user-terms').checked;
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
      showToast('User created');
    }
    closeFormModal();
    loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

async function editUser(id) {
  const user = await apiFetch(`/users/${id}`);
  openFormModal('Edit User', 'edit');
  document.getElementById('user-id').value = user.id;
  document.getElementById('user-first-name').value = user.first_name;
  document.getElementById('user-last-name').value = user.last_name;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-email').value = user.email;
  document.getElementById('user-phone').value = user.phone || '';
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-active').checked = !!user.active;
}

async function deleteUser(id) {
  const ok = await confirmAction('This permanently removes their account and access.', 'Delete user?');
  if (!ok) return;
  try {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    showToast('User deleted', 'danger');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function resetUserPassword(username) {
  const ok = await confirmAction(`Generate a password reset link for ${username}?`, 'Reset password?');
  if (!ok) return;

  const res = await fetch('/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username })
  });
  const data = await res.json();

  document.getElementById('reset-link-message').textContent = data.dev_note || data.message;
  const box = document.getElementById('reset-link-box');
  if (data.reset_link) {
    box.innerHTML = `<a class="btn btn-outline" style="width:100%; justify-content:center;" href="${data.reset_link}" target="_blank" rel="noopener">Open reset link</a>`;
  } else {
    box.innerHTML = '';
  }
  document.getElementById('reset-link-modal-overlay').classList.add('open');
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('settings-error');
  errorEl.style.display = 'none';

  const payload = {
    org_name: document.getElementById('org-name').value.trim(),
    support_email: document.getElementById('support-email').value.trim()
  };

  try {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    showToast('Settings saved');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

(async () => {
  await loadUsers();
  await loadSettings();
})();
