import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, Upload, FileText, Download } from 'lucide-react';
import headerImage from '../assets/header.png';
import TermsEditor, { TermsViewer } from './TermsCondition';
import ValidatedInput from './ValidatedInput';
import Snackbar from './Snackbar';
import { useCompanyCurrency } from './CompanyCurrencySelector';

// Utils
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { fmtDate } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────
// Constants & Style Tokens
// ─────────────────────────────────────────────────────────────
const DOCUMENT_CONFIG = {
  MAX_SIZE_MB: 10,
  ALLOWED_TYPES: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
  ]
};

// ✅ UAE Emirates and GCC Countries lists
const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

export const inputStyle = {
  width: '100%',
  border: '1px solid #d1d5db',
  padding: '0.3rem 0.5rem',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  backgroundColor: 'white',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const removeImgBtnStyle = {
  position: 'absolute', top: '-6px', right: '-6px',
  backgroundColor: '#ef4444', color: 'white', border: 'none',
  borderRadius: '50%', width: '20px', height: '20px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: '10px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
};

// ─────────────────────────────────────────────────────────────
// Field Configurations
// ─────────────────────────────────────────────────────────────
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

const TABLE_HEADERS = (isEditing, currency) => [
  { label: 'SR#', w: '50px', align: 'center' },
  { label: 'Item Description', w: 'auto', align: 'left' },
  { label: 'Qty', w: '80px', align: 'center' },
  { label: 'Unit Price', w: '110px', align: 'right' },
  { label: `Amount (${currency})`, w: '120px', align: 'right' },
  ...(isEditing ? [{ label: '', w: '50px', align: 'center' }] : []),
];

// ─────────────────────────────────────────────────────────────
// Document Upload Section Component
// ─────────────────────────────────────────────────────────────
function DocumentUploadSection({ 
  documents = [], 
  onUpload, 
  onDelete, 
  onDownload,
  onPreview,
  loading = false,
  isEditing = false,
  formatFileSize,
  getFileIcon 
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docDescriptions, setDocDescriptions] = useState({});
  const [uploading, setUploading] = useState(false);

  const validateFile = useCallback((file) => {
    if (file.size > DOCUMENT_CONFIG.MAX_SIZE_MB * 1024 * 1024) {
      alert(`File "${file.name}" exceeds ${DOCUMENT_CONFIG.MAX_SIZE_MB}MB limit`);
      return false;
    }
    if (!DOCUMENT_CONFIG.ALLOWED_TYPES.includes(file.type)) {
      alert(`File "${file.name}" type is not allowed`);
      return false;
    }
    return true;
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(validateFile);
    setSelectedFiles(prev => [...prev, ...validFiles]);
  }, [validateFile]);

  const handleDescriptionChange = useCallback((fileName, description) => {
    setDocDescriptions(prev => ({ ...prev, [fileName]: description }));
  }, []);

  const removeSelectedFile = useCallback((index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
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
  }, [selectedFiles, docDescriptions, onUpload]);

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
        <h3 style={styles.sectionTitle}>Internal Documents</h3>
        <span style={styles.internalBadge}>For internal team only</span>
      </div>

      {isEditing && (
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
                ...styles.uploadButton,
                backgroundColor: uploading ? '#9ca3af' : '#4f46e5',
                opacity: uploading ? 0.7 : 1,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Select Documents'}
            </label>
            <p style={styles.uploadHint}>
              Supports PDF, DOC, XLS, Images, TXT, ZIP (Max {DOCUMENT_CONFIG.MAX_SIZE_MB}MB each)
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={styles.fileListTitle}>Files ready to upload:</h4>
              {selectedFiles.map((file, index) => (
                <div key={index} style={styles.fileRow}>
                  <FileText size={16} color="#6b7280" />
                  <span style={styles.fileName}>{file.name}</span>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={docDescriptions[file.name] || ''}
                    onChange={(e) => handleDescriptionChange(file.name, e.target.value)}
                    style={styles.fileDescriptionInput}
                  />
                  <button
                    onClick={() => removeSelectedFile(index)}
                    style={styles.removeFileBtn}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={styles.uploadConfirmBtn}
              >
                {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Documents list */}
      {loading ? (
        <div style={styles.loadingText}>Loading documents...</div>
      ) : documents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {documents.map((doc) => (
            <div key={doc._id} style={styles.documentCard}>
              <span style={{ fontSize: '1.2rem' }}>{getFileIcon?.(doc.fileType) || '📎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={styles.documentName}>{doc.fileName}</span>
                  <span style={styles.documentSize}>
                    {formatFileSize?.(doc.fileSize) || `${(doc.fileSize / 1024).toFixed(2)} KB`}
                  </span>
                </div>
                {doc.description && (
                  <div style={styles.documentDescription}>{doc.description}</div>
                )}
                <div style={styles.documentDate}>
                  Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {doc.fileType?.startsWith('image/') ? (
                  <button onClick={() => onPreview?.(doc._id)} style={styles.previewBtn} title="Preview">👁️</button>
                ) : (
                  <button onClick={() => onDownload?.(doc._id)} style={styles.downloadBtn} title="Download">
                    <Download size={14} />
                  </button>
                )}
                {isEditing && (
                  <button onClick={() => onDelete?.(doc._id)} style={styles.deleteBtn} title="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyDocuments}>
          <FileText size={24} color="#d1d5db" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontSize: '0.875rem' }}>No internal documents</p>
          {isEditing && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
              Upload documents for internal team reference
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function QuotationLayout({
  isEditing,
  quotationNumber,
  quotationData,      
  onDataChange,
  quotationItems    = [],
  availableItems    = [],
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onAddImages,
  onRemoveExistingImage,
  onRemoveNewImage,
  editingImgId,
  onToggleImgEdit,
  newImages         = {},
  subtotal          = 0,
  taxAmount         = 0,
  discountAmount    = 0,
  grandTotal        = 0,
  amountInWords     = '',
  tcSections,
  onTcChange,
  actionBar,
  headerErrors      = {},   
  fieldErrors       = {},    
  setHeaderErrors, 
  documents         = [],
  onDocumentUpload,
  onDocumentDelete,
  onDocumentDownload,
  onDocumentPreview,
  documentLoading   = false,
  formatFileSize,
  getFileIcon,
  companyName,
  customerTaxTreatment = 'non_vat_registered',
  customerPlaceOfSupply = 'Dubai',
  termsImages = [],           
  onTermsImagesUpload,      
  onRemoveTermsImage    
}) {
  
  // ── Hooks ────────────────────────────────────────────────
  const { selectedCurrency } = useCompanyCurrency();
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });

  // ── Guard ─────────────────────────────────────────────────
  if (!quotationData) return null;

  // ── Memoized Values ───────────────────────────────────────
  const displayCurrency = useMemo(() => {
    if (!isEditing || quotationData.currency?.code) {
      return quotationData.currency?.code || 'AED';
    }
    if (quotationData.currency?.code) {
      return quotationData.currency.code;
    }
    return selectedCurrency || 'AED';
  }, [isEditing, quotationData.currency, selectedCurrency]);

  const tableHeaders = useMemo(() => TABLE_HEADERS(isEditing, displayCurrency), [isEditing, displayCurrency]);

  // ✅ Determine if place of supply is UAE or GCC
  const isPlaceOfSupplyUAE = useMemo(() => {
    return UAE_EMIRATES.includes(customerPlaceOfSupply);
  }, [customerPlaceOfSupply]);

  const isPlaceOfSupplyGCC = useMemo(() => {
    return GCC_COUNTRIES.includes(customerPlaceOfSupply);
  }, [customerPlaceOfSupply]);

  // ✅ Dynamic tax presets based on customer's VAT treatment AND place of supply
  const getTaxPresets = useCallback(() => {
    // Non-VAT registered customers - no tax section
    if (customerTaxTreatment === 'non_vat_registered' || customerTaxTreatment === 'gcc_non_vat_registered') {
      return [];
    }
    
    // UAE VAT Registered (vat_registered)
    if (customerTaxTreatment === 'vat_registered') {
      if (isPlaceOfSupplyUAE) {
        // Domestic UAE - 0% or 5% ✅ BOTH OPTIONS
        return [
          { value: "0", label: "0%" },
          { value: "5", label: "5%" }
        ];
      } else if (isPlaceOfSupplyGCC) {
        // Export to GCC - 0% only
        return [{ value: "0", label: "0% (Export - Zero-rated)" }];
      }
    }
    
    // GCC VAT Registered (gcc_vat_registered)
    if (customerTaxTreatment === 'gcc_vat_registered') {
      if (isPlaceOfSupplyUAE) {
        // GCC customer importing to UAE - 5% only
        return [{ value: "0", label: "0%" },
         { value: "5", label: "5%" }];
      } else if (isPlaceOfSupplyGCC) {
        // GCC domestic (within GCC) - 0% only
        return [{ value: "0", label: "0% (GCC Domestic)" }];
      }
    }
    
    return [];
  }, [customerTaxTreatment, isPlaceOfSupplyUAE, isPlaceOfSupplyGCC]);

  const taxPresets = getTaxPresets();
  const showTaxSection = taxPresets.length > 0;

  // ✅ Get default tax value
  const defaultTaxValue = useMemo(() => {
    if (!showTaxSection) return "0";
    const fivePercent = taxPresets.find(p => p.value === "5");
    if (fivePercent) return "5";
    return taxPresets[0].value;
  }, [showTaxSection, taxPresets]);

  const handleTaxChange = useCallback((e) => {
    const value = e.target.value;
    const taxValue = parseFloat(value);
    onDataChange('tax', taxValue);
    
    if (setHeaderErrors && headerErrors.tax) {
      setHeaderErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.tax;
        return newErrors;
      });
    }
  }, [onDataChange, setHeaderErrors, headerErrors]);
// Add this debug log right before the return statement in QuotationLayout
console.log('🔍 QuotationLayout Debug - Tax Display:', {
  isEditing,
  taxAmount,
  discountAmount,
  quotationDataTax: quotationData.tax,
  quotationDataDiscount: quotationData.discount,
  customerTaxTreatment,
  customerPlaceOfSupply,
  showTaxSection,
  taxPresets: getTaxPresets(),
  shouldShowTaxRow: taxAmount > 0 || (quotationData.tax && Number(quotationData.tax) > 0),
  shouldShowDiscountRow: discountAmount > 0
});
  const handleFieldChange = useCallback((field, value) => {
    onDataChange(field, value);
    if (setHeaderErrors && headerErrors[field]) {
      setHeaderErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [onDataChange, setHeaderErrors, headerErrors]);

  const showLocalSnack = useCallback((message, type = 'error') => {
    setSnackbar({ show: true, message, type });
  }, []);

  const hideSnack = useCallback(() => {
    setSnackbar({ show: false, message: '', type: 'error' });
  }, []);

  const handleValidatedUpdate = useCallback((itemId, field, value, validator) => {
    if (value === '') {
      if (field === 'quantity') {
        showLocalSnack('Quantity cannot be empty');
      }
      return;
    }
    if (validator) {
      const result = validator(value);
      if (!result.isValid) {
        showLocalSnack(result.error);
        return;
      }
    }
    onUpdateItem(itemId, field, value);
  }, [onUpdateItem, showLocalSnack]);

  // ── Render Helpers ────────────────────────────────────────
  const renderFieldGrid = (fields) => (
    <div style={styles.fieldGrid}>
      {fields.map(([label, field, type]) => (
        <React.Fragment key={field}>
          <span style={styles.fieldLabel}>{label}</span>
          <span style={styles.fieldColon}>:</span>
          {isEditing ? (
            <div>
              <input
                type={type}
                className="edit-input"
                value={quotationData[field] || ''}
                min={field === 'expiryDate' ? (quotationData.date || '') : undefined}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: headerErrors[field] ? '#dc2626' : undefined,
                  backgroundColor: headerErrors[field] ? '#fef2f2' : undefined
                }}
              />
              {headerErrors[field] && (
                <div style={styles.fieldError}>⚠ {headerErrors[field]}</div>
              )}
            </div>
          ) : (
            <span style={styles.fieldValue}>
              {type === 'date' ? fmtDate(quotationData[field]) : (quotationData[field] || 'N/A')}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderItemImages = (qi) => {
    if (!qi.imagePaths?.length) return null;
    return (
      <div style={styles.imageGrid}>
        {qi.imagePaths.map((path, idx) => (
          <div key={idx} style={styles.imageContainer}>
            <img src={path} alt={`item-img-${idx}`} style={styles.itemImage} />
            {isEditing && onRemoveExistingImage && (
              <button onClick={() => onRemoveExistingImage(qi.id, idx)} style={removeImgBtnStyle}>×</button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderNewImages = (qi) => {
    if (!newImages[qi.id]?.length) return null;
    return (
      <div style={styles.imageGrid}>
        {newImages[qi.id].map((src, idx) => (
          <div key={idx} style={{ ...styles.imageContainer, borderColor: '#86efac' }}>
            <img src={src} alt={`new-img-${idx}`} style={styles.itemImage} />
            {isEditing && onRemoveNewImage && (
              <button onClick={() => onRemoveNewImage(qi.id, idx)} style={removeImgBtnStyle}>×</button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderImageUploadControls = (qi) => (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        onClick={() => onToggleImgEdit(qi.id)}
        style={{
          ...styles.addImageBtn,
          backgroundColor: editingImgId === qi.id ? '#dc2626' : '#10b981'
        }}
      >
        <Upload size={13} /> {editingImgId === qi.id ? 'Cancel' : 'Add Images'}
      </button>
      {editingImgId === qi.id && (
        <div style={{ marginTop: '0.5rem' }}>
          <input
            type="file" accept="image/*" multiple
            id={`img-upload-${qi.id}`}
            style={{ display: 'none' }}
            onChange={(e) => onAddImages(e, qi.id)}
          />
          <label htmlFor={`img-upload-${qi.id}`} style={styles.imageUploadLabel}>
            Click to choose images
          </label>
        </div>
      )}
    </div>
  );

  const renderItemRow = (qi, index) => (
    <tr key={qi.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc', verticalAlign: 'top' }}>
      <td style={styles.tableCellCenter}>{index + 1}</td>
      <td style={styles.tableCellDescription}>
        {isEditing ? (
          <>
            <select
              className="edit-input"
              value={qi.itemId || ''}
              onChange={(e) => onUpdateItem(qi.id, 'itemId', e.target.value)}
              style={{ ...inputStyle, marginBottom: '0.5rem' }}
            >
              <option value="">— Select Item —</option>
              {availableItems.map((itm) => (
                <option key={itm._id} value={itm._id}>{itm.name}</option>
              ))}
            </select>
            <textarea
              className="edit-input"
              value={qi.description || ''}
              onChange={(e) => onUpdateItem(qi.id, 'description', e.target.value)}
              placeholder="Item description (optional)…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.4', fontSize: '0.8125rem' }}
            />
          </>
        ) : (
          <>
            <div style={styles.itemName}>{qi.name || '—'}</div>
            {qi.description && <div style={styles.itemDescription}>{qi.description}</div>}
          </>
        )}

        {renderItemImages(qi)}
        {renderNewImages(qi)}
        {isEditing && renderImageUploadControls(qi)}
      </td>

      <td style={styles.tableCellCenter}>
        {isEditing ? (
          <div>
            <ValidatedInput
              type="number"
              value={qi.quantity}
              onChange={(val) => handleValidatedUpdate(qi.id, 'quantity', val, validateQuantity)}
              validator={validateQuantity}
              placeholder="Qty"
              style={{
                ...inputStyle,
                textAlign: 'center',
                borderColor: fieldErrors[qi.id]?.quantity ? '#dc2626' : undefined,
                backgroundColor: fieldErrors[qi.id]?.quantity ? '#fef2f2' : undefined
              }}
              min="1"
            />
            {fieldErrors[qi.id]?.quantity && (
              <div style={styles.fieldErrorSmall}>⚠ {fieldErrors[qi.id].quantity}</div>
            )}
          </div>
        ) : qi.quantity}
      </td>

      <td style={styles.tableCellRight}>
        {isEditing ? (
          <div>
            <ValidatedInput
              type="number"
              value={qi.unitPrice}
              onChange={(val) => handleValidatedUpdate(qi.id, 'unitPrice', val, validatePrice)}
              validator={validatePrice}
              placeholder="0.00"
              style={{
                ...inputStyle,
                textAlign: 'right',
                borderColor: fieldErrors[qi.id]?.unitPrice ? '#dc2626' : undefined,
                backgroundColor: fieldErrors[qi.id]?.unitPrice ? '#fef2f2' : undefined
              }}
              step="0.01"
              min="0"
            />
            {fieldErrors[qi.id]?.unitPrice && (
              <div style={styles.fieldErrorSmall}>⚠ {fieldErrors[qi.id].unitPrice}</div>
            )}
          </div>
        ) : Number(qi.unitPrice || 0).toFixed(2)}
      </td>

      <td style={styles.tableCellRightBold}>
        {(Number(qi.quantity || 0) * Number(qi.unitPrice || 0)).toFixed(2)}
      </td>

      {isEditing && (
        <td style={styles.tableCellCenter}>
          <button onClick={() => onRemoveItem(qi.id)} style={styles.deleteItemBtn}>
            <Trash2 size={15} />
          </button>
        </td>
      )}
    </tr>
  );

  // ── Main Render ───────────────────────────────────────────
  return (
    <div className="quotation-content" style={styles.container}>
      {/* Header Image */}
      <div style={styles.headerImageContainer}>
        <img src={headerImage} alt="Company Header" style={styles.headerImage} />
      </div>

      {/* Title Row */}
      <div style={styles.titleRow}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={styles.quotationTitle}>QUOTATION</h1>
          <p style={styles.quotationNumber}>{quotationNumber || '—'}</p>
        </div>
        <div style={{ textAlign: 'right', minWidth: '160px' }}>
          <p style={styles.validUntilLabel}>VALID UNTIL</p>
          {isEditing ? (
            <div>
              <input
                type="date"
                className={`edit-input${headerErrors.expiryDate ? ' field-error-input' : ''}`}
                value={quotationData.expiryDate || ''}
                min={quotationData.date || ''}
                onChange={(e) => handleFieldChange('expiryDate', e.target.value)}
                style={{
                  ...inputStyle,
                  textAlign: 'right',
                  fontWeight: '700',
                  fontSize: '1rem',
                  borderColor: headerErrors.expiryDate ? '#dc2626' : undefined,
                  backgroundColor: headerErrors.expiryDate ? '#fef2f2' : undefined
                }}
              />
              {headerErrors.expiryDate && (
                <div style={styles.fieldErrorRight}>⚠ {headerErrors.expiryDate}</div>
              )}
            </div>
          ) : (
            <p style={styles.expiryDate}>{fmtDate(quotationData.expiryDate)}</p>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div style={styles.detailsGrid}>
        {renderFieldGrid(LEFT_FIELDS)}
        {renderFieldGrid(RIGHT_FIELDS)}
      </div>

      {/* Items Table */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={styles.sectionTitle}>Items Detail</h3>
        <div style={{ overflowX: 'auto', borderRadius: '0.375rem' }}>
          <table style={styles.table}>
            <thead>
              <tr style={{ backgroundColor: '#000' }}>
                {tableHeaders.map(({ label, w, align }) => (
                  <th key={label} style={{ ...styles.tableHeader, width: w, textAlign: align }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotationItems.map(renderItemRow)}

              {/* Totals */}
              <tr style={styles.totalRow}>
                <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                <td style={styles.totalLabelCell}>Subtotal ({displayCurrency})</td>
                <td style={styles.totalValueCell}>{subtotal.toFixed(2)}</td>
                {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
              </tr>
              
              {/* Tax Row - Only show if customer is VAT registered and has tax options */}
              {showTaxSection && (
                <tr style={styles.totalRow}>
                  <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                  <td style={styles.totalLabelCell}>
                    VAT ({quotationData.tax || 0}%)
                  </td>
                  <td style={styles.totalValueCell}>{taxAmount.toFixed(2)}</td>
                  {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
                </tr>
              )}
              
              {discountAmount > 0 && (
                <tr style={styles.totalRow}>
                  <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                  <td style={{ ...styles.totalLabelCell, color: '#059669' }}>
                    Discount ({quotationData.discount}%)
                  </td>
                  <td style={{ ...styles.totalValueCell, color: '#059669' }}>
                    −{discountAmount.toFixed(2)}
                  </td>
                  {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
                </tr>
              )}
              <tr style={styles.grandTotalRow}>
                <td colSpan={isEditing ? 4 : 3} style={{ border: 'none' }} />
                <td style={styles.grandTotalLabel}>Grand Total ({displayCurrency})</td>
                <td style={styles.grandTotalValue}>{grandTotal.toFixed(2)}</td>
                {isEditing && <td style={{ border: 'none' }} />}
              </tr>
            </tbody>
          </table>
        </div>

        {isEditing && (
          <button onClick={onAddItem} style={styles.addItemBtn}>
            <Plus size={16} /> Add More Items
          </button>
        )}
      </div>

      {/* Amount in Words */}
      <div style={styles.amountWordsContainer}>
        <strong>Amount in words: </strong>
        <span style={{ fontWeight: '500', color: '#374151' }}>{amountInWords}</span>
      </div>

      {/* Tax & Discount (Edit Mode) */}
      {isEditing && showTaxSection && (
        <div className="no-print" style={styles.taxSection}>
          <h4 style={styles.taxSectionTitle}>Tax & Discount</h4>
          <div style={styles.taxGrid}>
            <div>
              <label style={styles.inputLabel}>VAT (%)</label>
              <select
                onChange={handleTaxChange}
                value={quotationData.tax?.toString() ?? defaultTaxValue}
                style={{ ...inputStyle, marginBottom: '0.5rem' }}
              >
                {taxPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              {headerErrors.tax && (
                <div style={styles.fieldError}>⚠ {headerErrors.tax}</div>
              )}
            </div>

            <div>
              <label style={styles.inputLabel}>Discount (%)</label>
              <ValidatedInput
                type="number"
                value={quotationData.discount}
                onChange={(val) => onDataChange('discount', val === '' ? 0 : parseFloat(val) || 0)}
                validator={validatePercentage}
                placeholder="0"
                style={{
                  ...inputStyle,
                  borderColor: headerErrors.discount ? '#dc2626' : undefined,
                  backgroundColor: headerErrors.discount ? '#fef2f2' : undefined
                }}
                min="0" max="100" step="0.01"
              />
              {headerErrors.discount && (
                <div style={styles.fieldError}>⚠ {headerErrors.discount}</div>
              )}
            </div>
          </div>
        </div>
      )}

     {/* Terms & Conditions */}
<div style={{ marginBottom: '2rem' }}>
  <h3 style={styles.sectionTitle}>Terms & Conditions</h3>
  {isEditing ? (
    <TermsEditor sections={tcSections} onChange={onTcChange} />
  ) : (
    <TermsViewer sections={tcSections} />
  )}
</div>

      {/* Document Upload Section */}
      <DocumentUploadSection
        documents={documents}
        onUpload={onDocumentUpload}
        onDelete={onDocumentDelete}
        onDownload={onDocumentDownload}
        onPreview={onDocumentPreview}
        loading={documentLoading}
        isEditing={isEditing}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
      />

      {/* Signature Footer */}
      <div style={styles.signatureFooter}>
        <p style={{ margin: 0, fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>Sincerely,</p>
        <p style={{ margin: '2.5rem 0 0', fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>
          {companyName}
        </p>
      </div>

      {/* Action Bar */}
      {actionBar && (
        <div className="no-print" style={styles.actionBar}>
          {actionBar}
        </div>
      )}

      {/* Snackbar */}
      {snackbar.show && (
        <Snackbar
          message={snackbar.message}
          type={snackbar.type}
          onClose={hideSnack}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
    padding: '2rem',
  },
  headerImageContainer: {
    width: '100%',
    height: '140px',
    marginBottom: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: '0.375rem',
    backgroundColor: '#f8fafc',
    border: '3px solid #000',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: '10px',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '3px solid #000',
    paddingBottom: '1.5rem',
    marginBottom: '2rem',
  },
  quotationTitle: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: '#000',
    margin: 0,
    letterSpacing: '1px',
  },
  quotationNumber: {
    color: '#6b7280',
    margin: '0.5rem 0 0',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  validUntilLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#6b7280',
    margin: '0 0 4px',
  },
  expiryDate: {
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#1f2937',
    margin: 0,
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2.5rem',
    marginBottom: '2.5rem',
    padding: '1.5rem',
    backgroundColor: '#f8fafc',
    borderRadius: '0.375rem',
    border: '1px solid #e2e8f0',
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: '130px 16px 1fr',
    rowGap: '0.65rem',
    alignItems: 'center',
  },
  fieldLabel: {
    fontWeight: 600,
    color: '#4b5563',
    fontSize: '0.875rem',
  },
  fieldColon: {
    color: '#6b7280',
  },
  fieldValue: {
    fontSize: '0.875rem',
    color: '#1f2937',
    fontWeight: 500,
  },
  fieldError: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginTop: '0.25rem',
    color: '#dc2626',
    fontSize: '0.7rem',
  },
  fieldErrorRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginTop: '0.25rem',
    color: '#dc2626',
    fontSize: '0.7rem',
    justifyContent: 'flex-end',
  },
  fieldErrorSmall: {
    color: '#dc2626',
    fontSize: '0.65rem',
    marginTop: '0.2rem',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    padding: '0.75rem',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: '700',
    border: '1px solid #000',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  tableCellCenter: {
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  tableCellDescription: {
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    verticalAlign: 'top',
  },
  tableCellRight: {
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    textAlign: 'right',
  },
  tableCellRightBold: {
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    textAlign: 'right',
    fontWeight: '600',
  },
  itemName: {
    fontWeight: '600',
    marginBottom: '0.2rem',
    fontSize: '0.9375rem',
  },
  itemDescription: {
    fontSize: '0.8125rem',
    color: '#6b7280',
    lineHeight: '1.4',
  },
  imageGrid: {
    marginTop: '0.75rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))',
    gap: '0.5rem',
  },
  imageContainer: {
    position: 'relative',
    width: '110px',
    height: '110px',
    borderRadius: '0.375rem',
    overflow: 'visible',
    border: '1px solid #d1d5db',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '0.375rem',
  },
  addImageBtn: {
    color: 'white',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  imageUploadLabel: {
    display: 'block',
    padding: '0.75rem',
    border: '2px dashed #d1d5db',
    borderRadius: '0.375rem',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    color: '#6b7280',
  },
  deleteItemBtn: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.4rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    backgroundColor: '#f8fafc',
    fontWeight: '600',
  },
  totalLabelCell: {
    textAlign: 'right',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    fontSize: '0.875rem',
  },
  totalValueCell: {
    textAlign: 'right',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    fontSize: '0.875rem',
  },
  grandTotalRow: {
    backgroundColor: '#000',
    color: 'white',
    fontWeight: '700',
  },
  grandTotalLabel: {
    textAlign: 'right',
    padding: '1rem 0.75rem',
    fontSize: '1.125rem',
    border: 'none',
  },
  grandTotalValue: {
    textAlign: 'right',
    padding: '1rem 0.75rem',
    fontSize: '1.125rem',
    border: 'none',
  },
  sarLabel: {
    marginLeft: '0.25rem',
    fontSize: '0.7rem',
    color: '#6b7280',
  },
  addItemBtn: {
    marginTop: '1rem',
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '0.6rem 1.25rem',
    borderRadius: '0.5rem',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  amountWordsContainer: {
    padding: '1.1rem 1.25rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '0.375rem',
    marginBottom: '2rem',
    fontSize: '0.9375rem',
    fontWeight: '600',
  },
  taxSection: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '2rem',
  },
  taxSectionTitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#1e40af',
  },
  taxGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.25rem',
  },
  presetDisplay: {
    padding: '0.5rem 0.6rem',
    backgroundColor: '#f3f4f6',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    color: '#374151',
    fontWeight: '600',
  },
  termsViewer: {
    display: 'flex',
    gap: '2.5rem',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: '1.25rem',
    borderRadius: '0.5rem',
    border: '1px solid #e5e7eb',
  },
  termsImageContainer: {
    border: '1px solid #e2e8f0',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    background: 'white',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
  },
  termsImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  termsImageCaption: {
    marginTop: '0.6rem',
    fontSize: '0.75rem',
    color: '#6b7280',
    textAlign: 'center',
  },
  signatureFooter: {
    marginTop: '3rem',
    paddingTop: '2rem',
    borderTop: '2px solid #e5e7eb',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '2rem',
    paddingTop: '2rem',
    borderTop: '1px solid #e5e7eb',
  },
  internalBadge: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginLeft: 'auto',
    backgroundColor: '#e2e8f0',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
  },
  uploadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    color: 'white',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    alignSelf: 'flex-start',
    border: 'none',
  },
  uploadHint: {
    fontSize: '0.75rem',
    color: '#6b7280',
    margin: '0',
  },
  fileListTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  fileRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.5rem',
    padding: '0.5rem',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    border: '1px solid #e5e7eb',
  },
  fileName: {
    fontSize: '0.8rem',
    color: '#4b5563',
    minWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileDescriptionInput: {
    flex: 1,
    padding: '0.3rem 0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
  },
  removeFileBtn: {
    padding: '0.25rem',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#ef4444',
  },
  uploadConfirmBtn: {
    marginTop: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  loadingText: {
    padding: '1rem',
    textAlign: 'center',
    color: '#6b7280',
  },
  documentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    border: '1px solid #e5e7eb',
  },
  documentName: {
    fontWeight: '500',
    fontSize: '0.875rem',
    color: '#1f2937',
  },
  documentSize: {
    fontSize: '0.7rem',
    color: '#6b7280',
  },
  documentDescription: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginTop: '0.2rem',
  },
  documentDate: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    marginTop: '0.2rem',
  },
  previewBtn: {
    padding: '0.35rem',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtn: {
    padding: '0.35rem',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    padding: '0.35rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDocuments: {
    padding: '1rem',
    textAlign: 'center',
    color: '#9ca3b8',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    border: '1px dashed #e2e8f0',
  },
};