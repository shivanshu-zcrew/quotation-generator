// screens/QuotationTemplate.jsx (UPDATED with Terms Images Props)
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Edit2, Save, Loader, AlertCircle } from "lucide-react";
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

// ============================================================
// COMPONENTS
// ============================================================

const PdfOverlay = React.memo(({ step }) => (
  <div style={styles.pdfOverlay}>
    <div style={styles.pdfOverlayContent}>
      <Loader size={36} color="#0369a1" style={styles.spinningIcon} />
      <div style={styles.pdfOverlayTitle}>Generating PDF…</div>
      <div style={styles.pdfOverlayStep}>{step}</div>
    </div>
  </div>
));

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

const ActionButton = ({ onClick, disabled, bgColor, icon, label }) => (
  <button onClick={onClick} disabled={disabled} style={{ ...styles.actionButton, backgroundColor: disabled ? "#d1d5db" : bgColor, opacity: disabled ? 0.6 : 1 }}>
    {icon} {label}
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

const SaveButton = ({ onClick, disabled, hasError }) => (
  <div style={styles.saveButtonContainer}>
    <button onClick={onClick} disabled={disabled} style={{ ...styles.saveButton, opacity: hasError ? 0.6 : 1 }}>
      {disabled ? <><Loader size={18} style={styles.spinningIconSmall} /> Saving…</> : <>💾 Save Quotation</>}
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

const generateQuotationNumber = () => {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(-2);
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const rn = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `QT-${yy}${mm}${dd}-${rn}`;
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function QuotationTemplate({ customer, selectedItems, selectedCompany, selectedCurrency, onBack }) {
  if (!customer || !selectedItems) {
    return (
      <div style={styles.loadingContainer}>
        <Loader size={36} color="#0369a1" style={styles.spinningIcon} />
        <p style={styles.loadingText}>Loading quotation…</p>
      </div>
    );
  }
  return <QuotationTemplateInner customer={customer} selectedItems={selectedItems} selectedCompany={selectedCompany} selectedCurrency={selectedCurrency} onBack={onBack} />;
}

function QuotationTemplateInner({ customer, selectedItems, selectedCompany, selectedCurrency, onBack }) {
  const navigate = useNavigate();
  const { companies, user } = useAppStore();
  const { items, isLoading: isItemsLoading, loadAllItems } = useItemStore();
  const { addQuotation } = useQuotations();
  
  // State
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [quotationItems, setQuotationItems] = useState([]);
  const [quotationData, setQuotationData] = useState({
    date: getTodayDate(),
    expiryDate: getDefaultExpiryDate(),
    customer: customer?.name || "",
    contact: customer?.phone || "",
    projectName: "", ourRef: "", ourContact: "", salesManagerEmail: "", paymentTerms: "", deliveryTerms: "",
    tl: "", trn: customer?.trn || customer?.taxRegistrationNumber || "",
    tax: 0, discount: 0, notes: "", termsAndConditions: "", termsImage: null,
    currency: getCurrencyObject(selectedCurrency)
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [headerErrors, setHeaderErrors] = useState({});
  const [itemImages, setItemImages] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState("");
  const [tcSections, setTcSections] = useState([newSection()]);
  const [snackbar, setSnackbar] = useState(SNACK_HIDE);
  
  // Terms images state
  const [termsImages, setTermsImages] = useState([]);
  
  const showSnack = useCallback((msg, type = "error") => setSnackbar({ show: true, message: msg, type }), []);
  const hideSnack = useCallback(() => setSnackbar(SNACK_HIDE), []);
  
  // Terms images handlers
  const handleTermsImagesUpload = useCallback((newImages) => {
    setTermsImages(prev => [...prev, ...newImages]);
  }, []);
  
  const handleRemoveTermsImage = useCallback((imageId) => {
    setTermsImages(prev => prev.filter(img => img.id !== imageId));
  }, []);
  
  // Load items on mount
  useEffect(() => {
    if (!items.length) loadAllItems();
  }, [items.length, loadAllItems]);
  
  // Initialize quotation items from selected items
  useEffect(() => {
    if (!selectedItems?.length || quotationItems.length) return;
    
    const itemsMap = new Map();
    selectedItems.forEach((item, index) => {
      const source = item.fullItemData || item;
      itemsMap.set(source._id, {
        id: item.id || `qt-item-${Date.now()}-${index}`,
        itemId: source._id,
        zohoId: source.zohoId,
        name: source.name,
        description: source.description || '',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice || source.price) || 0,
        sku: source.sku || '',
        unit: source.unit || '',
        fullItemData: source,
        imagePaths: item.imagePaths || [],
        newImages: []
      });
    });
    setQuotationItems(Array.from(itemsMap.values()));
  }, [selectedItems, quotationItems.length]);
  
  // Update currency when changed
  useEffect(() => {
    setQuotationData(prev => ({ ...prev, currency: getCurrencyObject(selectedCurrency) }));
  }, [selectedCurrency]);
  

const subtotal = useMemo(() => 
  quotationItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0), 
  [quotationItems]
);

// Step 1: Calculate discount amount (based on subtotal)
const discountAmount = useMemo(() => 
  subtotal * (quotationData.discount || 0) / 100, 
  [subtotal, quotationData.discount]
);

// Step 2: Calculate subtotal after discount
const subtotalAfterDiscount = useMemo(() => 
  subtotal - discountAmount, 
  [subtotal, discountAmount]
);

// Step 3: Calculate tax on the discounted amount (NOT on original subtotal)
const taxAmount = useMemo(() => 
  subtotalAfterDiscount * (quotationData.tax || 0) / 100, 
  [subtotalAfterDiscount, quotationData.tax]
);

// Step 4: Calculate grand total (discounted amount + tax)
const grandTotal = useMemo(() => 
  subtotalAfterDiscount + taxAmount, 
  [subtotalAfterDiscount, taxAmount]
);

const amountInWords = useMemo(() => numberToWords(grandTotal), [grandTotal]);
const quotationNumber = useMemo(generateQuotationNumber, []);
const companyName = useMemo(() => getCompanyName(selectedCompany, companies), [selectedCompany, companies]);
const hasAnyError = Object.keys(headerErrors).length > 0 || Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);


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
    
    if (!quotationItems.length) {
      showSnack(VALIDATION_MESSAGES.REQUIRED_ITEM);
      return false;
    }
    
    for (const item of quotationItems) {
      if (!item.itemId) {
        showSnack(VALIDATION_MESSAGES.REQUIRED_ITEM_SELECT);
        return false;
      }
      const qr = validateQuantity(item.quantity);
      if (!qr.isValid) { showSnack(`"${item.name || 'Item'}" — ${qr.error}`); return false; }
      const pr = validatePrice(item.unitPrice);
      if (!pr.isValid) { showSnack(`"${item.name || 'Item'}" — ${pr.error}`); return false; }
    }
    
    if (Object.keys(errors).length) {
      setHeaderErrors(errors);
      showSnack("Please fix the highlighted errors.");
      return false;
    }
    return true;
  }, [quotationData, quotationItems, showSnack]);
  
  const addMoreItem = useCallback(() => {
    setQuotationItems(prev => [...prev, { 
      id: `${Date.now()}-${Math.random()}`,
      itemId: null, quantity: 1, unitPrice: 0, name: "", description: "",
      imagePaths: [], newImages: []
    }]);
  }, []);
  
  const removeItem = useCallback((id) => {
    setQuotationItems(prev => prev.filter(i => i.id !== id));
    setItemImages(prev => { const { [id]: _, ...rest } = prev; return rest; });
    setFieldErrors(prev => { const { [id]: _, ...rest } = prev; return rest; });
  }, []);
  
  const updateItem = useCallback((id, field, value) => {
    if (field === "quantity") {
      if (!value && value !== 0) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity: "Quantity is required." } }));
        return;
      }
      const r = validateQuantity(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity: r.error } }));
        return;
      }
      setFieldErrors(prev => {
        const { [id]: errors, ...rest } = prev;
        if (errors) delete errors.quantity;
        return Object.keys(errors || {}).length ? { ...rest, [id]: errors } : rest;
      });
      value = parseInt(value, 10);
    }
    
    if (field === "unitPrice") {
      if (value === "") {
        setQuotationItems(prev => prev.map(item => item.id === id ? { ...item, unitPrice: 0 } : item));
        return;
      }
      const r = validatePrice(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], unitPrice: r.error } }));
        return;
      }
      setFieldErrors(prev => {
        const { [id]: errors, ...rest } = prev;
        if (errors) delete errors.unitPrice;
        return Object.keys(errors || {}).length ? { ...rest, [id]: errors } : rest;
      });
      value = parseFloat(value) || 0;
    }
    
    if (field === "itemId" && value) {
      const found = items?.find(i => i._id === value);
      setQuotationItems(prev => prev.map(item => item.id === id ? {
        ...item,
        itemId: value,
        name: found?.name || "",
        description: found?.description || "",
        unitPrice: found?.price != null ? Number(found.price) : item.unitPrice
      } : item));
      return;
    }
    
    setQuotationItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }, [items]);
  
  const handleImageUpload = useCallback((e, itemId) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    const currentImages = itemImages[itemId] || [];
    const slots = MAX_IMAGES_PER_ITEM - currentImages.length;
    if (slots <= 0) {
      showSnack(`Max ${MAX_IMAGES_PER_ITEM} images per item.`);
      return;
    }
    
    const toProcess = files.slice(0, slots);
    if (files.length > slots) showSnack(`Only ${slots} slot(s) left — first ${slots} added.`);
    
    toProcess.forEach(file => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showSnack(`"${file.name}" is not a supported type.`);
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showSnack(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        setItemImages(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), reader.result] }));
        setQuotationItems(prev => prev.map(item => item.id === itemId ? { ...item, newImages: [...(item.newImages || []), reader.result] } : item));
      };
      reader.readAsDataURL(file);
    });
    
    setEditingImageId(null);
    e.target.value = "";
  }, [itemImages, showSnack]);
  
  const handleRemoveImage = useCallback((itemId, imageIndex) => {
    setQuotationItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const isExisting = item.imagePaths?.length > imageIndex;
      if (isExisting) {
        return { ...item, imagePaths: item.imagePaths.filter((_, idx) => idx !== imageIndex) };
      }
      const newImageIndex = imageIndex - (item.imagePaths?.length || 0);
      return { ...item, newImages: item.newImages.filter((_, idx) => idx !== newImageIndex) };
    }));
    setItemImages(prev => ({ ...prev, [itemId]: (prev[itemId] || []).filter((_, idx) => idx !== imageIndex) }));
  }, []);
  
  const handleSubmit = useCallback(async () => {
    if (!validateAll()) return;
    if (!selectedCompany) {
      showSnack("Please select a company", "error");
      return;
    }
    
    setIsSaving(true);
    try {
      // Format items
      const formattedItems = quotationItems.map(item => ({
        itemId: item.zohoId || item.itemId,
        zohoId: item.zohoId || item.itemId,
        name: item.name,
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        // Include imagePaths for the backend to process
        imagePaths: [...(item.imagePaths || []), ...(item.newImages || [])]
      }));
      
      // ✅ Create quotationImages object for the backend (index-based)
      const quotationImages = {};
      quotationItems.forEach((item, index) => {
        const allImages = [...(item.imagePaths || []), ...(item.newImages || [])];
        if (allImages.length > 0) {
          quotationImages[index] = allImages;
        }
      });
      
      // Extract terms images from tcSections
      const allTermsImages = [];
      if (tcSections && tcSections.length > 0) {
        tcSections.forEach((section, sectionIdx) => {
          if (section.images && section.images.length > 0) {
            section.images.forEach((img, imgIdx) => {
              if (img.url) {
                allTermsImages.push({
                  url: img.url,
                  fileName: img.fileName || `image_${sectionIdx + 1}_${imgIdx + 1}`,
                  sectionIndex: sectionIdx,
                  isTemp: img.isTemp || false
                });
              }
            });
          }
        });
      }
      
      // Create clean sections without images
      const cleanSections = tcSections.map(section => ({
        heading: section.heading || '',
        points: (section.points || []).filter(p => p && p.text && p.text.trim()).map(p => p.text),
      }));
      
      const termsHTML = sectionsToHTMLWithoutImages(cleanSections);
      
      const quotation = {
        companyId: selectedCompany,
        currencyCode: selectedCurrency,
        customerId: customer._id,
        customer: quotationData.customer?.trim(),
        contact: quotationData.contact?.trim() || "",
        customerCountry: customer.country || "UAE",
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        projectName: quotationData.projectName?.trim() || "test",
        ourRef: quotationData.ourRef?.trim() || "",
        ourContact: quotationData.ourContact?.trim() || "",
        salesManagerEmail: quotationData.salesManagerEmail?.trim() || "",
        paymentTerms: quotationData.paymentTerms?.trim() || "",
        deliveryTerms: quotationData.deliveryTerms?.trim() || "",
        tl: quotationData.tl?.trim() || "",
        trn: quotationData.trn?.trim() || customer?.trn || "",
        taxPercent: Number(quotationData.tax) || 0,
        discountPercent: Number(quotationData.discount) || 0,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: termsHTML,
        items: formattedItems,
        // ✅ IMPORTANT: Send quotationImages in the format backend expects
        quotationImages: quotationImages,
        internalDocuments: uploadedDocuments.map(doc => doc.fileData),
        internalDocDescriptions: uploadedDocuments.map(doc => doc.description || ''),
        termsImages: allTermsImages
      };
      
      console.log('📤 Sending quotationImages:', Object.keys(quotationImages));
      console.log('📤 Items with images:', formattedItems.filter(i => i.imagePaths?.length > 0).length);
      
      const result = await addQuotation(quotation);
      
      if (result?.success) {
        showSnack("Quotation created successfully!", "success");
        const { refetchQuotations } = useAppStore.getState();
        await refetchQuotations();
        setTimeout(() => navigate(user?.role === 'admin' ? '/admin' : '/home'), 1500);
      } else {
        showSnack(result?.error || "Failed to create quotation", "error");
      }
    } catch (err) {
      console.error('Submit error:', err);
      showSnack(err?.response?.data?.message || err.message || "Error creating quotation", "error");
    } finally {
      setIsSaving(false);
    }
  }, [validateAll, selectedCompany, showSnack, selectedCurrency, customer, quotationData, quotationItems, uploadedDocuments, tcSections, addQuotation, user, navigate]);

  const handleExportPDF = useCallback(async () => {
    if (!validateAll()) return;
    setIsExporting(true);
    setExportStep("Preparing PDF...");
    
    try {
      const imageToBase64 = (url) => {
        return new Promise((resolve) => {
          if (!url) {
            resolve(null);
            return;
          }
          if (url.startsWith('data:')) {
            resolve(url);
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
            console.warn('Failed to load image:', url);
            resolve(null);
          };
          img.src = url;
        });
      };
  
      setExportStep("Processing item images...");
      
      const companySnapshot = typeof selectedCompany === 'object' && selectedCompany?.name 
        ? selectedCompany 
        : companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
      
      // Process items with images
      const processedItems = await Promise.all(quotationItems.map(async (item) => {
        const allImages = [...(item.imagePaths || []), ...(item.newImages || [])];
        const base64Images = await Promise.all(allImages.map(imageToBase64));
        return {
          ...item,
          imagePaths: base64Images.filter(Boolean),
          itemId: item.itemId ? { 
            _id: item.itemId, 
            name: item.name, 
            price: item.unitPrice, 
            description: item.description 
          } : null
        };
      }));
      
      setExportStep("Processing terms images...");
      
      // ✅ CRITICAL: Extract ALL images from tcSections
      let allTermsImages = [];
      
      if (tcSections && tcSections.length > 0) {
        tcSections.forEach((section, sectionIdx) => {
          if (section.images && section.images.length > 0) {
            section.images.forEach((img, imgIdx) => {
              if (img.url) {
                allTermsImages.push({
                  url: img.url,
                  fileName: img.fileName || `image_${sectionIdx + 1}_${imgIdx + 1}`,
                  caption: img.caption || ''
                });
              }
            });
          }
        });
      }
      
      console.log('📸 Extracted terms images from sections:', allTermsImages.length);
      
      // Process terms images to base64
      let processedTermsImages = [];
      if (allTermsImages.length > 0) {
        processedTermsImages = await Promise.all(allTermsImages.map(async (img) => {
          const base64 = await imageToBase64(img.url);
          return {
            url: base64 || img.url,
            fileName: img.fileName,
            caption: img.caption
          };
        }));
      }
      
      // Process sections for HTML content (with images embedded)
      const sectionsWithBase64Images = await Promise.all(tcSections.map(async (section) => {
        if (section.images && section.images.length > 0) {
          const imagesWithBase64 = await Promise.all(
            section.images.map(async (img) => {
              if (img.url) {
                const base64 = await imageToBase64(img.url);
                return { ...img, url: base64 || img.url };
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
      
      // Prepare quotation object for PDF generator
      const pdfQuotation = {
        quotationNumber: quotationNumber,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        projectName: quotationData.projectName || '',
        customer: quotationData.customer || customer?.name || '',
        contact: quotationData.contact || customer?.phone || '',
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
          address: customer?.address 
        },
        companySnapshot: companySnapshot ? { name: companyName, ...companySnapshot } : { name: companyName },
        termsAndConditions: termsHTML,
        // ✅ Pass extracted images to PDF generator
        termsImages: processedTermsImages
      };
      
      console.log('📤 Sending to PDF generator:', {
        hasTermsImages: pdfQuotation.termsImages.length > 0,
        termsImagesCount: pdfQuotation.termsImages.length
      });
      
      setExportStep("Generating PDF...");
      await downloadQuotationPDF(pdfQuotation);
      showSnack("PDF downloaded successfully!", "success");
      
    } catch (err) {
      console.error('PDF export error:', err);
      showSnack(err?.message || "Failed to export PDF", "error");
    } finally {
      setIsExporting(false);
      setExportStep("");
    }
  }, [validateAll, quotationData, quotationItems, quotationNumber, selectedCurrency, selectedCompany, companies, customer, companyName, tcSections, showSnack]);
  

  
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
      isTemp: true
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
      
      {isExporting && <PdfOverlay step={exportStep} />}
      
      <div style={styles.innerContainer}>
        <div className="no-print" style={styles.header}>
          <h1 style={styles.title}>📄 Create Quotation</h1>
          <div style={styles.headerActions}>
            <ActionButton onClick={() => setIsEditing(!isEditing)} disabled={isItemsLoading} 
              bgColor={isEditing ? "#ef4444" : "#f59e0b"} icon={isEditing ? <Save size={18} /> : <Edit2 size={18} />} label={isEditing ? "Done" : "Edit"} />
            <ActionButton onClick={handleExportPDF} disabled={isExporting || isItemsLoading || hasAnyError} 
              bgColor="#0369a1" icon={isExporting ? <Loader size={16} style={styles.spinningIconSmall} /> : <Download size={18} />} 
              label={isExporting ? "Generating…" : "Download PDF"} />
            <ActionButton onClick={onBack} bgColor="#6b7280" icon={<ArrowLeft size={18} />} label="Back" />
          </div>
        </div>
        
        {isItemsLoading && <LoadingState />}
        {!isItemsLoading && items.length === 0 && <ErrorState message="No items found" />}
        
        {isItemsLoading ? (
          <ContentSkeleton />
        ) : (
          <QuotationLayout
            isEditing={isEditing}
            quotationNumber={quotationNumber}
            quotationData={quotationData}
            onDataChange={handleDataChange}
            headerErrors={headerErrors}
            quotationItems={quotationItems}
            availableItems={items}
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
            customerTaxTreatment={customer?.taxTreatment || 'non_vat_registered'}
            customerPlaceOfSupply={customer?.placeOfSupply || 'Dubai'}
            // Terms images props - ADDED
            termsImages={termsImages}
            onTermsImagesUpload={handleTermsImagesUpload}
            onRemoveTermsImage={handleRemoveTermsImage}
          />
        )}
        
        {!isEditing && <SaveButton onClick={handleSubmit} disabled={isSaving || hasAnyError} hasError={hasAnyError} />}
      </div>
      
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
  actionButton: { color: "white", padding: "0.625rem 1rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" },
  loadingContainer: { minHeight: "100vh", backgroundColor: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" },
  loadingText: { fontSize: "0.9375rem", fontWeight: "500", color: "#6b7280", marginTop: "1rem" },
  loadingState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#1e40af" },
  errorState: { display: "flex", alignItems: "center", gap: "0.75rem", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "0.875rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991b1b" },
  saveButtonContainer: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginTop: "2rem" },
  saveButton: { backgroundColor: "#10b981", color: "white", padding: "1rem 2rem", borderRadius: "0.5rem", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" },
  saveError: { display: "flex", alignItems: "center", gap: "0.375rem", color: "#dc2626", fontSize: "0.8125rem", fontWeight: "500" },
  pdfOverlay: { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" },
  pdfOverlayContent: { backgroundColor: "white", borderRadius: "1rem", padding: "2rem 2.5rem", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: "280px" },
  pdfOverlayTitle: { fontWeight: "700", fontSize: "1rem", color: "#1f2937", marginBottom: "0.25rem" },
  pdfOverlayStep: { fontSize: "0.8125rem", color: "#6b7280" },
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