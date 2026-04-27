// screens/QuotationScreen.jsx (Complete Fixed Version with Manual Query Date)
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, Tag,
  Building2, Mail, Phone, AlertCircle, CheckCircle, RefreshCw, Loader2, Calendar
} from "lucide-react";
import QuotationTemplate from "./QuotationTemplate";
import { CompanyCurrencySelector, useCompanyCurrency } from "../components/CompanyCurrencySelector";
import InfiniteItemSelector from "../components/ItemSelector";
import useItemStore from "../services/itemStore";
import { useAppStore } from "../services/store";
import { useItemsList, useQuotations } from "../hooks/customHooks";
import { fmtCurrency } from "../utils/formatters";
import CustomerSelector from "../components/CustomerSelector";
import useCustomerStore from "../services/customerStore";

const PRIMARY = "#0f172a";
const STEP = { SELECTION: 1, TEMPLATE: 2 };
const TOAST_DURATION = 3000;

// Helper function to get default query date (30 days from today)
const getDefaultQueryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split("T")[0];
};

// Helper function to get today's date
const getTodayDate = () => {
  return new Date().toISOString().split("T")[0];
};

// ============================================================================
// Reusable Components
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

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000, animation: "qs-slideIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: colors[type], color: "white", padding: "14px 20px", borderRadius: 16, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
        {type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>{message}</span>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: 4, cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, required, count, loading }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{ width: 36, height: 36, borderRadius: 12, background: `${PRIMARY}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loading ? <Loader2 size={18} color={PRIMARY} style={{ animation: "qs-spin 0.9s linear infinite" }} /> : <Icon size={18} color={PRIMARY} />}
      </div>
      <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: PRIMARY }}>
        {title} {required && <span style={{ color: "#ef4444" }}>*</span>}
      </h2>
    </div>
    {count > 0 && (
      <span style={{ padding: "2px 10px", borderRadius: 20, background: "#f1f5f9", color: "#64748b", fontSize: "0.75rem", fontWeight: 600 }}>
        {count} item{count !== 1 ? "s" : ""}
      </span>
    )}
  </div>
);

const CustomerCard = ({ customer }) => {
  const initials = customer.name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "CU";
  return (
    <div style={{ background: "white", border: "1px solid #f1f5f9", borderRadius: 16, padding: "1rem", marginTop: "0.75rem", transition: "all 0.2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, color: PRIMARY, fontSize: "0.9rem" }}>{customer.name}</p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
            {customer.email && <p style={{ margin: 0, color: "#64748b", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}><Mail size={12} /> {customer.email}</p>}
            {customer.phone && <p style={{ margin: 0, color: "#64748b", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} /> {customer.phone}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const ItemRow = ({ item, index, items, onUpdate, onRemove, selectedCurrency }) => {
  const lineTotal = item.quantity * item.unitPrice;
  
  const itemData = useMemo(() => {
    if (item.fullItemData) return item.fullItemData;
    if (!items?.length) return null;
    return items.find(i => i._id === item.itemId || i.zohoId === item.zohoId || i.name === item.name) || null;
  }, [items, item.itemId, item.zohoId, item.name, item.fullItemData]);

  const hasBasicInfo = item.name || item.itemId;

  if (!itemData && !hasBasicInfo) {
    return (
      <div style={{ border: "1px solid #f1f5f9", borderRadius: 16, padding: "1rem", background: "#fef2f2", textAlign: "center" }}>
        <AlertCircle size={24} color="#dc2626" style={{ marginBottom: "0.5rem" }} />
        <p style={{ margin: 0, color: "#dc2626", fontSize: "0.875rem", fontWeight: 500 }}>Item not found in catalog</p>
        <p style={{ margin: "0.25rem 0 0", color: "#991b1b", fontSize: "0.75rem" }}>ID: {item.zohoId || item.itemId || "Unknown"}</p>
      </div>
    );
  }

  const displayData = itemData || { name: item.name || "Unknown Item", price: item.unitPrice };
  const isWarning = !itemData && hasBasicInfo;

  return (
    <div style={{ border: "1px solid #f1f5f9", borderRadius: 16, padding: "1rem", background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <span style={{ padding: "2px 8px", borderRadius: 20, background: `${PRIMARY}10`, color: PRIMARY, fontSize: "0.7rem", fontWeight: 600 }}>Item {index + 1}</span>
        <button onClick={() => onRemove(item.id)} style={{ padding: 4, borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer" }}>
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ background: isWarning ? "#fffbeb" : `linear-gradient(135deg,${PRIMARY}05,${PRIMARY}02)`, borderRadius: 12, padding: "1rem", marginBottom: "1rem", border: `1px solid ${isWarning ? "#fde68a" : `${PRIMARY}10`}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, color: isWarning ? "#b45309" : PRIMARY, fontSize: "1rem" }}>{displayData.name}</h3>
            {displayData.sku && <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.7rem" }}><Tag size={10} /> SKU: {displayData.sku}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, color: "#059669", fontWeight: 700, fontSize: "1rem" }}>{fmtCurrency(displayData.price, selectedCurrency)}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0.5rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${isWarning ? "#fde68a" : `${PRIMARY}10`}` }}>
          {displayData.zohoId && <ItemMeta label="Zoho ID" value={displayData.zohoId} monospace />}
          {displayData.unit && <ItemMeta label="Unit" value={displayData.unit} />}
          {displayData.product_type && <ItemMeta label="Type" value={displayData.product_type} />}
          {displayData.tax_percentage > 0 && <ItemMeta label="Tax" value={`${displayData.tax_percentage}%`} />}
        </div>

        {displayData.description && (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${isWarning ? "#fde68a" : `${PRIMARY}10`}`, fontSize: "0.75rem", color: "#64748b" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.65rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Description:</span>
            {displayData.description}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
      <ItemInput
  label="Quantity"
  type="text"
  inputMode="numeric"
  value={item.quantity ?? ""}
  onChange={(v) => {
    if (v === "") {
      onUpdate(item.id, "quantity", "");
    } else {
      onUpdate(item.id, "quantity", parseInt(v));
    }
  }}
/>

<ItemInput
  label="Unit Price"
  type="text"
  inputMode="decimal"
  value={item.unitPrice ?? ""}
  onChange={(v) => {
    if (v === "") {
      onUpdate(item.id, "unitPrice", "");
    } else {
      onUpdate(item.id, "unitPrice", parseFloat(v));
    }
  }}
  align="right"
/>
      </div>

      <div style={{ paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Line total:</span>
        <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.875rem" }}>{fmtCurrency(lineTotal, selectedCurrency)}</span>
      </div>

      {isWarning && (
        <p style={{ margin: "0.5rem 0 0", color: "#b45309", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <AlertCircle size={12} /> Item details will be loaded when proceeding
        </p>
      )}
    </div>
  );
};

const ItemMeta = ({ label, value, monospace }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{ color: "#94a3b8", fontSize: "0.65rem", fontWeight: 500 }}>{label}:</span>
    <span style={{ color: "#475569", fontSize: "0.7rem", fontFamily: monospace ? "monospace" : "inherit" }}>{value}</span>
  </div>
);

const ItemInput = ({ label, align = "center", value, onChange, ...props }) => {
  const handleChange = (e) => {
    let val = e.target.value;

     if (val === "") {
      onChange("");
      return;
    }

     val = val.replace(/^0+(?=\d)/, "");  

    onChange(val);
  };

  return (
    <div>
      <label style={{
        display: "block",
        color: "#64748b",
        fontSize: "0.7rem",
        fontWeight: 600,
        marginBottom: "0.25rem"
      }}>
        {label}
      </label>

      <input
        {...props}
        value={value ?? ""}  
        onChange={handleChange}
        style={{
          width: "100%",
          padding: "0.5rem",
          border: "1.5px solid #e2e8f0",
          borderRadius: 10,
          fontSize: "0.875rem",
          textAlign: align,
          outline: "none",
          background: "white",
          boxSizing: "border-box"
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY}
        onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
      />
    </div>
  );
};

const SummaryCard = ({ grandTotal, exchangeRates, selectedCurrency }) => (
  <div style={{ background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, borderRadius: 20, padding: "1.5rem", color: "white", marginBottom: "1.5rem" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
      <div>
        <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estimated Total</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "2rem", fontWeight: 800 }}>{fmtCurrency(grandTotal, selectedCurrency)}</p>
      </div>
      <div style={{ fontSize: "2.5rem", opacity: 0.3 }}>🧾</div>
    </div>
    <p style={{ margin: "0.5rem 0 0", fontSize: "0.7rem", opacity: 0.7 }}>Excludes tax & discount — configure in the next step</p>
    {exchangeRates && selectedCurrency !== "AED" && (
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.65rem", opacity: 0.5 }}>
        ≈ AED {(grandTotal * (exchangeRates.rates?.["AED"] || 1)).toFixed(2)}
      </p>
    )}
  </div>
);

const EmptyItemsState = () => (
  <div style={{ border: "2px dashed #e2e8f0", borderRadius: 16, padding: "2.5rem", textAlign: "center", background: "#fafbff" }}>
    <div style={{ width: 48, height: 48, borderRadius: 14, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.875rem" }}>
      <Package size={22} color="#94a3b8" />
    </div>
    <p style={{ margin: "0 0 0.3rem", color: "#475569", fontWeight: 600, fontSize: "0.9rem" }}>No items added yet</p>
    <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8125rem" }}>Click the button below to add your first item</p>
  </div>
);

const ItemsLoadingSkeleton = () => (
  <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "1.5rem", background: "#fafbff", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <Loader2 size={16} color="#94a3b8" style={{ animation: "qs-spin 0.9s linear infinite" }} />
      <Shimmer width="45%" height={13} radius={8} />
    </div>
    {[75, 60, 50].map((w, i) => (
      <div key={i} style={{ border: "1px solid #f1f5f9", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", background: "white" }}>
        <Shimmer width={36} height={36} radius={10} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <Shimmer width={`${w}%`} height={13} radius={7} />
          <Shimmer width={`${Math.round(w * 0.55)}%`} height={10} radius={6} />
        </div>
        <Shimmer width={56} height={20} radius={8} />
      </div>
    ))}
  </div>
);

const CustomerSelectSkeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
    <div style={{ width: "100%", height: "46px", borderRadius: 14, border: "1.5px solid #e2e8f0", background: "#fafbff", display: "flex", alignItems: "center", padding: "0 1rem", gap: "0.75rem" }}>
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
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, marginBottom: "0.75rem" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <AlertCircle size={15} color="#dc2626" />
      <span style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 500 }}>{error}</span>
    </div>
    {onRetry && (
      <button onClick={onRetry} style={{ padding: "4px 10px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, background: "#dc2626", color: "white", border: "none", cursor: "pointer" }}>
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
  const items = useItemsList();
  const { addQuotation } = useQuotations();
  const { selectedCompany, selectedCurrency, currency, exchangeRates } = useCompanyCurrency();
  const { loadAllItems, isLoaded: itemsLoaded, resetItems, isLoading: isItemsLoadingStore } = useItemStore();
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
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [manualQueryDate, setManualQueryDate] = useState(getDefaultQueryDate()); // ✅ Added manual query date state

  // --------------------------------------------------------------------------
  // Derived State - FIXED
  // --------------------------------------------------------------------------
  const isItemsLoading = !itemsLoaded && (isItemsLoadingStore || items.length === 0);
  const isCustomersActuallyLoading = isCustomersLoading || (!isCustomersLoaded && customers.length === 0);
  const showNoCustomersMessage = initialized && customers.length === 0 && !storeLoading && !isCustomersLoading;
  const grandTotal = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), 
    [selectedItems]
  );
  const canProceed = !isCustomersLoading && !isItemsLoading && selectedCustomer && selectedItems.length > 0;

  // --------------------------------------------------------------------------
  // Debug Logs
  // --------------------------------------------------------------------------
  useEffect(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 QUOTATION SCREEN STATE:');
    console.log('   - Company:', selectedCompany);
    console.log('   - Items loaded:', itemsLoaded);
    console.log('   - Items count:', items.length);
    console.log('   - Items loading:', isItemsLoading);
    console.log('   - Items loading store:', isItemsLoadingStore);
    console.log('   - Customers loaded:', isCustomersLoaded);
    console.log('   - Customers count:', customers.length);
    console.log('   - Customers loading:', isCustomersLoading);
    console.log('   - Selected items:', selectedItems.length);
    console.log('   - Query Date:', manualQueryDate);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }, [selectedCompany, itemsLoaded, items.length, isItemsLoading, isItemsLoadingStore, isCustomersLoaded, customers.length, isCustomersLoading, selectedItems.length, manualQueryDate]);

  // --------------------------------------------------------------------------
  // Effects - Company Change Handling
  // --------------------------------------------------------------------------
  
  // Effect 1: Handle company change - reset and reload both customers and items
  useEffect(() => {
    if (!selectedCompany) return;
    
    console.log('🏢 Company changed to:', selectedCompany);
    
    // Reset customers
    resetCustomers();
    setSelectedCustomer(null);
    loadAllCustomers(selectedCompany);
    
    // Reset items
    resetItems();
    setSelectedItems([]);
    loadAllItems(selectedCompany, true);
    
    // Reset query date
    setManualQueryDate(getDefaultQueryDate());
    
  }, [selectedCompany, resetCustomers, loadAllCustomers, resetItems, loadAllItems]);

  // Effect 2: Initial load when component mounts and company is set
  useEffect(() => {
    if (!selectedCompany) return;
    
    // Initial customers load
    if (!isCustomersLoaded && !isCustomersLoading) {
      console.log('📚 Initial load of customers for company:', selectedCompany);
      loadAllCustomers(selectedCompany);
    }
    
    // Initial items load
    if (!itemsLoaded && !isItemsLoadingStore && items.length === 0) {
      console.log('📚 Initial load of items for company:', selectedCompany);
      loadAllItems(selectedCompany);
    }
    
  }, [selectedCompany, isCustomersLoaded, isCustomersLoading, itemsLoaded, isItemsLoadingStore, items.length, loadAllCustomers, loadAllItems]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  }, []);

  const handleAddItems = useCallback((newItemsFromModal) => {
    setSelectedItems(prev => {
      const existingMap = new Map(prev.map(item => [item.itemId, item]));
      const updated = newItemsFromModal.map(modalItem => {
        const existing = existingMap.get(modalItem.itemId);
        return {
          ...existing,
          ...modalItem,
          quantity: existing?.quantity || modalItem.quantity || 1,
          unitPrice: existing?.unitPrice || modalItem.unitPrice || modalItem.price || 0,
          fullItemData: modalItem.fullItemData || modalItem,
        };
      });
      return [
        ...prev.filter(old => !newItemsFromModal.some(newItem => newItem.itemId === old.itemId)),
        ...updated,
      ];
    });
    showToast(`${newItemsFromModal.length} item(s) updated`);
  }, [showToast]);

  const handleRemoveItem = useCallback((id) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleItemChange = useCallback((id, field, value) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  const handleRefreshComplete = useCallback((result) => {
    if (result?.success) {
      showToast(`✅ Sync complete! ${result.created || 0} new, ${result.updated || 0} updated`, "success");
      // Refresh items after sync
      if (selectedCompany) {
        resetItems();
        loadAllItems(selectedCompany, true);
      }
    } else if (result?.error) {
      showToast(`❌ Sync failed: ${result.error}`, "error");
    }
  }, [showToast, selectedCompany, resetItems, loadAllItems]);

  const handleSyncCustomers = useCallback(async (result) => {
    if (result?.success) {
      await refreshCustomers(selectedCompany);
      showToast(`✅ Synced ${result.stats?.created || 0} new, ${result.stats?.updated || 0} updated customers`, "success");
    } else if (result?.error) {
      showToast(`❌ Sync failed: ${result.error}`, "error");
    }
  }, [selectedCompany, refreshCustomers, showToast]);

  const handleProceedToTemplate = useCallback(() => {
    if (!selectedCompany) return showToast("Please select a company", "error");
    if (!selectedCustomer) return showToast("Please select a customer", "error");
    if (selectedItems.length === 0) return showToast("Please add at least one item", "error");

    const enrichedItems = selectedItems.map(item => {
      if (item.fullItemData) return item;
      const found = items.find(i => i._id === item.itemId || i.zohoId === item.zohoId);
      return found ? { ...item, fullItemData: found } : item;
    });

    setSelectedItems(enrichedItems);
    setStep(STEP.TEMPLATE);
  }, [selectedCompany, selectedCustomer, selectedItems, items, showToast]);

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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%)", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
        
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ margin: "0 0 0.35rem", color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Step 1 of 2
          </p>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 800, background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Create Quotation
          </h1>
          <p style={{ margin: "0.5rem 0 0", color: "#64748b", fontSize: "0.875rem" }}>
            Select company, customer and add items to generate a quotation
          </p>
        </div>

        {/* Main Card */}
        <div style={{ background: "white", borderRadius: 24, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          
          {/* Company Section */}
          <div style={{ padding: "1.5rem 1.5rem 0" }}>
            <SectionHeader icon={Building2} title="Company" required />
            <CompanyCurrencySelector variant="full" showLabels={false} />
          </div>
          <div style={{ height: 1, background: "#f1f5f9", margin: "1.5rem 0" }} />

          {/* Customer Section */}
          <div style={{ padding: '0 1.5rem' }}>
            <SectionHeader icon={Users} title="Customer" required loading={isCustomersActuallyLoading} />
            
            {loadError && !isCustomersLoading && (
              <LoadErrorBanner error={`Failed to load data: ${loadError}`} onRetry={fetchAllData} />
            )}
            
            <div style={{ display: isCustomersLoading ? 'none' : 'block' }}>
              <CustomerSelector
                key={selectedCompany}
                value={selectedCustomer?._id || ''}
                onChange={(_, customer) => setSelectedCustomer(customer)}
                placeholder="— Search or select a customer —"
                companyId={selectedCompany}
                onSyncComplete={handleSyncCustomers}
                autoLoad={true}
              />
            </div>

            {isCustomersLoading && <CustomerSelectSkeleton />}

            {!isCustomersLoading && showNoCustomersMessage && (
              <p style={{ margin: '0.5rem 0 0', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 500 }}>
                ⚠️ No customers found. Click the sync button to import customers from Zoho.
              </p>
            )}

            {!isCustomersLoading && selectedCustomer && <CustomerCard customer={selectedCustomer} />}
          </div>
          
          <div style={{ height: 1, background: "#f1f5f9", margin: "1.5rem 0" }} />

          {/* Items Section */}
          <div style={{ padding: "0 1.5rem" }}>
            <SectionHeader icon={Package} title="Items" required count={selectedItems.length} loading={isItemsLoading} />
            
            {isItemsLoading ? (
              <ItemsLoadingSkeleton />
            ) : selectedItems.length === 0 ? (
              <EmptyItemsState />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "0.75rem" }}>
                {selectedItems.map((item, index) => (
                  <ItemRow 
                    key={item.id} 
                    item={item} 
                    index={index} 
                    items={items} 
                    onUpdate={handleItemChange} 
                    onRemove={handleRemoveItem} 
                    selectedCurrency={selectedCurrency} 
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => setShowItemsModal(true)}
              disabled={isItemsLoading}
              style={{
                marginTop: "0.75rem", width: "100%", padding: "0.75rem",
                background: isItemsLoading ? "#f8fafc" : "#eff1ff",
                color: isItemsLoading ? "#94a3b8" : "#6366f1",
                border: `1.5px dashed ${isItemsLoading ? "#e2e8f0" : "#c7d2fe"}`,
                borderRadius: 14, fontSize: "0.875rem", fontWeight: 600,
                cursor: isItemsLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                transition: "all 0.2s",
              }}
            >
              {isItemsLoading ? (
                <><Loader2 size={15} style={{ animation: "qs-spin 0.9s linear infinite" }} /> Loading catalogue…</>
              ) : (
                <><Plus size={16} /> {selectedItems.length > 0 ? "Add More Items" : "Add Items"}</>
              )}
            </button>
          </div>

          {/* Query Date Section - ADDED */}
          <div style={{ padding: "0 1.5rem", marginTop: "1.5rem" }}>
            <div style={{ 
              background: "#f8fafc", 
              borderRadius: 16, 
              padding: "1rem 1.25rem",
              border: "1px solid #e2e8f0"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <Calendar size={18} color={PRIMARY} />
                <label style={{ fontWeight: 600, color: PRIMARY, fontSize: "0.875rem" }}>
                  Follow-up / Query Date
                </label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={manualQueryDate}
                  onChange={(e) => setManualQueryDate(e.target.value)}
                  min={getTodayDate()}
                  style={{
                    padding: "0.6rem 1rem",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: "0.875rem",
                    outline: "none",
                    fontFamily: "inherit",
                    flex: 1,
                    minWidth: "200px",
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
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Reset to Default (30 days)
                </button>
              </div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                Set a follow-up date to remind when to check back with the customer
              </p>
            </div>
          </div>

          {/* Summary */}
          {selectedItems.some(item => item.itemId) && (
            <div style={{ padding: "1.5rem" }}>
              <SummaryCard 
                grandTotal={grandTotal} 
                exchangeRates={exchangeRates} 
                selectedCurrency={selectedCurrency} 
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ padding: "1.25rem 1.5rem", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafbff" }}>
            
            {(isCustomersLoading || isItemsLoading) && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Loader2 size={14} color="#6366f1" style={{ animation: "qs-spin 0.9s linear infinite" }} />
                <span style={{ fontSize: "0.78rem", color: "#6366f1", fontWeight: 500 }}>
                  {isCustomersLoading && isItemsLoading 
                    ? "Loading customers & items…" 
                    : isCustomersLoading 
                      ? "Loading customers…" 
                      : "Loading catalogue…"}
                </span>
              </div>
            )}
            
            <div style={{ display: "flex", gap: "0.75rem", marginLeft: "auto" }}>
              <button 
                onClick={handleBack} 
                style={{ 
                  padding: "0.75rem 1.5rem", background: "white", color: "#475569", 
                  border: "1.5px solid #e2e8f0", borderRadius: 14, fontSize: "0.875rem", 
                  fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" 
                }}
              >
                <ArrowLeft size={17} /> Back
              </button>
              
              <button
                onClick={handleProceedToTemplate}
                disabled={!canProceed}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: canProceed ? `linear-gradient(135deg,${PRIMARY},#1e293b)` : "#e2e8f0",
                  color: canProceed ? "white" : "#94a3b8",
                  border: "none", borderRadius: 14, fontSize: "0.875rem", fontWeight: 600,
                  cursor: canProceed ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  boxShadow: canProceed ? `0 4px 12px ${PRIMARY}30` : "none",
                  opacity: canProceed ? 1 : 0.7,
                }}
              >
                {isCustomersLoading || isItemsLoading ? (
                  <><Loader2 size={15} style={{ animation: "qs-spin 0.9s linear infinite" }} /> Loading…</>
                ) : (
                  <>Continue to Template <ArrowRight size={17} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Items Modal */}
      <InfiniteItemSelector 
        isOpen={showItemsModal} 
        onClose={() => setShowItemsModal(false)} 
        onSelect={handleAddItems} 
        selectedItems={selectedItems} 
        selectedCurrency={selectedCurrency} 
        onSyncComplete={handleRefreshComplete} 
        companyId={selectedCompany} 
      />
      
      {/* Toast Notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}