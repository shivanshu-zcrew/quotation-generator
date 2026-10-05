// Run: cd backend && CHROMIUM_PATH=/path/to/chrome npm run test:terms
//
// Regression test for the Terms & Conditions "live editor -> PDF" overflow:
// Quill's getSemanticHTML() writes every space as `&nbsp;`; the frontend
// sanitizer used to normalize non-breaking spaces only as the literal U+00A0
// character in the HTML *string*, so PDFs built from live editor state kept
// them and a justified paragraph became one unbreakable line.
//
// Uses the REAL Quill 2 and the REAL frontend sanitizeTermsHtml.js (bundled
// into Chrome with the frontend's own esbuild), the REAL backend sanitizer for
// the "saved quotation" path, the PDF template's REAL CSS (read out of
// pdfGenerator.js) and the REAL production pdfService for the actual PDF.
// Needs Chrome (skipped otherwise) and frontend/quotation/node_modules.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');
const { sanitizeTerms } = require('../utils/sanitizeTerms');
const { createPdfService } = require('../utils/pdfService');

const FRONTEND = path.resolve(__dirname, '../../frontend/quotation');
const chromePath = [process.env.CHROMIUM_PATH, process.env.CHROME_PATH, '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
const canRun = chromePath && fs.existsSync(path.join(FRONTEND, 'node_modules/esbuild'));
const silent = { info() {}, warn() {}, error() {}, debug() {} };

let browser; let page; let pdfSvc; let css; let bundle;
const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test.before(async () => {
  if (!canRun) return;
  // Bundle the real sanitizer + real Quill (with the app's style attributors) for the browser.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'terms-regress-'));
  const entry = path.join(tmp, 'entry.js');
  fs.writeFileSync(entry, `
    import * as S from ${JSON.stringify(path.join(FRONTEND, 'src/utils/sanitizeTermsHtml.js'))};
    import Quill from ${JSON.stringify(path.join(FRONTEND, 'node_modules/quill'))};
    // same style-attributor registration as src/utils/richTextConfig.js
    for (const k of ['align', 'font', 'size']) Quill.register(Quill.import('attributors/style/' + k), true);
    window.S = S; window.Quill = Quill;`);
  const { buildSync } = require(path.join(FRONTEND, 'node_modules/esbuild'));
  buildSync({ entryPoints: [entry], bundle: true, format: 'iife', outfile: path.join(tmp, 'out.js'), logLevel: 'silent', nodePaths: [path.join(FRONTEND, 'node_modules')] });
  bundle = fs.readFileSync(path.join(tmp, 'out.js'), 'utf8');
  // The PDF template's own <style> block (no copy of the CSS in this test).
  const src = fs.readFileSync(path.join(FRONTEND, 'src/utils/pdfGenerator.js'), 'utf8').split('\n');
  const s = src.findIndex((l, i) => i > 800 && l.includes('<style>'));
  const e = src.findIndex((l, i) => i > s && l.includes('</style>'));
  assert.ok(s > 0 && e > s, 'could not locate the PDF <style> block in pdfGenerator.js');
  css = src.slice(s + 1, e).join('\n').replace('${bodyFontFamily}', 'Arial, sans-serif');

  browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 718, height: 1200 });
  await page.setContent('<!doctype html><html><body><div id="ed"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  pdfSvc = createPdfService({ logger: silent, launch: () => puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] }) });
});
test.after(async () => { await browser?.close(); await pdfSvc?.shutdown(); });
const t = canRun ? test : test.skip;

// What react-quill-new hands to the app's onChange for pasted/typed content.
const liveEditorHtml = (pasted) => page.evaluate((h) => {
  const host = document.getElementById('ed'); host.innerHTML = '<div></div>';
  const q = new window.Quill(host.firstChild);
  q.clipboard.dangerouslyPasteHTML(h);
  return q.getSemanticHTML();
}, pasted);
const sanitizeFE = (html) => page.evaluate((h) => window.S.sanitizeTermsHtml(h), html);
// The backend sanitizer re-serializes inline styles ("color: red;" -> "color:red"); same meaning, so compare canonically.
const canon = (html) => html.replace(/style="([^"]*)"/g, (_, v) => `style="${v.split(';').map((d) => d.trim().replace(/\s*:\s*/, ':')).filter(Boolean).join(';')}"`);
const textOf = (html) => page.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; }, html);

