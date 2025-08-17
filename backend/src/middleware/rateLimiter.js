// Very lightweight in-memory rate limiter per IP and route
// Configure with RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX in env
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxReq = Number(process.env.RATE_LIMIT_MAX || 60);

// Map<bucketKey, { count, resetAt }>
const buckets = new Map();

export function rateLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const key = `${ip}:${req.method}:${req.baseUrl || ''}${req.path}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;

  // Per-path override: allow a higher limit for GET /api/users/:address/policies
  // When mounted at app.use('/api', rateLimiter), req.path will be '/users/:address/policies'
  let effectiveMax = maxReq;
  if (
    req.method === 'GET' &&
    typeof req.path === 'string' &&
    /^\/users\/[^/]+\/policies$/.test(req.path)
  ) {
    const override = Number(process.env.RATE_LIMIT_MAX_POLICIES || 200);
    if (!Number.isNaN(override) && override > effectiveMax) {
      effectiveMax = override;
    }
  }

  res.setHeader("X-RateLimit-Limit", String(effectiveMax));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, effectiveMax - b.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(b.resetAt / 1000)));

  if (b.count > effectiveMax) {
    return res.status(429).json({ success: false, error: "Too many requests" });
  }
  return next();
}
