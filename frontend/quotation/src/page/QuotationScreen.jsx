// screens/QuotationScreen.jsx (Complete with AddItemModal - UPDATED with All Companies validation)
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, Tag,
  Building2, Mail, Phone, AlertCircle, CheckCircle, MapPin, Clock, Loader2, Calendar, Edit2, X,
  History, Copy
} from "lucide-react";
import QuotationTemplate from "./QuotationTemplate";
import { CompanyCurrencySelector, useCompanyCurrency } from "../components/CompanyCurrencySelector";
import { useAppStore } from "../services/store";
import { useQuotations } from "../hooks/customHooks";
import { fmtCurrency } from "../utils/formatters";
import CustomerSelector from "../components/CustomerSelector";
import useCustomerStore from "../services/customerStore";
import ItemModal from "../components/AddItemModal";

const PRIMARY = "#0f172a";
const STEP = { SELECTION: 1, TEMPLATE: 2 };
const TOAST_DURATION = 3000;
const ALL_COMPANIES_ID = 'all'; // Add this constant

// Helper functions
const getDefaultQueryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split("T")[0];
};

const getTodayDate = () => {
  return new Date().toISOString().split("T")[0];
};

// ============================================================================
// Reusable Components (Responsive)
// ============================================================================

const Shimmer = ({ width = "100%", height = 16, radius = 10 }) => (
  <div
    style={{
      width, height, borderRadius: radius,
      background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
      backgroundSize: "200% 100%",
      animation: "qs-shimmer 1.4s ease infinite",
    }}
  />
);

const Toast = ({ message, type = "success", onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: "linear-gradient(135deg,#10b981,#059669)",
    error: "linear-gradient(135deg,#ef4444,#dc2626)",
    info: "linear-gradient(135deg,#3b82f6,#2563eb)"
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{ 
      position: "fixed", 
      bottom: 24, 
      zIndex: 1000, 
      animation: "qs-slideIn 0.3s ease",
      left: isMobile ? 16 : 'auto',
      right: isMobile ? 16 : 24,
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 12, 
        background: colors[type], 
        color: "white", 
        padding: "12px 16px", 
        borderRadius: 16, 
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
        fontSize: isMobile ? "0.813rem" : "0.875rem",
      }}>
        {type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
        <span style={{ fontWeight: 500, fontSize: "0.813rem" }}>{message}</span>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: 4, cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, required, count, loading }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "space-between", 
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: "0.5rem"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ 
          width: 36, 
          height: 36, 
          borderRadius: 12, 
          background: `${PRIMARY}10`, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center" 
        }}>
          {loading ? <Loader2 size={18} color={PRIMARY} style={{ animation: "qs-spin 0.9s linear infinite" }} /> : <Icon size={18} color={PRIMARY} />}
        </div>
        <h2 style={{ 
          margin: 0, 
          fontSize: "clamp(0.875rem, 4vw, 1rem)", 
          fontWeight: 700, 
          color: PRIMARY 
        }}>
          {title} {required && <span style={{ color: "#ef4444" }}>*</span>}
        </h2>
      </div>
      {count > 0 && (
        <span style={{ 
          padding: "2px 10px", 
          borderRadius: 20, 
          background: "#f1f5f9", 
          color: "#64748b", 
          fontSize: "0.75rem", 
          fontWeight: 600 
        }}>
          {count} item{count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
};

// ============================================================
// VAT Type Display Helper
// ============================================================
const getVatTypeDisplay = (customer) => {
  const taxTreatment = customer?.taxTreatment || customer?.customerTaxTreatment || '';
  
  const vatTypeMap = {
    'vat_registered': { 
      label: 'VAT Registered', 
      labelShort: 'VAT Reg',
      color: '#059669', 
      bg: '#d1fae5', 
      icon: '✓',
      gradient: 'linear-gradient(135deg, #059669, #10b981)'
    },
    'non_vat_registered': { 
      label: 'Non-VAT Registered', 
      labelShort: 'Non-VAT',
      color: '#d97706', 
      bg: '#fed7aa', 
      icon: '○',
      gradient: 'linear-gradient(135deg, #d97706, #f59e0b)'
    },
    'gcc_vat_registered': { 
      label: 'GCC VAT Registered', 
      labelShort: 'GCC VAT',
      color: '#2563eb', 
      bg: '#dbeafe', 
      icon: '◉',
      gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)'
    },
    'gcc_non_vat_registered': { 
      label: 'GCC Non-VAT Registered', 
      labelShort: 'GCC Non-VAT',
      color: '#7c3aed', 
      bg: '#ede9fe', 
      icon: '◌',
      gradient: 'linear-gradient(135deg, #7c3aed, #8b5cf6)'
    },
  };
  
  return vatTypeMap[taxTreatment] || { 
    label: 'Not Set', 
    labelShort: 'Not Set',
    color: '#6b7280', 
    bg: '#f3f4f6', 
    icon: '?',
    gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)'
  };
};

