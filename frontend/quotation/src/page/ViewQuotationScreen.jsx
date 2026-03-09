import React, { useState, useEffect, useCallback } from 'react';
import { Download, ArrowLeft, Edit2, X, Save, Plus } from "lucide-react";
import { quotationAPI } from '../services/api';
import { newSection, sectionsToHTML, htmlToSections } from '../components/TermsCondition';
import QuotationLayout, { inputStyle, removeImgBtnStyle } from '../components/QuotationLayout';
import headerImage from "../assets/header.png";
import Snackbar from '../components/Snackbar';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const BASE_URL = "http://51.20.109.158:5000";
const ITEMS_PER_FIRST_PAGE = 8;

// ─────────────────────────────────────────────────────────────
// numberToWords (AED)
// ─────────────────────────────────────────────────────────────
const numberToWords = (num) => {
  if (!num || num === 0) return "Zero Dirhams Only";
  const ones  = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine"];
  const teens = ["Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens  = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const thou  = ["","Thousand","Lakh","Crore"];

  const lt1000 = (n) => {
    if (!n) return "";
    if (n < 10)  return ones[n];
    if (n < 20)  return teens[n - 10];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " "+lt1000(n%100) : "");
  };

  const convertIndian = (n) => {
    let res = "", i = 0;
    while (n > 0) {
      if (n % 1000) res = lt1000(n%1000) + (thou[i] ? " "+thou[i]+" " : "") + res;
      n = Math.floor(n/1000); i++;
    }
    return res.trim() + " Dirhams Only";
  };

  const dirhams = Math.floor(num);
  const fils = Math.round((num - dirhams) * 100);
  let result = convertIndian(dirhams);
  if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${lt1000(fils)} Fils Only`);
  return result;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const parseQuotationData = (q) => ({
  customer:           q.customer || q.customerId?.name || "",
  contact:            q.contact || "",
  date:               q.date?.split("T")[0] || new Date().toISOString().split("T")[0],
  expiryDate:         q.expiryDate?.split("T")[0] || "",
  ourRef:             q.ourRef || "",
  ourContact:         q.ourContact || "",
  salesOffice:        q.salesOffice || "",
  paymentTerms:       q.paymentTerms || "",
  deliveryTerms:      q.deliveryTerms || "",
  tax:                q.tax || 0,
  discount:           q.discount || 0,
  notes:              q.notes || "",
  termsAndConditions: q.termsAndConditions || "",
  termsImage:         q.termsImage || null,
});

const parseQuotationItems = (items) =>
  (items || []).map((item) => ({
    id:          item._id || `${Date.now()}-${Math.random()}`,
    itemId:      item.itemId?._id || item.itemId || null,
    name:        item.itemId?.name || item.name || "",
    description: item.description || item.itemId?.description || "",
    quantity:    Number(item.quantity) || 1,
    unitPrice:   Number(item.unitPrice) || 0,
    imagePaths:  item.imagePaths || [],
  }));

const imageToBase64 = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src.startsWith("data:")) return resolve(src);
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const btnStyle = (bg, disabled = false) => ({
  backgroundColor: disabled ? "#d1d5db" : bg,
  color: disabled ? "#9ca3af" : "white",
  padding: "0.625rem 1rem",
  borderRadius: "0.5rem",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "0.875rem",
  fontWeight: "500",
});

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function ViewQuotationScreen({ quotationId, quotations, items = [], onBack, onUpdateQuotation }) {
  const [isEditing,      setIsEditing]      = useState(false);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isExporting,    setIsExporting]    = useState(false);
  const [editingImgId,   setEditingImgId]   = useState(null);
  const [fetchedQ,       setFetchedQ]       = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [fetchError,     setFetchError]     = useState(null);
  const [newImages,      setNewImages]      = useState({});
  const [quotationData,  setQuotationData]  = useState({});
  const [quotationItems, setQuotationItems] = useState([]);
  const [tcSections,     setTcSections]     = useState([newSection()]);
  
  // Validation states
  const [snackbar, setSnackbar] = useState({ 
    show: false, 
    message: '', 
    type: 'error' 
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const originalQuotation = (quotations || []).find((q) => q._id === quotationId) || fetchedQ;

  // Fetch by ID when not in prop list
  useEffect(() => {
    if (!(quotations || []).find((q) => q._id === quotationId) && quotationId) {
      setLoading(true);
      setFetchError(null);
      quotationAPI.getById(quotationId)
        .then((res) => setFetchedQ(res.data))
        .catch((err) => {
          console.error("Failed to fetch quotation:", err);
          setFetchError("Failed to load quotation. Please go back and try again.");
        })
        .finally(() => setLoading(false));
    }
  }, [quotationId, quotations]);

  // Populate editable state whenever quotation resolves
  useEffect(() => {
    if (!originalQuotation) return;
    setQuotationData(parseQuotationData(originalQuotation));
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    setTcSections(htmlToSections(originalQuotation.termsAndConditions));
  }, [originalQuotation]);

  // ── Derived calculations ──────────────────────
  const subtotal       = quotationItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const taxAmount      = (subtotal * (Number(quotationData.tax) || 0)) / 100;
  const discountAmount = (subtotal * (Number(quotationData.discount) || 0)) / 100;
  const grandTotal     = subtotal + taxAmount - discountAmount;
  const amountInWords  = numberToWords(grandTotal);

  // ── Handlers with validation ─────────────────────────────────
  const handleDataChange = useCallback((field, value) => {
    if (value === '') {
      if (field === 'tax' || field === 'discount') {
        setQuotationData((prev) => ({ ...prev, [field]: 0 }));
        return;
      }
      setQuotationData((prev) => ({ ...prev, [field]: '' }));
      return;
    }

    // Validate percentages
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

  const addItem = () =>
    setQuotationItems((prev) => [...prev,
      { id: `${Date.now()}-${Math.random()}`, itemId: null, name: "", description: "", quantity: 1, unitPrice: 0, imagePaths: [] }
    ]);

  const removeItem = (id) => {
    setQuotationItems((prev) => prev.filter((i) => i.id !== id));
    setNewImages((prev) => { const c = { ...prev }; delete c[id]; return c; });
    // Clear errors for removed item
    setFieldErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
  };

  const updateItem = (id, field, value) => {
    // Handle empty values
    if (value === '') {
      if (field === 'quantity') {
        setSnackbar({
          show: true,
          message: 'Quantity cannot be empty',
          type: 'error'
        });
        return;
      }
      if (field === 'unitPrice') {
        // Allow empty price to be treated as 0
        setQuotationItems((prev) => prev.map((item) => {
          if (item.id !== id) return item;
          return { ...item, [field]: 0 };
        }));
        return;
      }
    }

    // Validate based on field type
    if (field === 'quantity') {
      const result = validateQuantity(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], quantity: result.error } }));
        return;
      } else {
        // Clear error for this field
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
      // Ensure integer quantity
      value = parseInt(value, 10);
    }

    if (field === 'unitPrice') {
      const result = validatePrice(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], unitPrice: result.error } }));
        return;
      } else {
        // Clear error for this field
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
      
      // Handle item selection
      if (field === "itemId" && value) {
        const found = items.find((i) => i._id === value);
        return {
          ...item,
          itemId:      value,
          name:        found?.name        || item.name,
          description: found?.description || item.description,
          unitPrice:   found?.price       != null ? Number(found.price) : item.unitPrice,
        };
      }
      
      if (field === "quantity")  return { ...item, quantity: value };
      if (field === "unitPrice") return { ...item, unitPrice: value };
      if (field === "description") return { ...item, description: value };
      
      return { ...item, [field]: value };
    }));
  };

  const handleImageUpload = (e, itemId) => {
    Array.from(e.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setNewImages((prev) => ({ ...prev, [itemId]: [...(prev[itemId] || []), reader.result] }));
      reader.readAsDataURL(file);
    });
    setEditingImgId(null);
  };

  const removeNewImage = (itemId, idx) =>
    setNewImages((prev) => {
      const arr = (prev[itemId] || []).filter((_, i) => i !== idx);
      return { ...prev, [itemId]: arr.length ? arr : undefined };
    });

  const removeExistingImage = (itemId, idx) =>
    setQuotationItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, imagePaths: item.imagePaths.filter((_, i) => i !== idx) } : item
    ));

  const cancelEdit = () => {
    if (!originalQuotation) return;
    setQuotationData(parseQuotationData(originalQuotation));
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    setTcSections(htmlToSections(originalQuotation.termsAndConditions));
    setNewImages({});
    setEditingImgId(null);
    setFieldErrors({});
    setIsEditing(false);
  };

  // ── Validation before save ──────────────────
  const validateBeforeSave = () => {
    if (!quotationItems.length) {
      setSnackbar({
        show: true,
        message: "Add at least one item.",
        type: 'error'
      });
      return false;
    }

    for (const item of quotationItems) {
      if (!item.itemId) {
        setSnackbar({
          show: true,
          message: "Please select an item for all rows.",
          type: 'error'
        });
        return false;
      }
      
      const quantityResult = validateQuantity(item.quantity);
      if (!quantityResult.isValid) {
        setSnackbar({
          show: true,
          message: `Item "${item.name || 'Unknown'}" has invalid quantity`,
          type: 'error'
        });
        return false;
      }

      const priceResult = validatePrice(item.unitPrice);
      if (!priceResult.isValid) {
        setSnackbar({
          show: true,
          message: `Item "${item.name || 'Unknown'}" has invalid price`,
          type: 'error'
        });
        return false;
      }
    }
    
    if (!quotationData.customer?.trim()) {
      setSnackbar({
        show: true,
        message: "Customer name is required.",
        type: 'error'
      });
      return false;
    }
    
    if (!quotationData.expiryDate) {
      setSnackbar({
        show: true,
        message: "Expiry date is required.",
        type: 'error'
      });
      return false;
    }

    const taxResult = validatePercentage(quotationData.tax);
    if (!taxResult.isValid) {
      setSnackbar({
        show: true,
        message: taxResult.error,
        type: 'error'
      });
      return false;
    }

    const discountResult = validatePercentage(quotationData.discount);
    if (!discountResult.isValid) {
      setSnackbar({
        show: true,
        message: discountResult.error,
        type: 'error'
      });
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateBeforeSave()) return;

    setIsSaving(true);
    try {
      const quotationImages = {};
      quotationItems.forEach((item, index) => {
        if (newImages[item.id]?.length) quotationImages[index] = newImages[item.id];
      });

      const payload = {
        customerId:         originalQuotation.customerId?._id || originalQuotation.customerId,
        customer:           quotationData.customer,
        contact:            quotationData.contact,
        date:               quotationData.date,
        expiryDate:         quotationData.expiryDate,
        ourRef:             quotationData.ourRef,
        ourContact:         quotationData.ourContact,
        salesOffice:        quotationData.salesOffice,
        paymentTerms:       quotationData.paymentTerms,
        deliveryTerms:      quotationData.deliveryTerms,
        tax:                Number(quotationData.tax)      || 0,
        discount:           Number(quotationData.discount) || 0,
        notes:              quotationData.notes              || "",
        termsAndConditions: sectionsToHTML(tcSections),
        termsImage:         quotationData.termsImage         || null,
        total:              grandTotal,
        quotationImages,
        items: quotationItems.map((qi) => ({
          itemId:      qi.itemId,
          quantity:    Number(qi.quantity)  || 1,
          unitPrice:   Number(qi.unitPrice) || 0,
          imagePaths:  qi.imagePaths || [],
          description: qi.description || "",
        })),
      };

      if (typeof onUpdateQuotation === "function") {
        const ok = await onUpdateQuotation(originalQuotation._id, payload);
        if (ok) {
          setSnackbar({
            show: true,
            message: "Quotation updated successfully!",
            type: 'success'
          });
          setIsEditing(false);
          setEditingImgId(null);
          setNewImages({});
          setFieldErrors({});
        }
      }
    } catch (err) {
      console.error("Save error:", err);
      setSnackbar({
        show: true,
        message: "Error saving quotation: " + (err.message || "Unknown error"),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── PDF generation ────────────────────────────
  const buildPdfHTML = async () => {
    const headerBase64 = await imageToBase64(headerImage);
    const firstPage = quotationItems.slice(0, ITEMS_PER_FIRST_PAGE);
    const remaining = quotationItems.slice(ITEMS_PER_FIRST_PAGE);
    const multiPage = remaining.length > 0;

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

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
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
          <p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${originalQuotation.quotationNumber || ""}</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
          <div style="font-size:16px;font-weight:700;">${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
          <span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${quotationData.customer}</span>
          <span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${quotationData.contact || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(quotationData.date).toLocaleDateString("en-IN")}</span>
          <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</span>
        </div>
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
          <span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${quotationData.ourRef || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${quotationData.ourContact || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${quotationData.salesOffice || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${quotationData.paymentTerms || "N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${quotationData.deliveryTerms || "N/A"}</span>
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
      ${sectionsToHTML(tcSections) || quotationData.termsAndConditions ? `<div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Terms & Conditions</h3>
        ${sectionsToHTML(tcSections) || `<div style="font-size:10px;color:#4b5563;">${quotationData.termsAndConditions}</div>`}
        ${termsImgTag}
      </div>` : ""}
      <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280;">
        <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
        <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
      </div>
    </div></body></html>`;
  };

  const handleDownload = async () => {
    if (!validateBeforeSave()) return;
    
    setIsExporting(true);
    try {
      const html = await buildPdfHTML();
      const filename = `Quotation_${
        originalQuotation.quotationNumber || "view"
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
  };

  // ─────────────────────────────────────────────
  // Loading / error / not-found states
  // ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", backgroundColor: "#f0f9ff" }}>
      <div style={{ width: "44px", height: "44px", border: "4px solid #e2e8f0", borderTopColor: "#0369a1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#6b7280", fontWeight: "500" }}>Loading quotation…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (fetchError) return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", padding: "1rem 1.25rem", marginBottom: "1rem", color: "#991b1b", fontSize: "0.9rem" }}>
        ⚠️ {fetchError}
      </div>
      <button onClick={onBack} style={btnStyle("#1e3a8a")}>
        <ArrowLeft size={18} /> Back
      </button>
    </div>
  );

  if (!originalQuotation) return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
      <p style={{ color: "#ef4444", fontSize: "1.125rem" }}>Quotation not found.</p>
      <button onClick={onBack} style={{ marginTop: "1rem", ...btnStyle("#1e3a8a") }}>
        <ArrowLeft size={18} /> Back
      </button>
    </div>
  );

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
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

        {/* ── Top Controls ── */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 }}>
            📄 {isEditing ? "Edit Quotation" : "View Quotation"}
          </h1>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} style={btnStyle("#f59e0b")}>
                <Edit2 size={16} /> Edit
              </button>
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
            <button onClick={handleDownload} disabled={isExporting} style={btnStyle("#0369a1", isExporting)}>
              <Download size={16} /> {isExporting ? "Generating…" : "Download PDF"}
            </button>
            <button onClick={onBack} style={btnStyle("#6b7280")}>
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

        {/* ── Main Card → shared QuotationLayout ── */}
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
          actionBar={isEditing ? (
            <>
              <button onClick={handleSave} disabled={isSaving} style={{ ...btnStyle("#10b981", isSaving), padding: "0.875rem 2rem", fontSize: "1rem" }}>
                <Save size={18} /> {isSaving ? "⏳ Saving…" : "💾 Save Changes"}
              </button>
              <button onClick={cancelEdit} style={{ ...btnStyle("#6b7280"), padding: "0.875rem 2rem", fontSize: "1rem" }}>
                <X size={18} /> Cancel
              </button>
            </>
          ) : null}
        />
      </div>

      {/* Snackbar for notifications */}
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