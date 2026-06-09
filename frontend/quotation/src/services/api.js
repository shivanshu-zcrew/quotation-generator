import axios from "axios";

const API_BASE = import.meta.env?.VITE_API_URL || "http://13.234.239.26:4000/api";

// ==================== HELPER FUNCTIONS ====================

// Clean params - removes undefined, null, and empty values
const cleanParams = (params) => {
  if (!params) return {};
  const clean = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      clean[key] = params[key];
    }
  });
  return clean;
};

// ==================== REQUEST DEDUPLICATOR ====================
class RequestDeduplicator {
  constructor() {
    this.pendingRequests = new Map();
  }
  
  dedupe(key, requestFn) {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }
    
    const promise = requestFn().finally(() => {
      this.pendingRequests.delete(key);
    });
    
    this.pendingRequests.set(key, promise);
    return promise;
  }
  
  clear() {
    this.pendingRequests.clear();
  }
}

// ==================== SMART PAGINATION CACHE ====================
class PaginationCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 30000; // 30 seconds default
    this.maxSize = options.maxSize || 50;
  }

  getKey(endpoint, params) {
    const { page = 1, limit = 20, ...filters } = params;
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((acc, key) => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          acc[key] = filters[key];
        }
        return acc;
      }, {});
    
    return `${endpoint}:p${page}:l${limit}:${JSON.stringify(sortedFilters)}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  clearEndpoint(endpoint) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(endpoint)) {
        this.cache.delete(key);
      }
    }
  }
}

// ==================== SIMPLE API CACHE ====================
class ApiCache {
  constructor(defaultTtl = 5 * 60 * 1000) {
    this.cache = new Map();
    this.defaultTtl = defaultTtl;
  }
  
  set(key, data, ttl = null) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl || this.defaultTtl)
    });
  }
  
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  clear(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

// ==================== REQUEST QUEUE ====================
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  
  async add(requestFn, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { requestFn, resolve, reject } = this.queue.shift();
    
    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.process();
    }
  }
  
  clear() {
    this.queue = [];
  }
}

// ==================== RETRY LOGIC ====================
const withRetry = async (requestFn, options = {}) => {
  const {
    maxRetries = 2,
    baseDelay = 1000,
    retryableStatuses = [408, 429, 500, 502, 503, 504]
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      const shouldNotRetry = 
        !error.response ||
        [401, 403, 404, 400].includes(error.response?.status);
      
      if (shouldNotRetry || attempt === maxRetries) {
        throw error;
      }
      
      const isRetryable = retryableStatuses.includes(error.response?.status);
      if (!isRetryable && error.response) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// ==================== CACHE INSTANCES ====================
const deduplicator = new RequestDeduplicator();
const apiCache = new ApiCache();
const syncQueue = new RequestQueue();
const quotationCache = new PaginationCache({ ttl: 30000, maxSize: 30 });
const adminQuotationCache = new PaginationCache({ ttl: 30000, maxSize: 30 });

// Customer cache
const customerCache = new Map();
const CUSTOMER_CACHE_TTL = 60000;

const getCachedCustomers = (cacheKey) => {
  const cached = customerCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CUSTOMER_CACHE_TTL) {
    return cached.data;
  }
  return null;
};

const setCachedCustomers = (cacheKey, data) => {
  customerCache.set(cacheKey, { data, timestamp: Date.now() });
};

const clearCustomerCache = () => {
  customerCache.clear();
};

// ==================== AXIOS INSTANCE ====================
const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 150000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    
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
    if (error.response?.status === 429) {
      console.error('Rate limit hit!', error.response?.data?.message);
      return Promise.reject(new Error('Too many requests. Please wait a moment.'));
    }

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

// ==================== AUTH API ====================
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),
  updateUser: (userId, userData) => api.put(`/auth/users/${userId}`, userData),
  updateDetails: (data) => api.put("/auth/updatedetails", data),
  updatePassword: (data) => api.put("/auth/updatepassword", data),
  getUserById: (id) => api.get(`/auth/users/${id}`), 
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
  getAllUsers: () => api.get("/auth/users"),
  toggleUserStatus: (id) => api.put(`/auth/users/${id}/toggle-status`),
  changeUserRole: (id, data) => api.put(`/auth/users/${id}/role`, data),
  sendPasswordResetEmail: (userId) => api.post(`/auth/users/${userId}/send-reset-password`),
  setUserPassword: (userId, data) => api.put(`/auth/users/${userId}/set-password`, data),
  generateTemporaryPassword: (userId) => api.post(`/auth/users/${userId}/generate-temp-password`),
  resetPasswordWithToken: (data) => api.put(`/auth/reset-password`, data),
  forceChangePassword: (data) => api.put(`/auth/force-change-password`, data),
};

// ==================== ADMIN API ====================
export const adminAPI = {
  getDashboardStats: (params) => api.get("/admin/dashboard", { params }),
  
  getAllQuotations: async (params = {}, options = {}) => {
    const { skipCache = false, forceRefresh = false } = options;
    const cleanParamsObj = cleanParams(params);
    const cacheKey = adminQuotationCache.getKey('/admin/quotations', cleanParamsObj);
    
    if (!skipCache && !forceRefresh) {
      const cached = adminQuotationCache.get(cacheKey);
      if (cached) return cached;
    }
    
    const response = await api.get("/admin/quotations", { params: cleanParamsObj });
    
    if (!skipCache) {
      adminQuotationCache.set(cacheKey, response);
    }
    
    return response;
  },
  
  getPendingQuotations: (params) => api.get("/admin/quotations/pending", { params }),
  approveQuotation: (id) => api.put(`/admin/quotations/${id}/approve`),
  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/reject`, data),
  getAdminStats: (params) => api.get("/admin/dashboard", { params }),
  getUserQuotationStats: () => api.get("/admin/user-stats"),
  getQuotationsByUser: (userId) => api.get(`/admin/user-quotations/${userId}`),
  
  exportQuotationsToExcel: (params) => {
    return api.get("/admin/export-excel", { 
      params,
      responseType: 'blob',
      timeout: 120000 
    });
  },
  
  clearCache: () => adminQuotationCache.clear(),
};

