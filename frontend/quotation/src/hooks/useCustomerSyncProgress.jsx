import { useState, useEffect, useCallback, useRef } from 'react';
import { customerAPI } from '../services/api';

export const useCustomerSyncProgress = (companyId) => {
  const [progress, setProgress] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const pollingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) stopPolling();
    
    // Poll every 1.5 seconds for progress
    pollingIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current || !companyId) return;
      
      try {
        const response = await customerAPI.getSyncProgress(companyId);
        if (response?.data) {
          const { isSyncing: syncing, progress: prog } = response.data;
          
          setProgress(prog);
          setIsSyncing(syncing);
          
          // Stop polling when sync is complete or failed
          if (prog?.stage === 'completed' || prog?.stage === 'error') {
            stopPolling();
          }
        }
      } catch (err) {
        console.error('Error polling sync progress:', err);
        setError(err.message);
      }
    }, 1500);
  }, [companyId, stopPolling]);

  const startSync = useCallback(async (fullSync = false) => {
    if (!companyId) return;
    
    // Reset states
    setProgress(null);
    setError(null);
    setIsSyncing(true);
    stopPolling();
    
    try {
      // Start the sync (non-blocking)
      await customerAPI.syncFromZoho(fullSync, companyId);
      
      // Start polling for progress
      startPolling();
      
      return { success: true };
    } catch (err) {
      console.error('Error starting sync:', err);
      setError(err.message);
      setIsSyncing(false);
      return { success: false, error: err.message };
    }
  }, [companyId, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    startSync,
    progress,
    isSyncing,
    error,
    stopPolling
  };
};