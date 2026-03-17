import React from 'react';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  customerAPI,
  itemAPI,
  quotationAPI,
  authAPI,
  adminAPI,
  opsAPI,
  companyAPI,
  exchangeRateAPI,
  getCurrentUser,
  isAuthenticated,
  setAuthData,
  clearAuthData,
} from './api';

// ─────────────────────────────────────────────────────────────
// AppError
// ─────────────────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = null, originalError = null) {
    super(message);
    this.name        = 'AppError';
    this.statusCode  = statusCode;
    this.originalError = originalError;
    this.timestamp   = new Date().toISOString();
  }

  static from(error) {
    const statusCode = error?.response?.status;
    const message    = error?.response?.data?.message || error?.message || 'Unknown error occurred';
    return new AppError(message, statusCode, error);
  }
}

const getErrorMessage = (error) => {
  if (error instanceof AppError)          return error.message;
  if (error?.response?.data?.message)     return error.response.data.message;
  if (error?.message)                     return error.message;
  return 'An unexpected error occurred';
};

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────
export const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ── State ────────────────────────────────────────────
        user:                isAuthenticated() ? getCurrentUser() : null,
        customers:           [],
        items:               [],
        quotations:          [],
        opsReviewHistory:    [],
        companies:           [],
        exchangeRates:       null,
        supportedCurrencies: null,

        adminStats:          null,
        opsStats:            null,
        statsLoading:        false,

        // Selected company/currency (persisted)
        selectedCompany:     localStorage.getItem('selectedCompany') || null,
        selectedCurrency:    localStorage.getItem('selectedCurrency') || 'AED',

        // Document state
        currentDocuments:    [],       
        documentLoading:     false,   
 
        loading:             false,
        loadError:           null,
        operationInProgress: {},
        lastError:           null,

        // ── Auth ─────────────────────────────────────────────

        handleLogin: async (email, password) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, login: true } }));
          try {
            const res = await authAPI.login({ email, password });
            if (!res.data) throw new Error('No data received from server');

            const userData = res.data.user || res.data;
            const token    = res.data.token || userData.token;
            if (!token || !userData.role) throw new Error('Invalid response: missing token or role');

            const user = {
              _id:   userData._id || userData.id,
              name:  userData.name,
              email: userData.email,
              role:  userData.role,
              token,
            };

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            set({ user, lastError: null, loading: true });

            await get().fetchAllData();

            // Auto-select first company on first login
            const { companies } = get();
            if (companies.length > 0 && !get().selectedCompany) {
              const defaultId = companies[0]._id;
              localStorage.setItem('selectedCompany', defaultId);
              set({ selectedCompany: defaultId });
              const company = companies.find(c => c._id === defaultId);
              if (company?.baseCurrency) {
                localStorage.setItem('selectedCurrency', company.baseCurrency);
                set({ selectedCurrency: company.baseCurrency });
                get().fetchExchangeRates(company.baseCurrency);
              }
              await get().fetchQuotationsForCompany(defaultId);
            }

            return { success: true, role: user.role };
          } catch (error) {
            console.error('Login error:', error);
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) || 'Login failed. Please try again.' };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, login: false } }));
          }
        },

        handleRegister: async (data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, register: true } }));
          try {
            const res      = await authAPI.register(data);
            const userData = res.data;
            setAuthData(userData);
            set({ user: userData, lastError: null });
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, register: false } }));
          }
        },

        handleLogout: () => {
          localStorage.removeItem('selectedCompany');
          localStorage.removeItem('selectedCurrency');
          clearAuthData();
          set({
            user: null, customers: [], items: [],
            quotations: [], opsReviewHistory: [],
            companies: [], exchangeRates: null, supportedCurrencies: null,
            selectedCompany: null, selectedCurrency: 'AED',
            currentDocuments: [], documentLoading: false,
            loading: false, loadError: null,
            lastError: null, operationInProgress: {},
          });
        },

        // ── Company & Currency Actions ───────────────────────

        fetchCompanies: async () => {
          try {
            const res      = await companyAPI.getAll();
            const companies = res.data.companies || [];
            set({ companies });

            if (companies.length > 0 && !get().selectedCompany) {
              const defaultId = companies[0]._id;
              localStorage.setItem('selectedCompany', defaultId);
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
            console.error('Fetch companies error:', error);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // Fetch quotations for a specific company (replaces store's quotations slice)
        fetchQuotationsForCompany: async (companyId) => {
          const { user } = get();
          if (!user || !companyId) {
            console.log('⚠️ No user or companyId:', { user, companyId });
            return;
          }
        
          set({ loading: true, loadError: null });
        
          try {
            let response;
            let quotationsData = [];
            const params = { companyId };
        
            console.log('📡 Fetching quotations for company:', companyId, 'role:', user.role);
        
            if (user.role === 'admin') {
              response = await adminAPI.getAllQuotations(params);
              // Handle different response structures
              quotationsData = response?.data?.data || response?.data || [];
              
            } else if (user.role === 'ops_manager') {
              // For Ops Manager, fetch both pending and history
              const [pendingRes, historyRes] = await Promise.all([
                opsAPI.getPendingQuotations(params).catch(err => {
                  console.error('Error fetching pending:', err);
                  return { data: { data: [] } };
                }),
                opsAPI.getReviewHistory(params).catch(err => {
                  console.error('Error fetching history:', err);
                  return { data: { data: [] } };
                })
              ]);
        
              // Safely extract data from responses
              const pendingData = pendingRes?.data?.data || pendingRes?.data || [];
              const historyData = historyRes?.data?.data || historyRes?.data || [];
        
              console.log('📊 Pending data:', pendingData.length, 'History data:', historyData.length);
              
              quotationsData = [...pendingData, ...historyData];
              
            } else {
              // Regular user
              response = await quotationAPI.getMyQuotations(params);
              quotationsData = response?.data?.data || response?.data || [];
            }
        
            console.log('✅ Quotations data fetched:', quotationsData.length);
        
            set({ 
              quotations: quotationsData, 
              loading: false, 
              lastError: null 
            });
            
            return { success: true, quotations: quotationsData };
            
          } catch (error) {
            console.error('❌ Fetch quotations for company error:', error);
            set({ 
              loading: false, 
              lastError: AppError.from(error) 
            });
            return { success: false, error: getErrorMessage(error) };
          }
        },
        

        setSelectedCompany: (companyId) => {
          localStorage.setItem('selectedCompany', companyId);
          set({ selectedCompany: companyId });

          const { companies } = get();
          const company = companies.find(c => c._id === companyId || c.code === companyId);
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
            console.error('Fetch exchange rates error:', error);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchSupportedCurrencies: async () => {
          try {
            const res = await exchangeRateAPI.getSupported();
            set({ supportedCurrencies: res.data.currencies });
            return { success: true, data: res.data };
          } catch (error) {
            console.error('Fetch supported currencies error:', error);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        convertCurrency: async (amount, from, to = 'AED') => {
          try {
            const res = await exchangeRateAPI.convert({ amount, from, to });
            return { success: true, data: res.data };
          } catch (error) {
            console.error('Currency conversion error:', error);
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ── DOCUMENT MANAGEMENT ───────────────────────────────

        /**
         * Fetch documents for a quotation
         * @param {string} quotationId - The quotation ID
         */
        fetchDocuments: async (quotationId) => {
          if (!quotationId) return;
          
          set({ documentLoading: true });
          try {
            const res = await quotationAPI.documents.getAll(quotationId);
            set({ 
              currentDocuments: res.data.documents || [],
              lastError: null 
            });
            return { success: true, documents: res.data.documents };
          } catch (error) {
            const appError = AppError.from(error);
            set({ lastError: appError });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set({ documentLoading: false });
          }
        },

        /**
         * Upload documents to a quotation
         * @param {string} quotationId - The quotation ID
         * @param {File[]} files - Array of files to upload
         * @param {string[]} descriptions - Optional descriptions
         */
        uploadDocuments: async (quotationId, files, descriptions = []) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, uploadDocs: true } }));
          try {
            const res = await quotationAPI.documents.upload(quotationId, files, descriptions);
            
            // Refresh documents list
            await get().fetchDocuments(quotationId);
            
            return { success: true, documents: res.data.documents };
          } catch (error) {
            const appError = AppError.from(error);
            set({ lastError: appError });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, uploadDocs: false } }));
          }
        },

        /**
         * Update document description
         * @param {string} quotationId - The quotation ID
         * @param {string} documentId - The document ID
         * @param {string} description - New description
         */
        updateDocumentDescription: async (quotationId, documentId, description) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updDoc_${documentId}`]: true } }));
          try {
            const res = await quotationAPI.documents.updateDescription(quotationId, documentId, description);
            
            // Update local state
            set((s) => ({
              currentDocuments: s.currentDocuments.map(doc => 
                doc._id === documentId ? { ...doc, description } : doc
              ),
              lastError: null
            }));
            
            return { success: true, document: res.data.document };
          } catch (error) {
            const appError = AppError.from(error);
            set({ lastError: appError });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updDoc_${documentId}`]: false } }));
          }
        },

        /**
         * Delete a document
         * @param {string} quotationId - The quotation ID
         * @param {string} documentId - The document ID
         */
        deleteDocument: async (quotationId, documentId) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`delDoc_${documentId}`]: true } }));
          try {
            await quotationAPI.documents.delete(quotationId, documentId);
            
            // Remove from local state
            set((s) => ({
              currentDocuments: s.currentDocuments.filter(doc => doc._id !== documentId),
              lastError: null
            }));
            
            return { success: true };
          } catch (error) {
            const appError = AppError.from(error);
            set({ lastError: appError });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`delDoc_${documentId}`]: false } }));
          }
        },

        /**
         * Download a document (opens in new tab)
         * @param {string} quotationId - The quotation ID
         * @param {string} documentId - The document ID
         */
        downloadDocument: async (quotationId, documentId) => {
          try {
            await quotationAPI.documents.download(quotationId, documentId);
            return { success: true };
          } catch (error) {
            const appError = AppError.from(error);
            set({ lastError: appError });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        /**
         * Clear current documents (when navigating away)
         */
        clearCurrentDocuments: () => set({ currentDocuments: [] }),

        // ── Data Fetching (role-aware) ────────────────────────

        fetchAllData: async () => {
          const { user } = get();
          if (!user) {
            set({ customers: [], items: [], quotations: [], opsReviewHistory: [], companies: [], exchangeRates: null, loading: false, loadError: null });
            return;
          }

          set({ loading: true, loadError: null });

          try {
            const [customersRes, itemsRes, companiesRes, ratesRes, currenciesRes] = await Promise.all([
              customerAPI.getAll().catch((err)       => { console.error('Customers fetch:', err);           return { data: [] }; }),
              itemAPI.getAll().catch((err)            => { console.error('Items fetch:', err);               return { data: [] }; }),
              companyAPI.getAll().catch((err)         => { console.error('Companies fetch:', err);           return { data: { companies: [] } }; }),
              exchangeRateAPI.getRates().catch((err)  => { console.error('Exchange rates fetch:', err);      return { data: null }; }),
              exchangeRateAPI.getSupported().catch((err) => { console.error('Currencies fetch:', err);       return { data: { currencies: null } }; }),
            ]);

            const parseData = (data) => (Array.isArray(data) ? data : data?.data ?? []);
            const companies = companiesRes.data?.companies || [];

            set({
              customers:           parseData(customersRes.data),
              items:               parseData(itemsRes.data),
              companies,
              exchangeRates:       ratesRes.data,
              supportedCurrencies: currenciesRes.data?.currencies || null,
              loadError:  null,
              lastError:  null,
            });

            if (companies.length > 0 && !get().selectedCompany) {
              const defaultId = companies[0]._id;
              localStorage.setItem('selectedCompany', defaultId);
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
            set({ loadError: getErrorMessage(error), lastError: AppError.from(error) });
            console.error('Data fetch error:', error);
          } finally {
            set({ loading: false });
          }
        },

        // ── Customer CRUD ─────────────────────────────────────

        addCustomer: async (data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, addCustomer: true } }));
          try {
            const res = await customerAPI.create(data);
            set((s) => ({ customers: [...s.customers, res.data], lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, addCustomer: false } }));
          }
        },

        updateCustomer: async (id, data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateCustomer_${id}`]: true } }));
          try {
            const res = await customerAPI.update(id, data);
            set((s) => ({ customers: s.customers.map((c) => (c._id === id ? res.data : c)), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateCustomer_${id}`]: false } }));
          }
        },

        deleteCustomer: async (id) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: true } }));
          try {
            await customerAPI.delete(id);
            set((s) => ({ customers: s.customers.filter((c) => c._id !== id), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: false } }));
          }
        },

        // ── Item CRUD ─────────────────────────────────────────

        addItem: async (data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, addItem: true } }));
          try {
            const res = await itemAPI.create(data);
            set((s) => ({ items: [...s.items, res.data], lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, addItem: false } }));
          }
        },

        updateItem: async (id, data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateItem_${id}`]: true } }));
          try {
            const res = await itemAPI.update(id, data);
            set((s) => ({ items: s.items.map((i) => (i._id === id ? res.data : i)), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateItem_${id}`]: false } }));
          }
        },

        deleteItem: async (id) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteItem_${id}`]: true } }));
          try {
            await itemAPI.delete(id);
            set((s) => ({ items: s.items.filter((i) => i._id !== id), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteItem_${id}`]: false } }));
          }
        },

        // ── Quotation CRUD ────────────────────────────────────

        addQuotation: async (data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, addQuotation: true } }));
          try {
            const quotationData = { ...data, companyId: data.companyId || get().selectedCompany };
            const res = await quotationAPI.create(quotationData);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true, quotation: res.data };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, addQuotation: false } }));
          }
        },

        updateQuotation: async (id, data) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateQuotation_${id}`]: true } }));
          try {
            const res = await quotationAPI.update(id, data);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true, quotation: res.data };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`updateQuotation_${id}`]: false } }));
          }
        },

        deleteQuotation: async (id) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteQuotation_${id}`]: true } }));
          try {
            await quotationAPI.delete(id);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            
            // Clear documents if this was the current quotation
            set({ currentDocuments: [] });
            
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`deleteQuotation_${id}`]: false } }));
          }
        },

        updateQueryDate: async (id, date) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`queryDate_${id}`]: true } }));
          try {
            await quotationAPI.updateQueryDate(id, date);
            set((s) => ({ quotations: s.quotations.map((q) => q._id === id ? { ...q, queryDate: date } : q), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`queryDate_${id}`]: false } }));
          }
        },

        awardQuotation: async (id, awarded, awardNote = '') => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: true } }));
          try {
            const res = await quotationAPI.awardQuotation(id, awarded, awardNote);
            set((s) => ({ quotations: s.quotations.map((q) => q._id === id ? res.data.quotation : q), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: false } }));
          }
        },

        // ── Admin Actions ─────────────────────────────────────

        approveQuotation: async (id) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`approve_${id}`]: true } }));
          try {
            const res = await adminAPI.approveQuotation(id);
            set((s) => ({ quotations: s.quotations.map((q) => (q._id === id ? res.data.quotation : q)), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`approve_${id}`]: false } }));
          }
        },

        rejectQuotation: async (id, reason) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`reject_${id}`]: true } }));
          try {
            const res = await adminAPI.rejectQuotation(id, { reason });
            set((s) => ({ quotations: s.quotations.map((q) => (q._id === id ? res.data.quotation : q)), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`reject_${id}`]: false } }));
          }
        },

        // ── Ops Manager Actions ───────────────────────────────
        
        fetchAdminStats: async (companyId = null) => {
          const { user } = get();
          if (!user || user.role !== 'admin') return;

          set({ statsLoading: true, loadError: null });
          
          try {
            const params = {};
            if (companyId || get().selectedCompany) {
              params.companyId = companyId || get().selectedCompany;
            }
            
            const response = await adminAPI.getAdminStats(params);
            
            set({ 
              adminStats: response.data,
              statsLoading: false,
              lastError: null 
            });
            
            return { success: true, stats: response.data };
          } catch (error) {
            console.error('Fetch admin stats error:', error);
            set({ 
              statsLoading: false, 
              lastError: AppError.from(error) 
            });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        
        fetchOpsStats: async (companyId = null) => {
          const { user } = get();
          if (!user || user.role !== 'ops_manager') return;

          set({ statsLoading: true, loadError: null });
          
          try {
            const params = {};
            if (companyId || get().selectedCompany) {
              params.companyId = companyId || get().selectedCompany;
            }
            
            const response = await opsAPI.getOpsStats(params);
            
            set({ 
              opsStats: response.data.stats,
              statsLoading: false,
              lastError: null 
            });
            
            return { success: true, stats: response.data.stats };
          } catch (error) {
            console.error('Fetch ops stats error:', error);
            set({ 
              statsLoading: false, 
              lastError: AppError.from(error) 
            });
            return { success: false, error: getErrorMessage(error) };
          }
        },

         
        refreshStats: async () => {
          const { user, selectedCompany } = get();
          if (!user) return;

          if (user.role === 'admin') {
            await get().fetchAdminStats(selectedCompany);
          } else if (user.role === 'ops_manager') {
            await get().fetchOpsStats(selectedCompany);
          }
        },

        opsApproveQuotation: async (id) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`opsApprove_${id}`]: true } }));
          try {
            const res = await opsAPI.approveQuotation(id);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`opsApprove_${id}`]: false } }));
          }
        },

        opsRejectQuotation: async (id, reason) => {
          set((s) => ({ operationInProgress: { ...s.operationInProgress, [`opsReject_${id}`]: true } }));
          try {
            const res = await opsAPI.rejectQuotation(id, { reason });
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set((s) => ({ operationInProgress: { ...s.operationInProgress, [`opsReject_${id}`]: false } }));
          }
        },

        // ── Utility ──────────────────────────────────────────

        clearError: () => set({ lastError: null }),
        isOperationInProgress: (key) => get().operationInProgress[key] === true,
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          user:                state.user,
          customers:           state.customers,
          items:               state.items,
          quotations:          state.quotations,
          opsReviewHistory:    state.opsReviewHistory,
          companies:           state.companies,
          exchangeRates:       state.exchangeRates,
          supportedCurrencies: state.supportedCurrencies,
          selectedCompany:     state.selectedCompany,
          selectedCurrency:    state.selectedCurrency,
          // Don't persist document state
        }),
      }
    ),
    { name: 'AppStore' }
  )
);

