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
  if (quotation.customer) return quotation.customer;
  if (quotation.customerSnapshot?.name) return quotation.customerSnapshot.name;
  if (typeof quotation.customer === 'string' && quotation.customer) return quotation.customer;
  if (quotation.customer?.name) return quotation.customer.name;
  if (quotation.customerId?.name) return quotation.customerId.name;
  return 'N/A';
};

/**
 * Safely extract contact person name
 */
const getCustomerContactName = (quotation) => {
  if (quotation.customerName) return quotation.customerName;
  if (quotation.customerSnapshot?.contactPerson) return quotation.customerSnapshot.contactPerson;
  if (quotation.contact) return quotation.contact;
  if (quotation.customerSnapshot?.name) return quotation.customerSnapshot.name;
  if (quotation.customer) return quotation.customer;
  return 'N/A';
};

/**
 * Safely extract contact information
 */
const getContact = (quotation) => {
  if (quotation.contact) return quotation.contact;
  if (quotation.customerSnapshot?.contact) return quotation.customerSnapshot.contact;
  if (quotation.customer?.contact) return quotation.customer.contact;
  if (quotation.customerPhone) return quotation.customerPhone;
  if (quotation.customerSnapshot?.phone) return quotation.customerSnapshot.phone;
  return 'N/A';
};

/**
 * Safely extract customer email
 */
const getCustomerEmail = (quotation) => {
  if (quotation.customerEmail) return quotation.customerEmail;
  if (quotation.customerSnapshot?.email) return quotation.customerSnapshot.email;
  if (quotation.customerId?.email) return quotation.customerId.email;
  if (quotation.email) return quotation.email;
  return 'N/A';
};

/**
 * Safely extract customer phone
 */
const getCustomerPhone = (quotation) => {
  if (quotation.customerPhone) return quotation.customerPhone;
  if (quotation.customerSnapshot?.phone) return quotation.customerSnapshot.phone;
  if (quotation.customerId?.phone) return quotation.customerId.phone;
  if (quotation.phone) return quotation.phone;
  return 'N/A';
};

/**
 * Safely extract customer designation
 */
const getCustomerDesignation = (quotation) => {
  if (quotation.customerDesignation) return quotation.customerDesignation;
  if (quotation.customerSnapshot?.designation) return quotation.customerSnapshot.designation;
  if (quotation.designation) return quotation.designation;
  return 'N/A';
};

/**
 * Safely extract customer trade license number
 */
const getCustomerTradeLicense = (quotation) => {
  if (quotation.customerTradeLicenseNumber) return quotation.customerTradeLicenseNumber;
  if (quotation.customerSnapshot?.tradeLicenseNumber) return quotation.customerSnapshot.tradeLicenseNumber;
  if (quotation.tradeLicenseNumber) return quotation.tradeLicenseNumber;
  return 'N/A';
};

/**
 * Safely extract customer tax registration number (TRN)
 */
const getCustomerTaxRegistration = (quotation) => {
  if (quotation.customerTaxRegistrationNumber) return quotation.customerTaxRegistrationNumber;
  if (quotation.customerSnapshot?.vatNumber) return quotation.customerSnapshot.vatNumber;
  if (quotation.trn) return quotation.trn;
  return 'N/A';
};

/**
 * Safely extract focal point name
 */
const getFocalPointName = (quotation) => {
  if (quotation.ourFocalPoint) return quotation.ourFocalPoint;
  if (quotation.createdBySnapshot?.name) return quotation.createdBySnapshot.name;
  if (quotation.createdBy?.name) return quotation.createdBy.name;
  if (quotation.focalPointName) return quotation.focalPointName;
  return 'N/A';
};

/**
 * Safely extract focal point phone
 */
const getFocalPointPhone = (quotation) => {
  if (quotation.ourContact) return quotation.ourContact;
  if (quotation.companyPhone) return quotation.companyPhone;
  if (quotation.createdBySnapshot?.phone) return quotation.createdBySnapshot.phone;
  if (quotation.focalPointPhone) return quotation.focalPointPhone;
  return 'N/A';
};

/**
 * Safely extract focal point email
 */
const getFocalPointEmail = (quotation) => {
  if (quotation.salesManagerEmail) return quotation.salesManagerEmail;
  if (quotation.companyEmail) return quotation.companyEmail;
  if (quotation.createdBySnapshot?.email) return quotation.createdBySnapshot.email;
  if (quotation.focalPointEmail) return quotation.focalPointEmail;
  return 'N/A';
};

/**
 * Safely extract focal point designation
 */
