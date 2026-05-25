const mongoose = require("mongoose");
const { Quotation } = require('../models/quotation');
const { Customer } = require('../models/customer');
const { ExchangeRateService, Company } = require('../models/quotation');
const zohoBooksService = require('../zoho/customerServices');
const logger = require('../config/logger');

const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

exports.awardQuotation = async (req, res) => {
  try {
    const { awarded, awardNote } = req.body;
    const quotationId = req.params.id;
    const companyId = req.companyId || req.headers['x-company-id'];
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false,
        message: 'Company ID is required' 
      });
    }

    if (typeof awarded !== 'boolean') {
      return res.status(400).json({ 
        success: false,
        message: '`awarded` (boolean) is required' 
      });
    }

    const quotation = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('companyId')
      .populate('createdBy', 'name email');
    
    if (!quotation) {
      return res.status(404).json({ 
        success: false,
        message: 'Quotation not found for this company' 
      });
    }
    
    const existingOpsApprovedBySnapshot = quotation.opsApprovedBySnapshot;
    const existingApprovedBySnapshot = quotation.approvedBySnapshot;
    const existingCreatedBySnapshot = quotation.createdBySnapshot;
    
    const customer = await Customer.findOne({ 
      _id: quotation.customerId, 
      companyId 
    }).lean();
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        message: 'Customer not found for this company' 
      });
    }

    if (quotation.createdBy._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Only the creator can mark this quotation as awarded' 
      });
    }

    if (quotation.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Only admin-approved quotations can be awarded. Current status: ${quotation.status}`,
      });
    }

    if (quotation.companyId && quotation.companyId.zohoOrganizationId) {
      zohoBooksService.setCompany(quotation.companyId._id, quotation.companyId.zohoOrganizationId);
    }

    const customerTaxTreatment = customer?.taxTreatment || 'non_vat_registered';
    const customerPlaceOfSupply = customer?.placeOfSupply || 'Dubai';
    
    const isPlaceOfSupplyUAE = UAE_EMIRATES.includes(customerPlaceOfSupply);
    const isPlaceOfSupplyGCC = GCC_COUNTRIES.includes(customerPlaceOfSupply);
    
    const companyZohoId = quotation.companyId?.zohoOrganizationId;
    let TAX_IDS = {};
     
    if (companyZohoId === '870392017') {
      TAX_IDS = { '0%': '5723933000000089262', '5%': '5723933000000089256' };
    } else if (companyZohoId === '886656701') {
      TAX_IDS = { '0%': '6201431000000108033', '5%': '6201431000000108025' };
    } else if (companyZohoId === '916255903') {
      TAX_IDS = { '0%': '8731317000000093294', '5%': '8731317000000093290' };
    } else {
      TAX_IDS = { '0%': '8731317000000093294', '5%': '8731317000000093290' };
    }
    
    let taxRate = 0;
    let taxId = TAX_IDS['0%'];
    let taxTreatment = 'vat_not_registered';
    let placeOfSupplyCode = 'AE';
    
    if (customerTaxTreatment === 'vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = quotation.taxPercent || 5;
        taxId = taxRate === 0 ? TAX_IDS['0%'] : TAX_IDS['5%'];
        taxTreatment = 'vat_registered';
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'vat_registered';
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    } else if (customerTaxTreatment === 'gcc_vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = 5;
        taxId = TAX_IDS['5%'];
        taxTreatment = 'gcc_vat_registered';
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'gcc_vat_registered';
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    } else if (customerTaxTreatment === 'non_vat_registered' || customerTaxTreatment === 'gcc_non_vat_registered') {
      taxRate = 0;
      taxId = TAX_IDS['0%'];
      taxTreatment = 'vat_not_registered';
      if (isPlaceOfSupplyUAE) {
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else {
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    }

    logger.info(`Award quotation tax settings: Rate=${taxRate}%, TaxId=${taxId}, Treatment=${taxTreatment}`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      customerTaxTreatment,
      customerPlaceOfSupply
    });

    let zohoEstimate = null;
    
    if (awarded) {
      try {
        let customerZohoId = customer?.zohoId;
        if (!customerZohoId) {
          throw new Error('Customer Zoho ID not found. Please sync customer with Zoho first.');
        }
        
        const missingZohoIds = [];
        for (let i = 0; i < quotation.items.length; i++) {
          const item = quotation.items[i];
          if (!item.zohoItemId) {
            missingZohoIds.push({ index: i + 1, name: item.itemId?.name || `Item ${i + 1}` });
          }
        }
        
        if (missingZohoIds.length > 0) {
          logger.error(`Missing Zoho IDs for items: ${JSON.stringify(missingZohoIds)}`, { quotationId: quotation._id });
          return res.status(400).json({
            success: false,
            message: `Cannot create estimate in Zoho. The following items are missing Zoho IDs:`,
            missingItems: missingZohoIds.map(item => `${item.name} (Item #${item.index})`),
            suggestion: 'Please sync these items with Zoho first or ensure they have valid Zoho IDs.'
          });
        }
        
        const isVatRegistered = taxRate > 0 || taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered';
        const originalDiscountPercent = quotation.discountPercent || 0;
        let effectiveDiscountPercent = 0;
        let lineItemsWithDiscount = [];
        
        const subtotal = quotation.subtotal || 0;
        
        for (let i = 0; i < quotation.items.length; i++) {
          const item = quotation.items[i];
          const originalRate = item.unitPrice;
          let finalRate = originalRate;
          let itemDiscountPercent = 0;
          
          if (isVatRegistered && originalDiscountPercent > 0) {
            finalRate = Math.round((originalRate * (1 - originalDiscountPercent / 100)) * 100) / 100;
            itemDiscountPercent = 0;
          } else if (!isVatRegistered && originalDiscountPercent > 0) {
            effectiveDiscountPercent = originalDiscountPercent;
          }
          
          const itemTotal = item.quantity * finalRate;
          
          const lineItem = {
            item_id: item.zohoItemId,
            name: item.itemId?.name || `Item ${i + 1}`,
            description: item.description || '',
            quantity: item.quantity,
            rate: finalRate,
            discount: itemDiscountPercent,
            discount_amount: 0,
            item_total: itemTotal,
            item_order: i + 1
          };
          
          if (taxRate > 0) {
            lineItem.tax_id = taxId;
            lineItem.tax_percentage = taxRate;
            lineItem.tax_name = 'VAT';
            lineItem.tax_type = 'tax';
          }
          
          lineItemsWithDiscount.push(lineItem);
        }
        
        const recalculatedSubtotal = lineItemsWithDiscount.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
        const recalculatedTaxAmount = (recalculatedSubtotal * taxRate) / 100;
        const recalculatedDiscountAmount = isVatRegistered ? 0 : (subtotal * originalDiscountPercent / 100);
        const recalculatedGrandTotal = recalculatedSubtotal + recalculatedTaxAmount - recalculatedDiscountAmount;
        
        const estimateData = {
          customer_id: customerZohoId,
          reference_number: quotation.quotationNumber,
          date: new Date(quotation.date).toISOString().split('T')[0],
          expiry_date: new Date(quotation.expiryDate).toISOString().split('T')[0],
          exchange_rate: quotation.currency?.exchangeRate?.rate || 1,
          discount: effectiveDiscountPercent,
          is_discount_before_tax: false,
          discount_type: 'entity_level',
          is_inclusive_tax: false,
          custom_body: quotation.notes || '',
          custom_subject: `Quotation: ${quotation.quotationNumber} - ${quotation.projectName || ''}`,
          salesperson_name: quotation?.createdBy?.name || '',
          notes: awardNote || '',
          terms: cleanHtmlForZoho(quotation.termsAndConditions) || 'No terms and conditions provided.',
          line_items: lineItemsWithDiscount,
          tax_treatment: taxTreatment,
          place_of_supply: placeOfSupplyCode,
          is_taxable: taxRate > 0,
          total: recalculatedGrandTotal,
          total_before_tax: recalculatedSubtotal,
          tax_total: recalculatedTaxAmount,
          discount_total: recalculatedDiscountAmount
        };
        
        if (taxRate > 0) {
          estimateData.tax_id = taxId;
        }
        
        zohoEstimate = await zohoBooksService.createEstimate(estimateData);
        
        if (!zohoEstimate.success) {
          throw new Error(`Zoho estimate creation failed: ${zohoEstimate.error}`);
        }
        
        logger.info(`Zoho estimate created for quotation ${quotation.quotationNumber}`, {
          quotationId: quotation._id,
          estimateId: zohoEstimate.estimateId,
          estimateNumber: zohoEstimate.estimateNumber,
          totalAmount: recalculatedGrandTotal
        });
        
        quotation.zohoEstimateId = zohoEstimate.estimateId;
        quotation.zohoEstimateNumber = zohoEstimate.estimateNumber;
        quotation.zohoEstimateUrl = zohoEstimate.estimateUrl;
        quotation.zohoReferenceNumber = quotation.quotationNumber;
        quotation.zohoSyncedAt = new Date();
        
      } catch (zohoError) {
        logger.error(`Zoho estimate creation error: ${zohoError.message}`, { quotationId: quotation._id });
        return res.status(500).json({
          success: false,
          message: `Failed to create estimate in Zoho Books: ${zohoError.message}`,
          error: zohoError.message
        });
      }
    }
    
    quotation.status = awarded ? 'awarded' : 'not_awarded';
    quotation.awardedBy = req.user.id;
    quotation.awardedAt = new Date();
    quotation.awardNote = awardNote?.trim() || '';
    
    quotation.opsApprovedBySnapshot = existingOpsApprovedBySnapshot;
    quotation.approvedBySnapshot = existingApprovedBySnapshot;
    quotation.createdBySnapshot = existingCreatedBySnapshot;
    
    quotation.awardedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      awardedAt: new Date(),
      awarded: awarded,
      awardNote: awardNote?.trim() || ''
    };
    
    await quotation.save();
    
    logger.info(`Quotation ${quotation.quotationNumber} ${awarded ? 'awarded' : 'marked as not awarded'}`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      awarded,
      userId: req.user.id,
      zohoEstimateId: zohoEstimate?.estimateId
    });
    
    const updated = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('customerId')
      .populate('companyId')
      .lean();
    
    res.status(200).json({
      success: true,
      message: awarded 
        ? 'Quotation awarded and synced to Zoho Books successfully' 
        : 'Quotation marked as not awarded',
      quotation: updated,
      zohoEstimate: zohoEstimate || null
    });
    
  } catch (err) {
    logger.error(`Award quotation error: ${err.message}`, { quotationId: req.params.id });
    res.status(500).json({ 
      success: false,
      message: 'Error awarding quotation', 
      error: err.message
    });
  }
};

function convertHtmlToPlainText(html) {
  if (!html) return '';
  let text = html.replace(/<[^>]*>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/(\d+\.\d+)/g, '\n  $1');
  text = text.replace(/(\d+\.)(\s+)([^\d])/g, '\n$1 $3');
  text = text.replace(/(\d+\.\s+)(?!\d)/g, '\n$1');
  text = text.replace(/(\d+\.\s+[^\n]+?)(\n\s*\d+\.\d+)/g, '$1\n$2');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

function cleanHtmlForZoho(html) {
  if (!html) return '';
  let cleaned = html.replace(/<img[^>]*src="data:image[^"]*"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');
  let text = convertHtmlToPlainText(cleaned);
  if (text.length > 9500) {
    text = text.substring(0, 9500) + '... (truncated)';
  }
  return text;
}