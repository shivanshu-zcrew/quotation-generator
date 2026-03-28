import axios from "axios";

/* =========================================================
   API BASE URL
   Uses Vite env variable in production, localhost in dev
========================================================= */
const API_BASE =
  import.meta.env?.VITE_API_URL || "http://13.232.90.158:5000/api";

/* =========================================================
   Axios Instance
========================================================= */
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/* =========================================================
   Request Interceptor
   Automatically attach JWT token to every request
========================================================= */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* =========================================================
   Response Interceptor
   - Logs API errors
   - Handles unauthorized access (401)
========================================================= */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API ERROR:", error.response || error.message);

    if (error.response?.status === 401) {
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  }
);

/* =========================================================
   Request Cancel Helpers
========================================================= */
export const createCancelToken = () => {
  const source = axios.CancelToken.source();
  return { token: source.token, cancel: source.cancel };
};

export const isCancel = (err) => axios.isCancel(err);

/* =========================================================
   AUTH APIs
========================================================= */
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),

  updateDetails: (data) => api.put("/auth/updatedetails", data),
  updatePassword: (data) => api.put("/auth/updatepassword", data),

  getAllUsers: () => api.get("/auth/users"),
  toggleUserStatus: (id) => api.put(`/auth/users/${id}/toggle-status`),
  changeUserRole: (id, data) => api.put(`/auth/users/${id}/role`, data),
};

/* =========================================================
   ADMIN APIs (Level-2 Approval)
========================================================= */
export const adminAPI = {
  getDashboardStats: (params) => api.get("/admin/dashboard", { params }),

  getAllQuotations: (params) => api.get("/admin/quotations", { params }),

  getPendingQuotations: (params) => api.get("/admin/quotations/pending", { params }),

  approveQuotation: (id) => api.put(`/admin/quotations/${id}/approve`),

  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/reject`, data),

  getAdminStats: (params) => api.get("/admin/dashboard", { params }),

};

/* =========================================================
   OPS MANAGER APIs (Level-1 Approval)
========================================================= */
export const opsAPI = {
  getPendingQuotations: (params) => api.get("/admin/quotations/ops-pending", { params }),

  getReviewHistory: (params) => api.get("/admin/quotations/ops-history", {
    params: { ...params, status: "ops_approved,ops_rejected" },
  }),

  approveQuotation: (id) => api.put(`/admin/quotations/${id}/ops-approve`),

  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/ops-reject`, data),
  getOpsStats: (params) => api.get("/admin/ops-dashboard", { params }),
};

