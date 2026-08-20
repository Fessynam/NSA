const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

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
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
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
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', 'admin123');
  }
}

seedIfEmpty();

module.exports = db;
