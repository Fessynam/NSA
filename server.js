const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- very simple in-memory token store (fine for a single-user demo app) ---
const activeTokens = new Set();

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Auth ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  activeTokens.add(token);
  res.json({ token, username: user.username });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  activeTokens.delete(token);
  res.json({ ok: true });
});

// --- Departments ---
app.get('/api/departments', requireAuth, (req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  res.json(departments);
});

app.get('/api/departments/:id', requireAuth, (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  const employees = db.prepare('SELECT id, name, email, position FROM employees WHERE department_id = ?').all(req.params.id);
  res.json({ ...dept, employees });
});

app.post('/api/departments', requireAuth, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  try {
    const result = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)').run(name, description || '');
    res.status(201).json({ id: Number(result.lastInsertRowid), name, description });
  } catch (err) {
    res.status(400).json({ error: 'Department name must be unique' });
  }
});

app.put('/api/departments/:id', requireAuth, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const result = db.prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?').run(name, description || '', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
  res.json({ id: Number(req.params.id), name, description });
});

app.delete('/api/departments/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE employees SET department_id = NULL WHERE department_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
  res.json({ ok: true });
});

// --- Employees ---
const employeeSelect = `
  SELECT employees.id, employees.name, employees.email, employees.position,
         employees.department_id, departments.name AS department_name
  FROM employees
  LEFT JOIN departments ON departments.id = employees.department_id
`;

app.get('/api/employees', requireAuth, (req, res) => {
  const { search } = req.query;
  let rows;
  if (search) {
    const like = `%${search}%`;
    rows = db.prepare(`${employeeSelect} WHERE employees.name LIKE ? OR employees.email LIKE ? OR employees.position LIKE ? OR departments.name LIKE ? ORDER BY employees.name`)
      .all(like, like, like, like);
  } else {
    rows = db.prepare(`${employeeSelect} ORDER BY employees.name`).all();
  }
  res.json(rows);
});

app.get('/api/employees/:id', requireAuth, (req, res) => {
  const emp = db.prepare(`${employeeSelect} WHERE employees.id = ?`).get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

app.post('/api/employees', requireAuth, (req, res) => {
  const { name, email, position, department_id } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    const result = db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
      .run(name, email, position || '', department_id || null);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, email, position, department_id });
  } catch (err) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

app.put('/api/employees/:id', requireAuth, (req, res) => {
  const { name, email, position, department_id } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const result = db.prepare('UPDATE employees SET name = ?, email = ?, position = ?, department_id = ? WHERE id = ?')
    .run(name, email, position || '', department_id || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
  res.json({ id: Number(req.params.id), name, email, position, department_id });
});

app.delete('/api/employees/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Employee Management System running at http://localhost:${PORT}`);
});
