const mongoose = require("mongoose");
const {
  CURRENCY_OPTIONS,
  CURRENCY_CODES,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LIST,
} = require("./constants");
const Company = require("./company");
const axios = require("axios");

// ===== EXCHANGE RATE SCHEMA =====
const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: {
    type: String,
    required: true,
    default: "AED",
  },
  rates: {
    type: Map,
    of: Number,
    required: true,
  },
  fetchedAt: {
    type: Date,
    default: Date.now,
    index: { expireAfterSeconds: 3600 },
  },
});

const ExchangeRate =
  mongoose.models.ExchangeRate ||
  mongoose.model("ExchangeRate", exchangeRateSchema);

// ===== EXCHANGE RATE SERVICE =====
class ExchangeRateService {
  // Fetch rates with `baseCurrency` as the base, i.e. open.er-api latest/{base}.
  // Returns an object meaning "1 <base> = value <currency>", always including
  // { [base]: 1 }. Callers convert a quote-currency amount INTO the base
  // currency by reading rates[targetBase]; e.g. getRates("SAR").AED is the
  // SAR->AED multiplier.
  static async getRates(baseCurrency = "AED") {
    // Declared outside try so the catch can use the cached row on API failure.
    let cached;
    try {
      cached = await ExchangeRate.findOne({ baseCurrency }).sort({
        fetchedAt: -1,
      });

      const response = await axios.get(
        `https://open.er-api.com/v6/latest/${baseCurrency}`,
        { timeout: 5000 }
      );

      if (response.data && response.data.rates) {
        return { ...response.data.rates, [baseCurrency]: 1 };
      }
      throw new Error("API failed");
    } catch (apiError) {
      if (cached) {
        return cached.rates instanceof Map
          ? Object.fromEntries(cached.rates)
          : cached.rates;
      }
      return this.getFallbackRates(baseCurrency);
    }
  }

  // Canonical AED-based table. For any requested base, derive cross-rates so
  // the returned object means "1 <base> = value <currency>".
  // rate(base -> X) = AED_TABLE[X] / AED_TABLE[base].
  static getFallbackRates(baseCurrency = "AED") {
    const AED_TABLE = {
      AED: 1,
      USD: 0.2723,
      EUR: 0.2512,
      GBP: 0.2154,
      SAR: 1.0215,
      QAR: 0.9912,
      KWD: 0.0837,
      BHD: 0.1026,
      OMR: 0.1048,
    };

    if (baseCurrency === "AED") return { ...AED_TABLE };

    const baseInAed = AED_TABLE[baseCurrency];
    if (!baseInAed) return { [baseCurrency]: 1, AED: 1 };

    const out = {};
    for (const [cur, aedRate] of Object.entries(AED_TABLE)) {
      out[cur] = aedRate / baseInAed;
    }
    out[baseCurrency] = 1;
    return out;
  }

  static async convert(amount, fromCurrency, toCurrency = "AED") {
    if (fromCurrency === toCurrency) return amount;
    const rates = await this.getRates(fromCurrency);
    return amount * (rates[toCurrency] || 1);
  }
}

// ===== SUB-SCHEMAS =====
// Internal documents — supports S3 (current) and Cloudinary (legacy).
// Legacy fields are optional so old records still validate; new S3 records
// validate because nothing Cloudinary-only is required.
const quotationDocumentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileType: { type: String },
  fileSize: { type: Number },

  // S3 (current)
  s3Key: { type: String },
  storageProvider: { type: String, enum: ["s3", "cloudinary"], default: "s3" },

  // Cloudinary (legacy) — optional
  fileUrl: { type: String },
  publicId: { type: String },

  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  description: { type: String, default: "" },
});

