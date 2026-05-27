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
import { convertS3KeyToUrl, convertBatchS3KeysToUrls } from './useS3Image';

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
  const [signedUrls, setSignedUrls] = useState({});  
  const [signedUrlsLoaded, setSignedUrlsLoaded] = useState(false);
  // Helper functions defined before useMemo/useCallback
  const round = useCallback((num) => Number((num || 0).toFixed(2)), []);
  
  const showSnack = useCallback((msg, type = "error") => {
    setSnackbar({ show: true, message: msg, type });
  }, []);

  // Find original quotation - must be after all hooks
  const originalQuotation = useMemo(() => {
    return (quotations || []).find((q) => q._id === id) || fetchedQ;
  }, [quotations, id, fetchedQ]);

  
// Load signed URLs for S3 images when quotation loads
useEffect(() => {
  if (!originalQuotation) return;

  const loadSignedUrls = async () => {
    setSignedUrlsLoaded(false);  // Add this line
    // Collect all S3 keys from the quotation
    const allS3Keys = [];
    
    // From items
    originalQuotation.items?.forEach(item => {
      if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
        allS3Keys.push(...item.imageS3Keys);
        console.log("Found S3 keys in items:", item.imageS3Keys);  // Add debug
      }
    });
    
    // From terms images
    originalQuotation.termsImages?.forEach(img => {
      if (img.s3Key) {
        allS3Keys.push(img.s3Key);
      }
    });
    
    // From internal documents
    originalQuotation.internalDocuments?.forEach(doc => {
      if (doc.s3Key) {
        allS3Keys.push(doc.s3Key);
      }
    });
    
    console.log("Total S3 keys found:", allS3Keys);  // Add debug
    
    if (allS3Keys.length > 0) {
      const urls = await convertBatchS3KeysToUrls(allS3Keys);
      console.log("Signed URLs received:", urls);  // Add debug
      setSignedUrls(urls);
    }
    setSignedUrlsLoaded(true);  // Add this line
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
    
    // Check if we have S3 keys that need URLs
    const hasS3Keys = originalQuotation.items?.some(item => 
      item.imageS3Keys && item.imageS3Keys.length > 0
    );
    
    console.log("Has S3 keys:", hasS3Keys, "Signed URLs loaded:", signedUrlsLoaded);
    
    // If we have S3 keys but signed URLs are still loading, wait
    if (hasS3Keys && !signedUrlsLoaded) {
      console.log("Waiting for signed URLs to load...");
      return;
    }
    
    console.log("Processing quotation data with signed URLs:", signedUrls);
    
    const parsedData = parseQuotationData(originalQuotation);
    delete parsedData.termsImage;
    
    setQuotationData({
      ...parsedData,
      projectName: originalQuotation.projectName || "",
      scopeOfWork: originalQuotation.scopeOfWork || "",
      remark: originalQuotation.remark || "",
      customer: originalQuotation.customer || originalQuotation.companySnapshot?.name || "",
      customerName: originalQuotation.customerName || originalQuotation.customerId?.name || "",
      customerPhone: originalQuotation.customerPhone || originalQuotation.contact || originalQuotation.customerSnapshot?.phone || "",
      customerEmail: originalQuotation.customerEmail || originalQuotation.customerSnapshot?.email || "",
      customerDesignation: originalQuotation.customerSnapshot?.designation || "",
      customerTradeLicenseNumber: originalQuotation.customerSnapshot?.tradeLicenseNumber || "",
      customerTaxRegistrationNumber: originalQuotation.customerSnapshot?.vatNumber || originalQuotation.trn || "",
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
    
    // Parse items - convert S3 keys to URLs
    const parsedItems = parseQuotationItems(originalQuotation.items);
    const itemsWithUrls = parsedItems.map(item => {
      const s3Urls = (item.imageS3Keys || []).map(key => signedUrls[key]).filter(Boolean);
      console.log(`Item ${item.id} - S3 keys:`, item.imageS3Keys, "-> URLs:", s3Urls);
      
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
    
  }, [originalQuotation, signedUrls, signedUrlsLoaded]); // Add signedUrlsLoaded to dependencies

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
      imagePaths: [],
      imageS3Keys: [],
      newImages: []
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
    const existingS3Count = existingItem?.imageS3Keys?.length || 0;
    const newImageCount = (newImages[itemId] || []).length;
    const currentTotalImages = existingImageCount + existingS3Count + newImageCount;
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
        const base64String = reader.result;
        
        setNewImages((prev) => ({
          ...prev,
          [itemId]: [...(prev[itemId] || []), base64String],
        }));
  
        setQuotationItems(prev => prev.map(item => 
          item.id === itemId ? { 
            ...item, 
            newImages: [...(item.newImages || []), base64String] 
          } : item
        ));
  
        processedCount++;
  
        if (processedCount === validFiles.length) {
          showSnack(`${validFiles.length} image(s) added to item.`, 'success');
        }
      };
  
      reader.onerror = () => {
        showSnack(`Failed to read file: ${file.name}`, 'error');
        processedCount++;
      };
  
      reader.readAsDataURL(file);
    });
  
    setEditingImgId(null);
    e.target.value = "";
  }, [quotationItems, newImages, showSnack]);

  const removeNewImage = useCallback((itemId, imageIndex) => {
    setNewImages(prev => {
      const currentNewImages = prev[itemId] || [];
      const filtered = currentNewImages.filter((_, idx) => idx !== imageIndex);
      const updated = { ...prev };
      if (filtered.length === 0) {
        delete updated[itemId];
      } else {
        updated[itemId] = filtered;
      }
      return updated;
    });
    
    setQuotationItems(prev => prev.map(item =>
      item.id === itemId ? {
        ...item,
        newImages: (item.newImages || []).filter((_, idx) => idx !== imageIndex)
      } : item
    ));
  }, []);

  const removeExistingImage = useCallback((itemId, imageIndex) => {
    setQuotationItems(prevItems => 
      prevItems.map(item => {
        if (item.id !== itemId) return item;
        
        // Get current arrays
        const currentS3Keys = item.imageS3Keys || [];
        const currentUrls = item.imageUrls || [];
        const currentPaths = item.imagePaths || [];
        
        // If removing from S3 images
        if (imageIndex < currentS3Keys.length) {
          return {
            ...item,
            imageS3Keys: currentS3Keys.filter((_, idx) => idx !== imageIndex),
            imageUrls: currentUrls.filter((_, idx) => idx !== imageIndex)  // ← THIS IS THE KEY FIX
          };
        } 
        // If removing from Cloudinary images
        else {
          const adjustedIndex = imageIndex - currentS3Keys.length;
          return {
            ...item,
            imagePaths: currentPaths.filter((_, idx) => idx !== adjustedIndex)
          };
        }
      })
    );
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
            storageProvider: 's3',
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
      customer: originalQuotation.customer || originalQuotation.companySnapshot?.name || "",
      customerName: originalQuotation.customerName || originalQuotation.customerId?.name || "",
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

    const parsedItems = parseQuotationItems(originalQuotation.items);
    const itemsWithUrls = parsedItems.map(item => ({
      ...item,
      imageUrls: (item.imageS3Keys || []).map(key => signedUrls[key]).filter(Boolean),
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

  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return;
  
    setIsSaving(true);
    try {
      const quotationImages = {};
  
      quotationItems.forEach((item, index) => {
        const allImages = [];
      
        // Add existing S3 keys (as keys, not URLs)
        if (item.imageS3Keys && Array.isArray(item.imageS3Keys) && item.imageS3Keys.length > 0) {
          allImages.push(...item.imageS3Keys);
        }
      
        // Add existing Cloudinary paths
        if (item.imagePaths && Array.isArray(item.imagePaths) && item.imagePaths.length > 0) {
          allImages.push(...item.imagePaths);
        }
      
        // Add new base64 images
        if (newImages[item.id] && Array.isArray(newImages[item.id]) && newImages[item.id].length > 0) {
          const base64Images = newImages[item.id].map(img => {
            if (typeof img === 'string') return img;
            if (typeof img === 'object' && img.preview) return img.preview;
            return img;
          });
          allImages.push(...base64Images);
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
  
      // Format items for API - separate S3 keys and base64 images
      const formattedItems = quotationItems.map((qi) => ({
        itemId: qi.itemId || null,
        name: qi.name || "",
        description: qi.description || "",
        quantity: Number(qi.quantity) || 1,
        unitPrice: Number(qi.unitPrice) || 0,
        // Send S3 keys (existing images)
        imageS3Keys: qi.imageS3Keys || [],
        // Send new base64 images
        newImages: newImages[qi.id] || [],
        // Keep for backward compatibility
        imagePaths: qi.imagePaths || []
      }));
  
      // Separate existing S3 term images from new base64 ones
      const existingTermsImages = termsImages.filter(img => img.s3Key && !img.url?.startsWith('data:'));
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
        termsImages: newBase64Images,
        existingTermsImages: existingTermsImages,
        
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
          setFetchedQ(updatedQuotation);
          
          setQuotationData({
            projectName: updatedQuotation.projectName || "",
            scopeOfWork: updatedQuotation.scopeOfWork || "",
            remark: updatedQuotation.remark || "",
            customer: updatedQuotation.companySnapshot?.name || updatedQuotation.customer || "",
            customerName: updatedQuotation.customerName || updatedQuotation.customerId?.name || "",
            customerPhone: updatedQuotation.customerPhone || updatedQuotation.contact || updatedQuotation.customerSnapshot?.phone || "",
            customerEmail: updatedQuotation.customerEmail || updatedQuotation.customerSnapshot?.email || "",
            customerDesignation: updatedQuotation.customerDesignation || updatedQuotation.customerSnapshot?.designation || "",
            customerTradeLicenseNumber: updatedQuotation.customerTradeLicenseNumber || updatedQuotation.customerSnapshot?.tradeLicenseNumber || "",
            customerTaxRegistrationNumber: updatedQuotation.customerTaxRegistrationNumber || updatedQuotation.customerSnapshot?.vatNumber || updatedQuotation.trn || "",
            ourFocalPoint: updatedQuotation.ourFocalPoint || updatedQuotation.createdBySnapshot?.name || "",
            ourFocalPointDesignation: updatedQuotation.ourFocalPointDesignation || updatedQuotation.createdBySnapshot?.role || "",
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
            tl: updatedQuotation.tl || "",
            trn: updatedQuotation.trn || "",
            tax: updatedQuotation.taxPercent || 0,
            discount: updatedQuotation.discountPercent || 0,
            notes: updatedQuotation.notes || "",
            currency: updatedQuotation.currency || { code: 'AED', symbol: 'د.إ' },
          });
          
          const updatedItems = parseQuotationItems(updatedQuotation.items);
          const itemsWithNewImages = updatedItems.map(item => ({
            ...item,
            newImages: []
          }));
          setQuotationItems(itemsWithNewImages);
  
          const serverTermsImages = updatedQuotation.termsImages || [];
          setTermsImages(serverTermsImages.map(img => ({
            id: img._id || `img-${Date.now()}`,
            url: img.s3Key ? signedUrls[img.s3Key] : img.url,
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
      internalDocuments, tcSections, termsImages, updateQuotation, showSnack, signedUrls]);

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
      // Convert S3 keys to signed URLs for PDF generation
      const allS3Keys = [];
      
      quotationItems.forEach(item => {
        if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
          allS3Keys.push(...item.imageS3Keys);
        }
      });
      
      termsImages.forEach(img => {
        if (img.s3Key) {
          allS3Keys.push(img.s3Key);
        }
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
        remark: quotationData.remark || originalQuotation?.remark || "",
        items: quotationItems.map(item => ({
          ...item,
          imagePaths: [
            ...(item.imagePaths || []),
            ...(item.imageS3Keys || []).map(key => signedUrlsMap[key]).filter(Boolean),
            ...((newImages[item.id] || []).map(img => typeof img === 'string' ? img : img.preview))
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

      await downloadQuotationPDF(pdfQuotation, { newImages, exportType });
      showSnack("PDF downloaded successfully!", 'success');
    } catch (err) {
      console.error("PDF export error:", err);
      showSnack(`Failed to generate PDF: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, tcSections, 
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