const Company = require('../models/Company');
const { validationResult } = require('express-validator');

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 10, industry, city, isAccredited, search } = req.query;
    
    let query = { isActive: true };
    
    // Filter by industry
    if (industry) {
      query.industry = { $regex: industry, $options: 'i' };
    }
    
    // Filter by city
    if (city) {
      query['address.city'] = { $regex: city, $options: 'i' };
    }
    
    // Filter by accreditation status
    if (isAccredited !== undefined) {
      query.isAccredited = isAccredited === 'true';
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { industry: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } }
      ];
    }
    
    const companies = await Company.find(query)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Company.countDocuments(query);
    
    res.json({
      companies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
    
  } catch (error) {
    console.error('Get all companies error:', error);
    res.status(500).json({ message: 'Server error fetching companies' });
  }
};

// Get company by ID
const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    if (!company.isActive) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    res.json({ company });
    
  } catch (error) {
    console.error('Get company by ID error:', error);
    res.status(500).json({ message: 'Server error fetching company' });
  }
};

// Create new company (admin only)
const createCompany = async (req, res) => {
console.log("📩 Received company data:", req.body);

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const {
      name,
      industry,
      location,
      description,
      website,
      email,
      phone,
      logoUrl, 
    } = req.body;

    // Check for existing company
    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });

    if (existingCompany) {
      return res.status(400).json({ message: 'Company with this name already exists' });
    }

    const company = new Company({
      name,
      industry,
      location,
      description,
      website,    
      email,
      phone,
      logoUrl,    
      isActive: true,
    });

    await company.save();

    res.status(201).json({
      message: 'Company created successfully',
      company,
    });

  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ message: 'Server error creating company' });
  }
};


// Update company (admin only)
const updateCompany = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }
    
    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    // Check if name is being changed and if it conflicts with existing company
    if (req.body.name && req.body.name !== company.name) {
      const existingCompany = await Company.findOne({ 
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCompany) {
        return res.status(400).json({ message: 'Company with this name already exists' });
      }
    }
    
    Object.assign(company, req.body);
    await company.save();
    
    res.json({
      message: 'Company updated successfully',
      company
    });
    
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ message: 'Server error updating company' });
  }
};

// Delete company (soft delete - admin only)
const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    company.isActive = false;
    await company.save();
    
    res.json({ message: 'Company deleted successfully' });
    
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ message: 'Server error deleting company' });
  }
};

// Update company logo
const updateCompanyLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    company.logo = req.file.path;
    await company.save();
    
    res.json({
      message: 'Company logo updated successfully',
      logo: company.logo
    });
    
  } catch (error) {
    console.error('Update company logo error:', error);
    res.status(500).json({ message: 'Server error updating company logo' });
  }
};

// Get company statistics (admin only)
const getCompanyStatistics = async (req, res) => {
  try {
    const totalCompanies = await Company.countDocuments({ isActive: true });
    const accreditedCompanies = await Company.countDocuments({ 
      isAccredited: true, 
      isActive: true 
    });
    
    // Companies by industry
    const companiesByIndustry = await Company.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$industry', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Companies by city
    const companiesByCity = await Company.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // New companies in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newCompanies = await Company.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isActive: true
    });
    
    res.json({
      totalCompanies,
      accreditedCompanies,
      companiesByIndustry,
      companiesByCity,
      newCompanies
    });
    
  } catch (error) {
    console.error('Get company statistics error:', error);
    res.status(500).json({ message: 'Server error fetching company statistics' });
  }
};

// Search companies
const searchCompanies = async (req, res) => {
  try {
    const { query, industry, city } = req.query;
    
    let searchQuery = { isActive: true };
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { industry: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (industry) {
      searchQuery.industry = { $regex: industry, $options: 'i' };
    }
    
    if (city) {
      searchQuery['address.city'] = { $regex: city, $options: 'i' };
    }
    
    const companies = await Company.find(searchQuery)
      .select('name industry address logo isAccredited')
      .limit(20);
    
    res.json({ companies });
    
  } catch (error) {
    console.error('Search companies error:', error);
    res.status(500).json({ message: 'Server error searching companies' });
  }
};

module.exports = {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  updateCompanyLogo,
  getCompanyStatistics,
  searchCompanies
};
