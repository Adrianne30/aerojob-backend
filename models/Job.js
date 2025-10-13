// models/Job.js
const mongoose = require('mongoose');

const JOB_TYPES = ['internship', 'ojt', 'part-time', 'full-time', 'contract'];

const jobSchema = new mongoose.Schema(
  {
    /* ------------------------ Job Information ------------------------ */
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    shortDescription: {
      type: String,
      maxlength: 200,
    },

    /* ---------------------- Company Reference ----------------------- */
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company is required'],
    },

    /* -------------------------- Job Details -------------------------- */
    jobType: {
      type: String,
      enum: JOB_TYPES,
      required: true,
      default: 'internship',
      set: v => (typeof v === 'string' ? v.toLowerCase() : v),
    },
    duration: { type: String },
    startDate: { type: Date },
    applicationDeadline: { type: Date },

    /* --------------------------- Location ---------------------------- */
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    isRemote: { type: Boolean, default: false },
    isHybrid: { type: Boolean, default: false },

    /* ------------------------ Requirements --------------------------- */
    requirements: [{ type: String, trim: true }],
    qualifications: [{ type: String, trim: true }],
    skillsRequired: [{ type: String, trim: true }],

    /* -------------------------- Benefits ----------------------------- */
    benefits: [{ type: String, trim: true }],
    stipend: {
      amount: Number,
      currency: { type: String, default: 'PHP' },
      period: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly', 'one-time'],
      },
    },

    /* -------------------- Application Information -------------------- */
    applicationLink: { type: String, trim: true },
    applicationInstructions: { type: String, maxlength: 500 },
    contactEmail: String,
    contactPhone: String,

    /* -------------------------- Categories --------------------------- */
    categories: [{ type: String, trim: true }],
    department: { type: String, trim: true },

    /* ---------------------- Status & Visibility ---------------------- */
    status: {
      type: String,
      enum: ['active', 'inactive', 'closed', 'draft'],
      default: 'active',
    },
    isFeatured: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true },

    /* --------------------------- Stats ------------------------------- */
    views: { type: Number, default: 0 },
    applications: { type: Number, default: 0 },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    /* -------------------------- Metadata ----------------------------- */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ----------------------------- Indexes ------------------------------ */
jobSchema.index({ title: 'text', description: 'text', shortDescription: 'text' });
jobSchema.index({ company: 1 });
jobSchema.index({ jobType: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ isApproved: 1 });
jobSchema.index({ applicationDeadline: 1 });
jobSchema.index({ categories: 1 });

/* ---------------------------- Virtuals ------------------------------ */
jobSchema.virtual('isAcceptingApplications').get(function () {
  return (
    this.status === 'active' &&
    (!this.applicationDeadline || this.applicationDeadline > new Date())
  );
});

jobSchema.virtual('daysUntilDeadline').get(function () {
  if (!this.applicationDeadline) return null;
  const now = new Date();
  const diffTime = new Date(this.applicationDeadline) - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

const JOB_TYPE_LABEL = {
  internship: 'Internship',
  ojt: 'OJT',
  'part-time': 'Part-time',
  'full-time': 'Full-time',
  contract: 'Contract',
};
jobSchema.virtual('jobTypeLabel').get(function () {
  return JOB_TYPE_LABEL[this.jobType] || this.jobType;
});

/* --------------------------- Methods -------------------------------- */
jobSchema.methods.incrementViews = async function () {
  this.views += 1;
  await this.save();
};

jobSchema.methods.incrementApplications = async function () {
  this.applications += 1;
  await this.save();
};

jobSchema.methods.isSavedByUser = function (userId) {
  return this.savedBy.includes(userId);
};

/* ---------------------------- Population ----------------------------- */
// Auto-populate the company whenever jobs are queried
jobSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'company',
    select: 'name industry logoUrl location website email phone',
  });
  next();
});

module.exports = mongoose.model('Job', jobSchema);
