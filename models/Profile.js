// server/models/Profile.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'student', 'alumni'], required: true },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    course: { type: String, default: '' },
    yearLevel: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', ProfileSchema);
