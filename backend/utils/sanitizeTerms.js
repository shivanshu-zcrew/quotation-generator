const sanitizeHtml = require('sanitize-html');

// termsAndConditions is accepted directly from the client (the Quill rich
// text editor in the frontend) with no other validation. This is the actual
// security boundary for that field — sanitizing only in the browser doesn't
// stop a direct API call — so every consumer downstream (PDF/Puppeteer
// rendering, Zoho export, admin views) gets safe HTML regardless of how it
// was written.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'a',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'img',
];

const ALLOWED_STYLES = {
  color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
  'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
  'font-family': [/^[a-zA-Z-]+$/],
  'font-size': [/^\d+(\.\d+)?px$/],
  'text-align': [/^(left|right|center|justify)$/],
  'text-decoration': [/^(underline|line-through|none)$/],
  'font-weight': [/^(bold|normal|[1-9]00)$/],
  'font-style': [/^(italic|normal)$/],
  // Written by the table column/row resize handles (TermsCondition.jsx) via
  // the cellWidth/cellHeight Quill formats registered in richTextConfig.js.
  // Numeric px/% lengths only — no calc()/url()/expression() vectors.
  width: [/^\d+(\.\d+)?(px|%)$/],
  height: [/^\d+(\.\d+)?(px|%)$/],
  // Written on the <table> tag itself (not a cell) by the outer left-edge
  // drag handle — see extractTableSizing in TermsCondition.jsx, which is
  // what moves this from the cells it's tracked on during editing onto the
  // table tag before this sanitizer ever sees it.
  'margin-left': [/^\d+(\.\d+)?(px|%)$/],
};

function sanitizeTerms(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['style', 'class'],
      p: ['style'],
      li: ['style', 'data-list', 'class'],
      ol: ['class'],
      // data-row is written by Quill's built-in table module (TableCell
      // blot) to group cells into rows — dropping it wouldn't visibly
      // break the table on this render, but would silently lose the row
      // grouping the next time this HTML is loaded back into the editor.
      td: ['data-row'],
      th: ['data-row'],
      // src/alt/width/height are the standard img attributes Quill's own
      // Image blot writes (quill/formats/image.js). data-s3-key is this
      // app's own addition — the durable S3 key an inline image's src (a
      // signed URL that expires within an hour — see the comment above
      // reconcileInlineImages in TermsCondition.jsx) gets resolved from
      // whenever the image needs refreshing.
      img: ['src', 'alt', 'width', 'height', 'data-s3-key'],
      '*': ['style'],
    },
    allowedStyles: { '*': ALLOWED_STYLES },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Scoped separately from the general allowedSchemes above (which is for
    // <a href>, and has no business allowing data: URIs) — matches what
    // Quill's own Image.sanitize() already restricts to client-side.
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

module.exports = { sanitizeTerms };
