import React from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";

const BASE_URL = "";

export const newPoint = () => ({
  id: `pt-${Date.now()}-${Math.random()}`,
  text: "",
});

export const newSection = () => ({
  id: `sec-${Date.now()}-${Math.random()}`,
  heading: "",
  points: [newPoint()],
  images: [],
});

const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ─────────────────────────────────────────────────────────────
// sectionsToHTMLWithoutImages — for DB storage (Cloudinary URLs only, no base64)
// ─────────────────────────────────────────────────────────────
export const sectionsToHTMLWithoutImages = (sections) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  let sNum = 0;
  
  return safeSections
    .map((sec) => {
      if (!sec) return "";
      
      const points = Array.isArray(sec.points) ? sec.points : [];
      const filledPts = points.filter((p) => p && p.text && p.text.trim());
      const images = Array.isArray(sec.images) ? sec.images : [];
      
      // ✅ DB storage: only persist Cloudinary URLs, never base64 blobs
      const cloudinaryImages = images.filter(img => img.url && !img.url.startsWith('data:'));

      if (!sec.heading && !filledPts.length && !cloudinaryImages.length) return "";
      sNum += 1;

      let html = '<div style="margin-bottom:12px;">';

      if (sec.heading) {
        html += `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;"><span style="font-weight:700;color:#6366f1;font-size:11px;min-width:18px;">${sNum}.</span><span style="font-weight:700;font-size:11px;color:#0f172a;">${escapeHtml(sec.heading)}</span></div>`;
      }

      filledPts.forEach((p, j) => {
        html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px;padding-left:18px;"><span style="font-weight:600;color:#6366f1;font-size:10px;min-width:28px;flex-shrink:0;">${sNum}.${j + 1}</span><span style="font-size:10px;color:#374151;line-height:1.5;">${escapeHtml(p.text)}</span></div>`;
      });

      if (cloudinaryImages.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;padding-left:18px;margin-top:8px;">';
        cloudinaryImages.forEach((img) => {
          html += `<div style="position:relative;"><img src="${img.url}" style="max-width:200px;max-height:150px;border-radius:4px;border:1px solid #e2e8f0;" /></div>`;
        });
        html += '</div>';
      }

      html += "</div>";
      return html;
    })
    .join("");
};

// ─────────────────────────────────────────────────────────────
// sectionsToHTML — for PDF generation (includes ALL images: base64 + Cloudinary)
//
// FIX: Removed the !img.url.startsWith('data:') guard.
// During PDF export, images are pre-converted to base64 data-URIs before
// this function is called. The old guard was blocking them, causing terms
// images to be missing from PDF output even though they showed in the UI.
//
// sectionsToHTMLWithoutImages keeps its Cloudinary-only filter (DB storage).
// ─────────────────────────────────────────────────────────────
export const sectionsToHTML = (sections) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  let sNum = 0;
  
  return safeSections
    .map((sec) => {
      if (!sec) return "";
      
      const points = Array.isArray(sec.points) ? sec.points : [];
      const filledPts = points.filter((p) => p && p.text && p.text.trim());
      const images = Array.isArray(sec.images) ? sec.images : [];

      if (!sec.heading && !filledPts.length && !images.length) return "";
      sNum += 1;

      let html = '<div style="margin-bottom:12px;">';

      if (sec.heading) {
        html += `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;"><span style="font-weight:700;color:#6366f1;font-size:11px;min-width:18px;">${sNum}.</span><span style="font-weight:700;font-size:11px;color:#0f172a;">${escapeHtml(sec.heading)}</span></div>`;
      }

      filledPts.forEach((p, j) => {
        html += `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px;padding-left:18px;"><span style="font-weight:600;color:#6366f1;font-size:10px;min-width:28px;flex-shrink:0;">${sNum}.${j + 1}</span><span style="font-size:10px;color:#374151;line-height:1.5;">${escapeHtml(p.text)}</span></div>`;
      });

      // ✅ FIX: include ALL images with a URL (base64 data-URI or Cloudinary URL)
      // Previously this had: if (img.url && !img.url.startsWith('data:'))
      // which stripped freshly-uploaded (base64) images from the PDF HTML.
      const renderableImages = images.filter(img => img.url);
      if (renderableImages.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;padding-left:18px;margin-top:8px;">';
        renderableImages.forEach((img) => {
          html += `<div style="position:relative;"><img src="${img.url}" style="max-width:200px;max-height:150px;border-radius:4px;border:1px solid #e2e8f0;" /></div>`;
        });
        html += '</div>';
      }

      html += "</div>";
      return html;
    })
    .join("");
};

