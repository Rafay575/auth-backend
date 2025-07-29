const { pool } = require('../config/db');

// Utility to map DB rows to object
const toSettingsObject = (rows) =>
  rows.reduce((obj, row) => {
    obj[row.key] = isNaN(Number(row.value)) ? row.value : Number(row.value);
    return obj;
  }, {});

// GET: Return all settings as an object
exports.getSettings = async (req, res) => {
  const [rows] = await pool.query('SELECT `key`, `value` FROM app_settings');
  res.json(toSettingsObject(rows));
};

// POST: Save all settings (replace values)
exports.saveSettings = async (req, res) => {
  const { creditsPerDollar, usdToBdt, freeSignupCredits, freeCreationCredits } = req.body;
  if (
    !creditsPerDollar || creditsPerDollar < 1 ||
    !usdToBdt || usdToBdt < 1 ||
    freeSignupCredits < 0 ||
    freeCreationCredits < 0
  ) {
    return res.status(400).json({ error: 'Invalid settings' });
  }
  // Bulk update
  try {
    await pool.query(
      'REPLACE INTO app_settings (`key`, `value`) VALUES (?,?), (?,?), (?,?), (?,?)',
      [
        'creditsPerDollar', creditsPerDollar,
        'usdToBdt', usdToBdt,
        'freeSignupCredits', freeSignupCredits,
        'freeCreationCredits', freeCreationCredits,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Save failed', details: err.message });
  }
};