// ============================================================
// Responsive Customer Card Component
// ============================================================
const CustomerCard = ({ customer, onEdit, onViewDetails }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 480);
      setIsTablet(width >= 480 && width < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const initials = customer.name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "CU";
  const vatType = getVatTypeDisplay(customer);
  const placeOfSupply = customer?.placeOfSupply || customer?.customerPlaceOfSupply || '';
  
  // Format date if available
  const lastUpdated = customer?.updatedAt ? new Date(customer.updatedAt).toLocaleDateString() : null;

  // Responsive sizes
  const avatarSize = isMobile ? 48 : 56;
  const avatarFontSize = isMobile ? '1rem' : '1.25rem';
  const avatarRadius = isMobile ? 16 : 18;
  const cardPadding = isMobile ? '0.875rem' : '1rem';
  const gapSize = isMobile ? '0.75rem' : '1rem';

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: isMobile ? '4px' : '6px',
    padding: isMobile ? '3px 8px' : '4px 12px',
    backgroundColor: vatType.bg,
    color: vatType.color,
    borderRadius: '20px',
    fontSize: isMobile ? '0.65rem' : '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
  };

  const infoChipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: isMobile ? '3px 8px' : '4px 10px',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    fontSize: isMobile ? '0.65rem' : '0.7rem',
    color: '#475569',
    border: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
  };

  const actionButtonStyle = (isPrimary = false) => ({
    padding: isMobile ? '4px 10px' : '6px 12px',
    background: isPrimary ? 'linear-gradient(135deg, #0f172a, #1e293b)' : 'transparent',
    border: isPrimary ? 'none' : '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: isMobile ? '0.65rem' : '0.7rem',
    fontWeight: 500,
    color: isPrimary ? 'white' : '#475569',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      style={{
        background: 'white',
        borderRadius: isMobile ? '16px' : '20px',
        marginTop: '0.75rem',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        border: '1px solid #eef2ff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}
      onMouseEnter={(e) => {
        if (!isMobile) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 12px 24px -12px rgba(0,0,0,0.15)';
          e.currentTarget.style.borderColor = '#c7d2fe';
        }
      }}
      onMouseLeave={(e) => {
        if (!isMobile) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
          e.currentTarget.style.borderColor = '#eef2ff';
        }
      }}
    >
      <div style={{ padding: cardPadding }}>
        {/* Header Section - Responsive Layout */}
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'flex-start',
          gap: gapSize,
        }}>
          {/* Avatar */}
          <div
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarRadius,
              background: vatType.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: avatarFontSize,
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s',
            }}
          >
            {initials}
          </div>

          {/* Main Info - Takes full width on mobile */}
          <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
            {/* Name and Badge Row */}
            <div style={{ 
              display: 'flex', 
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: isMobile ? '0.5rem' : '0.75rem',
              marginBottom: '0.5rem'
            }}>
              <h3 style={{ 
                margin: 0, 
                fontWeight: 700, 
                color: '#0f172a', 
                fontSize: isMobile ? '0.9rem' : '1rem',
                letterSpacing: '-0.2px',
                wordBreak: 'break-word',
              }}>
                {customer.name}
              </h3>
              
              {/* VAT Status Badge */}
              <div style={badgeStyle}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{vatType.icon}</span>
                <span>{isMobile ? vatType.labelShort : vatType.label}</span>
              </div>
            </div>

            {/* Contact Info - Responsive Grid on Mobile */}
            <div style={{ 
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? '0.5rem' : '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '0.75rem'
            }}>
              {customer.email && (
                <div style={infoChipStyle}>
                  <Mail size={isMobile ? 10 : 12} color="#64748b" />
                  <span style={{ 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: isMobile ? '200px' : 'none',
                  }}>
                    {customer.email}
                  </span>
                </div>
              )}
              {customer.phone && (
                <div style={infoChipStyle}>
                  <Phone size={isMobile ? 10 : 12} color="#64748b" />
                  <span>{customer.phone}</span>
                </div>
              )}
            </div>

            {/* Additional Details - Wrap on Mobile */}
            <div style={{ 
              display: 'flex', 
              gap: isMobile ? '0.5rem' : '0.75rem', 
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {placeOfSupply && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: isMobile ? '2px 6px' : '3px 8px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '10px',
                  fontSize: isMobile ? '0.6rem' : '0.65rem',
                  color: '#475569',
                }}>
                  <MapPin size={isMobile ? 8 : 10} />
                  <span>{placeOfSupply}</span>
                </div>
              )}
              
              {customer.tradeLicenseNumber && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: isMobile ? '2px 6px' : '3px 8px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '10px',
                  fontSize: isMobile ? '0.6rem' : '0.65rem',
                  color: '#475569',
                }}>
                  <FileText size={isMobile ? 8 : 10} />
                  <span>TRN: {customer.tradeLicenseNumber}</span>
                </div>
              )}

              {lastUpdated && !isMobile && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '10px',
                  fontSize: '0.65rem',
                  color: '#94a3b8',
                }}>
                  <Clock size={10} />
                  <span>Updated: {lastUpdated}</span>
                </div>
              )}
            </div>

            {/* Last Updated for Mobile - Separate line */}
            {lastUpdated && isMobile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '0.5rem',
                fontSize: '0.6rem',
                color: '#94a3b8',
              }}>
                <Clock size={10} />
                <span>Updated: {lastUpdated}</span>
              </div>
            )}
          </div>

          {/* Action Buttons - Responsive */}
          {(onEdit || onViewDetails) && (
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              flexShrink: 0,
              width: isMobile ? '100%' : 'auto',
              justifyContent: isMobile ? 'flex-end' : 'flex-start',
              marginTop: isMobile ? '0.5rem' : 0,
            }}>
              {onViewDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails(customer);
                  }}
                  style={actionButtonStyle(false)}
                  onMouseEnter={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  {isMobile ? 'Details' : 'View Details'}
                </button>
              )}
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(customer);
                  }}
                  style={actionButtonStyle(true)}
                  onMouseEnter={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Gradient Bar */}
      <div style={{
        height: isMobile ? '2px' : '3px',
        background: vatType.gradient,
        borderRadius: '0 0 20px 20px',
        opacity: 0.7,
      }} />
    </div>
  );
};

