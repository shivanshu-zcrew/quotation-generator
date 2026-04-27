import React, { useState } from 'react';
import { Download, Edit2, Save, X, ArrowLeft, Loader, AlertCircle } from "lucide-react";
import { useQuotation } from '../hooks/useQuotation';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { btnStyle, getFileIcon } from '../utils/quotationUtils';
import { formatFileSize } from '../utils/formatters';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { useAppStore } from '../services/store';
import LoadingOverlay from '../components/LoadingOverlay';

// Loading Skeleton for Quotation
const QuotationSkeleton = () => (
  <div style={styles.skeletonContainer}>
    <div style={styles.skeletonHeader}>
      <div style={styles.skeletonLine} />
      <div style={styles.skeletonLineSmall} />
    </div>
    <div style={styles.skeletonGrid}>
      {[0, 1].map(col => (
        <div key={col} style={styles.skeletonColumn}>
          {[90, 120, 80, 110].map((w, i) => (
            <div key={i} style={{ ...styles.skeletonBar, width: `${w}px` }} />
          ))}
        </div>
      ))}
    </div>
    <div style={styles.skeletonTable}>
      <div style={styles.skeletonTableHeader}>
        <div style={styles.skeletonBarMedium} />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={styles.skeletonRow}>
          <div style={styles.skeletonCell} />
          <div style={styles.skeletonCell} />
          <div style={styles.skeletonCell} />
          <div style={styles.skeletonCell} />
          <div style={styles.skeletonCell} />
        </div>
      ))}
    </div>
  </div>
);

