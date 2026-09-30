// Run: cd backend && npm run test:pdf
// Set CHROME_PATH (or CHROMIUM_PATH) to run the real-Chromium cases; the
// simulated-failure cases use a fake browser and need no Chrome.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { createPdfService } = require('../utils/pdfService');

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const chromePath = [process.env.CHROMIUM_PATH, process.env.CHROME_PATH, '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
const realTest = chromePath ? test : test.skip;
const FAST = { attemptTimeoutMs: 1500, newPageTimeoutMs: 500, setContentTimeoutMs: 500, imagesTimeoutMs: 1500, pdfTimeoutMs: 500, closeTimeoutMs: 300, launchTimeoutMs: 1000, queueTimeoutMs: 500, retireGraceMs: 200 };
const PDF = Buffer.from('%PDF-1.4 fake');
const never = () => new Promise(() => {});

// Fake Chromium. `script(pageNo)` returns overrides for that page's methods.
function fakeLauncher(script = () => ({})) {
  const state = { launches: 0, pages: 0, closedBrowsers: 0, openPages: 0, browsers: [] };
  const launch = async () => {
    state.launches++;
    let connected = true;
    const handlers = {};
    const b = {
      isConnected: () => connected,
      on: (e, f) => { handlers[e] = f; },
      close: async () => { connected = false; state.closedBrowsers++; handlers.disconnected?.(); },
      process: () => ({ kill() { connected = false; } }),
      newPage: async () => {
        const n = ++state.pages; state.openPages++;
        const o = script(n, state) || {};
        if (o.newPage) await o.newPage();
        return {
          setViewport: async () => {}, setRequestInterception: async () => {}, on() {},
          setContent: o.setContent || (async () => {}),
          evaluate: o.evaluate || (async () => {}),
          pdf: o.pdf || (async () => PDF),
          close: async () => { state.openPages--; if (o.close) await o.close(); },
        };
      },
    };
    state.browsers.push(b);
    return b;
  };
  return { launch, state };
}
const svc = (script, config) => { const f = fakeLauncher(script); return { ...f, s: createPdfService({ launch: f.launch, logger: silent, config: { ...FAST, ...config } }) }; };
const req = (html = '<p>x</p>') => ({ html, filename: 'Quotation_T_1', requestId: 'r' });

test('first attempt succeeds: no retry, no recovery', async () => {
  const { s, state } = svc();
  const r = await s.generate(req());
  assert.equal(r.attempts, 1); assert.equal(r.recovered, false); assert.equal(state.launches, 1);
});

test('simulated page.pdf() failure -> automatic retry succeeds', async () => {
  const { s } = svc((n) => (n === 1 ? { pdf: async () => { throw new Error('Protocol error: Page.printToPDF failed'); } } : {}));
  const r = await s.generate(req());
  assert.equal(r.attempts, 2); assert.equal(r.recovered, true);
});

test('simulated resource/setContent hang -> timeout, fresh browser, retry succeeds', async () => {
  const { s, state } = svc((n) => (n === 1 ? { setContent: never } : {}));
  const t = Date.now();
  const r = await s.generate(req());
  assert.equal(r.attempts, 2); assert.equal(state.launches, 2, 'hung browser replaced');
  assert.ok(Date.now() - t < 3000);
});

test('simulated hung image wait -> page.evaluate never returns -> bounded and recovered', async () => {
  // Image wait is best-effort: its timeout is swallowed, pdf still produced.
  const { s } = svc((n) => (n === 1 ? { evaluate: never } : {}), { attemptTimeoutMs: 4000, imagesTimeoutMs: 800 });
  const t = Date.now();
  const r = await s.generate(req());
  assert.equal(r.attempts, 1); assert.ok(Date.now() - t < 1500);
});

test('simulated page/Chromium crash (Target closed) -> retry on new browser', async () => {
  const { s, state } = svc((n) => (n === 1 ? { setContent: async () => { throw new Error('Protocol error: Target closed.'); } } : {}));
  const r = await s.generate(req());
  assert.equal(r.attempts, 2); assert.equal(state.launches, 2);
});

test('hung page.close() cannot block the request; browser is killed', async () => {
  const { s, state } = svc((n) => (n === 1 ? { pdf: async () => { throw new Error('boom'); }, close: never } : {}));
  const t = Date.now();
  const r = await s.generate(req());
  assert.equal(r.attempts, 2); assert.ok(Date.now() - t < 2500);
  await new Promise((r2) => setTimeout(r2, 300));
  assert.ok(state.closedBrowsers >= 1 || !state.browsers[0].isConnected());
});

test('two failures -> controlled error, exactly 2 attempts, no infinite loop', async () => {
  let calls = 0;
  const { s } = svc(() => ({ pdf: async () => { calls++; throw new Error('always'); } }));
  await assert.rejects(s.generate(req()), (e) => e.name === 'PdfGenerationError' && e.attempts === 2 && e.cause.message === 'always');
  assert.equal(calls, 2);
});

test('total time is hard-bounded when every stage hangs', async () => {
  const { s } = svc(() => ({ setContent: never, evaluate: never, pdf: never }));
  const t = Date.now();
  await assert.rejects(s.generate(req()));
  assert.ok(Date.now() - t < 2 * FAST.attemptTimeoutMs + 500, `took ${Date.now() - t}ms`);
});

test('service stays healthy after a stuck request; later requests succeed; slots released', async () => {
  const { s } = svc((n) => (n <= 2 ? { setContent: never } : {}));
  await assert.rejects(s.generate(req()));
  assert.deepEqual([s.getStats().activeSlots, s.getStats().queuedRequests], [0, 0]);
  assert.equal((await s.generate(req())).attempts, 1);
});

test('concurrency: capped at maxConcurrent, queue drains, single browser launch', async () => {
  let running = 0, peak = 0;
  const { s, state } = svc(() => ({ pdf: async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 100)); running--; return PDF; } }), { maxConcurrent: 2, queueTimeoutMs: 3000 });
  const rs = await Promise.all(Array.from({ length: 8 }, () => s.generate(req())));
  assert.equal(rs.length, 8); assert.equal(peak, 2); assert.equal(state.launches, 1, 'launch is single-flight');
});

