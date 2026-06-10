// cron/trnExpiryJob.js
//
// Daily job: find customers whose trnExpiryDate has passed and are still active,
// mark them inactive locally AND in Zoho Books. Runs once per day.

const cron = require('node-cron');
const { Customer } = require('../models/customer');
const Company = require('../models/company');
const zohoBooksService = require('../zoho/customerServices');
const logger = require('../config/logger');

const ZOHO_BATCH_SIZE = 5;
const ZOHO_BATCH_DELAY_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTrnExpiryDeactivation() {
  const startTime = Date.now();
  const now = new Date();

  logger.info('TRN expiry job: starting', { timestamp: now.toISOString() });

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

      // Warm the access token ONCE up front. Without this, the parallel batch
      // below all see an invalid token at the same instant and race to refresh
      // it — but only one refresh is allowed per minute (the service's
      // _canRefresh guard), so the losers fail with "Rate limited... wait 60s".
      // Doing the single refresh here means every batched call finds a valid
      // token and none of them tries to refresh.
      try {
        await zohoBooksService.getValidAccessToken();
      } catch (err) {
        logger.warn(
          `TRN expiry job: token warm-up failed for company ${companyId}: ${err.message}`,
          { companyId }
        );
      }
    } else {
      logger.warn(
        `TRN expiry job: company ${companyId} has no Zoho org id — deactivating locally only`,
        { companyId, count: customers.length }
      );
    }

    for (let i = 0; i < customers.length; i += ZOHO_BATCH_SIZE) {
      const batch = customers.slice(i, i + ZOHO_BATCH_SIZE);

      await Promise.all(
        batch.map(async (customer) => {
          if (zohoEnabled && customer.zohoId) {
            try {
              const zohoResult = await zohoBooksService.markContactInactive(customer.zohoId);
              if (!zohoResult.success) {
                zohoErrors++;
                logger.error(
                  `TRN expiry job: Zoho deactivation failed for ${customer.name}`,
                  { customerId: customer._id, zohoId: customer.zohoId, error: zohoResult.error }
                );
                return;
              }
            } catch (err) {
              zohoErrors++;
              logger.error(
                `TRN expiry job: Zoho deactivation threw for ${customer.name}: ${err.message}`,
                { customerId: customer._id, zohoId: customer.zohoId }
              );
              return;
            }
          }

          try {
            await Customer.updateOne(
              { _id: customer._id },
              { $set: { isActive: false, trnExpiredDeactivatedAt: new Date() } }
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

function start(cronExpression = '0 2 * * *') {
  if (scheduledTask) {
    logger.warn('TRN expiry job: scheduler already started');
    return scheduledTask;
  }

  scheduledTask = cron.schedule(cronExpression, async () => {
    try {
      await runTrnExpiryDeactivation();
    } catch (err) {
      logger.error(`TRN expiry job: unhandled error: ${err.message}`, { stack: err.stack });
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