// ─────────────────────────────────────────────────────────────
// Custom Hook: useCompanyQuotations
// ─────────────────────────────────────────────────────────────
export const useCompanyQuotations = () => {
  const quotations              = useAppStore((s) => s.quotations);
  const selectedCompany         = useAppStore((s) => s.selectedCompany);
  const loading                 = useAppStore((s) => s.loading);
  const fetchQuotationsForCompany = useAppStore((s) => s.fetchQuotationsForCompany);

  const filteredQuotations = React.useMemo(() => {
    if (!selectedCompany) return quotations;
    return quotations.filter(q =>
      q.companyId === selectedCompany ||
      q.companyId?._id === selectedCompany ||
      q.companyId?.toString() === selectedCompany?.toString()
    );
  }, [quotations, selectedCompany]);

  return {
    quotations:  filteredQuotations,
    loading,
    totalCount:  filteredQuotations.length,
    refresh:     () => selectedCompany && fetchQuotationsForCompany(selectedCompany),
  };
};

// ─────────────────────────────────────────────────────────────
// Custom Hook: useDocuments
// ─────────────────────────────────────────────────────────────
export const useDocuments = (quotationId) => {
  const {
    currentDocuments,
    documentLoading,
    fetchDocuments,
    uploadDocuments,
    updateDocumentDescription,
    deleteDocument,
    downloadDocument,
    clearCurrentDocuments
  } = useAppStore();

  // Auto-fetch documents when quotationId changes
  React.useEffect(() => {
    if (quotationId) {
      fetchDocuments(quotationId);
    } else {
      clearCurrentDocuments();
    }
  }, [quotationId, fetchDocuments, clearCurrentDocuments]);

  // Helper to format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper to get file icon
  const getFileIcon = (mimeType) => {
    if (!mimeType) return '📎';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
    return '📎';
  };

  return {
    documents: currentDocuments,
    loading: documentLoading,
    fetchDocuments: () => fetchDocuments(quotationId),
    uploadDocuments: (files, descriptions) => uploadDocuments(quotationId, files, descriptions),
    updateDescription: (docId, description) => updateDocumentDescription(quotationId, docId, description),
    deleteDocument: (docId) => deleteDocument(quotationId, docId),
    downloadDocument: (docId) => downloadDocument(quotationId, docId),
    formatFileSize,
    getFileIcon,
  };
};

// ─────────────────────────────────────────────────────────────
// useInitializeApp
// ─────────────────────────────────────────────────────────────
export const useInitializeApp = () => {
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const userId       = useAppStore((state) => state.user?._id ?? state.user?.id ?? null);

  React.useEffect(() => {
    if (userId) fetchAllData();
  }, [userId]);
};

export const useInitializeStore = useInitializeApp;
export { AppError, getErrorMessage };