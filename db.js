const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { hashPassword } = require('./lib/auth');

const db = new DatabaseSync(path.join(__dirname, 'ems.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    position TEXT,
    department_id INTEGER,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const deptCount = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;

  if (deptCount === 0) {
    const departments = [
      ['Engineering', 'Builds and maintains internal software systems'],
      ['Human Resources', 'Handles hiring, benefits, and employee relations'],
      ['Finance', 'Manages budgeting, payroll, and financial reporting'],
      ['Marketing', 'Runs campaigns and manages public communications'],
      ['IT Security', 'Oversees information security and compliance'],
      ['Operations', 'Coordinates day-to-day business operations']
    ];
    const insertDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
    for (const [name, description] of departments) {
      insertDept.run(name, description);
    }

    const employees = [
      ['Alice Morgan', 'alice.morgan@example.com', 'Software Engineer', 1],
      ['Brian Chen', 'brian.chen@example.com', 'HR Specialist', 2],
      ['Carla Diaz', 'carla.diaz@example.com', 'Financial Analyst', 3],
      ['David Okafor', 'david.okafor@example.com', 'Marketing Coordinator', 4],
      ['Elena Petrova', 'elena.petrova@example.com', 'Security Analyst', 5],
      ['Frank Osei', 'frank.osei@example.com', 'Operations Manager', 6],
      ['Grace Lin', 'grace.lin@example.com', 'Senior Software Engineer', 1]
    ];
    const insertEmp = db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)');
    for (const [name, email, position, department_id] of employees) {
      insertEmp.run(name, email, position, department_id);
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const { hash, salt } = hashPassword('NSA@2026');
    db.prepare(`
      INSERT INTO users (first_name, last_name, email, phone, password_hash, password_salt, role, active)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', 1)
    `).run('Festus', 'Alpheus', 'festus@nsa.com.na', '+264 81 000 0000', hash, salt);
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('org_name', 'Namibia Statistics Agency');
    insertSetting.run('support_email', 'support@nsa.com.na');
  }
}

seedIfEmpty();

module.exports = db;
