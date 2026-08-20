const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const candidateBuf = Buffer.from(candidate, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (candidateBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, hashBuf);
}

const PASSWORD_RULE_TEXT = 'At least 8 characters, combining at least 3 of: uppercase letters, lowercase letters, numbers, and symbols.';

function validatePasswordComplexity(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  let categories = 0;
  if (/[A-Z]/.test(password)) categories++;
  if (/[a-z]/.test(password)) categories++;
  if (/[0-9]/.test(password)) categories++;
  if (/[^A-Za-z0-9]/.test(password)) categories++;
  return categories >= 3;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  isValidEmail,
  PASSWORD_RULE_TEXT
};
