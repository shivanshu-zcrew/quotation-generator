import Quill from "quill";

// By default Quill renders align/font/size as CSS classes (ql-align-center,
// ql-font-serif, ql-size-large) that only mean something where quill.snow.css
// is loaded. Terms & Conditions HTML gets rendered in places that don't load
// that stylesheet (PDF export, Zoho, admin views), so re-register these as
// the "Style" attributor variant instead — same formats, but Quill writes
// them out as inline style="..." attributes that carry their own meaning
// anywhere. (color/background already default to the Style variant.)
const AlignStyle = Quill.import("attributors/style/align");
const FontStyle = Quill.import("attributors/style/font");
const SizeStyle = Quill.import("attributors/style/size");

// Single-word, unquoted font names only: a value here is written verbatim as
// the inline `font-family` style, and multi-word stacks ("Times New Roman")
// don't reliably round-trip through the browser's style-attribute
// serialization without quoting, which would break format detection.
FontStyle.whitelist = ["sans-serif", "serif", "monospace", "arial", "georgia", "courier"];

SizeStyle.whitelist = ["10px", "12px", "14px", "16px", "18px", "24px", "32px"];

Quill.register(AlignStyle, true);
Quill.register(FontStyle, true);
Quill.register(SizeStyle, true);

// Quill's toolbar shows the raw whitelist value as the option label by
// default; give the font/size pickers human-readable labels instead.
export const TERMS_PICKER_LABEL_CSS = `
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="sans-serif"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="sans-serif"]::before { content: 'Sans Serif'; }
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="serif"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="serif"]::before { content: 'Serif'; font-family: serif; }
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="monospace"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="monospace"]::before { content: 'Monospace'; font-family: monospace; }
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before { content: 'Arial'; font-family: arial; }
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before { content: 'Georgia'; font-family: georgia; }
  .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="courier"]::before,
  .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="courier"]::before { content: 'Courier New'; font-family: courier; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before { content: '10'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before { content: '12'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before { content: '14'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label:not([data-value])::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item:not([data-value])::before { content: '16'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before { content: '18'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before { content: '24'; }
  .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="32px"]::before,
  .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="32px"]::before { content: '32'; }
`;

// Applies both where content is *edited* (the live Quill editor) and where
// it's *read* (TermsViewer/CommentableHtml, the PDF-export CSS mirrors this
// separately). Two fixups Quill's own CSS doesn't cover in this app:
//  - Tailwind's preflight resets heading font-weight app-wide; Quill's CSS
//    only restores size, not weight.
//  - Quill's persisted/exported HTML for a plain bullet/ordered list
//    (`quill.getSemanticHTML()`, used for onChange/persistence) is genuine
//    `<ul>/<ol><li>` with no `data-list` attribute — that attribute only
//    appears on checklist items, which this editor doesn't use. But
//    `.ql-editor li{list-style-type:none}` (in quill's own CSS) suppresses
//    the browser's native marker for every <li> unconditionally, since it
//    expects the live editor's internal counter/marker elements instead.
//    Restore native bullets/numbers for exactly the plain-list-item case.
// Only ever mounted on the *read-only* TermsViewer/CommentableHtml — never
// alongside the live editing ReactQuill instance (every call site picks one
// or the other via `isEditing ? <TermsEditor/> : <TermsViewer/>`, so the two
// are never mounted at once and this can't bleed into the typing UX).
export const TERMS_CONTENT_CSS = `
  /* Quill's own CSS sets white-space:pre-wrap on .ql-editor itself but never
     resets it back to normal for block children (it only resets margin/
     padding) — so a literal newline character sitting inside a paragraph's
     text (not a <br> element; e.g. from pasting text that had a hard
     line-wrap baked into its source, like a hyphenated word wrapped across
     a line in a justified PDF) renders as a real visible break here. The
     live editor never shows this because Quill's clipboard.convert()
     normalizes such stray newlines to a plain space on load — only this raw,
     unprocessed render path is exposed to it. Reset back to normal, matching
     the PDF's .terms-content p (which already does this). */
  .ql-editor p, .ql-editor h1, .ql-editor h2, .ql-editor h3, .ql-editor h4, .ql-editor h5, .ql-editor h6,
  .ql-editor li, .ql-editor blockquote { white-space: normal; }
  .ql-editor h1, .ql-editor h2, .ql-editor h3, .ql-editor h4, .ql-editor h5, .ql-editor h6 { font-weight: 700; }
  .ql-editor ul > li:not([data-list]),
  .ql-editor ol > li:not([data-list]) { list-style-position: inside; padding-left: 0; }
  .ql-editor ul > li:not([data-list]) { list-style-type: disc; }
  .ql-editor ol > li:not([data-list]) { list-style-type: decimal; }
  /* Hanging indent (mirrors the PDF's .terms-content p rule): a paragraph's
     first line starts flush left, but a wrapped continuation line aligns
     under that first line's text instead of restarting at the margin.
     Skipped for center/right/justify — asymmetric left-only padding visibly
     breaks those alignments once a paragraph actually wraps. */
  .ql-editor p { padding-left: 1.5em; text-indent: -1.5em; }
  .ql-editor p[style*="text-align: center"], .ql-editor p[style*="text-align:center"],
  .ql-editor p[style*="text-align: right"], .ql-editor p[style*="text-align:right"],
  .ql-editor p[style*="text-align: justify"], .ql-editor p[style*="text-align:justify"] { padding-left: 0; text-indent: 0; }
`;

