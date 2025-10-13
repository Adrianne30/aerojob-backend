// backend/models/Survey.js
const mongoose = require('mongoose');

const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'multiple_choice',
  'checkbox',
  'rating',
];

const QuestionSchema = new mongoose.Schema(
  {
    // Mongoose auto-adds _id for subdocs; we keep it to match Answer.questionId
    text: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, default: 'short_text', required: true },
    required: { type: Boolean, default: false },
    // only used for multiple_choice / checkbox
    options: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          // options are only meaningful for MC/checkbox; allow empty otherwise
          if (!arr || !arr.length) return true;
          return Array.isArray(arr) && arr.every((s) => typeof s === 'string' && s.trim().length);
        },
        message: 'All options must be non-empty strings.',
      },
    },
  },
  { _id: true } // keep subdocument _id (needed for SurveyResponse.questionId)
);

const SurveySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // who can take it
    audience: {
      type: String,
      enum: ['all', 'students', 'student', 'alumni', 'alumnus', 'alumnae', 'alumna'],
      default: 'all',
      lowercase: true,
      trim: true,
    },

    // lifecycle
    status: {
      type: String,
      enum: ['active', 'draft', 'archived'],
      default: 'draft',
      lowercase: true,
      trim: true,
    },

    // question bank
    questions: { type: [QuestionSchema], default: [] },

    // bookkeeping
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Helpful indexes
SurveySchema.index({ status: 1, audience: 1, createdAt: -1 });
SurveySchema.index({ title: 'text', description: 'text' });

// Normalize some fields on save/update
function normalize(doc) {
  if (!doc) return;
  if (doc.audience) doc.audience = String(doc.audience).toLowerCase().trim();
  if (doc.status) doc.status = String(doc.status).toLowerCase().trim();
  if (Array.isArray(doc.questions)) {
    doc.questions = doc.questions.map((q) => {
      const qq = { ...q };
      if (qq.text) qq.text = String(qq.text).trim();
      if (qq.type) qq.type = String(qq.type).toLowerCase().trim();
      if (Array.isArray(qq.options)) {
        qq.options = qq.options.map((o) => String(o).trim()).filter(Boolean);
      }
      return qq;
    });
  }
}

SurveySchema.pre('validate', function (next) {
  normalize(this);
  next();
});

SurveySchema.set('toJSON', { virtuals: true });
SurveySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Survey', SurveySchema); 
