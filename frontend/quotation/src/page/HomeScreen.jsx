import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users, Package, Plus, Trash2, Eye, Download, FileText,
  TrendingUp, AlertCircle, LogOut, Loader, Search, X,
  CheckCircle, RefreshCw, Clock, Award, Ban,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,Calendar,
  ThumbsUp, ThumbsDown, Building2, DollarSign
} from 'lucide-react';
import QueryDateUpdater from '../components/QueryDateUpdater';
import headerImage from '../assets/header.png';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { useAppStore, useCompanyQuotations } from '../services/store';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEBOUNCE_MS       = 350;

const STATUS_CONFIG = {
  pending:      { bg: '#fef9c3', color: '#92400e', dot: '#f59e0b', label: 'Awaiting Ops Review'   },
  ops_approved: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6', label: 'Forwarded to Admin'    },
  ops_rejected: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Returned by Ops'       },
  approved:     { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved'               },
  rejected:     { bg: '#fce7f3', color: '#9d174d', dot: '#ec4899', label: 'Rejected by Admin'      },
  awarded:      { bg: '#d1fae5', color: '#065f46', dot: '#10b981', label: 'Awarded ✓'              },
  not_awarded:  { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af', label: 'Not Awarded'            },
  draft:        { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft'                  },
};

const TAB_KEYS = {
  all:       { label: 'All',        Icon: FileText,    statusFilter: null                        },
  pending:   { label: 'Pending',    Icon: Clock,       statusFilter: 'pending'                   },
  in_review: { label: 'In Review',  Icon: RefreshCw,   statusFilter: 'ops_approved'              },
  approved:  { label: 'Approved',   Icon: CheckCircle, statusFilter: 'approved'                  },
  awarded:   { label: 'Awarded',    Icon: Award,       statusFilter: 'awarded'                   },
  returned:  { label: 'Returned',   Icon: Ban,         statusFilter: ['ops_rejected','rejected']  },
};

const DELETABLE = new Set(['pending', 'ops_rejected']);

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────
const fmtCurrency = (n, currency = 'AED') => {
  const symbols = {
    AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك',
    BHD: '.د.ب', OMR: '﷼', USD: '$', EUR: '€', GBP: '£'
  };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const isExpired      = (d) => { if (!d) return false; const dt = new Date(d); return !isNaN(dt.getTime()) && dt < new Date(); };
const isExpiringSoon = (d) => { if (!d) return false; const dt = new Date(d); if (isNaN(dt.getTime())) return false; const days = Math.ceil((dt - new Date()) / 86400000); return days >= 0 && days <= 7; };

// ─────────────────────────────────────────────────────────────
// numberToWords
// ─────────────────────────────────────────────────────────────
const numberToWords = (() => {
  const ones  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
  const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const thou  = ['','Thousand','Lakh','Crore'];
  const cvt   = (n) => { if (!n) return ''; if (n<10) return ones[n]; if (n<20) return teens[n-10]; if (n<100) return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:''); return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+cvt(n%100):''); };
  const main  = (n) => { let res='',i=0; while(n>0){if(n%1000) res=cvt(n%1000)+(thou[i]?' '+thou[i]+' ':'')+res; n=Math.floor(n/1000);i++;} return res.trim()+' Dirhams Only'; };
  return (num) => { if(!num||num===0) return 'Zero Dirhams Only'; const d=Math.floor(num),f=Math.round((num-d)*100); let r=main(d); if(f>0) r=r.replace('Dirhams Only',`Dirhams and ${cvt(f)} Fils Only`); return r; };
})();

// ─────────────────────────────────────────────────────────────
// imageToBase64 with cache
// ─────────────────────────────────────────────────────────────
const imageToBase64 = (() => {
  const cache = new Map();
  return (src) => new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src.startsWith('data:')) return resolve(src);
    if (cache.has(src)) return resolve(cache.get(src));
    const img = new Image(); img.crossOrigin = 'Anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); try { const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').drawImage(img,0,0); const b64=c.toDataURL('image/png'); cache.set(src,b64); resolve(b64); } catch { resolve(null); } };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
})();

