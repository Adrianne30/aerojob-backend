const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const jobRoutes = require('./routes/jobs');
const companyRoutes = require('./routes/companies');

// Import mock database
const { MockDB, createDemoData } = require('./config/mockDatabase');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection with immediate fallback to mock database for development
const setupDatabase = async () => {
  // Check if we should use mock database (development without MongoDB)
  if (process.env.NODE_ENV === 'development' && !process.env.MONGODB_URI) {
    console.log('Using mock database for development...');
    
    // Clear mongoose models cache to ensure fresh imports
    delete require.cache[require.resolve('./models/User')];
    delete require.cache[require.resolve('./models/Company')];
    delete require.cache[require.resolve('./models/Job')];
    
    // Replace mongoose models with mock implementations
    const User = require('./models/User');
    const Company = require('./models/Company');
    const Job = require('./models/Job');
    
    // Override static methods with mock implementations
    User.find = MockDB.User.find;
    User.findOne = MockDB.User.findOne;
    User.findById = MockDB.User.findById;
    User.create = MockDB.User.create;
    User.updateOne = MockDB.User.updateOne;
    User.deleteOne = MockDB.User.deleteOne;
    
    Company.find = MockDB.Company.find;
    Company.findById = MockDB.Company.findById;
    Company.create = MockDB.Company.create;
    Company.deleteOne = MockDB.Company.deleteOne;
    
    Job.find = MockDB.Job.find;
    Job.findById = MockDB.Job.findById;
    Job.create = MockDB.Job.create;
    Job.deleteOne = MockDB.Job.deleteOne;
    
    // Create demo data
    await createDemoData();
  } else {
    // Try to connect to MongoDB
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aerojob', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('MongoDB connected successfully');
    } catch (err) {
      console.error('MongoDB connection error:', err.message);
      console.log('Server will continue but database operations may fail');
    }
  }
};

// Setup database before importing routes
setupDatabase().then(() => {
  console.log('Database setup completed');
});

// Test endpoint for mock database
app.get('/api/test/companies', async (req, res) => {
  try {
    // Use the mock database directly
    const companies = await MockDB.Company.find({}).exec();
    res.json({ companies, count: companies.length });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ message: 'Test failed', error: error.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/companies', companyRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'AeroJob API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
