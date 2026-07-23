import React, { useState, useRef, useEffect } from "react";
import { Upload, AlertCircle } from "lucide-react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { CommentableHtml, CommentBadge } from "./ReviewComments";
import { sanitizeTermsHtml } from "../utils/sanitizeTermsHtml";
import {
  TERMS_TOOLBAR_MODULE,
  TERMS_EDITOR_FORMATS,
  TERMS_PICKER_LABEL_CSS,
  TERMS_CONTENT_CSS,
  TERMS_STICKY_TOOLBAR_CSS,
  TERMS_TOOLBAR_THEME_CSS,
} from "../utils/richTextConfig";

// The Terms editor's toolbar sticks to the top of the page while scrolling
// (see TERMS_STICKY_TOOLBAR_CSS). Some pages that host this editor (e.g.
// ViewQuotationScreen) have their own sticky page header above it, which
// would otherwise overlap at the same top:0 position. Measure any such
// sticky content once on mount (and on resize) so the toolbar sticks just
// below it instead, without every host page needing to know about /
// configure this editor's internals.
function useStickyToolbarOffset(ref) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const compute = () => {
      const el = ref.current;
      if (!el) return;
      let total = 0;
      document.querySelectorAll('[style*="sticky"]').forEach((node) => {
        if (node === el || el.contains(node) || node.contains(el)) return;
        const style = window.getComputedStyle(node);
        if (style.position !== 'sticky') return;
        const top = parseFloat(style.top);
        if (Number.isNaN(top) || top > 4) return; // only headers pinned at the very top
        if (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          total += node.getBoundingClientRect().height;
        }
      });
      setOffset(total);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [ref]);

  return offset;
}

// Simple Section Structure
export const newSection = () => ({
  id: `sec-${Date.now()}-${Math.random()}`,
  heading: "",
  content: "",
  images: [],
});

// ============================================================
// HTML content helpers
// ============================================================
// Old records stored plain text (with literal "\n" line breaks); new records
// store real HTML produced by the Quill editor below. Both are kept in
// `content` — this heuristic tells them apart wherever `content` is
// consumed (viewer, PDF export, persistence).
const HTML_TAG_RE = /<[a-z][\s\S]*>/i;
export const isHtmlContent = (str) => HTML_TAG_RE.test(str || "");

// Legacy plain text needs "\n" converted to "<br>" before being treated as
// HTML — otherwise browsers/Quill collapse raw newlines to spaces.
const toHtmlContent = (content) => {
  if (!content) return "";
  return isHtmlContent(content) ? content : content.replace(/\n/g, "<br>");
};

// Quill's empty-editor output is "<p><br></p>" — not an empty string, so a
// plain truthiness/`.trim()` check treats it as "has content". Strip tags to
// check for real visible text.
const stripTags = (html) => (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

// ============================================================
// For PDF Export and for persistence (the payload sent to the backend)
// ============================================================
export const sectionsToHTML = (sections) => {
  const safeSections = Array.isArray(sections) ? sections : [];

  return safeSections.map((sec, idx) => {
    if (!sec) return "";

    const contentHtml = toHtmlContent(sec.content);
    const hasContent = stripTags(contentHtml).length > 0;
    const hasHeading = !!sec.heading?.trim();

    if (!hasHeading && !hasContent) return "";

    // The common case (no heading) — persist/export the content directly.
    // Wrapping it in a decorative div here and never unwrapping it on load
    // would nest one more wrapper on every edit/save cycle.
    if (!hasHeading) return contentHtml;

    let html = `<div style="margin-bottom:28px;">`;
    html += `<h4 style="font-weight:700;color:#0f172a;margin-bottom:12px;">${idx + 1}. ${sec.heading}</h4>`;
    if (hasContent) {
      html += `<div style="line-height:1.85;color:#374151;">${contentHtml}</div>`;
    }
    html += `</div>`;
    return html;
  }).join("");
};

export const sectionsToHTMLWithoutImages = sectionsToHTML;

// ============================================================
// htmlToSections - converts the persisted string back into section format
// ============================================================
export const htmlToSections = (rawText = "", existingImages = []) => {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === "") {
    return [newSection()];
  }

  return [{
    id: `sec-${Date.now()}`,
    heading: "",
    content: toHtmlContent(rawText.trim()),
    images: existingImages || []
  }];
};

