import React from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";

const BASE_URL = "http://51.20.109.158:5000";

// ─────────────────────────────────────────────────────────────
// Factory helpers — exported so parent components can init state
// ─────────────────────────────────────────────────────────────
export const newPoint = () => ({
  id: `pt-${Date.now()}-${Math.random()}`,
  text: "",
});
export const newSection = () => ({
  id: `sec-${Date.now()}-${Math.random()}`,
  heading: "",
  points: [newPoint()],
  image: null,
});

// ─────────────────────────────────────────────────────────────
// sectionsToHTML  — for DB storage + PDF
// ─────────────────────────────────────────────────────────────
export const sectionsToHTML = (sections) => {
  let sNum = 0;
  return (sections || [])
    .map((sec) => {
      const filledPts = sec.points.filter((p) => p.text.trim());
      const imgSrc = sec.image || "";

      // Skip empty sections
      if (!sec.heading && !filledPts.length && !imgSrc) return "";

      sNum += 1;

      // Build section HTML
      let html = '<div style="margin-bottom:12px;">';

      // Section heading
      if (sec.heading) {
        html += `
            <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;">
              <span style="font-weight:700;color:#6366f1;font-size:11px;min-width:18px;">${sNum}.</span>
              <span style="font-weight:700;font-size:11px;color:#0f172a;">${sec.heading}</span>
            </div>
          `;
      }

      // Section points
      filledPts.forEach((p, j) => {
        html += `
            <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px;padding-left:18px;">
              <span style="font-weight:600;color:#6366f1;font-size:10px;min-width:28px;flex-shrink:0;">${sNum}.${
          j + 1
        }</span>
              <span style="font-size:10px;color:#374151;line-height:1.5;">${
                p.text
              }</span>
            </div>
          `;
      });

      // Section image
      if (imgSrc) {
        html += `
            <div style="padding-left:18px;margin-top:5px;">
              <img src="${imgSrc}" style="max-width:300px;border-radius:4px;" />
            </div>
          `;
      }

      html += "</div>";
      return html;
    })
    .join("");
};

// ─────────────────────────────────────────────────────────────
// htmlToSections  — parse saved HTML back to editor state
// ─────────────────────────────────────────────────────────────
export const htmlToSections = (html) => {
  if (!html || !html.trim()) return [newSection()];

  try {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    // Get all top-level section divs
    const sectionDivs = Array.from(tempDiv.children).filter(
      (el) => el.tagName === "DIV" && el.style.marginBottom === "12px"
    );

    if (sectionDivs.length > 0) {
      return sectionDivs.map((sectionDiv) => {
        // Extract heading
        const headingDiv = sectionDiv.querySelector(
          'div[style*="display:flex;align-items:baseline;gap:6px;"]'
        );
        const headingSpan = headingDiv?.querySelector(
          'span[style*="font-weight:700;color:#6366f1;"]'
        );
        const headingTextSpan = headingDiv?.querySelector(
          'span[style*="font-weight:700;font-size:11px;color:#0f172a;"]'
        );

        const heading = headingTextSpan?.textContent?.trim() || "";

        // Extract points
        const pointDivs = Array.from(
          sectionDiv.querySelectorAll(
            'div[style*="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px;padding-left:18px;"]'
          )
        );

        const points = pointDivs.map((pointDiv) => {
          const textSpan = pointDiv.querySelector(
            'span[style*="font-size:10px;color:#374151;line-height:1.5;"]'
          );
          return {
            id: `pt-${Date.now()}-${Math.random()}`,
            text: textSpan?.textContent?.trim() || "",
          };
        });

        // Extract image
        const imgDiv = sectionDiv.querySelector(
          'div[style*="padding-left:18px;margin-top:5px;"]'
        );
        const img = imgDiv?.querySelector("img");
        const imageSrc = img?.getAttribute("src") || null;

        return {
          id: `sec-${Date.now()}-${Math.random()}`,
          heading,
          points: points.length ? points : [newPoint()],
          image: imageSrc,
        };
      });
    }

    // Fallback: if no structured sections found, try to parse as plain text
    const textContent = tempDiv.textContent || tempDiv.innerText || "";
    if (textContent.trim()) {
      return [
        {
          id: `sec-${Date.now()}`,
          heading: "",
          points: [{ id: `pt-${Date.now()}`, text: textContent.trim() }],
          image: null,
        },
      ];
    }
  } catch (error) {
    console.error("Error parsing terms HTML:", error);
  }

  return [newSection()];
};

