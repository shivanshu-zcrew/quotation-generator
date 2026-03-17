import React, { useState } from 'react';
import { Download, Trash2, FileText } from "lucide-react";

export default function UploadArea({ onUpload, loading, maxSize, validateFile }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docDescriptions, setDocDescriptions] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = [];

    files.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        alert(validation.error);
      }
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleDescriptionChange = (fileName, description) => {
    setDocDescriptions(prev => ({ ...prev, [fileName]: description }));
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !onUpload) return;
    setUploading(true);
    try {
      const descriptions = selectedFiles.map(file => docDescriptions[file.name] || '');
      await onUpload(selectedFiles, descriptions);
      setSelectedFiles([]);
      setDocDescriptions({});
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="internal-doc-upload"
            accept="*/*"
          />
          <label
            htmlFor="internal-doc-upload"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              backgroundColor: uploading ? '#9ca3af' : '#4f46e5',
              color: 'white',
              borderRadius: '0.5rem',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              alignSelf: 'flex-start',
              border: 'none',
              opacity: uploading ? 0.7 : 1,
            }}
          >
            <Download size={16} />
            {uploading ? 'Uploading...' : 'Select Documents'}
          </label>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>
            Supports PDF, DOC, XLS, Images, TXT, ZIP (Max {maxSize}MB each)
          </p>
        </div>

        {selectedFiles.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
              Files ready to upload:
            </h4>
            {selectedFiles.map((file, index) => (
              <div key={index} style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.5rem',
                padding: '0.5rem',
                backgroundColor: 'white',
                borderRadius: '0.375rem',
                border: '1px solid #e5e7eb'
              }}>
                <FileText size={16} color="#6b7280" />
                <span style={{ fontSize: '0.8rem', color: '#4b5563', minWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {file.name}
                </span>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={docDescriptions[file.name] || ''}
                  onChange={(e) => handleDescriptionChange(file.name, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.3rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.375rem',
                    fontSize: '0.8rem',
                  }}
                />
                <button
                  onClick={() => removeSelectedFile(index)}
                  style={{
                    padding: '0.25rem',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: uploading ? 0.7 : 1
              }}
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}