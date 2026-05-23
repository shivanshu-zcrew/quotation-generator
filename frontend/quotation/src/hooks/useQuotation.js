import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quotationAPI } from '../services/api';
import { useAppStore } from '../services/store';
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

export function useQuotation() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL, BEFORE ANY CONDITIONAL RETURNS
  const { items } = useItems();
  const quotations = useAppStore((state) => state.quotations);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);

  // All useState hooks must be at the top
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingImgId, setEditingImgId] = useState(null);
  const [fetchedQ, setFetchedQ] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [newImages, setNewImages] = useState({});
  const [quotationData, setQuotationData] = useState({});
  const [quotationItems, setQuotationItems] = useState([]);
  const [tcSections, setTcSections] = useState([newSection()]);
  const [internalDocuments, setInternalDocuments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);
  const [customerTaxTreatment, setCustomerTaxTreatment] = useState('non_vat_registered');
  const [customerPlaceOfSupply, setCustomerPlaceOfSupply] = useState('Dubai');
  const [termsImages, setTermsImages] = useState([]);

  // Helper functions defined before useMemo/useCallback
  const round = useCallback((num) => Number((num || 0).toFixed(2)), []);
  
  const showSnack = useCallback((msg, type = "error") => {
    setSnackbar({ show: true, message: msg, type });
  }, []);

  // Find original quotation - must be after all hooks
  const originalQuotation = useMemo(() => {
    return (quotations || []).find((q) => q._id === id) || fetchedQ;
  }, [quotations, id, fetchedQ]);

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

  const amountInWords = useMemo(() => {
    return numberToWords(grandTotal);
  }, [grandTotal]);

  // All useEffect hooks must be at the top level
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
    
    const parsedData = parseQuotationData(originalQuotation);
    delete parsedData.termsImage;
    
    setQuotationData({
      ...parsedData,
      // Left side fields
      projectName: originalQuotation.projectName || "",
      scopeOfWork: originalQuotation.scopeOfWork || "",
      remark: originalQuotation.remark || "",
      customer: originalQuotation.customer || originalQuotation.customerSnapshot?.name || "",
      customerName: originalQuotation.customerName || originalQuotation.customerSnapshot?.name || "",
      customerPhone: originalQuotation.customerPhone || originalQuotation.contact || originalQuotation.customerSnapshot?.phone || "",
      customerEmail: originalQuotation.customerEmail || originalQuotation.customerSnapshot?.email || "",
      customerDesignation: originalQuotation.customerSnapshot?.designation || "",
      customerTradeLicenseNumber: originalQuotation.customerSnapshot?.tradeLicenseNumber || "",
      customerTaxRegistrationNumber: originalQuotation.customerSnapshot?.vatNumber || originalQuotation.trn || "",
      // Right side fields
      ourFocalPoint: originalQuotation.ourFocalPoint || originalQuotation.createdBySnapshot?.name || "",
      ourFocalPointDesignation: originalQuotation.ourFocalPointDesignation || originalQuotation.createdBySnapshot?.role || "",
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
      tl: originalQuotation.tl || "",
      trn: originalQuotation.trn || originalQuotation.customerSnapshot?.vatNumber || "",
      tax: originalQuotation.taxPercent || 0,
      discount: originalQuotation.discountPercent || 0,
      notes: originalQuotation.notes || "",
    });
    
    const parsedItems = parseQuotationItems(originalQuotation.items);
    setQuotationItems(parsedItems);
    
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
    
    const cloudinaryImages = originalQuotation.termsImages || [];
    const formattedTermsImages = cloudinaryImages.map((img, index) => ({
      id: img._id || `existing-img-${Date.now()}-${index}`,
      url: img.url,
      publicId: img.publicId,
      fileName: img.fileName,
      isTemp: false,
      uploadedAt: img.uploadedAt
    }));
    
    setTermsImages(formattedTermsImages);
    
    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections.length ? sections : [newSection()]);
    
    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
  }, [originalQuotation]);

  // Define all callbacks before conditional logic
  const handleDocumentUpload = useCallback(async (files, descriptions) => {
    try {
      const base64Promises = files.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            fileData: reader.result,
            name: file.name,
            type: file.type,
            size: file.size,
          });
          reader.readAsDataURL(file);
        });
      });

      const base64Files = await Promise.all(base64Promises);

      const tempDocs = base64Files.map((file, index) => ({
        id: `temp-${Date.now()}-${index}-${Math.random()}`,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: file.fileData,
        description: descriptions[index] || '',
        uploadedAt: new Date().toISOString(),
        isTemp: true
      }));

      setNewDocuments(prev => [...prev, ...tempDocs]);
      showSnack(`${files.length} document(s) ready`, 'success');
    } catch (error) {
      console.error('Error processing documents:', error);
      showSnack('Failed to process documents', 'error');
    }
  }, [showSnack]);

  const handleDocumentDelete = useCallback(async (docId) => {
    const isTemp = newDocuments.some(d => d.id === docId);

    if (isTemp) {
      setNewDocuments(prev => prev.filter(d => d.id !== docId));
      showSnack('Document removed', 'success');
    } else {
      try {
        await quotationAPI.documents.delete(id, docId);
        setInternalDocuments(prev => prev.filter(d => d._id !== docId));
        showSnack('Document deleted', 'success');
      } catch (error) {
        console.error('Error deleting document:', error);
        showSnack('Failed to delete document', 'error');
      }
    }
  }, [id, newDocuments, showSnack]);

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

  const addItem = useCallback(() => {
    setQuotationItems((prev) => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      itemId: null,
      name: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      imagePaths: []
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
            if (Object.keys(newErrors[id]).length === 0) {
              delete newErrors[id];
            }
          }
          return newErrors;
        });
      }
      value = parseInt(value, 10);
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
            if (Object.keys(newErrors[id]).length === 0) {
              delete newErrors[id];
            }
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

  const handleImageUpload = useCallback((e, itemId) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const existingItem = quotationItems.find(item => item.id === itemId);
    const existingImageCount = existingItem?.imagePaths?.length || 0;
    const newImageCount = (newImages[itemId] || []).length;
    const currentTotalImages = existingImageCount + newImageCount;
    const availableSlots = MAX_IMAGES_PER_ITEM - currentTotalImages;

    if (availableSlots <= 0) {
      showSnack(`Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item. You already have ${currentTotalImages} image(s).`, 'error');
      e.target.value = "";
      return;
    }

    const toProcess = files.slice(0, availableSlots);

    if (files.length > availableSlots) {
      showSnack(`Only ${availableSlots} slot(s) left — first ${availableSlots} of ${files.length} will be added.`, 'warning');
    }

    const validFiles = [];
    const errors = [];

    for (const file of toProcess) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" is not a supported image type.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        errors.push(`"${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
        continue;
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      errors.forEach(err => showSnack(err, 'error'));
    }

    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    let processedCount = 0;

    validFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        setNewImages((prev) => ({
          ...prev,
          [itemId]: [...(prev[itemId] || []), {
            preview: reader.result,
            file: file,
            name: file.name,
            type: file.type,
            size: file.size,
            id: `${Date.now()}-${Math.random()}`
          }],
        }));

        processedCount++;

        if (processedCount === validFiles.length) {
          showSnack(`${validFiles.length} image(s) added to item.`, 'success');
        }
      };

      reader.onerror = () => {
        showSnack(`Failed to read file: ${file.name}`, 'error');
      };

      reader.readAsDataURL(file);
    });

    setEditingImgId(null);
    e.target.value = "";
  }, [quotationItems, newImages, showSnack]);

  const removeNewImage = useCallback((itemId, idx) => {
    setNewImages((prev) => {
      const arr = (prev[itemId] || []).filter((_, i) => i !== idx);
      return { ...prev, [itemId]: arr.length ? arr : undefined };
    });
  }, []);

  const removeExistingImage = useCallback((itemId, idx) => {
    setQuotationItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, imagePaths: item.imagePaths.filter((_, i) => i !== idx) } : item
    ));
  }, []);

  const handleTermsImagesUpload = useCallback((files) => {
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

    const newImagesList = [];
    let processedCount = 0;

    filesToProcess.forEach((file) => {
      if (file instanceof File) {
        const reader = new FileReader();
        reader.onload = () => {
          newImagesList.push({
            id: `terms-img-${Date.now()}-${Math.random()}`,
            url: reader.result,
            base64: reader.result,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            isTemp: true,
            uploadedAt: new Date().toISOString()
          });

          processedCount++;

          if (processedCount === filesToProcess.length) {
            setTermsImages(prev => [...prev, ...newImagesList]);
          }
        };
        reader.onerror = () => {
          console.error('Error reading file:', file.name);
          processedCount++;
        };
        reader.readAsDataURL(file);
      } else if (file.url || file.base64) {
        newImagesList.push(file);
        processedCount++;

        if (processedCount === filesToProcess.length) {
          setTermsImages(prev => [...prev, ...newImagesList]);
        }
      }
    });
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
      customerName: originalQuotation.customerName || "",
      customerPhone: originalQuotation.customerPhone || originalQuotation.contact || "",
      customerEmail: originalQuotation.customerEmail || "",
      customerDesignation: originalQuotation.customerSnapshot?.designation || "",
      customerTradeLicenseNumber: originalQuotation.customerSnapshot?.tradeLicenseNumber || "",
      customerTaxRegistrationNumber: originalQuotation.customerSnapshot?.vatNumber || "",
      ourFocalPoint: originalQuotation.ourFocalPoint || "",
      ourFocalPointDesignation: originalQuotation.ourFocalPointDesignation || "",
      date: originalQuotation.date ? new Date(originalQuotation.date).toISOString().split('T')[0] : "",
      expiryDate: originalQuotation.expiryDate ? new Date(originalQuotation.expiryDate).toISOString().split('T')[0] : "",
    });

    setQuotationItems(parseQuotationItems(originalQuotation.items));

    const cloudinaryImages = originalQuotation.termsImages || [];
    setTermsImages(cloudinaryImages);

    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections.length ? sections : [newSection()]);

    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
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
  }, [originalQuotation]);

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

  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return;
  
    setIsSaving(true);
    try {
      const quotationImages = {};
  
      quotationItems.forEach((item, index) => {
        const allImages = [];
  
        if (item.imagePaths && Array.isArray(item.imagePaths) && item.imagePaths.length > 0) {
          allImages.push(...item.imagePaths);
        }
  
        if (newImages[item.id] && Array.isArray(newImages[item.id]) && newImages[item.id].length > 0) {
          const previewUrls = newImages[item.id].map(img => img.preview || img);
          allImages.push(...previewUrls);
        }
  
        if (allImages.length > 0) {
          quotationImages[index] = allImages;
        }
      });
  
      const documentData = [
        ...internalDocuments.map(doc => ({
          fileName: doc.fileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          fileUrl: doc.fileUrl,
          publicId: doc.publicId,
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
  
      const formattedItems = quotationItems.map((qi) => ({
        itemId: qi.itemId || null,
        name: qi.name || "",
        description: qi.description || "",
        quantity: Number(qi.quantity) || 1,
        unitPrice: Number(qi.unitPrice) || 0,
        imagePaths: qi.imagePaths || []
      }));
  
      const existingCloudinaryImages = termsImages.filter(img => img.url && !img.url.startsWith('data:'));
      const newBase64Images = termsImages.filter(img => img.url && img.url.startsWith('data:'));
  
      const payload = {
        customerId: originalQuotation.customerId?._id || originalQuotation.customerId,
        
        // Left side fields
        projectName: quotationData.projectName?.trim(),
        scopeOfWork: quotationData.scopeOfWork?.trim() || "",
        remark: quotationData.remark?.trim() || "",
        customer: quotationData.customer?.trim(),
        customerName: quotationData.customerName?.trim() || "",
        customerPhone: quotationData.customerPhone?.trim() || "",
        customerEmail: quotationData.customerEmail?.trim() || "",
        customerDesignation: quotationData.customerDesignation?.trim() || "",
        customerTradeLicenseNumber: quotationData.customerTradeLicenseNumber?.trim() || "",
        customerTaxRegistrationNumber: quotationData.customerTaxRegistrationNumber?.trim() || "",
        
        contact: quotationData.customerPhone?.trim() || quotationData.contact?.trim() || "",
        
        // Right side fields
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
        tl: quotationData.tl?.trim() || "",
        trn: quotationData.trn?.trim() || "",
        taxPercent: taxValue,
        discountPercent: discountValue,
        notes: quotationData.notes?.trim() || "",
        
        termsAndConditions: finalTermsAndConditions,
        termsImages: [...existingCloudinaryImages, ...newBase64Images],
        
        items: formattedItems,
        quotationImages: quotationImages,
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
  
        if (updatedQuotation) {
          // Update fetchedQ with the complete updated quotation
          setFetchedQ(updatedQuotation);
          
          // Update all state with the complete data from server
          setQuotationData({
            // Left side fields
            projectName: updatedQuotation.projectName || "",
            scopeOfWork: updatedQuotation.scopeOfWork || "",
            remark: updatedQuotation.remark || "",
            
            // Customer/Company fields
            customer: updatedQuotation.customer || updatedQuotation.customerSnapshot?.name || "",
            customerName: updatedQuotation.customerName || updatedQuotation.customerSnapshot?.contactName || updatedQuotation.customerSnapshot?.name || "",
            customerPhone: updatedQuotation.customerPhone || updatedQuotation.contact || updatedQuotation.customerSnapshot?.phone || "",
            customerEmail: updatedQuotation.customerEmail || updatedQuotation.customerSnapshot?.email || "",
            customerDesignation: updatedQuotation.customerDesignation || updatedQuotation.customerSnapshot?.designation || "",
            customerTradeLicenseNumber: updatedQuotation.customerTradeLicenseNumber || updatedQuotation.customerSnapshot?.tradeLicenseNumber || "",
            customerTaxRegistrationNumber: updatedQuotation.customerTaxRegistrationNumber || updatedQuotation.customerSnapshot?.vatNumber || updatedQuotation.trn || "",
            
            // Right side fields
            ourFocalPoint: updatedQuotation.ourFocalPoint || updatedQuotation.createdBySnapshot?.name || "",
            ourFocalPointDesignation: updatedQuotation.ourFocalPointDesignation || updatedQuotation.createdBySnapshot?.role || "",
            ourContact: updatedQuotation.ourContact || updatedQuotation.createdBySnapshot?.phone || "",
            salesManagerEmail: updatedQuotation.salesManagerEmail || updatedQuotation.createdBySnapshot?.email || "",
            companyPhone: updatedQuotation.ourContact || updatedQuotation.createdBySnapshot?.phone || "",
            companyEmail: updatedQuotation.salesManagerEmail || updatedQuotation.createdBySnapshot?.email || "",
            
            // Dates
            date: updatedQuotation.date ? new Date(updatedQuotation.date).toISOString().split('T')[0] : "",
            expiryDate: updatedQuotation.expiryDate ? new Date(updatedQuotation.expiryDate).toISOString().split('T')[0] : "",
            queryDate: updatedQuotation.queryDate ? new Date(updatedQuotation.queryDate).toISOString().split('T')[0] : "",
            
            // Other fields
            ourRef: updatedQuotation.ourRef || "",
            paymentTerms: updatedQuotation.paymentTerms || "",
            deliveryTerms: updatedQuotation.deliveryTerms || "",
            tl: updatedQuotation.tl || "",
            trn: updatedQuotation.trn || "",
            tax: updatedQuotation.taxPercent || 0,
            discount: updatedQuotation.discountPercent || 0,
            notes: updatedQuotation.notes || "",
            currency: updatedQuotation.currency || { code: 'AED', symbol: 'د.إ' },
          });
          
          // Update items
          const updatedItems = parseQuotationItems(updatedQuotation.items);
          setQuotationItems(updatedItems);
  
          // Update terms images
          const serverTermsImages = updatedQuotation.termsImages || [];
          setTermsImages(serverTermsImages.map(img => ({
            id: img._id || `img-${Date.now()}`,
            url: img.url,
            publicId: img.publicId,
            fileName: img.fileName,
            isTemp: false,
            uploadedAt: img.uploadedAt
          })));
  
          // Update terms sections
          const sections = htmlToSections(updatedQuotation.termsAndConditions, serverTermsImages);
          setTcSections(sections.length ? sections : [newSection()]);
  
          // Update documents
          setInternalDocuments(parseInternalDocuments(updatedQuotation.internalDocuments));
        }
  
        showSnack("Quotation updated successfully!", 'success');
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
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, newDocuments,
      internalDocuments, tcSections, termsImages, updateQuotation, showSnack]);

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
        remark: quotationData.remark || originalQuotation?.remark || "",
        items: quotationItems.map(item => ({
          ...item,
          imagePaths: [...(item.imagePaths || []), ...((newImages[item.id] || []).map(img => img.preview))]
        })),
        subtotal,
        taxAmount,
        discountAmount,
        grandTotal,
        amountInWords,
        exportType: exportType
      };

      await downloadQuotationPDF(pdfQuotation, { newImages, exportType });
      showSnack("PDF downloaded successfully!", 'success');
    } catch (err) {
      console.error("PDF export error:", err);
      showSnack(`Failed to generate PDF: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, tcSections, 
      subtotal, taxAmount, discountAmount, grandTotal, amountInWords, showSnack]);

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
    termsImages,
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