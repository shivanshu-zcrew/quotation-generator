export { 
    generateQuotationPDF, 
    downloadPDF, 
    openPDFInNewTab, 
    getPDFAsBlob, 
    getPDFAsBase64 
  } from './pdfGenerator';
  
  export { 
    printQuotation, 
    quickPrint 
  } from './printUtility';
  
  export { 
    exportQuotation, 
    exportMultipleFormats, 
    validateQuotationData 
  } from './exportUtils';
  
  // Default export for convenience
  export default {
    pdf: {
      generate: generateQuotationPDF,
      download: downloadPDF,
      open: openPDFInNewTab,
      getBlob: getPDFAsBlob,
      getBase64: getPDFAsBase64,
    },
    print: {
      standard: printQuotation,
      quick: quickPrint,
    },
    export: exportQuotation,
    validate: validateQuotationData,
  };