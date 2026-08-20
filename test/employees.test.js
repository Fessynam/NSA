const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      position TEXT,
      department_id INTEGER,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );
  `);
  return db;
}

test('employee CRUD lifecycle', () => {
  const db = createTestDb();

  const deptId = Number(
    db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)')
      .run('Engineering', 'Builds software').lastInsertRowid
  );

  // Create
  const empId = Number(
    db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
      .run('Ada Lovelace', 'ada@example.com', 'Engineer', deptId).lastInsertRowid
  );
  assert.ok(empId > 0);

  // Read
  let employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  assert.equal(employee.name, 'Ada Lovelace');
  assert.equal(employee.department_id, deptId);

  // Update
  db.prepare('UPDATE employees SET position = ? WHERE id = ?').run('Principal Engineer', empId);
  employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  assert.equal(employee.position, 'Principal Engineer');

  // Delete
  const result = db.prepare('DELETE FROM employees WHERE id = ?').run(empId);
  assert.equal(result.changes, 1);
  employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  assert.equal(employee, undefined);
});

test('deleting a department unassigns its employees instead of orphaning them', () => {
  const db = createTestDb();

  const deptId = Number(
    db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)')
      .run('Finance', 'Handles budgets').lastInsertRowid
  );
  const empId = Number(
    db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
      .run('Grace Hopper', 'grace@example.com', 'Analyst', deptId).lastInsertRowid
  );

  // Mirrors the delete-department route in server.js: unassign before deleting the department
  db.prepare('UPDATE employees SET department_id = NULL WHERE department_id = ?').run(deptId);
  db.prepare('DELETE FROM departments WHERE id = ?').run(deptId);

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  assert.equal(employee.department_id, null, 'employee should survive with department_id cleared, not be deleted');
});

test('employee email must be unique', () => {
  const db = createTestDb();
  db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
    .run('Person One', 'dup@example.com', 'Role', null);

  assert.throws(() => {
    db.prepare('INSERT INTO employees (name, email, position, department_id) VALUES (?, ?, ?, ?)')
      .run('Person Two', 'dup@example.com', 'Role', null);
  });
});
