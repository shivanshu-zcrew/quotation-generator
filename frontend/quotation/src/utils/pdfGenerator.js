import { imageToBase64 } from './imageUtils';
import { numberToWords } from './numberToWords';
import { fmtDate } from './formatters';
import headerImage from '../assets/header.png';
import { quotationAPI } from '../services/api';
import { sanitizeTermsHtml, protectHyphenatedWords, preserveRepeatedSpaces, normalizeNonBreakingSpaces } from './sanitizeTermsHtml';

import { ITEMS_PER_FIRST_PAGE, BASE_URL } from './constants';

/**
 * Escapes a value for safe interpolation into the PDF/print HTML template.
 * Almost every field below (customer/contact details, project name, item
 * descriptions, payment terms, notes, approval-chain names…) is free-text
 * user input. This template is rendered two ways that both execute HTML:
 * server-side in Puppeteer (generatePDF) and client-side via document.write
 * in an iframe (printQuotation) — an unescaped "<script>" or "<img onerror>"
 * in any of these fields would run in the *viewing* user's browser on
 * Print, or reach Puppeteer's page (which still allows <img> network
 * requests) on PDF export. Only the Terms & Conditions field is meant to
 * contain real HTML — that one goes through sanitizeTermsHtml separately
 * and must NOT be passed through this.
 */
const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

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
 * Safely extract the manually-entered contact person name (optional)
 */
