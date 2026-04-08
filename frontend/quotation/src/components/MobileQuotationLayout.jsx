// components/mobile/MobileQuotationLayout.jsx
import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Upload, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import ValidatedInput from './ValidatedInput';
import TermsEditor, { TermsViewer } from './TermsCondition';
import Snackbar from './Snackbar';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { fmtDate } from '../utils/formatters';
import { inputStyle } from './QuotationLayout';

import headerImage from '../assets/header.png';
// ============================================================
// Mobile Field Component
// ============================================================
const MobileField = ({ label, field, type, value, isEditing, onChange, error }) => (
  <div style={styles.fieldCard}>
    <label style={styles.fieldLabel}>{label}</label>
    {isEditing ? (
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        style={{
          ...inputStyle,
          borderColor: error ? '#dc2626' : undefined,
          backgroundColor: error ? '#fef2f2' : undefined,
        }}
      />
    ) : (
      <div style={styles.fieldValue}>{type === 'date' ? fmtDate(value) : (value || 'N/A')}</div>
    )}
    {error && <div style={styles.fieldError}>{error}</div>}
  </div>
);

// ============================================================
// Mobile Item Card Component
// ============================================================
const MobileItemCard = ({ 
  item, index, isEditing, onUpdate, onRemove, onAddImages,
  newImages, onRemoveNewImage, onRemoveExistingImage,
  availableItems, fieldErrors, showLocalSnack 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);

  const handleValidatedUpdate = (field, value, validator) => {
    if (value === '') {
      if (field === 'quantity') showLocalSnack('Quantity cannot be empty');
      return;
    }
    if (validator) {
      const result = validator(value);
      if (!result.isValid) {
        showLocalSnack(result.error);
        return;
      }
    }
    onUpdate(item.id, field, value);
  };

  const total = (Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2);

  return (
    <div style={styles.itemCard}>
      <div style={styles.itemCardHeader} onClick={() => setExpanded(!expanded)}>
        <div style={styles.itemCardNumber}>#{index + 1}</div>
        <div style={styles.itemCardTitle}>
          <div style={styles.itemCardName}>{item.name || 'New Item'}</div>
          <div style={styles.itemCardTotal}>{total}</div>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      
      {expanded && (
        <div style={styles.itemCardBody}>
          {/* Item Selection */}
          {isEditing && (
            <div style={styles.itemField}>
              <label style={styles.itemLabel}>Select Item</label>
              <select
                value={item.itemId || ''}
                onChange={(e) => onUpdate(item.id, 'itemId', e.target.value)}
                style={inputStyle}
              >
                <option value="">— Select Item —</option>
                {availableItems.map((itm) => (
                  <option key={itm._id} value={itm._id}>{itm.name}</option>
                ))}
              </select>
            </div>
          )}
          
          {/* Description */}
          <div style={styles.itemField}>
            <label style={styles.itemLabel}>Description</label>
            {isEditing ? (
              <textarea
                value={item.description || ''}
                onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
                placeholder="Item description (optional)…"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            ) : (
              <div style={styles.itemDescription}>{item.description || '—'}</div>
            )}
          </div>
          
          {/* Quantity and Price Row */}
          <div style={styles.itemRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.itemLabel}>Qty</label>
              {isEditing ? (
                <ValidatedInput
                  type="number"
                  value={item.quantity}
                  onChange={(val) => handleValidatedUpdate('quantity', val, validateQuantity)}
                  placeholder="Qty"
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    borderColor: fieldErrors[item.id]?.quantity ? '#dc2626' : undefined,
                  }}
                  min="1"
                />
              ) : (
                <div style={styles.itemValue}>{item.quantity}</div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.itemLabel}>Unit Price</label>
              {isEditing ? (
                <ValidatedInput
                  type="number"
                  value={item.unitPrice}
                  onChange={(val) => handleValidatedUpdate('unitPrice', val, validatePrice)}
                  placeholder="0.00"
                  style={{
                    ...inputStyle,
                    textAlign: 'right',
                    borderColor: fieldErrors[item.id]?.unitPrice ? '#dc2626' : undefined,
                  }}
                  step="0.01"
                  min="0"
                />
              ) : (
                <div style={styles.itemValue}>{Number(item.unitPrice || 0).toFixed(2)}</div>
              )}
            </div>
          </div>
          
          {/* Amount */}
          <div style={styles.amountRow}>
            <label style={styles.itemLabel}>Amount</label>
            <div style={styles.amountValue}>{total}</div>
          </div>
          
          {/* Images */}
          {(item.imagePaths?.length > 0 || newImages[item.id]?.length > 0) && (
            <div style={styles.imageSection}>
              <label style={styles.itemLabel}>Images</label>
              <div style={styles.imageGrid}>
                {item.imagePaths?.map((path, idx) => (
                  <div key={idx} style={styles.imageContainer}>
                    <img src={path} alt="" style={styles.itemImage} />
                    {isEditing && onRemoveExistingImage && (
                      <button onClick={() => onRemoveExistingImage(item.id, idx)} style={styles.removeImgBtnStyle}>×</button>
                    )}
                  </div>
                ))}
                {newImages[item.id]?.map((src, idx) => (
                  <div key={idx} style={{ ...styles.imageContainer, borderColor: '#86efac' }}>
                    <img src={src} alt="" style={styles.itemImage} />
                    {isEditing && onRemoveNewImage && (
                      <button onClick={() => onRemoveNewImage(item.id, idx)} style={styles.removeImgBtnStyle}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Image Upload */}
          {isEditing && (
            <div>
              <button
                onClick={() => setShowImageUpload(!showImageUpload)}
                style={{
                  ...styles.addImageBtn,
                  backgroundColor: showImageUpload ? '#dc2626' : '#10b981'
                }}
              >
                <Upload size={13} /> {showImageUpload ? 'Cancel' : 'Add Images'}
              </button>
              {showImageUpload && (
                <div style={{ marginTop: '0.5rem' }}>
                  <input
                    type="file" accept="image/*" multiple
                    id={`mobile-img-${item.id}`}
                    style={{ display: 'none' }}
                    onChange={(e) => onAddImages(e, item.id)}
                  />
                  <label htmlFor={`mobile-img-${item.id}`} style={styles.imageUploadLabel}>
                    Click to choose images
                  </label>
                </div>
              )}
            </div>
          )}
          
          {/* Delete Button */}
          {isEditing && (
            <button onClick={() => onRemove(item.id)} style={styles.deleteItemBtn}>
              <Trash2 size={15} /> Remove Item
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Mobile Document Section Component
// ============================================================
const MobileDocumentSection = ({ documents, onUpload, onDelete, onDownload, isEditing, formatFileSize, getFileIcon }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    await onUpload(selectedFiles, []);
    setSelectedFiles([]);
    setUploading(false);
  };

  return (
    <div style={styles.docSection}>
      <div style={styles.docHeader} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} />
          <span style={styles.docTitle}>Documents ({documents.length})</span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      
      {expanded && (
        <div style={styles.docBody}>
          {isEditing && (
            <div style={{ marginBottom: '1rem' }}>
              <input type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} id="mobile-doc-upload" />
              <label htmlFor="mobile-doc-upload" style={styles.uploadBtn}>
                <Upload size={14} /> Select Files
              </label>
            </div>
          )}
          
          {selectedFiles.length > 0 && (
            <div style={styles.selectedFiles}>
              {selectedFiles.map((file, idx) => (
                <div key={idx} style={styles.selectedFile}>
                  <span>{file.name}</span>
                  <button onClick={() => removeFile(idx)} style={styles.removeBtn}>✕</button>
                </div>
              ))}
              <button onClick={handleUpload} disabled={uploading} style={styles.uploadConfirm}>
                Upload {selectedFiles.length} file(s)
              </button>
            </div>
          )}
          
          {documents.length === 0 ? (
            <div style={styles.emptyDocs}>No documents</div>
          ) : (
            documents.map(doc => (
              <div key={doc._id} style={styles.docItem}>
                <div style={styles.docIcon}>{getFileIcon?.(doc.fileType) || '📎'}</div>
                <div style={styles.docInfo}>
                  <div style={styles.docName}>{doc.fileName}</div>
                  {doc.description && <div style={styles.docDesc}>{doc.description}</div>}
                </div>
                <div style={styles.docActions}>
                  <button onClick={() => onDownload(doc._id)} style={styles.docAction}>📥</button>
                  {isEditing && (
                    <button onClick={() => onDelete(doc._id)} style={{ ...styles.docAction, color: '#dc2626' }}>🗑️</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Mobile Quotation Layout Component
// ============================================================
const MobileQuotationLayout = ({
  isEditing,
  quotationNumber,
  quotationData,
  onDataChange,
  quotationItems = [],
  availableItems = [],
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onAddImages,
  onRemoveExistingImage,
  onRemoveNewImage,
  newImages = {},
  subtotal = 0,
  taxAmount = 0,
  discountAmount = 0,
  grandTotal = 0,
  amountInWords = '',
  tcSections,
  onTcChange,
  actionBar,
  headerErrors = {},
  fieldErrors = {},
  setHeaderErrors,
  documents = [],
  onDocumentUpload,
  onDocumentDelete,
  onDocumentDownload,
  formatFileSize,
  getFileIcon,
  companyName,
  customerTaxTreatment = 'non_vat_registered',
  customerPlaceOfSupply = 'Dubai',
  showTaxSection = false,
  taxPresets = [],
  defaultTaxValue = '0',
  handleTaxChange,
}) => {
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });

  const showLocalSnack = (message, type = 'error') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => setSnackbar({ show: false, message: '', type: 'error' }), 3000);
  };

  const handleFieldChange = (field, value) => {
    onDataChange(field, value);
    if (setHeaderErrors && headerErrors[field]) {
      setHeaderErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const LEFT_FIELDS = [
    ['Project Name', 'projectName', 'text'],
    ['Customer', 'customer', 'text'],
    ['Contact', 'contact', 'text'],
    ['Date', 'date', 'date'],
    ['Expiry Date', 'expiryDate', 'date'],
    ['Sales Manager Email', 'salesOffice', 'text'],
  ];

  const RIGHT_FIELDS = [
    ['Our Ref', 'ourRef', 'text'],
    ['Our Contact', 'ourContact', 'text'],
    ['Payment', 'paymentTerms', 'text'],
    ['Delivery', 'deliveryTerms', 'text'],
    ['TL', 'tl', 'text'],
    ['TRN', 'trn', 'text'],
  ];

  return (
    <div style={styles.container}>
      {/* Header Image */}
      <div style={styles.headerImage}>
        <img src={headerImage} alt="Header" style={styles.headerImageImg} />
      </div>

      {/* Title Section */}
      <div style={styles.titleSection}>
        <h1 style={styles.title}>QUOTATION</h1>
        <p style={styles.quoteNumber}>{quotationNumber || '—'}</p>
        <div style={styles.validUntil}>
          <span style={styles.validUntilLabel}>VALID UNTIL</span>
          {isEditing ? (
            <input
              type="date"
              value={quotationData.expiryDate || ''}
              min={quotationData.date || ''}
              onChange={(e) => handleFieldChange('expiryDate', e.target.value)}
              style={inputStyle}
            />
          ) : (
            <span style={styles.expiryDate}>{fmtDate(quotationData.expiryDate)}</span>
          )}
          {headerErrors.expiryDate && <div style={styles.errorText}>{headerErrors.expiryDate}</div>}
        </div>
      </div>

      {/* Form Fields */}
      <div style={styles.fieldsSection}>
        {LEFT_FIELDS.map(([label, field, type]) => (
          <MobileField
            key={field}
            label={label}
            field={field}
            type={type}
            value={quotationData[field]}
            isEditing={isEditing}
            onChange={handleFieldChange}
            error={headerErrors[field]}
          />
        ))}
        {RIGHT_FIELDS.map(([label, field, type]) => (
          <MobileField
            key={field}
            label={label}
            field={field}
            type={type}
            value={quotationData[field]}
            isEditing={isEditing}
            onChange={handleFieldChange}
            error={headerErrors[field]}
          />
        ))}
      </div>

      {/* Items Section */}
      <div style={styles.itemsSection}>
        <h3 style={styles.sectionTitle}>Items</h3>
        {quotationItems.map((item, index) => (
          <MobileItemCard
            key={item.id}
            item={item}
            index={index}
            isEditing={isEditing}
            onUpdate={onUpdateItem}
            onRemove={onRemoveItem}
            onAddImages={onAddImages}
            newImages={newImages}
            onRemoveNewImage={onRemoveNewImage}
            onRemoveExistingImage={onRemoveExistingImage}
            availableItems={availableItems}
            fieldErrors={fieldErrors}
            showLocalSnack={showLocalSnack}
          />
        ))}
        {isEditing && (
          <button onClick={onAddItem} style={styles.addItemBtn}>
            <Plus size={16} /> Add Item
          </button>
        )}
      </div>

      {/* Totals */}
      <div style={styles.totalsSection}>
        <div style={styles.totalRow}>
          <span>Subtotal</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        {showTaxSection && (
          <div style={styles.totalRow}>
            <span>VAT ({quotationData.tax || 0}%)</span>
            <span>{taxAmount.toFixed(2)}</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div style={{ ...styles.totalRow, color: '#059669' }}>
            <span>Discount ({quotationData.discount || 0}%)</span>
            <span>-{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div style={styles.grandTotalRow}>
          <span>Grand Total</span>
          <span>{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Tax & Discount Edit */}
      {isEditing && showTaxSection && (
        <div style={styles.taxEditSection}>
          <h4 style={styles.taxTitle}>Tax & Discount</h4>
          <select
            onChange={handleTaxChange}
            value={quotationData.tax?.toString() ?? defaultTaxValue}
            style={inputStyle}
          >
            {taxPresets.map(preset => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>
          <ValidatedInput
            type="number"
            value={quotationData.discount}
            onChange={(val) => onDataChange('discount', val === '' ? 0 : parseFloat(val) || 0)}
            validator={validatePercentage}
            placeholder="Discount %"
            style={{ ...inputStyle, marginTop: '0.5rem' }}
            min="0"
            max="100"
          />
        </div>
      )}

      {/* Amount in Words */}
      <div style={styles.amountWords}>
        <strong>Amount in words:</strong> {amountInWords}
      </div>

      {/* Terms & Conditions */}
      <div style={styles.termsSection}>
        <h3 style={styles.sectionTitle}>Terms & Conditions</h3>
        {isEditing ? (
          <TermsEditor sections={tcSections} onChange={onTcChange} />
        ) : (
          <TermsViewer sections={tcSections} />
        )}
      </div>

      {/* Documents */}
      <MobileDocumentSection
        documents={documents}
        onUpload={onDocumentUpload}
        onDelete={onDocumentDelete}
        onDownload={onDocumentDownload}
        isEditing={isEditing}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
      />

      {/* Signature */}
      <div style={styles.signature}>
        <p>Sincerely,</p>
        <p style={{ marginTop: '2rem' }}>{companyName}</p>
      </div>

      {/* Action Bar */}
      {actionBar && <div style={styles.actionBar}>{actionBar}</div>}

      {/* Snackbar */}
      {snackbar.show && (
        <Snackbar message={snackbar.message} type={snackbar.type} onClose={() => setSnackbar({ show: false })} />
      )}
    </div>
  );
};

// ============================================================
// Styles
// ============================================================
const styles = {
  container: {
    backgroundColor: 'white',
    padding: '1rem',
    minHeight: '100vh',
  },
  headerImage: {
    width: '100%',
    height: '100px',
    backgroundColor: '#f8fafc',
    border: '2px solid #000',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '1rem',
  },
  headerImageImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: '5px',
  },
  titleSection: {
    textAlign: 'center',
    borderBottom: '2px solid #000',
    paddingBottom: '1rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
  },
  quoteNumber: {
    fontSize: '0.75rem',
    color: '#6b7280',
    margin: '0.25rem 0',
  },
  validUntil: {
    marginTop: '0.5rem',
  },
  validUntilLabel: {
    fontSize: '0.7rem',
    color: '#6b7280',
    display: 'block',
  },
  expiryDate: {
    fontSize: '0.9rem',
    fontWeight: '600',
  },
  errorText: {
    fontSize: '0.65rem',
    color: '#dc2626',
    marginTop: '0.25rem',
  },
  fieldsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  fieldCard: {
    backgroundColor: '#f8fafc',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  fieldLabel: {
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: '0.25rem',
    display: 'block',
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#1f2937',
  },
  fieldError: {
    fontSize: '0.65rem',
    color: '#dc2626',
    marginTop: '0.25rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
  },
  itemsSection: {
    marginBottom: '1.5rem',
  },
  itemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    marginBottom: '0.75rem',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  itemCardHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    cursor: 'pointer',
    gap: '0.75rem',
    backgroundColor: '#fff',
  },
  itemCardNumber: {
    width: '32px',
    height: '32px',
    backgroundColor: '#000',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  itemCardTitle: {
    flex: 1,
  },
  itemCardName: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  itemCardTotal: {
    fontSize: '0.7rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  itemCardBody: {
    padding: '1rem',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  itemField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  itemLabel: {
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  itemRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  itemValue: {
    fontSize: '0.875rem',
    fontWeight: '500',
    padding: '0.3rem 0.5rem',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
  },
  amountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderTop: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
  },
  amountValue: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#059669',
  },
  itemDescription: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  imageSection: {
    marginTop: '0.25rem',
  },
  imageGrid: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginTop: '0.5rem',
  },
  imageContainer: {
    position: 'relative',
    width: '70px',
    height: '70px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    overflow: 'visible',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '8px',
  },
  removeImgBtnStyle: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: '2px solid white',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  addImageBtn: {
    color: 'white',
    padding: '0.4rem 0.875rem',
    borderRadius: '8px',
    border: 'none',
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
  },
  imageUploadLabel: {
    display: 'block',
    marginTop: '0.5rem',
    padding: '0.5rem',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    textAlign: 'center',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  deleteItemBtn: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '0.6rem',
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
    width: '100%',
  },
  addItemBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '0.75rem',
    borderRadius: '10px',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  },
  totalsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1rem',
    border: '1px solid #e2e8f0',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    fontSize: '0.875rem',
    borderBottom: '1px solid #e2e8f0',
  },
  grandTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0 0',
    fontSize: '1rem',
    fontWeight: 'bold',
    marginTop: '0.5rem',
    paddingTop: '0.75rem',
    borderTop: '2px solid #000',
  },
  taxEditSection: {
    backgroundColor: '#eff6ff',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1rem',
  },
  taxTitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#1e40af',
  },
  amountWords: {
    backgroundColor: '#f8fafc',
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.8rem',
    marginBottom: '1rem',
    border: '1px solid #e2e8f0',
  },
  termsSection: {
    marginBottom: '1rem',
  },
  docSection: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    marginBottom: '1rem',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  docHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    cursor: 'pointer',
    backgroundColor: '#fff',
  },
  docTitle: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  docBody: {
    padding: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    borderRadius: '10px',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  selectedFiles: {
    marginBottom: '1rem',
  },
  selectedFile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '0.5rem',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  uploadConfirm: {
    width: '100%',
    padding: '0.6rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.75rem',
    marginTop: '0.5rem',
    cursor: 'pointer',
  },
  emptyDocs: {
    textAlign: 'center',
    padding: '1rem',
    color: '#9ca3af',
    fontSize: '0.8rem',
  },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    backgroundColor: 'white',
    borderRadius: '10px',
    marginBottom: '0.5rem',
  },
  docIcon: {
    fontSize: '1.2rem',
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  docDesc: {
    fontSize: '0.7rem',
    color: '#6b7280',
  },
  docActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  docAction: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.2rem',
  },
  signature: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
    fontSize: '0.8rem',
  },
  actionBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
};

export default MobileQuotationLayout;