/* =========================================================
   CUSTOMER APIs - UPDATED WITH GCC TAX FIELDS
========================================================= */

 
export const customerAPI = {
  /**
   * Get all customers with pagination and filters
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @param {string} params.search - Search term
   * @param {string} params.taxTreatment - Filter by tax treatment
   * @param {string} params.placeOfSupply - Filter by place of supply
   * @param {boolean} params.includeZoho - Include Zoho data
   */
  getAll: (params) => api.get("/customers", { params }),

  /**
   * Create a new customer with GCC tax fields
   * @param {Object} data - Customer data
   * @param {string} data.name - Customer name (required)
   * @param {string} data.email - Customer email (required, unique)
   * @param {string} data.phone - Customer phone
   * @param {string} data.address - Customer address
   * @param {string} data.companyName - Company name
   * @param {string} data.website - Company website
   * @param {string} data.notes - Additional notes
   * @param {string} data.taxTreatment - Tax treatment: 'gcc_vat_registered' or 'gcc_non_vat_registered'
   * @param {string} data.taxRegistrationNumber - TRN (required if VAT registered, 15 digits)
   * @param {string} data.placeOfSupply - GCC country (e.g., 'United Arab Emirates (UAE)')
   * @param {string} data.defaultCurrency - Currency code (e.g., 'AED', 'SAR', 'USD')
   */
  create: (data) => api.post("/customers", data),

  /**
   * Get customer by ID
   * @param {string} id - Customer ID
   * @param {boolean} includeZoho - Include Zoho data
   */
  getById: (id, includeZoho = true) => 
    api.get(`/customers/${id}`),

  /**
   * Update customer with GCC tax fields
   * @param {string} id - Customer ID
   * @param {Object} data - Updated customer data
   */
  update: (id, data) => api.put(`/customers/${id}`, data),

  /**
   * Delete/Deactivate customer
   * @param {string} id - Customer ID
   */
  delete: (id) => api.delete(`/customers/${id}`),

  /**
   * Search customers by name, email, or phone
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @param {number} offset - Offset for pagination
   */
  search: (query, limit = 20, offset = 0) => 
    api.get("/customers/search", { params: { query, limit, offset } }),

  syncFromZoho: () => api.post("/customers/sync-from-zoho"),
  /**
   * Get customer statistics
   * Returns: totalCustomers, activeCustomers, vatRegistered, 
   * nonVatRegistered, synced, unsynced, byPlaceOfSupply
   */
  getStats: () => api.get("/customers/stats"),

  /**
   * Get GCC countries for place of supply dropdown
   * @returns {Promise} List of GCC countries
   */
  getGccCountries: () => api.get("/customers/gcc-countries"),

  /**
   * Get available currency options
   * @returns {Promise} List of supported currencies with codes, names, symbols
   */
  getCurrencies: () => api.get("/customers/currencies"),

  /**
   * Get tax treatment options
   * @returns {Promise} List of tax treatments with labels and validation rules
   */
  getTaxTreatments: () => api.get("/customers/tax-treatments"),

  /**
   * Get tax summary report
   * @returns {Promise} Tax registration summary with breakdown by country
   */
  getTaxSummary: () => api.get("/customers/tax-summary"),

  /**
   * Sync customer with Zoho Books
   * @param {string} id - Customer ID
   */
  syncWithZoho: (id) => api.post(`/customers/${id}/sync`),

  /**
   * Get customers by tax treatment
   * @param {string} taxTreatment - 'gcc_vat_registered' or 'gcc_non_vat_registered'
   * @param {Object} params - Additional filters
   */
  getByTaxTreatment: (taxTreatment, params = {}) => 
    api.get("/customers", { params: { ...params, taxTreatment } }),

  /**
   * Get customers by place of supply (GCC country)
   * @param {string} placeOfSupply - GCC country name
   * @param {Object} params - Additional filters
   */
  getByPlaceOfSupply: (placeOfSupply, params = {}) => 
    api.get("/customers", { params: { ...params, placeOfSupply } }),

  /**
   * Bulk import customers with tax fields
   * @param {Array} customers - Array of customer objects
   */
  bulkImport: (customers) => api.post("/customers/bulk", { customers }),

  /**
   * Export customers with tax information
   * @param {Object} params - Filter parameters
   * @param {string} format - Export format ('csv' or 'excel')
   */
  export: (params, format = 'csv') => 
    api.get("/customers/export", { 
      params: { ...params, format },
      responseType: 'blob'
    }),
};

