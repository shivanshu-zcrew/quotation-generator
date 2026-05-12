// stores/appStore.js
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  authAPI, companyAPI, exchangeRateAPI,
  getCurrentUser, isAuthenticated, setAuthData, clearAuthData,
  setSelectedCompany as persistSelectedCompany, getSelectedCompany, clearCompanyContext
} from '../api';

const useAppStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ========== User State ==========
        user: isAuthenticated() ? getCurrentUser() : null,
        
        // ========== Company State ==========
        companies: [],
        selectedCompany: getSelectedCompany(),
        selectedCurrency: localStorage.getItem('selectedCurrency') || 'AED',
        
        // ========== Core Data ==========
        customers: [],
        items: [],
        quotations: [],
        
        // ========== UI State ==========
        initialized: false,
        loading: false,
        error: null,
        
        // ========== Auth Actions ==========
        login: async (email, password) => {
          set({ loading: true });
          try {
            const res = await authAPI.login({ email, password });
            const user = res.data.user || res.data;
            localStorage.setItem('token', user.token);
            localStorage.setItem('user', JSON.stringify(user));
            
            set({ user, loading: false, error: null });
            await get().loadCompanies();
            return { success: true };
          } catch (error) {
            set({ loading: false, error: error.message });
            return { success: false, error: error.message };
          }
        },
        
        logout: () => {
          clearCompanyContext();
          clearAuthData();
          set({
            user: null,
            selectedCompany: null,
            selectedCurrency: 'AED',
            customers: [],
            items: [],
            quotations: [],
            initialized: false
          });
        },
        
        // ========== Company Actions ==========
        loadCompanies: async () => {
          try {
            const res = await companyAPI.getAll();
            const companies = res.data?.companies || [];
            set({ companies });
            
            if (!get().selectedCompany && companies.length > 0) {
              get().setCompany(companies[0]._id);
            }
          } catch (error) {
            console.error('Failed to load companies:', error);
          }
        },
        
        setCompany: (companyId) => {
          persistSelectedCompany(companyId);
          const company = get().companies.find(c => c._id === companyId);
          if (company?.baseCurrency) {
            localStorage.setItem('selectedCurrency', company.baseCurrency);
            set({ selectedCurrency: company.baseCurrency });
          }
          set({ selectedCompany: companyId });
          get().fetchExchangeRates();
        },
        
        // ========== Exchange Rates ==========
        fetchExchangeRates: async (base = 'AED') => {
          try {
            const res = await exchangeRateAPI.getRates({ base });
            set({ exchangeRates: res.data });
          } catch (error) {
            console.error('Failed to fetch rates:', error);
          }
        },
        
        // ========== Utility ==========
        clearError: () => set({ error: null }),
      }),
      { name: 'app-storage', partialize: (state) => ({ 
        user: state.user, 
        selectedCompany: state.selectedCompany,
        selectedCurrency: state.selectedCurrency 
      })}
    ),
    { name: 'AppStore' }
  )
);

export default useAppStore;