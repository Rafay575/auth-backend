const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpMail(to, otp) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const html = `
  <div style="max-width:440px;margin:0 auto;border-radius:8px;overflow:hidden;border:1px solid #ddd;">
    <div style="background:#222;padding:18px 0;text-align:center;">
      <span style="font-size:1.6rem;font-weight:bold;color:#fff;font-family:sans-serif;">Tivoa Art</span>
    </div>
    <div style="background:#fff;padding:32px 24px 24px;">
      <h2 style="font-family:sans-serif;color:#222;margin-top:0;">Verify Your Email</h2>
      <p style="font-family:sans-serif;font-size:1rem;color:#444;">
        Hello,<br>
        Thank you for signing up with Tivoa Art. Please use the OTP below to verify your email address.
      </p>
      <div style="margin:28px 0;text-align:center;">
        <span style="display:inline-block;padding:16px 32px;font-size:1.8rem;letter-spacing:10px;background:#f3f3f3;color:#222;font-weight:bold;border-radius:8px;border:1px solid #e5e7eb;">
          ${otp}
        </span>
      </div>
      <p style="font-family:sans-serif;font-size:0.97rem;color:#555;">This code will expire in 10 minutes.</p>
      <p style="font-family:sans-serif;font-size:0.97rem;color:#999;margin-top:24px;">
        If you didn't create a Tivoa Art account, you can safely ignore this email.
      </p>
    </div>
    <div style="background:#fafafa;font-size:0.93rem;text-align:center;color:#777;padding:18px;">
      © 2025 Tivoa Art. All rights reserved.<br>
      Need help? Contact us at <a href="mailto:support@tivoaart.com" style="color:#666;text-decoration:underline;">support@tivoaart.com</a>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: 'Your Tivoa Art OTP Code',
    html,
  });
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

module.exports = {
  generateOtp,
  sendOtpMail,
  hashOtp,
};
