const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');
const {
  hashPassword, verifyPassword, validatePasswordComplexity, isValidEmail, PASSWORD_RULE_TEXT,
  isValidUsername, USERNAME_RULE_TEXT
} = require('./lib/auth');
const { SESSION_IDLE_MS, isSessionExpired } = require('./lib/session');
const { checkRateLimit } = require('./lib/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- in-memory session + login-attempt tracking (fine for a single-instance demo app) ---
const activeTokens = new Map(); // token -> { email, role }
const loginAttempts = new Map(); // email -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const VALID_ROLES = ['admin', 'support', 'viewer'];

function checkLockout(email) {
  const entry = loginAttempts.get(email);
  if (entry && entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
  }
  return null;
}

function recordFailedAttempt(email) {
  const entry = loginAttempts.get(email) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
    loginAttempts.set(email, entry);
    return null; // just tripped the lockout
  }
  loginAttempts.set(email, entry);
  return MAX_ATTEMPTS - entry.count;
}

function clearAttempts(email) {
  loginAttempts.delete(email);
}

function logActivity(userEmail, action, details) {
  db.prepare('INSERT INTO activity_log (user_email, action, details) VALUES (?, ?, ?)').run(userEmail || null, action, details || null);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = activeTokens.get(token);
  if (isSessionExpired(session.lastActivity)) {
    activeTokens.delete(token);
    return res.status(401).json({ error: 'Your session expired due to inactivity. Please log in again.' });
  }
  session.lastActivity = Date.now(); // sliding expiration: any activity extends the session
  req.userEmail = session.email;
  req.userRole = session.role;
  next();
}

// Periodically sweep idle sessions out of memory so they don't linger indefinitely
// between requests (requireAuth only catches them when the token is actually used again).
setInterval(() => {
  for (const [token, session] of activeTokens.entries()) {
    if (isSessionExpired(session.lastActivity)) activeTokens.delete(token);
  }
}, 5 * 60 * 1000).unref();

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

// IP-based rate limiting on the unauthenticated auth endpoints — a per-account lockout alone
// doesn't stop an attacker from spraying many different accounts from one source.
const rateLimitBuckets = new Map(); // "route:ip" -> timestamps[]

