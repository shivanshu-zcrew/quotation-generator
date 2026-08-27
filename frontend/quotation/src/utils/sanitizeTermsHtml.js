import DOMPurify from "dompurify";

// Terms & Conditions is stored as real HTML (produced by the Quill editor in
// TermsCondition.jsx) and gets rendered via dangerouslySetInnerHTML in the
// viewer and embedded into the PDF export document (which loads into a real,
// script-capable headless browser server-side). Sanitize on every render
// path — this is defense-in-depth on top of the backend sanitizer, which is
// the actual security boundary since the API accepts this field directly.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "a",
  "table", "thead", "tbody", "tr", "td", "th",
  "img",
];

// data-row is written by Quill's built-in table module (TableCell blot) to
// group cells into rows — stripping it wouldn't visibly break the table on
// this render pass, but would silently lose the row grouping the next time
// this same HTML is loaded back into the Quill editor for editing.
// data-s3-key is this app's own addition for inline images — the durable
// S3 key an expired signed-URL src gets refreshed from (see
// reconcileInlineImages/refreshRenderedImages). src/alt/width/height are
// standard <img> attributes; DOMPurify already blocks javascript:/other
// dangerous URI schemes on src regardless of this allowlist, so no extra
// scheme config is needed here the way the backend sanitizer needs one.
const ALLOWED_ATTR = ["style", "href", "target", "rel", "class", "data-list", "data-row", "src", "alt", "width", "height", "data-s3-key"];

// Quill's own formats never produce url()/expression() in inline styles —
// only color/background-color/font-family/font-size/text-align/
// text-decoration/font-weight/font-style. Strip anything else out so a
// crafted style="background:url(...)" can't slip through as a data
// exfiltration or injection vector.
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (data.attrName === "style" && /url\s*\(|expression\s*\(/i.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE"]);

// Quill's own clipboard.convert() — what the live editor runs stored HTML
// through on load — silently splits a block containing embedded <br>
// (e.g. from Shift+Enter typing, or a paste that preserved soft line
// breaks instead of real paragraphs) into one block per line. Read-only
// rendering (TermsViewer, PDF export) never goes through Quill's clipboard,
// so without this, content shaped that way looks perfectly fine the moment
// you open it in the editor but stays one unstructured blob everywhere
// else — no per-line wrap alignment, and prone to breaking a word mid-way
// at the container edge instead of wrapping it whole. Mirror Quill's own
// splitting here so every render path treats the same stored HTML the
// same way, regardless of how it was originally typed or pasted.
function splitBrSeparatedBlocks(container) {
  Array.from(container.children).forEach((el) => {
    if (BLOCK_TAGS.has(el.tagName) && el.querySelector("br")) {
      const groups = [[]];
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeName === "BR") {
          groups.push([]);
        } else {
          groups[groups.length - 1].push(node);
        }
      });
      // A single trailing <br> is normally just a stray end-of-block marker,
      // not a deliberate blank line — drop the empty group it would leave
      // behind. An *interior* empty group (from a double <br><br>) is a
      // genuine blank line and is kept.
      if (groups.length > 1 && groups[groups.length - 1].length === 0) {
        groups.pop();
      }
      const newEls = groups.map((group) => {
        const clone = el.cloneNode(false);
        if (group.length === 0) {
          clone.appendChild(document.createElement("br"));
        } else {
          group.forEach((node) => clone.appendChild(node));
        }
        return clone;
      });
      newEls.forEach((newEl) => el.parentNode.insertBefore(newEl, el));
      el.remove();
    } else if (el.children.length > 0) {
      splitBrSeparatedBlocks(el);
    }
  });
}

