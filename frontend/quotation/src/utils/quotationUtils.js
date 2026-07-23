import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE_MB } from './constants';
import { formatFileSize } from './formatters';

export const FileType = { IMAGE: 'image', PDF: 'pdf', EXCEL: 'excel', CSV: 'csv', WORD: 'word', UNKNOWN: 'unknown' };

export const getFileType = (file) => {
  const mime = file.fileType || '';
  const name = file.fileName || '';
  if (mime.startsWith('image/')) return FileType.IMAGE;
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return FileType.PDF;
  if (mime.includes('spreadsheet') || mime.includes('excel') || name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls')) return FileType.EXCEL;
  if (mime === 'text/csv' || mime === 'application/csv' || name.toLowerCase().endsWith('.csv')) return FileType.CSV;
  if (mime.includes('word') || mime.includes('document') || name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc')) return FileType.WORD;
  return FileType.UNKNOWN;
};

export const getFileIcon = (file) => {
  const type = getFileType(file);
  const icons = { [FileType.IMAGE]: '🖼️', [FileType.PDF]: '📄', [FileType.EXCEL]: '📊', [FileType.CSV]: '📋', [FileType.WORD]: '📝' };
  return icons[type] || '📎';
};

export const getFileBadge = (type) => {
  const badges = {
    [FileType.IMAGE]: { bg: '#f5f3ff', color: '#6d28d9', text: 'Image' },
    [FileType.PDF]: { bg: '#fee2e2', color: '#b91c1c', text: 'PDF' },
    [FileType.EXCEL]: { bg: '#d1fae5', color: '#065f46', text: 'Excel' },
    [FileType.CSV]: { bg: '#fef3c7', color: '#92400e', text: 'CSV' },
    [FileType.WORD]: { bg: '#dbeafe', color: '#1e40af', text: 'Word' }
  };
  return badges[type] || { bg: '#f3f4f6', color: '#4b5563', text: 'File' };
};

export const validateFile = (file) => {
  if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) return { valid: false, error: `File exceeds ${MAX_DOCUMENT_SIZE_MB}MB limit` };
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) return { valid: false, error: `File type not allowed` };
  return { valid: true };
};

export const btnStyle = (bg, disabled = false) => ({
  backgroundColor: disabled ? "#d1d5db" : bg,
  color: disabled ? "#9ca3af" : "white",
  padding: "0.55rem 0.9rem",
  borderRadius: "0.5rem",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "0.8125rem",
  fontWeight: "600",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
});

// Neutral/secondary action button — white with a subtle border, for actions
// that don't need to compete visually with the primary/destructive ones
// (e.g. Download PDF, Duplicate, Dashboard). Pair with onMouseEnter/Leave
// to toggle between the base/hover style objects below, matching the
// inline-hover-handler pattern already used elsewhere in this app (see
// QuotationLayout.jsx's pdfOptionButton).
export const outlineBtnStyle = (disabled = false) => ({
  backgroundColor: "#fff",
  color: disabled ? "#9ca3af" : "#374151",
  padding: "0.55rem 0.9rem",
  borderRadius: "0.5rem",
  border: `1px solid ${disabled ? "#e5e7eb" : "#d1d5db"}`,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "0.8125rem",
  fontWeight: "600",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
});

export const outlineBtnHoverStyle = {
  backgroundColor: "#f8fafc",
  borderColor: "#9ca3af",
};

export const parseQuotationData = (q) => ({
  projectName: q.projectName || "",
  currencyCode: q.currency?.code || "",
  customer: q.customer || q.customerId?.name || "",
  contact: q.contact || "",
  date: q.date?.split("T")[0] || new Date().toISOString().split("T")[0],
  expiryDate: q.expiryDate?.split("T")[0] || "",
  ourRef: q.ourRef || "",
  ourContact: q.ourContact || "",
  salesManagerEmail: q.salesManagerEmail || "",
  paymentTerms: q.paymentTerms || "",
  deliveryTerms: q.deliveryTerms || "",
  tl: q.tl || "",
  trn: q.trn || "",
  tax: q.taxPercent || 0,
  discount: q.discountPercent || 0,
  notes: q.notes || "",
  termsAndConditions: q.termsAndConditions || "",
});

export const parseQuotationItems = (items) => (items || []).map((item) => ({
  id: item._id || `${Date.now()}-${Math.random()}`,
  itemId: item.itemId?._id || item.itemId || null,
  name: item.itemId?.name || item.name || "",
  description: item.description || item.itemId?.description || "",
  quantity: Number(item.quantity) || 1,
  unit: item.unit || "",
  unitPrice: Number(item.unitPrice) || 0,
  imagePaths: item.imagePaths || [],
  imageS3Keys: item.imageS3Keys || [],
  storageProvider: item.storageProvider || 'cloudinary',
}));

export const parseInternalDocuments = (docs) => (docs || []).map((doc) => ({ ...doc, id: doc._id }));

export const validatePhoneNumber = (value) => {
  // Allow empty string (optional field)
  if (!value) return { isValid: true, error: null };
  
  // Check if contains any letters (a-z, A-Z)
  const hasLetters = /[a-zA-Z]/.test(value);
  if (hasLetters) {
    return { isValid: false, error: "Phone number cannot contain letters" };
  }
  
  // Allow: numbers, spaces, +, -, (, ), .
  const phoneRegex = /^[0-9\s\+\-\(\)\.]+$/;
  if (!phoneRegex.test(value)) {
    return { isValid: false, error: "Phone number contains invalid characters" };
  }
  
  return { isValid: true, error: null };
};