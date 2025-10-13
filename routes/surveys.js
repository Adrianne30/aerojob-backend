// backend/routes/surveys.js
const express = require('express');
const router = express.Router();
const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');

/* -----------------------------------------------------------------------------
   Auth middleware (robust import with graceful fallbacks for dev)
----------------------------------------------------------------------------- */
let requireAuth = (_req, _res, next) => next();
let requireAdmin = (_req, _res, next) => next();
try {
  const m = require('../middleware/auth');
  requireAuth  = m.requireAuth  || m.protect   || requireAuth;
  requireAdmin = m.requireAdmin || m.isAdmin   || requireAdmin;
} catch {
  // ok in dev without middleware
}

/* -----------------------------------------------------------------------------
   Helpers
----------------------------------------------------------------------------- */
const isValidationError = (e) => e && e.name === 'ValidationError';
const isCastError       = (e) => e && e.name === 'CastError';
const norm = (v, dflt = '') => (v ?? dflt).toString().trim();

function normalizeType(raw) {
  const s = norm(raw).toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  if (['short text', 'shorttext', 'text', 'input', 'single line'].includes(s)) return 'short_text';
  if (['long text', 'longtext', 'textarea', 'paragraph'].includes(s)) return 'long_text';
  if (['multiple choice', 'radio', 'single select', 'single'].includes(s)) return 'multiple_choice';
  if (['checkbox', 'multi select', 'multiple', 'multi'].includes(s)) return 'checkbox';
  if (['rating', 'stars', 'scale'].includes(s)) return 'rating';
  return 'short_text';
}

function normalizeSurveyPayload(body) {
  const audience = norm(body.audience, 'all').toLowerCase(); // 'all' | 'students' | 'alumni'
  const status   = norm(body.status, 'draft').toLowerCase(); // 'active' | 'draft' | 'archived'

  const questions = Array.isArray(body.questions)
    ? body.questions.map((q, i) => {
        const type = normalizeType(q?.type);
        const options =
          (type === 'multiple_choice' || type === 'checkbox')
            ? (Array.isArray(q?.options) ? q.options : []).map(norm).filter(Boolean)
            : [];
        return {
          _id: q?._id, // keep subdoc id on edit
          text: norm(q?.text, `Q${i + 1}`),
          type,
          required: !!q?.required,
          options,
        };
      })
    : [];

  return {
    title:       norm(body.title),
    description: norm(body.description),
    audience,
    status,
    questions,
  };
}

const isAdminUser = (u) => {
  const r = (u?.role || u?.userType || '').toLowerCase();
  return r === 'admin';
};

/* =============================================================================
   ADMIN: list + create
   (If you already have these routes in another file, remove this block.)
============================================================================= */

// GET /api/surveys  (admin list; supports q, status)
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { q, status } = req.query;
    const filter = {};
    if (status) filter.status = new RegExp(`^${String(status)}$`, 'i');
    if (q) filter.title = { $regex: q, $options: 'i' };

    const rows = await Survey.find(filter).sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/surveys (admin create)
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = normalizeSurveyPayload(req.body);
    const survey = await Survey.create(payload);
    res.status(201).json(survey);
  } catch (e) {
    if (isValidationError(e)) return res.status(400).json({ message: e.message });
    next(e);
  }
});

/* =============================================================================
   ADMIN: responses list (single, non-duplicated implementation)
============================================================================= */

// GET /api/surveys/:id/responses  (admin view; supports role,userId filters)
router.get('/:id/responses', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { role, userId } = req.query;

    const q = { survey: req.params.id };
    if (userId) {
      q.$or = [{ user: userId }, { userId }];
    }

    const rows = await SurveyResponse.find(q)
      .populate('user', 'firstName lastName email role userType')
      .sort({ createdAt: -1 });

    const filtered = role
      ? rows.filter((r) => {
          const rRole =
            r.role || r.user?.role || r.user?.userType || r.userId?.role || '';
          return String(rRole).toLowerCase() === String(role).toLowerCase();
        })
      : rows;

    const payload = filtered.map((r) => {
      const obj = r.toObject({ virtuals: true });
      const derivedRole =
        obj.role ||
        obj.user?.role ||
        obj.user?.userType ||
        obj.userId?.role ||
        undefined;

      return {
        ...obj,
        userId: obj.userId || obj.user || null, // normalize for UI
        role: derivedRole,
      };
    });

    res.json(payload);
  } catch (e) {
    if (isCastError(e)) return res.status(400).json({ message: 'Invalid survey id' });
    next(e);
  }
});

/* =============================================================================
   STUDENT/ALUMNI: eligible active surveys (must be above '/:id' routes)
============================================================================= */

