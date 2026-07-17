/**
 * Email Service — Microsoft Graph API
 *
 * Production guarantees:
 *  - Token mutex: concurrent callers share one refresh, never fire duplicates
 *  - Retry: up to 3 attempts with exponential backoff (2s → 4s)
 *  - 429 Retry-After: honours Microsoft's rate-limit header when present
 *  - Timeouts: 15 s for token fetch, 30 s for send
 *  - Never throws: all errors are caught, logged with full context, and returned
 *  - Structured logging: every event goes through Winston at the right level
 *
 * Required env vars:
 *   AZURE_TENANT_ID      Azure AD tenant ID
 *   AZURE_CLIENT_ID      App registration client ID
 *   AZURE_CLIENT_SECRET  App registration client secret value (NOT the Secret ID)
 *   GRAPH_SENDER_EMAIL   Licensed mailbox that sends (e.g. notifications@domain.com)
 *   SMTP_FROM_NAME       Display name shown to recipients
 *   FRONTEND_URL         Base URL of the React app (e.g. http://13.234.239.26)
 */

'use strict';

const axios  = require('axios');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Token cache + mutex
// The mutex (_tokenRefreshPromise) ensures that if N concurrent callers all
// see an expired token at the same moment, only ONE HTTP request goes to Azure.
// The other N-1 await the same Promise and all get the same fresh token.
// ─────────────────────────────────────────────────────────────────────────────

let _tokenCache          = null;   // { token: string, expiresAt: number }
let _tokenRefreshPromise = null;   // Promise<string> | null

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }

  // Mutex: piggyback on an in-flight refresh instead of starting another
  if (_tokenRefreshPromise) return _tokenRefreshPromise;

  _tokenRefreshPromise = (async () => {
    const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
    const resp = await axios.post(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
      }
    );
    _tokenCache = {
      token:     resp.data.access_token,
      expiresAt: Date.now() + resp.data.expires_in * 1000,
    };
    logger.debug('[Email] OAuth2 token refreshed', {
      expiresIn: resp.data.expires_in,
    });
    return _tokenCache.token;
  })().finally(() => {
    _tokenRefreshPromise = null;
  });

  return _tokenRefreshPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send with retry + exponential backoff
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS  = 3;
const BASE_DELAY_MS = 2_000; // 2 s → 4 s

/**
 * Returns true for errors that are worth retrying:
 *   - No HTTP response (network timeout, DNS failure)
 *   - 429 Too Many Requests (Graph API rate limit)
 *   - 5xx Server Error from Microsoft
 *
 * Returns false for errors that will never succeed on retry:
 *   - 400 Bad Request (malformed payload)
 *   - 401 Unauthorized (bad credentials)
 *   - 403 Forbidden (missing Mail.Send permission)
 */
function isRetryable(err) {
  if (!err.response) return true;           // network error
  const s = err.response.status;
  return s === 429 || s >= 500;
}

/**
 * Respect the Retry-After header Microsoft sends on 429 responses.
 * Falls back to exponential backoff if the header is absent.
 */
function retryDelay(err, attempt) {
  const retryAfter = err.response?.headers?.['retry-after'];
  if (retryAfter) {
    const secs = parseInt(retryAfter, 10);
    if (!isNaN(secs)) return secs * 1000;
  }
  return BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s
}

