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
};

// width/height/margin-left are deliberately NOT in ALLOWED_STYLES above
// (which sanitize-html applies to every tag via '*') — scoped instead to
// just the tags that legitimately write them (the table column/row resize
// handles in TermsCondition.jsx, via the cellWidth/cellHeight Quill formats
// in richTextConfig.js, plus extractTableSizing moving the table's own
// width/indent onto the <table> tag itself). A pasted width on a <p>/<span>
// (content copied from a web page/Word doc's own fixed-width layout, which
// Quill's own formats never produce) has no legitimate use here and is
// exactly what let one row of a client's Terms & Conditions overflow its
// printable/viewport width instead of wrapping — this is the actual
// storage-level boundary for that, same trust reasoning as ALLOWED_TAGS/
// ALLOWED_STYLES above: the frontend's sanitizeTermsHtml.js strips this
// defensively on every render too, but that's the browser, not the
// boundary — a direct API call, or any future consumer that renders this
// field without going through that frontend sanitizer, must not be able to
// store it in the first place.
const SIZE_VALUE = [/^\d+(\.\d+)?(px|%)$/];
const TABLE_SIZE_STYLES = { width: SIZE_VALUE, height: SIZE_VALUE };

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
    allowedStyles: {
      '*': ALLOWED_STYLES,
      table: { ...TABLE_SIZE_STYLES, 'margin-left': SIZE_VALUE },
      td: TABLE_SIZE_STYLES,
      th: TABLE_SIZE_STYLES,
    },
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
