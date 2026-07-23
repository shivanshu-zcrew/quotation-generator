// components/ItemModal.jsx (Handles both Add and Edit)
import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ItemModal = ({ isOpen, onClose, onAddItem, onEditItem, editingItem, selectedCurrency }) => {
  const [itemData, setItemData] = useState({
    description: '',
    quantity: 1,
    unit: '',
    unitPrice: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!editingItem;

  // Reset or populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        // Populate with editing item data
        setItemData({
          description: editingItem.description || '',
          quantity: editingItem.quantity || 1,
          unit: editingItem.unit || '',
          unitPrice: editingItem.unitPrice ?? ''
        });
      } else {
        // Reset for new item
        setItemData({
          description: '',
          quantity: 1,
          unit: '',
          unitPrice: ''
        });
      }
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, editingItem]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!itemData.description?.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!itemData.quantity || itemData.quantity <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }
    
    if (itemData.unitPrice === '' || itemData.unitPrice === null || itemData.unitPrice < 0) {
      newErrors.unitPrice = 'Unit price is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleQuantityChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setItemData(prev => ({ ...prev, quantity: '' }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setItemData(prev => ({ ...prev, quantity: numValue }));
      }
    }
  };

  const handlePriceChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setItemData(prev => ({ ...prev, unitPrice: '' }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setItemData(prev => ({ ...prev, unitPrice: numValue }));
      }
    }
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    if (isEditing && onEditItem) {
      // Update existing item
      const updatedItem = {
        ...editingItem,
        description: itemData.description.trim(),
        quantity: Number(itemData.quantity),
        unit: itemData.unit.trim(),
        unitPrice: Number(itemData.unitPrice),
      };
      onEditItem(updatedItem);
    } else {
      // Add new item
      const newItem = {
        id: `manual-${Date.now()}-${Math.random()}`,
        itemId: `manual-${Date.now()}`,
        name: itemData.description.trim(),
        description: itemData.description.trim(),
        quantity: Number(itemData.quantity),
        unit: itemData.unit.trim(),
        unitPrice: Number(itemData.unitPrice),
        imagePaths: [],
        newImages: [],
        isManualItem: true,
      };
      onAddItem(newItem);
    }
    
    setIsSubmitting(false);
    onClose();
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 1000,
            }}
          />
          
          {/* Modal content - Centered */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '0.5rem' : '1rem',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                background: 'white',
                borderRadius: isMobile ? '20px' : '24px',
                width: '100%',
                maxWidth: '500px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                pointerEvents: 'auto',
              }}
            >
              {/* Header */}
              <div style={{
                padding: isMobile ? '1rem' : '1.25rem 1.5rem',
                borderBottom: '1px solid #eef2ff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                background: 'white',
                zIndex: 10,
              }}>
                <div>
                  <h2 style={{
                    margin: 0,
                    fontSize: isMobile ? '1rem' : '1.25rem',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}>
                    {isEditing ? 'Edit Item' : 'Add Item'}
                  </h2>
                  <p style={{
                    margin: '0.25rem 0 0',
                    fontSize: '0.7rem',
                    color: '#64748b',
                  }}>
                    {isEditing ? 'Update item details' : 'Enter item details manually'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#f1f5f9',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} color="#64748b" />
                </button>
              </div>

              {/* Form Body */}
              <div style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                {/* Description */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: '0.35rem',
                    fontSize: isMobile ? '0.75rem' : '0.85rem',
                  }}>
                    Description <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    value={itemData.description}
                    onChange={(e) => setItemData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter item description..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
                      border: `1.5px solid ${errors.description ? '#ef4444' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      fontSize: isMobile ? '0.75rem' : '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#0f172a'}
                    onBlur={(e) => {
                      if (!errors.description) e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  />
                  {errors.description && (
                    <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertCircle size={12} /> {errors.description}
                    </p>
                  )}
                </div>

                {/* Quantity, Unit and Price Row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                  gap: isMobile ? '0.75rem' : '1rem',
                  marginBottom: '1rem',
                }}>
                  {/* Quantity */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '0.35rem',
                      fontSize: isMobile ? '0.75rem' : '0.85rem',
                    }}>
                      Quantity <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={itemData.quantity === '' ? '' : itemData.quantity}
                      onChange={handleQuantityChange}
                      placeholder="1"
                      style={{
                        width: '100%',
                        padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
                        border: `1.5px solid ${errors.quantity ? '#ef4444' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        fontSize: isMobile ? '0.75rem' : '0.875rem',
                        outline: 'none',
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#0f172a'}
                      onBlur={(e) => {
                        if (itemData.quantity === '' || itemData.quantity <= 0) {
                          setItemData(prev => ({ ...prev, quantity: 1 }));
                        }
                        if (!errors.quantity) e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    />
                    {errors.quantity && (
                      <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem' }}>{errors.quantity}</p>
                    )}
                  </div>

                  {/* Unit */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '0.35rem',
                      fontSize: isMobile ? '0.75rem' : '0.85rem',
                    }}>
                      Unit
                    </label>
                    <input
                      type="text"
                      value={itemData.unit}
                      onChange={(e) => setItemData(prev => ({ ...prev, unit: e.target.value }))}
                      placeholder="pcs, box, kg..."
                      style={{
                        width: '100%',
                        padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: isMobile ? '0.75rem' : '0.875rem',
                        outline: 'none',
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#0f172a'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                    />
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '0.35rem',
                      fontSize: isMobile ? '0.75rem' : '0.85rem',
                    }}>
                      Unit Price ({selectedCurrency}) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemData.unitPrice === '' ? '' : itemData.unitPrice}
                      onChange={handlePriceChange}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
                        border: `1.5px solid ${errors.unitPrice ? '#ef4444' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        fontSize: isMobile ? '0.75rem' : '0.875rem',
                        outline: 'none',
                        textAlign: 'right',
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#0f172a'}
                      onBlur={(e) => {
                        if (itemData.unitPrice === '') {
                          setItemData(prev => ({ ...prev, unitPrice: 0 }));
                        }
                        if (!errors.unitPrice) e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    />
                    {errors.unitPrice && (
                      <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem' }}>{errors.unitPrice}</p>
                    )}
                  </div>
                </div>

                {/* Preview Section */}
                {itemData.description && itemData.quantity && itemData.unitPrice !== '' && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#f0fdf4',
                    borderRadius: '12px',
                    border: '1px solid #bbf7d0',
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: '0.7rem',
                      color: '#166534',
                      fontWeight: 500,
                      marginBottom: '0.5rem',
                    }}>
                      Preview
                    </p>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 500, color: '#065f46' }}>
                          {itemData.description.length > 50 ? itemData.description.substring(0, 50) + '...' : itemData.description}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#059669' }}>
                          {itemData.quantity} × {fmtCurrency(Number(itemData.unitPrice), selectedCurrency)}
                        </div>
                        <div style={{ fontWeight: 700, color: '#065f46' }}>
                          Total: {fmtCurrency(Number(itemData.quantity) * Number(itemData.unitPrice), selectedCurrency)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: isMobile ? '1rem' : '1.25rem 1.5rem',
                borderTop: '1px solid #eef2ff',
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                    color: '#64748b',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  style={{
                    padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                    color: 'white',
                    border: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (isEditing ? 'Updating...' : 'Adding...') : (isEditing ? <><Plus size={16} /> Update Item</> : <><Plus size={16} /> Add Item</>)}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// Helper function for currency formatting
const fmtCurrency = (amount, currency) => {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currency || 'AED',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default ItemModal;