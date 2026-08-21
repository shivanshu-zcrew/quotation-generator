import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Edit2, Save, Loader, AlertCircle, CheckCircle, Image, FileImage, Upload, FileText, Plus, Trash2, X } from "lucide-react";
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import SaveTermsTemplateModal from '../components/SaveTermsTemplateModal';
import { useAppStore } from '../services/store';
import useCustomerStore from '../services/customerStore';
import { useQuotations } from '../hooks/customHooks';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { sectionsToHTML, sectionsToHTMLWithoutImages, newSection, htmlToSections } from '../components/TermsCondition';
import { SkeletonRow } from '../components/SharedComponents';
import { MAX_IMAGE_SIZE_MB, MAX_IMAGES_PER_ITEM, ALLOWED_IMAGE_TYPES, CURRENCY_SYMBOLS } from '../utils/constants';
import { numberToWords } from "../utils/numberToWords";
import { getFileIcon, validateFile } from "../utils/quotationUtils";
import { formatFileSize, getDefaultExpiryDate, getTodayDate } from "../utils/formatters";
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { DEFAULT_COMPANY_NAME, SNACK_HIDE, VALIDATION_MESSAGES } from '../utils/constants';
import useItemStore from '../services/itemStore';
import LoadingOverlay from "../components/LoadingOverlay";
import ItemModal from "../components/AddItemModal";

// ============================================================
// S3 SERVICE IMPORTS
// ============================================================
import { quotationAPI, authAPI, termsTemplateAPI, paymentTermAPI } from '../services/api';
import { convertS3KeyToUrl, convertBatchS3KeysToUrls } from '../hooks/useS3Image';
import { uploadItemImage, uploadTermsImage } from "../utils/imageUpload";

// ============================================================
// LOADING COMPONENTS
// ============================================================

const ContentSkeleton = React.memo(() => (
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
      {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
    </div>
  </div>
));

const ActionButton = ({ onClick, disabled, bgColor, icon, label, loading, variant = "solid", loadingLabel }) => {
  const [hover, setHover] = useState(false);
  const outline = variant === "outline";
  const style = outline
    ? {
        ...styles.actionButton,
        backgroundColor: hover && !disabled ? "#f8fafc" : "#fff",
        color: disabled ? "#9ca3af" : "#374151",
        border: `1px solid ${disabled ? "#e5e7eb" : hover ? "#9ca3af" : "#d1d5db"}`,
      }
    : { ...styles.actionButton, backgroundColor: disabled ? "#d1d5db" : bgColor, opacity: disabled ? 0.6 : 1 };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading ? <Loader size={15} style={styles.spinningIconSmall} /> : icon} {loading ? (loadingLabel || "Saving...") : label}
    </button>
  );
};

const LoadingState = () => (
  <div style={styles.loadingState}>
    <Loader size={18} style={styles.spinningIconSmall} />
    <span>Loading catalogue items — dropdowns will be ready shortly…</span>
  </div>
);

const ErrorState = ({ message }) => (
  <div style={styles.errorState}>
    <AlertCircle size={18} />
    <span>Failed to load catalogue items: <strong>{message}</strong></span>
  </div>
);

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Whitespace-insensitive comparison for Terms & Conditions HTML — used to
// detect "this already matches a saved template" so Save-as-Template never
// creates a content duplicate under a different name.
const normalizeTemplateContent = (html) => (html || '').replace(/\s+/g, ' ').trim();

const getCurrencyObject = (currencyCode) => ({
  code: currencyCode || 'AED',
  symbol: CURRENCY_SYMBOLS[currencyCode] || currencyCode || 'د.إ'
});

const getCompanyName = (selectedCompany, companies) => {
  if (!selectedCompany) return DEFAULT_COMPANY_NAME;
  if (typeof selectedCompany === 'object' && selectedCompany?.name) return selectedCompany.name;
  const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
  return company?.name || DEFAULT_COMPANY_NAME;
};

const getCompanyZohoOrgId = (selectedCompany, companies) => {
  if (!selectedCompany) return '';
  if (typeof selectedCompany === 'object' && selectedCompany?.name) return selectedCompany.zohoOrganizationId || '';
  const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
  return company?.zohoOrganizationId || '';
};

