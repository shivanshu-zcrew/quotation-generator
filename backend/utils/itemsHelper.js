// utils/itemHelpers.js or in your controller
const mongoose = require('mongoose');
const Item = require('../models/items');

/**
 * Find an item by either MongoDB ObjectId or customId
 * @param {string} identifier - The ID to search for (ObjectId or customId)
 * @returns {Promise<Object|null>} - The found item or null
 */
const findItemByIdentifier = async (identifier) => {
  if (!identifier) return null;
  
  // Check if it's a valid MongoDB ObjectId (24 hex chars)
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    // Try to find by ObjectId first
    const item = await Item.findById(identifier).lean();
    if (item) return item;
  }
  
  // If not found or not a valid ObjectId, try to find by customId
  return await Item.findOne({ customId: identifier }).lean();
};

/**
 * Validate multiple items exist and return them with their IDs
 * @param {Array} items - Array of items with itemId
 * @returns {Promise<Object>} - Returns { success: boolean, validatedItems: Array, errors: Array }
 */
const validateAndFindItems = async (items) => {
  const validatedItems = [];
  const errors = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (!item.itemId) {
      errors.push({
        index: i,
        itemId: item.itemId,
        message: 'Item ID is missing'
      });
      continue;
    }
    
    const itemDoc = await findItemByIdentifier(item.itemId);
    
    if (!itemDoc) {
      errors.push({
        index: i,
        itemId: item.itemId,
        message: `Item not found with identifier: ${item.itemId}`
      });
    } else {
      validatedItems.push({
        ...item,
        originalItem: itemDoc,
        actualItemId: itemDoc._id  // Store the actual MongoDB ObjectId
      });
    }
  }
  
  return {
    success: errors.length === 0,
    validatedItems,
    errors
  };
};

module.exports = {
  findItemByIdentifier,
  validateAndFindItems
};