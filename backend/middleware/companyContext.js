// middleware/companyContext.js
const Company = require('../models/company');

const ALL_COMPANIES_ID = 'all';

const companyContext = async (req, res, next) => {
  try {
    let companyId = req.headers['x-company-id'] || req.query.companyId || req.body.companyId;
    
    // Handle "All Companies" special case - skip validation
    if (companyId === ALL_COMPANIES_ID) {
      req.companyId = ALL_COMPANIES_ID;
      req.isAllCompanies = true;
      req.company = null;
      return next();
    }
    
    // Also handle if companyId is not provided (for all companies)
    if (!companyId) {
      // For endpoints that don't require company filter (like all companies)
      // You can either proceed without company filter or return error
      // Let's proceed without company filter for now
      req.companyId = null;
      req.isAllCompanies = true;
      req.company = null;
      return next();
    }
    
    // Validate ObjectId format for single company
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID format'
      });
    }
    
    const company = await Company.findById(companyId);
    
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }
    
    if (!company.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Company is inactive'
      });
    }
    
    req.company = company;
    req.companyId = company._id;
    req.isAllCompanies = false;
    
    next();
  } catch (error) {
    console.error('Company context error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing company context',
      error: error.message
    });
  }
};

module.exports = { companyContext, ALL_COMPANIES_ID };