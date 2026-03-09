import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Users, Package, Plus, Trash2, Eye, Download, FileText,
  TrendingUp, ChevronRight, AlertCircle, LogOut, Loader,
  CheckCircle, X, RefreshCw,
} from 'lucide-react';
import headerImage from '../assets/header.png';
// ✅ quotationAPI import removed — PDF now uses window.print() via iframe

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 10;

// ─────────────────────────────────────────────────────────────
// numberToWords (AED) — IIFE, module-level, never re-created
// ─────────────────────────────────────────────────────────────
const numberToWords = (() => {
  const ones  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
  const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const thou  = ['','Thousand','Lakh','Crore'];
  const cvt   = (n) => {
    if (!n) return '';
    if (n < 10)  return ones[n];
    if (n < 20)  return teens[n - 10];
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
    const d = Math.floor(num);
    const f = Math.round((num - d) * 100);
    let r = main(d);
    if (f > 0) r = r.replace('Dirhams Only', `Dirhams and ${cvt(f)} Fils Only`);
    return r;
  };
})();

// ─────────────────────────────────────────────────────────────
// imageToBase64
// FIX: timer is now stored and cleared in BOTH onload and onerror
// so it never fires after the promise has already resolved.
// ─────────────────────────────────────────────────────────────
const imageToBase64 = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src.startsWith('data:')) return resolve(src);
    const img   = new Image();
    img.crossOrigin = 'Anonymous';
    // ✅ Capture timer so both branches can clear it
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload  = () => {
      clearTimeout(timer); // ✅ prevent late-fire after resolve
      try {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => {
      clearTimeout(timer); // ✅ prevent late-fire after resolve
      resolve(null);
    };
    img.src = src;
  });

// ─────────────────────────────────────────────────────────────
// safeDate — guards against undefined / invalid dates
// FIX: new Date(undefined) = "Invalid Date" → crash in PDF
// ─────────────────────────────────────────────────────────────
const safeDate = (d) => {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return 'N/A';
    return dt.toLocaleDateString('en-IN');
  } catch { return 'N/A'; }
};

