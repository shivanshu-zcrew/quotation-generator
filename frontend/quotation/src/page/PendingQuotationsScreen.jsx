import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

export default function PendingQuotationsScreen({ 
  quotations = [], 
  onApprove, 
  onReject, 
  onViewQuotation,
  onBack 
}) {
  const [pendingQuotations, setPendingQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dateRange, setDateRange] = useState('all');

  useEffect(() => {
    fetchPendingQuotations();
  }, []);

  const fetchPendingQuotations = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getPendingQuotations();
      setPendingQuotations(response.data);
    } catch (error) {
      console.error('Error fetching pending quotations:', error);
      alert('Error fetching pending quotations: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = async (id) => {
    if (!window.confirm('Are you sure you want to approve this quotation?')) {
      return;
    }

    try {
      setActionLoading(true);
      await onApprove(id);
      await fetchPendingQuotations(); // Refresh the list
    } catch (error) {
      console.error('Error approving quotation:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectClick = (id) => {
    setRejectingId(id);
    setShowRejectModal(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      setActionLoading(true);
      await onReject(rejectingId, rejectReason);
      await fetchPendingQuotations();
      setShowRejectModal(false);
      setRejectReason('');
      setRejectingId(null);
    } catch (error) {
      console.error('Error rejecting quotation:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFilteredAndSortedQuotations = () => {
    let filtered = [...pendingQuotations];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(q => 
        q.quotationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.customer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.createdBy?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply date range filter
    const now = new Date();
    const ranges = {
      today: new Date(now.setHours(0, 0, 0, 0)),
      week: new Date(now.setDate(now.getDate() - 7)),
      month: new Date(now.setMonth(now.getMonth() - 1)),
      all: new Date(0)
    };

    if (dateRange !== 'all') {
      filtered = filtered.filter(q => new Date(q.createdAt) >= ranges[dateRange]);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'date-asc':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'amount-desc':
          return b.total - a.total;
        case 'amount-asc':
          return a.total - b.total;
        case 'customer':
          return a.customer.localeCompare(b.customer);
        default:
          return 0;
      }
    });

    return filtered;
  };

  const totalValue = pendingQuotations.reduce((sum, q) => sum + q.total, 0);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading pending quotations...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          <svg style={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </button>
        <h1 style={styles.title}>Pending Approvals</h1>
        <button 
          onClick={fetchPendingQuotations} 
          style={styles.refreshButton}
          disabled={actionLoading}
        >
          <svg style={styles.refreshIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📋</div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryLabel}>Pending</h3>
            <p style={styles.summaryValue}>{pendingQuotations.length}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryLabel}>Total Value</h3>
            <p style={styles.summaryValue}>{formatCurrency(totalValue)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⏳</div>
          <div style={styles.summaryContent}>
            <h3 style={styles.summaryLabel}>Avg. Processing</h3>
            <p style={styles.summaryValue}>2.3 days</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filtersContainer}>
        <div style={styles.searchBox}>
          <svg style={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by number, customer, or creator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.filterGroup}>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
            <option value="customer">Customer Name</option>
          </select>
        </div>
      </div>

      {/* Quotations Grid */}
      <div style={styles.quotationsGrid}>
        {getFilteredAndSortedQuotations().length === 0 ? (
          <div style={styles.emptyState}>
            <svg style={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No pending quotations found</p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                style={styles.clearButton}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          getFilteredAndSortedQuotations().map(quotation => (
            <div key={quotation._id} style={styles.quotationCard}>
              <div style={styles.cardHeader}>
                <span style={styles.quotationNumber}>
                  {quotation.quotationNumber}
                </span>
                <span style={styles.quotationDate}>
                  {formatDate(quotation.createdAt)}
                </span>
              </div>

              <div style={styles.cardBody}>
                <div style={styles.customerInfo}>
                  <svg style={styles.infoIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <div>
                    <div style={styles.customerName}>{quotation.customer}</div>
                    {quotation.contact && (
                      <div style={styles.customerContact}>{quotation.contact}</div>
                    )}
                  </div>
                </div>

                <div style={styles.creatorInfo}>
                  <svg style={styles.infoIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{quotation.createdBy?.name || 'Unknown'}</span>
                </div>

                <div style={styles.itemsSummary}>
                  {quotation.items?.length || 0} item(s)
                </div>

                <div style={styles.amountSection}>
                  <span style={styles.amountLabel}>Total Amount</span>
                  <span style={styles.amountValue}>{formatCurrency(quotation.total)}</span>
                </div>

                {quotation.notes && (
                  <div style={styles.notes}>
                    <svg style={styles.notesIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span style={styles.notesText}>{quotation.notes.substring(0, 50)}...</span>
                  </div>
                )}
              </div>

              <div style={styles.cardFooter}>
                <div style={styles.actionButtons}>
                  <button
                    onClick={() => handleApproveClick(quotation._id)}
                    style={styles.approveButton}
                    disabled={actionLoading}
                  >
                    <svg style={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectClick(quotation._id)}
                    style={styles.rejectButton}
                    disabled={actionLoading}
                  >
                    <svg style={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                  <button
                    onClick={() => onViewQuotation(quotation._id)}
                    style={styles.viewButton}
                  >
                    <svg style={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Reject Quotation</h3>
            <p style={styles.modalSubtitle}>
              Please provide a reason for rejection. This will be visible to the user.
            </p>
            
            <div style={styles.modalContent}>
              <label style={styles.modalLabel}>Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={styles.modalTextarea}
                placeholder="Enter detailed reason for rejection..."
                rows={4}
                disabled={actionLoading}
              />
            </div>

            <div style={styles.modalButtons}>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                  setRejectingId(null);
                }}
                style={styles.modalCancelButton}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                style={styles.modalConfirmButton}
                disabled={actionLoading || !rejectReason.trim()}
              >
                {actionLoading ? 'Rejecting...' : 'Reject Quotation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    backgroundColor: '#f0f9ff',
    minHeight: '100vh'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer'
  },
  backIcon: {
    width: '16px',
    height: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    margin: 0
  },
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  refreshIcon: {
    width: '16px',
    height: '16px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  summaryIcon: {
    fontSize: '24px'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px'
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a1a1a'
  },
  filtersContainer: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap'
  },
  searchBox: {
    flex: 2,
    minWidth: '250px',
    position: 'relative'
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '18px',
    height: '18px',
    color: '#9ca3af'
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 38px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none'
  },
  filterGroup: {
    flex: 1,
    display: 'flex',
    gap: '12px',
    minWidth: '250px'
  },
  filterSelect: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'white'
  },
  quotationsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px'
  },
  quotationCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'transform 0.3s, box-shadow 0.3s',
    display: 'flex',
    flexDirection: 'column'
  },
  cardHeader: {
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  quotationNumber: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#667eea'
  },
  quotationDate: {
    fontSize: '12px',
    color: '#666'
  },
  cardBody: {
    padding: '16px',
    flex: 1
  },
  customerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px'
  },
  infoIcon: {
    width: '16px',
    height: '16px',
    color: '#9ca3af'
  },
  customerName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a'
  },
  customerContact: {
    fontSize: '12px',
    color: '#666',
    marginTop: '2px'
  },
  creatorInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    fontSize: '14px',
    color: '#4b5563'
  },
  itemsSummary: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '12px',
    padding: '4px 0'
  },
  amountSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    padding: '8px 0',
    borderTop: '1px dashed #e5e7eb',
    borderBottom: '1px dashed #e5e7eb'
  },
  amountLabel: {
    fontSize: '13px',
    color: '#666'
  },
  amountValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1a1a1a'
  },
  notes: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#666',
    backgroundColor: '#f9fafb',
    padding: '8px',
    borderRadius: '6px'
  },
  notesIcon: {
    width: '14px',
    height: '14px',
    flexShrink: 0
  },
  notesText: {
    fontStyle: 'italic'
  },
  cardFooter: {
    padding: '16px',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e5e7eb'
  },
  actionButtons: {
    display: 'flex',
    gap: '8px'
  },
  approveButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  rejectButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  viewButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  buttonIcon: {
    width: '14px',
    height: '14px'
  },
  emptyState: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    color: '#9ca3af'
  },
  emptyIcon: {
    width: '48px',
    height: '48px',
    marginBottom: '12px'
  },
  clearButton: {
    marginTop: '12px',
    padding: '8px 16px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px'
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: '8px'
  },
  modalSubtitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '20px'
  },
  modalContent: {
    marginBottom: '20px'
  },
  modalLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px'
  },
  modalTextarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    resize: 'vertical',
    outline: 'none'
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  modalCancelButton: {
    padding: '8px 16px',
    backgroundColor: '#e5e7eb',
    color: '#374151',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  modalConfirmButton: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  }
};

// Add keyframes for animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  .quotationCard:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  
  button:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
document.head.appendChild(styleSheet);