// routes/companies.js
const express = require('express');
const router = express.Router();
const Company = require('../models/Company');

// LIST (array)
router.get('/', async (_req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json(companies); // return ARRAY
  } catch (err) {
    console.error('GET /companies:', err);
    res.status(500).json({ message: 'Failed to load companies' });
  }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching company' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const company = await Company.create(req.body);
    res.status(201).json(company);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to create company' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json(company);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to update company' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json({ message: 'Company deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to delete company' });
  }
});

module.exports = router;