function rateLimit(routeKey, maxRequests, windowMs) {
  return (req, res, next) => {
    const bucketKey = `${routeKey}:${req.ip}`;
    const { allowed, timestamps } = checkRateLimit(rateLimitBuckets.get(bucketKey) || [], Date.now(), maxRequests, windowMs);
    rateLimitBuckets.set(bucketKey, timestamps);
    if (!allowed) {
      return res.status(429).json({ error: 'Too many requests from this location. Please try again in a few minutes.' });
    }
    next();
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime_seconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// --- Auth ---
// "identifier" accepts either the account's username or its email — whichever the user types,
// as long as the password matches.
app.post('/api/login', rateLimit('login', 20, 5 * 60 * 1000), (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'Username or email, and password, are required' });

  const user = db.prepare('SELECT * FROM users WHERE (email = ? OR username = ?) AND active = 1').get(identifier, identifier);
  const lockKey = user ? user.email : identifier;

  const lockedMinutes = checkLockout(lockKey);
  if (lockedMinutes !== null) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${lockedMinutes} minute(s), or contact support@nsa.com.na for help.` });
  }

  const valid = user && verifyPassword(password, user.password_hash, user.password_salt);

  if (!valid) {
    const remaining = recordFailedAttempt(lockKey);
    logActivity(user ? user.email : identifier, 'login_failed', 'Invalid credentials');
    const suffix = remaining !== null
      ? ` ${remaining} attempt(s) remaining before this account is temporarily locked.`
      : ' This account is now temporarily locked.';
    return res.status(401).json({ error: `Invalid username/email or password.${suffix}` });
  }

  clearAttempts(lockKey);
  const token = crypto.randomBytes(24).toString('hex');
  activeTokens.set(token, { email: user.email, role: user.role, lastActivity: Date.now() });
  logActivity(user.email, 'login', 'Successful login');
  res.json({
    token,
    email: user.email,
    username: user.username,
    full_name: `${user.first_name} ${user.last_name}`,
    role: user.role
  });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  logActivity(req.userEmail, 'logout', 'Logged out');
  activeTokens.delete(token);
  res.json({ ok: true });
});

app.post('/api/forgot-password', rateLimit('forgot-password', 10, 5 * 60 * 1000), (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ error: 'Username or email is required' });

  const genericMessage = 'If that account exists in our system, a password reset link has been generated.';
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier, identifier);
  if (!user) {
    return res.json({ message: genericMessage });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (user_email, token, expires_at) VALUES (?, ?, ?)').run(user.email, token, expiresAt);
  logActivity(user.email, 'password_reset_requested', 'Requested a password reset');

  res.json({
    message: genericMessage,
    dev_note: 'No email service is configured in this demo, so the reset link is returned directly instead of being emailed.',
    reset_link: `/index.html?reset_token=${token}`
  });
});

app.post('/api/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
  if (!validatePasswordComplexity(password)) {
    return res.status(400).json({ error: `Password does not meet requirements. ${PASSWORD_RULE_TEXT}` });
  }

  const resetRow = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!resetRow || resetRow.used || new Date(resetRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE email = ?').run(hash, salt, resetRow.user_email);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id);
  clearAttempts(resetRow.user_email);
  logActivity(resetRow.user_email, 'password_reset', 'Password was reset via the forgot-password flow');

  res.json({ ok: true });
});

// --- Activity log --- (admin + support: viewers don't need visibility into system audit trails)
app.get('/api/activity-log', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const logs = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200').all();
  res.json(logs);
});

// --- Settings --- (any authenticated role can view; only admins can change)
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.put('/api/settings', requireAuth, requireRole('admin'), (req, res) => {
  const { org_name, support_email } = req.body || {};
  if (!org_name || !support_email) return res.status(400).json({ error: 'Organization name and support email are required' });
  if (!isValidEmail(support_email)) return res.status(400).json({ error: 'Enter a valid support email address' });

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('org_name', org_name);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('support_email', support_email);
  logActivity(req.userEmail, 'settings_updated', `Updated system settings`);
  res.json({ org_name, support_email });
});

// --- Users --- (admin only: account management, including viewing PII like phone numbers)
const userSelect = 'SELECT id, first_name, last_name, username, email, phone, role, active, created_at FROM users';

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare(`${userSelect} ORDER BY first_name`).all();
  res.json(users);
});

app.get('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const user = db.prepare(`${userSelect} WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { first_name, last_name, username, email, phone, password, role, agreed_to_terms } = req.body || {};
  if (!first_name || !last_name || !username || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, username, email, and password are required' });
  }
  if (!isValidUsername(username)) return res.status(400).json({ error: `Invalid username. ${USERNAME_RULE_TEXT}` });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!agreed_to_terms) return res.status(400).json({ error: 'The Terms of Use must be accepted to create an account' });
  if (!validatePasswordComplexity(password)) {
    return res.status(400).json({ error: `Password does not meet requirements. ${PASSWORD_RULE_TEXT}` });
  }
  const finalRole = VALID_ROLES.includes(role) ? role : 'viewer';

  const { hash, salt } = hashPassword(password);
  try {
    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, username, email, phone, password_hash, password_salt, role, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(first_name, last_name, username, email, phone || '', hash, salt, finalRole);
    logActivity(req.userEmail, 'user_created', `Created user ${email} (${username}) with role "${finalRole}"`);
    res.status(201).json({ id: Number(result.lastInsertRowid), first_name, last_name, username, email, phone, role: finalRole });
  } catch (err) {
    res.status(400).json({ error: 'That username or email is already taken' });
  }
});

app.put('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { first_name, last_name, username, email, phone, active, role } = req.body || {};
  if (!first_name || !last_name || !username || !email) return res.status(400).json({ error: 'First name, last name, username, and email are required' });
  if (!isValidUsername(username)) return res.status(400).json({ error: `Invalid username. ${USERNAME_RULE_TEXT}` });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });

  const activeFlag = (active === false || active === 0 || active === '0') ? 0 : 1;
  const finalRole = VALID_ROLES.includes(role) ? role : 'viewer';
  try {
    const result = db.prepare(`
      UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ?, phone = ?, active = ?, role = ? WHERE id = ?
    `).run(first_name, last_name, username, email, phone || '', activeFlag, finalRole, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    logActivity(req.userEmail, 'user_updated', `Updated user ${email}`);
    res.json({ id: Number(req.params.id), first_name, last_name, username, email, phone, active: activeFlag, role: finalRole });
  } catch (err) {
    res.status(400).json({ error: 'That username or email is already taken by another account' });
  }
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.email === req.userEmail) return res.status(400).json({ error: "You can't delete your own account while logged in" });

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount <= 1) return res.status(400).json({ error: 'At least one user account must remain' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logActivity(req.userEmail, 'user_deleted', `Deleted user ${target.email}`);
  res.json({ ok: true });
});

