import React, { useState, useEffect } from 'react';
import { adminAPI, quotationAPI } from '../services/api';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Users, Package, TrendingUp, Search, X, Check, LogOut
} from 'lucide-react';
import headerImage from "../assets/header.png"; 

// ── PDF helper (same as HomeScreen) ──────────────────────────────────────────
const imageToBase64 = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  if (src.startsWith("data:")) return resolve(src);
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    resolve(c.toDataURL("image/png"));
  };
  img.onerror = () => resolve(null);
  img.src = src;
});

const numberToWords = (num) => {
  if (!num || num === 0) return "Zero";
  const ones     = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine"];
  const teens    = ["Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens2    = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const thou     = ["","Thousand","Lakh","Crore"];
  const cvt = (n) => {
    if (!n) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n-10];
    if (n < 100) return tens2[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " "+cvt(n%100) : "");
  };
  const cvtMain = (n) => {
    let res = "", i = 0;
    while (n > 0) {
      if (n%1000) res = cvt(n%1000) + (thou[i] ? " "+thou[i]+" " : "") + res;
      n = Math.floor(n/1000); i++;
    }
    return res.trim() + " Dirhams Only";
  };
  const d = Math.floor(num), f = Math.round((num-d)*100);
  let r = cvtMain(d);
  if (f > 0) r = r.replace("Dirhams Only", `Dirhams and ${cvt(f)} Fils Only`);
  return r;
};

