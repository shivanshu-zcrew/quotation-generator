const mongoose = require('mongoose');
const PaymentTerm = require('../models/paymentTerm');
const logger = require('../config/logger');

const MAX_VALUE_LENGTH = 200;

const sendErrorResponse = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

// GET /api/payment-terms — global, not scoped to whichever company is
// currently selected: a term saved under any company is visible to every
// company.
exports.getAllPaymentTerms = async (req, res) => {
  try {
    const terms = await PaymentTerm.find({})
      .sort({ value: 1 })
      .select('_id value createdAt')
      .lean();

    return res.status(200).json({ success: true, data: terms });
  } catch (error) {
    logger.error(`Get payment terms error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to fetch payment terms');
  }
};

// POST /api/payment-terms
// Find-or-create, global: this is called automatically every time a
// quotation is saved with a non-empty payment terms value, so reusing the
// same phrasing (from any company) must always succeed rather than
// erroring as a duplicate.
exports.createPaymentTerm = async (req, res) => {
  try {
    const { value } = req.body;

    const trimmedValue = (value || '').trim();
    if (!trimmedValue) {
      return sendErrorResponse(res, 400, 'Payment term value is required');
    }
    if (trimmedValue.length > MAX_VALUE_LENGTH) {
      return sendErrorResponse(res, 400, `Payment term must be ${MAX_VALUE_LENGTH} characters or fewer`);
    }

    // companyId is recorded on first creation purely for reference — it is
    // never used to scope reads/writes, so it's fine to omit when not
    // resolvable (e.g. "All Companies" selected).
    const rawCompanyId = req.body.companyId || req.headers['x-company-id'] || req.query.companyId;
    const companyId = mongoose.Types.ObjectId.isValid(rawCompanyId) ? rawCompanyId : undefined;

    const term = await PaymentTerm.findOneAndUpdate(
      { value: trimmedValue },
      { $setOnInsert: { value: trimmedValue, createdBy: req.user._id, ...(companyId && { companyId }) } },
      { upsert: true, new: true, collation: { locale: 'en', strength: 2 } }
    );

    return res.status(201).json({ success: true, data: term });
  } catch (error) {
    logger.error(`Create payment term error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to save payment term');
  }
};

// DELETE /api/payment-terms/:id — global; removes a shared saved term for
// every company, not just the requester's currently selected one.
exports.deletePaymentTerm = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse(res, 400, 'Invalid payment term ID');
    }

    const deleted = await PaymentTerm.findOneAndDelete({ _id: id });
    if (!deleted) {
      return sendErrorResponse(res, 404, 'Payment term not found');
    }

    return res.status(200).json({ success: true, message: 'Payment term removed' });
  } catch (error) {
    logger.error(`Delete payment term error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to remove payment term');
  }
};
