const path = require('path');
const User = require('../models/User');
const { validationResult } = require('express-validator');

/* -------------------------------- Helpers ------------------------------- */
const sanitizeUser = (u) => {
  if (!u) return u;
  const obj = u.toObject ? u.toObject() : u;
  delete obj.password;
  delete obj.otp;
  delete obj.resetPasswordToken;
  return obj;
};

const normalizeSkills = (skills) => {
  if (Array.isArray(skills)) return skills.filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  if (typeof skills === 'string') {
    return skills
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
};

/* ----------------------------- Get all users ---------------------------- */
// Admin-only (use adminAuth in route)
const getAllUsers = async (req, res) => {
  try {
    const page  = Number(req.query.page  ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const { userType, search } = req.query;

    const query = { isActive: true };
    if (userType && ['student', 'alumni', 'admin'].includes(userType)) {
      query.userType = userType;
    }
    if (search) {
      query.$or = [
        { firstName:  { $regex: search, $options: 'i' } },
        { lastName:   { $regex: search, $options: 'i' } },
        { email:      { $regex: search, $options: 'i' } },
        { studentId:  { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('-password -otp -resetPasswordToken')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / Math.max(limit, 1)),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
};

/* ------------------------------- Get me --------------------------------- */
// Current authenticated user (relies on auth middleware)
const getMe = async (req, res) => {
  try {
    // req.user is set by auth middleware; refresh from DB for latest data
    const me = await User.findById(req.user._id || req.user.id)
      .select('-password -otp -resetPasswordToken');
    if (!me) return res.status(404).json({ message: 'User not found' });
    res.json(sanitizeUser(me));
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};

/* ----------------------------- Get user by id --------------------------- */
const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.id)
      .select('-password -otp -resetPasswordToken');

    if (!u) return res.status(404).json({ message: 'User not found' });

    const isAdmin = req.user?.userType === 'admin';
    const isSelf  = String(req.user?._id || req.user?.id) === String(req.params.id);
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ user: sanitizeUser(u) });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
};

/* ----------------------------- Update profile --------------------------- */
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      phone,            // ← use `phone` to match frontend
      address,
      bio,
      skills,
      currentEmployer,
      position,
      course,
      yearLevel,
      graduationYear,
      studentId,
    } = req.body;

    const user = await User.findById(req.user._id || req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (firstName != null) user.firstName = firstName;
    if (lastName  != null) user.lastName  = lastName;
    if (phone     != null) user.phone     = phone;
    if (address   != null) user.address   = address;
    if (bio       != null) user.bio       = bio;
    if (skills    != null) user.skills    = normalizeSkills(skills);
    if (studentId != null) user.studentId = studentId;

    // Student/Alumni specific
    if (['student', 'alumni'].includes(user.userType)) {
      if (course         != null) user.course         = course;
      if (yearLevel      != null) user.yearLevel      = yearLevel;
      if (graduationYear != null) user.graduationYear = graduationYear;
    }

    // Alumni specific
    if (user.userType === 'alumni') {
      if (currentEmployer != null) user.currentEmployer = currentEmployer;
      if (position        != null) user.position        = position;
    }

    await user.save();
    res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
};

/* -------------------------- Update profile picture ---------------------- */
const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const user = await User.findById(req.user._id || req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Store a clean relative URL you can serve statically from server.js
    // e.g., app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
    const relativeUrl = path.posix.join(
      '/uploads/profile-pictures/',
      path.basename(req.file.path)
    );

    user.profilePicture = relativeUrl;
    await user.save();

    res.json({
      message: 'Profile picture updated successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({ message: 'Server error updating profile picture' });
  }
};

/* ------------------------------- Delete user ---------------------------- */
const deleteUser = async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: 'User not found' });

    const isAdmin = req.user?.userType === 'admin';
    const isSelf  = String(req.user?._id || req.user?.id) === String(req.params.id);
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Access denied' });
    }

    u.isActive = false; // soft delete
    await u.save();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error deleting user' });
  }
};

/* ------------------------------- Create user ---------------------------- */
// Admin-only (use adminAuth in route)
const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      email,
      password,
      firstName,
      lastName,
      userType,
      studentId,
      course,
      yearLevel,
      phone,
      isEmailVerified = true, // Admin-created users are automatically verified
      isActive = true
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    if (userType === 'student' && studentId) {
      const existingStudent = await User.findOne({ studentId });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student ID already exists'
        });
      }
    }

    const user = new User({
      email,
      password,
      firstName,
      lastName,
      userType,
      studentId: userType === 'student' ? studentId : undefined,
      course: ['student', 'alumni'].includes(userType) ? course : undefined,
      yearLevel: userType === 'student' ? yearLevel : undefined,
      phone,
      isEmailVerified,
      isActive
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/* ---------------------------- User statistics --------------------------- */
// Admin-only
const getUserStatistics = async (req, res) => {
  try {
    const totalUsers   = await User.countDocuments({ isActive: true });
    const totalStudents= await User.countDocuments({ userType: 'student', isActive: true });
    const totalAlumni  = await User.countDocuments({ userType: 'alumni',  isActive: true });
    const totalAdmins  = await User.countDocuments({ userType: 'admin',   isActive: true });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isActive: true
    });

    const usersByCourse = await User.aggregate([
      {
        $match: {
          isActive: true,
          userType: { $in: ['student', 'alumni'] },
          course: { $exists: true, $ne: '' }
        }
      },
      { $group: { _id: '$course', count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      totalUsers,
      totalStudents,
      totalAlumni,
      totalAdmins,
      newUsers,
      usersByCourse
    });
  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({ message: 'Server error fetching statistics' });
  }
};

/* -------------------------------- Exports ------------------------------- */
module.exports = {
  getAllUsers,
  getUsers: getAllUsers,   // alias so routes can use either name
  getMe,
  getUserById,
  updateProfile,
  updateProfilePicture,
  deleteUser,
  createUser,
  getUserStatistics
};
