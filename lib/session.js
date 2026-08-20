const SESSION_IDLE_MS = 20 * 60 * 1000;

function isSessionExpired(lastActivity, now = Date.now(), idleMs = SESSION_IDLE_MS) {
  return (now - lastActivity) > idleMs;
}

module.exports = { SESSION_IDLE_MS, isSessionExpired };
