import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Package, Plus, Trash2, Eye, Download, FileText,
  TrendingUp, AlertCircle, LogOut, Loader, Search, X,
  CheckCircle, RefreshCw, Clock, Award, Ban,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, Building2, DollarSign
} from 'lucide-react';
import { STATUS_CONFIG, PAGE_SIZE_OPTIONS } from '../utils/constants';

// ============================================================
// DESIGN TOKENS — refined minimal (neutral light)
// Kept in sync with HomeScreen's T object.
// ============================================================
const T = {
  canvas: "#f6f7f8",
  surface: "#ffffff",
  ink: "#1b1d1e",
  inkSoft: "#646a6e",
  inkFaint: "#9aa0a4",
  line: "#e8eaec",
  lineSoft: "#f0f1f3",
  accent: "#2563c4",
  accentSoft: "#e6f0fb",
  accentInk: "#1d63c4",
  // vivid status hues (cool chrome, readable states)
  red: "#c1352b",
  redSoft: "#fdeceb",
  redLine: "#f8d6d2",
  green: "#0f7a52",
  greenSoft: "#e3f5ee",
  greenLine: "#c3ebda",
  blueInk: "#1d63c4",
  blueSoft: "#e6f0fb",
  blueLine: "#c9defa",
  shadow: "0 1px 2px rgba(20,22,24,0.04), 0 8px 24px -12px rgba(20,22,24,0.10)",
  radius: 16,
};

const SHIMMER = `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`;

