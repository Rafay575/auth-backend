const { pool } = require('../config/db');

// Save contact request
exports.saveContactRequest = async (req, res) => {
  const { name, email, message } = req.body;
  // Backend validation
  if (
    !name ||
    !email ||
    !message ||
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof message !== 'string'
  ) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    await pool.query(
      'INSERT INTO contact_requests (name, email, message) VALUES (?, ?, ?)',
      [name, email, message]
    );
    res.json({ message: 'Request submitted!' });
  } catch (err) {
    res.status(500).json({ error: 'Could not save your message. Please try again.' });
  }
};
// In contactController.js
exports.getContactRequests = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const perPage = Math.max(Number(req.query.perPage) || 10, 1);
  const sort = req.query.sort === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * perPage;

  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM contact_requests');
  const [rows] = await pool.query(
    `SELECT id, name, email, message, created_at as submitted_at
     FROM contact_requests
     ORDER BY created_at ${sort}
     LIMIT ? OFFSET ?`,
    [perPage, offset]
  );
  res.json({ data: rows, total: count });
};