// ============================================================
// TermsEditor with Image Upload — S3 direct upload version
// ============================================================
export default function TermsEditor({
  sections = [],
  onChange,
  termsImages = [],
  onTermsImagesUpload,
  onRemoveTermsImage,
  onError, // optional: parent can surface this via its snackbar/toast
  commentProps,
}) {
  const safeSections = Array.isArray(sections) && sections.length > 0 ? sections : [newSection()];

  const rootRef = useRef(null);
  const toolbarOffset = useStickyToolbarOffset(rootRef);

  // Inline error so the component gives feedback even with no parent handler.
  const [uploadError, setUploadError] = useState("");

  const updateSection = (id, patch) => {
    onChange(prev => prev.map(s => s?.id === id ? { ...s, ...patch } : s));
  };

  const raiseError = (msg) => {
    setUploadError(msg);
    if (onError) onError(msg);
  };

  // Only images are allowed. If the user picks any non-image file, reject the
  // whole selection with a clear error rather than silently dropping it.
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // reset so the same file can be re-picked after fixing
    if (files.length === 0) return;

    const nonImages = files.filter(file => !file.type.startsWith("image/"));

    if (nonImages.length > 0) {
      const names = nonImages.map(f => `"${f.name}"`).join(", ");
      raiseError(
        nonImages.length === 1
          ? `${names} is not an image. Only image files (JPG, PNG, GIF, WebP) are allowed.`
          : `${names} are not images. Only image files (JPG, PNG, GIF, WebP) are allowed.`
      );
      return; // reject the entire selection — nothing gets uploaded
    }

    // All good — clear any previous error and hand the valid images to the parent.
    setUploadError("");
    if (onTermsImagesUpload) {
      onTermsImagesUpload(files);
    }
  };

  return (
    <div ref={rootRef} style={{ '--terms-toolbar-top': `${toolbarOffset}px` }}>
      <style>{TERMS_PICKER_LABEL_CSS}{TERMS_TOOLBAR_THEME_CSS}{TERMS_STICKY_TOOLBAR_CSS}</style>
      {safeSections.map((sec) => (
        <div key={sec.id} style={{
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1rem"
        }}>
          {/* Rich text editor */}
          {commentProps && <CommentBadge {...commentProps} />}
          <div className="terms-quill-wrapper" style={{ marginBottom: "1rem" }}>
            <ReactQuill
              theme="snow"
              defaultValue={sec.content || ""}
              onChange={(html) => updateSection(sec.id, { content: html })}
              placeholder="Write your terms and conditions here..."
              modules={{ toolbar: TERMS_TOOLBAR_MODULE }}
              formats={TERMS_EDITOR_FORMATS}
            />
          </div>

          {/* Add Image Button */}
          <div style={{ marginTop: "1rem" }}>
            <label
              htmlFor="terms-image-upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#f1f5f9",
                color: "#475569",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.9rem",
                border: "1px solid #e2e8f0",
                fontWeight: "500"
              }}
            >
              <Upload size={18} />
              Add Image to Terms & Conditions
            </label>
            <input
              type="file"
              id="terms-image-upload"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
          </div>

          {/* Non-image rejection error */}
          {uploadError && (
            <div style={{
              marginTop: "0.75rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              background: "#fdeceb",
              border: "1px solid #f8d6d2",
              borderRadius: "8px",
              padding: "0.6rem 0.8rem",
              fontSize: "0.8rem",
              color: "#c1352b",
              fontWeight: 500
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Preview Uploaded Images */}
          {termsImages && termsImages.length > 0 && (
            <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {termsImages.map((img, index) => (
                <div key={img.id || index} style={{
                  position: "relative",
                  width: "120px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc"
                }}>
                  <img
                    src={img.url || img.base64}
                    alt={img.fileName || "terms"}
                    style={{ width: "100%", height: "80px", objectFit: "cover", display: "block", opacity: img.uploading ? 0.5 : 1 }}
                  />
                  {img.uploading && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.65rem",
                      color: "#475569",
                      background: "rgba(255,255,255,0.4)"
                    }}>
                      Uploading…
                    </div>
                  )}
                  <button
                    onClick={() => onRemoveTermsImage && onRemoveTermsImage(img.id)}
                    style={{
                      position: "absolute",
                      top: "4px",
                      right: "4px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "50%",
                      width: "20px",
                      height: "20px",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    ×
                  </button>
                  {img.fileName && (
                    <div style={{
                      fontSize: "0.6rem",
                      color: "#6b7280",
                      textAlign: "center",
                      padding: "4px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {img.fileName.length > 15 ? img.fileName.slice(0, 12) + "..." : img.fileName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// TermsViewer - displays formatted content and images
// ============================================================
export function TermsViewer({ sections = [], termsImages = [], commentProps }) {
  const safeSections = Array.isArray(sections) ? sections : [];

  let allImages = [...termsImages];

  safeSections.forEach(sec => {
    if (sec.images && Array.isArray(sec.images)) {
      sec.images.forEach(img => {
        if (img.url && !allImages.some(existing => existing.url === img.url)) {
          allImages.push(img);
        }
      });
    }
  });

  const hasTextContent = safeSections.some(sec =>
    (sec.heading?.trim()) || stripTags(toHtmlContent(sec.content)).length > 0
  );

  const hasImages = allImages.length > 0;

  if (!hasTextContent && !hasImages) {
    return (
      <div style={{
        padding: "3rem",
        background: "#f8fafc",
        borderRadius: "12px",
        textAlign: "center",
        color: "#94a3b8",
        border: "1px dashed #e2e8f0"
      }}>
        No terms and conditions added.
      </div>
    );
  }

  return (
    <div style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "2.5rem",
      fontSize: "0.97rem",
      color: "#1f2937"
    }}>
      <style>{TERMS_CONTENT_CSS}</style>
      {safeSections.map((sec, idx) => {
        const contentHtml = toHtmlContent(sec.content);
        const hasContent = stripTags(contentHtml).length > 0;
        return (
          <div key={sec.id} style={{ marginBottom: "2.8rem" }}>
            {sec.heading?.trim() && (
              <h4 style={{
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: "1.25rem",
                fontSize: "1.1rem"
              }}>
                {idx + 1}. {sec.heading}
              </h4>
            )}

            {hasContent && (
              commentProps ? (
                <CommentableHtml
                  {...commentProps}
                  html={sanitizeTermsHtml(contentHtml)}
                />
              ) : (
                <div className="ql-snow">
                  <div
                    className="ql-editor"
                    style={{ padding: 0, color: "#374151" }}
                    dangerouslySetInnerHTML={{ __html: sanitizeTermsHtml(contentHtml) }}
                  />
                </div>
              )
            )}
          </div>
        );
      })}

      {allImages.length > 0 && (
        <div style={{ marginTop: "2rem", display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {allImages.map((img, idx) => (
            <img
              key={img.id || idx}
              src={img.url || img.base64}
              alt={img.fileName || `terms-${idx}`}
              style={{ maxWidth: "200px", maxHeight: "150px", borderRadius: "8px", border: "1px solid #e2e8f0", objectFit: "contain" }}
              onError={(e) => {
                console.error('Image failed to load:', img.url);
                e.target.style.display = 'none';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
