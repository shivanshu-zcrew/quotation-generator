const Item = require('../models/items');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');

// ─────────────────────────────────────────────────────────────────────────
// GET ALL ITEMS
// ─────────────────────────────────────────────────────────────────────────
exports.getAllItems = async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching items', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CREATE ITEM
// ─────────────────────────────────────────────────────────────────────────
exports.createItem = async (req, res) => {
  const { name, price, description } = req.body;

  if (!name || !price) {
    return res.status(400).json({ message: 'Name and price are required' });
  }

  try {
    let imagePath      = null;
    let imagePublicId  = null;

    if (req.file) {
      const result  = await uploadToCloudinary(req.file.buffer, 'items');
      imagePath     = result.secure_url;
      imagePublicId = result.public_id;
    }

    const item = new Item({
      name,
      price:        parseFloat(price),
      description,
      imagePath,
      imagePublicId,
    });

    const savedItem = await item.save();
    res.status(201).json(savedItem);
  } catch (error) {
    res.status(500).json({ message: 'Error creating item', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SINGLE ITEM
// ─────────────────────────────────────────────────────────────────────────
exports.getItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching item', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// UPDATE ITEM
// ─────────────────────────────────────────────────────────────────────────
exports.updateItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    let imagePath     = item.imagePath;
    let imagePublicId = item.imagePublicId;

    if (req.file) {
      // Delete old image from Cloudinary before uploading new one
      if (item.imagePublicId) {
        await deleteFromCloudinary(item.imagePublicId).catch(err =>
          console.warn('Could not delete old Cloudinary image:', err.message)
        );
      }

      const result  = await uploadToCloudinary(req.file.buffer, 'items');
      imagePath     = result.secure_url;
      imagePublicId = result.public_id;
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      {
        name:         req.body.name        || item.name,
        price:        req.body.price       ? parseFloat(req.body.price) : item.price,
        description:  req.body.description !== undefined ? req.body.description : item.description,
        imagePath,
        imagePublicId,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedItem);
  } catch (error) {
    res.status(500).json({ message: 'Error updating item', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// DELETE ITEM
// ─────────────────────────────────────────────────────────────────────────
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    // Delete image from Cloudinary
    if (item.imagePublicId) {
      await deleteFromCloudinary(item.imagePublicId).catch(err =>
        console.warn('Could not delete Cloudinary image:', err.message)
      );
    }

    await Item.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting item', error: error.message });
  }
};