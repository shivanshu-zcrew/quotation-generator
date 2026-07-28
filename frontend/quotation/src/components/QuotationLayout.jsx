import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, Upload, FileText, Download, Search, AlertCircle, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import headerImage from '../assets/header.png';
import TermsEditor, { TermsViewer } from './TermsCondition';
import TermsTemplateControls from './TermsTemplateControls';
import PaymentTermPicker from './PaymentTermPicker';
import { CommentableText, CommentBadge } from './ReviewComments';
import ValidatedInput from './ValidatedInput';
import Snackbar from './Snackbar';
import PhoneInput from './PhoneInput';
import { useCompanyCurrency } from './CompanyCurrencySelector';
import MobileQuotationLayout from './MobileQuotationLayout';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { fmtDate } from '../utils/formatters';
import { useAppStore } from '../services/store';
import { validatePhoneNumber } from '../utils/quotationUtils';

// ============================================================
// CONSTANTS
// ============================================================
const DOCUMENT_CONFIG = {
  MAX_SIZE_MB: 10,
  MAX_FILES: 5,
  ALLOWED_TYPES: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
};

const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

// This company's Zoho org has 0% and 15% (Saudi VAT) tax IDs configured on
// the backend (see TAX_IDS in quotationController.js's awardQuotation) — no
// 5%. Every other company's Zoho org has 0%/5% (UAE VAT) only, no 15%.
// Offering a rate with no matching tax ID would 422 at award time (caught
// by the TAX_RATE_NOT_CONFIGURED guard) instead of a confusing raw Zoho
// error — but it's better not to offer it as a selectable option at all.
const FIFTEEN_PERCENT_ZOHO_ORG_ID = '932531766';

// In QuotationLayout.jsx - Update the LEFT_FIELDS and RIGHT_FIELDS arrays

const LEFT_FIELDS = [
  { label: 'Project Name', field: 'projectName', type: 'text', required: true },
  { label: 'Scope of Work', field: 'scopeOfWork', type: 'textarea', required: false },
  { label: 'Company Name', field: 'customer', type: 'text', required: true },  // Client's company name
  { label: 'Name', field: 'customerName', type: 'text', required: false },  // Manually entered contact person
  { label: 'Phone', field: 'customerPhone', type: 'text', required: true },  // Contact phone
  { label: 'Email', field: 'customerEmail', type: 'email', required: true },  // Contact email
  { label: 'Designation', field: 'customerDesignation', type: 'text', required: false },
  { label: 'Trade License Number', field: 'customerTradeLicenseNumber', type: 'text', required: false },
  { label: 'Tax Registration Number', field: 'customerTaxRegistrationNumber', type: 'text', required: false },
];

const RIGHT_FIELDS = [
  { label: 'Company Name', field: 'companyName', type: 'text', required: false },  // Our own selected company
  { label: 'Name', field: 'ourFocalPoint', type: 'text', required: true },  // Focal point name
  { label: 'Phone', field: 'ourContact', type: 'text', required: false },  // Changed from companyPhone to ourContact
  { label: 'Email', field: 'salesManagerEmail', type: 'email', required: false },  // Changed from companyEmail to salesManagerEmail
  { label: 'Designation', field: 'ourFocalPointDesignation', type: 'text', required: false },
  { label: 'Trade License Number', field: 'companyTradeLicense', type: 'text', required: false },
  { label: 'Tax Registration Number', field: 'companyTaxRegistration', type: 'text', required: false },
  { label: 'Date', field: 'date', type: 'date', required: true },
  { label: 'Expiry Date', field: 'expiryDate', type: 'date', required: true },
  { label: 'Payment Terms', field: 'paymentTerms', type: 'text', required: false },
];
// ============================================================
// STYLES
// ============================================================
export const inputStyle = {
  width: '100%',
  border: '1px solid #d1d5db',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  backgroundColor: 'white',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  transition: 'all 0.2s',
};

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    padding: '2rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  headerImageContainer: {
    width: '100%',
    height: '140px',
    marginBottom: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: '0.5rem',
    backgroundColor: '#f8fafc',
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
    borderRadius: '0.5rem',
    border: '1px solid #e2e8f0',
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: '140px 16px 1fr',
    rowGap: '0.75rem',
    alignItems: 'start',
  },
  fieldLabel: {
    fontWeight: 600,
    color: '#4b5563',
    fontSize: '0.875rem',
    paddingTop: '0.5rem',
  },
  fieldColon: {
    color: '#6b7280',
    paddingTop: '0.5rem',
  },
  fieldValue: {
    fontSize: '0.875rem',
    color: '#1f2937',
    fontWeight: 500,
    paddingTop: '0.5rem',
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
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  imageContainer: {
    position: 'relative',
    width: '120px',
    height: '120px',
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
    padding: '0.4rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    backgroundColor: '#f8fafc',
  },
  totalLabelCell: {
    textAlign: 'right',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  totalValueCell: {
    textAlign: 'right',
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    fontSize: '0.875rem',
    fontWeight: '700',
  },
  grandTotalRow: {
    backgroundColor: '#f0fdf4',
  },
  grandTotalLabel: {
    textAlign: 'right',
    padding: '1rem 0.75rem',
    fontSize: '1rem',
    fontWeight: '700',
    border: 'none',
  },
  grandTotalValue: {
    textAlign: 'right',
    padding: '1rem 0.75rem',
    fontSize: '1.125rem',
    fontWeight: '800',
    color: '#059669',
    border: 'none',
  },
  addItemBtn: {
    marginTop: '1rem',
    backgroundColor: '#3b82f6',
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
    padding: '1rem 1.25rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '0.5rem',
    marginBottom: '2rem',
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  taxSection: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '2rem',
  },
  taxSectionTitle: {
    margin: '0 0 0.75rem',
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#0369a1',
  },
  taxGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.25rem',
  },
  signatureFooter: {
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '2px solid #e5e7eb',
    textAlign: 'right',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #e5e7eb',
  },
  internalBadge: {
    fontSize: '0.7rem',
    color: '#6b7280',
    marginLeft: 'auto',
    backgroundColor: '#e2e8f0',
    padding: '0.2rem 0.6rem',
    borderRadius: '999px',
  },
  uploadButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 1.25rem',
    color: 'white',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    alignSelf: 'flex-start',
    border: 'none',
    cursor: 'pointer',
  },
  uploadHint: {
    fontSize: '0.7rem',
    color: '#6b7280',
    margin: '0',
  },
  fileListTitle: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  fieldLabelRequired: {
    fontWeight: 600,
    color: '#dc2626',
    fontSize: '0.875rem',
    paddingTop: '0.5rem',
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
    fontSize: '0.75rem',
    color: '#4b5563',
    flex: 1,
  },
  fileDescriptionInput: {
    flex: 1,
    padding: '0.3rem 0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
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
    padding: '0.4rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
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
    gap: '0.75rem',
    padding: '0.75rem',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    border: '1px solid #e5e7eb',
  },
  documentName: {
    fontWeight: '500',
    fontSize: '0.8rem',
    color: '#1f2937',
  },
  documentSize: {
    fontSize: '0.65rem',
    color: '#6b7280',
  },
  documentDescription: {
    fontSize: '0.7rem',
    color: '#6b7280',
    marginTop: '0.2rem',
  },
  documentDate: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    marginTop: '0.2rem',
  },
  previewBtn: {
    padding: '0.3rem',
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
    padding: '0.3rem',
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
    padding: '0.3rem',
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
    color: '#9ca3af',
    backgroundColor: 'white',
    borderRadius: '0.375rem',
    border: '1px dashed #e2e8f0',
  },
  termsViewer: {
    display: 'flex',
    gap: '2rem',
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
    marginTop: '0.5rem',
    fontSize: '0.7rem',
    color: '#6b7280',
    textAlign: 'center',
  },
};

