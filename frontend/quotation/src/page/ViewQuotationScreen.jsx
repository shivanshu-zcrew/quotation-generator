import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Download, Edit2, Save, X, ArrowLeft, LayoutDashboard, Loader, AlertCircle, AlertTriangle, CheckCircle, XCircle, LogIn } from "lucide-react";
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuotation } from '../hooks/useQuotation';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { btnStyle, getFileIcon } from '../utils/quotationUtils';
import { formatFileSize } from '../utils/formatters';
import { useAppStore } from '../services/store';
import { getHomePath } from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';

// ============================================================
// LOADING SKELETON COMPONENT
// ============================================================
const QuotationSkeleton = React.memo(() => (
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
));

// ============================================================
// REASON BANNER COMPONENT
// ============================================================
const ReasonBanner = React.memo(({ quotation }) => {
  const opsRejectionReason = quotation?.opsRejectionReason;
  const adminRejectionReason = quotation?.rejectionReason;
  const status = quotation?.status;

  const hasOpsRejection = opsRejectionReason && opsRejectionReason.trim();
  const hasAdminRejection = adminRejectionReason && adminRejectionReason.trim();

  if (!hasOpsRejection && !hasAdminRejection) return null;

  let reason = '';
  let label = '';
  let accentColor = '';
  let bgColor = '';
  let labelBg = '';
  let labelColor = '';
  let icon = null;

  if (status === 'ops_rejected' && hasOpsRejection) {
    reason = opsRejectionReason;
    label = 'Return Reason';
    accentColor = '#dc2626';
    bgColor = '#fff5f5';
    labelBg = '#fee2e2';
    labelColor = '#991b1b';
    icon = <AlertTriangle size={16} color="#dc2626" />;
  } else if (status === 'rejected' && hasAdminRejection) {
    reason = adminRejectionReason;
    label = 'Rejection Reason';
    accentColor = '#dc2626';
    bgColor = '#fff5f5';
    labelBg = '#fee2e2';
    labelColor = '#991b1b';
    icon = <AlertTriangle size={16} color="#dc2626" />;
  } else if (hasOpsRejection) {
    reason = opsRejectionReason;
    label = 'Return Reason';
    accentColor = '#d97706';
    bgColor = '#fffdf0';
    labelBg = '#fef3c7';
    labelColor = '#92400e';
    icon = <AlertCircle size={16} color="#d97706" />;
  } else if (hasAdminRejection) {
    reason = adminRejectionReason;
    label = 'Rejection Reason';
    accentColor = '#d97706';
    bgColor = '#fffdf0';
    labelBg = '#fef3c7';
    labelColor = '#92400e';
    icon = <AlertCircle size={16} color="#d97706" />;
  }

  if (!reason) return null;

  return (
    <div style={{
      backgroundColor: bgColor,
      border: `1px solid ${accentColor}22`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: '0.5rem',
      padding: '1rem 1.25rem',
      marginBottom: '1.25rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.85rem',
    }}>
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <span style={{
          display: 'inline-block',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          backgroundColor: labelBg,
          color: labelColor,
          padding: '0.15rem 0.55rem',
          borderRadius: '999px',
          marginBottom: '0.45rem',
        }}>
          {label}
        </span>
        <div style={{
          fontSize: '0.875rem',
          color: '#374151',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {reason}
        </div>
      </div>
    </div>
  );
});

// ============================================================
// REVIEW ACTION BANNER COMPONENT
// ============================================================
const ReviewBanner = ({
  title, meta, approveLabel, rejectLabel, rejectPlaceholder,
  onApprove, onReject, isApproving, isRejecting,
  showRejectForm, setShowRejectForm, rejectReason, setRejectReason,
  bannerStyle, onGoToDashboard,
}) => (
  <div style={{
    ...bannerStyle,
    borderRadius: '0.75rem',
    overflow: 'hidden',
    padding: 0,
    border: '1px solid #bae6fd',
    boxShadow: '0 1px 4px rgba(3,105,161,0.08)',
  }}>
    {/* Header strip */}
    <div style={{
      background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)',
      padding: '0.9rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <CheckCircle size={18} color="#7dd3fc" />
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{title}</span>
      </div>
      {meta && (
        <span style={{
          fontSize: '0.78rem',
          color: '#bae6fd',
          background: 'rgba(255,255,255,0.1)',
          padding: '0.2rem 0.65rem',
          borderRadius: '999px',
          fontWeight: 500,
        }}>{meta}</span>
      )}
    </div>

    {/* Body */}
    <div style={{ padding: '1rem 1.25rem', background: '#f0f9ff' }}>
      {!showRejectForm ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            onClick={onApprove}
            disabled={isApproving || isRejecting}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.6rem 1.3rem', border: 'none', borderRadius: '0.5rem',
              fontSize: '0.875rem', fontWeight: 700, cursor: isApproving ? 'not-allowed' : 'pointer',
              background: '#059669', color: '#fff',
              opacity: isApproving ? 0.75 : 1,
              boxShadow: '0 1px 3px rgba(5,150,105,0.3)',
            }}
          >
            {isApproving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />}
            {isApproving ? 'Approving…' : approveLabel}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={isApproving || isRejecting}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.6rem 1.3rem', border: 'none', borderRadius: '0.5rem',
              fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
              background: '#dc2626', color: '#fff',
              boxShadow: '0 1px 3px rgba(220,38,38,0.3)',
            }}
          >
            <XCircle size={15} />
            {rejectLabel}
          </button>
          {onGoToDashboard && (
            <button
              onClick={onGoToDashboard}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.6rem 1rem', borderRadius: '0.5rem',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                background: '#fff', color: '#0369a1',
                border: '1px solid #bae6fd',
              }}
            >
              <LayoutDashboard size={14} /> Dashboard
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <textarea
            placeholder={rejectPlaceholder}
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '0.7rem 0.9rem',
              border: '1px solid #bae6fd', borderRadius: '0.5rem',
              fontSize: '0.875rem', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
              background: '#fff', outline: 'none',
              lineHeight: 1.55,
            }}
          />
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              onClick={onReject}
              disabled={isRejecting || !rejectReason.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.6rem 1.3rem', border: 'none', borderRadius: '0.5rem',
                fontSize: '0.875rem', fontWeight: 700,
                cursor: isRejecting || !rejectReason.trim() ? 'not-allowed' : 'pointer',
                background: '#dc2626', color: '#fff',
                opacity: isRejecting || !rejectReason.trim() ? 0.65 : 1,
                boxShadow: '0 1px 3px rgba(220,38,38,0.3)',
              }}
            >
              {isRejecting ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={15} />}
              {isRejecting ? 'Processing…' : `Confirm — ${rejectLabel}`}
            </button>
            <button
              onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
              disabled={isRejecting}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.6rem 1.1rem', border: '1px solid #cbd5e1',
                borderRadius: '0.5rem', fontSize: '0.875rem', fontWeight: 600,
                cursor: 'pointer', background: '#fff', color: '#374151',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);

