import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Edit2, Save, Loader, AlertCircle, CheckCircle, Image, FileImage, Upload, FileText, Plus, Trash2 } from "lucide-react";
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { useAppStore } from '../services/store';
import { useQuotations } from '../hooks/customHooks';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { sectionsToHTML, sectionsToHTMLWithoutImages, newSection } from '../components/TermsCondition';
import { SkeletonRow } from '../components/SharedComponents';
import { MAX_IMAGE_SIZE_MB, MAX_IMAGES_PER_ITEM, ALLOWED_IMAGE_TYPES } from '../utils/constants';
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
import { quotationAPI } from '../services/api';
import { convertS3KeyToUrl, convertBatchS3KeysToUrls } from '../hooks/useS3Image';

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

const ActionButton = ({ onClick, disabled, bgColor, icon, label, loading }) => (
  <button onClick={onClick} disabled={disabled || loading} style={{ ...styles.actionButton, backgroundColor: disabled ? "#d1d5db" : bgColor, opacity: disabled ? 0.6 : 1 }}>
    {loading ? <Loader size={18} style={styles.spinningIconSmall} /> : icon} {loading ? (label === "Save" ? "Saving..." : "Generating...") : label}
  </button>
);

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

// SaveButton component
const SaveButton = ({ onClick, disabled, hasError, loading }) => (
  <div style={styles.saveButtonContainer}>
    <button onClick={onClick} disabled={disabled} style={{ ...styles.saveButton, opacity: hasError ? 0.6 : 1 }}>
      {loading ? <><Loader size={18} style={styles.spinningIconSmall} /> Saving Quotation...</> : <>💾 Save Quotation</>}
    </button>
    {hasError && <div style={styles.saveError}><AlertCircle size={14} /> Fix validation errors above to save</div>}
  </div>
);

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const getCurrencyObject = (currencyCode) => ({
  code: currencyCode || 'AED',
  symbol: currencyCode === 'AED' ? 'د.إ' : currencyCode === 'SAR' ? '﷼' : currencyCode === 'USD' ? '$' : '€'
});

