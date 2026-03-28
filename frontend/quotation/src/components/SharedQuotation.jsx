// import React, { useState, useCallback, useMemo, useEffect } from 'react';
// import { Download, ArrowLeft, Edit2, X, Save, Loader } from "lucide-react";
// import { newSection, sectionsToHTML, htmlToSections } from './TermsCondition';
// import QuotationLayout from './QuotationLayout';
// import Snackbar from './Snackbar';
// import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';

// // ─────────────────────────────────────────────────────────────
// // Constants
// // ─────────────────────────────────────────────────────────────
// const BASE_URL = process.env.REACT_APP_API_URL || "http://13.232.90.158:5000";
// const ITEMS_PER_FIRST_PAGE = 8;
// const MAX_IMAGE_SIZE_MB = 5;
// const MAX_IMAGES_PER_ITEM = 6;
// const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// // ─────────────────────────────────────────────────────────────
// // Utility Functions
// // ─────────────────────────────────────────────────────────────

// /**
//  * Convert number to words (AED currency)
//  */
// export const numberToWords = (num) => {
//   if (!num || num === 0) return "Zero Dirhams Only";
//   const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
//   const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
//   const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
//   const thousands = ["", "Thousand", "Lakh", "Crore"];

//   const convertUnderThousand = (n) => {
//     if (!n) return "";
//     if (n < 10) return ones[n];
//     if (n < 20) return teens[n - 10];
//     if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
//     return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertUnderThousand(n % 100) : "");
//   };

//   const convertIndian = (n) => {
//     let result = "", i = 0;
//     while (n > 0) {
//       if (n % 1000) result = convertUnderThousand(n % 1000) + (thousands[i] ? " " + thousands[i] + " " : "") + result;
//       n = Math.floor(n / 1000);
//       i++;
//     }
//     return result.trim() + " Dirhams Only";
//   };

//   const dirhams = Math.floor(num);
//   const fils = Math.round((num - dirhams) * 100);
//   let result = convertIndian(dirhams);
//   if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${convertUnderThousand(fils)} Fils Only`);
//   return result;
// };

// /**
//  * Convert image to base64
//  */
// export const imageToBase64 = (src) =>
//   new Promise((resolve) => {
//     if (!src) return resolve(null);
//     if (src.startsWith("data:")) return resolve(src);
    
//     const img = new Image();
//     img.crossOrigin = "Anonymous";
//     img.onload = () => {
//       const canvas = document.createElement("canvas");
//       canvas.width = img.width;
//       canvas.height = img.height;
//       canvas.getContext("2d").drawImage(img, 0, 0);
//       resolve(canvas.toDataURL("image/png"));
//     };
//     img.onerror = () => resolve(null);
//     img.src = src;
//   });

// /**
//  * Parse quotation data for form state
//  */
// export const parseQuotationData = (quotation) => ({
//   customer: quotation.customer || quotation.customerId?.name || "",
//   contact: quotation.contact || "",
//   date: quotation.date?.split("T")[0] || new Date().toISOString().split("T")[0],
//   expiryDate: quotation.expiryDate?.split("T")[0] || "",
//   ourRef: quotation.ourRef || "",
//   ourContact: quotation.ourContact || "",
//   salesOffice: quotation.salesOffice || "",
//   paymentTerms: quotation.paymentTerms || "",
//   deliveryTerms: quotation.deliveryTerms || "",
//   tax: quotation.tax || 0,
//   discount: quotation.discount || 0,
//   notes: quotation.notes || "",
//   termsAndConditions: quotation.termsAndConditions || "",
//   termsImage: quotation.termsImage || null,
// });

// /**
//  * Parse quotation items for form state
//  */
// export const parseQuotationItems = (items, existingItems = []) =>
//   (items || []).map((item) => {
//     const found = existingItems.find((i) => i._id === (item.itemId?._id || item.itemId));
//     return {
//       id: item._id || `${Date.now()}-${Math.random()}`,
//       itemId: item.itemId?._id || item.itemId || null,
//       name: item.name || found?.name || item.itemId?.name || "",
//       description: item.description || found?.description || item.itemId?.description || "",
//       quantity: Number(item.quantity) || 1,
//       unitPrice: Number(item.unitPrice) || 0,
//       imagePaths: item.imagePaths || [],
//     };
//   });

// /**
//  * Button style utility
//  */
// export const getButtonStyle = (bgColor, disabled = false, additionalStyles = {}) => ({
//   backgroundColor: disabled ? "#d1d5db" : bgColor,
//   color: disabled ? "#9ca3af" : "white",
//   padding: "0.625rem 1rem",
//   borderRadius: "0.5rem",
//   border: "none",
//   display: "inline-flex",
//   alignItems: "center",
//   gap: "0.5rem",
//   cursor: disabled ? "not-allowed" : "pointer",
//   fontSize: "0.875rem",
//   fontWeight: "500",
//   ...additionalStyles,
// });