const getCompanyDetails = (selectedCompany, companies) => {
  if (!selectedCompany) return { phone: '', email: '', tradeLicense: '', taxRegistration: '' };
  if (typeof selectedCompany === 'object' && selectedCompany?.name) {
    return {
      phone: selectedCompany.phone || '',
      email: selectedCompany.email || '',
      tradeLicense: selectedCompany.crNumber || '',
      taxRegistration: selectedCompany.vatNumber || ''
    };
  }
  const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
  return {
    phone: company?.phone || '',
    email: company?.email || '',
    tradeLicense: company?.crNumber || '',
    taxRegistration: company?.vatNumber || ''
  };
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function QuotationTemplate({ customer, selectedItems, selectedCompany, selectedCurrency, quotationData, onBack }) {
  if (!customer || !selectedItems) {
    return (
      <div style={styles.loadingContainer}>
        <Loader size={36} color="#0369a1" style={styles.spinningIcon} />
        <p style={styles.loadingText}>Loading quotation…</p>
      </div>
    );
  }
  return <QuotationTemplateInner customer={customer} selectedItems={selectedItems} selectedCompany={selectedCompany} selectedCurrency={selectedCurrency} quotationData={quotationData} onBack={onBack} />;
}

function QuotationTemplateInner({ customer, selectedItems, selectedCompany, selectedCurrency, quotationData: initialQuotationData, onBack }) {
  const navigate = useNavigate();
  const { companies, user } = useAppStore();
  const { addQuotation } = useQuotations();
  
  // Get company details for header display
  const companyDetails = useMemo(() => getCompanyDetails(selectedCompany, companies), [selectedCompany, companies]);
  const companyZohoOrgId = useMemo(() => getCompanyZohoOrgId(selectedCompany, companies), [selectedCompany, companies]);

  // State
  const [quotationNumber] = useState(() => {
    const companyCode = typeof selectedCompany === 'object' 
      ? selectedCompany?.code 
      : companies?.find(c => c._id === selectedCompany || c.code === selectedCompany)?.code;
    const prefix = companyCode || 'QT';
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  });
  const [uploadingImages, setUploadingImages] = useState({});
  const [keyUrlMap, setKeyUrlMap] = useState({}); // { s3Key: signedUrl } for displaying uploaded images
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [quotationItems, setQuotationItems] = useState([]);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [quotationData, setQuotationData] = useState({
    date: initialQuotationData?.date || getTodayDate(),
    expiryDate: initialQuotationData?.expiryDate || getDefaultExpiryDate(),
    projectName: initialQuotationData?.projectName || "",
    scopeOfWork: initialQuotationData?.scopeOfWork || "",
    
    // Customer/Left side fields
    customer: initialQuotationData?.customer || customer?.companyName || customer?.name || "",
    customerName: initialQuotationData?.customerName || customer?.contactPerson || "",
    customerPhone: initialQuotationData?.customerPhone || customer?.phone || "",
    customerEmail: initialQuotationData?.customerEmail || customer?.email || "",
    customerDesignation: initialQuotationData?.customerDesignation || customer?.designation || "",
    customerTradeLicenseNumber: initialQuotationData?.customerTradeLicenseNumber || customer?.tradeLicenseNumber || "",
    customerTaxRegistrationNumber: initialQuotationData?.customerTaxRegistrationNumber || customer?.vatNumber || "",
    remark: initialQuotationData?.remark || "",
    
    // Company/Right side fields - Use user data directly
    ourFocalPoint: user?.name || "",
    ourFocalPointDesignation: user?.designation || "",
    ourContact: user?.phone || "",
    salesManagerEmail: user?.email || "",
    
    ourRef: initialQuotationData?.ourRef || "",
    paymentTerms: initialQuotationData?.paymentTerms || "",
    deliveryTerms: initialQuotationData?.deliveryTerms || "",
    
    tl: companyDetails.tradeLicense || initialQuotationData?.tl || "",
  trn: companyDetails.taxRegistration || initialQuotationData?.trn || "", 
    tax: initialQuotationData?.tax || 0,
    discount: initialQuotationData?.discount || 0,
    notes: initialQuotationData?.notes || "",
    termsAndConditions: initialQuotationData?.termsAndConditions || "",
    termsImage: initialQuotationData?.termsImage || null,
    currency: initialQuotationData?.currency || getCurrencyObject(selectedCurrency),
    queryDate: initialQuotationData?.queryDate || "",
    revisedFrom: initialQuotationData?.revisedFrom || null,
    revisionNote: initialQuotationData?.revisionNote || "",
    originalQuotationNumber: initialQuotationData?.originalQuotationNumber || null,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [headerErrors, setHeaderErrors] = useState({});
  const [itemImages, setItemImages] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState("");
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStep, setSaveStep] = useState("");
  const [exportProgress, setExportProgress] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  // Seeded from initialQuotationData.termsAndConditions (populated for
  // revise/duplicate, see QuotationScreen.jsx) — without this, tcSections
  // always started blank regardless of what the original quotation had,
  // and since the submit payload is built FROM tcSections (not from
  // quotationData.termsAndConditions), the copied text silently never made
  // it into the new quotation even though it displayed fine in review.
  const [tcSections, setTcSections] = useState(() => {
    if (initialQuotationData?.termsAndConditions) {
      const sections = htmlToSections(initialQuotationData.termsAndConditions, []);
      if (sections.length) return sections;
    }
    return [newSection()];
  });
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedTermsTemplateId, setSelectedTermsTemplateId] = useState('');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [savingTermsTemplate, setSavingTermsTemplate] = useState(false);
  const [paymentTermOptions, setPaymentTermOptions] = useState([]);
  const [selectedPaymentTermId, setSelectedPaymentTermId] = useState('');
  const [snackbar, setSnackbar] = useState(SNACK_HIDE);
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [opsManagers, setOpsManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState(null);

  // Terms images state (now stores S3 keys instead of URLs)
  const [termsImages, setTermsImages] = useState([]);
  
  const showSnack = useCallback((msg, type = "error") => setSnackbar({ show: true, message: msg, type }), []);
  const hideSnack = useCallback(() => setSnackbar(SNACK_HIDE), []);

  // Fetch saved Terms & Conditions templates — shared across every company
  // (not scoped to whichever company is currently selected), so a template
  // saved under any company shows up here regardless of selectedCompany.
  useEffect(() => {
    let cancelled = false;
    termsTemplateAPI.getAll()
      .then((res) => { if (!cancelled) setTermsTemplates(res.data?.data || []); })
      .catch(() => { if (!cancelled) setTermsTemplates([]); }); // failure just leaves the dropdown empty — never blocks the form
    return () => { cancelled = true; };
  }, []);

  // Loading a saved template replaces the current Terms & Conditions text —
  // warn first if there's real content already there so nothing is lost by
  // accident. termsImages (separate S3-keyed state) is intentionally never
  // touched here; templates are text-only.
  const handleSelectTermsTemplate = useCallback((templateId) => {
    setSelectedTermsTemplateId(templateId);
    if (!templateId) return;
    const template = termsTemplates.find((t) => t._id === templateId);
    if (!template) return;

    const hasExistingContent = tcSections.some((s) => {
      const text = (s.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      return text.length > 0 || (s.heading || '').trim().length > 0;
    });
    if (hasExistingContent) {
      const confirmed = window.confirm('Loading this template will replace your current Terms & Conditions text. Continue?');
      if (!confirmed) { setSelectedTermsTemplateId(''); return; }
    }

    setTcSections(htmlToSections(template.content, []));
  }, [termsTemplates, tcSections]);

  const handleOpenSaveTemplateModal = useCallback(() => {
    const currentContent = normalizeTemplateContent(sectionsToHTML(tcSections));
    const duplicate = termsTemplates.find((t) => normalizeTemplateContent(t.content) === currentContent);
    if (duplicate) {
      setSelectedTermsTemplateId(duplicate._id);
      showSnack(`This already matches the saved template "${duplicate.name}" — no need to save it again.`, 'info');
      return;
    }
    setShowSaveTemplateModal(true);
  }, [tcSections, termsTemplates, showSnack]);

  const handleSaveTermsTemplate = useCallback(async (name) => {
    setSavingTermsTemplate(true);
    try {
      const content = sectionsToHTML(tcSections);
      const res = await termsTemplateAPI.create({ name, content });
      const created = res.data?.data;
      setTermsTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTermsTemplateId(created._id);
      setShowSaveTemplateModal(false);
      showSnack('Template saved', 'success');
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to save template', 'error');
    } finally {
      setSavingTermsTemplate(false);
    }
  }, [tcSections, showSnack]);

  const handleDeleteTermsTemplate = useCallback(async (templateId) => {
    const template = termsTemplates.find((t) => t._id === templateId);
    const confirmed = window.confirm(`Delete the saved template "${template?.name || 'this template'}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await termsTemplateAPI.delete(templateId);
      setTermsTemplates((prev) => prev.filter((t) => t._id !== templateId));
      setSelectedTermsTemplateId((prev) => (prev === templateId ? '' : prev));
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to delete template', 'error');
    }
  }, [termsTemplates, showSnack]);

  // Fetch saved Payment Terms — shared across every company, same as Terms
  // & Conditions templates above.
  useEffect(() => {
    let cancelled = false;
    paymentTermAPI.getAll()
      .then((res) => { if (!cancelled) setPaymentTermOptions(res.data?.data || []); })
      .catch(() => { if (!cancelled) setPaymentTermOptions([]); }); // failure just leaves the dropdown empty — never blocks the form
    return () => { cancelled = true; };
  }, []);

  // Pre-select the dropdown when the current Payment Terms text (e.g.
  // carried over from a revised/duplicated quotation) matches one of this
  // company's saved terms, so the dropdown reflects what's actually in the
  // field instead of showing "+ Add new" even though a saved value is there.
  useEffect(() => {
    if (!paymentTermOptions.length) return;
    const currentValue = (quotationData.paymentTerms || '').trim();
    if (!currentValue) return;
    const match = paymentTermOptions.find((t) => t.value === currentValue);
    if (match) setSelectedPaymentTermId(match._id);
  }, [paymentTermOptions, quotationData.paymentTerms]);

  const handleDeletePaymentTerm = useCallback(async (termId) => {
    const term = paymentTermOptions.find((t) => t._id === termId);
    const confirmed = window.confirm(`Remove "${term?.value || 'this term'}" from saved payment terms?`);
    if (!confirmed) return;
    try {
      await paymentTermAPI.delete(termId);
      setPaymentTermOptions((prev) => prev.filter((t) => t._id !== termId));
      setSelectedPaymentTermId((prev) => (prev === termId ? '' : prev));
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to remove payment term', 'error');
    }
  }, [paymentTermOptions, showSnack]);

  // Terms images upload directly to S3 (matches edit flow). The shared
  // TermsEditor passes raw File objects; we compress, upload, and store the
  // returned s3Key + a signed URL for display.
  const handleTermsImagesUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const remainingSlots = 10 - termsImages.length;
    if (remainingSlots <= 0) {
      showSnack('Maximum 10 terms images allowed', 'error');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      showSnack(`Only ${remainingSlots} more image(s) allowed`, 'error');
    }

    for (const file of filesToProcess) {
      // Already-processed objects (re-passed) — keep as-is.
      if (!(file instanceof File)) {
        if (file.url || file.base64 || file.s3Key) {
          setTermsImages(prev => [...prev, file]);
        }
        continue;
      }

      if (!file.type.startsWith('image/')) {
        showSnack(`"${file.name}" is not a supported image type.`, 'error');
        continue;
      }

      const tempId = `terms-img-${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);

      setTermsImages(prev => [...prev, {
        id: tempId,
        url: previewUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        isTemp: true,
        uploading: true,
        storageProvider: 's3',
        uploadedAt: new Date().toISOString(),
      }]);

      try {
        const key = await uploadTermsImage(file);
        const signedUrl = await convertS3KeyToUrl(key);

        setTermsImages(prev => prev.map(img =>
          img.id === tempId
            ? {
                id: tempId,
                url: signedUrl || previewUrl,
                s3Key: key,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                isTemp: false,
                uploading: false,
                storageProvider: 's3',
                uploadedAt: new Date().toISOString(),
              }
            : img
        ));
        // Keep the blob alive if the signed URL didn't resolve, so the preview
        // still shows (the s3Key persists for a fresh URL on reload).
        if (signedUrl && previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
      } catch (err) {
        setTermsImages(prev => prev.filter(img => img.id !== tempId));
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        showSnack(`Failed to upload "${file.name}": ${err.message}`, 'error');
      }
    }
  }, [termsImages.length, showSnack]);
  
  const handleRemoveTermsImage = useCallback((imageId) => {
    setTermsImages(prev => prev.filter(img => img.id !== imageId));
  }, []);
  
  // Initialize quotation items from selected items
  useEffect(() => {
    if (!selectedItems?.length || quotationItems.length) return;
    
    const itemsMap = new Map();
    selectedItems.forEach((item, index) => {
      itemsMap.set(item.id || `qt-item-${Date.now()}-${index}`, {
        id: item.id || `qt-item-${Date.now()}-${index}`,
        name: item.name,
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || '',
        unitPrice: Number(item.unitPrice) || 0,
        // S3 keys for images
        imageS3Keys: item.imageS3Keys || []
      });
    });
    setQuotationItems(Array.from(itemsMap.values()));
  }, [selectedItems, quotationItems.length]);

  // Convert uploaded S3 keys into signed URLs so they can be shown as thumbnails.
  // Runs whenever items change; only fetches keys we don't already have a URL for.
  useEffect(() => {
    const allKeys = [];
    quotationItems.forEach(item => {
      (item.imageS3Keys || []).forEach(k => {
        if (k && !keyUrlMap[k]) allKeys.push(k);
      });
    });
    if (!allKeys.length) return;

    let cancelled = false;
    (async () => {
      const urls = await convertBatchS3KeysToUrls(allKeys);
      if (cancelled) return;
      setKeyUrlMap(prev => ({ ...prev, ...urls }));
    })();
    return () => { cancelled = true; };
  }, [quotationItems]);
  
  // Add this useEffect to auto-populate customer fields when the selected client changes
  useEffect(() => {
    if (customer) {
      setQuotationData(prev => ({
        ...prev,
        customer: customer.companyName || customer.name || "",
        customerTaxRegistrationNumber: customer.vatNumber || customer.trn || customer.taxRegistrationNumber || "",
        customerDesignation: customer.designation || "",
        customerTradeLicenseNumber: customer.tradeLicenseNumber || "",
      }));
    }
  }, [customer]);

  // Add this useEffect to auto-populate creator (user) details on the right side
  useEffect(() => {
    if (user && !quotationData.ourFocalPoint) {
      setQuotationData(prev => ({
        ...prev,
        ourFocalPoint: user.name || "",
        ourFocalPointDesignation: user.designation || "",
        ourContact: user.phone || "",
        salesManagerEmail: user.email || "",
      }));
    }
  }, [user]);

  // Update currency when changed
  useEffect(() => {
    setQuotationData(prev => ({ ...prev, currency: getCurrencyObject(selectedCurrency) }));
  }, [selectedCurrency]);

  const subtotal = useMemo(() => 
    quotationItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0), 
    [quotationItems]
  );

  const discountAmount = useMemo(() => 
    subtotal * (quotationData.discount || 0) / 100, 
    [subtotal, quotationData.discount]
  );

  const subtotalAfterDiscount = useMemo(() => 
    subtotal - discountAmount, 
    [subtotal, discountAmount]
  );

  const taxAmount = useMemo(() => 
    subtotalAfterDiscount * (quotationData.tax || 0) / 100, 
    [subtotalAfterDiscount, quotationData.tax]
  );

  const grandTotal = useMemo(() => 
    subtotalAfterDiscount + taxAmount, 
    [subtotalAfterDiscount, taxAmount]
  );

  // numberToWords floors its input rather than rounding it, so feeding it
  // the raw grandTotal (which still carries cents) could describe a
  // different whole number than the one shown on screen, which rounds to
  // the nearest unit (see QuotationLayout's Grand Total cell). Round here
  // too so both always agree.
  const amountInWords = useMemo(() => numberToWords(Math.round(grandTotal)), [grandTotal]);

  // Images to display per item: uploaded keys (as signed URLs) + any live previews
  // still uploading. This is what keeps an image visible after its upload finishes.
  const displayImages = useMemo(() => {
    const map = {};
    quotationItems.forEach(item => {
      const keyUrls = (item.imageS3Keys || []).map(k => keyUrlMap[k]).filter(Boolean);
      const previews = itemImages[item.id] || [];
      map[item.id] = [...keyUrls, ...previews];
    });
    return map;
  }, [quotationItems, keyUrlMap, itemImages]);

  const companyName = useMemo(() => getCompanyName(selectedCompany, companies), [selectedCompany, companies]);
  const hasAnyError = Object.keys(headerErrors).length > 0 || Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);

  // Calculate total image count for progress
  const totalImageCount = useMemo(() => {
    let count = 0;
    quotationItems.forEach(item => {
      count += (item.imageS3Keys?.length || 0);
    });
    return count;
  }, [quotationItems]);

  // Handlers
  const handleDataChange = useCallback((field, value) => {
    setQuotationData(prev => ({ ...prev, [field]: value }));
    setHeaderErrors(prev => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Selecting a saved payment term pre-fills the free-text field — it
  // remains fully editable afterward, same as the contact-person picker.
  const handleSelectPaymentTerm = useCallback((termId) => {
    setSelectedPaymentTermId(termId);
    if (!termId) return;
    const term = paymentTermOptions.find((t) => t._id === termId);
    if (term) handleDataChange('paymentTerms', term.value);
  }, [paymentTermOptions, handleDataChange]);

  const validateAll = useCallback(() => {
    const errors = {};
    if (!quotationData.date) errors.date = VALIDATION_MESSAGES.REQUIRED_DATE;
    if (!quotationData.expiryDate) errors.expiryDate = VALIDATION_MESSAGES.REQUIRED_EXPIRY;
    if (quotationData.date && quotationData.expiryDate && new Date(quotationData.expiryDate) < new Date(quotationData.date)) {
      errors.expiryDate = VALIDATION_MESSAGES.EXPIRY_BEFORE_DATE;
    }
    
    // Validate required left side fields
    if (!quotationData.projectName?.trim()) {
      errors.projectName = "Project Name is required";
    }
    if (!quotationData.customer?.trim()) {
      errors.customer = "Company Name is required";
    }
    if (!quotationData.customerPhone?.trim()) {
      errors.customerPhone = "Phone number is required";
    }
    if (!quotationData.customerEmail?.trim()) {
      errors.customerEmail = "Email is required";
    }
    
    if (Object.keys(errors).length) {
      setHeaderErrors(errors);
      const firstErrorKey = Object.keys(errors)[0];
      const firstErrorMessage = errors[firstErrorKey];
      showSnack(firstErrorMessage, "error");
      return false;
    }
    
    if (!quotationItems.length) {
      showSnack(VALIDATION_MESSAGES.REQUIRED_ITEM, "error");
      return false;
    }
    
    for (const item of quotationItems) {
      const qr = validateQuantity(item.quantity);
      if (!qr.isValid) { 
        showSnack(`"${item.name || 'Item'}" — ${qr.error}`, "error"); 
        return false; 
      }
      const pr = validatePrice(item.unitPrice);
      if (!pr.isValid) { 
        showSnack(`"${item.name || 'Item'}" — ${pr.error}`, "error"); 
        return false; 
      }
    }
    
    return true;
  }, [quotationData, quotationItems, showSnack]);
  
  const addMoreItem = useCallback(() => {
    setEditingItem(null);
    setIsAddItemModalOpen(true);
  }, []);
  
  const removeItem = useCallback((id) => {
    setQuotationItems(prev => prev.filter(i => i.id !== id));
    setItemImages(prev => { const { [id]: _, ...rest } = prev; return rest; });
    setFieldErrors(prev => { const { [id]: _, ...rest } = prev; return rest; });
  }, []);
  
  const handleAddManualItem = useCallback((newItem) => {
    setQuotationItems(prev => [...prev, newItem]);
    showSnack("Item added successfully", "success");
  }, [showSnack]);
  
  const handleEditItem = useCallback((updatedItem) => {
    setQuotationItems(prev => prev.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    showSnack("Item updated successfully", "success");
    setEditingItem(null);
  }, [showSnack]);
  
  const handleOpenEditModal = useCallback((item) => {
    setEditingItem(item);
    setIsAddItemModalOpen(true);
  }, []);
  
  const updateItem = useCallback((id, field, value) => {
    setQuotationItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);
  
  const handleImageUpload = useCallback(async (e, itemId) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset input so same file can be re-picked
    if (!files.length) return;
   
    const itemIndex = quotationItems.findIndex((i) => i.id === itemId);
   
    // Count current images (already-uploaded keys + previews in flight).
    const item = quotationItems.find((i) => i.id === itemId);
    const currentCount =
      (item?.imageS3Keys?.length || 0) + (itemImages[itemId]?.length || 0);
    const slots = MAX_IMAGES_PER_ITEM - currentCount;
   
    if (slots <= 0) {
      showSnack(`Max ${MAX_IMAGES_PER_ITEM} images per item.`);
      return;
    }
   
    const toProcess = files.slice(0, slots);
    if (files.length > slots) {
      showSnack(`Only ${slots} slot(s) left — first ${slots} of ${files.length} will be added.`);
    }
   
    // Validate types/sizes up front (pre-compression size check).
    const valid = [];
    for (const file of toProcess) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showSnack(`"${file.name}" is not a supported type.`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showSnack(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;
   
    setUploadingImages((prev) => ({ ...prev, [itemId]: true }));
   
    // Upload each valid file directly to S3. Show a local preview immediately,
    // then attach the returned key. If an upload fails, drop its preview.
    for (const file of valid) {
      const previewUrl = URL.createObjectURL(file);
   
      // Show preview right away.
      setItemImages((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), previewUrl],
      }));
   
      try {
        const key = await uploadItemImage(file, itemIndex >= 0 ? itemIndex : undefined);
   
        // Attach the S3 key to the item; remove the local preview (the key now
        // represents this image and will render via signed URL on reload).
        setQuotationItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? { ...it, imageS3Keys: [...(it.imageS3Keys || []), key] }
              : it
          )
        );
        setItemImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter((u) => u !== previewUrl),
        }));
        URL.revokeObjectURL(previewUrl);
      } catch (err) {
        // Upload failed — remove the preview and tell the user.
        setItemImages((prev) => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter((u) => u !== previewUrl),
        }));
        URL.revokeObjectURL(previewUrl);
        showSnack(`Failed to upload "${file.name}": ${err.message}`, 'error');
      }
    }
   
    setUploadingImages((prev) => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    setEditingImageId(null);
  }, [quotationItems, itemImages, showSnack]);
  
  const handleRemoveImage = useCallback((itemId, imageIndex) => {
    setQuotationItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const keyCount = item.imageS3Keys?.length || 0;
      if (imageIndex < keyCount) {
        // Remove an uploaded S3 key
        return { ...item, imageS3Keys: item.imageS3Keys.filter((_, i) => i !== imageIndex) };
      }
      return item;
    }));
    // Also clear any matching local preview (preview indices come after keys)
    setItemImages(prev => {
      const keyCount = (quotationItems.find(i => i.id === itemId)?.imageS3Keys?.length || 0);
      const previewIndex = imageIndex - keyCount;
      if (previewIndex < 0) return prev;
      return {
        ...prev,
        [itemId]: (prev[itemId] || []).filter((_, i) => i !== previewIndex),
      };
    });
  }, [quotationItems]);
  
  const handleManagerPicker = useCallback(async () => {
    if (!validateAll()) return;
    if (!selectedCompany) { showSnack("Please select a company", "error"); return; }
    if (Object.keys(uploadingImages).length > 0) {
      showSnack("Please wait — images are still uploading.", "error");
      return;
    }
    // Admin quotations go to pending_admin — no ops email, skip picker
    if (user?.role === 'admin') { handleSubmitWithEmails([]); return; }

    setManagersLoading(true);
    setSelectedManagerId(null);
    setManagerModalOpen(true);
    try {
      const res = await authAPI.getOpsManagers();
      setOpsManagers(res.data?.managers || []);
    } catch {
      showSnack("Failed to load managers", "error");
      setManagerModalOpen(false);
    } finally {
      setManagersLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateAll, selectedCompany, uploadingImages, user, showSnack]);

  const handleSubmitWithEmails = useCallback(async (notifyManagerEmails) => {
    setManagerModalOpen(false);
    if (!validateAll()) return;
    if (!selectedCompany) {
      showSnack("Please select a company", "error");
      return;
    }

    // Don't allow submit while images are still uploading.
    if (Object.keys(uploadingImages).length > 0) {
      showSnack("Please wait — images are still uploading.", "error");
      return;
    }
  
    setIsSaving(true);
    setSaveProgress(10);
    setSaveStep("Preparing data...");
  
    try {
      let finalTermsAndConditions = "";
  
      if (tcSections && tcSections.length > 0) {
        finalTermsAndConditions = tcSections
          .map(sec => {
            let text = "";
            if (sec.heading?.trim()) text += sec.heading + "\n\n";
            if (sec.content?.trim()) text += sec.content;
            return text.trim();
          })
          .filter(Boolean)
          .join("\n\n");
      }
  
      // Filter existing S3 term images (already uploaded)
      const existingTermsImages = termsImages
        .filter(img => img.s3Key && !img.url?.startsWith('data:'))
        .map(img => ({
          s3Key: img.s3Key,
          fileName: img.fileName,
          uploadedAt: img.uploadedAt || new Date().toISOString(),
          storageProvider: 's3'
        }));
  
      // New base64 images that need to be uploaded
      const newBase64Images = termsImages.filter(img => img.url && img.url.startsWith('data:'));
      
      const formattedItems = quotationItems.map(item => ({
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || '',
        unitPrice: Number(item.unitPrice) || 0,
        imageS3Keys: item.imageS3Keys || [],   // keys only — no base64
      }));
  
      const quotation = {
        quotationNumber: quotationNumber, 
        companyId: typeof selectedCompany === 'object' ? selectedCompany._id : selectedCompany,
        currencyCode: selectedCurrency,
        customerId: customer._id,
        
        projectName: quotationData.projectName?.trim(),
        scopeOfWork: quotationData.scopeOfWork?.trim() || "",
        
        customer: quotationData.customer?.trim(),
        customerName: quotationData.customerName?.trim() || "",
        customerPhone: quotationData.customerPhone?.trim() || "",
        customerEmail: quotationData.customerEmail?.trim() || "",
        customerDesignation: quotationData.customerDesignation?.trim() || "",
        customerTradeLicenseNumber: quotationData.customerTradeLicenseNumber?.trim() || "",
        customerTaxRegistrationNumber: quotationData.customerTaxRegistrationNumber?.trim() || "",
        
        contact: quotationData.customerPhone?.trim() || "",
        
        ourFocalPoint: quotationData.ourFocalPoint?.trim() || user?.name || "",
        ourFocalPointDesignation: quotationData.ourFocalPointDesignation?.trim() || "",
        ourContact: quotationData.ourContact?.trim() || user?.phone || "",
        salesManagerEmail: quotationData.salesManagerEmail?.trim() || user?.email || "",
        
        date: quotationData.date || getTodayDate(),
        expiryDate: quotationData?.expiryDate,
        queryDate: quotationData.queryDate || null,
        remark: quotationData.remark?.trim() || "",
        ourRef: quotationData.ourRef?.trim() || "",
        paymentTerms: quotationData.paymentTerms?.trim() || "",
        deliveryTerms: quotationData.deliveryTerms?.trim() || "",
        
        // ✅ COMPANY'S TL AND TRN - Use companyDetails (from selected company) as primary source
        // Fall back to quotationData.tl/trn if user has edited them
        tl: (companyDetails.tradeLicense?.trim()) || quotationData.tl?.trim() || "",
        trn: (companyDetails.taxRegistration?.trim()) || quotationData.trn?.trim() || "",
        
        taxPercent: Number(quotationData.tax) || 0,
        discountPercent: Number(quotationData.discount) || 0,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: finalTermsAndConditions,
        termsTemplateId: selectedTermsTemplateId || undefined,
        termsImages: newBase64Images,
        existingTermsImages: existingTermsImages,
        items: formattedItems,
        internalDocuments: uploadedDocuments.map(doc => doc.fileData),
        internalDocDescriptions: uploadedDocuments.map(doc => doc.description || ''),
        revisedFrom: quotationData.revisedFrom || undefined,
        revisionNote: quotationData.revisionNote?.trim() || undefined,
        notifyManagerEmails: notifyManagerEmails || [],
      };

      const result = await addQuotation(quotation);

      if (result?.success) {
        // The backend echoes back the customer's up-to-date contactPersons
        // after syncing this quotation's contact onto them — patch it into
        // the customer picker's cache so the *next* "create quotation" shows
        // it immediately, instead of only after a full page reload.
        if (result.customerContactPersons && customer?._id) {
          useCustomerStore.getState().updateCustomerContactPersons(customer._id, result.customerContactPersons);
        }
        setTermsImages([]);
        showSnack(`Quotation ${quotationNumber} created successfully!`, "success");
        // Remember this payment terms value for reuse on future quotations —
        // fire-and-forget, the quotation itself already saved successfully
        // and this must never surface an error or block navigation.
        if (quotation.paymentTerms?.trim()) {
          paymentTermAPI.create({ value: quotation.paymentTerms.trim() })
            .then((res) => {
              const saved = res.data?.data;
              if (saved) {
                setPaymentTermOptions((prev) => (
                  prev.some((t) => t._id === saved._id) ? prev : [...prev, saved].sort((a, b) => a.value.localeCompare(b.value))
                ));
              }
            })
            .catch(() => {});
        }
        setTimeout(() => navigate(user?.role === 'admin' ? '/admin' : '/home'), 1200);
      } else {
        showSnack(result?.error || "Failed to create quotation", "error");
      }
    } catch (err) {
      console.error('Submit error:', err);
      showSnack(err?.response?.data?.message || err.message || "Error creating quotation", "error");
    } finally {
      setIsSaving(false);
      setSaveProgress(0);
      setSaveStep("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateAll, selectedCompany, customer, quotationData, quotationItems, uploadedDocuments, tcSections, termsImages, addQuotation, user, navigate, showSnack, quotationNumber, selectedCurrency, uploadingImages]);

  const handleExportPDF = useCallback(async () => {
    if (!validateAll()) return;
    setIsExporting(true);
    setExportProgress(10);
    setExportStep("Preparing PDF...");
    setImageCount(totalImageCount);

    try {
      // Item images and Terms & Conditions images are passed through as-is
      // (raw imagePaths/imageS3Keys, raw section content/gallery images) —
      // buildPDFHTML (utils/pdfGenerator.js, called below via
      // downloadQuotationPDF) already does its own S3-to-base64 conversion
      // for all of these, preferring a server-side fetch over a browser
      // canvas read. Converting them here too used to be duplicate work
      // that used ONLY the browser canvas method — which silently fails for
      // any S3-hosted image, since the bucket sends no CORS headers, and
      // crossOrigin='anonymous' + canvas.toDataURL() then throws a CORS
      // error and resolves null. That failure was invisible in the final
      // PDF (buildPDFHTML's own conversion of the same images from
      // imageS3Keys still succeeded), but it was real wasted work and a
      // console full of CORS errors on every export.
      const companySnapshot = typeof selectedCompany === 'object' && selectedCompany?.name
        ? selectedCompany
        : companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);

      let allTermsImages = [];
      if (tcSections && tcSections.length > 0) {
        tcSections.forEach((section, sectionIdx) => {
          if (section.images && section.images.length > 0) {
            section.images.forEach((img, imgIdx) => {
              if (img.url || img.s3Key) {
                allTermsImages.push({
                  s3Key: img.s3Key,
                  url: img.url,
                  fileName: img.fileName || `image_${sectionIdx + 1}_${imgIdx + 1}`,
                  caption: img.caption || ''
                });
              }
            });
          }
        });
      }

      const termsHTML = tcSections.length > 0 ? sectionsToHTML(tcSections) : '';

      setExportProgress(60);
      setExportStep("Generating PDF...");

      const pdfQuotation = {
        quotationNumber: quotationNumber,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        projectName: quotationData.projectName || '',
        scopeOfWork: quotationData.scopeOfWork || '',
        customer: quotationData.customer || customer?.name || '',
        customerName: quotationData.customerName || '',
        contact: quotationData.contact || customer?.phone || '',
        customerDesignation: quotationData.customerDesignation || '',
        customerTradeLicenseNumber: quotationData.customerTradeLicenseNumber || '',
        ourFocalPointDesignation: quotationData.ourFocalPointDesignation || '',
        remark: quotationData.remark?.trim() || "",
        ourRef: quotationData.ourRef || '',
        ourContact: quotationData.ourContact || '',
        salesManagerEmail: quotationData.salesManagerEmail || '',
        paymentTerms: quotationData.paymentTerms || '',
        deliveryTerms: quotationData.deliveryTerms || '',
        tl: quotationData.tl || '',
        trn: quotationData.trn || customer?.trn || '',
        tax: Number(quotationData.tax) || 0,
        discount: Number(quotationData.discount) || 0,
        notes: quotationData.notes || '',
        currency: { code: selectedCurrency || 'AED' },
        items: quotationItems,
        taxPercent: Number(quotationData.tax) || 0,
        discountPercent: Number(quotationData.discount) || 0,
        customerSnapshot: { 
          name: customer?.name || quotationData.customer, 
          email: customer?.email, 
          phone: customer?.phone, 
          address: customer?.address,
          designation: quotationData.customerDesignation || customer?.designation,
          tradeLicenseNumber: quotationData.customerTradeLicenseNumber || customer?.tradeLicenseNumber
        },
        companySnapshot: companySnapshot ? { 
          name: companyName, 
          ...companySnapshot,
          focalPointDesignation: quotationData.ourFocalPointDesignation
        } : { name: companyName },
        termsAndConditions: termsHTML,
        termsImages: allTermsImages,
        companyPhone: companyDetails.phone,
        companyEmail: companyDetails.email,
        companyTradeLicense: companyDetails.tradeLicense,
        companyTaxRegistration: companyDetails.taxRegistration
      };
      
      setExportProgress(90);
      setExportStep("Finalizing PDF...");
      await downloadQuotationPDF(pdfQuotation);
      
      setExportProgress(100);
      setExportStep("Complete!");
      showSnack("PDF downloaded successfully!", "success");
      
    } catch (err) {
      console.error('PDF export error:', err);
      showSnack(err?.message || "Failed to export PDF", "error");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStep("");
    }
  }, [validateAll, quotationData, quotationItems, quotationNumber, selectedCurrency, selectedCompany, companies, customer, companyName, tcSections, showSnack, totalImageCount, companyDetails]);
  
 const handleDocumentUpload = useCallback(async (files, descriptions) => {
  try {
    const MAX_INTERNAL_DOCS = 5;
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    // Filter ZIP files
    const validFiles = incoming.filter(file => {
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
      if (isZip) {
        showSnack('ZIP files are not allowed', 'error');
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    const currentCount = uploadedDocuments.length;
    const slots = MAX_INTERNAL_DOCS - currentCount;
    if (slots <= 0) {
      showSnack(`Maximum ${MAX_INTERNAL_DOCS} documents allowed`, 'error');
      return;
    }

    const toProcess = validFiles.slice(0, slots);
    
    // Convert to base64 (same as view/edit)
    const base64Promises = toProcess.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          fileData: reader.result,
          name: file.name,
          type: file.type,
          size: file.size,
        });
        reader.readAsDataURL(file);
      });
    });

    const base64Files = await Promise.all(base64Promises);
    
    // ✅ IMPORTANT: Use SAME structure as view/edit
    const newDocs = base64Files.map((file, index) => ({
      id: `temp-${Date.now()}-${index}`,  // Keep as id for temp
      _id: `temp-${Date.now()}-${index}`,  // Add _id for compatibility
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileData: file.fileData,  // Base64 data
      description: (descriptions && descriptions[index]) || '',
      uploadedAt: new Date().toISOString(),
      isTemp: true
    }));

    setUploadedDocuments(prev => [...prev, ...newDocs]);
    showSnack(`${newDocs.length} document(s) added`, 'success');
    
  } catch (error) {
    console.error('Upload error:', error);
    showSnack('Failed to process documents', 'error');
  }
}, [uploadedDocuments.length, showSnack]);


const handleDocumentDelete = useCallback((docId) => {
  const isTemp = uploadedDocuments.some(d => 
    (d.id === docId || d._id === docId) && d.isTemp
  );
  
  if (isTemp) {
    setUploadedDocuments(prev => prev.filter(d => 
      d.id !== docId && d._id !== docId
    ));
    showSnack('Document removed', 'success');
  } else {
    
    setUploadedDocuments(prev => prev.filter(d => 
      d.id !== docId && d._id !== docId
    ));
    showSnack('Document removed', 'success');
  }
}, [uploadedDocuments, showSnack]);

const handleDocumentDownload = useCallback((docId) => {
  const doc = uploadedDocuments.find(d => 
    d._id === docId || d.id === docId
  );
  if (doc) {
    window.open(doc.fileData || doc.fileUrl, '_blank');
  } else {
    showSnack("Document not found", "error");
  }
}, [uploadedDocuments, showSnack]);

  return (
    <div style={styles.container}>
      <style>{styles.globalStyles}</style>
      
      {isSaving && (
        <LoadingOverlay 
          type="saving"
          step={saveStep}
          progress={saveProgress}
          imageCount={totalImageCount}
        />
      )}
      
      {isExporting && (
        <LoadingOverlay 
          type="pdf"
          step={exportStep}
          progress={exportProgress}
          imageCount={totalImageCount}
        />
      )}
      
      <div style={styles.innerContainer}>
        {quotationData.revisedFrom && (
          <div className="no-print" style={{
            margin: '12px 0 0',
            padding: '10px 16px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #c4b5fd',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>📝</span>
            <div>
              <span style={{ fontWeight: 700, color: '#6d28d9', fontSize: 13 }}>
                Revision of {quotationData.originalQuotationNumber || 'previous quotation'}
              </span>
              {quotationData.revisionNote && (
                <span style={{ color: '#7c3aed', fontSize: 12, marginLeft: 10 }}>
                  — {quotationData.revisionNote}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="no-print" style={styles.header}>
          <h1 style={styles.title}>📄 Create Quotation</h1>
          <div style={styles.headerActions}>
            {!isEditing && (
              <ActionButton
                onClick={handleManagerPicker}
                disabled={isSaving || hasAnyError}
                loading={isSaving}
                loadingLabel="Saving Quotation..."
                bgColor="#10b981"
                icon={<Save size={15} />}
                label="Save Quotation"
              />
            )}
            <ActionButton
              onClick={() => setIsEditing(!isEditing)}
              disabled={false}
              bgColor="#0f172a"
              icon={isEditing ? <Save size={15} /> : <Edit2 size={15} />}
              label={isEditing ? "Done" : "Edit"}
            />
            <ActionButton onClick={onBack} variant="outline" icon={<ArrowLeft size={15} />} label="Back" />
          </div>
        </div>
        {!isEditing && hasAnyError && (
          <div className="no-print" style={styles.saveError}>
            <AlertCircle size={14} /> Fix validation errors above to save
          </div>
        )}
        
        <QuotationLayout
  isEditing={isEditing}
  quotationNumber={quotationNumber}
  quotationData={quotationData}
  onDataChange={handleDataChange}
  headerErrors={headerErrors}
  quotationItems={quotationItems}
  availableItems={[]}
  onUpdateItem={updateItem}
  onAddItem={addMoreItem}
  onRemoveItem={removeItem}
  onAddImages={handleImageUpload}
  onRemoveExistingImage={handleRemoveImage}
  onRemoveNewImage={handleRemoveImage}
  editingImgId={editingImageId}
  onToggleImgEdit={(id) => setEditingImageId(editingImageId === id ? null : id)}
  newImages={displayImages}
  subtotal={subtotal}
  taxAmount={taxAmount}
  discountAmount={discountAmount}
  grandTotal={grandTotal}
  amountInWords={amountInWords}
  tcSections={tcSections}
  onTcChange={setTcSections}
  fieldErrors={fieldErrors}
  documents={uploadedDocuments}
  onDocumentUpload={handleDocumentUpload}
  onDocumentDelete={handleDocumentDelete}
  onDocumentDownload={handleDocumentDownload}
  formatFileSize={formatFileSize}
  getFileIcon={getFileIcon}
  setHeaderErrors={setHeaderErrors}
  companyName={companyName}
  companyZohoOrgId={companyZohoOrgId}
  companyPhone={user?.phone || companyDetails.phone}
  companyEmail={user?.email || companyDetails.email}
  
  // ✅ FIX: Use quotationData.tl and quotationData.trn as the source of truth
  // These come from the form state and include user edits
  companyTradeLicense={quotationData.tl || companyDetails.tradeLicense || ''}
  companyTaxRegistration={quotationData.trn || companyDetails.taxRegistration || ''}
  
  customerTaxTreatment={customer?.taxTreatment || 'non_vat_registered'}
  customerPlaceOfSupply={customer?.placeOfSupply || 'Dubai'}
  customerContactPersons={customer?.contactPersons || []}
  termsImages={termsImages}
  onTermsImagesUpload={handleTermsImagesUpload}
  onRemoveTermsImage={handleRemoveTermsImage}
  termsTemplates={termsTemplates}
  selectedTermsTemplateId={selectedTermsTemplateId}
  onSelectTermsTemplate={handleSelectTermsTemplate}
  onSaveTermsTemplateClick={handleOpenSaveTemplateModal}
  onDeleteTermsTemplate={handleDeleteTermsTemplate}
  isTemplateActionsDisabled={false}
  paymentTermOptions={paymentTermOptions}
  selectedPaymentTermId={selectedPaymentTermId}
  onSelectPaymentTerm={handleSelectPaymentTerm}
  onDeletePaymentTerm={handleDeletePaymentTerm}
/>
      </div>
      
      {/* Item Modal for Add/Edit */}
      <ItemModal
        isOpen={isAddItemModalOpen}
        onClose={() => {
          setIsAddItemModalOpen(false);
          setEditingItem(null);
        }}
        onAddItem={handleAddManualItem}
        onEditItem={handleEditItem}
        editingItem={editingItem}
        selectedCurrency={selectedCurrency}
      />
      
      {snackbar.show && <Snackbar message={snackbar.message} type={snackbar.type} onClose={hideSnack} />}

      {showSaveTemplateModal && (
        <SaveTermsTemplateModal
          onClose={() => setShowSaveTemplateModal(false)}
          onSave={handleSaveTermsTemplate}
          saving={savingTermsTemplate}
        />
      )}

      {/* Manager picker modal */}
      {managerModalOpen && (
        <div style={managerModalStyles.overlay} onClick={() => setManagerModalOpen(false)}>
          <div style={managerModalStyles.dialog} onClick={e => e.stopPropagation()}>
            <div style={managerModalStyles.header}>
              <span style={managerModalStyles.title}>Select Manager to Notify</span>
              <button style={managerModalStyles.closeBtn} onClick={() => setManagerModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={managerModalStyles.subtitle}>
              The quotation will be visible to all managers. Choose who receives the email notification.
            </p>

            <div style={managerModalStyles.list}>
              {managersLoading ? (
                <div style={managerModalStyles.loading}>
                  <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Loading managers…</span>
                </div>
              ) : opsManagers.length === 0 ? (
                <p style={managerModalStyles.empty}>No active ops managers found.</p>
              ) : (
                opsManagers.map(mgr => (
                  <label key={mgr._id} style={{
                    ...managerModalStyles.option,
                    background: selectedManagerId === mgr._id ? '#eff6ff' : 'transparent',
                    borderColor: selectedManagerId === mgr._id ? '#3b82f6' : '#e2e8f0',
                  }}>
                    <input
                      type="radio"
                      name="managerPick"
                      value={mgr._id}
                      checked={selectedManagerId === mgr._id}
                      onChange={() => setSelectedManagerId(mgr._id)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <div>
                      <div style={managerModalStyles.mgrName}>{mgr.name}</div>
                      <div style={managerModalStyles.mgrEmail}>{mgr.email}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div style={managerModalStyles.footer}>
              <button style={managerModalStyles.cancelBtn} onClick={() => setManagerModalOpen(false)}>
                Cancel
              </button>
              <button
                style={{
                  ...managerModalStyles.confirmBtn,
                  opacity: !selectedManagerId ? 0.5 : 1,
                  cursor: !selectedManagerId ? 'not-allowed' : 'pointer',
                }}
                disabled={!selectedManagerId || managersLoading}
                onClick={() => {
                  const mgr = opsManagers.find(m => m._id === selectedManagerId);
                  handleSubmitWithEmails(mgr ? [mgr.email] : []);
                }}
              >
                Confirm &amp; Save
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem", position: "sticky", top: 0, zIndex: 100, backgroundColor: "#f0f9ff", paddingTop: "0.5rem", paddingBottom: "0.75rem", borderBottom: "1px solid #e2e8f0" },
  title: { fontSize: "1.375rem", fontWeight: "700", color: "#1f2937", margin: 0 },
  headerActions: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  actionButton: { color: "white", padding: "0.55rem 0.9rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: "600", transition: "background-color 0.15s ease, border-color 0.15s ease" },
  loadingContainer: { minHeight: "100vh", backgroundColor: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" },
  loadingText: { fontSize: "0.9375rem", fontWeight: "500", color: "#6b7280", marginTop: "1rem" },
  loadingState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#1e40af" },
  errorState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991b1b" },

  saveError: { display: "flex", alignItems: "center", gap: "0.375rem", color: "#dc2626", fontSize: "0.8125rem", fontWeight: "500", marginTop: "-0.75rem", marginBottom: "1rem" },
  
  spinningIcon: { animation: "spin 1s linear infinite", marginBottom: "1rem" },
  spinningIconSmall: { animation: "spin 1s linear infinite" },
  
  skeletonContainer: { background: "white", borderRadius: "1rem", padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  skeletonHeader: { display: "flex", justifyContent: "space-between", marginBottom: "2rem" },
  skeletonLine: { width: "160px", height: "20px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonLineSmall: { width: "120px", height: "20px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonBar: { height: "13px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonBarMedium: { width: "200px", height: "13px", borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" },
  skeletonGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" },
  skeletonColumn: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  skeletonTable: { border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" },
  skeletonTableHeader: { background: "#f8fafc", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" },
  
  globalStyles: `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media print { body{margin:0;padding:0;background:white;} .no-print{display:none!important;} .quotation-content{box-shadow:none;border-radius:0;} table{page-break-inside:avoid;}tr{page-break-inside:avoid;} @page{margin:0;} }
    .edit-input:focus{outline:2px solid #3b82f6;border-color:#3b82f6!important;}
    .field-error-input{border-color:#dc2626!important;background:#fef2f2!important;}
  `
};

const managerModalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  dialog: { background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.25rem 0' },
  title: { fontWeight: 700, fontSize: '1.0625rem', color: '#111827' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', padding: '0.25rem' },
  subtitle: { fontSize: '0.8125rem', color: '#6b7280', margin: '0.5rem 1.25rem 0.75rem', lineHeight: 1.5 },
  list: { overflowY: 'auto', padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px' },
  loading: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.875rem', padding: '1rem 0' },
  empty: { color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' },
  option: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s' },
  mgrName: { fontWeight: 600, fontSize: '0.9rem', color: '#111827' },
  mgrEmail: { fontSize: '0.8rem', color: '#6b7280' },
  footer: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.25rem', borderTop: '1px solid #f1f5f9', marginTop: '0.75rem' },
  cancelBtn: { padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
  confirmBtn: { padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.875rem', transition: 'opacity 0.15s' },
};

