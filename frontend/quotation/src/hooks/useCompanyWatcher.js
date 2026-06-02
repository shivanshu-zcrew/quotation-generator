import { useEffect, useRef } from 'react';
import { useAppStore } from '../services/store';

export const useCompanyWatcher = () => {
  const selectedCompany = useAppStore(state => state.selectedCompany);
  const fetchAdminStats = useAppStore(state => state.fetchAdminStats);
  const fetchCustomerStats = useAppStore(state => state.fetchCustomerStats);
  const refreshStats = useAppStore(state => state.refreshStats);
  const user = useAppStore(state => state.user);
  
  const previousCompanyRef = useRef(selectedCompany);
  const isInitialMount = useRef(true);
  const isFetchingRef = useRef(false); // ✅ Add this to prevent parallel calls
  
  useEffect(() => {
    // Skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousCompanyRef.current = selectedCompany;
      return;
    }
    
    // Skip if company didn't actually change
    if (previousCompanyRef.current === selectedCompany) {
      return;
    }
    
    // Prevent multiple simultaneous calls
    if (isFetchingRef.current) {
      console.log('Already fetching stats, skipping');
      return;
    }
    
    if (selectedCompany) {
      console.log(`🏢 Company changed: ${previousCompanyRef.current} → ${selectedCompany}`);
      
      isFetchingRef.current = true;
      
      const refreshData = async () => {
        const companyId = (selectedCompany === 'all' || selectedCompany === 'ALL') ? null : selectedCompany;
        
        try {
          if (user?.role === 'admin') {
            await fetchAdminStats(companyId);
          }
          await fetchCustomerStats();
          await refreshStats();
        } catch (error) {
          console.error('Error refreshing stats:', error);
        } finally {
          // Small delay before allowing next fetch
          setTimeout(() => {
            isFetchingRef.current = false;
          }, 300);
        }
      };
      
      refreshData();
      previousCompanyRef.current = selectedCompany;
    }
  }, [selectedCompany, fetchAdminStats, fetchCustomerStats, refreshStats, user?.role]);
};