 
import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useAppStore } from '../services/store';  

const RefreshItemsButton = ({ onRefreshComplete, variant = 'button' }) => {
 
  const syncItems = useAppStore((state) => state.syncItems);
  const getSyncStatus = useAppStore((state) => state.getSyncStatus);
  const isSyncingFromStore = useAppStore((state) => state.operationInProgress?.syncItems === true);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [showStatus, setShowStatus] = useState(false);

  // Sync with store's syncing state
  useEffect(() => {
    setIsSyncing(isSyncingFromStore);
  }, [isSyncingFromStore]);

  // Check sync status periodically
  useEffect(() => {
    let interval;
    
    if (isSyncing) {
      interval = setInterval(checkSyncStatus, 2000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSyncing]);

  const checkSyncStatus = async () => {
    try {
      const result = await getSyncStatus();
      if (result.success && result.status) {
        const { isSyncing: syncing, lastSyncTime, lastSyncResult } = result.status;
        
        setIsSyncing(syncing);
        
        if (!syncing && lastSyncResult) {
          // Sync completed
          setSyncResult(lastSyncResult);
          setLastSync(lastSyncTime);
          
          if (onRefreshComplete) {
            onRefreshComplete(lastSyncResult);
          }
          
          // Auto-hide status after 5 seconds
          setTimeout(() => setShowStatus(false), 5000);
        }
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const handleRefresh = async () => {
    if (isSyncing) {
      alert('Sync already in progress. Please wait...');
      return;
    }
    
    setShowStatus(true);
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await syncItems();
      
      if (result.success) {
        setSyncResult({ success: true, ...result });
        // Status will be updated via polling
      } else {
        setSyncResult({ success: false, error: result.error });
        setIsSyncing(false);
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      setSyncResult({ success: false, error: error.message });
      setIsSyncing(false);
    }
  };

  const formatTimeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  // Button variant styles
  const buttonStyles = {
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: variant === 'icon' ? '8px' : '8px 16px',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
      position: 'relative'
    },
    buttonDisabled: {
      backgroundColor: '#9ca3af',
      cursor: 'not-allowed',
      opacity: 0.6
    },
    spinning: {
      animation: 'spin 1s linear infinite'
    },
    statusContainer: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '8px',
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '12px',
      minWidth: '280px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      zIndex: 50
    },
    statusSuccess: {
      color: '#10b981',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    statusError: {
      color: '#ef4444',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    statusInfo: {
      color: '#3b82f6',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleRefresh}
        disabled={isSyncing}
        style={{
          ...buttonStyles.button,
          ...(isSyncing ? buttonStyles.buttonDisabled : {})
        }}
        onMouseEnter={() => setShowStatus(true)}
        onMouseLeave={() => {
          if (!isSyncing && syncResult?.success) {
            setTimeout(() => setShowStatus(false), 1000);
          }
        }}
      >
        <RefreshCw 
          size={16} 
          style={isSyncing ? buttonStyles.spinning : {}}
        />
        {variant !== 'icon' && (isSyncing ? 'Syncing...' : 'Refresh Items')}
        {variant === 'icon' && !isSyncing && '↻'}
      </button>

      {showStatus && (
        <div style={buttonStyles.statusContainer}>
          {isSyncing ? (
            <div style={buttonStyles.statusInfo}>
              <RefreshCw size={16} style={buttonStyles.spinning} />
              <div>
                <strong>Syncing items...</strong>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  This may take 30-60 seconds
                </div>
              </div>
            </div>
          ) : syncResult?.success ? (
            <div style={buttonStyles.statusSuccess}>
              <CheckCircle size={16} />
              <div>
                <strong>Sync Completed!</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {syncResult.created > 0 && `✅ ${syncResult.created} new items added`}
                  {syncResult.created === 0 && syncResult.updated === 0 && `📦 No changes detected`}
                  {syncResult.updated > 0 && `\n🔄 ${syncResult.updated} items updated`}
                  <div style={{ color: '#6b7280', marginTop: '4px' }}>
                    Last sync: {formatTimeAgo(lastSync)}
                  </div>
                </div>
              </div>
            </div>
          ) : syncResult?.error ? (
            <div style={buttonStyles.statusError}>
              <AlertCircle size={16} />
              <div>
                <strong>Sync Failed</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {syncResult.error}
                </div>
                <button
                  onClick={handleRefresh}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div style={buttonStyles.statusInfo}>
              <Clock size={16} />
              <div>
                <strong>Items from Zoho</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {lastSync ? `Last synced: ${formatTimeAgo(lastSync)}` : 'Click to sync items from Zoho'}
                </div>
                <button
                  onClick={handleRefresh}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Sync Now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
};

export default RefreshItemsButton;