// ─────────────────────────────────────────────────────────────
// buildPrintHTML
// ─────────────────────────────────────────────────────────────
const buildPrintHTML = async (q, company) => {
  const [headerBase64, ...itemsWithImages] = await Promise.all([
    imageToBase64(headerImage),
    ...(q.items||[]).map(async (item) => { const paths=await Promise.all((item.imagePaths||[]).map(p=>imageToBase64(p))); return {...item,_b64Images:paths.filter(Boolean)}; }),
  ]);

  const subtotal=(itemsWithImages.reduce((s,i)=>s+i.quantity*i.unitPrice,0));
  const taxAmt=(subtotal*(q.taxPercent||0))/100;
  const discAmt=(subtotal*(q.discountPercent||0))/100;
  const grand=subtotal+taxAmt-discAmt;
  const amtWords=numberToWords(grand);
  const first=itemsWithImages.slice(0,8);
  const rest=itemsWithImages.slice(8);

  const row=(item,i)=>{const name=item.itemId?.name||item.name||'—';const desc=item.itemId?.description||item.description||'';const imgs=item._b64Images||[];return `<tr><td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${i+1}</td><td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;"><div style="font-weight:600;font-size:11px;">${name}</div>${desc?`<div style="font-size:9px;color:#6b7280;margin-top:3px;">${desc}</div>`:''}${imgs.length?`<table style="margin-top:6px;border-collapse:collapse;"><tr>${imgs.map(s=>`<td style="padding:2px;"><img src="${s}" style="width:110px;height:110px;object-fit:cover;border:1px solid #d1d5db;border-radius:4px;display:block;"/></td>`).join('')}</tr></table>`:''}</td><td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td><td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(item.unitPrice).toFixed(2)}</td><td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity*item.unitPrice).toFixed(2)}</td></tr>`;};

  const totals=`<tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Subtotal (${q.currency?.code})</td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td></tr><tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">VAT (${q.taxPercent||0}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td></tr>${discAmt>0?`<tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${q.discountPercent}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">−${discAmt.toFixed(2)}</td></tr>`:''}<tr style="background:#000;color:white;font-weight:700;"><td colspan="3" style="border:none;padding:8px;"></td><td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (${q.currency?.code})</td><td style="text-align:right;padding:12px 8px;font-size:12px;">${grand.toFixed(2)}</td></tr>`;

  const thead=`<thead><tr style="background:#000;"><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th><th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th><th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th><th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th></tr></thead>`;

  const companyInfo = q.companySnapshot || company;
  const companyFooter = companyInfo ? `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
      <div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div>
      <div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">${companyInfo.name}</div>
      ${companyInfo.vatNumber ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;">VAT: ${companyInfo.vatNumber}</div>` : ''}
      ${companyInfo.email ? `<div style="font-size:9px;color:#6b7280;">${companyInfo.email}</div>` : ''}
      ${companyInfo.phone ? `<div style="font-size:9px;color:#6b7280;">${companyInfo.phone}</div>` : ''}
    </div>
  ` : `<div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;"><div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div><div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">Mega Repairing Machinery Equipment LLC</div></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}.container{width:874px;margin:0 auto;padding:10px;}@page{size:A4;margin:8mm;}thead{display:table-row-group;}@media print{.page-break{page-break-before:always;}}</style></head><body><div class="container"><div style="width:100%;height:140px;margin-bottom:24px;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;text-align:center;">${headerBase64?`<img src="${headerBase64}" style="max-width:100%;max-height:140px;object-fit:contain;padding:10px;"/>`:`<div style="line-height:140px;font-size:22px;font-weight:bold;">COMPANY LOGO</div>`}</div><table style="width:100%;border-collapse:collapse;border-bottom:3px solid #000;margin-bottom:16px;"><tr><td style="text-align:center;padding-bottom:12px;"><div style="font-size:26px;font-weight:bold;letter-spacing:1px;">QUOTATION</div><div style="color:#6b7280;font-size:11px;margin-top:4px;">${q.quotationNumber||''}</div></td><td style="text-align:right;width:180px;padding-bottom:12px;"><div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div><div style="font-size:15px;font-weight:700;">${fmtDate(q.expiryDate)}</div></td></tr></table><table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#f8fafc;border:1px solid #e2e8f0;"><tr><td style="padding:14px;width:50%;vertical-align:top;"><table style="width:100%;border-collapse:collapse;"><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Customer</td><td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.customerSnapshot?.name||q.customer||q.customerId?.name||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Contact</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.contact||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Date</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${fmtDate(q.date)}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Expiry</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${fmtDate(q.expiryDate)}</td></tr></table></td><td style="padding:14px;width:50%;vertical-align:top;border-left:1px solid #e2e8f0;"><table style="width:100%;border-collapse:collapse;"><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Our Ref</td><td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourRef||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Our Contact</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourContact||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Sales Office</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.salesOffice||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Payment</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.paymentTerms||'N/A'}</td></tr><tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Delivery</td><td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.deliveryTerms||'N/A'}</td></tr></table></td></tr></table><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Items Detail</div><table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${thead}<tbody>${first.map((item,i)=>row(item,i)).join('')}${rest.length===0?totals:''}</tbody></table>${rest.length>0?`<div class="page-break"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</div><table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${thead}<tbody>${rest.map((item,i)=>row(item,i+8)).join('')}${totals}</tbody></table></div>`:''}<div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;"><strong>Amount in words:</strong> ${amtWords}</div>${q.notes?`<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Notes</div><div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;">${q.notes}</div></div>`:''}${companyFooter}</div></body></html>`;
};

const handlePrintQuotation = async (quotation, company, onStart, onEnd, onError) => {
  onStart?.();
  let iframe = null;
  try {
    const html = await buildPrintHTML(quotation, company);
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    await new Promise((resolve, reject) => { iframe.onload=resolve; iframe.onerror=reject; iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close(); });
    await new Promise(r => setTimeout(r, 400));
    iframe.contentWindow.focus(); iframe.contentWindow.print();
    await new Promise(r => setTimeout(r, 1000));
    onEnd?.();
  } catch (err) { onError?.(err.message||'Failed to generate PDF'); }
  finally { if (iframe?.parentNode) document.body.removeChild(iframe); }
};

// ─────────────────────────────────────────────────────────────
// Shared sub-components (unchanged from your version)
// ─────────────────────────────────────────────────────────────

const StatusBadge = React.memo(({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700, backgroundColor:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:cfg.dot, display:'inline-block', flexShrink:0 }}/>
      {cfg.label}
    </span>
  );
});
StatusBadge.displayName = 'StatusBadge';

const RejectionNote = React.memo(({ quotation }) => {
  const reason = quotation.status === 'ops_rejected' ? quotation.opsRejectionReason
               : quotation.status === 'rejected'     ? quotation.rejectionReason : null;
  if (!reason) return null;
  return (
    <div title={reason} style={{ fontSize:'0.68rem', color:quotation.status==='ops_rejected'?'#991b1b':'#9d174d', fontStyle:'italic', marginTop:3, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
      "{reason}"
    </div>
  );
});
RejectionNote.displayName = 'RejectionNote';

const Toast = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:9999, display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', backgroundColor:t.type==='error'?'#fef2f2':t.type==='success'?'#f0fdf4':'#eff6ff', border:`1px solid ${t.type==='error'?'#fecaca':t.type==='success'?'#bbf7d0':'#bfdbfe'}`, color:t.type==='error'?'#991b1b':t.type==='success'?'#166534':'#1e40af', padding:'0.75rem 1rem', borderRadius:10, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:280, animation:'hs-slideIn 0.2s ease' }}>
          {t.type==='success'?<CheckCircle size={16}/>:<AlertCircle size={16}/>}
          <span style={{ fontSize:'0.875rem', fontWeight:500, flex:1 }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, opacity:0.6 }}><X size={14}/></button>
        </div>
      ))}
    </div>
  );
});
Toast.displayName = 'Toast';