const ManualItemRow = ({ item, index, onRemove, onEdit, selectedCurrency }) => {
  const lineTotal = item.quantity * item.unitPrice;

  return (
    <div style={{ 
      border: "1px solid #f1f5f9", 
      borderRadius: 16, 
      padding: "clamp(0.75rem, 3vw, 1rem)", 
      background: "white" 
    }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "0.75rem",
        flexWrap: "wrap",
        gap: "0.5rem"
      }}>
        <span style={{ 
          padding: "2px 8px", 
          borderRadius: 20, 
          background: `${PRIMARY}10`, 
          color: PRIMARY, 
          fontSize: "0.7rem", 
          fontWeight: 600 
        }}>Item {index + 1}</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            onClick={() => onEdit(item)} 
            style={{ 
              padding: "4px 8px", 
              borderRadius: 8, 
              border: "1px solid #e2e8f0", 
              background: "white", 
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.7rem"
            }}
          >
            <Edit2 size={12} /> Edit
          </button>
          <button 
            onClick={() => onRemove(item.id)} 
            style={{ 
              padding: "4px 8px", 
              borderRadius: 8, 
              border: "1px solid #fee2e2", 
              background: "#fef2f2", 
              color: "#dc2626", 
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "0.7rem"
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div style={{ 
        background: `linear-gradient(135deg,${PRIMARY}05,${PRIMARY}02)`, 
        borderRadius: 12, 
        padding: "clamp(0.75rem, 3vw, 1rem)", 
        marginBottom: "1rem", 
        border: `1px solid ${PRIMARY}10`
      }}>
        <h3 style={{ 
          margin: 0, 
          fontWeight: 700, 
          color: PRIMARY, 
          fontSize: "clamp(0.875rem, 4vw, 1rem)" 
        }}>{item.name}</h3>
        {item.description && (
          <p style={{ margin: "0.5rem 0 0", color: "#64748b", fontSize: "0.75rem" }}>{item.description}</p>
        )}
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", 
        gap: "0.75rem", 
        marginBottom: "0.75rem" 
      }}>
        <div>
          <label style={{ display: "block", color: "#64748b", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Quantity</label>
          <div style={{ padding: "0.5rem", background: "#f8fafc", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, textAlign: "center" }}>
            {item.quantity}
          </div>
        </div>
        <div>
          <label style={{ display: "block", color: "#64748b", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Unit</label>
          <div style={{ padding: "0.5rem", background: "#f8fafc", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, textAlign: "center" }}>
            {item.unit || "—"}
          </div>
        </div>
        <div>
          <label style={{ display: "block", color: "#64748b", fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.25rem" }}>Unit Price</label>
          <div style={{ padding: "0.5rem", background: "#f8fafc", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, textAlign: "right" }}>
            {fmtCurrency(item.unitPrice, selectedCurrency)}
          </div>
        </div>
      </div>

      <div style={{ 
        paddingTop: "0.5rem", 
        borderTop: "1px solid #f1f5f9", 
        display: "flex", 
        justifyContent: "flex-end", 
        alignItems: "center", 
        gap: "0.5rem",
        flexWrap: "wrap"
      }}>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Line total:</span>
        <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.875rem" }}>{fmtCurrency(lineTotal, selectedCurrency)}</span>
      </div>
    </div>
  );
};

const SummaryCard = ({ grandTotal, exchangeRates, selectedCurrency }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{ 
      background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, 
      borderRadius: 20, 
      padding: "clamp(1rem, 4vw, 1.5rem)", 
      color: "white", 
      marginBottom: "1.5rem" 
    }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "0.5rem",
        flexWrap: "wrap",
        gap: "0.5rem"
      }}>
        <div>
          <p style={{ 
            margin: 0, 
            fontSize: "clamp(0.688rem, 3vw, 0.75rem)", 
            opacity: 0.8, 
            textTransform: "uppercase", 
            letterSpacing: "0.5px" 
          }}>Estimated Total</p>
          <p style={{ 
            margin: "0.25rem 0 0", 
            fontSize: "clamp(1.25rem, 6vw, 2rem)", 
            fontWeight: 800 
          }}>{fmtCurrency(grandTotal, selectedCurrency)}</p>
        </div>
        <div style={{ fontSize: "clamp(1.5rem, 6vw, 2.5rem)", opacity: 0.3 }}>🧾</div>
      </div>
      <p style={{ 
        margin: "0.5rem 0 0", 
        fontSize: "clamp(0.625rem, 3vw, 0.7rem)", 
        opacity: 0.7 
      }}>Excludes tax & discount — configure in the next step</p>
      {exchangeRates && selectedCurrency !== "AED" && (
        <p style={{ 
          margin: "0.25rem 0 0", 
          fontSize: "clamp(0.563rem, 3vw, 0.65rem)", 
          opacity: 0.5 
        }}>
          {/* ≈ AED {(grandTotal * (exchangeRates.rates?.["AED"] || 1)).toFixed(2)} */}
        </p>
      )}
    </div>
  );
};

const EmptyItemsState = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{ 
      border: "2px dashed #e2e8f0", 
      borderRadius: 16, 
      padding: "clamp(1.5rem, 5vw, 2.5rem)", 
      textAlign: "center", 
      background: "#fafbff" 
    }}>
      <div style={{ 
        width: 48, 
        height: 48, 
        borderRadius: 14, 
        background: "#f1f5f9", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        margin: "0 auto 0.875rem" 
      }}>
        <Package size={22} color="#94a3b8" />
      </div>
      <p style={{ 
        margin: "0 0 0.3rem", 
        color: "#475569", 
        fontWeight: 600, 
        fontSize: "clamp(0.813rem, 4vw, 0.9rem)" 
      }}>No items added yet</p>
      <p style={{ 
        margin: 0, 
        color: "#94a3b8", 
        fontSize: "clamp(0.75rem, 3.5vw, 0.813rem)" 
      }}>Click the button below to add your first item</p>
    </div>
  );
};

const CustomerSelectSkeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
    <div style={{ 
      width: "100%", 
      height: "46px", 
      borderRadius: 14, 
      border: "1.5px solid #e2e8f0", 
      background: "#fafbff", 
      display: "flex", 
      alignItems: "center", 
      padding: "0 1rem", 
      gap: "0.75rem" 
    }}>
      <Shimmer width="60%" height={14} radius={8} />
      <div style={{ marginLeft: "auto" }}><Shimmer width={16} height={16} radius={4} /></div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingLeft: "0.25rem" }}>
      <Loader2 size={13} color="#94a3b8" style={{ animation: "qs-spin 0.9s linear infinite" }} />
      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 500 }}>Loading customers…</span>
    </div>
  </div>
);

const LoadErrorBanner = ({ error, onRetry }) => (
  <div style={{ 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "space-between", 
    gap: "0.75rem", 
    padding: "0.75rem 1rem", 
    background: "#fef2f2", 
    border: "1px solid #fecaca", 
    borderRadius: 12, 
    marginBottom: "0.75rem",
    flexWrap: "wrap"
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <AlertCircle size={15} color="#dc2626" />
      <span style={{ fontSize: "clamp(0.75rem, 3vw, 0.8rem)", color: "#dc2626", fontWeight: 500 }}>{error}</span>
    </div>
    {onRetry && (
      <button onClick={onRetry} style={{ 
        padding: "4px 10px", 
        borderRadius: 8, 
        fontSize: "0.75rem", 
        fontWeight: 700, 
        background: "#dc2626", 
        color: "white", 
        border: "none", 
        cursor: "pointer" 
      }}>
        Retry
      </button>
    )}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================
export default function QuotationScreen({ onBack, prefillFrom }) {
  // --------------------------------------------------------------------------
  // Hooks & Store
  // --------------------------------------------------------------------------
  const { addQuotation } = useQuotations();
  const { selectedCompany, selectedCurrency, currency, exchangeRates } = useCompanyCurrency();
  const {
    customers,
    isLoading: isCustomersLoading,
    isLoaded: isCustomersLoaded,
    loadAllCustomers,
    refreshCustomers,
    resetCustomers,
    syncCustomers
  } = useCustomerStore();
  const { loading: storeLoading, loadError, fetchAllData, initialized } = useAppStore();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  // When prefillFrom is provided jump straight to the template step
  const [step, setStep] = useState(prefillFrom ? STEP.TEMPLATE : STEP.SELECTION);
  const [selectedCustomer, setSelectedCustomer] = useState(() => {
    if (!prefillFrom) return null;
    const snapshot = prefillFrom.customerSnapshot || {};
    // customerId may be a populated object { _id, name, ... } or a raw ID string
    const rawId = typeof prefillFrom.customerId === 'object'
      ? prefillFrom.customerId?._id
      : prefillFrom.customerId;
    return { ...snapshot, _id: rawId || snapshot._id || null };
  });
  const [selectedItems, setSelectedItems] = useState(
    prefillFrom
      ? (prefillFrom.items || []).map((it, idx) => ({
          id: `prefill-${idx}`,
          itemId: it.itemId || `prefill-item-${idx}`,
          name: it.name || it.description || '',
          description: it.description || it.name || '',
          quantity: it.quantity || 1,
          unit: it.unit || '',
          unitPrice: it.unitPrice || 0,
          zohoItemId: it.zohoItemId || null,
          imageUrls: it.imageUrls || [],
          imagePaths: it.imagePaths || [],
        }))
      : []
  );
  const [toast, setToast] = useState(null);
  const [manualQueryDate, setManualQueryDate] = useState(
    prefillFrom?.queryDate
      ? new Date(prefillFrom.queryDate).toISOString().split('T')[0]
      : getDefaultQueryDate()
  );
  const [isMobile, setIsMobile] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [localCurrency, setLocalCurrency] = useState(prefillFrom?.currency?.code || 'AED');
  const [localCompany, setLocalCompany] = useState(null);
  // Tracks the last company value seen by the company-change effect.
  // undefined = effect hasn't fired yet (distinguish from an explicit null/empty selection).
  // React 18 StrictMode fires effects twice (mount → cleanup → remount → fire again);
  // using the actual value (not a boolean flag) means the second fire with the same
  // company is a no-op and doesn't wipe prefill state.
  const prevCompanyRef = useRef(undefined);
  // --------------------------------------------------------------------------
  // Responsive Detection
  // --------------------------------------------------------------------------
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --------------------------------------------------------------------------
  // Derived State
  // --------------------------------------------------------------------------
  const isCustomersActuallyLoading = isCustomersLoading || (!isCustomersLoaded && customers.length === 0);
  const showNoCustomersMessage = initialized && customers.length === 0 && !storeLoading && !isCustomersLoading;
  const grandTotal = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0), 
    [selectedItems]
  );
  
  // Check if "All Companies" is selected
  const isAllCompaniesSelected = selectedCompany === ALL_COMPANIES_ID;
  
  // Update canProceed to include validation for All Companies
  const canProceed = !isCustomersActuallyLoading && 
                     selectedCustomer && 
                     selectedItems.length > 0 && 
                     !isAllCompaniesSelected; // Add this condition

  // --------------------------------------------------------------------------
  // Effects
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedCompany) return;

    // First call ever: record the company and bail. This handles both the real
    // initial mount and React 18 StrictMode's second fire (which re-uses the same
    // ref value, so the `=== selectedCompany` guard below catches it too).
    if (prevCompanyRef.current === undefined) {
      prevCompanyRef.current = selectedCompany;
      return;
    }

    // StrictMode fires the effect twice with the same deps — skip if nothing changed.
    if (prevCompanyRef.current === selectedCompany) return;

    // Genuine company switch — clear everything and reload.
    prevCompanyRef.current = selectedCompany;
    resetCustomers();
    setSelectedCustomer(null);
    setSelectedItems([]);
    setManualQueryDate(getDefaultQueryDate());
    loadAllCustomers(selectedCompany);
  }, [selectedCompany, resetCustomers, loadAllCustomers]);

  useEffect(() => {
    if (!selectedCompany) return;
    
    if (!isCustomersLoaded && !isCustomersLoading) {
      console.log('📚 Initial load of customers for company:', selectedCompany);
      loadAllCustomers(selectedCompany);
    }
    
  }, [selectedCompany, isCustomersLoaded, isCustomersLoading, loadAllCustomers]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleCurrencyChange = useCallback((newCurrency) => {
    setLocalCurrency(newCurrency);
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  }, []);

  const handleAddManualItem = useCallback((newItem) => {
    setSelectedItems(prev => [...prev, newItem]);
    showToast("Item added successfully", "success");
  }, [showToast]);

  const handleRemoveItem = useCallback((id) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleItemChange = useCallback((id, field, value) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  const handleEditItem = useCallback((updatedItem) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    showToast("Item updated successfully", "success");
    setEditingItem(null);
  }, [showToast]);
  
  const handleOpenEditModal = useCallback((item) => {
    setEditingItem(item);
    setIsAddItemModalOpen(true);
  }, []);
  
  const handleSyncCustomers = useCallback(async (result) => {
    if (result?.success) {
      await refreshCustomers(selectedCompany);
      showToast(`✅ Synced ${result.stats?.created || 0} new, ${result.stats?.updated || 0} updated customers`, "success");
    } else if (result?.error) {
      showToast(`❌ Sync failed: ${result.error}`, "error");
    }
  }, [selectedCompany, refreshCustomers, showToast]);

  const handleProceedToTemplate = useCallback(() => {
    // Validation: Check if "All Companies" is selected
    if (isAllCompaniesSelected) {
      showToast("Please select a specific company, not 'All Companies', to create a quotation", "error");
      return;
    }
    
    if (!selectedCompany) {
      showToast("Please select a company", "error");
      return;
    }
    
    if (!selectedCustomer) {
      showToast("Please select a customer", "error");
      return;
    }
    
    if (selectedItems.length === 0) {
      showToast("Please add at least one item", "error");
      return;
    }

    setStep(STEP.TEMPLATE);
  }, [selectedCompany, selectedCustomer, selectedItems, showToast, isAllCompaniesSelected]);

  const handleBack = useCallback(() => {
    step === STEP.TEMPLATE ? setStep(STEP.SELECTION) : onBack?.();
  }, [step, onBack]);

  // --------------------------------------------------------------------------
  // Animation Styles
  // --------------------------------------------------------------------------
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes qs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      @keyframes qs-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes qs-slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      
      @media (max-width: 768px) {
        .quotation-container {
          padding: 1rem !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // --------------------------------------------------------------------------
  // Render: Template Step
  // --------------------------------------------------------------------------
  if (step === STEP.TEMPLATE) {
    const quotationData = {
      currency: { code: localCurrency, symbol: currency?.symbol || localCurrency },
      companySnapshot: selectedCompany,
      customerSnapshot: selectedCustomer,
      customer: selectedCustomer?.name,
      contact: selectedCustomer?.phone || "",
      date: getTodayDate(),
      expiryDate: getDefaultQueryDate(),
      queryDate: manualQueryDate,
      projectName: prefillFrom?.projectName || "",
      tl: "", trn: "", ourRef: "", ourContact: "", salesManagerEmail: "",
      paymentTerms: prefillFrom?.paymentTerms || "",
      deliveryTerms: prefillFrom?.deliveryTerms || "",
      tax: prefillFrom?.taxPercent ?? (prefillFrom?.tax ?? 0),
      discount: prefillFrom?.discountPercent ?? (prefillFrom?.discount ?? 0),
      notes: prefillFrom?.notes || "",
      termsAndConditions: prefillFrom?.termsAndConditions || "",
      termsImage: null,
      revisedFrom: prefillFrom?.revisedFrom || null,
      revisionNote: prefillFrom?.revisionNote || "",
      originalQuotationNumber: prefillFrom?.quotationNumber || null,
    };
    return (
      <>
        {prefillFrom?.revisedFrom && (
          <div style={{ padding: '1rem 1.5rem 0' }}>
            <div style={{
              maxWidth: 1280, margin: '0 auto',
              background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '0.5rem',
              padding: '0.75rem 1rem', fontSize: '0.8125rem', fontWeight: 500, color: '#5b21b6',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <History size={15} style={{ flexShrink: 0 }} />
              <span>Revising <strong>{prefillFrom.quotationNumber}</strong> — the original will be kept. A new revision number (e.g. -R1) will be applied on save.</span>
            </div>
          </div>
        )}
        {prefillFrom?.duplicatedFrom && (
          <div style={{ padding: '1rem 1.5rem 0' }}>
            <div style={{
              maxWidth: 1280, margin: '0 auto',
              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '0.5rem',
              padding: '0.75rem 1rem', fontSize: '0.8125rem', fontWeight: 500, color: '#065f46',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <Copy size={15} style={{ flexShrink: 0 }} />
              <span>Duplicated from <strong>{prefillFrom.quotationNumber}</strong> — review and save to create a new independent quotation.</span>
            </div>
          </div>
        )}
        <QuotationTemplate
          customer={selectedCustomer}
          selectedItems={selectedItems}
          selectedCurrency={localCurrency}
          selectedCompany={selectedCompany}
          quotationData={quotationData}
          onBack={handleBack}
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Selection Step
  // --------------------------------------------------------------------------
  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%)", 
      fontFamily: "system-ui,-apple-system,sans-serif" 
    }}>
      <div style={{ 
        maxWidth: 900, 
        margin: "0 auto", 
        padding: isMobile ? "1rem" : "2rem 1.5rem" 
      }}>
        
        {/* Header */}
        <div style={{ marginBottom: isMobile ? "1.5rem" : "2rem" }}>
          <p style={{ 
            margin: "0 0 0.35rem", 
            color: "#94a3b8", 
            fontSize: "clamp(0.688rem, 3vw, 0.75rem)", 
            fontWeight: 600, 
            textTransform: "uppercase", 
            letterSpacing: "0.5px" 
          }}>
            Step 1 of 2
          </p>
          <h1 style={{ 
            margin: 0, 
            fontSize: "clamp(1.5rem, 6vw, 2rem)", 
            fontWeight: 800, 
            background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, 
            WebkitBackgroundClip: "text", 
            WebkitTextFillColor: "transparent" 
          }}>
            Create Quotation
          </h1>
          <p style={{ 
            margin: "0.5rem 0 0", 
            color: "#64748b", 
            fontSize: "clamp(0.75rem, 3.5vw, 0.875rem)" 
          }}>
            Select company, customer and add items to generate a quotation
          </p>
        </div>

        {/* Warning Banner for All Companies Selection */}
        {isAllCompaniesSelected && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.75rem", 
            padding: "0.75rem 1rem", 
            background: "#fef3c7", 
            border: "1px solid #fde68a", 
            borderRadius: 12, 
            marginBottom: "1rem"
          }}>
            <AlertCircle size={18} color="#d97706" />
            <span style={{ fontSize: "clamp(0.75rem, 3.5vw, 0.813rem)", color: "#92400e", fontWeight: 500 }}>
              Please select a specific company to create a quotation. "All Companies" view is for admin reference only.
            </span>
          </div>
        )}

        {/* Main Card */}
        <div style={{ 
          background: "white", 
          borderRadius: 24, 
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", 
          overflow: "hidden" 
        }}>
          
          {/* Company Section */}
          <div style={{ padding: isMobile ? "1rem 1rem 0" : "1.5rem 1.5rem 0" }}>
            <SectionHeader icon={Building2} title="Company" required />
            <CompanyCurrencySelector 
  variant="full" 
  showLabels={true}
  localCurrencyMode={true}  
  localCurrencyValue={localCurrency}
  onCurrencyChange={(currency) => {
    setLocalCurrency(currency);
    console.log('Currency changed locally:', currency);
   }}
  onCompanyChange={(companyId, meta) => {
    console.log('Company changed (global):', companyId);
   }}
/>
          </div>
          <div style={{ height: 1, background: "#f1f5f9", margin: isMobile ? "1rem 0" : "1.5rem 0" }} />

          {/* Customer Section */}
          <div style={{ padding: isMobile ? "0 1rem" : "0 1.5rem" }}>
            <SectionHeader icon={Users} title="Customer" required loading={isCustomersActuallyLoading} />
            
            {loadError && !isCustomersLoading && (
              <LoadErrorBanner error={`Failed to load data: ${loadError}`} onRetry={fetchAllData} />
            )}
            
            <div style={{ display: isCustomersActuallyLoading ? 'none' : 'block' }}>
              <CustomerSelector
                key={selectedCompany}
                value={selectedCustomer?._id || ''}
                onChange={(_, customer) => setSelectedCustomer(customer)}
                placeholder={isMobile ? "— Search customer —" : "— Search or select a customer —"}
                companyId={selectedCompany}
                onSyncComplete={handleSyncCustomers}
                autoLoad={true}
                disabled={isAllCompaniesSelected} // Disable customer selection when All Companies is selected
              />
            </div>

            {isCustomersActuallyLoading && <CustomerSelectSkeleton />}

            {!isCustomersActuallyLoading && showNoCustomersMessage && (
              <p style={{ 
                margin: "0.5rem 0 0", 
                color: "#f59e0b", 
                fontSize: "clamp(0.75rem, 3.5vw, 0.8rem)", 
                fontWeight: 500 
              }}>
                ⚠️ No customers found. Click the sync button to import customers from Zoho.
              </p>
            )}

            {!isCustomersActuallyLoading && selectedCustomer && <CustomerCard customer={selectedCustomer} />}
            
            {/* Disabled customer message when All Companies is selected */}
             
          </div>
          
          <div style={{ height: 1, background: "#f1f5f9", margin: isMobile ? "1rem 0" : "1.5rem 0" }} />

          {/* Items Section - Manual Entry with Modal */}
          <div style={{ padding: isMobile ? "0 1rem" : "0 1.5rem" }}>
            <SectionHeader icon={Package} title="Items" required count={selectedItems.length} loading={false} />
            
            {selectedItems.length === 0 ? (
              <EmptyItemsState />
            ) : (
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: "0.75rem", 
                marginBottom: "0.75rem" 
              }}>
                {selectedItems.map((item, index) => (
                  <ManualItemRow 
                    key={item.id} 
                    item={item} 
                    index={index} 
                    onUpdate={handleItemChange} 
                    onRemove={handleRemoveItem}
                    onEdit={handleOpenEditModal}  
                    selectedCurrency={localCurrency} 
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => setIsAddItemModalOpen(true)}
              disabled={isAllCompaniesSelected} // Disable when All Companies is selected
              style={{
                marginTop: "0.75rem",
                width: "100%",
                padding: isMobile ? "0.65rem" : "0.75rem",
                background: isAllCompaniesSelected ? "#f1f5f9" : "#eff1ff",
                color: isAllCompaniesSelected ? "#94a3b8" : "#6366f1",
                border: isAllCompaniesSelected ? "1.5px solid #e2e8f0" : "1.5px dashed #c7d2fe",
                borderRadius: 14,
                fontSize: "clamp(0.813rem, 4vw, 0.875rem)",
                fontWeight: 600,
                cursor: isAllCompaniesSelected ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "all 0.2s",
                opacity: isAllCompaniesSelected ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!isAllCompaniesSelected) {
                  e.currentTarget.style.background = "#e0e7ff";
                }
              }}
              onMouseLeave={(e) => {
                if (!isAllCompaniesSelected) {
                  e.currentTarget.style.background = "#eff1ff";
                }
              }}
            >
              <Plus size={16} /> 
              {isAllCompaniesSelected 
                ? "Select a company to add items" 
                : (selectedItems.length > 0 ? "Add Another Item" : "Add Item")}
            </button>
          </div>

          {/* Query Date Section */}
          <div style={{ padding: isMobile ? "0 1rem" : "0 1.5rem", marginTop: "1.5rem" }}>
            <div style={{ 
              background: "#f8fafc", 
              borderRadius: 16, 
              padding: isMobile ? "0.875rem 1rem" : "1rem 1.25rem",
              border: "1px solid #e2e8f0"
            }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem", 
                marginBottom: "0.75rem",
                flexWrap: "wrap"
              }}>
                <Calendar size={18} color={PRIMARY} />
                <label style={{ fontWeight: 600, color: PRIMARY, fontSize: "clamp(0.813rem, 4vw, 0.875rem)" }}>
                  Follow-up / Query Date
                </label>
              </div>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "1rem", 
                flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row"
              }}>
                <input
                  type="date"
                  value={manualQueryDate}
                  onChange={(e) => setManualQueryDate(e.target.value)}
                  min={getTodayDate()}
                  style={{
                    padding: "0.6rem 1rem",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: "clamp(0.813rem, 4vw, 0.875rem)",
                    outline: "none",
                    fontFamily: "inherit",
                    flex: 1,
                    minWidth: isMobile ? "100%" : "200px",
                    transition: "all 0.2s",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
                />
                <button
                  onClick={() => setManualQueryDate(getDefaultQueryDate())}
                  style={{
                    padding: "0.6rem 1rem",
                    background: "#e2e8f0",
                    color: "#475569",
                    border: "none",
                    borderRadius: 10,
                    fontSize: "clamp(0.688rem, 3.5vw, 0.75rem)",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Reset to Default (30 days)
                </button>
              </div>
              <p style={{ 
                fontSize: "clamp(0.625rem, 3vw, 0.7rem)", 
                color: "#94a3b8", 
                marginTop: "0.5rem" 
              }}>
                Set a follow-up date to remind when to check back with the customer
              </p>
            </div>
          </div>

          {/* Summary */}
          {selectedItems.length > 0 && (
            <div style={{ padding: isMobile ? "1rem" : "1.5rem" }}>
              <SummaryCard 
                grandTotal={grandTotal} 
                exchangeRates={exchangeRates} 
                selectedCurrency={localCurrency} 
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ 
            padding: isMobile ? "1rem" : "1.25rem 1.5rem", 
            borderTop: "1px solid #f1f5f9", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            background: "#fafbff",
            flexDirection: isMobile ? "column-reverse" : "row",
            gap: isMobile ? "1rem" : "0"
          }}>
            
            {isCustomersActuallyLoading && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.5rem",
                width: isMobile ? "100%" : "auto",
                justifyContent: "center"
              }}>
                <Loader2 size={14} color="#6366f1" style={{ animation: "qs-spin 0.9s linear infinite" }} />
                <span style={{ fontSize: "0.78rem", color: "#6366f1", fontWeight: 500 }}>
                  Loading customers…
                </span>
              </div>
            )}
            
            <div style={{ 
              display: "flex", 
              gap: "0.75rem", 
              width: isMobile ? "100%" : "auto",
              justifyContent: "center"
            }}>
              <button 
                onClick={handleBack} 
                style={{ 
                  padding: isMobile ? "0.65rem 1rem" : "0.75rem 1.5rem",
                  background: "white", 
                  color: "#475569", 
                  border: "1.5px solid #e2e8f0", 
                  borderRadius: 14, 
                  fontSize: "clamp(0.813rem, 4vw, 0.875rem)", 
                  fontWeight: 600, 
                  cursor: "pointer", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem",
                  flex: isMobile ? 1 : "auto",
                  justifyContent: "center"
                }}
              >
                <ArrowLeft size={17} /> Back
              </button>
              
              <button
                onClick={handleProceedToTemplate}
                disabled={!canProceed}
                style={{
                  padding: isMobile ? "0.65rem 1rem" : "0.75rem 1.5rem",
                  background: canProceed ? `linear-gradient(135deg,${PRIMARY},#1e293b)` : "#e2e8f0",
                  color: canProceed ? "white" : "#94a3b8",
                  border: "none", 
                  borderRadius: 14, 
                  fontSize: "clamp(0.813rem, 4vw, 0.875rem)", 
                  fontWeight: 600,
                  cursor: canProceed ? "pointer" : "not-allowed",
                  display: "flex", 
                  alignItems: "center", 
                  gap: "0.5rem",
                  boxShadow: canProceed ? `0 4px 12px ${PRIMARY}30` : "none",
                  opacity: canProceed ? 1 : 0.7,
                  flex: isMobile ? 1 : "auto",
                  justifyContent: "center"
                }}
              >
                {isCustomersActuallyLoading ? (
                  <><Loader2 size={15} style={{ animation: "qs-spin 0.9s linear infinite" }} /> Loading…</>
                ) : isAllCompaniesSelected ? (
                  <>Select a Company <ArrowRight size={17} /></>
                ) : (
                  <>Continue <ArrowRight size={17} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <ItemModal
        isOpen={isAddItemModalOpen}
        onClose={() => {
          setIsAddItemModalOpen(false);
          setEditingItem(null);
        }}
        onAddItem={handleAddManualItem}
        onEditItem={handleEditItem}
        editingItem={editingItem}
        selectedCurrency={localCurrency}
      />

      {/* Toast Notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}