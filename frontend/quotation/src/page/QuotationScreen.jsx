// screens/QuotationScreen.jsx
import React, { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, ChevronDown, Search, X, Check } from 'lucide-react';
import QuotationTemplate from './QuotationTemplate';
import { CompanyCurrencySelector, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import InfiniteItemSelector from '../components/ItemSelector';

// Import store hooks
import { useCustomersList, useItemsList } from '../hooks/customHooks';
import { useQuotations } from '../hooks/customHooks';

// Import utils and constants
import { fmtCurrency } from '../utils/formatters';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const STEP = {
  SELECTION: 1,
  TEMPLATE: 2
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const PageHeader = React.memo(() => (
  <div className="fa1" style={styles.pageHeader}>
    <p style={styles.stepIndicator}>Step 1 of 2</p>
    <h1 style={styles.pageTitle}>Create Quotation</h1>
    <p style={styles.pageSubtitle}>
      Select company, customer and add items to generate a quotation.
    </p>
  </div>
));

const SectionHeader = React.memo(({ icon: Icon, title, required }) => (
  <div style={styles.sectionHeader}>
    <div style={styles.sectionIcon}>
      <Icon size={16} />
    </div>
    <h2 style={styles.sectionTitle}>
      {title} {required && <span style={styles.requiredStar}>*</span>}
    </h2>
  </div>
));

const CustomerSelect = React.memo(({ customers, value, onChange }) => (
  <div className="qs-select-wrap">
    <select
      className="qs-field"
      style={styles.selectField}
      value={value?._id || ''}
      onChange={(e) => {
        const customer = customers.find(c => c._id === e.target.value);
        onChange(customer || null);
      }}
    >
      <option value="">— Choose a customer —</option>
      {customers.map(c => (
        <option key={c._id} value={c._id}>
          {c.name} · {c.email}
        </option>
      ))}
    </select>
    <ChevronDown size={16} className="arrow" style={styles.selectArrow} />
  </div>
));

const CustomerCard = React.memo(({ customer }) => {
  const initials = customer.name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'CU';

  return (
    <div className="qs-cust-card" style={styles.customerCard}>
      <div style={styles.customerInitials}>{initials}</div>
      <div>
        <p style={styles.customerName}>{customer.name}</p>
        <p style={styles.customerDetails}>
          {customer.email}
          {customer.phone && ` · ${customer.phone}`}
        </p>
      </div>
    </div>
  );
});

const EmptyItems = React.memo(() => (
  <div className="qs-empty" style={styles.emptyState}>
    <div style={styles.emptyIcon}>
      <Package size={22} />
    </div>
    <p style={styles.emptyTitle}>No items added yet</p>
    <p style={styles.emptySubtitle}>Click the button below to add your first item.</p>
  </div>
));

const ItemRow = React.memo(({ item, index, items, onUpdate, onRemove, selectedCurrency }) => {
  const lineTotal = useMemo(() => item.quantity * item.unitPrice, [item.quantity, item.unitPrice]);
  const itemData = items.find(i => i._id === item.itemId);

  const handleQuantityChange = useCallback((e) => {
    const val = parseInt(e.target.value) || 1;
    onUpdate(item.id, 'quantity', val);
  }, [item.id, onUpdate]);

  const handlePriceChange = useCallback((e) => {
    const val = parseFloat(e.target.value) || 0;
    onUpdate(item.id, 'unitPrice', val);
  }, [item.id, onUpdate]);

  return (
    <div key={item.id} className="qs-item-row" style={styles.itemRow}>
      <div style={styles.itemHeader}>
        <span style={styles.itemIndex}>Line {index + 1}</span>
        <button className="qs-del-btn" onClick={() => onRemove(item.id)} style={styles.deleteBtn}>
          <Trash2 size={14} />
        </button>
      </div>

      {itemData && (
        <div style={styles.itemDisplay}>
          <div>
            <p style={styles.displayItemName}>{itemData.name}</p>
            {itemData.sku && <p style={styles.displayItemSku}>SKU: {itemData.sku}</p>}
          </div>
          <p style={styles.displayItemPrice}>
            {fmtCurrency(itemData.price, selectedCurrency)}
          </p>
        </div>
      )}

      <div style={styles.itemGrid}>
        <div>
          <label style={styles.inputLabel}>Qty</label>
          <input
            className="qs-field"
            type="number"
            min="1"
            value={item.quantity}
            onChange={handleQuantityChange}
            style={styles.quantityInput}
          />
        </div>
        <div>
          <label style={styles.inputLabel}>Unit Price</label>
          <input
            className="qs-field"
            type="number"
            step="0.01"
            min="0"
            value={item.unitPrice}
            onChange={handlePriceChange}
            style={styles.priceInput}
          />
        </div>
      </div>

      {item.itemId && (
        <div style={styles.lineTotal}>
          <span style={styles.lineTotalLabel}>Line total:</span>
          <span style={styles.lineTotalValue}>
            {fmtCurrency(lineTotal, selectedCurrency)}
          </span>
        </div>
      )}
    </div>
  );
});

const SummaryCard = React.memo(({ grandTotal, exchangeRates, selectedCurrency }) => (
  <div style={styles.paddingHorizontal}>
    <div className="qs-summary" style={styles.summaryCard}>
      <div style={styles.summaryContent}>
        <div>
          <p style={styles.summaryLabel}>Estimated Total</p>
          <p style={styles.summaryValue}>{fmtCurrency(grandTotal, selectedCurrency)}</p>
        </div>
        <div style={styles.summaryIcon}>🧾</div>
      </div>
      <p style={styles.summaryNote}>Excludes tax & discount — configure in the next step.</p>
      {exchangeRates && selectedCurrency !== 'AED' && (
        <p style={styles.exchangeNote}>
          ≈ AED {(grandTotal * (exchangeRates.rates?.['AED'] || 1)).toFixed(2)}
        </p>
      )}
    </div>
  </div>
));

const ActionButtons = React.memo(({ onBack, onContinue, step }) => (
  <div style={styles.actionBar}>
    <button className="qs-secondary-btn" onClick={onBack} style={styles.secondaryBtn}>
      <ArrowLeft size={17} /> Back
    </button>
    <button className="qs-primary-btn" onClick={onContinue} style={styles.primaryBtn}>
      Continue to Template <ArrowRight size={17} />
    </button>
  </div>
));

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function QuotationScreen({ onBack }) {
  // ── Hooks ─────────────────────────────────────────────────
  const items = useItemsList();
  const customers = useCustomersList(); 
  const { addQuotation } = useQuotations();
  
  const { 
    selectedCompany,
    selectedCurrency,
    company,
    currency,
    exchangeRates
  } = useCompanyCurrency();

  // ── State ─────────────────────────────────────────────────
  const [step, setStep] = useState(STEP.SELECTION);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Memoized Values ───────────────────────────────────────
  const grandTotal = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
    [selectedItems]
  );

  // ── Handlers ──────────────────────────────────────────────
  const handleAddItems = useCallback((newItems) => {
    setSelectedItems(prev => {
      const existingIds = new Set(prev.map(i => i.itemId));
      const itemsToAdd = newItems.filter(i => !existingIds.has(i.itemId));
      return [...prev, ...itemsToAdd];
    });
  }, []);

  const handleRemoveItem = useCallback((id) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleItemChange = useCallback((id, field, value) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  // Handle refresh complete from modal
  const handleRefreshComplete = useCallback((result) => {
    if (result && result.success) {
      setToast({
        message: `✅ Sync complete! ${result.created || 0} new, ${result.updated || 0} updated`,
        type: 'success'
      });
    } else if (result && result.error) {
      setToast({
        message: `❌ Sync failed: ${result.error}`,
        type: 'error'
      });
    }
    // Auto-hide toast after 3 seconds
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleProceedToTemplate = useCallback(() => {
    if (!selectedCompany) {
      alert('Please select a company');
      return;
    }
    if (!selectedCustomer) { 
      alert('Please select a customer'); 
      return; 
    }
    if (selectedItems.length === 0) { 
      alert('Please add at least one item'); 
      return; 
    }
    if (selectedItems.some(i => !i.itemId)) { 
      alert('Please select an item for all rows'); 
      return; 
    }
    setStep(STEP.TEMPLATE);
  }, [selectedCompany, selectedCustomer, selectedItems]);

  const handleBack = useCallback(() => 
    step === STEP.TEMPLATE ? setStep(STEP.SELECTION) : onBack?.(),
    [step, onBack]
  );

  // ── Toast Component ───────────────────────────────────────
  const ToastMessage = ({ message, type }) => {
    if (!message) return null;
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 1000,
        animation: 'slideIn 0.3s ease'
      }}>
        <span>{message}</span>
      </div>
    );
  };

  // ── Render Step 2 ─────────────────────────────────────────
  if (step === STEP.TEMPLATE) {
    const quotationData = {
      currency: {
        code: selectedCurrency,
        symbol: currency?.symbol || selectedCurrency,
      },
      companySnapshot: selectedCompany,
      customerSnapshot: selectedCustomer,
      customer: selectedCustomer?.name,
      contact: selectedCustomer?.phone || '',
      date: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      projectName: '',
      tl: '',
      trn: '',
      ourRef: '',
      ourContact: '',
      salesOffice: '',
      paymentTerms: '',
      deliveryTerms: '',
      tax: 0,
      discount: 0,
      notes: '',
      termsAndConditions: '',
      termsImage: null,
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

  // ── Render Step 1 ─────────────────────────────────────────
  return (
    <div style={styles.container}>
      <style>{styles.animations}</style>

      <div style={styles.content}>
        <PageHeader />

        <div className="fa2" style={styles.mainCard}>
          {/* Company Section */}
          <div style={styles.section}>
            <SectionHeader icon={CompanyIcon} title="Company" required />
            <CompanyCurrencySelector variant="full" showLabels={false} />
          </div>

          <Divider />

          {/* Customer Section */}
          <div style={styles.section}>
            <SectionHeader icon={Users} title="Customer" required />
            
            <CustomerSelect
              customers={customers}
              value={selectedCustomer}
              onChange={setSelectedCustomer}
            />

            {customers.length === 0 && (
              <p style={styles.warning}>⚠️ No customers found. Please add a customer first.</p>
            )}

            {selectedCustomer && <CustomerCard customer={selectedCustomer} />}
          </div>

          <Divider />

          {/* Items Section - No Sync Button Here */}
          <div style={styles.section}>
            <div style={styles.itemsHeader}>
              <SectionHeader icon={Package} title="Items" required />
              {selectedItems.length > 0 && (
                <span style={styles.itemCount}>
                  {selectedItems.length} row{selectedItems.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Item rows */}
            {selectedItems.length === 0 ? (
              <EmptyItems />
            ) : (
              <div style={styles.itemsList}>
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

            {/* Add items button */}
            <button
              className="qs-add-item-btn"
              onClick={() => setShowItemsModal(true)}
              style={styles.addItemBtn}
            >
              <Plus size={16} /> {selectedItems.length > 0 ? 'Add More Items' : 'Add Items'}
            </button>
          </div>

          {/* Summary */}
          {selectedItems.some(i => i.itemId) && (
            <SummaryCard
              grandTotal={grandTotal}
              exchangeRates={exchangeRates}
              selectedCurrency={selectedCurrency}
            />
          )}

          {/* Footer Actions */}
          <ActionButtons
            onBack={handleBack}
            onContinue={handleProceedToTemplate}
            step={step}
          />
        </div>
      </div>

      {/* Items Selection Modal */}
      <InfiniteItemSelector
        isOpen={showItemsModal}
        onClose={() => setShowItemsModal(false)}
        onSelect={handleAddItems}
        selectedItems={selectedItems}
        selectedCurrency={selectedCurrency}
        onSyncComplete={handleRefreshComplete}
      />
      
      {/* Toast */}
      <ToastMessage message={toast?.message} type={toast?.type} />
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────
const CompanyIcon = React.memo(() => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
));

const Divider = React.memo(() => (
  <div style={styles.divider} />
));

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = {
  animations: `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }

    .qs-field {
      background: #f8fafc; border: 1.5px solid #e2e8f0;
      border-radius: 10px; padding: .7rem .9rem;
      font-size: .875rem; font-family: inherit; color: #1f2937;
      width: 100%; outline: none;
      transition: border-color .2s, box-shadow .2s;
      appearance: none; -webkit-appearance: none;
    }
    .qs-field:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,.1);
      background: white;
    }

    .qs-item-row {
      background: white; border: 1.5px solid #f1f5f9;
      border-radius: 14px; padding: 1.1rem 1.25rem;
      transition: border-color .2s, box-shadow .2s;
    }
    .qs-item-row:hover {
      border-color: #e0e3ff;
      box-shadow: 0 4px 16px rgba(99,102,241,.08);
    }

    .qs-primary-btn {
      background: linear-gradient(135deg,#6366f1,#8b5cf6);
      color: white; border: none; border-radius: 12px;
      padding: .75rem 1.5rem; font-size: .9rem; font-weight: 700;
      font-family: inherit; cursor: pointer;
      display: flex; align-items: center; gap: .5rem;
      box-shadow: 0 4px 14px rgba(99,102,241,.35);
      transition: all .2s;
    }
    .qs-primary-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,.5); }

    .qs-secondary-btn {
      background: white; color: #475569;
      border: 1.5px solid #e2e8f0; border-radius: 12px;
      padding: .75rem 1.5rem; font-size: .9rem; font-weight: 600;
      font-family: inherit; cursor: pointer;
      display: flex; align-items: center; gap: .5rem;
      transition: all .2s;
    }
    .qs-secondary-btn:hover { border-color: #cbd5e1; background: #f8fafc; transform: translateY(-1px); }

    .qs-add-item-btn {
      background: #eff1ff; color: #6366f1;
      border: 1.5px dashed #c7d2fe; border-radius: 12px;
      padding: .75rem 1.25rem; font-size: .875rem; font-weight: 600;
      font-family: inherit; cursor: pointer;
      display: flex; align-items: center; gap: .5rem;
      width: 100%; justify-content: center;
      transition: all .2s;
    }
    .qs-add-item-btn:hover { background: #e0e3ff; border-color: #a5b4fc; }

    .qs-del-btn {
      background: #fff1f1; color: #dc2626;
      border: none; border-radius: 9px;
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all .15s;
    }
    .qs-del-btn:hover { background: #ffe4e4; transform: translateY(-1px); }

    .qs-select-wrap { position: relative; }
    .qs-select-wrap .arrow {
      position: absolute; right: .75rem; top: 50%;
      transform: translateY(-50%); pointer-events: none; color: #94a3b8;
    }

    .qs-summary {
      background: linear-gradient(135deg,#6366f1,#8b5cf6);
      border-radius: 14px; padding: 1.25rem 1.5rem;
      color: white;
    }

    .qs-empty {
      border: 2px dashed #e2e8f0; border-radius: 14px;
      padding: 2.5rem; text-align: center; background: #fafbff;
    }

    .qs-cust-card {
      background: #f0fdf4; border: 1.5px solid #bbf7d0;
      border-radius: 12px; padding: .85rem 1rem;
      display: flex; align-items: center; gap: .75rem;
      margin-top: .75rem;
    }

    @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
    .fa1{animation:fadeUp .35s ease both}
    .fa2{animation:fadeUp .35s .07s ease both}
  `,

  // Modal styles
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '1rem',
  },

  modal: {
    background: 'white',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '700px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,.18)',
  },

  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '1.5rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
  },

  modalTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#0f172a',
  },

  modalSubtitle: {
    margin: '.25rem 0 0',
    color: '#64748b',
    fontSize: '.875rem',
  },

  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.25rem',
    transition: 'color 0.2s',
  },

  modalSearchContainer: {
    padding: '1.25rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
    background: '#fafbff',
  },

  searchInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  searchIcon: {
    position: 'absolute',
    left: '0.75rem',
    color: '#94a3b8',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '100%',
    padding: '0.65rem 1rem 0.65rem 2.6rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s',
  },

  clearSearchBtn: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.25rem',
  },

  itemsListContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.25rem 1.75rem',
  },

  itemsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '0.75rem',
  },

  itemCard: {
    position: 'relative',
    background: 'white',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    padding: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },

  itemCardSelected: {
    background: '#eff1ff',
    borderColor: '#c7d2fe',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
  },

  itemCardCheckbox: {
    display: 'flex',
    justifyContent: 'flex-start',
  },

  checkbox: {
    width: '20px',
    height: '20px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },

  checkboxSelected: {
    background: '#6366f1',
    borderColor: '#6366f1',
  },

  itemCardContent: {
    flex: 1,
  },

  itemCardName: {
    margin: 0,
    fontWeight: '700',
    color: '#0f172a',
    fontSize: '0.9rem',
  },

  itemCardSku: {
    margin: '0.25rem 0',
    color: '#94a3b8',
    fontSize: '0.75rem',
  },

  itemCardDesc: {
    margin: '0.25rem 0 0',
    color: '#64748b',
    fontSize: '0.8rem',
  },

  itemCardPrice: {
    margin: '0.5rem 0 0',
    color: '#059669',
    fontWeight: '700',
    fontSize: '0.875rem',
  },

  selectedBadge: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    width: '24px',
    height: '24px',
    background: '#6366f1',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: '700',
  },

  emptySearchState: {
    textAlign: 'center',
    padding: '2rem',
    color: '#94a3b8',
  },

 

  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
  },

  modalFooter: {
    padding: '1.25rem 1.75rem',
    borderTop: '1px solid #f1f5f9',
    background: '#fafbff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  selectedCount: {
    color: '#64748b',
    fontSize: '0.875rem',
    fontWeight: '500',
  },

  modalActions: {
    display: 'flex',
    gap: '0.75rem',
  },

  cancelBtn: {
    background: 'white',
    color: '#475569',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  confirmBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
  },

  confirmBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  container: {
    minHeight: '100vh',
    background: '#f0f4ff',
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
  },

  content: {
    maxWidth: '860px',
    margin: '0 auto',
    padding: '2rem 1.5rem'
  },

  pageHeader: {
    marginBottom: '2rem'
  },

  stepIndicator: {
    margin: '0 0 .35rem',
    color: '#94a3b8',
    fontSize: '.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '.1em'
  },

  pageTitle: {
    margin: 0,
    fontSize: '1.9rem',
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: '-.03em'
  },

  pageSubtitle: {
    margin: '.35rem 0 0',
    color: '#64748b',
    fontSize: '.875rem'
  },

  mainCard: {
    background: 'white',
    borderRadius: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 8px 32px rgba(0,0,0,.07)',
    overflow: 'hidden'
  },

  section: {
    padding: '1.75rem 1.75rem 0'
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '.6rem',
    marginBottom: '1rem'
  },

  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: '9px',
    background: '#e0e7ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#4f46e5',
    flexShrink: 0
  },

  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '700',
    color: '#0f172a'
  },

  requiredStar: {
    color: '#ef4444'
  },

  divider: {
    height: 1,
    background: '#f1f5f9',
    margin: '1.75rem 0'
  },

  selectField: {
    paddingRight: '2.5rem'
  },

  selectArrow: {
    position: 'absolute',
    right: '.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    color: '#94a3b8'
  },

  warning: {
    margin: '.5rem 0 0',
    color: '#f59e0b',
    fontSize: '.8rem',
    fontWeight: '500'
  },

  customerCard: {
    background: '#f0fdf4',
    border: '1.5px solid #bbf7d0',
    borderRadius: '12px',
    padding: '.85rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '.75rem',
    marginTop: '.75rem'
  },

  customerInitials: {
    width: 36,
    height: 36,
    borderRadius: '10px',
    background: '#059669',
    color: 'white',
    fontWeight: '700',
    fontSize: '.8rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },

  customerName: {
    margin: 0,
    fontWeight: '700',
    color: '#065f46',
    fontSize: '.875rem'
  },

  customerDetails: {
    margin: 0,
    color: '#059669',
    fontSize: '.78rem'
  },

  itemsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.1rem'
  },

  itemCount: {
    background: '#f1f5f9',
    color: '#64748b',
    borderRadius: '999px',
    padding: '.2rem .65rem',
    fontSize: '.75rem',
    fontWeight: '600'
  },

  emptyState: {
    border: '2px dashed #e2e8f0',
    borderRadius: '14px',
    padding: '2.5rem',
    textAlign: 'center',
    background: '#fafbff'
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: '14px',
    background: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto .875rem',
    color: '#94a3b8', 
    opacity: 0.5,
  },
 
  emptyTitle: {
    margin: '0 0 .3rem',
    color: '#475569',
    fontWeight: '600',
    fontSize: '.9rem'
  },

  emptySubtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '.8125rem'
  },

  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '.75rem',
    marginBottom: '.75rem'
  },

  itemRow: {
    background: 'white',
    border: '1.5px solid #f1f5f9',
    borderRadius: '14px',
    padding: '1.1rem 1.25rem'
  },

  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '.75rem'
  },

  itemIndex: {
    background: '#eff1ff',
    color: '#6366f1',
    borderRadius: '7px',
    padding: '.15rem .55rem',
    fontSize: '.72rem',
    fontWeight: '700'
  },

  deleteBtn: {
    background: '#fff1f1',
    color: '#dc2626',
    border: 'none',
    borderRadius: '9px',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  itemDisplay: {
    background: '#f0f4ff',
    borderRadius: '10px',
    padding: '0.75rem',
    marginBottom: '0.75rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  displayItemName: {
    margin: 0,
    fontWeight: '700',
    color: '#0f172a',
    fontSize: '0.9rem',
  },

  displayItemSku: {
    margin: '0.25rem 0 0',
    color: '#94a3b8',
    fontSize: '0.75rem',
  },

  displayItemPrice: {
    margin: 0,
    color: '#059669',
    fontWeight: '700',
    fontSize: '0.875rem',
  },

  itemGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px',
    gap: '.75rem',
    alignItems: 'end'
  },

  inputLabel: {
    display: 'block',
    color: '#64748b',
    fontWeight: '600',
    marginBottom: '.35rem',
    fontSize: '.75rem',
    textTransform: 'uppercase',
    letterSpacing: '.05em'
  },

  quantityInput: {
    textAlign: 'center'
  },

  priceInput: {
    textAlign: 'right'
  },

  lineTotal: {
    marginTop: '.6rem',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '.4rem'
  },

  lineTotalLabel: {
    color: '#94a3b8',
    fontSize: '.75rem'
  },

  lineTotalValue: {
    color: '#059669',
    fontWeight: '700',
    fontSize: '.875rem',
    fontFamily: 'monospace'
  },

  addItemBtn: {
    marginTop: '.75rem',
    background: '#eff1ff',
    color: '#6366f1',
    border: '1.5px dashed #c7d2fe',
    borderRadius: '12px',
    padding: '.75rem 1.25rem',
    fontSize: '.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    width: '100%',
    justifyContent: 'center'
  },

  paddingHorizontal: {
    padding: '0 1.75rem 1.75rem'
  },

  summaryCard: {
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    borderRadius: '14px',
    padding: '1.25rem 1.5rem',
    color: 'white'
  },

  summaryContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  summaryLabel: {
    margin: 0,
    fontSize: '.78rem',
    fontWeight: '600',
    opacity: .75,
    textTransform: 'uppercase',
    letterSpacing: '.06em'
  },

  summaryValue: {
    margin: '.25rem 0 0',
    fontSize: '1.5rem',
    fontWeight: '800',
    letterSpacing: '-.02em',
    fontFamily: 'monospace'
  },

  summaryIcon: {
    opacity: .3,
    fontSize: '2.5rem'
  },

  summaryNote: {
    margin: '.5rem 0 0',
    fontSize: '.75rem',
    opacity: .65
  },

  exchangeNote: {
    margin: '.25rem 0 0',
    fontSize: '.7rem',
    opacity: .5
  },

  actionBar: {
    padding: '1.25rem 1.75rem',
    borderTop: '1px solid #f1f5f9',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '.75rem',
    background: '#fafbff'
  },

  primaryBtn: {
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    padding: '.75rem 1.5rem',
    fontSize: '.9rem',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    boxShadow: '0 4px 14px rgba(99,102,241,.35)'
  },

  secondaryBtn: {
    background: 'white',
    color: '#475569',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    padding: '.75rem 1.5rem',
    fontSize: '.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem'
  }
};