// Keeps the formatting toolbar visible while scrolling through long terms
// text. Scoped to .terms-quill-wrapper (set on the editor's own container in
// TermsCondition.jsx) rather than bare .ql-toolbar, so it can't affect any
// other Quill instance that might get added elsewhere later.
export const TERMS_STICKY_TOOLBAR_CSS = `
  .terms-quill-wrapper .ql-toolbar.ql-snow {
    position: sticky;
    top: var(--terms-toolbar-top, 0px);
    z-index: 5;
  }
`;

// Quill's Snow theme is a generic default (28x24px buttons, 15px gaps
// between groups, #ccc borders, Helvetica, a blue #06c active color) that
// doesn't match this app's compact UI (12-14px type, #e2e8f0 borders,
// 8px radii, #0f172a as the active/focus color — see AddItemModal's
// onFocus border color and QuotationLayout's card styling). Re-theme it
// to the same tokens instead of a foreign-looking widget bolted onto the
// page. Scoped to .terms-quill-wrapper so it can't leak elsewhere.
export const TERMS_TOOLBAR_THEME_CSS = `
  .terms-quill-wrapper .ql-toolbar.ql-snow {
    border: 1px solid #e2e8f0;
    border-radius: 8px 8px 0 0;
    background: #f8fafc;
    padding: 6px 8px;
    font-family: inherit;
  }
  .terms-quill-wrapper .ql-container.ql-snow {
    border: 1px solid #e2e8f0;
    border-top: 0;
    border-radius: 0 0 8px 8px;
    font-family: inherit;
    font-size: 0.9rem;
  }
  .terms-quill-wrapper .ql-editor {
    min-height: 180px;
    line-height: 1.7;
  }
  .terms-quill-wrapper .ql-editor.ql-blank::before {
    color: #94a3b8;
    font-style: normal;
  }
  .terms-quill-wrapper .ql-formats {
    margin-right: 6px;
  }
  .terms-quill-wrapper .ql-toolbar button {
    width: 26px;
    height: 26px;
    padding: 4px;
    border-radius: 6px;
  }
  .terms-quill-wrapper .ql-toolbar button:hover,
  .terms-quill-wrapper .ql-toolbar button:focus,
  .terms-quill-wrapper .ql-toolbar button.ql-active,
  .terms-quill-wrapper .ql-toolbar .ql-picker-label:hover,
  .terms-quill-wrapper .ql-toolbar .ql-picker-label.ql-active,
  .terms-quill-wrapper .ql-toolbar .ql-picker-item:hover,
  .terms-quill-wrapper .ql-toolbar .ql-picker-item.ql-selected {
    background: #f1f5f9;
    color: #0f172a;
    border-radius: 6px;
  }
  .terms-quill-wrapper .ql-stroke {
    stroke: #475569;
  }
  .terms-quill-wrapper .ql-fill {
    fill: #475569;
  }
  .terms-quill-wrapper .ql-toolbar button:hover .ql-stroke,
  .terms-quill-wrapper .ql-toolbar button:focus .ql-stroke,
  .terms-quill-wrapper .ql-toolbar button.ql-active .ql-stroke,
  .terms-quill-wrapper .ql-picker-label:hover .ql-stroke,
  .terms-quill-wrapper .ql-picker-label.ql-active .ql-stroke,
  .terms-quill-wrapper .ql-picker-item:hover .ql-stroke,
  .terms-quill-wrapper .ql-picker-item.ql-selected .ql-stroke {
    stroke: #0f172a;
  }
  .terms-quill-wrapper .ql-toolbar button:hover .ql-fill,
  .terms-quill-wrapper .ql-toolbar button:focus .ql-fill,
  .terms-quill-wrapper .ql-toolbar button.ql-active .ql-fill,
  .terms-quill-wrapper .ql-picker-label:hover .ql-fill,
  .terms-quill-wrapper .ql-picker-label.ql-active .ql-fill,
  .terms-quill-wrapper .ql-picker-item:hover .ql-fill,
  .terms-quill-wrapper .ql-picker-item.ql-selected .ql-fill {
    fill: #0f172a;
  }
  .terms-quill-wrapper .ql-picker {
    font-size: 0.8rem;
    font-weight: 500;
    height: 26px;
    color: #374151;
  }
  .terms-quill-wrapper .ql-picker-label {
    border-radius: 6px;
    padding-left: 6px;
  }
  .terms-quill-wrapper .ql-picker.ql-header { width: 88px; }
  .terms-quill-wrapper .ql-picker.ql-font { width: 92px; }
  .terms-quill-wrapper .ql-picker.ql-size { width: 52px; }
  .terms-quill-wrapper .ql-picker-options {
    border-radius: 8px;
    border-color: #e2e8f0;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
    padding: 6px;
  }
  .terms-quill-wrapper .ql-color-picker .ql-picker-options,
  .terms-quill-wrapper .ql-icon-picker .ql-picker-options {
    padding: 6px;
    width: 168px;
  }
  .terms-quill-wrapper .ql-color-picker .ql-picker-item {
    border-radius: 3px;
    width: 18px;
    height: 18px;
  }
`;

