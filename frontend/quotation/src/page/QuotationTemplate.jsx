// screens/QuotationTemplate.jsx
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Edit2, Save, Loader, AlertCircle } from "lucide-react";
import headerImage from "../assets/header.png";
import { newSection, sectionsToHTML } from '../components/TermsCondition';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { useAppStore } from '../services/store';
import { useItems, useQuotations } from '../hooks/customHooks';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import {
  numberToWords,
  formatFileSize,
  getFileIcon,
  MAX_DOCUMENT_SIZE_MB,
  ALLOWED_DOCUMENT_TYPES,
  validateFile
} from '../utils/quotationUtils';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGES_PER_ITEM = 6;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ─────────────────────────────────────────────────────────────
// PDF Overlay Component
// ─────────────────────────────────────────────────────────────
const PdfOverlay = React.memo(({ step }) => (
  <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ backgroundColor: "white", borderRadius: "1rem", padding: "2rem 2.5rem", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: "280px" }}>
      <Loader size={36} color="#0369a1" style={{ animation: "spin 1s linear infinite", marginBottom: "1rem" }} />
      <div style={{ fontWeight: "700", fontSize: "1rem", color: "#1f2937", marginBottom: "0.25rem" }}>Generating PDF…</div>
      <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{step}</div>
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
));

