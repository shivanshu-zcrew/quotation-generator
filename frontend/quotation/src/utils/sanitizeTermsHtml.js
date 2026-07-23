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

export function sanitizeTermsHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