// Quill's editor.getSemanticHTML() (what react-quill-new's onChange hands
// back, and what this app persists) drops the <br> from a blank line: an
// empty line's own content length is 0, and parchment's forEachAt has an
// early `if (length <= 0) return` that skips visiting the <br> blot, so the
// line is exported as bare `<p></p>` instead of `<p><br></p>`. Browsers give
// `<p><br></p>` a full line of height but collapse a truly empty `<p></p>`
// to zero height, so a blank line added between two paragraphs in the editor
// visually vanishes the moment the HTML is saved and redisplayed (viewer,
// PDF, or even the editor itself on reload). Patch empty p/h1-6/li tags back
// to containing a <br> right where the HTML leaves the editor, so every
// downstream consumer sees the fixed-up markup.
const EMPTY_BLOCK_RE = /<(p|h[1-6]|li)((?:\s+[^>]*)?)><\/\1>/g;
export function fixEmptyQuillLines(html) {
  if (!html) return html;
  return html.replace(EMPTY_BLOCK_RE, "<$1$2><br></$1>");
}

export const TERMS_TOOLBAR_MODULE = [
  [{ font: FontStyle.whitelist }, { size: SizeStyle.whitelist }],
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
];

export const TERMS_EDITOR_FORMATS = [
  "font",
  "size",
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "indent",
  "align",
];
