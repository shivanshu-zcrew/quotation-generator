const cloudinary = require('../config/cloudinary');

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param {Buffer} buffer     - File buffer from multer memoryStorage
 * @param {string} folder     - Cloudinary folder name  (e.g. 'items', 'quotations')
 * @param {object} [options]  - Extra cloudinary upload options
 * @returns {Promise<object>} - Cloudinary upload result  ({ secure_url, public_id, ... })
 *
 * Usage in a route:
 *   const { secure_url, public_id } = await uploadToCloudinary(req.file.buffer, 'items');
 */
const uploadToCloudinary = (buffer, folder = 'uploads', options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', ...options },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });

/**
 * Delete a file from Cloudinary by its public_id.
 *
 * @param {string} publicId
 * @returns {Promise<object>}
 */
const deleteFromCloudinary = (publicId) =>
  cloudinary.uploader.destroy(publicId);

module.exports = { uploadToCloudinary, deleteFromCloudinary };