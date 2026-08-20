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

// Quill's table module (registered by importing 'quill' — see the paste-fix
// comment further down) has no concept of column width or row height. These
// two custom attributors are the standard, documented way to add a new
// format to Quill (same StyleAttributor mechanism as Align/Font/Size
// above), scoped to Quill's own TableCell blot so the resize UI in
// TermsCondition.jsx can persist a size per cell via
// `quill.formatLine(index, length, 'cellWidth'|'cellHeight', value, 'user')`.
// Column width is intentionally a percentage (not px): this same content
// renders inside three differently-sized containers (the editor pane, the
// read-only viewer card, and the PDF page), so a percentage is what keeps a
// resized column looking proportionally the same in all three. Row height
// is stored on every cell of that row rather than on the row itself,
// because TableRow is a plain Container blot (not a formattable Block) —
// Quill has no attributor mechanism to hang a format off it directly.
const { Attributor, StyleAttributor, Scope } = Quill.import("parchment");
const CellWidthStyle = new StyleAttributor("cellWidth", "width", { scope: Scope.BLOCK });
const CellHeightStyle = new StyleAttributor("cellHeight", "height", { scope: Scope.BLOCK });
Quill.register(CellWidthStyle, true);
Quill.register(CellHeightStyle, true);

// The table's *own* width/indent (dragging its outer left/right edge) has
// the same "no formattable container" problem as row height, one level up
// — TableContainer (the <table> itself) is also a plain Container blot, not
// a Block, so it can't carry a format either. As a workaround the value is
// stored redundantly on every cell (same reasoning as cellHeight: it has to
// survive any single row/column later being deleted) as a plain data
// attribute rather than a real CSS style — this is structural metadata for
// TermsCondition.jsx to read back, not something meant to render directly
// off the cell. TermsCondition.jsx's extractTableSizing/injectTableSizing
// move the value on and off the actual <table style="..."> tag at the two
// points HTML crosses the Quill boundary (save/load), which is where it
// actually needs to live for the PDF/viewer to render it correctly.
const TableWidthAttr = new Attributor("tableWidth", "data-table-width", { scope: Scope.BLOCK });
const TableIndentAttr = new Attributor("tableIndent", "data-table-indent", { scope: Scope.BLOCK });
Quill.register(TableWidthAttr, true);
Quill.register(TableIndentAttr, true);

