const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

// GET all customers
router.get('/', customerController.getAllCustomers);

// POST create new customer
router.post('/', customerController.createCustomer);

// GET single customer by ID
router.get('/:id', customerController.getCustomer);

// PUT update customer
router.put('/:id', customerController.updateCustomer);

// DELETE customer
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;