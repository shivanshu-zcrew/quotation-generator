import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  customerAPI, itemAPI, quotationAPI, authAPI, adminAPI, opsAPI,
  companyAPI, exchangeRateAPI, getCurrentUser, isAuthenticated,
  setAuthData, clearAuthData, setSelectedCompany as persistSelectedCompany,
  getSelectedCompany, clearCompanyContext,
} from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Error utilities
// ─────────────────────────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(message, statusCode = null, originalError = null) {
    super(message);
    this.name       = 'AppError';
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.timestamp  = new Date().toISOString();
  }
  static from(error) {
    const statusCode = error?.response?.status;
    const message    = error?.response?.data?.message || error?.message || 'Unknown error occurred';
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

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────
export const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({

        // ── State ──────────────────────────────────────────────────────────────
        user:                isAuthenticated() ? getCurrentUser() : null,
        customers:           [],
        customerSyncStatus:  null,
        pendingSyncCustomers:[],
        items:               [],
        quotations:          [],
        opsReviewHistory:    [],
        companies:           [],
        exchangeRates:       null,
        supportedCurrencies: null,
        adminStats:          null,
        opsStats:            null,
        statsLoading:        false,
        selectedCompany:     getSelectedCompany(),
        selectedCurrency:    localStorage.getItem('selectedCurrency') || 'AED',
        currentDocuments:    [],
        documentLoading:     false,
        loading:             false,
        loadError:           null,
        operationInProgress: {},
        lastError:           null,
        gccCountries:        [],
        taxTreatments:       [],
        currencyOptions:     [],
        customerStats:       null,

        // ── AUTH ───────────────────────────────────────────────────────────────
        handleLogin: async (email, password) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, login: true } }));
          try {
            const res      = await authAPI.login({ email, password });
            if (!res.data) throw new Error('No data received');
            const userData = res.data.user || res.data;
            const token    = res.data.token || userData.token;
            if (!token || !userData.role) throw new Error('Invalid response');
            const user = {
              _id: userData._id || userData.id,
              name: userData.name, email: userData.email,
              role: userData.role, token,
            };
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            set({ user, lastError: null });

            // Fetch all data (sets loading internally)
            await get().fetchAllData();

            // Auto-select first company if none selected
            const { companies } = get();
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
            set({ user: res.data, lastError: null });
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

        // ── COMPANY & CURRENCY ────────────────────────────────────────────────
        fetchCompanies: async () => {
          try {
            const res      = await companyAPI.getAll();
            const companies= res.data.companies || [];
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
            set({ quotations: quotationsData, loading: false, lastError: null });
            return { success: true, quotations: quotationsData };
          } catch (error) {
            set({ loading: false, lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // FIX: removed redundant fetchAllData() call — it caused a double-fetch
        // on every company switch (customers/items don't change per company).
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

        // ── DOCUMENTS ─────────────────────────────────────────────────────────
        fetchDocuments: async (quotationId) => {
          if (!quotationId) return;
          set({ documentLoading: true });
          try {
            const res = await quotationAPI.documents.getAll(quotationId);
            set({ currentDocuments: res.data.documents || [], lastError: null });
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

        // ── DATA FETCHING ─────────────────────────────────────────────────────
        fetchAllData: async () => {
          const { user } = get();
          if (!user) {
            set({ customers:[], items:[], quotations:[], opsReviewHistory:[], companies:[], exchangeRates:null, loading:false });
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
            set({
              customers:          parseData(customersRes.data),
              items:              parseData(itemsRes.data),
              companies,
              exchangeRates:      ratesRes.data,
              supportedCurrencies:currenciesRes.data?.currencies || null,
              gccCountries:       gccRes.data || [],
              taxTreatments:      taxRes.data || [],
              currencyOptions:    currencyOptsRes.data || [],
              loadError: null, lastError: null,
            });

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
            set({ loadError: getErrorMessage(error), lastError: AppError.from(error) });
          } finally {
            // loading is set to false by fetchQuotationsForCompany; set it here as fallback
            set(s => s.loading ? { loading: false } : {});
          }
        },

        // ── CUSTOMER CRUD ──────────────────────────────────────────────────────
        addCustomer: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addCustomer: true } }));
          try {
            const taxTreatment  = data.taxTreatment || 'gcc_non_vat_registered';
            const trnValidation = get().validateTrn(data.taxRegistrationNumber, taxTreatment);
            if (!trnValidation.valid) throw new Error(trnValidation.error);
            const res         = await customerAPI.create({ ...data, companyId: get().selectedCompany });
            const newCustomer = extractResponseData(res);
            set(s => ({ customers: [...s.customers, newCustomer], lastError: null }));
            get().fetchCustomerStats();
            return { success: true, customer: newCustomer };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, addCustomer: false } }));
          }
        },

        fetchCustomerStats: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, fetchCustomerStats: true } }));
          try {
            const res = await customerAPI.getStats();
            if (res.data.success) {
              const statsData = res.data.stats || res.data;
              set({ customerStats: statsData, lastError: null });
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

        updateCustomer: async (id, data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`updateCustomer_${id}`]: true } }));
          try {
            if (data.taxTreatment || data.taxRegistrationNumber) {
              const existing    = get().customers.find(c => c._id === id);
              const taxTreatment= data.taxTreatment || existing?.taxTreatment;
              const trn         = data.taxRegistrationNumber !== undefined ? data.taxRegistrationNumber : existing?.taxRegistrationNumber;
              const validation  = get().validateTrn(trn, taxTreatment);
              if (!validation.valid) throw new Error(validation.error);
            }
            const res     = await customerAPI.update(id, data);
            const updated = extractResponseData(res);
            set(s => ({ customers: s.customers.map(c => c._id === id ? updated : c), lastError: null }));
            get().fetchCustomerStats();
            return { success: true, customer: updated };
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
            await customerAPI.delete(id);
            set(s => ({ customers: s.customers.filter(c => c._id !== id), lastError: null }));
            get().fetchCustomerStats();
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`deleteCustomer_${id}`]: false } }));
          }
        },

        syncCustomersFromZoho: async (fullSync = false) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncCustomers: true } }));
          try {
            const response = await customerAPI.syncFromZoho(fullSync);
            if (response.data.success) {
              set({ lastError: null });
              await get().fetchCustomerStats();
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

        // FIX: use operationInProgress instead of global loading to avoid
        // colliding with the main data-loading indicator
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

        // FIX: same — use operationInProgress not global loading
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

        fetchGccCountries:    async () => { try { const r = await customerAPI.getGccCountries();    set({ gccCountries:   r.data || [] }); return { success:true, countries:  r.data }; } catch(e) { return { success:false, error:getErrorMessage(e) }; } },
        fetchTaxTreatments:   async () => { try { const r = await customerAPI.getTaxTreatments();   set({ taxTreatments:  r.data || [] }); return { success:true, treatments: r.data }; } catch(e) { return { success:false, error:getErrorMessage(e) }; } },
        fetchCurrencyOptions: async () => { try { const r = await customerAPI.getCurrencies();      set({ currencyOptions:r.data || [] }); return { success:true, currencies: r.data }; } catch(e) { return { success:false, error:getErrorMessage(e) }; } },

        validateTrn: (trn, taxTreatment) => {
          if (taxTreatment === 'gcc_vat_registered') {
            if (!trn?.trim()) return { valid:false, error:'TRN is required for VAT registered customers' };
            if (!/^\d{15}$/.test(trn.trim())) return { valid:false, error:'TRN must be exactly 15 digits' };
          }
          return { valid: true };
        },

        // ── ITEM CRUD ──────────────────────────────────────────────────────────
        addItem: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addItem: true } }));
          try {
            const res     = await itemAPI.create(data);
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
            const res     = await itemAPI.update(id, data);
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

        // FIX: syncItems — interval handle is captured in local var (not in store state)
        // so it can be properly cleared; timeout references isSyncingRef via operationInProgress
        syncItems: async () => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: true }, lastError: null }));
          try {
            const response = await itemAPI.syncItems();
            if (!response.data.success) throw new Error(response.data.message || 'Sync failed');

            let pollHandle;
            const timeoutHandle = setTimeout(() => {
              clearInterval(pollHandle);
              if (get().operationInProgress.syncItems) {
                set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false } }));
              }
            }, 60_000);

            pollHandle = setInterval(async () => {
              try {
                const statusRes = await itemAPI.getSyncStatus();
                if (!statusRes.data.status.isSyncing) {
                  clearInterval(pollHandle);
                  clearTimeout(timeoutHandle);
                  if (statusRes.data.status.lastSyncResult?.success) {
                    await get().refreshItems();
                  } else {
                    set({ lastError: new AppError(statusRes.data.status.lastSyncResult?.error || 'Sync failed') });
                  }
                  set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false } }));
                }
              } catch (pollErr) {
                clearInterval(pollHandle);
                clearTimeout(timeoutHandle);
                set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: AppError.from(pollErr) }));
              }
            }, 2000);

            return { success: true, message: 'Sync started' };
          } catch (error) {
            set(s => ({ operationInProgress: { ...s.operationInProgress, syncItems: false }, lastError: AppError.from(error) }));
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refreshItems: async (forceRefresh = false) => {
          set({ loading: true });
          try {
            const response = await itemAPI.getAll({ forceRefresh: forceRefresh ? 'true' : 'false' });
            const itemsData = response.data.success
              ? (response.data.data || [])
              : (Array.isArray(response.data) ? response.data : response.data?.data || []);
            set({ items: itemsData, loading: false, lastError: null });
            return { success: true, items: itemsData };
          } catch (error) {
            set({ loading: false, lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        // ── QUOTATION CRUD ────────────────────────────────────────────────────
        addQuotation: async (data) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, addQuotation: true } }));
          try {
            await quotationAPI.create({ ...data, companyId: data.companyId || get().selectedCompany });
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
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
            await quotationAPI.update(id, data);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            return { success: true };
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
            await quotationAPI.delete(id);
            await get().fetchQuotationsForCompany(get().selectedCompany);
            set({ currentDocuments: [] });
            return { success: true };
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
            set(s => ({ quotations: s.quotations.map(q => q._id === id ? res.data.quotation : q), lastError: null }));
            return { success: true };
          } catch (error) {
            set({ lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          } finally {
            set(s => ({ operationInProgress: { ...s.operationInProgress, [`award_${id}`]: false } }));
          }
        },

        // ── ADMIN / OPS ACTIONS ───────────────────────────────────────────────
        approveQuotation: async (id) => {
          set(s => ({ operationInProgress: { ...s.operationInProgress, [`approve_${id}`]: true } }));
          try {
            const res = await adminAPI.approveQuotation(id);
            set(s => ({ quotations: s.quotations.map(q => q._id === id ? res.data.quotation : q), lastError: null }));
            return { success: true };
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
            set(s => ({ quotations: s.quotations.map(q => q._id === id ? res.data.quotation : q), lastError: null }));
            return { success: true };
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
            const params   = { companyId: companyId || get().selectedCompany };
            const response = await adminAPI.getAdminStats(params);
            set({ adminStats: response.data, statsLoading: false, lastError: null });
            return { success: true, stats: response.data };
          } catch (error) {
            set({ statsLoading: false, lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        fetchOpsStats: async (companyId = null) => {
          if (get().user?.role !== 'ops_manager') return;
          set({ statsLoading: true });
          try {
            const params   = { companyId: companyId || get().selectedCompany };
            const response = await opsAPI.getOpsStats(params);
            set({ opsStats: response.data.stats, statsLoading: false, lastError: null });
            return { success: true, stats: response.data.stats };
          } catch (error) {
            set({ statsLoading: false, lastError: AppError.from(error) });
            return { success: false, error: getErrorMessage(error) };
          }
        },

        refreshStats: async () => {
          const { user, selectedCompany } = get();
          if (!user) return;
          if (user.role === 'admin')       await get().fetchAdminStats(selectedCompany);
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
      }),

      {
        name: 'app-store',
        partialize: (state) => ({
          user:             state.user,
          selectedCompany:  state.selectedCompany,
          selectedCurrency: state.selectedCurrency,
          // FIX: removed companies + supportedCurrencies — they're always re-fetched
          // on mount and persisting them wastes localStorage space & causes stale data
          gccCountries:     state.gccCountries,
          taxTreatments:    state.taxTreatments,
          currencyOptions:  state.currencyOptions,
          customerStats:    state.customerStats,
        }),
      }
    ),
    { name: 'AppStore' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Derived hooks (exported for convenience)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useEffect } from 'react';

export const useCompanyQuotations = () => {
  const quotations              = useAppStore(s => s.quotations);
  const selectedCompany         = useAppStore(s => s.selectedCompany);
  const loading                 = useAppStore(s => s.loading);
  const fetchQuotationsForCompany = useAppStore(s => s.fetchQuotationsForCompany);

  const filteredQuotations = useMemo(() => {
    if (!selectedCompany) return quotations;
    return quotations.filter(q =>
      q.companyId === selectedCompany ||
      q.companyId?._id === selectedCompany ||
      q.companyId?.toString() === selectedCompany?.toString()
    );
  }, [quotations, selectedCompany]);

  return {
    quotations: filteredQuotations,
    loading,
    totalCount: filteredQuotations.length,
    refresh: () => selectedCompany && fetchQuotationsForCompany(selectedCompany),
  };
};

export const useDocuments = (quotationId) => {
  const { currentDocuments, documentLoading, fetchDocuments, uploadDocuments,
          updateDocumentDescription, deleteDocument, downloadDocument, clearCurrentDocuments } = useAppStore();

  useEffect(() => {
    if (quotationId) fetchDocuments(quotationId);
    else clearCurrentDocuments();
  }, [quotationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const getFileIcon = (mimeType) => {
    if (!mimeType) return '📎';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel')) return '📊';
    return '📎';
  };

  return {
    documents:          currentDocuments,
    loading:            documentLoading,
    fetchDocuments:     () => fetchDocuments(quotationId),
    uploadDocuments:    (files, descs) => uploadDocuments(quotationId, files, descs),
    updateDescription:  (docId, desc) => updateDocumentDescription(quotationId, docId, desc),
    deleteDocument:     (docId) => deleteDocument(quotationId, docId),
    downloadDocument:   (docId) => downloadDocument(quotationId, docId),
    formatFileSize,
    getFileIcon,
  };
};

export const useInitializeApp = () => {
  const fetchAllData = useAppStore(s => s.fetchAllData);
  const userId       = useAppStore(s => s.user?._id ?? s.user?.id ?? null);
  useEffect(() => { if (userId) fetchAllData(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
};

export const useInitializeStore = useInitializeApp;

export const useCompanyContext = () => {
  const selectedCompany   = useAppStore(s => s.selectedCompany);
  const companies         = useAppStore(s => s.companies);
  const setSelectedCompany= useAppStore(s => s.setSelectedCompany);
  const selectedCurrency  = useAppStore(s => s.selectedCurrency);
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
    hasCompany:      !!selectedCompany,
    companyName:     currentCompany?.name || '',
    companyCode:     currentCompany?.code || '',
    companyCurrency: currentCompany?.baseCurrency || selectedCurrency || 'AED',
  };
};

export const useCustomerStatsWithCompany = () => {
  const customerStats       = useAppStore(s => s.customerStats);
  const selectedCompany     = useAppStore(s => s.selectedCompany);
  const fetchCustomerStats  = useAppStore(s => s.fetchCustomerStats);
  const loading             = useAppStore(s => s.operationInProgress.fetchCustomerStats);

  useEffect(() => {
    if (selectedCompany) fetchCustomerStats();
  }, [selectedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    stats:             customerStats,
    loading:           loading === true,
    refetch:           fetchCustomerStats,
    totalCustomers:    customerStats?.totalCustomers    || 0,
    activeCustomers:   customerStats?.activeCustomers   || 0,
    vatRegistered:     customerStats?.vatRegistered     || 0,
    nonVatRegistered:  customerStats?.nonVatRegistered  || 0,
    synced:            customerStats?.synced            || 0,
    unsynced:          customerStats?.unsynced          || 0,
  };
};