// ==================== OPS API ====================
export const opsAPI = {
  getPendingQuotations: (params = {}) => {
    const { page = 1, limit = 20, ...rest } = params;
    return api.get("/admin/quotations/ops-pending", { params: { page, limit, ...rest } });
  },
  
  getReviewHistory: (params = {}) => {
    const { page = 1, limit = 20, ...rest } = params;
    return api.get("/admin/quotations/ops-history", { params: { page, limit, status: "ops_approved,ops_rejected", ...rest } });
  },
  
  approveQuotation: (id) => api.put(`/admin/quotations/${id}/ops-approve`),
  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/ops-reject`, data),
  getOpsStats: (params) => api.get("/admin/ops-dashboard", { params }),
  
  getAllQuotations: async (params = {}, options = {}) => {
    const { skipCache = false, forceRefresh = false } = options;
    const cleanParamsObj = cleanParams(params);
    
    if (!skipCache && !forceRefresh) {
      // Optional: Add caching for ops if needed
    }
    
    return api.get("/admin/quotations/ops-all", { params: cleanParamsObj });
  },
};

// ==================== CUSTOMERS API ====================
export const customerAPI = {
  getAll: async (params, options = {}) => {
    const { skipCache = false } = options;
    const cacheKey = JSON.stringify({ ...params, companyId: params?.companyId });
    
    if (!skipCache) {
      const cachedData = getCachedCustomers(cacheKey);
      if (cachedData) return { data: cachedData, source: 'cache' };
    }
    
    const response = await withRetry(() => api.get("/customers", { params }));
    
    if (!skipCache && response.data) {
      setCachedCustomers(cacheKey, response.data);
    }
    
    return response;
  },
  
  clearCustomerCache: () => clearCustomerCache(),
  create: (data) => api.post("/customers", data),
  
  getById: (id) => {
    const key = `/customers/${id}`;
    return deduplicator.dedupe(key, () => api.get(`/customers/${id}`));
  },
  
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  
  search: (query, limit = 20, offset = 0) => {
    const key = `/customers/search?${query}|${limit}|${offset}`;
    return deduplicator.dedupe(key, () => api.get("/customers/search", { params: { query, limit, offset } }));
  },
  
  syncFromZoho: (fullSync = false) => syncQueue.add(() => 
    api.post(`/customers/sync-from-zoho${fullSync ? '?fullSync=true' : ''}`)
  ),
  
  getSyncProgress: () => api.get("/customers/sync/progress"),
  cancelSync: () => api.post("/customers/sync/cancel"),
  getSyncStatus: () => api.get("/customers/sync/status"),
  getPendingSync: () => api.get("/customers/sync/pending"),
  forceSyncCustomer: (id) => syncQueue.add(() => api.post(`/customers/sync/force/${id}`)),
  syncWithZoho: (id) => syncQueue.add(() => api.post(`/customers/${id}/sync`)),
  
  getStats: (params = {}) => {
    const { companyId, ...rest } = params;
    const apiParams = { ...rest };
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      apiParams.companyId = companyId;
    }
    
    return api.get("/customers/stats", { params: apiParams });
  },
  
  getGccCountries: () => api.get("/customers/gcc-countries"),
  getCurrencies: () => api.get("/customers/currencies"),
  getTaxTreatments: () => api.get("/customers/tax-treatments"),
  
  exportCustomers: (params, format = 'xlsx') => {
    const { companyId, ...rest } = params;
    const apiParams = { format, ...rest };
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      apiParams.companyId = companyId;
    }
    
    return api.get("/customers/export", { 
      params: apiParams,
      responseType: 'blob',
      timeout: 120000 
    });
  },
  
  getTaxSummary: () => api.get("/customers/tax-summary"),
  getByTaxTreatment: (taxTreatment, params = {}) => api.get("/customers", { params: { ...params, taxTreatment } }),
  getByPlaceOfSupply: (placeOfSupply, params = {}) => api.get("/customers", { params: { ...params, placeOfSupply } }),
  bulkImport: (customers) => {
    apiCache.clear();
    return api.post("/customers/bulk", { customers });
  },
  
  getCustomerPlaceStats: (params = {}) => {
    const { companyId, ...rest } = params;
    const apiParams = { ...rest };
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      apiParams.companyId = companyId;
    }
    
    return api.get("/customers/place-stats", { params: apiParams });
  },
};

// ==================== ITEMS API ====================
export const itemAPI = {
  getAll: (params) => {
    const key = `/items?${JSON.stringify(params)}`;
    return api.get("/items", { params });
  },
  
  create: async (formData) => {
    const response = await api.post("/items", formData, { headers: { "Content-Type": "multipart/form-data" } });
    apiCache.clear();
    return response;
  },
  
  getById: (id) => {
    const key = `/items/${id}`;
    return deduplicator.dedupe(key, () => api.get(`/items/${id}`));
  },
  
  update: async (id, formData) => {
    const response = await api.put(`/items/${id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    apiCache.clear();
    return response;
  },
  
  delete: async (id) => {
    const response = await api.delete(`/items/${id}`);
    apiCache.clear();
    return response;
  },
  
  syncItems: () => syncQueue.add(() => api.post("/items/sync")),
  getSyncProgress: () => api.get("/items/sync/progress"),
  getSyncStatus: () => api.get("/items/sync/status"),
};

