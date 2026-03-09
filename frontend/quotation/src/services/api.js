import axios from 'axios';

// ─────────────────────────────────────────────────────────────
// Base URL — use VITE_API_URL (or REACT_APP_API_URL) in .env
// Falls back to localhost for local development only
// ─────────────────────────────────────────────────────────────
const API_BASE =
  import.meta.env?.VITE_API_URL ||
  'http://51.20.109.158:5000/api';

// ─────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30 s — generous for PDF generation
});

// ─────────────────────────────────────────────────────────────
// Request interceptor — attach JWT
// ─────────────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─────────────────────────────────────────────────────────────
// Response interceptor — handle 401
// ─────────────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirect loop if already on the login page
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────
// createCancelToken — returns { token, cancel }
// Usage: const { token, cancel } = createCancelToken();
//        api.get('/foo', { cancelToken: token })
//        cancel(); // abort in-flight request
// ─────────────────────────────────────────────────────────────
export const createCancelToken = () => {
  const source = axios.CancelToken.source();
  return { token: source.token, cancel: source.cancel };
};

export const isCancel = (err) => axios.isCancel(err);

// ─────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────
export const authAPI = {
  register:       (data)     => api.post('/auth/register',    data),
  login:          (data)     => api.post('/auth/login',       data),
  getMe:          ()         => api.get('/auth/me'),
  updateDetails:  (data)     => api.put('/auth/updatedetails', data),
  updatePassword: (data)     => api.put('/auth/updatepassword', data),

  // Admin only
  getAllUsers:      ()        => api.get('/auth/users'),
  toggleUserStatus: (id)     => api.put(`/auth/users/${id}/toggle-status`),
  changeUserRole:   (id, data) => api.put(`/auth/users/${id}/role`, data),
};

// ─────────────────────────────────────────────────────────────
// ADMIN API
// ─────────────────────────────────────────────────────────────
export const adminAPI = {
  getDashboardStats: () => api.get('/admin/dashboard'),

  // Paginated + filterable list
  // params: { page, limit, status, search, sortBy, sortDir, from, to, customerId }
  getAllQuotations:      (params) => api.get('/admin/quotations',           { params }),
  getPendingQuotations: (params) => api.get('/admin/quotations',           { params: { ...params, status: 'pending' } }),

  approveQuotation: (id)         => api.put(`/admin/quotations/${id}/approve`),
  rejectQuotation:  (id, data)   => api.put(`/admin/quotations/${id}/reject`, data),
};

// ─────────────────────────────────────────────────────────────
// CUSTOMER API
// ─────────────────────────────────────────────────────────────
export const customerAPI = {
  // params: { page, limit, search }
  getAll:   (params) => api.get('/customers',       { params }),
  create:   (data)   => api.post('/customers',      data),
  getById:  (id)     => api.get(`/customers/${id}`),
  update:   (id, data) => api.put(`/customers/${id}`, data),
  delete:   (id)     => api.delete(`/customers/${id}`),
};

// ─────────────────────────────────────────────────────────────
// ITEM API
// ─────────────────────────────────────────────────────────────
export const itemAPI = {
  // params: { page, limit, search }
  getAll:  (params)       => api.get('/items',        { params }),
  create:  (formData)     => api.post('/items',       formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getById: (id)           => api.get(`/items/${id}`),
  update:  (id, formData) => api.put(`/items/${id}`,  formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete:  (id)           => api.delete(`/items/${id}`),
};

// ─────────────────────────────────────────────────────────────
// QUOTATION API
// ─────────────────────────────────────────────────────────────
export const quotationAPI = {
  // params: { page, limit, status, search, sortBy, sortDir }
  getMyQuotations: (params) => api.get('/quotations/my-quotations', { params }),

  // Admin: all quotations (paginated)
  // params: { page, limit, status, search, sortBy, sortDir, from, to, customerId }
  getAll: (params) => api.get('/quotations', { params }),

  create:  (data)      => api.post('/quotations',      data),
  getById: (id)        => api.get(`/quotations/${id}`),
  update:  (id, data)  => api.put(`/quotations/${id}`, data),
  delete:  (id)        => api.delete(`/quotations/${id}`),

  // Server-side PDF via Puppeteer — returns a Blob and triggers download
  // html: full HTML string built on the client (see buildPrintHTML in AdminDashboard)
  // filename: string (no extension needed)
  generatePDF: async (html, filename = 'quotation') => {
    const response = await api.post(
      '/quotations/generate-pdf',
      { html, filename },
      { responseType: 'blob', timeout: 60000 } // PDF gen can be slow
    );
    triggerBlobDownload(response.data, `${filename}.pdf`);
    return { success: true };
  },
};

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────
export const setAuthData = (data) => {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data));
};

export const clearAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const isAuthenticated = () => !!localStorage.getItem('token');

export const isAdmin = () => getCurrentUser()?.role === 'admin';

// ─────────────────────────────────────────────────────────────
// triggerBlobDownload — shared utility
// Creates a temporary <a> to force a file download from a Blob
// ─────────────────────────────────────────────────────────────
export const triggerBlobDownload = (blob, filename = 'download') => {
  const url  = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href  = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Keep as a named alias for backwards compatibility
export const downloadPDF = (response, filename = 'quotation') =>
  triggerBlobDownload(response.data, `${filename}.pdf`);

export default api;