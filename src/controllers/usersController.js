const { pool } = require('../config/db');

// GET /api/users
exports.getUsers = async (req, res) => {
  // query params: page, perPage, search, sortBy, sortDir
  let {
    page = 1,
    perPage = 10,
    search = "",
    sortBy = "id",
    sortDir = "asc"
  } = req.query;

  page = parseInt(page);
  perPage = parseInt(perPage);

  // Sanitize sortBy/Dir
  const allowedSortBy = ['id', 'name', 'email', 'role', 'credits'];
  if (!allowedSortBy.includes(sortBy)) sortBy = 'id';
  if (!['asc', 'desc'].includes(sortDir)) sortDir = 'asc';

  // Filter and Pagination
  let where = "";
  const params = [];
  if (search) {
    where = "WHERE name LIKE ? OR email LIKE ?";
    params.push(`%${search}%`, `%${search}%`);
  }
  const countQuery = `SELECT COUNT(*) as total FROM users ${where}`;
  const [[{ total }]] = await pool.query(countQuery, params);

  const dataQuery = `
    SELECT id, name, email, role, is_blocked, is_deleted, credits
    FROM users
    ${where}
    ORDER BY ${sortBy} ${sortDir}
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, (page - 1) * perPage);
  const [rows] = await pool.query(dataQuery, params);

  res.json({
    users: rows,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage)
  });
};
exports.getUserDetails = async (req, res) => {
  const userId = req.params.id;

  try {
    // Fetch user
    const [[user]] = await pool.query(
      `SELECT id, name, email, role, is_blocked, is_deleted, credits FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch transactions
    const [transactions] = await pool.query(
      `SELECT id, payment_id, trx_id, amount_bdt, credits, status, created_at
       FROM credit_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );

    // Fetch images
    const [images] = await pool.query(
      `SELECT id, image_url, created_at FROM user_images WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );

    res.json({ user, transactions, images });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

// GET /api/users/:id/transactions?page=1&perPage=10
exports.getUserTransactions = async (req, res) => {
  const userId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 10;
  // const search = req.query.search || '';

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM credit_payments WHERE user_id = ?`, [userId]
    );

    const [transactions] = await pool.query(
      `SELECT id, payment_id, trx_id, amount_bdt, credits, status, created_at
       FROM credit_payments
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, perPage, (page - 1) * perPage]
    );

    res.json({
      transactions,
      total,
      totalPages: Math.ceil(total / perPage)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

exports.blockUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const [result] = await pool.execute(
      'UPDATE users SET isblock = 1 WHERE id = ?',
      [userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error blocking user', error: error.message });
  }
};

// Unblock user
exports.unblockUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const [result] = await pool.execute(
      'UPDATE users SET isblock = 0 WHERE id = ?',
      [userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error unblocking user', error: error.message });
  }
};
// POST /api/user-images/:id/favorite
