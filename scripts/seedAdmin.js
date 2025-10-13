// scripts/seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function connectIfNeeded() {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGODB_URI (or MONGO_URI) is not set in .env');
  }
  await mongoose.connect(uri);
}

async function seedAdmin() {
  await connectIfNeeded();

  const email = process.env.ADMIN_EMAIL || 'admin@aerojob.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const name = process.env.ADMIN_NAME || 'Site Admin';

  let user = await User.findOne({ email });

  if (!user) {
    // Create fresh admin (bcrypt hash ensures login works)
    const hash = await bcrypt.hash(password, 10);
    user = new User({
      name,
      email,
      password: hash,
      role: 'admin',
      status: 'active',
    });
    await user.save();
    console.log(`✅ Admin created: ${email} (password: ${password})`);
  } else {
    // Ensure fields are correct
    user.name = user.name || name;
    user.role = 'admin';
    user.status = 'active';

    // Reset password if RESEED_ADMIN=true
    if ((process.env.RESEED_ADMIN || '').toLowerCase() === 'true') {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    console.log(`🔄 Admin ensured/updated: ${email}`);
  }

  // Disconnect if script run directly
  if (require.main === module) {
    await mongoose.disconnect();
    console.log('🔌 Disconnected after seeding.');
  }
}

module.exports = seedAdmin;

// Run directly via `node scripts/seedAdmin.js`
if (require.main === module) {
  seedAdmin().catch(async (err) => {
    console.error('❌ Seeding error:', err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
}
