// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Find user by id using real MongoDB only
const findUserById = async (id) => {
  return await User.findById(id).select('-password');
};

// Verify JWT token
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid. User not found.' });
    }
    if (user.isActive === false) {
      return res.status(401).json({ message: 'Account is deactivated.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid.' });
  }
};

// Admin-only guard
const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
    next();
  });
};

// Student/Alumni guard
const studentAlumniAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (req.user.userType !== 'student' && req.user.userType !== 'alumni') {
      return res.status(403).json({ message: 'Access denied. Student or alumni privileges required.' });
    }
    next();
  });
};

// Optional auth (no failure on missing/invalid token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.id);
    if (user && user.isActive !== false) req.user = user;
    next();
  } catch {
    next();
  }
};

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = {
  auth,
  adminAuth,
  studentAlumniAuth,
  optionalAuth,
  generateToken,
};