// ─────────────────────────────────────────────────────────────
// TermsEditor  — edit mode
// Props:  sections, onChange(sections[])
// ─────────────────────────────────────────────────────────────
export default function TermsEditor({ sections, onChange }) {
  const updateSection = (id, patch) =>
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addPoint = (secId) => {
    const sec = sections.find((s) => s.id === secId);
    updateSection(secId, { points: [...sec.points, newPoint()] });
  };

  const deletePoint = (secId, ptId) => {
    const sec = sections.find((s) => s.id === secId);
    updateSection(secId, { points: sec.points.filter((p) => p.id !== ptId) });
  };

  const updatePoint = (secId, ptId, text) => {
    const sec = sections.find((s) => s.id === secId);
    updateSection(secId, {
      points: sec.points.map((p) => (p.id === ptId ? { ...p, text } : p)),
    });
  };

  const handleSectionImage = (secId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSection(secId, { image: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div>
      {sections.map((sec, secIdx) => (
        <div
          key={sec.id}
          style={{
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1rem 1.1rem",
            marginBottom: "0.75rem",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.6rem",
            }}
          >
            <span
              style={{
                background: "#eff1ff",
                color: "#6366f1",
                borderRadius: "6px",
                padding: "2px 9px",
                fontSize: "0.72rem",
                fontWeight: "700",
              }}
            >
              Section {secIdx + 1}
            </span>
            <div style={{ flex: 1 }} />
            {sections.length > 1 && (
              <button
                onClick={() =>
                  onChange(sections.filter((s) => s.id !== sec.id))
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ef4444",
                  padding: "3px",
                  display: "flex",
                  borderRadius: "5px",
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          {/* Heading */}
          <input
            value={sec.heading}
            onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
            placeholder="Section heading (e.g. 1. Scope of Work)"
            onFocus={(e) => (e.target.style.borderBottomColor = "#6366f1")}
            onBlur={(e) => (e.target.style.borderBottomColor = "#e2e8f0")}
            style={{
              width: "100%",
              border: "none",
              borderBottom: "2px solid #e2e8f0",
              padding: "0.3rem 0.1rem",
              fontSize: "0.9375rem",
              fontWeight: "700",
              color: "#0f172a",
              outline: "none",
              background: "transparent",
              marginBottom: "0.75rem",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />

          {/* Points */}
          <div style={{ marginBottom: "0.6rem" }}>
            {sec.points.map((pt, ptIdx) => (
              <div
                key={pt.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.4rem",
                  marginBottom: "0.35rem",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    paddingTop: "0.42rem",
                    width: "18px",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {ptIdx + 1}.
                </span>
                <textarea
                  value={pt.text}
                  rows={1}
                  placeholder={`Point ${ptIdx + 1}`}
                  onChange={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                    updatePoint(sec.id, pt.id, e.target.value);
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
                  style={{
                    flex: 1,
                    border: "1px solid #e2e8f0",
                    borderRadius: "7px",
                    padding: "0.38rem 0.6rem",
                    fontSize: "0.875rem",
                    color: "#374151",
                    outline: "none",
                    fontFamily: "inherit",
                    resize: "none",
                    lineHeight: "1.5",
                    minHeight: "36px",
                    overflow: "hidden",
                  }}
                />
                {sec.points.length > 1 && (
                  <button
                    onClick={() => deletePoint(sec.id, pt.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#ef4444",
                      padding: "4px",
                      paddingTop: "0.42rem",
                      display: "flex",
                      borderRadius: "5px",
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => addPoint(sec.id)}
              style={{
                background: "#eff1ff",
                color: "#6366f1",
                border: "none",
                borderRadius: "7px",
                padding: "0.3rem 0.7rem",
                fontSize: "0.78rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontFamily: "inherit",
              }}
            >
              <Plus size={12} /> Add Point
            </button>

            <input
              type="file"
              accept="image/*"
              id={`sec-img-${sec.id}`}
              style={{ display: "none" }}
              onChange={(e) => handleSectionImage(sec.id, e)}
            />
            <label
              htmlFor={`sec-img-${sec.id}`}
              style={{
                background: sec.image ? "#fef3c7" : "#f0fdf4",
                color: sec.image ? "#92400e" : "#065f46",
                border: "none",
                borderRadius: "7px",
                padding: "0.3rem 0.7rem",
                fontSize: "0.78rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontFamily: "inherit",
              }}
            >
              <Upload size={12} /> {sec.image ? "Replace Image" : "Add Image"}
            </label>
          </div>

          {/* Image preview */}
          {sec.image && (
            <div
              style={{
                marginTop: "0.75rem",
                position: "relative",
                display: "inline-block",
              }}
            >
              <img
                src={
                  sec.image.startsWith("data:")
                    ? sec.image
                    : `${BASE_URL}${sec.image}`
                }
                alt={`section-${secIdx}`}
                style={{
                  maxWidth: "280px",
                  maxHeight: "180px",
                  objectFit: "contain",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  display: "block",
                }}
              />
              <button
                onClick={() => updateSection(sec.id, { image: null })}
                style={{
                  position: "absolute",
                  top: "-7px",
                  right: "-7px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "50%",
                  width: "20px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add Section */}
      <button
        onClick={() => onChange([...sections, newSection()])}
        style={{
          width: "100%",
          padding: "0.7rem",
          background: "#eff1ff",
          color: "#6366f1",
          border: "1.5px dashed #c7d2fe",
          borderRadius: "10px",
          fontSize: "0.875rem",
          fontWeight: "600",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          fontFamily: "inherit",
        }}
      >
        <Plus size={15} /> Add Section
      </button>
    </div>
  );
}

export function TermsViewer({ sections }) {
  const hasContent = (sections || []).some(
    (s) => s.heading || s.points.some((p) => p.text.trim()) || s.image
  );

  if (!hasContent)
    return (
      <div
        style={{
          padding: "1rem",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "0.375rem",
          minHeight: "80px",
          color: "#9ca3af",
        }}
      >
        No terms &amp; conditions
      </div>
    );

  let sectionNum = 0;

  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "0.375rem",
      }}
    >
      {sections.map((sec, i) => {
        const filledPts = sec.points.filter((p) => p.text.trim());
        const imgSrc = sec.image
          ? sec.image.startsWith("data:")
            ? sec.image
            : `${BASE_URL}${sec.image}`
          : null;
        if (!sec.heading && !filledPts.length && !imgSrc) return null;

        sectionNum += 1;
        const sNum = sectionNum;

        return (
          <div
            style={{
              display: "flex",
              gap: "24px",
              justifyContent: "space-between",
              borderBottom: "1px dotted grey",
              padding: "1rem"
            }}
          >
            <div key={sec.id || i} style={{ marginBottom: "1.25rem" }}>
              {/* Section heading: "1. Heading text" */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontWeight: "700",
                    color: "#6366f1",
                    fontSize: "0.9375rem",
                    minWidth: "1.8rem",
                    flexShrink: 0,
                  }}
                >
                  {sNum}.
                </span>
                {sec.heading ? (
                  <span
                    style={{
                      fontWeight: "700",
                      color: "#0f172a",
                      fontSize: "0.9375rem",
                      lineHeight: "1.4",
                    }}
                  >
                    {sec.heading}
                  </span>
                ) : (
                  <span
                    style={{
                      color: "#9ca3af",
                      fontSize: "0.875rem",
                      fontStyle: "italic",
                    }}
                  >
                    Untitled section
                  </span>
                )}
              </div>

              {/* Points: "1.1  point text" */}
              {filledPts.length > 0 && (
                <div style={{ paddingLeft: "2rem" }}>
                  {filledPts.map((pt, j) => (
                    <div
                      key={pt.id || j}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.75rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "600",
                          color: "#6366f1",
                          fontSize: "0.8125rem",
                          minWidth: "2.5rem",
                          flexShrink: 0,
                        }}
                      >
                        {sNum}.{j + 1}
                      </span>
                      <span
                        style={{
                          color: "#374151",
                          fontSize: "0.875rem",
                          lineHeight: "1.55",
                          flex: 1,
                        }}
                      >
                        {pt.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Section image */}
            {imgSrc && (
              <div style={{ paddingLeft: "2rem", marginTop: "0.75rem" }}>
                <img
                  src={imgSrc}
                  alt={`sec-${i}`}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "200px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    objectFit: "contain",
                  }}
                />
              </div>
            )}
            
          </div>
          
        );
      })}
    </div>
  );
}