// Inline images (TermsCondition.jsx's Word-style image insert) need a
// durable S3 key attached so an expired signed-URL src can be refreshed
// later — see the data-s3-key handling in TermsCondition.jsx — and need
// width/height to survive a resize (ImageResizeHandles). Quill's own Image
// blot already tracks width/height/alt as formats (a hardcoded ATTRIBUTES
// list in quill/formats/image.js), so on paper reusing those literal names
// should have been enough. It wasn't, and the reason took an isolated
// Puppeteer test (loading Quill in a real browser with this exact
// registration, no app code involved) to actually pin down: this file
// separately registers CellWidthStyle above — a *table*-cell width format
// — as a StyleAttributor whose CSS property (`keyName`) is also literally
// "width". Confirmed directly: with CellWidthStyle registered, an image's
// width delta attribute silently resolves to that unrelated attributor
// instead of Image's own handling (it tries `node.style.width = "425"`,
// an invalid unitless CSS length that's just dropped) — remove
// CellWidthStyle and the image's width attribute starts working; keep it
// and rename the image's own format instead, and it also works, with no
// collision. So this subclass tracks width/height under its own
// non-colliding names (imgWidth/imgHeight) and translates them to the
// real width/height HTML attributes inside format() — verified in that
// same test to work correctly alongside CellWidthStyle, both directions
// (parsing saved HTML back in, and the insertEmbed+formatText commit flow
// TermsCondition.jsx's insertion/resize code actually uses).
//
// Also why this needs to be a full blot subclass rather than a plain
// Attributor the way CellWidthStyle/TableWidthAttr are: unlike Block
// blots (TableCell above), EmbedBlot.formats()/format() only ever consult
// the blot class's own hardcoded logic, never the generic Attributor
// registry — a standalone Attributor registered for an embed attribute
// would silently never be consulted at all.
const BaseImage = Quill.import("formats/image");
class TrackedImage extends BaseImage {
  static blotName = "image";
  static tagName = "IMG";
  static formats(domNode) {
    const formats = {};
    if (domNode.hasAttribute("alt")) formats.alt = domNode.getAttribute("alt");
    if (domNode.hasAttribute("width")) formats.imgWidth = domNode.getAttribute("width");
    if (domNode.hasAttribute("height")) formats.imgHeight = domNode.getAttribute("height");
    if (domNode.hasAttribute("data-s3-key")) formats["data-s3-key"] = domNode.getAttribute("data-s3-key");
    return formats;
  }
  format(name, value) {
    if (name === "imgWidth") {
      if (value) this.domNode.setAttribute("width", value);
      else this.domNode.removeAttribute("width");
    } else if (name === "imgHeight") {
      if (value) this.domNode.setAttribute("height", value);
      else this.domNode.removeAttribute("height");
    } else if (name === "data-s3-key") {
      if (value) this.domNode.setAttribute("data-s3-key", value);
      else this.domNode.removeAttribute("data-s3-key");
    } else {
      super.format(name, value);
    }
  }
}
Quill.register(TrackedImage, true);

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
  /* No height:auto override here on purpose — a CSS rule targeting height
     always beats the HTML height attribute, regardless of specificity, so
     an earlier version of this file forcing height:auto meant a resized
     image (ImageResizeHandles persists an explicit width AND height, not
     just width) silently lost its saved height on every reload, falling
     back to whatever height the browser auto-computes from the image's
     own intrinsic aspect ratio at its current width instead — a real,
     confirmed bug, not a hypothetical one. Quill's own max-width:100% (its
     own base CSS) still caps runaway width in a narrower container (e.g.
     the mobile layout) on its own; only the rarer case of *that specific
     clamp* actually kicking in and disproportionately squashing a
     resized image's height is traded away by not having this rule, which
     is the better trade against a bug that fired on every single reload. */
  /* list-style-position stays at its default ("outside") here, and
     padding-left is deliberately left untouched rather than zeroed —
     Quill's own base CSS already gives every <li> padding-left:1.5em
     (quill.snow.css), which is exactly the space a native "outside"
     marker needs to sit in. An earlier version of this rule forced
     "inside" positioning and zeroed that padding to line the marker up
     with the text — but "inside" makes the marker part of the text flow,
     so once a bullet/numbered line wraps, the second line has no reserved
     indent to fall back on and starts flush against the left edge instead
     of hanging under the first line's text (the standard Word/Google Docs
     behavior "outside" gives for free). */
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
  // ["table"],
  // ["image"],
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
  "table",
  "cellWidth",
  "cellHeight",
  "tableWidth",
  "tableIndent",
  // Unlike table/cellWidth/cellHeight/tableWidth/tableIndent above, this
  // doesn't need a custom Attributor: the value an inline image needs to
  // survive a save/reload round-trip is its S3 key (so a fresh signed URL
  // can be resolved later — see the data-s3-key handling in
  // TermsCondition.jsx), and Quill's own Image blot already serializes an
  // embed's live DOM node's attributes verbatim on save (it isn't a
  // TextBlot/ParentBlot, so quill/core/editor.js's convertHTML() falls
  // through to `blot.domNode.outerHTML`) — a plain setAttribute is enough
  // for that half. It just doesn't survive the *reload* half on its own,
  // which is what TermsCondition.jsx's reconciliation pass is for.
  "image",
  // imgWidth/imgHeight/data-s3-key deliberately aren't listed here, unlike
  // every other custom format in this file — verified directly (an
  // isolated Puppeteer test, not just reasoning about it) that listing
  // them does nothing but produce a confusing, harmless "Cannot register"
  // console warning: format application for an embed's own attributes
  // never consults this whitelist at all (TrackedImage's format()/
  // formats() are called directly, regardless of what's listed here).
];

