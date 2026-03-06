import React from 'react';
import { Plus, Trash2, Upload, Save, X } from 'lucide-react';
import headerImage from '../assets/header.png';
import TermsEditor, { TermsViewer } from './TermsCondition';

// ─────────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────────
const BASE_URL = 'http://51.20.109.158:5000';

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

// ─────────────────────────────────────────────────────────────
// QuotationLayout
//
// Props:
//   isEditing          boolean
//   quotationNumber    string
//   quotationData      { customer, contact, date, expiryDate, ourRef, ourContact,
//                        salesOffice, paymentTerms, deliveryTerms, tax, discount,
//                        notes }
//   onDataChange       (field, value) => void
//   quotationItems     [{ id, itemId, name, description, quantity, unitPrice,
//                         imagePaths?, newImages? }]
//   availableItems     Item[]        – catalogue list for the select dropdown
//   onUpdateItem       (id, field, value) => void
//   onAddItem          () => void
//   onRemoveItem       (id) => void
//   onAddImages        (e, itemId) => void
//   onRemoveExistingImage (itemId, idx) => void   – optional (ViewQuotation only)
//   onRemoveNewImage   (itemId, idx) => void       – optional
//   editingImgId       string | null
//   onToggleImgEdit    (itemId) => void
//   newImages          { [itemId]: base64[] }      – extra new images (ViewQuotation)
//   subtotal           number
//   taxAmount          number
//   discountAmount     number
//   grandTotal         number
//   amountInWords      string
//   tcSections         Section[]
//   onTcChange         (sections) => void
//   // Action bar (bottom of card)
//   actionBar          ReactNode   – custom buttons rendered at bottom (Save / Cancel / Submit)
// ─────────────────────────────────────────────────────────────
export default function QuotationLayout({
  isEditing,
  quotationNumber,
  quotationData,
  onDataChange,
  quotationItems,
  availableItems = [],
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onAddImages,
  onRemoveExistingImage,
  onRemoveNewImage,
  editingImgId,
  onToggleImgEdit,
  newImages = {},
  subtotal,
  taxAmount,
  discountAmount,
  grandTotal,
  amountInWords,
  tcSections,
  onTcChange,
  actionBar,
}) {
  // ── Left details column fields ──────────────────────────────
  const leftFields = [
    ['Customer',    'customer',   'text'],
    ['Contact',     'contact',    'text'],
    ['Date',        'date',       'date'],
    ['Expiry Date', 'expiryDate', 'date'],
  ];

  // ── Right details column fields ─────────────────────────────
  const rightFields = [
    ['Our Ref',      'ourRef',        'text'],
    ['Our Contact',  'ourContact',    'text'],
    ['Sales Office', 'salesOffice',   'text'],
    ['Payment',      'paymentTerms',  'text'],
    ['Delivery',     'deliveryTerms', 'text'],
  ];

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // ── Table column count (adds delete col in edit mode) ───────
  const colCount = isEditing ? 6 : 5;

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
            <input
              type="date"
              className="edit-input"
              value={quotationData.expiryDate || ''}
              onChange={(e) => onDataChange('expiryDate', e.target.value)}
              style={{ ...inputStyle, textAlign: 'right', fontWeight: '700', fontSize: '1rem' }}
            />
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
                <input
                  type={type}
                  className="edit-input"
                  value={quotationData[field] || ''}
                  onChange={(e) => onDataChange(field, e.target.value)}
                  style={inputStyle}
                />
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
                  { label: 'SR#',             w: '50px',  align: 'center' },
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
              {quotationItems.map((qi, index) => {
                const allImgs = [
                  ...(qi.imagePaths || []).map((p) => `${BASE_URL}${p}`),
                  ...(newImages[qi.id] || []),
                ];
                return (
                  <tr key={qi.id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc', verticalAlign: 'top' }}>

                    {/* SR# */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>
                      {index + 1}
                    </td>

                    {/* Description cell */}
                    <td style={{ padding: '0.75rem 1rem', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                      {isEditing ? (
                        <>
                          {/* Item dropdown */}
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
                          {/* Description textarea */}
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

                      {/* Existing server images */}
                      {(qi.imagePaths || []).length > 0 && (
                        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: '0.5rem' }}>
                          {qi.imagePaths.map((path, idx) => (
                            <div key={idx} style={{ position: 'relative', width: '110px', height: '110px', borderRadius: '0.375rem', overflow: 'visible', border: '1px solid #d1d5db' }}>
                              <img
                                src={`${path}`}
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

                      {/* Newly added (base64) images */}
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
                        <input
                          type="number" min="1" className="edit-input"
                          value={qi.quantity}
                          onChange={(e) => onUpdateItem(qi.id, 'quantity', e.target.value)}
                          style={{ ...inputStyle, textAlign: 'center' }}
                        />
                      ) : qi.quantity}
                    </td>

                    {/* Unit Price */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb', textAlign: 'right' }}>
                      {isEditing ? (
                        <input
                          type="number" min="0" step="0.01" className="edit-input"
                          value={qi.unitPrice}
                          onChange={(e) => onUpdateItem(qi.id, 'unitPrice', e.target.value)}
                          style={{ ...inputStyle, textAlign: 'right' }}
                        />
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
                );
              })}

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
            {[['VAT (%)', 'tax'], ['Discount (%)', 'discount']].map(([label, field]) => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>{label}</label>
                <input
                  type="number" min="0" max="100" step="0.01" className="edit-input"
                  value={quotationData[field] || 0}
                  onChange={(e) => onDataChange(field, parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}
 
{/* ══ 8. Terms & Conditions ══ */}
<div style={{ marginBottom: '2rem' }}>
  <h3 style={{
    fontSize: '1rem',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '1.1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }}>
    Terms & Conditions
  </h3>

  {isEditing ? (
    <TermsEditor sections={tcSections} onChange={onTcChange} />
  ) : (
    <div style={{
      display: 'flex',
      gap: '2.5rem',
      alignItems: 'flex-start',
      backgroundColor: '#f9fafb',
      padding: '1.25rem',
      borderRadius: '0.5rem',
      border: '1px solid #e5e7eb',
    }}>
      {/* Left: Terms text (takes most space) */}
      <div style={{ flex: '1 1 65%', minWidth: 0 }}>
        <TermsViewer sections={tcSections} />
      </div>

      {/* Right: Image column – fixed width, only if image exists */}
      {quotationData?.termsImage && (
        <div style={{
          flex: '0 0 300px',
          maxWidth: '300px',
        }}>
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            background: 'white',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          }}>
            <img
              src={
                quotationData.termsImage.startsWith('data:')
                  ? quotationData.termsImage
                  : ` ${quotationData.termsImage}`
              }
              alt="Terms illustration"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
          <p style={{
            marginTop: '0.6rem',
            fontSize: '0.75rem',
            color: '#6b7280',
            textAlign: 'center',
          }}>
            Reference Image
          </p>
        </div>
      )}
    </div>
  )}
</div>

      {/* ══ 9. Signature footer ══ */}
      <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
        <p style={{ margin: 0, fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>Sincerely,</p>
        <p style={{ margin: '2.5rem 0 0', fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>
          Mega Repairing Machinery Equipment LLC
        </p>
      </div>

      {/* ══ 10. Action bar (Save / Cancel / Submit) ══ */}
      {actionBar && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
          {actionBar}
        </div>
      )}
    </div>
  );
}