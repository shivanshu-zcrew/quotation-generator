// screens/UserQuotationStatsPage.jsx (FIXED VERSION)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, TrendingUp, Award, XCircle, Clock,
  ChevronDown, ChevronUp, Eye, Download, RefreshCw,
  ArrowLeft, Search, X, Calendar, AlertCircle, Menu
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { useAppStore } from '../services/store';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { fmtCurrency, fmtDate } from '../utils/formatters';
import { StatusBadge } from '../components/SharedComponents';
import useToast, { ToastContainer } from '../hooks/useToast';

// Custom hook for responsive detection
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

// Mobile User Card Component
const MobileUserCard = ({ user, selectedCurrency, onViewQuotations }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={mobileStyles.userCard}>
      <div style={mobileStyles.userCardHeader} onClick={() => setExpanded(!expanded)}>
        <div style={mobileStyles.userAvatar}>
          {user.userName?.charAt(0) || 'U'}
        </div>
        <div style={mobileStyles.userInfo}>
          <div style={mobileStyles.userName}>{user.userName}</div>
          <div style={mobileStyles.userEmail}>{user.userEmail}</div>
        </div>
        <div style={mobileStyles.userStats}>
          <div style={mobileStyles.quotationCount}>{user.totalQuotations}</div>
          <div style={mobileStyles.quotationsLabel}>Quotes</div>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      
      {expanded && (
        <div style={mobileStyles.userCardBody}>
          <div style={mobileStyles.statRow}>
            <div style={mobileStyles.statLabel}>Total Value</div>
            <div style={mobileStyles.statValue}>
              {fmtCurrency(user.totalValue, selectedCurrency)}
            </div>
          </div>
          <div style={mobileStyles.badgeRow}>
            <div style={mobileStyles.badgeGroup}>
              <span style={mobileStyles.pendingBadge}>{user.pending || 0}</span>
              <span style={mobileStyles.badgeLabel}>Pending</span>
            </div>
            <div style={mobileStyles.badgeGroup}>
              <span style={mobileStyles.approvedBadge}>{user.approved || 0}</span>
              <span style={mobileStyles.badgeLabel}>Approved</span>
            </div>
            <div style={mobileStyles.badgeGroup}>
              <span style={mobileStyles.awardedBadge}>{user.awarded || 0}</span>
              <span style={mobileStyles.badgeLabel}>Awarded</span>
            </div>
            <div style={mobileStyles.badgeGroup}>
              <span style={mobileStyles.rejectedBadge}>{user.rejected || 0}</span>
              <span style={mobileStyles.badgeLabel}>Rejected</span>
            </div>
          </div>
          <button
            onClick={() => onViewQuotations(user.userId, user.userName)}
            style={mobileStyles.viewBtn}
          >
            <Eye size={16} /> View Quotations
          </button>
        </div>
      )}
    </div>
  );
};

// Mobile Quotation Card Component
const MobileQuotationCard = ({ quotation, selectedCurrency, onDownload, isExporting }) => (
  <div style={mobileStyles.quotationCard}>
    <div style={mobileStyles.quotationHeader}>
      <span style={mobileStyles.quoteNumber}>{quotation.quotationNumber}</span>
      <StatusBadge status={quotation.status} />
    </div>
    <div style={mobileStyles.quotationCustomer}>
      {quotation.customerSnapshot?.name || quotation.customer || 'N/A'}
    </div>
    <div style={mobileStyles.quotationDetails}>
      <div>📅 {fmtDate(quotation.date)}</div>
      <div>⏰ {fmtDate(quotation.expiryDate)}</div>
    </div>
    <div style={mobileStyles.quotationFooter}>
      <div style={mobileStyles.quotationTotal}>
        {fmtCurrency(quotation.total, selectedCurrency)}
      </div>
      <button
        onClick={() => onDownload(quotation)}
        disabled={isExporting === quotation._id}
        style={mobileStyles.downloadBtn}
      >
        <Download size={14} />
        {isExporting === quotation._id ? '...' : 'PDF'}
      </button>
    </div>
  </div>
);

