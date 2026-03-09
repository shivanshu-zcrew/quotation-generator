import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { ArrowLeft, Download, Edit2, Save, Loader, AlertCircle, CheckCircle } from "lucide-react";
import headerImage from "../assets/header.png";
import { quotationAPI } from "../services/api";
import { newSection, sectionsToHTML } from '../components/TermsCondition';
import QuotationLayout from '../components/QuotationLayout';
import Snackbar from '../components/Snackbar';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE_MB   = 5;
const MAX_IMAGES_PER_ITEM = 6;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ─────────────────────────────────────────────────────────────
// numberToWords (AED)
// ─────────────────────────────────────────────────────────────
const numberToWords = (num) => {
  if (!num || num === 0) return "Zero Dirhams Only";
  const ones      = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine"];
  const teens     = ["Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens      = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const thousands = ["","Thousand","Lakh","Crore"];
  const cvt = (n) => {
    if (n === 0) return "";
    if (n < 10)  return ones[n];
    if (n < 20)  return teens[n - 10];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " "+cvt(n%100) : "");
  };
  const convertIndian = (n) => {
    let result = "", i = 0;
    while (n > 0) {
      if (n%1000) result = cvt(n%1000) + (thousands[i] ? " "+thousands[i]+" " : "") + result;
      n = Math.floor(n/1000); i++;
    }
    return result.trim() + " Dirhams Only";
  };
  const dirhams = Math.floor(num);
  const fils    = Math.round((num - dirhams) * 100);
  let result    = convertIndian(dirhams);
  if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${cvt(fils)} Fils Only`);
  return result;
};

// ─────────────────────────────────────────────────────────────
// PDF Overlay
// ─────────────────────────────────────────────────────────────
function PdfOverlay({ step }) {
  return (
    <div style={{ position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ backgroundColor:"white", borderRadius:"1rem", padding:"2rem 2.5rem", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", minWidth:"280px" }}>
        <Loader size={36} color="#0369a1" style={{ animation:"qt-spin 1s linear infinite", marginBottom:"1rem" }} />
        <div style={{ fontWeight:"700", fontSize:"1rem", color:"#1f2937", marginBottom:"0.25rem" }}>Generating PDF…</div>
        <div style={{ fontSize:"0.8125rem", color:"#6b7280" }}>{step}</div>
      </div>
      <style>{`@keyframes qt-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Content Skeleton
// ─────────────────────────────────────────────────────────────
function ContentSkeleton() {
  const bar = (w, h = "14px") => (
    <div style={{ width:w, height:h, borderRadius:"6px", background:"linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)", backgroundSize:"200% 100%", animation:"qt-skeleton 1.4s ease infinite" }} />
  );
  return (
    <div style={{ background:"white", borderRadius:"1rem", padding:"2rem", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
      <style>{`@keyframes qt-skeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"2rem" }}>
        {bar("160px","20px")} {bar("120px","20px")}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"2rem", marginBottom:"2rem" }}>
        {[0,1].map(col => (
          <div key={col} style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            {[90,120,80,110].map((w,i) => <div key={i}>{bar(`${w}px`,"13px")}</div>)}
          </div>
        ))}
      </div>
      <div style={{ border:"1px solid #e2e8f0", borderRadius:"8px", overflow:"hidden" }}>
        <div style={{ background:"#f8fafc", padding:"0.75rem 1rem", borderBottom:"1px solid #e2e8f0" }}>{bar("200px","13px")}</div>
        {[0,1,2].map(r => (
          <div key={r} style={{ display:"flex", gap:"1rem", padding:"0.875rem 1rem", borderBottom: r < 2 ? "1px solid #f1f5f9":"none" }}>
            {bar("30px")} {bar("40%")} {bar("40px")} {bar("60px")} {bar("70px")}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline field error message
// ─────────────────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.25rem", marginTop:"0.25rem", color:"#dc2626", fontSize:"0.75rem" }}>
      <AlertCircle size={11} /> {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Snack helpers
// ─────────────────────────────────────────────────────────────
const mkSnack   = (message, type = "error") => ({ show:true, message, type });
const hideSnack = { show:false, message:"", type:"error" };

// ─────────────────────────────────────────────────────────────
// Wrapper guard — must come before any hooks
// ─────────────────────────────────────────────────────────────
export default function QuotationTemplate(props) {
  const { customer, selectedItems } = props;
  if (!customer || !selectedItems) {
    return (
      <div style={{ minHeight:"100vh", backgroundColor:"#f0f9ff", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center", color:"#6b7280" }}>
          <Loader size={36} color="#0369a1" style={{ animation:"qt-spin 1s linear infinite", marginBottom:"1rem" }} />
          <style>{`@keyframes qt-spin { to { transform:rotate(360deg); } }`}</style>
          <p style={{ fontSize:"0.9375rem", fontWeight:"500" }}>Loading quotation…</p>
        </div>
      </div>
    );
  }
  return <QuotationTemplateInner {...props} />;
}

// ─────────────────────────────────────────────────────────────
// Inner component — all hooks live here
// ─────────────────────────────────────────────────────────────
function QuotationTemplateInner({
  customer,
  selectedItems,
  items,
  onAddQuotation,
  onBack,
  isItemsLoading = false,
  itemsLoadError  = null,
}) {
  const today = new Date().toISOString().split("T")[0];

  const itemsReady = !isItemsLoading && !itemsLoadError && Array.isArray(items);

  const [quotationItems, setQuotationItems] = useState(() => {
    if (!itemsReady || !selectedItems?.length) return [];
    return selectedItems.map((item) => {
      const found = items.find((i) => i._id === item.itemId);
      return {
        id:          `${Date.now()}-${Math.random()}`,
        itemId:      item.itemId || item._id || null,
        quantity:    Number(item.quantity)  || 1,
        unitPrice:   Number(item.unitPrice || item.price) || 0,
        name:        item.name || found?.name || "",
        description: found?.description || item.description || "",
      };
    });
  });

  const initializedRef = useRef(false);
  useEffect(() => {
    if (itemsReady && !initializedRef.current && selectedItems?.length) {
      initializedRef.current = true;
      setQuotationItems(
        selectedItems.map((item) => {
          const found = items.find((i) => i._id === item.itemId);
          return {
            id:          `${Date.now()}-${Math.random()}`,
            itemId:      item.itemId || item._id || null,
            quantity:    Number(item.quantity)  || 1,
            unitPrice:   Number(item.unitPrice || item.price) || 0,
            name:        item.name || found?.name || "",
            description: found?.description || item.description || "",
          };
        })
      );
    }
  }, [itemsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const [quotationData, setQuotationData] = useState({
    date:               today,
    expiryDate:         new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0],
    customer:           customer?.name  || "",
    contact:            customer?.phone || "",
    ourRef:             "",
    ourContact:         "",
    salesOffice:        "",
    paymentTerms:       "",
    deliveryTerms:      "",
    tax:                0,
    discount:           0,
    notes:              "",
    termsAndConditions: "",
    termsImage:         null,
  });

  // ── Per-field inline errors (shown immediately on change) ──
  const [fieldErrors,    setFieldErrors]    = useState({});   // { [itemId]: { quantity, unitPrice } }
  const [headerErrors,   setHeaderErrors]   = useState({});   // { date, expiryDate, tax, discount }

  const [itemImages,     setItemImages]     = useState({});
  const [isEditing,      setIsEditing]      = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isExporting,    setIsExporting]    = useState(false);
  const [exportStep,     setExportStep]     = useState("");
  const [tcSections,     setTcSections]     = useState([newSection()]);
  const [snackbar,       setSnackbar]       = useState(hideSnack);

  const showSnack = useCallback((msg, type = "error") => setSnackbar(mkSnack(msg, type)), []);

  const [quotationNumber] = useState(() => {
    const d  = new Date();
    const yy = d.getFullYear().toString().substr(-2);
    const mm = (d.getMonth()+1).toString().padStart(2,"0");
    const dd = d.getDate().toString().padStart(2,"0");
    const rn = Math.floor(Math.random()*1000).toString().padStart(3,"0");
    return `QT-${yy}${mm}${dd}-${rn}`;
  });

  // ── Calculations ──────────────────────────────────────────
  const subtotal       = useMemo(() => quotationItems.reduce((s,i) => s + (Number(i.quantity)||0)*(Number(i.unitPrice)||0), 0), [quotationItems]);
  const taxAmount      = useMemo(() => (subtotal*(Number(quotationData.tax)||0))/100,      [subtotal, quotationData.tax]);
  const discountAmount = useMemo(() => (subtotal*(Number(quotationData.discount)||0))/100, [subtotal, quotationData.discount]);
  const grandTotal     = useMemo(() => subtotal + taxAmount - discountAmount,               [subtotal, taxAmount, discountAmount]);
  const amountInWords  = useMemo(() => numberToWords(grandTotal),                           [grandTotal]);
  const getItemData    = useCallback((id) => (items||[]).find(i => i._id === id) || null,  [items]);

  // ── Header field validation (immediate) ──────────────────
  const validateHeaderField = useCallback((field, value) => {
    const errs = {};

    if (field === "date" || field === "expiryDate") {
      const dateVal    = field === "date"       ? value : quotationData.date;
      const expiryVal  = field === "expiryDate" ? value : quotationData.expiryDate;
      if (!dateVal)   errs.date       = "Creation date is required.";
      if (!expiryVal) errs.expiryDate = "Expiry date is required.";
      if (dateVal && expiryVal && expiryVal < dateVal)
        errs.expiryDate = "Expiry date cannot be before the creation date.";
    }

    if (field === "tax") {
      if (value === "" || value === null || value === undefined) {
        errs.tax = "VAT is required.";
      } else {
        const r = validatePercentage(value);
        if (!r.isValid) errs.tax = r.error;
      }
    }

    if (field === "discount") {
      if (value !== "" && value !== null && value !== undefined) {
        const r = validatePercentage(value);
        if (!r.isValid) errs.discount = r.error;
      }
    }

    return errs;
  }, [quotationData]);

  // ── Data change ───────────────────────────────────────────
  const handleDataChange = useCallback((field, value) => {
    // Immediately validate and show inline error
    const newErrs = validateHeaderField(field, value);
    setHeaderErrors(prev => ({ ...prev, ...newErrs, ...(newErrs[field] === undefined ? { [field]: undefined } : {}) }));

    // Clear the field error if now valid
    if (!newErrs[field]) {
      setHeaderErrors(prev => { const n = {...prev}; delete n[field]; return n; });
    }

    // Special: clamp expiryDate
    if (field === "expiryDate" && quotationData.date && value < quotationData.date) {
      setHeaderErrors(prev => ({ ...prev, expiryDate: "Expiry date cannot be before the creation date." }));
      // Still allow the value to update so the user can keep typing
    }

    if (value === "") {
      setQuotationData(prev => ({ ...prev, [field]: (field==="tax"||field==="discount") ? 0 : "" }));
      return;
    }

    if (field === "tax" || field === "discount") {
      const r = validatePercentage(value);
      if (!r.isValid) {
        // Don't block state update — error is shown inline
        return;
      }
      value = parseFloat(value) || 0;
    }

    setQuotationData(prev => ({ ...prev, [field]: value }));
  }, [quotationData, validateHeaderField, showSnack]);

  // ── Item helpers ──────────────────────────────────────────
  const addMoreItem = useCallback(() =>
    setQuotationItems(prev => [...prev, { id:`${Date.now()}-${Math.random()}`, itemId:null, quantity:1, unitPrice:0, name:"", description:"" }])
  , []);

  const removeItem = useCallback((id) => {
    setQuotationItems(prev => prev.filter(i => i.id !== id));
    setItemImages(prev    => { const c={...prev}; delete c[id]; return c; });
    setFieldErrors(prev   => { const c={...prev}; delete c[id]; return c; });
  }, []);

  const clearItemFieldError = useCallback((id, field) => {
    setFieldErrors(prev => {
      const n = {...prev};
      if (n[id]) { delete n[id][field]; if (!Object.keys(n[id]).length) delete n[id]; }
      return n;
    });
  }, []);

  // ── updateItem — validates immediately on every keystroke ─
  const updateItem = useCallback((id, field, value) => {
    if (field === "quantity") {
      if (value === "" || value === null) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity:"Quantity is required." } }));
        return;
      }
      const r = validateQuantity(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], quantity: r.error } }));
        return; // Don't update state while invalid — keep showing error
      }
      clearItemFieldError(id, "quantity");
      value = parseInt(value, 10);
    }

    if (field === "unitPrice") {
      if (value === "") {
        clearItemFieldError(id, "unitPrice");
        setQuotationItems(prev => prev.map(item => item.id!==id ? item : { ...item, unitPrice:0 }));
        return;
      }
      const r = validatePrice(value);
      if (!r.isValid) {
        setFieldErrors(prev => ({ ...prev, [id]: { ...prev[id], unitPrice: r.error } }));
        return;
      }
      clearItemFieldError(id, "unitPrice");
      value = parseFloat(value) || 0;
    }

    if (field === "itemId" && value) {
      const found = (items||[]).find(i => i._id === value);
      setQuotationItems(prev => prev.map(item =>
        item.id !== id ? item : {
          ...item, itemId:value,
          name:        found?.name        || "",
          description: found?.description || "",
          unitPrice:   found?.price != null ? Number(found.price) : item.unitPrice,
        }
      ));
      return;
    }

    setQuotationItems(prev => prev.map(item => item.id!==id ? item : { ...item, [field]:value }));
  }, [items, clearItemFieldError]);

  // ── Image upload ──────────────────────────────────────────
  const handleImageUpload = useCallback((e, itemId) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const slots = MAX_IMAGES_PER_ITEM - (itemImages[itemId]||[]).length;
    if (slots <= 0) { showSnack(`Max ${MAX_IMAGES_PER_ITEM} images per item.`); return; }
    const toProcess = files.slice(0, slots);
    if (files.length > slots) showSnack(`Only ${slots} slot(s) left — first ${slots} added.`);
    toProcess.forEach(file => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { showSnack(`"${file.name}" is not a supported type.`); return; }
      if (file.size > MAX_IMAGE_SIZE_MB*1024*1024) { showSnack(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`); return; }
      const reader = new FileReader();
      reader.onload  = () => setItemImages(prev => ({ ...prev, [itemId]:[...(prev[itemId]||[]), reader.result] }));
      reader.onerror = () => showSnack(`Failed to read "${file.name}".`);
      reader.readAsDataURL(file);
    });
    setEditingImageId(null);
    e.target.value = "";
  }, [itemImages, showSnack]);

  // ── Full validation before submit/export ─────────────────
  const validateAll = useCallback(() => {
    // If real-time errors already exist, surface them and bail
    const currentItemErrors = Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);
    if (Object.keys(headerErrors).length > 0 || currentItemErrors) {
      showSnack("Please fix all highlighted errors before proceeding.");
      return false;
    }
    // Header date checks
    if (!quotationData.date) {
      setHeaderErrors(prev => ({ ...prev, date:"Creation date is required." }));
      showSnack("Creation date is required."); return false;
    }
    if (!quotationData.expiryDate) {
      setHeaderErrors(prev => ({ ...prev, expiryDate:"Expiry date is required." }));
      showSnack("Expiry date is required."); return false;
    }
    if (quotationData.expiryDate < quotationData.date) {
      setHeaderErrors(prev => ({ ...prev, expiryDate:"Expiry date cannot be before the creation date." }));
      showSnack("Expiry date cannot be before the creation date."); return false;
    }
    // Items
    if (!quotationItems.length) { showSnack("Please add at least one item."); return false; }
    for (const item of quotationItems) {
      if (!item.itemId) { showSnack("Please select an item for all rows."); return false; }
      const qr = validateQuantity(item.quantity);
      if (!qr.isValid) { showSnack(`"${item.name||"Item"}" — ${qr.error}`); return false; }
      const pr = validatePrice(item.unitPrice);
      if (!pr.isValid) { showSnack(`"${item.name||"Item"}" — ${pr.error}`); return false; }
    }
    // Tax / discount
    const tr = validatePercentage(quotationData.tax);
    if (!tr.isValid) { showSnack(tr.error); return false; }
    const dr = validatePercentage(quotationData.discount);
    if (!dr.isValid) { showSnack(dr.error); return false; }
    return true;
  }, [quotationItems, quotationData, fieldErrors, headerErrors, showSnack]);

  // ── PDF helpers ───────────────────────────────────────────
  const imageToBase64 = (src) =>
    new Promise(resolve => {
      if (!src) return resolve(null);
      if (src.startsWith("data:")) return resolve(src);
      const img = new Image(); img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          c.getContext("2d").drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 8000);
      img.src = src;
    });

  const createQuotationHTML = async (headerImageBase64) => {
    const itemsPerFirstPage = 8;
    const firstPageItems    = quotationItems.slice(0, itemsPerFirstPage);
    const remainingItems    = quotationItems.slice(itemsPerFirstPage);
    const hasMultiplePages  = remainingItems.length > 0;

    setExportStep("Converting item images…");
    // const itemImagesBase64 = {};
    // for (const qi of [...firstPageItems, ...remainingItems]) {
    //   itemImagesBase64[qi.id] = await Promise.all((itemImages[qi.id]||[]).map(imageToBase64));
    // }

    const itemImagesBase64 = itemImages;
    
    const renderPdfRow = (qi, index) => {
      const data   = getItemData(qi.itemId);
      const name   = qi.name || data?.name || "";
      const desc   = qi.description || data?.description || "";
      const imgArr = (itemImagesBase64[qi.id]||[]).filter(Boolean);
      return `<tr>
        <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index+1}</td>
        <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
          <div style="font-weight:600;font-size:11px;">${name||"—"}</div>
          ${desc?`<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${desc}</div>`:""}
          ${imgArr.length?`<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
            ${imgArr.map(img=>`<div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;"><img src="${img}" style="width:100%;height:100%;object-fit:cover;"/></div>`).join("")}
          </div>`:""}
        </td>
        <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${qi.quantity}</td>
        <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(qi.unitPrice).toFixed(2)}</td>
        <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(qi.quantity*qi.unitPrice).toFixed(2)}</td>
      </tr>`;
    };

    const totalsRows = `
      <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Total (AED)</td><td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td></tr>
      <tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${quotationData.tax}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmount.toFixed(2)}</td></tr>
      ${discountAmount>0?`<tr style="background:#f8fafc;font-weight:600;"><td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${quotationData.discount}%)</td><td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">-${discountAmount.toFixed(2)}</td></tr>`:""}
      <tr style="background:#000;color:white;font-weight:700;"><td colspan="3" style="border:none;padding:8px;"></td><td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td><td style="text-align:right;padding:12px 8px;font-size:12px;">${grandTotal.toFixed(2)}</td></tr>`;

    const thead = `<thead><tr style="background:#000;">
      <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
      <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
      <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
      <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
      <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
    </tr></thead>`;

    const termsImgSrc   = quotationData.termsImage || null;
    const termsSectionHTML = (sectionsToHTML(tcSections)||termsImgSrc) ? `
      <div style="margin-bottom:20px;padding:12px;background:#f9fafb;border:1px solid #e2e8f0;border-radius:6px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;color:#1f2937;">Terms & Conditions</h3>
        <div style="display:flex;gap:24px;align-items:flex-start;">
          <div style="flex:1;font-size:10px;color:#374151;line-height:1.5;">${sectionsToHTML(tcSections)||""}</div>
          ${termsImgSrc?`<div style="flex:0 0 240px;max-width:240px;"><img src="${termsImgSrc}" style="width:100%;height:auto;border-radius:4px;border:1px solid #d1d5db;"/></div>`:""}
        </div>
      </div>` : "";

    setExportStep("Building document…");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}
      .container{width:874px;margin:0 auto;padding:10px;}
      @page{size:A4;margin:5mm;}thead{display:table-row-group;}
      @media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}thead{display:table-row-group;}}
    </style></head><body><div class="container">
      <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">
        ${headerImageBase64?`<img src="${headerImageBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;"/>`:`<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;">
        <div style="text-align:center;flex:1;"><h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;margin:0;">QUOTATION</h1><p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${quotationNumber||""}</p></div>
        <div style="text-align:right;"><div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div><div style="font-size:16px;font-weight:700;">${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
          <span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${quotationData.customer}</span>
          <span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${quotationData.contact||"N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(quotationData.date).toLocaleDateString("en-IN")}</span>
          <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</span>
        </div>
        <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
          <span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${quotationData.ourRef||"N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${quotationData.ourContact||"N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${quotationData.salesOffice||"N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${quotationData.paymentTerms||"N/A"}</span>
          <span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${quotationData.deliveryTerms||"N/A"}</span>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${thead}<tbody>
          ${firstPageItems.map((qi,i)=>renderPdfRow(qi,i)).join("")}
          ${!hasMultiplePages?totalsRows:""}
        </tbody></table>
      </div>
      ${hasMultiplePages?`<div class="page-break"><h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody>${remainingItems.map((qi,i)=>renderPdfRow(qi,i+itemsPerFirstPage)).join("")}${totalsRows}</tbody></table></div>`:""}
      <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;"><strong>Amount in words:</strong> ${amountInWords}</div>
      ${quotationData.notes?`<div style="margin-bottom:16px;"><h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes</h3><div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${quotationData.notes}</div></div>`:""}
      ${termsSectionHTML}
      <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280;">
        <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
        <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
      </div>
    </div></body></html>`;
  };

  // ── Export PDF ────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!validateAll()) return;
    setIsExporting(true);
    setExportStep("Loading header image…");
    try {
      const b64      = await imageToBase64(headerImage);
      const html     = await createQuotationHTML(b64);
      setExportStep("Sending to PDF server…");
      const filename = `Quotation_${(quotationData.customer||"Draft").replace(/\s+/g,"_")}_${today}`;
      await quotationAPI.generatePDF(html, filename);
      showSnack("PDF downloaded successfully!", "success");
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Unknown error";
      showSnack(`Failed to export PDF: ${msg}`);
    } finally {
      setIsExporting(false); setExportStep("");
    }
  };

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateAll()) return;
    setIsSaving(true);
    try {
      const quotationImages = {};
      quotationItems.forEach((item, idx) => {
        if (itemImages[item.id]?.length) quotationImages[idx] = itemImages[item.id];
      });
      const quotation = {
        customerId:         customer._id,
        customer:           quotationData.customer?.trim(),
        contact:            quotationData.contact?.trim()       || "",
        date:               quotationData.date,
        expiryDate:         quotationData.expiryDate,
        ourRef:             quotationData.ourRef?.trim()        || "",
        ourContact:         quotationData.ourContact?.trim()    || "",
        salesOffice:        quotationData.salesOffice?.trim()   || "",
        paymentTerms:       quotationData.paymentTerms?.trim()  || "",
        deliveryTerms:      quotationData.deliveryTerms?.trim() || "",
        tax:                Number(quotationData.tax)           || 0,
        discount:           Number(quotationData.discount)      || 0,
        notes:              quotationData.notes?.trim()         || "",
        termsAndConditions: sectionsToHTML(tcSections),
        termsImage:         quotationData.termsImage            || null,
        total:              grandTotal,
        quotationImages,
        items: quotationItems.map(qi => ({
          itemId:    qi.itemId,
          quantity:  Number(qi.quantity)  || 1,
          unitPrice: Number(qi.unitPrice) || 0,
        })),
      };
      const success = await onAddQuotation(quotation);
      if (success) {
        showSnack("Quotation created successfully!", "success");
        setTimeout(() => window.location.hash = "#home", 1500);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Please try again.";
      showSnack(`Error creating quotation: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  const hasHeaderErrors = Object.keys(headerErrors).length > 0;
  const hasItemErrors   = Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);
  const hasAnyError     = hasHeaderErrors || hasItemErrors;

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#f0f9ff", padding:"1.5rem" }}>
      <style>{`
        @media print {
          body{margin:0;padding:0;background:white;}
          .no-print{display:none!important;}
          .quotation-content{box-shadow:none;border-radius:0;}
          table{page-break-inside:avoid;}tr{page-break-inside:avoid;}
          @page{margin:0;}
        }
        .edit-input:focus{outline:2px solid #3b82f6;border-color:#3b82f6!important;}
        .field-error-input{border-color:#dc2626!important;background:#fef2f2!important;}
        @keyframes qt-spin{to{transform:rotate(360deg);}}
      `}</style>

      {isExporting && <PdfOverlay step={exportStep} />}

      <div style={{ maxWidth:"1280px", margin:"0 auto" }}>

        {/* ── Top Controls ── */}
        <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem", flexWrap:"wrap", gap:"0.75rem" }}>
          <h1 style={{ fontSize:"2rem", fontWeight:"bold", color:"#1f2937", margin:0 }}>📄 Create Quotation</h1>
          <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap" }}>
            <button onClick={() => setIsEditing(!isEditing)} disabled={isItemsLoading}
              style={{ backgroundColor:isEditing?"#ef4444":"#f59e0b", color:"white", padding:"0.625rem 1rem", borderRadius:"0.5rem", display:"flex", alignItems:"center", gap:"0.5rem", border:"none", cursor:isItemsLoading?"not-allowed":"pointer", fontSize:"0.875rem", fontWeight:"500", opacity:isItemsLoading?0.6:1 }}>
              {isEditing ? <><Save size={18}/> Done</> : <><Edit2 size={18}/> Edit</>}
            </button>
            <button
              onClick={() => {
                if (hasAnyError) { showSnack("Fix all validation errors before downloading the PDF."); return; }
                handleExportPDF();
              }}
              disabled={isExporting||isItemsLoading}
              title={hasAnyError ? "Fix validation errors first" : "Download PDF"}
              style={{ backgroundColor:(isExporting||isItemsLoading||hasAnyError)?"#d1d5db":"#0369a1", color:"white", padding:"0.625rem 1rem", borderRadius:"0.5rem", display:"flex", alignItems:"center", gap:"0.5rem", border:"none", cursor:(isExporting||isItemsLoading||hasAnyError)?"not-allowed":"pointer", fontSize:"0.875rem", fontWeight:"500", opacity: hasAnyError ? 0.6 : 1 }}>
              {isExporting ? <><Loader size={16} style={{ animation:"qt-spin 1s linear infinite" }}/> Generating…</> : <><Download size={18}/> Download PDF</>}
            </button>
            <button onClick={onBack}
              style={{ backgroundColor:"#6b7280", color:"white", padding:"0.625rem 1rem", borderRadius:"0.5rem", display:"flex", alignItems:"center", gap:"0.5rem", border:"none", cursor:"pointer", fontSize:"0.875rem", fontWeight:"500" }}>
              <ArrowLeft size={18}/> Back
            </button>
          </div>
        </div>

        {/* ── Loading / error banners ── */}
        {isItemsLoading && (
          <div className="no-print" style={{ display:"flex", alignItems:"center", gap:"0.75rem", backgroundColor:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:"0.5rem", padding:"0.875rem 1rem", marginBottom:"1rem", fontSize:"0.875rem", color:"#1e40af" }}>
            <Loader size={18} style={{ animation:"qt-spin 1s linear infinite", flexShrink:0 }}/>
            <span>Loading catalogue items — dropdowns will be ready shortly…</span>
          </div>
        )}
        {itemsLoadError && (
          <div className="no-print" style={{ display:"flex", alignItems:"center", gap:"0.75rem", backgroundColor:"#fef2f2", border:"1px solid #fecaca", borderRadius:"0.5rem", padding:"0.875rem 1rem", marginBottom:"1rem", fontSize:"0.875rem", color:"#991b1b" }}>
            <AlertCircle size={18} style={{ flexShrink:0 }}/>
            <span>Failed to load catalogue items: <strong>{itemsLoadError}</strong> — dropdowns may be empty.</span>
          </div>
        )}

        {/* ── Inline validation summary banner ── */}
        {hasHeaderErrors && isEditing && (
          <div className="no-print" style={{ display:"flex", alignItems:"flex-start", gap:"0.75rem", backgroundColor:"#fef2f2", border:"1px solid #fecaca", borderRadius:"0.5rem", padding:"0.875rem 1rem", marginBottom:"1rem", fontSize:"0.875rem", color:"#991b1b" }}>
            <AlertCircle size={18} style={{ flexShrink:0, marginTop:"1px" }}/>
            <div>
              <div style={{ fontWeight:"600", marginBottom:"0.25rem" }}>Please fix the following:</div>
              {Object.values(headerErrors).filter(Boolean).map((e,i) => <div key={i}>• {e}</div>)}
            </div>
          </div>
        )}

        {/* ── Edit mode banner ── */}
        {isEditing && !hasHeaderErrors && (
          <div className="no-print" style={{ backgroundColor:"#fef3c7", border:"1px solid #f59e0b", borderRadius:"0.5rem", padding:"0.75rem 1rem", marginBottom:"1rem", fontSize:"0.875rem", color:"#92400e", display:"flex", alignItems:"center", gap:"0.5rem" }}>
            ✏️ <strong>Edit mode active</strong> — changes are validated in real time. Click <strong>Done</strong> when finished.
          </div>
        )}

        {/* ── Content ── */}
        {isItemsLoading ? (
          <ContentSkeleton />
        ) : (
          <QuotationLayout
            isEditing={isEditing}
            quotationNumber={quotationNumber}
            quotationData={quotationData}
            onDataChange={handleDataChange}
            headerErrors={headerErrors}       /* ← new: inline errors for date / tax / discount */
            quotationItems={quotationItems}
            availableItems={items||[]}
            onUpdateItem={updateItem}
            onAddItem={addMoreItem}
            onRemoveItem={removeItem}
            onAddImages={handleImageUpload}
            editingImgId={editingImageId}
            onToggleImgEdit={(id) => setEditingImageId(editingImageId===id ? null : id)}
            newImages={itemImages}
            subtotal={subtotal}
            taxAmount={taxAmount}
            discountAmount={discountAmount}
            grandTotal={grandTotal}
            amountInWords={amountInWords}
            tcSections={tcSections}
            onTcChange={setTcSections}
            fieldErrors={fieldErrors}         /* ← item-level errors */
            actionBar={!isEditing ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5rem" }}>
                <button
                  onClick={() => {
                    if (hasAnyError) { showSnack("Fix all validation errors before saving."); return; }
                    handleSubmit();
                  }}
                  disabled={isSaving}
                  title={hasAnyError ? "Fix validation errors first" : "Save quotation"}
                  style={{ backgroundColor:(isSaving||hasAnyError)?"#d1d5db":"#10b981", color:(isSaving||hasAnyError)?"#9ca3af":"white", padding:"1rem 2rem", borderRadius:"0.5rem", fontWeight:"bold", border:"none", cursor:(isSaving||hasAnyError)?"not-allowed":"pointer", fontSize:"1rem", display:"flex", alignItems:"center", gap:"0.75rem", opacity: hasAnyError ? 0.6 : 1 }}>
                  {isSaving ? <><Loader size={18} style={{ animation:"qt-spin 1s linear infinite" }}/> Saving…</> : <>💾 Save Quotation</>}
                </button>
                {hasAnyError && (
                  <div style={{ display:"flex", alignItems:"center", gap:"0.375rem", color:"#dc2626", fontSize:"0.8125rem", fontWeight:"500" }}>
                    <AlertCircle size={14}/> Fix validation errors above to save
                  </div>
                )}
              </div>
            ) : null}
          />
        )}
      </div>

      {snackbar.show && (
        <Snackbar message={snackbar.message} type={snackbar.type} onClose={() => setSnackbar(hideSnack)} />
      )}
    </div>
  );
}