// // ─────────────────────────────────────────────────────────────
// // PDF Overlay Component
// // ─────────────────────────────────────────────────────────────
// export const PdfOverlay = ({ step }) => (
//   <div style={{
//     position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999,
//     display: "flex", alignItems: "center", justifyContent: "center"
//   }}>
//     <div style={{
//       backgroundColor: "white", borderRadius: "1rem", padding: "2rem 2.5rem",
//       textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: "280px"
//     }}>
//       <Loader size={36} color="#0369a1" style={{ animation: "spin 1s linear infinite", marginBottom: "1rem" }} />
//       <div style={{ fontWeight: "700", fontSize: "1rem", color: "#1f2937", marginBottom: "0.25rem" }}>
//         Generating PDF…
//       </div>
//       <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{step}</div>
//     </div>
//     <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
//   </div>
// );

// // ─────────────────────────────────────────────────────────────
// // Content Skeleton Component
// // ─────────────────────────────────────────────────────────────
// export const ContentSkeleton = () => {
//   const SkeletonBar = ({ width, height = "14px" }) => (
//     <div style={{
//       width, height, borderRadius: "6px",
//       background: "linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)",
//       backgroundSize: "200% 100%",
//       animation: "skeleton-loading 1.4s ease infinite"
//     }} />
//   );

//   return (
//     <div style={{ background: "white", borderRadius: "1rem", padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
//       <style>{`
//         @keyframes skeleton-loading {
//           0% { background-position: 200% 0; }
//           100% { background-position: -200% 0; }
//         }
//       `}</style>
//       <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
//         <SkeletonBar width="160px" height="20px" />
//         <SkeletonBar width="120px" height="20px" />
//       </div>
//       <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
//         {[0, 1].map(col => (
//           <div key={col} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
//             {[90, 120, 80, 110].map((w, i) => (
//               <SkeletonBar key={i} width={`${w}px`} height="13px" />
//             ))}
//           </div>
//         ))}
//       </div>
//       <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
//         <div style={{ background: "#f8fafc", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
//           <SkeletonBar width="200px" height="13px" />
//         </div>
//         {[0, 1, 2].map(r => (
//           <div key={r} style={{
//             display: "flex", gap: "1rem", padding: "0.875rem 1rem",
//             borderBottom: r < 2 ? "1px solid #f1f5f9" : "none"
//           }}>
//             <SkeletonBar width="30px" />
//             <SkeletonBar width="40%" />
//             <SkeletonBar width="40px" />
//             <SkeletonBar width="60px" />
//             <SkeletonBar width="70px" />
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────
// // Field Error Component
// // ─────────────────────────────────────────────────────────────
// export const FieldError = ({ message }) => {
//   if (!message) return null;
//   return (
//     <div style={{
//       display: "flex", alignItems: "center", gap: "0.25rem",
//       marginTop: "0.25rem", color: "#dc2626", fontSize: "0.75rem"
//     }}>
//       ⚠️ {message}
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────
// // PDF Builder Class
// // ─────────────────────────────────────────────────────────────
// export class QuotationPDFBuilder {
//   constructor(config) {
//     this.quotationData = config.quotationData;
//     this.quotationItems = config.quotationItems;
//     this.tcSections = config.tcSections;
//     this.newImages = config.newImages || {};
//     this.subtotal = config.subtotal;
//     this.taxAmount = config.taxAmount;
//     this.discountAmount = config.discountAmount;
//     this.grandTotal = config.grandTotal;
//     this.amountInWords = config.amountInWords;
//     this.quotationNumber = config.quotationNumber;
//     this.headerImage = config.headerImage;
//   }

//   async build() {
//     const headerBase64 = await imageToBase64(this.headerImage);
//     const firstPage = this.quotationItems.slice(0, ITEMS_PER_FIRST_PAGE);
//     const remaining = this.quotationItems.slice(ITEMS_PER_FIRST_PAGE);
//     const multiPage = remaining.length > 0;

//     // Convert all images to base64
//     const itemImagesBase64 = {};
//     for (const item of this.quotationItems) {
//       const urls = [
//         ...(item.imagePaths || []).map(p => p.startsWith('http') ? p : `${BASE_URL}${p}`),
//         ...(this.newImages[item.id] || [])
//       ];
//       itemImagesBase64[item.id] = await Promise.all(urls.map(src => imageToBase64(src)));
//     }

//     const renderRow = (item, index) => {
//       const images = (itemImagesBase64[item.id] || []).filter(Boolean);
//       return `
//         <tr>
//           <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index + 1}</td>
//           <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
//             <div style="font-weight:600;font-size:11px;">${item.name || "—"}</div>
//             ${item.description ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${item.description}</div>` : ""}
//             ${images.length ? `
//               <div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
//                 ${images.map(src => `
//                   <div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;">
//                     <img src="${src}" style="width:100%;height:100%;object-fit:cover;" />
//                   </div>
//                 `).join("")}
//               </div>
//             ` : ""}
//           </td>
//           <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
//           <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${Number(item.unitPrice).toFixed(2)}</td>
//           <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity * item.unitPrice).toFixed(2)}</td>
//         </tr>
//       `;
//     };

//     const totalsRows = `
//       <tr style="background:#f8fafc;font-weight:600;">
//         <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
//         <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Total (AED)</td>
//         <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${this.subtotal.toFixed(2)}</td>
//       </tr>
//       <tr style="background:#f8fafc;font-weight:600;">
//         <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
//         <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">Tax (${this.quotationData.tax}%)</td>
//         <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${this.taxAmount.toFixed(2)}</td>
//       </tr>
//       ${this.discountAmount > 0 ? `
//         <tr style="background:#f8fafc;font-weight:600;">
//           <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
//           <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${this.quotationData.discount}%)</td>
//           <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">-${this.discountAmount.toFixed(2)}</td>
//         </tr>
//       ` : ""}
//       <tr style="background:#000;color:white;font-weight:700;">
//         <td colspan="3" style="border:none;padding:8px;"></td>
//         <td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (AED)</td>
//         <td style="text-align:right;padding:12px 8px;font-size:12px;">${this.grandTotal.toFixed(2)}</td>
//       </tr>
//     `;

