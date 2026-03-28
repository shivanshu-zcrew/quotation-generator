import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Package, Plus, Trash2, Eye, Download, FileText,
  TrendingUp, AlertCircle, LogOut, Loader, Search, X,
  CheckCircle, RefreshCw, Clock, Award, Ban,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, Building2, DollarSign 
} from 'lucide-react';
import { STATUS_CONFIG, PAGE_SIZE_OPTIONS } from '../utils/constants';

// ===== StatusBadge Component =====
export const StatusBadge = React.memo(({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ 
      display:'inline-flex', alignItems:'center', gap:5, 
      padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', 
      fontWeight:700, backgroundColor:cfg.bg, color:cfg.color, 
      whiteSpace:'nowrap' 
    }}>
      <span style={{ 
        width:6, height:6, borderRadius:'50%', 
        backgroundColor:cfg.dot, display:'inline-block', flexShrink:0 
      }}/>
      {cfg.label}
    </span>
  );
});
StatusBadge.displayName = 'StatusBadge';

// ===== RejectionNote Component =====
export const RejectionNote = React.memo(({ quotation }) => {
  const reason = quotation.status === 'ops_rejected' ? quotation.opsRejectionReason
               : quotation.status === 'rejected' ? quotation.rejectionReason : null;
  if (!reason) return null;
  
  return (
    <div title={reason} style={{ 
      fontSize:'0.68rem', 
      color: quotation.status === 'ops_rejected' ? '#991b1b' : '#9d174d', 
      fontStyle:'italic', marginTop:3, maxWidth:200, 
      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' 
    }}>
      "{reason}"
    </div>
  );
});
RejectionNote.displayName = 'RejectionNote';

// ===== Toast Component =====
export const Toast = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  
  return (
    <div style={{ 
      position:'fixed', bottom:'1.5rem', right:'1.5rem', 
      zIndex:9999, display:'flex', flexDirection:'column', gap:'0.5rem' 
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ 
          display:'flex', alignItems:'center', gap:'0.75rem',
          backgroundColor: t.type === 'error' ? '#fef2f2' : t.type === 'success' ? '#f0fdf4' : '#eff6ff',
          border: `1px solid ${t.type === 'error' ? '#fecaca' : t.type === 'success' ? '#bbf7d0' : '#bfdbfe'}`,
          color: t.type === 'error' ? '#991b1b' : t.type === 'success' ? '#166534' : '#1e40af',
          padding:'0.75rem 1rem', borderRadius:10, 
          boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:280,
          animation:'hs-slideIn 0.2s ease' 
        }}>
          {t.type === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
          <span style={{ fontSize:'0.875rem', fontWeight:500, flex:1 }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ 
            background:'none', border:'none', cursor:'pointer', 
            color:'inherit', padding:0, opacity:0.6 
          }}>
            <X size={14}/>
          </button>
        </div>
      ))}
    </div>
  );
});
Toast.displayName = 'Toast';