const UserQuotationStatsPage = () => {
  const navigate = useNavigate();
  const { selectedCurrency } = useCompanyCurrency();
  const { addToast } = useToast();
  
  // Responsive hooks
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  
  const [stats, setStats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userQuotations, setUserQuotations] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [sortBy, setSortBy] = useState('totalQuotations');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingId, setExportingId] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserQuotationStats();
      if (response.data.success) {
        setStats(response.data.stats);
        setSummary(response.data.summary);
      } else {
        setError(response.data.message || 'Failed to load stats');
      }
    } catch (err) {
      console.error('Error fetching user stats:', err);
      setError(err.response?.data?.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserQuotations = async (userId, userName) => {
    setLoadingQuotations(true);
    setSelectedUser({ id: userId, name: userName });
    try {
      const response = await adminAPI.getQuotationsByUser(userId);
      if (response.data.success) {
        setUserQuotations(response.data.quotations);
      } else {
        addToast(response.data.message || 'Failed to load user quotations', 'error');
      }
    } catch (err) {
      console.error('Error fetching user quotations:', err);
      addToast(err.response?.data?.message || 'Failed to load user quotations', 'error');
    } finally {
      setLoadingQuotations(false);
    }
  };

  const handleDownload = async (quotation) => {
    setExportingId(quotation._id);
    try {
      await downloadQuotationPDF(quotation);
      addToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      addToast(`PDF failed: ${err.message}`, 'error');
    } finally {
      setExportingId(null);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const filteredStats = useMemo(() => {
    if (!searchTerm) return stats;
    const term = searchTerm.toLowerCase();
    return stats.filter(user => 
      user.userName.toLowerCase().includes(term) ||
      user.userEmail.toLowerCase().includes(term)
    );
  }, [stats, searchTerm]);

  const sortedStats = [...filteredStats].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (sortBy === 'totalValue') {
      aVal = parseFloat(aVal);
      bVal = parseFloat(bVal);
    }
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
  };

  const handleBack = () => {
    if (selectedUser) {
      setSelectedUser(null);
      setUserQuotations([]);
    } else {
      navigate('/admin');
    }
  };

  // Handle row click to view user quotations
  const handleUserRowClick = (userId, userName) => {
    fetchUserQuotations(userId, userName);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error && !selectedUser) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <AlertCircle size={48} color="#ef4444" />
          <p style={styles.errorText}>{error}</p>
          <button onClick={() => navigate('/admin')} style={styles.backBtn}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, padding: isMobile ? '1rem' : '1.5rem' }}>
      <ToastContainer />
      
      {/* Header - Responsive */}
      <div style={{ ...styles.header, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={handleBack} style={{ ...styles.backButton, padding: isMobile ? '0.4rem 0.8rem' : '0.5rem 1rem', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
            <ArrowLeft size={isMobile ? 16 : 20} />
            {selectedUser ? 'Back' : 'Dashboard'}
          </button>
          <button onClick={fetchStats} style={styles.refreshBtn}>
            <RefreshCw size={18} />
          </button>
        </div>
        <h1 style={{ ...styles.title, fontSize: isMobile ? '1.25rem' : '1.5rem', textAlign: isMobile ? 'center' : 'left', marginTop: isMobile ? '0.5rem' : 0 }}>
          {selectedUser ? `Quotations by ${selectedUser.name}` : 'User Quotation Statistics'}
        </h1>
      </div>

      {!selectedUser ? (
        <>
          {/* Summary Cards - Responsive Grid */}
          {summary && (
            <div style={{ 
              ...styles.summaryGrid, 
              gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'),
              gap: isMobile ? '0.75rem' : '1rem'
            }}>
              <div style={{ ...styles.summaryCard, padding: isMobile ? '1rem' : '1.25rem' }}>
                <div style={{ ...styles.summaryIconBg1, width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px' }}>
                  <Users size={isMobile ? 20 : 24} color="#6366f1" />
                </div>
                <div>
                  <div style={{ ...styles.summaryValue, fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{summary.totalUsers}</div>
                  <div style={styles.summaryLabel}>Active Users</div>
                </div>
              </div>
              <div style={{ ...styles.summaryCard, padding: isMobile ? '1rem' : '1.25rem' }}>
                <div style={{ ...styles.summaryIconBg2, width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px' }}>
                  <FileText size={isMobile ? 20 : 24} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ ...styles.summaryValue, fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{summary.totalQuotations}</div>
                  <div style={styles.summaryLabel}>Total Quotations</div>
                </div>
              </div>
              <div style={{ ...styles.summaryCard, padding: isMobile ? '1rem' : '1.25rem' }}>
                <div style={{ ...styles.summaryIconBg3, width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px' }}>
                  <TrendingUp size={isMobile ? 20 : 24} color="#10b981" />
                </div>
                <div>
                  <div style={{ ...styles.summaryValue, fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{summary.averagePerUser}</div>
                  <div style={styles.summaryLabel}>Avg per User</div>
                </div>
              </div>
            </div>
          )}

          {/* Search Bar - Full width on mobile */}
          <div style={{ ...styles.searchBar, maxWidth: isMobile ? '100%' : '300px', marginBottom: '1rem' }}>
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by user name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} style={styles.clearBtn}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* User List - Cards on mobile, Table on desktop */}
          {isMobile ? (
            <div style={mobileStyles.cardsContainer}>
              {sortedStats.length === 0 ? (
                <div style={styles.noResults}>No users found</div>
              ) : (
                sortedStats.map((user) => (
                  <MobileUserCard
                    key={user.userId}
                    user={user}
                    selectedCurrency={selectedCurrency}
                    onViewQuotations={fetchUserQuotations}
                  />
                ))
              )}
            </div>
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableWrapper}>
                <table style={styles.table} cellPadding="0" cellSpacing="0">
                  <thead>
                    <tr>
                      <th style={styles.th} onClick={() => handleSort('userName')}>
                        User <SortIcon field="userName" />
                      </th>
                      <th style={styles.th} onClick={() => handleSort('totalQuotations')}>
                        Quotations <SortIcon field="totalQuotations" />
                      </th>
                      <th style={styles.th} onClick={() => handleSort('totalValue')}>
                        Total Value <SortIcon field="totalValue" />
                      </th>
                      <th style={styles.th}>Pending</th>
                      <th style={styles.th}>Approved</th>
                      <th style={styles.th}>Awarded</th>
                      <th style={styles.th}>Rejected</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={styles.noResultsCell}>No users found</td>
                      </tr>
                    ) : (
                      sortedStats.map((user) => (
                        <tr 
                          key={user.userId} 
                          style={styles.tableRow}
                          onClick={() => handleUserRowClick(user.userId, user.userName)}
                        >
                          <td style={styles.td}>
                            <div style={styles.userCell}>
                              <div style={styles.userAvatar}>
                                {user.userName?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <div style={styles.userName}>{user.userName}</div>
                                <div style={styles.userEmail}>{user.userEmail}</div>
                              </div>
                            </div>
                          </td>
                          <td style={styles.tdCenter}>
                            <span style={styles.quotationCount}>{user.totalQuotations}</span>
                          </td>
                          <td style={styles.tdRight}>
                            <span style={styles.totalValue}>
                              {fmtCurrency(user.totalValue, selectedCurrency)}
                            </span>
                          </td>
                          <td style={styles.tdCenter}>
                            <span style={styles.pendingBadge}>{user.pending || 0}</span>
                          </td>
                          <td style={styles.tdCenter}>
                            <span style={styles.approvedBadge}>{user.approved || 0}</span>
                          </td>
                          <td style={styles.tdCenter}>
                            <span style={styles.awardedBadge}>{user.awarded || 0}</span>
                          </td>
                          <td style={styles.tdCenter}>
                            <span style={styles.rejectedBadge}>{user.rejected || 0}</span>
                          </td>
                          <td style={styles.tdCenter}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchUserQuotations(user.userId, user.userName);
                              }}
                              style={styles.viewBtn}
                            >
                              <Eye size={16} /> View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        // User Quotations View
        <>
          {loadingQuotations ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} />
              <p>Loading quotations...</p>
            </div>
          ) : (
            isMobile ? (
              // Mobile Quotation Cards
              <div style={mobileStyles.cardsContainer}>
                {userQuotations.length === 0 ? (
                  <div style={styles.noResults}>No quotations found for this user</div>
                ) : (
                  userQuotations.map((quote) => (
                    <MobileQuotationCard
                      key={quote._id}
                      quotation={quote}
                      selectedCurrency={selectedCurrency}
                      onDownload={handleDownload}
                      isExporting={exportingId}
                    />
                  ))
                )}
              </div>
            ) : (
              // Desktop Quotation Table
              <div style={styles.tableCard}>
                <div style={styles.tableWrapper}>
                  <table style={styles.table} cellPadding="0" cellSpacing="0">
                    <thead>
                      <tr>
                        <th style={styles.th}>Quote #</th>
                        <th style={styles.th}>Customer</th>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Expiry</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Total</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userQuotations.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={styles.noResultsCell}>No quotations found for this user</td>
                        </tr>
                      ) : (
                        userQuotations.map((quote) => (
                          <tr key={quote._id} style={styles.tableRow}>
                            <td style={styles.td}>
                              <span style={styles.quoteNumber}>{quote.quotationNumber}</span>
                            </td>
                            <td style={styles.td}>
                              {quote.customerSnapshot?.name || quote.customer || 'N/A'}
                            </td>
                            <td style={styles.td}>{fmtDate(quote.date)}</td>
                            <td style={styles.td}>{fmtDate(quote.expiryDate)}</td>
                            <td style={styles.td}>
                              <StatusBadge status={quote.status} />
                            </td>
                            <td style={styles.tdRight}>
                              <span style={styles.totalValue}>
                                {fmtCurrency(quote.total, selectedCurrency)}
                              </span>
                            </td>
                            <td style={styles.tdCenter}>
                              <button
                                onClick={() => handleDownload(quote)}
                                disabled={exportingId === quote._id}
                                style={styles.downloadBtn}
                              >
                                <Download size={14} />
                                {exportingId === quote._id ? '...' : 'PDF'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

// Mobile Styles
const mobileStyles = {
  cardsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  userCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  userCardHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    gap: '0.75rem',
    cursor: 'pointer',
  },
  userAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: '#e0e7ff',
    color: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '1rem',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: '600',
    color: '#0f172a',
    fontSize: '0.875rem',
  },
  userEmail: {
    fontSize: '0.7rem',
    color: '#94a3b8',
  },
  userStats: {
    textAlign: 'center',
  },
  quotationCount: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: '1rem',
  },
  quotationsLabel: {
    fontSize: '0.6rem',
    color: '#94a3b8',
  },
  userCardBody: {
    padding: '1rem',
    borderTop: '1px solid #f1f5f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: '0.7rem',
    color: '#64748b',
  },
  statValue: {
    fontWeight: '600',
    color: '#059669',
    fontSize: '0.875rem',
  },
  badgeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.5rem',
  },
  badgeGroup: {
    textAlign: 'center',
  },
  badgeLabel: {
    display: 'block',
    fontSize: '0.6rem',
    color: '#94a3b8',
    marginTop: '0.2rem',
  },
  pendingBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#fef3c7',
    color: '#d97706',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  approvedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#d1fae5',
    color: '#059669',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  awardedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  rejectedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600',
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '500',
    width: '100%',
  },
  quotationCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  quotationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  quoteNumber: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#0f172a',
    fontSize: '0.8rem',
  },
  quotationCustomer: {
    fontWeight: '500',
    color: '#1f2937',
    fontSize: '0.875rem',
    marginBottom: '0.5rem',
  },
  quotationDetails: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.7rem',
    color: '#64748b',
    marginBottom: '0.75rem',
  },
  quotationFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '0.5rem',
    borderTop: '1px solid #f1f5f9',
  },
  quotationTotal: {
    fontWeight: '700',
    color: '#059669',
    fontSize: '0.875rem',
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    backgroundColor: '#f0fdf4',
    color: '#166534',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '500',
  },
};

// Desktop Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    fontFamily: "'Segoe UI', system-ui, sans-serif"
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  title: {
    fontWeight: 'bold',
    color: '#0f172a',
    margin: 0
  },
  refreshBtn: {
    padding: '0.5rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryGrid: {
    display: 'grid',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  summaryIconBg1: {
    borderRadius: '12px',
    backgroundColor: '#e0e7ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryIconBg2: {
    borderRadius: '12px',
    backgroundColor: '#ede9fe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryIconBg3: {
    borderRadius: '12px',
    backgroundColor: '#d1fae5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryValue: {
    fontWeight: '700',
    color: '#0f172a'
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#64748b'
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    marginBottom: '1rem'
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '0.875rem',
    backgroundColor: 'transparent'
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8'
  },
  tableCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed'
  },
  th: {
    padding: '0.75rem 1rem',
    textAlign: 'center',
    fontSize: '0.7rem',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    cursor: 'pointer'
  },
  td: {
    padding: '0.85rem 1rem',
    fontSize: '0.875rem',
    color: '#1f2937',
    borderBottom: '1px solid #f1f5f9'
  },
  tdCenter: {
    padding: '0.85rem 1rem',
    fontSize: '0.875rem',
    color: '#1f2937',
    textAlign: 'center',
    borderBottom: '1px solid #f1f5f9'
  },
  tdRight: {
    padding: '0.85rem 1rem',
    fontSize: '0.875rem',
    color: '#1f2937',
    textAlign: 'center',
    borderBottom: '1px solid #f1f5f9'
  },
  tableRow: {
    transition: 'background-color 0.15s',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: '#f8fafc'
    }
  },
  userCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#e0e7ff',
    color: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '0.875rem'
  },
  userName: {
    fontWeight: '600',
    color: '#0f172a'
  },
  userEmail: {
    fontSize: '0.7rem',
    color: '#94a3b8'
  },
  quotationCount: {
    fontWeight: '700',
    color: '#0f172a'
  },
  totalValue: {
    fontWeight: '600',
    color: '#059669'
  },
  quoteNumber: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#0f172a'
  },
  pendingBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#fef3c7',
    color: '#d97706',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600'
  },
  approvedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#d1fae5',
    color: '#059669',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600'
  },
  awardedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600'
  },
  rejectedBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: '600'
  },
  viewBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '500'
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    backgroundColor: '#f0fdf4',
    color: '#166534',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontWeight: '500'
  },
  noResults: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  noResultsCell: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '0.875rem',
    borderBottom: '1px solid #f1f5f9'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
    gap: '1rem'
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e2e8f0',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  errorContainer: {
    textAlign: 'center',
    padding: '3rem'
  },
  errorText: {
    color: '#dc2626',
    marginBottom: '1rem'
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500'
  }
};

// Add keyframe animation and hover styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    tr:hover td {
      background-color: #f8fafc;
    }
  `;
  document.head.appendChild(styleSheet);
}

export default UserQuotationStatsPage;