// A hyphen-minus (U+002D) immediately followed by a letter/digit is *always*
// a valid line-break opportunity per the Unicode line-breaking algorithm —
// browsers can wrap "Re-inspection" into "Re-"/"inspection" whenever
// convenient for the current line, with no minimum amount of remaining
// space required to trigger it, regardless of what (if anything) precedes
// the hyphen. This is independent of word-wrap/overflow-wrap (those govern
// breaking words that have NO break point; a hyphen already provides one)
// and independent of the `hyphens` CSS property (that governs the browser
// inserting NEW hyphens, not whether an existing "-" counts as a break
// point — verified empirically: `hyphens: none` does not stop this). The
// verified fix is a WORD JOINER (U+2060, zero-width, explicitly defined to
// prohibit a break at that position) right after the hyphen, so compound
// words like "Re-inspection", "day-rate", or "pro-rated" stay whole and
// move to the next line intact — matching how word processors normally
// treat hyphenated words. Deliberately not anchored to "letter-hyphen-
// letter": this app's bullet points are typed as "-Word" (dash glued
// directly to the first word, no space), and once the word itself is
// protected, the *leading* dash becomes the next available break point —
// producing an orphaned "-" alone on its own line if left unprotected.
export function protectHyphenatedWords(text) {
  if (!text) return text;
  return text.replace(/-(?=[A-Za-z0-9])/g, "-⁠");
}

// The PDF/print CSS deliberately does NOT set overflow-wrap:break-word on
// prose text (.terms-content p/li/h1-6/blockquote/span/... in pdfGenerator.js)
// — Chromium has a documented quirk where that combined with text-align:
// justify (common on content pasted from a justified Word/PDF source, which
// Quill preserves as an inline style) makes it split ordinary words mid-
// character to tighten justification, even when the whole word fits on the
// next line. Without that CSS safety net, though, a token with NO whitespace
// anywhere in it has no break opportunity at all and would run straight off
// the printable page edge — confirmed directly (an isolated Puppeteer PDF
// export test): text overflowing the page width there isn't just visually
// clipped, whole characters are missing from the exported PDF's actual text
// layer, permanently. Realistic prose (even long hyphenated compounds,
// already handled above) never approaches this length; this only ever fires
// on pathological input — a long tracking/reference code, a bare URL, or
// accidentally-deleted spaces. A zero-width space (U+200B) is a real,
// standards-defined break opportunity, invisible when unused — inserting
// one every SOFT_BREAK_CHUNK characters restores a safe fallback wrap point
// for exactly that case without reintroducing overflow-wrap's justify bug:
// unlike break-word's forced "split anywhere" behavior, a ZWSP is just an
// ordinary candidate break point to the line-breaking algorithm, so it
// doesn't get abused for tighter justification the way break-word does.
const LONG_TOKEN_RE = /\S{60,}/g;
const SOFT_BREAK_CHUNK = 20;
export function breakLongTokens(text) {
  if (!text) return text;
  return text.replace(LONG_TOKEN_RE, (token) => {
    let out = "";
    for (let i = 0; i < token.length; i += SOFT_BREAK_CHUNK) {
      if (i > 0) out += "​";
      out += token.slice(i, i + SOFT_BREAK_CHUNK);
    }
    return out;
  });
}

// HTML always collapses a run of 2+ regular space characters down to a
// single space, and trims a run of spaces sitting at the very start/end of
// a block down to nothing — in every browser, unrelated to any CSS here.
// That's why pressing the spacebar several times to add visual gap (before
// a sentence, or at the start of a pasted-in paragraph) silently does
// nothing. Keep the first space in a run breakable/collapsible as normal,
// and turn the rest into non-breaking spaces (U+00A0), which are exempt
// from that collapsing rule — the run then renders at its typed width
// instead of disappearing, matching what a word processor would show.
export function preserveRepeatedSpaces(text) {
  if (!text) return text;
  return text.replace(/ {2,}/g, (run) => " " + " ".repeat(run.length - 1));
}

function protectHyphensInTextNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) textNodes.push(node);

  // Pass 1: repeated spaces and hyphens fully inside one text node.
  // breakLongTokens runs first, on the raw pasted text, before either of
  // the others touch it — see its own comment for why it's needed at all.
  textNodes.forEach((n) => {
    n.nodeValue = protectHyphenatedWords(preserveRepeatedSpaces(breakLongTokens(n.nodeValue)));
  });

  // Pass 2: hyphens sitting at a text-node BOUNDARY. Pasted content (or a
  // formatting change applied to only part of a word) can split e.g.
  // "-Re-inspection" into <span>-</span><span>Re-inspection</span> — two
  // adjacent text nodes. protectHyphenatedWords' lookahead only sees inside
  // a single string, so a hyphen that happens to be the very last character
  // of a node is invisible to it even though, visually, a letter follows
  // immediately in the next node. Walk node-to-node pairs in document order
  // (this naturally crosses <strong>/<span>/etc. boundaries, since the
  // TreeWalker traverses the whole container) and glue those too.
  for (let i = 0; i < textNodes.length - 1; i++) {
    const current = textNodes[i];
    if (!current.nodeValue.endsWith("-")) continue;
    const next = textNodes.slice(i + 1).find((n) => n.nodeValue.length > 0);
    if (next && /^[A-Za-z0-9]/.test(next.nodeValue)) {
      current.nodeValue += "⁠";
    }
  }

  // Pass 3: the same boundary problem, for repeated spaces. After pass 1,
  // any node's OWN 2+-space run is already down to "one plain space + the
  // rest non-breaking", so a node can only still end/start with a single
  // bare plain space at this point. But if a typed multi-space run happened
  // to land exactly on a formatting boundary (e.g. a color change applied
  // partway through, splitting "in   Any" into "...in "+" Any..." across
  // two spans), each side only ever had 1 plain space of its own — neither
  // one alone looks like a "run" to preserveRepeatedSpaces, so the space
  // silently collapses. If this node ends in a plain space and the next
  // (non-empty) node starts with one too, they're really one typed run
  // split across the DOM; convert the next node's leading space(s) to
  // non-breaking so the combined run keeps its width.
  for (let i = 0; i < textNodes.length - 1; i++) {
    const current = textNodes[i];
    if (!current.nodeValue.endsWith(" ")) continue;
    const next = textNodes.slice(i + 1).find((n) => n.nodeValue.length > 0);
    if (next && next.nodeValue.startsWith(" ")) {
      next.nodeValue = next.nodeValue.replace(/^ +/, (run) => " ".repeat(run.length));
    }
  }
}

// Content copy-pasted into the Terms editor (from Word, a PDF, or a web
// page) very often carries non-breaking spaces (U+00A0) in place of ordinary
// spaces between words — this is invisible (renders identically to a normal
// space) and easy to never notice, but it is NEVER a valid line-break
// opportunity. If most of a paragraph's inter-word spaces are secretly
// U+00A0, the browser can't wrap at those word boundaries at all, and is
// forced to find some other break point instead — a hyphen mid-word, or a
// raw overflow-wrap break — which is what produced the "Re-inspection"
// splitting and orphaned "-" bugs traced earlier. Normalize every
// non-breaking space back to a regular, breakable one before anything else
// runs; a genuine multi-space run the user actually typed (real, consecutive
// U+0020 characters) is still re-protected afterward by
// preserveRepeatedSpaces, so intentional spacing isn't lost.
export function normalizeNonBreakingSpaces(html) {
  if (!html) return html;
  return html.replace(/ /g, " ");
}