// ==================== COMPANIES API ====================
export const companyAPI = {
  getAll: (params) => api.get("/companies", { params }),
  getById: (id) => deduplicator.dedupe(`/companies/${id}`, () => api.get(`/companies/${id}`)),
  getByCode: (code) => deduplicator.dedupe(`/companies/code/${code}`, () => api.get(`/companies/code/${code}`)),
  getStats: (id, params) => api.get(`/companies/${id}/stats`, { params }),
  getCurrencies: (id) => api.get(`/companies/${id}/currencies`),
  create: (data) => api.post("/companies", data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  delete: (id) => api.delete(`/companies/${id}`),
  toggleStatus: (id) => api.patch(`/companies/${id}/toggle-status`),
  bulkImport: (data) => api.post("/companies/bulk", data),
};

// ==================== EXCHANGE RATES API ====================
export const exchangeRateAPI = {
  getRates: (params) => api.get("/exchange-rates/rates", { params }),
  convert: (data) => api.post("/exchange-rates/convert", data),
  getHistory: (params) => api.get("/exchange-rates/history", { params }),
  getSupported: () => api.get("/exchange-rates/supported"),
  refreshRates: () => {
    apiCache.clear();
    return api.post("/exchange-rates/refresh");
  },
  getStatus: () => api.get("/exchange-rates/status"),
};

// ==================== DOCUMENTS API ====================
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
    const { 
      maxSize = 30 * 1024 * 1024, 
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 
                      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                      'text/plain'] 
    } = options;
    
    if (file.size > maxSize) return { valid: false, error: `File size exceeds ${maxSize / 1024 / 1024}MB` };
    if (!allowedTypes.includes(file.type)) return { valid: false, error: 'File type not allowed' };
    return { valid: true };
  }
};

