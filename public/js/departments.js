requireAuthOrRedirect();
renderSidebar('departments');

const canEditDepartments = getRole() === 'admin' || getRole() === 'support';
if (!canEditDepartments) {
  document.getElementById('add-department-btn').style.display = 'none';
}

let employeesCache = [];
let lastLoadedDepartments = [];

async function loadEmployeesForHeadSelect() {
  employeesCache = await apiFetch('/employees');
  const select = document.getElementById('dept-head');
  select.innerHTML = '<option value="">— None —</option>' +
    employeesCache.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
}

async function loadDepartments() {
  const [departments, employees] = await Promise.all([
    apiFetch('/departments'),
    apiFetch('/employees')
  ]);

  const countByDept = {};
  employees.forEach(e => {
    if (e.department_id) countByDept[e.department_id] = (countByDept[e.department_id] || 0) + 1;
  });

  lastLoadedDepartments = departments.map(d => ({ ...d, employee_count: countByDept[d.id] || 0 }));

  const tbody = document.getElementById('departments-tbody');
  const emptyState = document.getElementById('empty-state');

  if (departments.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = lastLoadedDepartments.map(dept => `
    <tr>
      <td>${dept.code ? `<span class="badge">${escapeHtml(dept.code)}</span>` : '—'}</td>
      <td>${escapeHtml(dept.name)}</td>
      <td>${escapeHtml(dept.description || '—')}</td>
      <td>${dept.head_name ? escapeHtml(dept.head_name) : '<span class="text-muted">Unassigned</span>'}</td>
      <td><span class="badge">${dept.employee_count}</span></td>
      <td class="actions-cell">
        <button class="btn btn-outline btn-sm" onclick="viewDepartment(${dept.id})">View</button>
        ${canEditDepartments ? `
          <button class="btn btn-outline btn-sm" onclick="editDepartment(${dept.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDepartment(${dept.id})">Delete</button>
        ` : ''}
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

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (lastLoadedDepartments.length === 0) {
    showToast('No departments to export', 'danger');
    return;
  }
  exportToCsv('departments.csv', lastLoadedDepartments, [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'head_name', label: 'Head' },
    { key: 'employee_count', label: 'Employees' }
  ]);
  showToast('Departments exported to CSV');
});

document.getElementById('department-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('department-id').value;
  const payload = {
    name: document.getElementById('dept-name').value.trim(),
    code: document.getElementById('dept-code').value.trim(),
    description: document.getElementById('dept-description').value.trim(),
    head_employee_id: document.getElementById('dept-head').value || null
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
    <p><strong>Code:</strong> ${dept.code ? escapeHtml(dept.code) : '—'}</p>
    <p><strong>Description:</strong> ${escapeHtml(dept.description || '—')}</p>
    <p><strong>Head:</strong> ${dept.head_name ? escapeHtml(dept.head_name) : 'Unassigned'}</p>
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
  document.getElementById('dept-code').value = dept.code || '';
  document.getElementById('dept-description').value = dept.description || '';
  document.getElementById('dept-head').value = dept.head_employee_id || '';
}

async function deleteDepartment(id) {
  const ok = await confirmAction('Employees linked to this department will become unassigned, not deleted.', 'Delete department?');
  if (!ok) return;
  await apiFetch(`/departments/${id}`, { method: 'DELETE' });
  showToast('Department deleted', 'danger');
  loadDepartments();
}

(async () => {
  await loadEmployeesForHeadSelect();
  await loadDepartments();
})();
