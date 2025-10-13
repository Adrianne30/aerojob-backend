// routes/jobs.js
const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Company = require('../models/Company');

/* --------------------------- helpers --------------------------- */
// Map various inputs to your enum values from the model
const JOBTYPE_MAP = {
  internship: 'Internship',
  ojt: 'OJT',
  'part-time': 'Part-time',
  'part time': 'Part-time',
  'full-time': 'Full-time',
  'full time': 'Full-time',
  contract: 'Contract',
};

function normalizeJobType(v) {
  if (!v || typeof v !== 'string') return v;
  const key = v.trim().toLowerCase();
  return JOBTYPE_MAP[key] || v; // fallback to original
}

function sanitizeJobPayload(src) {
  const body = { ...src };

  // normalize jobType to a valid enum value
  if (body.jobType) body.jobType = normalizeJobType(body.jobType);

  // allow single category or array
  if (body.category && !body.categories) {
    body.categories = [body.category].filter(Boolean);
    delete body.category;
  }

  // remove empty fields
  Object.keys(body).forEach((k) => {
    const v = body[k];
    if (v === '' || v === null) delete body[k];
  });

  return body;
}

/* -------------------------------------------------------------------------- */
/*                                 GET /jobs                                  */
/* -------------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const { q: text, jobType, location, category, approvedOnly, status } = req.query;
    const query = {};

    if (text) {
      query.$or = [
        { $text: { $search: text } },
        { title: { $regex: text, $options: 'i' } },
        { description: { $regex: text, $options: 'i' } },
        { shortDescription: { $regex: text, $options: 'i' } },
      ];
    }

    if (jobType) query.jobType = normalizeJobType(jobType);
    if (location) query.location = { $regex: location, $options: 'i' };

    if (category) {
      query.$or = (query.$or || []).concat([
        { categories: { $in: [category] } },
        { category: category },
      ]);
    }

    if (approvedOnly === 'true') query.isApproved = true;
    if (status) query.status = status;

    const projection = {};
    let sort = { createdAt: -1 };

    if (text) {
      projection.score = { $meta: 'textScore' };
      sort = { score: { $meta: 'textScore' }, createdAt: -1 };
    }

    const jobs = await Job.find(query, projection)
      .populate('company', 'name logoUrl location website industry email phone')
      .sort(sort)
      .lean();

    res.json(jobs);
  } catch (err) {
    console.error('GET /jobs:', err);
    res.status(500).json({ message: 'Failed to load jobs' });
  }
});

/* -------------------------------------------------------------------------- */
/*                           GET /jobs/categories                             */
/* -------------------------------------------------------------------------- */
router.get('/categories', async (_req, res) => {
  try {
    const fromArray = await Job.distinct('categories', { categories: { $ne: null } });
    const fromSingle = await Job.distinct('category', { category: { $ne: null } });

    const set = new Set([
      ...fromArray.filter(Boolean),
      ...fromSingle.filter(Boolean),
    ]);

    res.json(Array.from(set).sort());
  } catch (err) {
    console.error('GET /jobs/categories:', err);
    res.status(500).json({ message: 'Failed to load categories' });
  }
});

/* -------------------------------------------------------------------------- */
/*                                 GET /jobs/:id                              */
/* -------------------------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('company', 'name logoUrl location website industry email phone');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    console.error('GET /jobs/:id:', err);
    res.status(500).json({ message: 'Error fetching job' });
  }
});

/* -------------------------------------------------------------------------- */
/*                                 POST /jobs                                 */
/* -------------------------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const payload = sanitizeJobPayload(req.body);

    if (payload.company) {
      const exists = await Company.exists({ _id: payload.company });
      if (!exists) return res.status(400).json({ message: 'Invalid company ID' });
    }

    const job = await Job.create({
      ...payload,
      status: payload.status || 'active',
      isApproved: payload.isApproved !== undefined ? payload.isApproved : true,
    });

    await job.populate('company', 'name logoUrl location website industry email phone');

    res.status(201).json(job);
  } catch (err) {
    console.error('POST /jobs:', err);
    res.status(400).json({
      message: err.message || 'Failed to create job',
      errors: err.errors || null,
    });
  }
});

/* -------------------------------------------------------------------------- */
/*                                 PUT /jobs/:id                              */
/* -------------------------------------------------------------------------- */
router.put('/:id', async (req, res) => {
  try {
    const payload = sanitizeJobPayload(req.body);

    if (payload.company) {
      const exists = await Company.exists({ _id: payload.company });
      if (!exists) return res.status(400).json({ message: 'Invalid company ID' });
    }

    const job = await Job.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).populate('company', 'name logoUrl location website industry email phone');

    if (!job) return res.status(404).json({ message: 'Job not found' });

    res.json(job);
  } catch (err) {
    console.error('PUT /jobs/:id:', err);
    res.status(400).json({
      message: err.message || 'Failed to update job',
      errors: err.errors || null,
    });
  }
});

/* -------------------------------------------------------------------------- */
/*                              DELETE /jobs/:id                              */
/* -------------------------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    console.error('DELETE /jobs/:id:', err);
    res.status(500).json({ message: err.message || 'Failed to delete job' });
  }
});

module.exports = router;
