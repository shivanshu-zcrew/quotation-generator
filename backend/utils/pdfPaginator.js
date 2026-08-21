// utils/pdfPaginator.js
//
// Deterministic ("tentative placement") pagination for the Puppeteer-rendered
// quotation PDF. Replaces reliance on Chromium's CSS break-inside:avoid,
// which — when a block doesn't fit the remaining space on a page — shoves
// the WHOLE block to the next page and abandons whatever space was left
// behind, producing large blank gaps. That happened repeatedly (items table,
// Terms & Conditions' own embedded tables, the approval-chain footer table)
// because no amount of CSS scoping fixes the underlying browser behavior —
// only measuring real content height and deciding page breaks ourselves does.
//
// PAGE_CONTENT_WIDTH_PX / PAGE_CONTENT_HEIGHT_PX are the A4 content box
// (210mm x 297mm) minus PDF_PAGE_MARGIN_MM on every side, at the standard
// 96 CSS-px-per-inch conversion Chromium's print pipeline uses. Math.floor,
// not round — never risk exceeding the real printable area by a fraction of
// a pixel. PDF_PAGE_MARGIN_MM must stay in sync with the `margin` passed to
// page.pdf() in quotationController.js's generatePDF (both read this same
// constant) — a mismatch there would make PAGE_CONTENT_HEIGHT_PX wrong
// relative to what's actually printable.
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_PAGE_MARGIN_MM = 10;

const mmToPx = (mm) => mm * (CSS_PX_PER_INCH / MM_PER_INCH);

const PAGE_CONTENT_WIDTH_PX = Math.floor(mmToPx(A4_WIDTH_MM - 2 * PDF_PAGE_MARGIN_MM));
const PAGE_CONTENT_HEIGHT_PX = Math.floor(mmToPx(A4_HEIGHT_MM - 2 * PDF_PAGE_MARGIN_MM));

// Runs INSIDE the Puppeteer page via page.evaluate(runPagination, args) —
// Puppeteer serializes only this function's own source over CDP, so it must
// be fully self-contained: no references to anything outside its own body
// (no closures over the constants above, no calling other functions in this
// file). Every input arrives through `args`.
function runPagination({ pageContentHeightPx, safetyMarginPx }) {
  const container = document.querySelector('.container');
  if (!container) return;
  const budget = pageContentHeightPx - safetyMarginPx;

  // Flat, document-ordered list of every placement unit — table rows are
  // not treated as belonging to a separate per-table budget, they interleave
  // into this same global stream as everything else, so leftover space
  // after (say) the items table's last row is naturally available to
  // whatever section comes next.
  const tagged = Array.from(container.querySelectorAll('[data-pdf-chunk], tr[data-pdf-row]'));

  // Collapse contiguous rows sharing a data-pdf-keep-group id (e.g. the
  // totals block) into a single unit that's placed/bumped as one — never
  // split apart across a page boundary.
  const units = [];
  for (let i = 0; i < tagged.length; i++) {
    const el = tagged[i];
    const groupId = el.hasAttribute('data-pdf-row') ? el.getAttribute('data-pdf-keep-group') : null;
    if (groupId) {
      const group = [el];
      while (i + 1 < tagged.length && tagged[i + 1].getAttribute('data-pdf-keep-group') === groupId) {
        group.push(tagged[++i]);
      }
      units.push({ els: group, keepWithNext: false });
    } else {
      units.push({ els: [el], keepWithNext: el.hasAttribute('data-pdf-keep-with-next') });
    }
  }

  // Measure everything up front, in one pass — forced breaks (set below)
  // don't change any element's own box height, so it's safe to read every
  // height before mutating anything.
  const heights = units.map((u) => u.els.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0));

  let remaining = budget;
  let firstOnPage = true;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const ownHeight = heights[i];
    // A keep-with-next unit's fit check uses its own height PLUS the very
    // next unit's height — the next unit is, by construction, the table's
    // first row or the terms-content's first child: exactly what must not
    // be separated from this heading. No space is double-booked: once this
    // unit is placed normally below, `remaining -= ownHeight` leaves exactly
    // enough room for the next unit, which goes through its own iteration
    // next and is guaranteed to fit.
    const nextHeight = unit.keepWithNext && i + 1 < units.length ? heights[i + 1] : 0;
    const fitHeight = ownHeight + nextHeight;

    if (!firstOnPage && fitHeight > remaining) {
      const first = unit.els[0];
      first.style.breakBefore = 'page';
      first.style.pageBreakBefore = 'always';
      remaining = budget;
      firstOnPage = true;
    }
    // If firstOnPage is already true here and fitHeight still exceeds the
    // budget, this unit alone is taller than one empty page (a huge table
    // row with a tall image, an oversized notes block). Forcing another
    // break would be a no-op — nothing precedes it on this fresh page to
    // strand — so it's placed as-is and allowed to overflow naturally. Rare
    // edge case, and a strictly better failure mode than the blanket gap
    // bug this replaces.

    remaining -= Math.min(ownHeight, budget);
    if (remaining < 0) remaining = 0;
    firstOnPage = false;
  }
}

module.exports = {
  PDF_PAGE_MARGIN_MM,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  PAGE_CONTENT_WIDTH_PX,
  PAGE_CONTENT_HEIGHT_PX,
  runPagination,
};