//     const thead = `
//       <thead>
//         <tr style="background:#000;">
//           <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
//           <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
//           <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
//           <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
//           <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
//         </tr>
//       </thead>
//     `;

//     const termsSection = sectionsToHTML(this.tcSections);
//     const termsImgTag = this.quotationData.termsImage
//       ? `<img src="${this.quotationData.termsImage.startsWith("data:") 
//           ? this.quotationData.termsImage 
//           : `${BASE_URL}${this.quotationData.termsImage}`}" 
//           style="margin-top:8px;max-width:100%;border-radius:4px;" />`
//       : "";

//     return `<!DOCTYPE html>
//       <html>
//         <head>
//           <meta charset="UTF-8">
//           <style>
//             *{margin:0;padding:0;box-sizing:border-box;}
//             body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}
//             .container{width:874px;margin:0 auto;padding:10px;}
//             @page{size:A4;margin:5mm;}
//             thead{display:table-row-group;}
//             @media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}thead{display:table-row-group;}}
//           </style>
//         </head>
//         <body>
//           <div class="container">
//             <!-- Header -->
//             <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">
//               ${headerBase64 
//                 ? `<img src="${headerBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;" />`
//                 : `<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`
//               }
//             </div>

//             <!-- Title -->
//             <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;">
//               <div style="text-align:center;flex:1;">
//                 <h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;">QUOTATION</h1>
//                 <p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${this.quotationNumber || ""}</p>
//               </div>
//               <div style="text-align:right;">
//                 <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
//                 <div style="font-size:16px;font-weight:700;">${new Date(this.quotationData.expiryDate).toLocaleDateString("en-IN")}</div>
//               </div>
//             </div>

//             <!-- Customer Details -->
//             <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
//               <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
//                 <span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${this.quotationData.customer}</span>
//                 <span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${this.quotationData.contact || "N/A"}</span>
//                 <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${new Date(this.quotationData.date).toLocaleDateString("en-IN")}</span>
//                 <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${new Date(this.quotationData.expiryDate).toLocaleDateString("en-IN")}</span>
//               </div>
//               <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
//                 <span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${this.quotationData.ourRef || "N/A"}</span>
//                 <span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${this.quotationData.ourContact || "N/A"}</span>
//                 <span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${this.quotationData.salesOffice || "N/A"}</span>
//                 <span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${this.quotationData.paymentTerms || "N/A"}</span>
//                 <span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${this.quotationData.deliveryTerms || "N/A"}</span>
//               </div>
//             </div>

//             <!-- Items Table -->
//             <div style="margin-bottom:16px;">
//               <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3>
//               <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
//                 ${thead}
//                 <tbody>
//                   ${firstPage.map((item, i) => renderRow(item, i)).join("")}
//                   ${!multiPage ? totalsRows : ""}
//                 </tbody>
//               </table>
//             </div>

//             <!-- Additional Pages -->
//             ${multiPage ? `
//               <div class="page-break">
//                 <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">
//                   Items Detail (Continued)
//                 </h3>
//                 <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
//                   <tbody>
//                     ${remaining.map((item, i) => renderRow(item, i + ITEMS_PER_FIRST_PAGE)).join("")}
//                     ${totalsRows}
//                   </tbody>
//                 </table>
//               </div>
//             ` : ""}

//             <!-- Amount in Words -->
//             <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
//               <strong>Amount in words:</strong> ${this.amountInWords}
//             </div>

//             <!-- Notes -->
//             ${this.quotationData.notes ? `
//               <div style="margin-bottom:16px;">
//                 <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes</h3>
//                 <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">
//                   ${this.quotationData.notes}
//                 </div>
//               </div>
//             ` : ""}

//             <!-- Terms & Conditions -->
//             ${termsSection || this.quotationData.termsAndConditions ? `
//               <div style="margin-bottom:16px;">
//                 <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Terms & Conditions</h3>
//                 ${termsSection || `<div style="font-size:10px;color:#4b5563;">${this.quotationData.termsAndConditions}</div>`}
//                 ${termsImgTag}
//               </div>
//             ` : ""}

//             <!-- Signature -->
//             <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280;">
//               <p style="margin:0;font-weight:600;color:#1f2937;">Sincerely,</p>
//               <p style="margin:20px 0 0;font-weight:600;color:#1f2937;">Mega Repairing Machinery Equipment LLC</p>
//             </div>
//           </div>
//         </body>
//       </html>
//     `;
//   }
// }

// // ─────────────────────────────────────────────────────────────
// // Main Shared Quotation Component
// // ─────────────────────────────────────────────────────────────
// export default function SharedQuotation({
//   // Core data
//   mode = 'create', // 'create' or 'view'
//   quotation = null,
//   customer = null,
//   selectedItems = [],
//   items = [],
//   quotationNumber: propQuotationNumber = null,
  
