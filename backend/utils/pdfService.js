// Puppeteer-backed PDF rendering: one shared Chromium, a concurrency cap, a
// hard deadline on every stage, and a single transparent retry on a fresh
// page (and a fresh browser when the old one looks unhealthy).
//
// Why every await below is wrapped in a timeout: Puppeteer's own timeouts only
// cover some calls (page.pdf, setContent), and a wedged renderer can leave
// page.close() / page.evaluate() / browser.newPage() pending until
// `protocolTimeout` (180s by default). Any one of those would hold a PDF slot
// and the user's request open far past the frontend's 120s limit.

const fs = require('fs');
const puppeteer = require('puppeteer');
const defaultLogger = require('../config/logger');
const { PDF_PAGE_MARGIN_MM, PAGE_CONTENT_WIDTH_PX } = require('./pdfPaginator');

const intEnv = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

class StageTimeoutError extends Error {
  constructor(stage, ms) {
    super(`PDF stage "${stage}" timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.stage = stage;
  }
}

class PdfGenerationError extends Error {
  constructor(message, { status = 500, cause, requestId, attempts } = {}) {
    super(message);
    this.name = 'PdfGenerationError';
    this.status = status;
    this.cause = cause;
    this.requestId = requestId;
    this.attempts = attempts;
  }
}

function withTimeout(promise, ms, stage) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new StageTimeoutError(stage, ms)), ms); });
  // Promise.race keeps a handler on `promise`, so a late rejection after the
  // timeout wins is not reported as unhandled.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Errors meaning "this Chromium/page is gone or wedged" rather than "this
// document is bad" — the browser is replaced before retrying.
const BROWSER_FAULT_RE = /target closed|session closed|connection closed|protocol error|browser has disconnected|detached|crashed|not connected/i;

// CHROMIUM_PATH wins; otherwise the Docker image's system Chromium; otherwise
// (local dev on macOS/Windows, where that path doesn't exist) undefined, so
// Puppeteer uses the Chrome it downloaded itself (`npx puppeteer browsers install chrome`).
function resolveChromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
}

function defaultLaunch(cfg) {
  return puppeteer.launch({
    headless: true,
    executablePath: resolveChromePath(),
    // Puppeteer's default protocolTimeout is 180s; any CDP call to a wedged
    // renderer would otherwise block that long.
    protocolTimeout: cfg.protocolTimeoutMs,
    // --single-process/--no-zygote stay off: a hung render must stay
    // contained to its own tab (see git history: 67daf23).
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

function createPdfService({ launch, logger = defaultLogger, config = {} } = {}) {
  const cfg = {
    maxConcurrent: intEnv('PDF_MAX_CONCURRENT', 3),
    maxQueue: intEnv('PDF_MAX_QUEUE', 50),
    queueTimeoutMs: intEnv('PDF_QUEUE_TIMEOUT_MS', 20_000),
    maxAttempts: 2, // one retry, deliberately not configurable
    attemptTimeoutMs: intEnv('PDF_ATTEMPT_TIMEOUT_MS', 35_000),
    launchTimeoutMs: intEnv('PDF_LAUNCH_TIMEOUT_MS', 20_000),
    newPageTimeoutMs: 10_000,
    setContentTimeoutMs: 20_000,
    imagesTimeoutMs: 10_000,
    pdfTimeoutMs: 30_000,
    closeTimeoutMs: 5_000,
    retireGraceMs: 60_000,
    protocolTimeoutMs: 30_000,
    ...config,
  };
  const doLaunch = launch || (() => defaultLaunch(cfg));

  // ── concurrency limit ────────────────────────────────────────────────
  let active = 0;
  const queue = [];

  function acquireSlot() {
    return new Promise((resolve, reject) => {
      if (active < cfg.maxConcurrent) { active++; return resolve(); }
      if (queue.length >= cfg.maxQueue) {
        return reject(new PdfGenerationError('PDF generation queue is full', { status: 503 }));
      }
      const entry = { resolve, reject };
      entry.timer = setTimeout(() => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
        reject(new PdfGenerationError('PDF generation is busy, please retry shortly', { status: 503 }));
      }, cfg.queueTimeoutMs);
      queue.push(entry);
    });
  }

  function releaseSlot() {
    const next = queue.shift();
    if (next) { clearTimeout(next.timer); next.resolve(); } else active--;
  }

  // ── shared browser ───────────────────────────────────────────────────
  // entry = { id, browser, pages (in flight), retired }
  let current = null;
  let launching = null;
  let seq = 0;

  // Resolves once the browser is closed (or SIGKILLed after closeTimeoutMs).
  function killBrowser(entry) {
    const killTimer = setTimeout(() => {
      try { entry.browser.process()?.kill('SIGKILL'); } catch { /* already gone */ }
    }, cfg.closeTimeoutMs);
    return Promise.resolve()
      .then(() => entry.browser.close())
      .then(() => clearTimeout(killTimer))
      .catch(() => {}); // the SIGKILL timer is the fallback
  }

  // Stop handing this browser to new requests. Pages already running on it
  // are left to finish (another request may be mid-render); it is closed as
  // soon as the last one is done, or after a grace period regardless.
  function retire(entry, reason) {
    if (entry.retired) return;
    entry.retired = true;
    if (current === entry) current = null;
    logger.warn('Retiring Puppeteer browser', { browserId: entry.id, reason, inFlightPages: entry.pages });
    if (entry.pages === 0) return killBrowser(entry);
    setTimeout(() => killBrowser(entry), cfg.retireGraceMs).unref?.();
  }

  function acquireBrowser() {
    if (current && !current.retired && current.browser.isConnected()) return Promise.resolve(current);
    // Single-flight: concurrent requests must share one launch, not each
    // start (and then orphan) their own Chromium.
    if (!launching) {
      const started = Date.now();
      launching = withTimeout(
        Promise.resolve(doLaunch()).then((browser) => {
          const entry = { id: ++seq, browser, pages: 0, retired: false };
          browser.on('disconnected', () => {
            entry.retired = true;
            if (current === entry) current = null;
            logger.warn('Puppeteer browser disconnected', { browserId: entry.id });
          });
          current = entry;
          logger.info('Puppeteer browser launched', { browserId: entry.id, launchMs: Date.now() - started });
          return entry;
        }),
        cfg.launchTimeoutMs,
        'browserLaunch'
      ).finally(() => { launching = null; });
    }
    return launching;
  }

  // ── one render attempt ───────────────────────────────────────────────
  async function renderOnce(entry, html, ctx) {
    const { timings } = ctx;
    const deadline = Date.now() + cfg.attemptTimeoutMs;
    // Runs `fn` under min(stage cap, time left in this attempt).
    const stage = async (name, fn, capMs) => {
      const left = deadline - Date.now();
      if (left <= 0) throw new StageTimeoutError(name, cfg.attemptTimeoutMs);
      const t = Date.now();
      ctx.stage = name;
      try { return await withTimeout(fn(), Math.min(capMs, left), name); }
      finally { timings[`${name}Ms`] = Date.now() - t; }
    };

    let page;
    entry.pages++;
    try {
      page = await stage('newPage', () => entry.browser.newPage(), cfg.newPageTimeoutMs);

      await stage('pageSetup', async () => {
        // Pinned to the real A4 print content width (see pdfPaginator.js).
        await page.setViewport({ width: PAGE_CONTENT_WIDTH_PX, height: 1200, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const type = req.resourceType();
          // The template embeds images only as data: URIs; `html` is client
          // supplied, so block every other fetch/navigation (SSRF) — which
          // also guarantees no external resource can stay pending.
          if (type === 'image') {
            if (!req.url().startsWith('data:')) { req.abort(); return; }
            req.continue();
            return;
          }
          if (['stylesheet', 'font', 'media', 'script', 'fetch', 'xhr', 'websocket', 'other', 'document'].includes(type)) { req.abort(); return; }
          req.continue();
        });
      }, cfg.newPageTimeoutMs);

      await stage('setContent', () => page.setContent(html, { waitUntil: 'domcontentloaded', timeout: cfg.setContentTimeoutMs }), cfg.setContentTimeoutMs + 2_000);

      // Best effort: a slow/odd image must not fail the PDF, so this stage's
      // own timeout is swallowed (the 'pdf' stage below is the real check on
      // page health). loading=lazy images off-screen never load in a
      // detached print page, so force eager; and re-check `complete` after
      // attaching listeners so an image finishing in between can't leave
      // the promise pending forever.
      const imgMs = cfg.imagesTimeoutMs;
      await stage('images', () => page.evaluate((maxMs) => {
        const pending = [...document.images].map((img) => {
          img.loading = 'eager';
          if (img.complete) return null;
          return new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
            if (img.complete) res();
          });
        }).filter(Boolean);
        return Promise.race([Promise.all(pending), new Promise((res) => setTimeout(res, maxMs))]);
      }, imgMs - 1_000), imgMs).catch((err) => {
        if (!(err instanceof StageTimeoutError)) throw err;
        logger.warn('PDF image wait timed out; continuing', { requestId: ctx.requestId });
      });

      const m = `${PDF_PAGE_MARGIN_MM}mm`;
      const pdf = await stage('pdf', () => page.pdf({
        format: 'A4', printBackground: true, timeout: cfg.pdfTimeoutMs,
        margin: { top: m, right: m, bottom: m, left: m },
      }), cfg.pdfTimeoutMs + 2_000);

      const buffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
      if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Puppeteer returned an invalid PDF buffer');
      return buffer;
    } finally {
      if (page) {
        const t = Date.now();
        try { await withTimeout(page.close(), cfg.closeTimeoutMs, 'pageClose'); }
        catch (closeErr) {
          ctx.pageCloseFailed = true;
          logger.warn('Puppeteer page.close() failed', { requestId: ctx.requestId, error: closeErr.message });
        }
        timings.pageCloseMs = Date.now() - t;
      }
      entry.pages--;
    }
  }

  // ── public API ───────────────────────────────────────────────────────
  async function generate({ html, filename, requestId }) {
    const t0 = Date.now();
    const base = { requestId, filename, htmlLength: html.length };
    logger.info('PDF generation started', base);

    await acquireSlot(); // rejects with a 503-tagged PdfGenerationError
    const queueMs = Date.now() - t0;
    let lastErr;
    let recovered = false;
    try {
      for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        const ctx = { requestId, timings: {}, stage: 'browserAcquire', pageCloseFailed: false };
        let entry;
        const tAttempt = Date.now();
        try {
          entry = await acquireBrowser();
          const buffer = await renderOnce(entry, html, ctx);
          logger.info('PDF generation succeeded', {
            ...base, attempt, recovered, queueMs, ...ctx.timings, browserId: entry.id,
            pdfBytes: buffer.length, totalMs: Date.now() - t0,
          });
          return { buffer, attempts: attempt, recovered };
        } catch (err) {
          lastErr = err;
          const unhealthy = ctx.pageCloseFailed
            || err.name === 'TimeoutError'
            || BROWSER_FAULT_RE.test(err.message || '')
            || (entry && !entry.browser.isConnected());
          if (entry && unhealthy) { retire(entry, `${ctx.stage}: ${err.message}`); recovered = true; }
          const willRetry = attempt < cfg.maxAttempts;
          logger[willRetry ? 'warn' : 'error'](`PDF generation attempt ${attempt} failed`, {
            ...base, attempt, failedStage: ctx.stage, willRetry, browserRecovered: entry ? unhealthy : false,
            queueMs, attemptMs: Date.now() - tAttempt, ...ctx.timings, totalMs: Date.now() - t0,
            error: err.message, stack: err.stack,
          });
        }
      }
      throw new PdfGenerationError('Error generating PDF', { cause: lastErr, requestId, attempts: cfg.maxAttempts });
    } finally {
      releaseSlot();
    }
  }

  return {
    generate,
    // Start Chromium before the first user request instead of during it.
    warmUp: () => acquireBrowser().catch((e) => logger.warn(`Puppeteer warm-up failed: ${e.message}`)),
    getStats: () => ({
      activeSlots: active, maxSlots: cfg.maxConcurrent, queuedRequests: queue.length, maxQueue: cfg.maxQueue,
      browserConnected: !!(current && current.browser.isConnected()),
    }),
    shutdown: async () => {
      const entry = current; current = null;
      if (entry) { entry.retired = true; await killBrowser(entry); }
    },
  };
}

module.exports = { createPdfService, pdfService: createPdfService(), PdfGenerationError, StageTimeoutError };
