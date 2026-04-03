import axios from "axios";

const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:4000/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

// Request interceptor - Add company ID to headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    
    // Add company ID header if selected
    const selectedCompanyId = localStorage.getItem("selectedCompany");
    if (selectedCompanyId) {
      config.headers["x-company-id"] = selectedCompanyId;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes("/login")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("selectedCompany");
      localStorage.removeItem("selectedCurrency");
      window.location.replace("/login");
    }
    return Promise.reject(error);
  }
);

// Cancel tokens
export const createCancelToken = () => {
  const source = axios.CancelToken.source();
  return { token: source.token, cancel: source.cancel };
};
export const isCancel = (err) => axios.isCancel(err);

// ==================== AUTH ====================
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

// ==================== ADMIN ====================
export const adminAPI = {
  getDashboardStats: (params) => api.get("/admin/dashboard", { params }),
  getAllQuotations: (params) => api.get("/admin/quotations", { params }),
  getPendingQuotations: (params) => api.get("/admin/quotations/pending", { params }),
  approveQuotation: (id) => api.put(`/admin/quotations/${id}/approve`),
  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/reject`, data),
  getAdminStats: (params) => api.get("/admin/dashboard", { params }),
};

// ==================== OPS MANAGER ====================
export const opsAPI = {
  getPendingQuotations: (params) => api.get("/admin/quotations/ops-pending", { params }),
  getReviewHistory: (params) => api.get("/admin/quotations/ops-history", { params: { ...params, status: "ops_approved,ops_rejected" } }),
  approveQuotation: (id) => api.put(`/admin/quotations/${id}/ops-approve`),
  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/ops-reject`, data),
  getOpsStats: (params) => api.get("/admin/ops-dashboard", { params }),
};

// ==================== CUSTOMERS ====================
export const customerAPI = {
  getAll: (params) => api.get("/customers", { params }),
  create: (data) => api.post("/customers", data),
  getById: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  search: (query, limit = 20, offset = 0) => api.get("/customers/search", { params: { query, limit, offset } }),
  
  // Sync methods
  syncFromZoho: (fullSync = false) => api.post(`/customers/sync-from-zoho${fullSync ? '?fullSync=true' : ''}`),
  getSyncStatus: () => api.get("/customers/sync/status"),
  getPendingSync: () => api.get("/customers/sync/pending"),
  forceSyncCustomer: (id) => api.post(`/customers/sync/force/${id}`),
  syncWithZoho: (id) => api.post(`/customers/${id}/sync`),
  
  // Other methods
  getStats: () => api.get("/customers/stats"),
  getGccCountries: () => api.get("/customers/gcc-countries"),
  getCurrencies: () => api.get("/customers/currencies"),
  getTaxTreatments: () => api.get("/customers/tax-treatments"),
  getTaxSummary: () => api.get("/customers/tax-summary"),
  getByTaxTreatment: (taxTreatment, params = {}) => api.get("/customers", { params: { ...params, taxTreatment } }),
  getByPlaceOfSupply: (placeOfSupply, params = {}) => api.get("/customers", { params: { ...params, placeOfSupply } }),
  bulkImport: (customers) => api.post("/customers/bulk", { customers }),
  export: (params, format = 'csv') => api.get("/customers/export", { params: { ...params, format }, responseType: 'blob' }),
};

