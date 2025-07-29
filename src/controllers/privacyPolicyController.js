const { pool } = require('../config/db'); // ← notice destructure!

// GET all sections (ordered)
exports.getPrivacyPolicy = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, heading, text FROM privacy_policy_sections ORDER BY section_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch privacy policy sections.' });
  }
};

// POST/PUT all sections (replace all)
exports.savePrivacyPolicy = async (req, res) => {
  const { sections } = req.body;
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: 'Sections are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM privacy_policy_sections');
    for (let i = 0; i < sections.length; i++) {
      const { heading, text } = sections[i];
      await conn.query(
        'INSERT INTO privacy_policy_sections (section_order, heading, text) VALUES (?, ?, ?)',
        [i, heading, text]
      );
    }
    await conn.commit();
    res.json({ message: 'Privacy policy updated.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Failed to save privacy policy.' });
  } finally {
    conn.release();
  }
};
