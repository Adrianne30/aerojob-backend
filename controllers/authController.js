// controllers/authController.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS || 5);
const JWT_TTL = process.env.JWT_TTL || '7d';

/* ---------------- helpers ---------------- */
function publicUser(u) {
  return {
    id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    userType: u.userType,
    isEmailVerified: u.isEmailVerified,
    profilePicture: u.profilePicture || '',
  };
}
function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.userType || user.role || 'student' },
    process.env.JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

/* ===================== REGISTER (send OTP) ===================== */
exports.register = async (req, res) => {
  try {
    let {
      firstName, lastName, email, password,
      userType, studentId, course, yearLevel, graduationYear
    } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
    }
    email = String(email).toLowerCase().trim();

    // sanitize optional unique fields (avoid "" hitting unique index)
    const safeStudentId = studentId && String(studentId).trim() ? String(studentId).trim() : undefined;

    // Friendly duplicate checks
    const dup = await User.findOne({ $or: [{ email }, ...(safeStudentId ? [{ studentId: safeStudentId }] : [])] });
    if (dup) {
      if (dup.email === email) return res.status(409).json({ error: 'Email is already registered.' });
      if (safeStudentId && dup.studentId === safeStudentId) return res.status(409).json({ error: 'Student ID is already registered.' });
    }

    const user = new User({
      firstName, lastName, email, password,
      userType: userType || 'student',
      studentId: safeStudentId,
      course, yearLevel, graduationYear,
    });

    // Generate OTP (secure, hashed inside model) and save
    const otp = await user.generateOTP(OTP_TTL_MIN);
    await user.save();

    // Try to send email, but don’t fail registration if SMTP is down
    try {
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Verify your AeroJob account</h2>
          <p>Your One-Time Password (OTP) is:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${otp}</p>
          <p>This code will expire in ${OTP_TTL_MIN} minutes.</p>
        </div>`;
      await sendMail({
        to: email,
        subject: 'Your AeroJob verification code',
        html,
        text: `Your AeroJob OTP is ${otp}. It expires in ${OTP_TTL_MIN} minutes.`
      });

      return res.json({
        ok: true,
        message: 'Registered. OTP sent to email.',
        requiresVerification: true,
        user: publicUser(user),
      });
    } catch (mailErr) {
      console.error('[MAIL] sendMail failed:', mailErr?.message || mailErr);
      return res.status(202).json({
        ok: true,
        message: 'Registered, but sending the OTP email failed. Please press "Resend code".',
        requiresVerification: true,
        user: publicUser(user),
        mailError: true,
      });
    }
  } catch (e) {
    console.error('[REGISTER] error:', e?.code, e?.name, e?.message);
    if (e?.code === 11000) {
      const fields = Object.keys(e.keyPattern || {});
      if (fields.includes('email')) return res.status(409).json({ error: 'Email is already registered.' });
      if (fields.includes('studentId')) return res.status(409).json({ error: 'Student ID is already registered.' });
      return res.status(409).json({ error: 'Duplicate value for a unique field.' });
    }
    if (e?.name === 'ValidationError') {
      const first = Object.values(e.errors || {})[0]?.message || 'Invalid input.';
      return res.status(400).json({ error: first });
    }
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

/* ===================== VERIFY OTP ===================== */
exports.verifyOTP = async (req, res) => {
  try {
    let { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    email = String(email).toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.isEmailVerified) {
      const token = signToken(user);
      return res.json({ ok: true, message: 'Already verified.', user: publicUser(user), token });
    }

    const result = await user.validateOTP(String(otp), MAX_OTP_ATTEMPTS);
    if (!result.ok) {
      await user.save(); // persist attempts
      const map = {
        NO_OTP: 'No active OTP. Please resend.',
        EXPIRED: 'OTP expired. Please resend.',
        TOO_MANY_ATTEMPTS: 'Too many attempts. Please resend a new OTP.',
        INVALID: 'Invalid code.',
      };
      return res.status(400).json({ error: map[result.error] || 'Verification failed.' });
    }

    user.isEmailVerified = true;
    user.clearOTP();
    await user.save();

    const token = signToken(user);
    res.json({ ok: true, message: 'Email verified.', user: publicUser(user), token });
  } catch (e) {
    console.error('verify-otp error:', e);
    res.status(500).json({ error: 'Verification failed.' });
  }
};

/* ===================== RESEND OTP ===================== */
exports.resendOTP = async (req, res) => {
  try {
    let { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    email = String(email).toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'User already verified.' });

    user.clearOTP();
    const otp = await user.generateOTP(OTP_TTL_MIN);
    await user.save();

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Your new AeroJob verification code</h2>
        <p>OTP:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${otp}</p>
        <p>This code will expire in ${OTP_TTL_MIN} minutes.</p>
      </div>`;
    await sendMail({
      to: email,
      subject: 'New AeroJob verification code',
      html,
      text: `Your new OTP is ${otp}. It expires in ${OTP_TTL_MIN} minutes.`,
    });

    res.json({ ok: true, message: 'OTP resent.' });
  } catch (e) {
    console.error('resend-otp error:', e);
    res.status(500).json({ error: 'Resend failed.' });
  }
};

/* ===================== LOGIN (block unverified) ===================== */
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    email = String(email).toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    if (!user.isEmailVerified) {
      return res.status(403).json({
        error: 'Email not verified. Please check your email for the OTP.',
        requiresVerification: true,
      });
    }

    const token = signToken(user);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Login failed.' });
  }
};

/* ===================== FORGOT PASSWORD ===================== */
exports.forgotPassword = async (req, res) => {
  try {
    let { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    email = String(email).toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) return res.json({ ok: true, message: 'If the email exists, a reset link was sent.' }); // avoid enumeration

    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${tokenRaw}&email=${encodeURIComponent(email)}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Password reset</h2>
        <p>Click the link below to reset your password (valid for 1 hour):</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn’t request this, you can ignore this email.</p>
      </div>`;
    await sendMail({ to: email, subject: 'Reset your AeroJob password', html, text: `Reset link: ${resetUrl}` });

    res.json({ ok: true, message: 'If the email exists, a reset link was sent.' });
  } catch (e) {
    console.error('forgotPassword error:', e);
    res.status(500).json({ error: 'Unable to process request.' });
  }
};

/* ===================== RESET PASSWORD ===================== */
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body || {};
    if (!token || !email || !password) {
      return res.status(400).json({ error: 'Token, email, and new password are required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      email: String(email).toLowerCase().trim(),
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    user.password = password; // pre-save hook will hash
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (e) {
    console.error('resetPassword error:', e);
    res.status(500).json({ error: 'Unable to reset password.' });
  }
};

/* ===================== PROFILE ===================== */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    console.error('getProfile error:', e);
    res.status(500).json({ error: 'Unable to fetch profile.' });
  }
};
