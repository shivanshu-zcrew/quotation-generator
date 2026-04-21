import { imageToBase64 } from './imageUtils';
import { numberToWords } from './numberToWords';
import { fmtDate } from './formatters';
import headerImage from '../assets/header.png';
import { quotationAPI } from '../services/api'; 

import { ITEMS_PER_FIRST_PAGE, BASE_URL } from './constants';

/**
 * Safely extract customer name from various data structures
 */
const getCustomerName = (quotation) => {
  if (quotation.customerSnapshot?.name) return quotation.customerSnapshot.name;
  if (typeof quotation.customer === 'string' && quotation.customer) return quotation.customer;
  if (quotation.customer?.name) return quotation.customer.name;
  if (quotation.customerId?.name) return quotation.customerId.name;
  return 'N/A';
};

/**
 * Safely extract contact information
 */
const getContact = (quotation) => {
  if (quotation.contact) return quotation.contact;
  if (quotation.customerSnapshot?.contact) return quotation.customerSnapshot.contact;
  if (quotation.customer?.contact) return quotation.customer.contact;
  return 'N/A';
};

/**
 * Safely extract item name and description
 */
const getItemDetails = (item) => {
  let name = '—';
  let description = '';
  
  if (item.itemId) {
    if (typeof item.itemId === 'object') {
      name = item.itemId.name || item.name || '—';
      description = item.itemId.description || item.description || '';
    } else {
      name = item.name || '—';
      description = item.description || '';
    }
  } else {
    name = item.name || '—';
    description = item.description || '';
  }
  
  return { name, description };
};

/**
 * Build HTML for terms images gallery
 */
const buildTermsImagesHTML = (termsImages = []) => {
  if (!termsImages || termsImages.length === 0) return '';
  
  let imagesHTML = '<div style="margin-top:12px;"><h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Reference Images</h3>';
  imagesHTML += '<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:flex-start;">';
  
  termsImages.forEach((img, idx) => {
    if (img && img.url) {
      imagesHTML += `
        <div style="text-align:center; max-width:200px;">
          <img src="${img.url}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid #e2e8f0;object-fit:contain;background:#f8fafc;" />
          ${img.fileName ? `<div style="font-size:10px;color:#6b7280;margin-top:6px;word-break:break-all;">${img.fileName}</div>` : ''}
        </div>
      `;
    }
  });
  
  imagesHTML += '</div></div>';
  return imagesHTML;
};

/**
 * Build HTML for PDF generation
 */
export const buildPDFHTML = async (quotation, options = {}) => {
  const { newImages = {} } = options;

  // Extract basic fields with fallbacks
  const items = quotation.items || [];
  const taxPercent = quotation.taxPercent || quotation.tax || 0;
  const discountPercent = quotation.discountPercent || quotation.discount || 0;
  const customerName = getCustomerName(quotation);
  const contact = getContact(quotation);
  const date = quotation.date || new Date().toISOString().split('T')[0];
  const expiryDate = quotation.expiryDate || '';
  const projectName = quotation.projectName || '';
  const tl = quotation.tl || '';
  const trn = quotation.trn || '';
  const ourRef = quotation.ourRef || '';
  const ourContact = quotation.ourContact || '';
  const salesOffice = quotation.salesOffice || '';
  const paymentTerms = quotation.paymentTerms || '';
  const deliveryTerms = quotation.deliveryTerms || '';
  const notes = quotation.notes || '';
  const termsAndConditions = quotation.termsAndConditions || '';
  const termsImages = quotation.termsImages || [];  
  const quotationNumber = quotation.quotationNumber || '';
  const currency = quotation.currency?.code || 'AED';
  const companySnapshot = quotation.companySnapshot || null;

  // Convert header image to base64
  const headerBase64 = await imageToBase64(headerImage);
  
  // Process items with images
  const itemsWithImages = await Promise.all(
    items.map(async (item) => {
      const { name, description } = getItemDetails(item);
      
      const imagePaths = [
        ...(item.imagePaths || []),
        ...((newImages[item.id] || []))
      ];
      
      const paths = await Promise.all(
        imagePaths.map(p => imageToBase64(p))
      );
      
      return { 
        ...item, 
        _b64Images: paths.filter(Boolean),
        name,
        description,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0
      };
    })
  );

  // Calculate totals
  const subtotal = itemsWithImages.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const taxAmt = (subtotal * taxPercent) / 100;
  const discAmt = (subtotal * discountPercent) / 100;
  const grandTotal = subtotal + taxAmt - discAmt;
  const amountInWords = numberToWords(grandTotal);

  // Split items for multi-page
  const firstPage = itemsWithImages.slice(0, ITEMS_PER_FIRST_PAGE);
  const remaining = itemsWithImages.slice(ITEMS_PER_FIRST_PAGE);
  const multiPage = remaining.length > 0;

  // Render row function
  const renderRow = (item, index) => {
    const imgs = item._b64Images || [];
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${index + 1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        <div style="font-weight:600;font-size:11px;">${item.name}</div>
        ${item.description ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;line-height:1.3;">${item.description}</div>` : ''}
        ${imgs.length ? `<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
          ${imgs.map(src => `<div style="width:100%;height:120px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;">
            <img src="${src}" style="width:100%;height:100%;object-fit:cover;" />
          </div>`).join('')}
        </div>` : ''}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.quantity}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${item.unitPrice.toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };

  // Totals rows
  const totalsRows = `
    <tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Subtotal (${currency})</td>
      <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td>
    </tr>
    <tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">VAT (${taxPercent}%)</td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td>
    </tr>
    ${discAmt > 0 ? `<tr style="background:#f8fafc;font-weight:600;">
      <td colspan="3" style="border:1px solid #e5e7eb;padding:8px;"></td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${discountPercent}%)</td>
      <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">-${discAmt.toFixed(2)}</td>
    </tr>` : ''}
    <tr style="background:#000;color:white;font-weight:700;">
      <td colspan="3" style="border:none;padding:8px;"></td>
      <td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (${currency})</td>
      <td style="text-align:right;padding:12px 8px;font-size:12px;">${grandTotal.toFixed(2)}</td>
    </tr>`;

  // Table header
  const thead = `<thead><tr style="background:#000;">
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:40px;">SR#</th>
    <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;">Item Description</th>
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:50px;">Qty</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:70px;">Unit Price</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #000;width:80px;">Amount</th>
  </tr></thead>`;

  // ✅ Build terms images gallery HTML
  const termsImagesHTML = buildTermsImagesHTML(termsImages);

  // Company footer
  const companyInfo = companySnapshot;
  const companyFooter = companyInfo ? `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
      <div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div>
      <div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">${companyInfo.name}</div>
    </div>
  ` : `<div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
    <div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div>
    <div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">Mega Repairing Machinery Equipment LLC</div>
  </div>`;

  // Build complete HTML
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}
    .container{width:874px;margin:0 auto;padding:10px;}
    @page{size:A4;margin:5mm;}
    thead{display:table-row-group;}
    @media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}thead{display:table-row-group;}}
  </style>