// ============================================================
// DOCUMENT UPLOAD SECTION
// ============================================================
// ============================================================
// DOCUMENT UPLOAD SECTION (FIXED)
// ============================================================
function DocumentUploadSection({ documents = [], onUpload, onDelete, onDownload, onPreview, loading = false, isEditing = false, formatFileSize, getFileIcon }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docDescriptions, setDocDescriptions] = useState({});
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null); // Add error state

  // Helper: detect zip by MIME or extension
  const isZipFile = useCallback((file) => {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return name.endsWith('.zip')
      || type === 'application/zip'
      || type === 'application/x-zip-compressed'
      || type === 'multipart/x-zip';
  }, []);

  // Show error message (replaces alert)
  const showError = useCallback((message) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(null), 3000);
  }, []);

  const validateFile = useCallback((file) => {
    if (isZipFile(file)) {
      showError(`ZIP files are not allowed for internal documents.`);
      return false;
    }
    if (file.size > DOCUMENT_CONFIG.MAX_SIZE_MB * 1024 * 1024) {
      showError(`File "${file.name}" exceeds ${DOCUMENT_CONFIG.MAX_SIZE_MB}MB limit`);
      return false;
    }
    if (!DOCUMENT_CONFIG.ALLOWED_TYPES.includes(file.type)) {
      showError(`File "${file.name}" type is not allowed`);
      return false;
    }
    return true;
  }, [isZipFile, showError]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    e.target.value = ''; // allow re-selecting the same file after a removal
    
    // Filter valid files first
    const validFiles = files.filter(validateFile);
    if (!validFiles.length) return;

    setSelectedFiles(prev => {
      // Cap total selected + already-saved documents at MAX_FILES
      const currentTotal = prev.length + documents.length;
      const slots = DOCUMENT_CONFIG.MAX_FILES - currentTotal;
      
      if (slots <= 0) {
        showError(`Maximum ${DOCUMENT_CONFIG.MAX_FILES} internal documents allowed. You already have ${currentTotal}.`);
        return prev;
      }
      
      if (validFiles.length > slots) {
        showError(`Only ${slots} more document(s) allowed — adding the first ${slots}.`);
      }
      
      const filesToAdd = validFiles.slice(0, slots);
      return [...prev, ...filesToAdd];
    });
  }, [validateFile, documents.length, showError]);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0 || !onUpload) return;
    
    // Check again before upload to prevent race conditions
    const currentTotal = selectedFiles.length + documents.length;
    if (currentTotal > DOCUMENT_CONFIG.MAX_FILES) {
      showError(`Maximum ${DOCUMENT_CONFIG.MAX_FILES} documents allowed.`);
      return;
    }
    
    setUploading(true);
    try {
      const descriptions = selectedFiles.map(file => docDescriptions[file.name] || '');
      await onUpload(selectedFiles, descriptions);
      setSelectedFiles([]);
      setDocDescriptions({});
    } catch (error) {
      showError('Failed to upload documents');
    } finally {
      setUploading(false);
    }
  }, [selectedFiles, docDescriptions, onUpload, documents.length, showError]);

  return (
    <div style={{ marginBottom: '2rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
      {/* Error Snackbar */}
      {errorMessage && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: '#ef4444',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          animation: 'slideIn 0.3s ease'
        }}>
          {errorMessage}
        </div>
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <FileText size={20} color="#4b5563" />
        <h3 style={styles.sectionTitle}>Internal Documents</h3>
        <span style={styles.internalBadge}>For internal team only</span>
        <span style={{
          fontSize: '0.7rem',
          color: '#6b7280',
          backgroundColor: '#f3f4f6',
          padding: '0.2rem 0.6rem',
          borderRadius: '999px'
        }}>
          {documents.length + selectedFiles.length} / {DOCUMENT_CONFIG.MAX_FILES}
        </span>
      </div>

      {isEditing && (
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="internal-doc-upload"
            disabled={documents.length + selectedFiles.length >= DOCUMENT_CONFIG.MAX_FILES}
          />
          <label 
            htmlFor="internal-doc-upload" 
            style={{ 
              ...styles.uploadButton, 
              backgroundColor: uploading || (documents.length + selectedFiles.length >= DOCUMENT_CONFIG.MAX_FILES) ? '#9ca3af' : '#4f46e5', 
              cursor: uploading || (documents.length + selectedFiles.length >= DOCUMENT_CONFIG.MAX_FILES) ? 'not-allowed' : 'pointer',
              opacity: documents.length + selectedFiles.length >= DOCUMENT_CONFIG.MAX_FILES ? 0.6 : 1
            }}
          >
            <Upload size={16} /> 
            {uploading ? 'Uploading...' : documents.length + selectedFiles.length >= DOCUMENT_CONFIG.MAX_FILES ? 'Maximum Reached' : 'Select Documents'}
          </label>
          <p style={styles.uploadHint}>
            Supports PDF, DOC, XLS, Images, TXT (Max {DOCUMENT_CONFIG.MAX_FILES} files, {DOCUMENT_CONFIG.MAX_SIZE_MB}MB each). ZIP files are not allowed.
          </p>

          {selectedFiles.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={styles.fileListTitle}>Files ready to upload ({selectedFiles.length}):</h4>
              {selectedFiles.map((file, index) => (
                <div key={index} style={styles.fileRow}>
                  <FileText size={16} color="#6b7280" />
                  <span style={styles.fileName}>{file.name}</span>
                  <input 
                    type="text" 
                    placeholder="Description (optional)" 
                    value={docDescriptions[file.name] || ''}
                    onChange={(e) => setDocDescriptions(prev => ({ ...prev, [file.name]: e.target.value }))}
                    style={styles.fileDescriptionInput} 
                  />
                  <button 
                    onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))} 
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

      {/* Rest of your document list rendering remains the same */}
      {loading ? (
        <div style={styles.loadingText}>Loading documents...</div>
      ) : documents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {documents.map((doc) => {
             const docId = doc._id || doc.id;
            return (
              <div key={docId} style={styles.documentCard}>
              <span style={{ fontSize: '1.2rem' }}>{getFileIcon?.(doc.fileType) || '📎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={styles.documentName}>{doc.fileName}</span>
                  <span style={styles.documentSize}>{formatFileSize?.(doc.fileSize) || `${(doc.fileSize / 1024).toFixed(2)} KB`}</span>
                </div>
                {doc.description && <div style={styles.documentDescription}>{doc.description}</div>}
                <div style={styles.documentDate}>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
  {!isEditing && (
    <>
      {doc.fileType?.startsWith('image/') ? (
        <button onClick={() => onPreview?.(docId)} style={styles.previewBtn}>👁️</button>
      ) : (
        <button onClick={() => onDownload?.(docId)} style={styles.downloadBtn}><Download size={14} /></button>
      )}
    </>
  )}
  {isEditing && <button onClick={() => onDelete?.(docId)} style={styles.deleteBtn}><Trash2 size={14} /></button>}
</div>
            </div>
            )
})}
        </div>
      ) : (
        <div style={styles.emptyDocuments}>
          <FileText size={24} color="#d1d5db" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontSize: '0.875rem' }}>No internal documents</p>
          {isEditing && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Upload documents for internal team reference</p>}
        </div>
      )}
      
      {/* Add animation styles */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// CUSTOM HOOKS
// ============================================================
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

const TABLE_HEADERS = (isEditing, currency) => [
  { label: 'SR#', w: '50px', align: 'center' },
  { label: 'Item Description', w: 'auto', align: 'left' },
  { label: 'Qty', w: '80px', align: 'center' },
  { label: 'Unit', w: '80px', align: 'center' },
  { label: 'Unit Price', w: '110px', align: 'right' },
  { label: `Amount (${currency})`, w: '120px', align: 'right' },
  ...(isEditing ? [{ label: '', w: '50px', align: 'center' }] : []),
];

// ============================================================
// MAIN COMPONENT
// ============================================================
// Add these state variables with the other state declarations (around line 440-450)
export default function QuotationLayout({
  isEditing, quotationNumber, quotationData, onDataChange,
  quotationItems = [], onUpdateItem, onAddItem, onRemoveItem,
  onAddImages, onRemoveExistingImage, onRemoveNewImage, editingImgId, onToggleImgEdit,
  newImages = {}, subtotal = 0, taxAmount = 0, discountAmount = 0, grandTotal = 0,
  amountInWords = '', tcSections, onTcChange, actionBar, headerErrors = {},
  fieldErrors = {}, setHeaderErrors, documents = [], onDocumentUpload, onDocumentDelete,
  onDocumentDownload, onDocumentPreview, documentLoading = false, formatFileSize, getFileIcon,
  companyName, companyZohoOrgId = '', customerTaxTreatment = 'non_vat_registered', customerPlaceOfSupply = 'Dubai',
  customerContactPersons = [],
  termsImages = [], onTermsImagesUpload, onRemoveTermsImage,
  termsTemplates = [], selectedTermsTemplateId = '', onSelectTermsTemplate, onSaveTermsTemplateClick, onDeleteTermsTemplate, isTemplateActionsDisabled = false,
  paymentTermOptions = [], selectedPaymentTermId = '', onSelectPaymentTerm, onDeletePaymentTerm,
  companyPhone = '', companyEmail = '', companyTradeLicense = '', companyTaxRegistration = '',
  commentsByTarget = {}, canAddComments = false, canManageComments = false, canDeleteComment,
  onAddComment, onEditComment, onResolveComment, onDeleteComment,
  // Whole-line-item comments staged during an active reject/return review —
  // separate from the highlight-a-text-range comments above, which persist
  // immediately. These are held in the parent (ViewQuotationScreen) as local
  // state until the reject/return is confirmed, so a Cancel there discards
  // them with no backend cleanup needed.
  lineCommentMode = false, pendingLineComments = [],
  onAddPendingLineComment, onEditPendingLineComment, onRemovePendingLineComment,
}) {
  const { selectedCurrency } = useCompanyCurrency();
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });

  // Review-comment props shared by CommentableText/CommentBadge instances,
  // keyed by target so callers just spread `commentsFor('item', qi.id)`.
  // For item targets while a reject/return review is active (lineCommentMode),
  // new comments are staged locally instead of posted immediately — same
  // select-text-to-comment interaction as everywhere else on the page, but
  // routed through the pending-comment props so Cancel can discard them with
  // nothing to clean up server-side (see ViewQuotationScreen).
  const commentsFor = (targetType, targetKey) => {
    const savedComments = commentsByTarget[`${targetType}:${targetKey}`] || [];
    if (targetType !== 'item' || !lineCommentMode) {
      return {
        targetType,
        targetKey: String(targetKey),
        comments: savedComments,
        canAdd: canAddComments,
        onAdd: onAddComment,
        onEdit: onEditComment,
        canManage: canManageComments,
        onResolve: onResolveComment,
        canDeleteComment,
        onDelete: onDeleteComment,
      };
    }

    const key = String(targetKey);
    const staged = pendingLineComments
      .filter((c) => c.itemId === key)
      .map((c) => ({
        _id: c.tempId,
        quote: c.quote,
        prefix: c.prefix,
        suffix: c.suffix,
        comment: c.comment,
        createdAt: c.createdAt,
        createdBySnapshot: c.createdBySnapshot,
        resolved: false,
        pending: true,
      }));

    return {
      targetType,
      targetKey: key,
      comments: [...savedComments, ...staged],
      canAdd: canAddComments,
      onAdd: ({ quote, prefix, suffix, comment }) => {
        onAddPendingLineComment?.(key, quote, prefix, suffix, comment);
        return { success: true };
      },
      onEdit: (id, newText) => {
        const isStaged = pendingLineComments.some((c) => c.tempId === id);
        if (isStaged) return onEditPendingLineComment?.(id, newText);
        return onEditComment(id, newText);
      },
      canManage: canManageComments,
      onResolve: onResolveComment,
      canDeleteComment: (c) => (c.pending ? true : canDeleteComment(c)),
      onDelete: (id) => {
        const isStaged = pendingLineComments.some((c) => c.tempId === id);
        if (isStaged) return onRemovePendingLineComment?.(id);
        return onDeleteComment(id);
      },
    };
  };
  
  // ✅ Store original company values in state (these never change during edit)
  const [originalCompanyTradeLicense, setOriginalCompanyTradeLicense] = useState(companyTradeLicense);
  const [originalCompanyTaxRegistration, setOriginalCompanyTaxRegistration] = useState(companyTaxRegistration);
  
  // ✅ Store original customer values in state (these never change during edit)
  const [originalCustomerTradeLicense, setOriginalCustomerTradeLicense] = useState(quotationData.customerTradeLicenseNumber);
  const [originalCustomerTaxRegistration, setOriginalCustomerTaxRegistration] = useState(quotationData.customerTaxRegistrationNumber);
  
  // ✅ Update original values only when entering edit mode or when props change significantly
  useEffect(() => {
    if (!isEditing) {
      // Update company original values
      setOriginalCompanyTradeLicense(companyTradeLicense);
      setOriginalCompanyTaxRegistration(companyTaxRegistration);
      // Update customer original values
      setOriginalCustomerTradeLicense(quotationData.customerTradeLicenseNumber);
      setOriginalCustomerTaxRegistration(quotationData.customerTaxRegistrationNumber);
    }
  }, [isEditing, companyTradeLicense, companyTaxRegistration, quotationData.customerTradeLicenseNumber, quotationData.customerTaxRegistrationNumber]);
  
  const displayCurrency = useMemo(() => {
    if (!isEditing || quotationData.currency?.code) return quotationData.currency?.code || 'AED';
    if (quotationData.currency?.code) return quotationData.currency.code;
    return selectedCurrency || 'AED';
  }, [isEditing, quotationData.currency, selectedCurrency]);

  const isPlaceOfSupplyUAE = useMemo(() => UAE_EMIRATES.includes(customerPlaceOfSupply), [customerPlaceOfSupply]);
  const isPlaceOfSupplyGCC = useMemo(() => GCC_COUNTRIES.includes(customerPlaceOfSupply), [customerPlaceOfSupply]);
  // The Saudi-registered company's "home" jurisdiction is Saudi Arabia, not
  // the UAE — so its domestic sales (eligible for the 0%/15% Saudi VAT
  // presets) are the ones placed in Saudi Arabia, while UAE companies' are
  // the ones placed in a UAE emirate. Without this split, a Saudi company's
  // sale to a Saudi customer was being treated as an export (falling into
  // the GCC zero-rated branch below) instead of domestic.
  const isSaudiCompany = companyZohoOrgId === FIFTEEN_PERCENT_ZOHO_ORG_ID;
  const isPlaceOfSupplySA = useMemo(() => customerPlaceOfSupply === 'Saudi Arabia', [customerPlaceOfSupply]);

  const getTaxPresets = useCallback(() => {
    const domesticPresets = isSaudiCompany
      ? [{ value: "0", label: "0%" }, { value: "15", label: "15%" }]
      : [{ value: "0", label: "0%" }, { value: "5", label: "5%" }];
    const isDomestic = isSaudiCompany ? isPlaceOfSupplySA : isPlaceOfSupplyUAE;

    if (customerTaxTreatment === 'non_vat_registered' || customerTaxTreatment === 'gcc_non_vat_registered') return [];
    if (customerTaxTreatment === 'vat_registered') {
      if (isDomestic) return domesticPresets;
      if (isPlaceOfSupplyUAE || isPlaceOfSupplyGCC) return [{ value: "0", label: "0% (Export - Zero-rated)" }];
    }
    if (customerTaxTreatment === 'gcc_vat_registered') {
      if (isDomestic) return domesticPresets;
      if (isPlaceOfSupplyUAE || isPlaceOfSupplyGCC) return [{ value: "0", label: "0% (GCC Domestic)" }];
    }
    return [];
  }, [customerTaxTreatment, isPlaceOfSupplyUAE, isPlaceOfSupplyGCC, isPlaceOfSupplySA, isSaudiCompany]);

  const taxPresets = getTaxPresets();

  const hasSavedTax = (Number(quotationData.tax) || 0) > 0 || (Number(taxAmount) || 0) > 0;
  const hasSavedDiscount = (Number(quotationData.discount) || 0) > 0 || (Number(discountAmount) || 0) > 0;
 
  const showTaxSection = taxPresets.length > 0 || hasSavedTax || hasSavedDiscount;
  const showTaxRow = showTaxSection || hasSavedTax;

  const defaultTaxValue = useMemo(() => {
    if (taxPresets.length === 0) {
      return (quotationData.tax != null ? String(quotationData.tax) : "0");
    }
    const fivePercent = taxPresets.find(p => p.value === "5");
    return fivePercent ? "5" : taxPresets[0].value;
  }, [taxPresets, quotationData.tax]);

  // If the customer (and therefore customerTaxTreatment/place of supply)
  // changes on an in-progress quotation — e.g. duplicating a quotation then
  // switching to a different customer — the previously selected tax value
  // can become invalid for the new set of presets. A native <select> with a
  // value that matches none of its <option>s silently falls back to
  // whichever option exists without firing onChange, so the stale tax would
  // otherwise never get corrected and the totals would keep using it. Snap
  // it back to a valid value whenever the presets no longer contain it.
  useEffect(() => {
    if (!isEditing) return;
    const currentTax = quotationData.tax != null ? String(quotationData.tax) : null;
    if (taxPresets.length === 0) {
      if (currentTax && currentTax !== '0') onDataChange('tax', 0);
      return;
    }
    if (!taxPresets.some(p => p.value === currentTax)) {
      onDataChange('tax', Number(defaultTaxValue));
    }
  }, [isEditing, taxPresets, quotationData.tax, defaultTaxValue, onDataChange]);

  // ✅ This function determines if a field should be read-only
  const isFieldReadOnly = useCallback((field) => {
    const isDateField = field === 'date' || field === 'expiryDate';
    const isCustomerField = field === 'customer';
    const isCompanyNameField = field === 'companyName';
    const isCompanyTradeTaxField = field === 'companyTradeLicense' || field === 'companyTaxRegistration';
    const isCustomerTradeTaxField = field === 'customerTradeLicenseNumber' || field === 'customerTaxRegistrationNumber';

    if (isDateField || isCustomerField || isCompanyNameField) return true;
    
    // ✅ For company fields: check ORIGINAL database value
    if (isCompanyTradeTaxField) {
      if (field === 'companyTradeLicense' && originalCompanyTradeLicense && originalCompanyTradeLicense.trim() !== '') {
        return true; // Company has TL in DB → read-only
      }
      if (field === 'companyTaxRegistration' && originalCompanyTaxRegistration && originalCompanyTaxRegistration.trim() !== '') {
        return true; // Company has TRN in DB → read-only
      }
    }
    
    // ✅ For customer fields: check ORIGINAL database value
    if (isCustomerTradeTaxField) {
      if (field === 'customerTradeLicenseNumber' && originalCustomerTradeLicense && originalCustomerTradeLicense.trim() !== '') {
        return true; // Customer has TL in DB → read-only
      }
      if (field === 'customerTaxRegistrationNumber' && originalCustomerTaxRegistration && originalCustomerTaxRegistration.trim() !== '') {
        return true; // Customer has TRN in DB → read-only
      }
    }
    
    return false;
  }, [originalCompanyTradeLicense, originalCompanyTaxRegistration, originalCustomerTradeLicense, originalCustomerTaxRegistration]);

  const renderFieldGrid = (fields) => (
    <div style={styles.fieldGrid}>
      {fields.map(({ label, field, type, required }) => {
        let fieldValue = quotationData[field];
        let errorMessage = headerErrors[field];
        
        // Special handling for specific fields
        if (field === 'companyName') {
          fieldValue = companyName;
        }
        if (field === 'companyTradeLicense') {
          fieldValue = quotationData.tl !== undefined ? quotationData.tl : companyTradeLicense;
        }
        if (field === 'companyTaxRegistration') {
          fieldValue = quotationData.trn !== undefined ? quotationData.trn : companyTaxRegistration;
        }
        if (field === 'ourContact') {
          fieldValue = quotationData.ourContact || companyPhone;
        }
        if (field === 'salesManagerEmail') {
          fieldValue = quotationData.salesManagerEmail || companyEmail;
        }
        
        const readOnly = isFieldReadOnly(field);
        const isCustomerPhoneField = field === 'customerPhone';
        const isPhoneField = field === 'ourContact' || field === 'companyPhone';
        const isContactNameField = field === 'customerName';
        const isPaymentTermsField = field === 'paymentTerms';

        const handlePhoneChange = (e) => {
          const value = e.target.value;
          let cleanedValue = value.replace(/[a-zA-Z]/g, '');
          const validation = validatePhoneNumber(cleanedValue);
          if (!validation.isValid && cleanedValue) {
            setSnackbar({ show: true, message: validation.error, type: 'error' });
            setTimeout(() => setSnackbar(prev => ({ ...prev, show: false })), 3000);
          }
          handleFieldChange(field, cleanedValue);
        };

        const handleContactPersonSelect = (contact) => {
          if (!contact) return;
          handleFieldChange('customerName', `${contact.firstName || ''} ${contact.lastName || ''}`.trim());
          if (contact.email) handleFieldChange('customerEmail', contact.email);
          const matchedPhone = contact.workPhone || contact.mobile;
          if (matchedPhone) handleFieldChange('customerPhone', matchedPhone);
        };

        const fieldCommentProps = commentsFor('header', field);

        return (
          <React.Fragment key={field}>
            <span style={required ? styles.fieldLabelRequired : styles.fieldLabel}>
              {label}{required && ' *'}
            </span>
            <span style={styles.fieldColon}>:</span>
            {isEditing && !readOnly ? (
              <div style={{ width: '100%' }}>
                {type === 'textarea' ? (
                  <textarea
                    value={fieldValue || ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      borderColor: errorMessage ? '#dc2626' : undefined,
                      backgroundColor: errorMessage ? '#fef2f2' : undefined
                    }}
                  />
                ) : isCustomerPhoneField ? (
                  <PhoneInput
                    value={fieldValue || ''}
                    onChange={(newValue) => handleFieldChange(field, newValue)}
                    placeholder="50 123 4567"
                    isMobile={false}
                  />
                ) : isPhoneField ? (
                  <input
                    type="tel"
                    className="edit-input"
                    value={fieldValue || ''}
                    onChange={handlePhoneChange}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
                        e.preventDefault();
                        setSnackbar({ show: true, message: 'Phone number cannot contain letters', type: 'error' });
                        setTimeout(() => setSnackbar(prev => ({ ...prev, show: false })), 3000);
                      }
                    }}
                    placeholder="e.g., +971 50 123 4567"
                    style={{
                      ...inputStyle,
                      borderColor: errorMessage ? '#dc2626' : undefined,
                      backgroundColor: errorMessage ? '#fef2f2' : undefined
                    }}
                  />
                ) : isContactNameField ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {/* The primary contact represents the customer's own company-level
                        identity (name/email/phone), not a real individual point of
                        contact for a specific quotation — exclude it here so only the
                        actual named contacts are pickable. */}
                    {customerContactPersons.filter(cp => cp.firstName?.trim() && !cp.isPrimaryContact).length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const selectedIdx = e.target.value;
                          if (selectedIdx === '') return;
                          handleContactPersonSelect(customerContactPersons[Number(selectedIdx)]);
                        }}
                        style={{ ...inputStyle, color: '#6b7280' }}
                      >
                        <option value="">+ Add contact manually, or pick existing below</option>
                        {customerContactPersons
                          .map((cp, idx) => ({ cp, idx }))
                          .filter(({ cp }) => cp.firstName?.trim() && !cp.isPrimaryContact)
                          .map(({ cp, idx }) => (
                            <option key={cp._id || idx} value={idx}>
                              {cp.firstName} {cp.lastName || ''}
                            </option>
                          ))}
                      </select>
                    )}
                    <input
                      type="text"
                      className="edit-input"
                      value={fieldValue || ''}
                      onChange={(e) => handleFieldChange('customerName', e.target.value)}
                      placeholder="Contact person name"
                      style={{
                        ...inputStyle,
                        borderColor: errorMessage ? '#dc2626' : undefined,
                        backgroundColor: errorMessage ? '#fef2f2' : undefined
                      }}
                    />
                  </div>
                ) : isPaymentTermsField ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {paymentTermOptions.length > 0 && (
                      <PaymentTermPicker
                        options={paymentTermOptions}
                        selectedId={selectedPaymentTermId}
                        onSelect={onSelectPaymentTerm}
                        onDelete={onDeletePaymentTerm}
                        inputStyle={inputStyle}
                      />
                    )}
                    <input
                      type="text"
                      className="edit-input"
                      value={fieldValue || ''}
                      onChange={(e) => handleFieldChange('paymentTerms', e.target.value)}
                      placeholder="e.g. 50% advance, 50% on delivery"
                      style={{
                        ...inputStyle,
                        borderColor: errorMessage ? '#dc2626' : undefined,
                        backgroundColor: errorMessage ? '#fef2f2' : undefined
                      }}
                    />
                  </div>
                ) : (
                  <input
                    type={type}
                    className="edit-input"
                    value={fieldValue || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      // ✅ Map company fields to the correct state fields (tl and trn)
                      if (field === 'companyTradeLicense') {
                        onDataChange('tl', newValue);
                      } else if (field === 'companyTaxRegistration') {
                        onDataChange('trn', newValue);
                      } else {
                        handleFieldChange(field, newValue);
                      }
                    }}
                    style={{
                      ...inputStyle,
                      borderColor: errorMessage ? '#dc2626' : undefined,
                      backgroundColor: errorMessage ? '#fef2f2' : undefined
                    }}
                  />
                )}
                {errorMessage && (
                  <div style={styles.fieldError}>
                    <AlertCircle size={12} /> {errorMessage}
                  </div>
                )}
                <CommentBadge {...fieldCommentProps} />
              </div>
            ) : (
              <CommentableText
                {...fieldCommentProps}
                text={type === 'date' ? (fieldValue ? fmtDate(fieldValue) : '') : String(fieldValue || '')}
                as="span"
                textStyle={styles.fieldValue}
                placeholder={<span style={styles.fieldValue}>N/A</span>}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
 
  const renderItemImages = (qi) => {
    const allImages = [...(qi.imagePaths || []), ...(qi.imageUrls || [])];
    if (!allImages.length) return null;
    return (
      <div style={styles.imageGrid}>
        {allImages.map((path, idx) => (
          <div key={`${qi.id}-${idx}`} style={styles.imageContainer}>
            <img src={path} alt={`item-img-${idx}`} style={styles.itemImage} />
            {isEditing && onRemoveExistingImage && (
              <button onClick={() => onRemoveExistingImage(qi.id, idx)} style={styles.removeImgBtnStyle}>×</button>
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
          <div key={`new-${idx}`} style={{ ...styles.imageContainer, borderColor: '#86efac', borderWidth: '2px' }}>
            <img src={src} alt={`new-img-${idx}`} style={styles.itemImage} />
            {isEditing && onRemoveNewImage && (
              <button onClick={() => onRemoveNewImage(qi.id, idx)} style={styles.removeImgBtnStyle}>×</button>
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
        style={{ ...styles.addImageBtn, backgroundColor: editingImgId === qi.id ? '#dc2626' : '#10b981' }}
      >
        <Upload size={13} /> {editingImgId === qi.id ? 'Cancel' : 'Add Images'}
      </button>
      {editingImgId === qi.id && (
        <div style={{ marginTop: '0.5rem' }}>
          <input type="file" accept="image/*" multiple id={`img-upload-${qi.id}`} style={{ display: 'none' }} onChange={(e) => onAddImages(e, qi.id)} />
          <label htmlFor={`img-upload-${qi.id}`} style={styles.imageUploadLabel}>Click to choose images</label>
        </div>
      )}
    </div>
  );

  const hideSnack = useCallback(() => setSnackbar({ show: false, message: '', type: 'error' }), []);

  const renderItemRow = (qi, index) => {
    const itemCommentProps = commentsFor('item', qi.id);
    return (
    <tr key={qi.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc', verticalAlign: 'top' }}>
      <td style={styles.tableCellCenter}>{index + 1}</td>
      <td style={styles.tableCellDescription}>
        {isEditing ? (
          <>
            <textarea
              className="edit-input"
              value={qi.description || ''}
              onChange={(e) => onUpdateItem(qi.id, 'description', e.target.value)}
              placeholder="Item description (optional)…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.4', fontSize: '0.8125rem', marginTop: '0.5rem' }}
            />
            <CommentBadge {...itemCommentProps} />
          </>
        ) : (
          <CommentableText {...itemCommentProps} text={qi.description} textStyle={styles.itemDescription} />
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
              style={{ ...inputStyle, textAlign: 'center', borderColor: fieldErrors[qi.id]?.quantity ? '#dc2626' : undefined, backgroundColor: fieldErrors[qi.id]?.quantity ? '#fef2f2' : undefined }}
              min="1"
            />
            {fieldErrors[qi.id]?.quantity && <div style={styles.fieldErrorSmall}>⚠ {fieldErrors[qi.id].quantity}</div>}
            <CommentBadge {...commentsFor('item', `${qi.id}:qty`)} />
          </div>
        ) : (
          <CommentableText {...commentsFor('item', `${qi.id}:qty`)} text={String(qi.quantity ?? '')} as="span" textStyle={styles.fieldValue} />
        )}
      </td>
      <td style={styles.tableCellCenter}>
        {isEditing ? (
          <div>
            <input
              type="text"
              className="edit-input"
              value={qi.unit || ''}
              onChange={(e) => onUpdateItem(qi.id, 'unit', e.target.value)}
              placeholder="pcs, box..."
              style={{ ...inputStyle, textAlign: 'center' }}
            />
            <CommentBadge {...commentsFor('item', `${qi.id}:unit`)} />
          </div>
        ) : (
          <CommentableText {...commentsFor('item', `${qi.id}:unit`)} text={qi.unit || ''} as="span" textStyle={styles.fieldValue} placeholder={<span style={styles.fieldValue}>—</span>} />
        )}
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
              style={{ ...inputStyle, textAlign: 'right', borderColor: fieldErrors[qi.id]?.unitPrice ? '#dc2626' : undefined, backgroundColor: fieldErrors[qi.id]?.unitPrice ? '#fef2f2' : undefined }}
              step="0.01"
              min="0"
            />
            {fieldErrors[qi.id]?.unitPrice && <div style={styles.fieldErrorSmall}>⚠ {fieldErrors[qi.id].unitPrice}</div>}
            <CommentBadge {...commentsFor('item', `${qi.id}:unitPrice`)} />
          </div>
        ) : (
          <CommentableText {...commentsFor('item', `${qi.id}:unitPrice`)} text={Number(qi.unitPrice || 0).toFixed(2)} as="span" textStyle={styles.fieldValue} />
        )}
      </td>
      <td style={styles.tableCellRightBold}>
        {isEditing ? (
          (Number(qi.quantity || 0) * Number(qi.unitPrice || 0)).toFixed(2)
        ) : (
          <CommentableText
            {...commentsFor('item', `${qi.id}:total`)}
            text={(Number(qi.quantity || 0) * Number(qi.unitPrice || 0)).toFixed(2)}
            as="span"
            textStyle={styles.tableCellRightBold}
          />
        )}
      </td>
      {isEditing && (
        <td style={styles.tableCellCenter}>
          <button onClick={() => onRemoveItem(qi.id)} style={styles.deleteItemBtn}><Trash2 size={15} /></button>
        </td>
      )}
    </tr>
    );
  };

  const handleValidatedUpdate = (itemId, field, value, validator) => {
    if (value === '' && field === 'quantity') {
      setSnackbar({ show: true, message: 'Quantity cannot be empty', type: 'error' });
      return;
    }
    if (validator) {
      const result = validator(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        return;
      }
    }
    if (field === 'quantity') value = parseFloat(value);
    if (field === 'unitPrice') value = parseFloat(value) || 0;
    onUpdateItem(itemId, field, value);
  };

  const handleFieldChange = useCallback((field, value) => {
    onDataChange(field, value);
    if (setHeaderErrors && headerErrors[field]) {
      setHeaderErrors(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  }, [onDataChange, setHeaderErrors, headerErrors]);

  const handleTaxChange = useCallback((e) => {
    onDataChange('tax', parseFloat(e.target.value));
    if (setHeaderErrors && headerErrors.tax) setHeaderErrors(prev => { const { tax, ...rest } = prev; return rest; });
  }, [onDataChange, setHeaderErrors, headerErrors]);

  const isMobile = useMediaQuery('(max-width: 768px)');
  if (!quotationData) return null;
  
  if (isMobile) {
    return <MobileQuotationLayout 
      isEditing={isEditing}
      quotationNumber={quotationNumber}
      quotationData={quotationData}
      onDataChange={onDataChange}
      quotationItems={quotationItems}
      onUpdateItem={onUpdateItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
      onAddImages={onAddImages}
      onRemoveExistingImage={onRemoveExistingImage}
      onRemoveNewImage={onRemoveNewImage}
      newImages={newImages}
      subtotal={subtotal}
      taxAmount={taxAmount}
      discountAmount={discountAmount}
      grandTotal={grandTotal}
      amountInWords={amountInWords}
      tcSections={tcSections}
      onTcChange={onTcChange}
      actionBar={actionBar}
      headerErrors={headerErrors}
      fieldErrors={fieldErrors}
      setHeaderErrors={setHeaderErrors}
      documents={documents}
      onDocumentUpload={onDocumentUpload}
      onDocumentDelete={onDocumentDelete}
      onDocumentDownload={onDocumentDownload}
      formatFileSize={formatFileSize}
      getFileIcon={getFileIcon}
      companyName={companyName}
      customerTaxTreatment={customerTaxTreatment}
      customerPlaceOfSupply={customerPlaceOfSupply}
      customerContactPersons={customerContactPersons}
      showTaxSection={showTaxSection}
      showTaxRow={showTaxRow}
      taxPresets={taxPresets}
      defaultTaxValue={defaultTaxValue}
      handleTaxChange={handleTaxChange}
      termsImages={termsImages}
      onTermsImagesUpload={onTermsImagesUpload}
      onRemoveTermsImage={onRemoveTermsImage}
      termsTemplates={termsTemplates}
      selectedTermsTemplateId={selectedTermsTemplateId}
      onSelectTermsTemplate={onSelectTermsTemplate}
      onSaveTermsTemplateClick={onSaveTermsTemplateClick}
      onDeleteTermsTemplate={onDeleteTermsTemplate}
      isTemplateActionsDisabled={isTemplateActionsDisabled}
      paymentTermOptions={paymentTermOptions}
      selectedPaymentTermId={selectedPaymentTermId}
      onSelectPaymentTerm={onSelectPaymentTerm}
      onDeletePaymentTerm={onDeletePaymentTerm}
      companyPhone={companyPhone}
      companyEmail={companyEmail}
      companyTradeLicense={companyTradeLicense}
      companyTaxRegistration={companyTaxRegistration}
      selectedCurrency={displayCurrency}
      commentsByTarget={commentsByTarget}
      canAddComments={canAddComments}
      canManageComments={canManageComments}
      canDeleteComment={canDeleteComment}
      onAddComment={onAddComment}
      onEditComment={onEditComment}
      onResolveComment={onResolveComment}
      onDeleteComment={onDeleteComment}
    />;
  }

  return (
    <div className="quotation-content" style={styles.container}>
      <div style={styles.headerImageContainer}>
        <img src={headerImage} alt="Company Header" style={styles.headerImage} />
      </div>

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

      <div style={styles.detailsGrid}>
        {renderFieldGrid(LEFT_FIELDS)}
        {renderFieldGrid(RIGHT_FIELDS)}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3 style={styles.sectionTitle}>Items Detail</h3>
        <div style={{ overflowX: 'auto', borderRadius: '0.375rem' }}>
          <table style={styles.table}>
            <thead>
              <tr style={{ backgroundColor: '#000' }}>
                {TABLE_HEADERS(isEditing, displayCurrency).map(({ label, w, align }) => (
                  <th key={label} style={{ ...styles.tableHeader, width: w, textAlign: align }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotationItems.map(renderItemRow)}
              <tr style={styles.totalRow}>
                <td colSpan={isEditing ? 5 : 4} style={{ border: '1px solid #e5e7eb' }} />
                <td style={styles.totalLabelCell}>Subtotal ({displayCurrency})</td>
                <td style={styles.totalValueCell}>{subtotal.toFixed(2)}</td>
                {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
              </tr>
              {showTaxRow && (
                <tr style={styles.totalRow}>
                  <td colSpan={isEditing ? 5 : 4} style={{ border: '1px solid #e5e7eb' }} />
                  <td style={styles.totalLabelCell}>VAT ({quotationData.tax || 0}%)</td>
                  <td style={styles.totalValueCell}>{taxAmount.toFixed(2)}</td>
                  {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
                </tr>
              )}
              {discountAmount > 0 && (
                <tr style={styles.totalRow}>
                  <td colSpan={isEditing ? 5 : 4} style={{ border: '1px solid #e5e7eb' }} />
                  <td style={{ ...styles.totalLabelCell, color: '#059669' }}>Discount ({quotationData.discount}%)</td>
                  <td style={{ ...styles.totalValueCell, color: '#059669' }}>−{discountAmount.toFixed(2)}</td>
                  {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
                </tr>
              )}
              <tr style={styles.grandTotalRow}>
                <td colSpan={isEditing ? 5 : 4} style={{ border: 'none' }} />
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

      <div style={styles.amountWordsContainer}>
        <strong>Amount in words: </strong>
        <span style={{ fontWeight: '500', color: '#374151' }}>{amountInWords}</span>
      </div>

      {isEditing && showTaxSection && (
        <div className="no-print" style={styles.taxSection}>
          <h4 style={styles.taxSectionTitle}>Tax & Discount</h4>
          <div style={styles.taxGrid}>
            <div>
              <label style={styles.inputLabel}>VAT (%)</label>
              <select
                onChange={handleTaxChange}
                value={quotationData.tax?.toString() ?? defaultTaxValue}
                style={inputStyle}
              >
                {taxPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              {headerErrors.tax && <div style={styles.fieldError}>⚠ {headerErrors.tax}</div>}
            </div>
            <div>
              <label style={styles.inputLabel}>Discount (%)</label>
              <ValidatedInput
                type="number"
                value={quotationData.discount}
                onChange={(val) => onDataChange('discount', val === '' ? 0 : parseFloat(val) || 0)}
                validator={validatePercentage}
                placeholder="0"
                min="0" max="100" step="0.01"
                style={inputStyle}
              />
              {headerErrors.discount && <div style={styles.fieldError}>⚠ {headerErrors.discount}</div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h3 style={styles.sectionTitle}>Terms & Conditions</h3>
        {isEditing && (
          <TermsTemplateControls
            templates={termsTemplates}
            selectedTemplateId={selectedTermsTemplateId}
            onSelectTemplate={onSelectTermsTemplate}
            onSaveClick={onSaveTermsTemplateClick}
            onDeleteTemplate={onDeleteTermsTemplate}
            disabled={isTemplateActionsDisabled}
          />
        )}
        {isEditing ? (
          <TermsEditor
            sections={tcSections}
            onChange={onTcChange}
            termsImages={termsImages}
            onTermsImagesUpload={onTermsImagesUpload}
            onRemoveTermsImage={onRemoveTermsImage}
            commentProps={commentsFor('terms', 'terms')}
          />
        ) : (
          <TermsViewer
            sections={tcSections}
            termsImages={termsImages}
            commentProps={commentsFor('terms', 'terms')}
          />
        )}
      </div>

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

{isEditing ? (
  <div style={{ marginBottom: '2rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
      <FileText size={20} color="#4b5563" />
      <h3 style={styles.sectionTitle}>Remark</h3>
      <span style={styles.internalBadge}>Additional notes</span>
    </div>
    <textarea
      className="edit-input"
      value={quotationData.remark || ''}
      onChange={(e) => onDataChange('remark', e.target.value)}
      placeholder="Add any additional remarks or notes about this quotation..."
      rows={3}
      style={{
        ...inputStyle,
        resize: 'vertical',
        width: '100%',
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        lineHeight: '1.5'
      }}
    />
    <CommentBadge {...commentsFor('header', 'remark')} />
  </div>
) : (
  (quotationData.remark || canAddComments) && (
    <div style={{ marginBottom: '2rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <FileText size={20} color="#4b5563" />
        <h3 style={styles.sectionTitle}>Remark</h3>
      </div>
      <CommentableText
        {...commentsFor('header', 'remark')}
        text={quotationData.remark || ''}
        textStyle={{
          fontSize: '0.875rem',
          color: '#1f2937',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </div>
  )
)}


      <div style={styles.signatureFooter}>
        <p style={{ margin: 0, fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>Sincerely,</p>
        <p style={{ margin: '2.5rem 0 0', fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>
          {companyName}
        </p>
      </div>

      {actionBar && <div className="no-print" style={styles.actionBar}>{actionBar}</div>}
      {snackbar.show && <Snackbar message={snackbar.message} type={snackbar.type} onClose={hideSnack} />}
    </div>
  );
}