export default function ViewQuotationScreen() {
  const {
    isEditing, setIsEditing, isSaving, isExporting, setIsExporting, editingImgId, setEditingImgId,
    loading, fetchError, newImages, quotationData, quotationItems, tcSections, setTcSections,
    internalDocuments, newDocuments, snackbar, setSnackbar, fieldErrors, originalQuotation,
    subtotal, taxAmount, discountAmount, grandTotal, amountInWords, items, previewDoc, setPreviewDoc,
    handleDocumentPreview, handleDataChange, addItem, removeItem, updateItem, handleImageUpload,
    removeNewImage, removeExistingImage, handleDocumentUpload, handleDocumentDelete, handleDocumentDownload,
    cancelEdit, handleSave, handleDelete, handleBack, generatePDF,
    termsImages, handleTermsImagesUpload, removeTermsImage,
    customerTaxTreatment, 
    customerPlaceOfSupply   
  } = useQuotation();

  // Local state for progress tracking
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStep, setSaveStep] = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStep, setPdfStep] = useState('');

  // Get current user role
  const user = useAppStore(state => state.user);
  const userRole = user?.role;
  
  // Check if edit button should be shown
  const canEdit = () => {
    if (isEditing) return false;
    const isApproved = originalQuotation?.status === 'approved' || 
                       originalQuotation?.status === 'awarded' ||
                       originalQuotation?.isApproved === true;
    if (isApproved) return false;
    // if (userRole === 'admin' || userRole === 'ops_manager') return false;
    return true;
  };
  
  // Enhanced save handler with progress tracking
  const handleSaveWithProgress = async () => {
    setSaveProgress(10);
    setSaveStep('Validating data...');
    
    const progressInterval = setInterval(() => {
      setSaveProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 800);
    
    try {
      await handleSave();
      setSaveProgress(100);
      setSaveStep('Complete!');
      setTimeout(() => {
        setSaveProgress(0);
        setSaveStep('');
      }, 1000);
    } catch (error) {
      setSaveProgress(0);
      setSaveStep('');
    } finally {
      clearInterval(progressInterval);
    }
  };
  
  // Enhanced PDF handler with progress tracking
  const handlePDFWithProgress = async () => {
    setPdfProgress(10);
    setPdfStep('Preparing document...');
    
    const progressInterval = setInterval(() => {
      setPdfProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 1000);
    
    try {
      await generatePDF();
      setPdfProgress(100);
      setPdfStep('Complete!');
      setTimeout(() => {
        setPdfProgress(0);
        setPdfStep('');
      }, 1000);
    } catch (error) {
      setPdfProgress(0);
      setPdfStep('');
    } finally {
      clearInterval(progressInterval);
    }
  };
  
  const allDocuments = [...internalDocuments, ...newDocuments];

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading quotation…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorBanner}>
          <AlertCircle size={18} /> ⚠️ {fetchError}
        </div>
        <button onClick={handleBack} style={btnStyle("#1e3a8a")}><ArrowLeft size={18} /> Back</button>
      </div>
    );
  }

  if (!originalQuotation) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.notFoundText}>Quotation not found.</p>
        <button onClick={handleBack} style={{ marginTop: "1rem", ...btnStyle("#1e3a8a") }}><ArrowLeft size={18} /> Back</button>
      </div>
    );
  }

  const getStatusText = () => {
    const status = originalQuotation?.status;
    if (status === 'approved') return 'Approved';
    if (status === 'awarded') return 'Awarded';
    if (status === 'rejected') return 'Rejected';
    if (status === 'pending') return 'Pending';
    return status || 'Draft';
  };

  const isApproved = originalQuotation?.status === 'approved' || originalQuotation?.status === 'awarded';
  const showEditButton = canEdit();

  return (
    <div style={styles.container}>
      {/* Reusable Loading Overlays */}
      {isSaving && saveProgress > 0 && (
        <LoadingOverlay 
          type="saving"
          step={saveStep}
          progress={saveProgress}
        />
      )}
      
      {isExporting && pdfProgress > 0 && (
        <LoadingOverlay 
          type="pdf"
          step={pdfStep}
          progress={pdfProgress}
        />
      )}
      
      <style>{styles.globalStyles}</style>

      <div style={styles.innerContainer}>
        <div className="no-print" style={styles.header}>
          <div>
            <h1 style={styles.title}>
              📄 {isEditing ? "Edit Quotation" : "View Quotation"}
            </h1>
            {!isEditing && (
              <div style={styles.statusContainer}>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: isApproved ? '#d1fae5' : '#fef3c7',
                  color: isApproved ? '#065f46' : '#92400e'
                }}>
                  Status: {getStatusText()}
                </span>
              </div>
            )}
          </div>
          <div style={styles.headerActions}>
            {!isEditing && showEditButton && (
              <button onClick={() => setIsEditing(true)} style={btnStyle("#f59e0b")}>
                <Edit2 size={16} /> Edit
              </button>
            )}
            {isEditing && (
              <>
                <button 
                  onClick={handleSaveWithProgress} 
                  disabled={isSaving} 
                  style={{ ...btnStyle("#10b981", isSaving), display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isSaving ? <Loader size={16} style={styles.spinningIconSmall} /> : <Save size={16} />} 
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
                <button onClick={cancelEdit} style={btnStyle("#ef4444")}>
                  <X size={16} /> Cancel
                </button>
              </>
            )}
            <button 
              onClick={handlePDFWithProgress} 
              disabled={isExporting} 
              style={{ ...btnStyle("#0369a1", isExporting), display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isExporting ? <Loader size={16} style={styles.spinningIconSmall} /> : <Download size={16} />} 
              {isExporting ? "Generating…" : "Download PDF"}
            </button>
            <button onClick={handleBack} style={btnStyle("#6b7280")}>
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>

        {isEditing && (
          <div style={styles.editModeBanner}>
            ✏️ <strong>Edit mode active</strong> — make your changes below, then click <strong>Save Changes</strong>.
          </div>
        )}

        {loading ? (
          <QuotationSkeleton />
        ) : (
          <QuotationLayout
            isEditing={isEditing}
            quotationNumber={originalQuotation.quotationNumber}
            quotationData={quotationData}
            onDataChange={handleDataChange}
            quotationItems={quotationItems}
            availableItems={items}
            onUpdateItem={updateItem}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onAddImages={handleImageUpload}
            onRemoveExistingImage={removeExistingImage}
            onRemoveNewImage={removeNewImage}
            editingImgId={editingImgId}
            onToggleImgEdit={(id) => setEditingImgId(editingImgId === id ? null : id)}
            newImages={newImages}
            subtotal={subtotal}
            taxAmount={taxAmount}
            discountAmount={discountAmount}
            grandTotal={grandTotal}
            amountInWords={amountInWords}
            tcSections={tcSections}
            onTcChange={setTcSections}
            fieldErrors={fieldErrors}
            actionBar={null}
            documents={allDocuments}
            onDocumentUpload={handleDocumentUpload}
            onDocumentDelete={handleDocumentDelete}
            onDocumentDownload={handleDocumentDownload}
            onDocumentPreview={handleDocumentPreview}
            documentLoading={loading}
            formatFileSize={formatFileSize}
            getFileIcon={getFileIcon}
            termsImages={termsImages}
            onTermsImagesUpload={handleTermsImagesUpload}
            onRemoveTermsImage={removeTermsImage}
            customerTaxTreatment={customerTaxTreatment}
            customerPlaceOfSupply={customerPlaceOfSupply}
          />
        )}

        {previewDoc && (
          <div style={styles.previewOverlay} onClick={() => setPreviewDoc(null)}>
            <div style={styles.previewModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.previewHeader}>
                <span style={styles.previewTitle}>{previewDoc.fileName}</span>
                <button onClick={() => setPreviewDoc(null)} style={styles.previewCloseBtn}>
                  <X size={16} />
                </button>
              </div>
              <div style={styles.previewBody}>
                <img 
                  src={previewDoc.fileUrl || previewDoc.fileData} 
                  alt={previewDoc.fileName} 
                  style={styles.previewImage}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div style="padding:2rem;color:#ef4444;">Failed to load image</div>';
                  }} 
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {snackbar.show && <Snackbar message={snackbar.message} type={snackbar.type} onClose={() => setSnackbar({ show: false, message: '', type: 'error' })} />}
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: { minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" },
  innerContainer: { maxWidth: "1280px", margin: "0 auto" },
  
  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" },
  title: { fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 },
  headerActions: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  
  // Status
  statusContainer: { marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" },
  statusBadge: { padding: "0.25rem 0.75rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "600" },
  
  // Edit Mode Banner
  editModeBanner: { 
    backgroundColor: "#fef3c7", 
    border: "1px solid #f59e0b", 
    borderRadius: "0.5rem", 
    padding: "0.75rem 1rem", 
    marginBottom: "1rem", 
    fontSize: "0.875rem", 
    color: "#92400e", 
    display: "flex", 
    alignItems: "center", 
    gap: "0.5rem" 
  },
  
  // Loading States
  loadingContainer: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", backgroundColor: "#f0f9ff" },
  spinner: { width: "44px", height: "44px", border: "4px solid #e2e8f0", borderTopColor: "#0369a1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingText: { color: "#6b7280", fontWeight: "500" },
  spinningIconSmall: { animation: "spin 1s linear infinite" },
  
  // Error States
  errorContainer: { maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" },
  errorBanner: { backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "1rem 1.25rem", marginBottom: "1rem", color: "#991b1b", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" },
  notFoundText: { color: "#ef4444", fontSize: "1.125rem" },
  
  // Skeleton Styles
  skeletonContainer: { background: "white", borderRadius: "1rem", padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  skeletonHeader: { display: "flex", justifyContent: "space-between", marginBottom: "2rem" },
  skeletonLine: { width: "160px", height: "20px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonLineSmall: { width: "120px", height: "20px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" },
  skeletonColumn: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  skeletonBar: { height: "13px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonBarMedium: { width: "200px", height: "13px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonTable: { border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" },
  skeletonTableHeader: { background: "#f8fafc", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" },
  skeletonRow: { display: "flex", padding: "0.85rem 1rem", borderBottom: "1px solid #f1f5f9", gap: "1rem" },
  skeletonCell: { flex: 1, height: "14px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  
  // Preview Modal
  previewOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' },
  previewModal: { backgroundColor: 'white', borderRadius: '0.5rem', maxWidth: '90%', maxHeight: '90%', overflow: 'hidden', position: 'relative' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  previewTitle: { fontWeight: '500', color: '#1f2937' },
  previewCloseBtn: { background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewBody: { padding: '1rem', textAlign: 'center' },
  previewImage: { maxWidth: '100%', maxHeight: '70vh', display: 'block' },
  
  globalStyles: `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media print { body{margin:0;padding:0;background:white;} .no-print{display:none!important;} .quotation-content{box-shadow:none;border-radius:0;} table{page-break-inside:avoid;}tr{page-break-inside:avoid;} @page{margin:0;} }
    .edit-input:focus{outline:2px solid #3b82f6;border-color:#3b82f6!important;}
    .field-error-input{border-color:#dc2626!important;background:#fef2f2!important;}
  `
};