// Review comments — reviewer (ops_manager/admin) annotations anchored to a
// highlighted quote inside an item description, an item's qty/unit/price/
// total, the terms & conditions text, a header field, or the remark. Not
// restricted to a fixed enum — targetKey namespaces sub-targets within a
// type (e.g. `${itemId}:qty`) so new commentable spots on the frontend never
// need a matching schema change. Anchored by quote+context rather than
// offsets since the underlying text can be edited/reloaded (see
// quotationSchema.reviewComments).
const reviewCommentSchema = new mongoose.Schema({
  targetType: { type: String, required: true, trim: true },
  targetKey: { type: String, required: true, trim: true }, // e.g. item._id | `${item._id}:qty` | 'terms' | header field name
  quote: { type: String, required: true, trim: true },
  prefix: { type: String, default: "" },
  suffix: { type: String, default: "" },
  comment: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdBySnapshot: {
    name: String,
    email: String,
    role: String,
  },
  createdAt: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedAt: { type: Date },
});

const quotationItemSchema = new mongoose.Schema(
  {

    zohoItemId: {
      type: String,
      index: true,
    },
    description: { type: String, default: "" },
    unit: { type: String, default: "", trim: true },
    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      set: (v) => Math.round(v * 100) / 100,
    },
    unitPriceInBaseCurrency: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    totalPrice: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    totalPriceInBaseCurrency: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    // S3 (current)
    imageS3Keys: [{ type: String }],
    storageProvider: { type: String, enum: ["s3", "cloudinary"], default: "s3" },
    // Cloudinary (legacy)
    imagePaths: [{ type: String }],
    imagePublicIds: [{ type: String }],
  }
  // Items get a real, stable _id (unlike before) so review comments can
  // anchor to a specific item across loads/saves — see reviewCommentSchema.
);