// Layout + real PDF for a sanitized terms fragment.
async function renderChecks(sanitized, expectedWords) {
  const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="container"><div class="terms-content">${sanitized}</div></div></body></html>`;
  const p = await browser.newPage();
  await p.setViewport({ width: 718, height: 1200 });
  await p.setContent(doc);
  const overflow = await p.evaluate(() => {
    const tc = document.querySelector('.terms-content'); const box = tc.getBoundingClientRect(); let max = 0;
    const chk = (r) => { if (r.width && r.right - box.right > max) max = r.right - box.right; };
    tc.querySelectorAll('*').forEach((el) => chk(el.getBoundingClientRect()));
    const w = document.createTreeWalker(tc, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const r = document.createRange(); r.selectNodeContents(w.currentNode); [...r.getClientRects()].forEach(chk); }
    return Math.round(max);
  });
  await p.close();
  const { buffer } = await pdfSvc.generate({ html: doc, filename: 'terms-regress', requestId: 'terms-regress' });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  let missing = null;
  if (hasPdftotext && expectedWords) {
    const f = path.join(os.tmpdir(), `terms-regress-${process.pid}.pdf`);
    fs.writeFileSync(f, buffer);
    const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
    missing = expectedWords.filter((w) => !new RegExp(`${w}(?!\\d)`).test(txt));
  }
  return { overflow, missing };
}

const WORDS = Array.from({ length: 140 }, (_, i) => `word${i + 1}`);
const justified = `<p style="text-align: justify">${WORDS.join(' ')}</p>`;

t('precondition: Quill really emits &nbsp; for every space in live editor HTML', async () => {
  const html = await liveEditorHtml('<p>Hello brave new world</p>');
  assert.match(html, /Hello&nbsp;brave&nbsp;new&nbsp;world/);
});

t('live editor HTML: no non-breaking spaces survive sanitizeTermsHtml()', async () => {
  const live = await liveEditorHtml('<p>Hello brave new world</p>');
  const out = await sanitizeFE(live);
  assert.ok(!/&nbsp;| /.test(out), `non-breaking spaces left in: ${out}`);
  assert.equal(await textOf(out), 'Hello brave new world');
});

t('actual U+00A0 characters and &nbsp; entities are treated the same', async () => {
  const withEntity = await sanitizeFE('<p>one&nbsp;two&nbsp;three</p>');
  const withChar = await sanitizeFE('<p>one two three</p>');
  assert.equal(withEntity, withChar);
  assert.equal(await textOf(withEntity), 'one two three');
});

t('normal typed text is unchanged', async () => {
  const out = await sanitizeFE('<p>Payment within 30 days.</p>');
  assert.equal(out, '<p>Payment within 30 days.</p>');
});

t('intentional repeated spaces are still preserved (same as the saved-quotation path)', async () => {
  const live = await sanitizeFE('<p>a&nbsp;&nbsp;&nbsp;b</p>');
  const saved = await sanitizeFE(sanitizeTerms('<p>a&nbsp;&nbsp;&nbsp;b</p>'));
  assert.equal(live, saved);
  assert.equal((await textOf(live)).length, 5);
});

t('live editor path == saved quotation path (same sanitized output)', async () => {
  const samples = [
    '<p>Hello brave new world</p>',
    `<p><strong>Bold</strong> <em>italic</em> <u>under</u> <span style="color: #ff0000;">red</span></p><p style="text-align: center">centered text here</p><p style="text-align: justify">${WORDS.slice(0, 40).join(' ')}</p>`,
    '<ul><li>first item here</li><li>second item here</li></ul><ol><li>numbered one</li></ol>',
    `<p>See https://portal.example.com/${'doc-'.repeat(20)}x.pdf and ref ${'QTN-2026-'.repeat(8)} for details</p>`,
  ];
  for (const s of samples) {
    const live = await liveEditorHtml(s);
    const fromLive = await sanitizeFE(live);
    const fromSaved = await sanitizeFE(sanitizeTerms(live)); // backend storage, then the same render path
    assert.equal(canon(fromLive), canon(fromSaved), `live and saved paths diverge for: ${s.slice(0, 60)}`);
  }
});

t('existing saved HTML (literal U+00A0, tables, formatting) renders as before', async () => {
  const saved = '<p><strong>Bold</strong> text here</p><table><tbody><tr><td data-row="r1">A one</td><td data-row="r1">B two</td></tr></tbody></table><p style="text-align: right;color: #0000ff;">right blue</p>';
  const out = await sanitizeFE(saved);
  assert.ok(!/ /.test(out));
  assert.match(out, /<strong>Bold<\/strong> text here/);
  assert.equal((out.match(/<td/g) || []).length, 2);
  assert.match(out, /text-align: ?right/);
  assert.match(out, /color: ?(#0000ff|rgb\(0, 0, 255\))/i);
});

t('REAL PDF: long justified paragraph from LIVE editor state stays inside the page (115/140 words were lost before the fix)', async () => {
  const sanitized = await sanitizeFE(await liveEditorHtml(justified));
  const { overflow, missing } = await renderChecks(sanitized, WORDS);
  assert.ok(overflow <= 1, `terms text overflows its box by ${overflow}px`);
  if (missing) assert.deepEqual(missing, [], `words missing from the PDF: ${missing.length}`);
});

t('REAL PDF: left-aligned paragraph from LIVE editor state wraps whole words', async () => {
  const sanitized = await sanitizeFE(await liveEditorHtml(`<p>${WORDS.join(' ')}</p>`));
  const { overflow, missing } = await renderChecks(sanitized, WORDS);
  assert.ok(overflow <= 1);
  if (missing) assert.deepEqual(missing, [], 'words split mid-word or missing');
});

t('REAL PDF: SAVED quotation path still fine (live and saved consistent)', async () => {
  const live = await liveEditorHtml(justified);
  const { overflow, missing } = await renderChecks(await sanitizeFE(sanitizeTerms(live)), WORDS);
  assert.ok(overflow <= 1);
  if (missing) assert.deepEqual(missing, []);
});

t('REAL PDF: long justified paragraph with URLs and reference numbers (live editor)', async () => {
  const url = 'https://portal.example.com/documents/' + 'attachments-terms-v'.repeat(6) + '.pdf';
  const ref = 'QTN-2026-AE-DXB-' + '0123456789'.repeat(7);
  const body = `<p style="text-align: justify">${Array.from({ length: 30 }, (_, i) => `clause${i + 1} The contractor shall comply with ${url} and quote ${ref} at all times`).join('. ')}</p>`;
  const { overflow } = await renderChecks(await sanitizeFE(await liveEditorHtml(body)), null);
  assert.ok(overflow <= 1, `overflow ${overflow}px`);
});

t('REAL PDF: existing table with formatting still renders inside the page', async () => {
  const saved = `<table style="width: 100%"><tbody>${'<tr>' + ['Item', 'Description', 'Rate'].map((h) => `<td data-row="r1"><strong>${h}</strong> text here</td>`).join('') + '</tr>'}</tbody></table>`;
  const { overflow } = await renderChecks(await sanitizeFE(saved), null);
  assert.ok(overflow <= 1);
});
