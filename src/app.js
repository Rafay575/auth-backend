const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport'); // initializes strategies
const session = require('express-session'); // only if you want sessions for Google
const authRoutes = require('./routes/auth');
const runwareRoutes = require('./routes/runware');
const creditsRoutes = require("./routes/credits");
const privacyPolicyRoutes = require('./routes/privacyPolicyRoutes');
const termsRoutes = require('./routes/termsRoutes');
const contactRoutes = require('./routes/contactRoutes');
const aboutRoutes = require('./routes/aboutRoutes');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');
const userImagesRoutes = require("./routes/userImages");
const receiptsRouter = require("./routes/receipts");

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: 'some-secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin/about', aboutRoutes);
app.use('/api/admin/terms', termsRoutes);
app.use("/api", creditsRoutes);
app.use('/api', authRoutes);
app.use("/api/runware", runwareRoutes); 
app.use('/api/admin/privacy-policy', privacyPolicyRoutes);
app.use('/api/contact', contactRoutes);
app.use("/api", userImagesRoutes);
app.use("/api/transactions", receiptsRouter);
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Auth API running on :${PORT}`));