//   // Callbacks
//   onSave,
//   onUpdate,
//   onBack,
//   onExport,
  
//   // UI State
//   isItemsLoading = false,
//   itemsLoadError = null,
  
//   // Configuration
//   headerImage: propHeaderImage = null,
//   disableEditing = false,
//   showBackButton = true,
//   customActions = null,
// }) {
//   // ── State ─────────────────────────────────────
//   const today = new Date().toISOString().split("T")[0];
  
//   // Generate quotation number for create mode
//   const generatedQuotationNumber = useMemo(() => {
//     if (mode === 'create') {
//       const d = new Date();
//       const yy = d.getFullYear().toString().substr(-2);
//       const mm = (d.getMonth() + 1).toString().padStart(2, "0");
//       const dd = d.getDate().toString().padStart(2, "0");
//       const rn = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
//       return `QT-${yy}${mm}${dd}-${rn}`;
//     }
//     return null;
//   }, [mode]);

//   const quotationNumber = mode === 'create' ? generatedQuotationNumber : (quotation?.quotationNumber || propQuotationNumber);

//   // Initialize data based on mode
//   const [quotationData, setQuotationData] = useState(() => {
//     if (mode === 'view' && quotation) {
//       return parseQuotationData(quotation);
//     }
//     return {
//       date: today,
//       expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
//       customer: customer?.name || "",
//       contact: customer?.phone || "",
//       ourRef: "",
//       ourContact: "",
//       salesOffice: "",
//       paymentTerms: "",
//       deliveryTerms: "",
//       tax: 0,
//       discount: 0,
//       notes: "",
//       termsAndConditions: "",
//       termsImage: null,
//     };
//   });

//   const [quotationItems, setQuotationItems] = useState(() => {
//     if (mode === 'view' && quotation) {
//       return parseQuotationItems(quotation.items, items);
//     }
//     if (mode === 'create' && selectedItems?.length) {
//       return selectedItems.map((item) => {
//         const found = items.find((i) => i._id === item.itemId);
//         return {
//           id: `${Date.now()}-${Math.random()}`,
//           itemId: item.itemId || item._id || null,
//           quantity: Number(item.quantity) || 1,
//           unitPrice: Number(item.unitPrice || item.price) || 0,
//           name: item.name || found?.name || "",
//           description: found?.description || item.description || "",
//           imagePaths: [],
//         };
//       });
//     }
//     return [];
//   });

//   const [tcSections, setTcSections] = useState(() => {
//     if (mode === 'view' && quotation) {
//       return htmlToSections(quotation.termsAndConditions) || [newSection()];
//     }
//     return [newSection()];
//   });

//   // UI States
//   const [isEditing, setIsEditing] = useState(mode === 'create' ? true : false);
//   const [isSaving, setIsSaving] = useState(false);
//   const [isExporting, setIsExporting] = useState(false);
//   const [exportStep, setExportStep] = useState("");
//   const [editingImgId, setEditingImgId] = useState(null);
//   const [newImages, setNewImages] = useState({});
//   const [fieldErrors, setFieldErrors] = useState({});
//   const [headerErrors, setHeaderErrors] = useState({});
//   const [snackbar, setSnackbar] = useState({ show: false, message: "", type: "error" });

//   // Refs
//   const initializedRef = React.useRef(false);

//   // Initialize for create mode when items load
//   useEffect(() => {
//     if (mode === 'create' && !isItemsLoading && items.length && !initializedRef.current && selectedItems?.length) {
//       initializedRef.current = true;
//       setQuotationItems(
//         selectedItems.map((item) => {
//           const found = items.find((i) => i._id === item.itemId);
//           return {
//             id: `${Date.now()}-${Math.random()}`,
//             itemId: item.itemId || item._id || null,
//             quantity: Number(item.quantity) || 1,
//             unitPrice: Number(item.unitPrice || item.price) || 0,
//             name: item.name || found?.name || "",
//             description: found?.description || item.description || "",
//             imagePaths: [],
//           };
//         })
//       );
//     }
//   }, [mode, isItemsLoading, items, selectedItems]);

//   // ── Calculations ─────────────────────────────
//   const subtotal = useMemo(() => 
//     quotationItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
//     [quotationItems]
//   );
  
//   const taxAmount = useMemo(() => 
//     (subtotal * (Number(quotationData.tax) || 0)) / 100,
//     [subtotal, quotationData.tax]
//   );
  
//   const discountAmount = useMemo(() => 
//     (subtotal * (Number(quotationData.discount) || 0)) / 100,
//     [subtotal, quotationData.discount]
//   );
  
//   const grandTotal = useMemo(() => 
//     subtotal + taxAmount - discountAmount,
//     [subtotal, taxAmount, discountAmount]
//   );
  
//   const amountInWords = useMemo(() => 
//     numberToWords(grandTotal),
//     [grandTotal]
//   );

//   const getItemData = useCallback((id) => 
//     (items || []).find(i => i._id === id) || null,
//     [items]
//   );

//   // ── Validation ───────────────────────────────
//   const validateHeaderField = useCallback((field, value) => {
//     const errors = {};

//     if (field === "date" || field === "expiryDate") {
//       const dateVal = field === "date" ? value : quotationData.date;
//       const expiryVal = field === "expiryDate" ? value : quotationData.expiryDate;
      
