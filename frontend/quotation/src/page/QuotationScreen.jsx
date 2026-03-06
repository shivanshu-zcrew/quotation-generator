import React, { useState } from 'react';
import { Plus, Trash2, ArrowLeft, ArrowRight, Users, Package, ChevronDown } from 'lucide-react';
import QuotationTemplate from './QuotationTemplate';

export default function QuotationScreen({ customers = [], items = [], onAddQuotation, onBack }) {
  const [step, setStep]                   = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleAddItem = () => {
    setSelectedItems(prev => [...prev, { id: Date.now(), itemId: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (id) => setSelectedItems(prev => prev.filter(i => i.id !== id));

  const handleItemChange = (id, field, value) => {
    setSelectedItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleProceedToTemplate = () => {
    if (!selectedCustomer)            { alert('Please select a customer'); return; }
    if (selectedItems.length === 0)   { alert('Please add at least one item'); return; }
    if (selectedItems.some(i => !i.itemId)) { alert('Please select an item for all rows'); return; }
    setStep(2);
  };

  const handleBack = () => step === 2 ? setStep(1) : onBack?.();

  // Line total
  const lineTotal = (si) => si.quantity * si.unitPrice;
  const grandTotal = selectedItems.reduce((s, si) => s + lineTotal(si), 0);

  if (step === 2) {
    return (
      <QuotationTemplate
        customer={selectedCustomer}
        selectedItems={selectedItems}
        items={items}
        onAddQuotation={onAddQuotation}
        onBack={handleBack}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        /* ── Select / Input shared ── */
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
        .qs-field::placeholder { color: #94a3b8; }

        /* ── Item row card ── */
        .qs-item-row {
          background: white; border: 1.5px solid #f1f5f9;
          border-radius: 14px; padding: 1.1rem 1.25rem;
          transition: border-color .2s, box-shadow .2s;
        }
        .qs-item-row:hover {
          border-color: #e0e3ff;
          box-shadow: 0 4px 16px rgba(99,102,241,.08);
        }

        /* ── Buttons ── */
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

        /* ── Select arrow wrapper ── */
        .qs-select-wrap { position: relative; }
        .qs-select-wrap .arrow {
          position: absolute; right: .75rem; top: 50%;
          transform: translateY(-50%); pointer-events: none; color: #94a3b8;
        }

        /* ── Summary box ── */
        .qs-summary {
          background: linear-gradient(135deg,#6366f1,#8b5cf6);
          border-radius: 14px; padding: 1.25rem 1.5rem;
          color: white;
        }

        /* ── Animations ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .fa1{animation:fadeUp .35s ease both}
        .fa2{animation:fadeUp .35s .07s ease both}
        .fa3{animation:fadeUp .35s .14s ease both}

        /* ── Empty state ── */
        .qs-empty {
          border: 2px dashed #e2e8f0; border-radius: 14px;
          padding: 2.5rem; text-align: center; background: #fafbff;
        }

        /* ── Customer card ── */
        .qs-cust-card {
          background: #f0fdf4; border: 1.5px solid #bbf7d0;
          border-radius: 12px; padding: .85rem 1rem;
          display: flex; align-items: center; gap: .75rem;
          margin-top: .75rem;
        }
      `}</style>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Page header ── */}
        <div className="fa1" style={{ marginBottom: '2rem' }}>
          <p style={{ margin: '0 0 .35rem', color: '#94a3b8', fontSize: '.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            Step 1 of 2
          </p>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-.03em' }}>
            Create Quotation
          </h1>
          <p style={{ margin: '.35rem 0 0', color: '#64748b', fontSize: '.875rem' }}>
            Select a customer and add items to generate a quotation.
          </p>
        </div>

        {/* ── Main card ── */}
        <div className="fa2" style={{ background: 'white', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 8px 32px rgba(0,0,0,.07)', overflow: 'hidden' }}>

          {/* ── Section: Customer ── */}
          <div style={{ padding: '1.75rem 1.75rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '1rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '9px', background: '#eff1ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', flexShrink: 0 }}>
                <Users size={16} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                Customer <span style={{ color: '#ef4444' }}>*</span>
              </h2>
            </div>

            <div className="qs-select-wrap">
              <select
                className="qs-field"
                style={{ paddingRight: '2.5rem' }}
                value={selectedCustomer?._id || ''}
                onChange={(e) => setSelectedCustomer(customers.find(c => c._id === e.target.value) || null)}
              >
                <option value="">— Choose a customer —</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.name} · {c.email}</option>
                ))}
              </select>
              <ChevronDown size={16} className="arrow" />
            </div>

            {customers.length === 0 && (
              <p style={{ margin: '.5rem 0 0', color: '#f59e0b', fontSize: '.8rem', fontWeight: '500' }}>
                ⚠️ No customers found. Please add a customer first.
              </p>
            )}

            {/* Selected customer preview */}
            {selectedCustomer && (
              <div className="qs-cust-card">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#059669', color: 'white', fontWeight: '700', fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selectedCustomer.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: '700', color: '#065f46', fontSize: '.875rem' }}>{selectedCustomer.name}</p>
                  <p style={{ margin: 0, color: '#059669', fontSize: '.78rem' }}>{selectedCustomer.email}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#f1f5f9', margin: '1.75rem 0' }} />

          {/* ── Section: Items ── */}
          <div style={{ padding: '0 1.75rem 1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '9px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                  <Package size={16} />
                </div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  Items <span style={{ color: '#ef4444' }}>*</span>
                </h2>
              </div>
              {selectedItems.length > 0 && (
                <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.75rem', fontWeight: '600' }}>
                  {selectedItems.length} row{selectedItems.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Item rows */}
            {selectedItems.length === 0 ? (
              <div className="qs-empty">
                <div style={{ width: 48, height: 48, borderRadius: '14px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto .875rem', color: '#94a3b8' }}>
                  <Package size={22} />
                </div>
                <p style={{ margin: '0 0 .3rem', color: '#475569', fontWeight: '600', fontSize: '.9rem' }}>No items added yet</p>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '.8125rem' }}>Click the button below to add your first item.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '.75rem' }}>
                {selectedItems.map((si, index) => {
                  const item = items.find(i => i._id === si.itemId);
                  return (
                    <div key={si.id} className="qs-item-row">

                      {/* Row header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                        <span style={{ background: '#eff1ff', color: '#6366f1', borderRadius: '7px', padding: '.15rem .55rem', fontSize: '.72rem', fontWeight: '700' }}>
                          Line {index + 1}
                        </span>
                        <button className="qs-del-btn" onClick={() => handleRemoveItem(si.id)} title="Remove row">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Fields grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px', gap: '.75rem', alignItems: 'end' }}>

                        {/* Item select */}
                        <div>
                          <label style={{ display: 'block', color: '#64748b', fontWeight: '600', marginBottom: '.35rem', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Item</label>
                          <div className="qs-select-wrap">
                            <select
                              className="qs-field"
                              style={{ paddingRight: '2.5rem' }}
                              value={si.itemId}
                              onChange={(e) => {
                                const found = items.find(i => i._id === e.target.value);
                                handleItemChange(si.id, 'itemId', e.target.value);
                                if (found) handleItemChange(si.id, 'unitPrice', found.price);
                              }}
                            >
                              <option value="">— Select item —</option>
                              {items.map(itm => (
                                <option key={itm._id} value={itm._id}>{itm.name} (AED {itm.price})</option>
                              ))}
                            </select>
                            <ChevronDown size={15} className="arrow" />
                          </div>
                        </div>

                        {/* Quantity */}
                        <div>
                          <label style={{ display: 'block', color: '#64748b', fontWeight: '600', marginBottom: '.35rem', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Qty</label>
                          <input
                            className="qs-field"
                            type="number" min="1"
                            value={si.quantity}
                            onChange={(e) => handleItemChange(si.id, 'quantity', parseInt(e.target.value) || 1)}
                            style={{ textAlign: 'center' }}
                          />
                        </div>

                        {/* Unit price */}
                        <div>
                          <label style={{ display: 'block', color: '#64748b', fontWeight: '600', marginBottom: '.35rem', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Unit Price (AED)</label>
                          <input
                            className="qs-field"
                            type="number" step="0.01" min="0"
                            value={si.unitPrice}
                            onChange={(e) => handleItemChange(si.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            style={{ textAlign: 'right' }}
                          />
                        </div>
                      </div>

                      {/* Line subtotal */}
                      {si.itemId && (
                        <div style={{ marginTop: '.6rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '.4rem' }}>
                          <span style={{ color: '#94a3b8', fontSize: '.75rem' }}>Line total:</span>
                          <span style={{ color: '#059669', fontWeight: '700', fontSize: '.875rem', fontFamily: 'monospace' }}>
                            AED {lineTotal(si).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {/* Add item button */}
            <button className="qs-add-item-btn" onClick={handleAddItem} style={{ marginTop: selectedItems.length > 0 ? '0' : '.75rem' }}>
              <Plus size={16} /> Add Item Row
            </button>
          </div>

          {/* ── Summary + Actions ── */}
          {selectedItems.some(i => i.itemId) && (
            <div style={{ padding: '0 1.75rem 1.75rem' }}>
              <div className="qs-summary">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '.78rem', fontWeight: '600', opacity: .75, textTransform: 'uppercase', letterSpacing: '.06em' }}>Estimated Total</p>
                    <p style={{ margin: '.25rem 0 0', fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-.02em', fontFamily: 'monospace' }}>
                      AED {grandTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ opacity: .3, fontSize: '2.5rem' }}>🧾</div>
                </div>
                <p style={{ margin: '.5rem 0 0', fontSize: '.75rem', opacity: .65 }}>
                  Excludes tax & discount — configure in the next step.
                </p>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div style={{ padding: '1.25rem 1.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '.75rem', background: '#fafbff' }}>
            <button className="qs-secondary-btn" onClick={handleBack}>
              <ArrowLeft size={17} /> Back
            </button>
            <button className="qs-primary-btn" onClick={handleProceedToTemplate}>
              Continue to Template <ArrowRight size={17} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}