// store.js - Optimized & Fixed Version
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  customerAPI, itemAPI, quotationAPI, authAPI, adminAPI, opsAPI,
  companyAPI, exchangeRateAPI, getCurrentUser, isAuthenticated,
  setAuthData, clearAuthData, setSelectedCompany as persistSelectedCompany,
  getSelectedCompany, clearCompanyContext,
} from './api';

// ==================== UTILITIES ====================

const batchUpdate = (set, updates) => {
  set((state) => {
    const newState = { ...state };
    updates.forEach(([key, value]) => {
      newState[key] = typeof value === 'function' ? value(state[key]) : value;
    });
    return newState;
  });
};

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const extractResponseData = (res) => {
  if (res?.data?.data && typeof res.data.data === 'object') return res.data.data;
  if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
  return res;
};

const parseData = (data) => Array.isArray(data) ? data : (data?.data ?? []);

// Centralized API response parser
const parseApiResponse = (response, fallback = []) => {
  if (response?.data?.success) return response.data.data || response.data.quotations || fallback;
  if (Array.isArray(response?.data)) return response.data;
  if (response?.data?.quotations) return response.data.quotations;
  if (response?.data?.data) return response.data.data;
  return fallback;
};

// ==================== ERROR HANDLING ====================

export class AppError extends Error {
  constructor(message, statusCode = null, originalError = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  static from(error) {
    const statusCode = error?.response?.status;
    const message = error?.response?.data?.message || error?.message || 'Unknown error occurred';
    return new AppError(message, statusCode, error);
  }
}

export const getErrorMessage = (error) => {
  if (error instanceof AppError) return error.message;
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message) return error.message;
  return 'An unexpected error occurred';
};

// ==================== INITIAL STATE ====================

const initialState = {
  user: isAuthenticated() ? getCurrentUser() : null,
  customers: [],
  initialized: false,
  customerSyncStatus: null,
  pendingSyncCustomers: [],
  items: [],
  quotations: [],
  quotationsInitialized: false,
  quotationsLoading: false,
  quotationsPagination: null,
  opsReviewHistory: [],
  companies: [],
  exchangeRates: null,
  supportedCurrencies: null,
  adminStats: null,
  opsStats: null,
  statsLoading: false,
  selectedCompany: getSelectedCompany(),
  selectedCurrency: localStorage.getItem('selectedCurrency') || 'AED',
  currentDocuments: [],
  documentLoading: false,
  loading: false,
  loadError: null,
  operationInProgress: {},
  lastError: null,
  gccCountries: [],
  taxTreatments: [],
  currencyOptions: [],
  customerStats: null,
  quotationsVersion: 0,
  _lastRefetchTime: 0, 
  _switchingCompany: false, 
  customerFilters: {
    status: 'all',
    taxStatus: 'all',
    placeOfSupply: 'all',
    hasTRN: 'all',
    search: '',
    minQuotations: null,
    maxQuotations: null,
    minTotalValue: null,
    maxTotalValue: null,
    createdFrom: null,
    createdTo: null,
    lastActivityFrom: null,
    lastActivityTo: null,
    zohoSyncStatus: 'all',
    customersPagination: null,
  },
};

// ==================== ZUSTAND STORE ====================