//       if (!dateVal) errors.date = "Creation date is required.";
//       if (!expiryVal) errors.expiryDate = "Expiry date is required.";
//       if (dateVal && expiryVal && expiryVal < dateVal) {
//         errors.expiryDate = "Expiry date cannot be before the creation date.";
//       }
//     }

//     if (field === "tax") {
//       if (value === "" || value === null || value === undefined) {
//         errors.tax = "VAT is required.";
//       } else {
//         const result = validatePercentage(value);
//         if (!result.isValid) errors.tax = result.error;
//       }
//     }

//     if (field === "discount") {
//       if (value !== "" && value !== null && value !== undefined) {
//         const result = validatePercentage(value);
//         if (!result.isValid) errors.discount = result.error;
//       }
//     }

//     return errors;
//   }, [quotationData]);

//   const validateAll = useCallback(() => {
//     // Check for existing errors
//     const hasItemErrors = Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);
//     if (Object.keys(headerErrors).length > 0 || hasItemErrors) {
//       setSnackbar({ show: true, message: "Please fix all highlighted errors before proceeding.", type: "error" });
//       return false;
//     }

//     // Header validation
//     if (!quotationData.date) {
//       setHeaderErrors(prev => ({ ...prev, date: "Creation date is required." }));
//       setSnackbar({ show: true, message: "Creation date is required.", type: "error" });
//       return false;
//     }
    
//     if (!quotationData.expiryDate) {
//       setHeaderErrors(prev => ({ ...prev, expiryDate: "Expiry date is required." }));
//       setSnackbar({ show: true, message: "Expiry date is required.", type: "error" });
//       return false;
//     }
    
//     if (quotationData.expiryDate < quotationData.date) {
//       setHeaderErrors(prev => ({ ...prev, expiryDate: "Expiry date cannot be before the creation date." }));
//       setSnackbar({ show: true, message: "Expiry date cannot be before the creation date.", type: "error" });
//       return false;
//     }

//     // Items validation
//     if (!quotationItems.length) {
//       setSnackbar({ show: true, message: "Please add at least one item.", type: "error" });
//       return false;
//     }

//     for (const item of quotationItems) {
//       if (!item.itemId) {
//         setSnackbar({ show: true, message: "Please select an item for all rows.", type: "error" });
//         return false;
//       }
      
//       const quantityResult = validateQuantity(item.quantity);
//       if (!quantityResult.isValid) {
//         setSnackbar({ show: true, message: `"${item.name || 'Item'}" — ${quantityResult.error}`, type: "error" });
//         return false;
//       }
      
//       const priceResult = validatePrice(item.unitPrice);
//       if (!priceResult.isValid) {
//         setSnackbar({ show: true, message: `"${item.name || 'Item'}" — ${priceResult.error}`, type: "error" });
//         return false;
//       }
//     }

//     // Tax/Discount validation
//     const taxResult = validatePercentage(quotationData.tax);
//     if (!taxResult.isValid) {
//       setSnackbar({ show: true, message: taxResult.error, type: "error" });
//       return false;
//     }
    
//     const discountResult = validatePercentage(quotationData.discount);
//     if (!discountResult.isValid) {
//       setSnackbar({ show: true, message: discountResult.error, type: "error" });
//       return false;
//     }

//     return true;
//   }, [quotationItems, quotationData, fieldErrors, headerErrors]);

//   // ── Handlers ─────────────────────────────────
//   const showSnack = useCallback((message, type = "error") => {
//     setSnackbar({ show: true, message, type });
//   }, []);

//   const handleDataChange = useCallback((field, value) => {
//     // Validate and update errors
//     const newErrors = validateHeaderField(field, value);
//     setHeaderErrors(prev => ({ ...prev, ...newErrors }));

//     if (!newErrors[field]) {
//       setHeaderErrors(prev => {
//         const updated = { ...prev };
//         delete updated[field];
//         return updated;
//       });
//     }

//     // Special handling for dates
//     if (field === "expiryDate" && quotationData.date && value < quotationData.date) {
//       setHeaderErrors(prev => ({ ...prev, expiryDate: "Expiry date cannot be before the creation date." }));
//     }

//     // Update state
//     if (value === "") {
//       setQuotationData(prev => ({
//         ...prev,
//         [field]: (field === "tax" || field === "discount") ? 0 : ""
//       }));
//       return;
//     }

//     if (field === "tax" || field === "discount") {
//       const result = validatePercentage(value);
//       if (!result.isValid) return;
//       value = parseFloat(value) || 0;
//     }

//     setQuotationData(prev => ({ ...prev, [field]: value }));
//   }, [quotationData, validateHeaderField]);

//   const handleUpdateItem = useCallback((id, field, value) => {
//     // Clear error for this field
//     setFieldErrors(prev => {
//       const updated = { ...prev };
//       if (updated[id]) {
//         delete updated[id][field];
//         if (Object.keys(updated[id]).length === 0) {
//           delete updated[id];
//         }
//       }
//       return updated;
//     });

//     // Validate based on field type
//     if (field === "quantity") {
//       if (value === "" || value === null) {
//         setFieldErrors(prev => ({
//           ...prev,
//           [id]: { ...prev[id], quantity: "Quantity is required." }
//         }));
//         return;
//       }
//       const result = validateQuantity(value);
//       if (!result.isValid) {
//         setFieldErrors(prev => ({
//           ...prev,
//           [id]: { ...prev[id], quantity: result.error }
//         }));
//         return;
//       }
//       value = parseInt(value, 10);
//     }

