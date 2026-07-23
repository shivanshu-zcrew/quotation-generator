// Quote-based text anchoring for inline review comments.
//
// Comments are anchored by the selected text plus a bit of surrounding
// context (quote/prefix/suffix), not by character offsets — offsets don't
// survive edits or reloads (e.g. Terms & Conditions round-trips through a
// single plain-text field and gets rebuilt on every load). Re-locating the
// quote at render time degrades gracefully: if the text changed, the quote
// just won't be found and the comment shows as unanchored.

const CONTEXT_LENGTH = 40;

/**
 * Reads the current window selection and, if it's non-empty and fully
 * contained within containerEl, returns { quote, prefix, suffix }.
 * Returns null otherwise.
 */
export function getSelectionAnchor(containerEl) {
  if (!containerEl) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const quote = selection.toString().trim();
  if (!quote) return null;

  if (!containerEl.contains(range.startContainer) || !containerEl.contains(range.endContainer)) {
    return null;
  }

  const fullText = containerEl.textContent || '';
  const rawQuote = selection.toString();
  const quoteIndex = fullText.indexOf(rawQuote);
  if (quoteIndex === -1) {
    // Selection spans non-text nodes or whitespace was normalized away; fall
    // back to a contextless anchor rather than failing outright.
    return { quote, prefix: '', suffix: '', rect: range.getBoundingClientRect() };
  }

  const prefix = fullText.slice(Math.max(0, quoteIndex - CONTEXT_LENGTH), quoteIndex);
  const suffix = fullText.slice(quoteIndex + rawQuote.length, quoteIndex + rawQuote.length + CONTEXT_LENGTH);

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