// ─────────────────────────────────────────────────────────────
// buildPdfHTML
// FIX 1: All flex/grid layouts replaced with <table> so the
//         HTML renders correctly inside window.print() iframes
//         and in any headless/PDF engine.
// FIX 2: termsImage pre-converted to base64 (was direct URL).
// FIX 3: Receives AbortSignal so long image conversions can be
//         cancelled when the user navigates away.
// ─────────────────────────────────────────────────────────────
const buildPdfHTML = async (q, headerBase64, signal) => {
  // Helper to throw early if component unmounted mid-build
  const check = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  const subtotal   = (q.items || []).reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmt     = (subtotal * (q.tax      || 0)) / 100;
  const discAmt    = (subtotal * (q.discount || 0)) / 100;
  const grandTotal = subtotal + taxAmt - discAmt;
  const amtWords   = numberToWords(grandTotal);

  const firstPage = (q.items || []).slice(0, 8);
  const remaining = (q.items || []).slice(8);

  // ✅ Pre-convert ALL item images to base64 (Cloudinary URLs → data URIs)
  const itemImages = {};
  for (const item of [...firstPage, ...remaining]) {
    check();
    const key  = item._id || item.itemId;
    const b64s = await Promise.all((item.imagePaths || []).map(imageToBase64));
    itemImages[key] = b64s.filter(Boolean);
  }
  check();

  // ✅ Terms image also pre-converted — was direct URL before (CORS risk in print)
  const termsImgB64 = q.termsImage ? await imageToBase64(q.termsImage) : null;
  check();

  // ── Row renderer ─────────────────────────────────────────
  const renderRow = (item, index) => {
    const name = item.itemId?.name || item.name || '—';
    const desc = item.description  || item.itemId?.description || '';
    const key  = item._id || item.itemId;
    const imgs = itemImages[key] || [];
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index + 1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        <div style="font-weight:600;font-size:11px;">${name}</div>
        ${desc ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${desc}</div>` : ''}
        ${imgs.length
          /* ✅ FIX 3: <table> instead of display:grid — print-safe */
          ? `<table style="margin-top:6px;border-collapse:collapse;"><tr>${
              imgs.map(src =>
                `<td style="padding:2px;">
                   <img src="${src}" style="width:110px;height:110px;object-fit:cover;border:1px solid #d1d5db;border-radius:4px;display:block;"/>
                 </td>`
              ).join('')
            }</tr></table>`
          : ''}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };

  // ── Totals rows ──────────────────────────────────────────
  const totalsRows = `
    <tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Subtotal (AED)</td>
      <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td>
    </tr>
    <tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${q.tax || 0}%)</td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td>
    </tr>
    ${discAmt > 0 ? `
    <tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${q.discount || 0}%)</td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">−${discAmt.toFixed(2)}</td>
    </tr>` : ''}
    <tr style="background:#000;color:white;font-weight:700;">
      <td colspan="3" style="border:none;padding:8px;"></td>
      <td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td>
      <td style="text-align:right;padding:12px 8px;font-size:12px;">${grandTotal.toFixed(2)}</td>
    </tr>`;

  // ── Table header ─────────────────────────────────────────
  const thead = `<thead><tr style="background:#000;">
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
    <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
  </tr></thead>`;

  // ── Terms section — ✅ <table> instead of display:flex ───
  const termsSection = (q.termsAndConditions || termsImgB64) ? `
    <div style="margin-bottom:20px;padding:12px;background:#f9fafb;border:1px solid #e2e8f0;border-radius:6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;color:#1f2937;">Terms &amp; Conditions</div>
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="vertical-align:top;font-size:10px;color:#374151;line-height:1.5;padding-right:${termsImgB64 ? '16px' : '0'};">
          ${q.termsAndConditions || ''}
        </td>
        ${termsImgB64
          ? `<td style="vertical-align:top;width:220px;">
               <img src="${termsImgB64}" style="width:100%;height:auto;border-radius:4px;border:1px solid #d1d5db;display:block;"/>
             </td>`
          : ''}
      </tr></table>
    </div>` : '';

  // ── Full HTML ────────────────────────────────────────────
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      *   { margin:0; padding:0; box-sizing:border-box; }
      body{ font-family:'Segoe UI',Tahoma,sans-serif; background:white; color:#1f2937; line-height:1.6; }
      .container { width:874px; margin:0 auto; padding:10px; }
      @page { size:A4; margin:5mm; }
      thead { display:table-row-group; }
      @media print {
        body { margin:0; padding:0; }
        .page-break { page-break-before:always; }
        thead { display:table-row-group; }
      }
    </style>
  </head><body><div class="container">

    <!-- ✅ Header: text-align:center — no flex -->
    <div style="width:100%;height:140px;margin-bottom:24px;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;text-align:center;">
      ${headerBase64
        ? `<img src="${headerBase64}" style="max-width:100%;max-height:140px;object-fit:contain;padding:10px;"/>`
        : `<div style="line-height:140px;font-size:22px;font-weight:bold;">YOUR COMPANY LOGO</div>`}
    </div>

    <!-- Title + valid-until row -->
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #000;margin-bottom:16px;">
      <tr>
        <td style="text-align:center;padding-bottom:12px;">
          <div style="font-size:26px;font-weight:bold;letter-spacing:1px;">QUOTATION</div>
          <div style="color:#6b7280;font-size:11px;margin-top:4px;">${q.quotationNumber || ''}</div>
        </td>
        <td style="text-align:right;width:180px;padding-bottom:12px;">
          <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
          <div style="font-size:15px;font-weight:700;">${safeDate(q.expiryDate)}</div>
        </td>
      </tr>
    </table>

    <!-- ✅ Info block: <table> instead of display:grid -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
      <tr>
        <td style="padding:14px;width:50%;vertical-align:top;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Customer</td>   <td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.customer || q.customerId?.name || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Contact</td>     <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.contact || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Date</td>        <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${safeDate(q.date)}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Expiry Date</td> <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${safeDate(q.expiryDate)}</td></tr>
          </table>
        </td>
        <td style="padding:14px;width:50%;vertical-align:top;border-left:1px solid #e2e8f0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;width:110px;">Our Ref</td>       <td style="font-size:11px;padding:3px 0;width:12px;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourRef || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Our Contact</td>  <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.ourContact || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Sales Office</td> <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.salesOffice || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Payment</td>      <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.paymentTerms || 'N/A'}</td></tr>
            <tr><td style="font-weight:600;color:#4b5563;font-size:11px;padding:3px 0;">Delivery</td>     <td style="font-size:11px;padding:3px 0;">:</td><td style="font-size:11px;padding:3px 0;">${q.deliveryTerms || 'N/A'}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Items: first page -->
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Items Detail</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${thead}
      <tbody>
        ${firstPage.map((item, i) => renderRow(item, i)).join('')}
        ${remaining.length === 0 ? totalsRows : ''}
      </tbody>
    </table>

    <!-- Items: continuation page -->
    ${remaining.length > 0 ? `
    <div class="page-break">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${thead}
        <tbody>
          ${remaining.map((item, i) => renderRow(item, i + 8)).join('')}
          ${totalsRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Amount in words -->
    <div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
      <strong>Amount in words:</strong> ${amtWords}
    </div>

    <!-- Notes -->
    ${q.notes ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Notes &amp; Terms</div>
      <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${q.notes}</div>
    </div>` : ''}

    <!-- Terms & conditions -->
    ${termsSection}

    <!-- Sign-off -->
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;">
      <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
      <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
    </div>

  </div></body></html>`;
};

// ─────────────────────────────────────────────────────────────
// printViaIframe — same pattern used in AdminDashboard
// Opens a hidden iframe, writes the HTML, calls print(), removes
// ─────────────────────────────────────────────────────────────
const printViaIframe = (html) =>
  new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
      iframe.onload = async () => {
        try {
          await new Promise(r => setTimeout(r, 400)); // let images paint
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          await new Promise(r => setTimeout(r, 1000));
          document.body.removeChild(iframe);
          resolve();
        } catch (e) { reject(e); }
      };
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
    } catch (e) { reject(e); }
  });