export const StatusBadge = React.memo(({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
});
StatusBadge.displayName = 'StatusBadge';

export const RejectionNote = React.memo(({ quotation }) => {
  const reason = quotation.status === 'ops_rejected' ? quotation.opsRejectionReason : quotation.status === 'rejected' ? quotation.rejectionReason : null;
  if (!reason) return null;
  return (
    <div title={reason} style={{ fontSize: '0.68rem', color: T.red, fontStyle: 'italic', marginTop: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      "{reason}"
    </div>
  );
});
RejectionNote.displayName = 'RejectionNote';

export const Toast = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {toasts.map(t => {
        const palette = t.type === 'error'
          ? { bg: T.redSoft, border: T.redLine, color: T.red }
          : t.type === 'success'
          ? { bg: T.greenSoft, border: T.greenLine, color: T.green }
          : { bg: T.blueSoft, border: '#d6e2ea', color: T.blueInk };
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: palette.bg, border: `1px solid ${palette.border}`, color: palette.color, padding: '0.75rem 1rem', borderRadius: 12, boxShadow: T.shadow, minWidth: 280, animation: 'hs-slideIn 0.2s ease' }}>
            {t.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>{t.message}</span>
            <button onClick={() => onDismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, opacity: 0.6 }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
});
Toast.displayName = 'Toast';

export const StatCard = React.memo(({ label, value, sub, accent, iconBg, iconColor, Icon, loading }) => {
  if (loading) {
    return (
      <div style={{ backgroundColor: T.surface, borderRadius: T.radius, padding: '1.25rem 1.5rem', boxShadow: T.shadow, border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: SHIMMER, backgroundSize: '200% 100%', animation: 'hs-shimmer 1.4s ease infinite', flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ width: '80px', height: '12px', borderRadius: 4, marginBottom: '8px', background: SHIMMER, backgroundSize: '200% 100%', animation: 'hs-shimmer 1.4s ease infinite' }} />
          <div style={{ width: '100px', height: '28px', borderRadius: 6, marginTop: '4px', background: SHIMMER, backgroundSize: '200% 100%', animation: 'hs-shimmer 1.4s ease infinite' }} />
          {sub && <div style={{ width: '60px', height: '10px', borderRadius: 4, marginTop: '8px', background: SHIMMER, backgroundSize: '200% 100%', animation: 'hs-shimmer 1.4s ease infinite' }} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.surface, borderRadius: T.radius, padding: '1.25rem 1.5rem', boxShadow: T.shadow, border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', overflow: 'hidden' }}>
      {/* thin accent rail on the left edge */}
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent || T.accent }} />
      <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={iconColor} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 600, color: T.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
        <p style={{ fontSize: '1.7rem', fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1, letterSpacing: '-0.01em' }}>{value}</p>
        {sub && <p style={{ fontSize: '0.72rem', color: T.inkFaint, margin: '4px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';

export const ActionBtn = React.memo(({ bg, color, onClick, disabled, title, icon: Icon, label }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{ backgroundColor: bg, color, border: 'none', borderRadius: 8, padding: '0.35rem 0.65rem', fontSize: '0.72rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
    <Icon size={12} /> {label}
  </button>
));
ActionBtn.displayName = 'ActionBtn';

export const SortHeader = React.memo(({ label, field, sort, onSort, align }) => {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} style={{ padding: '0.85rem 1rem', fontSize: '0.68rem', fontWeight: 600, color: active ? T.ink : T.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: align || 'left', borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', transition: 'color 0.15s ease' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3 }}>{active && sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
      </span>
    </th>
  );
});
SortHeader.displayName = 'SortHeader';

const PageBtn = React.memo(({ n, current, onPage }) => {
  const active = n === current;
  const handleClick = React.useCallback(() => onPage(n), [n, onPage]);
  return (
    <button onClick={handleClick} style={{ width: 32, height: 32, border: active ? '1px solid transparent' : `1px solid ${T.line}`, borderRadius: 8, background: active ? T.ink : T.surface, color: active ? '#fff' : T.inkSoft, fontWeight: active ? 600 : 500, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
      {n}
    </button>
  );
});
PageBtn.displayName = 'PageBtn';

export const PaginationBar = React.memo(({ total, page, limit, onPage, onLimit }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;

  const { start, end } = useMemo(() => ({
    start: (page - 1) * limit + 1,
    end: Math.min(page * limit, total)
  }), [page, limit, total]);

  const pages = useMemo(() => {
    const p = [];
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    for (let i = startPage; i <= endPage; i++) p.push(i);
    return p;
  }, [page, totalPages]);

  const handlePrevPage = React.useCallback(() => { if (page > 1) onPage(page - 1); }, [page, onPage]);
  const handleNextPage = React.useCallback(() => { if (page < totalPages) onPage(page + 1); }, [page, totalPages, onPage]);
  const handlePageClick = React.useCallback((newPage) => { if (newPage !== page) onPage(newPage); }, [page, onPage]);

  const showStartEllipsis = pages[0] > 1;
  const showEndEllipsis = pages[pages.length - 1] < totalPages;

  const arrowBtn = (disabled) => ({
    width: 32, height: 32, border: `1px solid ${T.line}`, borderRadius: 8, background: T.surface,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkSoft,
    transition: 'opacity 0.15s ease',
  });

  return (
    <div style={{ padding: '0.9rem 1.5rem', borderTop: `1px solid ${T.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: T.surface }}>
      <span style={{ fontSize: '0.8rem', color: T.inkSoft }}>
        Showing <strong style={{ color: T.ink, fontWeight: 600 }}>{start}–{end}</strong> of <strong style={{ color: T.ink, fontWeight: 600 }}>{total}</strong>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={handlePrevPage} disabled={page === 1} style={arrowBtn(page === 1)}><ChevronLeft size={14} /></button>

        {showStartEllipsis && (
          <>
            <PageBtn n={1} current={page} onPage={handlePageClick} />
            {pages[0] > 2 && <span style={{ color: T.inkFaint, fontSize: '0.8rem' }}>…</span>}
          </>
        )}

        {pages.map(n => (<PageBtn key={n} n={n} current={page} onPage={handlePageClick} />))}

        {showEndEllipsis && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span style={{ color: T.inkFaint, fontSize: '0.8rem' }}>…</span>}
            <PageBtn n={totalPages} current={page} onPage={handlePageClick} />
          </>
        )}

        <button onClick={handleNextPage} disabled={page === totalPages} style={arrowBtn(page === totalPages)}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
});
PaginationBar.displayName = 'PaginationBar';

export const SkeletonRow = React.memo(() => (
  <tr style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
    {[80, 130, 80, 80, 100, 60, 100, 120].map((w, j) => (
      <td key={j} style={{ padding: '1rem' }}>
        <div style={{ height: 14, width: w, borderRadius: 6, background: SHIMMER, backgroundSize: '200% 100%', animation: 'hs-shimmer 1.4s ease infinite' }} />
      </td>
    ))}
  </tr>
));
SkeletonRow.displayName = 'SkeletonRow';

export const ConfirmModal = React.memo(({ open, title, message, confirmLabel, danger, onConfirm, onCancel, children, loading }) => {
  if (!open) return null;
  return (
    <div onClick={(e) => e.target === e.currentTarget && !loading && onCancel()} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20,22,24,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
      <div style={{ backgroundColor: T.surface, borderRadius: T.radius, padding: '2rem', width: '90%', maxWidth: 460, boxShadow: '0 24px 64px rgba(20,22,24,0.22)', animation: 'hs-popIn 0.18s ease', border: `1px solid ${T.line}` }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: T.ink, marginBottom: '0.5rem' }}>{title}</h3>
        <p style={{ fontSize: '0.875rem', color: T.inkSoft, marginBottom: '1.25rem', lineHeight: 1.5 }}>{message}</p>
        {children}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding: '0.6rem 1.25rem', backgroundColor: T.canvas, color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: '0.6rem 1.25rem', backgroundColor: danger ? T.red : T.accent, color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
            {loading ? <><Loader size={13} style={{ animation: 'hs-spin 1s linear infinite' }} /> Deleting…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
ConfirmModal.displayName = 'ConfirmModal';

export const AwardModal = React.memo(({ open, quotation, onConfirm, onCancel, loading }) => {
  const [awarded, setAwarded] = useState(null);
  const [awardNote, setAwardNote] = useState('');

  useEffect(() => { if (!open) { setAwarded(null); setAwardNote(''); } }, [open]);
  if (!open) return null;

  const canSubmit = awarded !== null && !loading;

  return (
    <div onClick={(e) => e.target === e.currentTarget && !loading && onCancel()} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20,22,24,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
      <div style={{ backgroundColor: 'white', borderRadius: T.radius, padding: '2rem', maxWidth: 460, width: '90%', boxShadow: '0 24px 64px rgba(20,22,24,0.22)', animation: 'hs-popIn 0.18s ease', border: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Award size={22} color={T.green} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: T.ink }}>Mark Quotation Outcome</div>
            <div style={{ fontSize: '0.78rem', color: T.inkFaint, marginTop: 2 }}>{quotation?.quotationNumber} · {quotation?.customerSnapshot?.name || quotation?.customer || quotation?.customerId?.name}</div>
          </div>
        </div>
        <p style={{ fontSize: '0.875rem', color: T.inkSoft, marginBottom: '1.25rem', lineHeight: 1.5 }}>Did the client accept this quotation and send a Purchase Order?</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { val: true, Icon: ThumbsUp, color: T.green, activeBg: T.greenSoft, activeBorder: T.green, label: 'Awarded', sub: 'Client sent PO' },
            { val: false, Icon: ThumbsDown, color: T.inkFaint, activeBg: T.canvas, activeBorder: T.inkFaint, label: 'Not Awarded', sub: 'Client declined' },
          ].map(({ val, Icon: I, color, activeBg, activeBorder, label, sub }) => (
            <button key={String(val)} type="button" onClick={() => setAwarded(val)} style={{ padding: '1rem', borderRadius: 12, border: `2px solid ${awarded === val ? activeBorder : T.line}`, backgroundColor: awarded === val ? activeBg : 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: awarded === val ? color : T.lineSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <I size={18} color={awarded === val ? 'white' : color} />
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: T.ink }}>{label}</span>
              <span style={{ fontSize: '0.72rem', color: T.inkFaint, textAlign: 'center', lineHeight: 1.3 }}>{sub}</span>
            </button>
          ))}
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: T.inkSoft, marginBottom: '0.4rem' }}>{awarded === true ? 'PO Reference / Note (optional)' : 'Reason / Note (optional)'}</label>
          <textarea value={awardNote} onChange={(e) => setAwardNote(e.target.value)} rows={3} placeholder={awarded === true ? 'e.g. PO#12345 received…' : 'e.g. Client chose a cheaper supplier…'} style={{ width: '100%', padding: '0.65rem 0.875rem', border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: '0.85rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: T.ink }} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding: '0.6rem 1.25rem', borderRadius: 8, border: `1.5px solid ${T.line}`, background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: T.inkSoft, fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => onConfirm(awarded, awardNote)} disabled={!canSubmit} style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none', background: canSubmit ? (awarded ? T.green : T.inkSoft) : T.line, color: canSubmit ? 'white' : T.inkFaint, cursor: canSubmit ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'inherit' }}>
            {loading ? <><Loader size={14} style={{ animation: 'hs-spin 1s linear infinite' }} /> Saving…</> : awarded === null ? 'Select an outcome' : awarded ? '🏆 Mark as Awarded' : '— Mark as Not Awarded'}
          </button>
        </div>
      </div>
    </div>
  );
});
AwardModal.displayName = 'AwardModal';