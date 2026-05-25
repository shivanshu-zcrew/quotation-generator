// components/mobile/MobileQuotationLayout.jsx
import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Upload, FileText, Download, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import ValidatedInput from './ValidatedInput';
import TermsEditor, { TermsViewer } from './TermsCondition';
import Snackbar from './Snackbar';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { fmtDate } from '../utils/formatters';
import { inputStyle } from './QuotationLayout';
import { useAppStore } from '../services/store'; 

import headerImage from '../assets/header.png';

// ============================================================
// Mobile Field Component (Updated with read-only support)
// ============================================================
const MobileField = ({ label, field, type, value, isEditing, onChange, error, isReadOnly = false, required = false }) => (
  <div style={styles.fieldCard}>
    <label style={styles.fieldLabel}>
      {label}{required && ' *'}
      {isReadOnly && isEditing && (
        <span style={{ marginLeft: '8px', fontSize: '10px', color: '#6b7280' }}>🔒 Auto-filled</span>
      )}
    </label>
    {isEditing && !isReadOnly ? (
      type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(field, e.target.value)}
          rows={3}
          style={{
            ...inputStyle,
            borderColor: error ? '#dc2626' : undefined,
            backgroundColor: error ? '#fef2f2' : undefined,
            resize: 'vertical',
          }}
        />
      ) : (
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
      )
    ) : (
      <div style={{
        ...styles.fieldValue,
        ...(isReadOnly && isEditing ? { backgroundColor: '#f3f4f6', padding: '0.5rem 0.75rem', borderRadius: '0.5rem' } : {})
      }}>
        {type === 'date' ? fmtDate(value) : (value || 'N/A')}
      </div>
    )}
    {error && (
      <div style={styles.fieldError}>
        <AlertCircle size={10} /> {error}
      </div>
    )}
  </div>
);

