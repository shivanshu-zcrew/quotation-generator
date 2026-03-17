import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quotationAPI } from '../services/api';
import { useAppStore } from '../services/store';
import { useItems } from './customHooks';
import {
  parseQuotationData,
  parseQuotationItems,
  parseInternalDocuments,
  numberToWords
} from '../utils/quotationUtils';
import { newSection, htmlToSections, sectionsToHTML } from '../components/TermsCondition';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { imageToBase64, ITEMS_PER_FIRST_PAGE, BASE_URL } from '../utils/quotationUtils';
 
import headerImage from '../assets/header.png'; 

export function useQuotation() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { items } = useItems();
  const quotations = useAppStore((state) => state.quotations);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingImgId, setEditingImgId] = useState(null);
  const [fetchedQ, setFetchedQ] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [newImages, setNewImages] = useState({});
  const [quotationData, setQuotationData] = useState({});
  const [quotationItems, setQuotationItems] = useState([]);
  const [tcSections, setTcSections] = useState([newSection()]);
  const [internalDocuments, setInternalDocuments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);

  const originalQuotation = (quotations || []).find((q) => q._id === id) || fetchedQ;

  // Calculations
  const subtotal = useMemo(() =>
    quotationItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [quotationItems]
  );

  const taxAmount = useMemo(() =>
    (subtotal * (Number(quotationData.tax) || 0)) / 100,
    [subtotal, quotationData.tax]
  );

  const discountAmount = useMemo(() =>
    (subtotal * (Number(quotationData.discount) || 0)) / 100,
    [subtotal, quotationData.discount]
  );

  const grandTotal = useMemo(() =>
    subtotal + taxAmount - discountAmount,
    [subtotal, taxAmount, discountAmount]
  );

  const amountInWords = useMemo(() =>
    numberToWords(grandTotal),
    [grandTotal]
  );

  // Fetch quotation
  useEffect(() => {
    if (!(quotations || []).find((q) => q._id === id) && id) {
      setLoading(true);
      setFetchError(null);
      quotationAPI.getById(id)
        .then((res) => setFetchedQ(res.data))
        .catch((err) => {
          console.error("Failed to fetch quotation:", err);
          setFetchError("Failed to load quotation. Please go back and try again.");
        })
        .finally(() => setLoading(false));
    }
  }, [id, quotations]);

  // Populate state
  useEffect(() => {
    if (!originalQuotation) return;
    setQuotationData(parseQuotationData(originalQuotation));
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    setTcSections(htmlToSections(originalQuotation.termsAndConditions));
    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
  }, [originalQuotation]);

  // Document handlers
  const handleDocumentUpload = useCallback(async (files, descriptions) => {
    try {
      const base64Promises = files.map(file => {
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

      const tempDocs = base64Files.map((file, index) => ({
        id: `temp-${Date.now()}-${index}-${Math.random()}`,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: file.fileData,
        description: descriptions[index] || '',
        uploadedAt: new Date().toISOString(),
        isTemp: true
      }));

      setNewDocuments(prev => [...prev, ...tempDocs]);
      setSnackbar({
        show: true,
        message: `${files.length} document(s) ready`,
        type: 'success'
      });
    } catch (error) {
      console.error('Error processing documents:', error);
      setSnackbar({
        show: true,
        message: 'Failed to process documents',
        type: 'error'
      });
    }
  }, []);

  const handleDocumentDelete = useCallback(async (docId) => {
    const isTemp = newDocuments.some(d => d.id === docId);

    if (isTemp) {
      setNewDocuments(prev => prev.filter(d => d.id !== docId));
    } else {
      try {
        await quotationAPI.documents.delete(id, docId);
        setInternalDocuments(prev => prev.filter(d => d._id !== docId));
        setSnackbar({
          show: true,
          message: 'Document deleted',
          type: 'success'
        });
      } catch (error) {
        console.error('Error deleting document:', error);
        setSnackbar({
          show: true,
          message: 'Failed to delete document',
          type: 'error'
        });
      }
    }
  }, [id, newDocuments]);

  const handleDocumentDownload = useCallback((docId) => {
    const doc = [...internalDocuments, ...newDocuments].find(d =>
      (d._id === docId || d.id === docId)
    );
    if (doc) {
      window.open(doc.fileUrl || doc.fileData, '_blank');
    }
  }, [internalDocuments, newDocuments]);

  // Data change handlers
  const handleDataChange = useCallback((field, value) => {
    if (value === '') {
      if (field === 'tax' || field === 'discount') {
        setQuotationData((prev) => ({ ...prev, [field]: 0 }));
        return;
      }
      setQuotationData((prev) => ({ ...prev, [field]: '' }));
      return;
    }

    if (field === 'tax' || field === 'discount') {
      const result = validatePercentage(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        return;
      }
      value = parseFloat(value) || 0;
    }

    setQuotationData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addItem = useCallback(() =>
    setQuotationItems((prev) => [...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        itemId: null,
        name: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        imagePaths: []
      }
    ]), []);

  const removeItem = useCallback((id) => {
    setQuotationItems((prev) => prev.filter((i) => i.id !== id));
    setNewImages((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setFieldErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
  }, []);

  const updateItem = useCallback((id, field, value) => {
    if (value === '') {
      if (field === 'quantity') {
        setSnackbar({ show: true, message: 'Quantity cannot be empty', type: 'error' });
        return;
      }
      if (field === 'unitPrice') {
        setQuotationItems((prev) => prev.map((item) =>
          item.id === id ? { ...item, [field]: 0 } : item
        ));
        return;
      }
    }

    if (field === 'quantity') {
      const result = validateQuantity(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], quantity: result.error } }));
        return;
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          if (newErrors[id]) {
            delete newErrors[id].quantity;
            if (Object.keys(newErrors[id]).length === 0) {
              delete newErrors[id];
            }
          }
          return newErrors;
        });
      }
      value = parseInt(value, 10);
    }

    if (field === 'unitPrice') {
      const result = validatePrice(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], unitPrice: result.error } }));
        return;
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          if (newErrors[id]) {
            delete newErrors[id].unitPrice;
            if (Object.keys(newErrors[id]).length === 0) {
              delete newErrors[id];
            }
          }
          return newErrors;
        });
      }
      value = parseFloat(value) || 0;
    }

    setQuotationItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;

      if (field === "itemId" && value) {
        const found = items.find((i) => i._id === value);
        return {
          ...item,
          itemId: value,
          name: found?.name || item.name,
          description: found?.description || item.description,
          unitPrice: found?.price != null ? Number(found.price) : item.unitPrice,
        };
      }

      return { ...item, [field]: value };
    }));
  }, [items]);

  // Image handlers
  const handleImageUpload = useCallback((e, itemId) => {
    Array.from(e.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setNewImages((prev) => ({ ...prev, [itemId]: [...(prev[itemId] || []), reader.result] }));
      reader.readAsDataURL(file);
    });
    setEditingImgId(null);
  }, []);

  const removeNewImage = useCallback((itemId, idx) =>
    setNewImages((prev) => {
      const arr = (prev[itemId] || []).filter((_, i) => i !== idx);
      return { ...prev, [itemId]: arr.length ? arr : undefined };
    }), []);

  const removeExistingImage = useCallback((itemId, idx) =>
    setQuotationItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, imagePaths: item.imagePaths.filter((_, i) => i !== idx) } : item
    )), []);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    if (!originalQuotation) return;
    setQuotationData(parseQuotationData(originalQuotation));
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    setTcSections(htmlToSections(originalQuotation.termsAndConditions));
    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
    setNewDocuments([]);
    setNewImages({});
    setEditingImgId(null);
    setFieldErrors({});
    setIsEditing(false);
  }, [originalQuotation]);

  // Validation
  const validateBeforeSave = useCallback(() => {
    if (!quotationItems.length) {
      setSnackbar({ show: true, message: "Add at least one item.", type: 'error' });
      return false;
    }

    for (const item of quotationItems) {
      if (!item.itemId) {
        setSnackbar({ show: true, message: "Please select an item for all rows.", type: 'error' });
        return false;
      }

      const quantityResult = validateQuantity(item.quantity);
      if (!quantityResult.isValid) {
        setSnackbar({ show: true, message: `Item "${item.name || 'Unknown'}" has invalid quantity`, type: 'error' });
        return false;
      }

      const priceResult = validatePrice(item.unitPrice);
      if (!priceResult.isValid) {
        setSnackbar({ show: true, message: `Item "${item.name || 'Unknown'}" has invalid price`, type: 'error' });
        return false;
      }
    }

    if (!quotationData.customer?.trim()) {
      setSnackbar({ show: true, message: "Customer name is required.", type: 'error' });
      return false;
    }

    if (!quotationData.expiryDate) {
      setSnackbar({ show: true, message: "Expiry date is required.", type: 'error' });
      return false;
    }

    const taxResult = validatePercentage(quotationData.tax);
    if (!taxResult.isValid) {
      setSnackbar({ show: true, message: taxResult.error, type: 'error' });
      return false;
    }

    const discountResult = validatePercentage(quotationData.discount);
    if (!discountResult.isValid) {
      setSnackbar({ show: true, message: discountResult.error, type: 'error' });
      return false;
    }

    return true;
  }, [quotationItems, quotationData]);

  // Save
  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return;

    setIsSaving(true);
    try {
      const quotationImages = {};
      quotationItems.forEach((item, index) => {
        if (newImages[item.id]?.length) quotationImages[index] = newImages[item.id];
      });

      const documentData = [
        ...internalDocuments.map(doc => ({
          fileName: doc.fileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          fileUrl: doc.fileUrl,
          publicId: doc.publicId,
          description: doc.description || '',
        })),
        ...newDocuments.map(doc => ({
          fileName: doc.fileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          fileData: doc.fileData,
          description: doc.description || '',
        }))
      ];

      const taxValue = parseFloat(quotationData.tax);
      const discountValue = parseFloat(quotationData.discount);

      const payload = {
        customerId: originalQuotation.customerId?._id || originalQuotation.customerId,
        customer: quotationData.customer,
        contact: quotationData.contact,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        ourRef: quotationData.ourRef,
        ourContact: quotationData.ourContact,
        salesOffice: quotationData.salesOffice,
        paymentTerms: quotationData.paymentTerms,
        deliveryTerms: quotationData.deliveryTerms,
        taxPercent: isNaN(taxValue) ? 0 : taxValue,
        discountPercent: isNaN(discountValue) ? 0 : discountValue,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: sectionsToHTML(tcSections),
        termsImage: quotationData.termsImage || null,
        total: grandTotal,
        quotationImages,
        items: quotationItems.map((qi) => ({
          itemId: qi.itemId,
          quantity: Number(qi.quantity) || 1,
          unitPrice: Number(qi.unitPrice) || 0,
          imagePaths: qi.imagePaths || [],
          description: qi.description || "",
        })),
        internalDocuments: documentData
          .filter(doc => doc.fileData)
          .map(doc => doc.fileData),
        internalDocDescriptions: documentData
          .filter(doc => doc.fileData)
          .map(doc => doc.description || '')
      };

      const result = await updateQuotation(originalQuotation._id, payload);

      if (result?.success) {
        setSnackbar({ show: true, message: "Quotation updated successfully!", type: 'success' });
        setIsEditing(false);
        setEditingImgId(null);
        setNewImages({});
        setNewDocuments([]);
        setFieldErrors({});

        const refreshed = await quotationAPI.getById(id);
        setFetchedQ(refreshed.data);
      } else {
        setSnackbar({ show: true, message: result?.error || "Failed to update quotation", type: 'error' });
      }
    } catch (err) {
      console.error("Save error:", err);
      setSnackbar({ show: true, message: "Error saving quotation: " + (err.message || "Unknown error"), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, newDocuments,
      internalDocuments, tcSections, grandTotal, updateQuotation, id]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) return;

    const result = await deleteQuotation(originalQuotation._id);
    if (result?.success) {
      navigate(-1);
    } else {
      setSnackbar({ show: true, message: result?.error || "Failed to delete quotation", type: 'error' });
    }
  }, [originalQuotation, deleteQuotation, navigate]);

  // Navigation
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleDocumentPreview = useCallback((docId) => {
    const doc = [...internalDocuments, ...newDocuments].find(d => 
      (d._id === docId || d.id === docId)
    );
    
    if (!doc) return;
    
    // Only show preview for images
    if (doc.fileType?.startsWith('image/')) {
      setPreviewDoc(doc);
    } else {
      // For non-images, just download
      handleDocumentDownload(docId);
    }
  }, [internalDocuments, newDocuments, handleDocumentDownload]);



  const generatePDF = useCallback(async () => {
  if (!validateBeforeSave()) return;
  
  setIsExporting(true);
  try {
    const headerBase64 = await imageToBase64(headerImage);
    const firstPage = quotationItems.slice(0, ITEMS_PER_FIRST_PAGE);
    const remaining = quotationItems.slice(ITEMS_PER_FIRST_PAGE);
    const multiPage = remaining.length > 0;

    // Convert item images to base64
    const itemImagesBase64 = {};
    for (const qi of [...firstPage, ...remaining]) {
      const urls = [
        ...(qi.imagePaths || []),
        ...(newImages[qi.id] || []),
      ];
      itemImagesBase64[qi.id] = await Promise.all(urls.map((src) => imageToBase64(src)));
    }

    const renderRow = (qi, index) => {
      const allImgs = (itemImagesBase64[qi.id] || []).filter(Boolean);
      return `<tr>
        <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index + 1}</td>
        <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
          <div style="font-weight:600;font-size:11px;">${qi.name || "—"}</div>
          ${qi.description ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${qi.description}</div>` : ""}
          ${allImgs.length ? `<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
            ${allImgs.map((src) => `<div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" /></div>`).join("")}
          </div>` : ""}
        </td>
        <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${qi.quantity}</td>
        <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${Number(qi.unitPrice).toFixed(2)}</td>
        <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(Number(qi.quantity) * Number(qi.unitPrice)).toFixed(2)}</td>
      </tr>`;
    };

    const totalsRows = `
      <tr style="background:#f8fafc;font-weight:600;">
        <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Total (AED)</td>
        <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td>
      </tr>
      <tr style="background:#f8fafc;font-weight:600;">
        <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${quotationData.tax}%)</td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmount.toFixed(2)}</td>
      </tr>
      ${discountAmount > 0 ? `<tr style="background:#f8fafc;font-weight:600;">
        <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${quotationData.discount}%)</td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">-${discountAmount.toFixed(2)}</td>
      </tr>` : ""}
      <tr style="background:#000;color:white;font-weight:700;">
        <td colspan="3" style="border:none;padding:8px;"></td>
        <td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td>
        <td style="text-align:right;padding:12px 8px;font-size:12px;">${grandTotal.toFixed(2)}</td>
      </tr>`;

    const thead = `<thead><tr style="background:#000;">
      <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
      <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
      <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
      <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
      <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
    </tr></thead>`;

    const termsImgTag = quotationData.termsImage
      ? `<img src="${quotationData.termsImage.startsWith("data:") ? quotationData.termsImage : `${BASE_URL}${quotationData.termsImage}`}" style="margin-top:8px;max-width:100%;border-radius:4px;" />`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}
      .container{width:874px;margin:0 auto;padding:10px;}
      @page{size:A4;margin:5mm;}
      thead{display:table-row-group;}
      @media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}thead{display:table-row-group;}}
    </style></head><body><div class="container">
      <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">
        ${headerBase64 ? `<img src="${headerBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;" />` : `<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;">
        <div style="text-align:center;flex:1;">
          <h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;">QUOTATION</h1>
          <p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${originalQuotation?.quotationNumber || ""}</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
          <div style="font-size:16px;font-weight:700;">${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Project Name</span><span>:</span><span>${quotationData.projectName || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${quotationData.customer}</span>
          <span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${quotationData.contact || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(quotationData.date).toLocaleDateString("en-IN")}</span>
          <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</span>
          <span style="font-weight:600;color:#4b5563;">TL</span><span>:</span><span>${quotationData.tl || "N/A"}</span>
        </div>
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
          <span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${quotationData.ourRef || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${quotationData.ourContact || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${quotationData.salesOffice || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${quotationData.paymentTerms || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${quotationData.deliveryTerms || "N/A"}</span>
          
          <span style="font-weight:600;color:#4b5563;">TRN</span><span>:</span><span>${quotationData.trn || "N/A"}</span>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          ${thead}<tbody>
            ${firstPage.map((qi, i) => renderRow(qi, i)).join("")}
            ${!multiPage ? totalsRows : ""}
          </tbody>
        </table>
      </div>
      ${multiPage ? `<div class="page-break">
        <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <tbody>
            ${remaining.map((qi, i) => renderRow(qi, i + ITEMS_PER_FIRST_PAGE)).join("")}
            ${totalsRows}
          </tbody>
        </table>
      </div>` : ""}
      <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
        <strong>Amount in words:</strong> ${amountInWords}
      </div>
      ${quotationData.notes ? `<div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes & Terms</h3>
        <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${quotationData.notes}</div>
      </div>` : ""}
      ${tcSections && tcSections.length ? `<div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Terms & Conditions</h3>
        ${sectionsToHTML(tcSections)}
        ${termsImgTag}
      </div>` : ""}
      <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280;">
        <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
        <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
      </div>
    </div></body></html>`;

    const filename = `Quotation_${
      originalQuotation?.quotationNumber || "view"
    }_${new Date().toISOString().split("T")[0]}`;
    
    await quotationAPI.generatePDF(html, filename);
    
    setSnackbar({
      show: true,
      message: "PDF downloaded successfully!",
      type: 'success'
    });
  } catch (err) {
    console.error("PDF export error:", err);
    setSnackbar({
      show: true,
      message: `Failed to generate PDF: ${err.message}`,
      type: 'error'
    });
  } finally {
    setIsExporting(false);
  }
}, [validateBeforeSave, quotationItems, quotationData, newImages, subtotal, taxAmount, 
    discountAmount, grandTotal, tcSections, originalQuotation, amountInWords]);

  return {
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
  };
}