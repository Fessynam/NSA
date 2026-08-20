requireAuthOrRedirect();
renderSidebar('departments');

async function loadDepartments() {
  const [departments, employees] = await Promise.all([
    apiFetch('/departments'),
    apiFetch('/employees')
  ]);

  const countByDept = {};
  employees.forEach(e => {
    if (e.department_id) countByDept[e.department_id] = (countByDept[e.department_id] || 0) + 1;
  });

  const tbody = document.getElementById('departments-tbody');
  const emptyState = document.getElementById('empty-state');

  if (departments.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = departments.map(dept => `
    <tr>
      <td>${escapeHtml(dept.name)}</td>
      <td>${escapeHtml(dept.description || '—')}</td>
      <td><span class="badge">${countByDept[dept.id] || 0}</span></td>
      <td class="actions-cell">
        <button class="btn btn-outline btn-sm" onclick="viewDepartment(${dept.id})">View</button>
        <button class="btn btn-outline btn-sm" onclick="editDepartment(${dept.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDepartment(${dept.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function openFormModal(title) {
  document.getElementById('form-modal-title').textContent = title;
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('form-modal-overlay').classList.add('open');
}

function closeFormModal() {
  document.getElementById('form-modal-overlay').classList.remove('open');
  document.getElementById('department-form').reset();
  document.getElementById('department-id').value = '';
}

document.getElementById('add-department-btn').addEventListener('click', () => {
  openFormModal('Add Department');
});

document.getElementById('cancel-form-btn').addEventListener('click', closeFormModal);

document.getElementById('department-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('department-id').value;
  const payload = {
    name: document.getElementById('dept-name').value.trim(),
    description: document.getElementById('dept-description').value.trim()
  };

  const errorEl = document.getElementById('form-error');
  errorEl.style.display = 'none';

  try {
    if (id) {
      await apiFetch(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Department updated');
    } else {
      await apiFetch('/departments', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Department added');
    }
    closeFormModal();
    loadDepartments();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

async function viewDepartment(id) {
  const dept = await apiFetch(`/departments/${id}`);
  const employeeList = dept.employees.length
    ? `<ul class="detail-employee-list">${dept.employees.map(e => `<li>${escapeHtml(e.name)} <span class="text-muted">— ${escapeHtml(e.position || 'No position')}</span></li>`).join('')}</ul>`
    : '<p class="text-muted">No employees assigned to this department.</p>';

  document.getElementById('detail-content').innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(dept.name)}</p>
    <p><strong>Description:</strong> ${escapeHtml(dept.description || '—')}</p>
    <p><strong>Employees (${dept.employees.length}):</strong></p>
    ${employeeList}
  `;
  document.getElementById('detail-modal-overlay').classList.add('open');
}

document.getElementById('close-detail-btn').addEventListener('click', () => {
  document.getElementById('detail-modal-overlay').classList.remove('open');
});

async function editDepartment(id) {
  const dept = await apiFetch(`/departments/${id}`);
  openFormModal('Edit Department');
  document.getElementById('department-id').value = dept.id;
  document.getElementById('dept-name').value = dept.name;
  document.getElementById('dept-description').value = dept.description || '';
}

async function deleteDepartment(id) {
  const ok = await confirmAction('Employees linked to this department will become unassigned, not deleted.', 'Delete department?');
  if (!ok) return;
  await apiFetch(`/departments/${id}`, { method: 'DELETE' });
  showToast('Department deleted', 'danger');
  loadDepartments();
}

loadDepartments();
