// backend/routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

/* ------------ Helper: return first validation error ------------ */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const first = errors.array()[0];
  return res.status(400).json({ error: first.msg, field: first.path });
};

/* ---------------- JWT Helpers ---------------- */
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role || user.userType || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
}

/* ---------------- Auth Middleware ---------------- */
function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = (payload.role || '').toLowerCase();
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* ---------------- Validations ---------------- */
const registerValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('userType')
    .optional()
    .isIn(['student', 'alumni', 'admin'])
    .withMessage('Invalid user type'),
];

const loginValidation = [
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').exists().withMessage('Password is required'),
];

/* ---------------- Controllers (inline for clarity) ---------------- */

router.post('/register', registerValidation, validate, async (req, res) => {
  try {
    const { firstName, lastName, email, password, userType } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashed,
      role: userType || 'student',
    });

    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', loginValidation, validate, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching user' });
  }
});

router.post('/logout', (req, res) => {
  return res.json({ ok: true, message: 'Logged out' });
});

module.exports = router;
