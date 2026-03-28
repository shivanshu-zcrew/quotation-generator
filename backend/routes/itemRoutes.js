const express = require('express');
const router = express.Router();
const upload = require('../middleware/multer');
const itemController = require('../controllers/itemController');

// GET all items
router.get('/', itemController.getAllItems);

// POST create new item with image upload
router.post('/', upload.single('image'), itemController.createItem);

// GET single item by ID
router.get('/:id', itemController.getItem);

// PUT update item with image upload
router.put('/:id', upload.single('image'), itemController.updateItem);

// DELETE item
router.delete('/:id', itemController.deleteItem);

// GET sync items from Zoho (triggers background sync)
router.get('/sync/items', itemController.syncItems);

// GET sync status (check if sync is in progress)
router.get('/sync/status', itemController.getSyncStatus);

module.exports = router;