// ===== StatCard Component =====
export const StatCard = React.memo(({ label, value, sub, accent, iconBg, iconColor, Icon, loading }) => (
  <div style={{ 
    backgroundColor:'#fff', borderRadius:14, padding:'1.25rem 1.5rem',
    boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`4px solid ${accent}`,
    display:'flex', alignItems:'center', gap:'1rem' 
  }}>
    <div style={{ 
      width:46, height:46, borderRadius:12, backgroundColor:iconBg,
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 
    }}>
      <Icon size={22} color={iconColor}/>
    </div>
    <div style={{ minWidth:0 }}>
      <p style={{ 
        fontSize:'0.7rem', fontWeight:700, color:'#64748b',
        textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' 
      }}>{label}</p>
      {loading ? (
        <div style={{ 
          height:28, width:64, borderRadius:6, marginTop:4,
          background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
          backgroundSize:'200% 100%', animation:'hs-shimmer 1.4s ease infinite' 
        }}/>
      ) : (
        <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#0f172a', margin:0, lineHeight:1 }}>{value}</p>
      )}
      {sub && !loading && <p style={{ fontSize:'0.72rem', color:'#94a3b8', margin:'4px 0 0' }}>{sub}</p>}
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

// ===== ActionBtn Component =====
export const ActionBtn = React.memo(({ bg, color, onClick, disabled, title, icon: Icon, label }) => (
  <button 
    onClick={onClick} disabled={disabled} title={title} 
    className="hs-action-btn"
    style={{ 
      backgroundColor:bg, color, border:'none', borderRadius:7,
      padding:'0.35rem 0.65rem', fontSize:'0.72rem', fontWeight:600,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      display:'inline-flex', alignItems:'center', gap:'0.3rem',
      whiteSpace:'nowrap', transition:'opacity 0.15s,transform 0.15s',
      fontFamily:'inherit' 
    }}
  >
    <Icon size={12}/> {label}
  </button>
));
ActionBtn.displayName = 'ActionBtn';

// ===== SortHeader Component =====
export const SortHeader = React.memo(({ label, field, sort, onSort, align }) => {
  const active = sort.field === field;
  
  return (
    <th 
      onClick={() => onSort(field)} 
      style={{ 
        padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700,
        color: active ? '#0f172a' : '#64748b',
        textTransform:'uppercase', letterSpacing:'0.05em',
        textAlign: align || 'left',
        borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa',
        whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' 
      }}
    >
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3 }}>
          {active && sort.dir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </span>
      </span>
    </th>
  );
});
SortHeader.displayName = 'SortHeader';

// ===== PaginationBar Component =====
const PageBtn = React.memo(({ n, current, onPage }) => {
  const active = n === current;
  return (
    <button 
      onClick={() => onPage(n)} 
      style={{ 
        width:30, height:30, 
        border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
        borderRadius:7, background: active ? '#0f172a' : '#fff',
        color: active ? '#fff' : '#0f172a',
        fontWeight: active ? 700 : 400, fontSize:'0.8rem',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' 
      }}
    >
      {n}
    </button>
  );
});
PageBtn.displayName = 'PageBtn';

export const PaginationBar = React.memo(({ total, page, limit, onPage, onLimit }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;
  
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  
  const pages = useMemo(() => {
    const p = [];
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) p.push(i);
    return p;
  }, [page, totalPages]);
  
  return (
    <div style={{ 
      padding:'0.75rem 1.5rem', borderTop:'1px solid #f1f5f9',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      flexWrap:'wrap', gap:'0.75rem' 
    }}>
      <span style={{ fontSize:'0.8rem', color:'#64748b' }}>
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong>
      </span>
      
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>Rows:</span>
        <select 
          value={limit} 
          onChange={e => { onLimit(Number(e.target.value)); onPage(1); }}
          style={{ 
            fontSize:'0.78rem', border:'1px solid #e2e8f0', borderRadius:6,
            padding:'0.25rem 0.5rem', color:'#0f172a', background:'#fff', cursor:'pointer' 
          }}
        >
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        
        <button 
          onClick={() => onPage(page - 1)} disabled={page === 1}
          style={{ 
            width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7,
            background:'#fff', cursor: page === 1 ? 'not-allowed' : 'pointer',
            opacity: page === 1 ? 0.4 : 1,
            display:'flex', alignItems:'center', justifyContent:'center' 
          }}
        >
          <ChevronLeft size={14}/>
        </button>
        
        {pages[0] > 1 && (
          <>
            <PageBtn n={1} current={page} onPage={onPage}/>
            {pages[0] > 2 && <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}
          </>
        )}
        
        {pages.map(n => <PageBtn key={n} n={n} current={page} onPage={onPage}/>)}
        
        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && 
              <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}
            <PageBtn n={totalPages} current={page} onPage={onPage}/>
          </>
        )}
        
        <button 
          onClick={() => onPage(page + 1)} disabled={page === totalPages}
          style={{ 
            width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7,
            background:'#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer',
            opacity: page === totalPages ? 0.4 : 1,
            display:'flex', alignItems:'center', justifyContent:'center' 
          }}
        >
          <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
});
PaginationBar.displayName = 'PaginationBar';

