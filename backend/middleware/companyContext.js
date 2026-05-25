// middleware/companyContext.js
const Company = require('../models/company');
const mongoose = require('mongoose');
const logger = require('../config/logger');

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
      // Let's proceed without company filter for now
      req.companyId = null;
      req.isAllCompanies = true;
      req.company = null;
      return next();
    }
    
    // Validate ObjectId format for single company
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      logger.warn(`Invalid company ID format`, {
        companyId,
        ip: req.ip,
        path: req.path,
        userId: req.user?.id
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID format'
      });
    }
    
    const company = await Company.findById(companyId);
    
    if (!company) {
      logger.warn(`Company not found`, {
        companyId,
        ip: req.ip,
        path: req.path,
        userId: req.user?.id
      });
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }
    
    if (!company.isActive) {
      logger.warn(`Inactive company access attempt`, {
        companyId,
        companyCode: company.code,
        companyName: company.name,
        ip: req.ip,
        path: req.path,
        userId: req.user?.id
      });
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
    logger.error(`Company context error`, {
      error: error.message,
      stack: error.stack,
      companyId: req.headers['x-company-id'] || req.query.companyId,
      ip: req.ip,
      path: req.path
    });
    res.status(500).json({
      success: false,
      message: 'Error processing company context',
      error: error.message
    });
  }
};

module.exports = { companyContext, ALL_COMPANIES_ID };