// ============================================================
// Mobile Item Card Component (Updated with search support)
// ============================================================
const MobileItemCard = ({ 
  item, index, isEditing, onUpdate, onRemove, onAddImages,
  newImages, onRemoveNewImage, onRemoveExistingImage,
  availableItems, fieldErrors, showLocalSnack, currency 
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

  const handleCatalogSelect = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;
    
    const selectedCatalogItem = availableItems.find(itm => itm._id === selectedId);
    if (selectedCatalogItem) {
      onUpdate(item.id, 'itemId', selectedId);
      onUpdate(item.id, 'name', selectedCatalogItem.name);
      onUpdate(item.id, 'description', selectedCatalogItem.description || '');
      onUpdate(item.id, 'unitPrice', selectedCatalogItem.unitPrice || 0);
    }
  };

  const total = (Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2);

  const renderItemImages = () => {
    if (!item.imagePaths?.length && !newImages[item.id]?.length) return null;
    
    return (
      <div style={styles.imageSection}>
        <label style={styles.itemLabel}>Images</label>
        <div style={styles.imageGrid}>
          {item.imagePaths?.map((path, idx) => (
            <div key={`existing-${idx}`} style={styles.imageContainer}>
              <img src={path} alt="" style={styles.itemImage} />
              {isEditing && onRemoveExistingImage && (
                <button onClick={() => onRemoveExistingImage(item.id, idx)} style={styles.removeImgBtnStyle}>×</button>
              )}
            </div>
          ))}
          {newImages[item.id]?.map((src, idx) => (
            <div key={`new-${idx}`} style={{ ...styles.imageContainer, borderColor: '#86efac', borderWidth: '2px' }}>
              <img src={src} alt="" style={styles.itemImage} />
              {isEditing && onRemoveNewImage && (
                <button onClick={() => onRemoveNewImage(item.id, idx)} style={styles.removeImgBtnStyle}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

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
          {/* Catalog Selection */}
          {isEditing && availableItems.length > 0 && (
            <div style={styles.itemField}>
              <label style={styles.itemLabel}>Select from Catalog</label>
              <select
                value={item.itemId || ''}
                onChange={handleCatalogSelect}
                style={inputStyle}
              >
                <option value="">— Select Item —</option>
                {availableItems.map((itm) => (
                  <option key={itm._id} value={itm._id}>
                    {itm.name} - {currency} {Number(itm.unitPrice || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Item Name */}
          <div style={styles.itemField}>
            <label style={styles.itemLabel}>Item Name</label>
            {isEditing ? (
              <input
                type="text"
                value={item.name || ''}
                onChange={(e) => onUpdate(item.id, 'name', e.target.value)}
                placeholder="Item name..."
                style={inputStyle}
              />
            ) : (
              <div style={styles.itemDescription}>{item.name || '—'}</div>
            )}
          </div>
          
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
              <label style={styles.itemLabel}>Unit Price ({currency})</label>
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
            <label style={styles.itemLabel}>Amount ({currency})</label>
            <div style={styles.amountValue}>{total}</div>
          </div>
          
          {/* Images */}
          {renderItemImages()}
          
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
// Mobile Document Section Component (Updated)
// ============================================================
const MobileDocumentSection = ({ documents, onUpload, onDelete, onDownload, onPreview, isEditing, formatFileSize, getFileIcon }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docDescriptions, setDocDescriptions] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setDocDescriptions(prev => {
      const newDesc = { ...prev };
      delete newDesc[prev[index]?.name];
      return newDesc;
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    const descriptions = selectedFiles.map(file => docDescriptions[file.name] || '');
    await onUpload(selectedFiles, descriptions);
    setSelectedFiles([]);
    setDocDescriptions({});
    setUploading(false);
  };

  const handleDescriptionChange = (fileName, value) => {
    setDocDescriptions(prev => ({ ...prev, [fileName]: value }));
  };

  return (
    <div style={styles.docSection}>
      <div style={styles.docHeader} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} />
          <span style={styles.docTitle}>Internal Documents ({documents.length})</span>
          <span style={styles.internalBadge}>Internal only</span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      
      {expanded && (
        <div style={styles.docBody}>
          {isEditing && (
            <div style={{ marginBottom: '1rem' }}>
              <input type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} id="mobile-doc-upload" />
              <label htmlFor="mobile-doc-upload" style={styles.uploadBtn}>
                <Upload size={14} /> Select Documents
              </label>
              <p style={styles.uploadHint}>PDF, DOC, XLS, Images, TXT, ZIP (Max 10MB each)</p>
            </div>
          )}
          
          {selectedFiles.length > 0 && (
            <div style={styles.selectedFiles}>
              <h4 style={styles.selectedFilesTitle}>Files ready to upload:</h4>
              {selectedFiles.map((file, idx) => (
                <div key={idx} style={styles.selectedFile}>
                  <div style={styles.selectedFileInfo}>
                    <span style={styles.selectedFileName}>{file.name}</span>
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={docDescriptions[file.name] || ''}
                      onChange={(e) => handleDescriptionChange(file.name, e.target.value)}
                      style={styles.fileDescInput}
                    />
                  </div>
                  <button onClick={() => removeFile(idx)} style={styles.removeBtn}>✕</button>
                </div>
              ))}
              <button onClick={handleUpload} disabled={uploading} style={styles.uploadConfirm}>
                {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
              </button>
            </div>
          )}
          
          {documents.length === 0 ? (
            <div style={styles.emptyDocs}>
              <FileText size={24} color="#d1d5db" style={{ marginBottom: '0.5rem' }} />
              <p>No internal documents</p>
              {isEditing && <p style={{ fontSize: '0.7rem' }}>Upload documents for internal team reference</p>}
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc._id || doc.id} style={styles.docItem}>
                <div style={styles.docIcon}>{getFileIcon?.(doc.fileType) || '📎'}</div>
                <div style={styles.docInfo}>
                  <div style={styles.docName}>{doc.fileName}</div>
                  {doc.description && <div style={styles.docDesc}>{doc.description}</div>}
                  <div style={styles.docDate}>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                </div>
                <div style={styles.docActions}>
                  {(doc.fileType?.startsWith('image/') || doc.fileData?.startsWith('data:image')) ? (
                    <button onClick={() => onPreview?.(doc._id || doc.id)} style={styles.docAction}>👁️</button>
                  ) : (
                    <button onClick={() => onDownload(doc._id || doc.id)} style={styles.docAction}>📥</button>
                  )}
                  {isEditing && (
                    <button onClick={() => onDelete(doc._id || doc.id)} style={{ ...styles.docAction, color: '#dc2626' }}>🗑️</button>
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
// Main Mobile Quotation Layout Component (UPDATED with all features)
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
  onDocumentPreview,
  formatFileSize,
  getFileIcon,
  companyName,
  customerTaxTreatment = 'non_vat_registered',
  customerPlaceOfSupply = 'Dubai',
  showTaxSection = false,
  taxPresets = [],
  defaultTaxValue = '0',
  handleTaxChange,
  termsImages = [],
  onTermsImagesUpload,
  onRemoveTermsImage,
  hideSnack,
  companyPhone = '',
  companyEmail = '',
  companyTradeLicense = '',
  companyTaxRegistration = '',
  selectedCurrency = 'AED'
}) => {
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });
  
  // Get current user from store
  const currentUser = useAppStore((state) => state.user);

  const showLocalSnack = (message, type = 'error') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => setSnackbar({ show: false, message: '', type: 'error' }), 3000);
    if (hideSnack) hideSnack();
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

  // Updated field definitions with all required fields
  const LEFT_FIELDS = [
    { label: 'Project Name', field: 'projectName', type: 'text', required: true },
    { label: 'Scope of Work', field: 'scopeOfWork', type: 'textarea', required: false },
    { label: 'Company Name', field: 'customer', type: 'text', required: true },
    { label: 'Contact Name', field: 'customerName', type: 'text', required: true },
    { label: 'Phone', field: 'customerPhone', type: 'text', required: true },
    { label: 'Email', field: 'customerEmail', type: 'email', required: true },
    { label: 'Designation', field: 'customerDesignation', type: 'text', required: false },
    { label: 'Trade License Number', field: 'customerTradeLicenseNumber', type: 'text', required: false },
    { label: 'Tax Registration Number', field: 'customerTaxRegistrationNumber', type: 'text', required: false },
  ];

  const RIGHT_FIELDS = [
    { label: 'Name', field: 'ourFocalPoint', type: 'text', required: true, isReadOnly: false },
    { label: 'Phone', field: 'ourContact', type: 'text', required: false, isReadOnly: true },
    { label: 'Email', field: 'salesManagerEmail', type: 'email', required: false, isReadOnly: true },
    { label: 'Designation', field: 'ourFocalPointDesignation', type: 'text', required: false, isReadOnly: false },
    { label: 'Trade License Number', field: 'companyTradeLicense', type: 'text', required: false, isReadOnly: true },
    { label: 'Tax Registration Number', field: 'companyTaxRegistration', type: 'text', required: false, isReadOnly: true },
    { label: 'Date', field: 'date', type: 'date', required: true, isReadOnly: false },
    { label: 'Expiry Date', field: 'expiryDate', type: 'date', required: true, isReadOnly: false },
  ];

  // Get field values with fallbacks
  const getFieldValue = (field) => {
    if (field === 'companyTradeLicense') return companyTradeLicense || quotationData.companyTradeLicense;
    if (field === 'companyTaxRegistration') return companyTaxRegistration || quotationData.companyTaxRegistration;
    if (field === 'ourContact') return quotationData.ourContact || companyPhone;
    if (field === 'salesManagerEmail') return quotationData.salesManagerEmail || companyEmail;
    return quotationData[field];
  };

  // Auto-populate sales info from logged-in user
  useEffect(() => {
    if (isEditing && currentUser) {
      if (!quotationData.salesManagerEmail && currentUser.email) {
        onDataChange('salesManagerEmail', currentUser.email);
      }
      if (!quotationData.ourContact && (currentUser.phone || currentUser.name)) {
        onDataChange('ourContact', currentUser.phone || currentUser.name);
      }
      if (!quotationData.ourFocalPoint && currentUser.name) {
        onDataChange('ourFocalPoint', currentUser.name);
      }
    }
  }, [isEditing, currentUser, quotationData.salesManagerEmail, quotationData.ourContact, quotationData.ourFocalPoint, onDataChange]);

  const displayCurrency = selectedCurrency || quotationData.currency?.code || 'AED';

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
              style={{
                ...inputStyle,
                borderColor: headerErrors.expiryDate ? '#dc2626' : undefined,
              }}
            />
          ) : (
            <span style={styles.expiryDate}>{fmtDate(quotationData.expiryDate)}</span>
          )}
          {headerErrors.expiryDate && <div style={styles.errorText}>{headerErrors.expiryDate}</div>}
        </div>
      </div>

      {/* Form Fields - Two Columns */}
      <div style={styles.fieldsSection}>
        {/* Left Column - Customer Details */}
        <div style={styles.column}>
          <h4 style={styles.columnTitle}>Customer Details</h4>
          {LEFT_FIELDS.map(({ label, field, type, required }) => (
            <MobileField
              key={field}
              label={label}
              field={field}
              type={type}
              value={getFieldValue(field)}
              isEditing={isEditing}
              onChange={handleFieldChange}
              error={headerErrors[field]}
              isReadOnly={false}
              required={required}
            />
          ))}
        </div>
        
        {/* Right Column - Company & Dates */}
        <div style={styles.column}>
          <h4 style={styles.columnTitle}>Company Details</h4>
          {RIGHT_FIELDS.map(({ label, field, type, required, isReadOnly }) => (
            <MobileField
              key={field}
              label={label}
              field={field}
              type={type}
              value={getFieldValue(field)}
              isEditing={isEditing}
              onChange={handleFieldChange}
              error={headerErrors[field]}
              isReadOnly={isReadOnly}
              required={required}
            />
          ))}
        </div>
      </div>

      {/* Items Section */}
      <div style={styles.itemsSection}>
        <h3 style={styles.sectionTitle}>Items Detail</h3>
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
            currency={displayCurrency}
          />
        ))}
        {isEditing && (
          <button onClick={onAddItem} style={styles.addItemBtn}>
            <Plus size={16} /> Add More Items
          </button>
        )}
      </div>

      {/* Totals */}
      <div style={styles.totalsSection}>
        <div style={styles.totalRow}>
          <span>Subtotal ({displayCurrency})</span>
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
          <span>Grand Total ({displayCurrency})</span>
          <span>{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Tax & Discount Edit */}
      {isEditing && showTaxSection && (
        <div style={styles.taxEditSection}>
          <h4 style={styles.taxTitle}>Tax & Discount</h4>
          <div style={styles.taxGrid}>
            <div>
              <label style={styles.inputLabel}>VAT (%)</label>
              <select
                onChange={handleTaxChange}
                value={quotationData.tax?.toString() ?? defaultTaxValue}
                style={inputStyle}
              >
                {taxPresets.map(preset => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.inputLabel}>Discount (%)</label>
              <ValidatedInput
                type="number"
                value={quotationData.discount}
                onChange={(val) => onDataChange('discount', val === '' ? 0 : parseFloat(val) || 0)}
                validator={validatePercentage}
                placeholder="Discount %"
                style={inputStyle}
                min="0"
                max="100"
                step="0.01"
              />
            </div>
          </div>
          {headerErrors.tax && <div style={styles.fieldError}>⚠ {headerErrors.tax}</div>}
          {headerErrors.discount && <div style={styles.fieldError}>⚠ {headerErrors.discount}</div>}
        </div>
      )}

      {/* Amount in Words */}
      <div style={styles.amountWords}>
        <strong>Amount in words: </strong>
        <span>{amountInWords}</span>
      </div>

      {/* Remark Section */}
      {isEditing ? (
        <div style={styles.remarkSection}>
          <div style={styles.remarkHeader}>
            <FileText size={18} />
            <h4 style={styles.remarkTitle}>Remark</h4>
            <span style={styles.internalBadge}>Additional notes</span>
          </div>
          <textarea
            value={quotationData.remark || ''}
            onChange={(e) => handleFieldChange('remark', e.target.value)}
            placeholder="Add any additional remarks or notes about this quotation..."
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              width: '100%',
            }}
          />
        </div>
      ) : (
        quotationData.remark && (
          <div style={styles.remarkSection}>
            <div style={styles.remarkHeader}>
              <FileText size={18} />
              <h4 style={styles.remarkTitle}>Remark</h4>
            </div>
            <div style={styles.remarkContent}>
              {quotationData.remark}
            </div>
          </div>
        )
      )}

      {/* Terms & Conditions with Images */}
      <div style={styles.termsSection}>
        <h3 style={styles.sectionTitle}>Terms & Conditions</h3>
        {isEditing ? (
          <TermsEditor 
            sections={tcSections} 
            onChange={onTcChange}
            termsImages={termsImages}
            onTermsImagesUpload={onTermsImagesUpload}
            onRemoveTermsImage={onRemoveTermsImage}
          />
        ) : (
          <TermsViewer 
            sections={tcSections} 
            termsImages={termsImages}
          />
        )}
      </div>

      {/* Documents */}
      <MobileDocumentSection
        documents={documents}
        onUpload={onDocumentUpload}
        onDelete={onDocumentDelete}
        onDownload={onDocumentDownload}
        onPreview={onDocumentPreview}
        isEditing={isEditing}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
      />

      {/* Signature */}
      <div style={styles.signature}>
        <p style={{ margin: 0, fontWeight: '600' }}>Sincerely,</p>
        <p style={{ marginTop: '2rem', fontWeight: '600' }}>{companyName}</p>
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
// Styles (Updated with new styles)
// ============================================================
const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    padding: '1rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  headerImage: {
    width: '100%',
    height: '100px',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    borderRadius: '0.5rem',
  },
  headerImageImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: '5px',
  },
  titleSection: {
    textAlign: 'center',
    marginBottom: '1.5rem',
    borderBottom: '2px solid #000',
    paddingBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
  },
  quoteNumber: {
    color: '#6b7280',
    fontSize: '0.75rem',
    margin: '0.25rem 0',
  },
  validUntil: {
    marginTop: '0.5rem',
  },
  validUntilLabel: {
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#6b7280',
    display: 'block',
  },
  expiryDate: {
    fontSize: '0.875rem',
    fontWeight: '700',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.7rem',
    marginTop: '0.25rem',
  },
  fieldsSection: {
    marginBottom: '1.5rem',
  },
  column: {
    marginBottom: '1rem',
  },
  columnTitle: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: '0.5rem',
    paddingBottom: '0.25rem',
    borderBottom: '1px solid #e5e7eb',
  },
  fieldCard: {
    marginBottom: '0.75rem',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.25rem',
  },
  fieldValue: {
    fontSize: '0.875rem',
    color: '#1f2937',
    padding: '0.25rem 0',
  },
  fieldError: {
    fontSize: '0.65rem',
    color: '#dc2626',
    marginTop: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  itemsSection: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  itemCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    marginBottom: '0.75rem',
    overflow: 'hidden',
  },
  itemCardHeader: {
    padding: '0.75rem',
    backgroundColor: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
  },
  itemCardNumber: {
    fontWeight: '600',
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  itemCardTitle: {
    flex: 1,
  },
  itemCardName: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  itemCardTotal: {
    fontSize: '0.75rem',
    color: '#059669',
    fontWeight: '600',
  },
  itemCardBody: {
    padding: '0.75rem',
    borderTop: '1px solid #e5e7eb',
  },
  itemField: {
    marginBottom: '0.75rem',
  },
  itemLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.25rem',
  },
  itemDescription: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  itemRow: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  itemValue: {
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  amountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '0.5rem',
    borderTop: '1px solid #e5e7eb',
  },
  amountValue: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#059669',
  },
  imageSection: {
    marginBottom: '0.75rem',
  },
  imageGrid: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginTop: '0.5rem',
  },
  imageContainer: {
    position: 'relative',
    width: '80px',
    height: '80px',
    borderRadius: '0.375rem',
    overflow: 'hidden',
    border: '1px solid #d1d5db',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  removeImgBtnStyle: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: '2px solid white',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  addImageBtn: {
    color: 'white',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.7rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  imageUploadLabel: {
    display: 'block',
    padding: '0.5rem',
    border: '2px dashed #d1d5db',
    borderRadius: '0.375rem',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  deleteItemBtn: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    width: '100%',
    marginTop: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  totalsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    marginBottom: '1rem',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    fontSize: '0.875rem',
    borderBottom: '1px solid #e5e7eb',
  },
  grandTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0 0.5rem',
    fontSize: '1rem',
    fontWeight: '700',
    color: '#059669',
  },
  taxEditSection: {
    backgroundColor: '#f0f9ff',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    marginBottom: '1rem',
  },
  taxTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: '#0369a1',
  },
  taxGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.25rem',
  },
  amountWords: {
    padding: '0.75rem',
    backgroundColor: '#f8fafc',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    marginBottom: '1rem',
  },
  remarkSection: {
    marginBottom: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    border: '1px solid #e2e8f0',
  },
  remarkHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  remarkTitle: {
    fontSize: '0.8rem',
    fontWeight: '600',
    margin: 0,
    color: '#1f2937',
  },
  remarkContent: {
    fontSize: '0.875rem',
    color: '#1f2937',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  termsSection: {
    marginBottom: '1rem',
  },
  internalBadge: {
    fontSize: '0.6rem',
    color: '#6b7280',
    backgroundColor: '#e2e8f0',
    padding: '0.2rem 0.4rem',
    borderRadius: '999px',
    marginLeft: 'auto',
  },
  docSection: {
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    overflow: 'hidden',
  },
  docHeader: {
    padding: '0.75rem',
    backgroundColor: '#f8fafc',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  docTitle: {
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  docBody: {
    padding: '0.75rem',
    borderTop: '1px solid #e5e7eb',
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    border: 'none',
  },
  uploadHint: {
    fontSize: '0.65rem',
    color: '#6b7280',
    marginTop: '0.5rem',
    marginBottom: 0,
  },
  selectedFiles: {
    marginTop: '0.75rem',
  },
  selectedFilesTitle: {
    fontSize: '0.7rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: '#374151',
  },
  selectedFile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    backgroundColor: '#f3f4f6',
    borderRadius: '0.375rem',
    marginBottom: '0.5rem',
    gap: '0.5rem',
  },
  selectedFileInfo: {
    flex: 1,
  },
  selectedFileName: {
    fontSize: '0.7rem',
    fontWeight: '500',
    display: 'block',
    marginBottom: '0.25rem',
  },
  fileDescInput: {
    width: '100%',
    padding: '0.25rem 0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '0.25rem',
    fontSize: '0.7rem',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#ef4444',
    fontSize: '1rem',
    padding: '0.25rem',
  },
  uploadConfirm: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    width: '100%',
  },
  emptyDocs: {
    textAlign: 'center',
    padding: '1rem',
    color: '#9ca3af',
    fontSize: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    borderBottom: '1px solid #e5e7eb',
  },
  docIcon: {
    fontSize: '1.2rem',
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: '0.75rem',
    fontWeight: '500',
  },
  docDesc: {
    fontSize: '0.65rem',
    color: '#6b7280',
  },
  docDate: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    marginTop: '0.2rem',
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
    padding: '0.25rem',
  },
  signature: {
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'right',
    fontSize: '0.75rem',
  },
  actionBar: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
  },
  addItemBtn: {
    marginTop: '0.75rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    width: '100%',
    justifyContent: 'center',
  },
};

export default MobileQuotationLayout;