// ===== SkeletonRow Component =====
export const SkeletonRow = React.memo(() => (
  <tr style={{ borderBottom:'1px solid #f8fafc' }}>
    {[80, 130, 80, 80, 100, 60, 100, 120].map((w, j) => (
      <td key={j} style={{ padding:'0.85rem 1rem' }}>
        <div style={{ 
          height:14, width:w, borderRadius:6,
          background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
          backgroundSize:'200% 100%', animation:'hs-shimmer 1.4s ease infinite' 
        }}/>
      </td>
    ))}
  </tr>
));
SkeletonRow.displayName = 'SkeletonRow';

// ===== ConfirmModal Component =====
export const ConfirmModal = React.memo(({ 
  open, title, message, confirmLabel, danger, 
  onConfirm, onCancel, children, loading 
}) => {
  if (!open) return null;
  
  return (
    <div 
      onClick={(e) => e.target === e.currentTarget && !loading && onCancel()}
      style={{ 
        position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 
      }}
    >
      <div style={{ 
        backgroundColor:'#fff', borderRadius:16, padding:'2rem',
        width:'90%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)',
        animation:'hs-popIn 0.18s ease' 
      }}>
        <h3 style={{ fontSize:'1.125rem', fontWeight:700, color:'#0f172a', marginBottom:'0.5rem' }}>
          {title}
        </h3>
        <p style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{message}</p>
        {children}
        
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button 
            onClick={onCancel} disabled={loading}
            style={{ 
              padding:'0.6rem 1.25rem', backgroundColor:'#f1f5f9', color:'#475569',
              border:'none', borderRadius:8, fontWeight:600, cursor:'pointer',
              fontSize:'0.875rem', fontFamily:'inherit' 
            }}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} disabled={loading}
            style={{ 
              padding:'0.6rem 1.25rem', backgroundColor: danger ? '#dc2626' : '#10b981',
              color:'white', border:'none', borderRadius:8, fontWeight:600,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize:'0.875rem',
              display:'flex', alignItems:'center', gap:'0.4rem', opacity: loading ? 0.7 : 1,
              fontFamily:'inherit' 
            }}
          >
            {loading ? (
              <><Loader size={13} style={{ animation:'hs-spin 1s linear infinite' }}/> Deleting…</>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
ConfirmModal.displayName = 'ConfirmModal';

// ===== AwardModal Component =====
export const AwardModal = React.memo(({ open, quotation, onConfirm, onCancel, loading }) => {
  const [awarded, setAwarded] = useState(null);
  const [awardNote, setAwardNote] = useState('');
  
  useEffect(() => {
    if (!open) {
      setAwarded(null);
      setAwardNote('');
    }
  }, [open]);
  
  if (!open) return null;
  
  const canSubmit = awarded !== null && !loading;
  
  return (
    <div 
      onClick={(e) => e.target === e.currentTarget && !loading && onCancel()}
      style={{ 
        position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 
      }}
    >
      <div style={{ 
        backgroundColor:'white', borderRadius:'1.25rem', padding:'2rem',
        maxWidth:460, width:'90%', boxShadow:'0 24px 64px rgba(0,0,0,0.22)',
        animation:'hs-popIn 0.18s ease' 
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem' }}>
          <div style={{ 
            width:44, height:44, borderRadius:'50%', backgroundColor:'#d1fae5',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 
          }}>
            <Award size={22} color="#065f46"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:'1.05rem', color:'#0f172a' }}>
              Mark Quotation Outcome
            </div>
            <div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:2 }}>
              {quotation?.quotationNumber} · {quotation?.customerSnapshot?.name || quotation?.customer || quotation?.customerId?.name}
            </div>
          </div>
        </div>
        
        <p style={{ fontSize:'0.875rem', color:'#475569', marginBottom:'1.25rem', lineHeight:1.5 }}>
          Did the client accept this quotation and send a Purchase Order?
        </p>
        
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { val:true,  Icon:ThumbsUp,   color:'#10b981', activeBg:'#d1fae5', activeBorder:'#10b981', label:'Awarded',     sub:'Client sent PO'    },
            { val:false, Icon:ThumbsDown, color:'#9ca3af', activeBg:'#f3f4f6', activeBorder:'#9ca3af', label:'Not Awarded', sub:'Client declined'   },
          ].map(({ val, Icon: I, color, activeBg, activeBorder, label, sub }) => (
            <button 
              key={String(val)} type="button" 
              onClick={() => setAwarded(val)}
              style={{ 
                padding:'1rem', borderRadius:'0.875rem',
                border: `2px solid ${awarded === val ? activeBorder : '#e5e7eb'}`,
                backgroundColor: awarded === val ? activeBg : 'white',
                cursor:'pointer', transition:'all 0.15s',
                display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem',
                fontFamily:'inherit' 
              }}
            >
              <div style={{ 
                width:36, height:36, borderRadius:'50%',
                backgroundColor: awarded === val ? color : '#f9fafb',
                display:'flex', alignItems:'center', justifyContent:'center' 
              }}>
                <I size={18} color={awarded === val ? 'white' : color}/>
              </div>
              <span style={{ fontWeight:700, fontSize:'0.85rem', color:'#374151' }}>{label}</span>
              <span style={{ fontSize:'0.72rem', color:'#94a3b8', textAlign:'center', lineHeight:1.3 }}>
                {sub}
              </span>
            </button>
          ))}
        </div>
        
        <div style={{ marginBottom:'1.5rem' }}>
          <label style={{ 
            display:'block', fontSize:'0.8rem', fontWeight:600, 
            color:'#374151', marginBottom:'0.4rem' 
          }}>
            {awarded === true ? 'PO Reference / Note (optional)' : 'Reason / Note (optional)'}
          </label>
          <textarea 
            value={awardNote} onChange={(e) => setAwardNote(e.target.value)} rows={3}
            placeholder={awarded === true ? 'e.g. PO#12345 received…' : 'e.g. Client chose a cheaper supplier…'}
            style={{ 
              width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e2e8f0',
              borderRadius:'0.6rem', fontSize:'0.85rem', resize:'vertical',
              outline:'none', boxSizing:'border-box', fontFamily:'inherit', color:'#1f2937' 
            }}
          />
        </div>
        
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
          <button 
            onClick={onCancel} disabled={loading}
            style={{ 
              padding:'0.6rem 1.25rem', borderRadius:'0.5rem', border:'1.5px solid #e5e7eb',
              background:'white', cursor:'pointer', fontWeight:600, fontSize:'0.875rem',
              color:'#374151', fontFamily:'inherit' 
            }}
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(awarded, awardNote)} disabled={!canSubmit}
            style={{ 
              padding:'0.6rem 1.5rem', borderRadius:'0.5rem', border:'none',
              background: canSubmit ? (awarded ? '#10b981' : '#6b7280') : '#e5e7eb',
              color: canSubmit ? 'white' : '#9ca3af',
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontWeight:700, fontSize:'0.875rem',
              display:'flex', alignItems:'center', gap:'0.5rem', transition:'all 0.15s',
              fontFamily:'inherit' 
            }}
          >
            {loading ? (
              <><Loader size={14} style={{ animation:'hs-spin 1s linear infinite' }}/> Saving…</>
            ) : awarded === null ? 'Select an outcome' : awarded ? '🏆 Mark as Awarded' : '— Mark as Not Awarded'}
          </button>
        </div>
      </div>
    </div>
  );
});
AwardModal.displayName = 'AwardModal';