const Quotation = require('../models/quotation');

// @desc    Get pending quotations (for admin)
// @route   GET /api/admin/quotations/pending
exports.getPendingQuotations = async (req, res) => {
  try {
    const quotations = await Quotation.find({ status: 'pending' })
      .populate('customerId', 'name email phone')
      .populate('items.itemId', 'name price')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

// @desc    Get all quotations with filters (admin)
// @route   GET /api/admin/quotations
exports.getAllQuotationsAdmin = async (req, res) => {
  try {
    const { status, fromDate, toDate, userId } = req.query;
    
    let query = {};
    
    if (status) query.status = status;
    if (userId) query.createdBy = userId;
    
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const quotations = await Quotation.find(query)
      .populate('customerId', 'name email phone')
      .populate('items.itemId', 'name price')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quotations', error: error.message });
  }
};

// @desc    Approve quotation
// @route   PUT /api/admin/quotations/:id/approve
exports.approveQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    
    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (quotation.status !== 'pending') {
      return res.status(400).json({ 
        message: `Quotation cannot be approved. Current status: ${quotation.status}` 
      });
    }

    quotation.status = 'approved';
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    
    await quotation.save();

    const updatedQuotation = await Quotation.findById(quotation._id)
      .populate('customerId', 'name email phone')
      .populate('items.itemId', 'name price')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json({ 
      message: 'Quotation approved successfully', 
      quotation: updatedQuotation 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error approving quotation', error: error.message });
  }
};

// @desc    Reject quotation
// @route   PUT /api/admin/quotations/:id/reject
exports.rejectQuotation = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const quotation = await Quotation.findById(req.params.id);
    
    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (quotation.status !== 'pending') {
      return res.status(400).json({ 
        message: `Quotation cannot be rejected. Current status: ${quotation.status}` 
      });
    }

    quotation.status = 'rejected';
    quotation.rejectionReason = reason;
    quotation.approvedBy = req.user.id; // Rejected by
    quotation.approvedAt = new Date();
    
    await quotation.save();

    const updatedQuotation = await Quotation.findById(quotation._id)
      .populate('customerId', 'name email phone')
      .populate('items.itemId', 'name price')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json({ 
      message: 'Quotation rejected successfully', 
      quotation: updatedQuotation 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting quotation', error: error.message });
  }
};

// @desc    Get dashboard stats (admin)
// @route   GET /api/admin/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const totalQuotations = await Quotation.countDocuments();
    const pendingQuotations = await Quotation.countDocuments({ status: 'pending' });
    const approvedQuotations = await Quotation.countDocuments({ status: 'approved' });
    const rejectedQuotations = await Quotation.countDocuments({ status: 'rejected' });
    
    const totalValue = await Quotation.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const monthlyStats = await Quotation.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          total: { $sum: '$total' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ]);

    res.json({
      counts: {
        total: totalQuotations,
        pending: pendingQuotations,
        approved: approvedQuotations,
        rejected: rejectedQuotations
      },
      totalApprovedValue: totalValue[0]?.total || 0,
      monthlyStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
  }
};