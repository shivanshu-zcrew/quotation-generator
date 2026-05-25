// screens/QuotationScreen.jsx (Complete with AddItemModal - UPDATED with All Companies validation)
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, Tag,
  Building2, Mail, Phone, AlertCircle, CheckCircle, RefreshCw, Loader2, Calendar, Edit2, X
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

const CustomerCard = ({ customer }) => {
  const initials = customer.name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "CU";
  return (
    <div style={{ 
      background: "white", 
      border: "1px solid #f1f5f9", 
      borderRadius: 16, 
      padding: "1rem", 
      marginTop: "0.75rem", 
      transition: "all 0.2s" 
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "0.75rem",
        flexWrap: "wrap"
      }}>
        <div style={{ 
          width: 48, 
          height: 48, 
          borderRadius: 14, 
          background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          color: "white", 
          fontWeight: 700, 
          fontSize: "1.1rem", 
          flexShrink: 0 
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ 
            margin: 0, 
            fontWeight: 700, 
            color: PRIMARY, 
            fontSize: "clamp(0.813rem, 4vw, 0.9rem)" 
          }}>{customer.name}</p>
          <div style={{ 
            display: "flex", 
            gap: "1rem", 
            marginTop: "0.25rem", 
            flexWrap: "wrap" 
          }}>
            {customer.email && (
              <p style={{ 
                margin: 0, 
                color: "#64748b", 
                fontSize: "clamp(0.688rem, 3vw, 0.75rem)", 
                display: "flex", 
                alignItems: "center", 
                gap: 4 
              }}>
                <Mail size={12} /> {customer.email}
              </p>
            )}
            {customer.phone && (
              <p style={{ 
                margin: 0, 
                color: "#64748b", 
                fontSize: "clamp(0.688rem, 3vw, 0.75rem)", 
                display: "flex", 
                alignItems: "center", 
                gap: 4 
              }}>
                <Phone size={12} /> {customer.phone}
              </p>
            )}
          </div>
        </div>
      </div>
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
          ≈ AED {(grandTotal * (exchangeRates.rates?.["AED"] || 1)).toFixed(2)}
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
export default function QuotationScreen({ onBack }) {
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
  const [step, setStep] = useState(STEP.SELECTION);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [manualQueryDate, setManualQueryDate] = useState(getDefaultQueryDate());
  const [isMobile, setIsMobile] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
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
    
    console.log('🏢 Company changed to:', selectedCompany);
    
    resetCustomers();
    setSelectedCustomer(null);
    loadAllCustomers(selectedCompany);
    
    setSelectedItems([]);
    setManualQueryDate(getDefaultQueryDate());
    
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
      currency: { code: selectedCurrency, symbol: currency?.symbol || selectedCurrency },
      companySnapshot: selectedCompany,
      customerSnapshot: selectedCustomer,
      customer: selectedCustomer?.name,
      contact: selectedCustomer?.phone || "",
      date: getTodayDate(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      queryDate: manualQueryDate, 
      projectName: "", tl: "", trn: "", ourRef: "", ourContact: "", salesManagerEmail: "",
      paymentTerms: "", deliveryTerms: "", tax: 0, discount: 0, notes: "", termsAndConditions: "", termsImage: null,
    };
    return (
      <QuotationTemplate 
        customer={selectedCustomer} 
        selectedItems={selectedItems} 
        selectedCompany={selectedCompany} 
        selectedCurrency={selectedCurrency} 
        quotationData={quotationData} 
        onBack={handleBack} 
      />
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
            <CompanyCurrencySelector variant="full" showLabels={false} />
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
                    selectedCurrency={selectedCurrency} 
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
                selectedCurrency={selectedCurrency} 
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
        selectedCurrency={selectedCurrency}
      />

      {/* Toast Notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}