const getCustomerContactName = (quotation) => {
  if (quotation.customerName) return quotation.customerName;
  if (quotation.customerSnapshot?.contactPerson) return quotation.customerSnapshot.contactPerson;
  return '';
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
 * Generate a unique hash for an image source to detect duplicates
 */
const generateImageHash = (source) => {
  if (!source) return null;
  if (typeof source === 'string') {
    if (source.startsWith('data:image')) {
      return source.substring(0, 200);
    }
    return source;
  }
  return String(source);
};

/**
 * Process item images with duplicate prevention
 */
const processItemImages = async (item, newImages = {}) => {
  const imageSources = [];
  const imageSet = new Set();
  
  const addImageIfUnique = (source, sourceType) => {
    if (!source) return false;
    const hash = generateImageHash(source);
    if (!imageSet.has(hash)) {
      imageSet.add(hash);
      imageSources.push(source);
      return true;
    }
    return false;
  };
  
  // Add Cloudinary images
  if (item.imagePaths && Array.isArray(item.imagePaths)) {
    for (const imgPath of item.imagePaths) {
      addImageIfUnique(imgPath, 'Cloudinary');
    }
  }
  
  // Add new images from editing
  if (newImages[item.id] && Array.isArray(newImages[item.id])) {
    for (const newImg of newImages[item.id]) {
      addImageIfUnique(newImg, 'New base64');
    }
  }
  
  // Add S3 images
  if (item.imageS3Keys && Array.isArray(item.imageS3Keys) && item.imageS3Keys.length > 0) {
    try {
      const response = await quotationAPI.getBatchSignedUrls(item.imageS3Keys);
      let urls = [];
      if (response.data?.urls) {
        urls = Object.values(response.data.urls);
      } else if (response.urls) {
        urls = Object.values(response.urls);
      }
      
      for (const url of urls) {
        addImageIfUnique(url, 'S3');
      }
    } catch (error) {
      console.error(`Failed to get S3 URLs:`, error);
    }
  }
  
  // Convert to base64
  const base64Images = await Promise.all(
    imageSources.map(async (source) => {
      try {
        return await imageToBase64(source);
      } catch (err) {
        console.error(`Failed to convert image:`, err.message);
        return null;
      }
    })
  );
  
  const validBase64 = base64Images.filter(Boolean);
  
  const { description } = getItemDetails(item);
  
  return { 
    ...item, 
    _b64Images: validBase64,
    description,
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0
  };
};

/**
 * Build HTML for terms images gallery - Fixed version
 */
const buildTermsImagesHTML = async (termsImages = []) => {
  if (!termsImages || termsImages.length === 0) {
    return '';
  }
  
  console.log('📷 Building terms images HTML, count:', termsImages.length);
  
  // Deduplicate terms images
  const uniqueImagesMap = new Map();
  
  for (const img of termsImages) {
    if (!img) continue;
    
    // Get unique key from various possible fields
    let key = null;
    if (img.s3Key) key = img.s3Key;
    else if (img.url) key = img.url;
    else if (img.filePath) key = img.filePath;
    else if (img.fileUrl) key = img.fileUrl;
    else if (img._id) key = img._id;
    
    if (key && !uniqueImagesMap.has(key)) {
      uniqueImagesMap.set(key, img);
    }
  }
  
  const uniqueImages = Array.from(uniqueImagesMap.values());
  console.log('📷 Unique terms images:', uniqueImages.length);
  
  // Process images to get URLs
  const processedImages = [];
  
  for (const img of uniqueImages) {
    let imageUrl = null;
    
    if (img.url) {
      imageUrl = img.url;
    } 
    else if (img.s3Key) {
      try {
        const response = await quotationAPI.getSignedUrl(img.s3Key);
        imageUrl = response.data?.url || response.url;
      } catch (error) {
        console.error('Error fetching terms image S3 URL:', error);
      }
    }
    else if (img.filePath) {
      imageUrl = img.filePath;
    }
    else if (img.fileUrl) {
      imageUrl = img.fileUrl;
    }
    else if (img.base64) {
      imageUrl = img.base64;
    }
    
    if (imageUrl) {
      processedImages.push({ ...img, url: imageUrl });
    }
  }
  
  if (processedImages.length === 0) {
    return '';
  }
  
  // Convert to base64
  const imagesWithBase64 = [];
  
  for (const img of processedImages) {
    try {
      const base64Url = await imageToBase64(img.url);
      if (base64Url) {
        imagesWithBase64.push({ ...img, base64: base64Url });
      }
    } catch (error) {
      console.error('Failed to convert terms image to base64:', error);
    }
  }
  
  if (imagesWithBase64.length === 0) {
    return '';
  }
  
  // Build HTML with 2 images per row
  let imagesHTML = '<div style="margin-top:16px;">';
  imagesHTML += '<div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:16px;">';
  
  for (const img of imagesWithBase64) {
    imagesHTML += `
      <div style="text-align:center;">
        <img src="${img.base64}" style="width:100%;height:180px;border-radius:4px;object-fit:cover;" />
       </div>
    `;
  }
  
  imagesHTML += '</div></div>';
  return imagesHTML;
};

/**
 * Format terms and conditions text with proper line breaks
 */
const HTML_TAG_RE = /<[a-z][\s\S]*>/i;

const formatTermsText = (text) => {
  if (!text) return '';

  // Real HTML (from the Quill terms editor, or old wrapper-div HTML) is
  // sanitized and passed through as-is; legacy plain text still gets the
  // \n -> <br> treatment it always got.
  if (HTML_TAG_RE.test(text)) {
    return sanitizeTermsHtml(text);
  }

  let cleaned = text;

  if (cleaned.startsWith('\n')) {
    cleaned = cleaned.replace(/^\n+/, '');
  }

  if (cleaned.endsWith('\n')) {
    cleaned = cleaned.replace(/\n+$/, '');
  }

  // Wrap each line in its own <p> instead of joining them flat with <br>.
  // That gives legacy plain-text terms the same per-line block structure
  // modern Quill HTML already has, so the same CSS applies to both: a
  // wrapped (long) line hang-indents under its own first line instead of
  // restarting at the margin, and each line wraps under normal whitespace
  // rules instead of staying one big white-space:pre-wrap blob (which — at
  // the exact point a line fills the container — can break a word mid-way
  // instead of carrying it whole to the next line).
  return cleaned
    .split('\n')
    .map((line) => `<p>${line.trim() === '' ? '<br>' : protectHyphenatedWords(preserveRepeatedSpaces(normalizeNonBreakingSpaces(line)))}</p>`)
    .join('');
};

/**
 * Build HTML for PDF generation
 */
export const buildPDFHTML = async (quotation, options = {}) => {
  const { newImages = {}, exportType = 'with_total' } = options;
  
  // Extract basic fields with fallbacks
  const items = quotation.items || [];
  const taxPercent = quotation.taxPercent || quotation.tax || 0;
  const discountPercent = quotation.discountPercent || quotation.discount || 0;
  
  // Customer details - LEFT SIDE
  const customerName = escapeHtml(getCustomerName(quotation));
  const customerContactName = escapeHtml(getCustomerContactName(quotation));
  const customerEmail = escapeHtml(getCustomerEmail(quotation));
  const customerPhone = escapeHtml(getCustomerPhone(quotation));
  const customerDesignation = escapeHtml(getCustomerDesignation(quotation));
  const customerTradeLicense = escapeHtml(getCustomerTradeLicense(quotation));
  const customerTaxRegistration = escapeHtml(getCustomerTaxRegistration(quotation));

  // Focal Point details - RIGHT SIDE
  const focalPointName = escapeHtml(getFocalPointName(quotation));
  const focalPointPhone = escapeHtml(getFocalPointPhone(quotation));
  const focalPointEmail = escapeHtml(getFocalPointEmail(quotation));
  const focalPointDesignation = escapeHtml(getFocalPointDesignation(quotation));
  const companyTradeLicense = escapeHtml(getCompanyTradeLicense(quotation));
  const companyTaxRegistration = escapeHtml(getCompanyTaxRegistration(quotation));

  // Dates
  const date = quotation.date || new Date().toISOString().split('T')[0];
  const expiryDate = quotation.expiryDate || '';

  // Project and reference fields
  const projectName = escapeHtml(quotation.projectName || '');
  const scopeOfWork = escapeHtml(getScopeOfWork(quotation));
  const tl = quotation.tl || '';
  const trn = quotation.trn || '';
  const ourRef = escapeHtml(quotation.ourRef || '');
  const ourContact = quotation.ourContact || '';
  const salesManagerEmail = quotation.salesManagerEmail || '';
  const paymentTerms = escapeHtml(quotation.paymentTerms || '');
  const deliveryTerms = escapeHtml(quotation.deliveryTerms || '');
  const notes = escapeHtml(quotation.notes || '');
  
  // Terms and Conditions
  let termsAndConditions = quotation.termsAndConditions || '';
  let termsImages = [];
  
  // Extract terms images from multiple possible locations
  if (quotation.termsImages && Array.isArray(quotation.termsImages) && quotation.termsImages.length > 0) {
    termsImages = quotation.termsImages;
  } 
  else if (quotation.tcSections && quotation.tcSections.length > 0) {
    for (const section of quotation.tcSections) {
      if (section.images && Array.isArray(section.images) && section.images.length > 0) {
        termsImages.push(...section.images);
      }
      if (section.content && !termsAndConditions) {
        termsAndConditions = section.content;
      }
    }
  }
  
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
  
  const quotationNumber = escapeHtml(quotation.quotationNumber || '');
  const currency = escapeHtml(quotation.currency?.code || 'AED');
  const companySnapshot = quotation.companySnapshot || null;

  // Falls back to a title-cased role (e.g. "ops_manager" -> "Ops Manager")
  // when the user hasn't set a designation, so the footer never shows blank.
  const roleLabel = (role) => (role ? String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

  const createdByName = escapeHtml(quotation.createdBy?.name || quotation.createdBySnapshot?.name || '—');
  const createdByEmail = escapeHtml(quotation.createdBy?.email || quotation.createdBySnapshot?.email || '');
  const createdByRole = quotation.createdBy?.role || quotation.createdBySnapshot?.role || 'user';
  const createdByDesignation = escapeHtml(quotation.createdBy?.designation || roleLabel(createdByRole));

  const opsReviewedByName = escapeHtml(quotation.opsApprovedBySnapshot?.name || '—');
  const opsReviewedByEmail = escapeHtml(quotation.opsApprovedBySnapshot?.email || '');
  const opsReviewedAt = quotation.opsApprovedBySnapshot?.approvedAt ? fmtDate(quotation.opsApprovedBySnapshot.approvedAt) : '—';
  const opsReviewedByDesignation = escapeHtml(quotation.opsApprovedBy?.designation || roleLabel(quotation.opsApprovedBySnapshot?.role) || 'Operations Manager');

  const approvedByName = escapeHtml(quotation.approvedBy?.name || '—');
  const approvedByEmail = escapeHtml(quotation.approvedBy?.email || '');
  const approvedAt = quotation.approvedAt ? fmtDate(quotation.approvedAt) : '—';
  const approvedByDesignation = escapeHtml(quotation.approvedBy?.designation || 'Admin');

  // Convert header image to base64
  const headerBase64 = await imageToBase64(headerImage);
  
  // Process items with duplicate prevention
  const itemsWithImages = await Promise.all(
    items.map(async (item) => {
      return await processItemImages(item, newImages);
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

  // Render row function - with 2 images per row
  const renderRow = (item, index) => {
    const imgs = item._b64Images || [];
    // Remove duplicates in final render
    const uniqueImgs = [...new Set(imgs)];
    
    // Split images into rows of 2
    const imageRows = [];
    for (let i = 0; i < uniqueImgs.length; i += 2) {
      imageRows.push(uniqueImgs.slice(i, i + 2));
    }
    
    return `<tr>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">${index + 1}</td>
      <td style="padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">
        ${item.description ? `<div style="font-size:10px;line-height:1.4;color:#4b5563;margin-bottom:8px;white-space:pre-wrap;">${protectHyphenatedWords(escapeHtml(item.description))}</div>` : ''}
        ${imageRows.map(row => `
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-top:8px;">
            ${row.map(src => `
              <div style="width:100%;height:180px;border:1px solid #d1d5db;border-radius:4px;overflow:hidden;background:#f9fafb;">
                <img src="${src}" style="width:100%;height:100%;object-fit:cover;" />
              </div>
            `).join('')}
            ${row.length === 1 ? '<div style="width:100%;"></div>' : ''}
          </div>
        `).join('')}
      </td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">${item.quantity}</td>
      <td style="text-align:center;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">${escapeHtml(item.unit || '-')}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">${item.unitPrice.toFixed(2)}</td>
      <td style="text-align:right;font-weight:600;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top;">${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>`;
  };

  // Totals rows
  let totalsRows = '';
  if (exportType === 'with_total') {
    totalsRows = `
      <tr style="background:#f8fafc;font-weight:600;">
        <td colspan="2" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td colspan="3" style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">Subtotal (${currency})</td>
        <td style="text-align:right;padding:10px 8px;border:1px solid #e5e7eb;font-size:10px;">${subtotal.toFixed(2)}</td>
      </tr>
      ${taxPercent > 0 ? `
      <tr style="background:#f8fafc;font-weight:600;">
        <td colspan="2" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td colspan="3" style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">VAT (${taxPercent}%)</td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;">${taxAmt.toFixed(2)}</td>
      </tr>
    ` : ''}
      ${discAmt > 0 ? `<tr style="background:#f8fafc;font-weight:600;">
        <td colspan="2" style="border:1px solid #e5e7eb;padding:8px;"></td>
        <td colspan="3" style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">Discount (${discountPercent}%)</td>
        <td style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-size:10px;color:#059669;">-${discAmt.toFixed(2)}</td>
      </tr>` : ''}
      <tr style="background:#0C405A;color:white;font-weight:700;">
        <td colspan="2" style="border:none;padding:8px;"></td>
        <td colspan="3" style="text-align:right;padding:12px 8px;font-size:12px;">Grand Total (${currency})</td>
        <td style="text-align:right;padding:12px 8px;font-size:12px;">${roundedTotal.toFixed(2)}</td>
      </tr>`;
  }

  // Table header
  const thead = `<thead><tr style="background:#0C405A;">
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:40px;">SR#</th>
    <th style="padding:10px 8px;text-align:left;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;">Item Description</th>
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:50px;">Qty</th>
    <th style="padding:10px 8px;text-align:center;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:50px;">Unit</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:70px;">Unit Price</th>
    <th style="padding:10px 8px;text-align:right;font-size:9px;font-weight:700;color:white;text-transform:uppercase;border:1px solid #0C405A;width:80px;">Amount</th>
  </tr></thead>`;

  const termsImagesHTML = await buildTermsImagesHTML(termsImages);
  const formattedTermsText = formatTermsText(termsAndConditions);

  // Company footer
  const companyInfo = companySnapshot;
  const isCreatorAdmin = createdByRole === 'admin';
  const showReviewedBy = !isCreatorAdmin;

  const companyFooter = `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
      <div style="font-weight:600;color:#1f2937;font-size:11px;">Sincerely,</div>
      <div style="font-weight:600;color:#1f2937;font-size:11px;margin-top:24px;">${escapeHtml(companyInfo?.name) || 'Mega Repairing Machinery Equipment LLC'}</div>
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
              <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${createdByDesignation}</div>
            </td>
            ${showReviewedBy ? `
              <td style="padding:8px 6px;vertical-align:top;">
                ${opsReviewedByName !== '—' ? `
                  <div style="font-weight:600;color:#0f172a;">${opsReviewedByName}</div>
                  <div style="font-size:9px;color:#64748b;">${opsReviewedByEmail}</div>
                  <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${opsReviewedByDesignation}</div>
                  <div style="font-size:8px;color:#94a3b8;">Date: ${opsReviewedAt}</div>
                ` : `
                  <div style="color:#94a3b8;font-style:italic;">Not reviewed yet</div>
                `}
              </td>
            ` : ''}
            <td style="padding:8px 6px;vertical-align:top;">
              ${approvedByName !== '—' ? `
                <div style="font-weight:600;color:#0f172a;">${approvedByName}</div>
                <div style="font-size:9px;color:#64748b;">${approvedByEmail}</div>
                <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${approvedByDesignation}</div>
                <div style="font-size:8px;color:#94a3b8;">Date: ${approvedAt}</div>
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
    *{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word;word-wrap:break-word;}
    body{font-family:'Segoe UI',Tahoma,sans-serif;background:white;color:#1f2937;line-height:1.6;}
    .container{width:874px;margin:0 auto;padding:10px;}
    @page{size:A4;margin:5mm;}
    thead{display:table-row-group;}
    @media print{body{margin:0;padding:0;}.page-break{page-break-before:always;}thead{display:table-row-group;}}
    .terms-content{white-space:pre-wrap;font-size:10px;color:#4b5563;line-height:1.5; text-indent: 0;margin: 0;padding: 0;}
    /* Minimal subset of Quill's own editor CSS (quill.snow.css/quill.core.css),
       reproduced here because this document is rendered in an isolated
       Puppeteer page that doesn't load that stylesheet — keeps rich-text
       terms content (headings/lists/blockquote/links) looking the same as
       the in-app editor and viewer. */
    /* Hanging indent: a paragraph's first line starts at the left edge
       (text-indent cancels the padding), but if it wraps, the continuation
       line(s) align under that first line's text instead of restarting at
       the margin — matters for manually-typed "1. ...", "2. ..." points,
       which are plain paragraphs with no real list semantics to hang off.
       Skipped for center/right/justify-aligned paragraphs: an asymmetric
       left-only padding visibly throws off centering/right-edge alignment
       on any paragraph that actually wraps, and a hanging indent has no
       meaning for those alignments anyway. */
    .terms-content p{margin:0 0 6px;white-space:normal;padding-left:1.5em;text-indent:-1.5em;}
    .terms-content p[style*="text-align: center"],.terms-content p[style*="text-align:center"],
    .terms-content p[style*="text-align: right"],.terms-content p[style*="text-align:right"],
    .terms-content p[style*="text-align: justify"],.terms-content p[style*="text-align:justify"]{padding-left:0;text-indent:0;}
    .terms-content h1,.terms-content h2,.terms-content h3,.terms-content h4,.terms-content h5,.terms-content h6{margin:10px 0 6px;font-weight:700;color:#0f172a;white-space:normal;}
    .terms-content h1{font-size:18px;} .terms-content h2{font-size:15px;} .terms-content h3{font-size:13px;}
    .terms-content h4{font-size:11px;} .terms-content h5{font-size:10px;} .terms-content h6{font-size:9px;}
    .terms-content a{color:#2563eb;text-decoration:underline;}
    .terms-content blockquote{border-left:3px solid #cbd5e1;margin:6px 0;padding:2px 0 2px 12px;color:#64748b;font-style:italic;white-space:normal;}
    /* Quill's persisted list HTML (quill.getSemanticHTML(), used for
       onChange/save) is genuine nested <ul>/<ol><li> — no data-list
       attribute or indent classes, those only exist in the live editor's
       internal DOM. Plain list-style + native nesting is all that's needed. */
    .terms-content ul,.terms-content ol{margin:4px 0;padding-left:1.5em;}
    .terms-content li{margin-bottom:2px;white-space:normal;}
    /* Quill's indent format (toolbar +1/-1) is always written as a
       ql-indent-N class (Quill has no inline-style variant for indent,
       unlike align/font/size above), so it must be reproduced here too or
       indentation set in the editor silently vanishes in the PDF. Values
       match quill.snow.css's own .ql-indent-N padding-left scale. */
    .terms-content .ql-indent-1{padding-left:3em;}
    .terms-content .ql-indent-2{padding-left:6em;}
    .terms-content .ql-indent-3{padding-left:9em;}
    .terms-content .ql-indent-4{padding-left:12em;}
    .terms-content .ql-indent-5{padding-left:15em;}
    .terms-content .ql-indent-6{padding-left:18em;}
    .terms-content .ql-indent-7{padding-left:21em;}
    .terms-content .ql-indent-8{padding-left:24em;}
    .terms-content li.ql-indent-1{padding-left:4.5em;}
    .terms-content li.ql-indent-2{padding-left:7.5em;}
    .terms-content li.ql-indent-3{padding-left:10.5em;}
    .terms-content li.ql-indent-4{padding-left:13.5em;}
    .terms-content li.ql-indent-5{padding-left:16.5em;}
    .terms-content li.ql-indent-6{padding-left:19.5em;}
    .terms-content li.ql-indent-7{padding-left:22.5em;}
    .terms-content li.ql-indent-8{padding-left:25.5em;}
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

    <!-- Details Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
      <!-- LEFT COLUMN -->
      <div style="display:grid;grid-template-columns:140px 20px 1fr;row-gap:8px;font-size:11px;">
        <span style="font-weight:600;color:#4b5563;">Project Name</span><span>:</span><span>${projectName || "N/A"}</span>
        ${scopeOfWork ? `<span style="font-weight:600;color:#4b5563;">Scope of Work</span><span>:</span><span>${scopeOfWork}</span>` : ''}
        <span style="font-weight:600;color:#4b5563;">Company Name</span><span>:</span><span>${customerName}</span>
        ${customerContactName ? `<span style="font-weight:600;color:#4b5563;">Name</span><span>:</span><span>${customerContactName}</span>` : ''}
        <span style="font-weight:600;color:#4b5563;">Phone</span><span>:</span><span>${customerPhone || "N/A"}</span>
        <span style="font-weight:600;color:#4b5563;">Email</span><span>:</span><span>${customerEmail || "N/A"}</span>
        ${customerDesignation ? `<span style="font-weight:600;color:#4b5563;">Designation</span><span>:</span><span>${customerDesignation}</span>` : ''}
        ${customerTradeLicense ? `<span style="font-weight:600;color:#4b5563;">Trade License No.</span><span>:</span><span>${customerTradeLicense}</span>` : ''}
        ${customerTaxRegistration ? `<span style="font-weight:600;color:#4b5563;">Tax Registration No.</span><span>:</span><span>${customerTaxRegistration}</span>` : ''}
      </div>
      
      <!-- RIGHT COLUMN -->
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
        <div style="padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#4b5563;font-size:10px;line-height:1.4;">${protectHyphenatedWords(notes)}</div>
      </div>
    ` : ''}

    <!-- Terms & Conditions -->
    ${termsAndConditions ? `
      <div style="margin-bottom:16px;">
        <h3 style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;color:#0f172a;">Terms & Conditions</h3>
        <div style="padding:12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
          <div class="terms-content" style="white-space:pre-wrap;font-size:10px;color:#4b5563;line-height:1.6;margin:0;padding:0;">${formattedTermsText}</div>
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