const getCompanyName = (selectedCompany, companies) => {
  if (!selectedCompany) return DEFAULT_COMPANY_NAME;
  if (typeof selectedCompany === 'object' && selectedCompany?.name) return selectedCompany.name;
  const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
  return company?.name || DEFAULT_COMPANY_NAME;
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
    customer: initialQuotationData?.customer|| "",
    customerName: initialQuotationData?.customerName || customer?.contactPerson || customer?.name || "",
    customerPhone: initialQuotationData?.customerPhone || customer?.phone || "",
    customerEmail: initialQuotationData?.customerEmail || customer?.email || "",
    customerDesignation: initialQuotationData?.customerDesignation || customer?.designation || "",
    customerTradeLicenseNumber: initialQuotationData?.customerTradeLicenseNumber || customer?.tradeLicenseNumber || "",
    customerTaxRegistrationNumber: initialQuotationData?.customerTaxRegistrationNumber || customer?.vatNumber || "",
    remark: initialQuotationData?.remark || "",
    // Company/Right side fields - Use user data directly
    ourFocalPoint: user?.name || "",
    ourFocalPointDesignation: user?.role || "",
    ourContact: user?.phone || "",
    salesManagerEmail: user?.email || "",
    
    ourRef: initialQuotationData?.ourRef || "",
    paymentTerms: initialQuotationData?.paymentTerms || "",
    deliveryTerms: initialQuotationData?.deliveryTerms || "",
    tl: initialQuotationData?.tl || "",
    trn: initialQuotationData?.trn || customer?.trn || customer?.taxRegistrationNumber || "",
    tax: initialQuotationData?.tax || 0,
    discount: initialQuotationData?.discount || 0,
    notes: initialQuotationData?.notes || "",
    termsAndConditions: initialQuotationData?.termsAndConditions || "",
    termsImage: initialQuotationData?.termsImage || null,
    currency: initialQuotationData?.currency || getCurrencyObject(selectedCurrency),
    queryDate: initialQuotationData?.queryDate || ""   
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
  const [tcSections, setTcSections] = useState([newSection()]);
  const [snackbar, setSnackbar] = useState(SNACK_HIDE);
  
  // Terms images state (now stores S3 keys instead of URLs)
  const [termsImages, setTermsImages] = useState([]);
  
  const showSnack = useCallback((msg, type = "error") => setSnackbar({ show: true, message: msg, type }), []);
  const hideSnack = useCallback(() => setSnackbar(SNACK_HIDE), []);
  
  // Terms images handlers (now for S3 keys)
  const handleTermsImagesUpload = useCallback((newImages) => {
    // newImages should contain { s3Key, fileName, uploadedAt, storageProvider }
    setTermsImages(prev => [...prev, ...newImages]);
  }, []);
  
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
        unitPrice: Number(item.unitPrice) || 0,
        // S3 keys for images
        imageS3Keys: item.imageS3Keys || [],
        newImages: []  // Will store base64 for new uploads
      });
    });
    setQuotationItems(Array.from(itemsMap.values()));
  }, [selectedItems, quotationItems.length]);
  
  // Add this useEffect to auto-populate customer TRN when customer changes
  useEffect(() => {
    if (customer) {
      setQuotationData(prev => ({
        ...prev,
        trn: customer.vatNumber || customer.trn || customer.taxRegistrationNumber || "",
        customerTaxRegistrationNumber: customer.vatNumber || customer.trn || customer.taxRegistrationNumber || "",
        
        customerName: customer.contactPerson || customer.name || "",
        customerPhone: customer.phone || "",
        customerEmail: customer.email || "",
        customerDesignation: customer.designation || "",
        customerTradeLicenseNumber: customer.tradeLicenseNumber || "",
      }));
    }
  }, [customer]);

  // Auto-populate Company Name from selectedCompany
  useEffect(() => {
    if (selectedCompany) {
      let companyNameValue = '';
      
      if (typeof selectedCompany === 'object') {
        companyNameValue = selectedCompany.name || '';
      } else {
        const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
        companyNameValue = company?.name || '';
      }
      
      setQuotationData(prev => ({
        ...prev,
        customer: companyNameValue,
      }));
    }
  }, [selectedCompany, companies]);
  
  // Add this useEffect to auto-populate creator (user) details on the right side
  useEffect(() => {
    if (user && !quotationData.ourFocalPoint) {
      setQuotationData(prev => ({
        ...prev,
        ourFocalPoint: user.name || "",
        ourFocalPointDesignation: user.role || "",
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

  const amountInWords = useMemo(() => numberToWords(grandTotal), [grandTotal]);
  const companyName = useMemo(() => getCompanyName(selectedCompany, companies), [selectedCompany, companies]);
  const hasAnyError = Object.keys(headerErrors).length > 0 || Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);

  // Calculate total image count for progress
  const totalImageCount = useMemo(() => {
    let count = 0;
    quotationItems.forEach(item => {
      count += (item.imageS3Keys?.length || 0) + (item.newImages?.length || 0);
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
    if (!quotationData.customerName?.trim()) {
      errors.customerName = "Contact Name is required";
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
    // Also clear any matching local preview
    setItemImages(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((_, i) => i !== (imageIndex - 0)),
    }));
  }, []);
  
  const handleSubmit = useCallback(async () => {
    if (!validateAll()) return;
    if (!selectedCompany) {
      showSnack("Please select a company", "error");
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
        unitPrice: Number(item.unitPrice) || 0,
        imageS3Keys: item.imageS3Keys || [],   // keys only — no base64
      }));
  
      const quotationImages = {};
      quotationItems.forEach((item, index) => {
        const allImages = [...(item.imageS3Keys || []), ...(item.newImages || [])];
        if (allImages.length > 0) {
          quotationImages[index] = allImages;
        }
      });
  
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
        tl: quotationData.tl?.trim() || "",
        trn: quotationData.trn?.trim() || "",
        taxPercent: Number(quotationData.tax) || 0,
        discountPercent: Number(quotationData.discount) || 0,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: finalTermsAndConditions,
        termsImages: newBase64Images,
        existingTermsImages: existingTermsImages,
        items: formattedItems,
        quotationImages: quotationImages,
        internalDocuments: uploadedDocuments.map(doc => doc.fileData),
        internalDocDescriptions: uploadedDocuments.map(doc => doc.description || ''),
      };
  
      const result = await addQuotation(quotation);
  
      if (result?.success) {
        setTermsImages([]);
        showSnack(`Quotation ${quotationNumber} created successfully!`, "success");
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
  }, [validateAll, selectedCompany, customer, quotationData, quotationItems, uploadedDocuments, tcSections, termsImages, addQuotation, user, navigate, showSnack, quotationNumber, selectedCurrency]);

  const handleExportPDF = useCallback(async () => {
    if (!validateAll()) return;
    setIsExporting(true);
    setExportProgress(10);
    setExportStep("Preparing PDF...");
    setImageCount(totalImageCount);
    
    try {
      const imageToBase64 = async (source) => {
        // If it's an S3 key, convert to signed URL first
        if (typeof source === 'string' && source.startsWith('quotations/')) {
          const signedUrl = await convertS3KeyToUrl(source);
          if (!signedUrl) return null;
          source = signedUrl;
        }
        
        return new Promise((resolve) => {
          if (!source) {
            resolve(null);
            return;
          }
          if (typeof source === 'string' && source.startsWith('data:')) {
            resolve(source);
            return;
          }
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = () => {
            console.warn('Failed to load image:', source);
            resolve(null);
          };
          img.src = source;
        });
      };
  
      setExportProgress(20);
      setExportStep("Processing item images...");
      
      const companySnapshot = typeof selectedCompany === 'object' && selectedCompany?.name 
        ? selectedCompany 
        : companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
      
      // Process items - convert S3 keys to base64 for PDF
      const processedItems = await Promise.all(quotationItems.map(async (item) => {
        // Convert S3 keys to signed URLs then to base64
        const s3ImagePromises = (item.imageS3Keys || []).map(async (s3Key) => {
          const signedUrl = await convertS3KeyToUrl(s3Key);
          if (signedUrl) {
            return await imageToBase64(signedUrl);
          }
          return null;
        });
        
        const s3Images = await Promise.all(s3ImagePromises);
        
        // New images are already base64
        const newImagesBase64 = (item.newImages || []).filter(img => img && typeof img === 'string');
        
        const allImages = [...s3Images.filter(Boolean), ...newImagesBase64];
        
        return {
          ...item,
          imagePaths: allImages,
          name: item.name,
          description: item.description
        };
      }));
      
      setExportProgress(40);
      setExportStep("Processing terms images...");
      
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
      
      let processedTermsImages = [];
      if (allTermsImages.length > 0) {
        processedTermsImages = await Promise.all(allTermsImages.map(async (img) => {
          let source = img.url;
          if (img.s3Key && !source?.startsWith('data:')) {
            source = await convertS3KeyToUrl(img.s3Key);
          }
          const base64 = await imageToBase64(source);
          return {
            url: base64 || source,
            fileName: img.fileName,
            caption: img.caption
          };
        }));
      }
      
      setExportProgress(60);
      setExportStep("Building HTML content...");
      
      const sectionsWithBase64Images = await Promise.all(tcSections.map(async (section) => {
        if (section.images && section.images.length > 0) {
          const imagesWithBase64 = await Promise.all(
            section.images.map(async (img) => {
              let source = img.url;
              if (img.s3Key && !source?.startsWith('data:')) {
                source = await convertS3KeyToUrl(img.s3Key);
              }
              if (source && !source.startsWith('data:')) {
                const base64 = await imageToBase64(source);
                return { ...img, url: base64 || source };
              }
              return img;
            })
          );
          return { ...section, images: imagesWithBase64 };
        }
        return section;
      }));
      
      const termsHTML = sectionsWithBase64Images.length > 0 
        ? sectionsToHTML(sectionsWithBase64Images) 
        : '';
      
      setExportProgress(80);
      setExportStep("Generating PDF...");
      
      const pdfQuotation = {
        quotationNumber: quotationNumber,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        projectName: quotationData.projectName || '',
        scopeOfWork: quotationData.scopeOfWork || '',
        customer: quotationData.customer || customer?.name || '',
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
        items: processedItems,
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
        termsImages: processedTermsImages,
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
      setIsSaving(true);
      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) { 
          showSnack(validation.error, 'error'); 
          return; 
        }
      }
      
      const base64Promises = files.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ 
          fileData: reader.result, 
          name: file.name, 
          type: file.type, 
          size: file.size 
        });
        reader.readAsDataURL(file);
      }));

      const base64Files = await Promise.all(base64Promises);
      const newDocs = base64Files.map((file, index) => ({
        id: `doc-${Date.now()}-${index}-${Math.random()}`,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: file.fileData,
        description: descriptions[index] || '',
        uploadedAt: new Date().toISOString(),
        isTemp: true,
        storageProvider: 's3'
      }));

      setUploadedDocuments(prev => [...prev, ...newDocs]);
      showSnack(`${files.length} document(s) ready`, 'success');
    } catch (error) {
      console.error('Error processing documents:', error);
      showSnack('Failed to process documents', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [showSnack]);

  const handleDocumentDelete = useCallback((docId) => {
    setUploadedDocuments(prev => prev.filter(doc => doc.id !== docId));
  }, []);

  const handleDocumentDownload = useCallback((docId) => {
    const doc = uploadedDocuments.find(d => d.id === docId);
    if (doc?.fileData) {
      const link = document.createElement('a');
      link.href = doc.fileData;
      link.download = doc.fileName;
      link.click();
    }
  }, [uploadedDocuments]);

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
        <div className="no-print" style={styles.header}>
          <h1 style={styles.title}>📄 Create Quotation</h1>
          <div style={styles.headerActions}>
            <ActionButton onClick={() => setIsEditing(!isEditing)} disabled={false} 
              bgColor={isEditing ? "#ef4444" : "#f59e0b"} icon={isEditing ? <Save size={18} /> : <Edit2 size={18} />} label={isEditing ? "Done" : "Edit"} />
            {/* <ActionButton onClick={handleExportPDF} disabled={isExporting || hasAnyError} 
              bgColor="#0369a1" icon={isExporting ? <Loader size={16} style={styles.spinningIconSmall} /> : <Download size={18} />} 
              label={isExporting ? "Generating…" : "Download PDF"} loading={isExporting} /> */}
            <ActionButton onClick={onBack} bgColor="#6b7280" icon={<ArrowLeft size={18} />} label="Back" />
          </div>
        </div>
        
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
          newImages={itemImages}
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
          companyPhone={user?.phone || companyDetails.phone}
          companyEmail={user?.email || companyDetails.email}
          companyTradeLicense={companyDetails.tradeLicense}
          companyTaxRegistration={companyDetails.taxRegistration}
          customerTaxTreatment={customer?.taxTreatment || 'non_vat_registered'}
          customerPlaceOfSupply={customer?.placeOfSupply || 'Dubai'}
          termsImages={termsImages}
          onTermsImagesUpload={handleTermsImagesUpload}
          onRemoveTermsImage={handleRemoveTermsImage}
        />
        
        {!isEditing && (
          <SaveButton 
            onClick={handleSubmit} 
            disabled={isSaving || hasAnyError} 
            hasError={hasAnyError}
            loading={isSaving}
          />
        )}
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
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: { minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" },
  innerContainer: { maxWidth: "1280px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" },
  title: { fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 },
  headerActions: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  actionButton: { color: "white", padding: "0.625rem 1rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500", transition: "all 0.2s" },
  loadingContainer: { minHeight: "100vh", backgroundColor: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" },
  loadingText: { fontSize: "0.9375rem", fontWeight: "500", color: "#6b7280", marginTop: "1rem" },
  loadingState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#1e40af" },
  errorState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991b1b" },
  
  saveButtonContainer: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginTop: "2rem" },
  saveButton: { backgroundColor: "#10b981", color: "white", padding: "1rem 2rem", borderRadius: "0.5rem", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", transition: "all 0.2s" },
  saveError: { display: "flex", alignItems: "center", gap: "0.375rem", color: "#dc2626", fontSize: "0.8125rem", fontWeight: "500" },
  
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