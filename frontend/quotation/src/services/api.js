import axios from 'axios';

const API_BASE = 'http://51.20.109.158:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

 api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
 
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
       
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============ AUTH API ============
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateDetails: (data) => api.put('/auth/updatedetails', data),
  updatePassword: (data) => api.put('/auth/updatepassword', data),
  
  // Admin only
  getAllUsers: () => api.get('/auth/users'),
  toggleUserStatus: (id) => api.put(`/auth/users/${id}/toggle-status`),
  changeUserRole: (id, data) => api.put(`/auth/users/${id}/role`, data)
};

// ============ ADMIN API ============
export const adminAPI = {
  // Dashboard
  getDashboardStats: () => api.get('/admin/dashboard'),
  
  // Quotation management
  getPendingQuotations: () => api.get('/admin/quotations/pending'),
  getAllQuotations: (params) => api.get('/admin/quotations', { params }),
  approveQuotation: (id) => api.put(`/admin/quotations/${id}/approve`),
  rejectQuotation: (id, data) => api.put(`/admin/quotations/${id}/reject`, data)
};

// ============ CUSTOMER API ============
export const customerAPI = {
  getAll: () => api.get('/customers'),
  create: (data) => api.post('/customers', data),
  getById: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`)
};

// ============ ITEM API ============
export const itemAPI = {
  getAll: () => api.get('/items'),
  create: (formData) => api.post('/items', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getById: (id) => api.get(`/items/${id}`),
  update: (id, formData) => api.put(`/items/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id) => api.delete(`/items/${id}`)
};

// ============ QUOTATION API ============
export const quotationAPI = {
   getMyQuotations: () => api.get('/quotations/my-quotations'),
  create: (data) => api.post('/quotations', data),
  getById: (id) => api.get(`/quotations/${id}`),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  delete: (id) => api.delete(`/quotations/${id}`),
  generatePDF: async (html, filename = 'quotation') => {
    try {
      const response = await api.post('/quotations/generate-pdf', 
        { html, filename }, 
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return { success: true };
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error(error.response?.data?.message || 'Failed to generate PDF');
    }
  },
  
   testPDF: () => api.post('/quotations/test-pdf', {}, {
    responseType: 'blob'
  }),
  
  // Admin only - get all quotations
  getAll: () => api.get('/quotations'),
  
  // Test PDF (keep for debugging)
  testPDF: () => api.post('/quotations/test-pdf', {}, {
    responseType: 'blob'
  })
};

// ============ HELPER FUNCTIONS ============

// Store authentication data after login
export const setAuthData = (data) => {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data));
};

// Clear authentication data on logout
export const clearAuthData = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// Get current user from localStorage
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};

// Check if user is admin
export const isAdmin = () => {
  const user = getCurrentUser();
  return user?.role === 'admin';
};

// Download PDF helper
export const downloadPDF = (response, filename = 'quotation') => {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default api;