// A table row where every cell is blank (no text, no image) — e.g. added
// from the toolbar and never filled in — has zero rendering height, leaving
// nothing on screen but its own border stacked against its neighbors': a
// squashed block of horizontal lines above/below the table with no visible
// cell content. TermsCondition.jsx's sectionsToHTML strips these too, but
// only at *save* time — this is the shared render path (every view of
// Terms & Conditions goes through here: TermsViewer, CommentableHtml, PDF
// export), so stripping it here also fixes content saved before that
// existed, or reached here some other way, not just content saved from now
// on.
function isTableCellEmpty(cell) {
  if (cell.querySelector("img")) return false;
  return (cell.textContent || "").replace(/\u00A0/g, " ").trim().length === 0;
}
export function removeEmptyTableRows(container) {
  container.querySelectorAll("table").forEach((table) => {
    table.querySelectorAll("tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td, th"));
      if (cells.length > 0 && cells.every(isTableCellEmpty)) row.remove();
    });
    // A table stripped down to zero rows is its own empty shell — drop it
    // too, rather than leaving a bare <table style="..."></table> behind.
    if (table.querySelectorAll("tr").length === 0) table.remove();
  });
}

// ============================================================
// tidyTermsHtml — the "Tidy" toolbar button's transform (TermsCondition.jsx,
// TermsSectionEditor's modules.toolbar.handlers.tidy). Content pasted from
// Word/PDFs/webpages typically arrives as a flat run of <p> tags, each
// wrapped in a <span style="background-color:...;color:...">  carried over
// from the source document, with section numbers ("1.1 Radiographic
// Testing (RT)") and bullets ("• Supply of...") as literal typed
// characters rather than real Quill headings/lists — which is why it
// doesn't look like a "proper" document: no real indentation, no bullet
// markers, no heading typography. This only ever touches structure and
// presentation, never wording — Terms & Conditions is quasi-legal content,
// so an AI-rewrite approach that could alter wording, even subtly, was
// deliberately ruled out in favor of this deterministic, byte-for-byte
// wording-preserving transform.
// ============================================================

// Every descendant with a style attribute, not just the paragraphs about to
// be reclassified below — covers table cells and any already-real
// headings/lists too. Uses the DOM's own CSSStyleDeclaration API rather
// than a hand-rolled regex against the raw style string, so it's robust to
// spacing/shorthand variance (Word sometimes emits the `background`
// shorthand instead of `background-color`). Foreground `color` is
// deliberately left alone — more conservative default, since an
// intentionally-colored word/phrase is plausible and shouldn't be silently
// erased just because most paste-cruft color happens to be boilerplate.
function stripBackgroundColors(container) {
  container.querySelectorAll("[style]").forEach((el) => {
    el.style.removeProperty("background-color");
    el.style.removeProperty("background");
    if (el.getAttribute("style").trim() === "") el.removeAttribute("style");
  });
}

const BULLET_CHAR_RE = /^[•●▪]\s*/;
// Anchored to the start of the trimmed text — a stray digit mid-sentence
// can never match. Requires whitespace after the numeric prefix so "1.1"
// alone (with nothing following) isn't treated as a heading.
const NUMBERED_PREFIX_RE = /^(\d+(?:\.\d+)*\.?)\s+(\S.*)$/;
const getNormalizedText = (el) => (el.textContent || "").replace(/\u00A0/g, " ").trim();