// ============================================================
// WRONG ACCOUNT BANNER COMPONENT
// ============================================================
const ROLE_LABELS = {
  ops_manager: 'Operations Manager',
  admin: 'Admin',
  user: 'Creator',
};

const WrongAccountBanner = ({ currentUser, requiredRole, onSwitch }) => (
  <div style={{
    borderRadius: '0.75rem',
    overflow: 'hidden',
    border: '1px solid #fde68a',
    boxShadow: '0 1px 4px rgba(217,119,6,0.1)',
    marginBottom: '1.5rem',
  }}>
    {/* Amber header strip */}
    <div style={{
      background: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
      padding: '0.75rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.55rem',
    }}>
      <AlertTriangle size={16} color="#fde68a" />
      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#fff', letterSpacing: '0.01em' }}>
        Wrong Account
      </span>
    </div>

    {/* Body */}
    <div style={{
      background: '#fffbeb',
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: '200px', fontSize: '0.875rem', color: '#78350f', lineHeight: 1.6 }}>
        Signed in as <strong style={{ color: '#92400e' }}>{currentUser?.name || currentUser?.email}</strong>
        {' '}({ROLE_LABELS[currentUser?.role] || currentUser?.role}).
        {' '}This action requires a <strong style={{ color: '#92400e' }}>{ROLE_LABELS[requiredRole]}</strong> account.
      </div>
      <button
        onClick={onSwitch}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          padding: '0.55rem 1.1rem', border: 'none', borderRadius: '0.5rem',
          fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
          background: '#b45309', color: '#fff', flexShrink: 0,
          boxShadow: '0 1px 3px rgba(180,83,9,0.3)',
        }}
      >
        <LogIn size={14} />
        Switch Account
      </button>
    </div>
  </div>
);

