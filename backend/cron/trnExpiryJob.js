// cron/trnExpiryJob.js
//
// Daily job: find customers whose trnExpiryDate has passed and are still active,
// mark them inactive locally AND in Zoho Books. Runs once per day.
//
// Wire it up in your server entrypoint with:
//   require('./cron/trnExpiryJob').start();

const cron = require('node-cron');
const { Customer } = require('../models/customer');
const Company = require('../models/company');
const zohoBooksService = require('../zoho/customerServices');
const logger = require('../config/logger');

// Process Zoho calls in small batches to respect rate limits
const ZOHO_BATCH_SIZE = 5;
const ZOHO_BATCH_DELAY_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Core routine — exported separately so it can be invoked manually
 * (e.g. from an admin endpoint or a test) without the scheduler.
 */
async function runTrnExpiryDeactivation() {
  const startTime = Date.now();
  const now = new Date();

  logger.info('TRN expiry job: starting', { timestamp: now.toISOString() });

  // Find active customers whose TRN expiry has passed.
  // trnExpiryDate must exist, be non-null, and be strictly in the past.
  const expiredCustomers = await Customer.find({
    isActive: true,
    trnExpiryDate: { $ne: null, $lte: now },
  })
    .select('_id name companyId zohoId zohoSynced trnExpiryDate')
    .lean();

  if (expiredCustomers.length === 0) {
    logger.info('TRN expiry job: no expired customers found', {
      durationMs: Date.now() - startTime,
    });
    return { success: true, processed: 0, deactivated: 0, zohoErrors: 0 };
  }

  logger.info(`TRN expiry job: ${expiredCustomers.length} customer(s) with expired TRN`, {
    count: expiredCustomers.length,
  });

  // Group customers by company so we can set the Zoho org context once per company.
  const byCompany = new Map();
  for (const c of expiredCustomers) {
    const key = String(c.companyId);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(c);
  }

  let deactivated = 0;
  let zohoErrors = 0;
  let localErrors = 0;

  for (const [companyId, customers] of byCompany.entries()) {
    let company = null;
    try {
      company = await Company.findById(companyId).select('_id code name zohoOrganizationId');
    } catch (err) {
      logger.error(`TRN expiry job: failed to load company ${companyId}: ${err.message}`);
    }

    const zohoEnabled = !!company?.zohoOrganizationId;
    if (zohoEnabled) {
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    } else {
      logger.warn(
        `TRN expiry job: company ${companyId} has no Zoho org id — deactivating locally only`,
        { companyId, count: customers.length }
      );
    }

    // Process in batches to stay within Zoho rate limits.
    for (let i = 0; i < customers.length; i += ZOHO_BATCH_SIZE) {
      const batch = customers.slice(i, i + ZOHO_BATCH_SIZE);

      await Promise.all(
        batch.map(async (customer) => {
          // 1) Deactivate in Zoho first (only if it has a zohoId and the company is wired up).
          //    If Zoho fails, we DON'T flip the local flag, so the next run retries it.
          if (zohoEnabled && customer.zohoId) {
            try {
              const zohoResult = await zohoBooksService.markContactInactive(customer.zohoId);
              if (!zohoResult.success) {
                zohoErrors++;
                logger.error(
                  `TRN expiry job: Zoho deactivation failed for ${customer.name}`,
                  { customerId: customer._id, zohoId: customer.zohoId, error: zohoResult.error }
                );
                return; // skip local update so it retries next run
              }
            } catch (err) {
              zohoErrors++;
              logger.error(
                `TRN expiry job: Zoho deactivation threw for ${customer.name}: ${err.message}`,
                { customerId: customer._id, zohoId: customer.zohoId }
              );
              return; // skip local update
            }
          }

          // 2) Mark inactive locally.
          try {
            await Customer.updateOne(
              { _id: customer._id },
              {
                $set: {
                  isActive: false,
                  trnExpiredDeactivatedAt: new Date(),
                },
              }
            );
            deactivated++;
            logger.info(`TRN expiry job: deactivated ${customer.name}`, {
              customerId: customer._id,
              companyId,
              trnExpiryDate: customer.trnExpiryDate,
              zoho: zohoEnabled && customer.zohoId ? 'deactivated' : 'skipped',
            });
          } catch (err) {
            localErrors++;
            logger.error(
              `TRN expiry job: local deactivation failed for ${customer.name}: ${err.message}`,
              { customerId: customer._id }
            );
          }
        })
      );

      if (i + ZOHO_BATCH_SIZE < customers.length) await sleep(ZOHO_BATCH_DELAY_MS);
    }
  }

  const summary = {
    processed: expiredCustomers.length,
    deactivated,
    zohoErrors,
    localErrors,
    durationMs: Date.now() - startTime,
  };
  logger.info('TRN expiry job: completed', summary);
  return { success: true, ...summary };
}

let scheduledTask = null;

/**
 * Start the daily scheduler. Default: 02:15 every day, server timezone.
 * Pass a cron expression to override.
 */
function start(cronExpression = '15 16 * * *') {
    if (scheduledTask) {
      logger.warn('TRN expiry job: scheduler already started');
      return scheduledTask;
    }
  
    scheduledTask = cron.schedule(cronExpression, async () => {
      try {
        await runTrnExpiryDeactivation();
      } catch (err) {
        logger.error(`TRN expiry job: unhandled error: ${err.message}`, {
          stack: err.stack
        });
      }
    });
  
    logger.info(`TRN expiry job: scheduled (${cronExpression})`);
    return scheduledTask;
  }

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('TRN expiry job: stopped');
  }
}

module.exports = { start, stop, runTrnExpiryDeactivation };