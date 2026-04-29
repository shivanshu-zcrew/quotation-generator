// components/AwardModal.jsx
import React, { useState, useEffect } from 'react';
import { Award, ThumbsUp, ThumbsDown, Loader } from 'lucide-react';

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
        position: 'fixed', 
        inset: 0, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 1000 
      }}
    >
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '1.25rem', 
        padding: '2rem', 
        maxWidth: 460, 
        width: '90%', 
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', 
        animation: 'hs-popIn 0.18s ease' 
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          marginBottom: '1.25rem' 
        }}>
          <div style={{ 
            width: 44, 
            height: 44, 
            borderRadius: '50%', 
            backgroundColor: '#d1fae5', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flexShrink: 0 
          }}>
            <Award size={22} color="#065f46"/>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>
              Mark Quotation Outcome
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
              {quotation?.quotationNumber} · {quotation?.customerSnapshot?.name || quotation?.customer || quotation?.customerId?.name}
            </div>
          </div>
        </div>
        
        <p style={{ 
          fontSize: '0.875rem', 
          color: '#475569', 
          marginBottom: '1.25rem', 
          lineHeight: 1.5 
        }}>
          Did the client accept this quotation and send a Purchase Order?
        </p>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '0.75rem', 
          marginBottom: '1.25rem' 
        }}>
          {[
            { 
              val: true, 
              Icon: ThumbsUp, 
              color: '#10b981', 
              activeBg: '#d1fae5', 
              activeBorder: '#10b981', 
              label: 'Awarded', 
              sub: 'Client sent PO' 
            },
            { 
              val: false, 
              Icon: ThumbsDown, 
              color: '#9ca3af', 
              activeBg: '#f3f4f6', 
              activeBorder: '#9ca3af', 
              label: 'Not Awarded', 
              sub: 'Client declined' 
            },
          ].map(({ val, Icon: I, color, activeBg, activeBorder, label, sub }) => (
            <button 
              key={String(val)} 
              type="button" 
              onClick={() => setAwarded(val)} 
              style={{ 
                padding: '1rem', 
                borderRadius: '0.875rem', 
                border: `2px solid ${awarded === val ? activeBorder : '#e5e7eb'}`, 
                backgroundColor: awarded === val ? activeBg : 'white', 
                cursor: 'pointer', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: '0.5rem', 
                fontFamily: 'inherit' 
              }}
            >
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: '50%', 
                backgroundColor: awarded === val ? color : '#f9fafb', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <I size={18} color={awarded === val ? 'white' : color}/>
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}>
                {label}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>
                {sub}
              </span>
            </button>
          ))}
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '0.8rem', 
            fontWeight: 600, 
            color: '#374151', 
            marginBottom: '0.4rem' 
          }}>
            {awarded === true ? 'PO Reference / Note (optional)' : 'Reason / Note (optional)'}
          </label>
          <textarea 
            value={awardNote} 
            onChange={(e) => setAwardNote(e.target.value)} 
            rows={3} 
            placeholder={awarded === true ? 'e.g. PO#12345 received…' : 'e.g. Client chose a cheaper supplier…'} 
            style={{ 
              width: '100%', 
              padding: '0.65rem 0.875rem', 
              border: '1.5px solid #e2e8f0', 
              borderRadius: '0.6rem', 
              fontSize: '0.85rem', 
              resize: 'vertical', 
              outline: 'none', 
              boxSizing: 'border-box', 
              fontFamily: 'inherit', 
              color: '#1f2937' 
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button 
            onClick={onCancel} 
            disabled={loading} 
            style={{ 
              padding: '0.6rem 1.25rem', 
              borderRadius: '0.5rem', 
              border: '1.5px solid #e5e7eb', 
              background: 'white', 
              cursor: 'pointer', 
              fontWeight: 600, 
              fontSize: '0.875rem', 
              color: '#374151', 
              fontFamily: 'inherit' 
            }}
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(awarded, awardNote)} 
            disabled={!canSubmit} 
            style={{ 
              padding: '0.6rem 1.5rem', 
              borderRadius: '0.5rem', 
              border: 'none', 
              background: canSubmit ? (awarded ? '#10b981' : '#6b7280') : '#e5e7eb', 
              color: canSubmit ? 'white' : '#9ca3af', 
              cursor: canSubmit ? 'pointer' : 'not-allowed', 
              fontWeight: 700, 
              fontSize: '0.875rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              fontFamily: 'inherit' 
            }}
          >
            {loading ? (
              <>
                <Loader size={14} style={{ animation: 'hs-spin 1s linear infinite' }}/> 
                Saving…
              </>
            ) : awarded === null ? (
              'Select an outcome'
            ) : awarded ? (
              '🏆 Mark as Awarded'
            ) : (
              '— Mark as Not Awarded'
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default AwardModal;