// ============================================================
// PDF OPTIONS DROPDOWN COMPONENT
// ============================================================
const PDFOptionsDropdown = ({ onSelect, onClose, isExporting }) => {
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (isExporting) return null;

  return (
    <div ref={dropdownRef} style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '8px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      zIndex: 100,
      minWidth: '220px'
    }}>
      <button
        onClick={() => onSelect('with_total')}
        style={styles.pdfOptionButton}
        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
      >
         <div>
          <div style={{ fontWeight: '600' }}>With Total Amount</div>
         </div>
      </button>
      <button
        onClick={() => onSelect('without_total')}
        style={{ ...styles.pdfOptionButton, borderTop: '1px solid #e2e8f0' }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
      >
         <div>
          <div style={{ fontWeight: '600' }}>Without Total Amount</div>
         </div>
      </button>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ViewQuotationScreen() {
  const {
    isEditing, setIsEditing, isSaving, isExporting, editingImgId, setEditingImgId,
    loading, fetchError, newImages, quotationData, quotationItems, tcSections, setTcSections,
    internalDocuments, newDocuments, snackbar, setSnackbar, fieldErrors, originalQuotation,
    subtotal, taxAmount, discountAmount, grandTotal, amountInWords, items, previewDoc, setPreviewDoc,
    handleDocumentPreview, handleDataChange, addItem, removeItem, updateItem, handleImageUpload,
    removeNewImage, removeExistingImage, handleDocumentUpload, handleDocumentDelete, handleDocumentDownload,
    cancelEdit, handleSave, handleBack, generatePDF,
    termsImages, handleTermsImagesUpload, removeTermsImage,
    customerTaxTreatment, 
    customerPlaceOfSupply   
  } = useQuotation();

  // Local state
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStep, setSaveStep] = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStep, setPdfStep] = useState('');
  const [showPDFOptions, setShowPDFOptions] = useState(false);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Router hooks for wrong-account detection
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Store bindings
  const user = useAppStore(state => state.user);
  const handleLogout = useAppStore(s => s.handleLogout);
  const storeApprove = useAppStore(s => s.approveQuotation);
  const storeReject = useAppStore(s => s.rejectQuotation);
  const storeOpsApprove = useAppStore(s => s.opsApproveQuotation);
  const storeOpsReject = useAppStore(s => s.opsRejectQuotation);

  // ── Wrong-account detection ──────────────────────────────────
  // Email links carry ?action=review&for=<role> (e.g. for=ops_manager).
  // We compare the URL's "for" param against the logged-in role.
  // The banner only fires when the action is still pending for that role —
  // once the intended user has acted (status changed), no banner is shown.
  const isWrongAccount = useMemo(() => {
    const forRole = searchParams.get('for');
    if (!forRole || !originalQuotation || !user) return false;
    if (user.role === forRole) return false; // correct account, no warning

    const s = originalQuotation.status;
    const actionStillPending =
      (forRole === 'ops_manager' && s === 'pending') ||
      (forRole === 'admin' && (s === 'ops_approved' || s === 'pending_admin'));

    return actionStillPending;
  }, [searchParams, originalQuotation, user]);

  const actionRequiredRole = isWrongAccount ? searchParams.get('for') : null;

  const handleSwitchAccount = useCallback(async () => {
    await handleLogout();
    navigate('/login', {
      state: { from: { pathname: location.pathname, search: location.search } },
      replace: true,
    });
  }, [handleLogout, navigate, location.pathname, location.search]);

  const handleGoToDashboard = useCallback(() => {
    navigate(getHomePath(user?.role), { replace: true });
  }, [navigate, user?.role]);
  
  // Memoized values
  const allDocuments = useMemo(() => [...internalDocuments, ...newDocuments], [internalDocuments, newDocuments]);
  
  const isApproved = useMemo(() => 
    originalQuotation?.status === 'approved' || originalQuotation?.status === 'awarded',
    [originalQuotation?.status]
  );
  
  // Progress tracking helpers - memoized to prevent recreation
  const startProgressTracking = useCallback((setProgress, intervalMs = 800) => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, intervalMs);
    return interval;
  }, []);
  
  const completeProgressTracking = useCallback((setProgress, setStep, delayMs = 1000) => {
    setProgress(100);
    setStep('Complete!');
    setTimeout(() => {
      setProgress(0);
      setStep('');
    }, delayMs);
  }, []);
  
  // Check if edit button should be shown
  const canEdit = useCallback(() => {
    if (isEditing) return false;
    if (isApproved) return false;
    if (originalQuotation?.status === 'not_awarded') return false;
    return true;
  }, [isEditing, isApproved, originalQuotation?.status]);
  
  const getStatusText = useCallback(() => {
    const status = originalQuotation?.status;
    const statusMap = {
      'approved': 'Approved',
      'awarded': 'Awarded',
      'rejected': 'Rejected',
      'pending': 'Pending',
      'pending_admin': 'Pending Admin',
      'ops_rejected': 'Returned',
      'ops_approved': 'In Review',
      'not_awarded' : 'Not Awarded'
    };
    return statusMap[status] || status || 'Draft';
  }, [originalQuotation?.status]);
  
  const handleSaveWithProgress = useCallback(async () => {
    setSaveProgress(10);
    setSaveStep('Validating data...');
    
    const progressInterval = startProgressTracking(setSaveProgress);
    
    try {
      await handleSave();
      completeProgressTracking(setSaveProgress, setSaveStep);
    } catch (error) {
      setSaveProgress(0);
      setSaveStep('');
      setSnackbar({ show: true, message: error?.message || 'Failed to save quotation. Please try again.', type: 'error' });
    } finally {
      clearInterval(progressInterval);
    }
  }, [handleSave, startProgressTracking, completeProgressTracking, setSnackbar]);

  const handlePDFWithProgress = useCallback(async (exportType = 'with_total') => {
    setPdfProgress(10);
    setPdfStep('Preparing document...');
    
    const progressInterval = startProgressTracking(setPdfProgress, 1000);
    
    try {
      await generatePDF(exportType);
      completeProgressTracking(setPdfProgress, setPdfStep);
    } catch (error) {
      setPdfProgress(0);
      setPdfStep('');
      console.error('PDF generation error:', error);
    } finally {
      clearInterval(progressInterval);
    }
  }, [generatePDF, startProgressTracking, completeProgressTracking]);
  
  const handlePDFOptionSelect = useCallback((exportType) => {
    handlePDFWithProgress(exportType);
    setShowPDFOptions(false);
  }, [handlePDFWithProgress]);
  
  const handleSnackbarClose = useCallback(() => {
    setSnackbar({ show: false, message: '', type: 'error' });
  }, [setSnackbar]);

  const handleApprove = useCallback(async () => {
    if (!originalQuotation?._id) return;
    setIsApproving(true);
    try {
      const result = await storeApprove(originalQuotation._id);
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to approve quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation approved successfully!', type: 'success' });
        setTimeout(() => navigate(getHomePath(user?.role), { replace: true }), 1500);
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to approve quotation', type: 'error' });
    } finally {
      setIsApproving(false);
    }
  }, [originalQuotation?._id, storeApprove, setSnackbar, navigate, user?.role]);

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      setSnackbar({ show: true, message: 'Please provide a rejection reason', type: 'error' });
      return;
    }
    if (!originalQuotation?._id) return;
    setIsRejecting(true);
    try {
      const result = await storeReject(originalQuotation._id, rejectReason.trim());
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to reject quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation rejected.', type: 'success' });
        setShowRejectForm(false);
        setRejectReason('');
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to reject quotation', type: 'error' });
    } finally {
      setIsRejecting(false);
    }
  }, [originalQuotation?._id, rejectReason, storeReject, setSnackbar]);

  const handleOpsApprove = useCallback(async () => {
    if (!originalQuotation?._id) return;
    setIsApproving(true);
    try {
      const result = await storeOpsApprove(originalQuotation._id);
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to approve quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation approved and sent to admin!', type: 'success' });
        setTimeout(() => navigate(getHomePath(user?.role), { replace: true }), 1500);
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to approve quotation', type: 'error' });
    } finally {
      setIsApproving(false);
    }
  }, [originalQuotation?._id, storeOpsApprove, setSnackbar, navigate, user?.role]);

  const handleOpsReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      setSnackbar({ show: true, message: 'Please provide a reason for returning', type: 'error' });
      return;
    }
    if (!originalQuotation?._id) return;
    setIsRejecting(true);
    try {
      const result = await storeOpsReject(originalQuotation._id, rejectReason.trim());
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to return quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation returned for revision.', type: 'success' });
        setShowRejectForm(false);
        setRejectReason('');
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to return quotation', type: 'error' });
    } finally {
      setIsRejecting(false);
    }
  }, [originalQuotation?._id, rejectReason, storeOpsReject, setSnackbar]);
  
  // Show spinner while loading, or while the quotation is not yet resolved.
  // The "not found" state is only correct after a fetch has been attempted
  // and returned an error — guarding on !fetchError prevents a flash of
  // "Quotation not found" on the first render before the useEffect fires.
  if (loading || (!originalQuotation && !fetchError)) {
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
        <button onClick={handleBack} style={btnStyle("#1e3a8a")}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>
    );
  }

  if (!originalQuotation) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.notFoundText}>Quotation not found.</p>
        <button onClick={handleBack} style={{ marginTop: "1rem", ...btnStyle("#1e3a8a") }}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>
    );
  }
  
  const showEditButton = canEdit();
  
  return (
    <div style={styles.container}>
      {/* Loading Overlays */}
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
        {/* Header */}
        <div className="no-print" style={styles.header}>
          <div>
            <h1 style={styles.title}>
              📄 {isEditing ? "Edit Quotation" : "View Quotation"}
            </h1>
            {!isEditing && (
  <div style={styles.statusContainer}>
    <span style={{
      ...styles.statusBadge,
      backgroundColor: (() => {
        const status = originalQuotation?.status;
        if (status === 'approved' || status === 'awarded') return '#d1fae5';
        if (status === 'rejected' || status === 'ops_rejected') return '#fee2e2';
        if (status === 'not_awarded') return '#f1f5f9';  // ← Grey color
        if (status === 'pending' || status === 'pending_admin') return '#fef3c7';
        return '#f1f5f9';
      })(),
      color: (() => {
        const status = originalQuotation?.status;
        if (status === 'approved' || status === 'awarded') return '#065f46';
        if (status === 'rejected' || status === 'ops_rejected') return '#991b1b';
        if (status === 'not_awarded') return '#64748b';  // ← Dark grey text
        if (status === 'pending' || status === 'pending_admin') return '#92400e';
        return '#64748b';
      })()
    }}>
      Status: {getStatusText()}
    </span>
    {(() => {
      const q = originalQuotation;
      const status = q?.status;
      let actor = null;
      let label = null;
      let date = null;
      if (status === 'ops_approved') {
        actor = q.opsApprovedBySnapshot?.name || q.opsApprovedBy?.name;
        label = 'Approved by';
        date = q.opsApprovedAt;
      } else if (status === 'ops_rejected') {
        actor = q.opsApprovedBySnapshot?.name || q.opsRejectedBy?.name;
        label = 'Returned by';
        date = q.opsRejectedAt;
      } else if (status === 'approved' || status === 'awarded') {
        actor = q.approvedBySnapshot?.name || q.approvedBy?.name;
        label = 'Approved by';
        date = q.approvedAt;
      } else if (status === 'rejected') {
        actor = q.approvedBySnapshot?.name || q.rejectedBy?.name;
        label = 'Rejected by';
        date = q.rejectedAt;
      }
      if (!actor) return null;
      const dateStr = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
      return (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span>{label}</span>
          <strong style={{ color: '#374151' }}>{actor}</strong>
          {dateStr && <span>· {dateStr}</span>}
        </div>
      );
    })()}
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
            
            {/* PDF Download with Dropdown */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowPDFOptions(prev => !prev)} 
                disabled={isExporting} 
                style={{ 
                  ...btnStyle("#0369a1", isExporting), 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem' 
                }}
              >
                {isExporting ? <Loader size={16} style={styles.spinningIconSmall} /> : <Download size={16} />} 
                {isExporting ? "Generating…" : "Download PDF"}
              </button>
              
              {showPDFOptions && (
                <PDFOptionsDropdown 
                  onSelect={handlePDFOptionSelect}
                  onClose={() => setShowPDFOptions(false)}
                  isExporting={isExporting}
                />
              )}
            </div>
            
            <button onClick={handleGoToDashboard} style={btnStyle("#6366f1")}>
              <LayoutDashboard size={16} /> Dashboard
            </button>
          </div>
        </div>
        
        {/* Rejection/Return Reason Banner */}
        <ReasonBanner quotation={originalQuotation} />

        {/* Wrong-account banner — shown when ?action=review but wrong role is logged in */}
        {isWrongAccount && (
          <WrongAccountBanner
            currentUser={user}
            requiredRole={actionRequiredRole}
            onSwitch={handleSwitchAccount}
          />
        )}

        {/* Action Banner — shown when role and status require an action */}
        {(() => {
          const status = originalQuotation?.status;
          const role = user?.role;

          // ── Ops Manager reviewing a pending quotation ──
          if (role === 'ops_manager' && status === 'pending') {
            return (
              <ReviewBanner
                title="Action Required — Review This Quotation"
                meta="This quotation has been submitted and is awaiting your review. Approve to forward to Admin, or return for revision."
                approveLabel="Approve & Forward to Admin"
                rejectLabel="Return for Revision"
                rejectPlaceholder="Reason for returning (required)…"
                onApprove={handleOpsApprove}
                onReject={handleOpsReject}
                isApproving={isApproving}
                isRejecting={isRejecting}
                showRejectForm={showRejectForm}
                setShowRejectForm={setShowRejectForm}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                bannerStyle={styles.reviewBanner}
                onGoToDashboard={handleGoToDashboard}
              />
            );
          }
          if (role === 'ops_manager' && status === 'ops_approved') {
            return null;
          }

          // ── Admin reviewing an ops-approved or self-created (pending_admin) quotation ──
          if (role === 'admin' && (status === 'ops_approved' || status === 'pending_admin')) {
            return (
              <ReviewBanner
                title="Action Required — Awaiting Your Final Approval"
                meta={status === 'pending_admin'
                  ? "This quotation is awaiting your review and approval."
                  : "Operations Manager approved this quotation. Please review and make a final decision."}

                approveLabel="Approve"
                rejectLabel="Reject"
                rejectPlaceholder="Reason for rejection (required)…"
                onApprove={handleApprove}
                onReject={handleReject}
                isApproving={isApproving}
                isRejecting={isRejecting}
                showRejectForm={showRejectForm}
                setShowRejectForm={setShowRejectForm}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                bannerStyle={styles.reviewBanner}
                onGoToDashboard={handleGoToDashboard}
              />
            );
          }
          if (role === 'admin' && (status === 'approved' || status === 'awarded')) {
            return null;
          }
          if (role === 'admin' && status === 'rejected') {
            return null;
          }
          return null;
        })()}

        {/* Edit Mode Banner */}
        {isEditing && (
          <div style={styles.editModeBanner}>
            ✏️ <strong>Edit mode active</strong> — make your changes below, then click <strong>Save Changes</strong>.
          </div>
        )}
        
        {/* Main Content */}
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
          companyName={originalQuotation?.companySnapshot?.name || originalQuotation?.customer || ''}
  companyPhone={originalQuotation?.ourContact || originalQuotation?.createdBySnapshot?.phone || ''}
  companyEmail={originalQuotation?.salesManagerEmail || originalQuotation?.createdBySnapshot?.email || ''}
  companyTradeLicense={quotationData?.tl || originalQuotation?.tl || originalQuotation?.companySnapshot?.crNumber || ''}
  companyTaxRegistration={quotationData?.trn || originalQuotation?.trn || originalQuotation?.companySnapshot?.vatNumber || ''}
  selectedCurrency={originalQuotation?.currency?.code} 
        />
        
        {/* Document Preview Modal */}
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
                    const parent = e.target.parentElement;
                    if (parent) {
                      parent.innerHTML = '<div style="padding:2rem;color:#ef4444;">Failed to load image</div>';
                    }
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
          onClose={handleSnackbarClose} 
        />
      )}
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem", position: "sticky", top: 0, zIndex: 100, backgroundColor: "#f0f9ff", paddingTop: "0.5rem", paddingBottom: "0.75rem" },
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
  
  // Review Mode Banner
  reviewBanner: {
    background: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '0.75rem',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
  },
  reviewBannerTitle: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    fontWeight: 700, fontSize: '1rem', color: '#0C405A', marginBottom: '0.25rem',
  },

  // PDF Option Button
  pdfOptionButton: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    background: 'white',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.875rem',
    transition: 'background 0.2s'
  },
  
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