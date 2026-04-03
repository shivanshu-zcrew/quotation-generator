// middleware/companyContext.js
const Company = require('../models/company');

const companyContext = async (req, res, next) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId || req.body.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required. Please select a company.'
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

module.exports = { companyContext };