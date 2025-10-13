const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Profile = require('../models/Profile');
const User = require('../models/User');

// ---- Auth middleware (adjust import if your path/name differs)
function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ---------- Ensure upload dir ----------
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ---------- Multer (avatar uploads) ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `u${req.userId}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Build absolute URL for a relative path (so the frontend can render the image)
function publicFileUrl(req, relPath) {
  const base = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/${relPath.replace(/^[\\/]+/, '')}`;
}

/* ===========================================
   GET /api/profile/me   (auto-create if missing)
   =========================================== */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    let profile = await Profile.findOne({ user: user._id });

    if (!profile) {
      profile = await Profile.create({
        user: user._id,
        fullName: user.name || '',                 // map whatever your User model has
        email: user.email || '',
        role: user.role || 'student',              // 'admin' | 'student' | 'alumni'
        avatarUrl: '',
        bio: '',
        course: '',
        yearLevel: '',
        contactNumber: '',
      });
    }

    return res.json({ user, profile });
  } catch (err) {
    console.error('GET /profile/me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ===========================================
   PUT /api/profile/me   (update)
   =========================================== */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };

    // Only allow fields that exist in the schema
    const allowed = [
      'fullName',
      'email',
      'role',
      'avatarUrl',
      'bio',
      'course',
      'yearLevel',
      'contactNumber',
    ];
    Object.keys(updates).forEach((k) => {
      if (!allowed.includes(k)) delete updates[k];
    });

    const profile = await Profile.findOneAndUpdate(
      { user: req.userId },
      { $set: updates },
      { new: true, upsert: true }
    );

    return res.json(profile);
  } catch (err) {
    console.error('PUT /profile/me error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ===========================================
   POST /api/profile/picture  (upload avatar)
   - field name: profilePicture
   - result saved to profile.avatarUrl
   =========================================== */
router.post('/picture', requireAuth, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const relPath = path.join('uploads', 'avatars', req.file.filename);
    const fileUrl = publicFileUrl(req, relPath);

    const profile = await Profile.findOneAndUpdate(
      { user: req.userId },
      { $set: { avatarUrl: fileUrl } },
      { new: true, upsert: true }
    );

    return res.json({ profile });
  } catch (err) {
    console.error('POST /profile/picture error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