//     if (field === "unitPrice") {
//       if (value === "") {
//         setQuotationItems(prev => prev.map(item =>
//           item.id !== id ? item : { ...item, unitPrice: 0 }
//         ));
//         return;
//       }
//       const result = validatePrice(value);
//       if (!result.isValid) {
//         setFieldErrors(prev => ({
//           ...prev,
//           [id]: { ...prev[id], unitPrice: result.error }
//         }));
//         return;
//       }
//       value = parseFloat(value) || 0;
//     }

//     // Handle item selection
//     if (field === "itemId" && value) {
//       const found = items.find(i => i._id === value);
//       setQuotationItems(prev => prev.map(item =>
//         item.id !== id ? item : {
//           ...item,
//           itemId: value,
//           name: found?.name || "",
//           description: found?.description || "",
//           unitPrice: found?.price != null ? Number(found.price) : item.unitPrice,
//         }
//       ));
//       return;
//     }

//     // Update other fields
//     setQuotationItems(prev => prev.map(item =>
//       item.id !== id ? item : { ...item, [field]: value }
//     ));
//   }, [items]);

//   const handleAddItem = useCallback(() => {
//     setQuotationItems(prev => [...prev, {
//       id: `${Date.now()}-${Math.random()}`,
//       itemId: null,
//       quantity: 1,
//       unitPrice: 0,
//       name: "",
//       description: "",
//       imagePaths: [],
//     }]);
//   }, []);

//   const handleRemoveItem = useCallback((id) => {
//     setQuotationItems(prev => prev.filter(i => i.id !== id));
//     setNewImages(prev => {
//       const updated = { ...prev };
//       delete updated[id];
//       return updated;
//     });
//     setFieldErrors(prev => {
//       const updated = { ...prev };
//       delete updated[id];
//       return updated;
//     });
//   }, []);

//   const handleImageUpload = useCallback((e, itemId) => {
//     const files = Array.from(e.target.files || []);
//     if (!files.length) return;

//     const currentImages = newImages[itemId] || [];
//     const slots = MAX_IMAGES_PER_ITEM - currentImages.length;
    
//     if (slots <= 0) {
//       showSnack(`Maximum ${MAX_IMAGES_PER_ITEM} images per item allowed.`);
//       return;
//     }

//     const toProcess = files.slice(0, slots);
//     if (files.length > slots) {
//       showSnack(`Only ${slots} slot(s) left — added first ${slots} images.`);
//     }

//     toProcess.forEach(file => {
//       if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
//         showSnack(`"${file.name}" is not a supported image type.`);
//         return;
//       }
//       if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
//         showSnack(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
//         return;
//       }

//       const reader = new FileReader();
//       reader.onload = () => {
//         setNewImages(prev => ({
//           ...prev,
//           [itemId]: [...(prev[itemId] || []), reader.result]
//         }));
//       };
//       reader.onerror = () => showSnack(`Failed to read "${file.name}".`);
//       reader.readAsDataURL(file);
//     });

//     setEditingImgId(null);
//     e.target.value = "";
//   }, [newImages, showSnack]);

//   const handleRemoveExistingImage = useCallback((itemId, index) => {
//     setQuotationItems(prev => prev.map(item =>
//       item.id === itemId
//         ? { ...item, imagePaths: item.imagePaths.filter((_, i) => i !== index) }
//         : item
//     ));
//   }, []);

//   const handleRemoveNewImage = useCallback((itemId, index) => {
//     setNewImages(prev => {
//       const updated = { ...prev };
//       if (updated[itemId]) {
//         updated[itemId] = updated[itemId].filter((_, i) => i !== index);
//         if (updated[itemId].length === 0) {
//           delete updated[itemId];
//         }
//       }
//       return updated;
//     });
//   }, []);

//   const handleCancelEdit = useCallback(() => {
//     if (mode === 'view' && quotation) {
//       setQuotationData(parseQuotationData(quotation));
//       setQuotationItems(parseQuotationItems(quotation.items, items));
//       setTcSections(htmlToSections(quotation.termsAndConditions) || [newSection()]);
//     }
//     setNewImages({});
//     setEditingImgId(null);
//     setFieldErrors({});
//     setHeaderErrors({});
//     setIsEditing(false);
//   }, [mode, quotation, items]);

//   const handleSave = async () => {
//     if (!validateAll()) return;
//     if (disableEditing) return;

//     setIsSaving(true);
//     try {
//       // Prepare images
//       const quotationImages = {};
//       quotationItems.forEach((item, index) => {
//         if (newImages[item.id]?.length) {
//           quotationImages[index] = newImages[item.id];
//         }
//       });

