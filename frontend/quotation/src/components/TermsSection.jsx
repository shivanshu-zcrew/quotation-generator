import React, { useState } from 'react';
import { Plus, Trash2, Upload, X, Image as ImageIcon } from 'lucide-react';
import TermsEditor, { TermsViewer } from './TermsCondition';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_TERMS_IMAGES = 10;
const MAX_IMAGE_SIZE_MB = 5;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = {
  container: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  editModeContainer: {
    border: '1px solid #e2e8f0',
    borderRadius: '0.5rem',
    overflow: 'hidden',
  },
  imagesSection: {
    marginTop: '1.5rem',
    borderTop: '1px solid #e2e8f0',
    padding: '1rem',
    backgroundColor: '#f8fafc',
  },
  imagesLabel: {
    fontWeight: 600,
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    color: '#1f2937',
  },
  uploadHint: {
    fontSize: '0.7rem',
    color: '#6b7280',
    marginBottom: '1rem',
  },
  imagesGrid: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    marginTop: '0.5rem',
  },
  imageCard: {
    position: 'relative',
  },
  imageThumb: {
    width: 100,
    height: 100,
    objectFit: 'cover',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    background: '#ef4444',
    color: 'white',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  imageName: {
    fontSize: '0.65rem',
    color: '#64748b',
    marginTop: '4px',
    textAlign: 'center',
    maxWidth: 100,
    wordBreak: 'break-all',
  },
  viewModeContainer: {
    display: 'flex',
    gap: '2.5rem',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: '1.25rem',
    borderRadius: '0.5rem',
    border: '1px solid #e5e7eb',
  },
  termsContent: {
    flex: '1 1 65%',
    minWidth: 0,
  },
  imagesContainer: {
    flex: '0 0 320px',
    maxWidth: '320px',
  },
  viewImageCard: {
    marginBottom: '1rem',
  },
  viewImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: '0.5rem',
    border: '1px solid #e2e8f0',
  },
  viewImageCaption: {
    marginTop: '0.5rem',
    fontSize: '0.7rem',
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyState: {
    padding: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '0.375rem',
    minHeight: '80px',
    color: '#9ca3af',
    textAlign: 'center',
  },
  fileInput: {
    marginBottom: '0.5rem',
  },
};

