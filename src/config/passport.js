const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./db');

passport.serializeUser((user, done) => {
  done(null, user.id); // store user id in session
});

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, google_id FROM users WHERE id = ?', [id]);
    if (!rows.length) return done(null, false);
    return done(null, rows[0]);
  } catch (e) {
    return done(e);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const name = profile.displayName || '';

        // find by google_id or email
        const [byGoogle] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
        if (byGoogle.length) return done(null, byGoogle[0]);

        const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (byEmail.length) {
          // link google_id to existing user
          await pool.query('UPDATE users SET google_id=? WHERE id=?', [googleId, byEmail[0].id]);
          return done(null, { ...byEmail[0], google_id: googleId });
        }

        // create new user
        const [result] = await pool.query(
          'INSERT INTO users (email, name, google_id) VALUES (?, ?, ?)',
          [email, name, googleId]
        );
        const user = { id: result.insertId, email, name, google_id: googleId };
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
