const ZohoContactsService = require('./zohoContactsService');
const ZohoItemsService = require('./zohoItemsService');

class ZohoBooksService {
  constructor() {
    this.contacts = new ZohoContactsService();
    this.items = new ZohoItemsService();
  }

  // Delegate to contacts service
  setCompany(companyId, organizationId) {
    this.contacts.setCompany(companyId, organizationId);
    this.items.setCompany(companyId, organizationId);
  }

  getCompanyContext() {
    return this.contacts.getCompanyContext();
  }

  // Contact methods
  async getAllCustomersPaginated(companyId, lastSyncDate = null) {
    return this.contacts.getAllCustomersPaginated(companyId, lastSyncDate);
  }

  async syncContactsToDatabase(company, incremental = true) {
    return this.contacts.syncContactsToDatabase(company, incremental);
  }

  async getContact(contactId, bypassCache = false) {
    return this.contacts.getContact(contactId, bypassCache);
  }

  async createContact(customerData) {
    return this.contacts.createContact(customerData);
  }

  async updateContact(contactId, customerData) {
    return this.contacts.updateContact(contactId, customerData);
  }

  async deleteContact(contactId) {
    return this.contacts.deleteContact(contactId);
  }

  async clearContactsCache() {
    return this.contacts.clearContactsCache();
  }

  // Item methods
  async getAllItemsPaginated(companyId, lastSyncDate = null) {
    return this.items.getAllItemsPaginated(companyId, lastSyncDate);
  }

  async syncItemsToDatabase(company, incremental = true) {
    return this.items.syncItemsToDatabase(company, incremental);
  }

  async getAllItems(params = {}) {
    return this.items.getAllItems(params);
  }

  async getItem(itemId) {
    return this.items.getItem(itemId);
  }

  async createItem(itemData) {
    return this.items.createItem(itemData);
  }

  async updateItem(itemId, itemData) {
    return this.items.updateItem(itemId, itemData);
  }

  async deleteItem(itemId) {
    return this.items.deleteItem(itemId);
  }

  async clearItemsCache() {
    return this.items.clearItemsCache();
  }
}

module.exports = new ZohoBooksService();