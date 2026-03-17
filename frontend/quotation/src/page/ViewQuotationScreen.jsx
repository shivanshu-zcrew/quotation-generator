// screens/ViewQuotationScreen.jsx
import React from 'react';
import { Download, Edit2, Save, X, ArrowLeft } from "lucide-react";
import { useQuotation } from '../hooks/useQuotation';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { btnStyle, formatFileSize, getFileIcon } from '../utils/quotationUtils';
import { downloadQuotationPDF } from '../utils/pdfGenerator';

export default function ViewQuotationScreen() {
  const {
    // State
    isEditing,
    setIsEditing,
    isSaving,
    isExporting,
    setIsExporting,
    editingImgId,
    setEditingImgId,
    loading,
    fetchError,
    newImages,
    quotationData,
    quotationItems,
    tcSections,
    setTcSections,
    internalDocuments,
    newDocuments,
    snackbar,
    setSnackbar,
    fieldErrors,
    originalQuotation,
    subtotal,
    taxAmount,
    discountAmount,
    grandTotal,
    amountInWords,
    items,
    previewDoc,
    setPreviewDoc,
    handleDocumentPreview,
    generatePDF,
    // Handlers
    handleDataChange,
    addItem,
    removeItem,
    updateItem,
    handleImageUpload,
    removeNewImage,
    removeExistingImage,
    handleDocumentUpload,
    handleDocumentDelete,
    handleDocumentDownload,
    cancelEdit,
    handleSave,
    handleDelete,
    handleBack,
  } = useQuotation();

  // Combine documents for display
  const allDocuments = [...internalDocuments, ...newDocuments];

  const handleDownloadClick = () => {
    generatePDF();
  };
  

  // Loading state
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", backgroundColor: "#f0f9ff" }}>
        <div style={{ width: "44px", height: "44px", border: "4px solid #e2e8f0", borderTopColor: "#0369a1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: "#6b7280", fontWeight: "500" }}>Loading quotation…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "1rem 1.25rem", marginBottom: "1rem", color: "#991b1b", fontSize: "0.9rem" }}>
          ⚠️ {fetchError}
        </div>
        <button onClick={handleBack} style={btnStyle("#1e3a8a")}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>
    );
  }

  // Not found
  if (!originalQuotation) {
    return (
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
        <p style={{ color: "#ef4444", fontSize: "1.125rem" }}>Quotation not found.</p>
        <button onClick={handleBack} style={{ marginTop: "1rem", ...btnStyle("#1e3a8a") }}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" }}>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .quotation-content { box-shadow: none; border-radius: 0; padding: 20px; }
          @page { margin: 10mm; }
        }
        .edit-input:focus { outline: 2px solid #3b82f6; border-color: #3b82f6 !important; }
        .item-row:hover { background-color: #f8fafc; }
      `}</style>

      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

        {/* Top Controls */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 }}>
            📄 {isEditing ? "Edit Quotation" : "View Quotation"}
          </h1>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {!isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} style={btnStyle("#f59e0b")}>
                  <Edit2 size={16} /> Edit
                </button>
                {/* <button onClick={handleDelete} style={btnStyle("#dc2626")}>
                  <X size={16} /> Delete
                </button> */}
              </>
            ) : (
              <>
                <button onClick={handleSave} disabled={isSaving} style={btnStyle("#10b981", isSaving)}>
                  <Save size={16} /> {isSaving ? "Saving…" : "Save Changes"}
                </button>
                <button onClick={cancelEdit} style={btnStyle("#ef4444")}>
                  <X size={16} /> Cancel
                </button>
              </>
            )}
             <button 
        onClick={handleDownloadClick} 
        disabled={isExporting} 
        style={btnStyle("#0369a1", isExporting)}
      >
        <Download size={16} /> {isExporting ? "Generating…" : "Download PDF"}
      </button>
            <button onClick={handleBack} style={btnStyle("#6b7280")}>
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>

        {/* Edit mode banner */}
        {isEditing && (
          <div className="no-print" style={{ backgroundColor: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#92400e", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            ✏️ <strong>Edit mode active</strong> — make your changes below, then click <strong>Save Changes</strong>.
          </div>
        )}

        {/* Main QuotationLayout - this already includes the document section */}
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
          // Document props - pass these to QuotationLayout
          documents={allDocuments}
          onDocumentUpload={handleDocumentUpload}
          onDocumentDelete={handleDocumentDelete}
          onDocumentDownload={handleDocumentDownload}
          onDocumentPreview={handleDocumentPreview}
          documentLoading={loading}
          formatFileSize={formatFileSize}
          getFileIcon={getFileIcon}
        />

        {/* Preview Modal */}
        {previewDoc && (
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
          }} onClick={() => setPreviewDoc(null)}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              maxWidth: '90%',
              maxHeight: '90%',
              overflow: 'hidden',
              position: 'relative'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc'
              }}>
                <span style={{ fontWeight: '500', color: '#1f2937' }}>{previewDoc.fileName}</span>
                <button
                  onClick={() => setPreviewDoc(null)}
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
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <img
                  src={previewDoc.fileUrl || previewDoc.fileData}
                  alt={previewDoc.fileName}
                  style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }}
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

      {/* Snackbar */}
      {snackbar.show && (
        <Snackbar
          message={snackbar.message}
          type={snackbar.type}
          onClose={() => setSnackbar({ show: false, message: '', type: 'error' })}
        />
      )}
    </div>
  );
}