// DocumentManager.jsx  (simplified version – you can expand)
import React from 'react';
import { FileText } from "lucide-react";

export default function DocumentManager({ documents = [], isEditing }) {
  return (
    <div style={{
      marginTop: '32px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      padding: '24px',
      border: '1px solid #e2e8f0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <FileText size={24} color="#4b5563" />
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Internal Documents</h3>
      </div>

      {documents.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px' }}>
          No internal documents uploaded yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {documents.map(doc => (
            <div key={doc._id || doc.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <div>{doc.fileName}</div>
              <div>{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          ))}
        </div>
      )}

      {isEditing && (
        <button style={{
          marginTop: '16px',
          backgroundColor: '#4f46e5',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer'
        }}>
          Upload Documents
        </button>
      )}
    </div>
  );
}