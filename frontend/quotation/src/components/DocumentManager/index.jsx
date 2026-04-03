import React, { useState } from 'react';
import { Download, FileText, Trash2, X } from "lucide-react";
import {
  FileType, getFileType, getFileIcon, getFileBadge,
  formatFileSize, validateFile, MAX_DOCUMENT_SIZE_MB
} from '../../utils/quotationUtils';
import PreviewModal from './PreviewModal';
import UploadArea from './UploadArea';
import DocumentList from './DocumentList';

export default function DocumentManager({
  documents = [],
  onUpload,
  onDelete,
  onDownload,
  onPreview,
  isEditing,
  loading = false
}) {
  const [previewDoc, setPreviewDoc] = useState(null);

  const handlePreview = (doc) => {
    const type = getFileType(doc);
    if (type === FileType.IMAGE || type === FileType.PDF) {
      setPreviewDoc(doc);
    } else {
      // For other files, trigger download
      onDownload?.(doc._id || doc.id);
    }
  };

  return (
    <div style={{
      marginBottom: '2rem',
      backgroundColor: '#f8fafc',
      borderRadius: '0.5rem',
      padding: '1.25rem',
      border: '1px solid #e2e8f0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <FileText size={20} color="#4b5563" />
        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1f2937', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Internal Documents
        </h3>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto', backgroundColor: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
          For internal team only
        </span>
      </div>

      {isEditing && (
        <UploadArea
          onUpload={onUpload}
          loading={loading}
          maxSize={MAX_DOCUMENT_SIZE_MB}
          validateFile={validateFile}
        />
      )}

      <DocumentList
        documents={documents}
        onPreview={handlePreview}
        onDownload={onDownload}
        onDelete={onDelete}
        isEditing={isEditing}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
        getFileBadge={getFileBadge}
        getFileType={getFileType}
      />

      {previewDoc && (
        <PreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onDownload={onDownload}
        />
      )}
    </div>
  );
}