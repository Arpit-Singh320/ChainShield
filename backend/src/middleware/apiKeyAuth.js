// Simple API key auth middleware
// Usage: set API_KEYS as a comma-separated list in env. If unset, auth is disabled.
export function apiKeyAuth(req, res, next) {
  const keysEnv = process.env.API_KEYS;
  if (!keysEnv) return next(); // auth disabled
  const allowed = keysEnv.split(',').map((s) => s.trim()).filter(Boolean);
  const headerKey = req.header('x-api-key');
  if (!headerKey || !allowed.includes(headerKey)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return next();
}
