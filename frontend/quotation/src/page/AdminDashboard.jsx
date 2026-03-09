import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adminAPI, quotationAPI } from '../services/api';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import headerImage from '../assets/header.png';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { bg: '#fef9c3', color: '#92400e', dot: '#f59e0b', label: 'Pending'  },
  approved: { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved' },
  accepted: { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Accepted' },
  rejected: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Rejected' },
  draft:    { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft'    },
  sent:     { bg: '#e0f2fe', color: '#075985', dot: '#0ea5e9', label: 'Sent'     },
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const TAB_KEYS = {
  all:      { label: 'All',      Icon: FileText,    status: undefined   },
  pending:  { label: 'Pending',  Icon: Clock,       status: 'pending'   },
  approved: { label: 'Approved', Icon: CheckCircle, status: 'approved'  },
  rejected: { label: 'Rejected', Icon: XCircle,     status: 'rejected'  },
};

// ─────────────────────────────────────────────────────────────
// Pure helpers (module-level — never re-created)
// ─────────────────────────────────────────────────────────────
const fmtCurrency = (n) =>
  `AED ${(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};

const safeTotal = (q) =>
  q.total != null
    ? Number(q.total).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

// ─────────────────────────────────────────────────────────────
// numberToWords (AED)
// ─────────────────────────────────────────────────────────────
const numberToWords = (() => {
  const ones  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
  const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const thou  = ['','Thousand','Lakh','Crore'];
  const cvt   = (n) => {
    if (!n) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + cvt(n % 100) : '');
  };
  const main = (n) => {
    let res = '', i = 0;
    while (n > 0) {
      if (n % 1000) res = cvt(n % 1000) + (thou[i] ? ' ' + thou[i] + ' ' : '') + res;
      n = Math.floor(n / 1000); i++;
    }
    return res.trim() + ' Dirhams Only';
  };
  return (num) => {
    if (!num || num === 0) return 'Zero Dirhams Only';
    const d = Math.floor(num), f = Math.round((num - d) * 100);
    let r = main(d);
    if (f > 0) r = r.replace('Dirhams Only', `Dirhams and ${cvt(f)} Fils Only`);
    return r;
  };
})();

// ─────────────────────────────────────────────────────────────
// imageToBase64
// ─────────────────────────────────────────────────────────────
const imageToBase64 = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src.startsWith('data:')) return resolve(src);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });

// ─────────────────────────────────────────────────────────────
// buildPrintHTML
// ─────────────────────────────────────────────────────────────
const buildPrintHTML = async (q) => {
  const headerBase64 = await imageToBase64(headerImage);
  const itemsWithImages = await Promise.all(
    (q.items || []).map(async (item) => {
      const paths = await Promise.all((item.imagePaths || []).map((p) => imageToBase64(p)));
      return { ...item, _b64Images: paths.filter(Boolean) };
    })
  );
  const subtotal = itemsWithImages.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmt   = (subtotal * (q.tax   || 0)) / 100;
  const discAmt  = (subtotal * (q.discount || 0)) / 100;
  const grand    = subtotal + taxAmt - discAmt;
  const amtWords = numberToWords(grand);
  const first = itemsWithImages.slice(0, 8);
  const rest  = itemsWithImages.slice(8);

  const row = (item, i) => {
    const name = item.itemId?.name || item.name || '—';
    const desc = item.itemId?.description || item.description || '';
    const imgs = item._b64Images || [];
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${i + 1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        <div style="font-weight:600;font-size:11px;">${name}</div>
        ${desc ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${desc}</div>` : ''}
        ${imgs.length ? `<table style="margin-top:6px;border-collapse:collapse;"><tr>${imgs.map(s => `<td style="padding:2px;"><img src="${s}" style="width:110px;height:110px;object-fit:cover;border:1px solid #d1d5db;border-radius:4px;display:block;"/></td>`).join('')}</tr></table>` : ''}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };

  const totals = `
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Subtotal (AED)</td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td></tr>
    <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">VAT (${q.tax || 0}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td></tr>
    ${discAmt > 0 ? `<tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${q.discount}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">−${discAmt.toFixed(2)}</td></tr>` : ''}
    <tr style="background:#000;color:white;font-weight:700;"><td colspan="3" style="border:none;padding:8px;"></td><td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td><td style="text-align:right;padding:12px 8px;font-size:12px;">${grand.toFixed(2)}</td></tr>`;

  const thead = `<thead><tr style="background:#000;">
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
    <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
  </tr></thead>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}.container{width:874px;margin:0 auto;padding:10px;}@page{size:A4;margin:8mm;}thead{display:table-row-group;}@media print{.page-break{page-break-before:always;}}</style>
  </head><body><div class="container">
    <div style="width:100%;height:140px;margin-bottom:24px;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;text-align:center;">${headerBase64 ? `<img src="${headerBase64}" style="max-width:100%;max-height:140px;object-fit:contain;padding:10px;"/>` : `<div style="line-height:140px;font-size:22px;font-weight:bold;">COMPANY LOGO</div>`}</div>
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #000;margin-bottom:16px;"><tr><td style="text-align:center;padding-bottom:12px;"><div style="font-size:26px;font-weight:bold;letter-spacing:1px;">QUOTATION</div><div style="color:#6b7280;font-size:11px;margin-top:4px;">${q.quotationNumber || ''}</div></td><td style="text-align:right;width:180px;padding-bottom:12px;"><div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div><div style="font-size:15px;font-weight:700;">${fmtDate(q.expiryDate)}</div></td></tr></table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#f8fafc;border:1px solid #e2e8f0;"><tr><td style="padding:14px;width:50%;vertical-align:top;"><table style="width:100%;border-collapse:collapse;"><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Customer</td><td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.customer || q.customerId?.name || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Contact</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.contact || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Date</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${fmtDate(q.date)}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Expiry</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${fmtDate(q.expiryDate)}</td></tr></table></td><td style="padding:14px;width:50%;vertical-align:top;border-left:1px solid #e2e8f0;"><table style="width:100%;border-collapse:collapse;"><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Our Ref</td><td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourRef || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Our Contact</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourContact || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Sales Office</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.salesOffice || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Payment</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.paymentTerms || 'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Delivery</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.deliveryTerms || 'N/A'}</td></tr></table></td></tr></table>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Items Detail</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${thead}<tbody>${first.map((item, i) => row(item, i)).join('')}${rest.length === 0 ? totals : ''}</tbody></table>
    ${rest.length > 0 ? `<div class="page-break"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</div><table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody>${rest.map((item, i) => row(item, i + 8)).join('')}${totals}</tbody></table></div>` : ''}
    <div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;"><strong>Amount in words:</strong> ${amtWords}</div>
    ${q.notes ? `<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Notes</div><div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;">${q.notes}</div></div>` : ''}
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;"><div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div><div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">Mega Repairing Machinery Equipment LLC</div></div>
  </div></body></html>`;
};

// ─────────────────────────────────────────────────────────────
// handlePrintQuotation — iframe print (window.print)
// ─────────────────────────────────────────────────────────────
const handlePrintQuotation = async (quotation, onStart, onEnd, onError) => {
  onStart?.();
  try {
    const html   = await buildPrintHTML(quotation);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    await new Promise((resolve) => {
      iframe.onload = resolve;
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
    });
    await new Promise(r => setTimeout(r, 400));
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    await new Promise(r => setTimeout(r, 1000));
    document.body.removeChild(iframe);
    onEnd?.();
  } catch (err) {
    onError?.(err.message || 'Failed to generate PDF');
  }
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700, backgroundColor:cfg.bg, color:cfg.color }}>
      <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:cfg.dot, display:'inline-block' }} />
      {cfg.label}
    </span>
  );
}

function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:9999, display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:'flex', alignItems:'center', gap:'0.75rem',
          backgroundColor: t.type==='error' ? '#fef2f2' : t.type==='success' ? '#f0fdf4' : '#eff6ff',
          border:`1px solid ${t.type==='error' ? '#fecaca' : t.type==='success' ? '#bbf7d0' : '#bfdbfe'}`,
          color: t.type==='error' ? '#991b1b' : t.type==='success' ? '#166534' : '#1e40af',
          padding:'0.75rem 1rem', borderRadius:10, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:280, animation:'slideIn 0.2s ease',
        }}>
          {t.type==='error' ? <AlertCircle size={16}/> : <CheckCircle size={16}/>}
          <span style={{ fontSize:'0.875rem', fontWeight:500, flex:1 }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, opacity:0.6 }}><X size={14}/></button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onCancel, children }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={(e) => e.target===e.currentTarget && onCancel()}>
      <div style={{ backgroundColor:'#fff', borderRadius:16, padding:'2rem', width:'90%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', animation:'popIn 0.18s ease' }}>
        <h3 style={{ fontSize:'1.125rem', fontWeight:700, color:'#0f172a', marginBottom:'0.5rem' }}>{title}</h3>
        <p style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{message}</p>
        {children}
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button onClick={onCancel} style={{ padding:'0.6rem 1.25rem', backgroundColor:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'0.6rem 1.25rem', backgroundColor:danger?'#dc2626':'#10b981', color:'white', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent, iconBg, iconColor, Icon, loading }) {
  return (
    <div style={{ backgroundColor:'#fff', borderRadius:14, padding:'1.25rem 1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`4px solid ${accent}`, display:'flex', alignItems:'center', gap:'1rem' }}>
      <div style={{ width:46, height:46, borderRadius:12, backgroundColor:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={22} color={iconColor}/>
      </div>
      <div style={{ minWidth:0 }}>
        <p style={{ fontSize:'0.7rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>{label}</p>
        {loading
          ? <div style={{ height:28, width:64, borderRadius:6, marginTop:4, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
          : <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#0f172a', margin:0, lineHeight:1 }}>{value}</p>
        }
        {sub && !loading && <p style={{ fontSize:'0.72rem', color:'#94a3b8', margin:'4px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function ActionBtn({ bg, color, onClick, disabled, title, icon: Icon, label }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{ backgroundColor:bg, color, border:'none', borderRadius:7, padding:'0.35rem 0.65rem', fontSize:'0.72rem', fontWeight:600, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1, display:'inline-flex', alignItems:'center', gap:'0.3rem', whiteSpace:'nowrap', transition:'opacity 0.15s' }}>
      <Icon size={12}/> {label}
    </button>
  );
}

function SortHeader({ label, field, sort, onSort, align }) {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:active?'#0f172a':'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:align||'left', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {label}
        <span style={{ opacity:active?1:0.3 }}>
          {active && sort.dir==='asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </span>
      </span>
    </th>
  );
}

function NavBtn({ onClick, label, primary }) {
  return (
    <button onClick={onClick} className="adm-btn" style={{ backgroundColor:primary?'white':'rgba(255,255,255,0.08)', color:primary?'#0f172a':'#94a3b8', border:primary?'none':'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.875rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Pagination bar
// ─────────────────────────────────────────────────────────────
function PaginationBar({ pagination, page, limit, onPage, onLimit }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { totalPages, total, hasNextPage, hasPrevPage } = pagination;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  // Page window: show max 5 pages around current
  const pages = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);

  return (
    <div style={{ padding:'0.75rem 1.5rem', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
      <span style={{ fontSize:'0.8rem', color:'#64748b' }}>
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> quotations
      </span>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        {/* Rows per page */}
        <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>Rows:</span>
        <select value={limit} onChange={e => { onLimit(Number(e.target.value)); onPage(1); }}
          style={{ fontSize:'0.78rem', border:'1px solid #e2e8f0', borderRadius:6, padding:'0.25rem 0.5rem', color:'#0f172a', background:'#fff', cursor:'pointer' }}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Prev */}
        <button onClick={() => onPage(page - 1)} disabled={!hasPrevPage}
          style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:hasPrevPage?'pointer':'not-allowed', opacity:hasPrevPage?1:0.4, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronLeft size={14}/>
        </button>

        {/* First page if not visible */}
        {pages[0] > 1 && <>
          <PageBtn n={1} current={page} onPage={onPage}/>
          {pages[0] > 2 && <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}
        </>}

        {pages.map(n => <PageBtn key={n} n={n} current={page} onPage={onPage}/>)}

        {/* Last page if not visible */}
        {pages[pages.length - 1] < totalPages && <>
          {pages[pages.length - 1] < totalPages - 1 && <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}
          <PageBtn n={totalPages} current={page} onPage={onPage}/>
        </>}

        {/* Next */}
        <button onClick={() => onPage(page + 1)} disabled={!hasNextPage}
          style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:hasNextPage?'pointer':'not-allowed', opacity:hasNextPage?1:0.4, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
}

function PageBtn({ n, current, onPage }) {
  const active = n === current;
  return (
    <button onClick={() => onPage(n)}
      style={{ width:30, height:30, border:`1px solid ${active?'#0f172a':'#e2e8f0'}`, borderRadius:7, background:active?'#0f172a':'#fff', color:active?'#fff':'#0f172a', fontWeight:active?700:400, fontSize:'0.8rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {n}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function AdminDashboard({
  customers      = [],
  items          = [],
  onNavigate,
  onApproveQuotation,
  onRejectQuotation,
  onDeleteQuotation,
  onViewQuotation,
  onLogout,
}) {
  // ── Table state ───────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState('all');
  const [quotations,  setQuotations]  = useState([]);
  const [pagination,  setPagination]  = useState(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError,  setTableError]  = useState(null);
  const [page,        setPage]        = useState(1);
  const [limit,       setLimit]       = useState(20);
  const [search,      setSearch]      = useState('');
  const [sort,        setSort]        = useState({ field: 'createdAt', dir: 'desc' });

  // ── Stats state ───────────────────────────────────────────
  const [stats,        setStats]       = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError,   setStatsError]  = useState(null);

  // ── Action state ──────────────────────────────────────────
  const [exportingId, setExportingId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });
  const [toasts,      setToasts]      = useState([]);

  const searchRef   = useRef(null);
  const toastIdRef  = useRef(0);
  const searchTimer = useRef(null);
  // ✅ hasFetched: flips true the first time tableLoading goes false.
  //    Prevents the empty-state from flashing before the first fetch completes.
  const hasFetched  = useRef(false);
  if (!tableLoading) hasFetched.current = true;

  // ── Toast helpers ─────────────────────────────────────────
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id) =>
    setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── Fetch stats ───────────────────────────────────────────
  const fetchStats = useCallback(() => {
    setStatsLoading(true);
    setStatsError(null);
    adminAPI.getDashboardStats()
      .then(res => setStats(res.data))
      .catch(err => setStatsError(err?.response?.data?.message || err.message || 'Failed to load stats'))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Fetch quotations (server-side) ────────────────────────
  const fetchQuotations = useCallback(() => {
    setTableLoading(true);
    setTableError(null);

    const status = TAB_KEYS[activeTab]?.status;
    const params = {
      page,
      limit,
      sortBy:  sort.field,
      sortDir: sort.dir,
      ...(status  ? { status }  : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    };

    adminAPI.getAllQuotations(params)
      .then(res => {
        // Support both paginated response { data, pagination } and plain array
        if (Array.isArray(res.data)) {
          setQuotations(res.data);
          setPagination(null);
        } else {
          setQuotations(res.data.data || []);
          setPagination(res.data.pagination || null);
        }
      })
      .catch(err => setTableError(err?.response?.data?.message || err.message || 'Failed to load quotations'))
      .finally(() => setTableLoading(false));
  }, [activeTab, page, limit, sort, search]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  // ── Debounced search ──────────────────────────────────────
  const handleSearchChange = useCallback((val) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 350);
  }, []);

  // Local search input value (uncontrolled feel but controlled)
  const [searchInput, setSearchInput] = useState('');
  const onSearchInput = (e) => {
    setSearchInput(e.target.value);
    handleSearchChange(e.target.value);
  };
  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  // ── Tab change ────────────────────────────────────────────
  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
    setSearchInput('');
    setSearch('');
    setSort({ field: 'createdAt', dir: 'desc' });
  }, []);

  // ── Sort ──────────────────────────────────────────────────
  const handleSort = useCallback((field) => {
    setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  }, []);

  // ── PDF download ──────────────────────────────────────────
  const handleDownload = useCallback((quotation) => {
    handlePrintQuotation(
      quotation,
      () => setExportingId(quotation._id),
      () => { setExportingId(null); addToast('PDF ready — use "Save as PDF" in the print dialog', 'success'); },
      (msg) => { setExportingId(null); addToast(`PDF failed: ${msg}`, 'error'); }
    );
  }, [addToast]);

  // ── Approve ───────────────────────────────────────────────
  const handleApprove = useCallback((id) => {
    onApproveQuotation?.(id);
    // Optimistically refresh after short delay
    setTimeout(fetchQuotations, 500);
  }, [onApproveQuotation, fetchQuotations]);

  // ── Reject ────────────────────────────────────────────────
  const openReject    = useCallback((id) => setRejectModal({ open: true, id, reason: '' }), []);
  const closeReject   = useCallback(() => setRejectModal({ open: false, id: null, reason: '' }), []);
  const confirmReject = useCallback(() => {
    if (!rejectModal.reason.trim()) return;
    onRejectQuotation?.(rejectModal.id, rejectModal.reason);
    closeReject();
    setTimeout(fetchQuotations, 500);
  }, [rejectModal, onRejectQuotation, closeReject, fetchQuotations]);

  // ── Delete ────────────────────────────────────────────────
  const openDelete    = useCallback((id) => setDeleteModal({ open: true, id }), []);
  const closeDelete   = useCallback(() => setDeleteModal({ open: false, id: null }), []);
  const confirmDelete = useCallback(() => {
    onDeleteQuotation?.(deleteModal.id);
    closeDelete();
    setTimeout(fetchQuotations, 500);
  }, [deleteModal, onDeleteQuotation, closeDelete, fetchQuotations]);

  // ── Keyboard shortcut / → focus search ───────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Derived stats values ──────────────────────────────────
  const totalCount    = stats?.counts?.total    ?? 0;
  const pendingCount  = stats?.counts?.pending  ?? 0;
  const approvedCount = stats?.counts?.approved ?? 0;
  const rejectedCount = stats?.counts?.rejected ?? 0;
  const approvedValue = stats?.totalApprovedValue ?? 0;
  const approvalRate  = totalCount > 0
    ? `${Math.round((approvedCount / totalCount) * 100)}%` : '0%';

  const TABS = Object.entries(TAB_KEYS).map(([key, { label, Icon, status }]) => ({
    key, label, Icon,
    count: key === 'all'      ? totalCount
         : key === 'pending'  ? pendingCount
         : key === 'approved' ? approvedCount
         : rejectedCount,
  }));

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f1f5f9', fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
        @keyframes popIn   { from { transform:scale(0.95);opacity:0; } to { transform:scale(1);opacity:1; } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .adm-row:hover td  { background:#f8fafc !important; }
        .adm-btn:hover     { opacity:0.8 !important; }
        .adm-tab:hover     { background:rgba(255,255,255,0.6) !important; }
      `}</style>

      {/* ── Topbar ────────────────────────────────────────── */}
      <div style={{ backgroundColor:'#0f172a', padding:'0 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 8px rgba(0,0,0,0.25)' }}>
        <div>
          <div style={{ fontSize:'1.0625rem', fontWeight:800, color:'white', letterSpacing:'-0.01em' }}>⚙ Admin Dashboard</div>
          <div style={{ fontSize:'0.72rem', color:'#64748b', marginTop:1 }}>Mega Repairing Machinery Equipment LLC</div>
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
          <NavBtn onClick={() => onNavigate('users')}         label="Manage Users" />
          <NavBtn onClick={() => onNavigate('addQuotation')}  label="+ Create Quotation" primary />
          <button onClick={onLogout} className="adm-btn" title="Logout"
            style={{ backgroundColor:'rgba(255,255,255,0.08)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.85rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <LogOut size={15}/> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'2rem' }}>

        {/* ── Stats error ───────────────────────────────── */}
        {statsError && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', backgroundColor:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'0.875rem 1rem', marginBottom:'1.25rem', fontSize:'0.875rem', color:'#991b1b' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><AlertCircle size={16}/> {statsError}</div>
            <button onClick={fetchStats} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', display:'flex', alignItems:'center', gap:'0.3rem', fontWeight:600, fontSize:'0.8rem' }}>
              <RefreshCw size={13}/> Retry
            </button>
          </div>
        )}

        {/* ── Stat cards ────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
          <StatCard label="Total Quotations" value={totalCount}    accent="#6366f1" iconBg="#eff1ff" iconColor="#6366f1" Icon={FileText}    loading={statsLoading} sub="All time" />
          <StatCard label="Pending Approval" value={pendingCount}  accent="#f59e0b" iconBg="#fef3c7" iconColor="#f59e0b" Icon={Clock}       loading={statsLoading} sub="Awaiting review" />
          <StatCard label="Approved"         value={approvedCount} accent="#10b981" iconBg="#d1fae5" iconColor="#10b981" Icon={CheckCircle} loading={statsLoading} sub={`Value: ${fmtCurrency(approvedValue)}`} />
          <StatCard label="Rejected"         value={rejectedCount} accent="#ef4444" iconBg="#fee2e2" iconColor="#ef4444" Icon={XCircle}     loading={statsLoading} sub="Needs revision" />
        </div>

        {/* ── Overview mini stats ───────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem', marginBottom:'1.75rem' }}>
          {[
            { label:'Total Customers', value:customers.length },
            { label:'Catalogue Items', value:items.length },
            { label:'Approval Rate',   value:approvalRate },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor:'#fff', borderRadius:12, padding:'1rem 1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'0.875rem', fontWeight:600, color:'#64748b' }}>{label}</span>
              <span style={{ fontSize:'1.5rem', fontWeight:800, color:'#0f172a' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Table card ────────────────────────────────── */}
        {/* ✅ position:relative so refresh overlay can be absolute inside; overflow:visible so overlay isn't clipped */}
        <div style={{ backgroundColor:'#fff', borderRadius:14, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'visible', position:'relative' }}>

          {/* Card header */}
          <div style={{ padding:'1.125rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
            {/* Tabs */}
            <div style={{ display:'flex', gap:'0.2rem', padding:'0.35rem', backgroundColor:'#f1f5f9', borderRadius:10 }}>
              {TABS.map(({ key, label, Icon:I, count }) => {
                const active = activeTab === key;
                return (
                  <button key={key} className="adm-tab" onClick={() => handleTabChange(key)}
                    style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.35rem', transition:'all 0.15s', backgroundColor:active?'#fff':'transparent', color:active?'#0f172a':'#64748b', boxShadow:active?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                    <I size={13}/> {label}
                    <span style={{ backgroundColor:active?'#0f172a':'#e2e8f0', color:active?'#fff':'#64748b', borderRadius:999, padding:'1px 7px', fontSize:'0.68rem', fontWeight:700 }}>
                      {statsLoading ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              {/* Refresh */}
              <button onClick={fetchQuotations} disabled={tableLoading} title="Refresh"
                style={{ width:34, height:34, border:'1px solid #e2e8f0', borderRadius:8, background:'#f8fafc', cursor:tableLoading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:tableLoading?0.5:1 }}>
                <RefreshCw size={14} color="#64748b" style={tableLoading ? { animation:'spin 1s linear infinite' } : {}}/>
              </button>

              {/* Search */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'0.4rem 0.75rem' }}>
                <Search size={14} color="#94a3b8"/>
                <input
                  ref={searchRef}
                  style={{ border:'none', background:'transparent', outline:'none', fontSize:'0.875rem', color:'#0f172a', width:210 }}
                  placeholder="Search… (press /)"
                  value={searchInput}
                  onChange={onSearchInput}
                />
                {searchInput && (
                  <button onClick={clearSearch} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0 }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table error */}
          {tableError && (
            <div style={{ padding:'1rem 1.5rem', backgroundColor:'#fef2f2', borderBottom:'1px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.875rem', color:'#991b1b' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><AlertCircle size={15}/> {tableError}</div>
              <button onClick={fetchQuotations} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', fontWeight:600, fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <RefreshCw size={13}/> Retry
              </button>
            </div>
          )}

          {/* ✅ Stale-data refresh overlay — keeps existing rows visible while re-fetching */}
          {tableLoading && quotations.length > 0 && (
            <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(255,255,255,0.72)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:14, backdropFilter:'blur(1px)' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', background:'white', padding:'1.25rem 2rem', borderRadius:12, boxShadow:'0 4px 24px rgba(15,23,42,0.12)', border:'1px solid #e2e8f0' }}>
                <RefreshCw size={24} color="#6366f1" style={{ animation:'spin 0.8s linear infinite' }}/>
                <span style={{ fontSize:'0.82rem', color:'#6366f1', fontWeight:700 }}>Refreshing data…</span>
              </div>
            </div>
          )}

          {/* ✅ First-load skeleton — real table rows matching column widths, not div blobs */}
          {!hasFetched.current && tableLoading && (
            <div style={{ overflowX:'auto', borderRadius:'0 0 14px 14px', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor:'#fafafa' }}>
                    {['Quote #','Customer','Date','Expiry','Status','Created By','Total (AED)','Actions'].map(h => (
                      <th key={h} style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #f1f5f9', textAlign: h==='Total (AED)'?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[80,130,80,80,80,90,80,120].map((_, rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom:'1px solid #f8fafc', opacity: 1 - rowIdx * 0.1 }}>
                      {[80,130,80,80,80,90,80,120].map((w, colIdx) => (
                        <td key={colIdx} style={{ padding:'0.85rem 1rem', verticalAlign:'middle' }}>
                          <div style={{ height:14, width:w, borderRadius:6, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ✅ Data section — only rendered after first fetch completes */}
          {hasFetched.current && !tableError && (
            <>
              {hasFetched.current && !tableLoading && quotations.length === 0 ? (
                <div style={{ textAlign:'center', padding:'4rem 2rem', color:'#94a3b8' }}>
                  <FileText size={48} color="#cbd5e1" style={{ marginBottom:'1rem' }}/>
                  <p style={{ fontWeight:600, fontSize:'1rem', color:'#475569', marginBottom:'0.5rem' }}>
                    {search ? `No results for "${search}"` : 'No quotations yet'}
                  </p>
                  {search && <button onClick={clearSearch} style={{ marginTop:'0.5rem', background:'none', border:'none', color:'#0369a1', cursor:'pointer', fontWeight:600, fontSize:'0.875rem' }}>Clear search</button>}
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <SortHeader label="Quote #"     field="quotationNumber" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Customer"    field="customer"        sort={sort} onSort={handleSort}/>
                        <SortHeader label="Date"        field="date"            sort={sort} onSort={handleSort}/>
                        <SortHeader label="Expiry"      field="expiryDate"      sort={sort} onSort={handleSort}/>
                        <SortHeader label="Status"      field="status"          sort={sort} onSort={handleSort}/>
                        <SortHeader label="Created By"  field="createdBy"       sort={sort} onSort={handleSort}/>
                        <SortHeader label="Total (AED)" field="total"           sort={sort} onSort={handleSort} align="right"/>
                        <th style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotations.map((q) => {
                        const isExp  = exportingId === q._id;
                        const isPend = q.status === 'pending' || !q.status;
                        const exp    = q.expiryDate ? new Date(q.expiryDate) : null;
                        const expired = exp && exp < new Date();
                        return (
                          <tr key={q._id} className="adm-row">
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <span style={{ fontWeight:700, color:'#0f172a', fontFamily:'monospace', fontSize:'0.8rem' }}>{q.quotationNumber || '—'}</span>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <div style={{ fontWeight:600, color:'#0f172a', fontSize:'0.875rem' }}>{q.customer || q.customerId?.name || 'N/A'}</div>
                              {q.contact && <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:2 }}>{q.contact}</div>}
                            </td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>{fmtDate(q.date)}</td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>
                              <span style={{ color:expired && isPend?'#dc2626':'#64748b', fontWeight:expired && isPend?600:400 }}>
                                {fmtDate(q.expiryDate)}
                                {expired && isPend && <span style={{ fontSize:'0.65rem', marginLeft:4 }}>⚠ Expired</span>}
                              </span>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}><StatusBadge status={q.status}/></td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>{q.createdBy?.name || '—'}</td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.875rem', fontWeight:700, color:'#0f172a', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', textAlign:'right', whiteSpace:'nowrap' }}>{safeTotal(q)}</td>
                            <td style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <div style={{ display:'flex', gap:'0.3rem', justifyContent:'center', flexWrap:'wrap' }}>
                                {isPend && <ActionBtn bg="#dcfce7" color="#166534" onClick={() => handleApprove(q._id)}    icon={Check}    label="OK"   title="Approve"/>}
                                {isPend && <ActionBtn bg="#fee2e2" color="#dc2626" onClick={() => openReject(q._id)}       icon={X}        label="Rej"  title="Reject"/>}
                                <ActionBtn   bg="#e0f2fe" color="#0369a1" onClick={() => onViewQuotation?.(q._id)}         icon={Eye}      label="View" title="View"/>
                                <ActionBtn   bg={isExp?'#f1f5f9':'#f0fdf4'} color={isExp?'#94a3b8':'#166534'}
                                             onClick={() => !isExp && handleDownload(q)} disabled={isExp}
                                             icon={isExp?RefreshCw:Download} label={isExp?'…':'PDF'} title="Download PDF"/>
                                {isPend && <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => openDelete(q._id)}       icon={Trash2}   label="Del"  title="Delete"/>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <PaginationBar
                pagination={pagination}
                page={page}
                limit={limit}
                onPage={setPage}
                onLimit={setLimit}
              />
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal open={rejectModal.open} title="Reject Quotation" message="Provide a reason so the creator can revise the quotation." confirmLabel="Reject Quotation" danger onConfirm={confirmReject} onCancel={closeReject}>
        <textarea value={rejectModal.reason} onChange={e => setRejectModal(prev => ({ ...prev, reason: e.target.value }))} rows={4} placeholder="Enter rejection reason…" autoFocus
          style={{ width:'100%', padding:'0.75rem', border:'1px solid #e2e8f0', borderRadius:8, fontSize:'0.875rem', resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
      </ConfirmModal>

      <ConfirmModal open={deleteModal.open} title="Delete Quotation" message="This action cannot be undone. The quotation and all associated images will be permanently removed." confirmLabel="Delete" danger onConfirm={confirmDelete} onCancel={closeDelete}/>

      <Toast toasts={toasts} onDismiss={dismissToast}/>
    </div>
  );
}