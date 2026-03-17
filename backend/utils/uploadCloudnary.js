// utils/uploadCloudnary.js
const cloudinary = require('../config/cloudinary');

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param {Buffer} buffer     - File buffer from multer memoryStorage
 * @param {string} folder     - Cloudinary folder name
 * @param {string} resourceType - 'image', 'video', 'raw', or 'auto'
 * @param {object} [options]  - Extra cloudinary upload options
 * @returns {Promise<object>} - Cloudinary upload result
 */
const uploadToCloudinary = (buffer, folder = 'uploads', resourceType = 'auto', options = {}) =>
  new Promise((resolve, reject) => {
    // For PDFs and documents, force 'raw' resource type
    let actualResourceType = resourceType;
    
    // You can add more logic here if needed
    const uploadOptions = {
      folder,
      resource_type: actualResourceType,
      access_mode: 'public', // Make files publicly accessible
      use_filename: true,
      unique_filename: true,
      ...options
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
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
 * @param {string} resourceType - 'image', 'video', or 'raw'
 * @returns {Promise<object>}
 */
const deleteFromCloudinary = (publicId, resourceType = 'image') =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

module.exports = { uploadToCloudinary, deleteFromCloudinary };