// screens/QuotationScreen.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, ChevronDown, Tag,
  Search, X, Check, Building2, Mail, Phone, DollarSign, Calendar,
  Clock, AlertCircle, CheckCircle, RefreshCw, Grid, List, TrendingUp,
  Eye, FileText, Send, Printer, Download
} from 'lucide-react';
import QuotationTemplate from './QuotationTemplate';
import { CompanyCurrencySelector, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import InfiniteItemSelector from '../components/ItemSelector';

// Import store hooks
import { useCustomersList, useItemsList } from '../hooks/customHooks';
import { useQuotations } from '../hooks/customHooks';

// Import utils and constants
import { fmtCurrency } from '../utils/formatters';

const PRIMARY_COLOR = '#0f172a';
const STEP = {
  SELECTION: 1,
  TEMPLATE: 2
};

// Toast Component
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => { 
    const timer = setTimeout(onClose, 4000); 
    return () => clearTimeout(timer); 
  }, [onClose]);
  
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: '24px', 
      right: '24px', 
      zIndex: 1000, 
      animation: 'slideInRight 0.3s ease'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        background: type === 'success' 
          ? 'linear-gradient(135deg, #10b981, #059669)' 
          : type === 'error' 
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: 'white', 
        padding: '14px 20px', 
        borderRadius: '16px', 
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
      }}>
        {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{message}</span>
        <button 
          onClick={onClose} 
          style={{ 
            background: 'rgba(255,255,255,0.2)', 
            border: 'none', 
            borderRadius: '8px', 
            padding: '4px', 
            cursor: 'pointer' 
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

 

// Enhanced Section Header
const SectionHeader = ({ icon: Icon, title, required, count }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: '1rem' 
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ 
        width: '36px', 
        height: '36px', 
        borderRadius: '12px', 
        background: `${PRIMARY_COLOR}10`, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Icon size={18} color={PRIMARY_COLOR} />
      </div>
      <h2 style={{ 
        margin: 0, 
        fontSize: '1rem', 
        fontWeight: '700', 
        color: PRIMARY_COLOR 
      }}>
        {title} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </h2>
    </div>
    {count !== undefined && count > 0 && (
      <span style={{ 
        padding: '2px 10px', 
        borderRadius: '20px', 
        background: '#f1f5f9', 
        color: '#64748b', 
        fontSize: '0.75rem', 
        fontWeight: '600' 
      }}>
        {count} item{count !== 1 ? 's' : ''}
      </span>
    )}
  </div>
);

// Enhanced Customer Card
const CustomerCard = ({ customer }) => {
  const initials = customer.name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'CU';

  return (
    <div style={{ 
      background: 'white', 
      border: '1px solid #f1f5f9', 
      borderRadius: '16px', 
      padding: '1rem', 
      marginTop: '0.75rem',
      transition: 'all 0.2s'
    }}
    onMouseEnter={(e) => { 
      e.currentTarget.style.borderColor = '#e2e8f0'; 
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; 
    }}
    onMouseLeave={(e) => { 
      e.currentTarget.style.borderColor = '#f1f5f9'; 
      e.currentTarget.style.boxShadow = 'none'; 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ 
          width: '48px', 
          height: '48px', 
          borderRadius: '14px', 
          background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'white',
          fontWeight: '700',
          fontSize: '1.1rem'
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: '700', color: PRIMARY_COLOR, fontSize: '0.9rem' }}>
            {customer.name}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Mail size={12} /> {customer.email}
            </p>
            {customer.phone && (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={12} /> {customer.phone}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ItemRow = ({ item, index, items, onUpdate, onRemove, selectedCurrency }) => {
  const lineTotal = useMemo(() => item.quantity * item.unitPrice, [item.quantity, item.unitPrice]);
  
  const itemData = useMemo(() => {
    if (item.fullItemData) {
      return item.fullItemData;
    }
    
    if (!items || items.length === 0) return null;
    
    if (item.zohoId) {
      const found = items.find(i => i.zohoId === item.zohoId);
      if (found) return found;
    }
    
    if (item.itemId) {
      const found = items.find(i => i._id === item.itemId);
      if (found) return found;
    }
    
    if (item.name) {
      const found = items.find(i => i.name === item.name);
      if (found) return found;
    }
    
    console.warn('Item not found:', { 
      fullItemData: item.fullItemData,
      zohoId: item.zohoId, 
      itemId: item.itemId, 
      name: item.name,
      availableItems: items.map(i => ({ _id: i._id, zohoId: i.zohoId, name: i.name }))
    });
    
    return null;
  }, [items, item.zohoId, item.itemId, item.name, item.fullItemData]);

  return (
    <div style={{ 
      border: '1px solid #f1f5f9', 
      borderRadius: '16px', 
      padding: '1rem',
      transition: 'all 0.2s',
      background: 'white'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ 
          padding: '2px 8px', 
          borderRadius: '20px', 
          background: `${PRIMARY_COLOR}10`, 
          color: PRIMARY_COLOR, 
          fontSize: '0.7rem', 
          fontWeight: '600' 
        }}>
          Item {index + 1}
        </span>
        <button 
          onClick={() => onRemove(item.id)} 
          style={{ 
            padding: '4px', 
            borderRadius: '8px', 
            border: '1px solid #fee2e2', 
            background: '#fef2f2', 
            color: '#dc2626', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {itemData ? (
        <>
          <div style={{ 
            background: `linear-gradient(135deg, ${PRIMARY_COLOR}05, ${PRIMARY_COLOR}02)`,
            borderRadius: '12px', 
            padding: '1rem', 
            marginBottom: '1rem',
            border: `1px solid ${PRIMARY_COLOR}10`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: '700', color: PRIMARY_COLOR, fontSize: '1rem' }}>
                  {itemData.name}
                </h3>
                {itemData.sku && (
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Tag size={10} /> SKU: {itemData.sku}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#059669', fontWeight: '700', fontSize: '1rem' }}>
                  {fmtCurrency(itemData.price, selectedCurrency)}
                </p>
                {itemData.price !== item.unitPrice && (
                  <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.65rem' }}>
                    Using custom price
                  </p>
                )}
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '0.5rem',
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: `1px solid ${PRIMARY_COLOR}10`
            }}>
              {itemData.zohoId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>Zoho ID:</span>
                  <span style={{ color: '#475569', fontSize: '0.7rem', fontFamily: 'monospace' }}>{itemData.zohoId}</span>
                </div>
              )}
              
              {itemData.unit && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>Unit:</span>
                  <span style={{ color: '#475569', fontSize: '0.7rem' }}>{itemData.unit}</span>
                </div>
              )}
              
              {itemData.product_type && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>Type:</span>
                  <span style={{ color: '#475569', fontSize: '0.7rem' }}>{itemData.product_type}</span>
                </div>
              )}
              
              {itemData.tax_percentage > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>Tax:</span>
                  <span style={{ color: '#475569', fontSize: '0.7rem' }}>{itemData.tax_percentage}%</span>
                </div>
              )}
              
              {itemData.status && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>Status:</span>
                  <span style={{ 
                    color: itemData.status === 'active' ? '#10b981' : '#ef4444',
                    fontSize: '0.7rem',
                    fontWeight: '500'
                  }}>
                    {itemData.status}
                  </span>
                </div>
              )}
            </div>

            {itemData.description && (
              <div style={{ 
                marginTop: '0.75rem', 
                paddingTop: '0.75rem', 
                borderTop: `1px solid ${PRIMARY_COLOR}10`,
                fontSize: '0.75rem',
                color: '#64748b',
                lineHeight: '1.4'
              }}>
                <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500', display: 'block', marginBottom: '0.25rem' }}>
                  Description:
                </span>
                {itemData.description}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => onUpdate(item.id, 'quantity', parseInt(e.target.value) || 1)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  outline: 'none',
                  background: 'white'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY_COLOR}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                Unit Price
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={item.unitPrice}
                onChange={(e) => onUpdate(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  textAlign: 'right',
                  outline: 'none',
                  background: 'white'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY_COLOR}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          <div style={{ 
            paddingTop: '0.5rem', 
            borderTop: '1px solid #f1f5f9', 
            display: 'flex', 
            justifyContent: 'flex-end', 
            alignItems: 'center', 
            gap: '0.5rem' 
          }}>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Line total:</span>
            <span style={{ color: '#059669', fontWeight: '700', fontSize: '0.875rem' }}>
              {fmtCurrency(lineTotal, selectedCurrency)}
            </span>
          </div>
        </>
      ) : (
        <div style={{ 
          background: '#fef2f2', 
          borderRadius: '12px', 
          padding: '1rem', 
          marginBottom: '0.75rem',
          border: '1px solid #fecaca',
          textAlign: 'center'
        }}>
          <AlertCircle size={24} color="#dc2626" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem', fontWeight: '500' }}>
            Item not found in catalog
          </p>
          <p style={{ margin: '0.25rem 0 0', color: '#991b1b', fontSize: '0.75rem' }}>
            Zoho ID: {item.zohoId || item.itemId || 'Unknown'}
          </p>
          <p style={{ margin: '0.25rem 0 0', color: '#991b1b', fontSize: '0.7rem' }}>
            {item.name}
          </p>
        </div>
      )}
    </div>
  );
};

// Enhanced Summary Card
const SummaryCard = ({ grandTotal, exchangeRates, selectedCurrency }) => (
  <div style={{ 
    background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
    borderRadius: '20px',
    padding: '1.5rem',
    color: 'white',
    marginBottom: '1.5rem'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
      <div>
        <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Estimated Total
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '2rem', fontWeight: '800' }}>
          {fmtCurrency(grandTotal, selectedCurrency)}
        </p>
      </div>
      <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>
        🧾
      </div>
    </div>
    <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', opacity: 0.7 }}>
      Excludes tax & discount — configure in the next step
    </p>
    {exchangeRates && selectedCurrency !== 'AED' && (
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', opacity: 0.5 }}>
        ≈ AED {(grandTotal * (exchangeRates.rates?.['AED'] || 1)).toFixed(2)}
      </p>
    )}
  </div>
);

// Main Component
export default function QuotationScreen({ onBack }) {
  const items = useItemsList();
  const customers = useCustomersList();
  const { addQuotation } = useQuotations();
  const { selectedCompany, selectedCurrency, company, currency, exchangeRates } = useCompanyCurrency();

  const [step, setStep] = useState(STEP.SELECTION);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [toast, setToast] = useState(null);

  const grandTotal = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
    [selectedItems]
  );
 
  useEffect(() => {
    setSelectedCustomer(null);
  }, [selectedCompany]);

const handleAddItems = useCallback((newItems) => {
  setSelectedItems(prev => {
    const existingIds = new Set(prev.map(i => i.itemId)); // Check by MongoDB _id
    const itemsToAdd = newItems.filter(i => {
      // Check by itemId (MongoDB _id) for duplicates
      return !existingIds.has(i.itemId);
    });
    
    // Log the items being added for debugging
    console.log('Adding items to quotation:', itemsToAdd);
    
    // Keep the items exactly as they come from the selector
    const formattedItems = itemsToAdd.map(item => ({
      ...item, // Preserve all original fields
      // Ensure quantity and unitPrice are set
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.price || 0,
      // Add lineTotal for convenience
      lineTotal: (item.quantity || 1) * (item.unitPrice || item.price || 0)
    }));
    
    return [...prev, ...formattedItems];
  });
  setToast({ message: `Added ${newItems.length} item(s)`, type: 'success' });
  setTimeout(() => setToast(null), 2000);
}, []);

  const handleRemoveItem = useCallback((id) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleItemChange = useCallback((id, field, value) => {
    setSelectedItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

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
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleProceedToTemplate = useCallback(() => {
    if (!selectedCompany) {
      setToast({ message: 'Please select a company', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!selectedCustomer) { 
      setToast({ message: 'Please select a customer', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return; 
    }
    if (selectedItems.length === 0) { 
      setToast({ message: 'Please add at least one item', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return; 
    }
    
    // Validate all selected items exist in the items list (company-filtered)
    const missingItems = selectedItems.filter(item => {
      const exists = items.some(i => i._id === item.itemId || i.zohoId === item.zohoId);
      return !exists;
    });
    
    if (missingItems.length > 0) {
      setToast({ 
        message: `Some items are not available for this company: ${missingItems.map(i => i.name).join(', ')}`, 
        type: 'error' 
      });
      setTimeout(() => setToast(null), 5000);
      return;
    }
    
    if (selectedItems.some(i => !i.zohoId && !i.itemId)) { 
      setToast({ message: 'Please select an item for all rows', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return; 
    }
    
    console.log('📦 Items being passed to template:', selectedItems.map(item => ({
      id: item.id,
      zohoId: item.zohoId,
      itemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    })));
    
    setStep(STEP.TEMPLATE);
  }, [selectedCompany, selectedCustomer, selectedItems, items]);

  const handleBack = useCallback(() => 
    step === STEP.TEMPLATE ? setStep(STEP.SELECTION) : onBack?.(),
    [step, onBack]
  );

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

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

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e8edf5 100%)', 
      fontFamily: 'system-ui, -apple-system, sans-serif' 
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <p style={{ margin: '0 0 0.35rem', color: '#94a3b8', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Step 1 of 2
          </p>
          <h1 style={{ 
            margin: 0, 
            fontSize: '2rem', 
            fontWeight: '800', 
            background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}>
            Create Quotation
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            Select company, customer and add items to generate a quotation
          </p>
        </div>

       

        {/* Main Card */}
        <div style={{ background: 'white', borderRadius: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          
          {/* Company Section */}
          <div style={{ padding: '1.5rem 1.5rem 0' }}>
            <SectionHeader icon={Building2} title="Company" required />
            <CompanyCurrencySelector variant="full" showLabels={false} />
          </div>

          <div style={{ height: '1px', background: '#f1f5f9', margin: '1.5rem 0' }} />

          {/* Customer Section */}
          <div style={{ padding: '0 1.5rem' }}>
            <SectionHeader icon={Users} title="Customer" required />
            
            <div style={{ position: 'relative' }}>
              <select
                value={selectedCustomer?._id || ''}
                onChange={(e) => {
                  const customer = customers.find(c => c._id === e.target.value);
                  setSelectedCustomer(customer || null);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '14px',
                  fontSize: '0.875rem',
                  background: '#fafbff',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY_COLOR}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              >
                <option value="">— Choose a customer —</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>
                    {c.name} · {c.email}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
            </div>

            {customers.length === 0 && (
              <p style={{ margin: '0.5rem 0 0', color: '#f59e0b', fontSize: '0.8rem', fontWeight: '500' }}>
                ⚠️ No customers found. Please add a customer first.
              </p>
            )}

            {selectedCustomer && <CustomerCard customer={selectedCustomer} />}
          </div>

          <div style={{ height: '1px', background: '#f1f5f9', margin: '1.5rem 0' }} />

          {/* Items Section */}
          <div style={{ padding: '0 1.5rem' }}>
            <SectionHeader icon={Package} title="Items" required count={selectedItems.length} />

            {selectedItems.length === 0 ? (
              <div style={{ 
                border: '2px dashed #e2e8f0', 
                borderRadius: '16px', 
                padding: '2.5rem', 
                textAlign: 'center', 
                background: '#fafbff' 
              }}>
                <div style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '14px', 
                  background: '#f1f5f9', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 0.875rem' 
                }}>
                  <Package size={22} color="#94a3b8" />
                </div>
                <p style={{ margin: '0 0 0.3rem', color: '#475569', fontWeight: '600', fontSize: '0.9rem' }}>
                  No items added yet
                </p>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8125rem' }}>
                  Click the button below to add your first item
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
              style={{
                marginTop: '0.75rem',
                width: '100%',
                padding: '0.75rem',
                background: '#eff1ff',
                color: '#6366f1',
                border: '1.5px dashed #c7d2fe',
                borderRadius: '14px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e0e3ff'; e.currentTarget.style.borderColor = '#a5b4fc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#eff1ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
            >
              <Plus size={16} /> {selectedItems.length > 0 ? 'Add More Items' : 'Add Items'}
            </button>
          </div>

          {/* Summary */}
          {selectedItems.some(i => i.itemId) && (
            <div style={{ padding: '1.5rem' }}>
              <SummaryCard
                grandTotal={grandTotal}
                exchangeRates={exchangeRates}
                selectedCurrency={selectedCurrency}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ 
            padding: '1.25rem 1.5rem', 
            borderTop: '1px solid #f1f5f9', 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '0.75rem',
            background: '#fafbff'
          }}>
            <button
              onClick={handleBack}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#475569',
                border: '1.5px solid #e2e8f0',
                borderRadius: '14px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
            >
              <ArrowLeft size={17} /> Back
            </button>
            <button
              onClick={handleProceedToTemplate}
              style={{
                padding: '0.75rem 1.5rem',
                background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: `0 4px 12px ${PRIMARY_COLOR}30`,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Continue to Template <ArrowRight size={17} />
            </button>
          </div>
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}