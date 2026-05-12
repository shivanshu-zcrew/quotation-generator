// screens/CustomersScreen.jsx (CLEAN VERSION - NO FILTER PANEL)
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw, AlertCircle, ChevronDown, 
  CheckCircle, Users, Building2, Tag, User, X, Save, Globe, DollarSign, 
  Mail, Phone, MapPin, Shield, ChevronLeft, ChevronRight, Download, Upload, Clock,
  Filter, Calendar, TrendingUp, Activity, Zap, Loader, Star,
  Briefcase
} from 'lucide-react';
import { useCustomers, usePaginatedCustomers, useCustomerSearch, useCustomerStats, useZohoSync } from '../hooks/customerHooks';
import { customerAPI } from '../services/api';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { useAppStore } from '../services/store';
import CommonSelect from '../components/CommonSelect';
import ConfirmModal from '../components/ConfirmModal';
import { COUNTRY_CODES } from '../utils/constants';

const PRIMARY_COLOR = '#0f172a';

// Toast Component
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

// StatCard Component
const StatCard = ({ label, value, icon: Icon, color, loading }) => (
  <div style={{ background: 'white', borderRadius: '20px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'transform 0.2s, box-shadow 0.2s' }} 
       onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.1)'; }} 
       onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color={color} />
      </div>
      {loading && <Loader size={16} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />}
    </div>
    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
    <p style={{ margin: '0.25rem 0 0', color: PRIMARY_COLOR, fontSize: '1.75rem', fontWeight: '800' }}>{loading ? '—' : value}</p>
  </div>
);

// PaginationControls Component
const PaginationControls = ({ pagination, onPageChange, loading }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, totalItems, limit } = pagination;
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
  
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);
  
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      padding: '1rem 1.5rem',
      borderTop: '1px solid #f1f5f9',
      background: '#fafafa'
    }}>
      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
        Showing {startItem} to {endItem} of {totalItems} customers
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button 
          onClick={() => onPageChange(page - 1)} 
          disabled={page === 1 || loading} 
          style={{ 
            width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', 
            background: 'white', cursor: page === 1 || loading ? 'not-allowed' : 'pointer', 
            opacity: page === 1 || loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <ChevronLeft size={14} />
        </button>
        
        {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(num => (
          <button 
            key={num} 
            onClick={() => onPageChange(num)} 
            disabled={loading} 
            style={{ 
              minWidth: '32px', height: '32px', borderRadius: '8px', 
              border: num === page ? 'none' : '1px solid #e2e8f0', 
              background: num === page ? PRIMARY_COLOR : 'white', 
              color: num === page ? 'white' : '#475569', 
              fontWeight: num === page ? '600' : '500',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {num}
          </button>
        ))}
        
        <button 
          onClick={() => onPageChange(page + 1)} 
          disabled={page === totalPages || loading} 
          style={{ 
            width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', 
            background: 'white', cursor: page === totalPages || loading ? 'not-allowed' : 'pointer', 
            opacity: page === totalPages || loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
 
// Phone Input Component
const PhoneInput = ({ value, onChange, placeholder }) => {
  const [selectedCode, setSelectedCode] = useState('+971');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  useEffect(() => {
    if (value) {
      // Check if value has country code format (starts with + and has dash)
      const countryCodeMatch = COUNTRY_CODES.find(c => value.startsWith(c.code + '-'));
      if (countryCodeMatch) {
        setSelectedCode(countryCodeMatch.code);
        setPhoneNumber(value.substring(countryCodeMatch.code.length + 1)); // +1 for the dash
      } else if (value.startsWith('+')) {
        // Handle case without dash
        const matchedCountry = COUNTRY_CODES.find(c => value.startsWith(c.code));
        if (matchedCountry) {
          setSelectedCode(matchedCountry.code);
          setPhoneNumber(value.substring(matchedCountry.code.length));
        } else {
          setPhoneNumber(value);
        }
      } else {
        setPhoneNumber(value);
      }
    }
  }, [value]);

  const handleCodeChange = (code) => {
    setSelectedCode(code);
    setShowCountryDropdown(false);
    // Format with dash when country code is selected
    if (phoneNumber) {
      onChange(`${code}-${phoneNumber}`);
    } else {
      onChange(code + '-');
    }
  };

  const handleNumberChange = (e) => {
    const newNumber = e.target.value.replace(/[^0-9]/g, '');
    setPhoneNumber(newNumber);
    if (selectedCode && newNumber) {
      onChange(`${selectedCode}-${newNumber}`);
    } else if (selectedCode) {
      onChange(selectedCode + '-');
    } else {
      onChange(newNumber);
    }
  };

  const handleBlur = () => {
    // Clean up: if phoneNumber is empty, remove the trailing dash
    if (!phoneNumber && value === selectedCode + '-') {
      onChange('');
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setShowCountryDropdown(!showCountryDropdown)}
          style={{
            padding: '0.75rem 1rem',
            border: '1.5px solid #e2e8f0',
            borderRadius: '14px',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem'
          }}
        >
          <span>{selectedCode}</span>
          <ChevronDown size={14} />
        </button>
        {showCountryDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            maxHeight: '250px',
            overflowY: 'auto',
            zIndex: 100,
            minWidth: '200px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            {COUNTRY_CODES.map(country => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCodeChange(country.code)}
                style={{
                  width: '100%',
                  padding: '0.5rem 1rem',
                  textAlign: 'left',
                  background: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <span>{country.flag}</span>
                <span>{country.code}</span>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{country.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="tel"
        placeholder={placeholder}
        value={phoneNumber}
        onChange={handleNumberChange}
        onBlur={handleBlur}
        style={{
          flex: 1,
          padding: '0.75rem 1rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '14px',
          fontSize: '0.875rem',
          outline: 'none'
        }}
      />
    </div>
  );
};

const CustomerModal = ({ isOpen, onClose, onSubmit, initialData = null, isSubmitting }) => {
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
    defaultCurrency: 'AED',
    contactPersons: [],           // Additional contacts
    mainContactSalutation: 'Mr.'
  });

  const [errors, setErrors] = useState({});
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactIndex, setEditingContactIndex] = useState(null);
  
  const [contactForm, setContactForm] = useState({
    salutation: '', 
    firstName: '', 
    lastName: '', 
    email: '', 
    workPhone: '', 
    mobile: '', 
    designation: '', 
    department: '', 
    notes: ''
  });

  const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Miss', 'Master'];
  const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
  const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

  // Initialize form
  useEffect(() => {
    if (initialData) {
      const mainContact = initialData.contactPersons?.[0] || {};
      
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
        defaultCurrency: initialData.defaultCurrency?.code || 'AED',
        contactPersons: initialData.contactPersons?.slice(1) || [],
        mainContactSalutation: mainContact.salutation || 'Mr.'
      });
    } else {
      setFormData({
        name: '', email: '', phone: '', address: '', companyName: '', website: '', notes: '',
        taxTreatment: 'non_vat_registered', taxRegistrationNumber: '', placeOfSupply: 'Dubai',
        defaultCurrency: 'AED', contactPersons: [], mainContactSalutation: 'Mr.'
      });
    }
    setErrors({});
    setShowContactForm(false);
    setEditingContactIndex(null);
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

  const handlePhoneChange = (phoneWithCode) => {
    setFormData(prev => ({ ...prev, phone: phoneWithCode }));
  };

  // Additional Contact Phone Handlers
  const handleContactWorkPhoneChange = (phoneWithCode) => {
    setContactForm(prev => ({ ...prev, workPhone: phoneWithCode }));
  };

  const handleContactMobileChange = (phoneWithCode) => {
    setContactForm(prev => ({ ...prev, mobile: phoneWithCode }));
  };

  // Contact Person Handlers
  const openAddContact = () => {
    setContactForm({ 
      salutation: '', firstName: '', lastName: '', email: '', 
      workPhone: '', mobile: '', designation: '', department: '', notes: '' 
    });
    setEditingContactIndex(null);
    setShowContactForm(true);
  };

  const handleEditContact = (index) => {
    setContactForm(formData.contactPersons[index] || {});
    setEditingContactIndex(index);
    setShowContactForm(true);
  };

  const handleSaveContact = () => {
    if (!contactForm.firstName?.trim()) {
      alert("First Name is required for contact person");
      return;
    }

    const newContact = { ...contactForm };

    if (editingContactIndex !== null) {
      const updated = [...formData.contactPersons];
      updated[editingContactIndex] = newContact;
      setFormData(prev => ({ ...prev, contactPersons: updated }));
    } else {
      setFormData(prev => ({
        ...prev,
        contactPersons: [...prev.contactPersons, newContact]
      }));
    }

    setShowContactForm(false);
    setEditingContactIndex(null);
  };

  const handleDeleteContact = (index) => {
    setFormData(prev => ({
      ...prev,
      contactPersons: prev.contactPersons.filter((_, i) => i !== index)
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = 'Customer name is required';
    if (!formData.email?.trim()) newErrors.email = 'Email is required';
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSubmit(formData);
  };

  if (!isOpen) return null;

  const isVatRegistered = formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'gcc_vat_registered';
  const showUaeEmirates = formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'non_vat_registered';
  const placeOfSupplyOptions = showUaeEmirates ? UAE_EMIRATES : GCC_COUNTRIES;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', overflowY: 'auto' }} 
         onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>

      <div style={{ background: 'white', borderRadius: '28px', width: '100%', maxWidth: '920px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ position: 'sticky', top: 0, padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', background: 'white', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: PRIMARY_COLOR }}>
                {initialData ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                {initialData ? 'Update customer information' : 'Enter customer details'}
              </p>
            </div>
            <button onClick={onClose} disabled={isSubmitting} style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
              <X size={20} color="#64748b" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          {/* Customer Name with Salutation */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Customer Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '1rem' }}>
              <select
                name="mainContactSalutation"
                value={formData.mainContactSalutation}
                onChange={handleChange}
                style={{ padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', background: 'white' }}
              >
                {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="text"
                name="name"
                placeholder="Enter customer / company name"
                value={formData.name}
                onChange={handleChange}
                style={{ padding: '0.75rem 1rem', border: `1.5px solid ${errors.name ? '#ef4444' : '#e2e8f0'}`, borderRadius: '14px' }}
              />
            </div>
            {errors.name && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.name}</p>}
          </div>

          {/* Email & Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Phone Number</label>
              <PhoneInput value={formData.phone} onChange={handlePhoneChange} />
            </div>
          </div>

          {/* Address, Company Name, Website */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Address</label>
            <input type="text" name="address" value={formData.address} onChange={handleChange} style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Company Name</label>
              <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Website</label>
              <input type="text" name="website" value={formData.website} onChange={handleChange} style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px' }} />
            </div>
          </div>

   
          {/* Tax Treatment - Same as before */}
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

          {/* TRN Field */}
          {isVatRegistered && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#0c4a6e', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Tax Registration Number (TRN) <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" name="taxRegistrationNumber" placeholder="123456789012345" value={formData.taxRegistrationNumber} onChange={handleChange} disabled={isSubmitting} maxLength={15} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: `1.5px solid ${errors.taxRegistrationNumber ? '#ef4444' : '#bae6fd'}`, borderRadius: '14px', fontSize: '0.875rem', fontFamily: 'monospace', outline: 'none' }} />
              {errors.taxRegistrationNumber && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.taxRegistrationNumber}</p>}
            </div>
          )}

          {/* Place of Supply & Currency */}
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

          {/* Company Name & Website */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div><label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Company Name</label>
              <input type="text" name="companyName" placeholder="Company name (optional)" value={formData.companyName} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
            <div><label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Website</label>
              <input type="text" name="website" placeholder="https://example.com" value={formData.website} onChange={handleChange} disabled={isSubmitting} 
                     style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '14px', fontSize: '0.875rem', outline: 'none' }} />
            </div>
          </div>

          {/* Additional Contact Persons Section */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Additional Contact Persons ({formData.contactPersons.length})</h3>
              <button type="button" onClick={openAddContact} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add Contact Person
              </button>
            </div>

            {formData.contactPersons.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                No additional contact persons added.<br />
                <small>The main customer will be added as primary contact</small>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {formData.contactPersons.map((contact, idx) => (
                  <div key={idx} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{contact.salutation} {contact.firstName} {contact.lastName}</strong><br />
                      <small style={{ color: '#64748b' }}>
                        {contact.email} • {contact.workPhone || contact.mobile}
                      </small>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => handleEditContact(idx)} style={{ padding: '6px 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px' }}>Edit</button>
                      <button type="button" onClick={() => handleDeleteContact(idx)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>Notes</label>
            <textarea name="notes" rows={4} value={formData.notes} onChange={handleChange} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1px solid #e2e8f0' }} />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting} style={{ padding: '12px 24px', borderRadius: '12px', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} style={{ padding: '12px 32px', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600' }}>
              {isSubmitting ? 'Saving...' : initialData ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>

      {/* Contact Person Add/Edit Modal */}
      {showContactForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
             onClick={() => setShowContactForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', width: '560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee' }}>
              <h3>{editingContactIndex !== null ? 'Edit Contact Person' : 'Add New Contact Person'}</h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              {/* Salutation + Names */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <select value={contactForm.salutation} onChange={e => setContactForm(prev => ({ ...prev, salutation: e.target.value }))} 
                        style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd' }}>
                  {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" placeholder="First Name *" value={contactForm.firstName} 
                       onChange={e => setContactForm(prev => ({ ...prev, firstName: e.target.value }))} 
                       style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd' }} />
                <input type="text" placeholder="Last Name" value={contactForm.lastName} 
                       onChange={e => setContactForm(prev => ({ ...prev, lastName: e.target.value }))} 
                       style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd' }} />
              </div>

              <input type="email" placeholder="Email Address" value={contactForm.email} 
                     onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} 
                     style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd', marginBottom: '1rem' }} />

              {/* Phone Fields with Country Code */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '500' }}>Work Phone</label>
                  <PhoneInput value={contactForm.workPhone} onChange={handleContactWorkPhoneChange} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '500' }}>Mobile Number</label>
                  <PhoneInput value={contactForm.mobile} onChange={handleContactMobileChange} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input type="text" placeholder="Designation" value={contactForm.designation} 
                       onChange={e => setContactForm(prev => ({ ...prev, designation: e.target.value }))} 
                       style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd' }} />
                <input type="text" placeholder="Department" value={contactForm.department} 
                       onChange={e => setContactForm(prev => ({ ...prev, department: e.target.value }))} 
                       style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #ddd' }} />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => setShowContactForm(false)} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #ddd' }}>Cancel</button>
              <button onClick={handleSaveContact} style={{ padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '10px' }}>
                {editingContactIndex !== null ? 'Update Contact' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
 

const styles = {
  input: { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' },
  select: { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', background: 'white' },
  textarea: { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', resize: 'vertical' }
};

// CustomerCard Component
const CustomerCard = ({ customer, onEdit, onDelete, deletingId }) => {
  const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
  
  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: '16px', overflow: 'hidden', background: 'white', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${PRIMARY_COLOR}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color={PRIMARY_COLOR} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => onEdit(customer)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(customer)} disabled={deletingId === customer._id} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: deletingId === customer._id ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.9rem', fontWeight: '700', color: PRIMARY_COLOR }}>{customer.name}</h3>
      <p style={{ margin: '0 0 0.25rem', color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Mail size={10} /> {customer.email}
      </p>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '600', background: isVatRegistered ? '#d1fae5' : '#f1f5f9', color: isVatRegistered ? '#065f46' : '#475569' }}>
          {isVatRegistered ? 'VAT' : 'Non-VAT'}
        </span>
        {customer.placeOfSupply && (
          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '500', background: '#f1f5f9', color: '#475569' }}>
            {customer.placeOfSupply.substring(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
};

// Main CustomersScreen Component
export default function CustomersScreen({ onBack, companyId: propCompanyId }) {
  const { selectedCompany: contextCompanyId } = useCompanyCurrency();
  const effectiveCompanyId = propCompanyId || contextCompanyId;

  // Hooks
  const pagination = usePaginatedCustomers(1, effectiveCompanyId);
  const stats = useCustomerStats(effectiveCompanyId);
  const { syncCustomers, syncing: isSyncing, getSyncStatus } = useZohoSync();
  
  // Local state
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncType, setSyncType] = useState(null);
  const [viewMode, setViewMode] = useState('card');
  const [showSyncOptions, setShowSyncOptions] = useState(false);
  const [sortOption, setSortOption] = useState('newest');
  const [deleteModal, setDeleteModal] = useState({ open: false, customer: null });
  // Store
  const customerFilters = useAppStore((state) => state.customerFilters);
  const setCustomerFilters = useAppStore((state) => state.setCustomerFilters);
  const fetchFilteredCustomers = useAppStore((state) => state.fetchFilteredCustomers);
  const addCustomerToStore = useAppStore((state) => state.addCustomer);
  const updateCustomerInStore = useAppStore((state) => state.updateCustomer);
  const deleteCustomerFromStore = useAppStore((state) => state.deleteCustomer);
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  
  const { customers, customersPagination, loading, fetchCustomerStats } = useAppStore();
  
  // Memoized values
  const currentCustomers = useMemo(() => customers || [], [customers]);
  const currentLoading = loading;
  const currentPagination = customersPagination;
  useEffect(() => {
    if (!contextCompanyId) return;
  
    const loadData = async () => {
      let sortBy = 'createdAt';
      let sortOrder = 'desc';
  
      switch(sortOption) {
        case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
        case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
        case 'az':     sortBy = 'name'; sortOrder = 'asc'; break;
        case 'za':     sortBy = 'name'; sortOrder = 'desc'; break;
      }
  
       await Promise.all([
        fetchCustomerStats(customerFilters),                  
        fetchFilteredCustomers({ 
          ...customerFilters, 
          sortBy, 
          sortOrder 
        }, { page: 1 })
      ]);
    };
  
    loadData();
  }, [contextCompanyId, customerFilters, sortOption]);
  
  // Helper functions
  const getSortFromOption = (option) => {
    switch(option) {
      case 'newest': return 'createdAt';
      case 'oldest': return 'createdAt';
      case 'az': return 'name';
      case 'za': return 'name';
      default: return 'createdAt';
    }
  };
  
  const getOrderFromOption = (option) => {
    switch(option) {
      case 'newest': return 'desc';
      case 'oldest': return 'asc';
      case 'az': return 'asc';
      case 'za': return 'desc';
      default: return 'desc';
    }
  };

  useEffect(() => {
    if (contextCompanyId) {
      const loadSavedFilters = async () => {
        let sortBy = 'createdAt';
        let sortOrder = 'desc';
        switch(sortOption) {
          case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
          case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
          case 'az': sortBy = 'name'; sortOrder = 'asc'; break;
          case 'za': sortBy = 'name'; sortOrder = 'desc'; break;
          default: break;
        }
         await fetchFilteredCustomers({ ...customerFilters, sortBy, sortOrder }, { page: 1 });
      };
      
      loadSavedFilters();
    }
  }, []); 

  useEffect(() => {
    if (contextCompanyId) {
      let sortBy = 'createdAt';
      let sortOrder = 'desc';
      switch(sortOption) {
        case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
        case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
        case 'az': sortBy = 'name'; sortOrder = 'asc'; break;
        case 'za': sortBy = 'name'; sortOrder = 'desc'; break;
        default: break;
      }
      fetchFilteredCustomers({ ...customerFilters, sortBy, sortOrder }, { page: 1 });
    }
  }, [sortOption]);

  // Handlers
  const handleSearch = useCallback((value) => {
    setCustomerFilters({ search: value?.trim() || '' });
  }, [setCustomerFilters]);
  
  const handleLimitChange = useCallback((newLimit) => {
    fetchFilteredCustomers(customerFilters, { page: 1, limit: parseInt(newLimit, 10) });
  }, [fetchFilteredCustomers, customerFilters]);
  
  const handleOpenModal = useCallback((customer = null) => { 
    setEditingCustomer(customer); 
    setShowModal(true); 
  }, []);
  
  const handleCloseModal = useCallback(() => { 
    setShowModal(false); 
    setEditingCustomer(null); 
    setIsSubmitting(false); 
  }, []);

  const handleSortChange = useCallback((option) => {
    setSortOption(option);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    fetchFilteredCustomers(customerFilters, { page: newPage });
  }, [fetchFilteredCustomers, customerFilters]);

  const handleSubmit = useCallback(async (formData) => {
    setIsSubmitting(true);
    try {
      let result;
      
      if (editingCustomer) {
        result = await updateCustomerInStore(editingCustomer._id, formData);
        if (result?.success) {
          handleCloseModal();
          setToast({ message: '✅ Customer updated successfully', type: 'success' });
          await fetchAllData();
        } else {
          setToast({ message: result?.error || 'Error updating customer', type: 'error' });
        }
      } else {
        result = await addCustomerToStore(formData);
        if (result?.success) {
          handleCloseModal();
          setToast({ message: '✅ Customer added successfully', type: 'success' });
          await fetchAllData();
        } else {
          setToast({ message: result?.error || 'Error adding customer', type: 'error' });
        }
      }
    } catch (error) { 
      setToast({ message: error?.response?.data?.message || error?.message || 'Error saving customer', type: 'error' }); 
    } finally { 
      setIsSubmitting(false); 
    }
  }, [editingCustomer, addCustomerToStore, updateCustomerInStore, fetchAllData, handleCloseModal]);

  const handleDeleteClick = (customer) => {
    setDeleteModal({ open: true, customer });
  };
  
  const handleDeleteConfirm = async () => {
    if (!deleteModal.customer) return;
    
    setDeletingId(deleteModal.customer._id);
    try {
      const result = await deleteCustomerFromStore(deleteModal.customer._id);
      if (result?.success) {
        setToast({ message: 'Customer deleted successfully', type: 'success' });
         if (pagination?.refetch) await pagination.refetch();
        if (stats?.refetch) await stats.refetch();
      } else {
         const errorMsg = result?.error || 'Failed to delete customer';
        setToast({ message: errorMsg, type: 'error' });
      }
      
      setDeleteModal({ open: false, customer: null });
      if (pagination?.refetch) await pagination.refetch();
      if (stats?.refetch) await stats.refetch();
    } catch (error) {
      setToast({ message: error?.message || 'Failed to delete', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteModal({ open: false, customer: null });
  };

  const handleSync = useCallback(async (fullSync = false) => {
    setSyncType(fullSync ? 'full' : 'incremental');
    setToast({ message: fullSync ? '🔄 Performing full sync from Zoho...' : '🔄 Performing incremental sync from Zoho...', type: 'info' });
    
    try {
      const result = await syncCustomers(fullSync, effectiveCompanyId);
      if (result.success) {
        setToast({ message: `✅ Sync complete!`, type: 'success' });
        await fetchAllData();
      }
    } catch (error) {
      setToast({ message: `❌ ${error.message || 'Sync failed'}`, type: 'error' });
    } finally {
      setSyncType(null);
      setShowSyncOptions(false);
    }
  }, [syncCustomers, fetchAllData, effectiveCompanyId]);

  const handleApplyFilters = useCallback(async () => {
    setIsFilterLoading(true);
    try {
      let sortBy = 'createdAt';
      let sortOrder = 'desc';
      switch(sortOption) {
        case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
        case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
        case 'az': sortBy = 'name'; sortOrder = 'asc'; break;
        case 'za': sortBy = 'name'; sortOrder = 'desc'; break;
        default: break;
      }
      await fetchFilteredCustomers({ ...customerFilters, sortBy, sortOrder }, { page: 1 });
      setToast({ message: 'Filters applied successfully', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to apply filters', type: 'error' });
    } finally {
      setIsFilterLoading(false);
    }
  }, [fetchFilteredCustomers, customerFilters, sortOption]);

  const handleResetFilters = useCallback(async () => {
    const resetFilters = {
      status: 'all',
      taxStatus: 'all',
      placeOfSupply: 'all',
      hasTRN: 'all',
      search: '',
      minQuotations: null,
      maxQuotations: null,
      minTotalValue: null,
      maxTotalValue: null,
      zohoSyncStatus: 'all'
    };
    setCustomerFilters(resetFilters);
    setSortOption('newest');
    await fetchFilteredCustomers({ ...resetFilters, sortBy: 'createdAt', sortOrder: 'desc' }, { page: 1 });
    setToast({ message: 'All filters reset', type: 'success' });
  }, [setCustomerFilters, fetchFilteredCustomers]);

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
   {/* Header - Modern & Responsive */}
<div style={{ 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  marginBottom: '2rem', 
  flexWrap: 'wrap', 
  gap: '1.5rem',
  position: 'relative'
}}>
  {/* Left Section - Title & Description */}
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
      <div style={{ 
        width: '48px', 
        height: '48px', 
        background: `linear-gradient(135deg, ${PRIMARY_COLOR}15, ${PRIMARY_COLOR}05)`,
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${PRIMARY_COLOR}20`
      }}>
        <Users size={24} color={PRIMARY_COLOR} />
      </div>
      <div>
        <h1 style={{ 
          margin: 0, 
          fontSize: 'clamp(1.5rem, 5vw, 2rem)', 
          fontWeight: '800', 
          background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em'
        }}>
          Customers
        </h1>
        <p style={{ 
          margin: '0.25rem 0 0', 
          color: '#64748b', 
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{ 
            display: 'inline-block', 
            width: '6px', 
            height: '6px', 
            background: '#10b981', 
            borderRadius: '50%',
            animation: 'pulse 2s infinite'
          }} />
          Manage your customer relationships and tax information
        </p>
      </div>
    </div>
  </div>

  {/* Right Section - Actions */}
  <div style={{ 
    display: 'flex', 
    gap: '0.75rem', 
    alignItems: 'center',
    flexWrap: 'wrap'
  }}>
    {/* Sync Button with Dropdown */}
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setShowSyncOptions(!showSyncOptions)} 
        disabled={isSyncing} 
        style={{ 
          background: isSyncing 
            ? '#9ca3af' 
            : `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
          border: 'none', 
          borderRadius: '14px', 
          padding: '0.7rem 1.4rem', 
          cursor: isSyncing ? 'not-allowed' : 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.6rem', 
          color: 'white', 
          fontWeight: '600', 
          fontSize: '0.85rem', 
          boxShadow: isSyncing 
            ? 'none' 
            : `0 4px 12px ${PRIMARY_COLOR}30`,
          transition: 'all 0.2s ease',
          opacity: isSyncing ? 0.7 : 1
        }}
        onMouseEnter={(e) => {
          if (!isSyncing) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 6px 16px ${PRIMARY_COLOR}40`;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          if (!isSyncing) {
            e.currentTarget.style.boxShadow = `0 4px 12px ${PRIMARY_COLOR}30`;
          }
        }}
      >
        {isSyncing ? (
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <RefreshCw size={16} />
        )}
        <span style={{ whiteSpace: 'nowrap' }}>
          {isSyncing 
            ? (syncType === 'full' ? 'Full Sync...' : 'Syncing...') 
            : 'Sync from Zoho'}
        </span>
        <ChevronDown size={14} style={{ 
          transition: 'transform 0.2s',
          transform: showSyncOptions ? 'rotate(180deg)' : 'rotate(0deg)'
        }} />
      </button>
      
      {showSyncOptions && !isSyncing && (
        <div style={{
          position: 'absolute', 
          top: 'calc(100% + 8px)', 
          right: 0, 
          background: 'white', 
          borderRadius: '16px', 
          boxShadow: '0 20px 35px -10px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0', 
          zIndex: 10, 
          minWidth: '240px', 
          overflow: 'hidden',
          animation: 'fadeInDown 0.2s ease'
        }}>
          <button 
            onClick={() => handleSync(true)} 
            style={{ 
              width: '100%', 
              padding: '0.875rem 1.25rem', 
              background: 'white', 
              border: 'none', 
              textAlign: 'left', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              transition: 'background 0.2s',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: '#e0e7ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <RefreshCw size={14} color="#6366f1" />
            </div>
            <div>
              <div style={{ fontWeight: '600' }}>Full Sync</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sync all customers from Zoho</div>
            </div>
          </button>
          <div style={{ height: '1px', background: '#e2e8f0' }} />
          
        </div>
      )}
    </div>

    {/* Back Button */}
    <button 
      onClick={onBack} 
      style={{ 
        background: 'white', 
        border: '1px solid #e2e8f0', 
        borderRadius: '14px', 
        padding: '0.7rem 1.4rem', 
        cursor: 'pointer', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.6rem', 
        fontWeight: '600', 
        fontSize: '0.85rem',
        color: '#475569',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f8fafc';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
      }}
    >
      <ArrowLeft size={16} />
      <span>Back</span>
    </button>
  </div>
</div>
 
<style>
  {`
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }
    
    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `}
</style>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard label="Total Customers" value={stats.data?.totalCustomers || 0} icon={Users} color="#6366f1" loading={stats.loading} />
          <StatCard label="VAT Registered" value={stats.data?.vatRegistered || 0} icon={Building2} color="#10b981" loading={stats.loading} />
          <StatCard label="Non-VAT Registered" value={stats.data?.nonVatRegistered || 0} icon={Tag} color="#f59e0b" loading={stats.loading} />
          <StatCard label="Active Customers" value={stats.data?.activeCustomers || 0} icon={User} color="#8b5cf6" loading={stats.loading} />
        </div>

        {/* Main Content Card */}
        <div style={{ background: 'white', borderRadius: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px 20px',
  background: '#ffffff',
  borderBottom: '1px solid #e5e7eb',
  flexWrap: 'wrap'
}}>
  {/* Search Input */}
  <div style={{ position: 'relative', flex: '2', minWidth: '240px' }}>
    <Search size={16} style={{
      position: 'absolute',
      left: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#9ca3af'
    }} />
    <input
      type="text"
      placeholder="Search customers by name, email or phone..."
      onChange={(e) => handleSearch(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px 8px 36px',
        borderRadius: '10px',
        border: '1px solid #e5e7eb',
        fontSize: '13px',
        background: '#f9fafb',
        outline: 'none',
        transition: 'all 0.2s'
      }}
      onFocus={(e) => e.target.style.borderColor = PRIMARY_COLOR}
      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
    />
  </div>

  <CommonSelect
  value={customerFilters.status || 'all'}
  onChange={(value) => setCustomerFilters({ ...customerFilters, status: value })}
  options={[
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]}
  size="md"
/>

{/* Tax Status Filter */}
<CommonSelect
  value={customerFilters.taxStatus || 'all'}
  onChange={(value) => setCustomerFilters({ ...customerFilters, taxStatus: value })}
  options={[
    { value: 'all', label: 'All Tax' },
    { value: 'vat_registered', label: 'VAT Registered' },
    { value: 'non_vat_registered', label: 'Non-VAT' },
    { value: 'gcc_vat_registered', label: 'GCC VAT' },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT' }
  ]}
  size="md"
/>

{/* Place of Supply Filter */}
<CommonSelect
  value={customerFilters.placeOfSupply || 'all'}
  onChange={(value) => setCustomerFilters({ ...customerFilters, placeOfSupply: value })}
  options={[
    { value: 'all', label: 'All Places' },
    { value: 'Dubai', label: 'Dubai' },
    { value: 'Abu Dhabi', label: 'Abu Dhabi' },
    { value: 'Sharjah', label: 'Sharjah' },
    { value: 'Saudi Arabia', label: ' Saudi Arabia' },
    { value: 'Kuwait', label: 'Kuwait' },
    { value: 'Qatar', label: 'Qatar' }
  ]}
  size="md"
/>

  {/* Per Page Selector */}
  <CommonSelect
  value={currentPagination?.limit || 10}
  onChange={(value) => handleLimitChange(value)}
  options={[
    { value: '10', label: '10 / page' },
    { value: '25', label: '25 / page' },
    { value: '50', label: '50 / page' },
    { value: '100', label: '100 / page' }
  ]}
  size="md"
/>

{/* Sort */}
<CommonSelect
  value={sortOption}
  onChange={(value) => handleSortChange(value)}
  options={[
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'az', label: 'A to Z' },
    { value: 'za', label: 'Z to A' }
  ]}
  size="md"
/>

  {/* View Toggle */}
  <div style={{
    display: 'flex',
    background: '#f1f5f9',
    borderRadius: '10px',
    padding: '3px',
    gap: '2px'
  }}>
    {['card', 'table'].map(v => (
      <button
        key={v}
        onClick={() => setViewMode(v)}
        style={{
          padding: '6px 14px',
          borderRadius: '8px',
          border: 'none',
          fontSize: '12px',
          fontWeight: '500',
          background: viewMode === v ? '#fff' : 'transparent',
          boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          cursor: 'pointer',
          color: viewMode === v ? PRIMARY_COLOR : '#64748b',
          transition: 'all 0.2s'
        }}
      >
        {v === 'card' ? 'Cards' : 'Table'}
      </button>
    ))}
  </div>
   
  {/* Reset Filters Button */}
  <button
    onClick={handleResetFilters}
    style={{
      background: '#f1f5f9',
      color: '#64748b',
      border: 'none',
      borderRadius: '10px',
      padding: '7px 14px',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}
  >
    <X size={14} />
    Reset
  </button>

  {/* Add Customer Button */}
  <button
    onClick={() => handleOpenModal()}
    style={{
      background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      padding: '7px 16px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginLeft: 'auto'
    }}
  >
    <Plus size={14} />
    Add Customer
  </button>
</div>

          {/* Content Area */}
          {currentLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <Loader size={48} color={PRIMARY_COLOR} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
              <p style={{ color: '#64748b' }}>Loading customers...</p>
            </div>
          ) : !currentCustomers?.length ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
              <Users size={64} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
              <p style={{ color: '#64748b', fontWeight: '500' }}>No customers found</p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button onClick={() => handleSync(false)} style={{ padding: '0.75rem 1.5rem', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={16} /> Sync from Zoho
                </button>
                <button onClick={() => handleOpenModal()} style={{ padding: '0.75rem 1.5rem', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={16} /> Add Customer
                </button>
              </div>
            </div>
          ) : viewMode === 'card' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem', padding: '1.5rem' }}>
              {currentCustomers.map((customer) => (
                <CustomerCard key={customer._id} customer={customer} onEdit={handleOpenModal} onDelete={handleDeleteClick} deletingId={deletingId} />
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
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Place</th>
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
                            {isVatRegistered ? 'VAT' : 'Non-VAT'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.placeOfSupply || '—'}</td>
                        <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{customer.defaultCurrency?.code || customer.defaultCurrency || 'AED'}</td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleOpenModal(customer)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.7rem' }}>
                              <Edit2 size={12} /> 
                            </button>
                            <button onClick={() => handleDeleteClick(customer)} disabled={deletingId === customer._id} 
                                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: deletingId === customer._id ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>
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
          {currentPagination && currentPagination.totalPages > 1 && (
            <PaginationControls 
              pagination={currentPagination} 
              onPageChange={handlePageChange} 
              loading={currentLoading} 
            />
          )}
        </div>
      </div>
      <ConfirmModal
  open={deleteModal.open}
  title="Delete Customer"
  message={`Are you sure you want to delete "${deleteModal.customer?.name}"? This action cannot be undone.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={handleDeleteConfirm}
  onCancel={handleDeleteCancel}
  loading={deletingId === deleteModal.customer?._id}
  danger={true}
/>
      <CustomerModal isOpen={showModal} onClose={handleCloseModal} onSubmit={handleSubmit} initialData={editingCustomer} isSubmitting={isSubmitting} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}