// ─────────────────────────────────────────────────────────────
// htmlToSections — parse saved HTML back to editor state
// ─────────────────────────────────────────────────────────────
export const htmlToSections = (html, cloudinaryImages = []) => {
  if (!html || !html.trim()) {
    if (cloudinaryImages.length > 0) {
      const images = cloudinaryImages.map((img) => ({
        id: img._id || `img-${Date.now()}-${Math.random()}`,
        url: img.url,
        publicId: img.publicId,
        fileName: img.fileName,
        isTemp: false
      }));
      return [{ id: `sec-${Date.now()}`, heading: "", points: [newPoint()], images }];
    }
    return [newSection()];
  }

  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const sectionDivs = Array.from(tempDiv.children).filter(
      (el) => el.tagName === "DIV" && el.style.marginBottom === "12px"
    );

    if (sectionDivs.length > 0) {
      return sectionDivs.map((sectionDiv, sectionIndex) => {
        const headingDiv = sectionDiv.querySelector('div[style*="display:flex;align-items:baseline;gap:6px;"]');
        const headingTextSpan = headingDiv?.querySelector('span[style*="font-weight:700;font-size:11px;color:#0f172a;"]');
        const heading = headingTextSpan?.textContent?.trim() || "";

        const pointDivs = Array.from(
          sectionDiv.querySelectorAll('div[style*="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px;padding-left:18px;"]')
        );
        const points = pointDivs.map((pointDiv) => {
          const textSpan = pointDiv.querySelector('span[style*="font-size:10px;color:#374151;line-height:1.5;"]');
          return { id: `pt-${Date.now()}-${Math.random()}`, text: textSpan?.textContent?.trim() || "" };
        });

        let sectionImages = [];
        if (cloudinaryImages.length > 0) {
          const imagesWithIndex = cloudinaryImages.filter(img => img.sectionIndex === sectionIndex);
          sectionImages = imagesWithIndex.length > 0 ? imagesWithIndex : (sectionIndex === 0 ? cloudinaryImages : []);
        }
        const images = sectionImages.map(img => ({
          id: img._id || `img-${Date.now()}-${Math.random()}`,
          url: img.url, publicId: img.publicId, fileName: img.fileName, isTemp: false
        }));

        return {
          id: `sec-${Date.now()}-${Math.random()}`,
          heading,
          points: points.length ? points : (images.length > 0 ? [] : [newPoint()]),
          images,
        };
      });
    }

    if (cloudinaryImages.length > 0) {
      return [{
        id: `sec-${Date.now()}`, heading: "", points: [newPoint()],
        images: cloudinaryImages.map(img => ({ id: img._id || `img-${Date.now()}-${Math.random()}`, url: img.url, publicId: img.publicId, fileName: img.fileName, isTemp: false }))
      }];
    }
  } catch (error) {
    console.error("Error parsing terms HTML:", error);
  }
  return [newSection()];
};

