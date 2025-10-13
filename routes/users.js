const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { auth, adminAuth } = require('../middleware/auth');
const userController = require('../controllers/userController');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Multer for profile pictures
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/profile-pictures/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// user schema
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['admin', 'faculty', 'student', 'user'], default: 'user' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    course: { type: String, default: '' }, // optional
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password || '');
};

module.exports = mongoose.model('User', UserSchema);

// Validation
const createUserValidation = [
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('userType').optional().isIn(['student', 'alumni', 'admin']),
];

const updateProfileValidation = [
  body('firstName').optional().trim().isLength({ min: 2 }),
  body('lastName').optional().trim().isLength({ min: 2 }),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('course').optional().trim(),
  body('yearLevel').optional().trim(),
  body('studentId').optional().trim(),
  body('skills').optional(),
];

// Routes
router.get('/', auth, adminAuth, userController.getAllUsers); // <- renamed
router.get('/me', auth, (req, res) => res.json(req.user));     // <- simple getMe
router.get('/statistics', auth, adminAuth, userController.getUserStatistics);
router.get('/:id', auth, userController.getUserById);
router.post('/', auth, adminAuth, createUserValidation, userController.createUser);
router.put('/profile', auth, updateProfileValidation, userController.updateProfile);
router.post('/profile/picture', auth, upload.single('profilePicture'), userController.updateProfilePicture);
router.delete('/:id', auth, userController.deleteUser);

module.exports = router;
