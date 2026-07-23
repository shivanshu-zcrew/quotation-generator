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
      '*': ['style'],
    },
    allowedStyles: { '*': ALLOWED_STYLES },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

module.exports = { sanitizeTerms };
