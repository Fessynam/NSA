requireAuthOrRedirect();
renderSidebar('employees');

let departmentsCache = [];
let lastLoadedEmployees = [];
let currentSort = { key: null, dir: 1 };

async function loadDepartmentsForSelect() {
  departmentsCache = await apiFetch('/departments');
  const select = document.getElementById('emp-department');
  select.innerHTML = '<option value="">— None —</option>' +
    departmentsCache.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}

function renderEmployeeRows(employees) {
  const tbody = document.getElementById('employees-tbody');
  const emptyState = document.getElementById('empty-state');

  if (employees.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = employees.map(emp => `
    <tr>
      <td>${escapeHtml(emp.name)}</td>
      <td>${escapeHtml(emp.email)}</td>
      <td>${escapeHtml(emp.position)}</td>
      <td>${emp.department_name ? `<span class="badge">${escapeHtml(emp.department_name)}</span>` : '<span style="color:#8b93a1;">Unassigned</span>'}</td>
      <td class="actions-cell">
        <button class="btn btn-outline btn-sm" onclick="viewEmployee(${emp.id})">View</button>
        <button class="btn btn-outline btn-sm" onclick="editEmployee(${emp.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function loadEmployees(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const employees = await apiFetch(`/employees${query}`);
  lastLoadedEmployees = currentSort.key ? sortRows(employees, currentSort.key, currentSort.dir) : employees;
  renderEmployeeRows(lastLoadedEmployees);
}

makeSortable(document.getElementById('employees-thead'), (key, dir) => {
  currentSort = { key, dir };
  lastLoadedEmployees = sortRows(lastLoadedEmployees, key, dir);
  renderEmployeeRows(lastLoadedEmployees);
});

function openFormModal(title) {
  document.getElementById('form-modal-title').textContent = title;
  document.getElementById('form-error').style.display = 'none';
  document.getElementById('form-modal-overlay').classList.add('open');
}

function closeFormModal() {
  document.getElementById('form-modal-overlay').classList.remove('open');
  document.getElementById('employee-form').reset();
  document.getElementById('employee-id').value = '';
}

document.getElementById('add-employee-btn').addEventListener('click', () => {
  openFormModal('Add Employee');
});

document.getElementById('cancel-form-btn').addEventListener('click', closeFormModal);

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (lastLoadedEmployees.length === 0) {
    showToast('No employees to export', 'danger');
    return;
  }
  exportToCsv('employees.csv', lastLoadedEmployees, [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'position', label: 'Position' },
    { key: 'department_name', label: 'Department' }
  ]);
  showToast('Employees exported to CSV');
});

document.getElementById('employee-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('employee-id').value;
  const payload = {
    name: document.getElementById('emp-name').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    position: document.getElementById('emp-position').value.trim(),
    department_id: document.getElementById('emp-department').value || null
  };

  const errorEl = document.getElementById('form-error');
  errorEl.style.display = 'none';

  try {
    if (id) {
      await apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Employee updated');
    } else {
      await apiFetch('/employees', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Employee added');
    }
    closeFormModal();
    loadEmployees(document.getElementById('search-input').value.trim());
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

async function editEmployee(id) {
  const emp = await apiFetch(`/employees/${id}`);
  openFormModal('Edit Employee');
  document.getElementById('employee-id').value = emp.id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-email').value = emp.email;
  document.getElementById('emp-position').value = emp.position || '';
  document.getElementById('emp-department').value = emp.department_id || '';
}

async function viewEmployee(id) {
  const emp = await apiFetch(`/employees/${id}`);
  document.getElementById('detail-content').innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(emp.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(emp.email)}</p>
    <p><strong>Position:</strong> ${escapeHtml(emp.position || '—')}</p>
    <p><strong>Department:</strong> ${emp.department_name ? escapeHtml(emp.department_name) : 'Unassigned'}</p>
  `;
  document.getElementById('detail-modal-overlay').classList.add('open');
}

document.getElementById('close-detail-btn').addEventListener('click', () => {
  document.getElementById('detail-modal-overlay').classList.remove('open');
});

async function deleteEmployee(id) {
  const ok = await confirmAction('This will permanently delete the employee record.', 'Delete employee?');
  if (!ok) return;
  await apiFetch(`/employees/${id}`, { method: 'DELETE' });
  showToast('Employee deleted', 'danger');
  loadEmployees(document.getElementById('search-input').value.trim());
}

let searchTimeout;
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadEmployees(e.target.value.trim()), 250);
});

(async () => {
  await loadDepartmentsForSelect();
  await loadEmployees();
})();
