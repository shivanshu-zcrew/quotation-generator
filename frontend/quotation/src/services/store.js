// store.js (OPTIMIZED VERSION)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  customerAPI, itemAPI, quotationAPI, authAPI, adminAPI, opsAPI,
  companyAPI, exchangeRateAPI, getCurrentUser, isAuthenticated,
  setAuthData, clearAuthData, setSelectedCompany as persistSelectedCompany,
  getSelectedCompany, clearCompanyContext,
} from './api';

// ==================== OPTIMIZATION: Batch Updates ====================
const batchUpdate = (set, updates) => {
  set((state) => {
    const newState = { ...state };
    updates.forEach(([key, value]) => {
      if (typeof value === 'function') {
        newState[key] = value(state[key]);
      } else {
        newState[key] = value;
      }
    });
    return newState;
  });
};

// ==================== OPTIMIZATION: Debounced Actions ====================
const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

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

const extractResponseData = (res) => {
  if (res?.data?.data && typeof res.data.data === 'object') return res.data.data;
  if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
  return res;
};

export const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({
        // State
        user: isAuthenticated() ? getCurrentUser() : null,
        customers: [],
        initialized: false,
        customerSyncStatus: null,
        pendingSyncCustomers: [],
        items: [],
        quotations: [],
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

        // ==================== OPTIMIZED AUTH ====================
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
              name: userData.name, email: userData.email,
              role: userData.role, token,
            };
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            
            // Batch update to reduce re-renders
            batchUpdate(set, [
              ['user', user],
              ['lastError', null],
              ['loading', true]
            ]);
            
            try {
              const companiesRes = await companyAPI.getAll();
              const companies = companiesRes.data?.companies || [];
              
              let companyId = get().selectedCompany;
              
              if (!companyId && companies.length > 0) {
                companyId = companies[0]._id;
                persistSelectedCompany(companyId);
                batchUpdate(set, [
                  ['selectedCompany', companyId],
                  ['companies', companies]
                ]);
                
                const company = companies.find(c => c._id === companyId);
                if (company?.baseCurrency) {
                  localStorage.setItem('selectedCurrency', company.baseCurrency);
                  batchUpdate(set, [
                    ['selectedCurrency', company.baseCurrency]
                  ]);
                  await get().fetchExchangeRates(company.baseCurrency);
                }
              } else {
                set({ companies });
              }
              
              if (companyId) {
                const params = { companyId };
                
                // Parallel fetch with error isolation
                const [
                  customersRes, itemsRes, ratesRes, 
                  currenciesRes, gccRes, taxRes, currencyOptsRes
                ] = await Promise.all([
                  customerAPI.getAll(params).catch(() => ({ data: [] })),
                  itemAPI.getAll(params).catch(() => ({ data: [] })),
                  exchangeRateAPI.getRates().catch(() => ({ data: null })),
                  exchangeRateAPI.getSupported().catch(() => ({ data: { currencies: null } })),
                  customerAPI.getGccCountries().catch(() => ({ data: [] })),
                  customerAPI.getTaxTreatments().catch(() => ({ data: [] })),
                  customerAPI.getCurrencies().catch(() => ({ data: [] })),
                ]);
                
                const parseData = (d) => (Array.isArray(d) ? d : d?.data ?? []);
                
                // Single batch update for all data
                batchUpdate(set, [
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
                
                await get().fetchQuotationsForCompany(companyId);
              } else {
                batchUpdate(set, [
                  ['initialized', true],
                  ['loading', false]
                ]);
              }
              
            } catch (err) {
              batchUpdate(set, [
                ['loading', false],
                ['lastError', AppError.from(err)],
                ['initialized', true]
              ]);
            }
            
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
            batchUpdate(set, [
              ['user', res.data],
              ['lastError', null]
            ]);
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
          set({
            user: null, customers: [], items: [], quotations: [],
            opsReviewHistory: [], companies: [],
            exchangeRates: null, supportedCurrencies: null,
            selectedCompany: null, selectedCurrency: 'AED',
            currentDocuments: [], documentLoading: false,
            loading: false, loadError: null, lastError: null,
            operationInProgress: {},
          });
        },

        // ==================== OPTIMIZED QUOTATIONS ====================
        fetchQuotationsForCompany: async (companyId) => {
          const { user } = get();
          if (!user || !companyId) return;
          set({ loading: true, loadError: null });
          try {
            const params = { companyId };
            let quotationsData = [];
            
            if (user.role === 'admin') {
              const r = await adminAPI.getAllQuotations(params);
              quotationsData = r?.data?.data || r?.data || [];
            } else if (user.role === 'ops_manager') {
              const [pendingRes, historyRes] = await Promise.all([
                opsAPI.getPendingQuotations(params).catch(() => ({ data: { data: [] } })),
                opsAPI.getReviewHistory(params).catch(() => ({ data: { data: [] } })),
              ]);
              quotationsData = [
                ...(pendingRes?.data?.data || pendingRes?.data || []),
                ...(historyRes?.data?.data || historyRes?.data || []),
              ];
            } else {
              const r = await quotationAPI.getMyQuotations(params);
              quotationsData = r?.data?.data || r?.data || [];
            }
            
            batchUpdate(set, [
              ['quotations', quotationsData],
              ['loading', false],
              ['lastError', null]
            ]);
            return { success: true, quotations: quotationsData };
          } catch (error) {
            batchUpdate(set, [
              ['loading', false],
              ['lastError', AppError.from(error)]
            ]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ==================== OPTIMIZED: Debounced Refresh ====================
        refreshItems: async (forceRefresh = false) => {
          set({ loading: true });
          try {
            const response = await itemAPI.getAll({ forceRefresh: forceRefresh ? 'true' : 'false' });
            const itemsData = response.data.success
              ? (response.data.data || [])
              : (Array.isArray(response.data) ? response.data : response.data?.data || []);
            batchUpdate(set, [
              ['items', itemsData],
              ['loading', false],
              ['lastError', null]
            ]);
            return { success: true, items: itemsData };
          } catch (error) {
            batchUpdate(set, [
              ['loading', false],
              ['lastError', AppError.from(error)]
            ]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // Debounced version for search/typing
        debouncedRefreshItems: debounce(async (forceRefresh = false) => {
          return get().refreshItems(forceRefresh);
        }, 500),

        // ==================== OPTIMIZED: Customer Stats with Cache ====================
        fetchCustomerStats: async (forceRefresh = false) => {
          const { customerStats, operationInProgress } = get();
          if (operationInProgress.fetchCustomerStats && !forceRefresh) {
            return { success: true, stats: customerStats };
          }
          
          set(s => ({ operationInProgress: { ...s.operationInProgress, fetchCustomerStats: true } }));
          try {
            const res = await customerAPI.getStats();
            if (res.data.success) {
              const statsData = res.data.stats || res.data;
              batchUpdate(set, [
                ['customerStats', statsData],
                ['lastError', null]
              ]);
              return { success: true, stats: statsData };
            }
            throw new Error(res.data.message || 'Failed to fetch stats');
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, fetchCustomerStats: false } }));
          }
        },

        // ==================== OPTIMIZED: Batch CRUD Operations ====================
        addCustomer: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addCustomer: true } }));
          try {
            const taxTreatment = data.taxTreatment || 'gcc_non_vat_registered';
            const trnValidation = get().validateTrn(data.taxRegistrationNumber, taxTreatment);
            if (!trnValidation.valid) throw new Error(trnValidation.error);
            const res = await customerAPI.create({ ...data, companyId: get().selectedCompany });
            const newCustomer = extractResponseData(res);
            
            // Optimistic update with rollback
            const previousCustomers = get().customers;
            set(s => ({ customers: [...s.customers, newCustomer], lastError: null }));
            
            try {
              await get().fetchCustomerStats(true);
              return { success: true, customer: newCustomer };
            } catch (statsError) {
              // Rollback if stats update fails
              set({ customers: previousCustomers });
              throw statsError;
            }
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
            if (data.taxTreatment || data.taxRegistrationNumber) {
              const existing = get().customers.find(c => c._id === id);
              const taxTreatment = data.taxTreatment || existing?.taxTreatment;
              const trn = data.taxRegistrationNumber !== undefined ? data.taxRegistrationNumber : existing?.taxRegistrationNumber;
              const validation = get().validateTrn(trn, taxTreatment);
              if (!validation.valid) throw new Error(validation.error);
            }
            
            // Optimistic update
            const previousCustomers = get().customers;
            const updatedCustomer = { ...get().customers.find(c => c._id === id), ...data };
            set(s => ({ customers: s.customers.map(c => c._id === id ? updatedCustomer : c), lastError: null }));
            
            try {
              const res = await customerAPI.update(id, data);
              const finalCustomer = extractResponseData(res);
              set(s => ({ customers: s.customers.map(c => c._id === id ? finalCustomer : c) }));
              get().fetchCustomerStats(true);
              return { success: true, customer: finalCustomer };
            } catch (error) {
              // Rollback on failure
              set({ customers: previousCustomers });
              throw error;
            }
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
            const previousCustomers = get().customers;
            set(s => ({ customers: s.customers.filter(c => c._id !== id), lastError: null }));
            
            try {
              await customerAPI.delete(id);
              get().fetchCustomerStats(true);
              return { success: true };
            } catch (error) {
              set({ customers: previousCustomers });
              throw error;
            }
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: false } }));
          }
        },

        // ==================== OPTIMIZED: Sync with Progress ====================
        syncCustomersFromZoho: async (fullSync = false) => {
          const { operationInProgress } = get();
          if (operationInProgress.syncCustomers) {
            return { success: false, error: 'Sync already in progress' };
          }
          
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncCustomers: true } }));
          try {
            const response = await customerAPI.syncFromZoho(fullSync);
            if (response.data.success) {
              batchUpdate(set, [
                ['lastError', null]
              ]);
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

        // ==================== OPTIMIZED: Item Sync with Timeout Protection ====================
        syncItems: async () => {
          const { operationInProgress } = get();
          if (operationInProgress.syncItems) {
            return { success: false, error: 'Item sync already in progress' };
          }
          
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: true }, lastError: null }));
          try {
            const response = await itemAPI.syncItems();
            if (!response.data.success) throw new Error(response.data.message || 'Sync failed');

            let pollHandle;
            let isResolved = false;
            
            const timeoutHandle = setTimeout(() => {
              if (pollHandle && !isResolved) {
                clearInterval(pollHandle);
                set(s => ({ 
                  operationInProgress: { ...s.operationInProgress, syncItems: false },
                  lastError: new AppError('Sync timeout after 60 seconds')
                }));
              }
            }, 60000);

            const pollForStatus = () => {
              return new Promise((resolve) => {
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
                        set(s => ({ 
                          operationInProgress: { ...s.operationInProgress, syncItems: false },
                          lastError: error
                        }));
                        resolve({ success: false, error: error.message });
                      }
                    }
                  } catch (pollErr) {
                    if (!isResolved) {
                      isResolved = true;
                      clearInterval(pollHandle);
                      clearTimeout(timeoutHandle);
                      set(s => ({ 
                        operationInProgress: { ...s.operationInProgress, syncItems: false },
                        lastError: AppError.from(pollErr)
                      }));
                      resolve({ success: false, error: getErrorMessage(pollErr) });
                    }
                  }
                }, 2000);
              });
            };

            const result = await pollForStatus();
            return { success: result.success, message: result.success ? 'Sync completed' : result.error };
          } catch (error) {
            set(s => ({ 
              operationInProgress: { ...s.operationInProgress, syncItems: false }, 
              lastError: AppError.from(error) 
            }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ==================== EXISTING METHODS (unchanged but optimized) ====================
        setSelectedCompany: (companyId) => {
          persistSelectedCompany(companyId);
          set({ selectedCompany: companyId });
          const company = get().companies.find(c => c._id === companyId || c.code === companyId);
          if (company?.baseCurrency) {
            localStorage.setItem('selectedCurrency', company.baseCurrency);
            set({ selectedCurrency: company.baseCurrency });
            get().fetchExchangeRates(company.baseCurrency);
          }
          get().fetchQuotationsForCompany(companyId);
          get().refreshStats();
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

        fetchDocuments: async (quotationId) => {
          if (!quotationId) return;
          set({ documentLoading: true });
          try {
            const res = await quotationAPI.documents.getAll(quotationId);
            batchUpdate(set, [
              ['currentDocuments', res.data.documents || []],
              ['lastError', null]
            ]);
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
            set(s => ({
              currentDocuments: s.currentDocuments.map(d => d._id === documentId ? { ...d, description } : d),
              lastError: null,
            }));
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
            set(s => ({
              currentDocuments: s.currentDocuments.filter(d => d._id !== documentId),
              lastError: null,
            }));
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

        fetchAllData: async () => {
          const { user } = get();
          if (!user) {
            set({ customers: [], items: [], quotations: [], opsReviewHistory: [], companies: [], exchangeRates: null, loading: false, initialized: true });
            return;
          }
          set({ loading: true, loadError: null });
          try {
            const selectedCompanyId = get().selectedCompany;
            const params = selectedCompanyId ? { companyId: selectedCompanyId } : {};

            const [customersRes, itemsRes, companiesRes, ratesRes, currenciesRes, gccRes, taxRes, currencyOptsRes] = await Promise.all([
              customerAPI.getAll(params).catch(() => ({ data: [] })),
              itemAPI.getAll(params).catch(() => ({ data: [] })),
              companyAPI.getAll().catch(() => ({ data: { companies: [] } })),
              exchangeRateAPI.getRates().catch(() => ({ data: null })),
              exchangeRateAPI.getSupported().catch(() => ({ data: { currencies: null } })),
              customerAPI.getGccCountries().catch(() => ({ data: [] })),
              customerAPI.getTaxTreatments().catch(() => ({ data: [] })),
              customerAPI.getCurrencies().catch(() => ({ data: [] })),
            ]);

            const parseData = (d) => (Array.isArray(d) ? d : d?.data ?? []);
            const companies = companiesRes.data?.companies || [];
            
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

            if (companies.length > 0 && !get().selectedCompany) {
              const defaultId = companies[0]._id;
              persistSelectedCompany(defaultId);
              set({ selectedCompany: defaultId });
              const company = companies.find(c => c._id === defaultId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                set({ selectedCurrency: company.baseCurrency });
              }
              await get().fetchQuotationsForCompany(defaultId);
            } else if (get().selectedCompany) {
              await get().fetchQuotationsForCompany(get().selectedCompany);
            }
          } catch (error) {
            batchUpdate(set, [
              ['loadError', getErrorMessage(error)],
              ['lastError', AppError.from(error)],
              ['initialized', true]
            ]);
          } finally {
            set(s => s.loading ? { loading: false } : {});
          }
        },

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

        invalidateQuotations: () => {
          set(state => ({ quotationsVersion: state.quotationsVersion + 1 }));
        },

 refetchQuotations: async () => {
  const { selectedCompany, user } = get();
  if (!user || !selectedCompany) return { success: false };
  
   set({ loading: true });
  
  try {
    const params = { 
      companyId: selectedCompany,
      _t: Date.now() 
    };
    let quotationsData = [];
    
    if (user.role === 'admin') {
      const r = await adminAPI.getAllQuotations(params);
      quotationsData = r?.data?.data || r?.data || [];
    } else if (user.role === 'ops_manager') {
      const [pendingRes, historyRes] = await Promise.all([
        opsAPI.getPendingQuotations(params).catch(() => ({ data: { data: [] } })),
        opsAPI.getReviewHistory(params).catch(() => ({ data: { data: [] } })),
      ]);
      quotationsData = [
        ...(pendingRes?.data?.data || pendingRes?.data || []),
        ...(historyRes?.data?.data || historyRes?.data || []),
      ];
    } else {
      const r = await quotationAPI.getMyQuotations(params);
      quotationsData = r?.data?.data || r?.data || [];
    }
     
    const currentQuotations = get().quotations;
     
    set(state => ({ 
      quotations: quotationsData,
      quotationsVersion: state.quotationsVersion + 1,
      loading: false,
      lastError: null
    }));
    
    return { success: true, data: quotationsData };
  } catch (error) {
     set({ 
      loading: false, 
      lastError: AppError.from(error) 
    });
    return { success: false, error: getErrorMessage(error) };
  }
},

       addQuotation: async (data) => {
  set(s => ({ operationInProgress: { ...s.operationInProgress, addQuotation: true } }));
  try {
    const response = await quotationAPI.create({ ...data, companyId: data.companyId || get().selectedCompany });
    const responseData = response?.data;
    if (responseData?.success === true) {
      const newQuotation = responseData.quotation;
       
      if (newQuotation) {
        set(s => ({ 
          quotations: [newQuotation, ...s.quotations],
          lastError: null 
        }));
      } 
      await get().refetchQuotations();
      
      return { 
        success: true, 
        quotation: newQuotation,
        message: responseData.message 
      };
    }
    throw new Error(responseData?.message || 'Failed to create quotation');
  } catch (error) {
    const errorMessage = error?.response?.data?.message || error?.message || 'Failed to create quotation';
    set({ lastError: AppError.from(error) });
    return { success: false, error: errorMessage };
  } finally {
    set(s => ({ operationInProgress: { ...s.operationInProgress, addQuotation: false } }));
  }
},


updateQuotation: async (id, data) => {
  set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateQuotation_${id}`]: true } }));
  try {
    const result = await quotationAPI.update(id, data);
    
    if (result?.data?.success) {
     
      await get().refetchQuotations();
      return { success: true, quotation: result?.data?.quotation };
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

  
 awardQuotation: async (id, awarded, awardNote = '') => {
  set(s => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: true } }));
  
  try {
    const res = await quotationAPI.awardQuotation(id, awarded, awardNote);
    
    if (res?.data?.success == true) {
      const updatedQuotation = res.data.quotation;
  
       
      set(state => {
        const updatedQuotations = state.quotations.map(q => {
          if (q._id === id) {
             return { ...q, ...updatedQuotation };
          }
          return q;
        });
        
         const updatedQ = updatedQuotations.find(q => q._id === id);
         
        return {
          quotations: updatedQuotations,
          quotationsVersion: state.quotationsVersion + 1,
          lastError: null
        };
      });
      
      return { 
        success: true, 
        quotation: updatedQuotation 
      };
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
      
      set(s => ({ 
        quotations: s.quotations.map(q => q._id === id ? updatedQuotation : q),
        lastError: null 
      }));
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
      
      set(s => ({ 
        quotations: s.quotations.map(q => q._id === id ? updatedQuotation : q),
        lastError: null 
      }));
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

        fetchAdminStats: async (companyId = null) => {
          if (get().user?.role !== 'admin') return;
          set({ statsLoading: true });
          try {
            const params = { companyId: companyId || get().selectedCompany };
            const response = await adminAPI.getAdminStats(params);
            batchUpdate(set, [
              ['adminStats', response.data],
              ['statsLoading', false],
              ['lastError', null]
            ]);
            return { success: true, stats: response.data };
          } catch (error) {
            batchUpdate(set, [
              ['statsLoading', false],
              ['lastError', AppError.from(error)]
            ]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchOpsStats: async (companyId = null) => {
          if (get().user?.role !== 'ops_manager') return;
          set({ statsLoading: true });
          try {
            const params = { companyId: companyId || get().selectedCompany };
            const response = await opsAPI.getOpsStats(params);
            batchUpdate(set, [
              ['opsStats', response.data.stats],
              ['statsLoading', false],
              ['lastError', null]
            ]);
            return { success: true, stats: response.data.stats };
          } catch (error) {
            batchUpdate(set, [
              ['statsLoading', false],
              ['lastError', AppError.from(error)]
            ]);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refreshStats: async () => {
          const { user, selectedCompany } = get();
          if (!user) return;
          if (user.role === 'admin') await get().fetchAdminStats(selectedCompany);
          else if (user.role === 'ops_manager') await get().fetchOpsStats(selectedCompany);
        },

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

        getCustomerSyncStatus: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, getSyncStatus: true } }));
          try {
            const response = await customerAPI.getSyncStatus();
            if (response.data.success) {
              set(s => ({
                customerSyncStatus: response.data.data, lastError: null,
                operationInProgress: { ...s.operationInProgress, getSyncStatus: false },
              }));
              return { success: true, status: response.data.data };
            }
            throw new Error(response.data.message || 'Failed to get sync status');
          } catch (error) {
            set(s => ({
              lastError: AppError.from(error),
              operationInProgress: { ...s.operationInProgress, getSyncStatus: false },
            }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        getPendingSyncCustomers: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, getPendingSync: true } }));
          try {
            const response = await customerAPI.getPendingSync();
            if (response.data.success) {
              set(s => ({
                pendingSyncCustomers: response.data.data, lastError: null,
                operationInProgress: { ...s.operationInProgress, getPendingSync: false },
              }));
              return { success: true, customers: response.data.data, count: response.data.count };
            }
            throw new Error(response.data.message || 'Failed to get pending sync customers');
          } catch (error) {
            set(s => ({
              lastError: AppError.from(error),
              operationInProgress: { ...s.operationInProgress, getPendingSync: false },
            }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        forceSyncCustomer: async (customerId) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`forceSync_${customerId}`]: true } }));
          try {
            const response = await customerAPI.forceSyncCustomer(customerId);
            if (response.data.success) {
              set(s => ({
                customers: s.customers.map(c => c._id === customerId ? response.data.data : c),
                lastError: null,
              }));
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
        }),
      }
    ),
    { name: 'AppStore' }
  )
);

// ==================== OPTIMIZED HOOKS ====================
import { useMemo, useEffect, useCallback, useRef } from 'react';

 export const useCompanyQuotations = () => {
   const quotations = useAppStore((state) => state.quotations);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  const loading = useAppStore((state) => state.loading);
  const quotationsVersion = useAppStore((state) => state.quotationsVersion);
  const refetchQuotations = useAppStore((state) => state.refetchQuotations);

  const filteredQuotations = useMemo(() => {
    if (!selectedCompany) return [];
    return quotations.filter(q => {
      const qCompanyId = q.companyId?._id || q.companyId;
      return qCompanyId === selectedCompany;
    });
  }, [quotations, selectedCompany, quotationsVersion]);  
  const refresh = useCallback(async () => {
    if (selectedCompany) {
      const result = await refetchQuotations();
      return result;
    }
    return { success: false };
  }, [selectedCompany, refetchQuotations]);

  return {
    quotations: filteredQuotations,
    loading,
    totalCount: filteredQuotations.length,
    refresh,
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

  useEffect(() => {
    if (selectedCompany) fetchCustomerStats();
  }, [selectedCompany, fetchCustomerStats]);

  return {
    stats: customerStats,
    loading: loading === true,
    refetch: fetchCustomerStats,
    totalCustomers: customerStats?.totalCustomers || 0,
    activeCustomers: customerStats?.activeCustomers || 0,
    vatRegistered: customerStats?.vatRegistered || 0,
    nonVatRegistered: customerStats?.nonVatRegistered || 0,
    synced: customerStats?.synced || 0,
    unsynced: customerStats?.unsynced || 0,
  };
};