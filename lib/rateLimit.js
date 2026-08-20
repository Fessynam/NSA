// Pure sliding-window rate-limit check: given the timestamps of previous requests,
// decide whether a new one is allowed, and return the pruned list to store back.
function checkRateLimit(timestamps, now, maxRequests, windowMs) {
  const recent = timestamps.filter((t) => now - t < windowMs);
  const allowed = recent.length < maxRequests;
  if (allowed) recent.push(now);
  return { allowed, timestamps: recent };
}

module.exports = { checkRateLimit };
