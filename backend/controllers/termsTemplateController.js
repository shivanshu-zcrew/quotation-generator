const mongoose = require('mongoose');
const TermsTemplate = require('../models/termsTemplate');
const { sanitizeTerms } = require('../utils/sanitizeTerms');
const logger = require('../config/logger');

const MAX_NAME_LENGTH = 100;

// Quill's empty-editor output is "<p><br></p>" — not an empty string, so a
// plain truthiness/length check on the raw HTML would treat it as "has
// content". Strip tags to check for real visible text (same heuristic
// TermsCondition.jsx uses on the frontend).
const stripTags = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

const sendErrorResponse = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

// GET /api/terms-templates — global, not scoped to whichever company is
// currently selected: a template saved under any company is visible to
// every company.
exports.getAllTermsTemplates = async (req, res) => {
  try {
    const templates = await TermsTemplate.find({})
      .sort({ name: 1 })
      .select('_id name content createdAt updatedAt')
      .lean();

    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    logger.error(`Get terms templates error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to fetch terms templates');
  }
};

// POST /api/terms-templates — global; saved once and shared by every
// company, not just the one selected at save time.
exports.createTermsTemplate = async (req, res) => {
  try {
    const { name, content } = req.body;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return sendErrorResponse(res, 400, 'Template name is required');
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return sendErrorResponse(res, 400, `Template name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }

    const sanitizedContent = sanitizeTerms(content || '');
    if (stripTags(sanitizedContent).length === 0) {
      return sendErrorResponse(res, 400, 'Template content cannot be empty');
    }

    // companyId is recorded on first creation purely for reference — it is
    // never used to scope reads/writes, so it's fine to omit when not
    // resolvable (e.g. "All Companies" selected).
    const rawCompanyId = req.body.companyId || req.headers['x-company-id'] || req.query.companyId;
    const companyId = mongoose.Types.ObjectId.isValid(rawCompanyId) ? rawCompanyId : undefined;

    const template = await TermsTemplate.create({
      name: trimmedName,
      content: sanitizedContent,
      createdBy: req.user._id,
      createdByName: req.user.name || req.user.email || '',
      ...(companyId && { companyId }),
    });

    return res.status(201).json({ success: true, message: 'Template saved', data: template });
  } catch (error) {
    if (error.code === 11000) {
      return sendErrorResponse(res, 409, 'A template with this name already exists');
    }
    logger.error(`Create terms template error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to save terms template');
  }
};

// DELETE /api/terms-templates/:id — global; removes a shared saved template
// for every company, not just the requester's currently selected one.
exports.deleteTermsTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendErrorResponse(res, 400, 'Invalid template ID');
    }

    const deleted = await TermsTemplate.findOneAndDelete({ _id: id });
    if (!deleted) {
      return sendErrorResponse(res, 404, 'Template not found');
    }

    return res.status(200).json({ success: true, message: 'Template removed' });
  } catch (error) {
    logger.error(`Delete terms template error: ${error.message}`);
    return sendErrorResponse(res, 500, 'Failed to remove terms template');
  }
};