// ─────────────────────────────────────────────────────────────
// Content Skeleton Component
// ─────────────────────────────────────────────────────────────
const ContentSkeleton = React.memo(() => {
  const bar = (w, h = "14px") => (
    <div style={{ width: w, height: h, borderRadius: "6px", background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize: "200% 100%", animation: "skeleton 1.4s ease infinite" }} />
  );

  return (
    <div style={{ background: "white", borderRadius: "1rem", padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
      <style>{`@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
        {bar("160px", "20px")} {bar("120px", "20px")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
        {[0, 1].map(col => (
          <div key={col} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[90, 120, 80, 110].map((w, i) => <div key={i}>{bar(`${w}px`, "13px")}</div>)}
          </div>
        ))}
      </div>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ background: "#f8fafc", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>{bar("200px", "13px")}</div>
        {[0, 1, 2].map(r => (
          <div key={r} style={{ display: "flex", gap: "1rem", padding: "0.875rem 1rem", borderBottom: r < 2 ? "1px solid #f1f5f9" : "none" }}>
            {bar("30px")} {bar("40%")} {bar("40px")} {bar("60px")} {bar("70px")}
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Snack helpers
// ─────────────────────────────────────────────────────────────
const mkSnack = (message, type = "error") => ({ show: true, message, type });
const hideSnack = { show: false, message: "", type: "error" };

// ─────────────────────────────────────────────────────────────
// Wrapper guard
// ─────────────────────────────────────────────────────────────
export default function QuotationTemplate(props) {
  const { customer, selectedItems } = props;
  if (!customer || !selectedItems) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#6b7280" }}>
          <Loader size={36} color="#0369a1" style={{ animation: "spin 1s linear infinite", marginBottom: "1rem" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: "0.9375rem", fontWeight: "500" }}>Loading quotation…</p>
        </div>
      </div>
    );
  }
  return <QuotationTemplateInner {...props} />;
}

// ─────────────────────────────────────────────────────────────
// Inner component - OPTIMIZED
// ─────────────────────────────────────────────────────────────
function QuotationTemplateInner({ customer, selectedItems, selectedCompany, selectedCurrency, onBack }) {
  const navigate = useNavigate();
  const { items, isLoading: isItemsLoading, loadError: itemsLoadError } = useItems();
  const { addQuotation } = useQuotations();
  const user = useAppStore(state => state.user);

  const today = new Date().toISOString().split("T")[0];
  const itemsReady = !isItemsLoading && !itemsLoadError && Array.isArray(items);

  // State
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [quotationItems, setQuotationItems] = useState([]);
  const [quotationData, setQuotationData] = useState({
    date: today,
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    customer: customer?.name || "",
    contact: customer?.phone || "",
    projectName: "", // Add this
    ourRef: "", 
    ourContact: "", 
    salesOffice: "", 
    paymentTerms: "", 
    deliveryTerms: "",
    tl: "", // Add this
    trn: "", // Add this
    tax: 0, 
    discount: 0, 
    notes: "", 
    termsAndConditions: "", 
    termsImage: null
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
  const [snackbar, setSnackbar] = useState(hideSnack);
  const [isCustomTax, setIsCustomTax] = useState(false); 

  const showSnack = useCallback((msg, type = "error") => setSnackbar(mkSnack(msg, type)), []);

  // Initialize quotation items
  useEffect(() => {
    if (itemsReady && selectedItems?.length && quotationItems.length === 0) {
      setQuotationItems(selectedItems.map((item) => {
        const found = items.find(i => i._id === item.itemId);
        return {
          id: `${Date.now()}-${Math.random()}`,
          itemId: item.itemId || item._id || null,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice || item.price) || 0,
          name: item.name || found?.name || "",
          description: found?.description || item.description || "",
        };
      }));
    }
  }, [itemsReady, selectedItems, items, quotationItems.length]);

  // Memoized calculations
  const subtotal = useMemo(() => 
    quotationItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [quotationItems]
  );

  const taxAmount = useMemo(() => (subtotal * (Number(quotationData.tax) || 0)) / 100, [subtotal, quotationData.tax]);
  const discountAmount = useMemo(() => (subtotal * (Number(quotationData.discount) || 0)) / 100, [subtotal, quotationData.discount]);
  const grandTotal = useMemo(() => subtotal + taxAmount - discountAmount, [subtotal, taxAmount, discountAmount]);
  const amountInWords = useMemo(() => numberToWords(grandTotal), [grandTotal]);

  const quotationNumber = useMemo(() => {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const rn = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `QT-${yy}${mm}${dd}-${rn}`;
  }, []);

// Validation - Simplified and robust
const validateHeaderField = useCallback((field, value) => {
  const errs = {};
  
  // Date validations
  if (field === "date" || field === "expiryDate") {
    const dateVal = field === "date" ? value : quotationData.date;
    const expiryVal = field === "expiryDate" ? value : quotationData.expiryDate;
    
    if (!dateVal) errs.date = "Creation date is required.";
    if (!expiryVal) errs.expiryDate = "Expiry date is required.";
    if (dateVal && expiryVal && new Date(expiryVal) < new Date(dateVal)) {
      errs.expiryDate = "Expiry date cannot be before the creation date.";
    }
  }
  
  // Tax validation - handle based on mode
  if (field === "tax") {
    // If in custom mode and value is empty, don't validate yet
    if (isCustomTax && value === "") {
      // Allow empty during custom input
    } 
    // If not in custom mode, validate the preset value
    else if (!isCustomTax) {
      // Preset values are always valid numbers (including 0)
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        errs.tax = "VAT must be between 0 and 100.";
      }
    }
    // If in custom mode with a value, validate it
    else if (isCustomTax && value !== "") {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errs.tax = "VAT must be a number.";
      } else if (numValue < 0 || numValue > 100) {
        errs.tax = "VAT must be between 0 and 100.";
      }
    }
  }
  
  // Discount validation - optional
  if (field === "discount" && value !== "" && value !== null && value !== undefined) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      errs.discount = "Discount must be a number.";
    } else if (numValue < 0 || numValue > 100) {
      errs.discount = "Discount must be between 0 and 100.";
    }
  }
  
  return errs;
}, [quotationData, isCustomTax]);

const handleDataChange = useCallback((field, value) => {
  console.log(`Data change - ${field}:`, value, "type:", typeof value);
  
  // Update the data
  setQuotationData(prev => ({ ...prev, [field]: value }));
  
  // ALWAYS clear error for this field immediately
  setHeaderErrors(prev => {
    const newErrors = { ...prev };
    delete newErrors[field];
    console.log("Cleared error for:", field, "New errors:", newErrors);
    return newErrors;
  });
}, []);

const validateAll = useCallback(() => {
  const errors = {};
  
  // Check required fields
  if (!quotationData.date) errors.date = "Creation date is required.";
  if (!quotationData.expiryDate) errors.expiryDate = "Expiry date is required.";
  
  // Date relationship
  if (quotationData.date && quotationData.expiryDate && 
      new Date(quotationData.expiryDate) < new Date(quotationData.date)) {
    errors.expiryDate = "Expiry date cannot be before the creation date.";
  }
  
  // Tax validation - handle based on mode
  if (isCustomTax) {
    // In custom mode, empty is not allowed
    if (quotationData.tax === "" || quotationData.tax === null || quotationData.tax === undefined) {
      errors.tax = "VAT is required.";
    } else {
      const taxNum = Number(quotationData.tax);
      if (isNaN(taxNum)) {
        errors.tax = "VAT must be a number.";
      } else if (taxNum < 0 || taxNum > 100) {
        errors.tax = "VAT must be between 0 and 100.";
      }
    }
  } else {
    // In preset mode, tax should be a number (0 is valid)
    const taxNum = Number(quotationData.tax);
    if (isNaN(taxNum)) {
      errors.tax = "VAT is required.";
    } else if (taxNum < 0 || taxNum > 100) {
      errors.tax = "VAT must be between 0 and 100.";
    }
  }
  
  // Discount validation - optional, empty is allowed (treated as 0)
  if (quotationData.discount !== "" && quotationData.discount !== null && quotationData.discount !== undefined) {
    const discountNum = Number(quotationData.discount);
    if (isNaN(discountNum)) {
      errors.discount = "Discount must be a number.";
    } else if (discountNum < 0 || discountNum > 100) {
      errors.discount = "Discount must be between 0 and 100.";
    }
  }
  
  // Items validation
  if (!quotationItems.length) {
    showSnack("Please add at least one item.");
    return false;
  }
  
  for (const item of quotationItems) {
    if (!item.itemId) {
      showSnack("Please select an item for all rows.");
      return false;
    }
    const qr = validateQuantity(item.quantity);
    if (!qr.isValid) {
      showSnack(`"${item.name || 'Item'}" — ${qr.error}`);
      return false;
    }
    const pr = validatePrice(item.unitPrice);
    if (!pr.isValid) {
      showSnack(`"${item.name || 'Item'}" — ${pr.error}`);
      return false;
    }
  }
  
  // If there are any errors, show them
  if (Object.keys(errors).length > 0) {
    setHeaderErrors(errors);
    showSnack("Please fix the highlighted errors.");
    return false;
  }
  
  return true;
}, [quotationData, quotationItems, showSnack, isCustomTax]);


  // Item management
  const addMoreItem = useCallback(() => {
    setQuotationItems(prev => [...prev, { 
      id: `${Date.now()}-${Math.random()}`, 
      itemId: null, 
      quantity: 1, 
      unitPrice: 0, 
      name: "", 
      description: "" 
    }]);
  }, []);

  const removeItem = useCallback((id) => {
    setQuotationItems(prev => prev.filter(i => i.id !== id));
    setItemImages(prev => { const c = { ...prev }; delete c[id]; return c; });
    setFieldErrors(prev => { const c = { ...prev }; delete c[id]; return c; });
  }, []);

  const updateItem = useCallback((id, field, value) => {
    if (field === "quantity") {
      if (value === "" || value === null) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity: "Quantity is required." } }));
        return;
      }
      const r = validateQuantity(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity: r.error } }));
        return;
      }
      setFieldErrors(prev => { 
        const n = { ...prev }; 
        if (n[id]) delete n[id].quantity; 
        if (n[id] && !Object.keys(n[id]).length) delete n[id]; 
        return n; 
      });
      value = parseInt(value, 10);
    }
    if (field === "unitPrice") {
      if (value === "") {
        setQuotationItems(prev => prev.map(item => item.id !== id ? item : { ...item, unitPrice: 0 }));
        return;
      }
      const r = validatePrice(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], unitPrice: r.error } }));
        return;
      }
      setFieldErrors(prev => { 
        const n = { ...prev }; 
        if (n[id]) delete n[id].unitPrice; 
        if (n[id] && !Object.keys(n[id]).length) delete n[id]; 
        return n; 
      });
      value = parseFloat(value) || 0;
    }
    if (field === "itemId" && value) {
      const found = items?.find(i => i._id === value);
      setQuotationItems(prev => prev.map(item =>
        item.id !== id ? item : {
          ...item, 
          itemId: value,
          name: found?.name || "",
          description: found?.description || "",
          unitPrice: found?.price != null ? Number(found.price) : item.unitPrice,
        }
      ));
      return;
    }
    setQuotationItems(prev => prev.map(item => item.id !== id ? item : { ...item, [field]: value }));
  }, [items]);

  // Image upload
  const handleImageUpload = useCallback((e, itemId) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    const slots = MAX_IMAGES_PER_ITEM - (itemImages[itemId] || []).length;
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
      reader.onload = () => setItemImages(prev => ({ 
        ...prev, 
        [itemId]: [...(prev[itemId] || []), reader.result] 
      }));
      reader.readAsDataURL(file);
    });
    
    setEditingImageId(null);
    e.target.value = "";
  }, [itemImages, showSnack]);

  // ─────────────────────────────────────────────────────────────
  // DOCUMENT HANDLERS - Using utils
  // ─────────────────────────────────────────────────────────────
  const handleDocumentUpload = useCallback(async (files, descriptions) => {
    try {
      setIsSaving(true);
      
      // Validate files using the utility
      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
          showSnack(validation.error, 'error');
          return;
        }
      }
      
      // Convert each file to base64
      const base64Promises = files.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              fileData: reader.result,
              name: file.name,
              type: file.type,
              size: file.size,
            });
          };
          reader.readAsDataURL(file);
        });
      });

      const base64Files = await Promise.all(base64Promises);
      
      // Create document objects
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
      console.error('❌ Error processing documents:', error);
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

 

  // PDF generation using shared utility
  const handleExportPDF = useCallback(async () => {
    if (!validateAll()) return;
    
    setIsExporting(true);
    setExportStep("Preparing data…");
    
    try {
      // Prepare quotation data for PDF generator
      const pdfData = {
        ...quotationData,
        items: quotationItems.map(item => ({
          ...item,
          imagePaths: itemImages[item.id] || []
        })),
        taxPercent: quotationData.tax,
        discountPercent: quotationData.discount,
        quotationNumber,
        currency: { code: selectedCurrency },
        companySnapshot: selectedCompany ? { name: selectedCompany } : null
      };
      
      setExportStep("Generating PDF…");
      await downloadQuotationPDF(pdfData, { newImages: itemImages });
      
      showSnack("PDF downloaded successfully!", "success");
    } catch (err) {
      console.error('PDF export error:', err);
      showSnack(err?.message || "Failed to export PDF", "error");
    } finally {
      setIsExporting(false);
      setExportStep("");
    }
  }, [validateAll, quotationData, quotationItems, itemImages, quotationNumber, selectedCurrency, selectedCompany, showSnack]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!validateAll()) return;
    if (!selectedCompany) {
      showSnack("Please select a company", "error");
      return;
    }
    
    setIsSaving(true);
    try {
      const quotationImages = {};
      quotationItems.forEach((item, idx) => {
        if (itemImages[item.id]?.length) quotationImages[idx] = itemImages[item.id];
      });

      const currentDocs = [...uploadedDocuments];
      
      // Extract base64 data and descriptions
      const internalDocuments = currentDocs.map(doc => doc.fileData);
      const internalDocDescriptions = currentDocs.map(doc => doc.description || '');

      const quotation = {
        companyId: selectedCompany,
        currencyCode: selectedCurrency,
        customerId: customer._id,
        projectName: quotationData.projectName?.trim() || "", 
        customer: quotationData.customer?.trim(),
        contact: quotationData.contact?.trim() || "",
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        ourRef: quotationData.ourRef?.trim() || "",
        ourContact: quotationData.ourContact?.trim() || "",
        salesOffice: quotationData.salesOffice?.trim() || "",
        paymentTerms: quotationData.paymentTerms?.trim() || "",
        deliveryTerms: quotationData.deliveryTerms?.trim() || "",
        tl: quotationData.tl?.trim() || "", 
        trn: quotationData.trn?.trim() || "",  
        tax: Number(quotationData.tax) || 0,
        discount: Number(quotationData.discount) || 0,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: sectionsToHTML(tcSections),
        termsImage: quotationData.termsImage || null,
        total: grandTotal,
        quotationImages,
        items: quotationItems.map(qi => ({
          itemId: qi.itemId,
          quantity: Number(qi.quantity) || 1,
          unitPrice: Number(qi.unitPrice) || 0,
        })),
        internalDocuments,
        internalDocDescriptions
      };

      const result = await addQuotation(quotation);
      
      if (result?.success) {
        showSnack("Quotation created successfully!", "success");
        setTimeout(() => navigate(user?.role === 'admin' ? '/admin' : '/home'), 1500);
      } else {
        showSnack(result?.error || "Failed to create quotation", "error");
      }
    } catch (err) {
      console.error('❌ Submit error:', err);
      showSnack(err?.response?.data?.message || err.message || "Error creating quotation", "error");
    } finally {
      setIsSaving(false);
    }
  }, [validateAll, selectedCompany, showSnack, selectedCurrency, customer, quotationData, grandTotal, 
      quotationItems, itemImages, uploadedDocuments, tcSections, addQuotation, user, navigate]);

  const hasHeaderErrors = Object.keys(headerErrors).length > 0;
  const hasItemErrors = Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);
  const hasAnyError = hasHeaderErrors || hasItemErrors;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" }}>
      <style>{`
        @media print { body{margin:0;padding:0;background:white;} .no-print{display:none!important;} .quotation-content{box-shadow:none;border-radius:0;} table{page-break-inside:avoid;}tr{page-break-inside:avoid;} @page{margin:0;} }
        .edit-input:focus{outline:2px solid #3b82f6;border-color:#3b82f6!important;}
        .field-error-input{border-color:#dc2626!important;background:#fef2f2!important;}
      `}</style>

      {isExporting && <PdfOverlay step={exportStep} />}

      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 }}>📄 Create Quotation</h1>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button onClick={() => setIsEditing(!isEditing)} disabled={isItemsLoading}
              style={{ 
                backgroundColor: isEditing ? "#ef4444" : "#f59e0b", 
                color: "white", 
                padding: "0.625rem 1rem", 
                borderRadius: "0.5rem", 
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                border: "none", 
                cursor: isItemsLoading ? "not-allowed" : "pointer", 
                fontSize: "0.875rem", 
                fontWeight: "500", 
                opacity: isItemsLoading ? 0.6 : 1 
              }}>
              {isEditing ? <><Save size={18} /> Done</> : <><Edit2 size={18} /> Edit</>}
            </button>
            <button onClick={handleExportPDF} disabled={isExporting || isItemsLoading || hasAnyError}
              title={hasAnyError ? "Fix validation errors first" : "Download PDF"}
              style={{ 
                backgroundColor: (isExporting || isItemsLoading || hasAnyError) ? "#d1d5db" : "#0369a1", 
                color: "white", 
                padding: "0.625rem 1rem", 
                borderRadius: "0.5rem", 
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem", 
                border: "none", 
                cursor: (isExporting || isItemsLoading || hasAnyError) ? "not-allowed" : "pointer", 
                fontSize: "0.875rem", 
                fontWeight: "500", 
                opacity: hasAnyError ? 0.6 : 1 
              }}>
              {isExporting ? <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : <><Download size={18} /> Download PDF</>}
            </button>
            <button onClick={onBack} style={{ 
              backgroundColor: "#6b7280", 
              color: "white", 
              padding: "0.625rem 1rem", 
              borderRadius: "0.5rem", 
              display: "flex", 
              alignItems: "center", 
              gap: "0.5rem", 
              border: "none", 
              cursor: "pointer", 
              fontSize: "0.875rem", 
              fontWeight: "500" 
            }}>
              <ArrowLeft size={18} /> Back
            </button>
          </div>
        </div>

        {isItemsLoading && (
          <div className="no-print" style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.75rem", 
            backgroundColor: "#eff6ff", 
            border: "1px solid #bfdbfe", 
            borderRadius: "0.5rem", 
            padding: "0.875rem 1rem", 
            marginBottom: "1rem", 
            fontSize: "0.875rem", 
            color: "#1e40af" 
          }}>
            <Loader size={18} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
            <span>Loading catalogue items — dropdowns will be ready shortly…</span>
          </div>
        )}
        
        {itemsLoadError && (
          <div className="no-print" style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.75rem", 
            backgroundColor: "#fef2f2", 
            border: "1px solid #fecaca", 
            borderRadius: "0.5rem", 
            padding: "0.875rem 1rem", 
            marginBottom: "1rem", 
            fontSize: "0.875rem", 
            color: "#991b1b" 
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>Failed to load catalogue items: <strong>{itemsLoadError}</strong> — dropdowns may be empty.</span>
          </div>
        )}

        {hasHeaderErrors && isEditing && (
          <div className="no-print" style={{ 
            display: "flex", 
            alignItems: "flex-start", 
            gap: "0.75rem", 
            backgroundColor: "#fef2f2", 
            border: "1px solid #fecaca", 
            borderRadius: "0.5rem", 
            padding: "0.875rem 1rem", 
            marginBottom: "1rem", 
            fontSize: "0.875rem", 
            color: "#991b1b" 
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />
            <div>
              <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>Please fix the following:</div>
              {Object.values(headerErrors).filter(Boolean).map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          </div>
        )}

        {isEditing && !hasHeaderErrors && (
          <div className="no-print" style={{ 
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
          }}>
            ✏️ <strong>Edit mode active</strong> — changes are validated in real time. Click <strong>Done</strong> when finished.
          </div>
        )}

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
            availableItems={items || []}
            onUpdateItem={updateItem}
            onAddItem={addMoreItem}
            onRemoveItem={removeItem}
            onAddImages={handleImageUpload}
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
            // Document props
            documents={uploadedDocuments}
            onDocumentUpload={handleDocumentUpload}
            onDocumentDelete={handleDocumentDelete}
            onDocumentDownload={handleDocumentDownload}
            formatFileSize={formatFileSize}
            getFileIcon={getFileIcon}
            setHeaderErrors={setHeaderErrors}  
  isCustomTax={isCustomTax}  
  setIsCustomTax={setIsCustomTax} 
          />
        )}

        {!isEditing && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", marginTop: "2rem" }}>
            <button onClick={handleSubmit} disabled={isSaving}
              style={{ 
                backgroundColor: (isSaving || hasAnyError) ? "#d1d5db" : "#10b981", 
                color: (isSaving || hasAnyError) ? "#9ca3af" : "white", 
                padding: "1rem 2rem", 
                borderRadius: "0.5rem", 
                fontWeight: "bold", 
                border: "none", 
                cursor: (isSaving || hasAnyError) ? "not-allowed" : "pointer", 
                fontSize: "1rem", 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem", 
                opacity: hasAnyError ? 0.6 : 1 
              }}>
              {isSaving ? <><Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : <>💾 Save Quotation</>}
            </button>
            {hasAnyError && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.375rem", 
                color: "#dc2626", 
                fontSize: "0.8125rem", 
                fontWeight: "500" 
              }}>
                <AlertCircle size={14} /> Fix validation errors above to save
              </div>
            )}
          </div>
        )}
      </div>

      {snackbar.show && (
        <Snackbar message={snackbar.message} type={snackbar.type} onClose={() => setSnackbar(hideSnack)} />
      )}
    </div>
  );
}