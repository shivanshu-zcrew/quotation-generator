const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Please provide item name'],
      trim:     true,
    },
    price: {
      type:     Number,
      required: [true, 'Please provide item price'],
      min:      [0, 'Price cannot be negative'],
    },
    description: { type: String, trim: true },

    // Cloudinary URL (replaces local /images/ path)
    imagePath:     { type: String, default: null },
    // Cloudinary public_id — needed to delete the image on update/delete
    imagePublicId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Item || mongoose.model('Item', itemSchema);