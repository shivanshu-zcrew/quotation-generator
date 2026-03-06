import React, { useState } from 'react';
import { Users, Package, Plus, Trash2, Eye, Download, FileText, TrendingUp, ChevronRight, AlertCircle,LogOut } from 'lucide-react';
import headerImage from "../assets/header.png";
import { quotationAPI } from '../services/api';

// ── PDF helpers ───────────────────────────────────────────────────────────────

const numberToWords = (num) => {
  if (!num || num === 0) return "Zero";
  const ones  = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine"];
  const teens = ["Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens  = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const thousands = ["","Thousand","Lakh","Crore"];
  const cvt = (n) => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " "+cvt(n%100) : "");
  };
  const convertIndian = (n) => {
    let result = ""; let i = 0;
    while (n > 0) {
      if (n%1000 !== 0) result = cvt(n%1000) + (thousands[i] ? " "+thousands[i]+" " : "") + result;
      n = Math.floor(n/1000); i++;
    }
    return result.trim() + " Dirhams Only";
  };
  const dirhams = Math.floor(num);
  const fils = Math.round((num - dirhams) * 100);
  let result = convertIndian(dirhams);
  if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${cvt(fils)} Fils Only`);
  return result;
};

const imageToBase64 = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  if (src.startsWith("data:")) return resolve(src);
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    resolve(canvas.toDataURL("image/png"));
  };
  img.onerror = () => resolve(null);
  img.src = src;
});

const buildPdfHTML = async (q) => {
  const headerBase64 = await imageToBase64(headerImage);
  const subtotal   = q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount  = (subtotal * (q.tax || 0)) / 100;
  const grandTotal = subtotal + taxAmount - (subtotal * (q.discount || 0)) / 100;
  const amountInWords = numberToWords(grandTotal);
  const itemsPerPage = 8;
  const firstPage = q.items.slice(0, itemsPerPage);
  const remaining = q.items.slice(itemsPerPage);
  const multiPage = remaining.length > 0;
  const renderRow = (item, index) => {
    const name = item.itemId?.name || item.name || "—";
    const desc = item.itemId?.description || item.description || "";
    const imgs = (item.imagePaths || []).map((p) => `http://51.20.109.158:5000${p}`);
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index+1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        <div style="font-weight:600;font-size:11px;">${name}</div>
        ${desc ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${desc}</div>` : ""}
        ${imgs.length ? `<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">${imgs.map(src=>`<div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" /></div>`).join("")}</div>` : ""}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity*item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };
  const totalsRows = `
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Total (AED)</td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td></tr>
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${q.tax||0}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmount.toFixed(2)}</td></tr>
    <tr style="background:#000;color:white;font-weight:700;"><td colspan="3" style="border:none;padding:8px;"></td><td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td><td style="text-align:right;padding:12px 8px;font-size:12px;">${grandTotal.toFixed(2)}</td></tr>`;
  const thead = `<thead><tr style="background:#000;"><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th><th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th></tr></thead>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}.container{width:874px;margin:0 auto;padding:10px;}@page{size:A4;margin:5mm;}@media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}}</style></head><body><div class="container">
  <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">${headerBase64?`<img src="${headerBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;"/>`:`<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}</div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;"><div style="text-align:center;flex:1;"><h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;">QUOTATION</h1><p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${q.quotationNumber||""}</p></div><div style="text-align:right;"><div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div><div style="font-size:16px;font-weight:700;">${new Date(q.expiryDate).toLocaleDateString("en-IN")}</div></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;"><div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;"><span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${q.customer||q.customerId?.name||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${q.contact||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(q.date).toLocaleDateString("en-IN")}</span><span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${new Date(q.expiryDate).toLocaleDateString("en-IN")}</span></div><div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;"><span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${q.ourRef||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${q.ourContact||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${q.salesOffice||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${q.paymentTerms||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${q.deliveryTerms||"N/A"}</span></div></div>
  <div style="margin-bottom:16px;"><h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${thead}<tbody>${firstPage.map((item,i)=>renderRow(item,i)).join("")}${!multiPage?totalsRows:""}</tbody></table></div>
  ${multiPage?`<div class="page-break"><h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${thead}<tbody>${remaining.map((item,i)=>renderRow(item,i+itemsPerPage)).join("")}${totalsRows}</tbody></table></div>`:""}
  <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;"><strong>Amount in words:</strong> ${amountInWords}</div>
  ${q.notes?`<div style="margin-bottom:16px;"><h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes & Terms</h3><div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${q.notes}</div></div>`:""}
  <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;"><p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p><p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p></div>
  </div></body></html>`;
};


const statusBadge = (status) => {
  const map = {
    pending:  ["#fef9c3","#ca8a04","⏳ Pending"],
    approved: ["#dcfce7","#16a34a","✓ Approved"],
    accepted: ["#dcfce7","#16a34a","✓ Accepted"],
    rejected: ["#fee2e2","#dc2626","✗ Rejected"],
    draft:    ["#f1f5f9","#64748b","Draft"],
    sent:     ["#e0f2fe","#0369a1","Sent"],
  };
  const [bg,color,label] = map[status] || map.draft;
  return <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:"999px", fontSize:"0.75rem", fontWeight:600, backgroundColor:bg, color }}>{label}</span>;
};


// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen({ customers, items, quotations, onNavigate, onDeleteQuotation, onViewQuotation, onLogout }) {
  const [exportingId, setExportingId] = useState(null);
  const [search, setSearch] = useState("");

  const totalRevenue = quotations.reduce((s, q) => s + (q.total || 0), 0);
  const sorted   = [...quotations].sort((a, b) => new Date(b.date) - new Date(a.date));
  const filtered = sorted.filter((q) => {
    const t = search.toLowerCase();
    return (q.quotationNumber||"").toLowerCase().includes(t) ||
           (q.customer||q.customerId?.name||"").toLowerCase().includes(t);
  });

   
  const handleDownload = async (q) => {
    setExportingId(q._id);
    try {
      const html = await buildPdfHTML(q);
  
      const filename = `Quotation_${
        q.quotationNumber || "view"
      }_${new Date().toISOString().split("T")[0]}`;
  
      await quotationAPI.generatePDF(html, filename);
  
    } catch (err) {
      console.error("PDF export error:", err);
      alert(`Failed to generate PDF.\n\n${err.message}`);
    } finally {
      setExportingId(null);
    }
  };

  const isExpired      = (d) => new Date(d) < new Date();
  const isExpiringSoon = (d) => { const days = Math.ceil((new Date(d) - new Date()) / 86400000); return days >= 0 && days <= 7; };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4ff", fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        /* ── Stat cards ── */
        .hs-stat {
          background: white;
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.05);
          transition: transform .2s, box-shadow .2s;
          cursor: default;
          position: relative;
          overflow: hidden;
        }
        .hs-stat::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 18px 18px 0 0;
        }
        .hs-stat:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 6px rgba(0,0,0,.07), 0 12px 28px rgba(0,0,0,.1);
        }
        .hs-stat.blue::before  { background: linear-gradient(90deg,#6366f1,#818cf8); }
        .hs-stat.violet::before { background: linear-gradient(90deg,#8b5cf6,#a78bfa); }
        .hs-stat.emerald::before { background: linear-gradient(90deg,#059669,#34d399); }
        .hs-stat.amber::before  { background: linear-gradient(90deg,#d97706,#fbbf24); }

        /* ── Action cards ── */
        .hs-action {
          background: white;
          border: 1.5px solid #e8ecff;
          border-radius: 18px;
          padding: 1.4rem 1.25rem;
          cursor: pointer;
          transition: all .22s cubic-bezier(.4,0,.2,1);
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          font-family: inherit;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
        }
        .hs-action:hover {
          transform: translateY(-3px);
          border-color: transparent;
          box-shadow: 0 8px 32px rgba(99,102,241,.15), 0 2px 8px rgba(0,0,0,.06);
        }
        .hs-action:hover .hs-arrow { transform: translateX(4px); opacity: 1 !important; }
        .hs-arrow { transition: transform .2s, opacity .2s; }

        /* ── Table ── */
        .hs-table-row { border-bottom: 1px solid #f1f5f9; transition: background .12s; }
        .hs-table-row:hover { background: #f8faff !important; }
        .hs-table-row:last-child { border-bottom: none; }

        /* ── Buttons ── */
        .hbtn {
          display: inline-flex; align-items: center; gap: .35rem;
          padding: .38rem .8rem; border-radius: 8px; border: none;
          cursor: pointer; font-size: .78rem; font-weight: 600;
          font-family: inherit; transition: all .15s; white-space: nowrap;
        }
        .hbtn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(.93); }
        .hbtn:disabled { opacity: .4; cursor: not-allowed; }
        .hbtn-view { background: #eff1ff; color: #4f46e5; }
        .hbtn-dl   { background: #ecfdf5; color: #059669; }
        .hbtn-del  { background: #fff1f1; color: #dc2626; }

        /* ── Search ── */
        .hs-search {
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          color: #1f2937;
          padding: .6rem 1rem;
          font-size: .875rem;
          font-family: inherit;
          outline: none;
          width: 270px;
          transition: border-color .2s, box-shadow .2s;
        }
        .hs-search::placeholder { color: #9ca3af; }
        .hs-search:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }

        /* ── Badges ── */
        .hbadge {
          display: inline-flex; align-items: center; gap: .25rem;
          padding: .2rem .6rem; border-radius: 999px;
          font-size: .7rem; font-weight: 700; letter-spacing: .02em;
        }
        .hbadge-red   { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .hbadge-amber { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
        .hbadge-green { background: #f0fdf4; color: #059669; border: 1px solid #bbf7d0; }

        /* ── New quote button ── */
        .hs-new-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; border: none; border-radius: 12px;
          padding: .7rem 1.5rem; font-size: .9rem; font-weight: 700;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          box-shadow: 0 4px 14px rgba(99,102,241,.4);
          transition: all .2s;
        }
        .hs-new-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(99,102,241,.5);
        }

        /* ── Animations ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fa1 { animation: fadeUp .35s ease both; }
        .fa2 { animation: fadeUp .35s .07s ease both; }
        .fa3 { animation: fadeUp .35s .14s ease both; }
        .fa4 { animation: fadeUp .35s .21s ease both; }

        /* ── Scrollbar ── */
        .hs-scroll::-webkit-scrollbar { height: 4px; }
        .hs-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
      `}</style>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* ── Header ── */} 
