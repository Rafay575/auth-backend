const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const jwt = require("jsonwebtoken");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const { generateOtp, sendOtpMail, hashOtp } = require("../utils/mailer");

// --------- SIGNUP (Email + OTP) ---------
const COOKIE_SECURE = process.env.NODE_ENV === "production";

const COOKIE_OPTS_HTTP_ONLY = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/", // important so clearCookie works
};
const COOKIE_OPTS_READABLE = {
  httpOnly: false,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
};
exports.requestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length)
      return res.status(409).json({ error: "Email already registered" });

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
    res.json({ message: "OTP sent" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: "Email & OTP required" });

    const [rows] = await pool.query("SELECT * FROM otps WHERE email = ?", [
      email,
    ]);
    if (!rows.length)
      return res.status(400).json({ error: "Request OTP first" });

    const rec = rows[0];
    if (new Date(rec.expires_at) < new Date())
      return res.status(400).json({ error: "OTP expired" });

    const valid = await bcrypt.compare(otp, rec.otp_hash);
    if (!valid) {
      await pool.query(
        "UPDATE otps SET attempts = attempts + 1 WHERE email=?",
        [email]
      );
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await pool.query("UPDATE otps SET verified=true WHERE email = ?", [email]);
    res.json({ message: "OTP verified" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
};

exports.completeSignup = async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const [otps] = await pool.query(
      "SELECT verified FROM otps WHERE email = ?",
      [email]
    );
    if (!otps.length || !otps[0].verified)
      return res.status(400).json({ error: "OTP not verified" });

    // Fetch freeSignupCredits from app_settings
    const [settingsRows] = await pool.query(
      "SELECT value FROM app_settings WHERE `key` = 'freeSignupCredits' LIMIT 1"
    );
    const freeSignupCredits =
      settingsRows.length && !isNaN(Number(settingsRows[0].value))
        ? Number(settingsRows[0].value)
        : 0;

    const passwordHash = await bcrypt.hash(password, 12);

    // Store credits in users table (assuming you have a 'credits' column)
    const [result] = await pool.query(
      "INSERT INTO users (email, name, password_hash, credits) VALUES (?, ?, ?, ?)",
      [email, name || "", passwordHash, freeSignupCredits]
    );

    await pool.query("DELETE FROM otps WHERE email = ?", [email]);

    const accessToken = signAccessToken({ id: result.insertId, email });
    const refreshToken = signRefreshToken({ id: result.insertId });

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)",
      [result.insertId, refreshToken]
    );

    res.json({
      user: { id: result.insertId, email, name, credits: freeSignupCredits },
      accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (!users.length) {
      // don't leak whether the email exists
      return res.status(400).json({ error: "User not found" });
    }

    const user = users[0];

    // ---- blocked / deleted checks ----
    if (user.is_blocked) {
      return res.status(403).json({
        code: "BLOCKED",
        error: "Your account is blocked. Contact support.",
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    if (user.is_deleted) {
      return res.status(403).json({
        code: "DELETED",
        error: "Your account has been deleted.",
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    // ---- password-less / Google account ----
    if (!user.password_hash) {
      return res.status(400).json({
        code: "GOOGLE_ONLY",
        error: "This account uses Google sign in. Please continue with Google.",
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    // ---- password check ----
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    // ---- success: issue tokens ----
    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ id: user.id, role: user.role });

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)",
      [user.id, refreshToken]
    );
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 min
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie(
      "user",
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }),
      {
        httpOnly: false, // front-end can read
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }
    );
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};

// --------- TOKENS ---------

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: "refreshToken required" });

    // verify token
    const payload = verifyRefreshToken(refreshToken);

    // ensure it exists in db
    const [rows] = await pool.query(
      "SELECT * FROM refresh_tokens WHERE user_id = ? AND token = ?",
      [payload.id, refreshToken]
    );
    if (!rows.length)
      return res.status(401).json({ error: "Invalid refresh token" });

    const accessToken = signAccessToken({
      id: payload.id,
      email: payload.email,
    });
    const newRefreshToken = signRefreshToken({
      id: payload.id,
      email: payload.email,
    });

    // rotate
    await pool.query("DELETE FROM refresh_tokens WHERE user_id=? AND token=?", [
      payload.id,
      refreshToken,
    ]);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)",
      [payload.id, newRefreshToken]
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "Invalid/expired refresh token" });
  }
};

exports.logout = async (req, res) => {
  try {
    // read refresh token from cookie first, fall back to body if you still support it
    const refreshToken = req.cookies?.refresh_token || req.body.refreshToken;

    if (refreshToken) {
      // If you want to ensure you only delete the current session row:
      try {
        const payload = verifyRefreshToken(refreshToken);
        await pool.query(
          "DELETE FROM refresh_tokens WHERE user_id=? AND token=?",
          [payload.id, refreshToken]
        );
      } catch {
        // token invalid/expired – still clear cookies below
      }
    }

    // Clear cookies
    res.clearCookie("access_token", COOKIE_OPTS_HTTP_ONLY);
    res.clearCookie("refresh_token", COOKIE_OPTS_HTTP_ONLY);
    res.clearCookie("user", COOKIE_OPTS_READABLE);

    return res.json({ message: "Logged out" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};

// --------- ME (Protected) ---------

exports.me = async (req, res) => {
  try {
    // Verify token
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: "No access token" });

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const userId = decoded.id;

    // Fetch user from DB
    const [rows] = await pool.query(
      "SELECT id, email, name, google_id,credits FROM users WHERE id = ?",
      [userId]
    );

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    return res.json({ user: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};
exports.resetPasswordAuth = async (req, res) => {
  const userId = req.user?.id; // middleware should set this
  const { currentPassword, newPassword } = req.body;

  if (!userId) return res.status(401).json({ error: "User not authenticated" });
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "All fields required" });

  try {
    // Fetch user with google_id to check for Google login
    const [[user]] = await pool.query(
      "SELECT password_hash, google_id FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // If user has a Google ID (Google login), no password reset!
    if (user.google_id && !user.password_hash) {
      return res.status(400).json({
        error:
          "Password reset is not available for Google login accounts. Please login using Google.",
      });
    }

    // If no password hash, but not Google account (corrupt), also handle
    if (!user.password_hash) {
      return res.status(400).json({
        error:
          "No password set for this account. Please use your Google account to login.",
      });
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ error: "Current password is incorrect" });

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
      newHash,
      userId,
    ]);

    return res.json({
      success: true,
      message: "Password updated successfully!",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

exports.deleteAccount = async (req, res) => {
  const userId = req.user?.id; // set by auth middleware
  const { password } = req.body;

  if (!userId) return res.status(401).json({ error: "User not authenticated" });
  if (!password) return res.status(400).json({ error: "Password required" });

  try {
    // Fetch user info
    const [[user]] = await pool.query(
      "SELECT password_hash, google_id FROM users WHERE id = ?",
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // For Google users with no password
    if (user.google_id && !user.password_hash) {
      return res.status(400).json({
        error:
          "Cannot delete account using password. This is a Google login account.",
      });
    }
    if (!user.password_hash) {
      return res.status(400).json({
        error: "No password set for this account.",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Password is incorrect" });
    }

    // Soft delete: set is_deleted = 1
    await pool.query("UPDATE users SET is_deleted = 1 WHERE id = ?", [userId]);

    // Optionally: invalidate session, clear cookies, etc.

    return res.json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
