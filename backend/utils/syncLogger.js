const fs = require('fs');
const path = require('path');

class SyncLogger {
  constructor(syncType = 'customers') {
    this.syncType = syncType;
    this.logDir = path.join(__dirname, '../logs');
    this.logFile = path.join(this.logDir, `zoho-${syncType}-sync-${new Date().toISOString().split('T')[0]}.json`);
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Initialize sync log
    this.syncLog = {
      syncType: syncType,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      summary: {
        total: 0,
        created: 0,
        updated: 0,
        errors: 0,
        skipped: 0
      },
      customers: [],
      rawZohoData: [],
      apiResponse: null
    };
  }
  
  addCustomer(customerData, status, message, error = null, details = {}) {
    this.syncLog.customers.push({
      zohoId: customerData.zohoId,
      zohoName: customerData.zohoName,
      mappedName: customerData.mappedName,
      zohoTaxTreatment: customerData.zohoTaxTreatment,
      mappedTaxTreatment: customerData.mappedTaxTreatment,
      zohoTaxRegNo: customerData.zohoTaxRegNo,
      mappedTaxRegNo: customerData.mappedTaxRegNo,
      zohoEmail: customerData.zohoEmail,
      mappedEmail: customerData.mappedEmail,
      zohoPhone: customerData.zohoPhone,
      mappedPhone: customerData.mappedPhone,
      status,
      message,
      error: error ? error.message : null,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (status === 'created') this.syncLog.summary.created++;
    if (status === 'updated') this.syncLog.summary.updated++;
    if (status === 'error') this.syncLog.summary.errors++;
    if (status === 'skipped') this.syncLog.summary.skipped++;
    this.syncLog.summary.total++;
  }
  
  addRawZohoData(zohoCustomers) {
    this.syncLog.rawZohoData = zohoCustomers.map(c => ({
      contact_id: c.contact_id,
      contact_name: c.contact_name,
      contact_type: c.contact_type,
      tax_treatment: c.tax_treatment,
      tax_reg_no: c.tax_reg_no,
      vat_reg_no: c.vat_reg_no,
      contact_category: c.contact_category,
      country_code: c.country_code,
      place_of_contact: c.place_of_contact,
      currency_code: c.currency_code,
      email: c.email,
      phone: c.phone,
      last_modified_time: c.last_modified_time,
      contact_persons: c.contact_persons?.map(cp => ({
        email: cp.email,
        phone: cp.phone,
        mobile: cp.mobile,
        is_primary: cp.is_primary_contact
      }))
    }));
  }
  
  addApiResponse(apiResponse) {
    this.syncLog.apiResponse = {
      success: apiResponse.success,
      totalContacts: apiResponse.totalContacts || 0,
      totalCustomers: apiResponse.totalCustomers || 0,
      hasMorePages: apiResponse.hasMorePages,
      error: apiResponse.error,
      timestamp: new Date().toISOString()
    };
  }
  
  async save() {
    this.syncLog.endTime = new Date().toISOString();
    this.syncLog.duration = `${(new Date(this.syncLog.endTime) - new Date(this.syncLog.startTime)) / 1000} seconds`;
    
    try {
      // Read existing logs if any
      let existingLogs = [];
      if (fs.existsSync(this.logFile)) {
        try {
          const fileContent = fs.readFileSync(this.logFile, 'utf8');
          existingLogs = JSON.parse(fileContent);
          if (!Array.isArray(existingLogs)) {
            existingLogs = [existingLogs];
          }
        } catch (e) {
          existingLogs = [];
        }
      }
      
      existingLogs.push(this.syncLog);
      fs.writeFileSync(this.logFile, JSON.stringify(existingLogs, null, 2));
       
      
      // Also create a summary file
      const summaryFile = path.join(this.logDir, `latest-summary.json`);
      fs.writeFileSync(summaryFile, JSON.stringify({
        lastSync: this.syncLog.endTime,
        syncType: this.syncType,
        summary: this.syncLog.summary,
        errors: this.syncLog.customers.filter(c => c.status === 'error').map(c => ({
          zohoId: c.zohoId,
          name: c.zohoName,
          error: c.error
        }))
      }, null, 2));
      
      return this.logFile;
    } catch (error) {
      console.error('❌ Error saving sync log:', error);
      return null;
    }
  }
  
  printSummary() {
     
     
     
     
     
     
     
     
     
     
  }
}

module.exports = SyncLogger;