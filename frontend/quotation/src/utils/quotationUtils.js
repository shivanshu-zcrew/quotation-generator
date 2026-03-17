// File type constants and helpers
export const FileType = {
    IMAGE: 'image',
    PDF: 'pdf',
    EXCEL: 'excel',
    CSV: 'csv',
    WORD: 'word',
    UNKNOWN: 'unknown'
  };
  
  export const BASE_URL = "http://localhost:4000";
  export const ITEMS_PER_FIRST_PAGE = 8;
  export const MAX_DOCUMENT_SIZE_MB = 10;
  
  export const ALLOWED_DOCUMENT_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
  ];
  
  // Number to words conversion (AED)
  export const numberToWords = (num) => {
    if (!num || num === 0) return "Zero Dirhams Only";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const thou = ["", "Thousand", "Lakh", "Crore"];
  
    const lt1000 = (n) => {
      if (!n) return "";
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + lt1000(n % 100) : "");
    };
  
    const convertIndian = (n) => {
      let res = "", i = 0;
      while (n > 0) {
        if (n % 1000) res = lt1000(n % 1000) + (thou[i] ? " " + thou[i] + " " : "") + res;
        n = Math.floor(n / 1000); i++;
      }
      return res.trim() + " Dirhams Only";
    };
  
    const dirhams = Math.floor(num);
    const fils = Math.round((num - dirhams) * 100);
    let result = convertIndian(dirhams);
    if (fils > 0) result = result.replace("Dirhams Only", `Dirhams and ${lt1000(fils)} Fils Only`);
    return result;
  };
  
  // Image to base64 converter
  export const imageToBase64 = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      if (src.startsWith("data:")) return resolve(src);
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  
  // File size formatter
  export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Get file type from mime/name
  export const getFileType = (file) => {
    const mime = file.fileType || '';
    const name = file.fileName || '';
  
    if (mime.startsWith('image/')) return FileType.IMAGE;
    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return FileType.PDF;
    if (mime.includes('spreadsheet') || mime.includes('excel') || 
        name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls')) return FileType.EXCEL;
    if (mime === 'text/csv' || mime === 'application/csv' || name.toLowerCase().endsWith('.csv')) return FileType.CSV;
    if (mime.includes('word') || mime.includes('document') || 
        name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc')) return FileType.WORD;
    
    return FileType.UNKNOWN;
  };
  
  // Get file icon
  export const getFileIcon = (file) => {
    const type = getFileType(file);
    switch (type) {
      case FileType.IMAGE: return '🖼️';
      case FileType.PDF: return '📄';
      case FileType.EXCEL: return '📊';
      case FileType.CSV: return '📋';
      case FileType.WORD: return '📝';
      default: return '📎';
    }
  };
  
  // Get file badge style
  export const getFileBadge = (type) => {
    switch (type) {
      case FileType.IMAGE: return { bg: '#f5f3ff', color: '#6d28d9', text: 'Image' };
      case FileType.PDF: return { bg: '#fee2e2', color: '#b91c1c', text: 'PDF' };
      case FileType.EXCEL: return { bg: '#d1fae5', color: '#065f46', text: 'Excel' };
      case FileType.CSV: return { bg: '#fef3c7', color: '#92400e', text: 'CSV' };
      case FileType.WORD: return { bg: '#dbeafe', color: '#1e40af', text: 'Word' };
      default: return { bg: '#f3f4f6', color: '#4b5563', text: 'File' };
    }
  };
  
  // Button style helper
  export const btnStyle = (bg, disabled = false) => ({
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
  
  // Parse quotation data
  export const parseQuotationData = (q) => ({
    projectName: q.projectName || "",  
    customer: q.customer || q.customerId?.name || "",
    contact: q.contact || "",
    date: q.date?.split("T")[0] || new Date().toISOString().split("T")[0],
    expiryDate: q.expiryDate?.split("T")[0] || "",
    ourRef: q.ourRef || "",
    ourContact: q.ourContact || "",
    salesOffice: q.salesOffice || "",
    paymentTerms: q.paymentTerms || "",
    deliveryTerms: q.deliveryTerms || "",
    tl: q.tl || "",  
    trn: q.trn || "",   
    tax: q.tax || 0,
    discount: q.discount || 0,
    notes: q.notes || "",
    termsAndConditions: q.termsAndConditions || "",
    termsImage: q.termsImage || null,
});
  // Parse quotation items
  export const parseQuotationItems = (items) =>
    (items || []).map((item) => ({
      id: item._id || `${Date.now()}-${Math.random()}`,
      itemId: item.itemId?._id || item.itemId || null,
      name: item.itemId?.name || item.name || "",
      description: item.description || item.itemId?.description || "",
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      imagePaths: item.imagePaths || [],
    }));
  
  // Parse internal documents
  export const parseInternalDocuments = (docs) =>
    (docs || []).map((doc) => ({
      ...doc,
      id: doc._id,
    }));
  
  // Validate file before upload
  export const validateFile = (file) => {
    if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) {
      return { valid: false, error: `File "${file.name}" exceeds ${MAX_DOCUMENT_SIZE_MB}MB limit` };
    }
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      return { valid: false, error: `File "${file.name}" type is not allowed` };
    }
    return { valid: true };
  };