// ==================== QUOTATIONS API ====================
export const quotationAPI = {
  getCompanies: (params) => api.get("/quotations/companies", { params }),
  getCompanyByCode: (code) => api.get(`/quotations/companies/${code}`),
  getCompanyStats: (code, params) => api.get(`/quotations/companies/${code}/stats`, { params }),
  
  getMyQuotations: async (params = {}, options = {}) => {
    const { skipCache = false, forceRefresh = false } = options;
    const cleanParamsObj = cleanParams(params);
    const cacheKey = quotationCache.getKey('/quotations/my-quotations', cleanParamsObj);
    
    if (!skipCache && !forceRefresh) {
      const cached = quotationCache.get(cacheKey);
      if (cached) return cached;
    }
    
    const response = await api.get("/quotations/my-quotations", { params: cleanParamsObj });
    
    if (!skipCache) {
      quotationCache.set(cacheKey, response);
    }
    
    return response;
  },
  
  getMyQuotationsStats: async (params = {}, options = {}) => {
    const { skipCache = false, forceRefresh = false } = options;
    const cleanParamsObj = cleanParams(params);
    const cacheKey = quotationCache.getKey('/quotations/my-quotations/stats', cleanParamsObj);
    
    if (!skipCache && !forceRefresh) {
      const cached = quotationCache.get(cacheKey);
      if (cached) return cached;
    }
    
    const response = await api.get("/quotations/my-quotations/stats", { params: cleanParamsObj });
    
    if (!skipCache) {
      quotationCache.set(cacheKey, response);
    }
    
    return response;
  },

  getAll: async (params = {}, options = {}) => {
    const { skipCache = false, forceRefresh = false } = options;
    const cleanParamsObj = cleanParams(params);
    const cacheKey = quotationCache.getKey('/quotations', cleanParamsObj);
    
    if (!skipCache && !forceRefresh) {
      const cached = quotationCache.get(cacheKey);
      if (cached) return cached;
    }
    
    const response = await api.get("/quotations", { params: cleanParamsObj });
    
    if (!skipCache) {
      quotationCache.set(cacheKey, response);
    }
    
    return response;
  },
  
  getById: (id) => {
    const key = `/quotations/${id}`;
    return deduplicator.dedupe(key, () => api.get(`/quotations/${id}`));
  },
  
  create: async (data) => {
    const response = await api.post("/quotations", data);
    quotationCache.clearEndpoint('/quotations/my-quotations');
    quotationCache.clearEndpoint('/quotations');
    adminQuotationCache.clear();
    return response;
  },
  
  update: async (id, data) => {
    const response = await api.put(`/quotations/${id}`, data);
    deduplicator.clear(`/quotations/${id}`);
    quotationCache.clearEndpoint('/quotations/my-quotations');
    quotationCache.clearEndpoint('/quotations');
    adminQuotationCache.clear();
    return response;
  },
  
  presignItemImage: (contentType, fileName, itemIndex, size) =>
    api.post('/quotations/presign-image', { contentType, fileName, itemIndex, size }),
    
  delete: async (id) => {
    const response = await api.delete(`/quotations/${id}`);
    deduplicator.clear(`/quotations/${id}`);
    quotationCache.clearEndpoint('/quotations/my-quotations');
    quotationCache.clearEndpoint('/quotations');
    adminQuotationCache.clear();
    return response;
  },
  
  updateQueryDate: (id, date) => api.patch(`/quotations/${id}/query-date`, { queryDate: date }),
  
  awardQuotation: async (id, awarded, awardNote = "") => {
    const response = await api.patch(`/quotations/${id}/award`, { awarded, awardNote });
    deduplicator.clear(`/quotations/${id}`);
    quotationCache.clearEndpoint('/quotations/my-quotations');
    quotationCache.clearEndpoint('/quotations');
    adminQuotationCache.clear();
    return response;
  },
  
  generatePDF: async (html, filename = "quotation") => {
    try {
      const response = await api.post("/quotations/generate-pdf", { html, filename }, { 
        responseType: "blob", 
        timeout: 120000
      });
      
      if (!response.data || response.data.size === 0) {
        throw new Error('Empty response received');
      }
      
      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { success: true };
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    }
  },
  
  testPDF: async () => {
    const response = await api.post("/quotations/test-pdf", {}, { responseType: "blob", timeout: 30000 });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = "test.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true };
  },
  
  getSignedUrl: (s3Key, expiresIn = 3600) => 
    api.get(`/quotations/signed-url/${encodeURIComponent(s3Key)}`, { params: { expiresIn } }),
  
  getBatchSignedUrls: (s3Keys, expiresIn = 3600) => 
    api.post(`/quotations/signed-urls/batch`, { keys: s3Keys }, { params: { expiresIn } }),
  
  clearCache: () => {
    quotationCache.clear();
    adminQuotationCache.clear();
  },
  
  documents: documentAPI,
};