const StatCard = React.memo(({ label, value, sub, accent, iconBg, iconColor, Icon, loading }) => (
  <div style={{ backgroundColor:'#fff', borderRadius:14, padding:'1.25rem 1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`4px solid ${accent}`, display:'flex', alignItems:'center', gap:'1rem' }}>
    <div style={{ width:46, height:46, borderRadius:12, backgroundColor:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Icon size={22} color={iconColor}/>
    </div>
    <div style={{ minWidth:0 }}>
      <p style={{ fontSize:'0.7rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>{label}</p>
      {loading
        ? <div style={{ height:28, width:64, borderRadius:6, marginTop:4, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'hs-shimmer 1.4s ease infinite' }}/>
        : <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#0f172a', margin:0, lineHeight:1 }}>{value}</p>
      }
      {sub && !loading && <p style={{ fontSize:'0.72rem', color:'#94a3b8', margin:'4px 0 0' }}>{sub}</p>}
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

const ActionBtn = React.memo(({ bg, color, onClick, disabled, title, icon: Icon, label }) => (
  <button onClick={onClick} disabled={disabled} title={title} className="hs-action-btn"
    style={{ backgroundColor:bg, color, border:'none', borderRadius:7, padding:'0.35rem 0.65rem', fontSize:'0.72rem', fontWeight:600, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1, display:'inline-flex', alignItems:'center', gap:'0.3rem', whiteSpace:'nowrap', transition:'opacity 0.15s,transform 0.15s', fontFamily:'inherit' }}>
    <Icon size={12}/> {label}
  </button>
));
ActionBtn.displayName = 'ActionBtn';

const SortHeader = React.memo(({ label, field, sort, onSort, align }) => {
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
});
SortHeader.displayName = 'SortHeader';

const NavBtn = React.memo(({ onClick, label, primary }) => (
  <button onClick={onClick} className="hs-nav-btn"
    style={{ backgroundColor:primary?'white':'rgba(255,255,255,0.08)', color:primary?'#0f172a':'#94a3b8', border:primary?'none':'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.875rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s', fontFamily:'inherit' }}>
    {label}
  </button>
));
NavBtn.displayName = 'NavBtn';

const PageBtn = React.memo(({ n, current, onPage }) => {
  const active = n === current;
  return (
    <button onClick={() => onPage(n)} style={{ width:30, height:30, border:`1px solid ${active?'#0f172a':'#e2e8f0'}`, borderRadius:7, background:active?'#0f172a':'#fff', color:active?'#fff':'#0f172a', fontWeight:active?700:400, fontSize:'0.8rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {n}
    </button>
  );
});
PageBtn.displayName = 'PageBtn';

const PaginationBar = React.memo(({ total, page, limit, onPage, onLimit }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;
  const start = (page-1)*limit+1;
  const end   = Math.min(page*limit, total);
  const pages = useMemo(() => { const p=[]; for(let i=Math.max(1,page-2);i<=Math.min(totalPages,page+2);i++) p.push(i); return p; }, [page,totalPages]);
  return (
    <div style={{ padding:'0.75rem 1.5rem', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
      <span style={{ fontSize:'0.8rem', color:'#64748b' }}>Showing <strong>{start}–{end}</strong> of <strong>{total}</strong></span>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>Rows:</span>
        <select value={limit} onChange={e => { onLimit(Number(e.target.value)); onPage(1); }}
          style={{ fontSize:'0.78rem', border:'1px solid #e2e8f0', borderRadius:6, padding:'0.25rem 0.5rem', color:'#0f172a', background:'#fff', cursor:'pointer' }}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => onPage(page-1)} disabled={page===1} style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronLeft size={14}/></button>
        {pages[0]>1 && <><PageBtn n={1} current={page} onPage={onPage}/>{pages[0]>2&&<span style={{ color:'#94a3b8',fontSize:'0.8rem' }}>…</span>}</>}
        {pages.map(n => <PageBtn key={n} n={n} current={page} onPage={onPage}/>)}
        {pages[pages.length-1]<totalPages && <>{pages[pages.length-1]<totalPages-1&&<span style={{ color:'#94a3b8',fontSize:'0.8rem' }}>…</span>}<PageBtn n={totalPages} current={page} onPage={onPage}/></>}
        <button onClick={() => onPage(page+1)} disabled={page===totalPages} style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronRight size={14}/></button>
      </div>
    </div>
  );
});
PaginationBar.displayName = 'PaginationBar';

const ConfirmModal = React.memo(({ open, title, message, confirmLabel, danger, onConfirm, onCancel, children, loading }) => {
  if (!open) return null;
  return (
    <div onClick={(e) => e.target===e.currentTarget&&!loading&&onCancel()} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ backgroundColor:'#fff', borderRadius:16, padding:'2rem', width:'90%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', animation:'hs-popIn 0.18s ease' }}>
        <h3 style={{ fontSize:'1.125rem', fontWeight:700, color:'#0f172a', marginBottom:'0.5rem' }}>{title}</h3>
        <p style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{message}</p>
        {children}
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding:'0.6rem 1.25rem', backgroundColor:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:'0.875rem', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding:'0.6rem 1.25rem', backgroundColor:danger?'#dc2626':'#10b981', color:'white', border:'none', borderRadius:8, fontWeight:600, cursor:loading?'not-allowed':'pointer', fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'0.4rem', opacity:loading?0.7:1, fontFamily:'inherit' }}>
            {loading?<><Loader size={13} style={{ animation:'hs-spin 1s linear infinite' }}/> Deleting…</>:confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
ConfirmModal.displayName = 'ConfirmModal';

const AwardModal = React.memo(({ open, quotation, onConfirm, onCancel, loading }) => {
  const [awarded,   setAwarded]   = useState(null);
  const [awardNote, setAwardNote] = useState('');
  useEffect(() => { if (!open) { setAwarded(null); setAwardNote(''); } }, [open]);
  if (!open) return null;
  const canSubmit = awarded !== null && !loading;
  return (
    <div onClick={(e) => e.target===e.currentTarget&&!loading&&onCancel()} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ backgroundColor:'white', borderRadius:'1.25rem', padding:'2rem', maxWidth:460, width:'90%', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', animation:'hs-popIn 0.18s ease' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem' }}>
          <div style={{ width:44, height:44, borderRadius:'50%', backgroundColor:'#d1fae5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Award size={22} color="#065f46"/></div>
          <div>
            <div style={{ fontWeight:800, fontSize:'1.05rem', color:'#0f172a' }}>Mark Quotation Outcome</div>
            <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>{quotation?.quotationNumber} · {quotation?.customerSnapshot?.name||quotation?.customer||quotation?.customerId?.name}</div>
          </div>
        </div>
        <p style={{ fontSize:'0.875rem', color:'#475569', marginBottom:'1.25rem', lineHeight:1.5 }}>Did the client accept this quotation and send a Purchase Order?</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { val:true,  Icon:ThumbsUp,   color:'#10b981', activeBg:'#d1fae5', activeBorder:'#10b981', label:'Awarded',     sub:'Client sent PO'    },
            { val:false, Icon:ThumbsDown, color:'#9ca3af', activeBg:'#f3f4f6', activeBorder:'#9ca3af', label:'Not Awarded', sub:'Client declined'   },
          ].map(({ val, Icon: I, color, activeBg, activeBorder, label, sub }) => (
            <button key={String(val)} type="button" onClick={() => setAwarded(val)}
              style={{ padding:'1rem', borderRadius:'0.875rem', border:`2px solid ${awarded===val?activeBorder:'#e5e7eb'}`, backgroundColor:awarded===val?activeBg:'white', cursor:'pointer', transition:'all 0.15s', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem', fontFamily:'inherit' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', backgroundColor:awarded===val?color:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <I size={18} color={awarded===val?'white':color}/>
              </div>
              <span style={{ fontWeight:700, fontSize:'0.85rem', color:'#374151' }}>{label}</span>
              <span style={{ fontSize:'0.72rem', color:'#94a3b8', textAlign:'center', lineHeight:1.3 }}>{sub}</span>
            </button>
          ))}
        </div>
        <div style={{ marginBottom:'1.5rem' }}>
          <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, color:'#374151', marginBottom:'0.4rem' }}>
            {awarded===true?'PO Reference / Note (optional)':'Reason / Note (optional)'}
          </label>
          <textarea value={awardNote} onChange={(e) => setAwardNote(e.target.value)} rows={3}
            placeholder={awarded===true?'e.g. PO#12345 received…':'e.g. Client chose a cheaper supplier…'}
            style={{ width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e2e8f0', borderRadius:'0.6rem', fontSize:'0.85rem', resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', color:'#1f2937' }}/>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding:'0.6rem 1.25rem', borderRadius:'0.5rem', border:'1.5px solid #e5e7eb', background:'white', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', color:'#374151', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onConfirm(awarded, awardNote)} disabled={!canSubmit}
            style={{ padding:'0.6rem 1.5rem', borderRadius:'0.5rem', border:'none', background:canSubmit?(awarded?'#10b981':'#6b7280'):'#e5e7eb', color:canSubmit?'white':'#9ca3af', cursor:canSubmit?'pointer':'not-allowed', fontWeight:700, fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'0.5rem', transition:'all 0.15s', fontFamily:'inherit' }}>
            {loading?<><Loader size={14} style={{ animation:'hs-spin 1s linear infinite' }}/> Saving…</>:awarded===null?'Select an outcome':awarded?'🏆 Mark as Awarded':'— Mark as Not Awarded'}
          </button>
        </div>
      </div>
    </div>
  );
});
AwardModal.displayName = 'AwardModal';

const SkeletonRow = React.memo(() => (
  <tr style={{ borderBottom:'1px solid #f8fafc' }}>
    {[80,130,80,80,100,60,100,120].map((w,j) => (
      <td key={j} style={{ padding:'0.85rem 1rem' }}>
        <div style={{ height:14, width:w, borderRadius:6, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'hs-shimmer 1.4s ease infinite' }}/>
      </td>
    ))}
  </tr>
));
SkeletonRow.displayName = 'SkeletonRow';

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function HomeScreen({ onNavigate, onViewQuotation }) {
  // ── Company-filtered quotations ────────────────────────────
  const { quotations: companyQuotations, loading: companyLoading, refresh: refreshCompanyQuotations } = useCompanyQuotations();

  // ── Granular store subscriptions ──────────────────────────
  const customers       = useAppStore((s) => s.customers);
  const items           = useAppStore((s) => s.items);
  const loading         = useAppStore((s) => s.loading);
  const loadError       = useAppStore((s) => s.loadError);
  const deleteQuotation = useAppStore((s) => s.deleteQuotation);
  const awardQuotation  = useAppStore((s) => s.awardQuotation);
  const fetchAllData    = useAppStore((s) => s.fetchAllData);
  const handleLogout    = useAppStore((s) => s.handleLogout);
  const clearError      = useAppStore((s) => s.clearError);
  const updateQueryDate = useAppStore((s) => s.updateQueryDate);

  // FIX: read raw quotations from store to derive hasFetched — survives navigation
  const storeQuotations = useAppStore((s) => s.quotations);

  // ── Company & Currency hook ────────────────────────────────
  const {
    company: currentCompany,
    selectedCurrency,
    exchangeRates,
    refreshCompanyData
  } = useCompanyCurrency();

  // ── Table state ────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState('all');
  const [page,        setPage]        = useState(1);
  const [limit,       setLimit]       = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');
  const [sort,        setSort]        = useState({ field: 'date', dir: 'desc' });

  // ── Action modals / state ──────────────────────────────────
  const [exportingId, setExportingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, quotation: null, busy: false });
  const [awardModal,  setAwardModal]  = useState({ open: false, quotation: null, busy: false });
  const [toasts,      setToasts]      = useState([]);
  const [queryDateModal, setQueryDateModal] = useState({ open: false });

  const searchRef   = useRef(null);
  const searchTimer = useRef(null);
  const toastIdRef  = useRef(0);

  // ── FIX: hasFetched derived from Zustand store state (not a local ref) ────
  // This survives navigation unmount/remount so we never show a blank skeleton
  // when returning to this page with data already in the store.
  const hasFetched = !loading || storeQuotations.length > 0;

  // ── Toast helpers ──────────────────────────────────────────
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── Safe quotation array ───────────────────────────────────
  const safeQ = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);

  // ── Derived stats — one pass ───────────────────────────────
  const { totalRevenue, statusCounts } = useMemo(() => {
    let rev = 0;
    const c = { pending:0, in_review:0, approved:0, awarded:0, returned:0 };
    for (const q of safeQ) {
      rev += (q.total || 0);
      if      (q.status === 'pending')                                  c.pending++;
      else if (q.status === 'ops_approved')                             c.in_review++;
      else if (q.status === 'approved')                                 c.approved++;
      else if (q.status === 'awarded')                                  c.awarded++;
      else if (q.status === 'ops_rejected'||q.status === 'rejected')   c.returned++;
    }
    return { totalRevenue: rev, statusCounts: c };
  }, [safeQ]);

  // ── Tab counts ─────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    all:       safeQ.length,
    pending:   statusCounts.pending,
    in_review: statusCounts.in_review,
    approved:  statusCounts.approved,
    awarded:   statusCounts.awarded,
    returned:  statusCounts.returned,
  }), [safeQ.length, statusCounts]);

  // ── Filter → search → sort → paginate ──
  const tabFiltered = useMemo(() => {
    const { statusFilter } = TAB_KEYS[activeTab];
    if (!statusFilter) return safeQ;
    if (Array.isArray(statusFilter)) return safeQ.filter(q => statusFilter.includes(q.status));
    return safeQ.filter(q => q.status === statusFilter);
  }, [safeQ, activeTab]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return tabFiltered;
    const t = search.toLowerCase();
    return tabFiltered.filter(q =>
      (q.quotationNumber||'').toLowerCase().includes(t) ||
      (q.customerSnapshot?.name||q.customer||q.customerId?.name||'').toLowerCase().includes(t)
    );
  }, [tabFiltered, search]);

  const sorted = useMemo(() => {
    const arr = [...searchFiltered];
    const { field, dir } = sort;
    arr.sort((a, b) => {
      let av = a[field], bv = b[field];
      if (field === 'total') {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else if (field === 'customer') {
        av = (a.customerSnapshot?.name || a.customer || a.customerId?.name || '').toLowerCase();
        bv = (b.customerSnapshot?.name || b.customer || b.customerId?.name || '').toLowerCase();
      } else {
        av = av ?? '';
        bv = bv ?? '';
      }
      return dir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
    return arr;
  }, [searchFiltered, sort]);

  const totalFiltered = sorted.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage      = Math.min(page, totalPages);
  const paginated     = useMemo(() => sorted.slice((safePage-1)*limit, safePage*limit), [sorted, safePage, limit]);

  // ── Action handlers ────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => { setSearchInput(''); setSearch(''); setPage(1); }, []);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key); setPage(1); setSearchInput(''); setSearch('');
    setSort({ field: 'date', dir: 'desc' });
  }, []);

  const handleSort = useCallback((field) => {
    setSort(prev => ({ field, dir: prev.field===field && prev.dir==='asc' ? 'desc' : 'asc' }));
    setPage(1);
  }, []);

  const handleUpdateQueryDate = useCallback(async (id, date) => {
    const result = await updateQueryDate(id, date);
    if (result?.success) {
      addToast('Follow-up date updated successfully', 'success');
      refreshCompanyQuotations(); // Refresh to show updated data
    } else {
      addToast(result?.error || 'Failed to update follow-up date', 'error');
    }
  }, [updateQueryDate, addToast, refreshCompanyQuotations]);

  const handleRefresh = useCallback(async () => {
    try {
      await fetchAllData();
      refreshCompanyData?.();
      addToast('Data refreshed', 'success');
    } catch (err) {
      addToast(err.message || 'Refresh failed', 'error');
    }
  }, [fetchAllData, refreshCompanyData, addToast]);

  const handleDownload = useCallback(async (q) => {
    setExportingId(q._id);
    try {
      await downloadQuotationPDF(q);
      addToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error("PDF export error:", err);
      addToast(`PDF failed: ${err.message}`, 'error');
    } finally {
      setExportingId(null);
    }
  }, [addToast]);

  const confirmDelete = useCallback(async () => {
    const { quotation } = deleteModal;
    if (!quotation) return;
    setDeleteModal(m => ({ ...m, busy: true }));
    const result = await deleteQuotation(quotation._id);
    if (result?.success) {
      addToast(`Quotation ${quotation.quotationNumber} deleted.`, 'success');
      setDeleteModal({ open:false, quotation:null, busy:false });
      setPage(p => Math.max(1, Math.min(p, Math.ceil((totalFiltered-1)/limit))));
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Delete failed', 'error');
      setDeleteModal(m => ({ ...m, busy:false }));
    }
  }, [deleteModal, deleteQuotation, addToast, totalFiltered, limit, refreshCompanyQuotations]);

  const confirmAward = useCallback(async (awarded, awardNote) => {
    const { quotation } = awardModal;
    if (!quotation || awarded === null) return;
    setAwardModal(m => ({ ...m, busy: true }));
    const result = await awardQuotation(quotation._id, awarded, awardNote);
    if (result?.success) {
      addToast(awarded ? `🏆 "${quotation.quotationNumber}" marked as Awarded!` : `"${quotation.quotationNumber}" marked as Not Awarded.`, 'success');
      setAwardModal({ open:false, quotation:null, busy:false });
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Failed to update', 'error');
      setAwardModal(m => ({ ...m, busy:false }));
    }
  }, [awardModal, awardQuotation, addToast, refreshCompanyQuotations]);

  useEffect(() => {
    const handler = (e) => { if (e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

 
  const isInitialLoading = loading && !hasFetched;
  const isRefreshing     = loading && hasFetched;

  const TABS = useMemo(() =>
    Object.entries(TAB_KEYS).map(([key, { label, Icon }]) => ({ key, label, Icon, count: tabCounts[key] ?? 0 })),
  [tabCounts]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f1f5f9', fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes hs-slideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes hs-popIn   { from{transform:scale(0.95);opacity:0}    to{transform:scale(1);opacity:1}      }
        @keyframes hs-spin    { to{transform:rotate(360deg)}                                                    }
        @keyframes hs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}               }
        .hs-row:hover td         { background:#f8fafc !important; }
        .hs-nav-btn:hover        { opacity:0.8 !important; }
        .hs-tab:hover            { background:rgba(255,255,255,0.6) !important; }
        .hs-action-btn:hover:not(:disabled) { opacity:0.8 !important; transform:translateY(-1px); }
      `}</style>

      <Toast toasts={toasts} onDismiss={dismissToast}/>

      {/* ── Modals ── */}
      <ConfirmModal
        open={deleteModal.open}
        title="Delete Quotation"
        message={`Are you sure you want to permanently delete ${deleteModal.quotation?.quotationNumber}? This action cannot be undone.`}
        confirmLabel="Delete" danger loading={deleteModal.busy}
        onConfirm={confirmDelete}
        onCancel={() => !deleteModal.busy && setDeleteModal({ open:false, quotation:null, busy:false })}
      >
        {deleteModal.quotation?.status === 'ops_rejected' && (
          <div style={{ backgroundColor:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'0.6rem 0.875rem', marginBottom:'0.75rem', fontSize:'0.8rem', color:'#991b1b', fontWeight:600 }}>
            ⚠ This quotation was returned by Ops. You'll need to create a fresh one.
          </div>
        )}
      </ConfirmModal>

      <AwardModal
        open={awardModal.open}
        quotation={awardModal.quotation}
        onConfirm={confirmAward}
        onCancel={() => !awardModal.busy && setAwardModal({ open:false, quotation:null, busy:false })}
        loading={awardModal.busy}
      />

      {/* ── Sticky Topbar ── */}
      <div style={{ backgroundColor:'#0f172a', padding:'0 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 8px rgba(0,0,0,0.25)' }}>
        <div>
          <div style={{ fontSize:'1.0625rem', fontWeight:800, color:'white', letterSpacing:'-0.01em' }}>📋 My Dashboard</div>
          <CompanyCurrencyDisplay />
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
          <CompanyCurrencySelector variant="compact" />
          <NavBtn onClick={() => onNavigate('customers')}    label="Customers" />
          <NavBtn onClick={() => onNavigate('items')}        label="Items" />
          <NavBtn onClick={() => onNavigate('addQuotation')} label="+ New Quotation" primary />
          <button onClick={handleLogout} className="hs-nav-btn" title="Logout"
            style={{ backgroundColor:'rgba(255,255,255,0.08)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.85rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem', fontFamily:'inherit' }}>
            <LogOut size={15}/> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'2rem' }}>

        {/* ── Load error banner ── */}
        {loadError && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', backgroundColor:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'0.875rem 1rem', marginBottom:'1.25rem', fontSize:'0.875rem', color:'#991b1b' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><AlertCircle size={16}/> {loadError}</div>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
              <button onClick={() => clearError()} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', padding:0 }}><X size={14}/></button>
              <button onClick={handleRefresh} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', display:'flex', alignItems:'center', gap:'0.3rem', fontWeight:600, fontSize:'0.8rem', fontFamily:'inherit' }}>
                <RefreshCw size={13}/> Retry
              </button>
            </div>
          </div>
        )}

        {/* ── Stat cards row 1 ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1rem' }}>
          <StatCard label="Total Revenue"   value={fmtCurrency(totalRevenue, selectedCurrency)} accent="#6366f1" iconBg="#eff1ff" iconColor="#6366f1" Icon={TrendingUp}  loading={isInitialLoading} sub={`All quotations combined in ${selectedCurrency}`}/>
          <StatCard label="Quotations"      value={safeQ.length}              accent="#8b5cf6" iconBg="#f5f3ff" iconColor="#8b5cf6" Icon={FileText}    loading={isInitialLoading} sub="Total submitted"/>
          <StatCard label="Customers"       value={customers.length}          accent="#059669" iconBg="#ecfdf5" iconColor="#059669" Icon={Users}       loading={false}/>
          <StatCard label="Catalogue Items" value={items.length}              accent="#d97706" iconBg="#fffbeb" iconColor="#d97706" Icon={Package}     loading={false}/>
        </div>

      

        {/* ── Stat cards row 2 ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
          <StatCard label="Pending"   value={statusCounts.pending}   accent="#f59e0b" iconBg="#fef3c7" iconColor="#d97706" Icon={Clock}       loading={isInitialLoading} sub="Awaiting ops review"/>
          <StatCard label="In Review" value={statusCounts.in_review} accent="#3b82f6" iconBg="#dbeafe" iconColor="#3b82f6" Icon={RefreshCw}   loading={isInitialLoading} sub="Forwarded to admin"/>
          <StatCard label="Approved"  value={statusCounts.approved}  accent="#10b981" iconBg="#d1fae5" iconColor="#10b981" Icon={CheckCircle} loading={isInitialLoading} sub="Final approval given"/>
          <StatCard label="Awarded"   value={statusCounts.awarded}   accent="#059669" iconBg="#d1fae5" iconColor="#059669" Icon={Award}       loading={isInitialLoading} sub="PO received"/>
          <StatCard label="Returned"  value={statusCounts.returned}  accent="#ec4899" iconBg="#fce7f3" iconColor="#ec4899" Icon={Ban}         loading={isInitialLoading} sub="Ops or admin rejected"/>
        </div>

        {/* ── Table card ── */}
        <div style={{ backgroundColor:'#fff', borderRadius:14, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'visible', position:'relative' }}>

          {/* Card header */}
          <div style={{ padding:'1.125rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
            <div style={{ display:'flex', gap:'0.2rem', padding:'0.35rem', backgroundColor:'#f1f5f9', borderRadius:10, flexWrap:'wrap' }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active      = activeTab === key;
                const isPending   = key === 'pending';
                const isReturned  = key === 'returned';
                const hasAlert    = (isPending || isReturned) && count > 0;
                const alertColor  = isPending ? '#f59e0b' : '#ec4899';
                return (
                  <button key={key} className="hs-tab" onClick={() => handleTabChange(key)}
                    style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.35rem', transition:'all 0.15s', backgroundColor:active?'#fff':'transparent', color:active?'#0f172a':'#64748b', boxShadow:active?'0 1px 3px rgba(0,0,0,0.1)':'none', fontFamily:'inherit' }}>
                    <I size={13}/>
                    {label}
                    <span style={{ backgroundColor:active?(hasAlert?alertColor:'#0f172a'):(hasAlert?alertColor:'#e2e8f0'), color:(active||hasAlert)?'#fff':'#64748b', borderRadius:999, padding:'1px 7px', fontSize:'0.68rem', fontWeight:700 }}>
                      {isInitialLoading ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <button onClick={handleRefresh} disabled={loading} title="Refresh data from server"
                style={{ width:34, height:34, border:'1px solid #e2e8f0', borderRadius:8, background:'#f8fafc', cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:loading?0.5:1 }}>
                <RefreshCw size={14} color="#64748b" style={loading?{animation:'hs-spin 1s linear infinite'}:{}}/>
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'0.4rem 0.75rem' }}>
                <Search size={14} color="#94a3b8"/>
                <input ref={searchRef}
                  style={{ border:'none', background:'transparent', outline:'none', fontSize:'0.875rem', color:'#0f172a', width:210, fontFamily:'inherit' }}
                  placeholder="Search… (press /)"
                  value={searchInput}
                  onChange={handleSearchChange}
                  disabled={isInitialLoading}
                />
                {searchInput && (
                  <button onClick={clearSearch} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0 }}><X size={13}/></button>
                )}
              </div>
            </div>
          </div>

          {/* Refresh overlay */}
          {isRefreshing && (
            <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(255,255,255,0.72)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:14, backdropFilter:'blur(1px)' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', background:'white', padding:'1.25rem 2rem', borderRadius:12, boxShadow:'0 4px 24px rgba(15,23,42,0.12)', border:'1px solid #e2e8f0' }}>
                <RefreshCw size={24} color="#6366f1" style={{ animation:'hs-spin 0.8s linear infinite' }}/>
                <span style={{ fontSize:'0.82rem', color:'#6366f1', fontWeight:700 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Skeleton — true first load only */}
          {isInitialLoading && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor:'#fafafa' }}>
                    {['Quote #','Customer','Date','Expiry','Status','Items','Total','Actions'].map(h => (
                      <th key={h} style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{[0,1,2,3,4,5,6].map(i => <SkeletonRow key={i}/>)}</tbody>
              </table>
            </div>
          )}

          {/* Data table — shown whenever we have fetched at least once */}
          {hasFetched && (
            <>
              {safeQ.length === 0 ? (
                <div style={{ textAlign:'center', padding:'4rem 2rem', color:'#94a3b8' }}>
                  <FileText size={48} color="#cbd5e1" style={{ marginBottom:'1rem' }}/>
                  <p style={{ fontWeight:600, fontSize:'1rem', color:'#475569', marginBottom:'0.5rem' }}>No quotations yet</p>
                  <p style={{ fontSize:'0.875rem', marginBottom:'1.5rem' }}>Create your first quotation to get started.</p>
                  <button onClick={() => onNavigate('addQuotation')}
                    style={{ background:'#0f172a', color:'white', border:'none', borderRadius:8, padding:'0.6rem 1.25rem', fontWeight:600, fontSize:'0.875rem', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'0.4rem', fontFamily:'inherit' }}>
                    <Plus size={15}/> New Quotation
                  </button>
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
  <tr>
    <SortHeader label="Quote #" field="quotationNumber" sort={sort} onSort={handleSort}/>
    <SortHeader label="Customer" field="customer" sort={sort} onSort={handleSort}/>
    <th style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'left', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap' }}>
      Project Name
    </th>
    <SortHeader label="Query Date" field="queryDate" sort={sort} onSort={handleSort} align="center"/>
    <SortHeader label="Submitted" field="date" sort={sort} onSort={handleSort}/>
    <SortHeader label="Expiry" field="expiryDate" sort={sort} onSort={handleSort}/>
    <SortHeader label="Total" field="total" sort={sort} onSort={handleSort} align="right"/>
    <SortHeader label="Created By" field="createdBy" sort={sort} onSort={handleSort}/>
    <th style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap' }}>
      Actions
    </th>
  </tr>
</thead>
<tbody>
  {paginated.length === 0 ? (
    <tr>
      <td colSpan={9} style={{ padding:'3rem', textAlign:'center', color:'#94a3b8', fontSize:'0.875rem' }}>
        No results for "<strong>{search}</strong>"
        <button onClick={clearSearch} style={{ marginLeft:'0.5rem', background:'none', border:'none', color:'#6366f1', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', fontFamily:'inherit' }}>
          Clear
        </button>
      </td>
    </tr>
  ) : paginated.map((q) => {
    const isExp = exportingId === q._id;
    const expired = isExpired(q.expiryDate);
    const expiring = !expired && isExpiringSoon(q.expiryDate);
    const canDelete = DELETABLE.has(q.status);
    const canAward = q.status === 'approved';
    
    // Check if query date is overdue
    const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
    
    return (
      <tr key={q._id} className="hs-row">
        {/* Quote # */}
        <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
            <span style={{ fontWeight:700, color:'#0f172a', fontFamily:'monospace', fontSize:'0.8rem' }}>
              {q.quotationNumber || '—'}
            </span>
            {expired && <span style={{ fontSize:'0.62rem', fontWeight:700, color:'#dc2626', background:'#fef2f2', padding:'1px 6px', borderRadius:999, border:'1px solid #fecaca' }}>Expired</span>}
            {expiring && <span style={{ fontSize:'0.62rem', fontWeight:700, color:'#d97706', background:'#fffbeb', padding:'1px 6px', borderRadius:999, border:'1px solid #fde68a' }}>Expiring Soon</span>}
          </div>
        </td>
        
        {/* Customer */}
        <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
          <div style={{ fontWeight:600, color:'#0f172a', fontSize:'0.875rem' }}>
            {q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}
          </div>
          {q.contact && <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:2 }}>{q.contact}</div>}
        </td>
        
        {/* Project Name */}
        <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
          <div style={{ fontSize:'0.875rem', color:'#0f172a' }}>
            {q.projectName || '—'}
          </div>
          {/* {q.trn && <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:2 }}>TRN: {q.trn}</div>} */}
        </td>
        
        {/* Query Date */}
        <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', textAlign:'center' }}>
          {q.queryDate ? (
            <span style={{ 
              background: queryDatePassed ? '#fee2e2' : '#fef3c7',
              color: queryDatePassed ? '#991b1b' : '#92400e',
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <Calendar size={12} />
              {fmtDate(q.queryDate)}
              {queryDatePassed && ' ⚠️'}
            </span>
          ) : '—'}
        </td>
        
        {/* Submitted Date */}
        <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>
          {fmtDate(q.date)}
        </td>
        
        {/* Expiry Date */}
        <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>
          <span style={{ color:expired?'#dc2626':expiring?'#d97706':'#64748b', fontWeight:expired||expiring?600:400 }}>
            {fmtDate(q.expiryDate)}
          </span>
        </td>
        
        {/* Total Amount */}
        <td style={{ padding:'0.85rem 1rem', fontSize:'0.875rem', fontWeight:700, color:'#0f172a', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', textAlign:'right', whiteSpace:'nowrap' }}>
          {fmtCurrency(q.total, selectedCurrency)}
        </td>
        
        {/* Created By */}
        <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
          {q.createdBy?.name || '—'}
        </td>
        
        {/* Actions */}
        <td style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
          <div style={{ display:'flex', gap:'0.3rem', justifyContent:'center', flexWrap:'wrap' }}>
            {/* View Button */}
            <ActionBtn 
              bg="#e0f2fe" 
              color="#0369a1" 
              onClick={() => onViewQuotation(q._id)} 
              icon={Eye} 
              label="View" 
              title="View quotation"
            />
            
            {/* Follow-up Button - show for all except awarded/not_awarded */}
            {!['awarded', 'not_awarded'].includes(q.status) && (
              <ActionBtn 
                bg={q.queryDate ? '#fef3c7' : '#f1f5f9'} 
                color={q.queryDate ? '#92400e' : '#64748b'} 
                onClick={() => setQueryDateModal({ open: true, quotation: q })} 
                icon={Calendar} 
                label="Follow-up" 
                title={q.queryDate ? `Follow-up: ${fmtDate(q.queryDate)}` : 'Set follow-up date'}
              />
            )}
            
            {/* PDF Button */}
            <ActionBtn
              bg={isExp?'#f1f5f9':'#f0fdf4'} 
              color={isExp?'#94a3b8':'#166534'}
              onClick={() => !isExp && handleDownload(q)} 
              disabled={isExp}
              icon={isExp?Loader:Download} 
              label={isExp?'…':'PDF'} 
              title="Download PDF"
            />
            
            {/* Outcome Button - only for approved quotations */}
            {canAward && (
              <ActionBtn 
                bg="#d1fae5" 
                color="#065f46" 
                onClick={() => setAwardModal({ open:true, quotation:q, busy:false })} 
                icon={Award} 
                label="Outcome" 
                title="Mark awarded / not awarded"
              />
            )}
            
            {/* Delete Button - only for deletable statuses */}
            {canDelete && (
              <ActionBtn 
                bg="#fff1f2" 
                color="#e11d48" 
                onClick={() => setDeleteModal({ open:true, quotation:q, busy:false })} 
                icon={Trash2} 
                label="Del" 
                title="Delete quotation"
              />
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

              <PaginationBar
                total={totalFiltered} page={safePage} limit={limit}
                onPage={setPage}
                onLimit={(l) => { setLimit(l); setPage(1); }}
              />
            </>
          )}
        </div>
      </div>
      <QueryDateUpdater
  open={queryDateModal.open}
  onClose={() => setQueryDateModal({ open: false })}
  onUpdate={handleUpdateQueryDate}
  quotations={safeQ}
  loading={loading}
/>

    </div>
  );
}