// QuotationHeaderControls.jsx
import React from 'react';
import { ArrowLeft, Edit2, Save, X } from "lucide-react";

export default function QuotationHeaderControls({
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onBack
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '32px',
      flexWrap: 'wrap',
      gap: '16px'
    }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
        {isEditing ? 'Edit Quotation' : 'View Quotation'}
      </h1>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {!isEditing ? (
          <>
            <button
              onClick={onEdit}
              style={{
                backgroundColor: '#f59e0b',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Edit2 size={18} /> Edit
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onSave}
              disabled={isSaving}
              style={{
                backgroundColor: isSaving ? '#9ca3af' : '#10b981',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              <Save size={18} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onCancel}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <X size={18} /> Cancel
            </button>
          </>
        )}

        <button
          onClick={onBack}
          style={{
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> Back
        </button>
      </div>
    </div>
  );
}