import React from 'react';
import { Download, FileText, X } from "lucide-react";
import { formatFileSize, FileType, getFileType } from '../../utils/quotationUtils';

export default function PreviewModal({ doc, onClose, onDownload }) {
  if (!doc) return null;

  const fileType = getFileType(doc);
  const fileSrc = doc.fileUrl || doc.fileData;
  const isImage = fileType === FileType.IMAGE;
  const isPDF = fileType === FileType.PDF;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        maxWidth: '90%',
        maxHeight: '90%',
        width: isPDF ? '90%' : 'auto',
        height: isPDF ? '90%' : 'auto',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} color="#4b5563" />
            <span style={{ fontWeight: '500', color: '#1f2937' }}>{doc.fileName}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '1rem',
          overflow: 'auto',
          flex: 1,
          backgroundColor: isPDF ? '#f8fafc' : 'white',
          minHeight: '300px',
          maxHeight: 'calc(90vh - 80px)'
        }}>
          {isImage && (
            <img
              src={fileSrc}
              alt={doc.fileName}
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', margin: '0 auto' }}
              onError={(e) => {
                console.error('Image failed to load');
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<div style="padding:2rem;text-align:center;color:#ef4444;">Failed to load image</div>';
              }}
            />
          )}

          {isPDF && (
            <div style={{ width: '100%', height: '100%', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '0.5rem',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = fileSrc;
                    link.download = doc.fileName;
                    link.click();
                  }}
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: '#0369a1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <Download size={12} /> Download
                </button>
              </div>
              <iframe
                src={`${fileSrc}#toolbar=1&navpanes=1&view=FitH`}
                title={doc.fileName}
                style={{
                  width: '100%',
                  flex: 1,
                  border: 'none',
                  backgroundColor: '#f8fafc'
                }}
              />
            </div>
          )}

          {!isImage && !isPDF && (
            <div style={{
              padding: '3rem',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '0.5rem'
            }}>
              <FileText size={64} color="#94a3b8" style={{ marginBottom: '1rem' }} />
              <p style={{ margin: '0.5rem 0', color: '#1f2937', fontWeight: '500' }}>
                Preview not available for this file type
              </p>
              <p style={{ margin: '0.25rem 0 1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                File type: {doc.fileType || 'Unknown'}
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = fileSrc;
                    link.download = doc.fileName;
                    link.click();
                  }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Download size={16} /> Download File
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          fontSize: '0.8rem',
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Size: {formatFileSize(doc.fileSize)}</span>
          <span>Type: {doc.fileType || 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
}