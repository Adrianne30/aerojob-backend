// AEROJOB API server with Auth, Surveys, Jobs, Companies, Users, Admin stats, Profile, and Analytics endpoints
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const listEndpoints = require('express-list-endpoints');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const multer = require('multer');

const profileRoutes = require('./routes/profile');
const { sendMail } = require('./utils/mailer');

const app = express();

/* ----------------------------- Security & Logging ----------------------------- */
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));

/* ----------------------------- CORS (put FIRST) ------------------------------ */
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost:3000',
  'https://127.0.0.1:3000',
];
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ------------------------------- Body Parsers -------------------------------- */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ------------------------------ Static Uploads ------------------------------- */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ------------------------------- Rate Limiting ------------------------------- */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
  })
);

/* --------------------------------- Database --------------------------------- */
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aerojob';
let seedAdmin = null;
try {
  seedAdmin = require('./scripts/seedAdmin');
} catch (_) {}

mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(async () => {
    console.log('[DB] Connected');
    if (typeof seedAdmin === 'function') {
      try {
        await seedAdmin();
        console.log('[Seed] Admin ensured');
      } catch (e) {
        console.warn('[Seed] Skipped/failed:', e.message);
      }
    }
  })
  .catch((err) => {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  });

/* ---------------------------------- Models ---------------------------------- */
const Job = require('./models/Job');
const Company = require('./models/Company');
const Survey = require('./models/Survey');
const User = require('./models/User');
const SurveyResponse = require('./models/SurveyResponse');
const SearchLog = require('./models/SearchLog');

/* ------------------------------- Helpers/Utils ------------------------------- */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role || user.userType || 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
}

function getTokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies?.token) return req.cookies.token;
  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = (payload.role || '').toLowerCase();
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return;
    if ((req.userRole || '').toLowerCase() !== 'admin')
      return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

/* ------------------------------ Mount /api/auth & /api/profile ------------------- */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', profileRoutes);