test('queue full / queue timeout -> 503, does not run', async () => {
  const { s } = svc(() => ({ pdf: async () => { await new Promise((r) => setTimeout(r, 400)); return PDF; } }), { maxConcurrent: 1, maxQueue: 1, queueTimeoutMs: 100 });
  const results = await Promise.allSettled([s.generate(req()), s.generate(req()), s.generate(req())]);
  const statuses = results.map((r) => (r.status === 'fulfilled' ? 200 : r.reason.status));
  assert.deepEqual(statuses.sort(), [200, 503, 503]);
});

test('retiring a browser does not kill a sibling request mid-render', async () => {
  // req A hangs and gets retired; req B on the same browser must finish untouched.
  let bFinished = false;
  const { s, state } = svc((n) => (n === 1 ? { setContent: never } : n === 2 ? { pdf: async () => { await new Promise((r) => setTimeout(r, 700)); bFinished = state.browsers[0].isConnected(); return PDF; } } : {}), { maxConcurrent: 3, retireGraceMs: 5000 });
  const [a, b] = await Promise.all([s.generate(req()), s.generate(req())]);
  assert.equal(b.attempts, 1); assert.equal(bFinished, true); assert.equal(a.attempts, 2);
});

// ── Real Chromium ──────────────────────────────────────────────────────
const realSvc = () => createPdfService({ logger: silent, launch: () => puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox', '--disable-gpu'] }), config: { maxConcurrent: 3 } });
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const doc = (body) => `<!doctype html><html><body style="font-family:sans-serif">${body}</body></html>`;
const rows = (n) => Array.from({ length: n }, (_, i) => `<tr><td>${i}</td><td>Product ${i}</td><td>${(i * 3.14).toFixed(2)}</td></tr>`).join('');
const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

realTest('REAL: small, large, many-products, images, long T&C, long URLs, simultaneous, recovery', { timeout: 120000 }, async () => {
  const s = realSvc();
  try {
    const cases = {
      small: doc('<h1>Quotation</h1><p>Small</p>'),
      many: doc(`<table>${rows(600)}</table>`),
      images: doc(Array.from({ length: 40 }, () => `<img src="${PX}" width=50 height=50 loading="lazy">`).join('')
        + '<img src="http://10.255.255.1/never.png"><img src="https://example.invalid/x.png">'),
      terms: doc(Array.from({ length: 300 }, (_, i) => `<p>Clause ${i}: ${'lorem ipsum dolor sit amet '.repeat(20)}</p>`).join('')),
      longUrl: doc(`<p>Ref: ${'A'.repeat(4000)}</p><a href="https://x.test/${'segment/'.repeat(300)}">${'https://x.test/'.padEnd(2000, 'q')}</a><p style="word-break:break-all">${'REF-2026-'.repeat(200)}</p>`),
    };
    const out = {};
    for (const [k, html] of Object.entries(cases)) {
      const t = Date.now(); const r = await s.generate({ html, filename: k, requestId: k });
      out[k] = { ms: Date.now() - t, kb: Math.round(r.buffer.length / 1024), pages: pages(r.buffer), attempts: r.attempts };
      assert.equal(r.attempts, 1, `${k} needed a retry`);
    }
    console.log(out);
    assert.ok(out.many.pages > 3); assert.ok(out.terms.pages > 3);

    // simultaneous
    const t = Date.now();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => s.generate({ html: cases.many, filename: `c${i}`, requestId: `c${i}` })));
    console.log('10 simultaneous many-product PDFs:', Date.now() - t, 'ms');
    assert.ok(rs.every((r) => r.buffer.subarray(0, 5).toString() === '%PDF-'));
    assert.equal(s.getStats().activeSlots, 0);

    // kill the real Chromium underneath the service, then request again
    const before = s.getStats().browserConnected; assert.ok(before);
    await s.shutdown(); // browser closed underneath; next request must relaunch
    const r = await s.generate({ html: cases.small, filename: 'after', requestId: 'after' });
    assert.equal(r.attempts, 1);
  } finally { await s.shutdown(); }
});

realTest('REAL: browser killed mid-flight (SIGKILL) -> retry on fresh browser', { timeout: 60000 }, async () => {
  let first = true, proc;
  const s = createPdfService({ logger: silent, config: { attemptTimeoutMs: 20000, maxConcurrent: 3 }, launch: async () => {
    const b = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox', '--disable-gpu'] });
    if (first) { first = false; proc = b.process(); }
    return b;
  } });
  try {
    await s.generate({ html: doc('warm'), filename: 'w', requestId: 'w' }); // browser #1 up
    const p = s.generate({ html: doc(`<table>${rows(4000)}</table>`), filename: 'k', requestId: 'k' });
    setTimeout(() => proc.kill('SIGKILL'), 150);
    const r = await p;
    assert.equal(r.attempts, 2); assert.equal(r.recovered, true);
    assert.equal((await s.generate({ html: doc('after'), filename: 'a', requestId: 'a' })).attempts, 1);
  } finally { await s.shutdown(); }
});