// --- Departments ---
const departmentSelect = `
  SELECT departments.id, departments.name, departments.code, departments.description,
         departments.head_employee_id, employees.name AS head_name
  FROM departments
  LEFT JOIN employees ON employees.id = departments.head_employee_id
`;
const DEPT_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

app.get('/api/departments', requireAuth, (req, res) => {
  const departments = db.prepare(`${departmentSelect} ORDER BY departments.name`).all();
  res.json(departments);
});

app.get('/api/departments/:id', requireAuth, (req, res) => {
  const dept = db.prepare(`${departmentSelect} WHERE departments.id = ?`).get(req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  const employees = db.prepare('SELECT id, name, email, position FROM employees WHERE department_id = ?').all(req.params.id);
  res.json({ ...dept, employees });
});

app.post('/api/departments', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const { name, code, description, head_employee_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const finalCode = code ? String(code).trim().toUpperCase() : null;
  if (finalCode && !DEPT_CODE_PATTERN.test(finalCode)) {
    return res.status(400).json({ error: 'Department code must be 2-6 letters/numbers (e.g. ENG, FIN)' });
  }
  const headId = head_employee_id || null;
  if (headId && !db.prepare('SELECT id FROM employees WHERE id = ?').get(headId)) {
    return res.status(400).json({ error: 'Selected department head does not exist' });
  }
  try {
    const result = db.prepare('INSERT INTO departments (name, code, description, head_employee_id) VALUES (?, ?, ?, ?)')
      .run(name, finalCode, description || '', headId);
    logActivity(req.userEmail, 'department_created', `Created department "${name}"`);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, code: finalCode, description, head_employee_id: headId });
  } catch (err) {
    res.status(400).json({ error: 'Department name or code must be unique' });
  }
});

app.put('/api/departments/:id', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const { name, code, description, head_employee_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const finalCode = code ? String(code).trim().toUpperCase() : null;
  if (finalCode && !DEPT_CODE_PATTERN.test(finalCode)) {
    return res.status(400).json({ error: 'Department code must be 2-6 letters/numbers (e.g. ENG, FIN)' });
  }
  const headId = head_employee_id || null;
  if (headId && !db.prepare('SELECT id FROM employees WHERE id = ?').get(headId)) {
    return res.status(400).json({ error: 'Selected department head does not exist' });
  }
  try {
    const result = db.prepare('UPDATE departments SET name = ?, code = ?, description = ?, head_employee_id = ? WHERE id = ?')
      .run(name, finalCode, description || '', headId, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
    logActivity(req.userEmail, 'department_updated', `Updated department "${name}"`);
    res.json({ id: Number(req.params.id), name, code: finalCode, description, head_employee_id: headId });
  } catch (err) {
    res.status(400).json({ error: 'Department name or code must be unique' });
  }
});

app.delete('/api/departments/:id', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const dept = db.prepare('SELECT name FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  db.prepare('UPDATE employees SET department_id = NULL WHERE department_id = ?').run(req.params.id);
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  logActivity(req.userEmail, 'department_deleted', `Deleted department "${dept.name}"`);
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

app.post('/api/employees', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const { name, email, position, department_id } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    const result = db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
      .run(name, email, position || '', department_id || null);
    logActivity(req.userEmail, 'employee_created', `Created employee "${name}"`);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, email, position, department_id });
  } catch (err) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

app.put('/api/employees/:id', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const { name, email, position, department_id } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const result = db.prepare('UPDATE employees SET name = ?, email = ?, position = ?, department_id = ? WHERE id = ?')
    .run(name, email, position || '', department_id || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
  logActivity(req.userEmail, 'employee_updated', `Updated employee "${name}"`);
  res.json({ id: Number(req.params.id), name, email, position, department_id });
});

app.delete('/api/employees/:id', requireAuth, requireRole('admin', 'support'), (req, res) => {
  const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  db.prepare('UPDATE departments SET head_employee_id = NULL WHERE head_employee_id = ?').run(req.params.id);
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  logActivity(req.userEmail, 'employee_deleted', `Deleted employee "${emp.name}"`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Employee Management System running at http://localhost:${PORT}`);
});