async function sendWithRetry(toList, subject, html, attempt = 1) {
  const { GRAPH_SENDER_EMAIL, SMTP_FROM_NAME } = process.env;

  try {
    const token = await getAccessToken();

    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_SENDER_EMAIL}/sendMail`,
      {
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: toList.map(addr => ({ emailAddress: { address: addr } })),
          from: {
            emailAddress: {
              address: GRAPH_SENDER_EMAIL,
              name:    SMTP_FROM_NAME || 'Quotation System',
            },
          },
        },
        saveToSentItems: false,
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );

    logger.info('[Email] Sent successfully', {
      to: toList,
      subject,
      attempt,
    });

    return { success: true };

  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;

    if (isRetryable(err) && attempt < MAX_ATTEMPTS) {
      const delay = retryDelay(err, attempt);
      logger.warn('[Email] Send failed — will retry', {
        to:      toList,
        subject,
        attempt,
        status,
        error:   detail,
        retryIn: `${delay}ms`,
      });

      // Invalidate the cached token on 401 so the next attempt fetches a fresh one
      if (status === 401) _tokenCache = null;

      await new Promise(r => setTimeout(r, delay));
      return sendWithRetry(toList, subject, html, attempt + 1);
    }

    logger.error('[Email] Permanently failed', {
      to:       toList,
      subject,
      attempts: attempt,
      status,
      error:    detail,
    });

    return { success: false, error: detail };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public dispatch — validates config & recipients, then fire-and-forget.
// Never throws. Caller does NOT need .catch().
// ─────────────────────────────────────────────────────────────────────────────

function dispatch(to, subject, html) {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, GRAPH_SENDER_EMAIL } = process.env;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !GRAPH_SENDER_EMAIL) {
    logger.warn('[Email] Skipped — Graph API credentials not configured', { subject });
    return;
  }

  const toList = (Array.isArray(to) ? to : [to]).filter(
    addr => typeof addr === 'string' && addr.includes('@')
  );

  if (!toList.length) {
    logger.warn('[Email] Skipped — no valid recipients', { subject });
    return;
  }

  logger.info('[Email] Dispatching', { to: toList, subject });

  // Fire and forget — errors are handled and logged inside sendWithRetry
  sendWithRetry(toList, subject, html).catch(unexpectedErr => {
    logger.error('[Email] Unexpected error in sendWithRetry', {
      error: unexpectedErr.message,
      subject,
      to: toList,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function quotationUrl(quotationId, action, forRole) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = `${base}/quotation/${String(quotationId)}`;
  if (!action) return url;
  const params = new URLSearchParams({ action });
  if (forRole) params.set('for', forRole);
  return `${url}?${params.toString()}`;
}

const baseStyle   = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;`;
const bodyStyle   = `padding:32px;background:#f8fafc;`;
const labelStyle  = `color:#64748b;font-size:13px;margin:0;`;
const valueStyle  = `color:#1e293b;font-size:15px;font-weight:600;margin:4px 0 16px;`;
const footerStyle = `padding:16px 32px;background:#e2e8f0;font-size:12px;color:#94a3b8;text-align:center;`;

function headerBlock(text, color) {
  return `<div style="background:${color};color:#fff;padding:24px 32px;">
    <h2 style="margin:0;font-size:20px;">${esc(text)}</h2>
  </div>`;
}

function infoRow(label, value) {
  return `<p style="${labelStyle}">${esc(label)}</p><p style="${valueStyle}">${esc(value) || '—'}</p>`;
}

function reasonBox(reason) {
  return `<div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin:16px 0;">
    <p style="margin:0;font-weight:600;color:#92400e;">Reason</p>
    <p style="margin:6px 0 0;color:#78350f;">${esc(reason)}</p>
  </div>`;
}

function actionButton(label, url, color) {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" target="_blank"
       style="display:inline-block;background:${color};color:#fff;text-decoration:none;
              padding:13px 32px;border-radius:6px;font-size:15px;font-weight:700;
              font-family:Arial,sans-serif;letter-spacing:0.3px;">
      ${esc(label)}
    </a>
  </div>
  <p style="text-align:center;font-size:12px;color:#94a3b8;margin:6px 0 0;">
    Or copy this link: <a href="${url}" style="color:#0C405A;word-break:break-all;">${url}</a>
  </p>`;
}

function emailWrapper(headerText, headerColor, bodyHtml) {
  return `<div style="${baseStyle}">
    ${headerBlock(headerText, headerColor)}
    <div style="${bodyStyle}">${bodyHtml}</div>
    <div style="${footerStyle}">This is an automated message from the Quotation Management System. Please do not reply to this email.</div>
  </div>`;
}

function formatAmount(quotation) {
  return `${esc(quotation.currency?.code || 'AED')} ${Number(quotation.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────────────────────────────────────

const emailService = {

  /** Submission confirmed → notify Creator their quotation is in the queue */
  submissionConfirmedToCreator(creatorEmail, quotation, isResubmission = false) {
    const subject = isResubmission
      ? `Quotation ${quotation.quotationNumber} — Revision Resubmitted Successfully`
      : `Quotation ${quotation.quotationNumber} — Submitted for Review`;
    const html = emailWrapper(
      isResubmission ? '🔄 Quotation Resubmitted' : '📤 Quotation Submitted',
      '#0C405A',
      `<p style="color:#1e293b;margin:0 0 20px;">
        ${isResubmission
          ? `Your revised quotation has been resubmitted successfully. The Operations Manager has been notified and will review it shortly.`
          : `Your quotation has been submitted successfully. The Operations Manager will review it and you will be notified once a decision is made.`
        }
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Status',           isResubmission ? 'Resubmitted — Pending Ops Review' : 'Submitted — Pending Ops Review')}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#0C405A')}`
    );
    dispatch(creatorEmail, subject, html);
  },

  /** Creator submitted (new OR resubmitted) → notify Ops Managers to review */
  creatorSubmittedNotifyOps(opsEmails, quotation, creatorName, isResubmission = false) {
    const subject = isResubmission
      ? `[Action Required] Quotation ${quotation.quotationNumber} — Revised & Resubmitted for Your Review`
      : `[Action Required] New Quotation ${quotation.quotationNumber} Awaiting Your Review`;
    const html = emailWrapper(
      isResubmission ? '🔄 Quotation Revised & Resubmitted' : '📋 New Quotation Awaiting Your Review',
      '#0C405A',
      `<p style="color:#1e293b;margin:0 0 20px;">
        ${isResubmission
          ? `Creator <strong>${esc(creatorName)}</strong> has revised and resubmitted the following quotation for your review.`
          : `Creator <strong>${esc(creatorName)}</strong> has submitted a new quotation that requires your review.`
        }
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Submitted By',     creatorName)}
      ${actionButton('Review Quotation', quotationUrl(quotation._id, 'review', 'ops_manager'), '#0C405A')}`
    );
    dispatch(opsEmails, subject, html);
  },

  /** Ops Manager approved → notify Creator that it moved to Admin */
  opsApprovedNotifyCreator(creatorEmail, quotation, opsManagerName) {
    const subject = `Quotation ${quotation.quotationNumber} — Passed Operations Review`;
    const html = emailWrapper(
      '✅ Operations Review Passed',
      '#059669',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Operations Manager <strong>${esc(opsManagerName)}</strong> has approved your quotation.
        It is now with Admin for final approval — no action needed from you at this stage.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Ops Approved By',  opsManagerName)}
      ${actionButton('View Quotation Status', quotationUrl(quotation._id), '#059669')}`
    );
    dispatch(creatorEmail, subject, html);
  },

  /** Ops Manager approved → notify Admins to take action */
  opsApprovedNotifyAdmins(adminEmails, quotation, opsManagerName) {
    const subject = `[Action Required] Quotation ${quotation.quotationNumber} Approved by Ops — Awaiting Your Review`;
    const html = emailWrapper(
      '📋 Quotation Pending Your Approval',
      '#0C405A',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Operations Manager <strong>${esc(opsManagerName)}</strong> has reviewed and approved the following quotation.
        It is now awaiting your final approval.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Ops Approved By',  opsManagerName)}
      ${actionButton('Review & Approve Quotation', quotationUrl(quotation._id, 'review', 'admin'), '#0C405A')}`
    );
    dispatch(adminEmails, subject, html);
  },

  /** Ops Manager returned for revision → notify Creator */
  opsRejectedNotifyCreator(creatorEmail, quotation, opsManagerName, reason) {
    const subject = `Quotation ${quotation.quotationNumber} — Revision Requested by Operations Manager`;
    const html = emailWrapper(
      '↩️ Revision Requested',
      '#b45309',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Your quotation has been returned by Operations Manager <strong>${esc(opsManagerName)}</strong> for revision.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${reasonBox(reason)}
      ${actionButton('Open & Revise Quotation', quotationUrl(quotation._id), '#b45309')}`
    );
    dispatch(creatorEmail, subject, html);
  },

  /** Admin approved → notify Creator */
  adminApprovedNotifyCreator(creatorEmail, quotation, adminName) {
    const subject = `✅ Quotation ${quotation.quotationNumber} Has Been Approved`;
    const html = emailWrapper(
      '✅ Quotation Approved',
      '#065f46',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Great news! Your quotation has been fully approved by Admin <strong>${esc(adminName)}</strong>.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Approved By',      adminName)}
      ${actionButton('View Approved Quotation', quotationUrl(quotation._id), '#065f46')}`
    );
    dispatch(creatorEmail, subject, html);
  },

  /** Admin rejected → notify Creator */
  adminRejectedNotifyCreator(creatorEmail, quotation, adminName, reason) {
    const subject = `Quotation ${quotation.quotationNumber} — Rejected by Admin`;
    const html = emailWrapper(
      '❌ Quotation Rejected',
      '#991b1b',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Your quotation has been rejected by Admin <strong>${esc(adminName)}</strong>.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${reasonBox(reason)}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#991b1b')}`
    );
    dispatch(creatorEmail, subject, html);
  },

  /** Quotation awarded → notify Creator, Admins & Ops Managers */
  quotationAwardedNotifyAll(allEmails, quotation, markedByName) {
    const subject = `🏆 Quotation ${quotation.quotationNumber} Has Been Awarded!`;
    const html = emailWrapper(
      '🏆 Quotation Awarded',
      '#1d4ed8',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Quotation <strong>${esc(quotation.quotationNumber)}</strong> has been marked as
        <strong>Awarded</strong> by ${esc(markedByName)}.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${quotation.awardNote ? infoRow('Award Note', quotation.awardNote) : ''}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#1d4ed8')}`
    );
    dispatch(allEmails, subject, html);
  },

  /** Quotation not awarded → notify Creator, Admins & Ops Managers */
  quotationNotAwardedNotifyAll(allEmails, quotation, markedByName) {
    const subject = `Quotation ${quotation.quotationNumber} — Marked as Not Awarded`;
    const html = emailWrapper(
      '📋 Quotation Not Awarded',
      '#475569',
      `<p style="color:#1e293b;margin:0 0 20px;">
        Quotation <strong>${esc(quotation.quotationNumber)}</strong> has been marked as
        <strong>Not Awarded</strong> by ${esc(markedByName)}.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${quotation.awardNote ? infoRow('Note', quotation.awardNote) : ''}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#475569')}`
    );
    dispatch(allEmails, subject, html);
  },

  /** Admin approved → also notify the Ops Manager who reviewed it */
  adminApprovedNotifyOpsManager(opsEmail, quotation, adminName) {
    const subject = `Quotation ${quotation.quotationNumber} — Approved by Admin`;
    const html = emailWrapper(
      '✅ Quotation Approved by Admin',
      '#065f46',
      `<p style="color:#1e293b;margin:0 0 20px;">
        The quotation you reviewed has been fully approved by Admin <strong>${esc(adminName)}</strong>.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${infoRow('Total',            formatAmount(quotation))}
      ${infoRow('Approved By',      adminName)}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#065f46')}`
    );
    dispatch(opsEmail, subject, html);
  },

  /** Admin rejected → also notify the Ops Manager who reviewed it */
  adminRejectedNotifyOpsManager(opsEmail, quotation, adminName, reason) {
    const subject = `Quotation ${quotation.quotationNumber} — Rejected by Admin`;
    const html = emailWrapper(
      '❌ Quotation Rejected by Admin',
      '#991b1b',
      `<p style="color:#1e293b;margin:0 0 20px;">
        The quotation you reviewed has been rejected by Admin <strong>${esc(adminName)}</strong>.
      </p>
      ${infoRow('Quotation Number', quotation.quotationNumber)}
      ${infoRow('Project',          quotation.projectName)}
      ${infoRow('Customer',         quotation.customerSnapshot?.name)}
      ${reasonBox(reason)}
      ${actionButton('View Quotation', quotationUrl(quotation._id), '#991b1b')}`
    );
    dispatch(opsEmail, subject, html);
  },
};

module.exports = emailService;