</head>
<body>
  <div class="container">
    <!-- Header Image -->
    <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;border:3px solid #000;border-radius:6px;background:#f8fafc;overflow:hidden;">
      ${headerBase64 ? `<img src="${headerBase64}" style="width:100%;height:100%;object-fit:contain;padding:10px;" />` : `<div style="font-size:24px;font-weight:bold;">YOUR COMPANY LOGO</div>`}
    </div>

    <!-- Title Row -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:16px;">
      <div style="text-align:center;flex:1;">
        <h1 style="font-size:24px;font-weight:bold;color:#000;letter-spacing:1px;">QUOTATION</h1>
        <p style="color:#6b7280;margin:8px 0 0;font-size:12px;">${quotationNumber}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;font-weight:600;color:#6b7280;">VALID UNTIL</div>
        <div style="font-size:16px;font-weight:700;">${fmtDate(expiryDate)}</div>
      </div>
    </div>

    <!-- Details Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
      <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Project Name</span><span>:</span><span>${projectName || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Customer</span><span>:</span><span>${customerName}</span>
        <span style="font-weight:600;color:#4b5563;">Contact</span><span>:</span><span>${contact}</span>
        <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${fmtDate(date)}</span>
        <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${fmtDate(expiryDate)}</span>
        <span style="font-weight:600;color:#4b5563;">TL</span><span>:</span><span>${tl || "N/A"}</span>
      </div>
      <div style="display:grid;grid-template-columns:120px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${ourRef || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Our Contact</span><span>:</span><span>${ourContact || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Sales Office</span><span>:</span><span>${salesOffice || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Payment</span><span>:</span><span>${paymentTerms || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Delivery</span><span>:</span><span>${deliveryTerms || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">TRN</span><span>:</span><span>${trn || "N/A"}</span>
      </div>
    </div>

    <!-- Items Table -->
    <div style="margin-bottom:16px;">
      <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Items Detail</h3>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        ${thead}
        <tbody>
          ${firstPage.map((item, i) => renderRow(item, i)).join('')}
          ${!multiPage ? totalsRows : ''}
        </tbody>
      </table>
    </div>

    <!-- Multi-page continuation -->
    ${multiPage ? `
      <div class="page-break">
        <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:2px solid #000;padding-bottom:8px;">Items Detail (Continued)</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          ${thead}
          <tbody>
            ${remaining.map((item, i) => renderRow(item, i + ITEMS_PER_FIRST_PAGE)).join('')}
            ${totalsRows}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Amount in Words -->
    <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
      <strong>Amount in words:</strong> ${amountInWords}
    </div>

    <!-- Notes -->
    ${notes ? `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Notes</h3>
        <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${notes}</div>
      </div>
    ` : ''}

    <!-- Terms & Conditions -->
    ${termsAndConditions ? `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Terms & Conditions</h3>
        <div style="font-size:10px;color:#4b5563;line-height:1.5;">${termsAndConditions}</div>
      </div>
    ` : ''}

 

    <!-- Footer -->
    ${companyFooter}
  </div>
</body>
</html>`;
};

/**
 * Download quotation as PDF using API
 */
export const downloadQuotationPDF = async (quotation, options = {}) => {
  try {
    const html = await buildPDFHTML(quotation, options);
    const filename = `Quotation_${quotation.quotationNumber || 'export'}_${new Date().toISOString().split('T')[0]}`;
    await quotationAPI.generatePDF(html, filename);
    return { success: true };
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
};

/**
 * Print quotation using iframe (alternative method)
 */
export const printQuotation = async (quotation, company, onStart, onEnd, onError) => {
  onStart?.();
  let iframe = null;
  try {
    const html = await buildPDFHTML({ ...quotation, companySnapshot: company });
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    
    await new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = reject;
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
    });
    
    await new Promise(r => setTimeout(r, 400));
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    await new Promise(r => setTimeout(r, 1000));
    onEnd?.();
  } catch (err) {
    onError?.(err.message || 'Failed to generate PDF');
  } finally {
    if (iframe?.parentNode) document.body.removeChild(iframe);
  }
};