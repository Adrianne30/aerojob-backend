// models/Company.js
const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      unique: true,
      index: true,
    },
    industry: { type: String, trim: true },
    location: { type: String, trim: true },
    description: { type: String, trim: true },
        website: {
      type: String,
      trim: true,
      set: v => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v)
    },
    // Contact Info
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/.+\@.+\..+/, 'Please provide a valid email address'],
    },
    phone: { type: String, trim: true },

    // Media
    logoUrl: { type: String, trim: true },

    // Status
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ----------------------------- Indexes ----------------------------- */
companySchema.index({ name: 1 });
companySchema.index({ industry: 1 });
companySchema.index({ location: 1 });

/* -------------------------- Pre-save hook -------------------------- */
// normalize name capitalization
companySchema.pre('save', function (next) {
  if (this.name) {
    this.name = this.name.trim();
  }
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Company', companySchema);
