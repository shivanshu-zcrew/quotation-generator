import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quotationAPI, customerAPI, paymentTermAPI, termsTemplateAPI } from '../services/api';
import { useAppStore } from '../services/store';
import useCustomerStore from '../services/customerStore';
import { useItems } from './customHooks';
import {
  parseQuotationData,
  parseQuotationItems,
  parseInternalDocuments
} from '../utils/quotationUtils';
import { numberToWords } from '../utils/numberToWords';
import { newSection, htmlToSections, sectionsToHTML } from '../components/TermsCondition';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGES_PER_ITEM, MAX_IMAGE_SIZE_MB } from '../utils/constants';
import { convertS3KeyToUrl, convertBatchS3KeysToUrls } from './useS3Image';
import { uploadItemImage, uploadTermsImage } from '../utils/imageUpload';

// Whitespace-insensitive comparison for Terms & Conditions HTML — lets us
// recognize "this is the same content as saved template X" (for dropdown
// auto-select and duplicate-save prevention) without requiring a byte-exact
// match, since minor formatting differences shouldn't count as a new template.
const normalizeTemplateContent = (html) => (html || '').replace(/\s+/g, ' ').trim();

export function useQuotation() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL, BEFORE ANY CONDITIONAL RETURNS
  const { items } = useItems();
  const quotations = useAppStore((state) => state.quotations);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);
  const selectedCurrency = useAppStore((state) => state.selectedCurrency);

  // All useState hooks must be at the top
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingImgId, setEditingImgId] = useState(null);
  const [fetchedQ, setFetchedQ] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [newImages, setNewImages] = useState({});        // itemId -> [previewObjectUrl] (in-flight only)
  const [uploadingImages, setUploadingImages] = useState({}); // itemId -> true while uploading
  const [quotationData, setQuotationData] = useState({});
  const [quotationItems, setQuotationItems] = useState([]);
  const [tcSections, setTcSections] = useState([newSection()]);
  const [internalDocuments, setInternalDocuments] = useState([]);
  const [reviewComments, setReviewComments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);
  const [customerTaxTreatment, setCustomerTaxTreatment] = useState('non_vat_registered');
  const [customerPlaceOfSupply, setCustomerPlaceOfSupply] = useState('Dubai');
  const [customerContactPersons, setCustomerContactPersons] = useState([]);
  const [termsImages, setTermsImages] = useState([]);
  const [paymentTermOptions, setPaymentTermOptions] = useState([]);
  const [selectedPaymentTermId, setSelectedPaymentTermId] = useState('');
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedTermsTemplateId, setSelectedTermsTemplateId] = useState('');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [savingTermsTemplate, setSavingTermsTemplate] = useState(false);
  const [signedUrls, setSignedUrls] = useState({});
  const [signedUrlsLoaded, setSignedUrlsLoaded] = useState(false);

  // Helper functions defined before useMemo/useCallback
  const round = useCallback((num) => {
    const decimalPlaces = { KWD: 3, BHD: 3, OMR: 3 };
    const places = decimalPlaces[selectedCurrency] ?? 2;
    const factor = Math.pow(10, places);
    return Math.round((num || 0) * factor) / factor;
  }, [selectedCurrency]);

  const showSnack = useCallback((msg, type = "error") => {
    setSnackbar({ show: true, message: msg, type });
  }, []);

  // Find original quotation - must be after all hooks
  const originalQuotation = useMemo(() => {
    return (quotations || []).find((q) => q._id === id) || fetchedQ;
  }, [quotations, id, fetchedQ]);

  // The populated customerId on a quotation doesn't carry contactPersons —
  // fetch the full customer record so the Name field's dropdown can offer
  // their existing contact persons.
  const customerIdForContacts = originalQuotation?.customerId?._id || originalQuotation?.customerId || null;

  useEffect(() => {
    if (!customerIdForContacts) {
      setCustomerContactPersons([]);
      return;
    }
    let cancelled = false;
    customerAPI.getById(customerIdForContacts)
      .then((res) => {
        if (!cancelled) setCustomerContactPersons(res.data?.data?.contactPersons || []);
      })
      .catch(() => {
        if (!cancelled) setCustomerContactPersons([]);
      });
    return () => { cancelled = true; };
  }, [customerIdForContacts]);

  // Load signed URLs for S3 images when quotation loads
  useEffect(() => {
    if (!originalQuotation) return;

    const loadSignedUrls = async () => {
      setSignedUrlsLoaded(false);
      const allS3Keys = [];

      originalQuotation.items?.forEach(item => {
        if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
          allS3Keys.push(...item.imageS3Keys);
        }
      });

      originalQuotation.termsImages?.forEach(img => {
        if (img.s3Key) allS3Keys.push(img.s3Key);
      });

      originalQuotation.internalDocuments?.forEach(doc => {
        if (doc.s3Key) allS3Keys.push(doc.s3Key);
      });

      if (allS3Keys.length > 0) {
        const urls = await convertBatchS3KeysToUrls(allS3Keys);
        setSignedUrls(urls);
      }
      setSignedUrlsLoaded(true);
    };

    loadSignedUrls();
  }, [originalQuotation]);

  // Calculations - useMemo for derived values
  const subtotal = useMemo(() => {
    return round(
      quotationItems.reduce((s, i) => {
        const qty = Number(i.quantity) || 0;
        const price = Number(i.unitPrice) || 0;
        return s + round(qty * price);
      }, 0)
    );
  }, [quotationItems, round]);

  const taxPercent = Number(quotationData.tax) || 0;
  const discountPercent = Number(quotationData.discount) || 0;

  const discountAmount = useMemo(() => round((subtotal * discountPercent) / 100), [subtotal, discountPercent, round]);
  const subtotalAfterDiscount = useMemo(() => subtotal - discountAmount, [subtotal, discountAmount]);
  const taxAmount = useMemo(() => round((subtotalAfterDiscount * taxPercent) / 100), [subtotalAfterDiscount, taxPercent, round]);
  const grandTotal = useMemo(() => round(subtotalAfterDiscount + taxAmount), [subtotalAfterDiscount, taxAmount, round]);

  // numberToWords floors its input rather than rounding it, so feeding it
  // the raw grandTotal (which still carries cents) could describe a
  // different whole number than the one shown on screen, which rounds to
  // the nearest unit (see QuotationLayout's Grand Total cell). Round here
  // too so both always agree.
  const amountInWords = useMemo(() => numberToWords(Math.round(grandTotal)), [grandTotal]);

  // Fetch quotation if not in store
  useEffect(() => {
    if (!(quotations || []).find((q) => q._id === id) && id) {
      setLoading(true);
      setFetchError(null);
      quotationAPI.getById(id)
        .then((res) => setFetchedQ(res.data))
        .catch((err) => {
          console.error("Failed to fetch quotation:", err);
          setFetchError("Failed to load quotation. Please go back and try again.");
        })
        .finally(() => setLoading(false));
    }
  }, [id, quotations]);

  useEffect(() => {
    if (!originalQuotation) return;

    // Don't rebuild items from server data while editing — quotationItems is the
    // source of truth during an edit and holds unsaved uploads. Rebuilding here
    // would wipe a freshly-added image (its key isn't in originalQuotation yet).
    if (isEditing) return;

    const hasS3Keys = originalQuotation.items?.some(item =>
      item.imageS3Keys && item.imageS3Keys.length > 0
    );

    // If we have S3 keys but signed URLs are still loading, wait
    if (hasS3Keys && !signedUrlsLoaded) return;

    const parsedData = parseQuotationData(originalQuotation);
    delete parsedData.termsImage;

    setQuotationData({
      ...parsedData,
      projectName: originalQuotation.projectName || "",
      scopeOfWork: originalQuotation.scopeOfWork || "",
      remark: originalQuotation.remark || "",
      customer: originalQuotation.customer || originalQuotation.customerSnapshot?.name || "",
      customerName: originalQuotation.customerSnapshot?.contactPerson || "",
      customerPhone: originalQuotation.customerPhone || originalQuotation.contact || originalQuotation.customerSnapshot?.phone || "",
      customerEmail: originalQuotation.customerEmail || originalQuotation.customerSnapshot?.email || "",
      customerDesignation: originalQuotation.customerSnapshot?.designation || "",
      customerTradeLicenseNumber: originalQuotation.customerSnapshot?.tradeLicenseNumber || "",
      customerTaxRegistrationNumber: originalQuotation.customerSnapshot?.vatNumber || "",
      ourFocalPoint: originalQuotation.ourFocalPoint || originalQuotation.createdBySnapshot?.name || "",
      ourFocalPointDesignation: originalQuotation.ourFocalPointDesignation || originalQuotation.createdBy?.designation || "",
      ourContact: originalQuotation.ourContact || originalQuotation.createdBySnapshot?.phone || "",
      salesManagerEmail: originalQuotation.salesManagerEmail || originalQuotation.createdBySnapshot?.email || "",
      companyPhone: originalQuotation.ourContact || originalQuotation.createdBySnapshot?.phone || "",
      companyEmail: originalQuotation.salesManagerEmail || originalQuotation.createdBySnapshot?.email || "",
      date: originalQuotation.date ? new Date(originalQuotation.date).toISOString().split('T')[0] : "",
      expiryDate: originalQuotation.expiryDate ? new Date(originalQuotation.expiryDate).toISOString().split('T')[0] : "",
      queryDate: originalQuotation.queryDate ? new Date(originalQuotation.queryDate).toISOString().split('T')[0] : "",
      ourRef: originalQuotation.ourRef || "",
      paymentTerms: originalQuotation.paymentTerms || "",
      deliveryTerms: originalQuotation.deliveryTerms || "",
      // ✅ COMPANY'S TL AND TRN
      tl: originalQuotation.tl || "",
      trn: originalQuotation.trn || "",
      tax: originalQuotation.taxPercent || 0,
      discount: originalQuotation.discountPercent || 0,
      notes: originalQuotation.notes || "",
      currency: originalQuotation.currency || { code: 'AED', symbol: 'د.إ' },
    });

    // Parse items - convert S3 keys to URLs for display
    const parsedItems = parseQuotationItems(originalQuotation.items);
    const itemsWithUrls = parsedItems.map(item => {
      const s3Urls = (item.imageS3Keys || []).map(key => signedUrls[key]).filter(Boolean);
      return {
        ...item,
        imageUrls: s3Urls,
        imagePaths: item.imagePaths || [],
      };
    });
    setQuotationItems(itemsWithUrls);

    // Handle terms images
    const cloudinaryImages = originalQuotation.termsImages || [];
    const formattedTermsImages = cloudinaryImages.map((img, index) => ({
      id: img._id || `existing-img-${Date.now()}-${index}`,
      url: img.s3Key ? signedUrls[img.s3Key] : img.url,
      s3Key: img.s3Key,
      publicId: img.publicId,
      fileName: img.fileName,
      isTemp: false,
      uploadedAt: img.uploadedAt,
      storageProvider: img.storageProvider || (img.s3Key ? 's3' : 'cloudinary')
    }));
    setTermsImages(formattedTermsImages);

    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections.length ? sections : [newSection()]);

    // Handle internal documents
    const parsedDocs = parseInternalDocuments(originalQuotation.internalDocuments);
    const docsWithUrls = parsedDocs.map(doc => ({
      ...doc,
      fileUrl: doc.s3Key ? signedUrls[doc.s3Key] : doc.fileUrl
    }));
    setInternalDocuments(docsWithUrls);

    setReviewComments(originalQuotation.reviewComments || []);

    const taxTreatment = originalQuotation.customerId?.taxTreatment ||
      originalQuotation.customerTaxTreatment ||
      originalQuotation.taxTreatment ||
      'non_vat_registered';

    const placeOfSupply = originalQuotation.customerId?.placeOfSupply ||
      originalQuotation.customerPlaceOfSupply ||
      originalQuotation.placeOfSupply ||
      'Dubai';

    setCustomerTaxTreatment(taxTreatment);
    setCustomerPlaceOfSupply(placeOfSupply);

  }, [originalQuotation, signedUrls, signedUrlsLoaded, isEditing]);

  // Define all callbacks before conditional logic
  const handleDocumentUpload = useCallback(async (files, descriptions) => {
    try {
      const MAX_INTERNAL_DOCS = 5;
      const incoming = Array.from(files || []);
      if (!incoming.length) return;

      // Block zip archives (by MIME and by extension, since some browsers send
      // application/octet-stream for .zip).
      const isZip = (f) => {
        const name = (f.name || '').toLowerCase();
        const type = (f.type || '').toLowerCase();
        return name.endsWith('.zip')
          || type === 'application/zip'
          || type === 'application/x-zip-compressed'
          || type === 'multipart/x-zip';
      };

      const zipFiles = incoming.filter(isZip);
      if (zipFiles.length) {
        showSnack('ZIP files are not allowed for internal documents.', 'error');
      }
      const nonZip = incoming.filter(f => !isZip(f));
      if (!nonZip.length) return;

      // Cap total internal documents at 5 (existing saved + already-staged + new).
      const currentCount = internalDocuments.length + newDocuments.length;
      const slots = MAX_INTERNAL_DOCS - currentCount;
      if (slots <= 0) {
        showSnack(`Maximum ${MAX_INTERNAL_DOCS} internal documents allowed. You already have ${currentCount}.`, 'error');
        return;
      }

      const toProcess = nonZip.slice(0, slots);
      if (nonZip.length > slots) {
        showSnack(`Only ${slots} more document(s) allowed — adding the first ${slots}.`, 'error');
      }

      const readers = [];
      let isMounted = true;

      const base64Promises = toProcess.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          readers.push(reader);

          reader.onload = () => {
            if (isMounted) {
              resolve({
                fileData: reader.result,
                name: file.name,
                type: file.type,
                size: file.size,
              });
            } else {
              resolve(null);
            }
          };
          reader.readAsDataURL(file);
        });
      });

      const base64Files = await Promise.all(base64Promises);
      const validFiles = base64Files.filter(f => f !== null);

      const tempDocs = validFiles.map((file, index) => ({
        id: `temp-${Date.now()}-${index}-${Math.random()}`,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: file.fileData,
        description: (descriptions && descriptions[index]) || '',
        uploadedAt: new Date().toISOString(),
        isTemp: true
      }));

      setNewDocuments(prev => [...prev, ...tempDocs]);
      showSnack(`${validFiles.length} document(s) ready`, 'success');

      return () => {
        isMounted = false;
        readers.forEach(reader => {
          try {
            if (reader.readyState === 1) reader.abort();
          } catch (err) {}
        });
      };
    } catch (error) {
      console.error('Error processing documents:', error);
      showSnack('Failed to process documents', 'error');
    }
  }, [showSnack, internalDocuments.length, newDocuments.length]);

  const handleDocumentDelete = useCallback(async (docId) => {
    const isTemp = newDocuments.some(d => d.id === docId || d._id === docId);

    if (isTemp) {
      setNewDocuments(prev => prev.filter(d => d.id !== docId && d._id !== docId));
      showSnack('Document removed', 'success');
    } else {
      try {
        await quotationAPI.documents.delete(id, docId);
        setInternalDocuments(prev => prev.filter(d => d._id !== docId && d.id !== docId));
        showSnack('Document deleted', 'success');
      } catch (error) {
        console.error('Error deleting document:', error);
        const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete document';
        if (errorMessage.includes('Only the creator')) {
          showSnack('Only the quotation creator can delete internal documents', 'error');
        } else {
          showSnack(errorMessage, 'error');
        }
      }
    }
  }, [id, newDocuments, showSnack]);

  const handleAddComment = useCallback(async (payload) => {
    try {
      const res = await quotationAPI.addComment(id, payload);
      if (res?.data?.success) {
        setReviewComments(prev => [...prev, res.data.comment]);
        return { success: true };
      }
      throw new Error(res?.data?.message || 'Failed to add comment');
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to add comment';
      showSnack(errorMessage, 'error');
      return { success: false, error: errorMessage };
    }
  }, [id, showSnack]);

  const handleEditComment = useCallback(async (commentId, newText) => {
    try {
      const res = await quotationAPI.updateComment(id, commentId, { comment: newText });
      if (res?.data?.success) {
        setReviewComments(prev => prev.map(c => c._id === commentId ? res.data.comment : c));
        return { success: true };
      }
      throw new Error(res?.data?.message || 'Failed to update comment');
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update comment';
      showSnack(errorMessage, 'error');
      return { success: false, error: errorMessage };
    }
  }, [id, showSnack]);

  const handleResolveComment = useCallback(async (commentId) => {
    try {
      const res = await quotationAPI.resolveComment(id, commentId);
      if (res?.data?.success) {
        setReviewComments(prev => prev.map(c => c._id === commentId ? res.data.comment : c));
        return { success: true };
      }
      throw new Error(res?.data?.message || 'Failed to resolve comment');
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to resolve comment';
      showSnack(errorMessage, 'error');
      return { success: false, error: errorMessage };
    }
  }, [id, showSnack]);

  const handleDeleteComment = useCallback(async (commentId) => {
    try {
      const res = await quotationAPI.deleteComment(id, commentId);
      if (res?.data?.success) {
        setReviewComments(prev => prev.filter(c => c._id !== commentId));
        return { success: true };
      }
      throw new Error(res?.data?.message || 'Failed to delete comment');
    } catch (error) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete comment';
      showSnack(errorMessage, 'error');
      return { success: false, error: errorMessage };
    }
  }, [id, showSnack]);

  const handleDocumentDownload = useCallback((docId) => {
    const doc = [...internalDocuments, ...newDocuments].find(d =>
      (d._id === docId || d.id === docId)
    );
    if (doc) {
      window.open(doc.fileUrl || doc.fileData, '_blank');
    }
  }, [internalDocuments, newDocuments]);

  const handleDocumentPreview = useCallback((docId) => {
    const doc = [...internalDocuments, ...newDocuments].find(d =>
      (d._id === docId || d.id === docId)
    );
    if (!doc) return;
    if (doc.fileType?.startsWith('image/')) {
      setPreviewDoc(doc);
    } else {
      handleDocumentDownload(docId);
    }
  }, [internalDocuments, newDocuments, handleDocumentDownload]);

  const handleDataChange = useCallback((field, value) => {
    if (value === '') {
      if (field === 'tax' || field === 'discount') {
        setQuotationData((prev) => ({ ...prev, [field]: 0 }));
        return;
      }
      setQuotationData((prev) => ({ ...prev, [field]: '' }));
      return;
    }

    if (field === 'tax' || field === 'discount') {
      const result = validatePercentage(value);
      if (!result.isValid) {
        showSnack(result.error, 'error');
        return;
      }
      value = parseFloat(value) || 0;
    }

    setQuotationData((prev) => ({ ...prev, [field]: value }));
  }, [showSnack]);

  // Fetch the current company's saved Payment Terms once on mount — same
  // resource "Create Quotation" already uses (QuotationTemplate.jsx), just
  // wired into the edit-existing-quotation screen too. Company context here
  // comes from the same ambient x-company-id the rest of this app's API
  // calls already rely on (set from the global company switcher), not from
  // the specific quotation being viewed — consistent with how every other
  // company-scoped call in this app is scoped.
  useEffect(() => {
    let cancelled = false;
    paymentTermAPI.getAll()
      .then((res) => { if (!cancelled) setPaymentTermOptions(res.data?.data || []); })
      .catch(() => { if (!cancelled) setPaymentTermOptions([]); }); // failure just leaves the dropdown empty — never blocks the screen
    return () => { cancelled = true; };
  }, []);

  const handleSelectPaymentTerm = useCallback((termId) => {
    setSelectedPaymentTermId(termId);
    if (!termId) return;
    const term = paymentTermOptions.find((t) => t._id === termId);
    if (term) handleDataChange('paymentTerms', term.value);
  }, [paymentTermOptions, handleDataChange]);

  const handleDeletePaymentTerm = useCallback(async (termId) => {
    const term = paymentTermOptions.find((t) => t._id === termId);
    const confirmed = window.confirm(`Remove "${term?.value || 'this term'}" from saved payment terms?`);
    if (!confirmed) return;
    try {
      await paymentTermAPI.delete(termId);
      setPaymentTermOptions((prev) => prev.filter((t) => t._id !== termId));
      setSelectedPaymentTermId((prev) => (prev === termId ? '' : prev));
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to remove payment term', 'error');
    }
  }, [paymentTermOptions, showSnack]);

  // Same Terms & Conditions Templates resource "Create Quotation" already
  // uses (QuotationTemplate.jsx), wired into the edit-existing-quotation
  // screen too — company scope comes from the same ambient x-company-id
  // used everywhere else in this hook.
  useEffect(() => {
    let cancelled = false;
    termsTemplateAPI.getAll()
      .then((res) => { if (!cancelled) setTermsTemplates(res.data?.data || []); })
      .catch(() => { if (!cancelled) setTermsTemplates([]); }); // failure just leaves the dropdown empty — never blocks the screen
    return () => { cancelled = true; };
  }, []);

  // Pre-select the dropdown from the persisted record of which template (if
  // any) this quotation was built from — set on `quotationData.termsTemplateId`
  // by parseQuotationData() once the quotation loads. This is the source of
  // truth rather than re-deriving it by comparing HTML content, which proved
  // fragile (sanitization/formatting round-trips meant a quotation genuinely
  // built from "Template A" could fail to byte-match Template A's stored
  // content and show the dropdown as unselected).
  useEffect(() => {
    if (!termsTemplates.length) return;
    const templateId = quotationData.termsTemplateId;
    if (!templateId) return;
    const match = termsTemplates.find((t) => t._id === templateId);
    if (match) setSelectedTermsTemplateId(match._id);
  }, [termsTemplates, quotationData.termsTemplateId]);

  const handleSelectTermsTemplate = useCallback((templateId) => {
    setSelectedTermsTemplateId(templateId);
    if (!templateId) return;
    const template = termsTemplates.find((t) => t._id === templateId);
    if (!template) return;

    const hasExistingContent = tcSections.some((s) => {
      const text = (s.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      return text.length > 0 || (s.heading || '').trim().length > 0;
    });
    if (hasExistingContent) {
      const confirmed = window.confirm('Loading this template will replace your current Terms & Conditions text. Continue?');
      if (!confirmed) { setSelectedTermsTemplateId(''); return; }
    }

    setTcSections(htmlToSections(template.content, []));
  }, [termsTemplates, tcSections]);

  const handleOpenSaveTemplateModal = useCallback(() => {
    const currentContent = normalizeTemplateContent(sectionsToHTML(tcSections));
    const duplicate = termsTemplates.find((t) => normalizeTemplateContent(t.content) === currentContent);
    if (duplicate) {
      setSelectedTermsTemplateId(duplicate._id);
      showSnack(`This already matches the saved template "${duplicate.name}" — no need to save it again.`, 'info');
      return;
    }
    setShowSaveTemplateModal(true);
  }, [tcSections, termsTemplates, showSnack]);
  const handleCloseSaveTemplateModal = useCallback(() => setShowSaveTemplateModal(false), []);

  const handleSaveTermsTemplate = useCallback(async (name) => {
    setSavingTermsTemplate(true);
    try {
      const content = sectionsToHTML(tcSections);
      const res = await termsTemplateAPI.create({ name, content });
      const created = res.data?.data;
      setTermsTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTermsTemplateId(created._id);
      setShowSaveTemplateModal(false);
      showSnack('Template saved', 'success');
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to save template', 'error');
    } finally {
      setSavingTermsTemplate(false);
    }
  }, [tcSections, showSnack]);

  const handleDeleteTermsTemplate = useCallback(async (templateId) => {
    const template = termsTemplates.find((t) => t._id === templateId);
    const confirmed = window.confirm(`Delete the saved template "${template?.name || 'this template'}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await termsTemplateAPI.delete(templateId);
      setTermsTemplates((prev) => prev.filter((t) => t._id !== templateId));
      setSelectedTermsTemplateId((prev) => (prev === templateId ? '' : prev));
    } catch (err) {
      showSnack(err?.response?.data?.message || 'Failed to delete template', 'error');
    }
  }, [termsTemplates, showSnack]);

  const addItem = useCallback(() => {
    setQuotationItems((prev) => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      itemId: null,
      name: "",
      description: "",
      quantity: 1,
      unit: "",
      unitPrice: 0,
      imagePaths: [],
      imageS3Keys: [],
      imageUrls: []
    }]);
  }, []);

  const removeItem = useCallback((id) => {
    setQuotationItems((prev) => prev.filter((i) => i.id !== id));
    setNewImages((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setFieldErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
  }, []);

  const updateItem = useCallback((id, field, value) => {
    if (value === '' || value === null || value === undefined) {
      if (field === 'quantity') {
        showSnack('Quantity cannot be empty', 'error');
        return;
      }
      if (field === 'unitPrice') {
        setQuotationItems((prev) => prev.map((item) =>
          item.id === id ? { ...item, [field]: 0 } : item
        ));
        return;
      }
      if (field === 'name') {
        setQuotationItems((prev) => prev.map((item) =>
          item.id === id ? { ...item, [field]: '' } : item
        ));
        return;
      }
    }

    if (field === 'quantity') {
      const result = validateQuantity(value);
      if (!result.isValid) {
        showSnack(result.error, 'error');
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], quantity: result.error } }));
        return;
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          if (newErrors[id]) {
            delete newErrors[id].quantity;
            if (Object.keys(newErrors[id]).length === 0) delete newErrors[id];
          }
          return newErrors;
        });
      }
      value = parseFloat(value);
    }

    if (field === 'unitPrice') {
      const result = validatePrice(value);
      if (!result.isValid) {
        showSnack(result.error, 'error');
        setFieldErrors((prev) => ({ ...prev, [id]: { ...prev[id], unitPrice: result.error } }));
        return;
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          if (newErrors[id]) {
            delete newErrors[id].unitPrice;
            if (Object.keys(newErrors[id]).length === 0) delete newErrors[id];
          }
          return newErrors;
        });
      }
      value = parseFloat(value) || 0;
    }

    if (field === "itemId" && value) {
      const found = items.find((i) => i._id === value);
      setQuotationItems((prev) => prev.map((item) =>
        item.id === id ? {
          ...item,
          itemId: value,
          name: found?.name || item.name,
          description: found?.description || item.description,
          unitPrice: found?.price != null ? Number(found.price) : item.unitPrice,
        } : item
      ));
      return;
    }

    setQuotationItems((prev) => prev.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, [items, showSnack]);

  // ── S3 DIRECT UPLOAD (matches create flow) ──────────────────────────────
  // Compress + upload each file straight to S3, store the returned key in the
  // item's imageS3Keys, and resolve a signed URL into imageUrls so it displays.
  // A transient object-URL preview lives in newImages[itemId] during upload.
  const handleImageUpload = useCallback(async (e, itemId) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const item = quotationItems.find(i => i.id === itemId);
    const existingS3Count = item?.imageS3Keys?.length || 0;
    const existingPathCount = item?.imagePaths?.length || 0;
    const previewCount = (newImages[itemId] || []).length;
    const currentTotal = existingS3Count + existingPathCount + previewCount;
    const slots = MAX_IMAGES_PER_ITEM - currentTotal;

    if (slots <= 0) {
      showSnack(`Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item. You already have ${currentTotal}.`, 'error');
      return;
    }

    const toProcess = files.slice(0, slots);
    if (files.length > slots) {
      showSnack(`Only ${slots} slot(s) left — first ${slots} of ${files.length} will be added.`, 'warning');
    }

    const valid = [];
    for (const file of toProcess) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showSnack(`"${file.name}" is not a supported image type.`, 'error');
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showSnack(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`, 'error');
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;

    setUploadingImages(prev => ({ ...prev, [itemId]: true }));

    for (const file of valid) {
      const previewUrl = URL.createObjectURL(file);

      // Show preview immediately
      setNewImages(prev => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), previewUrl],
      }));

      try {
        const key = await uploadItemImage(file);
        const signedUrl = await convertS3KeyToUrl(key);

        // Attach the key + its signed URL to the item.
        setQuotationItems(prev => prev.map(it =>
          it.id === itemId
            ? {
                ...it,
                imageS3Keys: [...(it.imageS3Keys || []), key],
                imageUrls: [...(it.imageUrls || []), signedUrl].filter(Boolean),
              }
            : it
        ));
        // NOTE: do NOT setSignedUrls here. It would re-fire the rebuild effect
        // which repopulates quotationItems from originalQuotation (which has no
        // new key yet) and wipes the image we just added. The URL is stored
        // directly on the item above, which is all the display needs.

        // Remove the transient preview
        setNewImages(prev => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter(u => u !== previewUrl),
        }));
        URL.revokeObjectURL(previewUrl);
      } catch (err) {
        setNewImages(prev => ({
          ...prev,
          [itemId]: (prev[itemId] || []).filter(u => u !== previewUrl),
        }));
        URL.revokeObjectURL(previewUrl);
        showSnack(`Failed to upload "${file.name}": ${err.message}`, 'error');
      }
    }

    setUploadingImages(prev => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    setEditingImgId(null);
  }, [quotationItems, newImages, showSnack]);

  // Remove a still-uploading preview (rarely needed since previews are transient).
  const removeNewImage = useCallback((itemId, imageIndex) => {
    setNewImages(prev => {
      const current = prev[itemId] || [];
      const removed = current[imageIndex];
      if (removed) {
        try { URL.revokeObjectURL(removed); } catch (e) {}
      }
      const filtered = current.filter((_, idx) => idx !== imageIndex);
      const updated = { ...prev };
      if (filtered.length === 0) delete updated[itemId];
      else updated[itemId] = filtered;
      return updated;
    });
  }, []);

  // Remove an already-attached image. renderItemImages shows
  // [...imagePaths, ...imageUrls], so map the index accordingly.
  const removeExistingImage = useCallback((itemId, imageIndex) => {
    setQuotationItems(prevItems =>
      prevItems.map(item => {
        if (item.id !== itemId) return item;

        const currentPaths = item.imagePaths || [];      // legacy Cloudinary (rendered first)
        const currentS3Keys = item.imageS3Keys || [];
        const currentUrls = item.imageUrls || [];        // rendered after paths

        // First block: legacy imagePaths
        if (imageIndex < currentPaths.length) {
          return {
            ...item,
            imagePaths: currentPaths.filter((_, idx) => idx !== imageIndex),
          };
        }

        // Second block: S3 images (keys + their urls move together)
        const s3Index = imageIndex - currentPaths.length;
        return {
          ...item,
          imageS3Keys: currentS3Keys.filter((_, idx) => idx !== s3Index),
          imageUrls: currentUrls.filter((_, idx) => idx !== s3Index),
        };
      })
    );
  }, []);

  // Terms images now upload directly to S3 (like item images). Each file is
  // compressed, PUT to S3 under quotations/terms/, and stored with its s3Key +
  // a resolved signed URL for display. No more base64 in the payload.
  const handleTermsImagesUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const remainingSlots = 10 - termsImages.length;
    if (remainingSlots <= 0) {
      showSnack('Maximum 10 terms images allowed', 'error');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      showSnack(`Only ${remainingSlots} more image(s) allowed`, 'warning');
    }

    for (const file of filesToProcess) {
      // Already-processed image objects (re-passed) — keep as-is.
      if (!(file instanceof File)) {
        if (file.url || file.base64 || file.s3Key) {
          setTermsImages(prev => [...prev, file]);
        }
        continue;
      }

      if (!file.type.startsWith('image/')) {
        showSnack(`"${file.name}" is not a supported image type.`, 'error');
        continue;
      }

      const tempId = `terms-img-${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);

      // Show preview immediately while uploading.
      setTermsImages(prev => [...prev, {
        id: tempId,
        url: previewUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        isTemp: true,
        uploading: true,
        storageProvider: 's3',
        uploadedAt: new Date().toISOString(),
      }]);

      try {
        const key = await uploadTermsImage(file);
        const signedUrl = await convertS3KeyToUrl(key);

        // Replace the preview entry with the settled S3 image.
        setTermsImages(prev => prev.map(img =>
          img.id === tempId
            ? {
                id: tempId,
                url: signedUrl || previewUrl,
                s3Key: key,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                isTemp: false,
                uploading: false,
                storageProvider: 's3',
                uploadedAt: new Date().toISOString(),
              }
            : img
        ));
        // Only revoke the local blob if we actually have a signed URL to show
        // in its place. If the signed URL didn't resolve, keep the blob alive so
        // the thumbnail still displays (the s3Key persists for a fresh URL on reload).
        if (signedUrl && previewUrl) {
          try { URL.revokeObjectURL(previewUrl); } catch (e) {}
        }
      } catch (err) {
        // Drop the failed preview.
        setTermsImages(prev => prev.filter(img => img.id !== tempId));
        if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) {} }
        showSnack(`Failed to upload "${file.name}": ${err.message}`, 'error');
      }
    }
  }, [termsImages.length, showSnack]);

  const removeTermsImage = useCallback((imageId) => {
    setTermsImages(prev => prev.filter(img => img.id !== imageId));
    showSnack('Image removed', 'success');
  }, [showSnack]);

  const cancelEdit = useCallback(() => {
    if (!originalQuotation) return;

    const parsedData = parseQuotationData(originalQuotation);
    delete parsedData.termsImage;

    setQuotationData({
      ...parsedData,
      projectName: originalQuotation.projectName || "",
      scopeOfWork: originalQuotation.scopeOfWork || "",
      remark: originalQuotation.remark || "",
      customer: originalQuotation.customer || originalQuotation.customerSnapshot?.name || "",
      customerName: originalQuotation.customerSnapshot?.contactPerson || "",
      customerPhone: originalQuotation.customerPhone || originalQuotation.contact || originalQuotation.customerSnapshot?.phone || "",
      customerEmail: originalQuotation.customerEmail || originalQuotation.customerSnapshot?.email || "",
      customerDesignation: originalQuotation.customerSnapshot?.designation || "",
      customerTradeLicenseNumber: originalQuotation.customerSnapshot?.tradeLicenseNumber || "",
      customerTaxRegistrationNumber: originalQuotation.customerSnapshot?.vatNumber || "",
      ourFocalPoint: originalQuotation.ourFocalPoint || originalQuotation.createdBySnapshot?.name || "",
      ourFocalPointDesignation: originalQuotation.ourFocalPointDesignation || originalQuotation.createdBy?.designation || "",
      ourContact: originalQuotation.ourContact || originalQuotation.createdBySnapshot?.phone || "",
      salesManagerEmail: originalQuotation.salesManagerEmail || originalQuotation.createdBySnapshot?.email || "",
      companyPhone: originalQuotation.ourContact || originalQuotation.createdBySnapshot?.phone || "",
      companyEmail: originalQuotation.salesManagerEmail || originalQuotation.createdBySnapshot?.email || "",
      date: originalQuotation.date ? new Date(originalQuotation.date).toISOString().split('T')[0] : "",
      expiryDate: originalQuotation.expiryDate ? new Date(originalQuotation.expiryDate).toISOString().split('T')[0] : "",
      queryDate: originalQuotation.queryDate ? new Date(originalQuotation.queryDate).toISOString().split('T')[0] : "",
      ourRef: originalQuotation.ourRef || "",
      paymentTerms: originalQuotation.paymentTerms || "",
      deliveryTerms: originalQuotation.deliveryTerms || "",
      // ✅ COMPANY'S TL AND TRN
      tl: originalQuotation.tl || "",
      trn: originalQuotation.trn || "",
      tax: originalQuotation.taxPercent || 0,
      discount: originalQuotation.discountPercent || 0,
      notes: originalQuotation.notes || "",
      currency: originalQuotation.currency || { code: 'AED', symbol: 'د.إ' },
    });

    const parsedItems = parseQuotationItems(originalQuotation.items);
    const itemsWithUrls = parsedItems.map(item => ({
      ...item,
      imageUrls: (item.imageS3Keys || []).map(key => signedUrls[key]).filter(Boolean),
      imagePaths: item.imagePaths || [],
    }));
    setQuotationItems(itemsWithUrls);

    const cloudinaryImages = originalQuotation.termsImages || [];
    const formattedTermsImages = cloudinaryImages.map((img, index) => ({
      id: img._id || `existing-img-${Date.now()}-${index}`,
      url: img.s3Key ? signedUrls[img.s3Key] : img.url,
      s3Key: img.s3Key,
      publicId: img.publicId,
      fileName: img.fileName,
      isTemp: false,
      uploadedAt: img.uploadedAt
    }));
    setTermsImages(formattedTermsImages);

    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections.length ? sections : [newSection()]);

    const parsedDocs = parseInternalDocuments(originalQuotation.internalDocuments);
    const docsWithUrls = parsedDocs.map(doc => ({
      ...doc,
      fileUrl: doc.s3Key ? signedUrls[doc.s3Key] : doc.fileUrl
    }));
    setInternalDocuments(docsWithUrls);
    setNewDocuments([]);
    setNewImages({});
    setEditingImgId(null);
    setFieldErrors({});
    setIsEditing(false);

    const taxTreatment = originalQuotation.customerId?.taxTreatment ||
      originalQuotation.customerTaxTreatment ||
      originalQuotation.taxTreatment;

    const placeOfSupply = originalQuotation.customerId?.placeOfSupply ||
      originalQuotation.customerPlaceOfSupply ||
      originalQuotation.placeOfSupply ||
      'Dubai';

    setCustomerTaxTreatment(taxTreatment);
    setCustomerPlaceOfSupply(placeOfSupply);
  }, [originalQuotation, signedUrls]);

  const validateBeforeSave = useCallback(() => {
    if (!quotationItems.length) {
      showSnack("Add at least one item.", 'error');
      return false;
    }

    for (const item of quotationItems) {
      if (!item.description || !item.description.trim()) {
        showSnack(`Item description is required for all items.`, 'error');
        return false;
      }
      const quantityResult = validateQuantity(item.quantity);
      if (!quantityResult.isValid) {
        showSnack(`Item "${item.name}" has invalid quantity`, 'error');
        return false;
      }
      const priceResult = validatePrice(item.unitPrice);
      if (!priceResult.isValid) {
        showSnack(`Item "${item.name}" has invalid price`, 'error');
        return false;
      }
    }

    if (!quotationData.projectName?.trim()) {
      showSnack("Project Name is required.", 'error');
      return false;
    }
    if (!quotationData.ourFocalPoint?.trim()) {
      showSnack("Focal Point Name is required.", 'error');
      return false;
    }
    if (!quotationData.expiryDate) {
      showSnack("Expiry date is required.", 'error');
      return false;
    }

    const taxResult = validatePercentage(quotationData.tax);
    if (!taxResult.isValid) {
      showSnack(taxResult.error, 'error');
      return false;
    }
    const discountResult = validatePercentage(quotationData.discount);
    if (!discountResult.isValid) {
      showSnack(discountResult.error, 'error');
      return false;
    }

    return true;
  }, [quotationItems, quotationData, showSnack]);

// In the handleSave function, update the payload section (around lines 430-470)

const handleSave = useCallback(async () => {
  if (!validateBeforeSave()) return;

  // Block save while any image is still uploading.
  if (Object.keys(uploadingImages).length > 0) {
    showSnack("Please wait — images are still uploading.", 'error');
    return;
  }

  setIsSaving(true);
  try {
    const documentData = [
      ...internalDocuments.map(doc => ({
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        fileUrl: doc.fileUrl,
        publicId: doc.publicId,
        s3Key: doc.s3Key,
        description: doc.description || '',
      })),
      ...newDocuments.map(doc => ({
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        fileData: doc.fileData,
        description: doc.description || '',
      }))
    ];

    const taxValue = parseFloat(quotationData.tax) || 0;
    const discountValue = parseFloat(quotationData.discount) || 0;

    let finalTermsAndConditions = "";
    if (tcSections && tcSections.length > 0) {
      finalTermsAndConditions = tcSections
        .map(sec => {
          let text = "";
          if (sec.heading?.trim()) text += sec.heading + "\n\n";
          if (sec.content?.trim()) text += sec.content;
          return text.trim();
        })
        .filter(Boolean)
        .join("\n\n");
    }

    // Images are uploaded directly to S3 now — send keys only. Legacy
    // imagePaths (old Cloudinary) are preserved if present.
    const formattedItems = quotationItems.map((qi) => ({
      // Preserve the item's existing id (parseQuotationItems sets qi.id to
      // item._id when the item was already saved) so review comments stay
      // anchored to it across this save — see reviewCommentSchema. The
      // backend ignores this if it isn't a real ObjectId (e.g. a brand-new
      // item's client-side fallback id).
      ...(qi.id ? { _id: qi.id } : {}),
      itemId: qi.itemId || null,
      name: qi.name || "",
      description: qi.description || "",
      quantity: Number(qi.quantity) || 1,
      unit: qi.unit || "",
      unitPrice: Number(qi.unitPrice) || 0,
      imageS3Keys: qi.imageS3Keys || [],
      imagePaths: qi.imagePaths || []
    }));

    // Terms images: existing S3 keys vs new base64 (terms upload still base64)
    const existingTermsImages = termsImages
      .filter(img => img.s3Key && !img.url?.startsWith('data:'))
      .map(img => ({
        s3Key: img.s3Key,
        fileName: img.fileName,
        uploadedAt: img.uploadedAt,
        id: img.id,
        _id: img.id
      }));

    const newBase64Images = termsImages.filter(img => img.url && img.url.startsWith('data:'));

     const payload = {
      customerId: originalQuotation.customerId?._id || originalQuotation.customerId,

      projectName: quotationData.projectName?.trim(),
      scopeOfWork: quotationData.scopeOfWork?.trim() || "",
      remark: quotationData.remark?.trim() || "",
      
      // Customer fields (left side)
      customer: quotationData.customer?.trim(),
      customerName: quotationData.customerName?.trim() || "",
      customerPhone: quotationData.customerPhone?.trim() || "",
      customerEmail: quotationData.customerEmail?.trim() || "",
      customerDesignation: quotationData.customerDesignation?.trim() || "",
      customerTradeLicenseNumber: quotationData.customerTradeLicenseNumber?.trim() || "",
      customerTaxRegistrationNumber: quotationData.customerTaxRegistrationNumber?.trim() || "",

      contact: quotationData.customerPhone?.trim() || quotationData.contact?.trim() || "",

      // Company/Our fields (right side)
      ourFocalPoint: quotationData.ourFocalPoint?.trim() || "",
      ourFocalPointDesignation: quotationData.ourFocalPointDesignation?.trim() || "",
      ourContact: quotationData.ourContact?.trim() || "",
      salesManagerEmail: quotationData.salesManagerEmail?.trim() || "",

      date: quotationData.date,
      expiryDate: quotationData.expiryDate,
      queryDate: quotationData.queryDate || null,

      ourRef: quotationData.ourRef?.trim() || "",
      paymentTerms: quotationData.paymentTerms?.trim() || "",
      deliveryTerms: quotationData.deliveryTerms?.trim() || "",
      
      // ✅ COMPANY'S TL AND TRN (from selected company)
      tl: quotationData.tl?.trim() || "",
      trn: quotationData.trn?.trim() || "",
      
      taxPercent: taxValue,
      discountPercent: discountValue,
      notes: quotationData.notes?.trim() || "",

      termsAndConditions: finalTermsAndConditions,
      termsTemplateId: selectedTermsTemplateId || undefined,
      termsImages: newBase64Images,
      existingTermsImages: existingTermsImages,

      items: formattedItems,
      internalDocuments: documentData
        .filter(doc => doc.fileData)
        .map(doc => doc.fileData),
      internalDocDescriptions: documentData
        .filter(doc => doc.fileData)
        .map(doc => doc.description || '')
    };

    const result = await updateQuotation(originalQuotation._id, payload);

    if (result?.success) {
      const updatedQuotation = result.quotation;

      // The backend echoes back the customer's up-to-date contactPersons
      // (after the quotation's contact was added/merged into it) so the Name
      // field's dropdown reflects the change immediately, without waiting
      // for a fresh page load.
      if (result.customerContactPersons) {
        setCustomerContactPersons(result.customerContactPersons);
        // Also patch the customer picker's cache (used by "create new
        // quotation") so it doesn't keep serving a stale contact list until
        // a full page reload.
        if (customerIdForContacts) {
          useCustomerStore.getState().updateCustomerContactPersons(customerIdForContacts, result.customerContactPersons);
        }
      }

      if (updatedQuotation) {
        setFetchedQ(updatedQuotation);

        setQuotationData({
          projectName: updatedQuotation.projectName || "",
          scopeOfWork: updatedQuotation.scopeOfWork || "",
          remark: updatedQuotation.remark || "",
          customer: updatedQuotation.customer || updatedQuotation.customerSnapshot?.name || "",
          customerName: updatedQuotation.customerSnapshot?.contactPerson || "",
          customerPhone: updatedQuotation.customerPhone || updatedQuotation.contact || updatedQuotation.customerSnapshot?.phone || "",
          customerEmail: updatedQuotation.customerEmail || updatedQuotation.customerSnapshot?.email || "",
          customerDesignation: updatedQuotation.customerDesignation || updatedQuotation.customerSnapshot?.designation || "",
          customerTradeLicenseNumber: updatedQuotation.customerTradeLicenseNumber || updatedQuotation.customerSnapshot?.tradeLicenseNumber || "",
          customerTaxRegistrationNumber: updatedQuotation.customerTaxRegistrationNumber || updatedQuotation.customerSnapshot?.vatNumber || "",
          ourFocalPoint: updatedQuotation.ourFocalPoint || updatedQuotation.createdBySnapshot?.name || "",
          ourFocalPointDesignation: updatedQuotation.ourFocalPointDesignation || updatedQuotation.createdBy?.designation || "",
          ourContact: updatedQuotation.ourContact || updatedQuotation.createdBySnapshot?.phone || "",
          salesManagerEmail: updatedQuotation.salesManagerEmail || updatedQuotation.createdBySnapshot?.email || "",
          companyPhone: updatedQuotation.ourContact || updatedQuotation.createdBySnapshot?.phone || "",
          companyEmail: updatedQuotation.salesManagerEmail || updatedQuotation.createdBySnapshot?.email || "",
          date: updatedQuotation.date ? new Date(updatedQuotation.date).toISOString().split('T')[0] : "",
          expiryDate: updatedQuotation.expiryDate ? new Date(updatedQuotation.expiryDate).toISOString().split('T')[0] : "",
          queryDate: updatedQuotation.queryDate ? new Date(updatedQuotation.queryDate).toISOString().split('T')[0] : "",
          ourRef: updatedQuotation.ourRef || "",
          paymentTerms: updatedQuotation.paymentTerms || "",
          deliveryTerms: updatedQuotation.deliveryTerms || "",
          // ✅ Update company TL and TRN from response
          tl: updatedQuotation.tl || "",
          trn: updatedQuotation.trn || "",
          tax: updatedQuotation.taxPercent || 0,
          discount: updatedQuotation.discountPercent || 0,
          notes: updatedQuotation.notes || "",
          currency: updatedQuotation.currency || { code: 'AED', symbol: 'د.إ' },
        });

        // Re-resolve signed URLs for the saved items AND terms images
        const updatedItems = parseQuotationItems(updatedQuotation.items);
        const serverTermsImages = updatedQuotation.termsImages || [];
        const allKeys = [];
        updatedItems.forEach(it => (it.imageS3Keys || []).forEach(k => { if (k) allKeys.push(k); }));
        serverTermsImages.forEach(img => { if (img.s3Key) allKeys.push(img.s3Key); });
        let freshUrls = signedUrls;
        if (allKeys.length > 0) {
          const fetched = await convertBatchS3KeysToUrls(allKeys);
          freshUrls = { ...signedUrls, ...fetched };
          setSignedUrls(freshUrls);
        }
        const itemsWithUrls = updatedItems.map(item => ({
          ...item,
          imageUrls: (item.imageS3Keys || []).map(k => freshUrls[k]).filter(Boolean),
          imagePaths: item.imagePaths || [],
        }));
        setQuotationItems(itemsWithUrls);

        setTermsImages(serverTermsImages.map(img => ({
          id: img._id || `img-${Date.now()}`,
          url: img.s3Key ? freshUrls[img.s3Key] : img.url,
          s3Key: img.s3Key,
          publicId: img.publicId,
          fileName: img.fileName,
          isTemp: false,
          uploadedAt: img.uploadedAt,
          storageProvider: img.storageProvider || (img.s3Key ? 's3' : 'cloudinary')
        })));

        const sections = htmlToSections(updatedQuotation.termsAndConditions, serverTermsImages);
        setTcSections(sections.length ? sections : [newSection()]);

        setInternalDocuments(parseInternalDocuments(updatedQuotation.internalDocuments));
      }

      showSnack("Quotation updated successfully!", 'success');
      // Remember this payment terms value for reuse on future quotations —
      // fire-and-forget, must never surface an error or block the already-
      // successful save. There's no dropdown on this edit screen yet (see
      // plan), but this still feeds the reusable list new quotations use.
      if (payload.paymentTerms?.trim()) {
        paymentTermAPI.create({ value: payload.paymentTerms.trim() }).catch(() => {});
      }
      setIsEditing(false);
      setEditingImgId(null);
      setNewImages({});
      setNewDocuments([]);
      setFieldErrors({});
    } else {
      showSnack(result?.error || "Failed to update quotation", 'error');
    }
  } catch (err) {
    console.error("Save error:", err);
    showSnack("Error saving quotation: " + (err.message || "Unknown error"), 'error');
  } finally {
    setIsSaving(false);
  }
}, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newDocuments,
    internalDocuments, tcSections, termsImages, updateQuotation, showSnack, signedUrls, uploadingImages,
    customerIdForContacts, selectedTermsTemplateId]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) return;

    const result = await deleteQuotation(originalQuotation._id);
    if (result?.success) {
      navigate(-1);
    } else {
      showSnack(result?.error || "Failed to delete quotation", 'error');
    }
  }, [originalQuotation, deleteQuotation, navigate, showSnack]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const generatePDF = useCallback(async (exportType = 'with_total') => {
    if (!validateBeforeSave()) return;

    setIsExporting(true);
    try {
      const allS3Keys = [];
      quotationItems.forEach(item => {
        if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
          allS3Keys.push(...item.imageS3Keys);
        }
      });
      termsImages.forEach(img => {
        if (img.s3Key) allS3Keys.push(img.s3Key);
      });

      let signedUrlsMap = {};
      if (allS3Keys.length > 0) {
        signedUrlsMap = await convertBatchS3KeysToUrls(allS3Keys);
      }

      const pdfQuotation = {
        ...originalQuotation,
        projectName: quotationData.projectName,
        scopeOfWork: quotationData.scopeOfWork,
        remark: quotationData.remark,
        customer: quotationData.customer,
        customerName: quotationData.customerName,
        customerPhone: quotationData.customerPhone,
        customerEmail: quotationData.customerEmail,
        customerDesignation: quotationData.customerDesignation,
        customerTradeLicenseNumber: quotationData.customerTradeLicenseNumber,
        ourFocalPoint: quotationData.ourFocalPoint,
        ourFocalPointDesignation: quotationData.ourFocalPointDesignation,
        ourContact: quotationData.ourContact,
        salesManagerEmail: quotationData.salesManagerEmail,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        ourRef: quotationData.ourRef,
        paymentTerms: quotationData.paymentTerms,
        deliveryTerms: quotationData.deliveryTerms,
        tl: quotationData.tl,
        trn: quotationData.trn,
        taxPercent: Number(quotationData.tax) || 0,
        discountPercent: Number(quotationData.discount) || 0,
        notes: quotationData.notes,
        termsAndConditions: sectionsToHTML(tcSections),
        items: quotationItems.map(item => ({
          ...item,
          imagePaths: [
            ...(item.imagePaths || []),
            ...(item.imageS3Keys || []).map(key => signedUrlsMap[key]).filter(Boolean),
          ]
        })),
        subtotal,
        taxAmount,
        discountAmount,
        grandTotal,
        amountInWords,
        exportType: exportType,
        termsImagesUrls: termsImages.map(img => img.s3Key ? signedUrlsMap[img.s3Key] : img.url).filter(Boolean)
      };

      await downloadQuotationPDF(pdfQuotation, { exportType });
      showSnack("PDF downloaded successfully!", 'success');
    } catch (err) {
      console.error("PDF export error:", err);
      showSnack(`Failed to generate PDF: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, tcSections,
      subtotal, taxAmount, discountAmount, grandTotal, amountInWords, termsImages, showSnack]);

  // Return all values
  return {
    isEditing,
    setIsEditing,
    isSaving,
    isExporting,
    setIsExporting,
    editingImgId,
    setEditingImgId,
    loading,
    fetchError,
    newImages,
    quotationData,
    quotationItems,
    tcSections,
    setTcSections,
    internalDocuments,
    newDocuments,
    reviewComments,
    handleAddComment,
    handleEditComment,
    handleResolveComment,
    handleDeleteComment,
    snackbar,
    setSnackbar,
    fieldErrors,
    originalQuotation,
    subtotal,
    taxAmount,
    discountAmount,
    grandTotal,
    amountInWords,
    items,
    previewDoc,
    setPreviewDoc,
    customerTaxTreatment,
    customerPlaceOfSupply,
    customerContactPersons,
    termsImages,
    paymentTermOptions,
    selectedPaymentTermId,
    handleSelectPaymentTerm,
    handleDeletePaymentTerm,
    termsTemplates,
    selectedTermsTemplateId,
    showSaveTemplateModal,
    savingTermsTemplate,
    handleSelectTermsTemplate,
    handleOpenSaveTemplateModal,
    handleCloseSaveTemplateModal,
    handleSaveTermsTemplate,
    handleDeleteTermsTemplate,
    handleDocumentPreview,
    generatePDF,
    handleDataChange,
    addItem,
    removeItem,
    updateItem,
    handleImageUpload,
    removeNewImage,
    removeExistingImage,
    handleDocumentUpload,
    handleDocumentDelete,
    handleDocumentDownload,
    cancelEdit,
    handleSave,
    handleDelete,
    handleBack,
    handleTermsImagesUpload,
    removeTermsImage,
  };
}