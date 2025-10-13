// routes/analytics.js
const express = require('express');
const router = express.Router();
const SearchLog = require('../models/SearchLog');

// POST /analytics/search  { term: "engineer" }
router.post('/search', async (req, res) => {
  try {
    const raw = String(req.body?.term || '').trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'term required' });

    const term = raw.toLowerCase(); // normalize
    const user = req.user?._id || null;
    const role = (req.user?.role || 'guest').toLowerCase();

    await SearchLog.create({ term, user, role });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'failed to log search' });
  }
});

module.exports = router;
