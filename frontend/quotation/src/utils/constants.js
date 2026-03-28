import { 
    FileText, Clock, RefreshCw, CheckCircle, 
    Award, Ban 
  } from 'lucide-react';
  
  // ─────────────────────────────────────────────────────────────
  // Pagination & UI Constants
  // ─────────────────────────────────────────────────────────────
  export const PAGE_SIZE_OPTIONS = [10, 20, 50];
  export const DEBOUNCE_MS = 350;
  
  // ─────────────────────────────────────────────────────────────
  // Status Configurations
  // ─────────────────────────────────────────────────────────────
  export const STATUS_CONFIG = {
    pending:      { bg: '#fef9c3', color: '#92400e', dot: '#f59e0b', label: 'Awaiting Ops Review'   },
    ops_approved: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6', label: 'Forwarded to Admin'    },
    ops_rejected: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Returned by Ops'       },
    approved:     { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved'               },
    rejected:     { bg: '#fce7f3', color: '#9d174d', dot: '#ec4899', label: 'Rejected by Admin'      },
    awarded:      { bg: '#d1fae5', color: '#065f46', dot: '#10b981', label: 'Awarded ✓'              },
    not_awarded:  { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af', label: 'Not Awarded'            },
    draft:        { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft'                  },
  };
  
  // ─────────────────────────────────────────────────────────────
  // Tab Configurations
  // ─────────────────────────────────────────────────────────────
  export const TAB_KEYS = {
    all:       { label: 'All',        Icon: FileText,    statusFilter: null                        },
    pending:   { label: 'Pending',    Icon: Clock,       statusFilter: 'pending'                   },
    in_review: { label: 'In Review',  Icon: RefreshCw,   statusFilter: 'ops_approved'              },
    approved:  { label: 'Approved',   Icon: CheckCircle, statusFilter: 'approved'                  },
    awarded:   { label: 'Awarded',    Icon: Award,       statusFilter: 'awarded'                   },
    returned:  { label: 'Returned',   Icon: Ban,         statusFilter: ['ops_rejected', 'rejected']},
  };
  
  // ─────────────────────────────────────────────────────────────
  // Deletable Statuses
  // ─────────────────────────────────────────────────────────────
  export const DELETABLE = new Set(['pending', 'ops_rejected']);
  
  // ─────────────────────────────────────────────────────────────
  // Currency Constants
  // ─────────────────────────────────────────────────────────────
  export const CURRENCY_SYMBOLS = {
    AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك',
    BHD: '.د.ب', OMR: '﷼', USD: '$', EUR: '€', GBP: '£'
  };
  
  // ─────────────────────────────────────────────────────────────
  // Quotation Template Constants
  // ─────────────────────────────────────────────────────────────
  export const MAX_IMAGE_SIZE_MB = 5;
  export const MAX_IMAGES_PER_ITEM = 6;
  export const MAX_DOCUMENT_SIZE_MB = 10;
  
  export const ALLOWED_IMAGE_TYPES = [
    "image/jpeg", 
    "image/png", 
    "image/webp", 
    "image/gif"
  ];
  
  export const ALLOWED_DOCUMENT_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
  ];
  
  // ─────────────────────────────────────────────────────────────
  // Tax Presets
  // ─────────────────────────────────────────────────────────────
  export const TAX_PRESETS = [
    { label: '0% VAT', value: 0, region: '' },
    { label: '5% VAT (UAE)', value: 5, region: 'UAE' },
    { label: '15% VAT (Saudi Arabia)', value: 15, region: 'Saudi Arabia' },
    { label: 'Manual (Enter custom %)', value: 'custom', region: '' },
  ];
  
  // ─────────────────────────────────────────────────────────────
  // Default Values
  // ─────────────────────────────────────────────────────────────
  export const DEFAULT_COMPANY_NAME = "Megarme General Contracting Co LLC";
  export const DEFAULT_CURRENCY = 'AED';
  
  // ─────────────────────────────────────────────────────────────
  // Snackbar Constants
  // ─────────────────────────────────────────────────────────────
  export const SNACK_HIDE = { show: false, message: "", type: "error" };
  export const SNACK_ERROR = (msg) => ({ show: true, message: msg, type: "error" });
  export const SNACK_SUCCESS = (msg) => ({ show: true, message: msg, type: "success" });
  
  // ─────────────────────────────────────────────────────────────
  // Date Format Options
  // ─────────────────────────────────────────────────────────────
  export const DATE_FORMAT_OPTIONS = {
    'en-IN': { day: 'numeric', month: 'short', year: 'numeric' },
    'en-GB': { day: '2-digit', month: 'short', year: 'numeric' },
    'en-AE': { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  };
  
  // ─────────────────────────────────────────────────────────────
  // Validation Messages
  // ─────────────────────────────────────────────────────────────
  export const VALIDATION_MESSAGES = {
    REQUIRED_DATE: "Creation date is required.",
    REQUIRED_EXPIRY: "Expiry date is required.",
    EXPIRY_BEFORE_DATE: "Expiry date cannot be before the creation date.",
    TAX_RANGE: "VAT must be between 0 and 100.",
    TAX_REQUIRED: "VAT is required.",
    TAX_NUMBER: "VAT must be a number.",
    DISCOUNT_RANGE: "Discount must be between 0 and 100.",
    DISCOUNT_NUMBER: "Discount must be a number.",
    REQUIRED_ITEM: "Please add at least one item.",
    REQUIRED_ITEM_SELECT: "Please select an item for all rows."
  };
  
  // ─────────────────────────────────────────────────────────────
  // Animation Keyframes
  // ─────────────────────────────────────────────────────────────
  export const ANIMATIONS = {
    SPIN: `@keyframes spin { to { transform: rotate(360deg); } }`,
    SKELETON: `@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`,
    FADE_UP: `@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }`
  };
  
  // ─────────────────────────────────────────────────────────────
  // CSS Classes
  // ─────────────────────────────────────────────────────────────
  export const CSS_CLASSES = {
    EDIT_INPUT: 'edit-input',
    FIELD_ERROR_INPUT: 'field-error-input',
    NO_PRINT: 'no-print',
    QUOTATION_CONTENT: 'quotation-content'
  };
  
  // ─────────────────────────────────────────────────────────────
  // Quotation Number Format
  // ─────────────────────────────────────────────────────────────
  export const QUOTATION_NUMBER_FORMAT = 'QT-{yy}{mm}{dd}-{rn}';