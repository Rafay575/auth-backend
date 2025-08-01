const express = require('express');
const passport = require('passport');
const {pool} = require('../config/db');
const {
  requestOtp,
  verifyOtp,
  completeSignup,
  login,
  refresh,
  logout,
  me,
  resetPasswordAuth,
  deleteAccount
} = require('../controllers/authController');
const {
  requestForgotOtp,
  verifyForgotOtp,
  resetPassword,

} = require('../controllers/forgotController');
const { requireAuth } = require('../middleware/auth');
const {signAccessToken,signRefreshToken} = require('../utils/jwt');


const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const verifyAccess = require('../middleware/verifyAccess');
/** Email + OTP Signup */
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/complete', completeSignup);

/** Email + Password Login */
router.post('/login', login);

/** Forgot password */
router.post('/forgot/request-otp', requestForgotOtp);
router.post('/forgot/verify-otp', verifyForgotOtp);
router.post('/forgot/reset', resetPassword);

/** Tokens */
router.post('/refresh', refresh);
router.post('/logout', logout);

/** Me (protected) */
router.get('/me', requireAuth, me);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["openid", "profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/`, // Redirect to home if failed
    session: false,
  }),
  async (req, res) => {
    try {
      const googleUser = req.user;

      const [rows] = await pool.query(
        "SELECT id, email, name, role, is_blocked, is_deleted FROM users WHERE id = ?",
        [googleUser.id]
      );

      if (!rows.length) {
        return res.redirect(`${FRONTEND_URL}/`);
      }

      const user = rows[0];

      if (user.is_blocked) {
        return res.redirect(
          `${FRONTEND_URL}/blocked?email=${encodeURIComponent(
            user.email
          )}&name=${encodeURIComponent(user.name || "")}`
        );
      }

      if (user.is_deleted) {
        return res.redirect(
          `${FRONTEND_URL}/deleted?email=${encodeURIComponent(
            user.email
          )}&name=${encodeURIComponent(user.name || "")}`
        );
      }

      // issue tokens as before...
      const accessToken = signAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      const refreshToken = signRefreshToken({ id: user.id, role: user.role });

      await pool.query(
        "INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)",
        [user.id, refreshToken]
      );

      res.cookie("access_token", accessToken, { httpOnly: true, maxAge: 10 * 365 * 24 * 60 * 60 * 1000});
      res.cookie("refresh_token", refreshToken, { httpOnly: true, maxAge: 10 * 365 * 24 * 60 * 60 * 1000 });
      res.cookie("user", JSON.stringify(user), { httpOnly: false ,maxAge: 10 * 365 * 24 * 60 * 60 * 1000});

      return res.redirect(`${FRONTEND_URL}/create`);
    } catch (e) {
      console.error("Google callback error:", e);
      return res.redirect(`${FRONTEND_URL}/`);
    }
  }
);

router.post("/auth/reset-password", requireAuth, resetPasswordAuth);
router.post("/account/delete", requireAuth, deleteAccount);
router.get('/verify', verifyAccess, (req, res) => {
  // only here if valid & not blocked/deleted
  const { id, email, name, role } = req.user;
  res.json({ user: { id, email, name, role } });
});


module.exports = router;
