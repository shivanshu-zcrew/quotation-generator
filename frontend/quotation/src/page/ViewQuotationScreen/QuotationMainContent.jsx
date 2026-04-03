// QuotationMainContent.jsx  (simplified – you can expand later)
import React from 'react';

export default function QuotationMainContent({
  isEditing,
  quotationData,
  onDataChange,
  quotationItems,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  subtotal,
  taxAmount,
  discountAmount,
  grandTotal,
  amountInWords
}) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      padding: '24px',
      border: '1px solid #e5e7eb'
    }}>
      {/* Customer / Dates / Refs */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px' }}>Quotation Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Customer</label>
            <input
              value={quotationData.customer || ''}
              onChange={e => onDataChange('customer', e.target.value)}
              disabled={!isEditing}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: isEditing ? 'white' : '#f8fafc'
              }}
            />
          </div>
          {/* Add more fields similarly */}
        </div>
      </div>

      {/* Items Table – simplified placeholder */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Items</h2>
          {isEditing && (
            <button
              onClick={onAddItem}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              + Add Item
            </button>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Description</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Unit Price</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {quotationItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px' }}>{item.name || '—'}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => onUpdateItem(item.id, 'quantity', e.target.value)}
                    disabled={!isEditing}
                    style={{ width: '80px', textAlign: 'center', padding: '6px' }}
                  />
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  {Number(item.unitPrice).toFixed(2)}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>
                  {(item.quantity * item.unitPrice).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ marginLeft: 'auto', maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '500' }}>
          <span>Subtotal</span>
          <span>{subtotal.toFixed(2)} AED</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span>Tax ({quotationData.tax || 0}%)</span>
          <span>{taxAmount.toFixed(2)} AED</span>
        </div>
        {discountAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: '#059669' }}>
            <span>Discount ({quotationData.discount}%)</span>
            <span>-{discountAmount.toFixed(2)} AED</span>
          </div>
        )}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 0',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          borderTop: '2px solid #000',
          marginTop: '12px'
        }}>
          <span>Grand Total</span>
          <span>{grandTotal.toFixed(2)} AED</span>
        </div>
        <div style={{ marginTop: '12px', fontStyle: 'italic', color: '#4b5563' }}>
          {amountInWords}
        </div>
      </div>
    </div>
  );
}