const express = require('express');
const router = express.Router();
const upload = require('../middleware/multer');
const itemController = require('../controllers/itemController');
const { companyContext } = require('../middleware/companyContext');

// Apply company context to all routes
router.use(companyContext);

// GET all items
router.get('/', itemController.getAllItems);

// GET search items
router.get('/search', itemController.searchItems);

// GET items statistics
router.get('/stats', itemController.getItemsStats);

// POST create new item with image upload (disabled)
router.post('/', upload.single('image'), itemController.createItem);

// GET single item by ID
router.get('/:id', itemController.getItem);

// PUT update item with image upload (disabled)
router.put('/:id', upload.single('image'), itemController.updateItem);

// DELETE item (disabled)
router.delete('/:id', itemController.deleteItem);

// GET sync items from Zoho (triggers background sync)
router.post('/sync', itemController.syncItems);

// GET sync status (check if sync is in progress)
router.get('/sync/status', itemController.getSyncStatus);

// POST clear items cache
router.post('/clear-cache', itemController.clearItemsCache);

module.exports = router;