/* =========================================================
   ITEM APIs
========================================================= */
export const itemAPI = {
  getAll: (params) => api.get("/items", { params }),

  create: (formData) =>
    api.post("/items", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getById: (id) => api.get(`/items/${id}`),

  update: (id, formData) =>
    api.put(`/items/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  delete: (id) => api.delete(`/items/${id}`),

  syncItems: () => api.get("/items/sync/items"),
  
  getSyncStatus: () => api.get("/items/sync/status"),
 
  getAllWithRefresh: (params, forceRefresh = false) => 
    api.get("/items", { 
      params: { ...params, forceRefresh: forceRefresh ? 'true' : 'false' }
    }),
  
};

/* =========================================================
   COMPANY APIs (Updated for database storage)
========================================================= */
export const companyAPI = {
  // Get all companies from database
  getAll: (params) => api.get("/companies", { params }),
  
  // Get company by ID
  getById: (id) => api.get(`/companies/${id}`),
  
  // Get company by code
  getByCode: (code) => api.get(`/companies/code/${code}`),
  
  // Get company statistics
  getStats: (id, params) => api.get(`/companies/${id}/stats`, { params }),
  
  // Get company currencies
  getCurrencies: (id) => api.get(`/companies/${id}/currencies`),
  
  // Admin: Create company
  create: (data) => api.post("/companies", data),
  
  // Admin: Update company
  update: (id, data) => api.put(`/companies/${id}`, data),
  
  // Admin: Delete company
  delete: (id) => api.delete(`/companies/${id}`),
  
  // Admin: Toggle company status
  toggleStatus: (id) => api.patch(`/companies/${id}/toggle-status`),
  
  // Admin: Bulk import companies
  bulkImport: (data) => api.post("/companies/bulk", data),
};

/* =========================================================
   EXCHANGE RATE APIs
========================================================= */
export const exchangeRateAPI = {
  getRates: (params) => api.get("/exchange-rates/rates", { params }),
  convert: (data) => api.post("/exchange-rates/convert", data),
  getHistory: (params) => api.get("/exchange-rates/history", { params }),
  getSupported: () => api.get("/exchange-rates/supported"),
  refreshRates: () => api.post("/exchange-rates/refresh"),
  getStatus: () => api.get("/exchange-rates/status"),
};

/* =========================================================
   DOCUMENT APIs (New - Internal Documents)
========================================================= */
export const documentAPI = {
  /**
   * Upload internal documents to a quotation
   * @param {string} quotationId - The quotation ID
   * @param {File[]} files - Array of file objects
   * @param {string[]} descriptions - Optional descriptions for each file
   */
  upload: (quotationId, files, descriptions = []) => {
    const formData = new FormData();
    
    // Append each file
    files.forEach((file) => {
      formData.append('documents', file);
    });
    
    // Append descriptions if provided
    if (descriptions.length > 0) {
      descriptions.forEach((desc, index) => {
        if (desc) {
          formData.append(`descriptions[${index}]`, desc);
        }
      });
    }
    
    return api.post(`/quotations/${quotationId}/internal-documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // Longer timeout for file uploads
    });
  },

  /**
   * Get all internal documents for a quotation
   * @param {string} quotationId - The quotation ID
   */
  getAll: (quotationId) => 
    api.get(`/quotations/${quotationId}/internal-documents`),

  /**
   * Get a single internal document by ID
   * @param {string} quotationId - The quotation ID
   * @param {string} documentId - The document ID
   */
  getById: (quotationId, documentId) => 
    api.get(`/quotations/${quotationId}/internal-documents/${documentId}`),

  /**
   * Update document description
   * @param {string} quotationId - The quotation ID
   * @param {string} documentId - The document ID
   * @param {string} description - New description
   */
  updateDescription: (quotationId, documentId, description) => 
    api.patch(`/quotations/${quotationId}/internal-documents/${documentId}`, { description }),

  /**
   * Delete an internal document
   * @param {string} quotationId - The quotation ID
   * @param {string} documentId - The document ID
   */
  delete: (quotationId, documentId) => 
    api.delete(`/quotations/${quotationId}/internal-documents/${documentId}`),

  /**
   * Get download URL for a document
   * @param {string} quotationId - The quotation ID
   * @param {string} documentId - The document ID
   */
  getDownloadUrl: (quotationId, documentId) => 
    api.get(`/quotations/${quotationId}/internal-documents/${documentId}/download`),

  /**
   * Download a document (opens in new tab)
   * @param {string} quotationId - The quotation ID
   * @param {string} documentId - The document ID
   */
  download: async (quotationId, documentId) => {
    try {
      const response = await documentAPI.getDownloadUrl(quotationId, documentId);
      if (response.data.success) {
        window.open(response.data.downloadUrl, '_blank');
      }
      return response;
    } catch (error) {
      console.error('Error downloading document:', error);
      throw error;
    }
  },

  /**
   * Helper to format file size
   * @param {number} bytes - File size in bytes
   */
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Get file icon based on mime type
   * @param {string} mimeType - File MIME type
   */
  getFileIcon: (mimeType) => {
    if (!mimeType) return '📎';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
    return '📎';
  },

  /**
   * Validate file before upload
   * @param {File} file - File to validate
   * @param {Object} options - Validation options
   */
  validateFile: (file, options = {}) => {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
      ]
    } = options;

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds ${maxSize / 1024 / 1024}MB`
      };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'File type not allowed'
      };
    }

    return { valid: true };
  }
};

/* =========================================================
   QUOTATION APIs (Updated with document integration)
========================================================= */
export const quotationAPI = {
  // Company endpoints (via quotation routes) - kept for backward compatibility
  getCompanies: (params) => api.get("/quotations/companies", { params }),
  getCompanyByCode: (code) => api.get(`/quotations/companies/${code}`),
  getCompanyStats: (code, params) => api.get(`/quotations/companies/${code}/stats`, { params }),

  // User quotations - can filter by companyId
  getMyQuotations: (params) => {
    return api.get("/quotations/my-quotations", { params });
  },

  // Admin quotations - can filter by companyId
  getAll: (params) => {
    return api.get("/quotations", { params });
  },

  // CRUD operations
  create: (data) => {
    return api.post("/quotations", data);
  },
  
  getById: (id) => api.get(`/quotations/${id}`),
  
  update: (id, data) => api.put(`/quotations/${id}`, data),
  
  delete: (id) => api.delete(`/quotations/${id}`),

  // Special operations
  updateQueryDate: (id, date) =>
    api.patch(`/quotations/${id}/query-date`, { queryDate: date }),

  awardQuotation: (id, awarded, awardNote = "") =>
    api.patch(`/quotations/${id}/award`, { awarded, awardNote }),

  // Generate server-side PDF
  generatePDF: async (html, filename = "quotation") => {
    const response = await api.post(
      "/quotations/generate-pdf",
      { html, filename },
      { responseType: "blob", timeout: 60000 }
    );

    triggerBlobDownload(response.data, `${filename}.pdf`);
    return { success: true };
  },

  // Test PDF generation
  testPDF: async () => {
    const response = await api.post(
      "/quotations/test-pdf",
      {},
      { responseType: "blob", timeout: 30000 }
    );
    triggerBlobDownload(response.data, "test.pdf");
    return { success: true };
  },

  // Document management (convenience proxy)
  documents: documentAPI,
};

/* =========================================================
   CUSTOMER HELPER FUNCTIONS (Updated)
========================================================= */

/**
 * Customer tax utilities
 */
export const customerTaxUtils = {
  /**
   * Get available tax treatments with labels
   */
  getTaxTreatments: () => [
    { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false }
  ],

  /**
   * Check if tax treatment requires TRN
   */
  requiresTrn: (taxTreatment) => taxTreatment === 'gcc_vat_registered',

  /**
   * Validate TRN format
   * @param {string} trn - Tax Registration Number
   * @returns {boolean} True if valid (15 digits)
   */
  validateTrn: (trn) => /^\d{15}$/.test(trn),

  /**
   * Format TRN for display (groups of 3 digits)
   * @param {string} trn - Raw TRN
   * @returns {string} Formatted TRN
   */
  formatTrn: (trn) => {
    if (!trn) return '';
    return trn.replace(/(\d{3})(?=\d)/g, '$1-').replace(/-$/, '');
  },

  /**
   * Get TRN validation error message
   * @param {string} trn - TRN to validate
   * @returns {string|null} Error message or null if valid
   */
  getTrnValidationError: (trn) => {
    if (!trn) return 'Tax Registration Number is required';
    if (!/^\d{15}$/.test(trn)) return 'TRN must be exactly 15 digits';
    return null;
  }
};

/**
 * Customer place of supply utilities
 */
export const placeOfSupplyUtils = {
  /**
   * Get all GCC countries
   */
  getGccCountries: () => [
    'United Arab Emirates (UAE)',
    'Saudi Arabia',
    'Kuwait',
    'Qatar',
    'Bahrain',
    'Oman'
  ],

  /**
   * Get country code from place of supply name
   * @param {string} placeName - Place of supply name
   * @returns {string} Country code (e.g., 'AE', 'SA')
   */
  getCountryCode: (placeName) => {
    const map = {
      'United Arab Emirates (UAE)': 'AE',
      'Saudi Arabia': 'SA',
      'Kuwait': 'KW',
      'Qatar': 'QA',
      'Bahrain': 'BH',
      'Oman': 'OM'
    };
    return map[placeName] || 'AE';
  },

  /**
   * Get place of supply name from country code
   * @param {string} countryCode - Country code
   * @returns {string} Place of supply name
   */
  getPlaceName: (countryCode) => {
    const map = {
      'AE': 'United Arab Emirates (UAE)',
      'SA': 'Saudi Arabia',
      'KW': 'Kuwait',
      'QA': 'Qatar',
      'BH': 'Bahrain',
      'OM': 'Oman'
    };
    return map[countryCode] || 'United Arab Emirates (UAE)';
  }
};

/**
 * Currency utilities (enhanced)
 */
export const currencyUtils = {
  // Supported currencies with details
  supportedCurrencies: {
    AED: { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham', decimalPlaces: 2 },
    SAR: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimalPlaces: 2 },
    KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', decimalPlaces: 3 },
    QAR: { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', decimalPlaces: 2 },
    BHD: { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', decimalPlaces: 3 },
    OMR: { code: 'OMR', symbol: '﷼', name: 'Omani Rial', decimalPlaces: 3 },
    USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimalPlaces: 2 },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimalPlaces: 2 },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimalPlaces: 2 }
  },

  // Format amount with currency symbol
  format: (amount, currencyCode = 'AED') => {
    const currency = currencyUtils.supportedCurrencies[currencyCode];
    if (!currency) return `${currencyCode} ${amount.toFixed(2)}`;
    
    const decimalPlaces = currency.decimalPlaces || 2;
    const formattedAmount = amount.toFixed(decimalPlaces);
    return `${currency.symbol} ${formattedAmount}`;
  },

  // Convert amount using exchange rate
  convert: async (amount, from, to = 'AED') => {
    try {
      const response = await exchangeRateAPI.convert({ amount, from, to });
      return response.data.result;
    } catch (error) {
      console.error('Currency conversion failed:', error);
      return amount;
    }
  },

  // Get available currencies for a company (now uses API)
  getCompanyCurrencies: async (companyId) => {
    try {
      const response = await companyAPI.getCurrencies(companyId);
      return response.data.acceptedCurrencies;
    } catch (error) {
      console.error('Failed to fetch company currencies:', error);
      return ['AED']; // Fallback
    }
  },

  // Get currency symbol
  getSymbol: (currencyCode) => {
    return currencyUtils.supportedCurrencies[currencyCode]?.symbol || currencyCode;
  },

  // Get currency name
  getName: (currencyCode) => {
    return currencyUtils.supportedCurrencies[currencyCode]?.name || currencyCode;
  },

  // Get decimal places for currency
  getDecimalPlaces: (currencyCode) => {
    return currencyUtils.supportedCurrencies[currencyCode]?.decimalPlaces || 2;
  }
};

/* =========================================================
   Company Filter Helper
========================================================= */
export const companyFilterUtils = {
  // Build query params with company filter
  withCompany: (params, companyId) => {
    if (!companyId) return params;
    return { ...params, companyId };
  },

  // Create a company-filtered version of any API function
  createFilteredApi: (apiFunc, getSelectedCompany) => {
    return async (...args) => {
      const companyId = typeof getSelectedCompany === 'function' 
        ? getSelectedCompany() 
        : getSelectedCompany;
      
      const params = args[0] || {};
      return apiFunc(companyFilterUtils.withCompany(params, companyId));
    };
  }
};

/* =========================================================
   AUTH HELPERS
========================================================= */
export const setAuthData = (data) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data));
};

export const clearAuthData = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("app-store");
  localStorage.removeItem("selectedCompany");
  localStorage.removeItem("selectedCurrency");
};

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const isAuthenticated = () => !!localStorage.getItem("token");

export const isAdmin = () => getCurrentUser()?.role === "admin";

export const isOpsManager = () => getCurrentUser()?.role === "ops_manager";

/* =========================================================
   Role-based redirect helper
========================================================= */
export const getHomePath = (role) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "ops_manager":
      return "/ops";
    default:
      return "/home";
  }
};

/* =========================================================
   File Download Helper
========================================================= */
export const triggerBlobDownload = (blob, filename = "download") => {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadPDF = (response, filename = "quotation") =>
  triggerBlobDownload(response.data, `${filename}.pdf`);

export default api;