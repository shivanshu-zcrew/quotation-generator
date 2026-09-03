import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Download, Edit2, Save, X, ArrowLeft, LayoutDashboard, Loader, AlertCircle, AlertTriangle, CheckCircle, XCircle, LogIn, FilePlus, Info } from "lucide-react";
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuotation } from '../hooks/useQuotation';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import ConfirmModal from '../components/ConfirmModal';
import SaveTermsTemplateModal from '../components/SaveTermsTemplateModal';
import { btnStyle, outlineBtnStyle, outlineBtnHoverStyle, getFileIcon } from '../utils/quotationUtils';
import { formatFileSize } from '../utils/formatters';
import { useAppStore } from '../services/store';
import { getHomePath, quotationAPI } from '../services/api';
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
// "ALL COMPANIES" EDIT-BLOCKED BANNER
// ============================================================
// Editing a quotation always belongs to one specific company, but the
// header's company selector lets an admin pick "All Companies" (used for
// list/dashboard views). If that's still selected when they start editing,
// warn them up front — dismissible per edit session, with a close icon —
// rather than letting them fill out the form and only find out on Save.
const AllCompaniesBanner = ({ onDismiss }) => (
  <div style={{
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.75rem",
    padding: "0.875rem 1rem",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 12,
    margin: "0.75rem 0",
  }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem" }}>
      <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: "0.813rem", color: "#92400e", fontWeight: 500, lineHeight: 1.5 }}>
        You have "All Companies" selected. Please select a specific company from the company switcher to edit this quotation.
      </span>
    </div>
    <button
      onClick={onDismiss}
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, flexShrink: 0, color: "#d97706" }}
      aria-label="Dismiss"
    >
      <X size={16} />
    </button>
  </div>
);

