import axios from "axios";

/* =========================================================
   API BASE URL
   Uses Vite env variable in production, localhost in dev
========================================================= */
const API_BASE =
  import.meta.env?.VITE_API_URL || "http://localhost:4000/api";

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
   CUSTOMER APIs
========================================================= */
export const customerAPI = {
  getAll: (params) => api.get("/customers", { params }),
  create: (data) => api.post("/customers", data),
  getById: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
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
   Currency Helper Functions (Updated)
========================================================= */
export const currencyUtils = {
  // Format amount with currency symbol
  format: (amount, currencyCode = 'AED', decimalPlaces = 2) => {
    const symbols = {
      AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك',
      BHD: '.د.ب', OMR: '﷼', USD: '$', EUR: '€', GBP: '£'
    };
    const symbol = symbols[currencyCode] || currencyCode;
    return `${symbol} ${amount.toFixed(decimalPlaces)}`;
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