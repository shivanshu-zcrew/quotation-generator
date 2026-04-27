
// UAE Emirates
const UAE_EMIRATES = [
    'Abu Dhabi',
    'Ajman',
    'Dubai',
    'Fujairah',
    'Ras al-Khaimah',
    'Sharjah',
    'Umm al-Quwain'
  ];
  
  // GCC Countries
  const GCC_COUNTRIES = [
    { name: 'Saudi Arabia', code: 'SA' },
    { name: 'Kuwait', code: 'KW' },
    { name: 'Qatar', code: 'QA' },
    { name: 'Bahrain', code: 'BH' },
    { name: 'Oman', code: 'OM' }
  ];
  
  const GCC_COUNTRY_NAMES = GCC_COUNTRIES.map(c => c.name);
  const ALL_PLACE_OPTIONS = [...UAE_EMIRATES, ...GCC_COUNTRY_NAMES];
  
  // Tax Treatments
  const TAX_TREATMENTS = [
    { value: 'vat_registered', label: 'VAT Registered', requiresTrn: true },
    { value: 'non_vat_registered', label: 'Non-VAT Registered', requiresTrn: false },
    { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false }
  ];
  
  const TAX_TREATMENT_VALUES = TAX_TREATMENTS.map(t => t.value);
  
  // Currencies
  const CURRENCY_OPTIONS = {
    'AED': { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham', decimalPlaces: 2, flag: '🇦🇪' },
    'SAR': { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', decimalPlaces: 2, flag: '🇸🇦' },
    'KWD': { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', decimalPlaces: 3, flag: '🇰🇼' },
    'QAR': { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', decimalPlaces: 2, flag: '🇶🇦' },
    'BHD': { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', decimalPlaces: 3, flag: '🇧🇭' },
    'OMR': { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial', decimalPlaces: 3, flag: '🇴🇲' },
    'USD': { code: 'USD', symbol: '$', name: 'US Dollar', decimalPlaces: 2, flag: '🇺🇸' },
    'EUR': { code: 'EUR', symbol: '€', name: 'Euro', decimalPlaces: 2, flag: '🇪🇺' },
    'GBP': { code: 'GBP', symbol: '£', name: 'British Pound', decimalPlaces: 2, flag: '🇬🇧' }
  };
  
  const CURRENCY_CODES = Object.keys(CURRENCY_OPTIONS);
  
  // User Roles
  const USER_ROLES = {
    USER: 'user',
    ADMIN: 'admin',
    OPS_MANAGER: 'ops_manager'
  };
  
  // Quotation Statuses
  const QUOTATION_STATUSES = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PENDING_ADMIN: 'pending_admin',
    OPS_APPROVED: 'ops_approved',
    OPS_REJECTED: 'ops_rejected',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    AWARDED: 'awarded',
    NOT_AWARDED: 'not_awarded',
    SENT: 'sent'
  };
  
  const QUOTATION_STATUS_LIST = Object.values(QUOTATION_STATUSES);
  
  module.exports = {
    UAE_EMIRATES,
    GCC_COUNTRIES,
    GCC_COUNTRY_NAMES,
    ALL_PLACE_OPTIONS,
    TAX_TREATMENTS,
    TAX_TREATMENT_VALUES,
    CURRENCY_OPTIONS,
    CURRENCY_CODES,
    USER_ROLES,
    QUOTATION_STATUSES,
    QUOTATION_STATUS_LIST
  };