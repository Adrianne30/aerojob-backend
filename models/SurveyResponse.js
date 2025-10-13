// backend/models/SurveyResponse.js
const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema(
  {
    // id of the question subdocument in Survey.questions
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    value: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const SurveyResponseSchema = new mongoose.Schema(
  {
    survey: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true },
    answers: [AnswerSchema],
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // legacy fallback
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SurveyResponse', SurveyResponseSchema);