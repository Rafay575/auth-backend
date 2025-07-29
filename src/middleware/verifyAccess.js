// middleware/verifyAccess.js
const { verifyAccessToken } = require('../utils/jwt'); // your verify
const { pool } = require('../config/db');

module.exports = async function verifyAccess(req, res, next) {
  try {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: 'No token' });

    const payload = verifyAccessToken(token); // { id, role, … }
    const [rows] = await pool.query(
      'SELECT id, email, name, role, is_blocked, is_deleted FROM users WHERE id = ?',
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid user' });

    const user = rows[0];

    if (user.is_blocked) {
      return res.status(403).json({ code: 'BLOCKED', user });
    }
    if (user.is_deleted) {
      return res.status(403).json({ code: 'DELETED', user });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
