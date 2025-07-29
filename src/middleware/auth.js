// middleware/auth.js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // Prefer the HttpOnly cookie
  const tokenFromCookie = req.cookies?.access_token;
  // (Fallback to Authorization header if you still support it)
  const tokenFromHeader = (req.headers.authorization || '').replace(/^Bearer /, '');
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = payload; // { id, email, ... }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}

module.exports = { requireAuth };
