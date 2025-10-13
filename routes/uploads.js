// routes/uploads.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // folder where files are saved
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique file name
  },
});

const upload = multer({ storage });

// POST /upload/logo
router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

module.exports = router;