// ─────────────────────────────────────────────────────────────
// TermsEditor — edit mode
// ─────────────────────────────────────────────────────────────
export default function TermsEditor({ sections = [], onChange }) {
  const safeSections = Array.isArray(sections) ? sections : [];

  const updateSection = (id, patch) => onChange(prev => prev.map((s) => s?.id === id ? { ...s, ...patch } : s));
  const addPoint     = (secId) => onChange(prev => prev.map(section => section?.id !== secId ? section : { ...section, points: [...(section.points || []), newPoint()] }));
  const deletePoint  = (secId, ptId) => onChange(prev => prev.map(section => section?.id !== secId ? section : { ...section, points: (section.points || []).filter(p => p?.id !== ptId) }));
  const updatePoint  = (secId, ptId, text) => onChange(prev => prev.map(section => section?.id !== secId ? section : { ...section, points: (section.points || []).map(p => p?.id === ptId ? { ...p, text } : p) }));

  const handleAddImage = (secId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange(prev => prev.map(section => {
        if (section?.id !== secId) return section;
        const newImage = { id: `img-${Date.now()}-${Math.random()}`, url: reader.result, isTemp: true, fileName: file.name };
        return { ...section, images: [...(section.images || []), newImage] };
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveImage = (secId, imgId) => {
    onChange(prev => prev.map(section => section?.id !== secId ? section : { ...section, images: (section.images || []).filter(img => img?.id !== imgId) }));
  };

  return (
    <div>
      {safeSections.map((sec, secIdx) => {
        if (!sec) return null;
        const points = Array.isArray(sec.points) ? sec.points : [];
        const images = Array.isArray(sec.images) ? sec.images : [];

        return (
          <div key={sec.id} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "1rem 1.1rem", marginBottom: "0.75rem", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <span style={{ background: "#eff1ff", color: "#6366f1", borderRadius: "6px", padding: "2px 9px", fontSize: "0.72rem", fontWeight: "700" }}>Section {secIdx + 1}</span>
              <div style={{ flex: 1 }} />
              {safeSections.length > 1 && (
                <button onClick={() => onChange(safeSections.filter(s => s?.id !== sec.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "3px", display: "flex", borderRadius: "5px" }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <input value={sec.heading || ""} onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
              placeholder="Section heading (e.g. 1. Scope of Work)"
              onFocus={(e) => (e.target.style.borderBottomColor = "#6366f1")}
              onBlur={(e) => (e.target.style.borderBottomColor = "#e2e8f0")}
              style={{ width: "100%", border: "none", borderBottom: "2px solid #e2e8f0", padding: "0.3rem 0.1rem", fontSize: "0.9375rem", fontWeight: "700", color: "#0f172a", outline: "none", background: "transparent", marginBottom: "0.75rem", fontFamily: "inherit", boxSizing: "border-box" }} />

            <div style={{ marginBottom: "0.6rem" }}>
              {points.map((pt, ptIdx) => (
                <div key={pt?.id || ptIdx} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.8rem", paddingTop: "0.42rem", width: "18px", textAlign: "right", flexShrink: 0 }}>{ptIdx + 1}.</span>
                  <textarea value={pt?.text || ""} rows={1} placeholder={`Point ${ptIdx + 1}`}
                    onChange={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; pt?.id && updatePoint(sec.id, pt.id, e.target.value); }}
                    onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
                    onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                    style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "7px", padding: "0.38rem 0.6rem", fontSize: "0.875rem", color: "#374151", outline: "none", fontFamily: "inherit", resize: "none", lineHeight: "1.5", minHeight: "36px", overflow: "hidden" }} />
                  {points.length > 1 && (
                    <button onClick={() => pt?.id && deletePoint(sec.id, pt.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px", paddingTop: "0.42rem", display: "flex", borderRadius: "5px" }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={() => addPoint(sec.id)} style={{ background: "#eff1ff", color: "#6366f1", border: "none", borderRadius: "7px", padding: "0.3rem 0.7rem", fontSize: "0.78rem", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontFamily: "inherit" }}>
                <Plus size={12} /> Add Point
              </button>
              <input type="file" accept="image/*" id={`sec-img-${sec.id}`} style={{ display: "none" }} onChange={(e) => handleAddImage(sec.id, e)} />
              <label htmlFor={`sec-img-${sec.id}`} style={{ background: images.length > 0 ? "#fef3c7" : "#f0fdf4", color: images.length > 0 ? "#92400e" : "#065f46", border: "none", borderRadius: "7px", padding: "0.3rem 0.7rem", fontSize: "0.78rem", fontWeight: "600", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.3rem", fontFamily: "inherit" }}>
                <Upload size={12} /> {images.length > 0 ? `Add Image (${images.length})` : "Add Image"}
              </label>
            </div>

            {images.length > 0 && (
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {images.map((img, imgIdx) => (
                  <div key={img.id || imgIdx} style={{ position: "relative", display: "inline-block" }}>
                    <img src={img.url} alt={`section-${secIdx}-img-${imgIdx}`} style={{ maxWidth: "120px", maxHeight: "100px", objectFit: "contain", borderRadius: "8px", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }} />
                    <button onClick={() => handleRemoveImage(sec.id, img.id)} style={{ position: "absolute", top: "-7px", right: "-7px", background: "#ef4444", color: "white", border: "none", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "11px" }}>×</button>
                    {img.fileName && (
                      <div style={{ fontSize: "0.6rem", color: "#6b7280", textAlign: "center", marginTop: "2px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {img.fileName.length > 15 ? img.fileName.slice(0, 12) + "..." : img.fileName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={() => onChange([...safeSections, newSection()])} style={{ width: "100%", padding: "0.7rem", background: "#eff1ff", color: "#6366f1", border: "1.5px dashed #c7d2fe", borderRadius: "10px", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontFamily: "inherit" }}>
        <Plus size={15} /> Add Section
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TermsViewer — view mode
// ─────────────────────────────────────────────────────────────
export function TermsViewer({ sections = [] }) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const hasContent = safeSections.some(s => s && ((s.heading||"").trim() || (Array.isArray(s.points) && s.points.some(p => p && (p.text||"").trim())) || (Array.isArray(s.images) && s.images.length > 0)));
  if (!hasContent) return <div style={{ padding: "1rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.375rem", minHeight: "80px", color: "#9ca3af" }}>No terms &amp; conditions</div>;

  let sectionNum = 0;
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "0.375rem" }}>
      {safeSections.map((sec, i) => {
        if (!sec) return null;
        const points = Array.isArray(sec.points) ? sec.points : [];
        const filledPts = points.filter(p => p && (p.text||"").trim());
        const images = Array.isArray(sec.images) ? sec.images : [];
        if (!(sec.heading||"").trim() && !filledPts.length && !images.length) return null;
        sectionNum += 1;
        const sNum = sectionNum;

        return (
          <div key={sec.id || i} style={{ display: "flex", gap: "24px", justifyContent: "space-between", borderBottom: i < safeSections.length - 1 ? "1px dotted #d1d5db" : "none", padding: "1rem 0" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: "700", color: "#6366f1", fontSize: "0.9375rem", minWidth: "1.8rem", flexShrink: 0 }}>{sNum}.</span>
                {sec.heading
                  ? <span style={{ fontWeight: "700", color: "#0f172a", fontSize: "0.9375rem", lineHeight: "1.4" }}>{sec.heading}</span>
                  : <span style={{ color: "#9ca3af", fontSize: "0.875rem", fontStyle: "italic" }}>Untitled section</span>}
              </div>
              {filledPts.length > 0 && (
                <div style={{ paddingLeft: "2rem" }}>
                  {filledPts.map((pt, j) => (
                    <div key={pt?.id || j} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.4rem" }}>
                      <span style={{ fontWeight: "600", color: "#6366f1", fontSize: "0.8125rem", minWidth: "2.5rem", flexShrink: 0 }}>{sNum}.{j + 1}</span>
                      <span style={{ color: "#374151", fontSize: "0.875rem", lineHeight: "1.55", flex: 1 }}>{pt?.text || ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {images.length > 0 && (
                <div style={{ paddingLeft: "2rem", marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {images.map((img, imgIdx) => img.url ? (
                    <img key={img.id || imgIdx} src={img.url} alt={`section-${i}-img-${imgIdx}`}
                      style={{ maxWidth: "180px", maxHeight: "120px", borderRadius: "6px", border: "1px solid #e2e8f0", objectFit: "contain" }}
                      onError={(e) => { e.target.style.display = "none"; }} />
                  ) : null)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}