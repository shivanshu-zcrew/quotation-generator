import React from 'react';
import { Download, FileText, Trash2 } from "lucide-react";
import { FileType } from '../../utils/quotationUtils';

export default function DocumentList({
  documents,
  onPreview,
  onDownload,
  onDelete,
  isEditing,
  formatFileSize,
  getFileIcon,
  getFileBadge,
  getFileType
}) {
  if (documents.length === 0) {
    return (
      <div style={{
        padding: '1rem',
        textAlign: 'center',
        color: '#9ca3b8',
        backgroundColor: 'white',
        borderRadius: '0.375rem',
        border: '1px dashed #e2e8f0'
      }}>
        <FileText size={24} color="#d1d5db" style={{ marginBottom: '0.5rem' }} />
        <p style={{ margin: 0, fontSize: '0.875rem' }}>No internal documents</p>
        {isEditing && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
            Upload documents for internal team reference
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {documents.map((doc) => {
        const fileType = getFileType(doc);
        const badge = getFileBadge(fileType);
        const docId = doc._id || doc.id;

        return (
          <div
            key={docId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.75rem',
              backgroundColor: 'white',
              borderRadius: '0.375rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{getFileIcon(doc)}</span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: '500', fontSize: '0.875rem', color: '#1f2937' }}>
                  {doc.fileName}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                  {formatFileSize(doc.fileSize)}
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  backgroundColor: badge.bg,
                  color: badge.color,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontWeight: '600'
                }}>
                  {badge.text}
                </span>
              </div>

              {doc.description && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem' }}>
                  {doc.description}
                </div>
              )}

              <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => onPreview(doc)}
                style={{
                  padding: '0.35rem',
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={fileType === FileType.IMAGE || fileType === FileType.PDF ? 'Preview' : 'Download'}
              >
                {fileType === FileType.IMAGE || fileType === FileType.PDF ? '👁️' : <Download size={14} />}
              </button>

              <button
                onClick={() => onDownload?.(docId)}
                style={{
                  padding: '0.35rem',
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Download"
              >
                <Download size={14} />
              </button>

              {isEditing && (
                <button
                  onClick={() => onDelete?.(docId)}
                  style={{
                    padding: '0.35rem',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}