// ===== MAIN QUOTATION SCHEMA =====
const quotationSchema = new mongoose.Schema(
  {
    // Company reference
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    companySnapshot: {
      code: String,
      name: String,
      address: String,
      phone: String,
      email: String,
      vatNumber: String,
      crNumber: String,
      logo: String,
      zohoOrganizationId: String,
      // NEW: Focal Point Designation (for right side header)
      focalPointDesignation: { type: String, default: "" },
      bankDetails: {
        bankName: String,
        accountName: String,
        accountNumber: String,
        iban: String,
        swift: String,
      },
    },

    // Currency
    currency: {
      code: {
        type: String,
        required: true,
        enum: CURRENCY_CODES,
      },
      symbol: { type: String, required: true },
      name: { type: String, required: true },
      decimalPlaces: { type: Number, default: 2 },
      exchangeRate: {
        rate: { type: Number, required: true, min: 0 },
        baseCurrency: { type: String, required: true, default: "AED" },
        fetchedAt: { type: Date, required: true, default: Date.now },
      },
    },

    // Core fields
    quotationNumber: { type: String, required: true, index: true },

    // NEW: Scope of Work
    scopeOfWork: { type: String, default: "" },

    // Customer
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customerSnapshot: {
      name: { type: String, required: true },
      // Manually-entered contact person for this quotation (kept separate
      // from `name`, which is the client's company name).
      contactPerson: { type: String, trim: true, default: "" },
      email: String,
      phone: String,
      address: String,
      country: { type: String, default: "UAE" },
      vatNumber: String,
      // NEW: Customer designation (for left side header)
      designation: { type: String, default: "" },
      // NEW: Separate trade license number (different from VAT)
      tradeLicenseNumber: { type: String, default: "" },
      taxTreatment: { type: String, default: "non_vat_registered" },
      placeOfSupply: { type: String, default: "Dubai" },
    },
    contact: { type: String, default: "" },
    customerTaxTreatment: {
      type: String,
      default: "non_vat_registered",
      enum: [
        "non_vat_registered",
        "vat_registered",
        "gcc_non_vat_registered",
        "gcc_vat_registered",
      ],
    },
    customerPlaceOfSupply: {
      type: String,
      default: "Dubai",
    },
    // Dates
    date: { type: Date, default: Date.now, index: true },
    expiryDate: { type: Date, required: true, index: true },
    queryDate: { type: Date, default: null },

    // References
    ourRef: { type: String, default: "" },
    ourContact: { type: String, default: "" },
    // NEW: Our Focal Point Designation (separate from companySnapshot)
    ourFocalPointDesignation: { type: String, default: "" },
    salesManagerEmail: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    deliveryTerms: { type: String, default: "" },
    tl: { type: String, default: "" },
    trn: { type: String, default: "" },
    projectName: { type: String, index: true },

    // Items
    items: [quotationItemSchema],

    // Tax & Discount
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },

    // Totals (in selected currency)
    subtotal: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    taxAmount: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    discountAmount: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    total: {
      type: Number,
      required: true,
      index: true,
      set: (v) => Math.round(v * 100) / 100,
    },

    // Totals (in base currency)
    subtotalInBaseCurrency: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    taxAmountInBaseCurrency: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    discountAmountInBaseCurrency: {
      type: Number,
      required: true,
      set: (v) => Math.round(v * 100) / 100,
    },
    totalInBaseCurrency: {
      type: Number,
      required: true,
      index: true,
      set: (v) => Math.round(v * 100) / 100,
    },

    // Notes & Terms
    notes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    // Which saved Terms & Conditions template (if any) this quotation's text
    // was loaded from — lets the edit screen pre-select the same template in
    // its dropdown instead of re-deriving it via fragile content matching.
    termsTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "TermsTemplate", default: null },
    // Terms images — supports S3 (current) and Cloudinary (legacy).
    // url/publicId are NO LONGER required so S3 records (s3Key only) validate.
    termsImages: [
      {
        // S3 (current)
        s3Key: { type: String },
        storageProvider: { type: String, enum: ["s3", "cloudinary"], default: "s3" },
        // Cloudinary (legacy) — optional
        url: { type: String },
        publicId: { type: String },
        fileName: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    internalDocuments: [quotationDocumentSchema],
    remark: {
      type: String,
      default: '',
      trim: true
    },
    // Status
    status: {
      type: String,
      enum: QUOTATION_STATUS_LIST,
      default: QUOTATION_STATUSES.PENDING,
      index: true,
    },

    // User references
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdBySnapshot: {
      name: String,
      email: String,
      role: String,
    },

    // Ops review
    opsApprovedBySnapshot: {
      name: String,
      email: String,
      role: String,
      approvedAt: { type: Date, default: Date.now },
    },
    opsApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    opsApprovedAt: { type: Date },
    opsRejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    opsRejectedAt: { type: Date },
    opsRejectionReason: { type: String, default: "" },

    // Admin review
    approvedBySnapshot: {
      name: String,
      email: String,
      role: String,
      approvedAt: { type: Date, default: Date.now },
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, default: "" },

    // Inline review comments (highlight-and-comment annotations)
    reviewComments: [reviewCommentSchema],

    // Zoho sync
    zohoEstimateId: { type: String, default: null, index: true, sparse: true },
    zohoEstimateNumber: { type: String, default: null },
    zohoEstimateUrl: { type: String, default: null },
    zohoSyncedAt: { type: Date, default: null },

    // Award
    awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    awardedAt: { type: Date },
    awardNote: { type: String, default: "" },
    // Atomic claim flag so two near-simultaneous "Award" requests (e.g. a
    // double-click) can't both pass the status check and each independently
    // create a Zoho estimate — see awardQuotation's findOneAndUpdate guard.
    awardInProgress: { type: Boolean, default: false },

    // Revision (set when an in-place revision is made from a cancelled-post-approval quotation)
    revisedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Quotation", default: null, index: true },
    revisionNote: { type: String, default: "" },
    revisionNumber: { type: Number, default: 0 },
    isRevision: { type: Boolean, default: false },

    // Amendment (set when editing a cancelled-pre-approval quotation in-place)
    isAmendment: { type: Boolean, default: false },
    amendmentNote: { type: String, default: "" },

    // Cancellation metadata
    cancelledFromStatus: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledBySnapshot: {
      name: { type: String },
      email: { type: String },
      role: { type: String },
    },
    cancelReason: { type: String, default: "" },

    // Duplicate reference (set when duplicating an old quotation)
    duplicatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Quotation", default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ===== INDEXES =====
quotationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
quotationSchema.index({ companyId: 1, date: -1 });
quotationSchema.index({ companyId: 1, customerId: 1 });
quotationSchema.index({ companyId: 1, createdBy: 1 });
quotationSchema.index({ companyId: 1, quotationNumber: 1 }, { unique: true });
quotationSchema.index({ companyId: 1, totalInBaseCurrency: 1 });
quotationSchema.index({ companyId: 1, queryDate: 1 });

// Full-text search index — replaces per-field $regex (collection scans).
// MongoDB tokenises on hyphens/spaces, so "QUO-2025-001" → tokens QUO, 2025, 001.
// Weights prioritise quotation number matches over name/contact/project.
quotationSchema.index(
  { quotationNumber: 'text', 'customerSnapshot.name': 'text', contact: 'text', projectName: 'text' },
  { name: 'quotation_text_search', weights: { quotationNumber: 10, 'customerSnapshot.name': 5, contact: 3, projectName: 2 } }
);

// ===== PRE-SAVE MIDDLEWARE =====
quotationSchema.pre("save", async function (next) {
  try {
    if (this.isNew || this.isModified("companyId")) {
      const company = await Company.findById(this.companyId);
      if (company) {
        this.companySnapshot = {
          code: company.code,
          name: company.name,
          address: company.address?.street
            ? `${company.address.street}, ${company.address.city}, ${company.address.country}`
            : company.address,
          phone: company.phone,
          email: company.email,
          vatNumber: company.vatNumber,
          crNumber: company.crNumber,
          logo: company.logo,
          zohoOrganizationId: company.zohoOrganizationId,
          // Preserve existing focal point designation or set default
          focalPointDesignation: this.companySnapshot?.focalPointDesignation || "",
          bankDetails: company.bankDetails,
        };
      }
    }

    if (this.isModified("currency.code")) {
      const currency = CURRENCY_OPTIONS[this.currency.code];
      if (currency) {
        this.currency.symbol = currency.symbol;
        this.currency.name = currency.name;
        this.currency.decimalPlaces = currency.decimalPlaces;
      }
    }

    if (this.isNew || this.isModified("customerId")) {
      const Customer = mongoose.model("Customer");
      const customer = await Customer.findById(this.customerId);
      if (customer && this.customerSnapshot) {
        this.customerSnapshot.taxTreatment =
          customer.taxTreatment || "non_vat_registered";
        this.customerSnapshot.placeOfSupply = customer.placeOfSupply || "Dubai";
        // Preserve any existing customer snapshot fields that might have been set manually
        this.customerSnapshot.designation = this.customerSnapshot?.designation || "";
        this.customerSnapshot.tradeLicenseNumber = this.customerSnapshot?.tradeLicenseNumber || "";
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// ===== AUTO-POPULATE =====
// List endpoints (getAllQuotations/getMyQuotations) call listPopulate()
// specifically to keep this lightweight for a paginated table — but since
// Mongoose stores populate() options per-path and this hook's own calls ran
// AFTER the caller's (at query-execution time, not query-build time), the
// hook's wider field selections always silently won, and the 4 approval-
// chain refs (opsApprovedBy/approvedBy/awardedBy/companyId) got populated
// regardless — 6 unconditional extra lookups per list request, not just on
// single-document detail views where they're actually shown. Callers that
// only need the light version now pass `{ minimalPopulate: true }` via
// .setOptions(...) (see listPopulate in quotationController.js).
quotationSchema.pre(/^find/, function (next) {
  if (this.getOptions().minimalPopulate) {
    this.populate("customerId", "name");
    this.populate("createdBy", "name");
    next();
    return;
  }
  this.populate("customerId", "name email phone address designation tradeLicenseNumber");
  this.populate("createdBy", "name email role");
  this.populate("opsApprovedBy", "name email");
  this.populate("approvedBy", "name email");
  this.populate("awardedBy", "name email");
  this.populate("companyId", "name code baseCurrency logo zohoOrganizationId focalPointDesignation");
  next();
});

// ===== VIRTUALS =====
quotationSchema.virtual("totalFormatted").get(function () {
  return `${
    this.currency.symbol
  } ${this.total.toFixed(this.currency.decimalPlaces || 2)}`;
});

quotationSchema.virtual("totalInBaseFormatted").get(function () {
  return `AED ${this.totalInBaseCurrency.toFixed(2)}`;
});

quotationSchema.virtual("isExpired").get(function () {
  return this.expiryDate && new Date(this.expiryDate) < new Date();
});

// Helper virtual to get complete header info (left side)
quotationSchema.virtual("customerHeaderInfo").get(function () {
  return {
    projectName: this.projectName,
    scopeOfWork: this.scopeOfWork,
    companyName: this.customerSnapshot?.name,
    name: this.customerSnapshot?.name,
    phone: this.customerSnapshot?.phone,
    email: this.customerSnapshot?.email,
    designation: this.customerSnapshot?.designation,
    tradeLicenseNumber: this.customerSnapshot?.tradeLicenseNumber || this.customerSnapshot?.vatNumber,
    taxRegistrationNumber: this.customerSnapshot?.vatNumber,
  };
});

// Helper virtual to get complete header info (right side)
quotationSchema.virtual("companyHeaderInfo").get(function () {
  return {
    focalPoint: this.ourContact || this.createdBySnapshot?.name,
    phone: this.companySnapshot?.phone,
    email: this.companySnapshot?.email,
    designation: this.ourFocalPointDesignation || this.companySnapshot?.focalPointDesignation || this.createdBySnapshot?.role,
    tradeLicenseNumber: this.companySnapshot?.crNumber,
    taxRegistrationNumber: this.companySnapshot?.vatNumber,
  };
});

// ===== STATIC METHODS =====
quotationSchema.statics.getForCompany = function (
  companyId,
  query = {},
  pagination = {}
) {
  const { page = 1, limit = 20, sort = { createdAt: -1 } } = pagination;
  return this.find({ companyId, ...query })
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

quotationSchema.statics.getStatsForCompany = async function (companyId) {
  const byStatus = await this.aggregate([
    { $match: { companyId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const totalValue = await this.aggregate([
    { $match: { companyId, status: { $in: ["approved", "awarded"] } } },
    { $group: { _id: null, total: { $sum: "$totalInBaseCurrency" } } },
  ]);

  const counts = { total: byStatus.reduce((sum, s) => sum + s.count, 0) };
  byStatus.forEach((item) => {
    counts[item._id] = item.count;
  });

  return {
    counts,
    totalApprovedValue: totalValue[0]?.total || 0,
  };
};

quotationSchema.statics.convertAmount = ExchangeRateService.convert;

// ===== INSTANCE METHODS =====
quotationSchema.methods.belongsToCompany = function (companyId) {
  return this.companyId.toString() === companyId.toString();
};

// Helper method to get formatted header for PDF generation
quotationSchema.methods.getFormattedHeader = function () {
  return {
    left: {
      projectName: this.projectName || "",
      scopeOfWork: this.scopeOfWork || "",
      companyName: this.customerSnapshot?.name || "",
      name: this.customerSnapshot?.name || "",
      phone: this.customerSnapshot?.phone || "",
      email: this.customerSnapshot?.email || "",
      designation: this.customerSnapshot?.designation || "",
      tradeLicenseNumber: this.customerSnapshot?.tradeLicenseNumber || this.customerSnapshot?.vatNumber || "",
      taxRegistrationNumber: this.customerSnapshot?.vatNumber || "",
    },
    right: {
      focalPoint: this.ourContact || this.createdBySnapshot?.name || "",
      phone: this.companySnapshot?.phone || "",
      email: this.companySnapshot?.email || "",
      designation: this.ourFocalPointDesignation || this.companySnapshot?.focalPointDesignation || this.createdBySnapshot?.role || "",
      tradeLicenseNumber: this.companySnapshot?.crNumber || "",
      taxRegistrationNumber: this.companySnapshot?.vatNumber || "",
    },
  };
};

// ===== EXPORTS =====
const Quotation =
  mongoose.models.Quotation || mongoose.model("Quotation", quotationSchema);

module.exports = {
  Quotation,
  Company: require("./company"),
  ExchangeRate,
  ExchangeRateService,
};