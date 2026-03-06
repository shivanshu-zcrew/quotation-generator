import React, { useState } from "react";
import { ArrowLeft, Download, Edit2, Save } from "lucide-react";
import headerImage from "../assets/header.png";
import { customerAPI, itemAPI, quotationAPI } from "../services/api";
import { newSection, sectionsToHTML } from '../components/TermsCondition';
import QuotationLayout from '../components/QuotationLayout';

// ─────────────────────────────────────────────────────────────
// numberToWords (AED)
// ─────────────────────────────────────────────────────────────
const numberToWords = (num) => {
  if (num === 0) return "Zero";
  const ones     = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine"];
  const teens    = ["Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens     = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const thousands= ["","Thousand","Lakh","Crore"];

  const convertLessThanThousand = (n) => {
    if (n === 0) return "";
    if (n < 10)  return ones[n];
    if (n < 20)  return teens[n - 10];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
    return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " "+convertLessThanThousand(n%100) : "");
  };

  const convertIndian = (n) => {
    let result = "", i = 0;
    while (n > 0) {
      if (n%1000) result = convertLessThanThousand(n%1000) + (thousands[i] ? " "+thousands[i]+" " : "") + result;
      n = Math.floor(n/1000); i++;
    }
    return result.trim() + " Dirhams Only";
  };

  const dirhams = Math.floor(num);
  const fils    = Math.round((num - dirhams) * 100);
  let result    = convertIndian(dirhams);
  if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${convertLessThanThousand(fils)} Fils Only`);
  return result;
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function QuotationTemplate({ customer, selectedItems, items, onAddQuotation, onBack }) {

  const [quotationItems, setQuotationItems] = useState(() =>
    selectedItems.map((item) => {
      const found = items.find((i) => i._id === item.itemId);
      return {
        id:          item.id || Date.now() + Math.random(),
        itemId:      item.itemId || item._id || null,
        quantity:    item.quantity || 1,
        unitPrice:   item.unitPrice || item.price || 0,
        name:        item.name || found?.name || "",
        description: found?.description || item.description || "",
      };
    })
  );

  const [quotationData, setQuotationData] = useState({
    date:               new Date().toISOString().split("T")[0],
    expiryDate:         new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0],
    customer:           customer.name,
    contact:            customer.phone || "",
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

  const [itemImages,      setItemImages]      = useState({});
  const [isEditing,       setIsEditing]       = useState(false);
  const [editingImageId,  setEditingImageId]  = useState(null);
  const [isSaving,        setIsSaving]        = useState(false);
  const [isExporting,     setIsExporting]     = useState(false);
  const [tcSections,      setTcSections]      = useState([newSection()]);

  const [quotationNumber] = useState(() => {
    const d = new Date();
    const yy  = d.getFullYear().toString().substr(-2);
    const mm  = (d.getMonth()+1).toString().padStart(2,"0");
    const dd  = d.getDate().toString().padStart(2,"0");
    const rnd = Math.floor(Math.random()*1000).toString().padStart(3,"0");
    return `QT-${yy}${mm}${dd}-${rnd}`;
  });

  // ── Item helpers ──────────────────────────────
  const addMoreItem = () =>
    setQuotationItems((prev) => [...prev, { id: Date.now()+Math.random(), itemId: null, quantity: 1, unitPrice: 0, name: "", description: "" }]);

  const removeItem = (id) => {
    setQuotationItems((prev) => prev.filter((i) => i.id !== id));
    setItemImages((prev) => { const c = {...prev}; delete c[id]; return c; });
  };

  const updateItem = (id, field, value) =>
    setQuotationItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      if (field === "itemId" && value) {
        const found = items.find((i) => i._id === value);
        return { ...item, itemId: value, name: found?.name || "", description: found?.description || "", unitPrice: found?.price ?? item.unitPrice };
      }
      return { ...item, [field]: value };
    }));

  // ── Image helpers ─────────────────────────────
  const handleImageUpload = (e, itemId) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newImgs = [...(itemImages[itemId] || [])];
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        newImgs.push(reader.result);
        setItemImages((prev) => ({ ...prev, [itemId]: [...newImgs] }));
      };
      reader.readAsDataURL(file);
    });
    setEditingImageId(null);
  };

  // ── Terms image helper ────────────────────────
  const handleTermsImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleDataChange("termsImage", reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Calculations ──────────────────────────────
  const subtotal       = quotationItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount      = (subtotal * quotationData.tax)      / 100;
  const discountAmount = (subtotal * quotationData.discount) / 100;
  const grandTotal     = subtotal + taxAmount - discountAmount;
  const amountInWords  = numberToWords(grandTotal);

  const handleDataChange = (field, value) =>
    setQuotationData((prev) => ({ ...prev, [field]: value }));

  const getItemData = (itemId) => items.find((i) => i._id === itemId) || null;

  // ── PDF helpers ───────────────────────────────
  const imageToBase64 = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      if (src.startsWith("data:")) return resolve(src);
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // FIX 1: async so we can await base64 conversion of item images
  const createQuotationHTML = async (headerImageBase64) => {
    const itemsPerFirstPage = 8;
    const firstPageItems    = quotationItems.slice(0, itemsPerFirstPage);
    const remainingItems    = quotationItems.slice(itemsPerFirstPage);
    const hasMultiplePages  = remainingItems.length > 0;

    // FIX 2: pre-convert all item images to base64 before building HTML
    // imageToBase64 passes data: URIs straight through and fetches https:// URLs via canvas
    const itemImagesBase64 = {};
    for (const qi of [...firstPageItems, ...remainingItems]) {
      const imgs = itemImages[qi.id] || [];
      itemImagesBase64[qi.id] = await Promise.all(imgs.map((src) => imageToBase64(src)));
    }

    const renderPdfRow = (qi, index) => {
      const data   = getItemData(qi.itemId);
      const name   = qi.name || data?.name || "";
      const desc   = qi.description || data?.description || "";
      const imgArr = (itemImagesBase64[qi.id] || []).filter(Boolean);
      return `
        <tr>
          <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index + 1}</td>
          <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
            <div style="font-weight:600;font-size:11px;">${name || "—"}</div>
            ${desc ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${desc}</div>` : ""}
            ${imgArr.length ? `<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
              ${imgArr.map((img) => `
                <div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;">
                  <img src="${img}" style="width:100%;height:100%;object-fit:cover;" />
                </div>
              `).join("")}
            </div>` : ""}
          </td>
          <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${qi.quantity}</td>
          <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${parseFloat(qi.unitPrice).toFixed(2)}</td>
          <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(qi.quantity * qi.unitPrice).toFixed(2)}</td>
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
      ${discountAmount > 0 ? `
        <tr style="background:#f8fafc;font-weight:600;">
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

    // FIX 3: termsImage is now a Cloudinary https:// URL or base64 — use directly, no localhost prefix
    const termsImgSrc = quotationData.termsImage || null;

    const termsSectionHTML = (sectionsToHTML(tcSections) || termsImgSrc) ? `
      <div style="margin-bottom:20px; padding:12px; background:#f9fafb; border:1px solid #e2e8f0; border-radius:6px;">
        <h3 style="font-size:12px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; color:#1f2937;">
          Terms & Conditions
        </h3>
        <div style="display:flex; gap:24px; align-items:flex-start;">
          <div style="flex:1; font-size:10px; color:#374151; line-height:1.5;">
            ${sectionsToHTML(tcSections) || ''}
          </div>
          ${termsImgSrc ? `
          <div style="flex:0 0 240px; max-width:240px;">
            <img src="${termsImgSrc}" 
                 style="width:100%; height:auto; border-radius:4px; border:1px solid #d1d5db;" />
          </div>` : ''}
        </div>
      </div>` : "";

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:white; color:#1f2937; line-height:1.6; }
  .container { width:874px; margin:0 auto; padding:10px; }
  @page { size:A4; margin:5mm; }
  thead { display:table-row-group; }
  @media print {
    body { margin:0; padding:0; }
    .page-break { page-break-before:always; }
    thead { display:table-row-group; }
  }
</style>
</head><body><div class="container">

  <!-- Header -->
  <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">
    ${headerImageBase64 ? `<img src="${headerImageBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;" />` : `<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}
  </div>

  <!-- Title + Expiry -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;">
    <div style="text-align:center;flex:1;">
      <h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;margin:0;">QUOTATION</h1>
      <p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${quotationNumber || ""}</p>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
      <div style="font-size:16px;font-weight:700;">${new Date(quotationData.expiryDate).toLocaleDateString("en-IN")}</div>
    </div>
  </div>

  <!-- Details Grid -->
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

  <!-- Items -->
  <div style="margin-bottom:16px;">
    <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      ${thead}
      <tbody>
        ${firstPageItems.map((qi, i) => renderPdfRow(qi, i)).join("")}
        ${!hasMultiplePages ? totalsRows : ""}
      </tbody>
    </table>
  </div>

  ${hasMultiplePages ? `
  <div class="page-break">
    <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <tbody>
        ${remainingItems.map((qi, i) => renderPdfRow(qi, i + itemsPerFirstPage)).join("")}
        ${totalsRows}
      </tbody>
    </table>
  </div>` : ""}

  <!-- Amount in words -->
  <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
    <strong>Amount in words:</strong> ${amountInWords}
  </div>

  <!-- Notes -->
  ${quotationData.notes ? `
  <div style="margin-bottom:16px;">
    <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes</h3>
    <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${quotationData.notes}</div>
  </div>` : ""}

  <!-- Terms & Conditions -->
  ${termsSectionHTML}

  <!-- Signature -->
  <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280;">
    <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
    <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
  </div>

</div></body></html>`;
  };

  // ── Export PDF ────────────────────────────────
  const handleExportPDF = async () => {
    if (!quotationItems.length) return alert("Please add at least one item before exporting");
    setIsExporting(true);
    try {
      const headerImageBase64 = await imageToBase64(headerImage);
      const htmlContent = await createQuotationHTML(headerImageBase64); // FIX: await async fn
      const filename    = `Quotation_${quotationData.customer.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}`;
      await quotationAPI.generatePDF(htmlContent, filename);
      alert("PDF downloaded successfully!");
    } catch (err) {
      console.error("PDF export error:", err);
      alert(`Failed to export PDF: ${err.message}`);
      if (window.confirm("Would you like to save as HTML file instead?")) saveAsHTML();
    } finally {
      setIsExporting(false);
    }
  };

  const saveAsHTML = async () => {
    const b64  = await imageToBase64(headerImage);
    const html = await createQuotationHTML(b64); // FIX: await async fn
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: `Quotation_${quotationData.customer.replace(/\s+/g,"_")}.html` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ── Zoho ──────────────────────────────────────
  const sendToZoho = async () => {
    const zohoData = {
      customer_id: "8006914000000122003",
      date: quotationData.date,
      expiry_date: quotationData.expiryDate,
      line_items: quotationItems.map((item) => ({
        description: item.name || "Item",
        rate:        item.unitPrice,
        quantity:    item.quantity,
      })),
    };
    try {
      const res    = await fetch("http://51.20.109.158:5000/api/zoho/create-estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(zohoData) });
      const result = await res.json();
      if (res.ok && result.code === 0) alert("✓ Quotation created in Zoho!");
      else alert("Zoho error: " + (result.message || "Something went wrong"));
    } catch (err) {
      alert("Cannot connect to Zoho: " + err.message);
    }
  };

  // ── Submit ────────────────────────────────────
  const handleSubmit = async () => {
    if (!quotationItems.length)                return alert("Add at least 1 item");
    if (quotationItems.some((i) => !i.itemId)) return alert("Please select an item for all rows");
    setIsSaving(true);
    try {
      const quotationImages = {};
      quotationItems.forEach((item, index) => {
        if (itemImages[item.id]?.length) quotationImages[index] = itemImages[item.id];
      });

      const quotation = {
        customerId:         customer._id,
        customer:           quotationData.customer,
        contact:            quotationData.contact,
        date:               quotationData.date,
        expiryDate:         quotationData.expiryDate,
        ourRef:             quotationData.ourRef,
        ourContact:         quotationData.ourContact,
        salesOffice:        quotationData.salesOffice,
        paymentTerms:       quotationData.paymentTerms,
        deliveryTerms:      quotationData.deliveryTerms,
        tax:                quotationData.tax,
        discount:           quotationData.discount,
        notes:              quotationData.notes,
        termsAndConditions: sectionsToHTML(tcSections),
        termsImage:         quotationData.termsImage || null,
        total:              grandTotal,
        quotationImages,
        items: quotationItems.map((qi) => ({ itemId: qi.itemId, quantity: qi.quantity, unitPrice: qi.unitPrice })),
      };

      const success = await onAddQuotation(quotation);
      // await sendToZoho();
      // if (success) { alert("Quotation created successfully!"); window.location.hash = "#home"; }
    } catch (err) {
      console.error("Error submitting quotation:", err);
      alert("Error creating quotation. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" }}>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .quotation-content { box-shadow: none; border-radius: 0; }
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
          @page { margin: 0; }
        }
        .edit-input:focus { outline: 2px solid #3b82f6; border-color: #3b82f6 !important; }
      `}</style>

      <div className="quotation-container" style={{ maxWidth: "1280px", margin: "0 auto" }}>

        {/* ── Top Controls ── */}
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 }}>📄 Create Quotation</h1>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={() => setIsEditing(!isEditing)} style={{ backgroundColor: isEditing ? "#ef4444" : "#f59e0b", color: "white", padding: "0.625rem 1rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" }}>
              {isEditing ? <><Save size={18} /> Done</> : <><Edit2 size={18} /> Edit</>}
            </button>
            <button onClick={handleExportPDF} disabled={isExporting} style={{ backgroundColor: isExporting ? "#d1d5db" : "#0369a1", color: "white", padding: "0.625rem 1rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", cursor: isExporting ? "not-allowed" : "pointer", fontSize: "0.875rem", fontWeight: "500" }}>
              <Download size={18} /> {isExporting ? "Generating..." : "Download PDF"}
            </button>
            <button onClick={onBack} style={{ backgroundColor: "#6b7280", color: "white", padding: "0.625rem 1rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" }}>
              <ArrowLeft size={18} /> Back
            </button>
          </div>
        </div>

        {/* Edit mode banner */}
        {isEditing && (
          <div className="no-print" style={{ backgroundColor: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#92400e", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            ✏️ <strong>Edit mode active</strong> — make your changes below, then click <strong>Done</strong>.
          </div>
        )}

        {/* ── Main Card → shared QuotationLayout ── */}
        <QuotationLayout
          isEditing={isEditing}
          quotationNumber={quotationNumber}
          quotationData={quotationData}
          onDataChange={handleDataChange}
          quotationItems={quotationItems}
          availableItems={items}
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
          actionBar={!isEditing ? (
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              style={{ backgroundColor: isSaving ? "#d1d5db" : "#10b981", color: isSaving ? "#9ca3af" : "white", padding: "1rem 2rem", borderRadius: "0.5rem", fontWeight: "bold", border: "none", cursor: isSaving ? "not-allowed" : "pointer", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
            >
              {isSaving ? "⏳ Saving..." : "💾 Save Quotation"}
            </button>
          ) : null}
        />
      </div>
    </div>
  );
}