// ==================== NOTIFICATIONS API ====================
export const notificationAPI = {
  getAll: (params = {}) => api.get("/notifications", { params }),
  getUnreadCount: () => api.get("/notifications/unread-count"),
  getById: (id) => api.get(`/notifications/${id}`),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put("/notifications/read-all"),
  archive: (id) => api.put(`/notifications/${id}/archive`),
  delete: (id) => api.delete(`/notifications/${id}`),
  refresh: () => api.get("/notifications", { params: { forceRefresh: true } })
};

// ==================== UTILITIES ====================
export const setSelectedCompany = (companyId) => {
  if (companyId) {
    localStorage.setItem("selectedCompany", companyId);
  } else {
    localStorage.removeItem("selectedCompany");
  }
};

export const getSelectedCompany = () => localStorage.getItem("selectedCompany");

export const clearCompanyContext = () => {
  localStorage.removeItem("selectedCompany");
  localStorage.removeItem("selectedCurrency");
};

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
  apiCache.clear();
  deduplicator.clear();
  syncQueue.clear();
  quotationCache.clear();
  adminQuotationCache.clear();
  clearCustomerCache();
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

export const clearAllCaches = () => {
  apiCache.clear();
  deduplicator.clear();
  syncQueue.clear();
  quotationCache.clear();
  adminQuotationCache.clear();
  clearCustomerCache();
};

// ==================== EXPORT DEFAULTS ====================
export default api;