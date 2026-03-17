// controllers/companyController.js
const { Company } = require('../models/quotation');
const { Quotation } = require('../models/quotation');
const User = require('../models/user');

// ===========================================================
// Helper function for error handling
// ===========================================================
const handleError = (res, error, message = 'Server error') => {
  console.error(`[CompanyController] ${message}:`, error);
  res.status(500).json({ 
    success: false, 
    message, 
    error: error.message 
  });
};

// ===========================================================
// PUBLIC COMPANY ROUTES (Accessible by all authenticated users)
// ===========================================================

/**
 * @desc    Get all active companies
 * @route   GET /api/companies
 * @access  Private
 */
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .select('code name slug logo address phone email website baseCurrency acceptedCurrencies bankDetails vatNumber crNumber taxRate')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      count: companies.length,
      companies
    });
  } catch (error) {
    handleError(res, error, 'Error fetching companies');
  }
};

/**
 * @desc    Get company by ID
 * @route   GET /api/companies/:id
 * @access  Private
 */
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .select('-__v')
      .lean();

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    handleError(res, error, 'Error fetching company');
  }
};

/**
 * @desc    Get company by code
 * @route   GET /api/companies/code/:code
 * @access  Private
 */
exports.getCompanyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    const company = await Company.findOne({ 
      code: code.toUpperCase(),
      isActive: true 
    }).lean();

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    handleError(res, error, 'Error fetching company by code');
  }
};

/**
 * @desc    Get company statistics
 * @route   GET /api/companies/:id/stats
 * @access  Private
 */
exports.getCompanyStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if company exists
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    // Get quotation stats for this company
    const [
      totalQuotations,
      totalValue,
      statusCounts,
      monthlyStats,
      recentQuotations,
      userCount
    ] = await Promise.all([
      // Total quotations
      Quotation.countDocuments({ companyId: id }),
      
      // Total value in base currency
      Quotation.aggregate([
        { $match: { companyId: id, status: { $in: ['approved', 'awarded'] } } },
        { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }
      ]),
      
      // Status breakdown
      Quotation.aggregate([
        { $match: { companyId: id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Monthly stats for chart
      Quotation.aggregate([
        { $match: { companyId: id } },
        {
          $group: {
            _id: { 
              year: { $year: '$createdAt' }, 
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            total: { $sum: '$totalInBaseCurrency' }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]),
      
      // Recent quotations
      Quotation.find({ companyId: id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('createdBy', 'name')
        .select('quotationNumber customerSnapshot.name total status createdAt currency.code')
        .lean(),
      
      // User count for this company
      User.countDocuments({ companyId: id, isActive: true })
    ]);

    // Format status counts
    const statusMap = {
      draft: 0, pending: 0, ops_approved: 0, ops_rejected: 0,
      approved: 0, rejected: 0, awarded: 0, not_awarded: 0, sent: 0
    };
    
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });

    // Format monthly stats for frontend
    const formattedMonthlyStats = monthlyStats.map(stat => ({
      month: `${stat._id.year}-${String(stat._id.month).padStart(2, '0')}`,
      count: stat.count,
      total: stat.total
    }));

    res.json({
      success: true,
      stats: {
        company: {
          id: company._id,
          code: company.code,
          name: company.name,
          baseCurrency: company.baseCurrency,
          logo: company.logo
        },
        overview: {
          totalQuotations,
          totalValue: totalValue[0]?.total || 0,
          activeUsers: userCount,
          averageValue: totalQuotations > 0 
            ? (totalValue[0]?.total || 0) / totalQuotations 
            : 0
        },
        statusBreakdown: statusMap,
        monthlyStats: formattedMonthlyStats,
        recentQuotations
      }
    });
  } catch (error) {
    handleError(res, error, 'Error fetching company stats');
  }
};

/**
 * @desc    Get company currency settings
 * @route   GET /api/companies/:id/currencies
 * @access  Private
 */
exports.getCompanyCurrencies = async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findById(id)
      .select('baseCurrency acceptedCurrencies')
      .lean();

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      baseCurrency: company.baseCurrency,
      acceptedCurrencies: company.acceptedCurrencies
    });
  } catch (error) {
    handleError(res, error, 'Error fetching company currencies');
  }
};

// ===========================================================
// ADMIN ONLY COMPANY ROUTES
// ===========================================================

/**
 * @desc    Create new company
 * @route   POST /api/companies
 * @access  Admin only
 */
exports.createCompany = async (req, res) => {
  try {
    const {
      code, name, address, phone, email, website,
      vatNumber, crNumber, taxRate,
      baseCurrency, acceptedCurrencies,
      bankDetails, logo
    } = req.body;

    // Check if company with same code already exists
    const existingCode = await Company.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company with this code already exists' 
      });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create company
    const company = await Company.create({
      code: code.toUpperCase(),
      name,
      slug,
      address,
      phone,
      email,
      website,
      logo,
      vatNumber,
      crNumber,
      taxRate: taxRate || 5,
      baseCurrency: baseCurrency || 'AED',
      acceptedCurrencies: acceptedCurrencies || ['AED'],
      bankDetails,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      company
    });
  } catch (error) {
    handleError(res, error, 'Error creating company');
  }
};

/**
 * @desc    Update company
 * @route   PUT /api/companies/:id
 * @access  Admin only
 */
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If name is updated, update slug
    if (updates.name) {
      updates.slug = updates.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    // If code is updated, ensure uppercase
    if (updates.code) {
      updates.code = updates.code.toUpperCase();
      
      // Check if new code conflicts with another company
      const existing = await Company.findOne({ 
        code: updates.code,
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: 'Company with this code already exists' 
        });
      }
    }

    const company = await Company.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      message: 'Company updated successfully',
      company
    });
  } catch (error) {
    handleError(res, error, 'Error updating company');
  }
};

/**
 * @desc    Delete company (soft delete)
 * @route   DELETE /api/companies/:id
 * @access  Admin only
 */
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if company has quotations
    const quotationCount = await Quotation.countDocuments({ companyId: id });
    
    if (quotationCount > 0) {
      // Soft delete - just mark as inactive
      const company = await Company.findByIdAndUpdate(
        id,
        { isActive: false, updatedBy: req.user.id },
        { new: true }
      );
      
      return res.json({
        success: true,
        message: 'Company deactivated (has existing quotations)',
        company
      });
    }

    // Hard delete if no quotations
    await Company.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Company permanently deleted'
    });
  } catch (error) {
    handleError(res, error, 'Error deleting company');
  }
};

/**
 * @desc    Toggle company active status
 * @route   PATCH /api/companies/:id/toggle-status
 * @access  Admin only
 */
exports.toggleCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    company.isActive = !company.isActive;
    company.updatedBy = req.user.id;
    await company.save();

    res.json({
      success: true,
      message: `Company ${company.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: company.isActive
    });
  } catch (error) {
    handleError(res, error, 'Error toggling company status');
  }
};

/**
 * @desc    Bulk import companies
 * @route   POST /api/companies/bulk
 * @access  Admin only
 */
exports.bulkImportCompanies = async (req, res) => {
  try {
    const { companies } = req.body;

    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of companies' 
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const companyData of companies) {
      try {
        // Generate slug
        const slug = companyData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const company = await Company.create({
          ...companyData,
          code: companyData.code.toUpperCase(),
          slug,
          createdBy: req.user.id
        });

        results.successful.push({
          code: company.code,
          name: company.name,
          id: company._id
        });
      } catch (err) {
        results.failed.push({
          code: companyData.code,
          name: companyData.name,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Imported ${results.successful.length} companies, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    handleError(res, error, 'Error bulk importing companies');
  }
};