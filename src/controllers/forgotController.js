const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { generateOtp, sendOtpMail, hashOtp } = require('../utils/mailer');

exports.requestForgotOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const [users] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (!users.length) return res.status(400).json({ error: 'No account with this email' });

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO otps (email, otp_hash, expires_at, verified, attempts)
       VALUES (?, ?, ?, false, 0)
       ON DUPLICATE KEY UPDATE otp_hash=?, expires_at=?, verified=false, attempts=0`,
      [email, otpHash, expiresAt, otpHash, expiresAt]
    );

    await sendOtpMail(email, otp);
    res.json({ message: 'OTP sent' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email & OTP required' });

    const [otps] = await pool.query('SELECT * FROM otps WHERE email=?', [email]);
    if (!otps.length) return res.status(400).json({ error: 'Request OTP first' });

    const record = otps[0];
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired' });

    const ok = await bcrypt.compare(otp, record.otp_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid OTP' });

    await pool.query('UPDATE otps SET verified=true WHERE email=?', [email]);
    res.json({ message: 'OTP verified' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
      return res.status(400).json({ error: 'Email & newPassword required' });

    const [otps] = await pool.query('SELECT verified FROM otps WHERE email=?', [email]);
    if (!otps.length || !otps[0].verified)
      return res.status(400).json({ error: 'OTP not verified' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE email=?', [passwordHash, email]);
    await pool.query('DELETE FROM otps WHERE email=?', [email]);

    res.json({ message: 'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