<div className="fa1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
  <div>
    <p style={{ margin: "0 0 .35rem", color: "#94a3b8", fontSize: ".75rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".1em" }}>
      Mega Repairing Machinery Equipment LLC
    </p>
    <h1 style={{ margin: 0, fontSize: "1.9rem", fontWeight: "800", color: "#0f172a", letterSpacing: "-.03em" }}>
      Dashboard
    </h1>
  </div>
  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
    <button className="hs-new-btn" onClick={() => onNavigate("addQuotation")}>
      <Plus size={17} /> New Quotation
    </button>
    <button 
      onClick={onLogout} 
      style={{
        background: "white",
        border: "1.5px solid #e2e8f0",
        borderRadius: "12px",
        padding: ".7rem 1.2rem",
        display: "flex",
        alignItems: "center",
        gap: ".5rem",
        cursor: "pointer",
        color: "#64748b",
        fontWeight: "600",
        fontSize: ".9rem",
        transition: "all .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,.05)"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#fef2f2";
        e.currentTarget.style.borderColor = "#fecaca";
        e.currentTarget.style.color = "#dc2626";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "white";
        e.currentTarget.style.borderColor = "#e2e8f0";
        e.currentTarget.style.color = "#64748b";
      }}
      title="Logout"
    >
      <LogOut size={18} />
      <span>Logout</span>
    </button>
  </div>
</div>

        {/* ── Stat cards ── */}
        <div className="fa2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>
          {[
            {
              cls: "blue",
              label: "Total Revenue",
              value: `AED ${totalRevenue.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              Icon: TrendingUp,
              iconBg: "#eff1ff",
              iconColor: "#6366f1",
              valueSize: "1.1rem",
            },
            {
              cls: "violet",
              label: "Quotations",
              value: quotations.length,
              Icon: FileText,
              iconBg: "#f5f3ff",
              iconColor: "#8b5cf6",
              valueSize: "1.8rem",
            },
            {
              cls: "emerald",
              label: "Customers",
              value: customers.length,
              Icon: Users,
              iconBg: "#ecfdf5",
              iconColor: "#059669",
              valueSize: "1.8rem",
            },
            {
              cls: "amber",
              label: "Catalogue Items",
              value: items.length,
              Icon: Package,
              iconBg: "#fffbeb",
              iconColor: "#d97706",
              valueSize: "1.8rem",
            },
          ].map(({ cls, label, value, Icon, iconBg, iconColor, valueSize }) => (
            <div key={label} className={`hs-stat ${cls}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div style={{ background: iconBg, borderRadius: "10px", padding: ".5rem", display: "flex", color: iconColor }}>
                  <Icon size={20} />
                </div>
              </div>
              <p style={{ margin: "0 0 .25rem", color: "#94a3b8", fontSize: ".72rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</p>
              <p style={{ margin: 0, color: "#0f172a", fontSize: valueSize, fontWeight: "800", letterSpacing: "-.02em", lineHeight: 1.1 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Quick actions ── */}
        <div className="fa3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          {[
            {
              label: "Manage Customers",
              sub: "View, add & edit client records",
              route: "customers",
              Icon: Users,
              iconBg: "#ecfdf5",
              iconColor: "#059669",
            },
            {
              label: "Manage Items",
              sub: "Update your product catalogue",
              route: "items",
              Icon: Package,
              iconBg: "#fffbeb",
              iconColor: "#d97706",
            },
            {
              label: "New Quotation",
              sub: "Generate a fresh client quote",
              route: "addQuotation",
              Icon: Plus,
              iconBg: "#eff1ff",
              iconColor: "#6366f1",
            },
          ].map(({ label, sub, route, Icon, iconBg, iconColor }) => (
            <button key={route} className="hs-action" onClick={() => onNavigate(route)}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={21} style={{ color: iconColor }} />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ margin: "0 0 .15rem", color: "#0f172a", fontWeight: "700", fontSize: ".9rem" }}>{label}</p>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: ".8rem" }}>{sub}</p>
              </div>
              <ChevronRight size={16} className="hs-arrow" style={{ color: "#cbd5e1", opacity: 0.5 }} />
            </button>
          ))}
        </div>

        {/* ── Quotations table ── */}
        <div className="fa4" style={{ background: "white", borderRadius: "18px", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 20px rgba(0,0,0,.05)", overflow: "hidden" }}>

          {/* Toolbar */}
          <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: "1rem", fontWeight: "700" }}>Recent Quotations</h2>
              <p style={{ margin: ".15rem 0 0", color: "#94a3b8", fontSize: ".78rem" }}>{filtered.length} of {quotations.length} entries</p>
            </div>
            <input
              className="hs-search"
              placeholder="Search quote # or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {quotations.length === 0 ? (
            <div style={{ padding: "4rem", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                <FileText size={28} style={{ color: "#cbd5e1" }} />
              </div>
              <p style={{ color: "#475569", margin: 0, fontWeight: "600" }}>No quotations yet</p>
              <p style={{ color: "#94a3b8", margin: ".4rem 0 1.5rem", fontSize: ".875rem" }}>Create your first quotation to get started.</p>
              <button className="hs-new-btn" style={{ margin: "0 auto" }} onClick={() => onNavigate("addQuotation")}>
                <Plus size={16} /> New Quotation
              </button>
            </div>
          ) : (
            <div className="hs-scroll" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[["Quote #","left"],["Customer","left"],["Date","left"],["Status","left"],["Items","center"],["Total (AED)","right"],["Actions","center"]].map(([h, align]) => (
                      <th key={h} style={{
                        padding: ".75rem 1rem",
                        textAlign: align,
                        color: "#64748b",
                        fontSize: ".72rem",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                        whiteSpace: "nowrap",
                        borderBottom: "1.5px solid #e2e8f0",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "2.5rem", textAlign: "center", color: "#94a3b8", fontSize: ".875rem" }}>
                        No results for "{search}"
                      </td>
                    </tr>
                  ) : filtered.map((q, idx) => {
                    const loading  = exportingId === q._id;
                    const expired  = isExpired(q.expiryDate);
                    const expiring = !expired && isExpiringSoon(q.expiryDate);
                    const active   = !expired && !expiring;
                    return (
                      <tr key={q._id} className="hs-table-row" style={{ background: idx % 2 === 0 ? "white" : "#fafbff" }}>

                        {/* Quote # */}
                        <td style={{ padding: ".85rem 1rem" }}>
                          <span style={{ color: "#6366f1", fontWeight: "700", fontSize: ".85rem", fontFamily: "monospace", background: "#eff1ff", padding: ".2rem .55rem", borderRadius: "6px" }}>
                            {q.quotationNumber || "—"}
                          </span>
                        </td>

                        {/* Customer */}
                        <td style={{ padding: ".85rem 1rem", color: "#1e293b", fontSize: ".875rem", fontWeight: "500" }}>
                          {q.customer || q.customerId?.name || "N/A"}
                        </td>

                        {/* Date */}
                        <td style={{ padding: ".85rem 1rem", color: "#64748b", fontSize: ".825rem", whiteSpace: "nowrap" }}>
                          {new Date(q.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>

                        <td style={{ padding: ".85rem 1rem", color: "#1e293b", fontSize: ".875rem", fontWeight: "500" }}>
                        {statusBadge(q.status)}
                        </td>
                        
                        {/* Expiry */}
                        {/* <td style={{ padding: ".85rem 1rem", whiteSpace: "nowrap" }}>
                          {expired ? (
                            <span className="hbadge hbadge-red"><AlertCircle size={9} /> Expired</span>
                          ) : expiring ? (
                            <span className="hbadge hbadge-amber">⚡ Expiring soon</span>
                          ) : (
                            <span className="hbadge hbadge-green">
                              {new Date(q.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </td> */}

                        {/* Items count */}
                        <td style={{ padding: ".85rem 1rem", textAlign: "center" }}>
                          <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: "6px", padding: ".2rem .6rem", fontSize: ".8rem", fontWeight: "600" }}>
                            {q.items.length}
                          </span>
                        </td>

                        {/* Total */}
                        <td style={{ padding: ".85rem 1rem", textAlign: "right", color: "#059669", fontWeight: "700", fontSize: ".9rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {q.total != null
                            ? q.total.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: ".85rem 1rem" }}>
                          <div style={{ display: "flex", gap: ".4rem", justifyContent: "center" }}>
                            <button className="hbtn hbtn-view" onClick={() => onViewQuotation(q._id)}>
                              <Eye size={13} /> View
                            </button>
                            <button className="hbtn hbtn-dl" onClick={() => handleDownload(q)} disabled={loading}>
                              <Download size={13} /> {loading ? "…" : "PDF"}
                            </button>
                            {(q.status === "pending" || !q.status) && (
                            <button className="hbtn hbtn-del" onClick={() => { if (window.confirm("Delete this quotation?")) onDeleteQuotation(q._id); }}>
                              <Trash2 size={13} /> Del
                            </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}