const getFocalPointDesignation = (quotation) => {
  if (quotation.ourFocalPointDesignation) return quotation.ourFocalPointDesignation;
  if (quotation.companySnapshot?.focalPointDesignation) return quotation.companySnapshot.focalPointDesignation;
  if (quotation.createdBySnapshot?.role) return quotation.createdBySnapshot.role;
  if (quotation.focalPointDesignation) return quotation.focalPointDesignation;
  return 'N/A';
};

/**
 * Safely extract company trade license
 */
const getCompanyTradeLicense = (quotation) => {
  if (quotation.companyTradeLicense) return quotation.companyTradeLicense;
  if (quotation.companySnapshot?.crNumber) return quotation.companySnapshot.crNumber;
  if (quotation.tradeLicense) return quotation.tradeLicense;
  return 'N/A';
};

/**
 * Safely extract company tax registration
 */
const getCompanyTaxRegistration = (quotation) => {
  if (quotation.companyTaxRegistration) return quotation.companyTaxRegistration;
  if (quotation.companySnapshot?.vatNumber) return quotation.companySnapshot.vatNumber;
  if (quotation.taxRegistration) return quotation.taxRegistration;
  return 'N/A';
};

/**
 * Safely extract scope of work
 */
const getScopeOfWork = (quotation) => {
  if (quotation.scopeOfWork) return quotation.scopeOfWork;
  return '';
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
  
  let imagesHTML = '<div style="margin-top:16px;">';
  imagesHTML += '<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:flex-start;">';
  
  termsImages.forEach((img, idx) => {
    if (img && img.url) {
      imagesHTML += `
        <div style="text-align:center; max-width:200px; border:1px solid #e2e8f0; border-radius:8px; padding:8px; background:#ffffff;">
          <img src="${img.url}" style="max-width:180px;max-height:150px;border-radius:4px;object-fit:contain;" />
          ${img.fileName ? `<div style="font-size:10px;color:#6b7280;margin-top:8px;word-break:break-all;">${img.fileName}</div>` : ''}
        </div>
      `;
    }
  });
  
  imagesHTML += '</div></div>';
  return imagesHTML;
};

/**
 * Format terms and conditions text with proper line breaks
 */
const formatTermsText = (text) => {
  if (!text) return '';
  
  let cleaned = text;
  
  if (cleaned.startsWith('\n')) {
    cleaned = cleaned.replace(/^\n+/, '');
  }
  
  if (cleaned.endsWith('\n')) {
    cleaned = cleaned.replace(/\n+$/, '');
  }
  
  return cleaned.replace(/\n/g, '<br>');
};

/**
 * Build HTML for PDF generation
 */
