import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle, Users, Mail, Phone, MapPin, User, X, Save, Building2, Tag, Globe, DollarSign } from 'lucide-react';
import { usePaginatedCustomers, useCustomerSearch, useCustomerStats, useCustomers } from '../hooks/customerHooks';
import { customerAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────
// Toast Notification Component
// ─────────────────────────────────────────────────────────────
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: type === 'success' ? '#10b981' : '#ef4444',
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
      {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      <span style={{ fontWeight: '500' }}>{message}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Pagination Controls Component
// ─────────────────────────────────────────────────────────────
const PaginationControls = ({ pagination, onPageChange, loading }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, hasNextPage, hasPreviousPage } = pagination;

  const maxButtons = 5;
  const halfWindow = Math.floor(maxButtons / 2);
  let startPage = Math.max(1, page - halfWindow);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  const pageButtons = [];

  pageButtons.push(
    <button
      key="prev"
      onClick={() => onPageChange(page - 1)}
      disabled={!hasPreviousPage || loading}
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #e2e8f0',
        background: 'white',
        borderRadius: '8px',
        cursor: loading || !hasPreviousPage ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: loading || !hasPreviousPage ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      Previous
    </button>
  );

  for (let i = startPage; i <= endPage; i++) {
    pageButtons.push(
      <button
        key={`page-${i}`}
        onClick={() => onPageChange(i)}
        disabled={loading}
        style={{
          padding: '0.5rem 0.75rem',
          border: i === page ? '1px solid #6366f1' : '1px solid #e2e8f0',
          background: i === page ? '#6366f1' : 'white',
          color: i === page ? 'white' : '#0f172a',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
      >
        {i}
      </button>
    );
  }

  pageButtons.push(
    <button
      key="next"
      onClick={() => onPageChange(page + 1)}
      disabled={!hasNextPage || loading}
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #e2e8f0',
        background: 'white',
        borderRadius: '8px',
        cursor: loading || !hasNextPage ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: loading || !hasNextPage ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      Next
    </button>
  );

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap',
      padding: '1rem',
    }}>
      {pageButtons}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// UAE Emirates List
// ─────────────────────────────────────────────────────────────
const UAE_EMIRATES = [
  'Abu Dhabi',
  'Ajman',
  'Dubai',
  'Fujairah',
  'Ras al-Khaimah',
  'Sharjah',
  'Umm al-Quwain'
];

// ─────────────────────────────────────────────────────────────
// Customer Modal Component - UPDATED WITH ALL TAX TREATMENTS
// ─────────────────────────────────────────────────────────────

const CustomerModal = ({ isOpen, onClose, onSubmit, initialData = null, isSubmitting }) => {
  const { gccCountries, taxTreatments, fetchGccCountries, fetchTaxTreatments } = useCustomers();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    companyName: '',
    website: '',
    notes: '',
    taxTreatment: 'non_vat_registered',
    taxRegistrationNumber: '',
    placeOfSupply: 'Dubai',
    defaultCurrency: 'AED'
  });

  const [errors, setErrors] = useState({});
  const hasFetchedData = useRef(false);

  // UAE Emirates - for VAT registered and non-VAT registered
  const UAE_EMIRATES = [
    'Abu Dhabi',
    'Ajman',
    'Dubai',
    'Fujairah',
    'Ras al-Khaimah',
    'Sharjah',
    'Umm al-Quwain'
  ];

  // GCC Countries - for GCC VAT registered and GCC non-VAT registered
  const GCC_COUNTRIES = [
    'Saudi Arabia',
    'Kuwait',
    'Qatar',
    'Bahrain',
    'Oman'
  ];

  // Default tax treatments (fallback if API fails)
  const [localTaxTreatments, setLocalTaxTreatments] = useState([
    { value: 'vat_registered', label: 'VAT Registered', requiresTrn: true },
    { value: 'non_vat_registered', label: 'Non-VAT Registered', requiresTrn: false },
    { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false }
  ]);
  
  const [localGccCountries, setLocalGccCountries] = useState(GCC_COUNTRIES);

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen && !hasFetchedData.current) {
      hasFetchedData.current = true;
      
      if (!gccCountries?.length) {
        fetchGccCountries();
      } else {
        setLocalGccCountries(gccCountries);
      }
      
      if (!taxTreatments?.length) {
        fetchTaxTreatments();
      } else {
        setLocalTaxTreatments(taxTreatments);
      }
    }
  }, [isOpen, gccCountries, taxTreatments, fetchGccCountries, fetchTaxTreatments]);

  // Update local state when store data arrives
  useEffect(() => {
    if (gccCountries?.length > 0) {
      setLocalGccCountries(gccCountries);
    }
  }, [gccCountries]);

  useEffect(() => {
    if (taxTreatments?.length > 0) {
      setLocalTaxTreatments(taxTreatments);
    }
  }, [taxTreatments]);

  // Reset fetched flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        hasFetchedData.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Initialize form data when editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        companyName: initialData.companyName || '',
        website: initialData.website || '',
        notes: initialData.notes || '',
        taxTreatment: initialData.taxTreatment || 'non_vat_registered',
        taxRegistrationNumber: initialData.taxRegistrationNumber || '',
        placeOfSupply: initialData.placeOfSupply || 'Dubai',
        defaultCurrency: initialData.defaultCurrency?.code || initialData.defaultCurrency || 'AED'
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        companyName: '',
        website: '',
        notes: '',
        taxTreatment: 'non_vat_registered',
        taxRegistrationNumber: '',
        placeOfSupply: 'Dubai',
        defaultCurrency: 'AED'
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  
  const handleChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    if (name === 'taxRegistrationNumber') {
      processedValue = value.replace(/[^0-9]/g, '').slice(0, 15);
    }
    
    if (name === 'taxTreatment') {
      let defaultPlaceOfSupply = '';
      if (value === 'vat_registered' || value === 'non_vat_registered') {
        defaultPlaceOfSupply = 'Dubai'; // Default emirate for VAT and non-VAT registered
      } else {
        defaultPlaceOfSupply = 'Saudi Arabia'; // Default GCC country for GCC types
      }
      
      setFormData(prev => ({ 
        ...prev, 
        [name]: value, 
        taxRegistrationNumber: '',
        placeOfSupply: defaultPlaceOfSupply
      }));
      
      if (errors.taxRegistrationNumber) {
        setErrors(prev => ({ ...prev, taxRegistrationNumber: '' }));
      }
      if (errors.placeOfSupply) {
        setErrors(prev => ({ ...prev, placeOfSupply: '' }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: processedValue }));
    }
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
  
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
  
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
  
    if (formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'gcc_vat_registered') {
      if (!formData.taxRegistrationNumber.trim()) {
        newErrors.taxRegistrationNumber = 'TRN is required for VAT registered customers';
      } else if (!/^\d{15}$/.test(formData.taxRegistrationNumber.trim())) {
        newErrors.taxRegistrationNumber = 'TRN must be exactly 15 digits';
      }
    }
  
    if (!formData.placeOfSupply) {
      newErrors.placeOfSupply = 'Place of supply is required';
    }
  
    if (!formData.defaultCurrency) {
      newErrors.defaultCurrency = 'Currency is required';
    }
  
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Build submission data
    const submitData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      taxTreatment: formData.taxTreatment,
      defaultCurrency: formData.defaultCurrency,
      placeOfSupply: formData.placeOfSupply // Direct value - either emirate or country name
    };
    
    // Add optional fields only if they have values
    if (formData.phone && formData.phone.trim()) {
      submitData.phone = formData.phone.trim();
    }
    if (formData.address && formData.address.trim()) {
      submitData.address = formData.address.trim();
    }
    if (formData.companyName && formData.companyName.trim()) {
      submitData.companyName = formData.companyName.trim();
    }
    if (formData.website && formData.website.trim()) {
      submitData.website = formData.website.trim();
    }
    if (formData.notes && formData.notes.trim()) {
      submitData.notes = formData.notes.trim();
    }
    if (formData.taxRegistrationNumber && formData.taxRegistrationNumber.trim()) {
      submitData.taxRegistrationNumber = formData.taxRegistrationNumber.trim();
    }
    
    console.log('📤 Submitting customer data:', JSON.stringify(submitData, null, 2));
    onSubmit(submitData);
  };

  if (!isOpen) return null;

  const selectedTreatment = localTaxTreatments.find(t => t.value === formData.taxTreatment);
  const isVatRegistered = selectedTreatment?.requiresTrn || false;
  
  // Determine which dropdown to show based on tax treatment
  // For VAT Registered and Non-VAT Registered: Show UAE Emirates
  // For GCC VAT Registered and GCC Non-VAT Registered: Show GCC Countries
  const showUaeEmirates = formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'non_vat_registered';
  const placeOfSupplyOptions = showUaeEmirates ? UAE_EMIRATES : localGccCountries;
  const placeOfSupplyLabel = showUaeEmirates ? 'UAE Emirate' : 'GCC Country';
  const placeOfSupplyPlaceholder = showUaeEmirates ? 'Select Emirate' : 'Select GCC Country';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '2rem',
        width: '100%',
        maxWidth: '650px',
        boxShadow: '0 24px 60px rgba(0,0,0,.18)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
            {initialData ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: '#f1f5f9',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              borderRadius: '10px',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Basic Information */}
          <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
              Basic Information
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                Customer Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${errors.name ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '.7rem .9rem',
                  fontSize: '.875rem',
                  width: '100%',
                  outline: 'none',
                }}
                type="text"
                name="name"
                placeholder="e.g. Acme Industries"
                value={formData.name}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {errors.name && <p style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.name}</p>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                Email Address <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${errors.email ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '.7rem .9rem',
                  fontSize: '.875rem',
                  width: '100%',
                  outline: 'none',
                }}
                type="email"
                name="email"
                placeholder="e.g. contact@acme.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {errors.email && <p style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.email}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  Phone (optional)
                </label>
                <input
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '.7rem .9rem',
                    fontSize: '.875rem',
                    width: '100%',
                    outline: 'none',
                  }}
                  type="text"
                  name="phone"
                  placeholder="+971 50 123 4567"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  Address (optional)
                </label>
                <input
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '.7rem .9rem',
                    fontSize: '.875rem',
                    width: '100%',
                    outline: 'none',
                  }}
                  type="text"
                  name="address"
                  placeholder="Dubai, UAE"
                  value={formData.address}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Tax & Compliance Section */}
          <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
              Tax & Compliance
            </h3>

            {/* Tax Treatment Dropdown */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                Tax Treatment <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${errors.taxTreatment ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '.7rem .9rem',
                  fontSize: '.875rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                name="taxTreatment"
                value={formData.taxTreatment}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                {localTaxTreatments.map(treatment => (
                  <option key={treatment.value} value={treatment.value}>
                    {treatment.label}
                  </option>
                ))}
              </select>
            </div>

            {/* TRN Field - Only for VAT registered types */}
            {isVatRegistered && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                  Tax Registration Number (TRN) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  style={{
                    background: 'white',
                    border: `1.5px solid ${errors.taxRegistrationNumber ? '#ef4444' : '#bfdbfe'}`,
                    borderRadius: '8px',
                    padding: '.7rem .9rem',
                    fontSize: '.875rem',
                    fontFamily: 'monospace',
                    width: '100%',
                    outline: 'none',
                  }}
                  type="text"
                  name="taxRegistrationNumber"
                  placeholder="123456789012345"
                  value={formData.taxRegistrationNumber}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  maxLength={15}
                />
                <p style={{ margin: '.5rem 0 0', color: '#1e40af', fontSize: '.75rem' }}>
                  Enter 15-digit TRN (e.g., 123456789012345)
                </p>
                {errors.taxRegistrationNumber && <p style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.taxRegistrationNumber}</p>}
              </div>
            )}

            {/* Place of Supply - Dynamic dropdown */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                {placeOfSupplyLabel} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${errors.placeOfSupply ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '.7rem .9rem',
                  fontSize: '.875rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                name="placeOfSupply"
                value={formData.placeOfSupply}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <option value="">{placeOfSupplyPlaceholder}</option>
                {placeOfSupplyOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.placeOfSupply && <p style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.placeOfSupply}</p>}
            </div>
          </div>

          {/* Business Settings */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
              Business Settings
            </h3>

            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '.4rem', fontSize: '.8125rem' }}>
                Default Currency <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                style={{
                  background: '#f8fafc',
                  border: `1.5px solid ${errors.defaultCurrency ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: '10px',
                  padding: '.7rem .9rem',
                  fontSize: '.875rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                name="defaultCurrency"
                value={formData.defaultCurrency}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <option value="AED">AED - United Arab Emirates Dirham</option>
                <option value="SAR">SAR - Saudi Riyal</option>
                <option value="KWD">KWD - Kuwaiti Dinar</option>
                <option value="QAR">QAR - Qatari Riyal</option>
                <option value="BHD">BHD - Bahraini Dinar</option>
                <option value="OMR">OMR - Omani Rial</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </select>
              {errors.defaultCurrency && <p style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem' }}>{errors.defaultCurrency}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              style={{
                background: '#f1f5f9',
                color: '#64748b',
                border: 'none',
                borderRadius: '10px',
                padding: '.75rem 1.5rem',
                fontSize: '.875rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1
              }}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '.75rem 1.5rem',
                fontSize: '.875rem',
                fontWeight: '700',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,.35)',
                opacity: isSubmitting ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem'
              }}
              disabled={isSubmitting}
            >
              <Save size={16} />
              {isSubmitting ? 'Saving…' : (initialData ? 'Update' : 'Add Customer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Customers Screen Component - UPDATED
// ─────────────────────────────────────────────────────────────
export default function CustomersScreen({ onBack }) {
  const pagination = usePaginatedCustomers(1);
  const search = useCustomerSearch();
  const stats = useCustomerStats();
  const { taxTreatments, fetchTaxTreatments, gccCountries, fetchGccCountries } = useCustomers();

  const [mode, setMode] = useState('browse');
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTaxFilters, setShowTaxFilters] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load tax data on mount
  useEffect(() => {
    if (!taxTreatments?.length) fetchTaxTreatments();
    if (!gccCountries?.length) fetchGccCountries();
  }, []);

  const currentCustomers = mode === 'search' ? search.customers : pagination.customers;
  const currentLoading = mode === 'search' ? search.loading : pagination.loading;
  const currentError = mode === 'search' ? search.error : pagination.error;
  const currentPagination = mode === 'browse' ? pagination.pagination : null;

  const safePageInfo = useMemo(() => {
    if (!currentPagination) return { page: 1, totalPages: 1, totalItems: 0 };
    return {
      page: currentPagination.page || 1,
      totalPages: currentPagination.totalPages || 1,
      totalItems: currentPagination.totalItems || 0,
      hasNextPage: currentPagination.hasNextPage || false,
      hasPreviousPage: currentPagination.hasPreviousPage || false,
    };
  }, [currentPagination]);

  const handleSearch = useCallback((value) => {
    if (!value || value.trim().length === 0) {
      search.clearSearch();
      setMode('browse');
    } else {
      search.search(value);
      setMode('search');
    }
  }, [search]);

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= safePageInfo.totalPages) {
      pagination.setPage(newPage);
    }
  }, [pagination, safePageInfo.totalPages]);

  const handleLimitChange = useCallback((newLimit) => {
    pagination.setLimit(parseInt(newLimit, 10));
  }, [pagination]);

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
      let result;
      if (editingCustomer) {
        const response = await customerAPI.update(editingCustomer._id, formData);
        result = response.data;
      } else {
        const response = await customerAPI.create(formData);
        result = response.data;
      }

      if (result?.success) {
        handleCloseModal();
        setToast({
          message: editingCustomer ? 'Customer updated successfully' : 'Customer added successfully',
          type: 'success'
        });
        pagination.refetch();
      } else {
        setToast({
          message: result?.error || 'Error saving customer',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setToast({
        message: error.response?.data?.message || 'Error saving customer',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [editingCustomer, pagination, handleCloseModal]);

  const handleDelete = useCallback(async (customer) => {
    if (!window.confirm(`Delete "${customer.name}"?`)) return;

    setDeletingId(customer._id);
    try {
      const response = await customerAPI.delete(customer._id);
      if (response.data?.success) {
        setToast({ message: 'Customer deleted successfully', type: 'success' });
        pagination.refetch();
      } else {
        setToast({ message: 'Error deleting customer', type: 'error' });
      }
    } catch (error) {
      console.error('Delete error:', error);
      setToast({
        message: error.response?.data?.message || 'Error deleting customer',
        type: 'error'
      });
    } finally {
      setDeletingId(null);
    }
  }, [pagination]);

  const handleSyncFromZoho = useCallback(async () => {
    if (!window.confirm('This will fetch all customers from Zoho and update your database. Continue?')) {
      return;
    }
    
    setSyncing(true);
    try {
      const response = await customerAPI.syncFromZoho();
      
      if (response.data.success) {
        const { created, updated, errors, total } = response.data.stats;
        setToast({
          message: `Sync complete: ${created} created, ${updated} updated, ${errors} errors (Total: ${total})`,
          type: 'success'
        });
        // Refresh customers list
        pagination.refetch();
      } else {
        setToast({
          message: response.data.message || 'Sync failed',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setToast({
        message: error.response?.data?.message || 'Error syncing from Zoho',
        type: 'error'
      });
    } finally {
      setSyncing(false);
    }
  }, [pagination]);

  
  const getTaxTreatmentBadge = (treatment) => {
    const isVatRegistered = treatment === 'vat_registered' || treatment === 'gcc_vat_registered';
    const isGccVat = treatment === 'gcc_vat_registered';
    const label = isVatRegistered ? (isGccVat ? 'GCC VAT Reg' : 'VAT Registered') : 'Non-VAT';
    return {
      background: isVatRegistered ? '#eff6ff' : '#f1f5f9',
      color: isVatRegistered ? '#1e40af' : '#475569',
      label: label
    };
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', color: '#0f172a' }}>Customers</h1>
            {/* <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '.875rem' }}>
              {pagination.filters.includeZoho ? 'With Zoho Data' : 'Database Only'}
            </p> */}
          </div>
          <div style={{ display: 'flex', gap: '.75rem' }}>
          <button
    onClick={handleSyncFromZoho}
    disabled={syncing}
    style={{
      background: '#4f46e5',
      border: 'none',
      borderRadius: '12px',
      padding: '.7rem 1.4rem',
      cursor: syncing ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '.5rem',
      color: 'white',
      opacity: syncing ? 0.6 : 1,
    }}
  >
    <RefreshCw size={17} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
    {syncing ? 'Syncing...' : 'Sync from Zoho'}
  </button>
            {/* <button
              onClick={() => setShowTaxFilters(!showTaxFilters)}
              style={{
                background: showTaxFilters ? '#6366f1' : '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.7rem 1.4rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                color: showTaxFilters ? 'white' : '#475569',
              }}
            >
              <Tag size={17} /> Filters
            </button> */}
            <button
              onClick={() => pagination.refetch()}
              disabled={pagination.loading}
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.7rem 1.4rem',
                cursor: pagination.loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                opacity: pagination.loading ? 0.6 : 1,
              }}
            >
              <RefreshCw size={17} style={{ animation: pagination.loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
            <button
              onClick={onBack}
              style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.7rem 1.4rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
              }}
            >
              <ArrowLeft size={17} /> Back
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {!stats.loading && stats.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            {[
              { label: 'Total Customers', value: stats.data.totalCustomers || 0, icon: Users },
              { label: 'VAT Registered', value: stats.data.vatRegistered || 0, icon: Building2 },
              { label: 'Non-VAT', value: stats.data.nonVatRegistered || 0, icon: Tag },
              { label: 'Active', value: stats.data.activeCustomers || 0, icon: User },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ background: 'white', borderRadius: '12px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                  <Icon size={16} color="#6366f1" />
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '.75rem', fontWeight: '600' }}>{label}</p>
                </div>
                <p style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: '800' }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tax Filters Panel */}
        {showTaxFilters && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={pagination.filters.taxTreatment || ''}
              onChange={(e) => pagination.setTaxTreatmentFilter(e.target.value)}
              style={{
                padding: '.5rem .75rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                fontSize: '.875rem',
              }}
            >
              <option value="">All Tax Treatments</option>
              <option value="vat_registered">VAT Registered (UAE)</option>
              <option value="gcc_vat_registered">GCC VAT Registered</option>
              <option value="non_vat_registered">Non-VAT Registered</option>
              <option value="gcc_non_vat_registered">GCC Non-VAT Registered</option>
            </select>

            <select
              value={pagination.filters.placeOfSupply || ''}
              onChange={(e) => pagination.setPlaceOfSupplyFilter(e.target.value)}
              style={{
                padding: '.5rem .75rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                fontSize: '.875rem',
              }}
            >
              <option value="">All Countries</option>
              {(gccCountries || []).map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <button
              onClick={() => {
                pagination.setTaxTreatmentFilter('');
                pagination.setPlaceOfSupplyFilter('');
              }}
              style={{
                padding: '.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f1f5f9',
                cursor: 'pointer',
                fontSize: '.75rem',
              }}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search customers by name, email, phone..."
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                background: 'white',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.65rem 1rem .65rem 2.6rem',
                fontSize: '.875rem',
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {mode === 'browse' && (
            <>
              

              <select
                value={pagination.filters.limit}
                onChange={(e) => handleLimitChange(e.target.value)}
                style={{
                  background: 'white',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '.65rem 1rem',
                  fontSize: '.875rem',
                  cursor: 'pointer',
                }}
              >
                <option value="10">10/page</option>
                <option value="25">25/page</option>
                <option value="50">50/page</option>
                <option value="100">100/page</option>
              </select>
            </>
          )}

          <button
            onClick={() => handleOpenModal()}
            style={{
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '.65rem 1.4rem',
              fontSize: '.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '.5rem',
            }}
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {/* Customers Table */}
        {currentLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <RefreshCw size={32} style={{ color: '#cbd5e1', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#475569', margin: 0 }}>Loading customers...</p>
          </div>
        ) : currentError ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
            <AlertCircle size={32} style={{ color: '#dc2626', margin: '0 auto 1rem' }} />
            <p style={{ color: '#dc2626', margin: 0 }}>Error: {currentError}</p>
          </div>
        ) : !currentCustomers || currentCustomers.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '4rem', textAlign: 'center' }}>
            <Users size={48} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
            <p style={{ color: '#475569', margin: 0, fontWeight: '600' }}>
              {search.query ? `No customers match "${search.query}"` : 'No customers found'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden', marginBottom: '2rem' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Name', 'Email', 'Phone', 'Address', 'Tax Status', 'Place of Supply', 'Currency', 'Actions'].map((h) => (
                        <th key={h} style={{
                          padding: '.75rem 1rem',
                          textAlign: 'left',
                          color: '#64748b',
                          fontSize: '.72rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          borderBottom: '1.5px solid #e2e8f0'
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentCustomers.map((customer) => {
                      const taxBadge = getTaxTreatmentBadge(customer.taxTreatment);
                      const currencyCode = customer.defaultCurrency?.code || customer.defaultCurrency || 'AED';
                      const displayPlace = customer.uaeEmirate || customer.placeOfSupply || '—';
                      
                      return (
                        <tr key={customer._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '.75rem 1rem', color: '#0f172a', fontWeight: '700' }}>
                            {customer.name}
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: '#475569', fontSize: '.85rem' }}>
                            {customer.email}
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: '#475569', fontSize: '.85rem' }}>
                            {customer.phone || '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: '#475569', fontSize: '.85rem' }}>
                            {customer.address || '—'}
                          </td>
                          <td style={{ padding: '.75rem 1rem' }}>
                            <span style={{
                              background: taxBadge.background,
                              color: taxBadge.color,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '.7rem',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}>
                              {taxBadge.label}
                              {/* {(customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered') && customer.taxRegistrationNumber && (
                                <span style={{ marginLeft: '4px', fontSize: '.65rem', opacity: 0.7 }}>
                                  ({customer.taxRegistrationNumber.slice(0)})
                                </span>
                              )} */}
                            </span>
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: '#475569', fontSize: '.8rem' }}>
                            <Globe size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            {displayPlace}
                          </td>
                          <td style={{ padding: '.75rem 1rem', color: '#475569', fontSize: '.8rem' }}>
                            <DollarSign size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            {currencyCode}
                          </td>
                          <td style={{ padding: '.75rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleOpenModal(customer)}
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: '#eff1ff',
                                  color: '#6366f1',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(customer)}
                                disabled={deletingId === customer._id}
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: '#fff1f1',
                                  color: '#dc2626',
                                  cursor: deletingId === customer._id ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: deletingId === customer._id ? 0.5 : 1,
                                }}
                              >
                                {deletingId === customer._id ? '...' : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {mode === 'browse' && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <p style={{ margin: '0 0 1rem', color: '#0f172a', fontWeight: '600' }}>
                  Page {safePageInfo.page} of {safePageInfo.totalPages} | Total: {safePageInfo.totalItems}
                </p>
                {safePageInfo.totalPages > 1 && (
                  <PaginationControls
                    pagination={safePageInfo}
                    onPageChange={handlePageChange}
                    loading={currentLoading}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <CustomerModal
        isOpen={showModal}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialData={editingCustomer}
        isSubmitting={isSubmitting}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}