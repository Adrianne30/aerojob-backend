// controllers/jobController.js
const Job = require('../models/Job');
const Company = require('../models/Company');
const { validationResult } = require('express-validator');

/* -------------------------------------------------------------------------- */
/*                              GET ALL JOBS                                  */
/* -------------------------------------------------------------------------- */
const getAllJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      jobType,
      location,
      company,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = { status: 'active', isApproved: true };

    if (jobType) query.jobType = jobType;
    if (location) query.location = { $regex: location, $options: 'i' };

    // Filter by company name
    if (company) {
      const companies = await Company.find({
        name: { $regex: company, $options: 'i' },
        isActive: true,
      });
      query.company = { $in: companies.map((c) => c._id) };
    }

    if (category) query.categories = { $in: [new RegExp(category, 'i')] };

    // Keyword search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
        { categories: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const jobs = await Job.find(query)
      .populate({
        path: 'company',
        select: 'name industry logoUrl location website email phone',
      })
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Job.countDocuments(query);

    res.json({
      jobs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({ message: 'Server error fetching jobs' });
  }
};

/* -------------------------------------------------------------------------- */
/*                              GET JOB BY ID                                 */
/* -------------------------------------------------------------------------- */
const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({
        path: 'company',
        select: 'name industry logoUrl location website email phone',
      })
      .populate('createdBy', 'firstName lastName email');

    if (!job || job.status !== 'active' || !job.isApproved) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Increment view count if implemented
    if (typeof job.incrementViews === 'function') {
      await job.incrementViews();
    }

    res.json({ job });
  } catch (error) {
    console.error('Get job by ID error:', error);
    res.status(500).json({ message: 'Server error fetching job' });
  }
};

/* -------------------------------------------------------------------------- */
/*                              CREATE JOB (ADMIN)                            */
/* -------------------------------------------------------------------------- */
const createJob = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const jobData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    const company = await Company.findById(jobData.company);
    if (!company || !company.isActive) {
      return res.status(400).json({ message: 'Invalid company' });
    }

    const job = new Job(jobData);
    await job.save();

    // Populate full company details for frontend
    await job.populate({
      path: 'company',
      select: 'name industry logoUrl location website email phone',
    });

    res.status(201).json({
      message: 'Job created successfully',
      job,
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ message: 'Server error creating job' });
  }
};

/* -------------------------------------------------------------------------- */
/*                              UPDATE JOB (ADMIN)                            */
/* -------------------------------------------------------------------------- */
const updateJob = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (req.body.company) {
      const company = await Company.findById(req.body.company);
      if (!company || !company.isActive) {
        return res.status(400).json({ message: 'Invalid company' });
      }
    }

    Object.assign(job, { ...req.body, lastUpdatedBy: req.user?.id });
    await job.save();

    await job.populate({
      path: 'company',
      select: 'name industry logoUrl location website email phone',
    });

    res.json({ message: 'Job updated successfully', job });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ message: 'Server error updating job' });
  }
};

/* -------------------------------------------------------------------------- */
/*                              DELETE JOB (ADMIN)                            */
/* -------------------------------------------------------------------------- */
const deleteJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    job.status = 'closed';
    await job.save();

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ message: 'Server error deleting job' });
  }
};

/* -------------------------------------------------------------------------- */
/*                              APPROVE JOB (ADMIN)                           */
/* -------------------------------------------------------------------------- */
const approveJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    job.isApproved = true;
    job.status = 'active';
    await job.save();

    res.json({ message: 'Job approved successfully', job });
  } catch (error) {
    console.error('Approve job error:', error);
    res.status(500).json({ message: 'Server error approving job' });
  }
};

/* -------------------------------------------------------------------------- */
/*                          GET JOB STATISTICS (ADMIN)                        */
/* -------------------------------------------------------------------------- */
const getJobStatistics = async (req, res) => {
  try {
    const totalJobs = await Job.countDocuments({ status: 'active' });
    const activeJobs = await Job.countDocuments({
      status: 'active',
      isApproved: true,
    });
    const pendingApproval = await Job.countDocuments({
      status: 'active',
      isApproved: false,
    });
    const closedJobs = await Job.countDocuments({ status: 'closed' });

    const jobsByType = await Job.aggregate([
      { $match: { status: 'active', isApproved: true } },
      { $group: { _id: '$jobType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const jobsByCategory = await Job.aggregate([
      { $match: { status: 'active', isApproved: true } },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newJobs = await Job.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      status: 'active',
      isApproved: true,
    });

    const mostViewedJobs = await Job.find({
      status: 'active',
      isApproved: true,
    })
      .sort({ views: -1 })
      .limit(5)
      .populate({
        path: 'company',
        select: 'name industry logoUrl location website email phone',
      })
      .select('title company views applications');

    res.json({
      totalJobs,
      activeJobs,
      pendingApproval,
      closedJobs,
      jobsByType,
      jobsByCategory,
      newJobs,
      mostViewedJobs,
    });
  } catch (error) {
    console.error('Get job statistics error:', error);
    res.status(500).json({ message: 'Server error fetching job statistics' });
  }
};

/* -------------------------------------------------------------------------- */
/*                               SEARCH JOBS                                 */
/* -------------------------------------------------------------------------- */
const searchJobs = async (req, res) => {
  try {
    const { query, location, jobType, category } = req.query;
    const searchQuery = { status: 'active', isApproved: true };

    if (query) {
      searchQuery.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { shortDescription: { $regex: query, $options: 'i' } },
        { categories: { $in: [new RegExp(query, 'i')] } },
      ];
    }

    if (location) searchQuery.location = { $regex: location, $options: 'i' };
    if (jobType) searchQuery.jobType = jobType;
    if (category) searchQuery.categories = { $in: [new RegExp(category, 'i')] };

    const jobs = await Job.find(searchQuery)
      .populate({
        path: 'company',
        select: 'name industry logoUrl location website email phone',
      })
      .select('title company location jobType duration startDate applicationDeadline')
      .limit(20)
      .sort({ createdAt: -1 });

    res.json({ jobs });
  } catch (error) {
    console.error('Search jobs error:', error);
    res.status(500).json({ message: 'Server error searching jobs' });
  }
};

/* -------------------------------------------------------------------------- */
/*                           GET FEATURED JOBS                                */
/* -------------------------------------------------------------------------- */
const getFeaturedJobs = async (req, res) => {
  try {
    const jobs = await Job.find({
      isFeatured: true,
      status: 'active',
      isApproved: true,
      applicationDeadline: { $gt: new Date() },
    })
      .populate({
        path: 'company',
        select: 'name industry logoUrl location website email phone',
      })
      .limit(6)
      .sort({ createdAt: -1 });

    res.json({ jobs });
  } catch (error) {
    console.error('Get featured jobs error:', error);
    res.status(500).json({ message: 'Server error fetching featured jobs' });
  }
};

/* -------------------------------------------------------------------------- */
module.exports = {
  getAllJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  approveJob,
  getJobStatistics,
  searchJobs,
  getFeaturedJobs,
};