// ─────────────────────────────────────────────────────────────
// Date helpers — guard against undefined / invalid dates
// FIX: original functions called new Date(undefined) blindly
// ─────────────────────────────────────────────────────────────
const isExpired = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  return !isNaN(dt.getTime()) && dt < new Date();
};

const isExpiringSoon = (d) => {
  if (!d) return false;
  const dt   = new Date(d);
  if (isNaN(dt.getTime())) return false;
  const days = Math.ceil((dt - new Date()) / 86400000);
  return days >= 0 && days <= 7;
};

const fmtDisplayDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

// ─────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending:  ['#fef9c3', '#ca8a04', '⏳ Pending'],
  approved: ['#dcfce7', '#16a34a', '✓ Approved'],
  accepted: ['#dcfce7', '#16a34a', '✓ Accepted'],
  rejected: ['#fee2e2', '#dc2626', '✗ Rejected'],
  draft:    ['#f1f5f9', '#64748b', 'Draft'],
  sent:     ['#e0f2fe', '#0369a1', 'Sent'],
};
const StatusBadge = ({ status }) => {
  const [bg, color, label] = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: bg, color }}>
      {label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '360px' }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
          padding: '0.8rem 1rem', borderRadius: '0.5rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          backgroundColor: t.type === 'success' ? '#f0fdf4' : t.type === 'error' ? '#fef2f2' : '#fffbeb',
          border: `1px solid ${t.type === 'success' ? '#bbf7d0' : t.type === 'error' ? '#fecaca' : '#fde68a'}`,
          animation: 'hsSlideIn .2s ease',
        }}>
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            {t.type === 'success' ? <CheckCircle size={17} color="#16a34a" /> :
             t.type === 'error'   ? <AlertCircle size={17} color="#dc2626" /> :
                                    <AlertCircle size={17} color="#d97706" />}
          </div>
          <div style={{ flex: 1 }}>
            {t.title && <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1f2937', marginBottom: 2 }}>{t.title}</div>}
            <div style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.4 }}>{t.message}</div>
          </div>
          <button onClick={() => onDismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 1, flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SkeletonRow
// ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      {[80, 120, 70, 60, 40, 80, 100].map((w, i) => (
        <td key={i} style={{ padding: '1rem' }}>
          <div style={{ height: 14, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', borderRadius: 6, animation: 'hsSkeleton 1.4s ease infinite', width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// DeleteModal — closes on backdrop click (when not deleting)
// ─────────────────────────────────────────────────────────────
function DeleteModal({ quotation, onConfirm, onCancel, isDeleting }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onCancel(); }}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ backgroundColor: 'white', borderRadius: '1rem', padding: '1.75rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', animation: 'popIn .18s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={22} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>Delete Quotation</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>This action cannot be undone.</div>
          </div>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Are you sure you want to delete quotation{' '}
          <strong>{quotation?.quotationNumber}</strong> for{' '}
          <strong>{quotation?.customer || quotation?.customerId?.name}</strong>?
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={isDeleting}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1.5px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#dc2626', color: 'white', cursor: isDeleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isDeleting ? 0.7 : 1 }}>
            {isDeleting ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function HomeScreen({
  customers,
  items,
  quotations,
  onNavigate,
  onDeleteQuotation,
  onViewQuotation,
  onLogout,
  isLoading = true,  // ✅ default true — show skeleton until parent confirms load state
  loadError = null,
  onRefresh,
}) {
  const [exportingId,  setExportingId]  = useState(null);
  const [deletingId,   setDeletingId]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [toasts,       setToasts]       = useState([]);

  const toastIdRef  = useRef(0);
  const abortRef    = useRef(null); // AbortController for in-flight PDF build
  // ✅ hasFetched: becomes true the moment isLoading flips false for the first time.
  //    Prevents the "no quotations" empty state flashing before the first fetch completes,
  //    regardless of what value the parent passes for isLoading on mount.
  const hasFetched  = useRef(false);
  if (!isLoading) hasFetched.current = true;

  // Cancel any running PDF build when component unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Toast helpers ──────────────────────────────────────────
  const addToast = useCallback((type, message, title = '', duration = 4500) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, type, message, title }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismissToast = useCallback((id) =>
    setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── Derived data ───────────────────────────────────────────
  // Guard: parent may pass the raw paginated response { data: [], pagination: {} }
  // instead of a plain array — normalise defensively
  const safeQuotations = Array.isArray(quotations)
    ? quotations
    : Array.isArray(quotations?.data)
      ? quotations.data
      : [];
  const totalRevenue   = safeQuotations.reduce((s, q) => s + (q.total || 0), 0);

  const filtered = [...safeQuotations]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter((q) => {
      const t = search.toLowerCase();
      return (q.quotationNumber || '').toLowerCase().includes(t) ||
             (q.customer || q.customerId?.name || '').toLowerCase().includes(t);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  // ✅ Clamp page — prevents empty page after delete on last page
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const handleSearch = (val) => { setSearch(val); setPage(1); };

  // ── PDF download — ✅ window.print() via iframe (no server round-trip)
  const handleDownload = useCallback(async (q) => {
    if (!q.items?.length) {
      addToast('warning', 'This quotation has no items — PDF would be empty.', 'No items');
      return;
    }

    // Cancel any previous in-flight build
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setExportingId(q._id);
    try {
      // ✅ headerImage converted here and passed in so buildPdfHTML doesn't redo it
      const headerBase64 = await imageToBase64(headerImage);
      if (controller.signal.aborted) return;

      const html = await buildPdfHTML(q, headerBase64, controller.signal);
      await printViaIframe(html);
      addToast('success', `PDF for ${q.quotationNumber} sent to print dialog.`, 'PDF Ready');
    } catch (err) {
      if (err.name === 'AbortError') return; // unmounted or superseded
      console.error('PDF export error:', err);
      addToast('error', err.message || 'Unknown error', 'Export error', 7000);
    } finally {
      setExportingId(null);
    }
  }, [addToast]);

  // ── Delete ─────────────────────────────────────────────────
  // ✅ Wrapped in Promise.resolve so it works whether parent
  //    returns void, a value, or a real Promise
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget._id);
    try {
      await Promise.resolve(onDeleteQuotation?.(deleteTarget._id));
      addToast('success', `Quotation ${deleteTarget.quotationNumber} deleted.`, 'Deleted');
      setDeleteTarget(null);
      // Step back if this deletion emptied the current page
      setPage(p => Math.max(1, Math.min(p, Math.ceil((filtered.length - 1) / ITEMS_PER_PAGE))));
    } catch (err) {
      console.error('Delete error:', err);
      addToast('error', err?.response?.data?.message || err.message || 'Please try again.', 'Delete failed', 7000);
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, onDeleteQuotation, addToast, filtered.length]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing:border-box; }
        .hs-stat { background:white; border-radius:18px; padding:1.5rem; box-shadow:0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.05); transition:transform .2s,box-shadow .2s; cursor:default; position:relative; overflow:hidden; }
        .hs-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:18px 18px 0 0; }
        .hs-stat:hover { transform:translateY(-3px); box-shadow:0 4px 6px rgba(0,0,0,.07),0 12px 28px rgba(0,0,0,.1); }
        .hs-stat.blue::before    { background:linear-gradient(90deg,#6366f1,#818cf8); }
        .hs-stat.violet::before  { background:linear-gradient(90deg,#8b5cf6,#a78bfa); }
        .hs-stat.emerald::before { background:linear-gradient(90deg,#059669,#34d399); }
        .hs-stat.amber::before   { background:linear-gradient(90deg,#d97706,#fbbf24); }
        .hs-action { background:white; border:1.5px solid #e8ecff; border-radius:18px; padding:1.4rem 1.25rem; cursor:pointer; transition:all .22s cubic-bezier(.4,0,.2,1); display:flex; align-items:center; gap:1rem; width:100%; font-family:inherit; box-shadow:0 1px 3px rgba(0,0,0,.05); }
        .hs-action:hover { transform:translateY(-3px); border-color:transparent; box-shadow:0 8px 32px rgba(99,102,241,.15),0 2px 8px rgba(0,0,0,.06); }
        .hs-action:hover .hs-arrow { transform:translateX(4px); opacity:1 !important; }
        .hs-arrow { transition:transform .2s,opacity .2s; }
        .hs-table-row { border-bottom:1px solid #f1f5f9; transition:background .12s; }
        .hs-table-row:hover { background:#f8faff !important; }
        .hs-table-row:last-child { border-bottom:none; }
        .hbtn { display:inline-flex; align-items:center; gap:.35rem; padding:.38rem .8rem; border-radius:8px; border:none; cursor:pointer; font-size:.78rem; font-weight:600; font-family:inherit; transition:all .15s; white-space:nowrap; }
        .hbtn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(.93); }
        .hbtn:disabled { opacity:.4; cursor:not-allowed; }
        .hbtn-view { background:#eff1ff; color:#4f46e5; }
        .hbtn-dl   { background:#ecfdf5; color:#059669; }
        .hbtn-del  { background:#fff1f1; color:#dc2626; }
        .hs-search { background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; color:#1f2937; padding:.6rem 1rem; font-size:.875rem; font-family:inherit; outline:none; width:270px; transition:border-color .2s,box-shadow .2s; }
        .hs-search::placeholder { color:#9ca3af; }
        .hs-search:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
        .hs-new-btn { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; border:none; border-radius:12px; padding:.7rem 1.5rem; font-size:.9rem; font-weight:700; font-family:inherit; cursor:pointer; display:flex; align-items:center; gap:.5rem; box-shadow:0 4px 14px rgba(99,102,241,.4); transition:all .2s; }
        .hs-new-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(99,102,241,.5); }
        .pg-btn { background:white; border:1.5px solid #e2e8f0; border-radius:8px; padding:.35rem .75rem; font-size:.8rem; font-weight:600; font-family:inherit; cursor:pointer; color:#374151; transition:all .15s; }
        .pg-btn:hover:not(:disabled) { border-color:#6366f1; color:#6366f1; }
        .pg-btn:disabled { opacity:.4; cursor:not-allowed; }
        .pg-btn.active { background:#6366f1; border-color:#6366f1; color:white; }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes hsSlideIn { from{opacity:0;transform:translateX(100%)} to{opacity:1;transform:translateX(0)} }
        @keyframes hsSkeleton{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes popIn     { from{transform:scale(0.95);opacity:0} to{transform:scale(1);opacity:1} }
        .fa1{animation:fadeUp .35s ease both} .fa2{animation:fadeUp .35s .07s ease both}
        .fa3{animation:fadeUp .35s .14s ease both} .fa4{animation:fadeUp .35s .21s ease both}
        .hs-scroll::-webkit-scrollbar { height:4px }
        .hs-scroll::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:4px }
      `}</style>

      <Toast toasts={toasts} onDismiss={dismissToast} />

      {deleteTarget && (
        <DeleteModal
          quotation={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => !deletingId && setDeleteTarget(null)}
          isDeleting={!!deletingId}
        />
      )}

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="fa1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ margin: '0 0 .35rem', color: '#94a3b8', fontSize: '.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Mega Repairing Machinery Equipment LLC
            </p>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-.03em' }}>Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {onRefresh && (
              <button onClick={onRefresh} disabled={isLoading} title="Refresh data"
                style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '.65rem .9rem', display: 'flex', alignItems: 'center', gap: '.4rem', cursor: isLoading ? 'not-allowed' : 'pointer', color: '#64748b', fontWeight: 600, fontSize: '.85rem', boxShadow: '0 1px 3px rgba(0,0,0,.05)', opacity: isLoading ? 0.6 : 1 }}>
                <RefreshCw size={16} style={{ animation: isLoading ? 'spin 1s linear infinite' : undefined }} />
                {isLoading ? 'Loading…' : 'Refresh'}
              </button>
            )}
            <button className="hs-new-btn" onClick={() => onNavigate('addQuotation')}>
              <Plus size={17} /> New Quotation
            </button>
            <button onClick={onLogout}
              style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '.7rem 1.2rem', display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '.9rem', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#dc2626'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white';   e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}>
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>

        {/* ── Load-error banner ────────────────────────────── */}
        {loadError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#991b1b' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Failed to load data</div>
              <div style={{ fontSize: '0.8rem', marginTop: 2 }}>{loadError}</div>
            </div>
            {onRefresh && (
              <button onClick={onRefresh} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, padding: '.45rem .9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <RefreshCw size={13} /> Retry
              </button>
            )}
          </div>
        )}

        {/* ── Stat cards ───────────────────────────────────── */}
        <div className="fa2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          {[
            { cls: 'blue',    label: 'Total Revenue',   value: isLoading ? '—' : `AED ${totalRevenue.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, Icon: TrendingUp, iconBg: '#eff1ff', iconColor: '#6366f1', valueSize: '1.1rem' },
            { cls: 'violet',  label: 'Quotations',      value: isLoading ? '—' : safeQuotations.length,       Icon: FileText, iconBg: '#f5f3ff', iconColor: '#8b5cf6', valueSize: '1.8rem' },
            { cls: 'emerald', label: 'Customers',       value: isLoading ? '—' : (customers || []).length,    Icon: Users,    iconBg: '#ecfdf5', iconColor: '#059669', valueSize: '1.8rem' },
            { cls: 'amber',   label: 'Catalogue Items', value: isLoading ? '—' : (items || []).length,        Icon: Package,  iconBg: '#fffbeb', iconColor: '#d97706', valueSize: '1.8rem' },
          ].map(({ cls, label, value, Icon, iconBg, iconColor, valueSize }) => (
            <div key={label} className={`hs-stat ${cls}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ background: iconBg, borderRadius: 10, padding: '.5rem', display: 'flex', color: iconColor }}><Icon size={20} /></div>
              </div>
              <p style={{ margin: '0 0 .25rem', color: '#94a3b8', fontSize: '.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
              {isLoading
                ? <div style={{ height: 26, width: 72, borderRadius: 6, marginTop: 4, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'hsSkeleton 1.4s ease infinite' }}/>
                : <p style={{ margin: 0, color: '#0f172a', fontSize: valueSize, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</p>
              }
            </div>
          ))}
        </div>

        {/* ── Quick actions ─────────────────────────────────── */}
        <div className="fa3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Manage Customers', sub: 'View, add & edit client records',  route: 'customers',    Icon: Users,   iconBg: '#ecfdf5', iconColor: '#059669' },
            { label: 'Manage Items',     sub: 'Update your product catalogue',     route: 'items',        Icon: Package, iconBg: '#fffbeb', iconColor: '#d97706' },
            { label: 'New Quotation',    sub: 'Generate a fresh client quote',     route: 'addQuotation', Icon: Plus,    iconBg: '#eff1ff', iconColor: '#6366f1' },
          ].map(({ label, sub, route, Icon, iconBg, iconColor }) => (
            <button key={route} className="hs-action" onClick={() => onNavigate(route)}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={21} style={{ color: iconColor }} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p style={{ margin: '0 0 .15rem', color: '#0f172a', fontWeight: 700, fontSize: '.9rem' }}>{label}</p>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '.8rem' }}>{sub}</p>
              </div>
              <ChevronRight size={16} className="hs-arrow" style={{ color: '#cbd5e1', opacity: 0.5 }} />
            </button>
          ))}
        </div>

        {/* ── Quotations table ──────────────────────────────── */}
        <div className="fa4" style={{ background: 'white', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,.06),0 4px 20px rgba(0,0,0,.05)', overflow: 'visible', position: 'relative' }}>

          {/* Toolbar */}
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1rem', fontWeight: 700 }}>Recent Quotations</h2>
              <p style={{ margin: '.15rem 0 0', color: '#94a3b8', fontSize: '.78rem' }}>
                {isLoading ? '' : `${filtered.length} of ${safeQuotations.length} ${safeQuotations.length === 1 ? 'entry' : 'entries'}`}
              </p>
            </div>
            <input
              className="hs-search"
              placeholder={isLoading ? 'Loading data…' : 'Search quote # or customer…'}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Loading overlay — shown when refreshing with stale data already present */}
          {isLoading && safeQuotations.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, backdropFilter: 'blur(1px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: 'white', padding: '1.25rem 2rem', borderRadius: 14, boxShadow: '0 4px 24px rgba(99,102,241,0.15)', border: '1px solid #e8ecff' }}>
                <Loader size={26} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }}/>
                <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: 700 }}>Refreshing data…</span>
              </div>
            </div>
          )}

          {/* Loading skeleton — first load: no data yet OR hasFetched not yet true */}
          {(!hasFetched.current || (isLoading && safeQuotations.length === 0)) ? (
            <div className="hs-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Quote #', 'Customer', 'Date', 'Status', 'Items', 'Total (AED)', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '.75rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1.5px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}</tbody>
              </table>
            </div>
          ) : hasFetched.current && !isLoading && safeQuotations.length === 0 ? (
            /* Empty state — only shown after load completes with zero results */
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <FileText size={28} style={{ color: '#cbd5e1' }} />
              </div>
              <p style={{ color: '#475569', margin: 0, fontWeight: 600 }}>No quotations yet</p>
              <p style={{ color: '#94a3b8', margin: '.4rem 0 1.5rem', fontSize: '.875rem' }}>Create your first quotation to get started.</p>
              <button className="hs-new-btn" style={{ margin: '0 auto' }} onClick={() => onNavigate('addQuotation')}>
                <Plus size={16} /> New Quotation
              </button>
            </div>
          ) : (
            <>
              <div className="hs-scroll" style={{ overflowX: 'auto', borderRadius: '0 0 18px 18px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {[['Quote #', 'left'], ['Customer', 'left'], ['Date', 'left'], ['Status', 'left'], ['Items', 'center'], ['Total (AED)', 'right'], ['Actions', 'center']].map(([h, align]) => (
                        <th key={h} style={{ padding: '.75rem 1rem', textAlign: align, color: '#64748b', fontSize: '.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', borderBottom: '1.5px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '.875rem' }}>
                          No results for "<strong>{search}</strong>"
                          <button onClick={() => handleSearch('')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontSize: '.875rem' }}>
                            Clear
                          </button>
                        </td>
                      </tr>
                    ) : paginated.map((q, idx) => {
                      const loadingPdf = exportingId === q._id;
                      const loadingDel = deletingId  === q._id;
                      const expired    = isExpired(q.expiryDate);
                      const expiring   = !expired && isExpiringSoon(q.expiryDate);
                      return (
                        <tr key={q._id} className="hs-table-row" style={{ background: idx % 2 === 0 ? 'white' : '#fafbff' }}>

                          {/* Quote # */}
                          <td style={{ padding: '.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '.85rem', fontFamily: 'monospace', background: '#eff1ff', padding: '.2rem .55rem', borderRadius: 6 }}>
                                {q.quotationNumber || '—'}
                              </span>
                              {expired  && <span style={{ fontSize: '.65rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 999, border: '1px solid #fecaca' }}>Expired</span>}
                              {expiring && <span style={{ fontSize: '.65rem', fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 999, border: '1px solid #fde68a' }}>Expiring</span>}
                            </div>
                          </td>

                          {/* Customer */}
                          <td style={{ padding: '.85rem 1rem', color: '#1e293b', fontSize: '.875rem', fontWeight: 500 }}>
                            {q.customer || q.customerId?.name || 'N/A'}
                          </td>

                          {/* Date — ✅ safeDate used (no crash on undefined) */}
                          <td style={{ padding: '.85rem 1rem', color: '#64748b', fontSize: '.825rem', whiteSpace: 'nowrap' }}>
                            {fmtDisplayDate(q.date)}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '.85rem 1rem' }}>
                            <StatusBadge status={q.status} />
                          </td>

                          {/* Items count */}
                          <td style={{ padding: '.85rem 1rem', textAlign: 'center' }}>
                            <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, padding: '.2rem .6rem', fontSize: '.8rem', fontWeight: 600 }}>
                              {q.items?.length ?? 0}
                            </span>
                          </td>

                          {/* Total */}
                          <td style={{ padding: '.85rem 1rem', textAlign: 'right', color: '#059669', fontWeight: 700, fontSize: '.9rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {q.total != null ? q.total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '.85rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'center' }}>
                              <button className="hbtn hbtn-view" onClick={() => onViewQuotation(q._id)}>
                                <Eye size={13} /> View
                              </button>
                              <button className="hbtn hbtn-dl" onClick={() => handleDownload(q)} disabled={!!exportingId}>
                                {loadingPdf
                                  ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</>
                                  : <><Download size={13} /> PDF</>}
                              </button>
                              {(q.status === 'pending' || !q.status) && (
                                <button className="hbtn hbtn-del" onClick={() => setDeleteTarget(q)} disabled={!!deletingId}>
                                  {loadingDel
                                    ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</>
                                    : <><Trash2 size={13} /> Del</>}
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

              {/* ── Pagination ──────────────────────────────── */}
              {totalPages > 1 && (
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <span style={{ fontSize: '.8rem', color: '#94a3b8', fontWeight: 500 }}>
                    Showing {((safePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {/* ✅ Prev/Next are disabled when at bounds — was missing before */}
                    <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '…'
                          ? <span key={`el-${i}`} style={{ padding: '0 .25rem', color: '#94a3b8' }}>…</span>
                          : <button key={p} className={`pg-btn${p === safePage ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                      )}
                    <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}