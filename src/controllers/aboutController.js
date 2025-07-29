const { pool } = require('../config/db');

// GET About sections and FAQs
exports.getAboutPage = async (req, res) => {
  const [aboutSections] = await pool.query(
    'SELECT id, section_order, text FROM about_sections ORDER BY section_order ASC'
  );
  const [faqs] = await pool.query(
    'SELECT id, faq_order, question, answer FROM faqs ORDER BY faq_order ASC'
  );
  res.json({ aboutSections, faqs });
};

// Save (replace all) About sections and FAQs
exports.saveAboutPage = async (req, res) => {
  const { aboutSections, faqs } = req.body;
  if (
    !Array.isArray(aboutSections) ||
    !Array.isArray(faqs) ||
    aboutSections.length === 0
  ) {
    return res.status(400).json({ error: 'Sections and FAQs are required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM about_sections');
    for (let i = 0; i < aboutSections.length; i++) {
      await conn.query(
        'INSERT INTO about_sections (section_order, text) VALUES (?, ?)',
        [i, aboutSections[i].text]
      );
    }
    await conn.query('DELETE FROM faqs');
    for (let i = 0; i < faqs.length; i++) {
      await conn.query(
        'INSERT INTO faqs (faq_order, question, answer) VALUES (?, ?, ?)',
        [i, faqs[i].question, faqs[i].answer]
      );
    }
    await conn.commit();
    res.json({ message: 'About/FAQ updated.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Failed to save about page.' });
  } finally {
    conn.release();
  }
};