// ==================== ITEMS ====================
export const itemAPI = {
  getAll: (params) => api.get("/items", { params }),
  create: (formData) => api.post("/items", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  getById: (id) => api.get(`/items/${id}`),
  update: (id, formData) => api.put(`/items/${id}`, formData, { headers: { "Content-Type": "multipart/form-data" } }),
  delete: (id) => api.delete(`/items/${id}`),
  syncItems: () => api.post("/items/sync"), // Changed from GET to POST
  getSyncStatus: () => api.get("/items/sync/status"),
  getAllWithRefresh: (params, forceRefresh = false) => api.get("/items", { params: { ...params, forceRefresh: forceRefresh ? 'true' : 'false' } }),
};

// ==================== COMPANIES ====================
export const companyAPI = {
  getAll: (params) => api.get("/companies", { params }),
  getById: (id) => api.get(`/companies/${id}`),
  getByCode: (code) => api.get(`/companies/code/${code}`),
  getStats: (id, params) => api.get(`/companies/${id}/stats`, { params }),
  getCurrencies: (id) => api.get(`/companies/${id}/currencies`),
  create: (data) => api.post("/companies", data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  delete: (id) => api.delete(`/companies/${id}`),
  toggleStatus: (id) => api.patch(`/companies/${id}/toggle-status`),
  bulkImport: (data) => api.post("/companies/bulk", data),
};

// ==================== EXCHANGE RATES ====================
export const exchangeRateAPI = {
  getRates: (params) => api.get("/exchange-rates/rates", { params }),
  convert: (data) => api.post("/exchange-rates/convert", data),
  getHistory: (params) => api.get("/exchange-rates/history", { params }),
  getSupported: () => api.get("/exchange-rates/supported"),
  refreshRates: () => api.post("/exchange-rates/refresh"),
  getStatus: () => api.get("/exchange-rates/status"),
};

// ==================== DOCUMENTS ====================
export const documentAPI = {
  upload: (quotationId, files, descriptions = []) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('documents', file));
    descriptions.forEach((desc, index) => {
      if (desc) formData.append(`descriptions[${index}]`, desc);
    });
    return api.post(`/quotations/${quotationId}/internal-documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },
  getAll: (quotationId) => api.get(`/quotations/${quotationId}/internal-documents`),
  getById: (quotationId, documentId) => api.get(`/quotations/${quotationId}/internal-documents/${documentId}`),
  updateDescription: (quotationId, documentId, description) => api.patch(`/quotations/${quotationId}/internal-documents/${documentId}`, { description }),
  delete: (quotationId, documentId) => api.delete(`/quotations/${quotationId}/internal-documents/${documentId}`),
  getDownloadUrl: (quotationId, documentId) => api.get(`/quotations/${quotationId}/internal-documents/${documentId}/download`),
  download: async (quotationId, documentId) => {
    const response = await documentAPI.getDownloadUrl(quotationId, documentId);
    if (response.data.success) window.open(response.data.downloadUrl, '_blank');
    return response;
  },
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  getFileIcon: (mimeType) => {
    if (!mimeType) return '📎';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel')) return '📊';
    return '📎';
  },
  validateFile: (file, options = {}) => {
    const { maxSize = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'] } = options;
    if (file.size > maxSize) return { valid: false, error: `File size exceeds ${maxSize / 1024 / 1024}MB` };
    if (!allowedTypes.includes(file.type)) return { valid: false, error: 'File type not allowed' };
    return { valid: true };
  }
};

// ==================== QUOTATIONS ====================
export const quotationAPI = {
  getCompanies: (params) => api.get("/quotations/companies", { params }),
  getCompanyByCode: (code) => api.get(`/quotations/companies/${code}`),
  getCompanyStats: (code, params) => api.get(`/quotations/companies/${code}/stats`, { params }),
  getMyQuotations: (params) => api.get("/quotations/my-quotations", { params }),
  getAll: (params) => api.get("/quotations", { params }),
  create: (data) => api.post("/quotations", data),
  getById: (id) => api.get(`/quotations/${id}`),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  delete: (id) => api.delete(`/quotations/${id}`),
  updateQueryDate: (id, date) => api.patch(`/quotations/${id}/query-date`, { queryDate: date }),
  awardQuotation: (id, awarded, awardNote = "") => api.patch(`/quotations/${id}/award`, { awarded, awardNote }),
  generatePDF: async (html, filename = "quotation") => {
    const response = await api.post("/quotations/generate-pdf", { html, filename }, { responseType: "blob", timeout: 60000 });
    triggerBlobDownload(response.data, `${filename}.pdf`);
    return { success: true };
  },
  testPDF: async () => {
    const response = await api.post("/quotations/test-pdf", {}, { responseType: "blob", timeout: 30000 });
    triggerBlobDownload(response.data, "test.pdf");
    return { success: true };
  },
  documents: documentAPI,
};

// ==================== UTILITIES ====================
export const customerTaxUtils = {
  getTaxTreatments: () => [
    { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false }
  ],
  requiresTrn: (taxTreatment) => taxTreatment === 'gcc_vat_registered',
  validateTrn: (trn) => /^\d{15}$/.test(trn),
  formatTrn: (trn) => trn ? trn.replace(/(\d{3})(?=\d)/g, '$1-').replace(/-$/, '') : '',
  getTrnValidationError: (trn) => {
    if (!trn) return 'Tax Registration Number is required';
    if (!/^\d{15}$/.test(trn)) return 'TRN must be exactly 15 digits';
    return null;
  }
};

export const placeOfSupplyUtils = {
  getGccCountries: () => ['United Arab Emirates (UAE)', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'],
  getCountryCode: (placeName) => {
    const map = { 'United Arab Emirates (UAE)': 'AE', 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
    return map[placeName] || 'AE';
  },
  getPlaceName: (countryCode) => {
    const map = { 'AE': 'United Arab Emirates (UAE)', 'SA': 'Saudi Arabia', 'KW': 'Kuwait', 'QA': 'Qatar', 'BH': 'Bahrain', 'OM': 'Oman' };
    return map[countryCode] || 'United Arab Emirates (UAE)';
  }
};

export const currencyUtils = {
  supportedCurrencies: {
    AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimalPlaces: 2 },
    SAR: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimalPlaces: 2 },
    KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', decimalPlaces: 3 },
    QAR: { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', decimalPlaces: 2 },
    BHD: { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', decimalPlaces: 3 },
    OMR: { code: 'OMR', symbol: '﷼', name: 'Omani Rial', decimalPlaces: 3 },
    USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimalPlaces: 2 },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimalPlaces: 2 },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimalPlaces: 2 }
  },
  format: (amount, currencyCode = 'AED') => {
    const currency = currencyUtils.supportedCurrencies[currencyCode];
    if (!currency) return `${currencyCode} ${amount.toFixed(2)}`;
    return `${currency.symbol} ${amount.toFixed(currency.decimalPlaces || 2)}`;
  },
  convert: async (amount, from, to = 'AED') => {
    try {
      const response = await exchangeRateAPI.convert({ amount, from, to });
      return response.data.result;
    } catch {
      return amount;
    }
  },
  getCompanyCurrencies: async (companyId) => {
    try {
      const response = await companyAPI.getCurrencies(companyId);
      return response.data.acceptedCurrencies;
    } catch {
      return ['AED'];
    }
  },
  getSymbol: (currencyCode) => currencyUtils.supportedCurrencies[currencyCode]?.symbol || currencyCode,
  getName: (currencyCode) => currencyUtils.supportedCurrencies[currencyCode]?.name || currencyCode,
  getDecimalPlaces: (currencyCode) => currencyUtils.supportedCurrencies[currencyCode]?.decimalPlaces || 2
};

export const companyFilterUtils = {
  withCompany: (params, companyId) => companyId ? { ...params, companyId } : params,
  createFilteredApi: (apiFunc, getSelectedCompany) => async (...args) => {
    const companyId = typeof getSelectedCompany === 'function' ? getSelectedCompany() : getSelectedCompany;
    const params = args[0] || {};
    return apiFunc(companyFilterUtils.withCompany(params, companyId));
  }
};

// ==================== COMPANY CONTEXT HELPER ====================
export const setSelectedCompany = (companyId) => {
  if (companyId) {
    localStorage.setItem("selectedCompany", companyId);
  } else {
    localStorage.removeItem("selectedCompany");
  }
};

export const getSelectedCompany = () => {
  return localStorage.getItem("selectedCompany");
};

export const clearCompanyContext = () => {
  localStorage.removeItem("selectedCompany");
  localStorage.removeItem("selectedCurrency");
};

// ==================== AUTH HELPERS ====================
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

export const getHomePath = (role) => {
  switch (role) {
    case "admin": return "/admin";
    case "ops_manager": return "/ops";
    default: return "/home";
  }
};

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

export const downloadPDF = (response, filename = "quotation") => triggerBlobDownload(response.data, `${filename}.pdf`);

export default api;