// A body sentence that happens to start with a numeric-looking prefix (e.g.
// "1.1 million units were produced last year.") is the one false-positive
// class this can't fully rule out from the numbering pattern alone — these
// heuristics (capitalized start, no trailing sentence punctuation, a sane
// length cap) catch the common case. Worst case on a miss is a paragraph
// cosmetically restyled as a heading with byte-identical wording, undoable
// with a single Ctrl+Z.
function looksLikeHeadingTitle(title) {
  if (title.length === 0 || title.length > 80) return false;
  if (/[.,;:]$/.test(title)) return false;
  return /^[A-Z0-9(]/.test(title);
}

// Only ever inspects <p> tags — real <h1-6>/<ul>/<ol>/<li>/<table>/
// <blockquote> elements are never reclassified, which is also what makes a
// second Tidy pass on already-tidied content a no-op (idempotent).
function classifyBlock(el) {
  if (!el || el.nodeType !== 1 || el.tagName !== "P") return null;
  const text = getNormalizedText(el);
  if (text === "") return el.querySelector("img") ? null : { type: "blank" };
  if (BULLET_CHAR_RE.test(text)) return { type: "bullet" };
  const m = text.match(NUMBERED_PREFIX_RE);
  if (m && looksLikeHeadingTitle(m[2].trim())) {
    return { type: "heading", depth: m[1].replace(/\.$/, "").split(".").length };
  }
  return null;
}

// Depth 1/2/3+ -> h4/h5/h6, deliberately not h1-h3 — those stay reserved
// for headings applied manually via the toolbar's own header picker, so
// auto-generated headings never collide with intentional ones. The literal
// numbering text ("1.1") is kept as part of the heading's own visible text
// rather than replaced with Quill's auto-numbered <ol> — preserves the
// document's own manual-numbering convention exactly as typed.
function convertToHeading(p, depth) {
  const tag = depth <= 1 ? "H4" : depth === 2 ? "H5" : "H6";
  const el = document.createElement(tag);
  if (p.hasAttribute("style")) el.setAttribute("style", p.getAttribute("style"));
  while (p.firstChild) el.appendChild(p.firstChild);
  return el;
}

// Only ever touches text nodes (TreeWalker(SHOW_TEXT)) — an <img> sitting
// before or interleaved with the bullet text is never visited here, so it
// survives untouched in convertToListItem's subsequent child-node move.
function stripLeadingBulletChar(p) {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let node;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    if (node.nodeValue.trim() !== "") {
      node.nodeValue = node.nodeValue.replace(/^[ \u00A0]*[•●▪][ \u00A0]*/, "");
      break;
    }
  }
}

function convertToListItem(p) {
  stripLeadingBulletChar(p);
  const li = document.createElement("li");
  if (p.hasAttribute("style")) li.setAttribute("style", p.getAttribute("style"));
  while (p.firstChild) li.appendChild(p.firstChild);
  return li;
}

// Single forward walk over a static snapshot of the top-level children.
// Consecutive bullet paragraphs are grouped into one shared <ul> rather
// than one <ul> per line. Blank spacer <p><br></p> paragraphs (common
// between pasted sections) are dropped outright — real headings/lists
// carry their own CSS margin, so a manual blank line between them is
// redundant — and dropping one without flushing the list accumulator lets
// two bullet runs separated only by a spacer merge into a single list.
function restructureTopLevel(container) {
  const originalNodes = Array.from(container.childNodes);
  const fragment = document.createDocumentFragment();
  let currentList = null;
  const flushList = () => {
    if (currentList) {
      fragment.appendChild(currentList);
      currentList = null;
    }
  };

  originalNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      flushList();
      fragment.appendChild(node);
      return;
    }
    const cls = classifyBlock(node);
    if (!cls) {
      flushList();
      fragment.appendChild(node);
      return;
    }
    if (cls.type === "blank") return;
    if (cls.type === "heading") {
      flushList();
      fragment.appendChild(convertToHeading(node, cls.depth));
      return;
    }
    if (!currentList) currentList = document.createElement("ul");
    currentList.appendChild(convertToListItem(node));
  });
  flushList();

  container.innerHTML = "";
  container.appendChild(fragment);
}

export function tidyTermsHtml(html) {
  if (!html || html === "<p><br></p>") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  stripBackgroundColors(container);
  restructureTopLevel(container);
  removeEmptyTableRows(container);
  return container.innerHTML || html;
}

export function sanitizeTermsHtml(html) {
  if (!html) return "";
  const normalized = normalizeNonBreakingSpaces(html);
  const clean = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  const container = document.createElement("div");
  container.innerHTML = clean;
  removeEmptyTableRows(container);
  splitBrSeparatedBlocks(container);
  protectHyphensInTextNodes(container);
  return container.innerHTML;
}