/* --------------------------- File Upload: Company Logo ----------------------- */
const UPLOAD_ROOT = path.join(__dirname, 'uploads');
const COMPANY_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'companies');
fs.mkdirSync(COMPANY_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, COMPANY_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
function imageFileFilter(_req, file, cb) {
  if (!/^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/.test(file.mimetype)) {
    return cb(new Error('Only image files are allowed (png, jpg, jpeg, gif, webp, svg)'));
  }
  cb(null, true);
}
const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.post('/upload/logo', (req, res) => {
  upload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/companies/${req.file.filename}`;
    return res.json({ url });
  });
});

/* ---------------------------------- /api ------------------------------------ */
const api = express.Router();

/* Health */
api.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ------------------------------- SURVEYS ------------------------------------ */
api.get(
  '/surveys',
  asyncH(async (_req, res) => {
    const surveys = await Survey.find().sort({ createdAt: -1 });
    res.json(surveys);
  })
);

api.get(
  '/surveys/:id',
  asyncH(async (req, res) => {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json(survey);
  })
);

api.post(
  '/surveys',
  asyncH(async (req, res) => {
    const survey = await Survey.create(req.body);
    res.status(201).json(survey);
  })
);

api.put(
  '/surveys/:id',
  asyncH(async (req, res) => {
    const survey = await Survey.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json(survey);
  })
);

api.delete(
  '/surveys/:id',
  asyncH(async (req, res) => {
    const deleted = await Survey.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Survey not found' });
    await SurveyResponse.deleteMany({ $or: [{ survey: deleted._id }, { surveyId: deleted._id }] });
    res.json({ deleted: true });
  })
);

api.get(
  '/surveys/active/eligible',
  requireAuth,
  asyncH(async (req, res) => {
    const role = (req.userRole || '').toLowerCase();

    const audienceOr = [{ audience: 'all' }];
    if (role === 'student') audienceOr.push({ audience: 'students' }, { audience: 'student' });
    if (role === 'alumni')
      audienceOr.push({ audience: 'alumni' }, { audience: 'alumnus' }, { audience: 'alumnae' }, { audience: 'alumna' });

    const activeList = await Survey.find({
      status: { $regex: /^active$/i },
      $or: audienceOr,
    }).sort({ createdAt: -1 });

    if (!req.userId) return res.json(activeList);

    const answeredA = await SurveyResponse.find({
      $or: [{ user: req.userId }, { userId: req.userId }],
    }).distinct('survey');

    const answeredB = await SurveyResponse.find({
      $or: [{ user: req.userId }, { userId: req.userId }],
    }).distinct('surveyId');

    const answered = new Set([...answeredA.map(String), ...answeredB.map(String)]);
    const eligible = activeList.filter((s) => !answered.has(String(s._id)));

    res.json(eligible);
  })
);

api.post(
  '/surveys/:id/responses',
  requireAuth,
  asyncH(async (req, res) => {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    let answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    answers = answers
      .map((a, idx) => {
        if (a && typeof a === 'object' && ('questionId' in a || 'qid' in a)) {
          return { questionId: a.questionId || a.qid, value: a.value };
        }
        const qid = survey.questions?.[idx]?._id;
        return qid ? { questionId: qid, value: a } : null;
      })
      .filter(Boolean);

    for (const q of survey.questions || []) {
      if (!q.required) continue;
      const found = answers.find((a) => String(a.questionId) === String(q._id));
      const empty =
        found == null ||
        found.value == null ||
        (Array.isArray(found.value) ? found.value.length === 0 : String(found.value).trim() === '');
      if (empty) {
        return res.status(400).json({ error: `Question "${q.text}" is required.` });
      }
    }

    const doc = await SurveyResponse.create({
      survey: survey._id,
      surveyId: survey._id,
      answers,
      user: req.userId,
      userId: req.userId,
    });

    res.status(201).json(doc);
  })
);

api.get(
  '/surveys/:id/responses',
  asyncH(async (req, res) => {
    const surveyExists = await Survey.exists({ _id: req.params.id });
    if (!surveyExists) return res.status(404).json({ error: 'Survey not found' });

    const responses = await SurveyResponse.find({
      $or: [{ survey: req.params.id }, { surveyId: req.params.id }],
    })
      .populate('user', 'firstName lastName email role userType')
      .sort({ createdAt: -1 });

    res.json(responses);
  })
);

api.delete(
  '/survey-responses/:id',
  asyncH(async (req, res) => {
    const deleted = await SurveyResponse.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Response not found' });
    res.json({ deleted: true });
  })
);

api.get(
  '/surveys/:id/responses/export',
  asyncH(async (req, res) => {
    const id = req.params.id;
    const rows = await SurveyResponse.find({
      $or: [{ survey: id }, { surveyId: id }],
    })
      .populate('user', 'firstName lastName email role userType')
      .lean();

    const headers = ['_id', 'createdAt', 'userEmail', 'userName', 'role', 'answers'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r._id,
          r.createdAt?.toISOString?.() || '',
          r.user?.email || '',
          [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || '',
          r.user?.role || r.user?.userType || '',
          JSON.stringify(r.answers ?? []),
        ].map(escape).join(',')
      ),
    ];
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="responses.csv"');
    res.send(csv);
  })
);

/* --------------------------------- JOBS ------------------------------------- */
api.get(
  '/jobs',
  asyncH(async (req, res) => {
    const q = {};
    if (req.query.q) q.$text = { $search: req.query.q };
    if (req.query.jobType) q.jobType = req.query.jobType;
    if (req.query.location) q.location = new RegExp(`^${req.query.location}$`, 'i');
    if (req.query.category) q.categories = req.query.category;
    if (req.query.approvedOnly === 'true') q.isApproved = true;
    if (req.query.status) q.status = req.query.status;

    const jobs = await Job.find(q)
      .populate('company', 'name logoUrl location website industry email phone')
      .sort({ createdAt: -1 });
    res.json(jobs);
  })
);

api.get(
  '/jobs/categories',
  asyncH(async (_req, res) => {
    const list = await Job.distinct('categories', { categories: { $ne: null } });
    res.json(list.filter(Boolean).sort());
  })
);

api.get(
  '/jobs/:id',
  asyncH(async (req, res) => {
    const job = await Job.findById(req.params.id)
      .populate('company', 'name logoUrl location website industry email phone');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  })
);

api.post(
  '/jobs',
  asyncH(async (req, res) => {
    if (req.body.company) {
      const exists = await Company.exists({ _id: req.body.company });
      if (!exists) return res.status(400).json({ error: 'Invalid company ID' });
    }
    const job = await Job.create({
      ...req.body,
      status: req.body.status || 'active',
      isApproved: true,
    });
    await job.populate('company', 'name logoUrl location website industry email phone');
    res.status(201).json(job);
  })
);

api.put(
  '/jobs/:id',
  asyncH(async (req, res) => {
    if (req.body.company) {
      const exists = await Company.exists({ _id: req.body.company });
      if (!exists) return res.status(400).json({ error: 'Invalid company ID' });
    }
    const job = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('company', 'name logoUrl location website industry email phone');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  })
);

api.delete(
  '/jobs/:id',
  asyncH(async (req, res) => {
    const deleted = await Job.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Job not found' });
    res.json({ deleted: true });
  })
);

/* -------------------------------- COMPANIES --------------------------------- */
const isValidEmail = (v) => (typeof v === 'string' ? /.+\@.+\..+/.test(v) : false);
const pickCompanyFields = (src = {}) => {
  const out = {};
  if (src.name != null) out.name = String(src.name).trim();
  if (src.industry != null) out.industry = String(src.industry).trim();
  if (src.location != null) out.location = String(src.location).trim();
  if (src.description != null) out.description = String(src.description).trim();
  if (src.website != null) out.website = String(src.website).trim();
  if (src.email != null) out.email = String(src.email).trim().toLowerCase();
  if (src.phone != null) out.phone = String(src.phone).trim();
  if (src.logoUrl != null) out.logoUrl = String(src.logoUrl).trim();
  if (typeof src.isActive === 'boolean') out.isActive = src.isActive;
  return out;
};

api.get(
  '/companies',
  asyncH(async (_req, res) => {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json({ companies });
  })
);

api.get(
  '/companies/:id',
  asyncH(async (req, res) => {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  })
);

api.post(
  '/companies',
  asyncH(async (req, res) => {
    const body = pickCompanyFields(req.body);

    if (!body.name) return res.status(400).json({ message: 'Company name is required' });

    const dup = await Company.findOne({ name: body.name });
    if (dup) return res.status(409).json({ message: 'Company already exists' });

    if (body.email && !isValidEmail(body.email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const company = await Company.create({
      ...body,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
    });

    res.status(201).json({ company });
  })
);

api.put(
  '/companies/:id',
  asyncH(async (req, res) => {
    const update = pickCompanyFields(req.body);

    if (update.name) {
      const clash = await Company.findOne({ name: update.name, _id: { $ne: req.params.id } });
      if (clash) return res.status(409).json({ message: 'Company name already in use' });
    }

    if (update.email && !isValidEmail(update.email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  })
);

api.delete(
  '/companies/:id',
  asyncH(async (req, res) => {
    const deleted = await Company.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Company not found' });
    res.json({ message: 'Company deleted' });
  })
);

/* ---------------------------------- USERS (Public/Generic) ------------------- */
api.get(
  '/users',
  asyncH(async (req, res) => {
    const { role, status, course } = req.query;
    const q = {};
    if (role) q.role = role;
    if (status) q.status = status;
    if (course) q.course = course;
    const users = await User.find(q).sort({ createdAt: -1 });
    res.json(users);
  })
);

api.get(
  '/users/:id',
  asyncH(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  })
);

api.post(
  '/users',
  asyncH(async (req, res) => {
    const user = await User.create(req.body); // ensure model hashes password
    res.status(201).json(user);
  })
);

api.put(
  '/users/:id',
  asyncH(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  })
);

api.delete(
  '/users/:id',
  asyncH(async (req, res) => {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ deleted: true });
  })
);

/* ------------------------------- ADMIN USERS -------------------------------- */
api.get(
  '/admin/users',
  requireAdmin,
  asyncH(async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  })
);

api.get(
  '/admin/users/:id',
  requireAdmin,
  asyncH(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  })
);

api.post(
  '/admin/users',
  requireAdmin,
  asyncH(async (req, res) => {
    const {
      role, userType, firstName, lastName, email,
      password, studentId, course, yearLevel, phone, status
    } = req.body || {};

    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    const hash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      role: (role || userType || 'Student').toLowerCase(),
      firstName, lastName,
      email: String(email).toLowerCase().trim(),
      password: hash,
      studentId, course, yearLevel, phone,
      status: status || 'active',
    });

    res.status(201).json(user);
  })
);

api.put(
  '/admin/users/:id',
  requireAdmin,
  asyncH(async (req, res) => {
    const update = { ...req.body };
    if (update.password) {
      update.password = await bcrypt.hash(String(update.password), 10);
    }
    if (update.email) {
      update.email = String(update.email).toLowerCase().trim();
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  })
);

api.delete(
  '/admin/users/:id',
  requireAdmin,
  asyncH(async (req, res) => {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ deleted: true });
  })
);

/* ------------------------------ ANALYTICS (search) --------------------------- */
api.post(
  '/analytics/search',
  asyncH(async (req, res) => {
    const raw = String(req.body?.term || '').trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'term required' });

    let userId = null;
    let role = 'guest';
    const tok = getTokenFromReq(req);
    if (tok) {
      try {
        const payload = jwt.verify(tok, JWT_SECRET);
        userId = payload.sub || null;
        role = (payload.role || 'guest').toLowerCase();
      } catch (_) {}
    } else if (req.body?.role) {
      role = String(req.body.role).toLowerCase();
    }

    const term = raw.toLowerCase();
    try {
      await SearchLog.create({ term, user: userId, role });
    } catch (_) {}
    res.json({ ok: true });
  })
);

/* ------------------------------- Mount & Guards ------------------------------ */
app.use('/api', api);

// API 404 guard
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route: ${req.method} ${req.originalUrl}` });
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error('[API Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

/* ---------------------------------- Start ----------------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  try {
    const table = listEndpoints(app).map((e) => ({
      methods: e.methods.join(','),
      path: e.path,
    }));
    console.table(table);
  } catch (_) {}
});
