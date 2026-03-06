import React, { useState } from 'react';
import { Plus, Edit2, Trash2, ArrowLeft, Save, X, Mail, Phone, MapPin, User, Users, Search } from 'lucide-react';

export default function CustomersScreen({ customers, onAddCustomer, onUpdateCustomer, onDeleteCustomer, onBack }) {
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({ name: '', email: '', phone: '', address: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setFormData(customer);
      setEditingId(customer._id);
    } else {
      setFormData({ name: '', email: '', phone: '', address: '' });
      setEditingId(null);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', email: '', phone: '', address: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) { alert('Name and email are required'); return; }
    setIsSubmitting(true);
    try {
      const success = editingId
        ? await onUpdateCustomer(editingId, formData)
        : await onAddCustomer(formData);
      if (success) {
        closeModal();
        alert(editingId ? 'Customer updated successfully' : 'Customer added successfully');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Avatar initials helper
  const initials = (name) => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  // Deterministic color from name
  const avatarColors = ['#6366f1','#8b5cf6','#059669','#d97706','#dc2626','#0284c7','#db2777'];
  const avatarColor  = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        /* ── Stat cards ── */
        .cs-stat {
          background: white;
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.05);
          transition: transform .2s, box-shadow .2s;
          position: relative; overflow: hidden;
        }
        .cs-stat::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 3px; border-radius: 18px 18px 0 0;
        }
        .cs-stat.indigo::before { background: linear-gradient(90deg,#6366f1,#818cf8); }
        .cs-stat.emerald::before { background: linear-gradient(90deg,#059669,#34d399); }
        .cs-stat:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,.07), 0 12px 28px rgba(0,0,0,.1); }

        /* ── Search ── */
        .cs-search {
          background: white;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          color: #1f2937;
          padding: .7rem 1rem .7rem 2.75rem;
          font-size: .875rem;
          font-family: inherit;
          outline: none;
          width: 100%;
          transition: border-color .2s, box-shadow .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .cs-search:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }

        /* ── Table row ── */
        .cs-row { border-bottom: 1px solid #f1f5f9; transition: background .12s; }
        .cs-row:hover { background: #f8faff !important; }
        .cs-row:last-child { border-bottom: none; }

        /* ── Icon action buttons ── */
        .cs-icon-btn {
          width: 34px; height: 34px; border-radius: 9px;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all .15s; flex-shrink: 0;
        }
        .cs-icon-btn.edit  { background: #eff1ff; color: #6366f1; }
        .cs-icon-btn.edit:hover  { background: #e0e3ff; color: #4f46e5; transform: translateY(-1px); }
        .cs-icon-btn.del   { background: #fff1f1; color: #dc2626; }
        .cs-icon-btn.del:hover   { background: #ffe4e4; color: #b91c1c; transform: translateY(-1px); }

        /* ── Primary button ── */
        .cs-primary-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; border: none; border-radius: 12px;
          padding: .7rem 1.4rem; font-size: .875rem; font-weight: 700;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          box-shadow: 0 4px 14px rgba(99,102,241,.35);
          transition: all .2s;
        }
        .cs-primary-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,.5); }

        /* ── Secondary button ── */
        .cs-secondary-btn {
          background: white; color: #475569;
          border: 1.5px solid #e2e8f0; border-radius: 12px;
          padding: .7rem 1.4rem; font-size: .875rem; font-weight: 600;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          transition: all .2s;
        }
        .cs-secondary-btn:hover { border-color: #cbd5e1; background: #f8fafc; transform: translateY(-1px); }

        /* ── Modal overlay ── */
        .cs-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,.45);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 1rem;
        }

        /* ── Modal card ── */
        .cs-modal {
          background: white; border-radius: 20px;
          padding: 2rem; width: 100%; max-width: 460px;
          box-shadow: 0 24px 60px rgba(0,0,0,.18);
          animation: modalIn .22s cubic-bezier(.4,0,.2,1) both;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* ── Form field ── */
        .cs-field {
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 10px; padding: .7rem .9rem;
          font-size: .875rem; font-family: inherit; color: #1f2937;
          width: 100%; outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .cs-field:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); background: white; }
        .cs-field::placeholder { color: #94a3b8; }

        /* ── Submit button ── */
        .cs-submit-btn {
          background: linear-gradient(135deg,#6366f1,#8b5cf6);
          color: white; border: none; border-radius: 10px;
          padding: .75rem 1.5rem; font-size: .875rem; font-weight: 700;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          box-shadow: 0 4px 12px rgba(99,102,241,.35); transition: all .2s;
        }
        .cs-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99,102,241,.45); }
        .cs-submit-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

        /* ── Cancel button ── */
        .cs-cancel-btn {
          background: #f1f5f9; color: #64748b;
          border: none; border-radius: 10px;
          padding: .75rem 1.5rem; font-size: .875rem; font-weight: 600;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem; transition: background .15s;
        }
        .cs-cancel-btn:hover { background: #e2e8f0; }

        /* ── Animations ── */
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .fa1 { animation: fadeUp .35s ease both; }
        .fa2 { animation: fadeUp .35s .07s ease both; }
        .fa3 { animation: fadeUp .35s .14s ease both; }
        .fa4 { animation: fadeUp .35s .21s ease both; }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Page header ── */}
        <div className="fa1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <p style={{ margin: '0 0 .35rem', color: '#94a3b8', fontSize: '.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Customer Management
            </p>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-.03em' }}>
              Customers
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button className="cs-primary-btn" onClick={() => handleOpenModal()}>
              <Plus size={17} /> Add Customer
            </button>
            <button className="cs-secondary-btn" onClick={onBack}>
              <ArrowLeft size={17} /> Back
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="fa2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          {[
            { cls: 'indigo', label: 'Total Customers', value: customers.length, iconBg: '#eff1ff', iconColor: '#6366f1', Icon: Users },
            { cls: 'emerald', label: 'Active Customers', value: customers.length, iconBg: '#ecfdf5', iconColor: '#059669', Icon: User },
          ].map(({ cls, label, value, iconBg, iconColor, Icon }) => (
            <div key={label} className={`cs-stat ${cls}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ background: iconBg, borderRadius: '10px', padding: '.5rem', display: 'flex', color: iconColor }}>
                  <Icon size={20} />
                </div>
              </div>
              <p style={{ margin: '0 0 .25rem', color: '#94a3b8', fontSize: '.72rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
              <p style={{ margin: 0, color: '#0f172a', fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="fa3" style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            className="cs-search"
            type="text"
            placeholder="Search by name or email…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* ── Customers table ── */}
        <div className="fa4" style={{ background: 'white', borderRadius: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 20px rgba(0,0,0,.05)', overflow: 'hidden' }}>

          {/* Table toolbar */}
          <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1rem', fontWeight: '700' }}>All Customers</h2>
              <p style={{ margin: '.15rem 0 0', color: '#94a3b8', fontSize: '.78rem' }}>{filtered.length} of {customers.length} records</p>
            </div>
            <button className="cs-primary-btn" style={{ padding: '.5rem 1rem', fontSize: '.8rem' }} onClick={() => handleOpenModal()}>
              <Plus size={15} /> New
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <Users size={28} style={{ color: '#cbd5e1' }} />
              </div>
              <p style={{ color: '#475569', margin: 0, fontWeight: '600' }}>
                {searchTerm ? `No results for "${searchTerm}"` : 'No customers yet'}
              </p>
              <p style={{ color: '#94a3b8', margin: '.4rem 0 1.5rem', fontSize: '.875rem' }}>
                {searchTerm ? 'Try a different search term.' : 'Add your first customer to get started.'}
              </p>
              {!searchTerm && (
                <button className="cs-primary-btn" style={{ margin: '0 auto' }} onClick={() => handleOpenModal()}>
                  <Plus size={16} /> Add Customer
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {[['Customer', 'left'], ['Email', 'left'], ['Phone', 'left'], ['Address', 'left'], ['Actions', 'center']].map(([h, align]) => (
                        <th key={h} style={{ padding: '.75rem 1rem', textAlign: align, color: '#64748b', fontSize: '.72rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', borderBottom: '1.5px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((customer, index) => (
                      <tr key={customer._id} className="cs-row" style={{ background: index % 2 === 0 ? 'white' : '#fafbff' }}>

                        {/* Customer name with avatar */}
                        <td style={{ padding: '.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '10px',
                              background: avatarColor(customer.name),
                              color: 'white', fontWeight: '700', fontSize: '.8rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, letterSpacing: '.02em',
                            }}>
                              {initials(customer.name)}
                            </div>
                            <span style={{ color: '#0f172a', fontWeight: '700', fontSize: '.875rem' }}>{customer.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ padding: '.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', color: '#475569', fontSize: '.85rem' }}>
                            <Mail size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                            {customer.email}
                          </div>
                        </td>

                        {/* Phone */}
                        <td style={{ padding: '.85rem 1rem' }}>
                          {customer.phone ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', color: '#475569', fontSize: '.85rem' }}>
                              <Phone size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                              {customer.phone}
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '.85rem' }}>—</span>
                          )}
                        </td>

                        {/* Address */}
                        <td style={{ padding: '.85rem 1rem', maxWidth: '260px' }}>
                          {customer.address ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', color: '#475569', fontSize: '.85rem' }}>
                              <MapPin size={13} style={{ color: '#94a3b8', flexShrink: 0, marginTop: '2px' }} />
                              <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{customer.address}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '.85rem' }}>—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '.85rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'center' }}>
                            <button className="cs-icon-btn edit" onClick={() => handleOpenModal(customer)} title="Edit">
                              <Edit2 size={15} />
                            </button>
                            <button className="cs-icon-btn del" onClick={() => { if (window.confirm(`Delete ${customer.name}?`)) onDeleteCustomer(customer._id); }} title="Delete">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer count */}
              <div style={{ padding: '.85rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ color: '#94a3b8', fontSize: '.78rem', fontWeight: '500' }}>
                  Showing {filtered.length} of {customers.length} customers
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="cs-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="cs-modal">

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-.02em' }}>
                  {editingId ? 'Edit Customer' : 'Add New Customer'}
                </h2>
                <p style={{ margin: '.2rem 0 0', color: '#94a3b8', fontSize: '.8rem' }}>
                  {editingId ? 'Update the customer details below.' : 'Fill in the details to add a new customer.'}
                </p>
              </div>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'background .15s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>

              {/* Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <User size={14} style={{ color: '#6366f1' }} /> Customer Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input className="cs-field" type="text" name="name" placeholder="e.g. Acme Industries LLC" value={formData.name} onChange={handleChange} required />
              </div>

              {/* Email */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <Mail size={14} style={{ color: '#6366f1' }} /> Email Address <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input className="cs-field" type="email" name="email" placeholder="e.g. contact@acme.com" value={formData.email} onChange={handleChange} required />
              </div>

              {/* Phone */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <Phone size={14} style={{ color: '#6366f1' }} /> Phone Number
                  <span style={{ color: '#94a3b8', fontWeight: '400', marginLeft: '.25rem' }}>(optional)</span>
                </label>
                <input className="cs-field" type="text" name="phone" placeholder="e.g. +971 50 123 4567" value={formData.phone} onChange={handleChange} />
              </div>

              {/* Address */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <MapPin size={14} style={{ color: '#6366f1' }} /> Address
                  <span style={{ color: '#94a3b8', fontWeight: '400', marginLeft: '.25rem' }}>(optional)</span>
                </label>
                <textarea className="cs-field" name="address" placeholder="e.g. Dubai Industrial Area, UAE" value={formData.address} onChange={handleChange} rows={3} style={{ resize: 'vertical', minHeight: '80px' }} />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="cs-cancel-btn" onClick={closeModal}>
                  <X size={16} /> Cancel
                </button>
                <button type="submit" className="cs-submit-btn" disabled={isSubmitting}>
                  <Save size={16} /> {isSubmitting ? 'Saving…' : editingId ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}