// ─────────────────────────────────────────────────────────────
// Helper: Validate image file
// ─────────────────────────────────────────────────────────────
const validateImageFile = (file) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: `"${file.name}" is not a supported image type` };
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB` };
  }
  return { valid: true, error: null };
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function TermsSection({
  // Terms editor props
  tcSections = [],
  onTcChange,
  
  // Multiple images props
  termsImages = [],
  onTermsImagesUpload,
  onRemoveTermsImage,
  
  // Mode
  isEditing = false,
}) {
  
  // Local state for file input (optional - can use parent handler)
  const [uploadError, setUploadError] = useState(null);
  
  // Handle image upload with validation
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    setUploadError(null);
    
    // Check max images limit
    const remainingSlots = MAX_TERMS_IMAGES - termsImages.length;
    if (remainingSlots <= 0) {
      setUploadError(`Maximum ${MAX_TERMS_IMAGES} images allowed`);
      return;
    }
    
    // Validate each file
    const validFiles = [];
    const errors = [];
    
    for (const file of files.slice(0, remainingSlots)) {
      const validation = validateImageFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(validation.error);
      }
    }
    
    if (errors.length > 0) {
      setUploadError(errors.join(', '));
    }
    
    if (validFiles.length > 0 && onTermsImagesUpload) {
      onTermsImagesUpload(validFiles);
    }
    
    // Clear input
    e.target.value = '';
    
    // Clear error after 3 seconds
    setTimeout(() => setUploadError(null), 3000);
  };
  
  // Handle remove image
  const handleRemoveImage = (imageId) => {
    if (onRemoveTermsImage) {
      onRemoveTermsImage(imageId);
    }
  };
  
  // Render empty state
  const renderEmptyState = () => (
    <div style={styles.emptyState}>
      <ImageIcon size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
      <p style={{ margin: 0, fontSize: '0.875rem' }}>No terms & conditions</p>
      {isEditing && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
          Add terms sections and images above
        </p>
      )}
    </div>
  );
  
  // Check if there's any content
  const hasContent = () => {
    const hasSections = tcSections && tcSections.some(s => 
      (s.heading?.trim()) || 
      (s.points?.some(p => p.text?.trim())) || 
      s.image
    );
    const hasImages = termsImages && termsImages.length > 0;
    return hasSections || hasImages;
  };
  
  return (
    <div style={styles.container}>
      <h3 style={styles.sectionTitle}>Terms & Conditions</h3>
      
      {isEditing ? (
        // EDIT MODE
        <div style={styles.editModeContainer}>
          <TermsEditor sections={tcSections} onChange={onTcChange} />
          
          {/* Images Section */}
          <div style={styles.imagesSection}>
            <label style={styles.imagesLabel}>
              Additional Images (Optional)
            </label>
            
            <input
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              onChange={handleImageUpload}
              style={styles.fileInput}
              disabled={termsImages.length >= MAX_TERMS_IMAGES}
            />
            
            <p style={styles.uploadHint}>
              Supported formats: JPG, PNG, GIF, WebP. Max {MAX_IMAGE_SIZE_MB}MB each. 
              Max {MAX_TERMS_IMAGES} images total. Upload multiple at once.
            </p>
            
            {uploadError && (
              <div style={{ 
                color: '#dc2626', 
                fontSize: '0.75rem', 
                marginBottom: '0.75rem',
                backgroundColor: '#fef2f2',
                padding: '0.5rem',
                borderRadius: '0.375rem'
              }}>
                ⚠️ {uploadError}
              </div>
            )}
            
            {termsImages.length >= MAX_TERMS_IMAGES && (
              <div style={{ 
                color: '#f59e0b', 
                fontSize: '0.75rem', 
                marginBottom: '0.75rem',
                backgroundColor: '#fffbeb',
                padding: '0.5rem',
                borderRadius: '0.375rem'
              }}>
                Maximum {MAX_TERMS_IMAGES} images reached. Remove some to add more.
              </div>
            )}
            
            {/* Display uploaded images */}
            {termsImages.length > 0 && (
              <div>
                <div style={{ 
                  fontWeight: 500, 
                  fontSize: '0.8rem', 
                  marginBottom: '0.75rem',
                  color: '#374151'
                }}>
                  Uploaded Images ({termsImages.length}):
                </div>
                <div style={styles.imagesGrid}>
                  {termsImages.map((img, idx) => (
                    <div key={img.id || idx} style={styles.imageCard}>
                      <img 
                        src={img.base64 || img.url} 
                        alt={`Terms ${idx + 1}`} 
                        style={styles.imageThumb}
                      />
                      <button
                        onClick={() => handleRemoveImage(img.id)}
                        style={styles.removeBtn}
                        title="Remove image"
                      >
                        ×
                      </button>
                      {img.fileName && (
                        <div style={styles.imageName}>
                          {img.fileName.length > 15 ? img.fileName.slice(0, 15) + '…' : img.fileName}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // VIEW MODE
        hasContent() ? (
          <div style={styles.viewModeContainer}>
            {/* Terms Content */}
            <div style={styles.termsContent}>
              <TermsViewer sections={tcSections} />
            </div>
            
            {/* Images Gallery */}
            {termsImages && termsImages.length > 0 && (
              <div style={styles.imagesContainer}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem' 
                }}>
                  {termsImages.map((img, idx) => (
                    <div key={img.id || idx} style={styles.viewImageCard}>
                      <a 
                        href={img.url || img.base64} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ display: 'block' }}
                      >
                        <img 
                          src={img.url || img.base64} 
                          alt={`Terms ${idx + 1}`} 
                          style={styles.viewImage}
                        />
                      </a>
                      {img.fileName && (
                        <p style={styles.viewImageCaption}>
                          {img.fileName.length > 35 ? img.fileName.slice(0, 35) + '…' : img.fileName}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          renderEmptyState()
        )
      )}
    </div>
  );
}