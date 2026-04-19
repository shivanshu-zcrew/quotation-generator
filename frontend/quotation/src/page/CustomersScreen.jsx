// screens/CustomersScreen.jsx (Updated to use useCustomerStore)
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw, AlertCircle, ChevronDown, 
  CheckCircle, Users, Building2, Tag, User, X, Save, Globe, DollarSign, 
  Mail, Phone, MapPin, Shield, ChevronLeft, ChevronRight, Download, Upload, Clock 
} from 'lucide-react';
import { useCustomers, usePaginatedCustomers, useCustomerSearch, useCustomerStats, useZohoSync } from '../hooks/customerHooks';
import { customerAPI } from '../services/api';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';

const PRIMARY_COLOR = '#0f172a';

// Toast Component (keep as is)
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, animation: 'slideInRight 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', padding: '14px 20px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{message}</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '4px', cursor: 'pointer' }}><X size={14} /></button>
      </div>
    </div>
  );
};

// StatCard Component (keep as is)
const StatCard = ({ label, value, icon: Icon, color, subtitle }) => (
  <div style={{ background: 'white', borderRadius: '20px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'transform 0.2s, box-shadow 0.2s' }} 
       onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.1)'; }} 
       onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color={color} />
      </div>
    </div>
    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
    <p style={{ margin: '0.25rem 0 0', color: PRIMARY_COLOR, fontSize: '1.75rem', fontWeight: '800' }}>{value}</p>
    {subtitle && <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.7rem' }}>{subtitle}</p>}
  </div>
);

// PaginationControls Component (keep as is)
const PaginationControls = ({ pagination, onPageChange, loading }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
  const pageButtons = [];
  
  pageButtons.push(
    <button key="prev" onClick={() => onPageChange(page - 1)} disabled={page === 1 || loading} 
            style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: page === 1 || loading ? 'not-allowed' : 'pointer', opacity: page === 1 || loading ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ChevronLeft size={16} />
    </button>
  );
  
  for (let i = startPage; i <= endPage; i++) {
    pageButtons.push(
      <button key={i} onClick={() => onPageChange(i)} disabled={loading} 
              style={{ minWidth: '36px', height: '36px', borderRadius: '10px', border: i === page ? 'none' : '1px solid #e2e8f0', background: i === page ? PRIMARY_COLOR : 'white', color: i === page ? 'white' : '#475569', fontWeight: i === page ? '600' : '500', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
        {i}
      </button>
    );
  }
  
  pageButtons.push(
    <button key="next" onClick={() => onPageChange(page + 1)} disabled={page === totalPages || loading} 
            style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: page === totalPages || loading ? 'not-allowed' : 'pointer', opacity: page === totalPages || loading ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ChevronRight size={16} />
    </button>
  );
  
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}>{pageButtons}</div>;
};

// CustomerCard Component (keep as is, but ensure tax badge works)
const CustomerCard = ({ customer, onEdit, onDelete, deletingId }) => {
  const getTaxBadge = (treatment) => {
    const isVatRegistered = treatment === 'vat_registered' || treatment === 'gcc_vat_registered';
    if (isVatRegistered) {
      return { background: '#d1fae5', color: '#065f46', label: 'VAT Registered' };
    }
    return { background: '#f1f5f9', color: '#475569', label: 'Non-VAT Registered' };
  };
  const taxBadge = getTaxBadge(customer.taxTreatment);
  
  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: '20px', overflow: 'hidden', transition: 'all 0.3s ease', background: 'white' }} 
         onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 25px -12px rgba(0,0,0,0.15)'; }} 
         onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${PRIMARY_COLOR}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color={PRIMARY_COLOR} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => onEdit(customer)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => onDelete(customer)} disabled={deletingId === customer._id} 
                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: deletingId === customer._id ? 'not-allowed' : 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
        <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1rem', fontWeight: '700', color: PRIMARY_COLOR }}>{customer.name}</h3>
        <p style={{ margin: '0 0 0.25rem', color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Mail size={10} /> {customer.email}
        </p>
        {customer.phone && (
          <p style={{ margin: '0 0 0.5rem', color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Phone size={10} /> {customer.phone}
          </p>
        )}
        {customer.zohoId && (
          <p style={{ margin: '0 0 0.5rem', color: '#8b5cf6', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Shield size={10} /> Zoho ID: {customer.zohoId}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: '600', background: taxBadge.background, color: taxBadge.color }}>
            {taxBadge.label}
          </span>
          {customer.placeOfSupply && (
            <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: '500', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={10} /> {customer.placeOfSupply}
            </span>
          )}
          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: '500', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DollarSign size={10} /> {customer.defaultCurrency?.code || customer.defaultCurrency || 'AED'}
          </span>
        </div>
      </div>
    </div>
  );
};

// CustomerModal Component (keep as is)
const CustomerModal = ({ isOpen, onClose, onSubmit, initialData = null, isSubmitting }) => {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', companyName: '', website: '', notes: '',
    taxTreatment: 'non_vat_registered', taxRegistrationNumber: '', placeOfSupply: 'Dubai', defaultCurrency: 'AED'
  });
  const [errors, setErrors] = useState({});
  const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
  const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '', email: initialData.email || '', phone: initialData.phone || '',
        address: initialData.address || '', companyName: initialData.companyName || '',
        website: initialData.website || '', notes: initialData.notes || '',
        taxTreatment: initialData.taxTreatment || 'non_vat_registered',
        taxRegistrationNumber: initialData.taxRegistrationNumber || '',
        placeOfSupply: initialData.placeOfSupply || 'Dubai',
        defaultCurrency: initialData.defaultCurrency?.code || initialData.defaultCurrency || 'AED'
      });
    } else {
      setFormData({
        name: '', email: '', phone: '', address: '', companyName: '', website: '', notes: '',
        taxTreatment: 'non_vat_registered', taxRegistrationNumber: '', placeOfSupply: 'Dubai', defaultCurrency: 'AED'
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'taxRegistrationNumber') {
      const cleaned = value.replace(/[^0-9]/g, '').slice(0, 15);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
    } else if (name === 'taxTreatment') {
      const defaultPlace = (value === 'vat_registered' || value === 'non_vat_registered') ? 'Dubai' : 'Saudi Arabia';
      setFormData(prev => ({ ...prev, [name]: value, taxRegistrationNumber: '', placeOfSupply: defaultPlace }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Customer name is required';
    if (!formData.email.trim()) newErrors.email = 'Email address is required';
    else if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(formData.email)) newErrors.email = 'Enter a valid email address';
    if (formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'gcc_vat_registered') {
      if (!formData.taxRegistrationNumber.trim()) newErrors.taxRegistrationNumber = 'TRN is required';
      else if (!/^\d{15}$/.test(formData.taxRegistrationNumber.trim())) newErrors.taxRegistrationNumber = 'TRN must be 15 digits';
    }
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    onSubmit(formData);
  };

  if (!isOpen) return null;
  const isVatRegistered = formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'gcc_vat_registered';
  const showUaeEmirates = formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'non_vat_registered';
  const placeOfSupplyOptions = showUaeEmirates ? UAE_EMIRATES : GCC_COUNTRIES;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', overflowY: 'auto' }} 
         onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '28px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: PRIMARY_COLOR }}>{initialData ? 'Edit Customer' : 'Add New Customer'}</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8rem' }}>{initialData ? 'Update customer information' : 'Enter customer details'}</p>
            </div>
            <button onClick={onClose} disabled={isSubmitting} style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color="#64748b" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          {/* Form fields - same as before */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Customer Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="name" placeholder="Enter customer name" value={formData.name} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: `1.5px solid ${errors.name ? '#ef4444' : '#e2e8f0'}`, borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
              {errors.name && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</p>}
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="email" name="email" placeholder="customer@example.com" value={formData.email} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: `1.5px solid ${errors.email ? '#ef4444' : '#e2e8f0'}`, borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
              {errors.email && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.email}</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Phone Number</label>
              <input type="text" name="phone" placeholder="+971 50 123 4567" value={formData.phone} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Address</label>
              <input type="text" name="address" placeholder="Dubai, UAE" value={formData.address} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.75rem', fontSize: '0.8rem' }}>Tax Treatment <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {[
                { value: 'vat_registered', label: 'VAT Registered', desc: 'UAE VAT registered' },
                { value: 'non_vat_registered', label: 'Non-VAT Registered', desc: 'UAE non-VAT registered' },
                { value: 'gcc_vat_registered', label: 'GCC VAT Registered', desc: 'GCC country VAT registered' },
                { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT', desc: 'GCC country non-VAT' }
              ].map(treatment => (
                <div key={treatment.value} onClick={() => setFormData(prev => ({ ...prev, taxTreatment: treatment.value, taxRegistrationNumber: '' }))} 
                     style={{ padding: '0.75rem', borderRadius: '14px', border: `2px solid ${formData.taxTreatment === treatment.value ? PRIMARY_COLOR : '#e2e8f0'}`, background: formData.taxTreatment === treatment.value ? `${PRIMARY_COLOR}10` : 'white', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.75rem', color: formData.taxTreatment === treatment.value ? PRIMARY_COLOR : '#0f172a' }}>{treatment.label}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.25rem' }}>{treatment.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {isVatRegistered && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#0c4a6e', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Tax Registration Number (TRN) <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="taxRegistrationNumber" placeholder="123456789012345" value={formData.taxRegistrationNumber} onChange={handleChange} disabled={isSubmitting} maxLength={15} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: `1.5px solid ${errors.taxRegistrationNumber ? '#ef4444' : '#bae6fd'}`, borderRadius: '14px', fontSize: '0.875rem', fontFamily: 'monospace', outline: 'none' }} />
              {errors.taxRegistrationNumber && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.taxRegistrationNumber}</p>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>{showUaeEmirates ? 'UAE Emirate' : 'GCC Country'} <span style={{ color: '#ef4444' }}>*</span></label>
              <select name="placeOfSupply" value={formData.placeOfSupply} onChange={handleChange} disabled={isSubmitting} 
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', background: 'white', cursor: 'pointer' }}>
                <option value="">Select</option>
                {placeOfSupplyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Default Currency <span style={{ color: '#ef4444' }}>*</span></label>
              <select name="defaultCurrency" value={formData.defaultCurrency} onChange={handleChange} disabled={isSubmitting} 
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', background: 'white', cursor: 'pointer' }}>
                <option value="AED">AED - UAE Dirham</option>
                <option value="SAR">SAR - Saudi Riyal</option>
                <option value="KWD">KWD - Kuwaiti Dinar</option>
                <option value="QAR">QAR - Qatari Riyal</option>
                <option value="BHD">BHD - Bahraini Dinar</option>
                <option value="OMR">OMR - Omani Rial</option>
                <option value="USD">USD - US Dollar</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Company Name</label>
              <input type="text" name="companyName" placeholder="Company name (optional)" value={formData.companyName} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Website</label>
              <input type="text" name="website" placeholder="https://example.com" value={formData.website} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Notes</label>
            <textarea rows={3} name="notes" placeholder="Additional notes..." value={formData.notes} onChange={handleChange} disabled={isSubmitting} 
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting} 
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '14px', background: '#f1f5f9', color: '#64748b', border: 'none', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} 
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '14px', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Save size={16} /> {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main CustomersScreen Component
export default function CustomersScreen({ onBack, companyId: propCompanyId }) {
  // Use the updated hooks from customHooks.js
  const { selectedCompany: contextCompanyId } = useCompanyCurrency();
  const effectiveCompanyId = propCompanyId || contextCompanyId;

  const pagination = usePaginatedCustomers(1, effectiveCompanyId);
  const stats = useCustomerStats(effectiveCompanyId);
    const search = useCustomerSearch();
   const { syncCustomers, syncing: isSyncing, error: syncError, getSyncStatus } = useZohoSync();
  
  const [mode, setMode] = useState('browse');
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncType, setSyncType] = useState(null);
  const [viewMode, setViewMode] = useState('card');
  const [showSyncOptions, setShowSyncOptions] = useState(false);

  const currentCustomers = mode === 'search' ? search.customers : pagination.customers;
  const currentLoading = mode === 'search' ? search.loading : pagination.loading;
  const currentError = mode === 'search' ? search.error : pagination.error;
  const currentPagination = mode === 'browse' ? pagination.pagination : null;

  const safePageInfo = useMemo(() => {
    if (!currentPagination) return { page: 1, totalPages: 1, totalItems: 0 };
    return { page: currentPagination.page || 1, totalPages: currentPagination.totalPages || 1, totalItems: currentPagination.totalItems || 0 };
  }, [currentPagination]);

const handleSearch = useCallback((value) => { 
  if (!value?.trim()) { 
    search.clearSearch(); 
    setMode('browse'); 
  } else { 
    search.search(value, effectiveCompanyId);  
    setMode('search'); 
  } 
}, [search, effectiveCompanyId]);
  
  const handlePageChange = useCallback((newPage) => { 
    if (newPage >= 1 && newPage <= safePageInfo.totalPages) pagination.setPage(newPage); 
  }, [pagination, safePageInfo.totalPages]);
  
  const handleLimitChange = useCallback((newLimit) => pagination.setLimit(parseInt(newLimit, 10)), [pagination]);
  
  const handleOpenModal = useCallback((customer = null) => { 
    setEditingCustomer(customer); 
    setShowModal(true); 
  }, []);
  
  const handleCloseModal = useCallback(() => { 
    setShowModal(false); 
    setEditingCustomer(null); 
    setIsSubmitting(false); 
  }, []);

  const handleSubmit = useCallback(async (formData) => {
    setIsSubmitting(true);
    try {
      const response = editingCustomer 
        ? await customerAPI.update(editingCustomer._id, formData) 
        : await customerAPI.create(formData);
      if (response.data?.success) {
        handleCloseModal();
        setToast({ message: editingCustomer ? 'Customer updated successfully' : 'Customer added successfully', type: 'success' });
        pagination.refetch();
        stats.refetch();
      } else {
        setToast({ message: response.data?.error || 'Error saving customer', type: 'error' });
      }
    } catch (error) { 
      setToast({ message: error.response?.data?.message || 'Error saving customer', type: 'error' }); 
    } finally { 
      setIsSubmitting(false); 
    }
  }, [editingCustomer, pagination, stats, handleCloseModal]);

  const handleDelete = useCallback(async (customer) => {
    if (!window.confirm(`Delete "${customer.name}"? This action cannot be undone.`)) return;
    setDeletingId(customer._id);
    try {
      const response = await customerAPI.delete(customer._id);
      if (response.data?.success) { 
        setToast({ message: 'Customer deleted successfully', type: 'success' }); 
        pagination.refetch(); 
        stats.refetch();
      } else { 
        setToast({ message: 'Error deleting customer', type: 'error' }); 
      }
    } catch (error) { 
      setToast({ message: error.response?.data?.message || 'Error deleting customer', type: 'error' }); 
    } finally { 
      setDeletingId(null); 
    }
  }, [pagination, stats]);

  const handleSync = useCallback(async (fullSync = false) => {
    setSyncType(fullSync ? 'full' : 'incremental');
    setToast({ 
      message: fullSync ? '🔄 Performing full sync from Zoho...' : '🔄 Performing incremental sync from Zoho...', 
      type: 'info' 
    });
    
    try {
      const result = await syncCustomers(fullSync, effectiveCompanyId);
      
      if (result.success) {
        const statsData = result.stats || {};
        setToast({ 
          message: `✅ Sync complete! ${statsData.created || 0} new, ${statsData.updated || 0} updated`, 
          type: 'success' 
        });
        
        // Refresh pagination data
        if (pagination && typeof pagination.refetch === 'function') {
          await pagination.refetch();
        }
        
        // Refresh stats - try multiple approaches
        if (stats) {
          if (typeof stats.refetch === 'function') {
            await stats.refetch();
          } else if (typeof stats.fetchStats === 'function') {
            await stats.fetchStats();
          } else {
            // Manual refresh
            const response = await customerAPI.getStats();
            if (response.data.success && typeof stats.setData === 'function') {
              stats.setData(response.data.stats);
            }
          }
        }
        
      } else {
        setToast({ message: `❌ ${result.error || 'Sync failed'}`, type: 'error' });
      }
      
    } catch (error) { 
      console.error('Sync error:', error);
      setToast({ message: `❌ ${error.message || 'Error syncing customers'}`, type: 'error' });
    } finally { 
      setSyncType(null);
      setShowSyncOptions(false);
    }
  },  [syncCustomers, pagination, stats, effectiveCompanyId]);  

  const handleGetSyncStatus = useCallback(async () => {
    try {
      const result = await getSyncStatus();
      if (result.success) {
        const status = result.data;
        setToast({ 
          message: `Sync Status - Total: ${status?.total || 0}, Synced: ${status?.synced || 0}, Pending: ${status?.pendingSync || 0}`,
          type: 'info' 
        });
      } else {
        setToast({ message: 'Failed to get sync status', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Failed to get sync status', type: 'error' });
    }
  }, [getSyncStatus]);

  // Add animation styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } 
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4ff 0%, #e8edf5 100%)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Customers</h1>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>Manage your customer relationships and tax information</p>
          </div>
          <div style={{ display: 'flex', gap: '.75rem', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowSyncOptions(!showSyncOptions)} 
                disabled={isSyncing} 
                style={{ 
                  background: isSyncing ? '#9ca3af' : `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
                  border: 'none', borderRadius: '14px', padding: '.7rem 1.4rem', 
                  cursor: isSyncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '.5rem', 
                  color: 'white', fontWeight: '600', fontSize: '0.8rem', 
                  boxShadow: isSyncing ? 'none' : `0 4px 12px ${PRIMARY_COLOR}30` 
                }}
              >
                {isSyncing ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
                {isSyncing ? (syncType === 'full' ? 'Full Sync...' : 'Incremental Sync...') : 'Sync from Zoho'}
                <ChevronDown size={14} />
              </button>
              
              {showSyncOptions && !isSyncing && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
                  background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0', zIndex: 10, minWidth: '200px', overflow: 'hidden'
                }}>
                  <button onClick={() => handleSync(true)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                    <RefreshCw size={14} /> Full Sync (All Customers)
                  </button>
                  <div style={{ height: '1px', background: '#e2e8f0', margin: '0.25rem 0' }} />
                  <button onClick={handleGetSyncStatus} style={{ width: '100%', padding: '0.75rem 1rem', background: 'white', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                    <Clock size={14} /> Check Sync Status
                  </button>
                </div>
              )}
            </div>
            <button onClick={onBack} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '.7rem 1.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: '500', fontSize: '0.8rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {!stats.loading && stats.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <StatCard label="Total Customers" value={stats.data.totalCustomers || 0} icon={Users} color="#6366f1" />
            <StatCard label="VAT Registered" value={stats.data.vatRegistered || 0} icon={Building2} color="#10b981" />
            <StatCard label="Non-VAT Registered" value={stats.data.nonVatRegistered || 0} icon={Tag} color="#f59e0b" />
            <StatCard label="Active Customers" value={stats.data.activeCustomers || 0} icon={User} color="#8b5cf6" />
          </div>
        )}

        {/* Main Content Card */}
        <div style={{ background: 'white', borderRadius: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" placeholder="Search customers by name, email, or phone..." 
                       onChange={(e) => handleSearch(e.target.value)} 
                       style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} 
                       onFocus={(e) => e.currentTarget.style.borderColor = PRIMARY_COLOR} 
                       onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'} />
              </div>
              {mode === 'browse' && (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '12px' }}>
                    <button onClick={() => setViewMode('card')} style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: viewMode === 'card' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      Cards
                    </button>
                    <button onClick={() => setViewMode('table')} style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: viewMode === 'table' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      Table
                    </button>
                  </div>
                  <select value={pagination.filters.limit} onChange={(e) => handleLimitChange(e.target.value)} 
                          style={{ padding: '0.65rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.8rem', background: 'white', cursor: 'pointer' }}>
                    <option value="10">10/page</option>
                    <option value="25">25/page</option>
                    <option value="50">50/page</option>
                    <option value="100">100/page</option>
                  </select>
                </>
              )}
              <button onClick={() => handleOpenModal()} style={{ background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', padding: '0.7rem 1.4rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={16} /> Add Customer
              </button>
            </div>
          </div>

          {/* Content Area */}
          {currentLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <div style={{ width: '48px', height: '48px', border: `3px solid #e2e8f0`, borderTopColor: PRIMARY_COLOR, borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#64748b' }}>Loading customers...</p>
            </div>
          ) : currentError ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <AlertCircle size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
              <p style={{ color: '#dc2626' }}>Error: {currentError}</p>
            </div>
          ) : !currentCustomers?.length ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <Users size={64} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
              <p style={{ color: '#64748b', fontWeight: '500' }}>{search.query ? `No customers match "${search.query}"` : 'No customers found'}</p>
              {!search.query && (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button onClick={() => handleSync(false)} style={{ padding: '0.75rem 1.5rem', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RefreshCw size={16} /> Sync from Zoho
                  </button>
                  <button onClick={() => handleOpenModal()} style={{ padding: '0.75rem 1.5rem', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={16} /> Add Customer
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'card' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem', padding: '1.5rem' }}>
              {currentCustomers.map((customer) => (
                <CustomerCard key={customer._id} customer={customer} onEdit={handleOpenModal} onDelete={handleDelete} deletingId={deletingId} />
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Customer</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Email</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Phone</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Tax Status</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Place of Supply</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Currency</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCustomers.map((customer) => {
                    const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
                    return (
                      <tr key={customer._id} style={{ borderBottom: '1px solid #f1f5f9' }} 
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} 
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: '600', color: PRIMARY_COLOR }}>{customer.name}</div>
                          {customer.companyName && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{customer.companyName}</div>}
                        </td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.email}</td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.phone || '—'}</td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '600', 
                                        background: isVatRegistered ? '#d1fae5' : '#f1f5f9', color: isVatRegistered ? '#065f46' : '#475569' }}>
                            {isVatRegistered ? 'VAT Registered' : 'Non-VAT'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.placeOfSupply || '—'}</td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.defaultCurrency?.code || customer.defaultCurrency || 'AED'}</td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleOpenModal(customer)} style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.7rem' }}>
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => handleDelete(customer)} disabled={deletingId === customer._id} 
                                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: deletingId === customer._id ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {mode === 'browse' && currentPagination && currentPagination.totalPages > 1 && (
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', background: '#fafbff' }}>
              <PaginationControls pagination={safePageInfo} onPageChange={handlePageChange} loading={currentLoading} />
            </div>
          )}
        </div>
      </div>
      
      <CustomerModal isOpen={showModal} onClose={handleCloseModal} onSubmit={handleSubmit} initialData={editingCustomer} isSubmitting={isSubmitting} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}