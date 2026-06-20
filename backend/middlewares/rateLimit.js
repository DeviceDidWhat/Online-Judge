// Lightweight in-memory fixed-window rate limiter.
//
// Keyed by the authenticated user id when available, otherwise the client IP, and
// scoped per route so different endpoints keep independent budgets. This is a
// per-process limiter — sufficient for the current single/few-process deployment;
// for horizontal scaling move the counters to a shared (e.g. Redis) store.
const buckets = new Map();
let lastSweep = 0;

const sweep = (now) => {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  lastSweep = now;
};

const rateLimit = ({ windowMs, max, message = 'Too many requests, please slow down.' }) => {
  if (!windowMs || !max) throw new Error('rateLimit requires windowMs and max');

  return (req, res, next) => {
    const now = Date.now();
    // Opportunistically drop expired buckets so the map can't grow unbounded.
    if (now - lastSweep > windowMs) sweep(now);

    const scope = req.baseUrl + (req.route?.path || req.path);
    const identity = req.user?.id || req.ip || 'anonymous';
    const key = `${scope}:${identity}`;

    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
};

module.exports = { rateLimit };
