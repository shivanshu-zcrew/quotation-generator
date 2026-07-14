const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { protect } = require("../middleware/auth");
const { companyContext } = require("../middleware/companyContext");

// All routes require authentication
router.use(protect);
router.use(companyContext);

// Customer CRUD Operations
router.post("/", customerController.createCustomer);
router.get("/", customerController.getAllCustomers);
router.get("/search", customerController.searchCustomers);
router.get("/stats", customerController.getCustomerStats);
router.get("/gcc-countries", customerController.getGccCountries);
router.get("/currencies", customerController.getCurrencyOptions);
router.get("/tax-treatments", customerController.getTaxTreatments);
router.get("/tax-summary", customerController.getTaxSummary);
router.get("/export", customerController.exportCustomers);
router.get("/:id", customerController.getCustomer);
router.put("/:id", customerController.updateCustomer);
router.delete("/:id", customerController.deleteCustomer);
router.post("/:id/sync", customerController.syncCustomerWithZoho);
router.post("/sync-from-zoho", customerController.syncFromZoho);
router.get("/sync/status", customerController.getSyncStatus);
router.get("/sync/pending", customerController.getPendingSync);
router.post("/sync/force/:id", customerController.forceSyncCustomer);
router.get("/sync/progress", customerController.getCustomerSyncProgress);
router.post("/sync/cancel", customerController.cancelCustomerSync);


module.exports = router;
