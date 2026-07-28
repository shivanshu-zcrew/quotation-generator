// Quote-based text anchoring for inline review comments.
//
// Comments are anchored by the selected text plus a bit of surrounding
// context (quote/prefix/suffix), not by character offsets — offsets don't
// survive edits or reloads (e.g. Terms & Conditions round-trips through a
// single plain-text field and gets rebuilt on every load). Re-locating the
// quote at render time degrades gracefully: if the text changed, the quote
// just won't be found and the comment shows as unanchored.

const CONTEXT_LENGTH = 40;

// Converts a DOM range boundary (node, offset) into a plain character offset
// within containerEl's *textContent* — i.e. counting only real text, with no
// separators inserted at element boundaries. This has to match textContent's
// concatenation exactly (not Selection.toString(), which many browsers
// serialize with synthetic "\n"s between block-level elements like adjacent
// <p> tags) since locateQuote() later searches within container.textContent
// (CommentableHtml) or the raw text prop (CommentableText). Using the two
// different notions of "the text" is exactly why a selection crossing a
// paragraph/line boundary used to find the button but then fail to actually
// locate — the quote captured didn't match anything real. `offset` means a
// character offset when `node` is a Text node, or a child index when `node`
// is an element (per the Range spec) — both are handled here.
function domPointToTextOffset(containerEl, node, offset) {
  let total = 0;
  let done = false;

  const measure = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.length;
    let sum = 0;
    for (const child of n.childNodes) sum += measure(child);
    return sum;
  };

  const walk = (n) => {
    if (done) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) {
        total += offset;
      } else {
        for (let i = 0; i < offset && i < n.childNodes.length; i++) {
          total += measure(n.childNodes[i]);
        }
      }
      done = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      total += n.length;
      return;
    }
    for (const child of n.childNodes) {
      walk(child);
      if (done) return;
    }
  };

  walk(containerEl);
  return done ? total : null;
}

/**
 * Reads the current window selection and, if it's non-empty and fully
 * contained within containerEl, returns { quote, prefix, suffix }. Works
 * the same whether the selection sits on one line or spans multiple
 * lines/paragraphs. Returns null otherwise.
 */
export function getSelectionAnchor(containerEl) {
  if (!containerEl) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!containerEl.contains(range.startContainer) || !containerEl.contains(range.endContainer)) {
    return null;
  }

  const fullText = containerEl.textContent || '';
  const start = domPointToTextOffset(containerEl, range.startContainer, range.startOffset);
  const end = domPointToTextOffset(containerEl, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const rawQuote = fullText.slice(start, end);
  const quote = rawQuote.trim();
  if (!quote) return null;

  // Keep prefix/suffix aligned with the trimmed quote (a drag can start/end
  // a character or two into surrounding whitespace).
  const leadingTrim = rawQuote.indexOf(quote);
  const trimmedStart = start + leadingTrim;
  const trimmedEnd = trimmedStart + quote.length;

  const prefix = fullText.slice(Math.max(0, trimmedStart - CONTEXT_LENGTH), trimmedStart);
  const suffix = fullText.slice(trimmedEnd, trimmedEnd + CONTEXT_LENGTH);

  return { quote, prefix, suffix, rect: range.getBoundingClientRect() };
}

/**
 * Locates { quote, prefix, suffix } inside text. Tries an exact
 * prefix+quote+suffix match first (disambiguates repeated quotes), then
 * falls back to the first bare occurrence of quote. Returns
 * { start, end } or null if not found at all.
 */
export function locateQuote(text, { quote, prefix = '', suffix = '' }) {
  if (!text || !quote) return null;

  if (prefix || suffix) {
    const combined = `${prefix}${quote}${suffix}`;
    const combinedIndex = text.indexOf(combined);
    if (combinedIndex !== -1) {
      const start = combinedIndex + prefix.length;
      return { start, end: start + quote.length };
    }
  }

  const start = text.indexOf(quote);
  if (start === -1) return null;
  return { start, end: start + quote.length };
}

/**
 * Splits text into an ordered list of segments for rendering, resolving
 * each comment's anchor via locateQuote. Overlapping matches are skipped
 * (first comment in array order wins). Each segment is either
 * { text, commentIds: null } (plain) or { text, commentIds: [...] } (highlighted).
 */
export function splitTextWithHighlights(text, comments = []) {
  if (!text) return [];
  if (!comments.length) return [{ text, commentIds: null }];

  const ranges = [];
  for (const comment of comments) {
    const located = locateQuote(text, comment);
    if (!located) continue;
    const overlaps = ranges.some(r => located.start < r.end && located.end > r.start);
    if (overlaps) continue;
    ranges.push({ ...located, commentId: comment._id });
  }

  if (!ranges.length) return [{ text, commentIds: null }];

  ranges.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ text: text.slice(cursor, r.start), commentIds: null });
    }
    segments.push({ text: text.slice(r.start, r.end), commentIds: [r.commentId] });
    cursor = r.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), commentIds: null });
  }

  return segments;
}
