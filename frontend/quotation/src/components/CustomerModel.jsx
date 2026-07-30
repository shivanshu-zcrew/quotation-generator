// CustomerModal.jsx - Updated to show errors across all tabs

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Edit2, MapPin, Building2, ChevronDown, Mail, Phone, User, CreditCard, Globe, Briefcase, Users, CheckCircle, AlertCircle, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { COUNTRY_CODES } from '../utils/constants';
import { useAppStore } from '../services/store';
import PhoneInput from './PhoneInput';

// Companies under this Zoho org are Saudi-based — their customers are always
// GCC-country contacts (never a UAE emirate), so the tax/place-of-supply UI
// is restricted accordingly (see isSaudiCompany below).
const SAUDI_COMPANY_ZOHO_ORG_ID = '932531766';

const ADDRESS_FIELD_LABELS = {
  address: 'Street address',
  city: 'City',
  state: 'State',
  zipcode: 'Zip code',
};

// ─────────────────────────────────────────────────────────────────────────
// Responsive Hook
// ─────────────────────────────────────────────────────────────────────────
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

// ─────────────────────────────────────────────────────────────────────────
// Error Summary Component
// ─────────────────────────────────────────────────────────────────────────
const ErrorSummary = ({ errors, onTabChange, setActiveTab }) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  if (Object.keys(errors).length === 0) return null;
  
  const errorMessages = [];
  const tabErrors = {
    basic: [],
    tax: [],
    company: []
  };
  
  // Map fields to tabs and create readable messages
  const fieldToTab = {
    name: { tab: 'basic', message: 'Customer Name is required' },
    email: { tab: 'basic', message: 'Valid Email is required' },
    companyName: { tab: 'basic', message: 'Company Name is required' },
    taxRegistrationNumber: { tab: 'tax', message: 'TRN is required for VAT registered customers' },
    company: { tab: 'company', message: 'Please select a company' },
    address: { tab: 'basic', message: 'Street address is required for this tax treatment' },
    city: { tab: 'basic', message: 'City is required for this tax treatment' },
    state: { tab: 'basic', message: 'State is required for this tax treatment' },
  };
  
  Object.keys(errors).forEach(field => {
    const mapping = fieldToTab[field];
    if (mapping) {
      tabErrors[mapping.tab].push(mapping.message);
      errorMessages.push({ tab: mapping.tab, message: mapping.message });
    } else {
      errorMessages.push({ tab: 'basic', message: errors[field] });
    }
  });
  
  const getTabId = (tab) => {
    if (tab === 'basic') return 'basic';
    if (tab === 'tax') return 'tax';
    return 'basic';
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        marginBottom: '1rem',
        padding: isMobile ? '0.75rem' : '1rem',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <AlertCircle size={isMobile ? 16 : 18} color="#dc2626" />
        <span style={{ fontWeight: '600', color: '#991b1b', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
          Please fix the following errors:
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#b91c1c', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
        {errorMessages.map((error, idx) => (
          <li key={idx}>
            {error.tab ? (
              <button
                type="button"
                onClick={() => {
                  if (onTabChange) onTabChange(error.tab);
                  if (setActiveTab) setActiveTab(error.tab);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit'
                }}
              >
                {error.message}
              </button>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
};

// Long/detailed server-side errors (e.g. Zoho's own rejection text — a
// locked currency, a stale contact-person ID) don't fit a toast and don't
// belong to a specific form field like ErrorSummary's validation messages —
// shown as a dismissible banner right inside the modal instead.
const SubmitErrorBanner = ({ message, onDismiss }) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  if (!message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        marginTop: '0.75rem',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.625rem',
        padding: isMobile ? '0.75rem' : '1rem',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <AlertCircle size={isMobile ? 16 : 18} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: isMobile ? '0.75rem' : '0.8rem', color: '#991b1b', fontWeight: 500, lineHeight: 1.5 }}>
          {message}
        </span>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, color: '#dc2626' }}
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Customer Modal
// ─────────────────────────────────────────────────────────────────────────
const CustomerModal = ({ isOpen, onClose, onSubmit, initialData = null, isSubmitting, submitError, onDismissSubmitError }) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  
  // Get companies, selected company, and user from store
  const companies = useAppStore((state) => state.companies);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  const user = useAppStore((state) => state.user);
  
  // ✅ Only admin can see "All Companies" mode
  const isAdmin = user?.role === 'admin';
  const isAllCompaniesSelected = isAdmin && (selectedCompany === 'all' || selectedCompany === 'ALL');
  
  // ✅ Track if we need to show company selector (only when 'all' is selected)
  const needsCompanySelection = isAllCompaniesSelected;
  
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [showCompanyError, setShowCompanyError] = useState(false);

  // The company whose customer is actually being created/edited right now —
  // either the one picked in the "All Companies" selector, or the app's
  // currently active company.
  const activeCompanyId = needsCompanySelection ? selectedCompanyId : selectedCompany;
  const isSaudiCompany = useMemo(
    () => companies.find(c => c._id === activeCompanyId)?.zohoOrganizationId === SAUDI_COMPANY_ZOHO_ORG_ID,
    [companies, activeCompanyId]
  );

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    companyName: '',
    website: '',
    notes: '',
    taxTreatment: 'non_vat_registered',
    trnExpiryDate: '',
    taxRegistrationNumber: '',
    tradeLicenseNumber: '',
    tradeLicenseExpiryDate: '',
    placeOfSupply: 'Dubai',
    defaultCurrency: 'AED',
    contactPersons: [],
    mainContactSalutation: 'Mr.'
  });
  // Display-only — the primary contact's own name/email/phone, which can
  // diverge from the customer's own top-level fields (e.g. set via a
  // quotation's contact sync). Not submitted on save; the backend preserves
  // whatever's already there for the primary contact.
  const [mainContactInfo, setMainContactInfo] = useState(null);

  const [errors, setErrors] = useState({});
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactIndex, setEditingContactIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [touched, setTouched] = useState({});
  const [validationAttempted, setValidationAttempted] = useState(false);

  const [contactForm, setContactForm] = useState({
    salutation: '', firstName: '', lastName: '', email: '',
    workPhone: '', mobile: '', designation: '', department: '', notes: ''
  });

  const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Miss', 'Master'];
  const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
  const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'United Arab Emirates'];

  const CURRENCY_OPTIONS = [
    { code: 'AED', label: '🇦🇪 AED', symbol: 'د.إ' },
    { code: 'AUD', label: '🇦🇺 AUD', symbol: 'A$' },
    { code: 'BHD', label: '🇧🇭 BHD', symbol: '.د.ب' },
    { code: 'BND', label: '🇧🇳 BND', symbol: 'B$' },
    { code: 'CAD', label: '🇨🇦 CAD', symbol: 'C$' },
    { code: 'CNY', label: '🇨🇳 CNY', symbol: '¥' },
    { code: 'EUR', label: '🇪🇺 EUR', symbol: '€' },
    { code: 'GBP', label: '🇬🇧 GBP', symbol: '£' },
    { code: 'INR', label: '🇮🇳 INR', symbol: '₹' },
    { code: 'JPY', label: '🇯🇵 JPY', symbol: '¥' },
    { code: 'KWD', label: '🇰🇼 KWD', symbol: 'د.ك' },
    { code: 'OMR', label: '🇴🇲 OMR', symbol: 'ر.ع.' },
    { code: 'QAR', label: '🇶🇦 QAR', symbol: 'ر.ق' },
    { code: 'SAR', label: '🇸🇦 SAR', symbol: 'ر.س' },
    { code: 'USD', label: '🇺🇸 USD', symbol: '$' },
    { code: 'ZAR', label: '🇿🇦 ZAR', symbol: 'R' }
  ];

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset company selection based on mode
      if (needsCompanySelection) {
        setSelectedCompanyId(''); // User must pick a company
      } else {
        // When a specific company is selected, use that company ID
        setSelectedCompanyId(selectedCompany || '');
      }
      setShowCompanyError(false);
      setValidationAttempted(false);
      
      if (initialData) {
        // Find the contact actually flagged primary rather than assuming
        // it's always at index 0 — a Zoho pull-sync can return contacts in
        // a different order, which would otherwise silently show the wrong
        // person as "main contact" here.
        const contactPersonsList = initialData.contactPersons || [];
        const mainContactIndex = contactPersonsList.findIndex(cp => cp.isPrimaryContact === true);
        const resolvedMainIndex = mainContactIndex !== -1 ? mainContactIndex : 0;
        const mainContact = contactPersonsList[resolvedMainIndex] || {};
        setFormData({
          name: initialData.name || '',
          email: initialData.email || '',
          phone: initialData.phone || '',
          address: initialData.address || '',
          city: initialData.city || '',
          state: initialData.state || '',
          zipcode: initialData.zipcode || '',
          companyName: initialData.companyName || '',
          website: initialData.website || '',
          notes: initialData.notes || '',
          taxTreatment: initialData.taxTreatment || 'non_vat_registered',
          taxRegistrationNumber: initialData.taxRegistrationNumber || '',
          trnExpiryDate: initialData.trnExpiryDate
            ? new Date(initialData.trnExpiryDate).toISOString().split('T')[0]
            : '',
          tradeLicenseNumber: initialData.tradeLicenseNumber || '',
          tradeLicenseExpiryDate: initialData.tradeLicenseExpiryDate
            ? new Date(initialData.tradeLicenseExpiryDate).toISOString().split('T')[0]
            : '',
          placeOfSupply: initialData.placeOfSupply || 'Dubai',
          defaultCurrency: initialData.defaultCurrency?.code || 'AED',
          contactPersons: contactPersonsList.filter((_, idx) => idx !== resolvedMainIndex),
          mainContactSalutation: mainContact.salutation || 'Mr.'
        });
        setMainContactInfo(mainContact.firstName?.trim() ? mainContact : null);
      } else {
        setMainContactInfo(null);
        setFormData({
          name: '', email: '', phone: '', address: '', city: '', state: '', zipcode: '',
          companyName: '', website: '', notes: '',
          taxTreatment: isSaudiCompany ? 'gcc_non_vat_registered' : 'non_vat_registered',
          taxRegistrationNumber: '', trnExpiryDate: '',
          tradeLicenseNumber: '', tradeLicenseExpiryDate: '',
          placeOfSupply: isSaudiCompany ? 'Saudi Arabia' : 'Dubai',
          defaultCurrency: 'AED',
          contactPersons: [], mainContactSalutation: 'Mr.'
        });
      }
      setErrors({});
      setTouched({});
      setShowContactForm(false);
      setEditingContactIndex(null);
      setActiveTab('basic');
    }
  }, [initialData, isOpen, needsCompanySelection, selectedCompany, isSaudiCompany]);

  const isVatRegistered = useMemo(() =>
    formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'gcc_vat_registered',
    [formData.taxTreatment]
  );

  // All treatments except plain "Non-VAT Registered" require a full
  // billing address — VAT Registered and GCC VAT Registered per Zoho's VAT
  // invoicing requirement, and GCC Non-VAT Registered since a GCC contact's
  // address is needed to establish their place of supply outside the UAE.
  const isAddressRequired = formData.taxTreatment !== 'non_vat_registered';

  // Saudi companies only ever deal with GCC-country customers — never show
  // the UAE Emirates picker for them, regardless of taxTreatment.
  const showUaeEmirates = useMemo(() =>
    !isSaudiCompany && (formData.taxTreatment === 'vat_registered' || formData.taxTreatment === 'non_vat_registered'),
    [formData.taxTreatment, isSaudiCompany]
  );

  const isGccTreatment = formData.taxTreatment === 'gcc_vat_registered' || formData.taxTreatment === 'gcc_non_vat_registered';

  // Saudi companies keep all 4 tax treatments, but the country list per
  // treatment differs from a regular UAE company: VAT Reg/Non-VAT are locked
  // to Saudi Arabia only (never a UAE emirate), while both GCC treatments
  // offer the full GCC country list — same as a UAE company's GCC options.
  const placeOfSupplyOptions = useMemo(() => {
    if (isSaudiCompany) return isGccTreatment ? GCC_COUNTRIES : ['Saudi Arabia'];
    return showUaeEmirates ? UAE_EMIRATES : GCC_COUNTRIES;
  }, [isSaudiCompany, isGccTreatment, showUaeEmirates]);

  const taxTreatmentOptions = useMemo(() => ([
    { value: 'vat_registered', label: isMobile ? 'VAT' : 'VAT Reg', desc: 'UAE VAT' },
    { value: 'non_vat_registered', label: isMobile ? 'Non-VAT' : 'Non-VAT', desc: 'UAE' },
    { value: 'gcc_vat_registered', label: isMobile ? 'GCC VAT' : 'GCC VAT', desc: 'GCC VAT' },
    { value: 'gcc_non_vat_registered', label: isMobile ? 'GCC Non' : 'GCC Non', desc: 'GCC' }
  ]), [isMobile]);

  const getTaxTreatmentColor = (treatment) => {
    const colors = {
      vat_registered: '#10b981',
      non_vat_registered: '#94a3b8',
      gcc_vat_registered: '#3b82f6',
      gcc_non_vat_registered: '#f59e0b'
    };
    return colors[treatment] || '#94a3b8';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'taxRegistrationNumber') {
      const cleaned = value.replace(/[^0-9]/g, '').slice(0, 15);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    } else if (name === 'taxTreatment') {
      const isUaeTreatment = value === 'vat_registered' || value === 'non_vat_registered';
      const defaultPlace = (isSaudiCompany || !isUaeTreatment) ? 'Saudi Arabia' : 'Dubai';
      setFormData(prev => ({
        ...prev,
        [name]: value,
        taxRegistrationNumber: '',
        trnExpiryDate: '',   
        placeOfSupply: defaultPlace
      }));
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
      if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    // Validate on blur
    const newErrors = { ...errors };
    if (field === 'name' && !formData.name?.trim()) {
      newErrors.name = 'Name required';
    } else if (field === 'name') {
      delete newErrors.name;
    }
    if (field === 'email') {
      if (!formData.email?.trim()) {
        newErrors.email = 'Email required';
      } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
        newErrors.email = 'Invalid email';
      } else {
        delete newErrors.email;
      }
    }
    if (['address', 'city', 'state'].includes(field)) {
      if (isAddressRequired && !formData[field]?.trim()) {
        newErrors[field] = `${ADDRESS_FIELD_LABELS[field]} required`;
      } else {
        delete newErrors[field];
      }
    }
    setErrors(newErrors);
  };

  const handlePhoneChange = (phoneWithCode) => {
    setFormData(prev => ({ ...prev, phone: phoneWithCode }));
    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
  };

  const handleContactWorkPhoneChange = (phoneWithCode) => {
    setContactForm(prev => ({ ...prev, workPhone: phoneWithCode }));
  };

  const handleContactMobileChange = (phoneWithCode) => {
    setContactForm(prev => ({ ...prev, mobile: phoneWithCode }));
  };

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
      alert("First Name is required");
      return;
    }
    const newContact = { ...contactForm };
    if (editingContactIndex !== null) {
      const updated = [...formData.contactPersons];
      updated[editingContactIndex] = newContact;
      setFormData(prev => ({ ...prev, contactPersons: updated }));
    } else {
      setFormData(prev => ({ ...prev, contactPersons: [...prev.contactPersons, newContact] }));
    }
    setShowContactForm(false);
    setEditingContactIndex(null);
  };

  const handleDeleteContact = (index) => {
    if (window.confirm('Delete this contact?')) {
      setFormData(prev => ({
        ...prev,
        contactPersons: prev.contactPersons.filter((_, i) => i !== index)
      }));
    }
  };

  // Enhanced validation that checks all fields
  const validateForm = () => {
    const newErrors = {};
    
    // Basic info validation
    if (!formData.name?.trim()) newErrors.name = 'Name required';
    if (!formData.email?.trim()) newErrors.email = 'Email required';
    else if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email';

    // Tax validation
    if (isVatRegistered && !formData.taxRegistrationNumber?.trim()) {
      newErrors.taxRegistrationNumber = 'TRN required';
    }

    // VAT-registered customers need a full billing address (zip code is
    // optional — not all emirates/countries use a postal code system)
    if (isAddressRequired) {
      ['address', 'city', 'state'].forEach((field) => {
        if (!formData[field]?.trim()) newErrors[field] = `${ADDRESS_FIELD_LABELS[field]} required`;
      });
    }
    
    // Company validation
    if (needsCompanySelection && !selectedCompanyId) {
      setShowCompanyError(true);
      newErrors.company = 'Please select a company';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationAttempted(true);
    
    // Mark all fields as touched to show inline errors
    const allFields = ['name', 'email', 'address', 'city', 'state'];
    const touchedFields = {};
    allFields.forEach(field => { touchedFields[field] = true; });
    setTouched(touchedFields);
    
    if (validateForm()) {
      const submitData = { ...formData };
      
      if (needsCompanySelection) {
        if (!selectedCompanyId) {
          setShowCompanyError(true);
          return;
        }
        submitData.companyId = selectedCompanyId;
      } else {
        submitData.companyId = selectedCompany;
      }
      
      onSubmit(submitData);
    } else {
      // Auto-switch to the tab that has the first error
      if (errors.name || errors.email) {
        setActiveTab('basic');
      } else if (errors.taxRegistrationNumber) {
        setActiveTab('tax');
      } else if (errors.company) {
        setActiveTab('basic');
      }
    }
  };

  const getFieldStatus = (fieldName) => {
    if ((touched[fieldName] || validationAttempted) && errors[fieldName]) return 'error';
    if ((touched[fieldName] || validationAttempted) && formData[fieldName] && !errors[fieldName]) return 'success';
    return 'default';
  };

  // Handle tab change with error scroll
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Small delay to allow DOM update before scrolling
    setTimeout(() => {
      const errorElement = document.querySelector('.error-field');
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  if (!isOpen) return null;

  const labelStyle = {
    display: 'block',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '0.35rem',
    fontSize: isMobile ? '0.7rem' : '0.85rem'
  };

  const inputStyle = {
    padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: isMobile ? '0.75rem' : '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    transition: 'all 0.2s'
  };

  const fieldGroupStyle = {
    marginBottom: isMobile ? '1rem' : '1.5rem'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <style>{`
            @keyframes modalSlideIn {
              from { opacity: 0; transform: scale(0.95) translateY(20px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideInUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .modal-animate { animation: modalSlideIn 0.3s cubic-bezier(0.34, 1.2, 0.64, 1); }
            .overlay-animate { animation: fadeIn 0.2s ease-out; }
            .tab-animate { animation: slideInUp 0.3s ease-out; }
            .error-field { border-color: #ef4444 !important; background-color: #fef2f2 !important; }
            .success-field { border-color: #10b981 !important; }
            * { box-sizing: border-box; }
          `}</style>

          <motion.div
            className="overlay-animate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
              justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : '1rem', overflowY: 'auto'
            }}
            onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
          >
            <motion.div
              className="modal-animate modal-content"
              initial={{ scale: 0.95, opacity: 0, y: isMobile ? 100 : 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: isMobile ? 100 : 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              style={{
                background: 'white', borderRadius: isMobile ? '20px 20px 0 0' : '24px', width: '100%',
                maxWidth: isMobile ? '100%' : isTablet ? '700px' : '1000px',
                maxHeight: isMobile ? '95vh' : '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                position: 'relative'
              }}
            >
              {/* Header */}
              <div style={{
                position: 'sticky', top: 0, padding: isMobile ? '1rem' : '1.5rem 2rem',
                borderBottom: '1px solid #eef2ff', background: 'white',
                zIndex: 10, borderTopLeftRadius: isMobile ? '20px' : '24px',
                borderTopRightRadius: isMobile ? '20px' : '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{
                      margin: 0, fontSize: isMobile ? '1rem' : '1.25rem',
                      fontWeight: '700', background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>
                      {initialData ? 'Edit' : 'Add'} Customer
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                      {initialData ? 'Update details' : 'Enter details'}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    disabled={isSubmitting}
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: '#f1f5f9', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <X size={isMobile ? 16 : 20} color="#64748b" />
                  </button>
                </div>

                {/* ✅ Error Summary - Shows errors from any tab */}
                <ErrorSummary
                  errors={errors}
                  onTabChange={handleTabChange}
                  setActiveTab={setActiveTab}
                />

                {/* Server/Zoho-side submission error (e.g. currency locked, stale contact-person ID) */}
                <AnimatePresence>
                  {submitError && (
                    <SubmitErrorBanner message={submitError} onDismiss={onDismissSubmitError} />
                  )}
                </AnimatePresence>

                {/* ✅ Company Selector - Show ONLY when 'All Companies' is selected */}
                {needsCompanySelection && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                    <label style={{ ...labelStyle, marginBottom: '0.5rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Layers size={isMobile ? 14 : 16} /> Select Company <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => {
                        setSelectedCompanyId(e.target.value);
                        setShowCompanyError(false);
                        if (errors.company) {
                          const newErrors = { ...errors };
                          delete newErrors.company;
                          setErrors(newErrors);
                        }
                      }}
                      style={{
                        ...inputStyle,
                        borderColor: showCompanyError ? '#ef4444' : '#bae6fd',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">-- Select a company --</option>
                      {companies.map(company => (
                        <option key={company._id} value={company._id}>
                          {company.name} {company.code ? `(${company.code})` : ''}
                        </option>
                      ))}
                    </select>
                    {showCompanyError && (
                      <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>
                        Please select a company to add this customer
                      </p>
                    )}
                  </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  {[
                    { id: 'basic', label: isMobile ? 'Basic' : 'Basic Info', icon: '👤' },
                    { id: 'tax', label: isMobile ? 'Tax' : 'Tax & Currency', icon: '💳' },
                    { id: 'contacts', label: `Contacts (${formData.contactPersons.length + (mainContactInfo ? 1 : 0)})`, icon: '👥' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      style={{
                        padding: isMobile ? '0.5rem 0.75rem' : '0.75rem 1.5rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: isMobile ? '0.7rem' : '0.875rem',
                        fontWeight: '500',
                        color: activeTab === tab.id ? '#0f172a' : '#64748b',
                        borderBottom: activeTab === tab.id ? '2px solid #0f172a' : '2px solid transparent',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        position: 'relative'
                      }}
                    >
                      <span>{tab.icon}</span> {tab.label}
                      {/* Show error indicator on tab if there are errors in that tab */}
                      {(tab.id === 'basic' && (errors.name || errors.email)) && (
                        <span style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          width: '8px',
                          height: '8px',
                          background: '#ef4444',
                          borderRadius: '50%'
                        }} />
                      )}
                      {(tab.id === 'tax' && errors.taxRegistrationNumber) && (
                        <span style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          width: '8px',
                          height: '8px',
                          background: '#ef4444',
                          borderRadius: '50%'
                        }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form content */}
              <form onSubmit={handleSubmit} style={{ padding: isMobile ? '1rem' : '2rem' }}>
                <AnimatePresence mode="wait">
                  {/* Basic Info Tab */}
                  {activeTab === 'basic' && (
                    <motion.div
                      key="basic"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Customer Name */}
                      <div style={fieldGroupStyle}>
                        <label style={labelStyle}>Customer Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '80px 1fr' : '120px 1fr',
                          gap: isMobile ? '0.5rem' : '1rem'
                        }}>
                          <select
                            name="mainContactSalutation"
                            value={formData.mainContactSalutation}
                            onChange={handleChange}
                            style={{ ...inputStyle }}
                          >
                            {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input
                            type="text"
                            name="name"
                            placeholder="Name"
                            value={formData.name}
                            onChange={handleChange}
                            onBlur={() => handleBlur('name')}
                            className={getFieldStatus('name') === 'error' ? 'error-field' : ''}
                            style={{ ...inputStyle }}
                          />
                        </div>
                        {errors.name && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.name}</p>}
                      </div>

                      {/* Email & Phone */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                        gap: isMobile ? '0.75rem' : '1.25rem',
                        marginBottom: isMobile ? '1rem' : '1.5rem'
                      }}>
                        <div>
                          <label style={labelStyle}>Email <span style={{ color: '#ef4444' }}>*</span></label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            onBlur={() => handleBlur('email')}
                            placeholder="example@mail.com"
                            className={getFieldStatus('email') === 'error' ? 'error-field' : ''}
                            style={{ ...inputStyle }}
                          />
                          {errors.email && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.email}</p>}
                        </div>
                        <div>
                          <label style={labelStyle}>Phone</label>
                          <PhoneInput
                            value={formData.phone}
                            onChange={handlePhoneChange}
                            placeholder="Number"
                            isMobile={isMobile}
                          />
                        </div>
                      </div>

                      {/* Address Section */}
                      <div style={{
                        background: '#f8fafc', borderRadius: '16px', padding: isMobile ? '1rem' : '1.5rem',
                        marginBottom: isMobile ? '1rem' : '1.5rem'
                      }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: isMobile ? '0.75rem' : '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                          📍 Address{isAddressRequired && <span style={{ color: '#ef4444' }}> *</span>}
                        </h4>
                        <div style={{ marginBottom: '0.75rem' }}>
                          <label style={labelStyle}>
                            Street Address {isAddressRequired && <span style={{ color: '#ef4444' }}>*</span>}
                          </label>
                          <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            onBlur={() => handleBlur('address')}
                            placeholder="Street address"
                            className={getFieldStatus('address') === 'error' ? 'error-field' : ''}
                            style={{ ...inputStyle }}
                          />
                          {errors.address && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.address}</p>}
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
                          gap: isMobile ? '0.5rem' : '1rem'
                        }}>
                          <div>
                            <label style={labelStyle}>City {isAddressRequired && <span style={{ color: '#ef4444' }}>*</span>}</label>
                            <input
                              type="text"
                              name="city"
                              value={formData.city || ''}
                              onChange={handleChange}
                              onBlur={() => handleBlur('city')}
                              placeholder="City"
                              className={getFieldStatus('city') === 'error' ? 'error-field' : ''}
                              style={{ ...inputStyle }}
                            />
                            {errors.city && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.city}</p>}
                          </div>
                          <div>
                            <label style={labelStyle}>State {isAddressRequired && <span style={{ color: '#ef4444' }}>*</span>}</label>
                            <input
                              type="text"
                              name="state"
                              value={formData.state || ''}
                              onChange={handleChange}
                              onBlur={() => handleBlur('state')}
                              placeholder="State"
                              className={getFieldStatus('state') === 'error' ? 'error-field' : ''}
                              style={{ ...inputStyle }}
                            />
                            {errors.state && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.state}</p>}
                          </div>
                          <div>
                            <label style={labelStyle}>Zip Code <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                            <input
                              type="text"
                              name="zipcode"
                              value={formData.zipcode || ''}
                              onChange={handleChange}
                              onBlur={() => handleBlur('zipcode')}
                              placeholder="Zip"
                              className={getFieldStatus('zipcode') === 'error' ? 'error-field' : ''}
                              style={{ ...inputStyle }}
                            />
                            {errors.zipcode && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.zipcode}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Company & Website */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                        gap: isMobile ? '0.75rem' : '1.25rem',
                        marginBottom: isMobile ? '1rem' : '1.5rem'
                      }}>
                        <div>
                          <label style={labelStyle}>Company</label>
                          <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company name" style={{ ...inputStyle }} />
                        </div>
                        <div>
                          <label style={labelStyle}>Website</label>
                          <input type="url" name="website" value={formData.website} onChange={handleChange} placeholder="https://..." style={{ ...inputStyle }} />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Tax & Currency Tab */}
                  {activeTab === 'tax' && (
                    <motion.div
                      key="tax"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Tax Treatment */}
                      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
                        <label style={labelStyle}>Tax Treatment <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${taxTreatmentOptions.length}, 1fr)`,
                          gap: isMobile ? '0.5rem' : '0.75rem'
                        }}>
                          {taxTreatmentOptions.map(treatment => {
                            const color = getTaxTreatmentColor(treatment.value);
                            return (
                              <div
                                key={treatment.value}
                                onClick={() => {
                                  const isUaeTreatment = treatment.value === 'vat_registered' || treatment.value === 'non_vat_registered';
                                  // Saudi companies are always locked to Saudi Arabia regardless
                                  // of treatment; a regular UAE company defaults to Dubai for its
                                  // UAE treatments and Saudi Arabia for its GCC treatments.
                                  const defaultPlace = (isSaudiCompany || !isUaeTreatment) ? 'Saudi Arabia' : 'Dubai';
                                  setFormData(prev => ({
                                    ...prev,
                                    taxTreatment: treatment.value,
                                    taxRegistrationNumber: '',
                                    trnExpiryDate: '',
                                    placeOfSupply: defaultPlace
                                  }));
                                }}
                                style={{
                                  padding: isMobile ? '0.75rem 0.5rem' : '1rem',
                                  borderRadius: '12px',
                                  border: `2px solid ${formData.taxTreatment === treatment.value ? color : '#e2e8f0'}`,
                                  background: formData.taxTreatment === treatment.value ? `${color}10` : 'white',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  textAlign: 'center'
                                }}
                              >
                                <div style={{ fontWeight: '700', fontSize: isMobile ? '0.65rem' : '0.875rem', color: formData.taxTreatment === treatment.value ? color : '#1e293b' }}>
                                  {treatment.label}
                                </div>
                                {!isMobile && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>{treatment.desc}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* TRN Field */}
                      <AnimatePresence>
                        {isVatRegistered && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ marginBottom: isMobile ? '1rem' : '1.5rem', overflow: 'hidden' }}
                          >
                            <div style={{ padding: isMobile ? '0.75rem' : '1.25rem', background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', borderRadius: '16px', border: '1px solid #bae6fd' }}>
                              <label style={{ ...labelStyle, color: '#0c4a6e' }}>TRN <span style={{ color: '#ef4444' }}>*</span></label>
                              <input
                                type="text"
                                name="taxRegistrationNumber"
                                placeholder="123456789012345"
                                value={formData.taxRegistrationNumber}
                                onChange={handleChange}
                                maxLength={15}
                                className={errors.taxRegistrationNumber && (touched.taxRegistrationNumber || validationAttempted) ? 'error-field' : ''}
                                style={{ ...inputStyle, background: 'white', fontFamily: 'monospace' }}
                              />
                              {errors.taxRegistrationNumber && <p style={{ color: '#ef4444', fontSize: '0.65rem', marginTop: '0.25rem', margin: 0 }}>{errors.taxRegistrationNumber}</p>}

                              {/* TRN Expiry Date */}
 <div style={{ marginTop: isMobile ? '0.75rem' : '1rem' }}>
  <label style={{ ...labelStyle, color: '#0c4a6e' }}>
    TRN Expiry Date
  </label>
  <input
    type="date"
    name="trnExpiryDate"
    value={formData.trnExpiryDate}
    onChange={handleChange}
    onClick={(e) => e.target.showPicker()} 
    style={{ 
      ...inputStyle, 
      background: 'white',
      cursor: 'pointer' 
    }}
  />
  <p style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem', margin: '0.25rem 0 0' }}>
    Leave blank if the TRN does not expire. When this date passes, the customer is automatically deactivated.
  </p>
</div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Trade License */}
                      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
                        <div style={{ padding: isMobile ? '0.75rem' : '1.25rem', background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', borderRadius: '16px', border: '1px solid #fde68a' }}>
                          <label style={{ ...labelStyle, color: '#78350f' }}>Trade License Number</label>
                          <input
                            type="text"
                            name="tradeLicenseNumber"
                            placeholder="e.g. CN-1234567"
                            value={formData.tradeLicenseNumber}
                            onChange={handleChange}
                            maxLength={30}
                            style={{ ...inputStyle, background: 'white' }}
                          />

                          <div style={{ marginTop: isMobile ? '0.75rem' : '1rem' }}>
                            <label style={{ ...labelStyle, color: '#78350f' }}>Trade License Expiry Date</label>
                            <input
                              type="date"
                              name="tradeLicenseExpiryDate"
                              value={formData.tradeLicenseExpiryDate}
                              onChange={handleChange}
                              onClick={(e) => e.target.showPicker()}
                              style={{
                                ...inputStyle,
                                background: 'white',
                                cursor: 'pointer'
                              }}
                            />
                            <p style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem', margin: '0.25rem 0 0' }}>
                              Leave blank if unknown. Helps track upcoming trade license renewals.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Place & Currency */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                        gap: isMobile ? '0.75rem' : '1.25rem'
                      }}>
                        <div>
                          <label style={labelStyle}>{showUaeEmirates ? 'Emirate' : 'Country'} <span style={{ color: '#ef4444' }}>*</span></label>
                          <select name="placeOfSupply" value={formData.placeOfSupply} onChange={handleChange} style={{ ...inputStyle }}>
                            <option value="">Select</option>
                            {placeOfSupplyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Currency <span style={{ color: '#ef4444' }}>*</span></label>
                          <select name="defaultCurrency" value={formData.defaultCurrency} onChange={handleChange} style={{ ...inputStyle }}>
                            {CURRENCY_OPTIONS.map(opt => (
                              <option key={opt.code} value={opt.code}>{opt.label}</option>
                            ))}
                          </select>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                            Choose carefully — once a quotation is created for this customer in this currency, it can no longer be changed.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Contacts Tab */}
                  {activeTab === 'contacts' && (
                    <motion.div
                      key="contacts"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1rem' : '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: isMobile ? '0.85rem' : '1rem', fontWeight: '600', color: '#1e293b' }}>Contacts</h3>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#64748b' }}>Additional persons</p>
                        </div>
                        <button
                          type="button"
                          onClick={openAddContact}
                          style={{
                            padding: isMobile ? '0.5rem 0.75rem' : '0.6rem 1.2rem',
                            background: '#0f172a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: isMobile ? '0.7rem' : '0.875rem',
                            fontWeight: '500'
                          }}
                        >
                          <Plus size={isMobile ? 14 : 16} /> Add
                        </button>
                      </div>

                      {mainContactInfo && (
                        <div style={{
                          padding: isMobile ? '0.75rem' : '1rem',
                          background: '#eff6ff',
                          borderRadius: '12px',
                          border: '1px solid #bfdbfe',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{
                              fontSize: '0.6rem', fontWeight: '700', color: '#1d4ed8', background: '#dbeafe',
                              padding: '0.15rem 0.5rem', borderRadius: '999px', letterSpacing: '0.03em'
                            }}>PRIMARY</span>
                          </div>
                          <div style={{ fontWeight: '600', fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#1e293b' }}>
                            {mainContactInfo.firstName} {mainContactInfo.lastName}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {mainContactInfo.email && <div>📧 {mainContactInfo.email}</div>}
                            {mainContactInfo.workPhone && <div>📞 {mainContactInfo.workPhone}</div>}
                            {mainContactInfo.mobile && <div>📱 {mainContactInfo.mobile}</div>}
                          </div>
                        </div>
                      )}

                      {formData.contactPersons.length === 0 ? (
                        <div style={{
                          padding: isMobile ? '2rem 1rem' : '3rem 2rem',
                          textAlign: 'center',
                          background: '#f8fafc',
                          borderRadius: '16px',
                          border: '2px dashed #e2e8f0'
                        }}>
                          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                          <p style={{ margin: 0, color: '#64748b', fontWeight: '500', fontSize: '0.8rem' }}>No contacts added</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {formData.contactPersons.map((contact, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: isMobile ? '0.75rem' : '1rem',
                                background: '#f8fafc',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
                                gap: isMobile ? '0.75rem' : '1rem'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: '600', fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#1e293b' }}>
                                  {contact.firstName} {contact.lastName}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.25rem' }}>
                                  {contact.email && <div>📧 {contact.email}</div>}
                                  {contact.workPhone && <div>📞 {contact.workPhone}</div>}
                                  {contact.mobile && <div>📱 {contact.mobile}</div>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button
                                  type="button"
                                  onClick={() => handleEditContact(idx)}
                                  style={{
                                    padding: isMobile ? '0.4rem 0.6rem' : '0.5rem 1rem',
                                    background: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: isMobile ? '0.65rem' : '0.75rem'
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContact(idx)}
                                  style={{
                                    padding: isMobile ? '0.4rem 0.6rem' : '0.5rem 1rem',
                                    background: '#fef2f2',
                                    border: '1px solid #fee2e2',
                                    color: '#ef4444',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: isMobile ? '0.65rem' : '0.75rem'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer */}
                <div style={{
                  display: 'flex',
                  gap: isMobile ? '0.75rem' : '1rem',
                  justifyContent: 'flex-end',
                  paddingTop: isMobile ? '1rem' : '1.5rem',
                  marginTop: isMobile ? '1rem' : '1.5rem',
                  borderTop: '1px solid #eef2ff'
                }}>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    style={{
                      padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem',
                      borderRadius: '10px',
                      background: '#f1f5f9',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: isMobile ? '0.75rem' : '0.875rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      padding: isMobile ? '0.6rem 1.25rem' : '0.75rem 2rem',
                      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '600',
                      fontSize: isMobile ? '0.75rem' : '0.875rem',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting ? 0.7 : 1
                    }}
                  >
                    {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>

          {/* Contact Person Modal */}
          <AnimatePresence>
            {showContactForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)', zIndex: 1100,
                  display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
                  justifyContent: 'center', padding: isMobile ? 0 : '1rem'
                }}
                onClick={() => setShowContactForm(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: isMobile ? 100 : 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: isMobile ? 100 : 20 }}
                  style={{
                    background: 'white',
                    borderRadius: isMobile ? '20px 20px 0 0' : '20px',
                    width: '100%',
                    maxWidth: isMobile ? '100%' : '660px',
                    maxHeight: isMobile ? '95vh' : '90vh',
                    overflowY: 'auto'
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ padding: isMobile ? '1rem' : '1.5rem', borderBottom: '1px solid #eef2ff' }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1.25rem', fontWeight: '600' }}>
                      {editingContactIndex !== null ? 'Edit' : 'Add'} Contact
                    </h3>
                  </div>
                  <div style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                      gap: isMobile ? '0.5rem' : '1rem',
                      marginBottom: '1rem'
                    }}>
                      <select
                        value={contactForm.salutation}
                        onChange={e => setContactForm(prev => ({ ...prev, salutation: e.target.value }))}
                        style={{ ...inputStyle, padding: isMobile ? '0.6rem 0.5rem' : '0.75rem 1rem' }}
                      >
                        {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="First Name *"
                        value={contactForm.firstName}
                        onChange={e => setContactForm(prev => ({ ...prev, firstName: e.target.value }))}
                        style={{ ...inputStyle, padding: isMobile ? '0.6rem 0.5rem' : '0.75rem 1rem' }}
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={contactForm.lastName}
                        onChange={e => setContactForm(prev => ({ ...prev, lastName: e.target.value }))}
                        style={{ ...inputStyle, padding: isMobile ? '0.6rem 0.5rem' : '0.75rem 1rem' }}
                      />
                    </div>

                    <input
                      type="email"
                      placeholder="Email"
                      value={contactForm.email}
                      onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: '1rem' }}
                    />

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                      gap: isMobile ? '0.75rem' : '1rem',
                      marginBottom: '1rem'
                    }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Work</label>
                        <PhoneInput
                          value={contactForm.workPhone}
                          onChange={handleContactWorkPhoneChange}
                          isMobile={isMobile}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: '0.3rem' }}>Mobile</label>
                        <PhoneInput
                          value={contactForm.mobile}
                          onChange={handleContactMobileChange}
                          isMobile={isMobile}
                        />
                      </div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                      gap: isMobile ? '0.75rem' : '1rem'
                    }}>
                      <input
                        type="text"
                        placeholder="Designation"
                        value={contactForm.designation}
                        onChange={e => setContactForm(prev => ({ ...prev, designation: e.target.value }))}
                        style={{ ...inputStyle }}
                      />
                      <input
                        type="text"
                        placeholder="Department"
                        value={contactForm.department}
                        onChange={e => setContactForm(prev => ({ ...prev, department: e.target.value }))}
                        style={{ ...inputStyle }}
                      />
                    </div>
                  </div>
                  <div style={{
                    padding: isMobile ? '1rem' : '1rem 1.5rem',
                    borderTop: '1px solid #eef2ff',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: isMobile ? '0.75rem' : '1rem'
                  }}>
                    <button
                      type="button"
                      onClick={() => setShowContactForm(false)}
                      style={{
                        padding: isMobile ? '0.5rem 1rem' : '0.6rem 1.2rem',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: isMobile ? '0.7rem' : '0.85rem'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveContact}
                      style={{
                        padding: isMobile ? '0.5rem 1rem' : '0.6rem 1.5rem',
                        background: '#0f172a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: isMobile ? '0.7rem' : '0.85rem'
                      }}
                    >
                      {editingContactIndex !== null ? 'Update' : 'Add'} Contact
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export default CustomerModal;