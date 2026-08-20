requireAuthOrRedirect();
renderSidebar('profile');

async function loadProfile() {
  const me = await apiFetch('/me');
  document.getElementById('profile-first-name').value = me.first_name;
  document.getElementById('profile-last-name').value = me.last_name;
  document.getElementById('profile-username').value = me.username;
  document.getElementById('profile-email').value = me.email;
  document.getElementById('profile-phone').value = me.phone || '';
  document.getElementById('profile-role').value = { admin: 'Admin', support: 'Support', viewer: 'Viewer' }[me.role] || me.role;
}

async function loadMyActivity() {
  const logs = await apiFetch('/me/activity');
  const feedEl = document.getElementById('my-activity-feed');
  if (logs.length === 0) {
    feedEl.innerHTML = '<p style="color:#8b93a1;">No activity recorded yet.</p>';
    return;
  }
  feedEl.innerHTML = logs.map(l => `
    <div class="activity-feed-item">
      <span>${escapeHtml(l.action.replace(/_/g, ' '))}${l.details ? ' — ' + escapeHtml(l.details) : ''}</span>
      <span class="activity-feed-time">${escapeHtml(formatTimestamp(l.created_at))}</span>
    </div>
  `).join('');
}

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('profile-error');
  errorEl.style.display = 'none';

  const payload = {
    first_name: document.getElementById('profile-first-name').value.trim(),
    last_name: document.getElementById('profile-last-name').value.trim(),
    username: document.getElementById('profile-username').value.trim(),
    email: document.getElementById('profile-email').value.trim(),
    phone: document.getElementById('profile-phone').value.trim()
  };

  try {
    await apiFetch('/me', { method: 'PUT', body: JSON.stringify(payload) });
    localStorage.setItem('ems_full_name', `${payload.first_name} ${payload.last_name}`);
    localStorage.setItem('ems_email', payload.email);
    localStorage.setItem('ems_username', payload.username);
    renderSidebar('profile');
    showToast('Profile updated');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('password-error');
  errorEl.style.display = 'none';

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;

  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'New passwords do not match.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await apiFetch('/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    document.getElementById('password-form').reset();
    showToast('Password updated');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

(async () => {
  await loadProfile();
  await loadMyActivity();
})();