//       // Prepare payload
//       const payload = {
//         ...(mode === 'view' && quotation ? { customerId: quotation.customerId?._id || quotation.customerId } : {}),
//         customer: quotationData.customer?.trim(),
//         contact: quotationData.contact?.trim() || "",
//         date: quotationData.date,
//         expiryDate: quotationData.expiryDate,
//         ourRef: quotationData.ourRef?.trim() || "",
//         ourContact: quotationData.ourContact?.trim() || "",
//         salesOffice: quotationData.salesOffice?.trim() || "",
//         paymentTerms: quotationData.paymentTerms?.trim() || "",
//         deliveryTerms: quotationData.deliveryTerms?.trim() || "",
//         tax: Number(quotationData.tax) || 0,
//         discount: Number(quotationData.discount) || 0,
//         notes: quotationData.notes?.trim() || "",
//         termsAndConditions: sectionsToHTML(tcSections),
//         termsImage: quotationData.termsImage || null,
//         total: grandTotal,
//         quotationImages,
//         items: quotationItems.map(item => ({
//           itemId: item.itemId,
//           quantity: Number(item.quantity) || 1,
//           unitPrice: Number(item.unitPrice) || 0,
//           ...(mode === 'view' ? { imagePaths: item.imagePaths || [] } : {}),
//           description: item.description || "",
//         })),
//       };

//       let success = false;
//       if (mode === 'create' && onSave) {
//         success = await onSave(payload);
//       } else if (mode === 'view' && onUpdate && quotation) {
//         success = await onUpdate(quotation._id, payload);
//       }

//       if (success) {
//         setSnackbar({
//           show: true,
//           message: mode === 'create' ? "Quotation created successfully!" : "Quotation updated successfully!",
//           type: "success"
//         });
        
//         if (mode === 'create') {
//           setTimeout(() => onBack?.(), 1500);
//         } else {
//           setIsEditing(false);
//           setNewImages({});
//         }
//       }
//     } catch (err) {
//       const message = err?.response?.data?.message || err.message || "Please try again.";
//       setSnackbar({ show: true, message: `Error: ${message}`, type: "error" });
//     } finally {
//       setIsSaving(false);
//     }
//   };

//   const handleExportPDF = async () => {
//     if (!validateAll()) return;

//     setIsExporting(true);
//     setExportStep("Preparing document…");

//     try {
//       const pdfBuilder = new QuotationPDFBuilder({
//         quotationData,
//         quotationItems,
//         tcSections,
//         newImages,
//         subtotal,
//         taxAmount,
//         discountAmount,
//         grandTotal,
//         amountInWords,
//         quotationNumber,
//         headerImage: propHeaderImage,
//       });

//       setExportStep("Generating PDF…");
//       const html = await pdfBuilder.build();

//       setExportStep("Downloading…");
//       const filename = `Quotation_${(quotationData.customer || "Draft").replace(/\s+/g, "_")}_${today}`;
      
//       if (onExport) {
//         await onExport(html, filename);
//       } else {
//         // Default export behavior - you'd need to implement this
//         console.log("Export PDF:", filename);
//       }

//       setSnackbar({ show: true, message: "PDF downloaded successfully!", type: "success" });
//     } catch (err) {
//       const message = err.message || "Unknown error";
//       setSnackbar({ show: true, message: `Failed to export PDF: ${message}`, type: "error" });
//     } finally {
//       setIsExporting(false);
//       setExportStep("");
//     }
//   };

//   // ── Render Helpers ───────────────────────────
//   const hasHeaderErrors = Object.keys(headerErrors).length > 0;
//   const hasItemErrors = Object.values(fieldErrors).some(e => e && Object.keys(e).length > 0);
//   const hasAnyError = hasHeaderErrors || hasItemErrors;

//   // ── Render ────────────────────────────────────
//   return (
//     <div style={{ minHeight: "100vh", backgroundColor: "#f0f9ff", padding: "1.5rem" }}>
//       <style>{`
//         @media print {
//           body { margin: 0; padding: 0; background: white; }
//           .no-print { display: none !important; }
//           .quotation-content { box-shadow: none; border-radius: 0; }
//           @page { margin: 0; }
//         }
//         .edit-input:focus { outline: 2px solid #3b82f6; border-color: #3b82f6 !important; }
//         .field-error-input { border-color: #dc2626 !important; background: #fef2f2 !important; }
//         @keyframes spin { to { transform: rotate(360deg); } }
//       `}</style>

//       {isExporting && <PdfOverlay step={exportStep} />}

//       <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

//         {/* Top Controls */}
//         <div className="no-print" style={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           marginBottom: "1.5rem",
//           flexWrap: "wrap",
//           gap: "0.75rem"
//         }}>
//           <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "#1f2937", margin: 0 }}>
//             {mode === 'create' ? '📄 Create Quotation' : (isEditing ? '✏️ Edit Quotation' : '📄 View Quotation')}
//           </h1>
          
//           <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
//             {customActions || (
//               <>
//                 {mode === 'view' && !isEditing && !disableEditing && (
//                   <button
//                     onClick={() => setIsEditing(true)}
//                     style={getButtonStyle("#f59e0b")}
//                   >
//                     <Edit2 size={16} /> Edit
//                   </button>
//                 )}
                
//                 {isEditing && (
//                   <>
//                     <button
//                       onClick={handleSave}
//                       disabled={isSaving}
//                       style={getButtonStyle("#10b981", isSaving)}
//                     >
//                       <Save size={16} /> {isSaving ? "Saving…" : "Save Changes"}
//                     </button>
//                     <button
//                       onClick={handleCancelEdit}
//                       style={getButtonStyle("#ef4444")}
//                     >
//                       <X size={16} /> Cancel
//                     </button>
//                   </>
//                 )}
                
