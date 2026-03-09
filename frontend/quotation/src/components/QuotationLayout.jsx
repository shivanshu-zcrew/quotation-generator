import React, { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import headerImage from '../assets/header.png';
import TermsEditor, { TermsViewer } from './TermsCondition';
import ValidatedInput from './ValidatedInput';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import Snackbar from './Snackbar';

// ─────────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────────
export const inputStyle = {
  width: '100%',
  border: '1px solid #d1d5db',
  padding: '0.3rem 0.5rem',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  backgroundColor: 'white',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export const removeImgBtnStyle = {
  position: 'absolute', top: '-6px', right: '-6px',
  backgroundColor: '#ef4444', color: 'white', border: 'none',
  borderRadius: '50%', width: '20px', height: '20px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: '10px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
};

export default function QuotationLayout({
  isEditing,
  quotationNumber,
  quotationData,          // may be undefined while parent is loading — we guard below
  onDataChange,
  quotationItems    = [],
  availableItems    = [],
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onAddImages,
  onRemoveExistingImage,
  onRemoveNewImage,
  editingImgId,
  onToggleImgEdit,
  newImages         = {},
  subtotal          = 0,
  taxAmount         = 0,
  discountAmount    = 0,
  grandTotal        = 0,
  amountInWords     = '',
  tcSections,
  onTcChange,
  actionBar,
  headerErrors      = {},   // { date, expiryDate, tax, discount } — shown inline
  fieldErrors       = {},   // { [itemId]: { quantity, unitPrice } } — shown inline
}) {

  // ── Guard: render nothing until quotationData is ready ──────
  if (!quotationData) return null;

  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });

  const showLocalSnack = (message, type = 'error') =>
    setSnackbar({ show: true, message, type });

  const handleValidatedUpdate = (itemId, field, value, validator) => {
    if (value === '') {
      if (field === 'quantity') {
        showLocalSnack('Quantity cannot be empty');
      }
      return;
    }
    if (validator) {
      const result = validator(value);
      if (!result.isValid) {
        showLocalSnack(result.error);
        return;
      }
    }
    onUpdateItem(itemId, field, value);
  };

  // ── Detail field definitions ─────────────────────────────────
  const leftFields = [
    ['Customer',    'customer',   'text'],
    ['Contact',     'contact',    'text'],
    ['Date',        'date',       'date'],
    ['Expiry Date', 'expiryDate', 'date'],
  ];
  const rightFields = [
    ['Our Ref',      'ourRef',        'text'],
    ['Our Contact',  'ourContact',    'text'],
    ['Sales Office', 'salesOffice',   'text'],
    ['Payment',      'paymentTerms',  'text'],
    ['Delivery',     'deliveryTerms', 'text'],
  ];

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="quotation-content" style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '2rem' }}>

      {/* ══ 1. Company header image ══ */}
      <div style={{ width: '100%', height: '140px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '0.375rem', backgroundColor: '#f8fafc', border: '3px solid #000' }}>
        <img
          src={headerImage}
          alt="Company Header"
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }}
          onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div style="font-size:1.5rem;font-weight:bold;">COMPANY HEADER</div>'; }}
        />
      </div>

      {/* ══ 2. Title row ══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #000', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#000', margin: 0, letterSpacing: '1px' }}>QUOTATION</h1>
          <p style={{ color: '#6b7280', margin: '0.5rem 0 0', fontSize: '0.875rem', fontWeight: '500' }}>
            {quotationNumber || '—'}
          </p>
        </div>
        <div style={{ textAlign: 'right', minWidth: '160px' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', margin: '0 0 4px' }}>VALID UNTIL</p>
          {isEditing ? (
            <div>
              <input
                type="date"
                className={`edit-input${headerErrors.expiryDate ? ' field-error-input' : ''}`}
                value={quotationData.expiryDate || ''}
                min={quotationData.date || ''}
                onChange={(e) => onDataChange('expiryDate', e.target.value)}
                style={{ ...inputStyle, textAlign: 'right', fontWeight: '700', fontSize: '1rem', borderColor: headerErrors.expiryDate ? '#dc2626' : undefined, backgroundColor: headerErrors.expiryDate ? '#fef2f2' : undefined }}
              />
              {headerErrors.expiryDate && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', marginTop:'0.25rem', color:'#dc2626', fontSize:'0.7rem', justifyContent:'flex-end' }}>
                  ⚠ {headerErrors.expiryDate}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              {fmtDate(quotationData.expiryDate)}
            </p>
          )}
        </div>
      </div>

      {/* ══ 3. Details grid ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', marginBottom: '2.5rem', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}>
        {/* Left column */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 16px 1fr', rowGap: '0.65rem', alignItems: 'center' }}>
          {leftFields.map(([label, field, type]) => (
            <React.Fragment key={field}>
              <span style={{ fontWeight: 600, color: '#4b5563', fontSize: '0.875rem' }}>{label}</span>
              <span style={{ color: '#6b7280' }}>:</span>
              {isEditing ? (
                <div>
                  <input
                    type={type}
                    className="edit-input"
                    value={quotationData[field] || ''}
                    min={field === 'expiryDate' ? (quotationData.date || '') : undefined}
                    onChange={(e) => onDataChange(field, e.target.value)}
                    style={{ ...inputStyle, borderColor: headerErrors[field] ? '#dc2626' : undefined, backgroundColor: headerErrors[field] ? '#fef2f2' : undefined }}
                  />
                  {headerErrors[field] && (
                    <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', marginTop:'0.25rem', color:'#dc2626', fontSize:'0.7rem' }}>
                      ⚠ {headerErrors[field]}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: 500 }}>
                  {type === 'date' ? fmtDate(quotationData[field]) : quotationData[field] || 'N/A'}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Right column */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 16px 1fr', rowGap: '0.65rem', alignItems: 'center' }}>
          {rightFields.map(([label, field]) => (
            <React.Fragment key={field}>
              <span style={{ fontWeight: 600, color: '#4b5563', fontSize: '0.875rem' }}>{label}</span>
              <span style={{ color: '#6b7280' }}>:</span>
              {isEditing ? (
                <input
                  type="text"
                  className="edit-input"
                  value={quotationData[field] || ''}
                  onChange={(e) => onDataChange(field, e.target.value)}
                  style={inputStyle}
                />
              ) : (
                <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: 500 }}>
                  {quotationData[field] || 'N/A'}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ══ 4. Items table ══ */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1f2937', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Items Detail
        </h3>
        <div style={{ overflowX: 'auto', borderRadius: '0.375rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#000' }}>
                {[
                  { label: 'SR#',              w: '50px',  align: 'center' },
                  { label: 'Item Description', w: 'auto',  align: 'left'   },
                  { label: 'Qty',              w: '80px',  align: 'center' },
                  { label: 'Unit Price',       w: '110px', align: 'right'  },
                  { label: 'Amount (AED)',     w: '120px', align: 'right'  },
                  ...(isEditing ? [{ label: '', w: '50px', align: 'center' }] : []),
                ].map(({ label, w, align }) => (
                  <th key={label} style={{ padding: '0.75rem', width: w, color: 'white', fontSize: '0.75rem', fontWeight: '700', textAlign: align, border: '1px solid #000', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotationItems.map((qi, index) => (
                <tr key={qi.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc', verticalAlign: 'top' }}>

                  {/* SR# */}
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>
                    {index + 1}
                  </td>

                  {/* Description cell */}
                  <td style={{ padding: '0.75rem 1rem', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                    {isEditing ? (
                      <>
                        <select
                          className="edit-input"
                          value={qi.itemId || ''}
                          onChange={(e) => onUpdateItem(qi.id, 'itemId', e.target.value)}
                          style={{ ...inputStyle, marginBottom: '0.5rem' }}
                        >
                          <option value="">— Select Item —</option>
                          {availableItems.map((itm) => (
                            <option key={itm._id} value={itm._id}>{itm.name}</option>
                          ))}
                        </select>
                        <textarea
                          className="edit-input"
                          value={qi.description || ''}
                          onChange={(e) => onUpdateItem(qi.id, 'description', e.target.value)}
                          placeholder="Item description (optional)…"
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.4', fontSize: '0.8125rem' }}
                        />
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: '600', marginBottom: '0.2rem', fontSize: '0.9375rem' }}>{qi.name || '—'}</div>
                        {qi.description && (
                          <div style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: '1.4' }}>{qi.description}</div>
                        )}
                      </>
                    )}

                    {/* Existing server / Cloudinary images */}
                    {(qi.imagePaths || []).length > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: '0.5rem' }}>
                        {qi.imagePaths.map((path, idx) => (
                          <div key={idx} style={{ position: 'relative', width: '110px', height: '110px', borderRadius: '0.375rem', overflow: 'visible', border: '1px solid #d1d5db' }}>
                            <img
                              src={path}   /* Cloudinary https:// URL — use directly */
                              alt={`item-img-${idx}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.375rem' }}
                              onError={(e) => { e.target.src = 'https://placehold.co/110x110?text=Image'; }}
                            />
                            {isEditing && onRemoveExistingImage && (
                              <button onClick={() => onRemoveExistingImage(qi.id, idx)} style={removeImgBtnStyle}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Newly added (base64/blob) images */}
                    {(newImages[qi.id] || []).length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: '0.5rem' }}>
                        {newImages[qi.id].map((src, idx) => (
                          <div key={idx} style={{ position: 'relative', width: '110px', height: '110px', borderRadius: '0.375rem', overflow: 'visible', border: '1px solid #86efac' }}>
                            <img src={src} alt={`new-img-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.375rem' }} />
                            {isEditing && onRemoveNewImage && (
                              <button onClick={() => onRemoveNewImage(qi.id, idx)} style={removeImgBtnStyle}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Image upload toggle (edit mode) */}
                    {isEditing && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <button
                          onClick={() => onToggleImgEdit(qi.id)}
                          style={{ backgroundColor: editingImgId === qi.id ? '#dc2626' : '#10b981', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <Upload size={13} /> {editingImgId === qi.id ? 'Cancel' : 'Add Images'}
                        </button>
                        {editingImgId === qi.id && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <input
                              type="file" accept="image/*" multiple
                              id={`img-upload-${qi.id}`}
                              style={{ display: 'none' }}
                              onChange={(e) => onAddImages(e, qi.id)}
                            />
                            <label htmlFor={`img-upload-${qi.id}`} style={{ display: 'block', padding: '0.75rem', border: '2px dashed #d1d5db', borderRadius: '0.375rem', textAlign: 'center', cursor: 'pointer', fontSize: '0.8125rem', color: '#6b7280' }}>
                              Click to choose images
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Qty */}
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: '600' }}>
                    {isEditing ? (
                      <div>
                        <ValidatedInput
                          type="number"
                          value={qi.quantity}
                          onChange={(val) => handleValidatedUpdate(qi.id, 'quantity', val, validateQuantity)}
                          validator={validateQuantity}
                          placeholder="Qty"
                          style={{ ...inputStyle, textAlign:'center', borderColor: fieldErrors[qi.id]?.quantity ? '#dc2626' : undefined, backgroundColor: fieldErrors[qi.id]?.quantity ? '#fef2f2' : undefined }}
                          min="1"
                        />
                        {fieldErrors[qi.id]?.quantity && (
                          <div style={{ color:'#dc2626', fontSize:'0.65rem', marginTop:'0.2rem', textAlign:'center' }}>⚠ {fieldErrors[qi.id].quantity}</div>
                        )}
                      </div>
                    ) : qi.quantity}
                  </td>

                  {/* Unit Price */}
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'right' }}>
                    {isEditing ? (
                      <div>
                        <ValidatedInput
                          type="number"
                          value={qi.unitPrice}
                          onChange={(val) => handleValidatedUpdate(qi.id, 'unitPrice', val, validatePrice)}
                          validator={validatePrice}
                          placeholder="0.00"
                          style={{ ...inputStyle, textAlign:'right', borderColor: fieldErrors[qi.id]?.unitPrice ? '#dc2626' : undefined, backgroundColor: fieldErrors[qi.id]?.unitPrice ? '#fef2f2' : undefined }}
                          step="0.01"
                          min="0"
                        />
                        {fieldErrors[qi.id]?.unitPrice && (
                          <div style={{ color:'#dc2626', fontSize:'0.65rem', marginTop:'0.2rem', textAlign:'right' }}>⚠ {fieldErrors[qi.id].unitPrice}</div>
                        )}
                      </div>
                    ) : Number(qi.unitPrice || 0).toFixed(2)}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '600' }}>
                    {(Number(qi.quantity || 0) * Number(qi.unitPrice || 0)).toFixed(2)}
                  </td>

                  {/* Delete (edit only) */}
                  {isEditing && (
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <button
                        onClick={() => onRemoveItem(qi.id)}
                        style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {/* ── Totals ── */}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                <td style={{ textAlign: 'right', padding: '0.9rem 0.75rem', borderTop: '2px solid #000', border: '1px solid #e5e7eb', fontSize: '0.875rem' }}>Subtotal (AED)</td>
                <td style={{ textAlign: 'right', padding: '0.9rem 0.75rem', borderTop: '2px solid #000', border: '1px solid #e5e7eb', fontSize: '0.875rem' }}>{subtotal.toFixed(2)}</td>
                {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
              </tr>
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                <td style={{ textAlign: 'right', padding: '0.75rem', border: '1px solid #e5e7eb', fontSize: '0.875rem' }}>VAT ({quotationData.tax || 0}%)</td>
                <td style={{ textAlign: 'right', padding: '0.75rem', border: '1px solid #e5e7eb', fontSize: '0.875rem' }}>{taxAmount.toFixed(2)}</td>
                {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
              </tr>
              {discountAmount > 0 && (
                <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                  <td colSpan={isEditing ? 4 : 3} style={{ border: '1px solid #e5e7eb' }} />
                  <td style={{ textAlign: 'right', padding: '0.75rem', border: '1px solid #e5e7eb', color: '#059669', fontSize: '0.875rem' }}>
                    Discount ({quotationData.discount}%)
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.75rem', border: '1px solid #e5e7eb', color: '#059669', fontSize: '0.875rem' }}>
                    −{discountAmount.toFixed(2)}
                  </td>
                  {isEditing && <td style={{ border: '1px solid #e5e7eb' }} />}
                </tr>
              )}
              <tr style={{ backgroundColor: '#000', color: 'white', fontWeight: '700' }}>
                <td colSpan={isEditing ? 4 : 3} style={{ border: 'none' }} />
                <td style={{ textAlign: 'right', padding: '1rem 0.75rem', fontSize: '1.125rem', border: 'none' }}>Grand Total (AED)</td>
                <td style={{ textAlign: 'right', padding: '1rem 0.75rem', fontSize: '1.125rem', border: 'none' }}>{grandTotal.toFixed(2)}</td>
                {isEditing && <td style={{ border: 'none' }} />}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Add item button */}
        {isEditing && (
          <button
            onClick={onAddItem}
            style={{ marginTop: '1rem', backgroundColor: '#2563eb', color: 'white', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            <Plus size={16} /> Add More Items
          </button>
        )}
      </div>

      {/* ══ 5. Amount in words ══ */}
      <div style={{ padding: '1.1rem 1.25rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem', marginBottom: '2rem', fontSize: '0.9375rem', fontWeight: '600' }}>
        <strong>Amount in words: </strong>
        <span style={{ fontWeight: '500', color: '#374151' }}>{amountInWords}</span>
      </div>

      {/* ══ 6. Tax & Discount (edit mode only) ══ */}
      {isEditing && (
        <div className="no-print" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '1rem', marginBottom: '2rem' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: '700', color: '#1e40af' }}>Tax & Discount</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>VAT (%)</label>
              <ValidatedInput
                type="number"
                value={quotationData.tax}
                onChange={(val) => onDataChange('tax', val === '' ? 0 : parseFloat(val) || 0)}
                validator={validatePercentage}
                placeholder="0"
                style={{ ...inputStyle, borderColor: headerErrors.tax ? '#dc2626' : undefined, backgroundColor: headerErrors.tax ? '#fef2f2' : undefined }}
                min="0" max="100" step="0.01"
              />
              {headerErrors.tax && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', marginTop:'0.25rem', color:'#dc2626', fontSize:'0.7rem' }}>
                  ⚠ {headerErrors.tax}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>Discount (%)</label>
              <ValidatedInput
                type="number"
                value={quotationData.discount}
                onChange={(val) => onDataChange('discount', val === '' ? 0 : parseFloat(val) || 0)}
                validator={validatePercentage}
                placeholder="0"
                style={{ ...inputStyle, borderColor: headerErrors.discount ? '#dc2626' : undefined, backgroundColor: headerErrors.discount ? '#fef2f2' : undefined }}
                min="0" max="100" step="0.01"
              />
              {headerErrors.discount && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', marginTop:'0.25rem', color:'#dc2626', fontSize:'0.7rem' }}>
                  ⚠ {headerErrors.discount}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 7. Terms & Conditions ══ */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1f2937', marginBottom: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Terms & Conditions
        </h3>
        {isEditing ? (
          <TermsEditor sections={tcSections} onChange={onTcChange} />
        ) : (
          <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start', backgroundColor: '#f9fafb', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
            <div style={{ flex: '1 1 65%', minWidth: 0 }}>
              <TermsViewer sections={tcSections} />
            </div>
            {quotationData.termsImage && (
              <div style={{ flex: '0 0 300px', maxWidth: '300px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden', background: 'white', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                  <img
                    src={quotationData.termsImage}   /* Cloudinary URL or base64 — use directly */
                    alt="Terms illustration"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                  Reference Image
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ 8. Signature footer ══ */}
      <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
        <p style={{ margin: 0, fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>Sincerely,</p>
        <p style={{ margin: '2.5rem 0 0', fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>
          Mega Repairing Machinery Equipment LLC
        </p>
      </div>

      {/* ══ 9. Action bar ══ */}
      {actionBar && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          {actionBar}
        </div>
      )}

      {/* Local snackbar (validation feedback) */}
      {snackbar.show && (
        <Snackbar
          message={snackbar.message}
          type={snackbar.type}
          onClose={() => setSnackbar({ show: false, message: '', type: 'error' })}
        />
      )}
    </div>
  );
}