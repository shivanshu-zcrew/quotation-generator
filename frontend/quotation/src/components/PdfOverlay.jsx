import React from 'react';
import { Loader } from 'lucide-react';

export default function PdfOverlay({ step }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "white", borderRadius: "1rem", padding: "2rem 2.5rem", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: "280px" }}>
        <Loader size={36} color="#0369a1" style={{ animation: "spin 1s linear infinite", marginBottom: "1rem" }} />
        <div style={{ fontWeight: "700", fontSize: "1rem", color: "#1f2937", marginBottom: "0.25rem" }}>Generating PDF…</div>
        <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{step}</div>
      </div>
    </div>
  );
}