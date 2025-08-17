// Simple request logger middleware
export function requestLogger(req, res, next) {
  const start = Date.now();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  res.on("finish", () => {
    const ms = Date.now() - start;
    const len = res.getHeader("content-length");
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${len || "-"} - ${ms}ms - ip:${ip}`);
  });
  next();
}
