// controllers/companyController.js
const Company = require('../models/company');
const { Quotation } = require('../models/quotation');
const { Customer } = require('../models/customer');
const Item = require('../models/items');
const User = require('../models/user');
const logger = require('../config/logger');

// ===========================================================
// Helper function for error handling
// ===========================================================
const handleError = (res, error, message = 'Server error') => {
  logger.error(`${message}: ${error.message}`, {
    error: error.message,
    stack: error.stack,
    endpoint: 'companyController'
  });
  res.status(500).json({ 
    success: false, 
    message, 
    error: error.message 
  });
};

/**
 * Generate slug from company name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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
    const companies = await Company.find({})
      .select('code name slug logo address phone email website baseCurrency acceptedCurrencies bankDetails vatNumber crNumber taxRate zohoOrganizationId isActive')
      .sort({ isActive: -1, name: 1 })
      .lean();

    // Every role legitimately needs most of these fields (VAT/CR/trade-license
    // numbers auto-fill onto every quotation header regardless of who's
    // creating it — they're printed business-registration details, not
    // secrets). bankDetails (real bank account/IBAN/SWIFT info) is the one
    // genuinely admin-only field here — only CompanyManagementScreen uses it.
    const isAdmin = req.user?.role === 'admin';
    const responseCompanies = isAdmin
      ? companies
      : companies.map(({ bankDetails, ...rest }) => rest);

    res.json({
      success: true,
      count: responseCompanies.length,
      companies: responseCompanies
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
    
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    const [
      totalQuotations,
      totalValue,
      statusCounts,
      monthlyStats,
      recentQuotations,
      userCount,
      customerCount,
      itemCount
    ] = await Promise.all([
      Quotation.countDocuments({ companyId: id }),
      
      Quotation.aggregate([
        { $match: { companyId: id, status: { $in: ['approved', 'awarded'] } } },
        { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }
      ]),
      
      Quotation.aggregate([
        { $match: { companyId: id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
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
      
      Quotation.find({ companyId: id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('createdBy', 'name')
        .select('quotationNumber customerSnapshot.name total status createdAt currency.code')
        .lean(),
      
      User.countDocuments({ companyId: id, isActive: true }),
      Customer.countDocuments({ companyId: id, isActive: true }),
      Item.countDocuments({ companyId: id, isActive: true })
    ]);

    const statusMap = {
      draft: 0, pending: 0, ops_approved: 0, ops_rejected: 0,
      approved: 0, rejected: 0, awarded: 0, not_awarded: 0, sent: 0
    };
    
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });

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
          totalCustomers: customerCount,
          totalItems: itemCount,
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
      code,
      name,
      address,
      phone,
      email,
      website,
      logo,
      vatNumber,
      crNumber,
      taxRate,
      baseCurrency,
      acceptedCurrencies,
      bankDetails,
      zohoOrganizationId
    } = req.body;

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted to create company`, {
        userId: req.user.id,
        userRole: req.user.role
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can create companies' 
      });
    }

    // Validate required fields
    if (!code || !name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company code and name are required' 
      });
    }

    // Check if company with same code exists
    const existingCode = await Company.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(409).json({ 
        success: false, 
        message: `Company with code ${code.toUpperCase()} already exists` 
      });
    }

    // Check if Zoho Organization ID already exists (only when provided)
    if (zohoOrganizationId) {
      const existingZohoOrg = await Company.findOne({ zohoOrganizationId });
      if (existingZohoOrg) {
        return res.status(409).json({
          success: false,
          message: 'Zoho Organization ID is already associated with another company'
        });
      }
    }

    const slug = generateSlug(name);
    
    const existingSlug = await Company.findOne({ slug });
    if (existingSlug) {
      return res.status(409).json({ 
        success: false, 
        message: 'Company with similar name already exists' 
      });
    }

    const company = await Company.create({
      code: code.toUpperCase(),
      name: name.trim(),
      slug,
      address: address || {},
      phone: phone || '',
      email: email || '',
      website: website || '',
      logo: logo || '',
      vatNumber: vatNumber || '',
      crNumber: crNumber || '',
      taxRate: taxRate || 5,
      baseCurrency: baseCurrency || 'AED',
      acceptedCurrencies: acceptedCurrencies || ['AED'],
      bankDetails: bankDetails || {},
      ...(zohoOrganizationId ? { zohoOrganizationId } : {}),
      createdBy: req.user.id,
      isActive: true
    });

    logger.info(`Company created: ${company.code} - ${company.name}`, {
      companyId: company._id,
      companyCode: company.code,
      companyName: company.name,
      zohoOrganizationId,
      createdBy: req.user.id,
      adminEmail: req.user.email
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      company: {
        _id: company._id,
        code: company.code,
        name: company.name,
        slug: company.slug,
        baseCurrency: company.baseCurrency,
        zohoOrganizationId: company.zohoOrganizationId,
        isActive: company.isActive
      }
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

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted to update company`, {
        userId: req.user.id,
        companyId: id
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can update companies' 
      });
    }

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    const oldValues = {
      name: company.name,
      code: company.code,
      isActive: company.isActive,
      zohoOrganizationId: company.zohoOrganizationId
    };

    if (updates.name) {
      updates.slug = generateSlug(updates.name);
    }

    if (updates.code) {
      updates.code = updates.code.toUpperCase();
      
      const existing = await Company.findOne({ 
        code: updates.code,
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(409).json({ 
          success: false, 
          message: 'Company with this code already exists' 
        });
      }
    }

    let unsetZohoOrg = false;
    if (updates.zohoOrganizationId) {
      const existing = await Company.findOne({
        zohoOrganizationId: updates.zohoOrganizationId,
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Zoho Organization ID already associated with another company'
        });
      }
    } else if ('zohoOrganizationId' in updates) {
      // Empty value means "clear it" — must $unset so the sparse unique index
      // doesn't treat multiple companies with '' as a duplicate key.
      unsetZohoOrg = true;
      delete updates.zohoOrganizationId;
    }

    const updatedCompany = await Company.findByIdAndUpdate(
      id,
      {
        $set: { ...updates, updatedBy: req.user.id },
        ...(unsetZohoOrg ? { $unset: { zohoOrganizationId: 1 } } : {})
      },
      { new: true, runValidators: true }
    );

    logger.info(`Company updated: ${company.code}`, {
      companyId: id,
      companyCode: company.code,
      changes: {
        name: oldValues.name !== updatedCompany.name ? { from: oldValues.name, to: updatedCompany.name } : undefined,
        code: oldValues.code !== updatedCompany.code ? { from: oldValues.code, to: updatedCompany.code } : undefined,
        zohoOrgId: oldValues.zohoOrganizationId !== updatedCompany.zohoOrganizationId ? 
          { from: oldValues.zohoOrganizationId, to: updatedCompany.zohoOrganizationId } : undefined
      },
      updatedBy: req.user.id,
      adminEmail: req.user.email
    });

    res.json({
      success: true,
      message: 'Company updated successfully',
      company: updatedCompany
    });
  } catch (error) {
    handleError(res, error, 'Error updating company');
  }
};

/**
 * @desc    Delete company (soft delete or hard delete)
 * @route   DELETE /api/companies/:id
 * @access  Admin only
 */
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted to delete company`, {
        userId: req.user.id,
        companyId: id
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can delete companies' 
      });
    }

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    const quotationCount = await Quotation.countDocuments({ companyId: id });
    const customerCount = await Customer.countDocuments({ companyId: id });
    const itemCount = await Item.countDocuments({ companyId: id });
    const userCount = await User.countDocuments({ companyId: id });

    const hasDependentData = quotationCount > 0 || customerCount > 0 || itemCount > 0 || userCount > 0;

    if (hasDependentData) {
      company.isActive = false;
      company.updatedBy = req.user.id;
      await company.save();
      
      logger.warn(`Company deactivated (has dependent data): ${company.code}`, {
        companyId: id,
        companyCode: company.code,
        dependentData: { quotationCount, customerCount, itemCount, userCount },
      deactivatedBy: req.user.id
      });
      
      return res.json({
        success: true,
        message: `Company deactivated (has dependent data: ${quotationCount} quotations, ${customerCount} customers, ${itemCount} items, ${userCount} users)`,
        company: { _id: company._id, name: company.name, isActive: false }
      });
    }

    await Company.findByIdAndDelete(id);
    
    logger.warn(`Company permanently deleted: ${company.code}`, {
      companyId: id,
      companyCode: company.code,
      companyName: company.name,
      deletedBy: req.user.id
    });

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

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted to toggle company status`, {
        userId: req.user.id,
        companyId: id
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can toggle company status' 
      });
    }
    
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    const oldStatus = company.isActive;
    company.isActive = !company.isActive;
    company.updatedBy = req.user.id;
    await company.save();

    logger.info(`Company status toggled: ${company.code}`, {
      companyId: id,
      companyCode: company.code,
      oldStatus,
      newStatus: company.isActive,
      toggledBy: req.user.id
    });

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

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted bulk import`, {
        userId: req.user.id
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Only admins can bulk import companies' 
      });
    }

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
        if (!companyData.zohoOrganizationId) {
          throw new Error('Zoho Organization ID is required');
        }

        const slug = generateSlug(companyData.name);
        const code = companyData.code.toUpperCase();

        // Upsert by zohoOrganizationId so re-importing activates existing companies
        // instead of failing with a duplicate-key error.
        const company = await Company.findOneAndUpdate(
          { zohoOrganizationId: companyData.zohoOrganizationId },
          {
            $set: {
              ...companyData,
              code,
              slug,
              isActive: true,
              updatedBy: req.user.id,
            },
            $setOnInsert: { createdBy: req.user.id },
          },
          { upsert: true, new: true, runValidators: true }
        );

        results.successful.push({
          code: company.code,
          name: company.name,
          id: company._id,
          zohoOrganizationId: company.zohoOrganizationId
        });
      } catch (err) {
        results.failed.push({
          code: companyData.code,
          name: companyData.name,
          error: err.message
        });
      }
    }

    logger.info(`Bulk import completed: ${results.successful.length} successful, ${results.failed.length} failed`, {
      successfulCount: results.successful.length,
      failedCount: results.failed.length,
      successfulCompanies: results.successful.map(c => c.code),
      failedCompanies: results.failed.map(f => ({ code: f.code, error: f.error })),
      importedBy: req.user.id
    });

    res.json({
      success: true,
      message: `Imported/updated ${results.successful.length} companies, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    handleError(res, error, 'Error bulk importing companies');
  }
};