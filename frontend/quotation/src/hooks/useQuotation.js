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
import { newSection, htmlToSections, sectionsToHTML, sectionsToHTMLWithoutImages } from '../components/TermsCondition';
import { validateQuantity, validatePrice, validatePercentage } from '../utils/qtyValidation';
import { downloadQuotationPDF } from '../utils/pdfGenerator';

export function useQuotation() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { items } = useItems();
  const quotations = useAppStore((state) => state.quotations);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);

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
  const originalQuotation = (quotations || []).find((q) => q._id === id) || fetchedQ;

  // Calculations
  const subtotal = useMemo(() =>
    quotationItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [quotationItems]
  );

  const taxAmount = useMemo(() =>
    (subtotal * (Number(quotationData.tax) || 0)) / 100,
    [subtotal, quotationData.tax]
  );

  const discountAmount = useMemo(() =>
    (subtotal * (Number(quotationData.discount) || 0)) / 100,
    [subtotal, quotationData.discount]
  );

  const grandTotal = useMemo(() =>
    subtotal + taxAmount - discountAmount,
    [subtotal, taxAmount, discountAmount]
  );

  const amountInWords = useMemo(() =>
    numberToWords(grandTotal),
    [grandTotal]
  );

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
    setQuotationData(parsedData);
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    
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
    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections);
    
    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
  }, [originalQuotation]);

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
      setSnackbar({
        show: true,
        message: `${files.length} document(s) ready`,
        type: 'success'
      });
    } catch (error) {
      console.error('Error processing documents:', error);
      setSnackbar({
        show: true,
        message: 'Failed to process documents',
        type: 'error'
      });
    }
  }, []);

  const handleDocumentDelete = useCallback(async (docId) => {
    const isTemp = newDocuments.some(d => d.id === docId);

    if (isTemp) {
      setNewDocuments(prev => prev.filter(d => d.id !== docId));
    } else {
      try {
        await quotationAPI.documents.delete(id, docId);
        setInternalDocuments(prev => prev.filter(d => d._id !== docId));
        setSnackbar({
          show: true,
          message: 'Document deleted',
          type: 'success'
        });
      } catch (error) {
        console.error('Error deleting document:', error);
        setSnackbar({
          show: true,
          message: 'Failed to delete document',
          type: 'error'
        });
      }
    }
  }, [id, newDocuments]);

  const handleDocumentDownload = useCallback((docId) => {
    const doc = [...internalDocuments, ...newDocuments].find(d =>
      (d._id === docId || d.id === docId)
    );
    if (doc) {
      window.open(doc.fileUrl || doc.fileData, '_blank');
    }
  }, [internalDocuments, newDocuments]);

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
        setSnackbar({ show: true, message: result.error, type: 'error' });
        return;
      }
      value = parseFloat(value) || 0;
    }

    setQuotationData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const addItem = useCallback(() =>
    setQuotationItems((prev) => [...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        itemId: null,
        name: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        imagePaths: []
      }
    ]), []);

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
    if (value === '') {
      if (field === 'quantity') {
        setSnackbar({ show: true, message: 'Quantity cannot be empty', type: 'error' });
        return;
      }
      if (field === 'unitPrice') {
        setQuotationItems((prev) => prev.map((item) =>
          item.id === id ? { ...item, [field]: 0 } : item
        ));
        return;
      }
    }

    if (field === 'quantity') {
      const result = validateQuantity(value);
      if (!result.isValid) {
        setSnackbar({ show: true, message: result.error, type: 'error' });
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
        setSnackbar({ show: true, message: result.error, type: 'error' });
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

    setQuotationItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;

      if (field === "itemId" && value) {
        const found = items.find((i) => i._id === value);
        return {
          ...item,
          itemId: value,
          name: found?.name || item.name,
          description: found?.description || item.description,
          unitPrice: found?.price != null ? Number(found.price) : item.unitPrice,
        };
      }

      return { ...item, [field]: value };
    }));
  }, [items]);

  const handleImageUpload = useCallback((e, itemId) => {
    Array.from(e.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setNewImages((prev) => ({ ...prev, [itemId]: [...(prev[itemId] || []), reader.result] }));
      reader.readAsDataURL(file);
    });
    setEditingImgId(null);
  }, []);

  const removeNewImage = useCallback((itemId, idx) =>
    setNewImages((prev) => {
      const arr = (prev[itemId] || []).filter((_, i) => i !== idx);
      return { ...prev, [itemId]: arr.length ? arr : undefined };
    }), []);

  const removeExistingImage = useCallback((itemId, idx) =>
    setQuotationItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, imagePaths: item.imagePaths.filter((_, i) => i !== idx) } : item
    )), []);

  const handleTermsImagesUpload = useCallback((files) => {
    const newImagesList = [];
    const remainingSlots = 10 - termsImages.length;
    
    if (remainingSlots <= 0) {
      setSnackbar({ show: true, message: 'Maximum 10 terms images allowed', type: 'error' });
      return;
    }
    
    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setSnackbar({ show: true, message: `Only ${remainingSlots} more image(s) allowed`, type: 'warning' });
    }
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        newImagesList.push({
          id: `terms-img-${Date.now()}-${Math.random()}`,
          base64: reader.result,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          isTemp: true
        });
        
        if (newImagesList.length === filesToProcess.length) {
          setTermsImages(prev => [...prev, ...newImagesList]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [termsImages.length]);

  const removeTermsImage = useCallback((imageId) => {
    setTermsImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  const cancelEdit = useCallback(() => {
    if (!originalQuotation) return;
    
    const parsedData = parseQuotationData(originalQuotation);
    delete parsedData.termsImage;
    setQuotationData(parsedData);
    setQuotationItems(parseQuotationItems(originalQuotation.items));
    
    const cloudinaryImages = originalQuotation.termsImages || [];
    const sections = htmlToSections(originalQuotation.termsAndConditions, cloudinaryImages);
    setTcSections(sections);
    
    setInternalDocuments(parseInternalDocuments(originalQuotation.internalDocuments));
    setNewDocuments([]);
    setNewImages({});
    setTermsImages([]);
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
      setSnackbar({ show: true, message: "Add at least one item.", type: 'error' });
      return false;
    }

    for (const item of quotationItems) {
      if (!item.itemId) {
        setSnackbar({ show: true, message: "Please select an item for all rows.", type: 'error' });
        return false;
      }

      const quantityResult = validateQuantity(item.quantity);
      if (!quantityResult.isValid) {
        setSnackbar({ show: true, message: `Item "${item.name || 'Unknown'}" has invalid quantity`, type: 'error' });
        return false;
      }

      const priceResult = validatePrice(item.unitPrice);
      if (!priceResult.isValid) {
        setSnackbar({ show: true, message: `Item "${item.name || 'Unknown'}" has invalid price`, type: 'error' });
        return false;
      }
    }

    if (!quotationData.customer?.trim()) {
      setSnackbar({ show: true, message: "Customer name is required.", type: 'error' });
      return false;
    }

    if (!quotationData.expiryDate) {
      setSnackbar({ show: true, message: "Expiry date is required.", type: 'error' });
      return false;
    }

    const taxResult = validatePercentage(quotationData.tax);
    if (!taxResult.isValid) {
      setSnackbar({ show: true, message: taxResult.error, type: 'error' });
      return false;
    }

    const discountResult = validatePercentage(quotationData.discount);
    if (!discountResult.isValid) {
      setSnackbar({ show: true, message: discountResult.error, type: 'error' });
      return false;
    }

    return true;
  }, [quotationItems, quotationData]);

  const extractTermsImagesFromSections = useCallback((sections) => {
    const images = [];
    
    if (!sections || !Array.isArray(sections)) return images;
    
    sections.forEach((section, sectionIndex) => {
      if (section.images && Array.isArray(section.images) && section.images.length > 0) {
        section.images.forEach((img, imgIndex) => {
          if (img.url && img.url.startsWith('data:') && !img.publicId) {
            images.push({
              base64: img.url,
              fileName: img.fileName || `section_${sectionIndex + 1}_img_${imgIndex + 1}`,
              sectionIndex: sectionIndex,
            });
          }
        });
      }
    });
    
    return images;
  }, []);

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
          allImages.push(...newImages[item.id]);
        }
        
        if (item.newImages && Array.isArray(item.newImages) && item.newImages.length > 0) {
          allImages.push(...item.newImages);
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
      const termsImagesData = extractTermsImagesFromSections(tcSections);
      const termsHTMLWithoutImages = sectionsToHTMLWithoutImages(tcSections);

      const formattedItems = quotationItems.map((qi) => ({
        itemId: qi.itemId,
        quantity: Number(qi.quantity) || 1,
        unitPrice: Number(qi.unitPrice) || 0,
        description: qi.description || "",
      }));

      const payload = {
        customerId: originalQuotation.customerId?._id || originalQuotation.customerId,
        projectName: quotationData.projectName,
        customer: quotationData.customer,
        contact: quotationData.contact,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        ourRef: quotationData.ourRef,
        ourContact: quotationData.ourContact,
        salesManagerEmail: quotationData.salesManagerEmail,
        paymentTerms: quotationData.paymentTerms,
        deliveryTerms: quotationData.deliveryTerms,
        tl: quotationData.tl,
        trn: quotationData.trn,
        taxPercent: taxValue,
        discountPercent: discountValue,
        notes: quotationData.notes?.trim() || "",
        termsAndConditions: termsHTMLWithoutImages,
        termsImages: termsImagesData,
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
        setSnackbar({ show: true, message: "Quotation updated successfully!", type: 'success' });
        setIsEditing(false);
        setEditingImgId(null);
        setNewImages({});
        setNewDocuments([]);
        setFieldErrors({});

        const refreshed = await quotationAPI.getById(id);
        setFetchedQ(refreshed.data);
        
        if (refreshed.data) {
          const parsedData = parseQuotationData(refreshed.data);
          delete parsedData.termsImage;
          setQuotationData(parsedData);
          setQuotationItems(parseQuotationItems(refreshed.data.items));
          
          const cloudinaryImages = refreshed.data.termsImages || [];
          const sections = htmlToSections(refreshed.data.termsAndConditions, cloudinaryImages);
          setTcSections(sections);
          
          setInternalDocuments(parseInternalDocuments(refreshed.data.internalDocuments));
        }
      } else {
        setSnackbar({ show: true, message: result?.error || "Failed to update quotation", type: 'error' });
      }
    } catch (err) {
      console.error("Save error:", err);
      setSnackbar({ show: true, message: "Error saving quotation: " + (err.message || "Unknown error"), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, newDocuments,
      internalDocuments, tcSections, updateQuotation, id, extractTermsImagesFromSections]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) return;

    const result = await deleteQuotation(originalQuotation._id);
    if (result?.success) {
      navigate(-1);
    } else {
      setSnackbar({ show: true, message: result?.error || "Failed to delete quotation", type: 'error' });
    }
  }, [originalQuotation, deleteQuotation, navigate]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

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

  // ✅ SIMPLIFIED generatePDF - uses the same buildPDFHTML as HomeScreen
  const generatePDF = useCallback(async () => {
    if (!validateBeforeSave()) return;
    
    setIsExporting(true);
    try {
      // Build the quotation object for PDF generation
      const pdfQuotation = {
        ...originalQuotation,
        projectName: quotationData.projectName,
        customer: quotationData.customer,
        contact: quotationData.contact,
        date: quotationData.date,
        expiryDate: quotationData.expiryDate,
        ourRef: quotationData.ourRef,
        ourContact: quotationData.ourContact,
        salesManagerEmail: quotationData.salesManagerEmail,
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
          imagePaths: [...(item.imagePaths || []), ...(newImages[item.id] || [])]
        }))
      };
      
      await downloadQuotationPDF(pdfQuotation, { newImages });
      
      setSnackbar({
        show: true,
        message: "PDF downloaded successfully!",
        type: 'success'
      });
    } catch (err) {
      console.error("PDF export error:", err);
      setSnackbar({
        show: true,
        message: `Failed to generate PDF: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  }, [validateBeforeSave, originalQuotation, quotationData, quotationItems, newImages, tcSections]);

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
    handleDocumentPreview,
    generatePDF,
    customerTaxTreatment,
    customerPlaceOfSupply,
    termsImages,
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