const buildPdfHTML = async (q) => {
  const headerBase64 = await imageToBase64(headerImage);
  const subtotal  = q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmt    = (subtotal * (q.tax||0)) / 100;
  const discAmt   = (subtotal * (q.discount||0)) / 100;
  const grand     = subtotal + taxAmt - discAmt;
  const amtWords  = numberToWords(grand);
  const first     = q.items.slice(0, 8);
  const rest      = q.items.slice(8);

  const row = (item, i) => {
    const name = item.itemId?.name || item.name || "—";
    const desc = item.itemId?.description || item.description || "";
    const imgs = (item.imagePaths||[]).map(p=>`http://51.20.109.158:5000${p}`);
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${i+1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        <div style="font-weight:600;font-size:11px;">${name}</div>
        ${desc?`<div style="font-size:9px;color:#6b7280;margin-top:3px;">${desc}</div>`:""}
        ${imgs.length?`<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">${imgs.map(s=>`<div style="height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;"><img src="${s}" style="width:100%;height:100%;object-fit:cover;"/></div>`).join("")}</div>`:""}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity*item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };

  const totals = `
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Total (AED)</td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td></tr>
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${q.tax||0}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td></tr>
    <tr style="background:#000;color:white;font-weight:700;"><td colspan="3" style="border:none;padding:8px;"></td><td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td><td style="text-align:right;padding:12px 8px;font-size:12px;">${grand.toFixed(2)}</td></tr>`;

  const thead = `<thead><tr style="background:#000;"><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th><th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th></tr></thead>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}.container{width:874px;margin:0 auto;padding:10px;}@page{size:A4;margin:5mm;}thead{display:table-row-group;}@media print{.page-break{page-break-before:always;}thead{display:table-row-group;}}</style></head><body><div class="container">
  <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">${headerBase64?`<img src="${headerBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;"/>`:`<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}</div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;"><div style="text-align:center;flex:1;"><h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;">QUOTATION</h1><p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${q.quotationNumber||""}</p></div><div style="text-align:right;"><div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div><div style="font-size:16px;font-weight:700;">${new Date(q.expiryDate).toLocaleDateString("en-IN")}</div></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;"><div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;"><span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${q.customer||q.customerId?.name||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${q.contact||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(q.date).toLocaleDateString("en-IN")}</span><span style="font-weight:600;color:#4b5563;">Expiry</span><span>:</span><span>${new Date(q.expiryDate).toLocaleDateString("en-IN")}</span></div><div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;"><span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${q.ourRef||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${q.ourContact||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${q.salesOffice||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${q.paymentTerms||"N/A"}</span><span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${q.deliveryTerms||"N/A"}</span></div></div>
  <div style="margin-bottom:16px;"><h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${thead}<tbody>${first.map((item,i)=>row(item,i)).join("")}${rest.length===0?totals:""}</tbody></table></div>
  ${rest.length>0?`<div class="page-break"><h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody>${rest.map((item,i)=>row(item,i+8)).join("")}${totals}</tbody></table></div>`:""}
  <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;"><strong>Amount in words:</strong> ${amtWords}</div>
  ${q.notes?`<div style="margin-bottom:16px;"><h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes & Terms</h3><div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${q.notes}</div></div>`:""}
  <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;"><p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p><p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p></div>
</div></body></html>`;
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminDashboard({
  quotations = [],
  customers  = [],
  items      = [],
  onNavigate,
  onApproveQuotation,
  onRejectQuotation,
  onDeleteQuotation,
  onViewQuotation,
  onLogout
}) {
  const [activeTab,       setActiveTab]       = useState("all");
  const [stats,           setStats]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState("");
  const [exportingId,     setExportingId]     = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason,    setRejectReason]    = useState("");
  const [rejectingId,     setRejectingId]     = useState(null);

  useEffect(() => {
    adminAPI.getDashboardStats()
      .then(res => setStats(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const sorted       = [...quotations].sort((a,b) => new Date(b.date)-new Date(a.date));
  const pendingList  = sorted.filter(q => q.status === "pending");
  const approvedList = sorted.filter(q => q.status === "approved" || q.status === "accepted");
  const rejectedList = sorted.filter(q => q.status === "rejected");

  const tabList = activeTab === "pending"  ? pendingList
               : activeTab === "approved" ? approvedList
               : activeTab === "rejected" ? rejectedList
               : sorted;

  const filtered = tabList.filter(q => {
    const t = search.toLowerCase();
    return (q.quotationNumber||"").toLowerCase().includes(t)
        || (q.customer||q.customerId?.name||"").toLowerCase().includes(t);
  });

 const handleDownload = async (quotation) => {
    setExportingId(quotation._id);
    try {
      const html = await buildPdfHTML(quotation);  
      await quotationAPI.generatePDF(
        html,
        `Quotation_${quotation.quotationNumber || 'download'}_${new Date().toISOString().split('T')[0]}`
      );
    } catch (err) {
      alert(`Failed to generate PDF: ${err.message}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleApprove = (id) => {
    if (window.confirm("Approve this quotation?")) onApproveQuotation(id);
  };
  const handleRejectOpen  = (id) => { setRejectingId(id); setShowRejectModal(true); };
  const handleRejectClose = ()   => { setShowRejectModal(false); setRejectReason(""); setRejectingId(null); };
  const handleRejectConfirm = () => {
    if (rejectReason.trim()) { onRejectQuotation(rejectingId, rejectReason); handleRejectClose(); }
  };

  const fmtCurrency = (n) => `AED ${(n||0).toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate     = (d) => new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

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

  // ── Styles ──
  const S = {
    page:    { minHeight:"100vh", backgroundColor:"#f1f5f9", fontFamily:"'Segoe UI',system-ui,sans-serif" },
    topbar:  { backgroundColor:"#0f172a", padding:"0 2rem", display:"flex", alignItems:"center", justifyContent:"space-between", height:"60px", position:"sticky", top:0, zIndex:50 },
    topTitle: { fontSize:"1.125rem", fontWeight:700, color:"white", letterSpacing:"-0.01em" },
    topSub:  { fontSize:"0.75rem", color:"#94a3b8", marginTop:2 },
    body:    { maxWidth:"1400px", margin:"0 auto", padding:"2rem" },

    statsGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1rem", marginBottom:"2rem" },
    statCard:  (accent) => ({ backgroundColor:"#fff", borderRadius:"12px", padding:"1.25rem 1.5rem", boxShadow:"0 1px 3px rgba(0,0,0,0.06)", borderLeft:`4px solid ${accent}`, display:"flex", alignItems:"center", gap:"1rem" }),
    statIcon:  (bg) => ({ width:"44px", height:"44px", borderRadius:"10px", backgroundColor:bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }),
    statLabel: { fontSize:"0.75rem", fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em", margin:"0 0 4px" },
    statValue: { fontSize:"1.6rem", fontWeight:800, color:"#0f172a", margin:0 },
    statSub:   { fontSize:"0.75rem", color:"#94a3b8", margin:0 },

    card:       { backgroundColor:"#fff", borderRadius:"14px", boxShadow:"0 1px 3px rgba(0,0,0,0.07)", overflow:"hidden" },
    cardHeader: { padding:"1.25rem 1.5rem", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"0.75rem" },
    tabsRow:    { display:"flex", gap:"0.25rem", padding:"0.4rem", backgroundColor:"#f8fafc", borderRadius:"10px" },
    tab: (active) => ({
      padding:"0.45rem 1rem", borderRadius:"8px", border:"none", cursor:"pointer", fontSize:"0.8125rem", fontWeight:600, display:"flex", alignItems:"center", gap:"0.4rem", transition:"all 0.15s",
      ...(active ? { backgroundColor:"#fff", color:"#0f172a", boxShadow:"0 1px 3px rgba(0,0,0,0.1)" } : { backgroundColor:"transparent", color:"#64748b" })
    }),
    tabBadge: (active) => ({ backgroundColor: active ? "#0f172a" : "#e2e8f0", color: active ? "#fff" : "#64748b", borderRadius:"999px", padding:"1px 7px", fontSize:"0.7rem", fontWeight:700 }),
    searchBox: { display:"flex", alignItems:"center", gap:"0.5rem", backgroundColor:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"8px", padding:"0.4rem 0.75rem" },
    searchInput: { border:"none", background:"transparent", outline:"none", fontSize:"0.875rem", color:"#0f172a", width:"200px" },

    table: { width:"100%", borderCollapse:"collapse" },
    th:    (align) => ({ padding:"0.75rem 1rem", fontSize:"0.75rem", fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.04em", textAlign:align||"left", borderBottom:"1px solid #f1f5f9", backgroundColor:"#fafafa", whiteSpace:"nowrap" }),
    td:    (align) => ({ padding:"0.85rem 1rem", fontSize:"0.875rem", color:"#1e293b", textAlign:align||"left", borderBottom:"1px solid #f8fafc", verticalAlign:"middle" }),
    actionBtn: (bg,color) => ({ backgroundColor:bg, color, border:"none", borderRadius:"7px", padding:"0.35rem 0.7rem", fontSize:"0.75rem", fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:"0.3rem", whiteSpace:"nowrap" }),

    emptyBox: { textAlign:"center", padding:"4rem 2rem", color:"#94a3b8" },
    modalOverlay: { position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 },
    modal: { backgroundColor:"#fff", borderRadius:"16px", padding:"2rem", width:"90%", maxWidth:"480px", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" },
  };

  const tabs = [
    { key:"all",      label:"Recent Quotations", Icon:FileText,     count:sorted.length },
    { key:"pending",  label:"Pending",           Icon:Clock,         count:pendingList.length },
    { key:"approved", label:"Approved",          Icon:CheckCircle,  count:approvedList.length },
    { key:"rejected", label:"Rejected",          Icon:XCircle,      count:rejectedList.length },
  ];

  // Extra columns: show approve/reject buttons on "all" and "pending" tabs
  const showApprovalActions = activeTab === "all" || activeTab === "pending";

  return (
    <div style={S.page}>
      <style>{`
        .admin-trow:hover td { background:#f8fafc !important; }
        .admin-action-btn:hover { opacity:0.85; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>

      {/* Topbar */}
      <div style={S.topbar}>
        <div>
          <div style={S.topTitle}>⚙ Admin Dashboard</div>
          <div style={S.topSub}>Mega Repairing Machinery Equipment LLC</div>
        </div>
        <div style={{ display:"flex", gap:"0.75rem" }}>
          <button onClick={() => onNavigate("users")} style={{ backgroundColor:"rgba(255,255,255,0.1)", color:"white", border:"1px solid rgba(255,255,255,0.2)", borderRadius:"8px", padding:"0.5rem 1rem", fontSize:"0.8125rem", fontWeight:600, cursor:"pointer" }}>
            Manage Users
          </button>
          {/* <button onClick={() => onNavigate("home")} style={{ backgroundColor:"white", color:"#0f172a", border:"none", borderRadius:"8px", padding:"0.5rem 1rem", fontSize:"0.8125rem", fontWeight:600, cursor:"pointer" }}>
            ← Back to Home
          </button> */}
          <button onClick={() => onNavigate("addQuotation")} style={{ backgroundColor:"white", color:"#0f172a", border:"none", borderRadius:"8px", padding:"0.5rem 1rem", fontSize:"0.8125rem", fontWeight:600, cursor:"pointer" }}>
            + Create Quotation
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

      <div style={S.body}>

        {/* Stat cards */}
        <div style={S.statsGrid}>
          {[
            { label:"Total Quotations", value: stats?.counts?.total || quotations.length, accent:"#6366f1", iconBg:"#eff1ff", Icon:FileText, iconColor:"#6366f1", sub:"All time" },
            { label:"Pending Approval", value: stats?.counts?.pending || pendingList.length, accent:"#f59e0b", iconBg:"#fef3c7", Icon:Clock, iconColor:"#f59e0b", sub:"Awaiting review" },
            { label:"Approved",         value: stats?.counts?.approved || approvedList.length, accent:"#10b981", iconBg:"#d1fae5", Icon:CheckCircle, iconColor:"#10b981", sub:`Value: ${fmtCurrency(stats?.totalApprovedValue||0)}` },
            { label:"Rejected",         value: stats?.counts?.rejected || rejectedList.length, accent:"#ef4444", iconBg:"#fee2e2", Icon:XCircle, iconColor:"#ef4444", sub:"Needs revision" },
          ].map(({ label, value, accent, iconBg, Icon: I, iconColor, sub }) => (
            <div key={label} style={S.statCard(accent)}>
              <div style={S.statIcon(iconBg)}><I size={20} color={iconColor} /></div>
              <div>
                <p style={S.statLabel}>{label}</p>
                <p style={S.statValue}>{loading ? "—" : value}</p>
                <p style={S.statSub}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Overview quick stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1rem", marginBottom:"2rem" }}>
          {[
            { label:"Total Customers",    value: customers.length },
            { label:"Catalogue Items",    value: items.length },
            { label:"Approval Rate",      value: quotations.length > 0 ? `${Math.round(((stats?.counts?.approved||approvedList.length)/quotations.length)*100)}%` : "0%" },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor:"#fff", borderRadius:"12px", padding:"1rem 1.5rem", boxShadow:"0 1px 3px rgba(0,0,0,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:"0.875rem", fontWeight:600, color:"#64748b" }}>{label}</span>
              <span style={{ fontSize:"1.5rem", fontWeight:800, color:"#0f172a" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Quotations table with tabs */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div style={S.tabsRow}>
              {tabs.map(({ key, label, Icon:I, count }) => {
                const active = activeTab === key;
                return (
                  <button key={key} style={S.tab(active)} onClick={() => { setActiveTab(key); setSearch(""); }}>
                    <I size={13} />
                    {label}
                    <span style={S.tabBadge(active)}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div style={S.searchBox}>
              <Search size={14} color="#94a3b8" />
              <input style={S.searchInput} placeholder="Search quotations…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", padding:0 }}><X size={13} /></button>}
            </div>
          </div>

          {quotations.length === 0 ? (
            <div style={S.emptyBox}>
              <FileText size={48} color="#cbd5e1" style={{ marginBottom:"1rem" }} />
              <p style={{ fontWeight:600, fontSize:"1rem", color:"#475569", marginBottom:"0.5rem" }}>No quotations yet</p>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th("left")}>Quote #</th>
                    <th style={S.th("left")}>Customer</th>
                    <th style={S.th("left")}>Date</th>
                    <th style={S.th("left")}>Status</th>
                    <th style={S.th("left")}>Created By</th>
                    <th style={S.th("right")}>Total (AED)</th>
                    <th style={S.th("center")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign:"center", padding:"3rem", color:"#94a3b8", fontSize:"0.875rem" }}>
                        No results for "{search}"
                      </td>
                    </tr>
                  ) : filtered.map((q) => {
                    const isExporting = exportingId === q._id;
                    return (
                      <tr key={q._id} className="admin-trow">
                        <td style={S.td()}>
                          <span style={{ fontWeight:700, color:"#0f172a" }}>{q.quotationNumber || "—"}</span>
                        </td>
                        <td style={S.td()}>
                          <div style={{ fontWeight:600 }}>{q.customer || q.customerId?.name || "N/A"}</div>
                        </td>
                        <td style={S.td()}>
                          <span style={{ color:"#64748b", fontSize:"0.8125rem" }}>{fmtDate(q.date)}</span>
                        </td>
                        <td style={S.td()}>{statusBadge(q.status)}</td>
                        <td style={S.td()}>
                          <span style={{ color:"#64748b", fontSize:"0.8125rem" }}>{q.createdBy?.name || "—"}</span>
                        </td>
                        <td style={{ ...S.td("right"), fontWeight:700, color:"#0f172a" }}>
                          {q.total != null ? q.total.toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}
                        </td>
                        <td style={S.td("center")}>
                          <div style={{ display:"flex", gap:"0.35rem", justifyContent:"center", flexWrap:"wrap" }}>
                            {/* Approve — shown for pending */}
                            {(q.status === "pending" || !q.status) && (
                              <button className="admin-action-btn" onClick={() => handleApprove(q._id)} style={S.actionBtn("#dcfce7","#16a34a")} title="Approve">
                                <Check size={12} /> OK
                              </button>
                            )}
                            {/* Reject — shown for pending */}
                            {(q.status === "pending" || !q.status) && (
                              <button className="admin-action-btn" onClick={() => handleRejectOpen(q._id)} style={S.actionBtn("#fee2e2","#dc2626")} title="Reject">
                                <X size={12} /> Rej
                              </button>
                            )}
                            {/* View */}
                            <button className="admin-action-btn" onClick={() => onViewQuotation(q._id)} style={S.actionBtn("#e0f2fe","#0369a1")} title="View">
                              <Eye size={12} /> View
                            </button>
                            {/* Download */}
                            <button className="admin-action-btn" onClick={() => handleDownload(q)} disabled={isExporting} style={S.actionBtn(isExporting ? "#f1f5f9" : "#f0fdf4", isExporting ? "#94a3b8" : "#16a34a")} title="Download PDF">
                              <Download size={12} /> {isExporting ? "…" : "PDF"}
                            </button>
                            {/* Delete */}
                            {(q.status === "pending" || !q.status) && (
                            <button className="admin-action-btn" onClick={() => { if (window.confirm("Delete this quotation?")) onDeleteQuotation?.(q._id); }} style={S.actionBtn("#fff1f2","#e11d48")} title="Delete">
                              <Trash2 size={12} /> Del
                            </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding:"0.75rem 1.5rem", borderTop:"1px solid #f1f5f9", fontSize:"0.8125rem", color:"#64748b" }}>
                Showing {filtered.length} of {tabList.length} quotations
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <h3 style={{ fontSize:"1.25rem", fontWeight:700, color:"#0f172a", marginBottom:"0.5rem" }}>Reject Quotation</h3>
            <p style={{ fontSize:"0.875rem", color:"#64748b", marginBottom:"1.25rem" }}>Provide a reason so the creator can revise.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Enter rejection reason…"
              style={{ width:"100%", padding:"0.75rem", border:"1px solid #e2e8f0", borderRadius:"8px", fontSize:"0.875rem", resize:"vertical", marginBottom:"1.25rem", outline:"none", boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:"0.75rem", justifyContent:"flex-end" }}>
              <button onClick={handleRejectClose} style={{ padding:"0.625rem 1.25rem", backgroundColor:"#f1f5f9", color:"#475569", border:"none", borderRadius:"8px", fontWeight:600, cursor:"pointer", fontSize:"0.875rem" }}>
                Cancel
              </button>
              <button onClick={handleRejectConfirm} disabled={!rejectReason.trim()} style={{ padding:"0.625rem 1.25rem", backgroundColor: rejectReason.trim() ? "#dc2626" : "#e5e7eb", color: rejectReason.trim() ? "white" : "#9ca3af", border:"none", borderRadius:"8px", fontWeight:600, cursor: rejectReason.trim() ? "pointer" : "not-allowed", fontSize:"0.875rem" }}>
                Reject Quotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}