// Quill's own clipboard config (CLIPBOARD_CONFIG in quill/modules/clipboard.js)
// only inserts a cell-separating newline for elements in its internal
// isLine() allow-list, which includes 'td' but not 'th' — so a pasted table
// whose header row uses <th> (common when copying a table straight off a
// web page) has all of that row's header cells silently merge into one
// blob instead of landing in separate cells. Quill's public
// clipboard.addMatcher() API lets us register an extra matcher for 'th'
// that does exactly what the built-in matcher does for 'td': make sure the
// cell's content ends with a newline before the table row matcher stamps it
// with a row id. Registered as `modules: { clipboard: { matchers:
// TERMS_CLIPBOARD_MATCHERS } }` in TermsCondition.jsx.
function matchTableHeaderCell(node, delta) {
  const endsWithNewline = (() => {
    for (let i = delta.ops.length - 1; i >= 0; i -= 1) {
      const op = delta.ops[i];
      if (typeof op.insert !== "string") break;
      if (op.insert.length === 0) continue;
      return op.insert.endsWith("\n");
    }
    return false;
  })();
  return endsWithNewline ? delta : delta.insert("\n");
}

export const TERMS_CLIPBOARD_MATCHERS = [["th", matchTableHeaderCell]];

// Popover ("Insert table") + floating context toolbar (row/column controls)
// shown while editing a table. Scoped to their own classes so they can't
// leak into any other UI on the page.
export const TERMS_TABLE_UI_CSS = `
  /* Portal target inserted directly after Quill's toolbar (see
     TermsCondition.jsx) — pinned just under it so the "Insert table" bar
     and the row/column context bar stay visible whether opened at the very
     start of a long document or while scrolled deep into it. top: is set
     imperatively (measured toolbar height changes with responsive wraps). */
  .terms-table-bar-sticky {
    position: sticky;
    z-index: 6;
  }
  .terms-table-popover-btn, .terms-table-context-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    color: #475569;
    cursor: pointer;
    padding: 6px;
  }
  .terms-table-popover-btn:hover, .terms-table-context-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }
  .terms-table-popover-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .terms-table-context-btn.danger:hover {
    background: #fdeceb;
    color: #c1352b;
    border-color: #f8d6d2;
  }
  .terms-table-col-handle, .terms-table-row-handle {
    position: absolute;
    background: transparent;
    z-index: 3;
  }
  .terms-table-col-handle {
    top: 0;
    width: 6px;
    margin-left: -3px;
    cursor: col-resize;
  }
  .terms-table-row-handle {
    left: 0;
    height: 6px;
    margin-top: -3px;
    cursor: row-resize;
  }
  .terms-table-col-handle:hover, .terms-table-col-handle.dragging,
  .terms-table-row-handle:hover, .terms-table-row-handle.dragging {
    background: #93c5fd;
    opacity: 0.6;
  }
`;

// Corner drag handles shown around an inline image while it's selected
// (see ImageResizeHandles in TermsCondition.jsx) — a small square at each
// corner, matching the familiar Word/Google Docs resize-handle look.
export const TERMS_IMAGE_UI_CSS = `
  .terms-image-resize-handle {
    position: absolute;
    z-index: 3;
    width: 10px;
    height: 10px;
    margin: -5px;
    background: #fff;
    border: 1.5px solid #2563eb;
    border-radius: 2px;
  }
  .terms-image-resize-handle:hover, .terms-image-resize-handle.dragging {
    background: #2563eb;
  }
  .terms-image-delete-btn {
    position: absolute;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: #fff;
    border: 1.5px solid #2563eb;
    border-radius: 50%;
    color: #c1352b;
    cursor: pointer;
  }
  .terms-image-delete-btn:hover {
    background: #fdeceb;
    border-color: #c1352b;
  }
`;
