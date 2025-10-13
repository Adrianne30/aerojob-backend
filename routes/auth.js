// backend/routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

/* ------------ helper: return first validation error ------------ */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const first = errors.array()[0];
  return res.status(400).json({ error: first.msg, field: first.path });
};

/* ---------------------- validations ---------------------- */
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
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('userType')
    .optional()
    .isIn(['student', 'alumni', 'admin'])
    .withMessage('Invalid user type'),
];

const loginValidation = [
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password').exists().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
];

const resetPasswordValidation = [
  body('token').exists().withMessage('Token is required'),
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const verifyOtpValidation = [
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must be numeric'),
];

const resendOtpValidation = [
  body('email').normalizeEmail().isEmail().withMessage('Valid email is required'),
];

/* ------------------------ routes ------------------------ */
// Registration & login
router.post('/register', registerValidation, validate, authController.register);
router.post('/login', loginValidation, validate, authController.login);

// OTP verify/resend
router.post('/verify-otp', verifyOtpValidation, validate, authController.verifyOTP);
router.post('/resend-otp', resendOtpValidation, validate, authController.resendOTP);

// Password reset
router.post(
  '/forgot-password',
  forgotPasswordValidation,
  validate,
  authController.forgotPassword
);
router.post('/reset-password', resetPasswordValidation, validate, authController.resetPassword);

// Profile (protected)
router.get('/profile', auth, authController.getProfile);

// ✅ Aliases for frontend compatibility
router.get('/me', auth, authController.getProfile);
router.post('/logout', (req, res) => {
  // If you ever move to cookie-based auth, clear the cookie here
  return res.json({ ok: true, message: 'Logged out' });
});

module.exports = router;