export const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // ==================== AUTH ACTIONS ====================
        
        handleLogin: async (email, password) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, login: true } }));
          try {
            const res = await authAPI.login({ email, password });
            if (!res.data) throw new Error('No data received');
            
            const userData = res.data.user || res.data;
            const token = res.data.token || userData.token;
            if (!token || !userData.role) throw new Error('Invalid response');
            
            const user = {
              _id: userData._id || userData.id,
              name: userData.name,
              email: userData.email,
              phone: userData.phone,
              role: userData.role,
              token,
              companyId: userData.companyId || userData.assignedCompany || null,
            };
            
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            
            batchUpdate(set, [['user', user], ['lastError', null], ['loading', true]]);
            
            // Clear any existing company selection
            persistSelectedCompany(null);
            set({ selectedCompany: null });
            
            await get()._loadCompanyData();
            
            return { success: true, role: user.role };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) || 'Login failed' };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, login: false } }));
          }
        },

        handleRegister: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, register: true } }));
          try {
            const res = await authAPI.register(data);
            setAuthData(res.data);
            batchUpdate(set, [['user', res.data], ['lastError', null]]);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, register: false } }));
          }
        },

        handleLogout: () => {
          clearCompanyContext();
          clearAuthData();
          set(initialState);
        },

        // ==================== QUOTATIONS ACTIONS ====================

        fetchQuotationsForCompany: async (companyId, page = 1, limit = 20) => {
          const { user } = get();
          if (!user) return;
          
          set({ quotationsLoading: true, loadError: null });
          
          try {
            const params = { page, limit };
            
            // Only add companyId if it's not 'all'
            if (companyId && companyId !== 'all' && companyId !== 'ALL') {
              params.companyId = companyId;
            }
            
            let result;
            
            if (user.role === 'admin') {
              result = await adminAPI.getAllQuotations(params);
            } else if (user.role === 'ops_manager') {
              result = await opsAPI.getAllQuotations(params);
            } else {
              result = await quotationAPI.getMyQuotations(params);
            }
            
            const quotationsData = result?.data?.quotations || result?.data?.data || [];
            const pagination = result?.data?.pagination || null;
            
            batchUpdate(set, [
              ['quotations', quotationsData],
              ['quotationsPagination', pagination],
              ['quotationsInitialized', true],
              ['quotationsLoading', false],
              ['lastError', null]
            ]);
            
            return { success: true, quotations: quotationsData, pagination };
          } catch (error) {
            batchUpdate(set, [
              ['quotationsLoading', false],
              ['quotationsInitialized', true],
              ['lastError', AppError.from(error)]
            ]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refetchQuotations: async (options = {}) => {
          const { selectedCompany, user } = get();
          if (!user) return { success: false };
          
          // Prevent rapid consecutive calls
          const now = Date.now();
          const lastCall = get()._lastRefetchTime || 0;
          if (now - lastCall < 300) {
            return { success: false, message: 'Throttled' };
          }
          set({ _lastRefetchTime: now });
          
          let companyId = options.companyId !== undefined ? options.companyId : selectedCompany;
          
          set({ loading: true });
          
          try {
            const params = { _t: now };
            
            if (companyId && companyId !== 'all' && companyId !== 'ALL') {
              params.companyId = companyId;
            }
            
            // Add all possible parameters
            if (options.page) params.page = options.page;
            if (options.limit) params.limit = options.limit;
            if (options.status) params.status = options.status;
            if (options.search) params.search = options.search;
            if (options.fromDate) params.fromDate = options.fromDate;
            if (options.toDate) params.toDate = options.toDate;
            if (options.sortBy) params.sortBy = options.sortBy;
            if (options.sortDir) params.sortDir = options.sortDir;
            
            let quotationsData = [];
            let pagination = null;
            
            if (user.role === 'admin') {
              const r = await adminAPI.getAllQuotations(params);
              quotationsData = r?.data?.quotations || r?.data?.data || [];
              pagination = r?.data?.pagination;
            } else if (user.role === 'ops_manager') {
              const r = await opsAPI.getAllQuotations(params);
              quotationsData = r?.data?.quotations || r?.data?.data || [];
              pagination = r?.data?.pagination;
            } else {
              const r = await quotationAPI.getMyQuotations(params);
              quotationsData = r?.data?.data || r?.data || [];
              pagination = r?.data?.pagination;
            }
            
            const safeQuotationsData = Array.isArray(quotationsData) ? quotationsData : [];
            
            set(state => ({
              quotations: safeQuotationsData,
              quotationsPagination: pagination,
              quotationsVersion: state.quotationsVersion + 1,
              loading: false,
              lastError: null
            }));
            
            return { success: true, data: safeQuotationsData, pagination };
          } catch (error) {
            console.error('refetchQuotations error:', error);
            set({ loading: false, lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        addQuotation: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addQuotation: true } }));
          try {
            const response = await quotationAPI.create({ ...data, companyId: data.companyId || get().selectedCompany });
            
            if (response?.data?.success) {
              const newQuotation = response.data.quotation;
              if (newQuotation) {
                set(s => ({ quotations: [newQuotation, ...s.quotations], lastError: null }));
              }
              await get().refetchQuotations();
              return { success: true, quotation: newQuotation, message: response.data.message };
            }
            throw new Error(response?.data?.message || 'Failed to create quotation');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, addQuotation: false } }));
          }
        },

        updateQuotation: async (id, data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateQuotation_${id}`]: true } }));
          try {
            const result = await quotationAPI.update(id, data);
            
            if (result?.data?.success) {
              const updatedQuotation = result.data.quotation;
              set(state => ({
                quotations: state.quotations.map(q => q._id === id ? { ...q, ...updatedQuotation } : q),
                quotationsVersion: state.quotationsVersion + 1,
              }));
              await get().refetchQuotations();
              return { success: true, quotation: updatedQuotation };
            }
            throw new Error(result?.data?.message || 'Failed to update quotation');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateQuotation_${id}`]: false } }));
          }
        },

        deleteQuotation: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteQuotation_${id}`]: true } }));
          try {
            const result = await quotationAPI.delete(id);
            if (result?.status === 200 || result?.data?.success) {
              await get().refetchQuotations();
              return { success: true };
            }
            throw new Error(result?.data?.message || 'Failed to delete quotation');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteQuotation_${id}`]: false } }));
          }
        },

        awardQuotation: async (id, awarded, awardNote = '') => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: true } }));
          try {
            const res = await quotationAPI.awardQuotation(id, awarded, awardNote);
            
            if (res?.data?.success) {
              const updatedQuotation = res.data.quotation;
              set(state => ({
                quotations: state.quotations.map(q => q._id === id ? { ...q, ...updatedQuotation } : q),
                quotationsVersion: state.quotationsVersion + 1,
                lastError: null
              }));
              return { success: true, quotation: updatedQuotation };
            }
            throw new Error(res?.data?.message || 'Failed to update award status');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: false } }));
          }
        },

        approveQuotation: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`approve_${id}`]: true } }));
          try {
            const res = await adminAPI.approveQuotation(id);
            if (res?.data?.success) {
              const updatedQuotation = res.data.quotation;
              set(s => ({ quotations: s.quotations.map(q => q._id === id ? updatedQuotation : q), lastError: null }));
              await get().refetchQuotations();
              return { success: true, quotation: updatedQuotation };
            }
            throw new Error(res?.data?.message || 'Failed to approve quotation');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`approve_${id}`]: false } }));
          }
        },

        rejectQuotation: async (id, reason) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`reject_${id}`]: true } }));
          try {
            const res = await adminAPI.rejectQuotation(id, { reason });
            if (res?.data?.success) {
              const updatedQuotation = res.data.quotation;
              set(s => ({ quotations: s.quotations.map(q => q._id === id ? updatedQuotation : q), lastError: null }));
              await get().refetchQuotations();
              return { success: true, quotation: updatedQuotation };
            }
            throw new Error(res?.data?.message || 'Failed to reject quotation');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`reject_${id}`]: false } }));
          }
        },

        updateQueryDate: async (id, date) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`queryDate_${id}`]: true } }));
          try {
            await quotationAPI.updateQueryDate(id, date);
            set(s => ({ quotations: s.quotations.map(q => q._id === id ? { ...q, queryDate: date } : q), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`queryDate_${id}`]: false } }));
          }
        },

        invalidateQuotations: () => {
          set(state => ({ quotationsVersion: state.quotationsVersion + 1 }));
        },

        // ==================== CUSTOMER ACTIONS ====================

        fetchFilteredCustomers: async (filters = {}, paginationOptions = {}) => {
          const { selectedCompany } = get();
          if (!selectedCompany) return { success: false, error: 'No company selected' };

          set(s => ({ operationInProgress: { ...s.operationInProgress, fetchFilteredCustomers: true }, loading: true }));

          try {
            // Handle "All Companies" - don't send companyId parameter
            let companyIdParam = selectedCompany;
            if (companyIdParam === 'all' || companyIdParam === 'ALL') {
              companyIdParam = undefined; // Don't send companyId to get all companies
            }
            
            const params = {
              page: paginationOptions.page || 1,
              limit: paginationOptions.limit || 20,
              sortBy: paginationOptions.sortBy || 'name',
              sortOrder: paginationOptions.sortOrder || 'asc',
              ...filters
            };
            
            // Only add companyId if it's defined and not 'all'
            if (companyIdParam && companyIdParam !== 'all') {
              params.companyId = companyIdParam;
            }

            // Remove undefined or 'all' values
            Object.keys(params).forEach(key => {
              if (params[key] === 'all' || params[key] === null || params[key] === undefined || params[key] === '') {
                delete params[key];
              }
            });

            console.log('fetchFilteredCustomers - params:', params);

            const response = await customerAPI.getAll(params, { skipCache: !!params.search || Object.keys(filters).length > 2 });

            if (response.data?.success !== false) {
              batchUpdate(set, [
                ['customers', response.data?.data || []],
                ['customersPagination', response.data?.pagination || null],
                ['loading', false],
                ['lastError', null]
              ]);
              return { success: true, customers: response.data?.data || [], pagination: response.data?.pagination };
            }
            throw new Error(response.data?.message || 'Failed to fetch customers');
          } catch (error) {
            console.error('fetchFilteredCustomers error:', error);
            batchUpdate(set, [['loading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, fetchFilteredCustomers: false } }));
          }
        },

        fetchCustomerStats: async (appliedFilters = null, forceRefresh = false) => {
          const { selectedCompany, operationInProgress } = get();
          if (!selectedCompany) return { success: false, error: 'No company selected' };
          
          if (get().operationInProgress.fetchCustomerStats) {
            return { success: false, error: 'Already fetching stats' };
          }

          set(s => ({ operationInProgress: { ...s.operationInProgress, fetchCustomerStats: true } }));

          try {
            // Handle "All Companies" - don't send companyId parameter
            let companyIdParam = selectedCompany;
            if (companyIdParam === 'all' || companyIdParam === 'ALL') {
              companyIdParam = undefined;
            }
            
            const params = {};
            
            // Only add companyId if it's defined and not 'all'
            if (companyIdParam && companyIdParam !== 'all') {
              params.companyId = companyIdParam;
            }
            
            if (appliedFilters) {
              const filterMap = {
                status: 'status', taxStatus: 'taxStatus', placeOfSupply: 'placeOfSupply',
                hasTRN: 'hasTRN', search: 'search', zohoSyncStatus: 'zohoSyncStatus'
              };
              Object.entries(filterMap).forEach(([key, paramKey]) => {
                const value = appliedFilters[key];
                if (value && value !== 'all') params[paramKey] = value;
              });
            }

            console.log('fetchCustomerStats - params:', params);

            const res = await customerAPI.getStats(params);
            
            if (res.data?.success) {
              set({ customerStats: res.data.stats || res.data, lastError: null });
              return { success: true, stats: res.data.stats || res.data };
            }
            throw new Error(res.data?.message || 'Failed to fetch stats');
          } catch (error) {
            console.error('fetchCustomerStats error:', error);
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, fetchCustomerStats: false } }));
          }
        },

        addCustomer: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addCustomer: true } }));
          try {
            const taxTreatment = data.taxTreatment || 'gcc_non_vat_registered';
            const trnValidation = get().validateTrn(data.taxRegistrationNumber, taxTreatment);
            if (!trnValidation.valid) throw new Error(trnValidation.error);
            
            // Use the companyId from the data (passed from modal)
            let companyId = data.companyId;
            
            // Validate companyId
            if (!companyId) {
              throw new Error('Company ID is required. Please select a company.');
            }
            
            if (companyId === 'all' || companyId === 'ALL') {
              throw new Error('Please select a specific company, not "All Companies"');
            }
            
            // Validate ObjectId format
            const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(companyId);
            if (!isValidObjectId) {
              throw new Error('Invalid company ID format');
            }
            
            // Create customer with the companyId from the form data
            const res = await customerAPI.create({ ...data, companyId });
            const newCustomer = extractResponseData(res);
            
            set(s => ({ customers: [...s.customers, newCustomer], lastError: null }));
            if (typeof customerAPI.clearCustomerCache === 'function') {
              customerAPI.clearCustomerCache();
            }
            
            await get().fetchCustomerStats(true);
            return { success: true, customer: newCustomer };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, addCustomer: false } }));
          }
        },

        updateCustomer: async (id, data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateCustomer_${id}`]: true } }));
          try {
            // Prevent updating companyId to 'all'
            if (data.companyId === 'all' || data.companyId === 'ALL') {
              delete data.companyId; // Remove companyId from update
            }
            
            const updatedCustomer = { ...get().customers.find(c => c._id === id), ...data };
            set(s => ({ customers: s.customers.map(c => c._id === id ? updatedCustomer : c), lastError: null }));
            
            const res = await customerAPI.update(id, data);
            const finalCustomer = extractResponseData(res);
            set(s => ({ customers: s.customers.map(c => c._id === id ? finalCustomer : c) }));
            
            if (typeof customerAPI.clearCustomerCache === 'function') {
              customerAPI.clearCustomerCache();
            }
            get().fetchCustomerStats(true);
            return { success: true, customer: finalCustomer };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateCustomer_${id}`]: false } }));
          }
        },

        deleteCustomer: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: true } }));
          try {
            const response = await customerAPI.delete(id);
            if (response.data?.success) {
              set(s => ({ customers: s.customers.filter(c => c._id !== id), lastError: null }));
              if (typeof customerAPI.clearCustomerCache === 'function') {
                customerAPI.clearCustomerCache();
              }
              await get().fetchCustomerStats(true);
              return { success: true };
            }
            throw new Error(response.data?.message || 'Failed to delete customer');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: false } }));
          }
        },

        syncCustomersFromZoho: async (fullSync = false) => {
          if (get().operationInProgress.syncCustomers) {
            return { success: false, error: 'Sync already in progress' };
          }
          
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncCustomers: true } }));
          try {
            const response = await customerAPI.syncFromZoho(fullSync);
            if (response.data.success) {
              if (typeof customerAPI.clearCustomerCache === 'function') {
                customerAPI.clearCustomerCache();
              }
              await get().fetchCustomerStats(true);
              await get().fetchAllData();
              return { success: true, stats: response.data.stats };
            }
            throw new Error(response.data.message || 'Sync failed');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, syncCustomers: false } }));
          }
        },

        setCustomerFilters: (filters) => {
          set(state => ({ customerFilters: { ...state.customerFilters, ...filters }, customersPagination: null }));
          get().fetchFilteredCustomers({ ...get().customerFilters, ...filters });
        },

        resetCustomerFilters: () => {
          const defaultFilters = {
            status: 'all', taxStatus: 'all', placeOfSupply: 'all', hasTRN: 'all',
            search: '', minQuotations: null, maxQuotations: null, minTotalValue: null,
            maxTotalValue: null, createdFrom: null, createdTo: null,
            lastActivityFrom: null, lastActivityTo: null, zohoSyncStatus: 'all'
          };
          set({ customerFilters: defaultFilters, customersPagination: null });
          get().fetchFilteredCustomers({});
        },

        // ==================== ITEM ACTIONS ====================

        refreshItems: async (forceRefresh = false) => {
          set({ loading: true });
          try {
            const response = await itemAPI.getAll({ forceRefresh: forceRefresh ? 'true' : 'false' });
            const itemsData = response.data.success ? (response.data.data || []) : (Array.isArray(response.data) ? response.data : response.data?.data || []);
            batchUpdate(set, [['items', itemsData], ['loading', false], ['lastError', null]]);
            return { success: true, items: itemsData };
          } catch (error) {
            batchUpdate(set, [['loading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        debouncedRefreshItems: debounce(async (forceRefresh = false) => get().refreshItems(forceRefresh), 500),

        addItem: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addItem: true } }));
          try {
            const res = await itemAPI.create(data);
            const newItem = extractResponseData(res);
            set(s => ({ items: [...s.items, newItem], lastError: null }));
            return { success: true, item: newItem };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, addItem: false } }));
          }
        },

        updateItem: async (id, data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateItem_${id}`]: true } }));
          try {
            const res = await itemAPI.update(id, data);
            const updated = extractResponseData(res);
            set(s => ({ items: s.items.map(i => i._id === id ? updated : i), lastError: null }));
            return { success: true, item: updated };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateItem_${id}`]: false } }));
          }
        },

        deleteItem: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteItem_${id}`]: true } }));
          try {
            await itemAPI.delete(id);
            set(s => ({ items: s.items.filter(i => i._id !== id), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteItem_${id}`]: false } }));
          }
        },

        syncItems: async () => {
          if (get().operationInProgress.syncItems) {
            return { success: false, error: 'Item sync already in progress' };
          }
          
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: true }, lastError: null }));
          
          try {
            const response = await itemAPI.syncItems();
            if (!response.data.success) throw new Error(response.data.message || 'Sync failed');

            let pollHandle, isResolved = false;
            const timeoutHandle = setTimeout(() => {
              if (pollHandle && !isResolved) {
                clearInterval(pollHandle);
                set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: new AppError('Sync timeout after 60 seconds') }));
              }
            }, 60000);

            const pollForStatus = () => new Promise((resolve) => {
              pollHandle = setInterval(async () => {
                if (isResolved) return;
                try {
                  const statusRes = await itemAPI.getSyncStatus();
                  if (!statusRes.data.status.isSyncing) {
                    isResolved = true;
                    clearInterval(pollHandle);
                    clearTimeout(timeoutHandle);
                    
                    if (statusRes.data.status.lastSyncResult?.success) {
                      await get().refreshItems();
                      set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false } }));
                      resolve({ success: true });
                    } else {
                      const error = new AppError(statusRes.data.status.lastSyncResult?.error || 'Sync failed');
                      set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: error }));
                      resolve({ success: false, error: error.message });
                    }
                  }
                } catch (pollErr) {
                  if (!isResolved) {
                    isResolved = true;
                    clearInterval(pollHandle);
                    clearTimeout(timeoutHandle);
                    set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: AppError.from(pollErr) }));
                    resolve({ success: false, error: getErrorMessage(pollErr) });
                  }
                }
              }, 2000);
            });

            const result = await pollForStatus();
            return { success: result.success, message: result.success ? 'Sync completed' : result.error };
          } catch (error) {
            set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: AppError.from(error) }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ==================== COMPANY & CURRENCY ACTIONS ====================

        setSelectedCompany: (companyId) => {
          // Get current company
          const currentCompany = get().selectedCompany;
          
          // If same company, don't do anything
          if (currentCompany === companyId) {
            console.log('Company already selected, skipping');
            return;
          }
          
          // Prevent switching if already switching
          if (get()._switchingCompany) {
            console.log('Company switch already in progress');
            return;
          }
          
          // Set loading states
          set({ 
            _switchingCompany: true,
            statsLoading: true,
            quotationsLoading: true 
          });
          
          // Save the selection
          persistSelectedCompany(companyId);
          set({ selectedCompany: companyId });
          
          // Handle currency for the new company (skip for 'all')
          if (companyId !== 'all' && companyId !== 'ALL') {
            const company = get().companies.find(c => c._id === companyId || c.code === companyId);
            if (company?.baseCurrency) {
              localStorage.setItem('selectedCurrency', company.baseCurrency);
              set({ selectedCurrency: company.baseCurrency });
              get().fetchExchangeRates(company.baseCurrency);
            }
          }
          
          // Fetch all data for the new company in parallel
          Promise.all([
            get().fetchQuotationsForCompany(companyId),
            get().refreshStats(),
            get().fetchCustomerStats()
          ]).finally(() => {
            // Turn off loading states with a small delay to prevent flicker
            setTimeout(() => {
              set({ 
                _switchingCompany: false,
                statsLoading: false,
                quotationsLoading: false 
              });
            }, 100);
          });
        },

        setSelectedCurrency: (currencyCode) => {
          localStorage.setItem('selectedCurrency', currencyCode);
          set({ selectedCurrency: currencyCode });
          get().fetchExchangeRates(currencyCode);
        },

        fetchExchangeRates: async (base = 'AED') => {
          try {
            const res = await exchangeRateAPI.getRates({ base });
            set({ exchangeRates: res.data });
            return { success: true, data: res.data };
          } catch (error) {
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchSupportedCurrencies: async () => {
          try {
            const res = await exchangeRateAPI.getSupported();
            set({ supportedCurrencies: res.data.currencies });
            return { success: true, data: res.data };
          } catch (error) {
            return { success: false, error: getErrorMessage(error) };
          }
        },

        convertCurrency: async (amount, from, to = 'AED') => {
          try {
            const res = await exchangeRateAPI.convert({ amount, from, to });
            return { success: true, data: res.data };
          } catch (error) {
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchCompanies: async () => {
          try {
            const res = await companyAPI.getAll();
            const companies = res.data.companies || [];
            set({ companies });
            if (companies.length > 0 && !get().selectedCompany) {
              const defaultId = companies[0]._id;
              persistSelectedCompany(defaultId);
              set({ selectedCompany: defaultId });
              const company = companies.find(c => c._id === defaultId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                set({ selectedCurrency: company.baseCurrency });
                get().fetchExchangeRates(company.baseCurrency);
              }
              await get().fetchQuotationsForCompany(defaultId);
            }
            return { success: true, companies };
          } catch (error) {
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ==================== DOCUMENT ACTIONS ====================

        fetchDocuments: async (quotationId) => {
          if (!quotationId) return;
          set({ documentLoading: true });
          try {
            const res = await quotationAPI.documents.getAll(quotationId);
            batchUpdate(set, [['currentDocuments', res.data.documents || []], ['lastError', null]]);
            return { success: true, documents: res.data.documents };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set({ documentLoading: false });
          }
        },

        uploadDocuments: async (quotationId, files, descriptions = []) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, uploadDocs: true } }));
          try {
            const res = await quotationAPI.documents.upload(quotationId, files, descriptions);
            await get().fetchDocuments(quotationId);
            return { success: true, documents: res.data.documents };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, uploadDocs: false } }));
          }
        },

        updateDocumentDescription: async (quotationId, documentId, description) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`updDoc_${documentId}`]: true } }));
          try {
            await quotationAPI.documents.updateDescription(quotationId, documentId, description);
            set(s => ({ currentDocuments: s.currentDocuments.map(d => d._id === documentId ? { ...d, description } : d), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`updDoc_${documentId}`]: false } }));
          }
        },

        deleteDocument: async (quotationId, documentId) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`delDoc_${documentId}`]: true } }));
          try {
            await quotationAPI.documents.delete(quotationId, documentId);
            set(s => ({ currentDocuments: s.currentDocuments.filter(d => d._id !== documentId), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`delDoc_${documentId}`]: false } }));
          }
        },

        downloadDocument: async (quotationId, documentId) => {
          try {
            await quotationAPI.documents.download(quotationId, documentId);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        clearCurrentDocuments: () => set({ currentDocuments: [] }),

        // ==================== STATS ACTIONS ====================

        fetchAdminStats: async (companyId = null) => {
          if (get().user?.role !== 'admin') return;
          set({ statsLoading: true });
          try {
             const params = {};
            if (companyId && companyId !== 'all' && companyId !== 'ALL') {
              params.companyId = companyId;
            }
            const response = await adminAPI.getAdminStats(params);
            batchUpdate(set, [['adminStats', response.data], ['statsLoading', false], ['lastError', null]]);
            return { success: true, stats: response.data };
          } catch (error) {
            batchUpdate(set, [['statsLoading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchOpsStats: async (companyId = null) => {
          if (get().user?.role !== 'ops_manager') return;
          set({ statsLoading: true });
          try {
            const params = { companyId: companyId || get().selectedCompany };
            const response = await opsAPI.getOpsStats(params);
            batchUpdate(set, [['opsStats', response.data.stats], ['statsLoading', false], ['lastError', null]]);
            return { success: true, stats: response.data.stats };
          } catch (error) {
            batchUpdate(set, [['statsLoading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refreshStats: async () => {
          const { user, selectedCompany } = get();
          if (!user) return;
          
          const companyId = (selectedCompany === 'all' || selectedCompany === 'ALL') ? null : selectedCompany;
          
          if (user.role === 'admin') {
            await get().fetchAdminStats(companyId);
          } else if (user.role === 'ops_manager') {
            await get().fetchOpsStats(companyId);
          }
        },

        // ==================== OPS ACTIONS ====================

        opsApproveQuotation: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`opsApprove_${id}`]: true } }));
          try {
            await opsAPI.approveQuotation(id);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`opsApprove_${id}`]: false } }));
          }
        },

        opsRejectQuotation: async (id, reason) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`opsReject_${id}`]: true } }));
          try {
            await opsAPI.rejectQuotation(id, { reason });
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`opsReject_${id}`]: false } }));
          }
        },

        fetchAllOpsQuotations: async (params = {}) => {
          if (get().user?.role !== 'ops_manager') return { success: false, error: 'Unauthorized' };
          
          set({ loading: true, loadError: null });
          try {
            const requestParams = {
              companyId: params.companyId || get().selectedCompany,
              status: params.status,
              search: params.search,
              fromDate: params.fromDate,
              toDate: params.toDate
            };
            
            const response = await opsAPI.getAllQuotations(requestParams);
            batchUpdate(set, [
              ['quotations', response.data.quotations || []],
              ['opsQuotationsCounts', response.data.counts || {}],
              ['loading', false],
              ['lastError', null]
            ]);
            return { success: true, quotations: response.data.quotations, counts: response.data.counts, total: response.data.total };
          } catch (error) {
            batchUpdate(set, [['loading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refreshOpsQuotations: async (params = {}) => {
          if (get().user?.role !== 'ops_manager') return { success: false, error: 'Unauthorized' };
          
          set({ loading: true });
          try {
            const requestParams = {
              companyId: params.companyId || get().selectedCompany,
              status: params.status,
              search: params.search,
              _t: Date.now()
            };
            
            const response = await opsAPI.getAllQuotations(requestParams);
            batchUpdate(set, [
              ['quotations', response.data.quotations || []],
              ['opsQuotationsCounts', response.data.counts || {}],
              ['loading', false],
              ['lastError', null]
            ]);
            return { success: true, quotations: response.data.quotations, counts: response.data.counts };
          } catch (error) {
            batchUpdate(set, [['loading', false], ['lastError', AppError.from(error)]]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ==================== DATA FETCHING ====================

        fetchAllData: async (skipCache = false) => {
          const { user, selectedCompany } = get();
          if (!user) {
            set({ customers: [], items: [], quotations: [], opsReviewHistory: [], companies: [], exchangeRates: null, loading: false, initialized: true });
            return;
          }
          
          set({ loading: true, loadError: null });
          
          try {
            const [customersRes, itemsRes, companiesRes, ratesRes, currenciesRes, gccRes, taxRes, currencyOptsRes] = await Promise.all([
              customerAPI.getAll({ companyId: selectedCompany }, { skipCache }).catch(() => ({ data: [] })),
              itemAPI.getAll({ companyId: selectedCompany }).catch(() => ({ data: [] })),
              companyAPI.getAll().catch(() => ({ data: { companies: [] } })),
              exchangeRateAPI.getRates().catch(() => ({ data: null })),
              exchangeRateAPI.getSupported().catch(() => ({ data: { currencies: null } })),
              customerAPI.getGccCountries().catch(() => ({ data: [] })),
              customerAPI.getTaxTreatments().catch(() => ({ data: [] })),
              customerAPI.getCurrencies().catch(() => ({ data: [] })),
            ]);
        
            const companies = companiesRes.data?.companies || [];
            
            // If no company selected but companies exist, select the first one
            let finalSelectedCompany = selectedCompany;
            if (!finalSelectedCompany && companies.length > 0) {
              finalSelectedCompany = companies[0]._id;
              persistSelectedCompany(finalSelectedCompany);
              set({ selectedCompany: finalSelectedCompany });
            }
            
            batchUpdate(set, [
              ['customers', parseData(customersRes.data)],
              ['items', parseData(itemsRes.data)],
              ['companies', companies],
              ['exchangeRates', ratesRes.data],
              ['supportedCurrencies', currenciesRes.data?.currencies || null],
              ['gccCountries', gccRes.data || []],
              ['taxTreatments', taxRes.data || []],
              ['currencyOptions', currencyOptsRes.data || []],
              ['loadError', null],
              ['lastError', null],
              ['initialized', true]
            ]);
        
            if (companies.length > 0 && !finalSelectedCompany) {
              const defaultId = companies[0]._id;
              persistSelectedCompany(defaultId);
              set({ selectedCompany: defaultId });
              const company = companies.find(c => c._id === defaultId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                set({ selectedCurrency: company.baseCurrency });
              }
              await get().fetchQuotationsForCompany(defaultId);
            } else if (finalSelectedCompany) {
              await get().fetchQuotationsForCompany(finalSelectedCompany);
            }
          } catch (error) {
            batchUpdate(set, [['loadError', getErrorMessage(error)], ['lastError', AppError.from(error)], ['initialized', true]]);
          } finally {
            // FIXED: Only update loading if it's currently true
            if (get().loading) {
              set({ loading: false });
            }
          }
        },

        // ==================== UTILITY ACTIONS ====================

        clearError: () => set({ lastError: null }),
        isOperationInProgress: (key) => get().operationInProgress[key] === true,

        fetchGccCountries: async () => {
          try {
            const r = await customerAPI.getGccCountries();
            set({ gccCountries: r.data || [] });
            return { success: true, countries: r.data };
          } catch (e) {
            return { success: false, error: getErrorMessage(e) };
          }
        },

        fetchTaxTreatments: async () => {
          try {
            const r = await customerAPI.getTaxTreatments();
            set({ taxTreatments: r.data || [] });
            return { success: true, treatments: r.data };
          } catch (e) {
            return { success: false, error: getErrorMessage(e) };
          }
        },

        fetchCurrencyOptions: async () => {
          try {
            const r = await customerAPI.getCurrencies();
            set({ currencyOptions: r.data || [] });
            return { success: true, currencies: r.data };
          } catch (e) {
            return { success: false, error: getErrorMessage(e) };
          }
        },

        validateTrn: (trn, taxTreatment) => {
          if (taxTreatment === 'gcc_vat_registered') {
            if (!trn?.trim()) return { valid: false, error: 'TRN is required for VAT registered customers' };
            if (!/^\d{15}$/.test(trn.trim())) return { valid: false, error: 'TRN must be exactly 15 digits' };
          }
          return { valid: true };
        },

        getCustomerSyncStatus: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, getSyncStatus: true } }));
          try {
            const response = await customerAPI.getSyncStatus();
            if (response.data.success) {
              set(s => ({ customerSyncStatus: response.data.data, lastError: null, operationInProgress: { ...s.operationInProgress, getSyncStatus: false } }));
              return { success: true, status: response.data.data };
            }
            throw new Error(response.data.message || 'Failed to get sync status');
          } catch (error) {
            set(s => ({ lastError: AppError.from(error), operationInProgress: { ...s.operationInProgress, getSyncStatus: false } }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        getPendingSyncCustomers: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, getPendingSync: true } }));
          try {
            const response = await customerAPI.getPendingSync();
            if (response.data.success) {
              set(s => ({ pendingSyncCustomers: response.data.data, lastError: null, operationInProgress: { ...s.operationInProgress, getPendingSync: false } }));
              return { success: true, customers: response.data.data, count: response.data.count };
            }
            throw new Error(response.data.message || 'Failed to get pending sync customers');
          } catch (error) {
            set(s => ({ lastError: AppError.from(error), operationInProgress: { ...s.operationInProgress, getPendingSync: false } }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        forceSyncCustomer: async (customerId) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`forceSync_${customerId}`]: true } }));
          try {
            const response = await customerAPI.forceSyncCustomer(customerId);
            if (response.data.success) {
              set(s => ({ customers: s.customers.map(c => c._id === customerId ? response.data.data : c), lastError: null }));
              await get().fetchCustomerStats();
              return { success: true, customer: response.data.data };
            }
            throw new Error(response.data.message || 'Force sync failed');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`forceSync_${customerId}`]: false } }));
          }
        },

        // ==================== PRIVATE HELPERS ====================

        _loadCompanyData: async () => {
          const setFn = set;
          const getFn = get;
          
          try {
            const companiesRes = await companyAPI.getAll();
            const companies = companiesRes.data?.companies || [];
            const user = getFn().user;
            const userRole = user?.role;
            const userAssignedCompany = user?.companyId || user?.assignedCompany;
            
            let companyId = getFn().selectedCompany;
            
            // If no company is selected, automatically select one
            if (!companyId) {
              if (userAssignedCompany) {
                // User has assigned company - use that
                const assignedCompany = companies.find(c => 
                  c._id === userAssignedCompany || c.code === userAssignedCompany
                );
                if (assignedCompany) {
                  companyId = assignedCompany._id;
                  persistSelectedCompany(companyId);
                }
              }
              
              // If still no company (no assigned or assigned not found), take first company
              if (!companyId && companies.length > 0) {
                companyId = companies[0]._id;
                persistSelectedCompany(companyId);
              }
            }
            
            // Update store with companies
            setFn({ companies });
            
            // Set the selected company if we have one (for ALL roles)
            if (companyId && companyId !== 'all' && companyId !== 'ALL') {
              // For ops_manager, ensure they only get their assigned company
              if (userRole === 'ops_manager' && userAssignedCompany && companyId !== userAssignedCompany) {
                // Force to their assigned company
                companyId = userAssignedCompany;
                persistSelectedCompany(companyId);
              }
              
              setFn({ selectedCompany: companyId });
              
              const company = companies.find(c => c._id === companyId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                setFn({ selectedCurrency: company.baseCurrency });
                await getFn().fetchExchangeRates(company.baseCurrency);
              }
              
              // Fetch all data for this company
              const [customersRes, itemsRes, ratesRes, currenciesRes, gccRes, taxRes, currencyOptsRes] = await Promise.all([
                customerAPI.getAll({ companyId: companyId }).catch(() => ({ data: [] })),
                itemAPI.getAll({ companyId: companyId }).catch(() => ({ data: [] })),
                exchangeRateAPI.getRates().catch(() => ({ data: null })),
                exchangeRateAPI.getSupported().catch(() => ({ data: { currencies: null } })),
                customerAPI.getGccCountries().catch(() => ({ data: [] })),
                customerAPI.getTaxTreatments().catch(() => ({ data: [] })),
                customerAPI.getCurrencies().catch(() => ({ data: [] })),
              ]);
              
              batchUpdate(setFn, [
                ['customers', parseData(customersRes.data)],
                ['items', parseData(itemsRes.data)],
                ['exchangeRates', ratesRes.data],
                ['supportedCurrencies', currenciesRes.data?.currencies || null],
                ['gccCountries', gccRes.data || []],
                ['taxTreatments', taxRes.data || []],
                ['currencyOptions', currencyOptsRes.data || []],
                ['initialized', true],
                ['loading', false],
                ['lastError', null]
              ]);
              
              // ✅ Fetch quotations for the specific company
              await getFn().fetchQuotationsForCompany(companyId);
              
              // ✅ Fetch stats for the specific company (NOT all companies)
              if (userRole === 'admin') {
                await getFn().fetchAdminStats(companyId);
              } else if (userRole === 'ops_manager') {
                await getFn().fetchOpsStats(companyId);
              }
              
              // ✅ Fetch customer stats for the specific company
              await getFn().fetchCustomerStats();
              
            } else if (companies.length > 0) {
              // Fallback: take first company
              const firstCompanyId = companies[0]._id;
              persistSelectedCompany(firstCompanyId);
              setFn({ selectedCompany: firstCompanyId });
              
              const company = companies.find(c => c._id === firstCompanyId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                setFn({ selectedCurrency: company.baseCurrency });
                await getFn().fetchExchangeRates(company.baseCurrency);
              }
              
              const [customersRes, itemsRes, ratesRes, currenciesRes, gccRes, taxRes, currencyOptsRes] = await Promise.all([
                customerAPI.getAll({ companyId: firstCompanyId }).catch(() => ({ data: [] })),
                itemAPI.getAll({ companyId: firstCompanyId }).catch(() => ({ data: [] })),
                exchangeRateAPI.getRates().catch(() => ({ data: null })),
                exchangeRateAPI.getSupported().catch(() => ({ data: { currencies: null } })),
                customerAPI.getGccCountries().catch(() => ({ data: [] })),
                customerAPI.getTaxTreatments().catch(() => ({ data: [] })),
                customerAPI.getCurrencies().catch(() => ({ data: [] })),
              ]);
              
              batchUpdate(setFn, [
                ['customers', parseData(customersRes.data)],
                ['items', parseData(itemsRes.data)],
                ['exchangeRates', ratesRes.data],
                ['supportedCurrencies', currenciesRes.data?.currencies || null],
                ['gccCountries', gccRes.data || []],
                ['taxTreatments', taxRes.data || []],
                ['currencyOptions', currencyOptsRes.data || []],
                ['initialized', true],
                ['loading', false],
                ['lastError', null]
              ]);
              
              // ✅ Fetch quotations and stats for the first company
              await getFn().fetchQuotationsForCompany(firstCompanyId);
              
              if (userRole === 'admin') {
                await getFn().fetchAdminStats(firstCompanyId);
              } else if (userRole === 'ops_manager') {
                await getFn().fetchOpsStats(firstCompanyId);
              }
              
              await getFn().fetchCustomerStats();
              
            } else {
              batchUpdate(setFn, [['initialized', true], ['loading', false]]);
            }
          } catch (err) {
            console.error('Load company data error:', err);
            batchUpdate(setFn, [['loading', false], ['lastError', AppError.from(err)], ['initialized', true]]);
          }
        },
      }),
      { 
        name: 'app-store', 
        partialize: (state) => ({
          user: state.user,
          selectedCompany: state.selectedCompany,
          selectedCurrency: state.selectedCurrency,
          gccCountries: state.gccCountries,
          taxTreatments: state.taxTreatments,
          currencyOptions: state.currencyOptions,
          customerStats: state.customerStats,
          customerFilters: state.customerFilters,
        })
      }
    ),
    { name: 'AppStore' }
  )
);

