const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRateLimit } = require('../lib/rateLimit');

test('allows requests under the limit', () => {
  const { allowed, timestamps } = checkRateLimit([], 1000, 3, 60000);
  assert.equal(allowed, true);
  assert.equal(timestamps.length, 1);
});

test('blocks once the limit is reached within the window', () => {
  const now = 100000;
  const existing = [now - 100, now - 200, now - 300]; // 3 requests already, limit 3
  const { allowed } = checkRateLimit(existing, now, 3, 60000);
  assert.equal(allowed, false);
});

test('old requests outside the window do not count against the limit', () => {
  const now = 100000;
  const existing = [now - 70000]; // older than a 60s window
  const { allowed, timestamps } = checkRateLimit(existing, now, 1, 60000);
  assert.equal(allowed, true);
  assert.equal(timestamps.length, 1); // stale entry pruned, only the new one remains
});
