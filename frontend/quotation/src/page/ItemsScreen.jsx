import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, ArrowLeft, Save, X, Upload, Image as ImageIcon, Package, Search, Tag } from 'lucide-react';

// Import store hooks
import { useItems } from '../hooks/customHooks';
import { useAppStore } from '../services/store';

export default function ItemsScreen({ onBack }) {
  // Get data and actions from store
  const { items, addItem, updateItem, deleteItem, isLoading: isAddingItem } = useItems();
  
  // Local UI state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', price: '', description: '', image: null });
  const [imagePreview, setImagePreview] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [dragOver, setDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // Track which item is being deleted

  const handleOpenModal = (item = null) => {
    if (item) {
      setFormData({ 
        name: item.name, 
        price: item.price, 
        description: item.description || '', 
        image: null 
      });
      setImagePreview(item.imagePath ? `http://13.232.90.158:5000${item.imagePath}` : null);
      setEditingId(item._id);
    } else {
      setFormData({ name: '', price: '', description: '', image: null });
      setImagePreview(null);
      setEditingId(null);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', price: '', description: '', image: null });
    setImagePreview(null);
    setIsSubmitting(false);
  };

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleImageChange = (file) => {
    if (!file) return;
    setFormData(prev => ({ ...prev, image: file }));
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.price) { 
      alert('Name and price are required'); 
      return; 
    }
    
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('name', formData.name.trim());
    fd.append('price', parseFloat(formData.price));
    fd.append('description', formData.description.trim());
    if (formData.image) fd.append('image', formData.image);
    
    try {
      let result;
      if (editingId) {
        result = await updateItem(editingId, fd);
      } else {
        result = await addItem(fd);
      }
      
      if (result?.success) {
        closeModal();
        alert(editingId ? 'Item updated successfully' : 'Item added successfully');
      } else {
        alert(result?.error || 'Error saving item. Please try again.');
      }
    } catch (error) {
      alert('Error saving item. Please try again.');
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingId, addItem, updateItem]);

  // Memoized filtered and sorted items
  const filtered = useMemo(() => {
    return items
      .filter(i => 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        if (sortBy === 'date') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        return 0;
      });
  }, [items, searchTerm, sortBy]);

  const avgPrice = useMemo(() => 
    items.length ? items.reduce((s, i) => s + i.price, 0) / items.length : 0,
    [items]
  );

  // Handle delete with local loading state
  const handleDelete = useCallback(async (itemId, itemName) => {
    if (window.confirm(`Delete "${itemName}"?`)) {
      setDeletingId(itemId);
      const result = await deleteItem(itemId);
      setDeletingId(null);
      
      if (result?.success) {
        alert('Item deleted successfully');
      } else {
        alert(result?.error || 'Error deleting item');
      }
    }
  }, [deleteItem]);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        /* ── Stat cards ── */
        .is-stat {
          background: white; border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.05);
          transition: transform .2s, box-shadow .2s;
          position: relative; overflow: hidden;
        }
        .is-stat::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 3px; border-radius: 18px 18px 0 0;
        }
        .is-stat.amber::before   { background: linear-gradient(90deg,#d97706,#fbbf24); }
        .is-stat.violet::before  { background: linear-gradient(90deg,#8b5cf6,#a78bfa); }
        .is-stat.emerald::before { background: linear-gradient(90deg,#059669,#34d399); }
        .is-stat:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,.07), 0 12px 28px rgba(0,0,0,.1); }

        /* ── Item card ── */
        .is-card {
          background: white; border-radius: 16px; overflow: hidden;
          border: 1.5px solid #f1f5f9;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          transition: all .22s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        .is-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(99,102,241,.12), 0 2px 8px rgba(0,0,0,.07);
          border-color: #e0e3ff;
        }

        /* ── Image area ── */
        .is-img-area {
          height: 190px; overflow: hidden;
          background: #f8fafc;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }

        /* ── Card action buttons ── */
        .is-card-btn {
          flex: 1; border: none; border-radius: 9px;
          padding: .5rem; cursor: pointer; font-family: inherit;
          font-size: .8125rem; font-weight: 600;
          display: flex; align-items: center; justify-content: center; gap: .4rem;
          transition: all .15s;
        }
        .is-card-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(.93); }
        .is-card-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .is-card-btn.edit { background: #eff1ff; color: #6366f1; }
        .is-card-btn.del  { background: #fff1f1; color: #dc2626; }

        /* ── Search ── */
        .is-search {
          background: white; border: 1.5px solid #e2e8f0; border-radius: 12px;
          color: #1f2937; padding: .65rem 1rem .65rem 2.6rem;
          font-size: .875rem; font-family: inherit; outline: none;
          flex: 1; transition: border-color .2s, box-shadow .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .is-search:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
        .is-search::placeholder { color: #94a3b8; }

        /* ── Sort select ── */
        .is-sort {
          background: white; border: 1.5px solid #e2e8f0; border-radius: 12px;
          color: #374151; padding: .65rem 1rem; font-size: .875rem;
          font-family: inherit; outline: none; cursor: pointer;
          transition: border-color .2s; min-width: 170px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .is-sort:focus { border-color: #6366f1; }

        /* ── Primary button ── */
        .is-primary-btn {
          background: linear-gradient(135deg,#6366f1,#8b5cf6);
          color: white; border: none; border-radius: 12px;
          padding: .7rem 1.4rem; font-size: .875rem; font-weight: 700;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          box-shadow: 0 4px 14px rgba(99,102,241,.35); transition: all .2s;
        }
        .is-primary-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,.5); }
        .is-primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Secondary button ── */
        .is-secondary-btn {
          background: white; color: #475569;
          border: 1.5px solid #e2e8f0; border-radius: 12px;
          padding: .7rem 1.4rem; font-size: .875rem; font-weight: 600;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem; transition: all .2s;
        }
        .is-secondary-btn:hover { border-color: #cbd5e1; background: #f8fafc; transform: translateY(-1px); }

        /* ── Modal ── */
        .is-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,.45);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 1rem;
        }
        .is-modal {
          background: white; border-radius: 20px;
          width: 100%; max-width: 500px; max-height: 92vh; overflow-y: auto;
          box-shadow: 0 24px 60px rgba(0,0,0,.18);
          animation: modalIn .22s cubic-bezier(.4,0,.2,1) both;
        }
        @keyframes modalIn {
          from { opacity:0; transform:scale(.97) translateY(8px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }

        /* ── Form field ── */
        .is-field {
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 10px; padding: .7rem .9rem;
          font-size: .875rem; font-family: inherit; color: #1f2937;
          width: 100%; outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .is-field:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); background: white; }
        .is-field::placeholder { color: #94a3b8; }

        /* ── Drop zone ── */
        .is-dropzone {
          border: 2px dashed #e2e8f0; border-radius: 12px;
          padding: 1.5rem; text-align: center; cursor: pointer;
          transition: all .2s; background: #f8fafc;
        }
        .is-dropzone:hover, .is-dropzone.over { border-color: #6366f1; background: #f5f3ff; }

        /* ── Submit/cancel ── */
        .is-submit-btn {
          background: linear-gradient(135deg,#6366f1,#8b5cf6);
          color: white; border: none; border-radius: 10px;
          padding: .75rem 1.5rem; font-size: .875rem; font-weight: 700;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem;
          box-shadow: 0 4px 12px rgba(99,102,241,.35); transition: all .2s;
        }
        .is-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99,102,241,.45); }
        .is-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .is-cancel-btn {
          background: #f1f5f9; color: #64748b; border: none; border-radius: 10px;
          padding: .75rem 1.5rem; font-size: .875rem; font-weight: 600;
          font-family: inherit; cursor: pointer;
          display: flex; align-items: center; gap: .5rem; transition: background .15s;
        }
        .is-cancel-btn:hover:not(:disabled) { background: #e2e8f0; }
        .is-cancel-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Animations ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .fa1{animation:fadeUp .35s ease both}
        .fa2{animation:fadeUp .35s .07s ease both}
        .fa3{animation:fadeUp .35s .14s ease both}
        .fa4{animation:fadeUp .35s .21s ease both}

        /* ── Price badge ── */
        .is-price-badge {
          position: absolute; top: 12px; right: 12px;
          background: white; color: #059669;
          border: 1.5px solid #bbf7d0;
          border-radius: 999px; padding: .25rem .7rem;
          font-size: .78rem; font-weight: 700; font-family: monospace;
          box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Page header ── */}
        <div className="fa1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <p style={{ margin: '0 0 .35rem', color: '#94a3b8', fontSize: '.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Product Catalogue
            </p>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-.03em' }}>
              Items
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button 
              className="is-primary-btn" 
              onClick={() => handleOpenModal()}
              disabled={isAddingItem}
            >
              <Plus size={17} /> Add Item
            </button>
            <button className="is-secondary-btn" onClick={onBack}>
              <ArrowLeft size={17} /> Back
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="fa2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          {[
            { cls: 'amber',   label: 'Total Items',    value: items.length,                                                                       iconBg: '#fffbeb', iconColor: '#d97706', Icon: Package },
            { cls: 'violet',  label: 'Showing',        value: filtered.length,                                                                    iconBg: '#f5f3ff', iconColor: '#8b5cf6', Icon: Search  },
            { cls: 'emerald', label: 'Avg. Price (AED)',value: `${avgPrice.toLocaleString('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2})}`, iconBg: '#ecfdf5', iconColor: '#059669', Icon: Tag, small: true },
          ].map(({ cls, label, value, iconBg, iconColor, Icon, small }) => (
            <div key={label} className={`is-stat ${cls}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ background: iconBg, borderRadius: '10px', padding: '.5rem', display: 'flex', color: iconColor }}>
                  <Icon size={20} />
                </div>
              </div>
              <p style={{ margin: '0 0 .25rem', color: '#94a3b8', fontSize: '.72rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
              <p style={{ margin: 0, color: '#0f172a', fontSize: small ? '1.2rem' : '1.8rem', fontWeight: '800', letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Search & Sort bar ── */}
        <div className="fa3" style={{ display: 'flex', gap: '.75rem', marginBottom: '1.75rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              className="is-search"
              type="text"
              placeholder="Search by name or description…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="is-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort: Name A–Z</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="date">Date Added</option>
          </select>
        </div>

        {/* ── Items grid ── */}
        <div className="fa4">
          {filtered.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 20px rgba(0,0,0,.05)', padding: '4rem', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <Package size={28} style={{ color: '#cbd5e1' }} />
              </div>
              <p style={{ color: '#475569', margin: 0, fontWeight: '600' }}>
                {searchTerm ? `No results for "${searchTerm}"` : 'No items yet'}
              </p>
              <p style={{ color: '#94a3b8', margin: '.4rem 0 1.5rem', fontSize: '.875rem' }}>
                {searchTerm ? 'Try a different keyword.' : 'Add your first item to build your catalogue.'}
              </p>
              {!searchTerm && (
                <button className="is-primary-btn" style={{ margin: '0 auto' }} onClick={() => handleOpenModal()}>
                  <Plus size={16} /> Add First Item
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {filtered.map((item) => {
                const isItemDeleting = deletingId === item._id; // Use local state instead of hook
                
                return (
                  <div key={item._id} className="is-card">

                    {/* Image */}
                    <div className="is-img-area">
                      {item.imagePath ? (
                        <img
                          src={`http://13.232.90.158:5000${item.imagePath}`}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .3s' }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#cbd5e1', gap: '.5rem' }}>
                          <div style={{ width: 52, height: 52, borderRadius: '14px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ImageIcon size={24} style={{ color: '#94a3b8' }} />
                          </div>
                          <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>No image</span>
                        </div>
                      )}
                      {/* Price badge overlaid */}
                      <div className="is-price-badge">
                        AED {parseFloat(item.price).toFixed(2)}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '1.1rem 1.1rem .9rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ margin: '0 0 .4rem', fontSize: '.9375rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.3 }}>
                        {item.name}
                      </h3>
                      {item.description ? (
                        <p style={{ margin: '0 0 .75rem', color: '#64748b', fontSize: '.8125rem', lineHeight: 1.5, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description}
                        </p>
                      ) : (
                        <p style={{ margin: '0 0 .75rem', color: '#cbd5e1', fontSize: '.8125rem', fontStyle: 'italic', flex: 1 }}>No description</p>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '.5rem', paddingTop: '.75rem', borderTop: '1px solid #f1f5f9' }}>
                        <button 
                          className="is-card-btn edit" 
                          onClick={() => handleOpenModal(item)}
                          disabled={isItemDeleting || isSubmitting}
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                        <button 
                          className="is-card-btn del" 
                          onClick={() => handleDelete(item._id, item.name)}
                          disabled={isItemDeleting || isSubmitting}
                        >
                          {isItemDeleting ? <><Trash2 size={14} /> Deleting...</> : <><Trash2 size={14} /> Delete</>}
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="is-overlay" onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) closeModal(); }}>
          <div className="is-modal">

            {/* Modal header */}
            <div style={{ padding: '1.5rem 1.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-.02em' }}>
                  {editingId ? 'Edit Item' : 'Add New Item'}
                </h2>
                <p style={{ margin: '.2rem 0 0', color: '#94a3b8', fontSize: '.8rem' }}>
                  {editingId ? 'Update the item details below.' : 'Fill in the details to add to your catalogue.'}
                </p>
              </div>
              <button 
                onClick={closeModal} 
                disabled={isSubmitting}
                style={{ background: '#f1f5f9', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, transition: 'background .15s', opacity: isSubmitting ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseLeave={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#f1f5f9'; }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem 1.5rem' }}>

              {/* Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <Package size={14} style={{ color: '#6366f1' }} /> Item Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input 
                  className="is-field" 
                  type="text" 
                  name="name" 
                  placeholder="e.g. Industrial Bearing 6205" 
                  value={formData.name} 
                  onChange={handleChange} 
                  required 
                  disabled={isSubmitting}
                />
              </div>

              {/* Price */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <Tag size={14} style={{ color: '#6366f1' }} /> Price (AED) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input 
                  className="is-field" 
                  type="number" 
                  name="price" 
                  placeholder="0.00" 
                  value={formData.price} 
                  onChange={handleChange} 
                  required 
                  min="0" 
                  step="0.01"
                  disabled={isSubmitting}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  Description
                  <span style={{ color: '#94a3b8', fontWeight: '400', marginLeft: '.25rem' }}>(optional)</span>
                </label>
                <textarea 
                  className="is-field" 
                  name="description" 
                  placeholder="Describe the item, specs, usage…" 
                  value={formData.description} 
                  onChange={handleChange} 
                  rows={3} 
                  style={{ resize: 'vertical', minHeight: '80px' }}
                  disabled={isSubmitting}
                />
              </div>

              {/* Image upload */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  <ImageIcon size={14} style={{ color: '#6366f1' }} /> Item Image
                  <span style={{ color: '#94a3b8', fontWeight: '400', marginLeft: '.25rem' }}>(optional)</span>
                </label>

                <input 
                  type="file" 
                  accept="image/*" 
                  id="is-img-input" 
                  style={{ display: 'none' }} 
                  onChange={(e) => handleImageChange(e.target.files[0])}
                  disabled={isSubmitting}
                />

                {imagePreview ? (
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #e2e8f0' }}>
                    <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />
                    <button
                      type="button"
                      onClick={() => { setImagePreview(null); setFormData(prev => ({ ...prev, image: null })); }}
                      disabled={isSubmitting}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(239,68,68,.9)', color: 'white', border: 'none', borderRadius: '8px', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1 }}
                    >
                      <X size={14} />
                    </button>
                    <label htmlFor="is-img-input" style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(255,255,255,.9)', color: '#6366f1', border: '1.5px solid #e0e3ff', borderRadius: '8px', padding: '.3rem .7rem', fontSize: '.75rem', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1 }}>
                      Change
                    </label>
                  </div>
                ) : (
                  <label
                    htmlFor="is-img-input"
                    className={`is-dropzone${dragOver ? ' over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleImageChange(e.dataTransfer.files[0]); }}
                    style={{ cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1 }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#eff1ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto .75rem', color: '#6366f1' }}>
                      <Upload size={20} />
                    </div>
                    <p style={{ margin: 0, color: '#475569', fontSize: '.875rem', fontWeight: '600' }}>Click to upload or drag & drop</p>
                    <p style={{ margin: '.25rem 0 0', color: '#94a3b8', fontSize: '.75rem' }}>JPG, PNG, WEBP up to 5MB</p>
                  </label>
                )}
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                <button 
                  type="button" 
                  className="is-cancel-btn" 
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  <X size={16} /> Cancel
                </button>
                <button 
                  type="submit" 
                  className="is-submit-btn"
                  disabled={isSubmitting}
                >
                  <Save size={16} /> 
                  {isSubmitting ? 'Saving...' : (editingId ? 'Update Item' : 'Add Item')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}