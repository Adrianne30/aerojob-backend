// models/SearchLog.js
const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional
    role: { type: String, enum: ['student', 'alumni', 'admin', 'guest'], default: 'guest' },
  },
  { timestamps: true }
);

searchLogSchema.index({ term: 1, createdAt: -1 });
module.exports = mongoose.model('SearchLog', searchLogSchema);
