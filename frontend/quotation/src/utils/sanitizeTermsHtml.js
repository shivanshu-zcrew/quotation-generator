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
];

const ALLOWED_ATTR = ["style", "href", "target", "rel", "class", "data-list"];

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
  textNodes.forEach((n) => {
    n.nodeValue = protectHyphenatedWords(preserveRepeatedSpaces(n.nodeValue));
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
  splitBrSeparatedBlocks(container);
  protectHyphensInTextNodes(container);
  return container.innerHTML;
}