// ============================================================
// REVIEW ACTION BANNER COMPONENT
// ============================================================
const ReviewBanner = ({
  title, meta, approveLabel, rejectLabel, rejectPlaceholder,
  onApprove, onReject, isApproving, isRejecting,
  showRejectForm, setShowRejectForm, rejectReason, setRejectReason,
  bannerStyle, onGoToDashboard, pendingLineCommentCount = 0,
  disabled = false,
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
      {disabled ? (
        // Approving/rejecting acts on the last-SAVED copy on the server —
        // now that saving no longer auto-approves (see updateQuotation's
        // isOpsManager branch), this banner stays visible for the whole
        // time an edit is in progress, not just for the instant between
        // save and approve. Without this guard, clicking Approve/Return
        // while mid-edit would silently discard any unsaved changes still
        // sitting in the form (the button acts on originalQuotation, not
        // the draft state) instead of erroring or warning about it.
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          fontSize: '0.85rem', color: '#0369a1', fontWeight: 600,
        }}>
          <AlertCircle size={16} />
          Save or cancel your edits first — approving/returning acts on the last saved version.
        </div>
      ) : !showRejectForm ? (
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
          {/* {onGoToDashboard && (
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
          )} */}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {pendingLineCommentCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
              background: '#fef3c7', border: '1px solid #f59e0b',
              color: '#78350f', fontSize: '0.8rem', fontWeight: 600,
            }}>
              💬 {pendingLineCommentCount} line-item comment{pendingLineCommentCount === 1 ? '' : 's'} will be saved with this {rejectLabel.toLowerCase()}. Click Cancel to discard {pendingLineCommentCount === 1 ? 'it' : 'them'} instead.
            </div>
          )}
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
    internalDocuments, newDocuments, reviewComments, handleAddComment, handleEditComment, handleResolveComment, handleDeleteComment,
    snackbar, setSnackbar, fieldErrors, originalQuotation,
    subtotal, taxAmount, discountAmount, grandTotal, amountInWords, items, previewDoc, setPreviewDoc,
    handleDocumentPreview, handleDataChange, addItem, removeItem, updateItem, handleImageUpload,
    removeNewImage, removeExistingImage, handleDocumentUpload, handleDocumentDelete, handleDocumentDownload,
    cancelEdit, handleSave, handleBack, generatePDF,
    termsImages, handleTermsImagesUpload, removeTermsImage,
    customerTaxTreatment,
    customerPlaceOfSupply,
    customerContactPersons,
    paymentTermOptions, selectedPaymentTermId, handleSelectPaymentTerm, handleDeletePaymentTerm,
    termsTemplates, selectedTermsTemplateId, showSaveTemplateModal, savingTermsTemplate,
    handleSelectTermsTemplate, handleOpenSaveTemplateModal, handleCloseSaveTemplateModal, handleSaveTermsTemplate,
    handleDeleteTermsTemplate
  } = useQuotation();

  // Local state
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStep, setSaveStep] = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStep, setPdfStep] = useState('');
  const [showPDFOptions, setShowPDFOptions] = useState(false);
  const [allCompaniesBannerDismissed, setAllCompaniesBannerDismissed] = useState(false);
  // Set when the user clicks Edit (or arrives via ?edit=true) while "All
  // Companies" is selected — blocks entering edit mode and keeps the
  // warning banner up even though isEditing never becomes true.
  const [editBlockedByAllCompanies, setEditBlockedByAllCompanies] = useState(false);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState({ open: false, kind: null });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Router hooks for wrong-account detection
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Store bindings
  const user = useAppStore(state => state.user);
  const handleLogout = useAppStore(s => s.handleLogout);
  const storeApprove = useAppStore(s => s.approveQuotation);
  const storeReject = useAppStore(s => s.rejectQuotation);
  const storeOpsApprove = useAppStore(s => s.opsApproveQuotation);
  const storeOpsReject = useAppStore(s => s.opsRejectQuotation);
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const isAllCompaniesSelected = selectedCompany === 'all' || selectedCompany === 'ALL';

  // Re-arm the "All Companies" warning banner each time editing starts,
  // so dismissing it once doesn't silently hide it on a later edit session.
  useEffect(() => {
    if (isEditing) setAllCompaniesBannerDismissed(false);
  }, [isEditing]);

  // Entering edit mode hides the review banner's approve/reject buttons
  // behind a "finish editing first" notice (see ReviewBanner's `disabled`
  // branch) — if the reject form was left open with a half-typed reason,
  // reset it here rather than leaving that draft silently stranded with no
  // indication it still exists once editing ends. A plain useEffect on
  // isEditing (matching the banner-dismiss effect above) rather than
  // resetting inline in the Edit button's onClick, since there's a second
  // way into edit mode — the ?edit=true auto-enter effect below — that
  // would otherwise miss this reset.
  useEffect(() => {
    if (isEditing) {
      setShowRejectForm(false);
      setRejectReason('');
    }
  }, [isEditing]);

  // Once the user switches off "All Companies" to a specific one, clear the
  // blocked-edit-attempt flag so the Edit button goes back to working normally.
  useEffect(() => {
    if (!isAllCompaniesSelected) setEditBlockedByAllCompanies(false);
  }, [isAllCompaniesSelected]);

  // Item-description text-selection comments staged while a reject/return
  // form is open — same select-text-to-comment interaction as everywhere
  // else on the page (see QuotationLayout's commentsFor), but held only in
  // local state (never posted) until Confirm is clicked, so Cancel — which
  // resets showRejectForm — can discard them for free via the effect below,
  // with nothing to clean up server-side.
  const [pendingLineComments, setPendingLineComments] = useState([]);
  useEffect(() => {
    setPendingLineComments([]);
  }, [showRejectForm]);
  const addPendingLineComment = useCallback((itemId, quote, prefix, suffix, comment) => {
    setPendingLineComments(prev => [...prev, {
      tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId, quote, prefix, suffix, comment,
      createdAt: new Date().toISOString(),
      createdBySnapshot: { name: user?.name || 'You' },
    }]);
  }, [user]);
  const removePendingLineComment = useCallback((tempId) => {
    setPendingLineComments(prev => prev.filter(c => c.tempId !== tempId));
  }, []);
  const editPendingLineComment = useCallback((tempId, newText) => {
    setPendingLineComments(prev => prev.map(c => c.tempId === tempId ? { ...c, comment: newText } : c));
    return { success: true };
  }, []);

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
  
  // 'cancelled' now only ever means the revise path (an approved quotation
  // being retired for a brand-new replacement document); 'amended' means
  // the amend path (a pre-approval quotation paused for an in-place edit) —
  // see cancelQuotation's status branching on the backend.
  const isCancelled = originalQuotation?.status === 'cancelled';
  const isAmended = originalQuotation?.status === 'amended';
  const isFinalised = ['awarded', 'not_awarded'].includes(originalQuotation?.status);
  const isRevisePath = isCancelled;

  // Whether this cancelled quotation already has an active (non-cancelled)
  // revision — if so, "Edit & Revise" must be blocked (the backend rejects
  // it anyway) since only one active revision is allowed at a time. The
  // quotation object already carries `activeRevision` when freshly fetched
  // via getQuotation; when it came from a list cache instead, fetch it
  // explicitly so this check works regardless of navigation path.
  const [activeRevisionCheck, setActiveRevisionCheck] = useState({ checked: false, revision: null });

  useEffect(() => {
    if (!isRevisePath || !originalQuotation?._id) {
      setActiveRevisionCheck({ checked: false, revision: null });
      return;
    }
    if (originalQuotation.activeRevision !== undefined) {
      setActiveRevisionCheck({ checked: true, revision: originalQuotation.activeRevision });
      return;
    }
    let cancelled = false;
    quotationAPI.getById(originalQuotation._id)
      .then((res) => { if (!cancelled) setActiveRevisionCheck({ checked: true, revision: res.data?.activeRevision || null }); })
      .catch(() => { if (!cancelled) setActiveRevisionCheck({ checked: true, revision: null }); });
    return () => { cancelled = true; };
  }, [isRevisePath, originalQuotation?._id, originalQuotation?.activeRevision]);

  // ── Review comments (highlight-and-comment annotations) ──────────────────
  // Same condition that gates the ReviewBanner: only the reviewer whose turn
  // it is to act can add new annotations.
  const canAddComments = useMemo(() => {
    const role = user?.role;
    const status = originalQuotation?.status;
    return (role === 'ops_manager' && status === 'pending')
      || (role === 'admin' && (status === 'ops_approved' || status === 'pending_admin'));
  }, [user?.role, originalQuotation?.status]);

  const isCreatorViewer = useMemo(() => {
    const creatorId = originalQuotation?.createdBy?._id || originalQuotation?.createdBy;
    return !!(creatorId && user?._id && String(creatorId) === String(user._id));
  }, [originalQuotation?.createdBy, user?._id]);

  const canManageComments = isCreatorViewer || user?.role === 'admin';

  const canDeleteComment = useCallback((comment) => {
    return user?.role === 'admin' || !!(comment?.createdBy && String(comment.createdBy) === String(user?._id));
  }, [user?.role, user?._id]);

  const commentsByTarget = useMemo(() => {
    const map = {};
    (reviewComments || []).forEach((c) => {
      const key = `${c.targetType}:${c.targetKey}`;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return map;
  }, [reviewComments]);

  // Edit is available for pre-approval statuses AND for cancelled/amended quotations (revision/amendment path)
  const canEdit = useCallback(() => {
    if (isEditing) return false;
    if (isFinalised) return false;
    if (isApproved) return false;
    // All three roles can edit a cancelled (revise) or amended quotation
    if (isCancelled || isAmended) return true;
    // Once a reviewer rejects/returns a quotation, only the creator (or admin)
    // may revise it — the reviewer's job is done until the creator resubmits.
    const status = originalQuotation?.status;
    if ((status === 'rejected' || status === 'ops_rejected') && !isCreatorViewer && user?.role !== 'admin') {
      return false;
    }
    // Once ops has forwarded to admin, only admin may edit — matches the
    // backend's editableStatuses gate (quotationController.js updateQuotation),
    // which 400s a creator/ops_manager save attempt on 'ops_approved'. Without
    // this check the Edit button renders for everyone but fails for them on save.
    if (status === 'ops_approved' && user?.role !== 'admin') {
      return false;
    }
    // Once it's with admin for final review — whether ops-approved-then-
    // escalated or self-created straight to pending_admin — it's exclusively
    // admin's to edit. Ops managers keep read-only visibility (see
    // getAllOpsQuotations' 'createdBySnapshot.role' filter) but not edit
    // access here; matches the backend's updateQuotation gate below.
    if (status === 'pending_admin' && user?.role === 'ops_manager') {
      return false;
    }
    return true;
  }, [isEditing, isApproved, isCancelled, isAmended, isFinalised, originalQuotation?.status, isCreatorViewer, user?.role]);

  // Auto-enter edit mode when arriving via ?edit=true (e.g. "Continue Editing"
  // on a draft from the quotations list), so drafts open straight into the
  // edit form instead of requiring a separate View → Edit click.
  useEffect(() => {
    if (!originalQuotation || isEditing) return;
    if (searchParams.get('edit') !== 'true') return;
    if (!canEdit()) return;
    if (isAllCompaniesSelected) {
      // Don't silently drop into edit mode against "All Companies" — block
      // it and surface the same warning banner the manual Edit button uses.
      setEditBlockedByAllCompanies(true);
      setAllCompaniesBannerDismissed(false);
    } else {
      setIsEditing(true);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      return next;
    }, { replace: true });
  }, [originalQuotation, isEditing, searchParams, canEdit, setSearchParams, setIsEditing, isAllCompaniesSelected]);

  // Cancel: admin can cancel an approved quotation (revise path).
  // The "Amend" path (cancelling a pre-approval quotation) is hidden for now.
  const canCancel = !isEditing && !isCancelled && !isAmended && !isFinalised &&
    isApproved && user?.role === 'admin';

  // Duplicate: only once a quotation has reached a final outcome
  // (approved / awarded / not awarded) — earlier-stage statuses (pending,
  // ops_approved, rejected, ops_rejected, pending_admin, cancelled) are
  // still live and should be edited/resubmitted, not duplicated.
  const canDuplicate = !isEditing && (originalQuotation?.status === 'approved' || isFinalised);

  // Handle cancel — calls API, stays on page with updated status
  const handleCancel = useCallback(async () => {
    if (!originalQuotation?._id) return;
    setIsCancelling(true);
    try {
      const res = await quotationAPI.cancel(originalQuotation._id, { cancelReason });
      if (res.data?.success) {
        setShowCancelModal(false);
        setCancelReason('');
        setSnackbar({ message: 'Quotation cancelled', type: 'success' });
        // Reload page so updated status is shown
        setTimeout(() => window.location.reload(), 900);
      } else {
        setSnackbar({ message: res.data?.message || 'Failed to cancel', type: 'error' });
      }
    } catch (err) {
      setSnackbar({ message: err?.response?.data?.message || 'Failed to cancel', type: 'error' });
    } finally {
      setIsCancelling(false);
    }
  }, [originalQuotation, cancelReason, setSnackbar]);

  // Handle duplicate — navigate to new quotation form pre-filled with this quotation's data
  const handleDuplicate = useCallback(() => {
    if (!originalQuotation) return;
    navigate('/quotation/new', {
      state: {
        prefillFrom: {
          ...originalQuotation,
          // No revisedFrom — this is a fresh quotation, not a revision
          revisedFrom: undefined,
          revisionNote: undefined,
          revisionNumber: undefined,
          isRevision: undefined,
          isAmendment: undefined,
          duplicatedFrom: originalQuotation._id,
          quotationNumber: '',   // user will enter a new one
          date: new Date().toISOString(),
        }
      }
    });
  }, [originalQuotation, navigate]);
  
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
      'not_awarded': 'Not Awarded',
      'cancelled': 'Cancelled',
      'amended': 'Amended',
    };
    return statusMap[status] || status || 'Draft';
  }, [originalQuotation?.status]);

  // Plain-language "what's happening / what's next" explanation of the
  // approval workflow, shown to everyone regardless of role — the
  // ReviewBanner below already tells the *current reviewer* that action is
  // required, but a creator (or anyone else) just watching a quotation move
  // through the pipeline previously had no explanation of where it stood.
  const getProcessMessage = useCallback(() => {
    switch (originalQuotation?.status) {
      case 'draft':
        return <>This quotation is a <strong>draft</strong> and hasn't been submitted yet.</>;
      case 'pending':
        return <>Submitted — waiting for <strong>Ops Manager</strong> review. Once approved, it moves to the <strong>Admin</strong> for final approval.</>;
      case 'pending_admin':
        return <>Submitted directly for admin review (no Ops Manager step) — waiting for <strong>Admin</strong> final approval.</>;
      case 'ops_approved':
        return <>Approved by the <strong>Ops Manager</strong> and forwarded — waiting for <strong>Admin</strong> final approval.</>;
      case 'ops_rejected':
        return <>Returned by the <strong>Ops Manager</strong> for changes. Edit and resubmit to send it back for review.</>;
      case 'rejected':
        return <>Rejected by the <strong>Admin</strong>. Edit and resubmit to send it back for review.</>;
      case 'approved':
        return <>Approved — ready to share with the client. Once they respond, mark it as <strong>Awarded</strong> or <strong>Not Awarded</strong>.</>;
      case 'awarded':
        return <>The client accepted this quotation — marked <strong>Awarded</strong>. No further action needed.</>;
      case 'not_awarded':
        return <>The client didn't proceed with this quotation — marked <strong>Not Awarded</strong>. No further action needed.</>;
      // 'cancelled' and 'amended' are intentionally not handled here — the
      // dedicated banner just below already covers both in full detail
      // (who cancelled it, why, and whether a revision already exists),
      // so a second generic message here would only risk contradicting it.
      default:
        return null;
    }
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

  // Persists any line-item comments staged during this reject/return
  // session, right before the reject/return itself is submitted — comments
  // only ever reach the backend as part of a confirmed reject, never on
  // Cancel (see the pendingLineComments effect above).
  const flushPendingLineComments = useCallback(async () => {
    for (const c of pendingLineComments) {
      const res = await handleAddComment({
        targetType: 'item',
        targetKey: String(c.itemId),
        quote: c.quote,
        prefix: c.prefix,
        suffix: c.suffix,
        comment: c.comment,
      });
      if (!res?.success) {
        return { success: false, error: res?.error || 'Failed to save a line comment' };
      }
    }
    return { success: true };
  }, [pendingLineComments, handleAddComment]);

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      setSnackbar({ show: true, message: 'Please provide a rejection reason', type: 'error' });
      return;
    }
    if (!originalQuotation?._id) return;
    setIsRejecting(true);
    try {
      const commentResult = await flushPendingLineComments();
      if (!commentResult.success) {
        setSnackbar({ show: true, message: commentResult.error, type: 'error' });
        return;
      }
      const result = await storeReject(originalQuotation._id, rejectReason.trim());
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to reject quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation rejected.', type: 'success' });
        setShowRejectForm(false);
        setRejectReason('');
        // Reload so the updated status/banner is shown (same pattern as handleCancel)
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to reject quotation', type: 'error' });
    } finally {
      setIsRejecting(false);
    }
  }, [originalQuotation?._id, rejectReason, storeReject, setSnackbar, flushPendingLineComments]);

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
      const commentResult = await flushPendingLineComments();
      if (!commentResult.success) {
        setSnackbar({ show: true, message: commentResult.error, type: 'error' });
        return;
      }
      const result = await storeOpsReject(originalQuotation._id, rejectReason.trim());
      if (result?.success === false) {
        setSnackbar({ show: true, message: result.error || 'Failed to return quotation', type: 'error' });
      } else {
        setSnackbar({ show: true, message: 'Quotation returned for revision.', type: 'success' });
        setShowRejectForm(false);
        setRejectReason('');
        // Reload so the updated status/banner is shown (same pattern as handleCancel)
        setTimeout(() => window.location.reload(), 900);
      }
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Failed to return quotation', type: 'error' });
    } finally {
      setIsRejecting(false);
    }
  }, [originalQuotation?._id, rejectReason, storeOpsReject, setSnackbar, flushPendingLineComments]);
  
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
        if (status === 'cancelled') return '#fce7f3';
        if (status === 'amended') return '#ffedd5';
        if (status === 'not_awarded') return '#f1f5f9';
        if (status === 'pending' || status === 'pending_admin') return '#fef3c7';
        return '#f1f5f9';
      })(),
      color: (() => {
        const status = originalQuotation?.status;
        if (status === 'approved' || status === 'awarded') return '#065f46';
        if (status === 'rejected' || status === 'ops_rejected') return '#991b1b';
        if (status === 'cancelled') return '#9d174d';
        if (status === 'amended') return '#9a3412';
        if (status === 'not_awarded') return '#64748b';
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
              <button
                disabled={isRevisePath && activeRevisionCheck.checked && !!activeRevisionCheck.revision}
                title={isRevisePath && activeRevisionCheck.revision ? `Already revised as ${activeRevisionCheck.revision.quotationNumber} — cancel that revision first` : undefined}
                onClick={() => {
                  // Revision: cancelled (post-approval) → create a NEW document (preserve the original)
                  if (isCancelled) {
                    if (activeRevisionCheck.checked && activeRevisionCheck.revision) return;
                    navigate('/quotation/new', {
                      state: {
                        prefillFrom: {
                          ...originalQuotation,
                          revisedFrom: originalQuotation._id,
                          revisionNote: '',
                          revisionNumber: undefined,
                          isRevision: undefined,
                          isAmendment: undefined,
                          cancelledFromStatus: undefined,
                          cancelledAt: undefined,
                          cancelledBy: undefined,
                          cancelReason: undefined,
                          status: undefined,
                        }
                      }
                    });
                  } else if (isAllCompaniesSelected) {
                    // Editing is scoped to one company — don't enter edit
                    // mode against "All Companies", just surface the banner.
                    setEditBlockedByAllCompanies(true);
                    setAllCompaniesBannerDismissed(false);
                  } else {
                    // Amendment or regular edit: in-place update. (The
                    // reject-form reset for entering edit mode lives in the
                    // isEditing effect above, not here — see its comment.)
                    setIsEditing(true);
                  }
                }}
                style={{ ...btnStyle('#0f172a', isRevisePath && activeRevisionCheck.checked && !!activeRevisionCheck.revision), display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Edit2 size={15} />
                {isCancelled ? 'Edit & Revise' : isAmended ? 'Edit & Amend' : 'Edit'}
              </button>
            )}

            {isEditing && (
              <>
                <button
                  onClick={handleSaveWithProgress}
                  disabled={isSaving}
                  style={{ ...btnStyle('#10b981', isSaving), display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isSaving ? <Loader size={15} style={styles.spinningIconSmall} /> : <Save size={15} />}
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={cancelEdit}
                  style={{ ...outlineBtnStyle(), color: '#dc2626' }}
                  onMouseEnter={(e) => Object.assign(e.currentTarget.style, outlineBtnHoverStyle)}
                  onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: '#fff', borderColor: '#d1d5db' })}
                >
                  <X size={15} /> Cancel
                </button>
              </>
            )}

            {/* Cancel button (approved → revise path), admin only. The "Amend" path
                (pre-approval quotations) is hidden for now — canCancel no longer
                allows it, so this always renders as "Cancel Quotation". */}
            {canCancel && (
              <button
                onClick={() => setShowCancelModal(true)}
                style={{ ...btnStyle(isApproved ? '#dc2626' : '#c2410c'), display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {isApproved ? <><XCircle size={15} /> Cancel Quotation</> : <><Edit2 size={15} /> Amend</>}
              </button>
            )}

            {/* Duplicate button — clone to a fresh new quotation */}
            {canDuplicate && (
              <button
                onClick={handleDuplicate}
                style={outlineBtnStyle()}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, outlineBtnHoverStyle)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: '#fff', borderColor: '#d1d5db' })}
              >
                <FilePlus size={15} /> Duplicate
              </button>
            )}

            {/* PDF Download with Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowPDFOptions(prev => !prev)}
                disabled={isExporting}
                style={outlineBtnStyle(isExporting)}
                onMouseEnter={(e) => !isExporting && Object.assign(e.currentTarget.style, outlineBtnHoverStyle)}
                onMouseLeave={(e) => !isExporting && Object.assign(e.currentTarget.style, { backgroundColor: '#fff', borderColor: '#d1d5db' })}
              >
                {isExporting ? <Loader size={15} style={styles.spinningIconSmall} /> : <Download size={15} />}
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

            <button
              onClick={handleGoToDashboard}
              style={outlineBtnStyle()}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, outlineBtnHoverStyle)}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: '#fff', borderColor: '#d1d5db' })}
            >
              <LayoutDashboard size={15} /> Dashboard
            </button>
          </div>
        </div>

        {/* "All Companies" selected while editing (or attempting to) — block-and-warn banner */}
        {(isEditing || editBlockedByAllCompanies) && isAllCompaniesSelected && !allCompaniesBannerDismissed && (
          <AllCompaniesBanner onDismiss={() => setAllCompaniesBannerDismissed(true)} />
        )}

        {/* Process status — plain-language explanation of where this quotation stands */}
        {!isEditing && getProcessMessage() && (
          <div style={{
            margin: '0.75rem 0', padding: '0.75rem 1rem',
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.6rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
          }}>
            <Info size={16} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.83rem', lineHeight: 1.5, color: '#1e3a8a' }}>
              {getProcessMessage()}
            </div>
          </div>
        )}

        {/* Rejection/Return Reason Banner */}
        <ReasonBanner quotation={originalQuotation} />

        {/* Cancelled (revise path) / Amended (amend path) info banner */}
        {(isCancelled || isAmended) && (
          <div style={{
            margin: '0.75rem 0', padding: '0.85rem 1.1rem',
            background: isCancelled ? '#fdf2f8' : '#fff7ed',
            border: `1px solid ${isCancelled ? '#f9a8d4' : '#fed7aa'}`,
            borderRadius: '0.6rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          }}>
            <XCircle size={18} color={isCancelled ? '#be185d' : '#c2410c'} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: '0.85rem', lineHeight: 1.55 }}>
              <span style={{ fontWeight: 700, color: isCancelled ? '#9d174d' : '#9a3412' }}>
                {isCancelled ? 'Quotation Cancelled — Revision Path' : 'Quotation Amended — Awaiting Edit'}
              </span>
              {originalQuotation?.cancelledBySnapshot?.name && (
                <span style={{ color: '#6b7280', marginLeft: 6 }}>
                  by {originalQuotation.cancelledBySnapshot.name}
                  {originalQuotation.cancelledAt && ` · ${new Date(originalQuotation.cancelledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </span>
              )}
              {originalQuotation?.cancelReason && (
                <div style={{ color: isCancelled ? '#7f1d1d' : '#9a3412', marginTop: 3 }}>
                  Reason: <em>{originalQuotation.cancelReason}</em>
                </div>
              )}
              {isRevisePath && activeRevisionCheck.checked && activeRevisionCheck.revision ? (
                <div style={{ color: '#7f1d1d', marginTop: 4, fontSize: '0.8rem' }}>
                  Already revised as{' '}
                  <span style={{ color: '#9d174d', fontWeight: 700 }}>
                    {activeRevisionCheck.revision.quotationNumber}
                  </span>{' '}
                  ({activeRevisionCheck.revision.status})
                  {activeRevisionCheck.revision.createdBySnapshot?.name && (
                    <>
                      {' '}— created by {activeRevisionCheck.revision.createdBySnapshot.name}
                      {activeRevisionCheck.revision.createdBySnapshot.role === 'admin' && ' (Admin)'}
                    </>
                  )}
                  .{' '}
                  {(user?.role === 'admin' || user?.role === 'ops_manager')
                    ? 'Cancel that revision first to create another one.'
                    : 'An admin or ops manager must cancel that revision before another one can be created.'}
                </div>
              ) : (
                <div style={{ color: '#6b7280', marginTop: 4, fontSize: '0.8rem' }}>
                  {isCancelled
                    ? 'Click "Edit & Revise" to update this quotation — it will receive a revision number (e.g. -R1) and restart the approval cycle.'
                    : 'Click "Edit & Amend" to update this quotation — it will restart the approval cycle.'}
                </div>
              )}
            </div>
          </div>
        )}

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
                onApprove={() => setApproveConfirm({ open: true, kind: 'ops' })}
                onReject={handleOpsReject}
                isApproving={isApproving}
                isRejecting={isRejecting}
                showRejectForm={showRejectForm}
                setShowRejectForm={setShowRejectForm}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                bannerStyle={styles.reviewBanner}
                onGoToDashboard={handleGoToDashboard}
                pendingLineCommentCount={pendingLineComments.length}
                disabled={isEditing}
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
                onApprove={() => setApproveConfirm({ open: true, kind: 'admin' })}
                onReject={handleReject}
                isApproving={isApproving}
                isRejecting={isRejecting}
                showRejectForm={showRejectForm}
                setShowRejectForm={setShowRejectForm}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                bannerStyle={styles.reviewBanner}
                onGoToDashboard={handleGoToDashboard}
                pendingLineCommentCount={pendingLineComments.length}
                disabled={isEditing}
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

        <ConfirmModal
          open={approveConfirm.open}
          title="Approve Quotation"
          message={
            approveConfirm.kind === 'ops'
              ? `Approve ${originalQuotation?.quotationNumber ? `quotation ${originalQuotation.quotationNumber}` : 'this quotation'} and forward it to Admin for final approval?`
              : `Approve ${originalQuotation?.quotationNumber ? `quotation ${originalQuotation.quotationNumber}` : 'this quotation'}? This finalizes the approval.`
          }
          confirmLabel="Approve"
          icon={CheckCircle}
          loading={isApproving}
          onConfirm={() => {
            const kind = approveConfirm.kind;
            setApproveConfirm({ open: false, kind: null });
            if (kind === 'ops') handleOpsApprove();
            else if (kind === 'admin') handleApprove();
          }}
          onCancel={() => setApproveConfirm({ open: false, kind: null })}
        />

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
          commentsByTarget={commentsByTarget}
          canAddComments={canAddComments}
          canManageComments={canManageComments}
          canDeleteComment={canDeleteComment}
          onAddComment={handleAddComment}
          onEditComment={handleEditComment}
          onResolveComment={handleResolveComment}
          onDeleteComment={handleDeleteComment}
          lineCommentMode={showRejectForm}
          pendingLineComments={pendingLineComments}
          onAddPendingLineComment={addPendingLineComment}
          onEditPendingLineComment={editPendingLineComment}
          onRemovePendingLineComment={removePendingLineComment}
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
          customerContactPersons={customerContactPersons}
          paymentTermOptions={paymentTermOptions}
          selectedPaymentTermId={selectedPaymentTermId}
          onSelectPaymentTerm={handleSelectPaymentTerm}
          onDeletePaymentTerm={handleDeletePaymentTerm}
          termsTemplates={termsTemplates}
          selectedTermsTemplateId={selectedTermsTemplateId}
          onSelectTermsTemplate={handleSelectTermsTemplate}
          onSaveTermsTemplateClick={handleOpenSaveTemplateModal}
          onDeleteTermsTemplate={handleDeleteTermsTemplate}
          isTemplateActionsDisabled={false}
          companyName={originalQuotation?.companySnapshot?.name || originalQuotation?.customer || ''}
  companyZohoOrgId={originalQuotation?.companySnapshot?.zohoOrganizationId || ''}
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

      {showSaveTemplateModal && (
        <SaveTermsTemplateModal
          onClose={handleCloseSaveTemplateModal}
          onSave={handleSaveTermsTemplate}
          saving={savingTermsTemplate}
        />
      )}

      {/* Cancel (approved → revise) / Amend (pre-approval) confirmation modal */}
      {showCancelModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={() => !isCancelling && setShowCancelModal(false)}>
          <div style={{
            background: '#fff', borderRadius: '1rem', padding: '2rem',
            width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '0.6rem',
                background: originalQuotation?.status === 'approved' ? '#fee2e2' : '#ffedd5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {originalQuotation?.status === 'approved'
                  ? <XCircle size={20} color="#dc2626" />
                  : <Edit2 size={20} color="#c2410c" />}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                  {originalQuotation?.status === 'approved' ? 'Cancel Approved Quotation' : 'Amend Quotation'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '1px' }}>
                  {originalQuotation?.quotationNumber}
                </div>
              </div>
              <button
                onClick={() => { if (!isCancelling) { setShowCancelModal(false); setCancelReason(''); } }}
                disabled={isCancelling}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: isCancelling ? 'default' : 'pointer', padding: '4px', borderRadius: '6px', color: '#9ca3af' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              background: originalQuotation?.status === 'approved' ? '#fff7ed' : '#fef2f2',
              border: `1px solid ${originalQuotation?.status === 'approved' ? '#fed7aa' : '#fecaca'}`,
              borderRadius: '0.6rem', padding: '0.85rem 1rem', marginBottom: '1.25rem',
              fontSize: '0.85rem', color: originalQuotation?.status === 'approved' ? '#92400e' : '#991b1b', lineHeight: 1.55,
            }}>
              {originalQuotation?.status === 'approved'
                ? <>This will cancel the <strong>approved</strong> quotation. The creator, ops manager, or admin can then open it and click <strong>"Edit &amp; Revise"</strong> — the system will apply a revision number (e.g. -R1) automatically.</>
                : <>This will mark the quotation as <strong>Amended</strong> (not a final cancellation). Any of the authorised roles can then reopen it and click <strong>"Edit &amp; Amend"</strong> to update and resubmit it through the normal approval flow.</>}
            </div>

            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
              Reason for {originalQuotation?.status === 'approved' ? 'cancellation' : 'amendment'} <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="e.g. Client requested major changes…"
              rows={3}
              autoFocus
              disabled={isCancelling}
              style={{
                width: '100%', padding: '0.7rem 0.85rem', border: '1px solid #d1d5db',
                borderRadius: '0.5rem', fontSize: '0.875rem', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.55,
                outline: 'none', opacity: isCancelling ? 0.6 : 1,
              }}
            />

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.25rem' }}>
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                  padding: '0.7rem 1rem', border: 'none', borderRadius: '0.5rem',
                  fontSize: '0.9rem', fontWeight: 700, cursor: isCancelling ? 'default' : 'pointer',
                  background: isCancelling
                    ? (originalQuotation?.status === 'approved' ? '#fca5a5' : '#fdba74')
                    : (originalQuotation?.status === 'approved' ? '#dc2626' : '#c2410c'),
                  color: '#fff',
                }}
              >
                {isCancelling
                  ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> {originalQuotation?.status === 'approved' ? 'Cancelling…' : 'Amending…'}</>
                  : originalQuotation?.status === 'approved'
                    ? <><XCircle size={16} /> Confirm Cancel</>
                    : <><Edit2 size={16} /> Confirm Amend</>}
              </button>
              <button
                onClick={() => { if (!isCancelling) { setShowCancelModal(false); setCancelReason(''); } }}
                disabled={isCancelling}
                style={{
                  padding: '0.7rem 1.1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem',
                  fontSize: '0.875rem', fontWeight: 600, cursor: isCancelling ? 'default' : 'pointer',
                  background: '#fff', color: '#374151', opacity: isCancelling ? 0.5 : 1,
                }}
              >
                Keep Quotation
              </button>
            </div>
          </div>
        </div>
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem", position: "sticky", top: 0, zIndex: 100, backgroundColor: "#f0f9ff", paddingTop: "0.5rem", paddingBottom: "0.75rem", borderBottom: "1px solid #e2e8f0" },
  title: { fontSize: "1.375rem", fontWeight: "700", color: "#1f2937", margin: 0 },
  headerActions: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  
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