//                 <button
//                   onClick={handleExportPDF}
//                   disabled={isExporting || hasAnyError}
//                   title={hasAnyError ? "Fix validation errors first" : "Download PDF"}
//                   style={getButtonStyle("#0369a1", isExporting || hasAnyError)}
//                 >
//                   {isExporting ? (
//                     <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
//                   ) : (
//                     <><Download size={16} /> Download PDF</>
//                   )}
//                 </button>
                
//                 {showBackButton && (
//                   <button onClick={onBack} style={getButtonStyle("#6b7280")}>
//                     <ArrowLeft size={16} /> Back
//                   </button>
//                 )}
//               </>
//             )}
//           </div>
//         </div>

//         {/* Loading / Error States */}
//         {isItemsLoading && (
//           <div className="no-print" style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "0.75rem",
//             backgroundColor: "#eff6ff",
//             border: "1px solid #bfdbfe",
//             borderRadius: "0.5rem",
//             padding: "0.875rem 1rem",
//             marginBottom: "1rem",
//             fontSize: "0.875rem",
//             color: "#1e40af"
//           }}>
//             <Loader size={18} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
//             <span>Loading catalogue items — dropdowns will be ready shortly…</span>
//           </div>
//         )}

//         {itemsLoadError && (
//           <div className="no-print" style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "0.75rem",
//             backgroundColor: "#fef2f2",
//             border: "1px solid #fecaca",
//             borderRadius: "0.5rem",
//             padding: "0.875rem 1rem",
//             marginBottom: "1rem",
//             fontSize: "0.875rem",
//             color: "#991b1b"
//           }}>
//             ⚠️ <span>Failed to load catalogue items: <strong>{itemsLoadError}</strong></span>
//           </div>
//         )}

//         {/* Error Summary */}
//         {hasHeaderErrors && isEditing && (
//           <div className="no-print" style={{
//             display: "flex",
//             alignItems: "flex-start",
//             gap: "0.75rem",
//             backgroundColor: "#fef2f2",
//             border: "1px solid #fecaca",
//             borderRadius: "0.5rem",
//             padding: "0.875rem 1rem",
//             marginBottom: "1rem",
//             fontSize: "0.875rem",
//             color: "#991b1b"
//           }}>
//             <div style={{ fontWeight: "600", marginRight: "0.5rem" }}>⚠️ Please fix:</div>
//             <div>
//               {Object.values(headerErrors).filter(Boolean).map((error, i) => (
//                 <div key={i}>• {error}</div>
//               ))}
//             </div>
//           </div>
//         )}

//         {/* Edit Mode Banner */}
//         {isEditing && !hasHeaderErrors && (
//           <div className="no-print" style={{
//             backgroundColor: "#fef3c7",
//             border: "1px solid #f59e0b",
//             borderRadius: "0.5rem",
//             padding: "0.75rem 1rem",
//             marginBottom: "1rem",
//             fontSize: "0.875rem",
//             color: "#92400e",
//             display: "flex",
//             alignItems: "center",
//             gap: "0.5rem"
//           }}>
//             ✏️ <strong>Edit mode active</strong> — changes are validated in real time.
//           </div>
//         )}

//         {/* Main Content */}
//         {isItemsLoading ? (
//           <ContentSkeleton />
//         ) : (
//           <QuotationLayout
//             isEditing={isEditing}
//             quotationNumber={quotationNumber}
//             quotationData={quotationData}
//             onDataChange={handleDataChange}
//             headerErrors={headerErrors}
//             quotationItems={quotationItems}
//             availableItems={items}
//             onUpdateItem={handleUpdateItem}
//             onAddItem={handleAddItem}
//             onRemoveItem={handleRemoveItem}
//             onAddImages={handleImageUpload}
//             onRemoveExistingImage={handleRemoveExistingImage}
//             onRemoveNewImage={handleRemoveNewImage}
//             editingImgId={editingImgId}
//             onToggleImgEdit={(id) => setEditingImgId(editingImgId === id ? null : id)}
//             newImages={newImages}
//             subtotal={subtotal}
//             taxAmount={taxAmount}
//             discountAmount={discountAmount}
//             grandTotal={grandTotal}
//             amountInWords={amountInWords}
//             tcSections={tcSections}
//             onTcChange={setTcSections}
//             fieldErrors={fieldErrors}
//             actionBar={isEditing ? (
//               <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
//                 <button
//                   onClick={handleSave}
//                   disabled={isSaving}
//                   style={{
//                     ...getButtonStyle("#10b981", isSaving),
//                     padding: "0.875rem 2rem",
//                     fontSize: "1rem"
//                   }}
//                 >
//                   <Save size={18} /> {isSaving ? "Saving…" : "Save Changes"}
//                 </button>
//                 <button
//                   onClick={handleCancelEdit}
//                   style={{
//                     ...getButtonStyle("#6b7280"),
//                     padding: "0.875rem 2rem",
//                     fontSize: "1rem"
//                   }}
//                 >
//                   <X size={18} /> Cancel
//                 </button>
//               </div>
//             ) : null}
//           />
//         )}
//       </div>

//       {/* Snackbar */}
//       {snackbar.show && (
//         <Snackbar
//           message={snackbar.message}
//           type={snackbar.type}
//           onClose={() => setSnackbar({ show: false, message: "", type: "error" })}
//         />
//       )}
//     </div>
//   );
// }