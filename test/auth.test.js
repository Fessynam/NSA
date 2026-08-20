const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, validatePasswordComplexity, isValidEmail } = require('../lib/auth');

test('hashPassword produces a verifiable hash+salt pair', () => {
  const { hash, salt } = hashPassword('NSA@2026');
  assert.ok(hash.length > 0);
  assert.ok(salt.length > 0);
  assert.equal(verifyPassword('NSA@2026', hash, salt), true);
});

test('verifyPassword rejects a wrong password', () => {
  const { hash, salt } = hashPassword('NSA@2026');
  assert.equal(verifyPassword('wrong-password', hash, salt), false);
});

test('two hashes of the same password use different salts', () => {
  const a = hashPassword('NSA@2026');
  const b = hashPassword('NSA@2026');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('validatePasswordComplexity enforces the password policy (min length + 3-of-4 categories)', () => {
  assert.equal(validatePasswordComplexity('NSA@2026'), true, 'upper+digit+symbol = 3 categories, should pass');
  assert.equal(validatePasswordComplexity('Str0ngPass!'), true, 'all 4 categories, should pass');
  assert.equal(validatePasswordComplexity('short1!'), false, 'too short even though it has 3 categories');
  assert.equal(validatePasswordComplexity('alllowercase'), false, 'only 1 category');
  assert.equal(validatePasswordComplexity('lowerUPPER'), false, 'only 2 categories (upper+lower)');
  assert.equal(validatePasswordComplexity('lowerUPPER1'), true, '3 categories (upper+lower+digit), should pass');
});

test('isValidEmail accepts well-formed addresses and rejects malformed ones', () => {
  assert.equal(isValidEmail('festus@nsa.com.na'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('missing@domain'), false);
});
