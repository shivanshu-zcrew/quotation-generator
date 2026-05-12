import React from "react";
import { Plus, Trash2, Upload } from "lucide-react";

// Simple Section Structure
export const newSection = () => ({
  id: `sec-${Date.now()}-${Math.random()}`,
  heading: "",
  content: "",
  images: [],
});

// ============================================================
// For PDF Export only
// ============================================================
export const sectionsToHTML = (sections) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  
  return safeSections.map((sec, idx) => {
    if (!sec) return "";

    let html = `<div style="margin-bottom:28px;">`;
    
    if (sec.heading?.trim()) {
      html += `<h4 style="font-weight:700;color:#0f172a;margin-bottom:12px;">${idx + 1}. ${sec.heading}</h4>`;
    }

    if (sec.content?.trim()) {
      const formatted = sec.content.replace(/\n/g, '<br>');
      html += `<div style="line-height:1.85;color:#374151;white-space:pre-wrap;">${formatted}</div>`;
    }

    html += `</div>`;
    return html;
  }).join("");
};

export const sectionsToHTMLWithoutImages = sectionsToHTML;

// ============================================================
// htmlToSections - converts raw text to section format
// ============================================================
export const htmlToSections = (rawText = "", existingImages = []) => {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === "") {
    return [newSection()];
  }

  return [{
    id: `sec-${Date.now()}`,
    heading: "",
    content: rawText.trim(),
    images: existingImages || []
  }];
};

// ============================================================
// TermsEditor with Image Upload - FIXED VERSION
// ============================================================
export default function TermsEditor({ 
  sections = [], 
  onChange,
  termsImages = [],
  onTermsImagesUpload,
  onRemoveTermsImage 
}) {
  const safeSections = Array.isArray(sections) && sections.length > 0 ? sections : [newSection()];

  const updateSection = (id, patch) => {
    onChange(prev => prev.map(s => s?.id === id ? { ...s, ...patch } : s));
  };

  const addSection = () => {
    onChange(prev => [...prev, newSection()]);
  };

  const deleteSection = (id) => {
    if (safeSections.length === 1) return;
    onChange(prev => prev.filter(s => s?.id !== id));
  };

  // ✅ Handle image upload
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    const processedImages = [];
    
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newImage = {
          id: `img-${Date.now()}-${Math.random()}`,
          url: reader.result,
          base64: reader.result,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          isTemp: true,
          uploadedAt: new Date().toISOString()
        };
        processedImages.push(newImage);
        
        if (processedImages.length === validFiles.length) {
          if (onTermsImagesUpload) {
            onTermsImagesUpload(processedImages);
          }
        }
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = "";
  };

  return (
    <div>
      {safeSections.map((sec, idx) => (
        <div key={sec.id} style={{
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1rem"
        }}>
          {/* <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#6366f1" }}>Section {idx + 1}</span>
            {safeSections.length > 1 && (
              <button onClick={() => deleteSection(sec.id)} style={{ color: "#ef4444", padding: "4px", cursor: "pointer", background: "none", border: "none" }}>
                <Trash2 size={18} />
              </button>
            )}
          </div> */}

          {/* Heading */}
          {/* <input
            value={sec.heading || ""}
            onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
            placeholder="Section Heading (optional)"
            style={{
              width: "100%",
              fontSize: "1.1rem",
              fontWeight: 700,
              padding: "0.6rem 0",
              border: "none",
              borderBottom: "2px solid #e2e8f0",
              marginBottom: "1rem",
              outline: "none"
            }}
          /> */}

          {/* Main Textarea */}
          <textarea
            value={sec.content || ""}
            onChange={(e) => updateSection(sec.id, { content: e.target.value })}
            placeholder="Write your terms and conditions here...&#10;&#10;1. Main Point&#10;    a. Sub point with indentation"
            rows={14}
            style={{
              width: "100%",
              padding: "1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "0.96rem",
              lineHeight: "1.85",
              resize: "vertical",
              fontFamily: "inherit",
              whiteSpace: "pre-wrap",
              marginBottom: "1rem"
            }}
          />

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
                    style={{ width: "100%", height: "80px", objectFit: "cover", display: "block" }} 
                  />
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

      {/* <button 
        onClick={addSection}
        style={{
          width: "100%",
          padding: "1rem",
          background: "#eff1ff",
          color: "#6366f1",
          border: "2px dashed #c7d2fe",
          borderRadius: "12px",
          fontWeight: 600,
          cursor: "pointer",
          marginTop: "0.5rem"
        }}
      >
        <Plus size={18} /> Add New Section
      </button> */}
    </div>
  );
}

// ============================================================
// TermsViewer
// ============================================================
// ============================================================
// TermsViewer - Updated to display images correctly
// ============================================================
export function TermsViewer({ sections = [], termsImages = [] }) {
  const safeSections = Array.isArray(sections) ? sections : [];
  
  // Combine images from sections and direct termsImages prop
  let allImages = [...termsImages];
  
  // Also extract images from sections if any
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
    (sec.heading?.trim()) || (sec.content?.trim())
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
      lineHeight: "1.9",
      fontSize: "0.97rem",
      color: "#1f2937"
    }}>
      {safeSections.map((sec, idx) => (
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

          {sec.content?.trim() && (
            <div style={{
              whiteSpace: "pre-wrap",
              color: "#374151",
              lineHeight: "1.85",
              fontSize: "0.96rem"
            }}>
              {sec.content}
            </div>
          )}
        </div>
      ))}
      
      {/* Display images at the bottom */}
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