export const buildPDFHTML = async (quotation, options = {}) => {
  const { newImages = {}, exportType = 'with_total' } = options;
  console.log('🔍 PDF Generator received exportType:', exportType);
  
  // Extract basic fields with fallbacks
  const items = quotation.items || [];
  const taxPercent = quotation.taxPercent || quotation.tax || 0;
  const discountPercent = quotation.discountPercent || quotation.discount || 0;
  
  // Customer details - LEFT SIDE
  const customerName = getCustomerName(quotation);
  const customerContactName = getCustomerContactName(quotation);
  const customerEmail = getCustomerEmail(quotation);
  const customerPhone = getCustomerPhone(quotation);
  const customerDesignation = getCustomerDesignation(quotation);
  const customerTradeLicense = getCustomerTradeLicense(quotation);
  const customerTaxRegistration = getCustomerTaxRegistration(quotation);
  
  // Focal Point details - RIGHT SIDE
  const focalPointName = getFocalPointName(quotation);
  const focalPointPhone = getFocalPointPhone(quotation);
  const focalPointEmail = getFocalPointEmail(quotation);
  const focalPointDesignation = getFocalPointDesignation(quotation);
  const companyTradeLicense = getCompanyTradeLicense(quotation);
  const companyTaxRegistration = getCompanyTaxRegistration(quotation);
  
  // Dates
  const date = quotation.date || new Date().toISOString().split('T')[0];
  const expiryDate = quotation.expiryDate || '';
  
  // Project and reference fields
  const projectName = quotation.projectName || '';
  const scopeOfWork = getScopeOfWork(quotation);
   const tl = quotation.tl || '';
  const trn = quotation.trn || '';
  const ourRef = quotation.ourRef || '';
  const ourContact = quotation.ourContact || '';
  const salesManagerEmail = quotation.salesManagerEmail || '';
  const paymentTerms = quotation.paymentTerms || '';
  const deliveryTerms = quotation.deliveryTerms || '';
  const notes = quotation.notes || '';
  
  // Terms and Conditions
  let termsAndConditions = quotation.termsAndConditions || '';
  if (!termsAndConditions && quotation.tcSections && quotation.tcSections.length > 0) {
    termsAndConditions = quotation.tcSections
      .map(sec => {
        let text = "";
        if (sec.heading?.trim()) text += sec.heading + "\n\n";
        if (sec.content?.trim()) text += sec.content;
        return text.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }
  
  let termsImages = quotation.termsImages || [];
  if (termsImages.length === 0 && quotation.tcSections && quotation.tcSections[0]?.images) {
    termsImages = quotation.tcSections[0].images;
  }
  
  const quotationNumber = quotation.quotationNumber || '';
  const currency = quotation.currency?.code || 'AED';
  const companySnapshot = quotation.companySnapshot || null;

  const createdByName = quotation.createdBy?.name || quotation.createdBySnapshot?.name || '—';
  const createdByEmail = quotation.createdBy?.email || quotation.createdBySnapshot?.email || '';
  const createdByRole = quotation.createdBy?.role || quotation.createdBySnapshot?.role || 'user';
  
  const opsReviewedByName = quotation.opsApprovedBySnapshot?.name || '—';
  const opsReviewedByEmail = quotation.opsApprovedBySnapshot?.email || '';
  const opsReviewedAt = quotation.opsApprovedBySnapshot?.approvedAt ? fmtDate(quotation.opsApprovedBySnapshot.approvedAt) : '—';
  
  const approvedByName = quotation.approvedBy?.name || '—';
  const approvedByEmail = quotation.approvedBy?.email || '';
  const approvedAt = quotation.approvedAt ? fmtDate(quotation.approvedAt) : '—';

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
  const subtotal = itemsWithImages.reduce(
    (s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0)),
    0
  );
  
  const tax = Number(taxPercent) || 0;
  const discount = Number(discountPercent) || 0;
  
  const discAmt = (subtotal * discount) / 100;
  const subtotalAfterDiscount = subtotal - discAmt;
  const taxAmt = (subtotalAfterDiscount * tax) / 100;
  const grandTotal = subtotalAfterDiscount + taxAmt;
  
  const roundedTotal = Number(grandTotal.toFixed(2));
  const amountInWords = numberToWords(roundedTotal);

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
        ${item.description ? `<div style="font-size:11px;margin-top:3px;line-height:1.3;">${item.description}</div>` : ''}
        ${imgs.length ? `<div style="margin-top:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
          ${imgs.map(src => `<div style="width:100%;height:150px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;">
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
  let totalsRows = '';
  if (exportType === 'with_total') {
    totalsRows = `
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
      <tr style="background:#0C405A;color:white;font-weight:700;">
        <td colspan="3" style="border:none;padding:8px;"></td>
        <td style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (${currency})</td>
        <td style="text-align:right;padding:12px 8px;font-size:12px;">${roundedTotal.toFixed(2)}</td>
      </tr>`;
  }

  // Table header
  const thead = `<thead><tr style="background:#0C405A;">
  <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:40px;">SR#</th>
  <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;">Item Description</th>
  <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:50px;">Qty</th>
  <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:70px;">Unit Price</th>
  <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:80px;">Amount</th>
 </tr></thead>`;

  const termsImagesHTML = buildTermsImagesHTML(termsImages);
  const formattedTermsText = formatTermsText(termsAndConditions);

  // Company footer
  const companyInfo = companySnapshot;
  const isCreatorAdmin = createdByRole === 'admin';
  const showReviewedBy = !isCreatorAdmin;

  const companyFooter = `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
      <div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div>
      <div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">${companyInfo?.name || 'Mega Repairing Machinery Equipment LLC'}</div>
    </div>
    
    <!-- Approval Chain Section -->
    <div style="margin-top:12px;padding-top:16px;">
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Prepared By (Requested)</th>
            ${showReviewedBy ? `
              <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Reviewed By</th>
            ` : ''}
            <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Approved By</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 6px;vertical-align:top;">
              <div style="font-weight:600;color:#0f172a;">${createdByName}</div>
              <div style="font-size:9px;color:#64748b;">${createdByEmail}</div>
              <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Role: ${createdByRole}</div>
            </td>
            ${showReviewedBy ? `
              <td style="padding:8px 6px;vertical-align:top;">
                ${opsReviewedByName !== '—' ? `
                  <div style="font-weight:600;color:#0f172a;">${opsReviewedByName}</div>
                  <div style="font-size:9px;color:#64748b;">${opsReviewedByEmail}</div>
                  <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Date: ${opsReviewedAt}</div>
                ` : `
                  <div style="color:#94a3b8;font-style:italic;">Not reviewed yet</div>
                `}
              </td>
            ` : ''}
            <td style="padding:8px 6px;vertical-align:top;">
              ${approvedByName !== '—' ? `
                <div style="font-weight:600;color:#0f172a;">${approvedByName}</div>
                <div style="font-size:9px;color:#64748b;">${approvedByEmail}</div>
                <div style="font-size:8px;color:#94a3b8;margin-top:2px;">Date: ${approvedAt}</div>
              ` : `
                <div style="color:#94a3b8;font-style:italic;">Not approved yet</div>
              `}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

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
    .terms-content{white-space:pre-wrap;font-size:10px;color:#4b5563;line-height:1.5; text-indent: 0;margin: 0;padding: 0;}
  </style>
</head>
<body>
  <div class="container">
    <!-- Header Image -->
    <div style="width:100%;height:140px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;">
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

    <!-- Details Grid - LEFT SIDE (Customer Info) & RIGHT SIDE (Company/Focal Point Info) -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
      <!-- LEFT COLUMN - Customer Details -->
      <div style="display:grid;grid-template-columns:140px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Project Name</span><span>:</span><span>${projectName || "N/A"}</span>
        ${scopeOfWork ? `<span style="font-weight:600;color:#4b5563;">Scope of Work</span><span>:</span><span>${scopeOfWork}</span>` : ''}
        <span style="font-weight:600;color:#4b5563;">Company Name</span><span>:</span><span>${customerName}</span>
        <span style="font-weight:600;color:#4b5563;">Name</span><span>:</span><span>${customerContactName}</span>
        <span style="font-weight:600;color:#4b5563;">Phone</span><span>:</span><span>${customerPhone || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Email</span><span>:</span><span>${customerEmail || "N/A"}</span>
        ${customerDesignation ? `<span style="font-weight:600;color:#4b5563;">Designation</span><span>:</span><span>${customerDesignation}</span>` : ''}
        ${customerTradeLicense ? `<span style="font-weight:600;color:#4b5563;">Trade License No.</span><span>:</span><span>${customerTradeLicense}</span>` : ''}
        ${customerTaxRegistration ? `<span style="font-weight:600;color:#4b5563;">Tax Registration No.</span><span>:</span><span>${customerTaxRegistration}</span>` : ''}
       </div>
      
      <!-- RIGHT COLUMN - Focal Point / Company Details -->
      <div style="display:grid;grid-template-columns:140px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Name</span><span>:</span><span>${focalPointName}</span>
        <span style="font-weight:600;color:#4b5563;">Phone</span><span>:</span><span>${focalPointPhone || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Email</span><span>:</span><span>${focalPointEmail || "N/A"}</span>
        ${focalPointDesignation ? `<span style="font-weight:600;color:#4b5563;">Designation</span><span>:</span><span>${focalPointDesignation}</span>` : ''}
        <span style="font-weight:600;color:#4b5563;">Trade License No.</span><span>:</span><span>${companyTradeLicense || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Tax Registration No.</span><span>:</span><span>${companyTaxRegistration || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Date</span><span>:</span><span>${fmtDate(date)}</span>
        <span style="font-weight:600;color:#4b5563;">Expiry Date</span><span>:</span><span>${fmtDate(expiryDate)}</span>
        ${ourRef ? `<span style="font-weight:600;color:#4b5563;">Our Ref</span><span>:</span><span>${ourRef}</span>` : ''}
        ${paymentTerms ? `<span style="font-weight:600;color:#4b5563;">Payment Terms</span><span>:</span><span>${paymentTerms}</span>` : ''}
        ${deliveryTerms ? `<span style="font-weight:600;color:#4b5563;">Delivery Terms</span><span>:</span><span>${deliveryTerms}</span>` : ''}
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
    ${exportType === 'with_total' ? `
      <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:11px;font-weight:600;">
        <strong>Amount in words:</strong> ${amountInWords}
      </div>
    ` : ''}

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
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;color:#0f172a;">Terms & Conditions</h3>
        <div style="padding:12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
          <div class="terms-content" style="white-space:pre-wrap;font-size:10px;color:#4b5563;line-height:1.6;margin:0;padding:0;">
            ${formattedTermsText}
          </div>
          ${termsImagesHTML}
        </div>
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