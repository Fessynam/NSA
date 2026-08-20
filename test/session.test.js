const test = require('node:test');
const assert = require('node:assert/strict');
const { isSessionExpired, SESSION_IDLE_MS } = require('../lib/session');

test('isSessionExpired is false for activity within the idle window', () => {
  const now = 1_000_000;
  assert.equal(isSessionExpired(now - 1000, now, 5000), false);
});

test('isSessionExpired is true once idle time exceeds the window', () => {
  const now = 1_000_000;
  assert.equal(isSessionExpired(now - 6000, now, 5000), true);
});

test('isSessionExpired treats activity at exactly the boundary as not yet expired', () => {
  const now = 1_000_000;
  assert.equal(isSessionExpired(now - 5000, now, 5000), false);
});

test('isSessionExpired defaults to the 20-minute SESSION_IDLE_MS window', () => {
  const now = Date.now();
  assert.equal(isSessionExpired(now, now), false);
  assert.equal(isSessionExpired(now - (SESSION_IDLE_MS + 1000), now), true);
});