// GET /api/surveys/active/eligible
router.get('/active/eligible', requireAuth, async (req, res, next) => {
  try {
    const role = (req.user?.role || req.user?.userType || '').toLowerCase(); // 'student' | 'alumni' | ''
    const roleTargets = [];
    if (role === 'student') roleTargets.push('student', 'students');
    if (role === 'alumni')  roleTargets.push('alumni', 'alumnus', 'alumnae', 'alumna');

    // All active surveys for this audience (case-insensitive status)
    const activeList = await Survey.find({
      status: { $regex: /^active$/i },
      $or: [{ audience: 'all' }, ...roleTargets.map(a => ({ audience: a }))],
    }).sort({ createdAt: -1 });

    if (!req.user?._id) return res.json(activeList);

    // Filter out surveys already answered by this user (supports 'user' or legacy 'userId')
    const answeredIds = await SurveyResponse.find({
      $or: [{ user: req.user._id }, { userId: req.user._id }],
    }).distinct('survey');

    const answeredSet = new Set(answeredIds.map(String));
    const eligible = activeList.filter(s => !answeredSet.has(String(s._id)));

    res.json(eligible);
  } catch (e) { next(e); }
});

/* =============================================================================
   READ / UPDATE / DELETE
============================================================================= */

// GET /api/surveys/:id
// - Admin: full access
// - Student/Alumni: only ACTIVE + audience match + not yet answered
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;

    if (isAdminUser(req.user)) {
      const survey = await Survey.findById(id);
      if (!survey) return res.status(404).json({ message: 'Survey not found' });
      return res.json(survey);
    }

    const role = (req.user?.role || req.user?.userType || '').toLowerCase();
    const audienceOr = [{ audience: 'all' }];
    if (role === 'student') audienceOr.push({ audience: 'students' }, { audience: 'student' });
    if (role === 'alumni')  audienceOr.push({ audience: 'alumni' }, { audience: 'alumnus' }, { audience: 'alumnae' }, { audience: 'alumna' });

    const survey = await Survey.findOne({
      _id: id,
      status: { $regex: /^active$/i },
      $or: audienceOr,
    });
    if (!survey) return res.status(404).json({ message: 'Survey not found or not eligible' });

    const answered = await SurveyResponse.findOne({
      survey: survey._id,
      $or: [{ user: req.user._id }, { userId: req.user._id }],
    });
    if (answered) return res.status(403).json({ message: 'Already answered' });

    res.json(survey);
  } catch (e) {
    if (isCastError(e)) return res.status(400).json({ message: 'Invalid survey id' });
    next(e);
  }
});

// PUT /api/surveys/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = normalizeSurveyPayload(req.body);
    const survey = await Survey.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!survey) return res.status(404).json({ message: 'Survey not found' });
    res.json(survey);
  } catch (e) {
    if (isValidationError(e) || isCastError(e)) {
      return res.status(400).json({ message: e.message || 'Invalid data' });
    }
    next(e);
  }
});

// DELETE /api/surveys/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const survey = await Survey.findByIdAndDelete(req.params.id);
    if (!survey) return res.status(404).json({ message: 'Survey not found' });
    await SurveyResponse.deleteMany({ survey: survey._id });
    res.json({ ok: true });
  } catch (e) {
    if (isCastError(e)) return res.status(400).json({ message: 'Invalid survey id' });
    next(e);
  }
});

/* =============================================================================
   RESPONSES (submit + admin list + my-response)
============================================================================= */

// POST /api/surveys/:id/responses  (student/alumni submit)
router.post('/:id/responses', requireAuth, async (req, res, next) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ message: 'Survey not found' });

    // normalize answers
    let answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    answers = answers
      .map((a, idx) => {
        if (a && typeof a === 'object' && ('questionId' in a || 'qid' in a)) {
          return { questionId: a.questionId || a.qid, value: a.value };
        }
        const qid = survey.questions[idx]?._id;
        return qid ? { questionId: qid, value: a } : null;
      })
      .filter(Boolean);

    // enforce required
    for (const q of survey.questions) {
      if (!q.required) continue;
      const found = answers.find((a) => String(a.questionId) === String(q._id));
      const empty =
        found == null ||
        found.value == null ||
        (Array.isArray(found.value) ? found.value.length === 0 : String(found.value).trim() === '');
      if (empty) {
        return res.status(400).json({ message: `Question "${q.text}" is required.` });
      }
    }

    // create response (supports schemas with 'user' or legacy 'userId')
    const doc = await SurveyResponse.create({
      survey: survey._id,
      answers,
      user: req.user?._id,
      userId: req.user?._id,
    });

    res.status(201).json(doc);
  } catch (e) {
    if (isValidationError(e) || isCastError(e)) {
      return res.status(400).json({ message: e.message || 'Invalid data' });
    }
    next(e);
  }
});

// GET /api/surveys/:id/my-response  (check if current user already answered)
router.get('/:id/my-response', requireAuth, async (req, res, next) => {
  try {
    const doc = await SurveyResponse.findOne({
      survey: req.params.id,
      $or: [{ user: req.user._id }, { userId: req.user._id }],
    }).lean();
    res.json(doc || null);
  } catch (e) { next(e); }
});

module.exports = router;