// ==================== CUSTOM HOOKS ====================

export const useCompanyQuotations = () => {
  const quotations = useAppStore((state) => state.quotations);
  const quotationsPagination = useAppStore((state) => state.quotationsPagination);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  const loading = useAppStore((state) => state.quotationsLoading);
  const quotationsVersion = useAppStore((state) => state.quotationsVersion);
  const refetchQuotations = useAppStore((state) => state.refetchQuotations);
  const quotationsInitialized = useAppStore((state) => state.quotationsInitialized);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const isRefreshingRef = useRef(false);
  
  const previousCompanyRef = useRef(selectedCompany);
  
  useEffect(() => {
    if (previousCompanyRef.current !== selectedCompany) {
      setPage(1);
      previousCompanyRef.current = selectedCompany;
    }
  }, [selectedCompany]);
  
  const filteredQuotations = useMemo(() => {
    return Array.isArray(quotations) ? quotations : [];
  }, [quotations]);
  
  const refresh = useCallback(async (options = {}) => {
    if (!selectedCompany) return { success: false };
    if (isRefreshingRef.current) return { success: false, message: 'Already refreshing' };
    
    isRefreshingRef.current = true;
    
    try {
      const usePage = options.page !== undefined ? options.page : page;
      const useLimit = options.limit !== undefined ? options.limit : limit;
      
      const companyIdParam = (selectedCompany === 'all' || selectedCompany === 'ALL') ? 'all' : selectedCompany;
      const result = await refetchQuotations({ 
        companyId: companyIdParam, 
        page: usePage,
        limit: useLimit,
        status: options.status,
        search: options.search,
        fromDate: options.fromDate,
        toDate: options.toDate,
        sortBy: options.sortBy,
        sortDir: options.sortDir,
        ...options 
      });
      
      // ✅ FIX: Update local page/limit from result pagination
      if (result?.pagination) {
        setPage(result.pagination.page);
        setLimit(result.pagination.limit);
      } else if (result?.data?.total !== undefined && result?.data?.quotations?.length) {
        // Fallback: calculate from response
        const returnedCount = result.data.quotations.length;
        const totalItems = result.data.total;
        const currentPage = usePage;
        const currentLimit = useLimit;
        
        // Only update if we have pagination info from the response
        if (totalItems !== undefined) {
          const calculatedTotalPages = Math.ceil(totalItems / currentLimit);
          // Don't auto-update page/limit here, keep as is
        }
      }
      
      return result;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [selectedCompany, refetchQuotations, page, limit]);
  
  const goToPage = useCallback((newPage) => {
    if (newPage === page) return;
    setPage(newPage);
    refresh({ page: newPage, limit });
  }, [refresh, limit, page]);
  
  const changeLimit = useCallback((newLimit) => {
    if (newLimit === limit) return;
    setLimit(newLimit);
    setPage(1);
    refresh({ page: 1, limit: newLimit });
  }, [refresh, limit]);

  const resetPagination = useCallback(() => {
    setPage(1);
    refresh({ page: 1, limit });
  }, [refresh, limit]);

  return {
    quotations: filteredQuotations,
    pagination: quotationsPagination,
    quotationsInitialized,
    quotationsLoading: loading,
    totalCount: filteredQuotations.length,
    refresh,
    goToPage,
    changeLimit,
    resetPagination,  
    currentPage: page,
    currentLimit: limit,
    version: quotationsVersion,
  };
};

export const useDocuments = (quotationId) => {
  const { currentDocuments, documentLoading, fetchDocuments, uploadDocuments,
    updateDocumentDescription, deleteDocument, downloadDocument, clearCurrentDocuments } = useAppStore();
  const previousQuotationId = useRef();

  useEffect(() => {
    if (quotationId && quotationId !== previousQuotationId.current) {
      previousQuotationId.current = quotationId;
      fetchDocuments(quotationId);
    } else if (!quotationId) {
      clearCurrentDocuments();
    }
  }, [quotationId, fetchDocuments, clearCurrentDocuments]);

  const formatFileSize = useCallback((bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getFileIcon = useCallback((mimeType) => {
    if (!mimeType) return '📎';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel')) return '📊';
    return '📎';
  }, []);

  return {
    documents: currentDocuments,
    loading: documentLoading,
    fetchDocuments: useCallback(() => fetchDocuments(quotationId), [quotationId, fetchDocuments]),
    uploadDocuments: useCallback((files, descs) => uploadDocuments(quotationId, files, descs), [quotationId, uploadDocuments]),
    updateDescription: useCallback((docId, desc) => updateDocumentDescription(quotationId, docId, desc), [quotationId, updateDocumentDescription]),
    deleteDocument: useCallback((docId) => deleteDocument(quotationId, docId), [quotationId, deleteDocument]),
    downloadDocument: useCallback((docId) => downloadDocument(quotationId, docId), [quotationId, downloadDocument]),
    formatFileSize,
    getFileIcon,
  };
};

export const useInitializeApp = () => {
  const fetchAllData = useAppStore(s => s.fetchAllData);
  const userId = useAppStore(s => s.user?._id ?? s.user?.id ?? null);
  const initialized = useRef(false);

  useEffect(() => {
    if (userId && !initialized.current) {
      initialized.current = true;
      fetchAllData();
    }
  }, [userId, fetchAllData]);
};

export const useInitializeStore = useInitializeApp;

export const useCompanyContext = () => {
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const companies = useAppStore(s => s.companies);
  const setSelectedCompany = useAppStore(s => s.setSelectedCompany);
  const selectedCurrency = useAppStore(s => s.selectedCurrency);
  const setSelectedCurrency = useAppStore(s => s.setSelectedCurrency);

  const currentCompany = useMemo(() => {
    if (!selectedCompany) return null;
    return companies.find(c => c._id === selectedCompany || c.code === selectedCompany);
  }, [companies, selectedCompany]);

  return {
    selectedCompany,
    currentCompany,
    companies,
    setSelectedCompany,
    selectedCurrency,
    setSelectedCurrency,
    hasCompany: !!selectedCompany,
    companyName: currentCompany?.name || '',
    companyCode: currentCompany?.code || '',
    companyCurrency: currentCompany?.baseCurrency || selectedCurrency || 'AED',
  };
};

export const useCustomerStatsWithCompany = () => {
  const customerStats = useAppStore(s => s.customerStats);
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const fetchCustomerStats = useAppStore(s => s.fetchCustomerStats);
  const loading = useAppStore(s => s.operationInProgress.fetchCustomerStats);
  const customerFilters = useAppStore(s => s.customerFilters);
  const fetchFilteredCustomers = useAppStore(s => s.fetchFilteredCustomers);
  const setCustomerFilters = useAppStore(s => s.setCustomerFilters);
  const resetCustomerFilters = useAppStore(s => s.resetCustomerFilters);
  const customers = useAppStore(s => s.customers);
  const customersPagination = useAppStore(s => s.customersPagination);
  const [localLoading, setLocalLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLocalLoading(true);
    try {
      await fetchCustomerStats(customerFilters);
      await fetchFilteredCustomers(customerFilters);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchCustomerStats, fetchFilteredCustomers, customerFilters]);

  useEffect(() => {
    if (selectedCompany) {
      refetch();
    }
  }, [selectedCompany, refetch]);

  return {
    stats: customerStats,
    customers,
    customersPagination,
    loading: loading === true || localLoading,
    refetch,
    refetchCustomers: () => fetchFilteredCustomers(customerFilters),
    totalCustomers: customerStats?.totalCustomers || 0,
    activeCustomers: customerStats?.activeCustomers || 0,
    vatRegistered: customerStats?.vatRegistered || 0,
    nonVatRegistered: customerStats?.nonVatRegistered || 0,
    synced: customerStats?.synced || 0,
    unsynced: customerStats?.unsynced || 0,
    customerFilters,
    setCustomerFilters,
    resetCustomerFilters,
  };
};